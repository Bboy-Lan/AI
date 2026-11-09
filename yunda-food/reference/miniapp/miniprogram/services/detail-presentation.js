const d = require('./discovery')
function dateLabel(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const raw = typeof value === 'object' ? value.$date != null ? value.$date : value._seconds != null ? value._seconds * 1000 : null : value
  if (raw == null) return ''
  const date = new Date(raw)
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) : ''
}
function present(item) {
  const taste = item.taste || {}; const drink = d.isDrink(item.category)
  const level = drink ? d.level(taste.sweet) : d.level(taste.spicy)
  const labels = [item.category, level == null ? '' : (drink ? d.SWEET : d.SPICY)[level], taste.staple, ...(taste.tags || []), taste.temperature, ...(item.flavors || [])]
  const detailTags = [...new Set(labels.filter(label => typeof label === 'string' && label.trim()))]
  const count = Math.max(0, Number(item.ratingCount) || 0); const rating = Number(item.ratingAverage)
  const rated = count > 0 && Number.isFinite(rating) && rating >= 1 && rating <= 5
  const hasMap = Boolean(require('./location').point(item))
  const places = item.locationType === 'inside' ? [item.school, item.campus, item.venue, item.addressSummary] : [item.region, item.venue, item.addressSummary]
  const manualAddress = [...new Set(places.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].join(' · ')
  return { detailTags, hasMap, ratingLabel: rated ? rating.toFixed(1) : '', ratingStars: [1, 2, 3, 4, 5].map(value => rated && value <= Math.round(rating)), priceDate: dateLabel(item.priceUpdatedAt || item.submittedAt), recordDate: dateLabel(item.contentUpdatedAt || item.priceUpdatedAt || item.submittedAt || item.authorAteDate), locationLabel: manualAddress || item.placeText || '地点未标注', mapLabel: hasMap ? item.locationName || '已选美食位置' : '' }
}
module.exports = { present, dateLabel }
