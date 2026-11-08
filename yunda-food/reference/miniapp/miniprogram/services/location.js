function point(value) {
  if (!value || value.latitude == null || value.longitude == null || value.latitude === '' || value.longitude === '') return null
  const latitude = Number(value.latitude); const longitude = Number(value.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= 24.35 && latitude <= 26.45 && longitude >= 102.1 && longitude <= 103.75 ? { latitude, longitude } : null
}
function open(value, onError) {
  const coordinates = point(value)
  if (!coordinates) { onError('这条推荐还没有地图选点，请参考文字地址和照片。'); return }
  wx.openLocation({ ...coordinates, name: value.locationName || value.venue || value.name || '美食地点', address: value.locationAddress || value.addressSummary || value.placeText || '', scale: 18, fail(error) { if (!/cancel/i.test(error.errMsg || '')) onError('地图暂时未能打开，请稍后重试。') } })
}
module.exports = { point, open }
