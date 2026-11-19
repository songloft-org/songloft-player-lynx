import { readLynxGlobal } from '../native/native-modules.js'

// Browser-only source executed by CEF. No Node objects or desktop RPC token
// enter the document. Its messages still pass the existing Songloft dispatcher.
export const DESKTOP_CEF_BRIDGE = `(function(){
  window.LynxWebViewBridge={onMessageReceived:function(json){
    if(typeof json!=='string')return;
    if(typeof window.cefQuery==='function')window.cefQuery({request:'LyNxSig_'+json});
    else window.postMessage(json,'*');
  }};
  var visible=true, serial=0, pending=new Map();
  var timeout=window.setTimeout.bind(window), clear=window.clearTimeout.bind(window);
  var interval=window.setInterval.bind(window);
  window.__songloftSetVisible=function(value){
    visible=!!value;
    document.dispatchEvent(new Event('visibilitychange'));
    if(visible){var ready=Array.from(pending.values()).filter(function(task){return task.due});ready.forEach(function(task){pending.delete(task.id);task.run()})}
  };
  Object.defineProperty(document,'hidden',{configurable:true,get:function(){return !visible}});
  Object.defineProperty(document,'visibilityState',{configurable:true,get:function(){return visible?'visible':'hidden'}});
  window.setInterval=function(fn,ms){var args=Array.prototype.slice.call(arguments,2);return interval(function(){if(visible){if(typeof fn==='function')fn.apply(window,args);else (0,eval)(String(fn))}},ms)};
  window.setTimeout=function(fn,ms){
    var args=Array.prototype.slice.call(arguments,2), id=++serial;
    var task={id:id,due:false,run:function(){if(typeof fn==='function')fn.apply(window,args);else (0,eval)(String(fn))}};
    task.native=timeout(function(){if(visible){pending.delete(id);task.run()}else task.due=true},ms);
    pending.set(id,task);return -id;
  };
  window.clearTimeout=function(id){if(id<0){var task=pending.get(-id);if(task){clear(task.native);pending.delete(-id)}}else clear(id)};
  window.clearInterval=window.clearTimeout;
})()`

export function desktopCefInit(entryUrl: string): string {
  const base = entryUrl.split('?')[0]!
  return `(function(){
    var base=${JSON.stringify(base)};
    if(window.__songloftDesktopInitialized||!location.href.startsWith(base))return;
    window.__songloftDesktopInitialized=true;
    ${DESKTOP_CEF_BRIDGE};
    document.addEventListener('click',function(event){
    var link=event.target&&event.target.closest&&event.target.closest('a[href]');
    if(!link)return;var url=new URL(link.href,location.href);
    if((url.protocol==='http:'||url.protocol==='https:'||url.protocol==='mailto:')&&!(url.href===base.slice(0,-1)||url.href.startsWith(base))){
      event.preventDefault();window.LynxWebViewBridge.onMessageReceived(JSON.stringify({type:'songloft-desktop-external',url:url.href}));
    }
  },true);})();`
}

export function desktopCookies(url: string): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      reject(new Error('cookies_timeout'))
    }, 5000)
    try {
      readLynxGlobal()
        ?.createSelectorQuery()
        .select('#desktop-cookie-host')
        .invoke({
          method: 'cookies.get',
          params: { url },
          success: (cookies: Array<{ name: string; value: string }>) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            const values: Record<string, string> = Object.create(null)
            for (const cookie of cookies)
              if (
                typeof cookie.name === 'string' &&
                typeof cookie.value === 'string'
              )
                values[cookie.name] = cookie.value
            resolve(values)
          },
          fail: () => {
            if (!settled) {
              settled = true
              clearTimeout(timer)
              reject(new Error('cookies_unavailable'))
            }
          },
        })
        .exec()
    } catch (error) {
      settled = true
      clearTimeout(timer)
      reject(error)
    }
  })
}
