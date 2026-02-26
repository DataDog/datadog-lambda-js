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

  private readonly socket: dgram.Socket;
  private readonly pendingSends = new Set<Promise<void>>();

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

  private send(packet: string) {
    const msg = Buffer.from(packet, LambdaDogStatsD.ENCODING);
    const promise = new Promise<void>((resolve) => {
      this.socket.send(msg, LambdaDogStatsD.PORT, LambdaDogStatsD.HOST, (err) => {
        if (err) {
          logDebug(`Unable to send metric packet: ${err.message}`);
        }

        resolve();
      });
    });

    this.pendingSends.add(promise);
    void promise.finally(() => this.pendingSends.delete(promise));
  }

  /** Block until all in-flight sends have settled */
  public async flush(): Promise<void> {
    const allSettled = Promise.allSettled(this.pendingSends);
    const maxTimeout = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), LambdaDogStatsD.MAX_FLUSH_TIMEOUT);
    });

    const winner = await Promise.race([allSettled, maxTimeout]);
    if (winner === "timeout") {
      logDebug("Timed out before sending all metric payloads");
    }

    this.pendingSends.clear();
  }
}
