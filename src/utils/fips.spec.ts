describe("fips.ts", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("enables FIPS mode in GovCloud by default", () => {
    process.env.AWS_REGION = "us-gov-west-1";
    delete process.env.DD_LAMBDA_FIPS_MODE;

    const { FIPS_MODE_ENABLED } = require("./fips");
    expect(FIPS_MODE_ENABLED).toBe(true);
  });

  it("disables FIPS mode in standard region by default", () => {
    process.env.AWS_REGION = "us-east-1";
    delete process.env.DD_LAMBDA_FIPS_MODE;

    const { FIPS_MODE_ENABLED } = require("./fips");
    expect(FIPS_MODE_ENABLED).toBe(false);
  });

  it("enables FIPS mode when env var is set to true in a standard region", () => {
    process.env.AWS_REGION = "us-east-1";
    process.env.DD_LAMBDA_FIPS_MODE = "true";

    const { FIPS_MODE_ENABLED } = require("./fips");
    expect(FIPS_MODE_ENABLED).toBe(true);
  });

  it("disables FIPS mode when DD_LAMBDA_FIPS_MODE=false in GovCloud region", () => {
    process.env.AWS_REGION = "us-gov-east-1";
    process.env.DD_LAMBDA_FIPS_MODE = "false";

    const { FIPS_MODE_ENABLED } = require("./fips");
    expect(FIPS_MODE_ENABLED).toBe(false);
  });
});
