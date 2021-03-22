ARG image
FROM $image

# Create the directory structure required for AWS Lambda Layer
RUN apk update
RUN apk add jq
RUN mkdir -p /nodejs/node_modules/

# Install dev dependencies
COPY . datadog-lambda-js
WORKDIR /datadog-lambda-js
RUN yarn install

# Build the lambda layer
RUN yarn build
RUN cp -r dist /nodejs/node_modules/datadog-lambda-js
RUN rm -rf node_modules

# Move dd-trace devDependency to dependencies
# This adds dd-trace to our layer, while keeping it an optional dependency for npm.
RUN jq '. +{"dependencies": (.dependencies + {"dd-trace": .devDependencies."dd-trace"})}' package.json > package.json-temp && \
    mv package.json-temp package.json

# Copy the production dependencies to the modules folder
RUN yarn install --production=true
RUN cp -rf node_modules/* /nodejs/node_modules

# Remove the AWS SDK, which is installed in the lambda by default
RUN rm -rf /nodejs/node_modules/aws-sdk
RUN rm -rf /nodejs/node_modules/aws-xray-sdk-core/node_modules/aws-sdk

# Remove heavy files from dd-trace which aren't used in a lambda environment
RUN rm -rf /nodejs/node_modules/dd-trace/prebuilds
RUN rm -rf /nodejs/node_modules/dd-trace/dist
RUN rm -rf /nodejs/node_modules/hdr-histogram-js/build
RUN rm -rf /nodejs/node_modules/protobufjs/dist
