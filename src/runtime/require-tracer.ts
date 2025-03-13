const dc = require('dc-polyfill')

export class RequireNode {
  public id: string
  public filename: string
  public startTime: number
  public endTime: number
  public startMemory: number
  public endMemory: number
  public children: RequireNode[]

  constructor(id: string, filename: string, startTime: number, startMemory: number) {
    this.id = id
    this.filename = filename
    this.startTime = startTime
    this.endTime = startTime
    this.startMemory = startMemory
    this.endMemory = startMemory
    this.children = []
  }

  public set setEnd(endTime: number) {
    this.endTime = endTime
  }
}

const moduleLoadStartChannel = dc.channel('dd-trace:moduleLoadStart')
const moduleLoadEndChannel = dc.channel('dd-trace:moduleLoadEnd')
let rootNodes: RequireNode[] = []

const requireStack: RequireNode[] = []
const pushNode = (data: any) => {
  const startTime = Date.now()
  const startMemory = process.memoryUsage().heapUsed

  const reqNode = new RequireNode(data.request, data.filename, startTime, startMemory)
  const maybeParent = requireStack[requireStack.length - 1]

  if (maybeParent) {
    maybeParent.children.push(reqNode)
  }
  requireStack.push(reqNode)
}

const popNode = () => {
  const reqNode = requireStack.pop()
  if (reqNode){
    reqNode.endTime = Date.now()
    reqNode.endMemory = process.memoryUsage().heapUsed
  }
  if (requireStack.length <= 0 && reqNode) {
    rootNodes.push(reqNode)
  }
}

export const subscribeToDC = () => {
  moduleLoadStartChannel.subscribe(pushNode)
  moduleLoadEndChannel.subscribe(popNode)
}

export const getTraceTree = (): RequireNode[] => {
  return rootNodes
}

export const clearTraceTree = () => {
  rootNodes = []
}
