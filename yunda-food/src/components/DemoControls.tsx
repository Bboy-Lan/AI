import {DEMO_CASES} from '../demo/fixtures'
import {demoCase,demoActor,demoUrl,exitDemo} from '../demo/mode'
export function DemoControls(){
 if(!demoCase)return null
 const current=DEMO_CASES.find(c=>c.id===demoCase)!
 const reset=()=>{localStorage.removeItem('xsyj-demo:v1:'+demoCase);for(const key of Object.keys(localStorage))if(key.startsWith('xsyj-draft:'+demoActor+':')||key.startsWith('xsyj-caution-draft:'+demoActor+':')||key==='xsyj-preferences:'+demoActor||key==='xiaoshiyunji-web:blindbox-budget:'+demoActor)localStorage.removeItem(key);location.reload()}
 return <details className="demo-controls"><summary>演示案例 · {current.name}<span>仅本机保存</span></summary><p>{current.description}。以下内容均为虚构示例；收藏、发布、回复和审核只改变本组演示数据。</p><nav aria-label="切换演示案例">{DEMO_CASES.map(item=><a href={demoUrl(item.id)} aria-current={demoCase===item.id?'page':undefined} key={item.id}>{item.name}</a>)}</nav><div><button type="button" onClick={reset}>重置本组案例</button><button type="button" onClick={exitDemo}>退出演示</button></div></details>
}
