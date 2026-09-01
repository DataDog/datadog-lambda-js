ARG NODE_VERSION=22
FROM public.ecr.aws/lambda/nodejs:${NODE_VERSION}

# handler.js is the default redirect-mode fixture (DD_LAMBDA_HANDLER=handler.handle).
# The remaining *.js files are the manual-wrap fixture handlers ported from the
# AWS suite (throw-error, status-code-500s, send-metrics, process-input,
# http-requests), async-context.js, and extractor.js.
COPY package.json *.js ${LAMBDA_TASK_ROOT}/
COPY datadog-lambda-js-local.tgz /tmp/datadog-lambda-js-local.tgz
RUN cd ${LAMBDA_TASK_ROOT} \
    && npm install --omit=dev \
    && npm install --no-save /tmp/datadog-lambda-js-local.tgz \
    && rm /tmp/datadog-lambda-js-local.tgz

CMD ["node_modules/datadog-lambda-js/dist/handler.handler"]
