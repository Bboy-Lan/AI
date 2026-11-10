import {useEffect,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {KUNMING_BOUNDS,KUNMING_CENTER,distanceKm,distanceLabel,gcj02ToWgs84,inKunming,isPoint,parseLocationInput,toGcj02,toWgs84,type GeoPoint} from '../domain/geo'
export type MapPoint={latitude:number,longitude:number,mapName:string,locationAddress?:string}
type Basemap='amap'|'osm'
const TILES:Record<Basemap,{url:string,attribution:string,subdomains?:string}>={
 // 国内直连更稳、中文地名；底图是 GCJ-02，显示时换算，写库仍用 WGS84。
 amap:{url:'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',attribution:'© 高德地图',subdomains:'1234'},
 osm:{url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© OpenStreetMap'},
}
export function MapPicker({initial,onSave,onClose}:{initial?:Partial<MapPoint>,onSave:(point:MapPoint)=>void,onClose:()=>void}){
 const start:GeoPoint=isPoint({latitude:initial?.latitude,longitude:initial?.longitude})?{latitude:Number(initial?.latitude),longitude:Number(initial?.longitude)}:KUNMING_CENTER
 const [point,setPoint]=useState<GeoPoint>(start),[picked,setPicked]=useState(initial?.latitude!=null&&initial?.longitude!=null),[name,setName]=useState(initial?.mapName||'')
 const [basemap,setBasemap]=useState<Basemap>('amap'),[tilesFailed,setTilesFailed]=useState(false),[accuracy,setAccuracy]=useState<number|null>(null)
 const [paste,setPaste]=useState(''),[pasteNotice,setPasteNotice]=useState(''),[locating,setLocating]=useState(false),[error,setError]=useState('')
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.TileLayer|null>(null),marker=useRef<L.Marker|null>(null),mode=useRef<Basemap>('amap')
 // 弹窗卸载后仍可能有动画帧或事件回来，用 alive 挡住对已销毁地图的操作。
 const alive=useRef(true)
 const show=(value:GeoPoint,base:Basemap)=>base==='amap'?toGcj02(value):value
 const toPoint=(latitude:number,longitude:number,base:Basemap):GeoPoint=>base==='amap'?gcj02ToWgs84(latitude,longitude):{latitude,longitude}
 const place=(next:GeoPoint,pinName?:string)=>{
  setPoint(next);setPicked(true)
  if(pinName)setName(pinName)
  const center=show(next,basemap)
  map.current?.setView([center.latitude,center.longitude],17,{animate:false})
 }
 // 地图只建一次；底图切换和红点回写各自独立，避免重复初始化 Leaflet。
 useEffect(()=>{
  if(!container.current)return
  alive.current=true
  const view=L.map(container.current,{zoomControl:true,attributionControl:true}).setView([start.latitude,start.longitude],14,{animate:false})
  map.current=view
  view.on('click',(event:L.LeafletMouseEvent)=>{if(!alive.current)return;const next=toPoint(event.latlng.lat,event.latlng.lng,mode.current);setPoint(next);setPicked(true)})
  // 卸载时先停掉缩放/平移动画，否则 Leaflet 的动画帧还会去碰已经移除的图层。
  return()=>{alive.current=false;view.stop();view.off();view.remove();map.current=null;layer.current=null;marker.current=null}
 },[])
 useEffect(()=>{
  if(!map.current||!alive.current)return
  mode.current=basemap
  layer.current?.remove()
  const config=TILES[basemap]
  const tiles=L.tileLayer(config.url,{maxZoom:18,attribution:config.attribution,...(config.subdomains?{subdomains:config.subdomains}:{})}).addTo(map.current)
  let failures=0
  tiles.on('tileerror',()=>{
   failures+=1
   if(failures<4)return
   if(basemap==='amap'){setTilesFailed(false);setBasemap('osm');return}
   setTilesFailed(true)
  })
  if(basemap==='osm')tiles.on('tileload',()=>setTilesFailed(false))
  layer.current=tiles
  const center=show(point,mode.current)
  map.current.setView([center.latitude,center.longitude],map.current.getZoom()||14,{animate:false})
 },[basemap])
 useEffect(()=>{
  if(!map.current||!alive.current)return
  // 没选点就不落红点，避免“尚未选点”却已经有个点的错觉。
  if(!picked){marker.current?.remove();marker.current=null;return}
  const center=show(point,basemap)
  if(!marker.current){
   marker.current=L.marker([center.latitude,center.longitude],{draggable:true,icon:L.divIcon({className:'map-pin',html:'<span></span>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map.current)
   marker.current.on('dragend',()=>{if(!alive.current)return;const position=marker.current?.getLatLng();if(!position)return;setPoint(toPoint(position.lat,position.lng,mode.current));setPicked(true)})
  }else if(alive.current)marker.current.setLatLng([center.latitude,center.longitude])
 },[point,basemap,picked])
 const locate=()=>{
  if(!navigator.geolocation){setError('这个浏览器没有定位能力，可以粘贴位置或直接点地图选点。');return}
  setLocating(true);setError('')
  navigator.geolocation.getCurrentPosition(position=>{
   setLocating(false)
   setAccuracy(Number.isFinite(position.coords.accuracy)?position.coords.accuracy:null)
   const next={latitude:position.coords.latitude,longitude:position.coords.longitude}
   if(!inKunming(next.latitude,next.longitude))setError('当前位置不在昆明服务范围，仍可在地图上手动选点或粘贴位置。')
   place(next)
  },failure=>{
   setLocating(false)
   setError(/denied|permission/i.test(failure.message||'')?'浏览器没有允许定位。可在地址栏的站点设置里允许定位，或直接粘贴位置。':'没取得定位（信号弱或未授权）。可以粘贴位置，或点地图选点。')
  },{enableHighAccuracy:true,timeout:12000,maximumAge:0})
 }
 const applyPaste=()=>{
  const parsed=parseLocationInput(paste)
  if(!parsed){setPasteNotice('没有认出坐标。可以粘贴高德/腾讯的分享链接，或“25.0456,102.7123”这样的数字。');return}
  const next=toWgs84({latitude:parsed.latitude,longitude:parsed.longitude},parsed.system)
  if(!inKunming(next.latitude,next.longitude)){setPasteNotice('解析出的位置不在昆明服务范围，请核对后再试。');return}
  place(next,parsed.name||undefined)
  setPasteNotice('已按粘贴的位置更新选点，请核对地图上的红点。')
 }
 const valid=picked&&inKunming(point.latitude,point.longitude)
 const shown=show(point,basemap)
 return <div className="map-picker-overlay" role="dialog" aria-modal="true" aria-label="选择地图位置"><section className="map-picker-card"><div className="announcement-heading"><h2>选择地图位置</h2><button aria-label="关闭地图" onClick={onClose}>×</button></div>
  <div className="map-tools"><button type="button" className="chip" disabled={locating} onClick={locate}>{locating?'正在定位…':'◎ 用我的位置'}</button><button type="button" className="chip" onClick={()=>setBasemap(basemap==='amap'?'osm':'amap')}>底图 · {basemap==='amap'?'高德':'OSM'}</button></div>
  <div ref={container} className="map-picker-canvas"/>
  {tilesFailed?<p className="notice">底图没加载出来，可以先粘贴位置或手动填经纬度，选点与保存仍然可用。</p>:<p className="muted map-tip">{picked?'点地图或拖动红点微调，红点就是导航到的地方。':'先在地图上点一下，或用上面的按钮定位、粘贴位置。'}</p>}
  <p className="map-coord" role="status">{picked?'已选 ':'尚未选点 · '}{shown.latitude.toFixed(5)}, {shown.longitude.toFixed(5)}{picked&&<small>距市中心约 {distanceLabel(distanceKm(point,KUNMING_CENTER))}{accuracy!=null?' · 定位精度约 ±'+Math.round(accuracy)+' 米':''}</small>}</p>
  <label>地点名称 <i>必填</i><input maxLength={80} value={name} onChange={event=>setName(event.target.value)} placeholder="例如 楠苑食堂二楼 / 仕林街那家米线"/></label>
  <details className="map-advanced" open={!picked}><summary>从高德 / 腾讯地图粘贴位置</summary><p className="muted">在高德或腾讯地图里点「分享 → 复制链接」整段粘进来；也支持“25.0456,102.7123”这种数字（按国内坐标系换算）。</p><textarea maxLength={1000} value={paste} onChange={event=>{setPaste(event.target.value);setPasteNotice('')}} placeholder="粘贴分享链接或经纬度"/><button type="button" className="button secondary" disabled={!paste.trim()} onClick={applyPaste}>解析并使用</button>{pasteNotice&&<p className="muted" role="status">{pasteNotice}</p>}</details>
  <details className="map-advanced"><summary>手动输入经纬度</summary><div className="map-coordinate-row"><label>纬度<input type="number" step="any" value={shown.latitude} onChange={event=>{const next=toPoint(Number(event.target.value),shown.longitude,basemap);setPoint(next);setPicked(true)}}/></label><label>经度<input type="number" step="any" value={shown.longitude} onChange={event=>{const next=toPoint(shown.latitude,Number(event.target.value),basemap);setPoint(next);setPicked(true)}}/></label></div><small>按当前底图填写（{basemap==='amap'?'高德 GCJ-02':'OSM WGS84'}）。</small></details>
  <p className="muted">服务范围：昆明（{KUNMING_BOUNDS.minLatitude}–{KUNMING_BOUNDS.maxLatitude}°N / {KUNMING_BOUNDS.minLongitude}–{KUNMING_BOUNDS.maxLongitude}°E）。地图选点不会覆盖手填的地址。</p>
  {error&&<p className="notice" role="alert">{error}</p>}
  <button className="button primary" disabled={!valid||!name.trim()} onClick={()=>onSave({latitude:point.latitude,longitude:point.longitude,mapName:name.trim()})}>{valid?'确认位置':'请先在地图上选点'}</button>
 </section></div>
}
