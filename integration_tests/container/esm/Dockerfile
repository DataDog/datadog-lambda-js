ARG NODE_VERSION=22
FROM public.ecr.aws/lambda/nodejs:${NODE_VERSION}

# Exact lockfile-resolved v6 pin, or the maintained v5 compatibility pin for
# Node 18/20. The runner always supplies it.
ARG DD_TRACE_VERSION

COPY package.json handler.mjs ${LAMBDA_TASK_ROOT}/
COPY datadog-lambda-js-local.tgz /tmp/datadog-lambda-js-local.tgz
RUN cd ${LAMBDA_TASK_ROOT} \
    && test -n "$DD_TRACE_VERSION" \
    && npm pkg set dependencies.dd-trace="$DD_TRACE_VERSION" \
    && npm install --omit=dev \
    && npm install --no-save /tmp/datadog-lambda-js-local.tgz \
    && rm /tmp/datadog-lambda-js-local.tgz

CMD ["node_modules/datadog-lambda-js/dist/handler.handler"]
