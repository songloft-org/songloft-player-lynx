import { openSession, login, gotoSettings, dumpScreen } from './lib-driver.mjs'
async function main() {
  const s = await openSession({ width: 390, height: 844 })
  await login(s)
  await gotoSettings(s)
  await s.screenshot('/tmp/settings-main.png')
  console.log('=== SETTINGS MAIN dump ===')
  console.log(await dumpScreen(s, 'settings-main'))
  await s.close(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
