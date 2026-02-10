{{- $e2e_region := "us-west-2" -}}

variables:
  CI_DOCKER_TARGET_IMAGE: registry.ddbuild.io/ci/datadog-lambda-js
  CI_DOCKER_TARGET_VERSION: latest

stages:
 - build
 - test
 - sign
 - publish
 - e2e

default:
  retry:
    max: 1
    when:
      # Retry when the runner fails to start
      - runner_system_failure

.node-before-script: &node-before-script
  - yarn --version
  - echo 'yarn-offline-mirror ".yarn-cache/"' >> .yarnrc
  - echo 'yarn-offline-mirror-pruning true' >> .yarnrc
  - yarn install --frozen-lockfile --no-progress

{{ range $runtime := (ds "runtimes").runtimes }}

.{{ $runtime.name }}-cache: &{{ $runtime.name }}-cache
  key: "$CI_JOB_STAGE-$CI_COMMIT_REF_SLUG"
  paths:
    - $CI_PROJECT_DIR/.yarn-cache
  policy: pull

build layer ({{ $runtime.name }}):
  stage: build
  tags: ["arch:amd64"]
  image: ${CI_DOCKER_TARGET_IMAGE}:${CI_DOCKER_TARGET_VERSION}
  artifacts:
    expire_in: 1 hr # Unsigned zips expire in 1 hour
    paths:
      - .layers/datadog_lambda_node{{ $runtime.node_version }}.zip
  variables:
    CI_ENABLE_CONTAINER_IMAGE_BUILDS: "true"
  script:
    - NODE_VERSION={{ $runtime.node_version }} ./scripts/build_layers.sh

check layer size ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: ${CI_DOCKER_TARGET_IMAGE}:${CI_DOCKER_TARGET_VERSION}
  needs: 
    - build layer ({{ $runtime.name }})
  dependencies:
    - build layer ({{ $runtime.name }})
  script: 
    - NODE_VERSION={{ $runtime.node_version }} ./scripts/check_layer_size.sh

lint ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ $runtime.node_major_version }}-bullseye
  cache: &{{ $runtime.name }}-cache
  before_script: *node-before-script
  needs: []
  script: 
    - yarn check-formatting
    - yarn lint

