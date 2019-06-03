declare module "aws-xray-sdk-core" {
  export class Segment {
    constructor(name: string, rootId: string, parentId: string);
    addMetadata(key: string, value: object | null, namespace?: string): void;
  }
  export function captureFunc(name: string, fcn: (segment: Segment) => void, parent?: Segment): void;
}
