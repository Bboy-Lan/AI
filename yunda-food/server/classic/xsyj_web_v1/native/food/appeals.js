const crypto = require('crypto')
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)

// 申诉与既有反馈共用私有事件集合；已读不代表已处理。
module.exports = function createAppeals({ db, collection, profiles, fail, text, profileFor, requireAdmin, adminFor, adminFlags, adminProfileSummary, now, chinaDay, requestKey, submissionId }) {
  const type = 'app_feedback'; const kind = 'account_appeal'
  const active = (p, target) => target === 'account' ? p.accountStatus === 'banned' : p.moderationStatus === 'restricted'
  const revision = (p, target) => hash(JSON.stringify(target === 'account' ? [p.accountStatus, p.banReason || '', p.banUpdatedAt || null] : [p.moderationStatus, p.moderationReason || '', p.moderatedAt || null]))
  async function read(ref) { try { return (await ref.get()).data || null } catch (error) { if (/not.?found|not.?exist|不存在|DATABASE_DOCUMENT_NOT_EXIST/i.test(error.errMsg || error.message || '')) return null; throw error } }
  function publicRow(row) { return { _id: row._id, kind, category: '解禁申请', target: row.target, content: row.content, appealStatus: row.appealStatus, readState: row.readState, createdAt: row.createdAt, resolutionReason: row.resolutionReason || '', resolvedAt: row.resolvedAt || null } }
  async function submitAccountAppeal(id, payload) {
    const target = payload.target; const content = typeof payload.content === 'string' ? payload.content.trim() : ''
    if (!['account', 'publishing'].includes(target) || content.length < 2 || content.length > 500) fail('请选择申请类型，并填写2～500字的申请原因。')
    const request = requestKey(payload.clientRequestId); if (!request) fail('缺少申请提交编号。')
    const profile = await profileFor(id); if (!profile) fail('未找到你的账号资料，请联系管理员。')
    const key = 'appeal_' + submissionId(id, request); const old = await read(db.collection(collection).doc(key))
    if (old) { if (old.ownerOpenId !== id || old.kind !== kind) fail('申请身份不匹配。'); return publicRow(old) }
    const count = await db.collection(collection).where({ type, kind, ownerOpenId: id, submissionDay: chinaDay() }).limit(5).get()
    if (count.data.length >= 5) fail('每天最多提交5次解禁申请，请等待管理员处理。')
    return db.runTransaction(async transaction => {
      const saved = await read(transaction.collection(collection).doc(key)); if (saved) { if (saved.ownerOpenId !== id || saved.kind !== kind) fail('申请身份不匹配。'); return publicRow(saved) }
      const p = await read(transaction.collection(profiles).doc(profile._id))
      if (!p || p.ownerOpenId !== id || !active(p, target)) fail('该项限制已解除，请重新读取账号状态。')
      const token = revision(p, target); const slotId = 'appeal_slot_' + hash(id + ':' + target + ':' + token)
      const slotRef = transaction.collection(collection).doc(slotId); const slot = await read(slotRef)
      const previous = slot && await read(transaction.collection(collection).doc(slot.appealId))
      if (previous && previous.appealStatus === 'pending') return { ...publicRow(previous), alreadyPending: true }
      const data = { type, kind, category: '解禁申请', ownerOpenId: id, profileId: p._id, target, restrictionToken: token, content, appealStatus: 'pending', readState: 'unread', submissionDay: chinaDay(), createdAt: now() }
      await transaction.collection(collection).doc(key).set({ data })
      await slotRef.set({ data: { type: 'account_appeal_slot', appealId: key } })
      return publicRow({ _id: key, ...data })
    })
  }
  async function myAccountAppeals(id) { const rows = await db.collection(collection).where({ type, kind, ownerOpenId: id }).orderBy('createdAt', 'desc').limit(50).get(); return rows.data.map(publicRow) }
  async function adminListRestrictedProfiles(id) {
    await requireAdmin(id)
    const groups = await Promise.all([{ accountStatus: 'banned' }, { moderationStatus: 'restricted' }].map(where => db.collection(profiles).where(where).orderBy('updatedAt', 'desc').limit(100).get()))
    const rows = [...new Map(groups.flatMap(r => r.data).map(p => [p._id, p])).values()]; const flags = await adminFlags(rows.map(p => p.ownerOpenId))
    return rows.map(p => adminProfileSummary(p, flags.has(p.ownerOpenId)))
  }
  async function adminListAccountAppeals(id) {
    await requireAdmin(id)
    const rows = await db.collection(collection).where({ type, kind, appealStatus: 'pending' }).orderBy('createdAt', 'asc').limit(100).get()
    const owners = [...new Set(rows.data.map(r => r.ownerOpenId))]; const flags = await adminFlags(owners)
    const snapshots = new Map(await Promise.all(owners.map(async owner => [owner, await profileFor(owner)])))
    return rows.data.map(row => { const p = snapshots.get(row.ownerOpenId); return { ...publicRow(row), profile: p ? adminProfileSummary(p, flags.has(p.ownerOpenId)) : null } })
  }
  async function adminResolveAccountAppeal(id, payload) {
    await requireAdmin(id)
    const key = text(payload.appealId, 100); const decision = payload.decision; const reason = text(payload.reason, 120)
    if (!key || !['approved', 'rejected'].includes(decision) || reason.length < 2) fail('请选择处理结果并填写至少2个字的处理说明。')
    const initial = await read(db.collection(collection).doc(key)); if (!initial || initial.type !== type || initial.kind !== kind) fail('解禁申请不存在。')
    if (initial.ownerOpenId === id || await adminFor(initial.ownerOpenId)) fail('不能通过此入口处理管理员自身的限制。')
    // 申请与账号在同一事务提交；旧申请不能解除后来新增的处罚。
    return db.runTransaction(async transaction => {
      const appealRef = transaction.collection(collection).doc(key); const row = await read(appealRef)
      if (!row || row.kind !== kind) fail('解禁申请不存在。')
      if (row.appealStatus !== 'pending') { if (row.appealStatus === decision) return publicRow(row); fail('该申请已被处理，请重新读取。') }
      const profileRef = transaction.collection(profiles).doc(row.profileId); const p = await read(profileRef)
      if (!p || p.ownerOpenId !== row.ownerOpenId) fail('用户资料未能对应申请，请重新读取。')
      if (decision === 'approved' && active(p, row.target)) {
        if (revision(p, row.target) !== row.restrictionToken) fail('该账号的限制已有变化，不能用旧申请解除新限制。请查看资料后另行处理或驳回旧申请。')
        const patch = row.target === 'account' ? { accountStatus: 'active', banReason: '', banUpdatedAt: now() } : { moderationStatus: 'active', moderationReason: '', moderatedAt: now() }
        await profileRef.update({ data: { ...patch, updatedAt: now() } })
      }
      const patch = { appealStatus: decision, resolutionReason: reason, resolvedBy: id, resolvedAt: now(), readState: 'read', readBy: id, readAt: now() }
      await appealRef.update({ data: patch })
      return publicRow({ ...row, ...patch })
    })
  }
  return { submitAccountAppeal, myAccountAppeals, adminListRestrictedProfiles, adminListAccountAppeals, adminResolveAccountAppeal }
}

