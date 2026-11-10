// 定位与坐标系：浏览器/OSM 给的是 WGS84，高德腾讯用 GCJ-02，百度用 BD-09。
// 数据库统一存 WGS84，只在显示底图与跳转导航时换算，避免两套坐标混写。
export type GeoPoint={latitude:number,longitude:number}
export type CoordSystem='wgs84'|'gcj02'|'bd09'
export const KUNMING_BOUNDS={minLatitude:24.35,maxLatitude:26.45,minLongitude:102.1,maxLongitude:103.75}
export const KUNMING_CENTER:GeoPoint={latitude:25.04,longitude:102.71}

const PI=Math.PI,RADIUS=6371
const A=6378245.0,EE=0.00669342162296594323
const toRad=(value:number)=>value*PI/180

export function isPoint(value:Partial<GeoPoint>|null|undefined):value is GeoPoint{
 return !!value&&Number.isFinite(Number(value.latitude))&&Number.isFinite(Number(value.longitude))&&Math.abs(Number(value.latitude))<=90&&Math.abs(Number(value.longitude))<=180
}
export function inKunming(latitude:number,longitude:number){
 return Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=KUNMING_BOUNDS.minLatitude&&latitude<=KUNMING_BOUNDS.maxLatitude&&longitude>=KUNMING_BOUNDS.minLongitude&&longitude<=KUNMING_BOUNDS.maxLongitude
}
const outsideChina=(latitude:number,longitude:number)=>longitude<72.004||longitude>137.8347||latitude<0.8293||latitude>55.8271

function transformLatitude(x:number,y:number){
 let value=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x))
 value+=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3
 value+=(20*Math.sin(y*PI)+40*Math.sin(y/3*PI))*2/3
 value+=(160*Math.sin(y/12*PI)+320*Math.sin(y*PI/30))*2/3
 return value
}
function transformLongitude(x:number,y:number){
 let value=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x))
 value+=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3
 value+=(20*Math.sin(x*PI)+40*Math.sin(x/3*PI))*2/3
 value+=(150*Math.sin(x/12*PI)+300*Math.sin(x/30*PI))*2/3
 return value
}
function offset(latitude:number,longitude:number){
 if(outsideChina(latitude,longitude))return {latitude:0,longitude:0}
 let deltaLatitude=transformLatitude(longitude-105,latitude-35),deltaLongitude=transformLongitude(longitude-105,latitude-35)
 const radian=latitude/180*PI
 let magic=Math.sin(radian);magic=1-EE*magic*magic
 const root=Math.sqrt(magic)
 deltaLatitude=deltaLatitude*180/((A*(1-EE))/(magic*root)*PI)
 deltaLongitude=deltaLongitude*180/(A/root*Math.cos(radian)*PI)
 return {latitude:deltaLatitude,longitude:deltaLongitude}
}
export function wgs84ToGcj02(latitude:number,longitude:number):GeoPoint{
 const delta=offset(latitude,longitude)
 return {latitude:latitude+delta.latitude,longitude:longitude+delta.longitude}
}
// 逆算用同一点的一次偏移近似，误差在 0.5 米量级，足够选点与导航。
export function gcj02ToWgs84(latitude:number,longitude:number):GeoPoint{
 const delta=offset(latitude,longitude)
 return {latitude:latitude-delta.latitude,longitude:longitude-delta.longitude}
}
export function gcj02ToBd09(latitude:number,longitude:number):GeoPoint{
 const x=longitude,y=latitude,z=Math.sqrt(x*x+y*y)+0.00002*Math.sin(y*PI*3000/180)
 const theta=Math.atan2(y,x)+0.000003*Math.cos(x*PI*3000/180)
 return {latitude:z*Math.sin(theta)+0.006,longitude:z*Math.cos(theta)+0.0065}
}
export function bd09ToGcj02(latitude:number,longitude:number):GeoPoint{
 const x=longitude-0.0065,y=latitude-0.006,z=Math.sqrt(x*x+y*y)-0.00002*Math.sin(y*PI*3000/180)
 const theta=Math.atan2(y,x)-0.000003*Math.cos(x*PI*3000/180)
 return {latitude:z*Math.sin(theta),longitude:z*Math.cos(theta)}
}
export function toWgs84(point:GeoPoint,system:CoordSystem):GeoPoint{
 if(system==='gcj02')return gcj02ToWgs84(point.latitude,point.longitude)
 if(system==='bd09'){const gcj=bd09ToGcj02(point.latitude,point.longitude);return gcj02ToWgs84(gcj.latitude,gcj.longitude)}
 return {latitude:point.latitude,longitude:point.longitude}
}
export const toGcj02=(point:GeoPoint)=>wgs84ToGcj02(point.latitude,point.longitude)
// 百度是 GCJ-02 再叠一层偏移，不能拿 WGS84 直接套 BD-09 公式。
export const toBd09=(point:GeoPoint)=>{const gcj=wgs84ToGcj02(point.latitude,point.longitude);return gcj02ToBd09(gcj.latitude,gcj.longitude)}

