stages:
 - build

{{ range (ds "runtimes").runtimes }}
build-{{ .name }}-layer:
  stage: build
  image: registry.ddbuild.io/images/docker:20.10
  artifacts:
    expire_in: 10 min # temp value
    paths:
      - .layers/*.zip
  variables:
    CI_ENABLE_CONTAINER_IMAGE_BUILDS: "true"
  script:
    - NODE_VERSION={{ .node_version }} ./scripts/build_layers.sh
{{- end }}