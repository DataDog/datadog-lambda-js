stages:
 - build
 - test
 - publish

.node-cache: &node-cache
  key:
    files:
      - yarn.lock
  paths:
    - $CI_PROJECT_DIR/.yarn-cache
  policy: pull

.node-before-script: &node-before-script
  - echo 'yarn-offline-mirror ".yarn-cache/"' >> .yarnrc
  - echo 'yarn-offline-mirror-pruning true' >> .yarnrc
  - yarn install --frozen-lockfile --no-progress

{{ range (ds "runtimes").runtimes }}
build-{{ .name }}-layer:
  stage: build
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10
  artifacts:
    expire_in: 10 min # temp value
    paths:
      - .layers/datadog_lambda_node{{ .node_version }}.zip
  variables:
    CI_ENABLE_CONTAINER_IMAGE_BUILDS: "true"
  script:
    - NODE_VERSION={{ .node_version }} ./scripts/build_layers.sh

check-{{ .name }}-layer-size:
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10
  needs: 
    - build-{{ .name }}-layer
  dependencies:
    - build-{{ .name }}-layer
  script: 
    - NODE_VERSION={{ .node_version }} ./scripts/check_layer_size.sh

lint-{{ .name }}:
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ .node_major_version }}-bullseye
  needs: 
    - build-{{ .name }}-layer
  dependencies:
    - build-{{ .name }}-layer
  cache: *node-cache
  before_script: *node-before-script
  script: 
    - yarn check-formatting
    - yarn lint

unit-test-{{ .name }}:
  stage: test
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/mirror/node:{{ .node_major_version }}-bullseye
  needs: 
    - build-{{ .name }}-layer
  dependencies:
    - build-{{ .name }}-layer
  cache: *node-cache
  before_script: *node-before-script
  script: 
    - yarn build
    - yarn test --ci --forceExit --detectOpenHandles
    - bash <(curl -s https://codecov.io/bash)

integration-test-{{ .name }}:
  stage: test
  tags: ["arch:amd64]
  image: registry.ddbuild.io/images/docker:20.10
  needs: 
    - build-{{ .name }}-layer
  dependencies:
    - build-{{ .name }}-layer
  cache: *node-cache
  before_script:
    - apk --update add nodejs npm
    - *node-before-script
  script:
    - echo "Working hard"

publish-{{ .name }}-layer:
  stage: publish
  tags: ["arch:amd64"]
  image: registry.ddbuild.io/images/docker:20.10-py3
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v.*/'
      when: manual
  needs:
    - build-{{ .name }}-layer
    - check-{{ .name }}-layer-size
    - lint-{{ .name }}
    - unit-test-{{ .name }}
  dependencies:
    - build-{{ .name }}-layer
  parallel:
    matrix:
      - REGION: {{ range (ds "regions").regions }}
          - {{ .code }}
        {{- end}}

  script:
    -  NODE_VERSION={{ .node_version }} ./ci/publish_layers.sh

{{- end }}