export function distanceKm(from:GeoPoint,to:GeoPoint){
 const deltaLatitude=toRad(to.latitude-from.latitude),deltaLongitude=toRad(to.longitude-from.longitude)
 const a=Math.sin(deltaLatitude/2)**2+Math.cos(toRad(from.latitude))*Math.cos(toRad(to.latitude))*Math.sin(deltaLongitude/2)**2
 return RADIUS*2*Math.asin(Math.min(1,Math.sqrt(a)))
}
export function distanceLabel(km:number){
 if(!Number.isFinite(km))return ''
 if(km<1)return Math.max(10,Math.round(km*1000/10)*10)+' 米'
 return km<10?km.toFixed(1)+' 公里':Math.round(km)+' 公里'
}

// 导航只带坐标与名称：高德/腾讯要 GCJ-02，百度要 BD-09，苹果与系统地图要 WGS84。
export function navigationLinks(point:GeoPoint,name:string,address=''){
 const gcj=toGcj02(point),bd=toBd09(point)
 const title=encodeURIComponent(name||'美食地点'),detail=encodeURIComponent(address||'')
 const lat=point.latitude.toFixed(6),lng=point.longitude.toFixed(6)
 return {
  amap:`https://uri.amap.com/marker?position=${gcj.longitude.toFixed(6)},${gcj.latitude.toFixed(6)}&name=${title}&coordinate=gaode&callnative=1&src=xiaoshiyunji`,
  tencent:`https://apis.map.qq.com/uri/v1/marker?marker=coord:${gcj.latitude.toFixed(6)},${gcj.longitude.toFixed(6)};title:${title}${address?';addr:'+detail:''}&referer=xiaoshiyunji`,
  apple:`https://maps.apple.com/?ll=${lat},${lng}&q=${title}`,
  baidu:`https://api.map.baidu.com/marker?location=${bd.latitude.toFixed(6)},${bd.longitude.toFixed(6)}&title=${title}${address?'&content='+detail:''}&coord_type=bd09ll&output=html&src=webapp.xiaoshiyunji`,
  coordinate:`${gcj.latitude.toFixed(5)}, ${gcj.longitude.toFixed(5)}`,
 }
}

const pairIn=(text:string,pattern:RegExp)=>{const matched=text.match(pattern);return matched?{first:Number(matched[1]),second:Number(matched[2])}:null}
const plausible=(point:GeoPoint)=>isPoint(point)&&inKunming(point.latitude,point.longitude)

// 粘贴回来的位置可能是高德/腾讯/百度的分享链接，也可能只是“25.04,102.71”。
export function parseLocationInput(input:string):{latitude:number,longitude:number,system:CoordSystem,name:string}|null{
 const text=String(input||'').trim()
 if(!text)return null
 const url=(text.match(/https?:\/\/[^\s"'<>]+/)||[])[0]||''
 // 高德：position=经度,纬度；腾讯：marker=coord:纬度,经度；百度：location=纬度,经度
 const amap=pairIn(url,/[?&]position=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
 if(amap&&plausible({latitude:amap.second,longitude:amap.first}))return {latitude:amap.second,longitude:amap.first,system:'gcj02',name:decode(url,'name')}
 const tencent=pairIn(url,/coord:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
 if(tencent&&plausible({latitude:tencent.first,longitude:tencent.second}))return {latitude:tencent.first,longitude:tencent.second,system:'gcj02',name:decode(url,'title')}
 const baidu=pairIn(url,/[?&]location=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
 if(baidu&&plausible({latitude:baidu.first,longitude:baidu.second}))return {latitude:baidu.first,longitude:baidu.second,system:'bd09',name:decode(url,'title')}
 const apple=pairIn(url,/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
 if(apple&&plausible({latitude:apple.first,longitude:apple.second}))return {latitude:apple.first,longitude:apple.second,system:'wgs84',name:decode(url,'q')}
 const geo=pairIn(url,/(?:@|geo:)(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
 if(geo&&plausible({latitude:geo.first,longitude:geo.second}))return {latitude:geo.first,longitude:geo.second,system:'wgs84',name:''}
 const named=pairIn(text,/(?:latitude|lat|纬度)\s*[=:：]?\s*(-?\d+(?:\.\d+)?)[\s,，;&]+(?:longitude|lng|lon|经度)\s*[=:：]?\s*(-?\d+(?:\.\d+)?)/i)
 if(named&&plausible({latitude:named.first,longitude:named.second}))return {latitude:named.first,longitude:named.second,system:/wgs|gps/i.test(text)?'wgs84':'gcj02',name:''}
 const bare=pairIn(text,/(-?\d{2,3}(?:\.\d+)?)\s*[,，\s]\s*(-?\d{2,3}(?:\.\d+)?)/)
 if(bare){
  const asLatLng={latitude:bare.first,longitude:bare.second},asLngLat={latitude:bare.second,longitude:bare.first}
  const point=plausible(asLatLng)?asLatLng:plausible(asLngLat)?asLngLat:null
  if(point)return {...point,system:/wgs|gps/i.test(text)?'wgs84':'gcj02',name:''}
 }
 return null
}
function decode(url:string,key:string){
 // 高德/百度用 key=值，腾讯的 marker 串用 ;title:值，两种都吃。
 const matched=url.match(new RegExp('[?&;]'+key+'[=:]([^&;]+)'))
 if(!matched)return ''
 try{return decodeURIComponent(matched[1]).slice(0,80)}catch{return ''}
}
