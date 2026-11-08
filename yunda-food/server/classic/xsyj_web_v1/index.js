const cloudbase=require('@cloudbase/node-sdk')
const app=cloudbase.init({env:cloudbase.SYMBOL_CURRENT_ENV})
const native=require('./native/food/index')
const cautions=require('./native/cautions')(native.dependencies)
const service=require('./service.cjs')({dispatch:native.dispatch,dependencies:{...native.dependencies,mediaUrl:async file=>{const result=await app.getTempFileURL({fileList:[file]});const row=result.fileList?.[0];if(!row?.tempFileURL)throw Error('Photo unavailable');return row.tempFileURL}},cautions})
exports.main=async event=>{
 try{
  const caller=app.auth().getUserInfo()
  return {ok:true,data:await service({uid:caller.uid,isAnonymous:caller.isAnonymous},event.action,event.payload||{})}
 }catch(e){console.error('xsyj-error-code:',String(e.code||'REJECTED').slice(0,60));const at=String(e.stack||'').match(/(?:service\.cjs|native\/[^\s:]+):\d+:\d+/)?.[0];if(at)console.error('xsyj-error-location:',at);return {ok:false,message:e.publicMessage||'服务暂时未能完成操作，请保留输入并重试。'}}
}
