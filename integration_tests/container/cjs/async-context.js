const { AsyncLocalStorage } = require("node:async_hooks");

const tracer = require("dd-trace");
const winston = require("winston");

const requestContext = new AsyncLocalStorage();
const seenSpanIds = new Set();

/**
 * @typedef {object} LogInfo
 * @property {{ span_id?: string, trace_id?: string }} [dd]
 * @property {string} request_id
 */

/**
 * @param {LogInfo} info
 */
function verifyCorrelation(info) {
  const spanContext = tracer.scope().active()?.context();
  const request = requestContext.getStore();

  if (
    info.dd?.trace_id === undefined ||
    info.dd?.span_id !== spanContext?.toSpanId() ||
    info.request_id !== request?.requestId
  ) {
    throw new Error("Winston log did not contain the active invocation context");
  }

  return info;
}

const logger = winston.createLogger({
  format: winston.format.combine(winston.format(verifyCorrelation)(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * @param {unknown} event
 * @param {{ awsRequestId: string }} context
 */
async function handle(event, context) {
  return requestContext.run({ event, requestId: context.awsRequestId }, async () => {
    const spanId = tracer.scope().active()?.context().toSpanId();
    if (spanId === undefined || seenSpanIds.has(spanId)) {
      throw new Error("Invocation did not receive a fresh span context");
    }
    seenSpanIds.add(spanId);

    logger.info("handling invocation", { phase: "start", request_id: context.awsRequestId });
    await Promise.resolve();
    logger.info("handling invocation", { phase: "resumed", request_id: context.awsRequestId });

    return { message: "hello, dog!" };
  });
}

module.exports.handle = handle;
