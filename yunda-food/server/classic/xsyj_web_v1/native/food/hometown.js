// 规范保存省市名称；仅展示简称，不按简称推断未知地区。
const PROVINCES = {
  '北京市': '北京', '天津市': '天津', '河北省': '河北', '山西省': '山西', '内蒙古自治区': '内蒙古',
  '辽宁省': '辽宁', '吉林省': '吉林', '黑龙江省': '黑龙江', '上海市': '上海', '江苏省': '江苏', '浙江省': '浙江',
  '安徽省': '安徽', '福建省': '福建', '江西省': '江西', '山东省': '山东', '河南省': '河南', '湖北省': '湖北', '湖南省': '湖南',
  '广东省': '广东', '广西壮族自治区': '广西', '海南省': '海南', '重庆市': '重庆', '四川省': '四川', '贵州省': '贵州', '云南省': '云南',
  '西藏自治区': '西藏', '陕西省': '陕西', '甘肃省': '甘肃', '青海省': '青海', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆',
  '台湾省': '台湾', '香港特别行政区': '香港', '澳门特别行政区': '澳门',
}
const CITY_NAMES = {
  '大理白族自治州': '大理', '楚雄彝族自治州': '楚雄', '红河哈尼族彝族自治州': '红河', '文山壮族苗族自治州': '文山',
  '西双版纳傣族自治州': '西双版纳', '德宏傣族景颇族自治州': '德宏', '怒江傈僳族自治州': '怒江', '迪庆藏族自治州': '迪庆',
  '延边朝鲜族自治州': '延边', '恩施土家族苗族自治州': '恩施', '湘西土家族苗族自治州': '湘西',
  '阿坝藏族羌族自治州': '阿坝', '甘孜藏族自治州': '甘孜', '凉山彝族自治州': '凉山', '黔东南苗族侗族自治州': '黔东南',
  '黔南布依族苗族自治州': '黔南', '黔西南布依族苗族自治州': '黔西南', '临夏回族自治州': '临夏', '甘南藏族自治州': '甘南',
  '海北藏族自治州': '海北', '黄南藏族自治州': '黄南', '海南藏族自治州': '海南', '果洛藏族自治州': '果洛', '玉树藏族自治州': '玉树',
  '海西蒙古族藏族自治州': '海西', '昌吉回族自治州': '昌吉', '博尔塔拉蒙古自治州': '博尔塔拉', '巴音郭楞蒙古自治州': '巴音郭楞',
  '克孜勒苏柯尔克孜自治州': '克孜勒苏', '伊犁哈萨克自治州': '伊犁',
}
const MUNICIPALITIES = ['北京市', '天津市', '上海市', '重庆市']
function compact(value) { return String(value || '').trim().replace(/[\s·，,。/\-]/g, '') }
function parse(value) {
  if (Array.isArray(value)) return parse(fromRegion(value))
  const text = compact(value)
  const province = Object.keys(PROVINCES).find(name => text.startsWith(name))
  if (!province) return null
  const rest = text.slice(province.length)
  let city
  if (MUNICIPALITIES.includes(province)) city = province
  else {
    const match = rest.match(/^(.+?(?:自治州|地区|盟|市)|省直辖县级行政区划|自治区直辖县级行政区划|香港岛|九龙|新界|澳门半岛|氹仔岛|路环岛)/)
    city = match && match[1]
  }
  if (!city || !rest && !MUNICIPALITIES.includes(province)) return null
  return { province, city, region: [province, city], value: province === city ? province : province + city, key: province + '|' + city }
}
function fromRegion(region) {
  if (!Array.isArray(region) || region.length < 2 || !PROVINCES[region[0]] || typeof region[1] !== 'string' || !region[1].trim()) return ''
  return region[0] === region[1] ? region[0] : region.slice(0, 2).join('')
}
function label(value) {
  const place = parse(value)
  if (!place) return compact(value)
  const city = CITY_NAMES[place.city] || place.city.replace(/(?:市|地区|盟)$/, '')
  return place.province === place.city ? PROVINCES[place.province] : PROVINCES[place.province] + '·' + city
}
function same(a, b) { const left = parse(a); const right = parse(b); return Boolean(left && right && left.key === right.key) }
module.exports = { parse, fromRegion, label, same }

