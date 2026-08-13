import { startMockServer, stopMockServer } from './mock-server.js'

export async function setup(): Promise<void> {
  await startMockServer()
}

export async function teardown(): Promise<void> {
  await stopMockServer()
}
