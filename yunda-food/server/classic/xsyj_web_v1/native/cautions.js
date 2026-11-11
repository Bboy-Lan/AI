// Store experiences only. No comments, replies, discussion topics or live chat.
module.exports = function createCautions({ db, fail, text, now, chinaDay, requireProfile, profileFor, adminFor, requireAdmin, assertSafeText, hash }) {
  const C = { posts: 'xsyj_caution_posts', likes: 'xsyj_caution_likes', reports: 'xsyj_caution_reports', messages: 'xsyj_caution_messages', meta: 'xsyj_caution_meta', audit: 'xsyj_caution_audit' }
  const tags = ['味道', '食材', '价格', '服务', '卫生', '其他']
  const doc = async (store, name, id) => {
    try { return (await store.collection(name).doc(id).get()).data }
    catch (error) { if (/not found|not exist|不存在|DOCUMENT_NOT_FOUND/i.test(error.message || error.errMsg || '')) return null; throw error }
  }
  const write = (tx, name, id, data) => { const { _id, ...fields } = data; return tx.collection(name).doc(id).set({ data: fields }) }
  const sequence = async tx => {
    const row = await doc(tx, C.meta, 'sequence'), value = Number(row && row.value || 0) + 1
    await write(tx, C.meta, 'sequence', { value }); return String(value).padStart(16, '0')
  }
  async function quota(tx, actor, kind, limit) {
    const id = hash(actor, chinaDay(), kind), row = await doc(tx, C.meta, id), value = Number(row && row.value || 0)
    if (value >= limit) fail(`今天的${kind}已达${limit}条，请明天再试。`)
    await write(tx, C.meta, id, { value: value + 1 })
  }
  function key(value) { if (!/^[a-zA-Z0-9_-]{8,100}$/.test(value || '')) fail('提交标识无效，请保留内容并重试。'); return value }
  const prefix = id => 'xsyj-media/' + hash(id) + '/'
  function images(actor, input) {
    if (!Array.isArray(input) || input.length > 3 || input.some(v => typeof v !== 'string' || v.length > 350 || !v.startsWith('cloud://') || !v.includes('/' + prefix(actor)) || v.includes('..'))) fail('请使用本人上传的照片，最多3张。')
    return [...new Set(input)]
  }
  const clean = (value, min, max, label, quoting = false) => { const v = text(value, max + 1); if (v.length < min || v.length > max) fail(`${label}需${min}至${max}个字。`); if (!quoting) assertSafeText(v, label); return v }
  function content(actor, p) {
    const name = clean(p.name, 1, 50, '店铺名称'), dish = clean(p.dish, 1, 40, '美食名称'), address = clean(p.address, 2, 120, '具体地址'), body = clean(p.body, 10, 1000, '消费经历')
    // 消费日期不再是必填项；老记录带日期时仍校验格式，避免脏数据写回。
    const occurredOn = text(p.occurredOn, 10)
    if (occurredOn && (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || !Number.isFinite(Date.parse(occurredOn)) || new Date(occurredOn).toISOString().slice(0, 10) !== occurredOn || occurredOn > chinaDay())) fail('请选择有效的消费日期，不能晚于今天。')
    if (!Array.isArray(p.tags) || p.tags.length < 1 || p.tags.length > 3 || p.tags.some(v => !tags.includes(v))) fail('请选择1至3项具体问题。')
    if (p.confirmed !== true) fail('请确认亲自消费并如实描述。')
    return { name, dish, address, body, occurredOn, tags: [...new Set(p.tags)], imageFileIds: images(actor, p.imageFileIds || []) }
  }
  async function author(actor) {
    const p = await profileFor(actor)
    return p ? { profileId: p._id, nickname: p.foodieId || '吃货同学', avatar: p.avatarFileId || '', hometown: p.hometown || '',isAdmin:Boolean(await adminFor(actor)), exp: Math.max(0, Math.floor(Number(p.activityExp) || 0)), streak: Number.isInteger(p.activityStreak) && p.activityStreak > 0 ? p.activityStreak : 0 } : { nickname: '吃货同学', avatar: '', hometown: '' }
  }
  async function expose(row, actor) {
    const own = row.ownerOpenId === actor, admin = Boolean(await adminFor(actor))
    const result = { id: row._id, postId: row.postId || '', name: row.name || '', dish: row.dish || '', address: row.address || '', body: row.body, tags: row.tags || [], occurredOn: row.occurredOn || '', imageFileIds: row.imageFileIds || [], status: row.status, version: row.version, sequence: row.sequence, createdAt: row.createdAt, updatedAt: row.updatedAt, likeCount: row.likeCount || 0, own, author: await author(row.ownerOpenId) }
    if (own || admin) { result.reason = row.reason || ''; result.rejectedImages = (row.rejectedImages || []).map(v => ({ fileId: v.fileId, reason: v.reason || '' })) }
    if(row.reviewTag==='deleted'&&!admin){result.body='此消费经历已删除，处理意见请查看互动消息。';result.imageFileIds=[]}
    Object.assign(result,require('../moderation.cjs').fields(row));return result
  }
  async function visible(actor, id) {
    const row = await doc(db, C.posts, text(id, 100))
    if (!row || row.status !== 'published' && row.ownerOpenId !== actor && !await adminFor(actor)) fail('这条经历暂不可查看。')
    return row
  }
  async function page(name, where, after, direction = 'desc') {
    if (after && !/^\d{16}$/.test(after)) fail('分页标识无效，请刷新列表。')
    const filter = after ? { ...where, sequence: direction === 'desc' ? db.command.lt(after) : db.command.gt(after) } : where
    const result = await db.collection(name).where(filter).orderBy('sequence', direction).limit(21).get()
    const rows = result.data.slice(0, 20)
    return { rows, next: result.data.length > 20 ? rows[rows.length - 1].sequence : '' }
  }
  async function notify(tx, recipient, kind, target, source, body) {
    if (!recipient) return
    const id = hash(recipient, kind, target, source)
    if (await doc(tx, C.messages, id)) return
    await write(tx, C.messages, id, { ownerOpenId: recipient, kind, postId: target, body, read: false, archived: false, sequence: await sequence(tx), createdAt: now() })
  }
  async function cautionContext(actor) { return { isAdmin: Boolean(await adminFor(actor)), uploadPrefix: prefix(actor) } }
  async function cautionList(actor, p) {
    const result = await page(C.posts, p.mine === true ? { ownerOpenId: actor } : { status: 'published' }, p.after)
    return { rows: await Promise.all(result.rows.map(r => expose(r, actor))), next: result.next }
  }
  async function cautionGet(actor, p) {
    const row = await visible(actor, p.id), like = await doc(db, C.likes, hash(actor, row._id))
    return { post: await expose(row, actor), liked: Boolean(like && like.active), isAdmin: Boolean(await adminFor(actor)) }
  }
  async function cautionSave(actor, p) {
    await requireProfile(actor); const data = content(actor, p), request = key(p.requestId)
    const id = text(p.id, 100) || hash(actor, request), receipt = hash('save', actor, request), fingerprint = hash(id, data, p.version || 0)
    await db.runTransaction(async tx => {
      const done = await doc(tx, C.meta, receipt)
      if (done) { if (done.postId !== id || done.fingerprint && done.fingerprint !== fingerprint) fail('提交标识与经历内容不一致，请保留输入并重新提交。'); return }
      const old = await doc(tx, C.posts, id)
      if (p.id && !old) fail('原经历不存在。')
      if (old && old.ownerOpenId !== actor) fail('只能编辑自己的消费经历。')
      if (old && Number(p.version) !== old.version) fail('经历已更新，请重新打开后编辑。')
      require('../review-policy.cjs').assertEditable(old,p,fail)
      await quota(tx, actor, '经历提交', 3)
      await write(tx, C.posts, id, { ...old, ...data, ownerOpenId: actor, status: Boolean(await adminFor(actor))&&(!old||!['hidden','rejected'].includes(old.status))?'published':'pending', reason: '', version: (old && old.version || 0) + 1, likeCount: old && old.likeCount || 0, sequence: old && old.sequence || await sequence(tx), createdAt: old && old.createdAt || now(), updatedAt: now(), ...require('../review-policy.cjs').resubmit(old,Boolean(await adminFor(actor))) })
      await write(tx, C.meta, receipt, { postId: id, fingerprint, ownerOpenId: actor })
    })
    return cautionGet(actor, { id })
  }
  async function cautionWithdraw(actor, p) {
    return db.runTransaction(async tx => {
      const row = await doc(tx, C.posts, text(p.id, 100))
      if (!row || row.ownerOpenId !== actor) fail('只能撤回自己的消费经历。')
      if (row.status === 'withdrawn') return { status: 'withdrawn' }
      if (row.version !== Number(p.version)) fail('内容版本已变化，请刷新后撤回。')
      await tx.collection(C.posts).doc(row._id).update({ data: { status: 'withdrawn', version: row.version + 1, updatedAt: now(), reason: '作者主动撤回' } })
      await write(tx, C.audit, hash(row._id, row.version + 1), { actor, target: row._id, action: 'withdraw', reason: '作者主动撤回', snapshot: { body: row.body, version: row.version }, createdAt: now() })
      return { status: 'withdrawn' }
    })
  }
  async function cautionLike(actor, p) {
    await requireProfile(actor); if (typeof p.liked !== 'boolean') fail('点赞状态无效。')
    return db.runTransaction(async tx => {
      const post = await doc(tx, C.posts, text(p.id, 100)); if (!post || post.status !== 'published') fail('该经历暂不能点赞。')
      const id = hash(actor, post._id), old = await doc(tx, C.likes, id), active = Boolean(old && old.active)
      if (active !== p.liked) {
        await write(tx, C.likes, id, { ownerOpenId: actor, postId: post._id, active: p.liked })
        await tx.collection(C.posts).doc(post._id).update({ data: { likeCount: Math.max(0, (post.likeCount || 0) + (p.liked ? 1 : -1)) } })
        if (p.liked && post.ownerOpenId !== actor) await notify(tx, post.ownerOpenId, 'like', post._id, actor, '有同学赞了你的消费经历')
      }
      return { liked: p.liked, likeCount: Math.max(0, (post.likeCount || 0) + (active === p.liked ? 0 : p.liked ? 1 : -1)) }
    })
  }
  async function cautionReport(actor, p) {
    await requireProfile(actor); const reason = clean(p.reason, 2, 300, '举报说明', true), type = 'post'
    if (p.target && p.target !== 'post') fail('当前仅支持举报消费经历。')
    const id = hash(actor, key(p.requestId))
    return db.runTransaction(async tx => {
      const old = await doc(tx, C.reports, id); if (old) { if (old.postId !== p.id || old.reason !== reason) fail('举报提交标识与内容不一致。'); return { id, status: old.status } }
      const target = await doc(tx, C.posts, text(p.id, 100))
      if (!target || target.status !== 'published') fail('该内容暂不可举报。')
      const parent = target
      if (!parent || parent.status !== 'published') fail('该经历暂不可举报。')
      await quota(tx, actor, '举报', 10)
      await write(tx, C.reports, id, { ownerOpenId: actor, postId: parent._id, targetId: target._id, target: type, snapshot: { name: parent.name, dish: parent.dish || '', body: target.body, address: parent.address, tags: target.tags || [], imageFileIds: target.imageFileIds || [], version: target.version, authorOpenId: target.ownerOpenId }, reason, status: 'pending', read: false, archived: false, resolution: '', sequence: await sequence(tx), createdAt: now() })
      return { id, status: 'pending' }
    })
  }
  async function cautionModerate(actor, p) {
    await requireAdmin(actor)
    if (p.target && !['post', 'report'].includes(p.target)) fail('不支持这类管理操作。')
    const reason = clean(p.reason, 2, 120, '处理原因', true)
    if (!['approve', 'reject', 'hide', 'restore', 'resolve'].includes(p.action)) fail('处理操作无效。')
    return db.runTransaction(async tx => {
      if (p.action === 'resolve') {
        const row = await doc(tx, C.reports, text(p.id, 100)); if (!row) fail('举报不存在。')
        if (row.status === 'resolved') return { status: 'resolved' }
        await tx.collection(C.reports).doc(row._id).update({ data: { status: 'resolved', resolution: reason, resolvedAt: now() } })
        await notify(tx, row.ownerOpenId, 'report_result', row.postId, row._id, '举报处理结果：' + reason)
        await write(tx, C.audit, hash('report', row._id), { actor, target: row._id, action: 'resolve', reason, createdAt: now() })
        return { status: 'resolved' }
      }
      const row = await doc(tx, C.posts, text(p.id, 100)); if (!row) fail('内容不存在。')
      if (Number(p.version) !== row.version) fail('内容版本已变化，请重新查看后处理。')
      const allowed = { approve: ['pending'], reject: ['pending'], hide: ['published'], restore: ['hidden'] }
      if (!allowed[p.action].includes(row.status)) fail('当前状态不支持这项操作，请刷新。')
      const status = ['approve', 'restore'].includes(p.action) ? 'published' : p.action === 'reject' ? 'rejected' : 'hidden'
      await tx.collection(C.posts).doc(row._id).update({ data: { status, reason, version: row.version + 1, updatedAt: now() } })
      await notify(tx, row.ownerOpenId, 'moderation', row._id, row._id + ':' + (row.version + 1), '消费经历' + (status === 'published' ? '已公开' : status === 'hidden' ? '已下架' : '未通过审核') + '：' + reason)
      await write(tx, C.audit, hash(row._id, row.version + 1), { actor, target: row._id, targetType: 'post', action: p.action, reason, snapshot: { body: row.body, version: row.version }, createdAt: now() })
      return { status }
    })
  }
  async function cautionQueue(actor, p) {
    await requireAdmin(actor)
    const type = ['reports', 'published', 'hidden'].includes(p.type) ? p.type : 'posts'
    if (p.type === 'comments') fail('当前不提供留言管理。')
    const name = type === 'reports' ? C.reports : C.posts
    const status = type === 'reports' && p.status === 'resolved' ? 'resolved' : type === 'published' ? 'published' : type === 'hidden' ? 'hidden' : 'pending'
    const result = await page(name, { status }, p.after)
    const rows = await Promise.all(result.rows.filter(r => type !== 'reports' || !r.archived).map(async r => {
      if (type !== 'reports') return { ...await expose(r, actor), target: 'post' }
      const { authorOpenId, ...snapshot } = r.snapshot
      return { id: r._id, postId: r.postId, targetId: r.targetId, target: r.target, reason: r.reason, resolution: r.resolution || '', read: !!r.read, snapshot, reportedAuthor: await author(authorOpenId), reporter: await author(r.ownerOpenId), createdAt: r.createdAt, status: r.status }
    }))
    return { rows, next: result.next }
  }
  async function cautionMessages(actor, p) {
    const phase = p.phase === 'read' ? 'read' : 'unread'
    const result = await page(C.messages, { ownerOpenId: actor, archived: false, read: phase === 'read' }, p.after)
    return { rows: result.rows.map(r => ({ id: r._id, postId: r.postId, body: r.body, read: r.read, createdAt: r.createdAt })), next: result.next, nextPhase: result.next ? phase : phase === 'unread' ? 'read' : '' }
  }
  async function cautionMessageAction(actor, p) {
    if (!['read', 'delete', 'clear'].includes(p.action)) fail('消息操作无效。')
    if (p.action === 'clear') {
      const rows = await db.collection(C.messages).where({ ownerOpenId: actor, read: true, archived: false }).limit(100).get()
      for (const row of rows.data) await db.collection(C.messages).doc(row._id).update({ data: { archived: true } })
      return { count: rows.data.length, more: rows.data.length === 100 }
    }
    return db.runTransaction(async tx => {
      const row = await doc(tx, C.messages, text(p.id, 100)); if (!row || row.ownerOpenId !== actor) fail('只能操作自己的消息。')
      await tx.collection(C.messages).doc(row._id).update({ data: p.action === 'read' ? { read: true } : { archived: true } }); return { ok: true }
    })
  }
  async function cautionReportAction(actor, p) {
    await requireAdmin(actor)
    if (!['read', 'delete', 'clear'].includes(p.action)) fail('举报操作无效。')
    if (p.action === 'clear') {
      let count = 0
      for (;;) {
        const rows = await db.collection(C.reports).where({ status: 'resolved', read: true, archived: db.command.neq(true) }).limit(100).get()
        for (const row of rows.data) await db.collection(C.reports).doc(row._id).update({ data: { archived: true } })
        count += rows.data.length; if (rows.data.length < 100) break
      }
      return { count }
    }
    return db.runTransaction(async tx => {
      const row = await doc(tx, C.reports, text(p.id, 100)); if (!row) fail('举报不存在。')
      if (p.action === 'delete' && row.status !== 'resolved') fail('请先记录举报处理结果，再清理记录。')
      await tx.collection(C.reports).doc(row._id).update({ data: p.action === 'read' ? { read: true } : { archived: true } }); return { ok: true }
    })
  }
  async function cautionSummary(actor) {
    const unread = await db.collection(C.messages).where({ ownerOpenId: actor, read: false, archived: false }).count()
    let pendingCount = 0
    if (await adminFor(actor)) { const counts = await Promise.all([C.posts, C.reports].map(name => db.collection(name).where({ status: 'pending' }).count())); pendingCount = counts.reduce((sum, r) => sum + r.total, 0) }
    return { unreadCount: unread.total, pendingCount }
  }
  return { cautionContext, cautionList, cautionGet, cautionSave, cautionWithdraw, cautionLike, cautionReport, cautionModerate, cautionQueue, cautionMessages, cautionMessageAction, cautionReportAction, cautionSummary }
}

