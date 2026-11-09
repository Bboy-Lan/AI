function time(row) { const replies = row.replies || [], value = row.lastActivityAt || (replies[replies.length - 1] || {}).createdAt || row.createdAt; return new Date(value && (value.$date || value) || 0).getTime() || 0 }
function urgent(row, mode, admin) { return mode === 'feedback' ? admin ? row.readState === 'unread' : row.userUnread || row.readState === 'unread' : mode === 'issues' ? row.status === 'pending' || !row.read : !row.read }
function sort(rows, mode, admin) { return [...rows].sort((a, b) => Number(urgent(b, mode, admin)) - Number(urgent(a, mode, admin)) || time(b) - time(a) || String(a._id).localeCompare(String(b._id))) }
function clearable(row, mode, admin) { return mode === 'feedback' ? row.kind !== 'account_appeal' && (admin ? row.readState === 'read' : !row.userUnread && row.readState === 'read') : row.read === true && (mode !== 'issues' || row.status === 'resolved') }
module.exports = { sort, time, urgent, clearable }
