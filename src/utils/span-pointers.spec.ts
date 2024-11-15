import { getSpanPointerAttributes } from "./span-pointers";
import { eventTypes } from "../trace/trigger";
import { S3_PTR_KIND, SPAN_POINTER_DIRECTION } from "dd-trace/packages/dd-trace/src/constants";
import * as util from "dd-trace/packages/dd-trace/src/util";

// Mock the external dependencies
jest.mock("./log", () => ({
  logDebug: jest.fn(),
}));

interface SpanPointerAttributes {
  pointerKind: string;
  pointerDirection: string;
  pointerHash: string;
}

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
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            pointerKind: S3_PTR_KIND,
            pointerDirection: SPAN_POINTER_DIRECTION.UPSTREAM,
            pointerHash: mockPointerHash,
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
            },
            {
              s3: {
                bucket: { name: "bucket2" },
                object: {
                  key: "key2",
                  eTag: "etag2",
                },
              },
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            pointerKind: S3_PTR_KIND,
            pointerDirection: SPAN_POINTER_DIRECTION.UPSTREAM,
            pointerHash: mockPointerHash,
          },
          {
            pointerKind: S3_PTR_KIND,
            pointerDirection: SPAN_POINTER_DIRECTION.UPSTREAM,
            pointerHash: mockPointerHash,
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
            },
          ],
        };

        const expected: SpanPointerAttributes[] = [
          {
            pointerKind: S3_PTR_KIND,
            pointerDirection: SPAN_POINTER_DIRECTION.UPSTREAM,
            pointerHash: mockPointerHash,
          },
        ];

        const result = getSpanPointerAttributes(eventTypes.s3, event);
        expect(result).toEqual(expected);
      });
    });
  });
});
