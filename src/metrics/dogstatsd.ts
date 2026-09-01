import * as dgram from "node:dgram";
import { SocketType } from "node:dgram";
import { logDebug } from "../utils";

export class LambdaDogStatsD {
  private static readonly HOST = "127.0.0.1";
  private static readonly PORT = 8125;
  private static readonly MIN_SEND_BUFFER_SIZE = 32 * 1024;
  private static readonly ENCODING: BufferEncoding = "utf8";
  private static readonly SOCKET_TYPE: SocketType = "udp4";
  private static readonly TAG_RE = /[^\w\d_\-:\/\.]/gu;
  private static readonly TAG_SUB = "_";
  // The maximum amount to wait while flushing pending sends, so we don't block forever.
  private static readonly MAX_FLUSH_TIMEOUT = 1000;
  static readonly #resolvedFlush = Promise.resolve();

  private readonly socket: dgram.Socket;
  #pendingSends = 0;
  #sendGeneration = 0;
  #flushPromise: Promise<void> | undefined;
  #resolveFlush: (() => void) | undefined;
  #flushTimeout: NodeJS.Timeout | undefined;

  constructor() {
    this.socket = dgram.createSocket(LambdaDogStatsD.SOCKET_TYPE);
    this.socket.unref?.();
  }

  /**
   * Send a distribution value, optionally setting tags and timestamp.
   * Timestamp is seconds since epoch.
   */
  public distribution(metric: string, value: number, timestamp?: number, tags?: string[]): void {
    this.report(metric, "d", value, tags, timestamp);
  }

  private normalizeTags(tags: string[]): string[] {
    return tags.map((t) => t.replace(LambdaDogStatsD.TAG_RE, LambdaDogStatsD.TAG_SUB));
  }

  private report(metric: string, metricType: string, value: number | null, tags?: string[], timestamp?: number): void {
    if (value == null) {
      return;
    }

    if (timestamp) {
      timestamp = Math.floor(timestamp);
    }

    const serializedTags = tags && tags.length ? `|#${this.normalizeTags(tags).join(",")}` : "";
    const timestampPart = timestamp != null ? `|T${timestamp}` : "";
    const payload = `${metric}:${value}|${metricType}${serializedTags}${timestampPart}`;
    this.send(payload);
  }

  /**
   * @param {string} packet
   */
  private send(packet: string): void {
    const message = Buffer.from(packet, LambdaDogStatsD.ENCODING);
    const generation = this.#sendGeneration;
    this.#pendingSends++;

    try {
      this.socket.send(message, LambdaDogStatsD.PORT, LambdaDogStatsD.HOST, (error) => {
        this.#completeSend(generation, error);
      });
    } catch (error) {
      const sendError = error instanceof Error ? error : new Error("Unknown socket send failure");
      this.#completeSend(generation, sendError);
    }
  }

  /**
   * @param {number} generation
   * @param {Error | null} [error]
   */
  #completeSend(generation: number, error?: Error | null): void {
    if (error) {
      logDebug(`Unable to send metric packet: ${error.message}`);
    }

    if (generation !== this.#sendGeneration) {
      return;
    }

    this.#pendingSends--;
    if (this.#pendingSends === 0 && this.#resolveFlush !== undefined) {
      this.#finishFlush(false);
    }
  }

  /**
   * @param {boolean} timedOut
   */
  #finishFlush(timedOut: boolean): void {
    const resolve = this.#resolveFlush!;

    if (this.#flushTimeout !== undefined) {
      clearTimeout(this.#flushTimeout);
    }
    this.#flushPromise = undefined;
    this.#resolveFlush = undefined;
    this.#flushTimeout = undefined;

    if (timedOut) {
      this.#pendingSends = 0;
      this.#sendGeneration++;
      logDebug("Timed out before sending all metric payloads");
    }

    resolve();
  }

  /** Block until all in-flight sends have settled or the flush timeout expires. */
  public flush(): Promise<void> {
    if (this.#pendingSends === 0) {
      return LambdaDogStatsD.#resolvedFlush;
    }
    if (this.#flushPromise !== undefined) {
      return this.#flushPromise;
    }

    this.#flushPromise = new Promise<void>((resolve) => {
      this.#resolveFlush = resolve;
    });
    this.#flushTimeout = setTimeout(() => this.#finishFlush(true), LambdaDogStatsD.MAX_FLUSH_TIMEOUT);
    return this.#flushPromise;
  }
}
