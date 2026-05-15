ARG image
FROM $image AS builder
ARG image

# Create the directory structure required for AWS Lambda Layer
RUN mkdir -p /nodejs/node_modules/

# Install dev dependencies
COPY . datadog-lambda-js
WORKDIR /datadog-lambda-js
RUN yarn install

# Build the lambda layer
RUN yarn build
RUN cp -r dist /nodejs/node_modules/datadog-lambda-js
RUN cp ./src/runtime/module_importer.js /nodejs/node_modules/datadog-lambda-js/runtime

RUN cp ./src/handler.mjs /nodejs/node_modules/datadog-lambda-js
RUN rm -rf node_modules

# Move dd-trace from devDependencies to production dependencies
# That way it is included in our layer, while keeping it an optional dependency for npm
RUN node ./scripts/move_ddtrace_dependency.js "$(cat package.json)" > package-new.json
RUN mv package-new.json package.json
# Install dependencies
RUN yarn install --production=true --ignore-optional
# Copy the dependencies to the modules folder
RUN cp -rf node_modules/* /nodejs/node_modules

# Remove the AWS SDK, which is installed in the lambda by default
RUN rm -rf /nodejs/node_modules/aws-sdk
RUN rm -rf /nodejs/node_modules/aws-xray-sdk-core/node_modules/aws-sdk

# Remove heavy files from @datadog/pprof which aren't used in a lambda environment
# TODO: Ship individual bindings per platform and depend on that instead.
# TODO: Split x64 and ARM so that each image only has the binaries for its architecture.
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/darwin-arm64
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/darwin-x64
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/linux-arm
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/linuxmusl-arm64
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/linuxmusl-x64
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/win32-ia32
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/win32-x64
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/*/node-111.node
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/*/node-120.node
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/*/node-131.node
RUN rm -rf /nodejs/node_modules/@datadog/pprof/prebuilds/*/node-141.node

# Remove heavy files from @opentelemetry/api which aren't used in a lambda environment.
# TODO: Create a completely separate Datadog scoped package for OpenTelemetry instead.
RUN rm -rf /nodejs/node_modules/@opentelemetry/api/build/esm
RUN rm -rf /nodejs/node_modules/@opentelemetry/api/build/esnext
RUN rm -rf /nodejs/node_modules/@opentelemetry/api-logs/build/esm
RUN rm -rf /nodejs/node_modules/@opentelemetry/api-logs/build/esnext

FROM scratch
COPY --from=builder /nodejs /
