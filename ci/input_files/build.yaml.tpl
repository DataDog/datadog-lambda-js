stages:
 - build
 - test
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

{{ $runtimes := (ds "runtimes").runtimes }}
{{ range $runtime := $runtimes  }}

.{{ $runtime.name }}-cache: &{{ $runtime.name }}-cache
  key: "$CI_JOB_STAGE-$CI_COMMIT_REF_SLUG"
  paths:
    - $CI_PROJECT_DIR/.yarn-cache
  policy: pull

build-{{ $runtime.name }}-layer:
  stage: build
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10
  artifacts:
    expire_in: 10 min # temp value
    paths:
      - .layers/datadog_lambda_node{{ $runtime.node_version }}.zip
  variables:
    CI_ENABLE_CONTAINER_IMAGE_BUILDS: "true"
  script:
    - NODE_VERSION={{ $runtime.node_version }} ./scripts/build_layers.sh

check-{{ $runtime.name }}-layer-size:
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10
  needs: 
    - build-{{ $runtime.name }}-layer
  dependencies:
    - build-{{ $runtime.name }}-layer
  script: 
    - NODE_VERSION={{ $runtime.node_version }} ./scripts/check_layer_size.sh

lint-{{ $runtime.name }}:
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ $runtime.node_major_version }}-bullseye
  needs: 
    - build-{{ $runtime.name }}-layer
  dependencies:
    - build-{{ $runtime.name }}-layer
  cache: &{{ $runtime.name }}-cache
  before_script: *node-before-script
  script: 
    - yarn check-formatting
    - yarn lint

unit-test-{{ $runtime.name }}:
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ $runtime.node_major_version }}-bullseye
  needs: 
    - build-{{ $runtime.name }}-layer
  dependencies:
    - build-{{ $runtime.name }}-layer
  cache: &{{ $runtime.name }}-cache
  before_script: *node-before-script
  script: 
    - yarn build
    - yarn test --ci --forceExit --detectOpenHandles
    - bash <(curl -s https://codecov.io/bash)

integration-test-{{ $runtime.name }}:
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10-py3
  needs: 
    - build-{{ $runtime.name }}-layer
  dependencies:
    - build-{{ $runtime.name }}-layer
  cache: &{{ $runtime.name }}-cache
  variables:
    CI_ENABLE_CONTAINER_IMAGE_BUILDS: "true"
  before_script:
    - *install-node
    - EXTERNAL_ID_NAME=integration-test-externalid ROLE_TO_ASSUME=sandbox-integration-test-deployer source ./ci/get_secrets.sh
    - yarn global add serverless --prefix /usr/local
    - cd integration_tests && yarn install && cd ..
  script:
    - RUNTIME_PARAM={{ $runtime.node_major_version }} ./scripts/run_integration_tests.sh

{{ $environments := (ds "environments").environments }}
{{ range $environment := $environments }}

publish-{{ $environment.name }}-{{ $runtime.name }}-layer:
  stage: publish
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10-py3
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v.*/ || "{{ $environment.name }}" =~ /^(sandbox|staging)/'
      when: manual
  needs:
    - build-{{ $runtime.name }}-layer
    - check-{{ $runtime.name }}-layer-size
    - lint-{{ $runtime.name }}
    - unit-test-{{ $runtime.name }}
  dependencies:
    - build-{{ $runtime.name }}-layer
  parallel:
    matrix:
      - REGION: {{ range (ds "regions").regions }}
          - {{ .code }}
        {{- end}}
  before_script:
    - EXTERNAL_ID_NAME={{ $environment.external_id }} ROLE_TO_ASSUME={{ $environment.role_to_assume }} source ./ci/get_secrets.sh
  script:
    -  NODE_VERSION={{ $runtime.node_version }} ./ci/publish_layers.sh

{{- end }}

{{- end }}
