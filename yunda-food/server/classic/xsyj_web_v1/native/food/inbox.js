const crypto = require('crypto')
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
const time = value => new Date(value && (value.$date || value) || 0).getTime() || 0
module.exports = function createInbox({ db, C, requireAdmin, fail, text, now }) {
  const groups = values => { const out = []; for (let i = 0; i < values.length; i += 20) out.push(values.slice(i, i + 20)); return out }
  async function queryGroups(collection, field, values, where = {}, date = 'updatedAt') {
    const result = await Promise.all(groups([...new Set(values)]).map(group => db.collection(collection).where({ ...where, [field]: db.command.in(group) }).orderBy(date, 'desc').limit(100).get()))
    return result.flatMap(r => r.data)
  }
  async function actorProfiles(owners) { return new Map((await queryGroups(C.profiles, 'ownerOpenId', owners)).map(p => [p.ownerOpenId, p])) }
  // 从真实收藏/公开评价生成消息，取消收藏和隐藏评价后不再展示；不复制或另写业务记录。
  async function interactions(id) {
    const own = (await db.collection(C.items).where({ ownerOpenId: id }).orderBy('submittedAt', 'desc').limit(100).get()).data
    if (!own.length) return []
    const items = new Map(own.map(item => [item._id, item])); const ids = [...items.keys()]
    const [favorites, reviews] = await Promise.all([queryGroups(C.favorites, 'itemId', ids, {}, 'createdAt'), queryGroups(C.reviews, 'itemId', ids, { status: 'published' })])
    const candidates = [...favorites.map(row => ({ row, kind: 'favorite', date: row.createdAt })), ...reviews.map(row => ({ row, kind: 'review', date: row.updatedAt || row.createdAt }))].filter(x => x.row.ownerOpenId !== id).sort((a, b) => time(b.date) - time(a.date)).slice(0, 100)
    const keys = candidates.map(x => hash(JSON.stringify([x.kind, x.row._id, x.date || null])))
    const [reads, profiles] = await Promise.all([queryGroups(C.events, 'notificationId', keys, { type: 'interaction_read', ownerOpenId: id }, 'createdAt'), actorProfiles(candidates.map(x => x.row.ownerOpenId))])
    const readIds = new Set(reads.map(row => row.notificationId)); const deletedIds = new Set(reads.filter(row => row.deleted).map(row => row.notificationId))
    return candidates.map((x, index) => { const p = profiles.get(x.row.ownerOpenId); const item = items.get(x.row.itemId); return { _id: keys[index], kind: x.kind, itemId: item._id, itemName: item.name, itemImage: (item.imageFileIds || [])[0] || '', itemStatus: item.status, reviewId: x.kind === 'review' ? x.row._id : '', content: x.kind === 'review' ? x.row.text || '留下了一份评分' : '收藏了你的推荐，想下次来吃', rating: x.kind === 'review' ? x.row.rating : null, actorProfileId: p && p._id || '', actorName: p && p.foodieId || '同学', actorAvatar: p && p.avatarFileId || '', createdAt: x.date || null, read: readIds.has(keys[index]) } }).filter(row => !deletedIds.has(row._id))
  }
  async function listMyInteractions(id) { return (await interactions(id)).sort((a, b) => Number(a.read) - Number(b.read) || time(b.createdAt) - time(a.createdAt)) }
  async function myInteractionSummary(id) { const rows = await interactions(id); return { unreadCount: rows.filter(row => !row.read).length } }
  async function readInteraction(id, payload) {
    const key = text(payload.notificationId, 100); const rows = await interactions(id)
    if (!rows.some(row => row._id === key)) fail('这条互动消息已不可访问，请重新读取。')
    const documentId = 'interaction_read_' + hash(id + ':' + key)
    const ref = db.collection(C.events).doc(documentId)
    const old = await ref.get().then(r => r.data).catch(error => { if (/not.?found|not.?exist|不存在/i.test(error.errMsg || error.message || '')) return null; throw error })
    if (old && (old.ownerOpenId !== id || old.notificationId !== key || old.type !== 'interaction_read')) fail('消息状态不匹配。')
    if (!old) { try { await db.collection(C.events).add({ data: { _id: documentId, type: 'interaction_read', ownerOpenId: id, notificationId: key, createdAt: now() } }) } catch (error) { const saved = await ref.get().then(r => r.data).catch(() => null); if (!saved || saved.ownerOpenId !== id || saved.notificationId !== key) throw error } }
    return { read: true, notificationId: key }
  }
  async function issueRows() { return (await db.collection(C.events).where({ type: db.command.in(['price_report', 'content_report']) }).orderBy('createdAt', 'desc').limit(100).get()).data.filter(row => !row.issueArchived) }
  async function adminIssueSummary(id) { await requireAdmin(id); const rows = await issueRows(); return { pendingCount: rows.filter(row => row.issueStatus !== 'resolved').length, limit: 100 } }
  async function adminListIssues(id) {
    await requireAdmin(id); const rows = await issueRows()
    const [profiles, items] = await Promise.all([actorProfiles(rows.map(row => row.operatorOpenId)), queryGroups(C.items, '_id', rows.map(row => row.targetId), {}, 'submittedAt')])
    const itemMap = new Map(items.map(row => [row._id, row]))
    return rows.map(row => { const p = profiles.get(row.operatorOpenId), item = itemMap.get(row.targetId); return { _id: row._id, type: row.type, itemId: row.targetId, itemName: item && item.name || '原投稿已不可用', itemImage: item && (item.imageFileIds || [])[0] || '', itemAvailable: Boolean(item), reporterProfileId: p && p._id || '', reporterName: p && p.foodieId || '同学', reporterAvatar: p && p.avatarFileId || '', snapshot:row.snapshot||{}, content: row.reason || '', status: row.issueStatus === 'resolved' ? 'resolved' : 'pending', read: row.issueReadState === 'read' || row.issueStatus === 'resolved', resolutionReason: row.resolutionReason || '', createdAt: row.createdAt } }).sort((a, b) => (a.status === 'resolved') - (b.status === 'resolved') || time(b.createdAt) - time(a.createdAt))
  }
  async function adminResolveIssue(id, payload) {
    await requireAdmin(id); const key = text(payload.issueId, 100), reason = text(payload.reason, 120)
    if (!key || reason.length < 2) fail('请填写至少2个字的处理说明。')
    return db.runTransaction(async transaction => {
      const ref = transaction.collection(C.events).doc(key); const row = await ref.get().then(r => r.data).catch(() => null)
      if (!row || !['price_report', 'content_report'].includes(row.type)) fail('举报或不符反馈不存在。')
      if (row.issueStatus !== 'resolved') await ref.update({ data: { issueStatus: 'resolved', issueReadState: 'read', resolutionReason: reason, resolvedBy: id, resolvedAt: now() } })
      return { status: 'resolved', resolutionReason: row.issueStatus === 'resolved' ? row.resolutionReason || '' : reason }
    })
  }
  async function deleteInteraction(id, payload) {
    const key = text(payload.notificationId, 100), documentId = 'interaction_read_' + hash(id + ':' + key), ref = db.collection(C.events).doc(documentId)
    const marker = await ref.get().then(r => r.data).catch(() => null)
    if (marker && marker.type === 'interaction_read' && marker.ownerOpenId === id && marker.deleted) return { deleted: true, notificationId: key }
    if (!(await interactions(id)).some(row => row._id === key)) fail('无权删除这条消息，或消息已不可访问。')
    await ref.set({ data: { type: 'interaction_read', ownerOpenId: id, notificationId: key, deleted: true, createdAt: now() } })
    return { deleted: true, notificationId: key }
  }
  async function adminReadIssue(id, payload) {
    await requireAdmin(id); const key = text(payload.issueId, 100), ref = db.collection(C.events).doc(key), row = await ref.get().then(r => r.data).catch(() => null)
    if (!row || !['price_report', 'content_report'].includes(row.type)) fail('举报不存在。')
    await ref.update({ data: { issueReadState: 'read', issueReadAt: now(), issueReadBy: id } }); return { read: true }
  }
  async function adminArchiveIssue(id, payload) {
    await requireAdmin(id); const key = text(payload.issueId, 100)
    return db.runTransaction(async transaction => {
      const ref = transaction.collection(C.events).doc(key), row = await ref.get().then(r => r.data).catch(() => null)
      if (!row || !['price_report', 'content_report'].includes(row.type)) fail('举报不存在。')
      if (row.issueStatus !== 'resolved') fail('请先记录处理结果，再删除这条举报消息。')
      await ref.update({ data: { issueArchived: true, issueArchivedBy: id, issueArchivedAt: now() } }); return { deleted: true }
    })
  }
  async function clearReadInteractions(id) {
    const rows = (await interactions(id)).filter(row => row.read); const deletedIds = []
    for (const row of rows) await db.runTransaction(async transaction => {
      const ref = transaction.collection(C.events).doc('interaction_read_' + hash(id + ':' + row._id)), marker = await ref.get().then(r => r.data).catch(() => null)
      if (!marker || marker.type !== 'interaction_read' || marker.ownerOpenId !== id || marker.notificationId !== row._id || marker.deleted) return
      await ref.update({ data: { deleted: true, clearedAt: now() } }); deletedIds.push(row._id)
    })
    return { deletedIds: [...new Set(deletedIds)], deletedCount: new Set(deletedIds).size }
  }
  async function adminClearReadIssues(id) {
    await requireAdmin(id); const rows = await issueRows(), deletedIds = []
    for (const row of rows.filter(row => row.issueStatus === 'resolved')) await db.runTransaction(async transaction => {
      const ref = transaction.collection(C.events).doc(row._id), current = await ref.get().then(r => r.data).catch(() => null)
      if (!current || !['price_report', 'content_report'].includes(current.type) || current.issueStatus !== 'resolved' || current.issueArchived) return
      await ref.update({ data: { issueArchived: true, issueArchivedBy: id, issueArchivedAt: now() } }); deletedIds.push(row._id)
    })
    return { deletedIds: [...new Set(deletedIds)], deletedCount: new Set(deletedIds).size }
  }
  // ── 管理员私信 ────────────────────────────────────────────────
  // 只有一个方向能发起：管理员找用户。用户只能在自己那条对话里回复，不能新建对话。
  const direct = () => db.collection(C.direct)
  const directBody = value => { const body = text(value, 300); if (body.length < 2) fail('请填写至少2个字的内容。'); return body }
  const isAdmin = async id => { try { await requireAdmin(id); return true } catch { return false } }
  // 客户端只传主页 profileId，openid 始终留在服务端。
  async function profileRow(profileId) { const key = text(profileId, 100); if (!key) fail('缺少对话用户。'); const row = await db.collection(C.profiles).doc(key).get().then(r => r.data).catch(() => null); if (!row || !row.ownerOpenId) fail('找不到这位用户。'); return row }
  // 新集合不依赖复合索引：取回后在内存里按时间排序。集合尚未创建时按空对话处理，避免拖垮消息汇总。
  const missing = error => /not.?exist|不存在|COLLECTION_NOT_EXIST/i.test(String(error && (error.errMsg || error.message) || ''))
  async function directQuery(run) { try { return await run() } catch (error) { if (missing(error)) return { data: [] }; throw error } }
  async function directRows(userUid) { return (await directQuery(() => direct().where({ userUid }).limit(100).get())).data }
  const directDto = (row, admin) => ({ id: row._id, body: row.body || '', fromAdmin: Boolean(row.fromAdmin), read: admin ? Boolean(row.adminRead) : Boolean(row.userRead), createdAt: row.createdAt })
  const threadOrder = (a, b) => time(a.createdAt) - time(b.createdAt)
  async function writeDirect(payload) {
    const data = { userUid: payload.userUid, senderUid: payload.senderUid, fromAdmin: Boolean(payload.fromAdmin), body: payload.body, userRead: Boolean(payload.userRead), adminRead: Boolean(payload.adminRead), createdAt: now() }
    const requestId = String(payload.clientRequestId || '')
    if (/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
      const documentId = 'dm_' + hash(payload.threadId + ':' + requestId)
      const ref = direct().doc(documentId); const old = await ref.get().then(r => r.data).catch(() => null)
      if (old && old.userUid === data.userUid && old.body === data.body) return old._id
      await ref.set({ data }); return documentId
    }
    const saved = await direct().add({ data }); return saved._id
  }
  async function myDirectMessages(id) {
    const rows = (await directRows(id)).filter(row => !row.userHidden)
    return rows.map(row => directDto(row, false)).sort(threadOrder)
  }
  async function adminDirectThreads(id) {
    await requireAdmin(id)
    const rows = (await directQuery(() => direct().limit(200).get())).data.filter(row => !row.adminHidden).sort((a, b) => time(b.createdAt) - time(a.createdAt))
    const threads = new Map()
    for (const row of rows) {
      if (!threads.has(row.userUid)) threads.set(row.userUid, { openId: row.userUid, lastBody: row.body || '', lastAt: row.createdAt, unread: 0 })
      if (!row.fromAdmin && !row.adminRead) threads.get(row.userUid).unread++
    }
    const profiles = await actorProfiles([...threads.keys()])
    return [...threads.values()].map(thread => { const p = profiles.get(thread.openId); return { profileId: p && p._id || '', name: p && p.foodieId || '同学', avatar: p && p.avatarFileId || '', lastBody: thread.lastBody, lastAt: thread.lastAt, unread: thread.unread } }).filter(thread => thread.profileId)
  }
  async function adminDirectThread(id, payload) {
    await requireAdmin(id)
    const row = await profileRow(payload.profileId)
    const rows = (await directRows(row.ownerOpenId)).filter(item => !item.adminHidden)
    return { profileId: row._id, name: row.foodieId || '同学', avatar: row.avatarFileId || '', messages: rows.map(item => directDto(item, true)).sort(threadOrder) }
  }
  async function sendDirectMessage(id, payload) {
    await requireAdmin(id)
    const row = await profileRow(payload.profileId), userUid = row.ownerOpenId
    if (userUid === id) fail('不需要给自己发私信。')
    const body = directBody(payload.body)
    await writeDirect({ threadId: userUid, userUid, senderUid: id, fromAdmin: true, body, userRead: false, adminRead: true, clientRequestId: payload.clientRequestId })
    return { ok: true }
  }
  async function replyDirectMessage(id, payload) {
    const admin = await isAdmin(id), userUid = admin ? (await profileRow(payload.profileId)).ownerOpenId : id
    if (!userUid) fail('缺少对话用户。')
    const body = directBody(payload.body)
    // 用户的回复只能落在自己那条对话里，管理员回复则写回对应用户的对话。
    await writeDirect({ threadId: userUid, userUid, senderUid: id, fromAdmin: admin, body, userRead: !admin, adminRead: admin, clientRequestId: payload.clientRequestId })
    return { ok: true }
  }
  async function readDirectMessages(id, payload) {
    const admin = await isAdmin(id), userUid = admin ? (await profileRow(payload.profileId)).ownerOpenId : id
    if (!userUid) fail('缺少对话用户。')
    const rows = (await directRows(userUid)).filter(row => (admin ? (!row.adminRead && !row.fromAdmin) : (!row.userRead && row.fromAdmin)))
    for (const row of rows) await direct().doc(row._id).update({ data: admin ? { adminRead: true, adminReadAt: now() } : { userRead: true, userReadAt: now() } })
    return { read: rows.length }
  }
  async function directSummary(id) {
    const admin = await isAdmin(id)
    if (admin) { const rows = (await directQuery(() => direct().where({ fromAdmin: false }).limit(100).get())).data; return { unreadCount: rows.filter(row => !row.adminHidden && !row.adminRead).length } }
    const rows = await directRows(id)
    return { unreadCount: rows.filter(row => !row.userHidden && row.fromAdmin && !row.userRead).length }
  }
  return { clearReadInteractions, adminClearReadIssues, listMyInteractions, myInteractionSummary, readInteraction, deleteInteraction, adminListIssues, adminIssueSummary, adminResolveIssue, adminReadIssue, adminArchiveIssue, myDirectMessages, adminDirectThreads, adminDirectThread, sendDirectMessage, replyDirectMessage, readDirectMessages, directSummary }
}