unit test ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ $runtime.node_major_version }}-bullseye
  cache: &{{ $runtime.name }}-cache
  before_script: *node-before-script
  needs: []
  script: 
    - yarn build
    - yarn test --ci --forceExit --detectOpenHandles
    - bash <(curl -s https://codecov.io/bash)

integration test ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: ${CI_DOCKER_TARGET_IMAGE}:${CI_DOCKER_TARGET_VERSION}
  needs: 
    - build layer ({{ $runtime.name }})
  dependencies:
    - build layer ({{ $runtime.name }})
  cache: &{{ $runtime.name }}-cache
  variables:
    CI_ENABLE_CONTAINER_IMAGE_BUILDS: "true"
  before_script:
    - EXTERNAL_ID_NAME=integration-test-externalid ROLE_TO_ASSUME=sandbox-integration-test-deployer AWS_ACCOUNT=425362996713 source .gitlab/scripts/get_secrets.sh
    - cd integration_tests && yarn install && cd ..
  script:
    - RUNTIME_PARAM={{ $runtime.node_major_version }} ./scripts/run_integration_tests.sh

{{ range $environment := (ds "environments").environments }}

{{ if or (eq $environment.name "prod") }}
sign layer ({{ $runtime.name }}):
  stage: sign
  tags: ["arch:amd64"]
  image: ${CI_DOCKER_TARGET_IMAGE}:${CI_DOCKER_TARGET_VERSION}
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
      when: manual
  needs:
    - build layer ({{ $runtime.name }})
    - check layer size ({{ $runtime.name }})
    - lint ({{ $runtime.name }})
    - unit test ({{ $runtime.name }})
    - integration test ({{ $runtime.name }})
  dependencies:
    - build layer ({{ $runtime.name }})
  artifacts: # Re specify artifacts so the modified signed file is passed
    expire_in: 1 day # Signed layers should expire after 1 day
    paths:
      - .layers/datadog_lambda_node{{ $runtime.node_version }}.zip
  before_script:
    - EXTERNAL_ID_NAME={{ $environment.external_id }} ROLE_TO_ASSUME={{ $environment.role_to_assume }} AWS_ACCOUNT={{ $environment.account }} source .gitlab/scripts/get_secrets.sh
  script:
    - LAYER_FILE=datadog_lambda_node{{ $runtime.node_version }}.zip ./scripts/sign_layers.sh {{ $environment.name }}
{{ end }}

publish layer {{ $environment.name }} ({{ $runtime.name }}):
  stage: publish
  tags: ["arch:amd64"]
  image: ${CI_DOCKER_TARGET_IMAGE}:${CI_DOCKER_TARGET_VERSION}
  rules:
    - if: '"{{ $environment.name }}" == "sandbox" && $REGION == "{{ $e2e_region }}"'
      when: on_success
    - if: '"{{ $environment.name }}" =~ /^(sandbox|staging)/'
      when: manual
      allow_failure: true
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
  needs:
{{ if or (eq $environment.name "prod") }}
      - sign layer ({{ $runtime.name }})
{{ else }}
      - build layer ({{ $runtime.name }})
      - check layer size ({{ $runtime.name }})
      - lint ({{ $runtime.name }})
      - unit test ({{ $runtime.name }})
      - integration test ({{ $runtime.name }})
{{ end }}
  dependencies:
{{ if or (eq $environment.name "prod") }}
      - sign layer ({{ $runtime.name }})
{{ else }}
      - build layer ({{ $runtime.name }})
{{ end }}
  parallel:
    matrix:
      - REGION: {{ range (ds "regions").regions }}
          - {{ .code }}
        {{- end}}
  before_script:
    - EXTERNAL_ID_NAME={{ $environment.external_id }} ROLE_TO_ASSUME={{ $environment.role_to_assume }} AWS_ACCOUNT={{ $environment.account }} source .gitlab/scripts/get_secrets.sh
  script:
    - STAGE={{ $environment.name }} NODE_VERSION={{ $runtime.node_version }} .gitlab/scripts/publish_layers.sh

{{- end }}

{{- end }}

publish npm package:
  stage: publish
  tags: ["arch:amd64"]
  image: ${CI_DOCKER_TARGET_IMAGE}:${CI_DOCKER_TARGET_VERSION}
  cache: []
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
  when: manual
  needs: {{ range $runtime := (ds "runtimes").runtimes }}
    - sign layer ({{ $runtime.name }})
  {{- end }}
  before_script:
    - *node-before-script
  script:
    - .gitlab/scripts/publish_npm.sh

{{ range $environment := (ds "environments").environments }}

{{ if eq $environment.name "prod" }}signed {{ end }}layer bundle:
  stage: {{ if eq $environment.name "prod" }}sign{{ else }}build{{ end }}
  image: ${CI_DOCKER_TARGET_IMAGE}:${CI_DOCKER_TARGET_VERSION}
  tags: ["arch:amd64"]
  rules:
    - if: '"{{ $environment.name }}" =~ /^sandbox/'
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
  needs:
    {{ range $runtime := (ds "runtimes").runtimes }}
    - {{ if eq $environment.name "prod" }}sign{{ else }}build{{ end }} layer ({{ $runtime.name }})
    {{ end }}
  dependencies:
    {{ range $runtime := (ds "runtimes").runtimes }}
    - {{ if eq $environment.name "prod" }}sign{{ else }}build{{ end }} layer ({{ $runtime.name }})
    {{ end }}
  artifacts:
    expire_in: 1 day
    paths:
      - datadog_lambda_js-{{ if eq $environment.name "prod"}}signed-{{ end }}bundle-${CI_JOB_ID}/
    name: datadog_lambda_js-{{ if eq $environment.name "prod"}}signed-{{ end }}bundle-${CI_JOB_ID}
  script:
    - rm -rf datadog_lambda_js-{{ if eq $environment.name "prod"}}signed-{{ end }}bundle-${CI_JOB_ID}
    - mkdir -p datadog_lambda_js-{{ if eq $environment.name "prod"}}signed-{{ end }}bundle-${CI_JOB_ID}
    - cp .layers/datadog_lambda_node*.zip datadog_lambda_js-{{ if eq $environment.name "prod"}}signed-{{ end }}bundle-${CI_JOB_ID}
{{ end }}

e2e-test:
  stage: e2e
  trigger:
    project: DataDog/serverless-e2e-tests
    strategy: depend
  variables:
    LANGUAGES_SUBSET: node
    {{- range (ds "runtimes").runtimes }}
    {{- $version := print (.name | strings.Trim "node") }}
    NODEJS_{{ $version }}_VERSION: "NODEJS_{{ $version }}_VERSION"
    {{- end }}
  needs: {{ range (ds "runtimes").runtimes }}
    - "publish layer sandbox ({{ .name }}): [{{ $e2e_region }}]"
    {{- end }}


e2e-test-status:
  stage: e2e
  image: registry.ddbuild.io/images/docker:20.10-py3
  tags: ["arch:amd64"]
  timeout: 3h
  script: |
      curl -OL "binaries.ddbuild.io/dd-source/authanywhere/LATEST/authanywhere-linux-amd64" && mv "authanywhere-linux-amd64" /bin/authanywhere && chmod +x /bin/authanywhere
      auth_header=$(authanywhere)
      GITLAB_API_TOKEN=$(curl -H "${auth_header}"  \
      "https://bti-ci-api.us1.ddbuild.staging.dog/internal/ci/gitlab/token?owner=DataDog&repository=serverless-e2e-tests")
      URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/pipelines/${CI_PIPELINE_ID}/bridges"
      echo "Fetching E2E job status from: $URL"
      while true; do
        RESPONSE=$(curl -s --header "PRIVATE-TOKEN: ${GITLAB_API_TOKEN}" "$URL")
        E2E_JOB_STATUS=$(echo "$RESPONSE" | jq -r '.[] | select(.name=="e2e-test") | .downstream_pipeline.status')
        echo -n "E2E job status: $E2E_JOB_STATUS, "
        if [ "$E2E_JOB_STATUS" == "success" ]; then
          echo "✅ E2E tests completed successfully"
          exit 0
        elif [ "$E2E_JOB_STATUS" == "failed" ]; then
          echo "❌ E2E tests failed"
          exit 1
        elif [ "$E2E_JOB_STATUS" == "running" ]; then
          echo "⏳ E2E tests are still running, retrying in 1 minute..."
        elif [ "$E2E_JOB_STATUS" == "canceled" ]; then
          echo "🚫 E2E tests were canceled"
          exit 1
        elif [ "$E2E_JOB_STATUS" == "skipped" ]; then
          echo "⏭️ E2E tests were skipped"
          exit 0
        else
          echo "❓ Unknown E2E test status: $E2E_JOB_STATUS, retrying in 1 minute..."
        fi
        sleep 60
      done
