import { extractHTTPDataFromEvent } from "./event-data-extractor";

describe("extractHTTPDataFromEvent", () => {
  describe("non-HTTP events", () => {
    it("should return undefined for SQS events", () => {
      const event = { Records: [{ eventSource: "aws:sqs", body: "test" }] };
      expect(extractHTTPDataFromEvent(event)).toBeUndefined();
    });

    it("should return undefined for S3 events", () => {
      const event = { Records: [{ s3: { bucket: { name: "test" } } }] };
      expect(extractHTTPDataFromEvent(event)).toBeUndefined();
    });

    it("should return undefined for empty events", () => {
      expect(extractHTTPDataFromEvent({})).toBeUndefined();
    });
  });

  describe("API Gateway v1", () => {
    const baseEvent = {
      httpMethod: "GET",
      path: "/my/path",
      resource: "/my/{param}",
      headers: { Host: "example.com", Cookie: "session=abc; lang=en" },
      multiValueHeaders: null,
      queryStringParameters: { foo: "bar" },
      multiValueQueryStringParameters: null,
      pathParameters: { param: "123" },
      body: null,
      isBase64Encoded: false,
      requestContext: {
        stage: "prod",
        path: "/prod/my/path",
        identity: { sourceIp: "1.2.3.4" },
      },
    };

    it("should extract HTTP data correctly", () => {
      const result = extractHTTPDataFromEvent(baseEvent);

      expect(result).toBeDefined();
      expect(result!.method).toBe("GET");
      expect(result!.path).toBe("/prod/my/path");
      expect(result!.clientIp).toBe("1.2.3.4");
      expect(result!.route).toBe("/my/{param}");
      expect(result!.pathParams).toEqual({ param: "123" });
      expect(result!.query).toEqual({ foo: "bar" });
      expect(result!.isBase64Encoded).toBe(false);
    });

    it("should separate cookies from headers", () => {
      const result = extractHTTPDataFromEvent(baseEvent);

      expect(result!.headers.cookie).toBeUndefined();
      expect(result!.cookies).toEqual({ session: "abc", lang: "en" });
    });

    it("should normalize header names to lowercase", () => {
      const result = extractHTTPDataFromEvent(baseEvent);

      expect(result!.headers.host).toBe("example.com");
    });

    it("should decode base64 body", () => {
      const event = {
        ...baseEvent,
        body: Buffer.from('{"key":"value"}').toString("base64"),
        isBase64Encoded: true,
      };

      const result = extractHTTPDataFromEvent(event);
      expect(result!.body).toEqual({ key: "value" });
      expect(result!.isBase64Encoded).toBe(true);
    });

    it("should parse JSON body when not base64 encoded", () => {
      const event = {
        ...baseEvent,
        body: '{"key":"value"}',
      };

      const result = extractHTTPDataFromEvent(event);
      expect(result!.body).toEqual({ key: "value" });
    });

    it("should return raw string body when not JSON", () => {
      const event = {
        ...baseEvent,
        body: "plain text body",
      };

      const result = extractHTTPDataFromEvent(event);
      expect(result!.body).toBe("plain text body");
    });

    it("should not include cookies when cookie header is absent", () => {
      const event = {
        ...baseEvent,
        headers: { Host: "example.com" },
      };
      const result = extractHTTPDataFromEvent(event);
      expect(result!.cookies).toBeUndefined();
      expect("cookies" in result!).toBe(false);
    });

    it("should not include route when resource is empty string", () => {
      const event = { ...baseEvent, resource: "" };
      const result = extractHTTPDataFromEvent(event);
      expect(result!.route).toBeUndefined();
      expect("route" in result!).toBe(false);
    });

    it("should merge multi-value query params", () => {
      const event = {
        ...baseEvent,
        queryStringParameters: { foo: "bar" },
        multiValueQueryStringParameters: { foo: ["bar", "baz"], single: ["one"] },
      };

      const result = extractHTTPDataFromEvent(event);
      expect(result!.query).toEqual({ foo: ["bar", "baz"], single: "one" });
    });
  });

  describe("API Gateway v2", () => {
    const baseEvent = {
      version: "2.0",
      rawPath: "/my/path",
      rawQueryString: "foo=bar",
      headers: { host: "example.com" },
      queryStringParameters: { foo: "bar" },
      pathParameters: { id: "456" },
      body: null,
      isBase64Encoded: false,
      cookies: ["session=abc", "lang=en"],
      routeKey: "GET /my/{id}",
      requestContext: {
        http: {
          method: "POST",
          path: "/my/path",
          sourceIp: "5.6.7.8",
        },
        domainName: "api.example.com",
        apiId: "abc123",
        stage: "$default",
      },
    };

    it("should extract HTTP data correctly", () => {
      const result = extractHTTPDataFromEvent(baseEvent);

      expect(result).toBeDefined();
      expect(result!.method).toBe("POST");
      expect(result!.path).toBe("/my/path");
      expect(result!.clientIp).toBe("5.6.7.8");
      expect(result!.route).toBe("/my/{id}");
      expect(result!.pathParams).toEqual({ id: "456" });
    });

    it("should parse cookies from the cookies array", () => {
      const result = extractHTTPDataFromEvent(baseEvent);

      expect(result!.cookies).toEqual({ session: "abc", lang: "en" });
    });

    it("should extract route from routeKey", () => {
      const result = extractHTTPDataFromEvent(baseEvent);
      expect(result!.route).toBe("/my/{id}");
    });

    it("should not include route when routeKey is absent", () => {
      const event = { ...baseEvent, routeKey: undefined };
      const result = extractHTTPDataFromEvent(event);
      expect(result!.route).toBeUndefined();
      expect("route" in result!).toBe(false);
    });

    it("should not include route when routeKey produces an empty string", () => {
      const event = { ...baseEvent, routeKey: "" };
      const result = extractHTTPDataFromEvent(event);
      expect(result!.route).toBeUndefined();
      expect("route" in result!).toBe(false);
    });

    it("should not include cookies when cookies array is absent", () => {
      const event = { ...baseEvent, cookies: undefined };
      const result = extractHTTPDataFromEvent(event);
      expect(result!.cookies).toBeUndefined();
      expect("cookies" in result!).toBe(false);
    });
  });

  describe("ALB", () => {
    const baseEvent = {
      httpMethod: "GET",
      path: "/alb/path",
      headers: {
        host: "example.com",
        "x-forwarded-for": "9.8.7.6, 10.0.0.1",
        cookie: "token=xyz",
      },
      queryStringParameters: { key: "val" },
      body: null,
      isBase64Encoded: false,
      requestContext: {
        elb: {
          targetGroupArn: "arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/my-tg/abc",
        },
      },
    };

    it("should extract HTTP data correctly", () => {
      const result = extractHTTPDataFromEvent(baseEvent);

      expect(result).toBeDefined();
      expect(result!.method).toBe("GET");
      expect(result!.path).toBe("/alb/path");
    });

    it("should extract client IP from x-forwarded-for", () => {
      const result = extractHTTPDataFromEvent(baseEvent);
      expect(result!.clientIp).toBe("9.8.7.6");
    });

    it("should parse cookies from the cookie header", () => {
      const result = extractHTTPDataFromEvent(baseEvent);
      expect(result!.cookies).toEqual({ token: "xyz" });
      expect(result!.headers.cookie).toBeUndefined();
    });

    it("should not have route or pathParams", () => {
      const result = extractHTTPDataFromEvent(baseEvent);
      expect(result!.route).toBeUndefined();
      expect(result!.pathParams).toBeUndefined();
    });
  });

  describe("Lambda Function URL", () => {
    const baseEvent = {
      version: "2.0",
      rawPath: "/url/path",
      rawQueryString: "",
      headers: { host: "abc123.lambda-url.us-east-1.on.aws" },
      queryStringParameters: null,
      body: null,
      isBase64Encoded: false,
      cookies: ["token=xyz"],
      requestContext: {
        domainName: "abc123.lambda-url.us-east-1.on.aws",
        http: {
          method: "GET",
          path: "/url/path",
          sourceIp: "11.12.13.14",
        },
      },
    };

    it("should extract HTTP data correctly", () => {
      const result = extractHTTPDataFromEvent(baseEvent);

      expect(result).toBeDefined();
      expect(result!.method).toBe("GET");
      expect(result!.path).toBe("/url/path");
      expect(result!.clientIp).toBe("11.12.13.14");
    });

    it("should parse cookies from the cookies array", () => {
      const result = extractHTTPDataFromEvent(baseEvent);
      expect(result!.cookies).toEqual({ token: "xyz" });
    });

    it("should not have route", () => {
      const result = extractHTTPDataFromEvent(baseEvent);
      expect(result!.route).toBeUndefined();
    });
  });
});
