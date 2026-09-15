// Plain unwrapped CJS user handler. The layer entrypoint
// (/opt/nodejs/node_modules/datadog-lambda-js/handler.handler) wraps it via
// DD_LAMBDA_HANDLER=handler.handle.
exports.handle = async (event) => {
  return { message: "hello, dog!" };
};
