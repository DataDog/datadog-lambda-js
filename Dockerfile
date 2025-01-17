ARG image
FROM $image as builder
ARG image

# Create the directory structure required for AWS Lambda Layer
RUN mkdir -p /opt/nodejs/node_modules/

# Install dev dependencies
COPY . datadog-lambda-js
WORKDIR /datadog-lambda-js
RUN yarn install

# Build the lambda layer
RUN yarn build
RUN cp -r dist /opt/nodejs/node_modules/datadog-lambda-js
RUN cp ./src/runtime/module_importer.js /opt/nodejs/node_modules/datadog-lambda-js/runtime

RUN cp ./src/handler.mjs /opt/nodejs/node_modules/datadog-lambda-js
RUN rm -rf node_modules

# Move dd-trace from devDependencies to production dependencies
# That way it is included in our layer, while keeping it an optional dependency for npm
RUN node ./scripts/move_ddtrace_dependency.js "$(cat package.json)" > package-new.json
RUN mv package-new.json package.json
# Install dependencies
RUN yarn install --production=true
# Copy the dependencies to the modules folder
RUN cp -rf node_modules/* /opt/nodejs/node_modules

# Remove the AWS SDK, which is installed in the lambda by default
RUN rm -rf /opt/nodejs/node_modules/aws-sdk
RUN rm -rf /opt/nodejs/node_modules/aws-xray-sdk-core/node_modules/aws-sdk

# Remove heavy files from dd-trace which aren't used in a lambda environment
RUN rm -rf /opt/nodejs/node_modules/dd-trace/prebuilds
RUN rm -rf /opt/nodejs/node_modules/dd-trace/dist
RUN rm -rf /opt/nodejs/node_modules/@datadog/libdatadog
RUN rm -rf /opt/nodejs/node_modules/@datadog/native-appsec
RUN rm -rf /opt/nodejs/node_modules/@datadog/native-metrics
RUN rm -rf /opt/nodejs/node_modules/hdr-histogram-js/build
RUN rm -rf /opt/nodejs/node_modules/protobufjs/dist
RUN rm -rf /opt/nodejs/node_modules/protobufjs/cli
RUN rm -rf /opt/nodejs/node_modules/@datadog/pprof/prebuilds/linux-arm
RUN rm -rf /opt/nodejs/node_modules/@datadog/pprof/prebuilds/darwin-arm64
RUN rm -rf /opt/nodejs/node_modules/@datadog/pprof/prebuilds/darwin-x64
RUN rm -rf /opt/nodejs/node_modules/@datadog/pprof/prebuilds/win32-ia32
RUN rm -rf /opt/nodejs/node_modules/@datadog/pprof/prebuilds/win32-x64
RUN rm -rf /opt/nodejs/node_modules/@datadog/native-iast-taint-tracking
RUN rm -rf /opt/nodejs/node_modules/@datadog/native-iast-rewriter
RUN rm -rf /opt/nodejs/node_modules/@datadog/pprof/prebuilds/linuxmusl-x64
RUN rm -rf /opt/nodejs/node_modules/jsonpath-plus/src/jsonpath.d.ts
RUN rm -rf /opt/nodejs/node_modules/jsonpath-plus/src/jsonpath-browser.js
RUN rm -rf /opt/nodejs/node_modules/jsonpath-plus/src/dist/index-browser-umd.min.cjs
RUN rm -rf /opt/nodejs/node_modules/jsonpath-plus/src/dist/index-browser-umd.cjs
RUN rm -rf /opt/nodejs/node_modules/jsonpath-plus/src/dist/index-browser-esm.min.js
RUN rm -rf /opt/nodejs/node_modules/jsonpath-plus/src/dist/index-browser-esm.js
RUN find /opt/nodejs/node_modules -name "*.d.ts" -delete
RUN find /opt/nodejs/node_modules -name "*.js.map" -delete
RUN find /opt/nodejs/node_modules -name "*.mjs.map" -delete
RUN find /opt/nodejs/node_modules -name "*.cjs.map" -delete
RUN find /opt/nodejs/node_modules -name "*.ts.map" -delete
RUN find /opt/nodejs/node_modules -name "*.md" -delete

# Warm up v8 compile cache
RUN node -e "require('/opt/nodejs/node_modules/datadog-lambda-js/runtime/module_importer').initTracer()"

FROM scratch
COPY --from=builder /opt/nodejs /
