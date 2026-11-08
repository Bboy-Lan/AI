const crypto = require('crypto')
const CURRENT = 'app_announcement_current'
const DEFAULT = {
  version: 'welcome-20261030-v1',
  title: '一起找到合口味的一餐',
  content: '优先参考同乡、口味相近的推荐，再结合地点和预算选择；拿不定主意时，可去“开盲盒”看看符合条件的美食。\n美食推荐来自个人体验，口味与评价具有主观性。价格、份量和营业情况以现场为准，请大家理性选择。\n推荐请以亲自吃过的体验为基础，写清名称、位置和价格。可上传组图，首张作封面；地图选点方便其他同学导航。\n请友善交流、尊重他人，不发布辱骂、广告或不实信息。遇到问题可在“我的”提交反馈，共同维护社区环境。',
  updatedAt: null,
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
module.exports = function createAnnouncements({ db, collection, requireAdmin, adminFor, now, fail }) {
  async function read(id) {
    try { return (await db.collection(collection).doc(id).get()).data || null }
    catch (error) { if (/not.?found|not.?exist|不存在|DATABASE_DOCUMENT_NOT_EXIST/i.test(error.errMsg || error.message || '')) return null; throw error }
  }
  function publicNotice(row) { return { version: row.version, title: row.title, content: row.content, updatedAt: row.updatedAt || null } }
  async function current() { const row = await read(CURRENT); if (row && row.type !== 'app_announcement') fail('公告状态异常，请联系管理员。'); return row || DEFAULT }
  const ackId = (id, version) => 'ann_ack_' + hash(id + ':' + version)
  async function getAnnouncement(id) {
    const notice = await current(); const [ack, admin] = await Promise.all([read(ackId(id, notice.version)), adminFor(id)])
    return { announcement: publicNotice(notice), acknowledged: Boolean(ack && ack.type === 'announcement_ack' && ack.ownerOpenId === id && ack.version === notice.version), canEdit: Boolean(admin) }
  }
  async function acknowledgeAnnouncement(id, payload) {
    const notice = await current()
    if (payload.version !== notice.version) fail('公告已有更新，请先阅读新版公告。')
    const key = ackId(id, notice.version); const old = await read(key)
    if (old && (old.type !== 'announcement_ack' || old.ownerOpenId !== id || old.version !== notice.version)) fail('公告阅读状态异常，请重试。')
    if (!old) {
      try { await db.collection(collection).add({ data: { _id: key, type: 'announcement_ack', ownerOpenId: id, version: notice.version, acknowledgedAt: now() } }) }
      catch (error) { const saved = await read(key); if (!saved || saved.ownerOpenId !== id || saved.version !== notice.version) throw error }
    }
    return { acknowledgedVersion: notice.version }
  }
  async function adminSaveAnnouncement(id, payload) {
    await requireAdmin(id)
    if (typeof payload.title !== 'string' || typeof payload.content !== 'string') fail('请填写公告标题和正文。')
    const title = payload.title.trim(); const paragraphs = payload.content.replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean); const content = paragraphs.join('\n')
    if (!title || [...title].length > 20 || content.length < 10 || [...content].length > 260 || paragraphs.length > 6) fail('标题限20字，正文10～260字、最多6段，请保持简短。')
    if (typeof payload.clientRequestId !== 'string' || !/^[a-zA-Z0-9_-]{12,80}$/.test(payload.clientRequestId)) fail('公告保存编号无效，请重试。')
    const notice = await current(); const version = 'ann_' + hash(JSON.stringify([id, payload.clientRequestId, payload.baseVersion, title, content]))
    if (notice.version === version && notice.title === title && notice.content === content) return { announcement: publicNotice(notice), changed: false }
    if (payload.baseVersion !== notice.version) fail('公告已有新版本。请取消编辑、查看新版后再修改，当前文字尚未保存。')
    if (notice.title === title && notice.content === content) return { announcement: publicNotice(notice), changed: false }
    const data = { type: 'app_announcement', version, title, content, updatedAt: now(), updatedBy: id }
    if (notice.version === DEFAULT.version && !await read(CURRENT)) {
      try { await db.collection(collection).add({ data: { _id: CURRENT, ...data } }) }
      catch (error) { if (await read(CURRENT)) fail('公告已被更新，请查看新版后再修改。'); throw error }
    } else {
      // 版本条件与更新在同一次数据库操作内，避免并发编辑覆盖新版。
      const result = await db.collection(collection).where({ _id: CURRENT, type: 'app_announcement', version: notice.version }).update({ data })
      const updated = result.stats && result.stats.updated != null ? result.stats.updated : result.updated
      if (updated !== 1) fail('公告已被其他管理员更新，请查看新版后再修改。')
    }
    const saved = await current()
    if (saved.version !== version) fail('公告已出现新版本，请重新读取确认。')
    return { announcement: publicNotice(saved), changed: true }
  }
  return { getAnnouncement, acknowledgeAnnouncement, adminSaveAnnouncement }
}
module.exports.DEFAULT = DEFAULT

