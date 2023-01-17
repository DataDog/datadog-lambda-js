import { subscribeToDC, getTraceTree, RequireNode } from "./require-tracer";
const dc = require('diagnostics_channel')

describe('require-tracer', () => {
  it('generates a trace tree', () => {
    subscribeToDC()
    const moduleLoadStartChannel = dc.channel('dd-trace:moduleLoadStart')
    const moduleLoadEndChannel = dc.channel('dd-trace:moduleLoadEnd')

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
    expect(res).toBeDefined
    expect(res[0].id).toBe('myLibrary')
    const resChildren = res[0].children as RequireNode[]
    expect(resChildren).toHaveLength(1)
    const resChild = resChildren.pop() as RequireNode
    expect(resChild.id).toBe('myChildLibrary')
  })

})
