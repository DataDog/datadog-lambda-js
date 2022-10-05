process.env["DD_LAMBDA_HANDLER"] = process.env["_HANDLER"];
process.env["_HANDLER"] = `${__dirname}/handler.handler`;
