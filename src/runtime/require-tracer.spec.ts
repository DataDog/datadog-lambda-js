import { subscribeToDC, getTraceTree, clearTraceTree, recordModuleLoad, RequireNode } from "./require-tracer";
const dc = require('dc-polyfill')

describe('require-tracer', () => {
  const moduleLoadStartChannel = dc.channel('dd-trace:moduleLoadStart')
  const moduleLoadEndChannel = dc.channel('dd-trace:moduleLoadEnd')

  beforeEach(() => {
    subscribeToDC()
  })

  afterEach(() => {
    clearTraceTree()
  })

  it('generates a trace tree', () => {
    // require('myLibrary')
    moduleLoadStartChannel.publish({
      request: 'myLibrary'
    })
    // require('myChildLibrary')
    moduleLoadStartChannel.publish({
      request: 'myChildLibrary'
    })
    moduleLoadEndChannel.publish()
    moduleLoadEndChannel.publish()
    const res = getTraceTree()
    expect(res).toBeDefined()
    expect(res[0].id).toBe('myLibrary')
    const resChildren = res[0].children as RequireNode[]
    expect(resChildren).toHaveLength(1)
    const resChild = resChildren.pop() as RequireNode
    expect(resChild.id).toBe('myChildLibrary')
  })

  it('ignores unmatched module load end events', () => {
    moduleLoadEndChannel.publish({
      request: 'missing'
    })

    expect(getTraceTree()).toStrictEqual([])
  })

  it('clears pending module load state', () => {
    moduleLoadStartChannel.publish({
      request: 'unfinished'
    })

    clearTraceTree()

    moduleLoadStartChannel.publish({
      request: 'finished'
    })
    moduleLoadEndChannel.publish({
      request: 'finished'
    })

    const res = getTraceTree()
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('finished')
  })

  it('handles ESM loader payloads without a request', () => {
    const filename = 'file:///var/task/index.mjs'

    moduleLoadStartChannel.publish({
      filename
    })
    moduleLoadEndChannel.publish({
      filename
    })

    const res = getTraceTree()
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe(filename)
    expect(res[0].filename).toBe(filename)
    expect(res[0].endTime).toBeGreaterThanOrEqual(res[0].startTime)
  })

  it('records measured ESM imports', () => {
    recordModuleLoad({
      id: '/var/task/index.mjs',
      filename: '/var/task/index.mjs',
      startTime: 100,
      endTime: 150,
      kind: 'import'
    })

    const res = getTraceTree()
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('/var/task/index.mjs')
    expect(res[0].filename).toBe('/var/task/index.mjs')
    expect(res[0].startTime).toBe(100)
    expect(res[0].endTime).toBe(150)
    expect(res[0].kind).toBe('import')
  })

  it('does not record measured imports with invalid durations', () => {
    recordModuleLoad({
      id: '/var/task/index.mjs',
      filename: '/var/task/index.mjs',
      startTime: 150,
      endTime: 100,
      kind: 'import'
    })

    expect(getTraceTree()).toStrictEqual([])
  })

  it('parents roots loaded during a measured ESM import', () => {
    recordModuleLoad({
      id: '@aws-sdk/core/client',
      filename: '/var/task/node_modules/@aws-sdk/core/dist-cjs/client.js',
      startTime: 120,
      endTime: 130
    })
    recordModuleLoad({
      id: '/var/task/index.mjs',
      filename: '/var/task/index.mjs',
      startTime: 100,
      endTime: 150,
      kind: 'import',
      absorbChildren: true
    })

    const res = getTraceTree()
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('/var/task/index.mjs')
    expect(res[0].kind).toBe('import')
    expect(res[0].children).toHaveLength(1)
    expect(res[0].children[0].id).toBe('@aws-sdk/core/client')
  })
})
