const STORAGE_KEY = 'daylist-todos-v1';
const seed = [
  { id: 1, text: '整理本周的工作计划', done: true },
  { id: 2, text: '给家人打一个电话', done: false },
  { id: 3, text: '阅读 270 页书', done: false },
  { id: 4, text: '下班后去散步', done: false }
];
let todos = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || seed;
let filter = 'all';

const list = document.querySelector('#todo-list');
const input = document.querySelector('#todo-input');
const form = document.querySelector('#todo-form');
const empty = document.querySelector('#empty-state');

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(todos)); }
function render() {
  const visible = todos.filter(t => filter === 'all' || (filter === 'active' ? !t.done : t.done));
  list.innerHTML = visible.map(t => `<li class="todo-item ${t.done ? 'done' : ''}" data-id="${t.id}">
    <input class="check" type="checkbox" ${t.done ? 'checked' : ''} aria-label="完成任务" />
    <span class="todo-text">${escapeHtml(t.text)}</span>
    <span class="todo-meta">${t.done ? '完成' : '待完成'}</span>
    <button class="delete" type="button" aria-label="删除任务" title="删除">×</button>
  </li>`).join('');
  empty.hidden = visible.length > 0;
  document.querySelector('#empty-title').textContent = filter === 'completed' ? '还没有已完成的任务' : filter === 'active' ? '太棒了，暂时没有待办' : '还没有任务';
  document.querySelector('#empty-hint').textContent = filter === 'all' ? '从上方添加一项，开始你的今天。' : '完成一项任务，继续保持节奏。';
  const completed = todos.filter(t => t.done).length;
  document.querySelector('#all-count').textContent = todos.length;
  document.querySelector('#active-count').textContent = todos.length - completed;
  document.querySelector('#completed-count').textContent = completed;
  document.querySelector('#task-count').textContent = todos.length - completed;
  const pct = todos.length ? Math.round(completed / todos.length * 100) : 0;
  document.querySelector('#progress-text').textContent = `${pct}%`;
  document.querySelector('#progress-bar').style.width = `${pct}%`;
}
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
form.addEventListener('submit', e => { e.preventDefault(); const text = input.value.trim(); if (!text) return; todos.unshift({ id: Date.now(), text, done: false }); save(); input.value = ''; filter = 'all'; setActiveFilter(); render(); input.focus(); });
list.addEventListener('click', e => { const item = e.target.closest('.todo-item'); if (!item) return; const id = Number(item.dataset.id); if (e.target.matches('.delete')) { todos = todos.filter(t => t.id !== id); save(); render(); } });
list.addEventListener('change', e => { if (!e.target.matches('.check')) return; const id = Number(e.target.closest('.todo-item').dataset.id); const todo = todos.find(t => t.id === id); todo.done = e.target.checked; save(); render(); });
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; setActiveFilter(); render(); }));
document.querySelector('#clear-completed').addEventListener('click', () => { todos = todos.filter(t => !t.done); save(); render(); });
function setActiveFilter() { document.querySelectorAll('.filter').forEach(b => { const active = b.dataset.filter === filter; b.classList.toggle('active', active); b.setAttribute('aria-selected', active); }); }
const today = new Intl.DateTimeFormat('zh-CN', { weekday:'short', month:'short', day:'numeric' }).format(new Date());
document.querySelector('#today').textContent = today;
render();
