import { MSKEvent } from "aws-lambda";
import { MSKEventTraceExtractor } from "./msk";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { TraceSource } from "../../trace-context-service";

const datadogHeaders = {
  "x-datadog-trace-id": "667309514221035538",
  "x-datadog-parent-id": "1350735035497811828",
  "x-datadog-sampling-priority": "1",
  "x-datadog-tags": "_dd.p.tid=0123456789abcdef",
};
const w3cHeaders = {
  traceparent: "00-0123456789abcdef0942c4f3b84c8812-12becbb3b2d5bd74-01",
  tracestate: "dd=s:1;t.dm:-0",
};
const record = (headers: Record<string, string>) => ({
  headers: Object.entries(headers).map(([name, value]) => ({ [name]: Array.from(Buffer.from(value)) })),
});
const event = (records: any): MSKEvent => ({ eventSource: "aws:kafka", records } as MSKEvent);

// Mock the tracer boundary so these tests exercise MSK decoding and record selection.
describe("MSKEventTraceExtractor", () => {
  const spanContext = new SpanContextWrapper(
    { toTraceId: () => datadogHeaders["x-datadog-trace-id"], toSpanId: () => datadogHeaders["x-datadog-parent-id"] },
    TraceSource.Event,
  );
  let extract: jest.Mock;
  let extractor: MSKEventTraceExtractor;

  beforeEach(() => {
    extract = jest.fn().mockReturnValue(null);
    extractor = new MSKEventTraceExtractor({ extract } as unknown as TracerWrapper);
  });

  it.each([
    ["Datadog", datadogHeaders],
    ["W3C", w3cHeaders],
    ["combined", { ...datadogHeaders, ...w3cHeaders }],
  ])("decodes and forwards all %s propagation headers", (_, headers) => {
    extract.mockReturnValue(spanContext);
    expect(extractor.extract(event({ "topic-0": [record(headers)] }))).toBe(spanContext);
    expect(extract).toHaveBeenCalledWith(headers);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("normalizes header names and decodes UTF-8", () => {
    extractor.extract(
      event({ "topic-0": [record({ TraceParent: w3cHeaders.traceparent, baggage: "city=São Paulo" })] }),
    );
    expect(extract).toHaveBeenCalledWith({ traceparent: w3cHeaders.traceparent, baggage: "city=São Paulo" });
  });

  it("uses the last value for duplicate headers", () => {
    const message = { headers: [...record({ traceparent: "old" }).headers, ...record(w3cHeaders).headers] };
    extractor.extract(event({ "topic-0": [message] }));
    expect(extract).toHaveBeenCalledWith(w3cHeaders);
  });

  it("skips untraced records across partitions and stops at the first valid context", () => {
    extract.mockReturnValueOnce(null).mockReturnValueOnce(spanContext);
    expect(
      extractor.extract(
        event({
          "topic-0": [{ headers: [] }, record({ traceparent: "invalid" })],
          "topic-1": [record(datadogHeaders), record(w3cHeaders)],
        }),
      ),
    ).toBe(spanContext);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract).toHaveBeenNthCalledWith(2, datadogHeaders);
  });

  it("never combines partial trace headers from different records", () => {
    extractor.extract(
      event({ "topic-0": [record({ "x-datadog-trace-id": "123" }), record({ "x-datadog-parent-id": "456" })] }),
    );
    expect(extract).toHaveBeenNthCalledWith(1, { "x-datadog-trace-id": "123" });
    expect(extract).toHaveBeenNthCalledWith(2, { "x-datadog-parent-id": "456" });
  });

  it.each([null, "123", [256], [-1], [1.5], ["49"], [null], [true], { "0": 49 }].map((value) => [value]))(
    "ignores invalid byte values: %j",
    (value) => {
      extract.mockReturnValue(spanContext);
      expect(
        extractor.extract(event({ "topic-0": [{ headers: [{ invalid: value }, ...record(datadogHeaders).headers] }] })),
      ).toBe(spanContext);
      expect(extract).toHaveBeenCalledWith(datadogHeaders);
    },
  );

  it.each([
    undefined,
    null,
    {},
    { "topic-0": [] },
    { "topic-0": null },
    { "topic-0": "invalid" },
    { "topic-0": [null, {}, { headers: null }, { headers: "invalid" }, { headers: [null, 42, []] }] },
  ])("returns null for empty or malformed records: %j", (records) => {
    expect(extractor.extract(event(records))).toBeNull();
    expect(extract).not.toHaveBeenCalled();
  });

  it("continues after an extraction error", () => {
    extract
      .mockImplementationOnce(() => {
        throw new Error("invalid carrier");
      })
      .mockReturnValueOnce(spanContext);
    expect(extractor.extract(event({ "topic-0": [record(w3cHeaders), record(datadogHeaders)] }))).toBe(spanContext);
  });

  it("returns null when the tracer cannot extract context", () => {
    expect(extractor.extract(event({ "topic-0": [record(datadogHeaders)] }))).toBeNull();
  });

  it("does not mutate the event", () => {
    const payload = event({ "topic-0": [record(datadogHeaders)] });
    const original = JSON.stringify(payload);
    extractor.extract(payload);
    expect(JSON.stringify(payload)).toBe(original);
  });
});
