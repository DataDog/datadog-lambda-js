ARG image
FROM $image

# Create the directory structure required for AWS Lambda Layer
RUN mkdir -p /nodejs/node_modules/

# Install dev dependencies
COPY . datadog-lambda-js
WORKDIR /datadog-lambda-js
RUN yarn install

# Build the lambda layer
RUN yarn build
RUN cp -r dist /nodejs/node_modules/datadog-lambda-js
RUN rm -rf node_modules

# Move dd-trace from devDependencies to production dependencies
# That way it is included in our layer, while keeping it an optional dependency for npm
RUN node ./scripts/move_ddtrace_dependency.js "$(cat package.json)" > package.json
# Install dependencies
RUN yarn install --production=true
# Copy the dependencies to the modules folder
RUN cp -rf node_modules/* /nodejs/node_modules

# Remove the AWS SDK, which is installed in the lambda by default
RUN rm -rf /nodejs/node_modules/aws-sdk
RUN rm -rf /nodejs/node_modules/aws-xray-sdk-core/node_modules/aws-sdk

# Remove heavy files from dd-trace which aren't used in a lambda environment
RUN rm -rf /nodejs/node_modules/dd-trace/prebuilds
RUN rm -rf /nodejs/node_modules/dd-trace/dist
RUN rm -rf /nodejs/node_modules/@datadog/native-appsec
RUN rm -rf /nodejs/node_modules/@datadog/native-metrics
RUN rm -rf /nodejs/node_modules/@datadog/pprof
RUN rm -rf /nodejs/node_modules/hdr-histogram-js/build
RUN rm -rf /nodejs/node_modules/protobufjs/dist
RUN rm -rf /nodejs/node_modules/protobufjs/cli
RUN find /nodejs/node_modules -name "*.d.ts" -delete
RUN find /nodejs/node_modules -name "*.js.map" -delete
RUN find /nodejs/node_modules -name "*.ts.map" -delete