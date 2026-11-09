// 反馈复用既有私有事件集合，按 type 隔离；只经云函数读写。
module.exports = function createFeedback({ db, collection, text, fail, profileFor, requireProfile, requireAdmin, chinaDay, now, requestKey, submissionId, adminFor, adminFlags }) {
  const type = 'app_feedback'
  function publicRow(row) { return { _id: row._id, category: row.category, content: row.content, readState: row.readState, createdAt: row.createdAt, lastActivityAt: row.lastActivityAt || row.createdAt, kind: row.kind || '', target: row.target || '', appealStatus: row.appealStatus || '', resolutionReason: row.resolutionReason || '', processingStatus: row.processingStatus || (row.replies?.some(r=>r.role==='admin')?'processing':'pending'), userUnread: row.userUnread === true, replies: (row.replies || []).map(reply => ({ _id: reply._id, role: reply.role, content: reply.content, createdAt: reply.createdAt, senderName:reply.senderName||'',processingStatus:reply.processingStatus||'' })) } }
  async function recentRows(where, limit) {
    const groups = await Promise.all(['createdAt', 'lastActivityAt'].map(field => db.collection(collection).where(where).orderBy(field, 'desc').limit(limit).get()))
    const time = row => new Date((row.lastActivityAt || row.createdAt) && ((row.lastActivityAt || row.createdAt).$date || row.lastActivityAt || row.createdAt) || 0).getTime() || 0
    return [...new Map(groups.flatMap(group => group.data).map(row => [row._id, row])).values()].sort((a, b) => time(b) - time(a))
  }
  async function submitFeedback(id, payload) {
    await requireProfile(id, { allowRestricted: true, allowBanned: true })
    if (await adminFor(id)) fail('管理员请在用户反馈中查看和回复用户。')
    const content = typeof payload.content === 'string' ? payload.content.trim() : ''; const category = text(payload.category, 20)
    if (!['使用问题', '功能建议', '地点纠错', '其他'].includes(category) || content.length < 2 || content.length > 500) fail('请选择反馈类型，并填写2～500字的反馈。')
    const request = requestKey(payload.clientRequestId); if (!request) fail('缺少反馈提交编号。')
    const documentId = 'fb_' + submissionId(id, request)
    const old = await db.collection(collection).doc(documentId).get().then(r => r.data).catch(error => { if (/not.?found|not.?exist|不存在/i.test(error.errMsg || error.message || '')) return null; throw error })
    if (old) { if (old.ownerOpenId !== id || old.type !== type) fail('反馈身份不匹配。'); if(old.content!==content||old.category!==category)fail('反馈编号与内容不匹配。'); return publicRow(old) }
    const count = await db.collection(collection).where({ type, ownerOpenId: id, submissionDay: chinaDay() }).limit(5).get()
    if (count.data.length >= 5) fail('每天最多提交5条反馈，已有反馈管理员会查看。')
    const data = { _id: documentId, type, ownerOpenId: id, category, content, processingStatus:'pending', readState: 'unread', submissionDay: chinaDay(), createdAt: now(), lastActivityAt: now() }
    try { await db.collection(collection).add({ data }) } catch (error) { const saved = await db.collection(collection).doc(documentId).get().then(r => r.data).catch(() => null); if (!saved || saved.ownerOpenId !== id) throw error; if(saved.content!==content||saved.category!==category)fail('反馈编号与内容不匹配。') }
    return publicRow((await db.collection(collection).doc(documentId).get()).data)
  }
  async function myFeedback(id) { const rows = await recentRows({ type, ownerOpenId: id }, 50); return rows.filter(row => row.kind !== 'account_appeal' && !row.userArchived).slice(0, 50).map(publicRow) }
  async function visibleAdminRows() {
    const groups = await Promise.all(['unread', 'read'].map(readState => recentRows({ type, readState }, 100)))
    const flags = await adminFlags(groups.flatMap(rows => rows.map(row => row.ownerOpenId)))
    return groups.flatMap(rows => rows.filter(row => !flags.has(row.ownerOpenId) && !row.adminArchived && row.kind !== 'account_appeal').slice(0, 100))
  }
  async function adminFeedbackSummary(id) { await requireAdmin(id); const [rows, appeals, unreadPendingAppeals] = await Promise.all([visibleAdminRows(), db.collection(collection).where({ type, kind: 'account_appeal', appealStatus: 'pending' }).count(), db.collection(collection).where({ type, kind: 'account_appeal', appealStatus: 'pending', readState: 'unread' }).count()]); return { unreadCount: rows.filter(row => row.readState === 'unread').length + unreadPendingAppeals.total, pendingAppealCount: appeals.total, unreadPendingAppealCount: unreadPendingAppeals.total } }
  async function adminListFeedback(id) {
    await requireAdmin(id)
    const rows = await visibleAdminRows(); const owners = [...new Set(rows.map(r => r.ownerOpenId))]
    const profiles = new Map(await Promise.all(owners.map(async owner => [owner, await profileFor(owner)])))
    return rows.map(row => { const profile = profiles.get(row.ownerOpenId); return { ...publicRow(row), profileId: profile && profile._id || '', authorNickname: profile && profile.foodieId || '未命名吃货', authorAvatarFileId: profile && profile.avatarFileId || '', authorHometown: profile && profile.hometown || '' } })
  }
  async function adminReadFeedback(id, payload) {
    await requireAdmin(id); const feedbackId = text(payload.feedbackId, 100)
    const row = await db.collection(collection).doc(feedbackId).get().then(r => r.data).catch(() => null)
    if (!row || row.type !== type) fail('反馈不存在。')
    await db.collection(collection).doc(feedbackId).update({ data: { readState: 'read', readAt: now(), readBy: id } })
    return { feedbackId, readState: 'read' }
  }
  async function feedbackReplySummary(id) { const rows = await myFeedback(id); return { unreadCount: rows.filter(row => row.userUnread).length } }
  async function readFeedbackReply(id, payload) {
    const key = text(payload.feedbackId, 100), ref = db.collection(collection).doc(key), row = await ref.get().then(r => r.data).catch(() => null)
    if (!row || row.type !== type || row.ownerOpenId !== id || row.kind === 'account_appeal') fail('这条反馈不属于你。')
    await ref.update({ data: { userUnread: false, userReadAt: now() } }); return { feedbackId: key, read: true }
  }
  async function replyFeedback(id, payload) {
    const content = typeof payload.content === 'string' ? payload.content.trim() : '', key = text(payload.feedbackId, 100), request = requestKey(payload.clientRequestId)
    if (!key || !request || content.length < 2 || content.length > 500) fail('请填写2～500字的回复。')
    const isAdmin = Boolean(await adminFor(id)), replyId = submissionId(id, request), sender=await profileFor(id), processingStatus=isAdmin?(payload.processingStatus||'processing'):'pending'
    if(isAdmin&&!['processing','resolved'].includes(processingStatus)||!isAdmin&&payload.processingStatus&&payload.processingStatus!=='pending')fail('处理状态无效。')
    await db.runTransaction(async transaction => {
      const ref = transaction.collection(collection).doc(key), row = await ref.get().then(r => r.data).catch(() => null)
      if (!row || row.type !== type || row.kind === 'account_appeal' || !isAdmin && row.ownerOpenId !== id) fail('无权回复这条反馈。')
      if (await adminFor(row.ownerOpenId)) fail('此入口只处理用户反馈。')
      const replies = row.replies || []
      const previous = replies.find(reply => reply._id === replyId && reply.senderOpenId === id)
      if (previous) { if (previous.content !== content || previous.processingStatus&&previous.processingStatus!==processingStatus) fail('回复编号与内容不匹配。'); return publicRow(row) }
      if (replies.length >= 20) fail('本条交流已满20条回复，请另提交反馈补充。')
      const patch = { processingStatus, resolutionReason:isAdmin&&processingStatus==='resolved'?content:row.resolutionReason||'', lastActivityAt: now(), adminArchived: false, userArchived: false, replies: [...replies, { _id: replyId, senderOpenId: id, role: isAdmin ? 'admin' : 'user', content, createdAt: now(),senderName:sender?.foodieId||'',processingStatus }], ...(isAdmin ? { readState: 'read', readBy: id, readAt: now(), userUnread: true, userArchived: false } : { readState: 'unread', adminArchived: false, userUnread: false }) }
      await ref.update({ data: patch }); return publicRow({ ...row, ...patch })
    })
    return publicRow((await db.collection(collection).doc(key).get()).data)
  }
  async function archiveFeedback(id, payload) {
    const key = text(payload.feedbackId, 100), isAdmin = Boolean(await adminFor(id))
    return db.runTransaction(async transaction => {
      const ref = transaction.collection(collection).doc(key), row = await ref.get().then(r => r.data).catch(() => null)
      if (!row || row.type !== type || row.kind === 'account_appeal' || !isAdmin && row.ownerOpenId !== id) fail('无权删除这条反馈。')
      await ref.update({ data: isAdmin ? { adminArchived: true, readState: 'read', adminArchivedBy: id, adminArchivedAt: now() } : { userArchived: true, userUnread: false, userArchivedAt: now() } })
      return { feedbackId: key, deleted: true }
    })
  }
  async function clearReadFeedback(id) {
    const isAdmin = Boolean(await adminFor(id)), rows = isAdmin ? await visibleAdminRows() : await recentRows({ type, ownerOpenId: id }, 50), deletedIds = []
    for (const row of rows) await db.runTransaction(async transaction => {
      const ref = transaction.collection(collection).doc(row._id), current = await ref.get().then(r => r.data).catch(() => null)
      if (!current || current.type !== type || current.kind === 'account_appeal' || current.readState !== 'read') return
      if (isAdmin ? current.adminArchived : current.ownerOpenId !== id || current.userArchived || current.userUnread) return
      await ref.update({ data: isAdmin ? { adminArchived: true, adminArchivedBy: id, adminArchivedAt: now() } : { userArchived: true, userArchivedAt: now() } }); deletedIds.push(row._id)
    })
    return { deletedIds: [...new Set(deletedIds)], deletedCount: new Set(deletedIds).size }
  }
  return { clearReadFeedback, submitFeedback, myFeedback, adminFeedbackSummary, adminListFeedback, adminReadFeedback, feedbackReplySummary, readFeedbackReply, replyFeedback, archiveFeedback }
}

