// Deterministic transactional store for exercising the real server modules offline.
export function memoryDb(){
 let tables=new Map<string,Map<string,any>>(),serial=Promise.resolve(),counter=0
 const copy=(v:any)=>structuredClone(v)
 const table=(name:string)=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name)!}
 const matches=(row:any,where:any)=>Object.entries(where).every(([key,value]:any)=>{
  const actual=row[key]
  if(value&&typeof value==='object'&&value.op){if(value.op==='lt')return actual<value.value;if(value.op==='gt')return actual>value.value;if(value.op==='neq')return actual!==value.value;if(value.op==='in')return value.value.includes(actual)}
  return Array.isArray(actual)?actual.includes(value):actual===value
 })
 function collection(name:string){
  const query=(where:any={},orders:any[]=[],size=100,offset=0):any=>({
   where:(filter:any)=>query({...where,...filter},orders,size,offset),orderBy:(key:string,dir:string)=>query(where,[...orders,[key,dir]],size,offset),limit:(n:number)=>query(where,orders,n,offset),skip:(n:number)=>query(where,orders,size,n),
   get:async()=>{const rows=[...table(name).values()].filter(row=>matches(row,where));rows.sort((a,b)=>{for(const[key,dir]of orders){const av=a[key] instanceof Date?a[key].getTime():a[key],bv=b[key] instanceof Date?b[key].getTime():b[key];if(av!==bv)return (av<bv?-1:1)*(dir==='desc'?-1:1)}return 0});return {data:copy(rows.slice(offset,offset+size))}},
   count:async()=>({total:[...table(name).values()].filter(row=>matches(row,where)).length}),
   update:async({data}:any)=>{let updated=0;for(const row of table(name).values())if(matches(row,where)){Object.assign(row,copy(data));updated++}return {stats:{updated}}},
   doc:(id:string)=>({get:async()=>{const row=table(name).get(id);if(!row)throw Error('DOCUMENT_NOT_FOUND');return {data:copy(row)}},set:async({data}:any)=>{if(Object.hasOwn(data,'_id'))throw Error('INVALID_PARAM: immutable _id');table(name).set(id,{...copy(data),_id:id});return {id}},update:async({data}:any)=>{const row=table(name).get(id);if(!row)throw Error('DOCUMENT_NOT_FOUND');Object.assign(row,copy(data));return {stats:{updated:1}}},remove:async()=>{table(name).delete(id);return {}}}),
   add:async({data}:any)=>{const id=data._id||'memory-'+(++counter);table(name).set(id,{...copy(data),_id:id});return {_id:id}}
  })
  return query()
 }
 const db:any={collection,command:{lt:(value:any)=>({op:'lt',value}),gt:(value:any)=>({op:'gt',value}),neq:(value:any)=>({op:'neq',value}),in:(value:any)=>({op:'in',value})},serverDate:()=>new Date('2026-11-08T08:00:00Z'),
  runTransaction:(fn:any)=>{const run=serial.then(async()=>{const saved=copy(tables);try{return await fn(db)}catch(error){tables=saved;throw error}});serial=run.then(()=>{},()=>{});return run}}
 return {db,rows:(name:string)=>copy([...table(name).values()]),seed:(name:string,rows:any[])=>{for(const row of rows)table(name).set(row._id,copy(row))}}
}
