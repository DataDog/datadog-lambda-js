import { Context, SQSEvent } from "aws-lambda";
import { LogLevel, setLogLevel } from "../utils";
import {
  SampleMode,
  xrayBaggageSubsegmentKey,
  xraySubsegmentNamespace,
  Source,
  xrayTraceEnvVar,
  awsXrayDaemonAddressEnvVar,
  traceIDHeader,
  parentIDHeader,
  samplingPriorityHeader,
} from "./constants";
import {
  convertToAPMParentID,
  convertToAPMTraceID,
  convertToSampleMode,
  convertTraceContext,
  extractTraceContext,
  readTraceContextFromXray,
  readTraceFromEvent,
  readStepFunctionContextFromEvent,
  readTraceFromSQSEvent,
  readTraceFromHTTPEvent,
  readTraceFromLambdaContext,
} from "./context";

let sentSegment: any;
let closedSocket = false;

jest.mock("dgram", () => {
  return {
    createSocket: () => {
      return {
        send: (
          message: string,
          start: number,
          length: number,
          port: number,
          address: string,
          callback: (error: string | undefined, bytes: number) => void,
        ) => {
          sentSegment = message;
          callback(undefined, 1);
        },
        close: () => {
          closedSocket = true;
        },
      };
    },
  };
});
jest.mock("crypto", () => {
  return {
    randomBytes: () => "11111",
  };
});

beforeEach(() => {
  sentSegment = undefined;
  closedSocket = false;
  setLogLevel(LogLevel.NONE);
});

describe("convertToAPMTraceID", () => {
  it("converts an xray trace id to a Datadog trace ID", () => {
    const xrayTraceID = "1-5ce31dc2-2c779014b90ce44db5e03875";
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toEqual("4110911582297405557");
  });
  it("converts an xray trace id to a Datadog trace ID removing first bit", () => {
    const xrayTraceID = "1-5ce31dc2-ac779014b90ce44db5e03875"; // Number with 64bit toggled on
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toEqual("4110911582297405557");
  });
  it("returns undefined when xray trace id is too short", () => {
    const xrayTraceID = "1-5ce31dc2-5e03875";
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toBeUndefined();
  });

  it("returns undefined when xray trace id is in an invalid format", () => {
    const xrayTraceID = "1-2c779014b90ce44db5e03875";
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toBeUndefined();
  });
  it("returns undefined when xray trace id uses invalid characters", () => {
    const xrayTraceID = "1-5ce31dc2-c779014b90ce44db5e03875;";
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toBeUndefined();
  });
});

describe("convertToAPMParentID", () => {
  it("converts an xray parent ID to an APM parent ID", () => {
    const xrayParentID = "0b11cc4230d3e09e";
    const parentID = convertToAPMParentID(xrayParentID);
    expect(parentID).toEqual("797643193680388254");
  });
  it("returns undefined when parent ID uses invalid characters", () => {
    const xrayParentID = ";79014b90ce44db5e0;875";
    const parentID = convertToAPMParentID(xrayParentID);
    expect(parentID).toBeUndefined();
  });
  it("returns undefined when parent ID is wrong size", () => {
    const xrayParentID = "5e03875";
    const parentID = convertToAPMParentID(xrayParentID);
    expect(parentID).toBeUndefined();
  });
});

describe("convertToSampleMode", () => {
  it("returns USER_KEEP if xray was sampled", () => {
    const result = convertToSampleMode(1);
    expect(result).toBe(SampleMode.USER_KEEP);
  });
  it("returns USER_REJECT if xray wasn't sampled", () => {
    const result = convertToSampleMode(0);
    expect(result).toBe(SampleMode.USER_REJECT);
  });
});

describe("convertTraceContext", () => {
  it("converts a valid xray trace header", () => {
    const result = convertTraceContext({
      parentID: "0b11cc4230d3e09e",
      sampled: 1,
      traceID: "1-5ce31dc2-ac779014b90ce44db5e03875",
    });
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: Source.Xray,
    });
  });
  it("returns undefined if traceID is invalid", () => {
    const result = convertTraceContext({
      parentID: "0b11cc4230d3e09e",
      sampled: 1,
      traceID: "1-5ce31dc2",
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined if parentID is invalid", () => {
    const result = convertTraceContext({
      parentID: "0b11cc4230d;09e",
      sampled: 1,
      traceID: "1-5ce31dc2-ac779014b90ce44db5e03875",
    });
    expect(result).toBeUndefined();
  });
});

