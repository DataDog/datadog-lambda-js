const { datadog, sendDistributionMetric } = require("datadog-lambda-js");

async function handle(event, context) {
  const responsePayload = { message: "hello, dog!" };

  if (event.requestContext) {
    responsePayload.eventType = "APIGateway";
    responsePayload.requestId = event.requestContext.requestId;
  }

  if (event.Records) {
    responsePayload.recordIds = [];

    event.Records.forEach((record) => {
      if (record.messageId) {
        responsePayload.eventType = "SQS";
        responsePayload.recordIds.push(record.messageId);
        sendDistributionMetric(
          "serverless.integration_test.records_processed",
          1,
          "tagkey:tagvalue",
          `eventsource:${responsePayload.eventType}`,
        );
      }
      if (record.Sns) {
        responsePayload.eventType = "SNS";
        responsePayload.recordIds.push(record.Sns.MessageId);
        sendDistributionMetric(
          "serverless.integration_test.records_processed",
          1,
          "tagkey:tagvalue",
          `eventsource:${responsePayload.eventType}`,
        );
      }
    });
  }

  sendDistributionMetric(
    "serverless.integration_test.execution",
    1,
    "tagkey:tagvalue",
    `eventsource:${responsePayload.eventType}`,
  );

  console.log(`Processed ${responsePayload.eventType} request`);

  return responsePayload;
}

module.exports.handle = datadog(handle);
