import { openSession, login } from './lib-driver.mjs'
async function main() {
  const s = await openSession({ width: 390, height: 844 })
  await login(s)
  const r = await s.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  // text inventory with their font/color/weight + y position
  const texts=[...sr.querySelectorAll('x-text')].map(e=>{const b=e.getBoundingClientRect();const c=getComputedStyle(e);return{y:Math.round(b.y),txt:(e.textContent||'').slice(0,18),fs:c.fontSize,fw:c.fontWeight,color:c.color};}).filter(t=>t.txt.trim());
  // section outline: home-section blocks
  const sections=[...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').includes('home-section')&&!(e.className||'').includes('__')).map(e=>{const b=e.getBoundingClientRect();return{cls:e.className.split(' ')[0],y:Math.round(b.y),h:Math.round(b.height),w:Math.round(b.width)};});
  // topbar + greeting + any headers
  const heads=[...sr.querySelectorAll('x-view,x-text')].filter(e=>/home__topbar|home__greeting|home__title|__title/.test(e.className||'')).map(e=>{const b=e.getBoundingClientRect();const c=getComputedStyle(e);return{cls:(e.className||'').slice(0,30),y:Math.round(b.y),h:Math.round(b.height),fs:c.fontSize,fw:c.fontWeight};});
  return JSON.stringify({texts,sections,heads},null,1);
})()`)
  console.log(r)
  await s.close(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
