// Administrator image rejection: one authority for every user upload (avatar, recommendation, caution, forum).
// A rejected file is removed from its owning record, remembered in the private event namespace, and the
// author is told to upload a different photo. No new collection and no shared-resource change.
const EVENTS = 'xsyj_events'
const NOTICES = 'xsyj_review_notifications'
const PREFIX = 'cloud://cloud-yunda-d5gxrar1s14b2ee0d.'
const TARGETS = {
  food: { table: 'xsyj_food_items', field: 'imageFileIds', label: '推荐', title: 'name', path: id => '/detail/' + id, edit: id => '/publish/' + id },
  caution: { table: 'xsyj_caution_posts', field: 'imageFileIds', label: '消费经历', title: 'name', path: id => '/tree-detail/' + id, edit: id => '/tree-compose/' + id },
  topic: { table: 'xsyj_forum_topics', field: 'images', label: '话题', title: 'title', path: id => '/forum/' + id, edit: id => '/forum-compose/' + id },
  avatar: { table: 'xsyj_profiles', field: 'avatarFileId', label: '头像', title: 'foodieId', path: id => '/user/' + id, edit: () => '/onboarding' }
}
const isFileId = value => typeof value === 'string' && value.startsWith(PREFIX) && value.includes('/xsyj-media/') && !value.includes('..')

module.exports = function createImageReview(d) {
  const { db, fail, text, now, requireAdmin, hash } = d
  const get = async (tx, table, id) => {
    try { return (await tx.collection(table).doc(id).get()).data || null }
    catch (error) { if (/not.?found|not.?exist|不存在|DOCUMENT_NOT_FOUND/i.test(String(error.message || error.errMsg || ''))) return null; throw error }
  }
  const set = (tx, table, id, data) => tx.collection(table).doc(id).set({ data })

  // Rejections are checked on every photo read, so the caller may keep a per-request cache.
  async function isRejected(fileId, cache) {
    if (!isFileId(fileId)) return false
    if (cache && cache.has(fileId)) return cache.get(fileId)
    const rows = (await db.collection(EVENTS).where({ type: 'image_rejection', fileId }).limit(1).get()).data
    const rejected = rows.length > 0
    if (cache) cache.set(fileId, rejected)
    return rejected
  }

  async function reject(uid, p) {
    await requireAdmin(uid)
    const kind = String(p.kind || 'avatar')
    const target = TARGETS[kind]
    if (!target) fail('图片类型无效。')
    const fileId = String(p.fileId || '')
    if (!isFileId(fileId)) fail('照片标识无效。')
    const reason = String(p.reason || '').trim()
    if (reason.length < 2 || reason.length > 120) fail('请填写2～120字的驳回说明。')
    const requestId = String(p.clientRequestId || '')
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId)) fail('提交编号无效，请保留输入后重试。')

    let targetId = text(p.id, 100)
    if (!targetId) {
      const rows = (await db.collection(target.table).where({ [kind === 'avatar' ? 'avatarFileId' : target.field]: fileId }).limit(1).get()).data
      targetId = rows[0] ? rows[0]._id : ''
    }
    if (!targetId) fail('找不到这张照片所在的内容，可能已被作者删除。')

    const receiptId = 'image_reject_receipt_' + hash(uid, requestId)
    const auditId = 'image_reject_' + hash('image', uid, requestId)
    const noticeId = 'image_reject_notice_' + hash('image-notice', fileId, auditId)

    return db.runTransaction(async tx => {
      const signature = hash(JSON.stringify([kind, targetId, fileId, reason]))
      const done = await get(tx, EVENTS, receiptId)
      if (done && done.result) {
        if (done.signature !== signature) fail('提交编号与内容不一致，请刷新后重新处理。')
        return done.result
      }
      const row = await get(tx, target.table, targetId)
      if (!row) fail('原内容不存在或已被删除。')
      let remaining = 0
      if (kind === 'avatar') {
        if (row.avatarFileId !== fileId) fail('这张照片已不是当前头像，请刷新后重新处理。')
        // The profile keeps avatarRejected as null until the first rejection, and the SDK flattens nested
        // objects into dotted paths, which Mongo refuses to create inside null. Replace the whole document
        // with the row the transaction just read instead.
        const { _id, ...rest } = row
        await set(tx, target.table, targetId, { ...rest, avatarFileId: '', avatarRejected: { fileId, reason, at: now(), by: uid } })
      } else {
        const list = Array.isArray(row[target.field]) ? row[target.field] : []
        if (!list.includes(fileId)) fail('这张照片已不在该内容中，请刷新后重新处理。')
        const next = list.filter(value => value !== fileId)
        remaining = next.length
        const rejected = [...(Array.isArray(row.rejectedImages) ? row.rejectedImages : []), { fileId, reason, at: now(), by: uid }].slice(-10)
        await tx.collection(target.table).doc(targetId).update({ data: { [target.field]: next, rejectedImages: rejected } })
      }
      await set(tx, EVENTS, auditId, { type: 'image_rejection', targetKind: kind, targetId, fileId, ownerOpenId: row.ownerOpenId || '', reason, operatorOpenId: uid, createdAt: now() })
      const result = { kind, id: targetId, fileId, remaining }
      await set(tx, EVENTS, receiptId, { type: 'image_reject_receipt', operatorOpenId: uid, ownerOpenId: row.ownerOpenId || '', signature, result, createdAt: now() })
      if (row.ownerOpenId) {
        const name = String(row[target.title] || '').trim() || '你的内容'
        const body = '你的' + target.label + '「' + name + '」有 1 张照片未通过审核，已从内容中移除，请重新上传一张。驳回说明：' + reason
        await set(tx, NOTICES, noticeId, { ownerOpenId: row.ownerOpenId, actor: uid, targetKind: kind, targetId, path: target.path(targetId), editPath: target.edit(targetId), tag: 'changes', kind: 'content_review', body, read: false, archived: false, createdAt: now() })
      }
      return result
    })
  }

  return { isRejected, reject, isFileId }
}
