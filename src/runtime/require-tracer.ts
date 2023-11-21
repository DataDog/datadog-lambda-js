// TODO NEXT MAJOR (AJ): Remove this when we drop node14
const dc = require('dc-polyfill')

export class RequireNode {
  public id: string
  public filename: string
  public startTime: number
  public endTime: number
  public children: RequireNode[]

  constructor(id: string, filename: string, startTime: number) {
    this.id = id
    this.filename = filename
    this.startTime = startTime
    this.endTime = startTime
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

  const reqNode = new RequireNode(data.request, data.filename, startTime)
  const maybeParent = requireStack[requireStack.length - 1]

  if (maybeParent) {
    maybeParent.children.push(reqNode)
  }
  requireStack.push(reqNode)
}

const popNode = () => {
  const endTime = Date.now()
  const reqNode = requireStack.pop()
  if (reqNode){
    reqNode.endTime = endTime
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
