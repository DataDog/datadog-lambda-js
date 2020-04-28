declare module "aws-xray-sdk-core" {
  export class Segment {
    name: string;
    trace_id: string;
    parent_id: string;
    id: string;
    notTraced: boolean | undefined;

    constructor(name: string, rootId: string, parentId: string);
    addMetadata(key: string, value: object | null, namespace?: string): void;
  }

  export interface Logger {
    error(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    debug(message: string): void;
  }
  export function captureFunc(name: string, fcn: (segment: Segment) => void, parent?: Segment): void;
  export function getSegment(): Segment;
  export function getLogger(): Logger;
  export function setLogger(logger: Logger): void;
}
