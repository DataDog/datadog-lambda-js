import * as dgram from "node:dgram";
import { LambdaDogStatsD } from "./dogstatsd";

jest.mock("node:dgram", () => ({
  createSocket: jest.fn(),
}));

describe("LambdaDogStatsD", () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    // A send() that immediately calls its callback
    mockSend = jest.fn((msg, port, host, cb) => cb());
    (dgram.createSocket as jest.Mock).mockReturnValue({
      send: mockSend,
      getSendBufferSize: jest.fn().mockReturnValue(64 * 1024),
      setSendBufferSize: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("sends a distribution metric without tags or timestamp", async () => {
    const client = new LambdaDogStatsD();
    client.distribution("metric", 1);
    await client.flush();

    expect(mockSend).toHaveBeenCalledWith(Buffer.from("metric:1|d", "utf8"), 8125, "localhost", expect.any(Function));
  });

  it("sends with tags (sanitized) and timestamp", async () => {
    const client = new LambdaDogStatsD();
    client.distribution("metric2", 2, 12345, ["tag1", "bad?tag"]);
    await client.flush();

    // "bad?tag" becomes "bad_tag"
    expect(mockSend).toHaveBeenCalledWith(
      Buffer.from("metric2:2|d|#tag1,bad_tag|T12345", "utf8"),
      8125,
      "localhost",
      expect.any(Function),
    );
  });

  it("flush() resolves immediately when there are no sends", async () => {
    const client = new LambdaDogStatsD();
    await expect(client.flush()).resolves.toBeUndefined();
  });

  it("flush() times out if a send never invokes its callback", async () => {
    // replace socket.send with a never‐calling callback
    (dgram.createSocket as jest.Mock).mockReturnValue({
      send: jest.fn(), // never calls callback
      getSendBufferSize: jest.fn(),
      setSendBufferSize: jest.fn(),
    });

    const client = new LambdaDogStatsD();
    client.distribution("will", 9);

    jest.useFakeTimers();
    const p = client.flush();
    // advance past the 1000ms MAX_FLUSH_TIMEOUT
    jest.advanceTimersByTime(1100);

    // expect the Promise returned by flush() to resolve successfully
    await expect(p).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});
