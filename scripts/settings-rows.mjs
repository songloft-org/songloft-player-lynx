import { openSession, login, gotoSettings } from './lib-driver.mjs'
async function main() {
  const s = await openSession({ width: 390, height: 844 })
  await login(s)
  await gotoSettings(s)
  const r = await s.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const rows=[...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').split(' ')[0]==='settings-row');
  const rowH=rows.map(e=>Math.round(e.getBoundingClientRect().height));
  const titles=[...sr.querySelectorAll('x-text')].filter(e=>(e.className||'').includes('settings-row__title')).slice(0,3).map(e=>{const c=getComputedStyle(e);return{txt:e.textContent.slice(0,12),fs:c.fontSize,fw:c.fontWeight,color:c.color};});
  const subs=[...sr.querySelectorAll('x-text')].filter(e=>(e.className||'').includes('settings-row__subtitle')).slice(0,2).map(e=>{const c=getComputedStyle(e);return{fs:c.fontSize,color:c.color};});
  const icons=[...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').includes('settings-row__icon--')).slice(0,3).map(e=>{const c=getComputedStyle(e);const b=e.getBoundingClientRect();return{cls:(e.className.match(/--(\\w+)/)||[])[1],bg:c.backgroundColor,w:Math.round(b.width),h:Math.round(b.height),radius:c.borderRadius};});
  const sectionHeaders=[...sr.querySelectorAll('x-text')].filter(e=>/settings-section__(title|header)/.test(e.className||'')).map(e=>{const c=getComputedStyle(e);return{txt:e.textContent.slice(0,14),fs:c.fontSize,fw:c.fontWeight,color:c.color};});
  const pageTitle=(sr.querySelector('.settings__title')||{}).textContent;
  const pageTitleStyle=sr.querySelector('.settings__title')?getComputedStyle(sr.querySelector('.settings__title')):null;
  return JSON.stringify({rowCount:rows.length,rowHeights:rowH,titles,subs,icons,sectionHeaders,pageTitle,pageTitleFs:pageTitleStyle?pageTitleStyle.fontSize:null,pageTitleFw:pageTitleStyle?pageTitleStyle.fontWeight:null},null,1);
})()`)
  console.log(r)
  await s.close(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
