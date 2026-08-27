ARG NODE_VERSION=22
FROM public.ecr.aws/lambda/nodejs:${NODE_VERSION}

# Overrides the dd-trace pin in package.json so this image tracks the same
# tracer line as the layer built for NODE_VERSION (v5 below Node 22, v6 above).
ARG DD_TRACE_VERSION=""

COPY package.json handler.js ${LAMBDA_TASK_ROOT}/
COPY datadog-lambda-js-local.tgz /tmp/datadog-lambda-js-local.tgz
RUN cd ${LAMBDA_TASK_ROOT} \
    && if [ -n "$DD_TRACE_VERSION" ]; then npm pkg set dependencies.dd-trace="$DD_TRACE_VERSION"; fi \
    && npm install --omit=dev \
    && npm install --no-save /tmp/datadog-lambda-js-local.tgz \
    && rm /tmp/datadog-lambda-js-local.tgz

CMD ["node_modules/datadog-lambda-js/dist/handler.handler"]
