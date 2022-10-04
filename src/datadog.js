
process.env['DD_LAMBDA_HANDLER'] = process.env["_HANDLER"];
process.env["_HANDLER"] = '/opt/nodejs/node_modules/datadog-lambda-js/handler.handler';