describe("readTraceContextFromXray", () => {
  afterEach(() => {
    process.env["_X_AMZN_TRACE_ID"] = undefined;
  });
  it("returns a trace context from a valid env var", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
    const context = readTraceContextFromXray();
    expect(context).toEqual({
      parentID: "10713633173203262661",
      sampleMode: 2,
      source: "xray",
      traceID: "3995693151288333088",
    });
  });
  it("returns undefined when given an invalid env var", () => {
    const badCases = [
      "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5",
      "Root=1-5e272390-8c398be037738dc042009320",
      "1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1",
      "Root=1-5e272390-8c398be037738dc042009320;94ae789b969f1cc5;Sampled=1",
      "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;1",
      "Root=a;Parent=94ae789b969f1cc5;Sampled=1",
      "Root=1-5e272390-8c398be037738dc042009320;Parent=b;Sampled=1",
      undefined,
    ];
    for (const badCase of badCases) {
      process.env["_X_AMZN_TRACE_ID"] = badCase;
      expect(readTraceContextFromXray()).toBeUndefined();
    }
  });
});

describe("readTraceFromEvent", () => {
  it("can read well formed event with headers", () => {
    const result = readTraceFromEvent({
      headers: {
        "x-datadog-parent-id": "797643193680388254",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "4110911582297405557",
      },
    });
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: Source.Event,
    });
  });
  it("can read from sqs source", () => {
    const result = readTraceFromEvent({
      Records: [
        {
          body: "Hello world",
          attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1605544528092",
            SenderId: "AROAYYB64AB3JHSRKO6XR:sqs-trace-dev-producer",
            ApproximateFirstReceiveTimestamp: "1605544528094",
          },
          messageAttributes: {
            _datadog: {
              stringValue:
                '{"x-datadog-trace-id":"4555236104497098341","x-datadog-parent-id":"3369753143434738315","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
              stringListValues: [],
              binaryListValues: [],
              dataType: "String",
            },
          },
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:sa-east-1:601427279990:metal-queue",
          awsRegion: "sa-east-1",
        },
      ],
    });
    expect(result).toEqual({
      parentID: "3369753143434738315",
      sampleMode: SampleMode.AUTO_KEEP,
      traceID: "4555236104497098341",
      source: Source.Event,
    });
  });
  it("can read well formed headers with mixed casing", () => {
    const result = readTraceFromEvent({
      headers: {
        "X-Datadog-Parent-Id": "797643193680388254",
        "X-Datadog-Sampling-Priority": "2",
        "X-Datadog-Trace-Id": "4110911582297405557",
      },
    });
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: Source.Event,
    });
  });
  it("returns undefined when missing trace id", () => {
    const result = readTraceFromEvent({
      headers: {
        "x-datadog-parent-id": "797643193680388254",
        "x-datadog-sampling-priority": "2",
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when missing parent id", () => {
    const result = readTraceFromEvent({
      headers: {
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "4110911582297405557",
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when missing sampling priority id", () => {
    const result = readTraceFromEvent({
      headers: {
        "x-datadog-parent-id": "797643193680388254",
        "x-datadog-trace-id": "4110911582297405557",
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when missing headers value", () => {
    const result = readTraceFromEvent({});
    expect(result).toBeUndefined();
  });
  it("returns undefined when headers is null", () => {
    const result = readTraceFromEvent("some-value");
    expect(result).toBeUndefined();
  });
  it("returns undefined when event isn't object", () => {
    const result = readTraceFromEvent("some-value");
    expect(result).toBeUndefined();
  });
});

describe("readTraceFromHTTPEvent", () => {
  it("can read well formed event with headers", () => {
    const result = readTraceFromHTTPEvent({
      headers: {
        "x-datadog-parent-id": "797643193680388254",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "4110911582297405557",
      },
    });
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: Source.Event,
    });
  });
  it("can read well formed headers with mixed casing", () => {
    const result = readTraceFromHTTPEvent({
      headers: {
        "X-Datadog-Parent-Id": "797643193680388254",
        "X-Datadog-Sampling-Priority": "2",
        "X-Datadog-Trace-Id": "4110911582297405557",
      },
    });
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: Source.Event,
    });
  });
});

describe("readTraceFromSQSEvent", () => {
  it("can read from sqs source", () => {
    const result = readTraceFromSQSEvent(({
      Records: [
        {
          body: "Hello world",
          attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1605544528092",
            SenderId: "AROAYYB64AB3JHSRKO6XR:sqs-trace-dev-producer",
            ApproximateFirstReceiveTimestamp: "1605544528094",
          },
          messageAttributes: {
            _datadog: {
              stringValue:
                '{"x-datadog-trace-id":"4555236104497098341","x-datadog-parent-id":"3369753143434738315","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
              stringListValues: undefined,
              binaryListValues: undefined,
              dataType: "String",
            },
          },
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:sa-east-1:601427279990:metal-queue",
          awsRegion: "sa-east-1",
          messageId: "foo",
          md5OfBody: "x",
          receiptHandle: "x",
        },
      ],
    } as unknown) as SQSEvent);
    expect(result).toEqual({
      parentID: "3369753143434738315",
      sampleMode: SampleMode.AUTO_KEEP,
      traceID: "4555236104497098341",
      source: Source.Event,
    });
  });
  it("can handle malformed JSON", () => {
    const result = readTraceFromSQSEvent(({
      Records: [
        {
          body: "Hello world",
          attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1605544528092",
            SenderId: "AROAYYB64AB3JHSRKO6XR:sqs-trace-dev-producer",
            ApproximateFirstReceiveTimestamp: "1605544528094",
          },
          messageAttributes: {
            _datadog: {
              stringValue:
                '{asdasdasd"x-datadog-trace-id":"4555236104497098341","x-datadog-parent-id":"3369753143434738315","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
              stringListValues: undefined,
              binaryListValues: undefined,
              dataType: "String",
            },
          },
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:sa-east-1:601427279990:metal-queue",
          awsRegion: "sa-east-1",
          messageId: "foo",
          md5OfBody: "x",
          receiptHandle: "x",
        },
      ],
    } as unknown) as SQSEvent);
    expect(result).toBeUndefined();
  });
});

describe("readTraceFromLambdaContext", () => {
  it("can read from lambda context source", () => {
    const result = readTraceFromLambdaContext({
      clientContext: {
        custom: {
          _datadog: {
            "x-datadog-trace-id": "666",
            "x-datadog-parent-id": "777",
            "x-datadog-sampled": "1",
            "x-datadog-sampling-priority": "1",
          },
        },
      },
    });
    expect(result).toEqual({
      parentID: "777",
      sampleMode: SampleMode.AUTO_KEEP,
      traceID: "666",
      source: Source.Event,
    });
  });
  it("can handle no `custom` key", () => {
    const result = readTraceFromLambdaContext({
      clientContext: {
        foo: "bar",
      },
    });
    expect(result).toBeUndefined();
  });
  it("can handle no context", () => {
    const result = readTraceFromLambdaContext(undefined);
    expect(result).toBeUndefined();
  });
});

describe("readStepFunctionContextFromEvent", () => {
  const stepFunctionEvent = {
    dd: {
      Execution: {
        Name: "fb7b1e15-e4a2-4cb2-963f-8f1fa4aec492",
        StartTime: "2019-09-30T20:28:24.236Z",
      },
      State: {
        Name: "step-one",
        RetryCount: 2,
      },
      StateMachine: {
        Id: "arn:aws:states:us-east-1:601427279990:stateMachine:HelloStepOneStepFunctionsStateMachine-z4T0mJveJ7pJ",
        Name: "my-state-machine",
      },
    },
  } as const;
  it("reads a trace from an execution id", () => {
    const result = readStepFunctionContextFromEvent(stepFunctionEvent);
    expect(result).toEqual({
      "step_function.execution_id": "fb7b1e15-e4a2-4cb2-963f-8f1fa4aec492",
      "step_function.retry_count": 2,
      "step_function.state_machine_arn":
        "arn:aws:states:us-east-1:601427279990:stateMachine:HelloStepOneStepFunctionsStateMachine-z4T0mJveJ7pJ",
      "step_function.state_machine_name": "my-state-machine",
      "step_function.step_name": "step-one",
    });
  });
  it("returns undefined when event isn't an object", () => {
    const result = readStepFunctionContextFromEvent("event");
    expect(result).toBeUndefined();
  });
  it("returns undefined when event is missing datadogContext property", () => {
    const result = readStepFunctionContextFromEvent({});
    expect(result).toBeUndefined();
  });
  it("returns undefined when datadogContext is missing Execution property", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {},
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when Execution is missing Name field", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent.dd,
        Execution: {},
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when Name isn't a string", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent.dd,
        Execution: {
          Name: 12345,
        },
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when State isn't defined", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent.dd,
        State: undefined,
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when try retry count isn't a number", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent.dd,
        State: {
          ...stepFunctionEvent.dd.State,
          RetryCount: "1",
        },
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when try step name isn't a string", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent.dd,
        State: {
          ...stepFunctionEvent.dd.State,
          Name: 1,
        },
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when StateMachine is undefined", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent.dd,
        StateMachine: undefined,
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when StateMachineId isn't a string", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent.dd,
        StateMachine: {
          ...stepFunctionEvent.dd.StateMachine,
          Id: 1,
        },
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when StateMachineName isn't a string", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent.dd,
        StateMachine: {
          ...stepFunctionEvent.dd.StateMachine,
          Name: 1,
        },
      },
    });
    expect(result).toBeUndefined();
  });
});

