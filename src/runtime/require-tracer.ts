const Module = require('module')
const unpatchedRequire = Module.prototype.require

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

function patchedRequire (this: unknown, id: string) {
  let required
  const startTime = Date.now()
  const reqNode = new RequireNode(id, id, startTime)
  const maybeParent = requireStack[requireStack.length - 1]
  //console.log(`require tree length is ${requireStack.length}, parent is ${maybeParent?.id}`)
  if (maybeParent) {
    //console.log(`pushing child ${reqNode.id} to parent ${maybeParent.id}`)
    maybeParent?.children?.push(reqNode)
  }
  requireStack.push(reqNode)
  try {
    //console.time(`require-${id}`)
    required = unpatchedRequire.call(this, id)
  } finally {
    //console.timeEnd(`require-${id}`)
    reqNode.endTime = Date.now()
    requireStack.pop()

    if (requireStack.length <= 0 && reqNode?.children && reqNode.children.length > 0) {
      rootNodes.push(reqNode)
    }
  }
  return required
}

export const getTraceTree = (): RequireNode[] => {
  return rootNodes
}

export const clearTraceTree = () => {
  rootNodes = []
}

export const patchRequire = () => {
  console.log('[ASTUYVE] patching required')
  Module.prototype.require = patchedRequire
}

export const unpatchRequire = () => {
  console.log('[ASTUYVE] unpatching required')
  Module.prototype.require = unpatchedRequire
}

Module.prototype.require = patchedRequire
