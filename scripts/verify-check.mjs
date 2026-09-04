import { openSession, login, gotoSettings, clickTestid } from './lib-driver.mjs'
async function main() {
  const s = await openSession({ width: 390, height: 844 })
  await login(s)
  await gotoSettings(s)
  await clickTestid(s, 'settings-appearance')
  await new Promise((r) => setTimeout(r, 2500))

  const r = await s.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  // selected language row (check picker): find the settings-row that has a check svg and is 'selected'
  const rows=[...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').split(' ')[0]==='settings-row');
  const langSelected=rows.find(row=>{const cls=row.className;const hasCheck=row.querySelector('[data-icon="check"]');return hasCheck;});
  let langInfo=null;
  if(langSelected){const c=getComputedStyle(langSelected);langInfo={cls:langSelected.className,bg:c.backgroundColor,hasActive:langSelected.className.includes('--active')};}
  return JSON.stringify({langSelected:langInfo},null,1);
})()`)
  console.log(r)
  await s.screenshot('/tmp/appearance-check.png')
  console.log('wrote /tmp/appearance-check.png')
  await s.close(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
