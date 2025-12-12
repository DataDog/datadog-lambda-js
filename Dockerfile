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

# Temporary hack for testing, remove before merging.
RUN git clone https://github.com/DataDog/dd-trace-js.git /tmp/dd-trace
RUN cd /tmp/dd-trace && yarn pack --filename /tmp/dd-trace.tgz

# Move dd-trace from devDependencies to production dependencies
# That way it is included in our layer, while keeping it an optional dependency for npm
RUN node ./scripts/move_ddtrace_dependency.js "$(cat package.json)" > package-new.json
RUN mv package-new.json package.json
# Install dependencies
RUN yarn install --production=true --ignore-optional

# Temporary hack for testing, remove before merging.
RUN rm -rf /tmp/dd-trace
RUN rm /tmp/dd-trace.tgz

# Copy the dependencies to the modules folder
RUN cp -rf node_modules/* /nodejs/node_modules

# Remove the AWS SDK, which is installed in the lambda by default
RUN rm -rf /nodejs/node_modules/aws-sdk
RUN rm -rf /nodejs/node_modules/aws-xray-sdk-core/node_modules/aws-sdk

FROM scratch
COPY --from=builder /nodejs /
