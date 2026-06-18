ARG NODE_VERSION=22
FROM public.ecr.aws/lambda/nodejs:${NODE_VERSION}

COPY package.json handler.js ${LAMBDA_TASK_ROOT}/
COPY datadog-lambda-js-local.tgz /tmp/datadog-lambda-js-local.tgz
RUN cd ${LAMBDA_TASK_ROOT} && npm install /tmp/datadog-lambda-js-local.tgz \
    && rm /tmp/datadog-lambda-js-local.tgz

CMD ["node_modules/datadog-lambda-js/dist/handler.handler"]
