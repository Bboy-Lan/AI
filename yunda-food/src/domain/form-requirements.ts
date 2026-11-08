import type {Food} from '../services/local-repository'

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
 if(value.price==null||!Number.isFinite(Number(value.price))||Number(value.price)<=0||Number(value.price)>=1000)return '请填写0.01～999.99元的有效价格。'
 if(!['portion','person'].includes(value.priceBasis||''))return '请选择单份价格或人均价格。'
 const drink=['饮品','甜品'].includes(value.category||''),level=drink?value.taste?.sweet:value.taste?.spicy
 if(level==null||!Number.isInteger(level)||level<0||level>3)return '请选择这份'+(drink?'饮品 / 甜品的甜度。':'食物的辣度。')
 if(value.authorAte!==true)return '请确认你已亲自吃过这份推荐。'
 return ''
}
