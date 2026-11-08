// Coalesce refreshes; an invalidation during a read must cause a subsequent read.
export function createRefreshGate(run:()=>Promise<void>,now:()=>number=Date.now){
 let pending:Promise<void>|undefined,lastSuccess=0,valid=false,generation=0,loadedGeneration=-1
 const gate={
  invalidate(){generation++},
  load(maxAge=0):Promise<void>{
   if(pending)return pending.then(()=>loadedGeneration===generation?undefined:gate.load())
   if(valid&&loadedGeneration===generation&&maxAge>0&&now()-lastSuccess<maxAge)return Promise.resolve()
   const started=generation
   pending=run().then(()=>{valid=true;lastSuccess=now();loadedGeneration=started}).finally(()=>{pending=undefined})
   return pending
  }
 }
 return gate
}
