// Custom trace-context extractor fixture, loaded via
// DD_TRACE_EXTRACTOR=extractor.extract (handler-style "module.function"
// string, resolved by the shim's user-function loader).
//
// Returns a fixed context on every event: the extracted parent and the
// `_dd.parent_source` span tag must show up in the trace, which the golden
// asserts deterministically (ids are normalized to XXXX; the tag is not).
module.exports.extract = async (event, context) => {
  return {
    traceId: "1234567890123456789",
    parentId: "9876543210987654321",
    sampleMode: 1,
    source: "event",
  };
};
