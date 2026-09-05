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
  - command -v yarn >/dev/null 2>&1 || npm install -g yarn
  - yarn --version
  - echo 'yarn-offline-mirror ".yarn-cache/"' >> .yarnrc
  - echo 'yarn-offline-mirror-pruning true' >> .yarnrc
  # Resolves dd-trace v5 or v6 from the Node major of the job's image.
  - ./scripts/install_deps.sh --no-progress

# The layers bundle a tracer, so the npm package is the only artifact whose dd-trace resolution
# is left to the customer. One tarball is packed here and installed on every runtime below.
pack npm package:
  stage: build
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:22-bullseye
  needs: []
  artifacts:
    expire_in: 1 hr
    paths:
      - datadog-lambda-js-*.tgz
  before_script: *node-before-script
  script:
    - yarn build
    - npm pack --pack-destination .

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

npm package test ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ $runtime.node_major_version }}-bullseye
  needs:
    - pack npm package
  dependencies:
    - pack npm package
  script:
    - ./scripts/test_npm_package.sh datadog-lambda-js-*.tgz

integration test ({{ $runtime.name }}):
  stage: test
  # `docker-in-docker:<arch>` routes the job to a runner with a live Docker
  # daemon (vs. plain `arch:amd64` which only has the docker CLI). Required by
  # the container-image integration tests, which build & push ECR images for
  # the `container-{cjs,esm}_node*` functions.
  tags: ["docker-in-docker:amd64"]
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
    - (cd integration_tests && yarn install)
  script:
    - RUNTIME_PARAM={{ $runtime.node_major_version }} ./scripts/run_integration_tests.sh

{{ range $environment := (ds "environments").environments }}
{{ $dotenv := print $runtime.name "_" $environment.name ".env" }}

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
    - npm package test ({{ $runtime.name }})
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
  artifacts:
    reports:
      dotenv: {{ $dotenv }}
  needs:
{{ if or (eq $environment.name "prod") }}
      - sign layer ({{ $runtime.name }})
{{ else }}
      - build layer ({{ $runtime.name }})
      - check layer size ({{ $runtime.name }})
      - lint ({{ $runtime.name }})
      - unit test ({{ $runtime.name }})
      - npm package test ({{ $runtime.name }})
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
    - STAGE={{ $environment.name }} NODE_VERSION={{ $runtime.node_version }} DOTENV={{ $dotenv }} .gitlab/scripts/publish_layers.sh

{{- end }}

{{- end }}

publish npm package:
  stage: publish
  tags: ["arch:amd64"]
  image: ${CI_DOCKER_TARGET_IMAGE}:${CI_DOCKER_TARGET_VERSION}
  cache: []
  variables:
    # The CI image runs Node 18, but the published package tracks the v6 line.
    TARGET_NODE_MAJOR: "22"
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
  when: manual
  needs: {{ range $runtime := (ds "runtimes").runtimes }}
    - sign layer ({{ $runtime.name }})
  {{- end }}
  before_script:
    - *node-before-script
  script:
    # The v5 pin and the peer range it feeds are hand-maintained, so verify them against the
    # registry before the package that advertises them goes out.
    - ./scripts/check_dd_trace_v5_pin.sh
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
    NODEJS_{{ $version }}_VERSION: $NODE_{{ $version }}_VERSION
    {{- end }}
  needs: {{ range (ds "runtimes").runtimes }}
    - "publish layer sandbox ({{ .name }}): [{{ $e2e_region }}]"
    {{- end }}


e2e-test-status:
  stage: e2e
  image: registry.ddbuild.io/images/docker:20.10-py3
  tags: ["arch:amd64"]
  timeout: 3h
  script:
      - .gitlab/scripts/poll_e2e.sh
