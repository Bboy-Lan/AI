// Work in cents so a one-yuan step preserves manually entered decimals.
export function stepPrice(value:number|undefined,direction:1|-1):number|undefined{
 if(value==null||!Number.isFinite(value))return direction===1?1:undefined
 const next=Math.round(value*100)+direction*100
 return next<1||next>99999?value:next/100
}
