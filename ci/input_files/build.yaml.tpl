stages:
 - build
 - test
 - publish

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
  cache:
    key:
      files:
        - yarn.lock
    paths:
      - .yarn-cache/
  before_script:
    - echo 'yarn-offline-mirror ".yarn-cache/"' >> .yarnrc
    - echo 'yarn-offline-mirror-pruning true' >> .yarnrc
    - yarn install --frozen-lockfile --no-progress
  script: 
    - yarn check-formatting
    - yarn lint

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
