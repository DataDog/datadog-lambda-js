import { getSpanPointerAttributes, SpanPointerAttributes } from "./span-pointers";
import { eventTypes } from "../trace/trigger";

// tslint:disable-next-line:no-var-requires
const { DYNAMODB_PTR_KIND, S3_PTR_KIND, SPAN_POINTER_DIRECTION } = require("dd-trace/packages/dd-trace/src/constants");
// tslint:disable-next-line:no-var-requires
const util = require("dd-trace/packages/datadog-plugin-aws-sdk/src/util");

// Mock the external dependencies
jest.mock("./log", () => ({
  logDebug: jest.fn(),
}));

describe("span-pointers utils", () => {
  const mockPointerHash = "mock-hash-123";

  beforeEach(() => {
    jest.spyOn(util, "generatePointerHash").mockReturnValue(mockPointerHash);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getSpanPointerAttributes", () => {
    it("returns undefined when eventSource is undefined", () => {
      const result = getSpanPointerAttributes(undefined, {});
      expect(result).toBeUndefined();
    });

    it("returns undefined for unsupported event types", () => {
      const result = getSpanPointerAttributes("unsupported" as eventTypes, {});
      expect(result).toBeUndefined();
    });

    describe("S3 event processing", () => {
      it("processes single S3 record correctly", () => {
        const event = {
          Records: [
            {
              s3: {
                bucket: { name: "test-bucket" },
                object: {
                  key: "test-key",
                  eTag: "test-etag",
                },
              },
              eventName: "ObjectCreated:SomeEventName",
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            kind: S3_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
        ];

        const result = getSpanPointerAttributes(eventTypes.s3, event);
        expect(result).toEqual(expected);
        expect(util.generatePointerHash).toHaveBeenCalledWith(["test-bucket", "test-key", "test-etag"]);
      });

      it("processes multiple S3 records correctly", () => {
        const event = {
          Records: [
            {
              s3: {
                bucket: { name: "bucket1" },
                object: {
                  key: "key1",
                  eTag: "etag1",
                },
              },
              eventName: "ObjectCreated:SomeEventName",
            },
            {
              s3: {
                bucket: { name: "bucket2" },
                object: {
                  key: "key2",
                  eTag: "etag2",
                },
              },
              eventName: "ObjectCreated:SomeEventName",
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            kind: S3_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
          {
            kind: S3_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
        ];

        const result = getSpanPointerAttributes(eventTypes.s3, event);
        expect(result).toEqual(expected);
      });

      it("handles empty Records array", () => {
        const event = { Records: [] };
        const result = getSpanPointerAttributes(eventTypes.s3, event);
        expect(result).toEqual([]);
      });

      it("handles missing Records property", () => {
        const event = {};
        const result = getSpanPointerAttributes(eventTypes.s3, event);
        expect(result).toEqual([]);
      });

      it("skips invalid records but processes valid ones", () => {
        const event = {
          Records: [
            {
              // Invalid record missing s3 property
            },
            {
              s3: {
                bucket: { name: "valid-bucket" },
                object: {
                  key: "valid-key",
                  eTag: "valid-etag",
                },
              },
              eventName: "ObjectCreated:SomeEventName",
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            kind: S3_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
        ];

        const result = getSpanPointerAttributes(eventTypes.s3, event);
        expect(result).toEqual(expected);
      });
    });

    describe("DynamoDB event processing", () => {
      const mockPrimaryValue1 = "mockPrimaryValue1";
      const mockPrimaryValue2 = "mockPrimaryValue2";
      const mockTableName = "mockTableName";
      const mockEventSourceArn = `arn:aws:dynamodb:us-east-1:123467890:table/${mockTableName}/stream/2024-11-19T16:00:00.000`;

      it("processes Dynamo record with one primary key correctly", () => {
        const event = {
          Records: [
            {
              dynamodb: {
                Keys: {
                  someKey1: {
                    S: mockPrimaryValue1,
                  },
                },
              },
              eventName: "INSERT",
              eventSourceARN: mockEventSourceArn,
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            kind: DYNAMODB_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
        ];

        const result = getSpanPointerAttributes(eventTypes.dynamoDB, event);
        expect(result).toEqual(expected);
        expect(util.generatePointerHash).toHaveBeenCalledWith([
          mockTableName,
          "someKey1",
          Buffer.from(mockPrimaryValue1),
          "",
          "",
        ]);
      });

      it("processes Dynamo record with two primary keys correctly", () => {
        const event = {
          Records: [
            {
              dynamodb: {
                Keys: {
                  someKey1: {
                    S: mockPrimaryValue1,
                  },
                  someKey2: {
                    S: mockPrimaryValue2,
                  },
                },
              },
              eventName: "MODIFY",
              eventSourceARN: mockEventSourceArn,
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            kind: DYNAMODB_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
          {
            kind: DYNAMODB_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
        ];

        const result = getSpanPointerAttributes(eventTypes.dynamoDB, event);
        expect(result).toEqual(expected);
        expect(util.generatePointerHash).toHaveBeenCalledWith([
          mockTableName,
          "someKey1",
          Buffer.from(mockPrimaryValue1),
          "someKey2",
          Buffer.from(mockPrimaryValue2),
        ]);
      });

      it("processes multiple DynamoDB records correctly", () => {
        const event = {
          Records: [
            {
              dynamodb: {
                Keys: {
                  someKey1: {
                    S: mockPrimaryValue1,
                  },
                },
              },
              eventName: "MODIFY",
              eventSourceARN: mockEventSourceArn,
            },
            {
              dynamodb: {
                Keys: {
                  someKey2: {
                    S: mockPrimaryValue2,
                  },
                },
              },
              eventName: "DELETE",
              eventSourceARN: mockEventSourceArn,
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            kind: S3_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
          {
            kind: S3_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
        ];

        const result = getSpanPointerAttributes(eventTypes.s3, event);
        expect(result).toEqual(expected);
        expect(util.generatePointerHash).toHaveBeenCalledWith([
          mockTableName,
          "someKey1",
          Buffer.from(mockPrimaryValue1),
          "someKey2",
          Buffer.from(mockPrimaryValue2),
        ]);
      });

      it("handles empty Records array", () => {
        const event = { Records: [] };
        const result = getSpanPointerAttributes(eventTypes.dynamoDB, event);
        expect(result).toEqual([]);
      });

      it("handles missing Records property", () => {
        const event = {};
        const result = getSpanPointerAttributes(eventTypes.dynamoDB, event);
        expect(result).toEqual([]);
      });

      it("skips invalid records but processes valid ones", () => {
        const event = {
          Records: [
            {
              // Invalid record missing s3 property
            },
            {
              dynamodb: {
                Keys: {
                  someKey1: {
                    S: mockPrimaryValue1,
                  },
                },
              },
              eventName: "MODIFY",
              eventSourceARN: mockEventSourceArn,
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            kind: S3_PTR_KIND,
            direction: SPAN_POINTER_DIRECTION.UPSTREAM,
            hash: mockPointerHash,
          },
        ];

        const result = getSpanPointerAttributes(eventTypes.s3, event);
        expect(result).toEqual(expected);
        expect(util.generatePointerHash).toHaveBeenCalledWith([
          mockTableName,
          "someKey1",
          Buffer.from(mockPrimaryValue1),
          "",
          "",
        ]);
      });
    });
  });
});
