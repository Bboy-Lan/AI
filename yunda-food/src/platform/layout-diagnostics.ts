// Development-only geometry reports let us inspect the user's actual viewport.
export function startLayoutDiagnostics() {
  if (!import.meta.env.DEV) return
  const client = sessionStorage.getItem('layout-client') || crypto.randomUUID()
  sessionStorage.setItem('layout-client', client)
  const report = () => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const r = element.getBoundingClientRect(), style = getComputedStyle(element)
      return {x:r.x,y:r.y,width:r.width,height:r.height,position:style.position,transform:style.transform,zoom:style.zoom}
    }
    void fetch('/__layout-report', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      client, revision:'web-layout-20261105-2', path:location.hash.split('?')[0],
      viewport:{width:innerWidth,height:innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,screenWidth:screen.width,screenHeight:screen.height,visualWidth:visualViewport?.width,visualOffset:visualViewport?.offsetLeft,visualScale:visualViewport?.scale},
      scrollWidth:document.documentElement.scrollWidth,scrollX,
      html:rect('html'),body:rect('body'),root:rect('#root'),frame:rect('.app-frame'),tab:rect('.tabbar'),fab:rect('.publish-fab')
    })}).catch(()=>{})
  }
  let timer:ReturnType<typeof setTimeout>
  const schedule = () => {clearTimeout(timer);timer=setTimeout(report,250)}
  addEventListener('resize',schedule);addEventListener('hashchange',schedule)
  visualViewport?.addEventListener('resize',schedule)
  document.addEventListener('visibilitychange',schedule)
  schedule()
}
