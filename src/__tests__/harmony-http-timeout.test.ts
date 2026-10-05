import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import path from 'node:path'
import ts from 'typescript'
import { expect, test, vi } from 'vitest'
import { REQUEST_TIMEOUT_HEADER } from '../core/network/http-client.js'

/** Execute the actual ArkTS request mapping; this does not replace a HAP build. */
async function send(headers: Record<string, string>) {
  const source = readFileSync(path.resolve(__dirname, '../../harmony/entry/src/main/ets/net/SongloftHttpService.ets'), 'utf8')
  const js = ts.transpileModule(source.replace(/^import .*$/gm, ''), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  }).outputText
  const request = vi.fn(async (_url: string, _options: {header: Record<string, string>, readTimeout: number}) => (
    {responseCode: 200, header: {}, result: 'OK'}
  ))
  const destroy = vi.fn()
  const exports: {SongloftHttpService?: {instance: {
    request(req: {url: string, httpMethod: string, httpHeaders: Record<string, string>}, callback: (response: unknown) => void): void
  }}} = {}
  runInNewContext(js, {
    exports,
    http: {createHttp: () => ({request, destroy}), RequestMethod: {GET: 'GET'}},
    InsecureTls: {isEnabled: () => false},
    LynxHttpResponse: class {},
    util: {TextEncoder: class {encodeInto(text: string) {return new TextEncoder().encode(text)}}},
  })
  const response = await new Promise(resolve => {
    exports.SongloftHttpService!.instance.request({
      url: 'http://api.example/update', httpMethod: 'GET', httpHeaders: headers,
    }, resolve)
  })
  const options = request.mock.calls[0]![1]
  return {response, options, destroy}
}

test.each([240_000, 1_800_000])('HarmonyOS consumes a %i ms deadline and preserves auth headers', async timeout => {
  const input = {[REQUEST_TIMEOUT_HEADER]: String(timeout), Authorization: 'Bearer test'}
  const {options, destroy} = await send(input)
  expect(options.readTimeout).toBe(timeout)
  expect(options.header).toEqual({Authorization: 'Bearer test'})
  expect(input).toHaveProperty(REQUEST_TIMEOUT_HEADER)
  expect(destroy).toHaveBeenCalledOnce()
})

test.each(['0', '-1', 'NaN', '240000.5', '1800001'])('HarmonyOS removes an invalid deadline (%s) and uses its default', async value => {
  const {options} = await send({'x-songloft-request-timeout-ms': value})
  expect(options.header).toEqual({})
  expect(options.readTimeout).toBe(30_000)
})
