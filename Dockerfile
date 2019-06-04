ARG image
FROM $image

# Create the directory structure required for AWS Lambda Layer
RUN mkdir -p /build/nodejs/node_modules/

# Install dependencies
COPY . datadog-lambda-js
WORKDIR datadog-lambda-js
RUN yarn build
RUN cp -rf dist ../build/nodejs/node_modules/datadog-lambda-js