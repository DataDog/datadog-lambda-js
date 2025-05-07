import * as dgram from "node:dgram";
import { SocketType } from "node:dgram";

export class LambdaDogStatsD {
  private static readonly MIN_SEND_BUFFER_SIZE = 32 * 1024;
  private static readonly SOCKET_TYPE: SocketType = "udp4";
  private static readonly TAG_RE = /[^\w\d_\-:\/\.]/gu;
  private static readonly TAG_SUB = "_";

  private readonly socket: dgram.Socket;

  constructor() {
    this.socket = dgram.createSocket(LambdaDogStatsD.SOCKET_TYPE);
    LambdaDogStatsD.ensureMinSendBufferSize(this.socket);
  }

  private static ensureMinSendBufferSize(sock: dgram.Socket): void {
    if (process.platform === "win32") {
      return;
    }

    try {
      const currentSize = sock.getSendBufferSize();
      if (currentSize <= LambdaDogStatsD.MIN_SEND_BUFFER_SIZE) {
        sock.setSendBufferSize(LambdaDogStatsD.MIN_SEND_BUFFER_SIZE);
        console.debug(`Socket send buffer increased to ${LambdaDogStatsD.MIN_SEND_BUFFER_SIZE / 1024}kb`);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Send a distribution value, optionally setting tags and timestamp.
   * Timestamp is seconds since epoch.
   */
  public distribution(metric: string, value: number, tags?: string[], timestamp?: number): void {
    this.report(metric, "d", value, tags, timestamp);
  }

  private normalizeTags(tags: string[]): string[] {
    return tags.map((t) => t.replace(LambdaDogStatsD.TAG_RE, LambdaDogStatsD.TAG_SUB));
  }

  private report(metric: string, metricType: string, value: number | null, tags?: string[], timestamp?: number): void {
    if (value == null) {
      return;
    }
    const serializedTags = tags && tags.length ? `|#${this.normalizeTags(tags).join(",")}` : "";
    const timeStampPart = timestamp != null ? `|T${timestamp}` : "";
    const payload = `${metric}:${value}|${metricType}${serializedTags}${timeStampPart}`;
    this.send(payload);
  }

  private send(packet: string) {
    // TODO
  }
}
