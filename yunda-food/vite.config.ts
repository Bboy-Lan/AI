import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const base=process.env.VITE_BASE_PATH||'/'
let assetBase='/'
export default defineConfig({
  base,
  plugins: [react(), {
    name:'public-assets-for-subpath',
    configResolved(config){assetBase=config.base},
    renderChunk(code){return assetBase==='/'?null:{code:code.replace(/(["'`])\/assets\//g,(_match,quote)=>quote+assetBase+'assets/'),map:null}}
  }, {
    name:'local-layout-diagnostics',
    configureServer(server) {
      const reports = new Map<string,unknown>()
      server.middlewares.use('/__layout-report', (req,res) => {
        if(req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify([...reports.values()]));return}
        if(req.method!=='POST'){res.statusCode=405;res.end();return}
        let body=''
        req.on('data', chunk=>{body+=chunk;if(body.length>16000)req.destroy()})
        req.on('end',()=>{try{const report=JSON.parse(body);if(typeof report.client!=='string')throw Error();reports.set(report.client,{...report,receivedAt:new Date().toISOString()});if(reports.size>20)reports.delete(reports.keys().next().value!);res.end('ok')}catch{res.statusCode=400;res.end()}})
      })
    }
  }],
  server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:8787'}}
})
