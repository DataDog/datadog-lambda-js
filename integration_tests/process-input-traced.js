const tracer = require("dd-trace").init();

const { datadog, sendDistributionMetric } = require("datadog-lambda-js");

// Minimal example of tracing to reduce flakiness
async function handle(event, context) {
  const span = tracer.scope().active();

  const responsePayload = { message: "hello, dog!" };

  sendDistributionMetric("serverless.integration_test.execution", 1, "function:process-input-traced");

  const { recordIds, eventType } = getRecordIds(event);

  if (recordIds) {
    responsePayload.recordIds = recordIds;
  }

  if (eventType) {
    responsePayload.eventType = eventType;
  } else {
    const requestId = getAPIGatewayRequestId(event);

    if (requestId) {
      responsePayload.eventType = "APIGateway";

      if (span) {
        span.setTag("api_gateway_request_id", requestId);
      }
    }
  }

  if (span) {
    span.setTag("event_type", responsePayload.eventType);
  }

  return responsePayload;
}

const getRecordIds = tracer.wrap("getRecordIds", (event) => {
  const recordIds = [];
  let eventType = null;
  if (event.Records) {
    event.Records.forEach((record) => {
      if (record.messageId) {
        eventType = "SQS";
        recordIds.push(record.messageId);
      }
      if (record.Sns) {
        eventType = "SNS";
        recordIds.push(record.Sns.MessageId);
      }
    });
  }

  if (eventType) {
    const span = tracer.scope().active();

    if (span) {
      span.setTag("record_event_type", eventType);
      span.setTag("record_ids", recordIds.join());
    }
  }

  return { recordIds, eventType };
});

const getAPIGatewayRequestId = tracer.wrap("getAPIGatewayRequestId", (event) => {
  let requestId;

  if (event.requestContext) {
    requestId = event.requestContext.requestId;

    const span = tracer.scope().active();

    if (span) {
      span.setTag("api_gateway_request_id", requestId);
      span.setTag("event_type", "APIGateway");
    }
  }

  return requestId;
});

module.exports.handle = process.env.WITH_PLUGIN ? handle : datadog(handle);
