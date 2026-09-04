import { openSession, login, dumpScreen } from './lib-driver.mjs'
async function main() {
  // narrow
  const n = await openSession({ width: 390, height: 844 })
  await login(n)
  await n.screenshot('/tmp/home-narrow.png')
  console.log('=== HOME NARROW dump ===')
  console.log(await dumpScreen(n, 'home-narrow'))
  await n.close()

  // wide
  const w = await openSession({ width: 1280, height: 800 })
  await login(w)
  await w.screenshot('/tmp/home-wide.png')
  console.log('=== HOME WIDE dump ===')
  console.log(await dumpScreen(w, 'home-wide'))
  await w.close()
  process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
