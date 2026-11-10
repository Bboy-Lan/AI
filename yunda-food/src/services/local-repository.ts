export type Review = import('../domain/moderation').ReviewFields & { status?:'public'|'hidden', reason?:string, avatarKey?:string, profileId?:string, own?:boolean, authorRole?:string, id: string, foodId: string, author: string, hometown: string, rating: number, text: string, createdAt: string, ate?: boolean, foodVerified?: boolean }
export type Food = import('../domain/moderation').ReviewFields & { storeName?:string, taste?:import('../domain/discovery').Taste, school?:string, campus?:string, region?:string, venue?:string, addressSummary?:string, locationAddress?:string, authorAvatar?:string, authorRole?:string, profileId?:string, reason?:string, ratingCount?:number, verificationPositiveCount?:number, verificationNegativeCount?:number, id: string, name: string, category: string, price?: number, priceBasis?: 'person'|'portion', locationType: 'inside'|'outside', placeText: string, author: string, hometown: string, spicy?: string, sweet?: string, tags: string[], address?: string, mapName?: string, latitude?:number, longitude?:number, authorAte?:boolean, images: string[], favorite?: boolean, rating?: number, status?: 'public'|'hidden', canEdit?: boolean, mediaKeys?:string[], description?:string, createdAt?:string, updatedAt?:string }
export type Caution = import('../domain/moderation').ReviewFields & { authorRole?:string, confirmed?:boolean, version?:number, canEdit?:boolean, liked?:boolean, reason?:string, createdAt?:string, updatedAt?:string, profileId?:string, avatarKey?:string, hometown?:string, id: string, name: string, address: string, date: string, body: string, tags: string[], author: string, images: string[], mediaKeys?:string[], likes: number, status: 'public'|'pending'|'hidden'|'returned'|'withdrawn' }
const seed: Food[] = [
  { id: 'f1', name: '小锅米线', category: '主食', price: 12, priceBasis: 'portion', locationType: 'inside', placeText: '呈贡校区 · 楠苑一楼', author: '小云朵', hometown: '云南省昆明市', spicy: '微辣', tags: ['米线','热乎'], address: '楠苑食堂一楼米线窗口', mapName: '楠苑食堂', images: ['/assets/icons/hero-lavender-clocktower.jpg'], rating: 4.6 },
  { id: 'f2', name: '芒果椰椰', category: '饮品', price: 16, priceBasis: 'portion', locationType: 'outside', placeText: '雨花街道 · 西门', author: '阿南', hometown: '四川省成都市', sweet: '少糖', tags: ['饮品','冰'], address: '西门雨花街道', mapName: '雨花街道', images: ['/assets/icons/default-goods-image.png'], rating: 4.2 },
  { id: 'f3', name: '干锅土豆片', category: '小吃', price: 28, priceBasis: 'portion', locationType: 'outside', placeText: '仕林街', author: '阿岚', hometown: '云南省大理白族自治州', spicy: '中辣', tags: ['下饭','现炒'], address: '呈贡仕林街', mapName: '仕林街', images: ['/assets/icons/hero-lavender-clocktower.jpg'], rating: 4.8 }
]
const cautions: Caution[] = [{ id: 'c1', name: '某米线铺', address: '校外商街', date: '2026-10-28', body: '这是一次个人消费经历：出餐等待较长，汤温偏低。请结合日期和具体情况理性参考。', tags: ['出餐','服务'], author: '吃饭要准时', images: [], likes: 4, status: 'public' }]
const reviewSeed: Review[] = [
  { id:'r1',foodId:'f1',author:'阿岚',hometown:'云南省大理白族自治州',rating:5,text:'汤底很香，窗口出餐快。晚课后去也还有热的，12 元一份吃得很饱。',createdAt:'2026-11-04T18:20:00+08:00' },
  { id:'r2',foodId:'f1',author:'小云朵',hometown:'云南省昆明市',rating:4,text:'微辣刚好，喜欢清淡的话可以提前说少油。',createdAt:'2026-11-03T12:10:00+08:00' },
  { id:'r3',foodId:'f2',author:'吃饭要准时',hometown:'贵州省贵阳市',rating:4,text:'少糖不会腻，午后排队时间会长一点。',createdAt:'2026-11-02T15:30:00+08:00' }
]
const key = 'xiaoshiyunji-web:foods'
const read = <T,>(name: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(name) || '') as T } catch { return fallback } }
const write = <T,>(name: string, value: T) => localStorage.setItem(name, JSON.stringify(value))
export const repository = {
  foods: () => read<Food[]>(key, seed).map(food => {
    const fixture = seed.find(item => item.id === food.id)
    return fixture ? { ...fixture, ...food, images: food.images.length ? food.images : fixture.images, mapName: food.mapName || fixture.mapName } : food
  }), cautions: () => read<Caution[]>('xiaoshiyunji-web:cautions', cautions),
  reviews: (foodId: string) => read<Review[]>('xiaoshiyunji-web:reviews', reviewSeed).filter(x => x.foodId === foodId),
  saveReview(review: Review) {
    const food = this.foods().find(x => x.id === review.foodId)
    if (!food || food.status === 'hidden') throw new Error('该投稿已下架或不可评分。')
    if (food.author === review.author) throw new Error('投稿人不能给自己的推荐评分。')
    if (!review.ate || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) throw new Error('请自报亲自吃过，并选择 1～5 分。')
    if (review.text.length > 300) throw new Error('评价内容最多 300 字。')
    const all = read<Review[]>('xiaoshiyunji-web:reviews', reviewSeed)
    const index = all.findIndex(x => x.foodId === review.foodId && x.author === review.author)
    const saved = index < 0 ? review : { ...review, id: all[index].id }
    index < 0 ? all.unshift(saved) : all[index] = saved
    write('xiaoshiyunji-web:reviews', all)
    return saved
  },
  saveIssue(foodId: string, type: 'price_report'|'content_report', reason: string) {
    if (reason.trim().length < 2) throw new Error('请先说明需要反馈的问题。')
    const issues = read<object[]>('xiaoshiyunji-web:issues', [])
    write('xiaoshiyunji-web:issues', [{foodId, type, reason: reason.trim(), createdAt: new Date().toISOString()}, ...issues])
  },
  saveFood(food: Food) { const all = this.foods(); const i = all.findIndex(x => x.id === food.id); i < 0 ? all.unshift(food) : all[i] = food; write(key, all); return food },
  saveCaution(post: Caution) { const all = this.cautions(); const i = all.findIndex(x => x.id === post.id); i < 0 ? all.unshift(post) : all[i] = post; write('xiaoshiyunji-web:cautions', all); return post },
  toggleFavorite(id: string) { const item = this.foods().find(x => x.id === id); if (!item) return; item.favorite = !item.favorite; this.saveFood(item); return item }
}
