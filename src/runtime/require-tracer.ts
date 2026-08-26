import { performance } from "perf_hooks";

const dc = require('dc-polyfill')

export type ModuleLoadKind = 'require' | 'import'

export interface ModuleLoadTrace {
  id: string
  filename?: string
  startTime: number
  endTime: number
  kind?: ModuleLoadKind
  absorbChildren?: boolean
}

export class RequireNode {
  public id: string
  public filename: string
  public startTime: number
  public endTime: number
  public children: RequireNode[]
  public kind: ModuleLoadKind

  constructor(id: string, filename: string, startTime: number, kind: ModuleLoadKind = 'require') {
    this.id = id
    this.filename = filename
    this.startTime = startTime
    this.endTime = startTime
    this.children = []
    this.kind = kind
  }

  public set setEnd(endTime: number) {
    this.endTime = endTime
  }
}

const moduleLoadStartChannel = dc.channel('dd-trace:moduleLoadStart')
const moduleLoadEndChannel = dc.channel('dd-trace:moduleLoadEnd')
let rootNodes: RequireNode[] = []
let isSubscribed = false

const requireStack: RequireNode[] = []
const pushNode = (data: any) => {
  const startTime = now()
  const id = getModuleId(data)
  const filename = getModuleFilename(data, id)

  const reqNode = new RequireNode(id, filename, startTime)
  const maybeParent = requireStack[requireStack.length - 1]

  if (maybeParent) {
    maybeParent.children.push(reqNode)
  }
  requireStack.push(reqNode)
}

const popNode = (data?: any) => {
  const reqNodeIndex = findMatchingNodeIndex(data)
  if (reqNodeIndex < 0) return

  const endTime = now()
  const reqNode = requireStack.splice(reqNodeIndex, 1)[0]
  if (reqNode) {
    reqNode.endTime = endTime
  }
  if (requireStack.length <= 0 && reqNode) {
    rootNodes.push(reqNode)
  }
}

const findMatchingNodeIndex = (data?: any): number => {
  const stackTopIndex = requireStack.length - 1
  if (!hasModuleIdentity(data) || stackTopIndex < 0) return stackTopIndex

  const id = getModuleId(data)
  const filename = getModuleFilename(data, id)
  for (let index = stackTopIndex; index >= 0; index--) {
    const reqNode = requireStack[index]
    if (reqNode.id === id && reqNode.filename === filename) {
      return index
    }
  }

  return -1
}

const hasModuleIdentity = (data: any): boolean => {
  return !!(data?.request || data?.filename)
}

const getModuleId = (data: any): string => {
  return String(data?.request || data?.filename || "<unknown>")
}

const getModuleFilename = (data: any, id: string): string => {
  return String(data?.filename || data?.request || id)
}

const now = (): number => {
  return performance.timeOrigin + performance.now()
}

const isWithin = (node: RequireNode, parent: RequireNode): boolean => {
  return node.startTime >= parent.startTime && node.endTime <= parent.endTime
}

export const recordModuleLoad = (moduleLoad: ModuleLoadTrace): void => {
  if (moduleLoad.endTime < moduleLoad.startTime) return

  const reqNode = new RequireNode(
    moduleLoad.id,
    moduleLoad.filename || moduleLoad.id,
    moduleLoad.startTime,
    moduleLoad.kind
  )
  reqNode.endTime = moduleLoad.endTime

  if (moduleLoad.absorbChildren) {
    const children = rootNodes.filter((rootNode) => isWithin(rootNode, reqNode))
    rootNodes = rootNodes.filter((rootNode) => !isWithin(rootNode, reqNode))
    reqNode.children.push(...children)
  }

  rootNodes.push(reqNode)
}

export const currentTime = (): number => {
  return now()
}

export const subscribeToDC = () => {
  if (isSubscribed) return
  isSubscribed = true
  moduleLoadStartChannel.subscribe(pushNode)
  moduleLoadEndChannel.subscribe(popNode)
}

export const getTraceTree = (): RequireNode[] => {
  return rootNodes
}

export const clearTraceTree = () => {
  rootNodes = []
  requireStack.length = 0
}
