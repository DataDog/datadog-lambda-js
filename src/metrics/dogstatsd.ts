import * as dgram from "node:dgram";
import { SocketType } from "node:dgram";

export class LambdaDogStatsD {
  private static readonly MIN_SEND_BUFFER_SIZE = 32 * 1024;
  private static readonly SOCKET_TYPE: SocketType = "udp4";

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
    // TODO
  }
}
