import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Navigation, Save } from 'lucide-react'
import type { Category, FoodItem, OilLevel, PriceMode, SpicyLevel, Staple, SweetSalty } from '../types'
import { AREAS, OIL_LABEL, SPICY_LABEL, STAPLE_LABEL, SWEETSALTY_LABEL } from '../data/campus'
import { compressImage, ImagePickError } from '../lib/imageProcess'
import { notifyDataChanged, repo } from '../lib/repo'
import { EmptyState, Notice, Seg, Spinner } from '../components/ui'

export function EditItemPage() {
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const [item, setItem] = useState<FoodItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(''); const [category, setCategory] = useState<Category>('meal')
  const [areaId, setAreaId] = useState('ynu-chenggong'); const [venue, setVenue] = useState('')
  const [priceMode, setPriceMode] = useState<PriceMode>('per_item'); const [price, setPrice] = useState('')
  const [spicy, setSpicy] = useState<SpicyLevel>(1); const [sweetSalty, setSweetSalty] = useState<SweetSalty>('normal')
  const [oil, setOil] = useState<OilLevel>('normal'); const [staple, setStaple] = useState<Staple | ''>('')
  const [flavors, setFlavors] = useState(''); const [description, setDescription] = useState(''); const [image, setImage] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)

  useEffect(() => { repo.listMyItems().then((items) => {
    const found = items.find((entry) => entry.id === id)
    if (!found) { setError('找不到你的投稿，或它不属于当前身份。'); return }
    setItem(found); setName(found.name); setCategory(found.category); setAreaId(found.areaId); setVenue(found.venue); setPriceMode(found.priceMode); setPrice(String(found.price)); setSpicy(found.spicy); setSweetSalty(found.sweetSalty); setOil(found.oil); setStaple(found.staple ?? ''); setFlavors(found.flavors.join(' ')); setDescription(found.description)
  }).catch((cause) => setError(cause instanceof Error ? cause.message : '读取投稿失败')) }, [id])

  const recordLocation = () => {
    if (!navigator.geolocation || !window.isSecureContext) { setError('当前环境无法定位；可继续编辑文字信息。'); return }
    navigator.geolocation.getCurrentPosition((position) => setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude }), () => setError('暂时无法定位；请检查定位授权后重试。'), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 })
  }
  const pickImage = async (file?: File) => { if (!file) return; try { setImage(await compressImage(file)); setError(null) } catch (cause) { setError(cause instanceof ImagePickError ? cause.message : '图片处理失败') } }
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!item || saving) return
    if (name.trim().length < 2 || venue.trim().length < 2 || description.trim().length < 5 || !(Number(price) > 0)) { setError('请补全菜名、地点、价格和描述。'); return }
    setSaving(true); setError(null)
    try {
      await repo.updateMyItem({ id: item.id, name: name.trim().slice(0, 30), category, areaId, campusId: 'kunming', venue: venue.trim().slice(0, 40), priceMode, price: Number(price), spicy, sweetSalty, oil, staple: category === 'drink' ? null : staple || null, flavors: flavors.split(/[\s,，、;；]+/).filter(Boolean).slice(0, 6), description: description.trim().slice(0, 200), image: image ?? undefined, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null })
      notifyDataChanged('item-updated'); navigate('/me')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '更新失败') } finally { setSaving(false) }
  }
  if (error && !item) return <div className="page stack-lg"><button type="button" className="icon-btn" onClick={() => navigate('/me')}><ArrowLeft size={17} /></button><EmptyState art="📝" title="无法编辑这条投稿">{error}</EmptyState></div>
  if (!item) return <div className="page"><Spinner /></div>
  return <form className="page stack-lg" onSubmit={save}><div className="topbar" style={{ position: 'static' }}><button type="button" className="icon-btn" onClick={() => navigate('/me')}><ArrowLeft size={17} /></button><span className="topbar__title">补充 / 编辑投稿</span></div>{item.status === 'hidden' && <Notice tone="yellow">这条投稿仍处于下架状态；补充内容不会自动恢复公开。</Notice>}{error && <Notice tone="red">{error}</Notice>}<section className="info-card stack-lg"><label className="field"><span className="field__label">菜名</span><input className="text-input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span className="field__label">类别</span><Seg<Category> value={category} onChange={setCategory} options={[{ value: 'meal', label: '正餐' }, { value: 'snack', label: '小吃' }, { value: 'drink', label: '饮品' }]} /></label><label className="field"><span className="field__label">地点</span><select className="select-input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>{AREAS.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label className="field"><span className="field__label">具体店 / 窗口</span><input className="text-input" value={venue} maxLength={40} onChange={(e) => setVenue(e.target.value)} /></label><button type="button" className="btn btn--soft" onClick={recordLocation}><Navigation size={14} />{coords ? '已更新菜品大致位置' : '在菜品附近记录当前位置'}</button><span className="tiny faint">更新位置建议在店旁操作；若不记录，将保留原位置（如有）。</span></section><section className="info-card stack-lg"><label className="field"><span className="field__label">价格</span><div className="btn-row"><select className="select-input" value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)}><option value="per_item">单份</option><option value="per_person">人均</option></select><input className="text-input" type="number" min="0.5" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} /></div></label><label className="field"><span className="field__label">辣度</span><select className="select-input" value={spicy} onChange={(e) => setSpicy(Number(e.target.value) as SpicyLevel)}>{([0,1,2,3] as SpicyLevel[]).map((value) => <option key={value} value={value}>{SPICY_LABEL[value]}</option>)}</select></label><label className="field"><span className="field__label">咸甜 / 油重 / 主食</span><div className="btn-row"><select className="select-input" value={sweetSalty} onChange={(e) => setSweetSalty(e.target.value as SweetSalty)}>{(['light','normal','salty','sweet'] as SweetSalty[]).map((value) => <option key={value} value={value}>{SWEETSALTY_LABEL[value]}</option>)}</select><select className="select-input" value={oil} onChange={(e) => setOil(e.target.value as OilLevel)}>{(['less','normal','heavy'] as OilLevel[]).map((value) => <option key={value} value={value}>{OIL_LABEL[value]}</option>)}</select><select className="select-input" value={staple} onChange={(e) => setStaple(e.target.value as Staple | '')}><option value="">不适用</option>{(['noodle','rice'] as Staple[]).map((value) => <option key={value} value={value}>{STAPLE_LABEL[value]}</option>)}</select></div></label><label className="field"><span className="field__label">口味关键词</span><input className="text-input" value={flavors} maxLength={40} onChange={(e) => setFlavors(e.target.value)} /></label><label className="field"><span className="field__label">补充说明</span><textarea className="text-area" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></label><label className="field"><span className="field__label">更换实拍图（可选）</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void pickImage(e.target.files?.[0])} /></label></section><button type="submit" className="btn btn--blue btn--lg btn--block" disabled={saving}><Save size={16} />{saving ? '保存中…' : '保存补充内容'}</button></form>
}
