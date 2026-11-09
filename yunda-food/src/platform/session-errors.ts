export function checkSessionError(error:undefined|null|{code?:string,message?:string}){
 if(!error)return
 const description=(error.code||'')+' '+(error.message||'')
 if(/invalid_refresh_token|refresh_token_expired|user_not_found|invalid_grant|refresh.{0,20}(expired|invalid)|刷新.{0,12}(过期|失效)/i.test(description))throw Error('登录状态已过期，请重新登录。')
 throw Error(error.message||'暂时无法恢复登录，请检查网络后重试。')
}
