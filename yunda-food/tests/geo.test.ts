import test from 'node:test'
import assert from 'node:assert/strict'
import {KUNMING_BOUNDS,KUNMING_CENTER,bd09ToGcj02,distanceKm,distanceLabel,gcj02ToBd09,gcj02ToWgs84,inKunming,isPoint,navigationLinks,parseLocationInput,toWgs84,wgs84ToGcj02} from '../src/domain/geo'

// 定位功能的底层约定：库里只存 WGS84，底图与导航按需换算，选点必须在昆明范围内。
const campus={latitude:25.0456,longitude:102.7123}

test('WGS84 与 GCJ-02 互转：偏移三百米量级，来回误差小于 2 米',()=>{
 const gcj=wgs84ToGcj02(campus.latitude,campus.longitude)
 // 昆明的偏移方向：纬度偏小、经度偏大，这是国内坐标加偏的典型结果。
 assert.ok(gcj.latitude<campus.latitude,'GCJ-02 纬度应比 WGS84 偏小')
 assert.ok(gcj.longitude>campus.longitude,'GCJ-02 经度应比 WGS84 偏大')
 assert.ok(distanceKm(campus,gcj)>0.3&&distanceKm(campus,gcj)<0.8,'高德偏移应在 300–800 米')
 const back=gcj02ToWgs84(gcj.latitude,gcj.longitude)
 assert.ok(distanceKm(campus,back)<0.002,'一次偏移逆算误差应小于 2 米')
 // 境外坐标不做偏移，OSM 与高德在那里本来就一致。
 const abroad=wgs84ToGcj02(48.8566,2.3522)
 assert.equal(abroad.latitude,48.8566)
 assert.equal(abroad.longitude,2.3522)
})
test('百度 BD-09 只在高德基础上再加偏移，能单向还原',()=>{
 const gcj=wgs84ToGcj02(campus.latitude,campus.longitude),bd=gcj02ToBd09(gcj.latitude,gcj.longitude)
 assert.ok(distanceKm(gcj,bd)>0.05,'BD-09 与 GCJ-02 应相差数十米以上')
 const back=bd09ToGcj02(bd.latitude,bd.longitude)
 assert.ok(distanceKm(gcj,back)<0.01)
})
test('服务范围只认昆明边界，坐标合法性与越界分开判断',()=>{
 assert.equal(inKunming(campus.latitude,campus.longitude),true)
 assert.equal(inKunming(KUNMING_CENTER.latitude,KUNMING_CENTER.longitude),true)
 assert.equal(inKunming(39.9042,116.4074),false,'北京不在服务范围')
 assert.equal(inKunming(Number.NaN,102.7),false)
 assert.equal(isPoint({latitude:25,longitude:102.7}),true)
 assert.equal(isPoint({latitude:25,longitude:Number.NaN}),false)
 assert.equal(isPoint(null),false)
 assert.ok(KUNMING_BOUNDS.minLatitude<25.0456&&KUNMING_BOUNDS.maxLatitude>25.0456)
})
test('距离与文案：米级取整、公里保留一位，跨城按整公里',()=>{
 assert.ok(Math.abs(distanceKm({latitude:25,longitude:102.7},{latitude:26,longitude:102.7})-111.195)<0.01,'1 度纬度约 111.2 公里')
 assert.equal(distanceKm(campus,campus),0)
 assert.equal(distanceLabel(0.62),'620 米')
 assert.equal(distanceLabel(0.004),'10 米','过近也给一个最小可读距离')
 assert.equal(distanceLabel(0.955),'960 米')
 assert.equal(distanceLabel(1.24),'1.2 公里')
 assert.equal(distanceLabel(12.6),'13 公里')
 assert.equal(distanceLabel(Number.POSITIVE_INFINITY),'')
})
test('导航链接按各家坐标系给坐标：高德腾讯 GCJ-02、百度 BD-09、苹果 WGS84',()=>{
 const links=navigationLinks(campus,'楠苑食堂','云南大学呈贡校区'),gcj=wgs84ToGcj02(campus.latitude,campus.longitude),bd=gcj02ToBd09(gcj.latitude,gcj.longitude)
 assert.match(links.amap,/^https:\/\/uri\.amap\.com\/marker\?position=102\.713742,25\.042628&name=.+&coordinate=gaode/)
 assert.match(links.tencent,/coord:25\.042628,102\.713742;title:/)
 assert.ok(links.tencent.includes('addr:'),'腾讯链接在有地址时带 addr')
 assert.ok(links.apple.includes('ll=25.045600,102.712300'),'苹果地图用原始 WGS84')
 assert.ok(links.baidu.includes('location='+bd.latitude.toFixed(6)+','+bd.longitude.toFixed(6)))
 assert.ok(links.baidu.includes('coord_type=bd09ll'))
 assert.equal(links.coordinate,'25.04263, 102.71374','复制给高德的坐标是 GCJ-02 的“纬度, 经度”')
 // 名称里的特殊字符不能把链接截断。
 const risky=navigationLinks(campus,'A&B 食堂 #1','')
 assert.ok(!/name=A&B/.test(risky.amap))
 assert.ok(risky.amap.includes('%26'))
})
test('粘贴高德/腾讯/百度分享链接都能还原 WGS84 选点',()=>{
 const amap=parseLocationInput('https://uri.amap.com/marker?position=102.71688,25.05021&name=%E6%A5%A0%E8%8B%91%E9%A3%9F%E5%A0%82&coordinate=gaode')
 assert.deepEqual(amap,{latitude:25.05021,longitude:102.71688,system:'gcj02',name:'楠苑食堂'})
 const tencent=parseLocationInput('https://apis.map.qq.com/uri/v1/marker?marker=coord:25.05021,102.71688;title:%E6%A5%A0%E8%8B%91')
 assert.equal(tencent?.latitude,25.05021)
 assert.equal(tencent?.system,'gcj02')
 assert.equal(tencent?.name,'楠苑','腾讯的 ;title: 也要认出来')
 const baidu=parseLocationInput('https://api.map.baidu.com/marker?location=25.0551,102.7231&title=%E6%A5%A0%E8%8B%91&coord_type=bd09ll')
 assert.equal(baidu?.system,'bd09')
 assert.equal(baidu?.latitude,25.0551)
 const apple=parseLocationInput('https://maps.apple.com/?ll=25.0456,102.7123&q=cafe')
 assert.equal(apple?.system,'wgs84')
 // 落到 WGS84 后才有统一口径。
 const wgs=toWgs84({latitude:amap!.latitude,longitude:amap!.longitude},amap!.system)
 assert.ok(distanceKm(wgs,campus)<1.5)
})
test('纯数字坐标两种顺序都认，非昆明与乱码一律拒绝',()=>{
 const latLng=parseLocationInput('25.0456, 102.7123'),lngLat=parseLocationInput('102.7123 25.0456')
 assert.equal(latLng?.latitude,25.0456)
 assert.equal(latLng?.longitude,102.7123)
 assert.equal(lngLat?.latitude,25.0456,'经度在前也要能自动换回来')
 assert.equal(latLng?.system,'gcj02')
 assert.equal(parseLocationInput('latitude=25.0456 longitude=102.7123')?.system,'gcj02')
 assert.equal(parseLocationInput('39.9042,116.4074'),null,'北京不在昆明，不能当成本地点')
 assert.equal(parseLocationInput('hello'),null)
 assert.equal(parseLocationInput(''),null)
 assert.equal(parseLocationInput('   '),null)
})
