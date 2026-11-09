import type {Food} from '../services/local-repository'
import {chinaDay} from './discovery'

export function profileRequiredError(value:{name:string,avatar:string,province:string,city:string}){
 if(value.name.trim().length<2||value.name.trim().length>20)return '请填写2～20字的昵称。'
 if(!value.avatar)return '请选择并上传头像。'
 if(!value.province||!value.city)return '请选择完整的家乡省份和城市。'
 return ''
}

export function foodRequiredError(value:Partial<Food>){
 if(!value.name?.trim())return '请填写食物 / 饮品名称。'
 if(!['正餐','小吃','饮品','甜品'].includes(value.category||''))return '请选择类别。'
 if(!['inside','outside'].includes(value.locationType||''))return '请选择高校内或高校外。'
 if(!(value.venue||value.placeText)?.trim())return '请填写具体的食堂、窗口或街道摊位。'
 if(value.price==null||!Number.isFinite(Number(value.price))||!Number.isInteger(Number(value.price))||Number(value.price)<1||Number(value.price)>999)return '请填写1～999元的整数价格。'
 if(!['portion','person'].includes(value.priceBasis||''))return '请选择单份价格或人均价格。'
 const drink=['饮品','甜品'].includes(value.category||''),level=drink?value.taste?.sweet:value.taste?.spicy
 if(level==null||!Number.isInteger(level)||level<0||level>3)return '请选择这份'+(drink?'饮品 / 甜品的甜度。':'食物的辣度。')
 if(value.authorAte!==true)return '请确认你已亲自吃过这份推荐。'
 return ''
}

export function cautionRequiredError(value:{name?:string,address?:string,date?:string,body?:string,tags?:string[],confirmed?:boolean}){
 if(!value.name?.trim())return '请填写店铺名称。'
 if((value.address?.trim().length||0)<2)return '请填写至少2字的具体地点。'
 const date=value.date||'',parsed=new Date(date)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||date>chinaDay())return '请选择有效消费日期，不能晚于今天。'
 if(!value.tags?.length||value.tags.length>3||value.tags.some(v=>!['味道','食材','价格','服务','卫生','其他'].includes(v)))return '请选择1～3项具体问题。'
 if((value.body?.trim().length||0)<10||(value.body?.trim().length||0)>1000)return '请填写10～1000字的具体经历。'
 if(value.confirmed!==true)return '请确认本人亲自消费并如实描述。'
 return ''
}
