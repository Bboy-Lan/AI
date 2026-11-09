// Legacy decimal amounts are rounded for presentation; new writes must be whole yuan.
export function integerPrice(value:number|undefined):number|undefined{return value==null||!Number.isFinite(value)?undefined:Math.min(999,Math.max(1,Math.round(value)))}
export function stepPrice(value:number|undefined,direction:1|-1):number|undefined{
 if(value==null||!Number.isFinite(value))return direction===1?1:undefined
 return Math.min(999,Math.max(1,integerPrice(value)!+direction))
}