describe("extractTraceContext", () => {
  afterEach(() => {
    process.env["_X_AMZN_TRACE_ID"] = undefined;
    process.env[awsXrayDaemonAddressEnvVar] = undefined;
  });
  it("returns trace read from header as highest priority with no extractor", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1";

    const result = extractTraceContext(
      {
        headers: {
          "x-datadog-parent-id": "797643193680388251",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "4110911582297405551",
        },
      },
      {} as Context,
    );
    expect(result).toEqual({
      parentID: "797643193680388251",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405551",
      source: Source.Event,
    });
  });
  it("returns an empty context when headers are null", () => {
    const result = extractTraceContext(
      {
        headers: null,
      },
      {} as Context,
    );
    expect(result).toEqual(undefined);
  });
  it("returns trace read from event with the extractor as the highest priority", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1";

    const extractor = (event: any, context: Context) => {
      const traceID = event.foo[traceIDHeader];
      const parentID = event.foo[parentIDHeader];
      const sampledHeader = event.foo[samplingPriorityHeader];
      const sampleMode = parseInt(sampledHeader, 10);

      return {
        parentID,
        sampleMode,
        source: Source.Event,
        traceID,
      };
    };

    const result = extractTraceContext(
      {
        foo: {
          "x-datadog-parent-id": "797643193680388251",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "4110911582297405551",
        },
      },
      {} as Context,
      extractor,
    );
    expect(result).toEqual({
      parentID: "797643193680388251",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405551",
      source: Source.Event,
    });
  });

  it("handles gracefully errors in extractors", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1";

    const extractor = (event: any, context: Context) => {
      throw new Error("test");

      const traceID = event.foo[traceIDHeader];
      const parentID = event.foo[parentIDHeader];
      const sampledHeader = event.foo[samplingPriorityHeader];
      const sampleMode = parseInt(sampledHeader, 10);

      return {
        parentID,
        sampleMode,
        source: Source.Event,
        traceID,
      };
    };

    const result = extractTraceContext(
      {
        foo: {
          "x-datadog-parent-id": "797643193680388251",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "4110911582297405551",
        },
      },
      {} as Context,
      extractor,
    );
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: "xray",
    });
  });
  it("returns trace read from SQS metadata as second highest priority", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1";

    const result = extractTraceContext(
      {
        Records: [
          {
            body: "Hello world",
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1605544528092",
              SenderId: "AROAYYB64AB3JHSRKO6XR:sqs-trace-dev-producer",
              ApproximateFirstReceiveTimestamp: "1605544528094",
            },
            messageAttributes: {
              _datadog: {
                stringValue:
                  '{"x-datadog-trace-id":"4555236104497098341","x-datadog-parent-id":"3369753143434738315","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
                stringListValues: [],
                binaryListValues: [],
                dataType: "String",
              },
            },
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:sa-east-1:601427279990:metal-queue",
            awsRegion: "sa-east-1",
          },
        ],
      },
      {} as Context,
    );
    expect(result).toEqual({
      parentID: "3369753143434738315",
      sampleMode: SampleMode.AUTO_KEEP,
      traceID: "4555236104497098341",
      source: Source.Event,
    });
  });
  it("returns trace read from Lambda Context as third highest priority", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1";
    const lambdaContext: Context = {
      clientContext: {
        custom: {
          _datadog: {
            "x-datadog-trace-id": "4555236104497098341",
            "x-datadog-parent-id": "3369753143434738315",
            "x-datadog-sampled": "1",
            "x-datadog-sampling-priority": "1",
          },
        },
      },
    } as any;
    const result = extractTraceContext(
      {
        Records: [
          {
            body: "Hello world",
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1605544528092",
              SenderId: "AROAYYB64AB3JHSRKO6XR:sqs-trace-dev-producer",
              ApproximateFirstReceiveTimestamp: "1605544528094",
            },
            messageAttributes: {
              _datadog: {
                stringValue: '{"x-datadog-parent-id":"666","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
                stringListValues: [],
                binaryListValues: [],
                dataType: "String",
              },
            },
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:sa-east-1:601427279990:metal-queue",
            awsRegion: "sa-east-1",
          },
        ],
      },
      lambdaContext,
    );
    expect(result).toEqual({
      parentID: "3369753143434738315",
      sampleMode: SampleMode.AUTO_KEEP,
      traceID: "4555236104497098341",
      source: Source.Event,
    });
  });
  it("returns trace read from env if no headers present", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1";

    const result = extractTraceContext({}, {} as Context);
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: "xray",
    });
  });
  it("returns trace read from env if no headers present", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1";

    const result = extractTraceContext({}, {} as Context);
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: "xray",
    });
  });
  it("adds datadog metadata segment to xray when trace context is in event", () => {
    jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);
    process.env[xrayTraceEnvVar] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
    process.env[awsXrayDaemonAddressEnvVar] = "localhost:127.0.0.1:2000";

    const result = extractTraceContext(
      {
        headers: {
          "x-datadog-parent-id": "797643193680388251",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "4110911582297405551",
        },
      },
      {} as Context,
    );

    expect(sentSegment instanceof Buffer).toBeTruthy();
    expect(closedSocket).toBeTruthy();
    const sentMessage = sentSegment.toString();
    expect(sentMessage).toMatchInlineSnapshot(`
      "{\\"format\\": \\"json\\", \\"version\\": 1}
      {\\"id\\":\\"11111\\",\\"trace_id\\":\\"1-5e272390-8c398be037738dc042009320\\",\\"parent_id\\":\\"94ae789b969f1cc5\\",\\"name\\":\\"datadog-metadata\\",\\"start_time\\":1487076708000,\\"end_time\\":1487076708000,\\"type\\":\\"subsegment\\",\\"metadata\\":{\\"datadog\\":{\\"trace\\":{\\"parent-id\\":\\"797643193680388251\\",\\"sampling-priority\\":\\"2\\",\\"trace-id\\":\\"4110911582297405551\\"}}}}"
    `);
  });
  it("skips adding datadog metadata to x-ray when daemon isn't present", () => {
    jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);
    process.env[xrayTraceEnvVar] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";

    const result = extractTraceContext(
      {
        headers: {
          "x-datadog-parent-id": "797643193680388251",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "4110911582297405551",
        },
      },
      {} as Context,
    );

    expect(sentSegment).toBeUndefined();
  });

  it("adds step function metadata to xray", () => {
    const stepFunctionEvent = {
      dd: {
        Execution: {
          Name: "fb7b1e15-e4a2-4cb2-963f-8f1fa4aec492",
          StartTime: "2019-09-30T20:28:24.236Z",
        },
        State: {
          Name: "step-one",
          RetryCount: 2,
        },
        StateMachine: {
          Id: "arn:aws:states:us-east-1:601427279990:stateMachine:HelloStepOneStepFunctionsStateMachine-z4T0mJveJ7pJ",
          Name: "my-state-machine",
        },
      },
    } as const;
    jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);
    process.env[xrayTraceEnvVar] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
    process.env[awsXrayDaemonAddressEnvVar] = "localhost:127.0.0.1:2000";

    extractTraceContext(stepFunctionEvent, {} as Context);
    expect(sentSegment instanceof Buffer).toBeTruthy();

    expect(closedSocket).toBeTruthy();

    const sentMessage = sentSegment.toString();
    expect(sentMessage).toMatchInlineSnapshot(`
      "{\\"format\\": \\"json\\", \\"version\\": 1}
      {\\"id\\":\\"11111\\",\\"trace_id\\":\\"1-5e272390-8c398be037738dc042009320\\",\\"parent_id\\":\\"94ae789b969f1cc5\\",\\"name\\":\\"datadog-metadata\\",\\"start_time\\":1487076708000,\\"end_time\\":1487076708000,\\"type\\":\\"subsegment\\",\\"metadata\\":{\\"datadog\\":{\\"root_span_metadata\\":{\\"step_function.execution_id\\":\\"fb7b1e15-e4a2-4cb2-963f-8f1fa4aec492\\",\\"step_function.retry_count\\":2,\\"step_function.state_machine_arn\\":\\"arn:aws:states:us-east-1:601427279990:stateMachine:HelloStepOneStepFunctionsStateMachine-z4T0mJveJ7pJ\\",\\"step_function.state_machine_name\\":\\"my-state-machine\\",\\"step_function.step_name\\":\\"step-one\\"}}}}"
    `);
  });
});
