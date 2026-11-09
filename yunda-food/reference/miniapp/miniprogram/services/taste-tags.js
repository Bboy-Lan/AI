const OPTIONS = ['正常', '清淡', '偏咸', '偏甜', '香辣']
const READABLE = [...OPTIONS, '酸香', '麻香']
function toggle(current, value) {
  if (!OPTIONS.includes(value)) return current
  const tags = current.filter(tag => OPTIONS.includes(tag))
  if (tags.includes(value)) return tags.filter(tag => tag !== value)
  if (value === '正常') return ['正常']
  return tags.filter(tag => tag !== '正常').concat(value).slice(-2)
}
module.exports = { OPTIONS, READABLE, toggle }
