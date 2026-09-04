import { openSession, login } from './lib-driver.mjs'
async function main() {
  const s = await openSession({ width: 390, height: 844 })
  await login(s)
  const r = await s.evalJS(`(()=>{
    const hosts=[...document.querySelectorAll('*')].filter(e=>e.shadowRoot);
    return JSON.stringify(hosts.map((h,i)=>({i,tag:h.tagName,cls:(h.className||'').slice(0,40),els:h.shadowRoot.querySelectorAll('*').length,hasTheme:!!h.shadowRoot.querySelector('.theme-root'),hasPage:!!h.shadowRoot.querySelector('.page'),sample:[...h.shadowRoot.querySelectorAll('*')].map(e=>e.className).filter(Boolean).slice(0,8)})),null,1);
  })()`)
  console.log(r)
  await s.close(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
