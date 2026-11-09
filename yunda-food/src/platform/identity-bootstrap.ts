export async function restoreIdentity<T,S>(session:()=>Promise<S|null>,context:()=>Promise<T>,guest:T):Promise<T>{
 // A registration screen must not depend on anonymous sign-in or a database request.
 if(!await session())return guest
 return context()
}
