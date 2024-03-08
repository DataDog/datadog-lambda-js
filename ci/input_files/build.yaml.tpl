stages:
 - build
 - test
 - sign
 - publish

.install-node: &install-node
  - apt-get update
  - apt-get install -y ca-certificates curl gnupg xxd
  - mkdir -p /etc/apt/keyrings
  - curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  # We are explicitly setting the node_18.x version for the installation
  - echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  - apt-get update
  - apt-get install nodejs -y
  - npm install --global yarn

.node-before-script: &node-before-script
  - echo 'yarn-offline-mirror ".yarn-cache/"' >> .yarnrc
  - echo 'yarn-offline-mirror-pruning true' >> .yarnrc
  - yarn install --frozen-lockfile --no-progress

{{ range $runtime := (ds "runtimes").runtimes }}

.{{ $runtime.name }}-cache: &{{ $runtime.name }}-cache
  key: "$CI_JOB_STAGE-$CI_COMMIT_REF_SLUG"
  paths:
    - $CI_PROJECT_DIR/.yarn-cache
  policy: pull

build-layer ({{ $runtime.name }}):
  stage: build
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10
  artifacts:
    expire_in: 1 hr # Unsigned zips expire in 1 hour
    paths:
      - .layers/datadog_lambda_node{{ $runtime.node_version }}.zip
  variables:
    CI_ENABLE_CONTAINER_IMAGE_BUILDS: "true"
  script:
    - NODE_VERSION={{ $runtime.node_major_version }} ./scripts/build_layers.sh

check-layer-size ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10
  needs: 
    - build-layer ({{ $runtime.name }})
  dependencies:
    - build-layer ({{ $runtime.name }})
  script: 
    - NODE_VERSION={{ $runtime.node_version }} ./scripts/check_layer_size.sh

lint ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ $runtime.node_major_version }}-bullseye
  cache: &{{ $runtime.name }}-cache
  before_script: *node-before-script
  script: 
    - yarn check-formatting
    - yarn lint

unit-test ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ $runtime.node_major_version }}-bullseye
  cache: &{{ $runtime.name }}-cache
  before_script: *node-before-script
  script: 
    - yarn build
    - yarn test --ci --forceExit --detectOpenHandles
    - bash <(curl -s https://codecov.io/bash)

integration-test ({{ $runtime.name }}):
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10-py3
  needs: 
    - build-layer ({{ $runtime.name }})
  dependencies:
    - build-layer ({{ $runtime.name }})
  cache: &{{ $runtime.name }}-cache
  variables:
    CI_ENABLE_CONTAINER_IMAGE_BUILDS: "true"
  before_script:
    - *install-node
    - EXTERNAL_ID_NAME=integration-test-externalid ROLE_TO_ASSUME=sandbox-integration-test-deployer AWS_ACCOUNT=425362996713 source ./ci/get_secrets.sh
    - yarn global add serverless --prefix /usr/local
    - cd integration_tests && yarn install && cd ..
  script:
    - RUNTIME_PARAM={{ $runtime.node_major_version }} ./scripts/run_integration_tests.sh

{{ range $environment := (ds "environments").environments }}

{{ if or (eq $environment.name "prod") }}
sign-layer ({{ $runtime.name }}):
  stage: sign
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10-py3
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
      when: manual
  needs:
    - build-layer ({{ $runtime.name }})
    - check-layer-size ({{ $runtime.name }})
    - lint ({{ $runtime.name }})
    - unit-test ({{ $runtime.name }})
    - integration-test ({{ $runtime.name }})
  dependencies:
    - build-layer ({{ $runtime.name }})
  artifacts: # Re specify artifacts so the modified signed file is passed
    expire_in: 1 day # Signed layers should expire after 1 day
    paths:
      - .layers/datadog_lambda_node{{ $runtime.node_version }}.zip
  before_script:
    - apt-get update
    - apt-get install -y uuid-runtime
    - EXTERNAL_ID_NAME={{ $environment.external_id }} ROLE_TO_ASSUME={{ $environment.role_to_assume }} AWS_ACCOUNT={{ $environment.account }} source ./ci/get_secrets.sh
  script:
    - LAYER_FILE=datadog_lambda_node{{ $runtime.node_version }}.zip ./scripts/sign_layers.sh {{ $environment.name }}
{{ end }}

publish-layer-{{ $environment.name }} ({{ $runtime.name }}):
  stage: publish
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10-py3
  rules:
    - if: '"{{ $environment.name }}" =~ /^(sandbox|staging)/'
      when: manual
      allow_failure: true
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
  needs:
{{ if or (eq $environment.name "prod") }}
      - sign-layer ({{ $runtime.name }})
{{ else }}
      - build-layer ({{ $runtime.name }})
      - check-layer-size ({{ $runtime.name }})
      - lint ({{ $runtime.name }})
      - unit-test ({{ $runtime.name }})
      - integration-test ({{ $runtime.name }})
{{ end }}
  dependencies:
{{ if or (eq $environment.name "prod") }}
      - sign-layer ({{ $runtime.name }})
{{ else }}
      - build-layer ({{ $runtime.name }})
{{ end }}
  parallel:
    matrix:
      - REGION: {{ range (ds "regions").regions }}
          - {{ .code }}
        {{- end}}
  before_script:
    - EXTERNAL_ID_NAME={{ $environment.external_id }} ROLE_TO_ASSUME={{ $environment.role_to_assume }} AWS_ACCOUNT={{ $environment.account }} source ./ci/get_secrets.sh
  script:
    - STAGE={{ $environment.name }} NODE_VERSION={{ $runtime.node_version }} ./ci/publish_layers.sh

{{- end }}

{{- end }}

publish-npm-package:
  stage: publish
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10-py3
  cache: []
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
  when: manual
  needs: {{ range $runtime := (ds "runtimes").runtimes }}
    - sign-layer ({{ $runtime.name }})
  {{- end }}
  before_script:
    - *install-node
  script:
    - ./ci/publish_npm.sh
