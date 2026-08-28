import * as dgram from "node:dgram";

import { logDebug } from "../utils";
import { LambdaDogStatsD } from "./dogstatsd";

jest.mock("node:dgram", () => ({
  createSocket: jest.fn(),
}));
jest.mock("../utils", () => ({
  logDebug: jest.fn(),
}));

describe("LambdaDogStatsD", () => {
  let mockSend: jest.Mock<void, [Buffer, number, string, (error?: Error) => void]>;
  let mockUnref: jest.Mock<void, []>;

  function useControlledSocket(): Array<(error?: Error) => void> {
    const callbacks: Array<(error?: Error) => void> = [];
    mockSend.mockImplementation((_message, _port, _host, callback) => {
      callbacks.push(callback);
    });
    return callbacks;
  }

  /**
   * @param {Promise<void>} promise
   */
  function observeCompletion(promise: Promise<void>): jest.Mock<void, []> {
    const completed = jest.fn();
    void promise.then(completed);
    return completed;
  }

  beforeEach(() => {
    // A send() that immediately calls its callback
    mockSend = jest.fn((msg, port, host, cb) => cb());
    mockUnref = jest.fn();
    (dgram.createSocket as jest.Mock).mockReturnValue({
      send: mockSend,
      unref: mockUnref,
      getSendBufferSize: jest.fn().mockReturnValue(64 * 1024),
      setSendBufferSize: jest.fn(),
      bind: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("sends a distribution metric without tags or timestamp", async () => {
    const client = new LambdaDogStatsD();
    client.distribution("metric", 1);
    await client.flush();

    expect(mockSend).toHaveBeenCalledWith(Buffer.from("metric:1|d", "utf8"), 8125, "127.0.0.1", expect.any(Function));
  });

  it("sends with tags (sanitized) and timestamp", async () => {
    const client = new LambdaDogStatsD();
    client.distribution("metric2", 2, 12345, ["tag1", "bad?tag"]);
    await client.flush();

    // "bad?tag" becomes "bad_tag"
    expect(mockSend).toHaveBeenCalledWith(
      Buffer.from("metric2:2|d|#tag1,bad_tag|T12345", "utf8"),
      8125,
      "127.0.0.1",
      expect.any(Function),
    );
  });

  it("rounds timestamp", async () => {
    const client = new LambdaDogStatsD();
    client.distribution("metric2", 2, 12345.678);
    await client.flush();

    expect(mockSend).toHaveBeenCalledWith(
      Buffer.from("metric2:2|d|T12345", "utf8"),
      8125,
      "127.0.0.1",
      expect.any(Function),
    );
  });

  it("flush() resolves immediately when there are no sends", async () => {
    jest.useFakeTimers();
    const client = new LambdaDogStatsD();
    await expect(client.flush()).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("unrefs socket on client creation", () => {
    // Constructor should avoid keeping Node's event loop alive.
    new LambdaDogStatsD();
    expect(mockUnref).toHaveBeenCalledTimes(1);
  });

  it("flush() waits for one pending send and clears its timeout", async () => {
    jest.useFakeTimers();
    const callbacks = useControlledSocket();
    const client = new LambdaDogStatsD();
    client.distribution("pending", 1);

    const flush = client.flush();
    const completed = observeCompletion(flush);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    callbacks[0]();
    await expect(flush).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("flush() waits for every pending send", async () => {
    const callbacks = useControlledSocket();
    const client = new LambdaDogStatsD();
    client.distribution("first", 1);
    client.distribution("second", 2);
    client.distribution("third", 3);

    const flush = client.flush();
    const completed = observeCompletion(flush);
    callbacks[0]();
    callbacks[1]();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    callbacks[2]();
    await expect(flush).resolves.toBeUndefined();
  });

  it("flush() waits for sends started while it is pending", async () => {
    const callbacks = useControlledSocket();
    const client = new LambdaDogStatsD();
    client.distribution("first", 1);

    const flush = client.flush();
    const completed = observeCompletion(flush);
    client.distribution("second", 2);
    callbacks[0]();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    callbacks[1]();
    await expect(flush).resolves.toBeUndefined();
  });

  it("flush() settles concurrent callers after the pending send", async () => {
    const callbacks = useControlledSocket();
    const client = new LambdaDogStatsD();
    client.distribution("pending", 1);

    const firstFlush = client.flush();
    const secondFlush = client.flush();
    expect(secondFlush).toBe(firstFlush);
    callbacks[0]();

    await Promise.all([firstFlush, secondFlush]);
  });

  it("logs callback errors and completes the send", async () => {
    const error = new Error("callback failure");
    mockSend.mockImplementation((_message, _port, _host, callback) => callback(error));
    const client = new LambdaDogStatsD();

    client.distribution("metric", 1);

    await expect(client.flush()).resolves.toBeUndefined();
    expect(logDebug).toHaveBeenCalledWith("Unable to send metric packet: callback failure");
  });

  it("logs synchronous socket errors without throwing", async () => {
    mockSend.mockImplementation(() => {
      throw new Error("synchronous failure");
    });
    const client = new LambdaDogStatsD();

    client.distribution("metric", 1);

    await expect(client.flush()).resolves.toBeUndefined();
    expect(logDebug).toHaveBeenCalledWith("Unable to send metric packet: synchronous failure");
  });

  it("normalizes non-Error values thrown synchronously by the socket", async () => {
    mockSend.mockImplementation(() => {
      throw "non-error failure";
    });
    const client = new LambdaDogStatsD();

    client.distribution("metric", 1);

    await expect(client.flush()).resolves.toBeUndefined();
    expect(logDebug).toHaveBeenCalledWith("Unable to send metric packet: Unknown socket send failure");
  });

  it("flush() times out if a send never invokes its callback", async () => {
    jest.useFakeTimers();
    useControlledSocket();

    const client = new LambdaDogStatsD();
    client.distribution("will", 9);

    const flush = client.flush();
    jest.advanceTimersByTime(1000);

    await expect(flush).resolves.toBeUndefined();
    expect(logDebug).toHaveBeenCalledWith("Timed out before sending all metric payloads");
  });

  it("ignores late callbacks from a timed-out flush when the client is reused", async () => {
    jest.useFakeTimers();
    const callbacks = useControlledSocket();
    const client = new LambdaDogStatsD();
    client.distribution("old", 1);
    const oldFlush = client.flush();
    jest.advanceTimersByTime(1000);
    await oldFlush;

    client.distribution("new", 2);
    const newFlush = client.flush();
    const completed = observeCompletion(newFlush);
    callbacks[0]();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    callbacks[1]();
    await expect(newFlush).resolves.toBeUndefined();
  });
});
