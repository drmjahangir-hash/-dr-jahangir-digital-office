'use strict';

/* ============================================================================
   PERSONAL PLANNER — JM Digital Office v1.5.0
   ----------------------------------------------------------------------------
   The central command centre of JM Digital Office: tasks, calendar, goals,
   habits, journal, notes, documents, travel, finance reminders, birthdays,
   contacts, reports and settings — all offline, all local (IndexedDB via
   idb.js), no server, no login.

   Architecture mirrors the other JM Digital Office modules (see rental/app.js
   for the sibling pattern this was built from): a single in-memory `db`
   object mirrors persisted data for fully synchronous rendering, a `state`
   object tracks the current view, `goto()`/`render()` drive navigation, and
   `openModal()`/`closeModal()` handle all create/edit forms. The one
   deliberate difference is the persistence layer itself: IndexedDB instead
   of localStorage (see idb.js), because this module is expected to
   accumulate far more data over time than the others.
============================================================================ */

/* ---------------------------------------------------------------------- */
/* CONSTANTS: categories, priorities, statuses, recurrence                */
/* ---------------------------------------------------------------------- */

const BUILT_IN_CATEGORIES = [
  'Personal','Office','WBCYN','Clinic','Rental','Trust','Finance','Health',
  'Exercise','Yoga','Walking','Trekking','Travel','Family','Shopping',
  'Reading','Education','Research','Social','Miscellaneous'
];

const PRIORITIES = [
  { id: 'critical', label: 'Critical', color: 'red' },
  { id: 'high', label: 'High', color: 'orange' },
  { id: 'medium', label: 'Medium', color: 'yellow' },
  { id: 'low', label: 'Low', color: 'blue' },
  { id: 'none', label: 'No Priority', color: 'grey' },
];

const STATUSES = [
  { id: 'pending', label: 'Pending', color: 'grey' },
  { id: 'scheduled', label: 'Scheduled', color: 'blue' },
  { id: 'in-progress', label: 'In Progress', color: 'orange' },
  { id: 'waiting', label: 'Waiting', color: 'purple' },
  { id: 'completed', label: 'Completed', color: 'green' },
  { id: 'cancelled', label: 'Cancelled', color: 'red' },
  { id: 'archived', label: 'Archived', color: 'grey' },
];

const RECUR_OPTIONS = ['None','Daily','Weekdays','Weekends','Weekly','Monthly','Yearly','Custom'];

const REMINDER_TIMING_OPTIONS = [
  { id: 5, label: '5 Minutes' }, { id: 10, label: '10 Minutes' }, { id: 30, label: '30 Minutes' },
  { id: 60, label: '1 Hour' }, { id: 120, label: '2 Hours' }, { id: 1440, label: '1 Day' },
  { id: 10080, label: '1 Week' }, { id: -1, label: 'Custom' },
];

const REMINDER_MODES = ['Notification','Alarm','Popup','Silent Reminder'];

function priorityMeta(id){ return PRIORITIES.find(p=>p.id===id) || PRIORITIES[4]; }
function statusMeta(id){ return STATUSES.find(s=>s.id===id) || STATUSES[0]; }
function allCategories(){ return BUILT_IN_CATEGORIES.concat((db.settings.customCategories||[])); }

/* ---------------------------------------------------------------------- */
/* UTILITIES                                                              */
/* ---------------------------------------------------------------------- */

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function pad2(n){ return String(n).padStart(2, '0'); }

// Local-timezone-safe date key — NEVER use toISOString() for this (it
// converts to UTC first and can shift the calendar date near midnight in
// timezones behind/ahead of UTC).
function ymd(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
function todayYMD(){ return ymd(new Date()); }

// Date-math helpers for the Calendar (no library, plain Date arithmetic).
// Week starts on Monday throughout, per project convention chosen for this
// module.
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function addMonths(d,n){ const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
function startOfWeekMonday(d){
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0) ? -6 : 1 - day; // shift back to Monday
  return addDays(x, diff);
}
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_NAMES_MON_FIRST = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function escapeHtml(str){
  if(str===null || str===undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDate(dateStr){
  if(!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if(isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}

function formatDateLong(dateStr){
  if(!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if(isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function formatTime(t){
  if(!t) return '';
  const [h,m] = t.split(':').map(Number);
  const hh = ((h+11)%12)+1;
  return hh + ':' + pad2(m) + ' ' + (h<12?'AM':'PM');
}

function formatCurrency(n){
  const num = Number(n)||0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function daysBetween(dateStr, fromStr){
  const a = new Date(dateStr+'T00:00:00'), b = new Date(fromStr+'T00:00:00');
  return Math.round((a-b)/(1000*60*60*24));
}

function nowTimestampShort(){
  const d = new Date();
  return d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'-'+pad2(d.getHours())+pad2(d.getMinutes());
}

function downloadFile(filename, text, mime){
  const blob = new Blob([text], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

function csvEscape(val){
  const s = val===null||val===undefined ? '' : String(val);
  return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function exportCSV(filename, columns, rows){
  const header = columns.map((c)=>csvEscape(c.label)).join(',');
  const body = rows.map((r)=>columns.map((c)=>csvEscape(typeof c.value==='function'?c.value(r):r[c.value])).join(',')).join('\n');
  downloadFile(filename, header+'\n'+body, 'text/csv');
}

/* ---------------------------------------------------------------------- */
/* DATA LAYER — IndexedDB-backed, synchronous in-memory mirror            */
/* ---------------------------------------------------------------------- */

const MIRRORED_STORES = ['tasks','reminders','goals','habits','habitLogs','notes','documents','contacts','trips','assignments','people'];

let db = null;

function freshSettings(){
  return {
    key: 'settings',
    ownerName: 'Personal Planner',
    theme: 'light',
    fontSize: 'medium',
    customCategories: [],
    nextIds: {},
    pinHash: null,
    pinSalt: null,
    notifyPermissionOptIn: false,
    installBannerDismissed: false,
  };
}

function ensureSettingsShape(loaded){
  return Object.assign(freshSettings(), loaded||{});
}

async function loadDB(){
  await IDB.open();
  db = {};
  const results = await Promise.all(MIRRORED_STORES.map((s)=>IDB.getAll(s)));
  MIRRORED_STORES.forEach((s,i)=>{ db[s] = results[i]; });
  const settingsRows = await IDB.getAll('settings');
  const settingsRow = settingsRows.find((r)=>r.key==='settings');
  db.settings = ensureSettingsShape(settingsRow);
}

function nextId(prefix, counterKey){
  const n = db.settings.nextIds[counterKey] || 1;
  db.settings.nextIds[counterKey] = n + 1;
  saveSettings();
  return prefix + '-' + String(n).padStart(4, '0');
}

function saveRecord(store, record){
  const arr = db[store];
  const idx = arr.findIndex((r)=>r.id===record.id);
  if(idx>=0) arr[idx] = record; else arr.push(record);
  IDB.put(store, record).catch((err)=>console.error('IDB put failed', store, err));
  return record;
}

function deleteRecord(store, id){
  db[store] = db[store].filter((r)=>r.id!==id);
  IDB.delete(store, id).catch((err)=>console.error('IDB delete failed', store, err));
}

function saveSettings(){
  IDB.put('settings', db.settings).catch((err)=>console.error('IDB settings put failed', err));
}

// Attachments (photos, voice notes) are deliberately NOT part of the
// in-memory `db` mirror — loading every Blob at boot would defeat the whole
// point of using IndexedDB for a module expected to accumulate years of
// data. They're written directly to IndexedDB and only fetched by id when a
// note that references them is actually opened.
function saveAttachmentBlob(ownerType, blobType, mimeType, blob, fileName){
  const id = uid();
  const record = { id, ownerType, blobType, mimeType, blob, fileName: fileName||'', createdAt: new Date().toISOString() };
  IDB.put('attachments', record).catch((err)=>console.error('IDB attachment put failed', err));
  return id;
}
function loadAttachment(id){ return IDB.get('attachments', id); }
function deleteAttachment(id){ return IDB.delete('attachments', id).catch((err)=>console.error('IDB attachment delete failed', err)); }

/* ---------------------------------------------------------------------- */
/* STATE + NAVIGATION                                                     */
/* ---------------------------------------------------------------------- */

const MAIN_NAV = [
  { id:'dashboard', label:'Dashboard', icon:'🏠' },
  { id:'calendar', label:'Calendar', icon:'📅' },
  { id:'tasks', label:'Tasks', icon:'✅' },
  { id:'goals', label:'Goals', icon:'🎯' },
  { id:'reports', label:'Reports', icon:'📊' },
  { id:'settings', label:'Settings', icon:'⚙️' },
];

// Secondary destinations, reachable from the Dashboard "Quick Links" hub and
// mirrored under Settings → Modules (bottom nav is intentionally capped at
// the 6 MAIN_NAV entries requested).
const HUB_LINKS = [
  { id:'assignments', label:'Assignments', icon:'📋' },
  { id:'habits', label:'Habit Tracker', icon:'🔥' },
  { id:'journal', label:'Journal', icon:'📔' },
  { id:'notes', label:'Quick Notes', icon:'📝' },
  { id:'reminders', label:'Reminders', icon:'🔔' },
  { id:'travel', label:'Travel Planner', icon:'✈️' },
  { id:'financeReminders', label:'Finance Reminders', icon:'💳' },
  { id:'birthdays', label:'Birthdays', icon:'🎂' },
  { id:'contacts', label:'Contacts', icon:'📇' },
  { id:'documents', label:'Document Links', icon:'🗄️' },
  { id:'aiCentre', label:'AI Command Centre', icon:'🤖' },
];

const state = {
  view: 'dashboard',
  editingId: null,
  search: '',
  taskFilter: { status:'', category:'', priority:'', sort:'date' },
  calView: 'month',
  calCursor: new Date(),
  assignmentView: 'dashboard',
  assignmentFilter: { status:'', category:'', priority:'', sort:'date' },
  overdueSort: 'daysOverdue',
};

function goto(view, id){
  state.view = view;
  state.editingId = id || null;
  render();
  window.scrollTo(0,0);
}

function mainNavActiveId(){
  if(MAIN_NAV.some((n)=>n.id===state.view)) return state.view;
  return null;
}

function renderNav(){
  const activeMain = mainNavActiveId();
  const buttonsHtml = (wrapIcon) => MAIN_NAV.map((n)=>`
    <button data-nav="${n.id}" class="${activeMain===n.id?'active':''}">
      ${wrapIcon ? `<span class="ic">${n.icon}</span><span class="lbl">${n.label}</span>` : `${n.icon} ${n.label}`}
    </button>`).join('');

  document.getElementById('topnav').innerHTML = buttonsHtml(false);
  document.getElementById('bottomnav').innerHTML = buttonsHtml(true);

  document.querySelectorAll('[data-nav]').forEach((b)=>{
    b.addEventListener('click', ()=>goto(b.getAttribute('data-nav')));
  });
}

function render(){
  renderNav();
  const app = document.getElementById('app');
  const id = state.editingId;
  switch(state.view){
    case 'dashboard': app.innerHTML = renderDashboard(); break;
    case 'calendar': app.innerHTML = renderCalendar(); break;
    case 'tasks': app.innerHTML = renderTasks(); break;
    case 'goals': app.innerHTML = renderGoals(); break;
    case 'reports': app.innerHTML = renderReports(); break;
    case 'settings': app.innerHTML = renderSettings(); break;
    case 'habits': app.innerHTML = renderHabits(); break;
    case 'journal': app.innerHTML = renderNotesList('journal'); break;
    case 'notes': app.innerHTML = renderNotesList('quick'); break;
    case 'travel': app.innerHTML = renderTravel(); break;
    case 'financeReminders': app.innerHTML = renderReminders('finance'); break;
    case 'birthdays': app.innerHTML = renderReminders('birthday'); break;
    case 'reminders': app.innerHTML = renderReminders('generic'); break;
    case 'contacts': app.innerHTML = renderContacts(); break;
    case 'documents': app.innerHTML = renderDocuments(); break;
    case 'assignments': app.innerHTML = renderAssignmentsModule(); break;
    case 'aiCentre': app.innerHTML = renderAiCentre(); break;
    default: app.innerHTML = renderDashboard();
  }
  wireDelegatedActions();
  wireSearchBox();
  updateNotifBadge();
}

/* Generic event delegation for [data-action]/[data-id] buttons rendered by
   any view — avoids re-binding listeners after every innerHTML replace. */
function wireDelegatedActions(){
  document.querySelectorAll('[data-action]').forEach((el)=>{
    const handler = () => {
      const action = el.getAttribute('data-action');
      const id = el.getAttribute('data-id');
      handleAction(action, id, el);
    };
    // <select> only fires 'click' when the dropdown itself is opened/closed,
    // not when the selected value changes — it needs 'change'. Checkboxes
    // fire both, but their .checked value is already updated by the time
    // 'click' runs, so leaving them on click is fine and matches the rest
    // of the delegation pattern.
    if(el.tagName==='SELECT') el.onchange = handler;
    else el.onclick = handler;
  });
}

function wireSearchBox(){
  const box = document.getElementById('inlineSearchBox');
  if(!box) return;
  box.oninput = () => { state.search = box.value; render(); };
}

/* Central action router for data-action buttons across all views. Extended
   by each feature area as it's built (tasks/goals/habits/etc). */
function handleAction(action, id, el){
  switch(action){
    case 'goto': goto(el.getAttribute('data-view'), id); break;
    default:
      if(typeof ACTION_HANDLERS[action] === 'function') ACTION_HANDLERS[action](id, el);
      else console.warn('Unhandled action', action);
  }
}
const ACTION_HANDLERS = {};

/* ---------------------------------------------------------------------- */
/* MODAL SYSTEM                                                           */
/* ---------------------------------------------------------------------- */

function openModal(title, bodyHTML, footHTML){
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h2>${escapeHtml(title)}</h2>
        <div id="modalBody">${bodyHTML}</div>
        <div class="modal-actions">${footHTML||''}</div>
      </div>
    </div>`;
  document.getElementById('modalOverlay').addEventListener('click', (e)=>{
    if(e.target.id==='modalOverlay') closeModal();
  });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }

/* ---------------------------------------------------------------------- */
/* GENERIC FIELD-DRIVEN FORM HELPERS (shared by every entity's CRUD form) */
/* ---------------------------------------------------------------------- */

function fieldsToHTML(fields, values){
  values = values || {};
  return fields.map((f)=>`
    <div class="form-field ${f.type==='textarea'?'full':''}">
      <label>${escapeHtml(f.label)}${f.required?' *':''}</label>
      ${fieldInputHTML(f, values[f.key])}
      ${f.hint?`<span class="hint">${escapeHtml(f.hint)}</span>`:''}
    </div>`).join('');
}

function fieldInputHTML(f, value){
  value = (value===undefined || value===null) ? '' : value;
  const id = 'f_' + f.key;
  if(f.type==='select'){
    const opts = (f.options||[]).map((o)=>{
      const val = typeof o === 'object' ? o.id : o;
      const label = typeof o === 'object' ? o.label : o;
      return `<option value="${escapeHtml(val)}" ${String(val)===String(value)?'selected':''}>${escapeHtml(label)}</option>`;
    }).join('');
    return `<select id="${id}">${!f.required?'<option value="">—</option>':''}${opts}</select>`;
  }
  if(f.type==='textarea'){
    return `<textarea id="${id}">${escapeHtml(value)}</textarea>`;
  }
  if(f.type==='checkbox'){
    return `<input id="${id}" type="checkbox" ${value?'checked':''} style="width:18px;height:18px;">`;
  }
  return `<input id="${id}" type="${f.type}" value="${escapeHtml(value)}">`;
}

function readFieldsFromForm(fields, root){
  const out = {};
  fields.forEach((f)=>{
    const el = root.querySelector('#f_'+f.key);
    if(!el) return;
    if(f.type==='checkbox') out[f.key] = el.checked;
    else if(f.type==='number') out[f.key] = el.value===''?null:Number(el.value);
    else out[f.key] = el.value;
  });
  return out;
}

/* ---------------------------------------------------------------------- */
/* TASKS (also serves as Calendar Events via kind:'event' — see Calendar   */
/* build step)                                                             */
/* ---------------------------------------------------------------------- */

const TASK_FIELDS = [
  { key:'title', label:'Title', type:'text', required:true },
  { key:'description', label:'Description', type:'textarea' },
  { key:'category', label:'Category', type:'select', options: () => allCategories() },
  { key:'priority', label:'Priority', type:'select', options: PRIORITIES, required:true },
  { key:'status', label:'Status', type:'select', options: STATUSES, required:true },
  { key:'date', label:'Date', type:'date', required:true },
  { key:'time', label:'Time', type:'time' },
  { key:'location', label:'Location', type:'text' },
  { key:'repeatFreq', label:'Repeat', type:'select', options: RECUR_OPTIONS },
  { key:'reminderOffsetMins', label:'Reminder Timing', type:'select', options: REMINDER_TIMING_OPTIONS },
  { key:'reminderMode', label:'Reminder Type', type:'select', options: REMINDER_MODES },
  { key:'color', label:'Colour', type:'color' },
  { key:'progressPct', label:'Progress %', type:'number' },
  { key:'estimatedDurationMins', label:'Estimated Duration (mins)', type:'number' },
  { key:'actualDurationMins', label:'Actual Duration (mins)', type:'number' },
  { key:'attachmentNote', label:'Attachment (path/URL, optional)', type:'text', hint:'Full document linking lives under Documents.' },
  { key:'notes', label:'Notes', type:'textarea' },
];

// fieldsToHTML/fieldInputHTML accept either a static options array or (for
// TASK_FIELDS.category, which depends on custom categories added later in
// Settings) a function returning the array at render time.
function resolvedOptions(f){ return typeof f.options === 'function' ? f.options() : f.options; }

function taskById(id){ return db.tasks.find((t)=>t.id===id); }

function tasksOfKind(kind){ return db.tasks.filter((t)=>t.kind===kind && t.status!=='archived'); }

function isOverdue(t){
  return t.date && t.date < todayYMD() && !['completed','cancelled','archived'].includes(t.status);
}

function taskStatusBadge(t){
  if(isOverdue(t)) return `<span class="badge badge-red">Overdue</span>`;
  const m = statusMeta(t.status);
  return `<span class="badge badge-${m.color}">${escapeHtml(m.label)}</span>`;
}
function priorityBadge(p){
  const m = priorityMeta(p);
  return `<span class="badge badge-${m.color}">${escapeHtml(m.label)}</span>`;
}

function renderTasks(){
  const f = state.taskFilter;
  let list = tasksOfKind('task').concat(db.tasks.filter((t)=>t.kind==='task' && t.status==='archived' && f.status==='archived'));
  if(state.search){
    const q = state.search.toLowerCase();
    list = list.filter((t)=>(t.title||'').toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q));
  }
  if(f.status) list = list.filter((t)=>t.status===f.status);
  if(f.category) list = list.filter((t)=>t.category===f.category);
  if(f.priority) list = list.filter((t)=>t.priority===f.priority);
  const sortFns = {
    date: (a,b)=>(a.date||'').localeCompare(b.date||''),
    priority: (a,b)=>PRIORITIES.findIndex((p)=>p.id===a.priority)-PRIORITIES.findIndex((p)=>p.id===b.priority),
    title: (a,b)=>(a.title||'').localeCompare(b.title||''),
  };
  list = list.slice().sort(sortFns[f.sort] || sortFns.date);

  const catOptions = allCategories();
  const rows = list.map((t)=>`
    <div class="item-row row-${isOverdue(t)?'red':priorityMeta(t.priority).color}">
      <div>
        <input type="checkbox" data-action="toggle-task-done" data-id="${t.id}" ${t.status==='completed'?'checked':''} style="width:18px;height:18px;vertical-align:middle;margin-right:8px;">
        <span class="title">${escapeHtml(t.title)}</span>
        <div class="meta">${escapeHtml(t.category||'—')} &middot; ${formatDate(t.date)}${t.time?' · '+formatTime(t.time):''}</div>
      </div>
      <div class="actions-cell">
        ${priorityBadge(t.priority)} ${taskStatusBadge(t)}
        <button class="btn sm secondary" data-action="edit-task" data-id="${t.id}">Edit</button>
        <button class="btn sm secondary" data-action="duplicate-task" data-id="${t.id}">Duplicate</button>
        ${t.status==='archived'
          ? `<button class="btn sm secondary" data-action="restore-task" data-id="${t.id}">Restore</button>`
          : `<button class="btn sm secondary" data-action="archive-task" data-id="${t.id}">Archive</button>`}
        <button class="btn sm danger" data-action="delete-task" data-id="${t.id}">Delete</button>
      </div>
    </div>`).join('');

  return `
    <div class="toolbar">
      <input type="text" id="inlineSearchBox" placeholder="Search tasks…" value="${escapeHtml(state.search)}">
      <select data-action="set-task-filter" data-key="status"><option value="">All Status</option>${STATUSES.map((s)=>`<option value="${s.id}" ${f.status===s.id?'selected':''}>${s.label}</option>`).join('')}</select>
      <select data-action="set-task-filter" data-key="category"><option value="">All Categories</option>${catOptions.map((c)=>`<option value="${escapeHtml(c)}" ${f.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
      <select data-action="set-task-filter" data-key="priority"><option value="">All Priorities</option>${PRIORITIES.map((p)=>`<option value="${p.id}" ${f.priority===p.id?'selected':''}>${p.label}</option>`).join('')}</select>
      <select data-action="set-task-filter" data-key="sort"><option value="date" ${f.sort==='date'?'selected':''}>Sort: Date</option><option value="priority" ${f.sort==='priority'?'selected':''}>Sort: Priority</option><option value="title" ${f.sort==='title'?'selected':''}>Sort: Title</option></select>
      <div class="spacer"></div>
      <button class="btn" data-action="new-task">➕ Add Task</button>
    </div>
    <div class="item-list">${rows || '<div class="empty-note">No tasks match your filters.</div>'}</div>
  `;
}

function openTaskForm(id, presetKind){
  const existing = id ? taskById(id) : null;
  const values = existing || { kind: presetKind||'task', status:'pending', priority:'none', date: todayYMD(), progressPct:0, color:'#1565c0', subtasks:[] };
  const subtasks = values.subtasks || [];

  const fieldsHtml = TASK_FIELDS.map((fld)=>{
    const f = Object.assign({}, fld, { options: resolvedOptions(fld) });
    return `<div class="form-field ${f.type==='textarea'?'full':''}">
      <label>${escapeHtml(f.label)}${f.required?' *':''}</label>
      ${fieldInputHTML(f, values[f.key])}
      ${f.hint?`<span class="hint">${escapeHtml(f.hint)}</span>`:''}
    </div>`;
  }).join('');

  const subtasksHtml = subtasks.map((s)=>`
    <div class="checklist-row ${s.done?'done':''}" data-subtask-id="${s.id}">
      <input type="checkbox" data-subtask-toggle="${s.id}" ${s.done?'checked':''}>
      <span class="checklist-text" style="flex:1;">${escapeHtml(s.text)}</span>
      <button type="button" class="btn sm danger" data-subtask-remove="${s.id}">✕</button>
    </div>`).join('');

  openModal(existing ? '✏️ Edit Task' : '➕ New Task', `
    <form id="taskForm">
      <div class="form-grid">${fieldsHtml}</div>
      <div class="form-section" style="margin-top:14px;">
        <h3>Subtasks</h3>
        <div id="subtaskList">${subtasksHtml || '<div class="hint">No subtasks yet.</div>'}</div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <input type="text" id="newSubtaskText" placeholder="Add a subtask…" style="flex:1;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
          <button type="button" class="btn secondary sm" id="addSubtaskBtn">Add</button>
        </div>
      </div>
    </form>
  `, `
    <button class="btn grey" id="cancelTaskBtn">Cancel</button>
    <button class="btn" id="saveTaskBtn">💾 Save Task</button>
  `);

  let workingSubtasks = subtasks.slice();
  function renderSubtaskList(){
    document.getElementById('subtaskList').innerHTML = workingSubtasks.map((s)=>`
      <div class="checklist-row ${s.done?'done':''}">
        <input type="checkbox" data-subtask-toggle="${s.id}" ${s.done?'checked':''}>
        <span class="checklist-text" style="flex:1;">${escapeHtml(s.text)}</span>
        <button type="button" class="btn sm danger" data-subtask-remove="${s.id}">✕</button>
      </div>`).join('') || '<div class="hint">No subtasks yet.</div>';
    document.querySelectorAll('[data-subtask-toggle]').forEach((cb)=>{
      cb.onchange = () => {
        const sid = cb.getAttribute('data-subtask-toggle');
        const s = workingSubtasks.find((x)=>x.id===sid);
        if(s) s.done = cb.checked;
      };
    });
    document.querySelectorAll('[data-subtask-remove]').forEach((btn)=>{
      btn.onclick = () => {
        const sid = btn.getAttribute('data-subtask-remove');
        workingSubtasks = workingSubtasks.filter((x)=>x.id!==sid);
        renderSubtaskList();
      };
    });
  }
  renderSubtaskList();
  document.getElementById('addSubtaskBtn').onclick = () => {
    const input = document.getElementById('newSubtaskText');
    if(!input.value.trim()) return;
    workingSubtasks.push({ id: uid(), text: input.value.trim(), done:false });
    input.value = '';
    renderSubtaskList();
  };

  document.getElementById('cancelTaskBtn').onclick = closeModal;
  document.getElementById('saveTaskBtn').onclick = () => {
    const form = document.getElementById('taskForm');
    const vals = readFieldsFromForm(TASK_FIELDS, form);
    if(!vals.title || !vals.title.trim()){ alert('Title is required.'); return; }
    if(!vals.date){ alert('Date is required.'); return; }
    const now = new Date().toISOString();
    const record = Object.assign({}, values, vals, {
      id: existing ? existing.id : nextId('TASK','task'),
      kind: existing ? existing.kind : (presetKind || 'task'),
      subtasks: workingSubtasks,
      updatedAt: now,
      createdAt: existing ? existing.createdAt : now,
    });
    saveRecord('tasks', record);
    closeModal();
    render();
  };
}

Object.assign(ACTION_HANDLERS, {
  'new-task': () => openTaskForm(null, 'task'),
  // Calendar pills render both tasks/events AND assignments through the
  // same "edit-task" action (see itemsByDateMap's assignment view-model) —
  // route by id prefix rather than touching every calendar renderer.
  'edit-task': (id) => id && id.startsWith('ASSIGN-') ? openAssignmentForm(id) : openTaskForm(id),
  'delete-task': (id) => { if(confirm('Delete this task permanently?')){ deleteRecord('tasks', id); render(); } },
  'duplicate-task': (id) => {
    const t = taskById(id);
    if(!t) return;
    const now = new Date().toISOString();
    saveRecord('tasks', Object.assign({}, t, { id: nextId('TASK','task'), title: t.title+' (Copy)', status:'pending', createdAt: now, updatedAt: now }));
    render();
  },
  'archive-task': (id) => { const t = taskById(id); if(t){ t.status='archived'; saveRecord('tasks', t); render(); } },
  'restore-task': (id) => { const t = taskById(id); if(t){ t.status='pending'; saveRecord('tasks', t); render(); } },
  'toggle-task-done': (id, el) => {
    // Assignments have a richer verification lifecycle than a plain
    // done/not-done checkbox, so route to the full editor instead of
    // silently flipping status — see the "edit-task" handler above for the
    // same id-prefix routing rationale.
    if(id && id.startsWith('ASSIGN-')){ el.checked = false; openAssignmentForm(id); return; }
    const t = taskById(id); if(!t) return;
    t.status = el.checked ? 'completed' : 'pending';
    if(el.checked) t.progressPct = 100;
    saveRecord('tasks', t);
    render();
  },
  'set-task-filter': (id, el) => {
    const key = el.getAttribute('data-key');
    state.taskFilter[key] = el.value;
    render();
  },
});

/* ---------------------------------------------------------------------- */
/* DASHBOARD                                                              */
/* ---------------------------------------------------------------------- */

function productivityPct(tasks, fromDate, toDate){
  const inRange = tasks.filter((t)=>t.date>=fromDate && t.date<=toDate && !['archived','cancelled'].includes(t.status));
  if(!inRange.length) return null;
  const done = inRange.filter((t)=>t.status==='completed').length;
  return Math.round((done/inRange.length)*100);
}

function renderDashboard(){
  const today = todayYMD();
  const tasks = tasksOfKind('task');
  const events = tasksOfKind('event');
  const todaysTasks = tasks.filter((t)=>t.date===today);
  const todaysEvents = events.filter((t)=>t.date===today);
  const completedToday = tasks.filter((t)=>t.status==='completed' && t.date===today);
  const pending = tasks.filter((t)=>t.status==='pending' || t.status==='in-progress' || t.status==='scheduled');
  const overdue = tasks.filter(isOverdue);
  const upcomingEvents = events.filter((t)=>t.date>today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  const focusTask = todaysTasks
    .filter((t)=>t.status!=='completed')
    .sort((a,b)=>PRIORITIES.findIndex((p)=>p.id===a.priority)-PRIORITIES.findIndex((p)=>p.id===b.priority))[0];

  const weeklyPct = productivityPct(tasks, ymd(addDays(new Date(),-6)), today);
  const monthlyPct = productivityPct(tasks, ymd(startOfMonth(new Date())), today);
  const activeGoals = db.goals.filter((g)=>!['completed','archived','cancelled'].includes(g.status));
  const upcomingBirthdays = db.reminders.filter((r)=>r.kind==='birthday').filter((r)=>{
    const d = daysBetween(nextOccurrence(r.date), today);
    return d>=0 && d<=30;
  }).sort((a,b)=>daysBetween(nextOccurrence(a.date),today)-daysBetween(nextOccurrence(b.date),today)).slice(0,3);
  const countdowns = events.filter((t)=>t.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
  const quickNotes = db.notes.filter((n)=>n.noteType==='quick').sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)).slice(0,3);

  const cards = [
    { num: todaysTasks.length, lbl:"Today's Tasks", icon:'✅', view:'tasks' },
    { num: todaysEvents.length, lbl:"Today's Events", icon:'📅', view:'calendar' },
    { num: completedToday.length, lbl:'Completed Today', icon:'🎉', view:'tasks' },
    { num: pending.length, lbl:'Pending Tasks', icon:'⏳', view:'tasks' },
    { num: overdue.length, lbl:'Overdue Tasks', icon:'⚠️', view:'tasks' },
    { num: upcomingEvents.length, lbl:'Upcoming Events', icon:'📆', view:'calendar' },
    { num: weeklyPct===null?'—':weeklyPct+'%', lbl:'Weekly Productivity', icon:'📈', view:'reports' },
    { num: monthlyPct===null?'—':monthlyPct+'%', lbl:'Monthly Productivity', icon:'📊', view:'reports' },
    { num: activeGoals.length, lbl:'Current Goals', icon:'🎯', view:'goals' },
  ];
  const cardsHtml = cards.map((c)=>`
    <div class="card clickable" data-action="goto" data-view="${c.view}">
      <div class="icon">${c.icon}</div><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div>
    </div>`).join('');

  const focusHtml = focusTask
    ? `<div class="item-row row-${priorityMeta(focusTask.priority).color}"><div><span class="title">${escapeHtml(focusTask.title)}</span><div class="meta">${focusTask.time?formatTime(focusTask.time):'No time set'}</div></div>${priorityBadge(focusTask.priority)}</div>`
    : `<div class="empty-note">Nothing urgent today — add a task to set your focus.</div>`;

  const overdueHtml = overdue.length
    ? overdue.slice(0,5).map((t)=>`<div class="item-row row-red"><div><span class="title">${escapeHtml(t.title)}</span><div class="meta">Was due ${formatDate(t.date)}</div></div>${taskStatusBadge(t)}</div>`).join('')
    : `<div class="empty-note">No overdue tasks. 🎉</div>`;

  const birthdaysHtml = upcomingBirthdays.length
    ? upcomingBirthdays.map((r)=>`<div class="item-row row-purple"><div><span class="title">🎂 ${escapeHtml(r.title)}</span><div class="meta">${daysBetween(nextOccurrence(r.date),today)} day(s) away</div></div></div>`).join('')
    : `<div class="empty-note">No birthdays in the next 30 days.</div>`;

  const countdownHtml = countdowns.length
    ? countdowns.map((t)=>`<div class="item-row row-blue"><div><span class="title">${escapeHtml(t.title)}</span><div class="meta">${daysBetween(t.date,today)} day(s) away — ${formatDate(t.date)}</div></div></div>`).join('')
    : `<div class="empty-note">No upcoming events.</div>`;

  const notesHtml = quickNotes.length
    ? quickNotes.map((n)=>`<div class="item-row row-yellow"><div><span class="title">${n.pinned?'📌 ':''}${escapeHtml(n.title||'(untitled)')}</span><div class="meta">${stripHtml(n.body||'').slice(0,60)}</div></div></div>`).join('')
    : `<div class="empty-note">No quick notes yet.</div>`;

  const hubHtml = HUB_LINKS.map((h)=>`<a class="hub-link" data-action="goto" data-view="${h.id}"><span class="hub-icon">${h.icon}</span>${h.label}</a>`).join('');

  return `
    <div class="cards-grid">${cardsHtml}</div>
    <div class="section-title">🎯 Today's Focus</div>
    ${focusHtml}
    <div class="section-title">⚠️ Overdue</div>
    ${overdueHtml}
    <div class="section-title">🎂 Upcoming Birthdays</div>
    ${birthdaysHtml}
    <div class="section-title">⏱️ Countdown Events</div>
    ${countdownHtml}
    <div class="section-title">📝 Quick Notes</div>
    ${notesHtml}
    <div class="section-title">💬 Motivational Quote</div>
    <div class="empty-note">${escapeHtml(motivationalQuoteOfTheDay())}</div>
    <div class="section-title">🌤️ Weather</div>
    <div class="empty-note">Weather — not connected (placeholder).</div>
    <div class="section-title">🔗 Quick Links</div>
    <div class="hub-grid">${hubHtml}</div>
  `;
}

// Birthdays/yearly reminders are stored with their ORIGINAL date, but the
// relevant thing for a countdown is the next upcoming occurrence — re-project
// the stored month/day onto the current (or next) year.
function nextOccurrence(dateStr){
  if(!dateStr) return dateStr;
  const [y,m,d] = dateStr.split('-').map(Number);
  const today = new Date();
  let candidate = new Date(today.getFullYear(), m-1, d);
  if(candidate < startOfDay(today)) candidate = new Date(today.getFullYear()+1, m-1, d);
  return ymd(candidate);
}

const MOTIVATIONAL_QUOTES = [
  'Small steps every day lead to big results.',
  'Discipline is choosing between what you want now and what you want most.',
  'Well begun is half done.',
  'You do not have to be great to start, but you have to start to be great.',
  'Consistency is what transforms average into excellence.',
];
function motivationalQuoteOfTheDay(){
  const dayIndex = Math.floor(new Date().setHours(0,0,0,0) / 86400000);
  return MOTIVATIONAL_QUOTES[dayIndex % MOTIVATIONAL_QUOTES.length];
}

/* Placeholder stubs for views not yet implemented — each is replaced in its
   own build step so the module stays runnable throughout development. */
/* ---------------------------------------------------------------------- */
/* CALENDAR (Day/Week/Month/Agenda/Year) + Daily Planner                  */
/* ---------------------------------------------------------------------- */

function itemsByDateMap(){
  const map = new Map();
  db.tasks.filter((t)=>t.status!=='archived' && t.date).forEach((t)=>{
    if(!map.has(t.date)) map.set(t.date, []);
    map.get(t.date).push(t);
  });
  // Assignments (from the Assignment & Follow-up module) are merged in as a
  // lightweight view-model whose `status` is pre-normalized to the
  // task-status vocabulary (`completed`/`cancelled`/`pending`) that
  // isOverdue()/taskStatusBadge()/priorityBadge() already understand — this
  // is the ONLY change needed to make deadlines show up correctly across
  // all 5 existing calendar views, with zero changes to those renderers.
  (db.assignments||[]).filter((a)=>a.expectedCompletionDate).forEach((a)=>{
    const normalizedStatus = ['Completed','Verified'].includes(a.status) ? 'completed'
      : ['Cancelled','Rejected'].includes(a.status) ? 'cancelled' : 'pending';
    const viewModel = { id:a.id, title:'📋 '+a.title, date:a.expectedCompletionDate, time:a.expectedCompletionTime, priority:a.priority, status:normalizedStatus, kind:'assignment' };
    if(!map.has(a.expectedCompletionDate)) map.set(a.expectedCompletionDate, []);
    map.get(a.expectedCompletionDate).push(viewModel);
  });
  return map;
}

function itemsOnDate(map, dateObj){ return map.get(ymd(dateObj)) || []; }

function dayHighlightClass(dateObj, items){
  const today = todayYMD();
  const dKey = ymd(dateObj);
  if(dKey === today) return 'cal-today';
  if(!items.length) return '';
  const allDone = items.every((t)=>['completed','cancelled'].includes(t.status));
  if(dKey < today) return allDone ? 'cal-completed' : 'cal-overdue';
  return allDone ? 'cal-completed' : 'cal-upcoming';
}

function timeBlockOf(t){
  if(!t) return 'Unscheduled';
  const h = Number(t.split(':')[0]);
  if(isNaN(h)) return 'Unscheduled';
  if(h>=5 && h<12) return 'Morning';
  if(h>=12 && h<17) return 'Afternoon';
  if(h>=17 && h<21) return 'Evening';
  return 'Night';
}

function calGranularityLabel(){
  const c = state.calCursor;
  if(state.calView==='day') return formatDateLong(ymd(c));
  if(state.calView==='week'){ const s=startOfWeekMonday(c), e=addDays(s,6); return formatDate(ymd(s))+' – '+formatDate(ymd(e)); }
  if(state.calView==='month') return MONTH_NAMES[c.getMonth()]+' '+c.getFullYear();
  if(state.calView==='year') return String(c.getFullYear());
  return 'Agenda from '+formatDate(ymd(c));
}

function calStep(dir){
  const c = state.calCursor;
  if(state.calView==='day') state.calCursor = addDays(c, dir);
  else if(state.calView==='week') state.calCursor = addDays(c, dir*7);
  else if(state.calView==='month') state.calCursor = addMonths(c, dir);
  else if(state.calView==='year') state.calCursor = new Date(c.getFullYear()+dir, c.getMonth(), 1);
  else state.calCursor = addDays(c, dir*14);
}

function renderCalendarToolbar(){
  const views = ['day','week','month','agenda','year'];
  return `
    <div class="toolbar">
      <button class="btn sm secondary" data-action="cal-nav" data-dir="-1">◀</button>
      <button class="btn sm grey" data-action="cal-today">Today</button>
      <button class="btn sm secondary" data-action="cal-nav" data-dir="1">▶</button>
      <strong style="margin:0 6px;">${escapeHtml(calGranularityLabel())}</strong>
      <input type="date" id="calJumpDate" value="${ymd(state.calCursor)}">
      <div class="spacer"></div>
      ${views.map((v)=>`<button class="btn sm ${state.calView===v?'':'secondary'}" data-action="cal-set-view" data-view="${v}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}
      <button class="btn sm" data-action="new-event">➕ New Event</button>
    </div>`;
}

function renderCalendar(){
  const map = itemsByDateMap();
  let body;
  if(state.calView==='day') body = renderDayPlanner(state.calCursor, map);
  else if(state.calView==='week') body = renderWeekStrip(state.calCursor, map);
  else if(state.calView==='month') body = renderMonthGrid(state.calCursor, map);
  else if(state.calView==='year') body = renderYearGrid(state.calCursor, map);
  else body = renderAgendaView(state.calCursor, map);
  return renderCalendarToolbar() + body;
}

function renderMonthGrid(cursor, map){
  const first = startOfMonth(cursor);
  const gridStart = startOfWeekMonday(first);
  const cells = [];
  for(let i=0;i<42;i++) cells.push(addDays(gridStart, i));
  const rows = [];
  for(let r=0;r<6;r++) rows.push(cells.slice(r*7,r*7+7));

  const header = WEEKDAY_NAMES_MON_FIRST.map((w)=>`<th>${w}</th>`).join('');
  const body = rows.map((week)=>`<tr>${week.map((d)=>{
    const items = itemsOnDate(map, d);
    const inMonth = d.getMonth()===cursor.getMonth();
    const cls = dayHighlightClass(d, items);
    const pills = items.slice(0,3).map((t)=>`<div class="cal-pill badge-${priorityMeta(t.priority).color}">${escapeHtml(t.title)}</div>`).join('');
    const more = items.length>3 ? `<div class="cal-more">+${items.length-3} more</div>` : '';
    return `<td class="cal-cell ${cls} ${inMonth?'':'cal-outmonth'}" data-action="cal-open-day" data-id="${ymd(d)}">
      <div class="cal-daynum">${d.getDate()}</div>${pills}${more}
    </td>`;
  }).join('')}</tr>`).join('');

  return `<div class="table-wrap"><table class="cal-month"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderWeekStrip(cursor, map){
  const start = startOfWeekMonday(cursor);
  const days = Array.from({length:7}, (_,i)=>addDays(start,i));
  const blocks = ['Morning','Afternoon','Evening','Night'];
  const cols = days.map((d)=>{
    const items = itemsOnDate(map, d).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    const cls = dayHighlightClass(d, items);
    const blockHtml = blocks.map((b)=>{
      const inBlock = items.filter((t)=>timeBlockOf(t.time)===b);
      if(!inBlock.length) return '';
      return `<div class="cal-week-block"><div class="cal-week-block-lbl">${b}</div>${inBlock.map((t)=>`<div class="cal-pill badge-${priorityMeta(t.priority).color}" data-action="edit-task" data-id="${t.id}">${escapeHtml(t.title)}</div>`).join('')}</div>`;
    }).join('');
    return `<div class="cal-week-col ${cls}">
      <div class="cal-week-head" data-action="cal-open-day" data-id="${ymd(d)}">${WEEKDAY_NAMES_MON_FIRST[i7(d)]} ${d.getDate()}</div>
      ${blockHtml || '<div class="hint" style="padding:8px;">No items</div>'}
    </div>`;
  }).join('');
  function i7(d){ const day=d.getDay(); return day===0?6:day-1; }
  return `<div class="cal-week-grid">${cols}</div>`;
}

function renderAgendaView(cursor, map){
  const days = Array.from({length:30}, (_,i)=>addDays(cursor,i));
  const sections = days.map((d)=>{
    const items = itemsOnDate(map, d).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    if(!items.length) return '';
    const cls = dayHighlightClass(d, items);
    const rows = items.map((t)=>`
      <div class="item-row row-${priorityMeta(t.priority).color}">
        <div><span class="title">${t.time?formatTime(t.time)+' — ':''}${escapeHtml(t.title)}</span><div class="meta">${escapeHtml(t.category||'—')} · ${t.kind==='event'?'Event':'Task'}</div></div>
        <div class="actions-cell">${taskStatusBadge(t)}<button class="btn sm secondary" data-action="edit-task" data-id="${t.id}">Edit</button></div>
      </div>`).join('');
    return `<div class="section-title ${cls==='cal-today'?'':''}">${formatDateLong(ymd(d))}${cls==='cal-today'?' <span class=\"badge badge-blue\">Today</span>':''}</div><div class="item-list">${rows}</div>`;
  }).join('');
  return sections || `<div class="empty-note">Nothing in the next 30 days.</div>`;
}

function renderYearGrid(cursor, map){
  const year = cursor.getFullYear();
  const months = Array.from({length:12}, (_,m)=>{
    const first = new Date(year, m, 1);
    const nDays = daysInMonth(year, m);
    const startWeekday = i7(first);
    const dots = [];
    for(let i=0;i<startWeekday;i++) dots.push('<span class="cal-yr-day cal-yr-blank"></span>');
    for(let day=1; day<=nDays; day++){
      const d = new Date(year, m, day);
      const items = itemsOnDate(map, d);
      const cls = dayHighlightClass(d, items);
      dots.push(`<span class="cal-yr-day ${cls}" data-action="cal-open-day" data-id="${ymd(d)}">${day}</span>`);
    }
    function i7(dd){ const day=dd.getDay(); return day===0?6:day-1; }
    return `<div class="cal-yr-month"><div class="cal-yr-month-name">${MONTH_NAMES[m]}</div><div class="cal-yr-days">${dots.join('')}</div></div>`;
  }).join('');
  return `<div class="cal-yr-grid">${months}</div>`;
}

function renderDayPlanner(cursor, map){
  const items = itemsOnDate(map, cursor).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const blocks = ['Morning','Afternoon','Evening','Night','Unscheduled'];
  const sections = blocks.map((b)=>{
    const inBlock = items.filter((t)=>timeBlockOf(t.time)===b);
    const rows = inBlock.map((t)=>`
      <div class="item-row row-${isOverdue(t)?'red':priorityMeta(t.priority).color}">
        <div>
          <input type="checkbox" data-action="toggle-task-done" data-id="${t.id}" ${t.status==='completed'?'checked':''} style="width:18px;height:18px;vertical-align:middle;margin-right:8px;">
          <span class="title">${t.time?formatTime(t.time)+' — ':''}${escapeHtml(t.title)}</span>
        </div>
        <div class="actions-cell">${priorityBadge(t.priority)}${taskStatusBadge(t)}<button class="btn sm secondary" data-action="edit-task" data-id="${t.id}">Edit</button></div>
      </div>`).join('');
    return `<div class="section-title">${b}</div><div class="item-list">${rows || '<div class="empty-note">Nothing scheduled.</div>'}</div>`;
  }).join('');
  return sections;
}

Object.assign(ACTION_HANDLERS, {
  'new-event': () => openTaskForm(null, 'event'),
  'cal-nav': (id, el) => { calStep(Number(el.getAttribute('data-dir'))); render(); },
  'cal-today': () => { state.calCursor = new Date(); render(); },
  'cal-set-view': (id, el) => { state.calView = el.getAttribute('data-view'); render(); },
  'cal-open-day': (id) => { state.calCursor = new Date(id+'T00:00:00'); state.calView = 'day'; render(); },
});

document.addEventListener('change', (e)=>{
  if(e.target && e.target.id==='calJumpDate' && e.target.value){
    state.calCursor = new Date(e.target.value+'T00:00:00');
    render();
  }
});
/* ---------------------------------------------------------------------- */
/* GOALS                                                                   */
/* ---------------------------------------------------------------------- */

const GOAL_TERMS = [ {id:'short', label:'Short Term'}, {id:'medium', label:'Medium Term'}, {id:'long', label:'Long Term'} ];

const GOAL_FIELDS = [
  { key:'title', label:'Goal Title', type:'text', required:true },
  { key:'term', label:'Term', type:'select', options: GOAL_TERMS, required:true },
  { key:'category', label:'Category', type:'select', options: () => allCategories() },
  { key:'targetDate', label:'Target Date', type:'date' },
  { key:'progressPct', label:'Progress %', type:'number' },
  { key:'status', label:'Status', type:'select', options: STATUSES },
  { key:'visionNote', label:'Vision Board Note', type:'textarea', hint:'A short description of what achieving this goal looks like.' },
];

function goalById(id){ return db.goals.find((g)=>g.id===id); }

function renderGoals(){
  const groups = GOAL_TERMS.map((term)=>{
    const goals = db.goals.filter((g)=>g.term===term.id && g.status!=='archived');
    const rows = goals.map((g)=>`
      <div class="item-row row-${statusMeta(g.status).color}">
        <div style="flex:1;min-width:200px;">
          <span class="title">${escapeHtml(g.title)}</span>
          <div class="meta">${escapeHtml(g.category||'—')}${g.targetDate?' · Target: '+formatDate(g.targetDate):''}</div>
          <div style="background:var(--border);border-radius:6px;height:6px;margin-top:6px;overflow:hidden;">
            <div style="background:var(--accent);height:100%;width:${Math.max(0,Math.min(100,g.progressPct||0))}%;"></div>
          </div>
        </div>
        <div class="actions-cell">
          <span class="badge badge-${statusMeta(g.status).color}">${g.progressPct||0}%</span>
          <button class="btn sm secondary" data-action="edit-goal" data-id="${g.id}">Edit</button>
          <button class="btn sm danger" data-action="delete-goal" data-id="${g.id}">Delete</button>
        </div>
      </div>`).join('');
    return `<div class="section-title">${term.label} Goals</div><div class="item-list">${rows || '<div class="empty-note">No '+term.label.toLowerCase()+' goals yet.</div>'}</div>`;
  }).join('');
  return `
    <div class="toolbar"><div class="spacer"></div><button class="btn" data-action="new-goal">➕ Add Goal</button></div>
    ${groups}
  `;
}

function openGoalForm(id){
  const existing = id ? goalById(id) : null;
  const values = existing || { term:'short', status:'pending', progressPct:0, milestones:[], checklist:[] };
  let milestones = (values.milestones||[]).slice();
  let checklist = (values.checklist||[]).slice();

  const fieldsHtml = GOAL_FIELDS.map((fld)=>{
    const f = Object.assign({}, fld, { options: resolvedOptions(fld) });
    return `<div class="form-field ${f.type==='textarea'?'full':''}"><label>${escapeHtml(f.label)}${f.required?' *':''}</label>${fieldInputHTML(f, values[f.key])}${f.hint?`<span class="hint">${escapeHtml(f.hint)}</span>`:''}</div>`;
  }).join('');

  openModal(existing?'✏️ Edit Goal':'➕ New Goal', `
    <form id="goalForm"><div class="form-grid">${fieldsHtml}</div></form>
    <div class="form-section" style="margin-top:14px;">
      <h3>Milestones</h3>
      <div id="milestoneList"></div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <input type="text" id="newMilestoneText" placeholder="Add a milestone…" style="flex:1;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
        <button type="button" class="btn secondary sm" id="addMilestoneBtn">Add</button>
      </div>
    </div>
    <div class="form-section">
      <h3>Checklist</h3>
      <div id="goalChecklist"></div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <input type="text" id="newChecklistText" placeholder="Add a checklist item…" style="flex:1;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
        <button type="button" class="btn secondary sm" id="addChecklistBtn">Add</button>
      </div>
    </div>
  `, `<button class="btn grey" id="cancelGoalBtn">Cancel</button><button class="btn" id="saveGoalBtn">💾 Save Goal</button>`);

  function renderNestedList(containerId, list, removeAttr, toggleAttr){
    document.getElementById(containerId).innerHTML = list.map((it)=>`
      <div class="checklist-row ${it.done?'done':''}">
        <input type="checkbox" data-${toggleAttr}="${it.id}" ${it.done?'checked':''}>
        <span class="checklist-text" style="flex:1;">${escapeHtml(it.text)}</span>
        <button type="button" class="btn sm danger" data-${removeAttr}="${it.id}">✕</button>
      </div>`).join('') || '<div class="hint">None yet.</div>';
  }
  function wireNested(containerId, list, removeAttr, toggleAttr, reRender){
    document.querySelectorAll(`[data-${toggleAttr}]`).forEach((cb)=>{
      cb.onchange = () => { const it = list.find((x)=>x.id===cb.getAttribute(`data-${toggleAttr}`)); if(it) it.done = cb.checked; };
    });
    document.querySelectorAll(`[data-${removeAttr}]`).forEach((btn)=>{
      btn.onclick = () => { reRender(list.filter((x)=>x.id!==btn.getAttribute(`data-${removeAttr}`))); };
    });
  }
  function refreshMilestones(){ renderNestedList('milestoneList', milestones, 'ms-remove', 'ms-toggle'); wireNested('milestoneList', milestones, 'ms-remove', 'ms-toggle', (nl)=>{ milestones=nl; refreshMilestones(); }); }
  function refreshChecklist(){ renderNestedList('goalChecklist', checklist, 'cl-remove', 'cl-toggle'); wireNested('goalChecklist', checklist, 'cl-remove', 'cl-toggle', (nl)=>{ checklist=nl; refreshChecklist(); }); }
  refreshMilestones(); refreshChecklist();

  document.getElementById('addMilestoneBtn').onclick = () => {
    const input = document.getElementById('newMilestoneText');
    if(!input.value.trim()) return;
    milestones.push({ id:uid(), text:input.value.trim(), done:false });
    input.value=''; refreshMilestones();
  };
  document.getElementById('addChecklistBtn').onclick = () => {
    const input = document.getElementById('newChecklistText');
    if(!input.value.trim()) return;
    checklist.push({ id:uid(), text:input.value.trim(), done:false });
    input.value=''; refreshChecklist();
  };

  document.getElementById('cancelGoalBtn').onclick = closeModal;
  document.getElementById('saveGoalBtn').onclick = () => {
    const vals = readFieldsFromForm(GOAL_FIELDS, document.getElementById('goalForm'));
    if(!vals.title || !vals.title.trim()){ alert('Goal title is required.'); return; }
    const now = new Date().toISOString();
    const record = Object.assign({}, values, vals, {
      id: existing?existing.id:nextId('GOAL','goal'), milestones, checklist,
      createdAt: existing?existing.createdAt:now, updatedAt: now,
    });
    saveRecord('goals', record);
    closeModal(); render();
  };
}

Object.assign(ACTION_HANDLERS, {
  'new-goal': () => openGoalForm(null),
  'edit-goal': (id) => openGoalForm(id),
  'delete-goal': (id) => { if(confirm('Delete this goal permanently?')){ deleteRecord('goals', id); render(); } },
});

/* ---------------------------------------------------------------------- */
/* HABIT TRACKER                                                          */
/* ---------------------------------------------------------------------- */

const HABIT_FIELDS = [
  { key:'name', label:'Habit Name', type:'text', required:true },
  { key:'category', label:'Category', type:'select', options: () => allCategories() },
  { key:'icon', label:'Icon (emoji)', type:'text' },
  { key:'unit', label:'Type', type:'select', options:[{id:'boolean',label:'Yes/No (done or not)'},{id:'numeric',label:'Numeric (e.g. glasses, kg, mg/dL)'}], required:true },
  { key:'targetValue', label:'Target Value (for numeric habits)', type:'number' },
  { key:'targetDaysPerWeek', label:'Target Days / Week', type:'number' },
  { key:'active', label:'Active', type:'checkbox' },
];

function habitById(id){ return db.habits.find((h)=>h.id===id); }
function habitLogKey(habitId, date){ return habitId+'__'+date; }
function habitLogFor(habitId, date){ return db.habitLogs.find((l)=>l.id===habitLogKey(habitId,date)); }

function habitStreak(habitId){
  let streak = 0;
  let d = new Date();
  while(true){
    const log = habitLogFor(habitId, ymd(d));
    if(log && log.done){ streak++; d = addDays(d,-1); } else break;
  }
  return streak;
}
function habitCompletionPct(habitId, days){
  let done = 0;
  for(let i=0;i<days;i++){ const log = habitLogFor(habitId, ymd(addDays(new Date(),-i))); if(log && log.done) done++; }
  return Math.round((done/days)*100);
}

function renderHabits(){
  const rows = db.habits.filter((h)=>h.active!==false).map((h)=>{
    const today = todayYMD();
    const log = habitLogFor(h.id, today);
    const done = !!(log && log.done);
    const streak = habitStreak(h.id);
    const pct7 = habitCompletionPct(h.id, 7);
    const last7 = Array.from({length:7},(_,i)=>{
      const dd = addDays(new Date(), -(6-i));
      const l = habitLogFor(h.id, ymd(dd));
      return `<span class="habit-dot ${l&&l.done?'on':''}" title="${ymd(dd)}"></span>`;
    }).join('');
    return `<div class="item-row row-green">
      <div style="flex:1;min-width:200px;">
        <span class="title">${escapeHtml(h.icon||'🔥')} ${escapeHtml(h.name)}</span>
        <div class="meta">${escapeHtml(h.category||'—')} · Streak: ${streak} day${streak===1?'':'s'} · 7-day: ${pct7}%</div>
        <div style="margin-top:4px;">${last7}</div>
      </div>
      <div class="actions-cell">
        <button class="btn sm ${done?'':'secondary'}" data-action="toggle-habit-today" data-id="${h.id}">${done?'✅ Done Today':'Mark Done'}</button>
        <button class="btn sm secondary" data-action="edit-habit" data-id="${h.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-habit" data-id="${h.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  return `
    <div class="toolbar"><div class="spacer"></div><button class="btn" data-action="new-habit">➕ Add Habit</button></div>
    <div class="item-list">${rows || '<div class="empty-note">No habits yet — add Yoga, Walking, Water Intake, etc.</div>'}</div>
  `;
}

function openHabitForm(id){
  const existing = id ? habitById(id) : null;
  const values = existing || { unit:'boolean', active:true, targetDaysPerWeek:7 };
  const fieldsHtml = HABIT_FIELDS.map((fld)=>{
    const f = Object.assign({}, fld, { options: resolvedOptions(fld) });
    return `<div class="form-field ${f.type==='textarea'?'full':''}"><label>${escapeHtml(f.label)}${f.required?' *':''}</label>${fieldInputHTML(f, values[f.key])}</div>`;
  }).join('');
  openModal(existing?'✏️ Edit Habit':'➕ New Habit', `<form id="habitForm"><div class="form-grid">${fieldsHtml}</div></form>`,
    `<button class="btn grey" id="cancelHabitBtn">Cancel</button><button class="btn" id="saveHabitBtn">💾 Save Habit</button>`);
  document.getElementById('cancelHabitBtn').onclick = closeModal;
  document.getElementById('saveHabitBtn').onclick = () => {
    const vals = readFieldsFromForm(HABIT_FIELDS, document.getElementById('habitForm'));
    if(!vals.name || !vals.name.trim()){ alert('Habit name is required.'); return; }
    const record = Object.assign({}, values, vals, { id: existing?existing.id:nextId('HABIT','habit') });
    saveRecord('habits', record);
    closeModal(); render();
  };
}

Object.assign(ACTION_HANDLERS, {
  'new-habit': () => openHabitForm(null),
  'edit-habit': (id) => openHabitForm(id),
  'delete-habit': (id) => { if(confirm('Delete this habit and all its logged history?')){ deleteRecord('habits', id); db.habitLogs.filter((l)=>l.habitId===id).forEach((l)=>deleteRecord('habitLogs', l.id)); render(); } },
  'toggle-habit-today': (id) => {
    const today = todayYMD();
    const key = habitLogKey(id, today);
    const existing = habitLogFor(id, today);
    saveRecord('habitLogs', { id:key, habitId:id, date:today, done: !(existing&&existing.done) });
    render();
  },
});

/* ---------------------------------------------------------------------- */
/* REMINDERS (generic / finance / birthday — unified store)               */
/* ---------------------------------------------------------------------- */

const REMINDER_COMMON_FIELDS = [
  { key:'title', label:'Title', type:'text', required:true },
  { key:'date', label:'Date', type:'date', required:true },
  { key:'time', label:'Time', type:'time' },
  { key:'repeatFreq', label:'Repeat', type:'select', options: RECUR_OPTIONS },
  { key:'notifyMode', label:'Reminder Type', type:'select', options: REMINDER_MODES },
  { key:'offsetMins', label:'Reminder Timing', type:'select', options: REMINDER_TIMING_OPTIONS },
  { key:'notes', label:'Notes', type:'textarea' },
];
const REMINDER_KIND_FIELDS = {
  finance: [
    { key:'amount', label:'Amount', type:'number' },
    { key:'payee', label:'Payee / Biller', type:'text' },
    { key:'account', label:'Account', type:'text' },
  ],
  birthday: [
    { key:'relation', label:'Relation', type:'text' },
    { key:'giftIdea', label:'Gift Idea', type:'text' },
  ],
  generic: [],
};
const REMINDER_KIND_META = {
  generic: { title:'Reminder', icon:'🔔' },
  finance: { title:'Finance Reminder', icon:'💳' },
  birthday: { title:'Birthday', icon:'🎂' },
};

function reminderById(id){ return db.reminders.find((r)=>r.id===id); }

function renderReminders(kind){
  const meta = REMINDER_KIND_META[kind];
  const list = db.reminders.filter((r)=>r.kind===kind).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const rows = list.map((r)=>{
    const sub = kind==='finance' ? `${r.payee||'—'}${r.amount?' · '+formatCurrency(r.amount):''}` : kind==='birthday' ? (r.relation||'—') : formatDate(r.date);
    return `<div class="item-row row-${r.date<todayYMD()?'red':'blue'}">
      <div><span class="title">${meta.icon} ${escapeHtml(r.title)}</span><div class="meta">${formatDate(r.date)}${r.time?' · '+formatTime(r.time):''} · ${escapeHtml(sub)}</div></div>
      <div class="actions-cell">
        <button class="btn sm secondary" data-action="edit-reminder" data-id="${r.id}" data-kind="${kind}">Edit</button>
        <button class="btn sm danger" data-action="delete-reminder" data-id="${r.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  return `
    <div class="toolbar"><div class="spacer"></div><button class="btn" data-action="new-reminder" data-kind="${kind}">➕ Add ${meta.title}</button></div>
    <div class="item-list">${rows || `<div class="empty-note">No ${meta.title.toLowerCase()}s yet.</div>`}</div>
  `;
}

function openReminderForm(id, kind){
  const existing = id ? reminderById(id) : null;
  kind = existing ? existing.kind : kind;
  const meta = REMINDER_KIND_META[kind];
  const fields = REMINDER_COMMON_FIELDS.concat(REMINDER_KIND_FIELDS[kind]);
  const values = existing || { date: todayYMD(), status:'active' };
  const fieldsHtml = fields.map((fld)=>{
    const f = Object.assign({}, fld, { options: resolvedOptions(fld) });
    return `<div class="form-field ${f.type==='textarea'?'full':''}"><label>${escapeHtml(f.label)}${f.required?' *':''}</label>${fieldInputHTML(f, values[f.key])}</div>`;
  }).join('');
  openModal((existing?'✏️ Edit ':'➕ New ')+meta.title, `<form id="reminderForm"><div class="form-grid">${fieldsHtml}</div></form>`,
    `<button class="btn grey" id="cancelReminderBtn">Cancel</button><button class="btn" id="saveReminderBtn">💾 Save</button>`);
  document.getElementById('cancelReminderBtn').onclick = closeModal;
  document.getElementById('saveReminderBtn').onclick = () => {
    const vals = readFieldsFromForm(fields, document.getElementById('reminderForm'));
    if(!vals.title || !vals.title.trim()){ alert('Title is required.'); return; }
    const record = Object.assign({}, values, vals, { id: existing?existing.id:nextId('REM','reminder'), kind });
    saveRecord('reminders', record);
    closeModal(); render();
  };
}

Object.assign(ACTION_HANDLERS, {
  'new-reminder': (id, el) => openReminderForm(null, el.getAttribute('data-kind')),
  'edit-reminder': (id, el) => openReminderForm(id, el.getAttribute('data-kind')),
  'delete-reminder': (id) => { if(confirm('Delete this reminder?')){ deleteRecord('reminders', id); render(); } },
});

/* ---------------------------------------------------------------------- */
/* REPORTS                                                                 */
/* ---------------------------------------------------------------------- */

const REPORT_TABS = [
  { id:'productivity', label:'Productivity' },
  { id:'goals', label:'Goal Progress' },
  { id:'tasks', label:'Completed / Missed' },
  { id:'habits', label:'Habit Reports' },
];
const REPORT_CHART_COLORS = { blue:'#0b3d66', accent:'#1565c0', green:'#2e7d32', orange:'#fb8c00', red:'#e53935', purple:'#6a1b9a', grey:'#9aa7b3' };

if(!state.reportView) state.reportView = 'productivity';
if(!state.reportPeriodDays) state.reportPeriodDays = 30;

function renderReports(){
  const tabsHtml = REPORT_TABS.map((t)=>`<button class="btn sm ${state.reportView===t.id?'':'secondary'}" data-action="set-report-view" data-view="${t.id}">${t.label}</button>`).join('');
  const body =
    state.reportView==='goals' ? renderGoalProgressReport() :
    state.reportView==='tasks' ? renderTasksReport() :
    state.reportView==='habits' ? renderHabitsReport() :
    renderProductivityReport();
  return `
    <div class="toolbar no-print">
      ${tabsHtml}
      <div class="spacer"></div>
      <select data-action="set-report-period"><option value="7" ${state.reportPeriodDays===7?'selected':''}>Last 7 Days</option><option value="30" ${state.reportPeriodDays===30?'selected':''}>Last 30 Days</option><option value="365" ${state.reportPeriodDays===365?'selected':''}>Last Year</option></select>
      <button class="btn sm" data-action="print-report">🖨️ Export / Print PDF</button>
    </div>
    ${body}
  `;
}

function renderProductivityReport(){
  const tasks = tasksOfKind('task');
  const days = state.reportPeriodDays;
  const points = Array.from({length: Math.min(days, 30)}, (_,i)=>{
    const d = addDays(new Date(), -(Math.min(days,30)-1-i));
    const key = ymd(d);
    const pct = productivityPct(tasks, key, key);
    return { label: (d.getMonth()+1)+'/'+d.getDate(), value: pct===null?0:pct };
  });
  const overallPct = productivityPct(tasks, ymd(addDays(new Date(),-(days-1))), todayYMD());
  const byCategory = {};
  tasks.filter((t)=>t.date>=ymd(addDays(new Date(),-(days-1)))).forEach((t)=>{
    const c = t.category||'Uncategorised';
    byCategory[c] = (byCategory[c]||0)+1;
  });
  const donutColors = Object.keys(REPORT_CHART_COLORS).map((k)=>REPORT_CHART_COLORS[k]);
  const donutSegments = Object.keys(byCategory).map((c,i)=>({ label:c, value:byCategory[c], color:donutColors[i%donutColors.length] }));

  return `
    <div class="cards-grid">
      <div class="card"><div class="icon">📈</div><div class="num">${overallPct===null?'—':overallPct+'%'}</div><div class="lbl">Completion Rate</div></div>
    </div>
    <div class="chart-block"><h4>Daily Completion % (${days>30?'last 30 of '+days+' days':'last '+days+' days'})</h4>${svgLineChart(points, {color:REPORT_CHART_COLORS.accent})}</div>
    <div class="chart-block"><h4>Tasks by Category</h4>${svgDonutChart(donutSegments)}</div>
  `;
}

function renderGoalProgressReport(){
  const goals = db.goals.filter((g)=>g.status!=='archived');
  const items = goals.map((g)=>({ label: g.title.slice(0,22), a: g.progressPct||0 }));
  return `
    <div class="chart-block"><h4>Goal Progress %</h4>${svgGroupedHBarChart(items, ['Progress %'], [REPORT_CHART_COLORS.accent])}</div>
    <div class="table-wrap"><table><thead><tr><th>Goal</th><th>Term</th><th>Progress</th><th>Target Date</th></tr></thead><tbody>
      ${goals.map((g)=>`<tr><td>${escapeHtml(g.title)}</td><td>${escapeHtml(g.term)}</td><td>${g.progressPct||0}%</td><td>${formatDate(g.targetDate)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-note">No goals yet.</td></tr>'}
    </tbody></table></div>
  `;
}

function renderTasksReport(){
  const days = state.reportPeriodDays;
  const from = ymd(addDays(new Date(),-(days-1)));
  const tasks = tasksOfKind('task').filter((t)=>t.date>=from);
  const completed = tasks.filter((t)=>t.status==='completed').length;
  const missed = tasks.filter((t)=>isOverdue(t) || t.status==='cancelled').length;
  const pending = tasks.length - completed - missed;
  return `
    <div class="chart-block"><h4>Completed vs Missed vs Pending</h4>${svgDonutChart([
      { label:'Completed', value:completed, color:REPORT_CHART_COLORS.green },
      { label:'Missed', value:missed, color:REPORT_CHART_COLORS.red },
      { label:'Pending', value:Math.max(0,pending), color:REPORT_CHART_COLORS.grey },
    ])}</div>
  `;
}

function renderHabitsReport(){
  const habits = db.habits.filter((h)=>h.active!==false);
  const items = habits.map((h)=>({ label: h.name, a: habitCompletionPct(h.id, 30) }));
  const days = 14;
  const overallPoints = Array.from({length:days}, (_,i)=>{
    const d = addDays(new Date(), -(days-1-i));
    const key = ymd(d);
    const total = habits.length;
    const done = habits.filter((h)=>{ const l = habitLogFor(h.id, key); return l && l.done; }).length;
    return { label:(d.getMonth()+1)+'/'+d.getDate(), value: total?Math.round((done/total)*100):0 };
  });
  return `
    <div class="chart-block"><h4>Overall Habit Completion % (last 14 days)</h4>${svgLineChart(overallPoints, {color:REPORT_CHART_COLORS.green})}</div>
    <div class="chart-block"><h4>Per-Habit Completion % (last 30 days)</h4>${svgGroupedHBarChart(items, ['Completion %'], [REPORT_CHART_COLORS.orange])}</div>
  `;
}

Object.assign(ACTION_HANDLERS, {
  'set-report-view': (id, el) => { state.reportView = el.getAttribute('data-view'); render(); },
  'set-report-period': (id, el) => { state.reportPeriodDays = Number(el.value); render(); },
  'print-report': () => { window.print(); },
});
/* ---------------------------------------------------------------------- */
/* SETTINGS                                                                */
/* ---------------------------------------------------------------------- */

function applyTheme(){
  document.documentElement.setAttribute('data-theme', db.settings.theme==='dark' ? 'dark' : 'light');
}
function applyFontSize(){
  document.documentElement.setAttribute('data-fontsize', db.settings.fontSize || 'medium');
}

function renderSettings(){
  const modulesHtml = HUB_LINKS.map((h)=>`<div class="item-row row-blue" data-action="goto" data-view="${h.id}" style="cursor:pointer;"><div><span class="title">${h.icon} ${h.label}</span></div></div>`).join('');
  return `
    <div class="form-section">
      <h3>🎨 Appearance</h3>
      <div class="form-grid">
        <div class="form-field"><label>Theme</label>
          <select data-action="set-theme"><option value="light" ${db.settings.theme!=='dark'?'selected':''}>Light</option><option value="dark" ${db.settings.theme==='dark'?'selected':''}>Dark</option></select>
        </div>
        <div class="form-field"><label>Font Size</label>
          <select data-action="set-fontsize"><option value="small" ${db.settings.fontSize==='small'?'selected':''}>Small</option><option value="medium" ${(!db.settings.fontSize||db.settings.fontSize==='medium')?'selected':''}>Medium</option><option value="large" ${db.settings.fontSize==='large'?'selected':''}>Large</option></select>
        </div>
      </div>
    </div>

    <div class="form-section">
      <h3>🔗 Modules</h3>
      <div class="item-list">${modulesHtml}</div>
    </div>

    <div class="form-section">
      <h3>💾 Backup &amp; Restore</h3>
      <p class="hint">Everything is stored locally on this device (IndexedDB). Export a backup regularly, and always before clearing browser data or switching devices.</p>
      <button class="btn secondary" data-action="export-backup">⬇️ Export Full Backup</button>
      <label class="btn secondary" style="display:inline-flex;align-items:center;margin-left:8px;">⬆️ Import Backup
        <input type="file" id="importBackupFile" accept="application/json" style="display:none;">
      </label>
    </div>

    <div class="form-section">
      <h3>🔒 Security</h3>
      <p class="hint">PIN Lock is a local convenience feature to deter casual access on a shared device. It is <strong>not encryption</strong> and does not protect your data from anyone with direct access to this browser or device storage.</p>
      ${db.settings.pinHash
        ? `<button class="btn secondary" data-action="change-pin">Change PIN</button> <button class="btn danger" data-action="remove-pin">Remove PIN Lock</button>`
        : `<button class="btn secondary" data-action="set-pin">Set a PIN</button>`}
      <div style="margin-top:12px;">
        <label style="display:flex;align-items:center;gap:8px;color:var(--muted);">
          <input type="checkbox" disabled style="width:18px;height:18px;"> Biometric Unlock <span class="hint">(coming soon — requires native app wrapper)</span>
        </label>
      </div>
    </div>

    <div class="form-section">
      <h3>ℹ️ About</h3>
      <p>Personal Planner — part of JM Digital Office, Version 1.5.1.</p>
    </div>
  `;
}

async function exportBackup(){
  const payload = {};
  MIRRORED_STORES.forEach((s)=>{ payload[s] = db[s]; });
  payload.backupMeta = { type:'Full', module:'planner', exportedAt:new Date().toISOString() };
  downloadFile('JM-Planner-Backup-'+nowTimestampShort()+'.json', JSON.stringify(payload, null, 2));
}

async function importBackup(file){
  const text = await file.text();
  let parsed;
  try{ parsed = JSON.parse(text); }catch(e){ alert('Invalid backup file.'); return; }
  const foundKeys = MIRRORED_STORES.filter((s)=>Array.isArray(parsed[s]));
  if(!foundKeys.length){ alert('This does not look like a Personal Planner backup file.'); return; }
  openModal('📥 Restore Backup', `
    <p>Found data for: ${foundKeys.join(', ')}.</p>
    <p>Merge adds/updates records by ID. Replace erases current data in those stores first.</p>
  `, `
    <button class="btn grey" id="restoreCancelBtn">Cancel</button>
    <button class="btn secondary" id="restoreMergeBtn">🔀 Merge</button>
    <button class="btn danger" id="restoreReplaceBtn">♻️ Replace</button>
  `);
  document.getElementById('restoreCancelBtn').onclick = closeModal;
  document.getElementById('restoreMergeBtn').onclick = async () => {
    for(const s of foundKeys){
      parsed[s].forEach((rec)=>{
        const idx = db[s].findIndex((x)=>x.id===rec.id);
        if(idx>=0) db[s][idx] = rec; else db[s].push(rec);
      });
      await IDB.bulkPut(s, db[s]);
    }
    closeModal(); render(); alert('Backup merged successfully.');
  };
  document.getElementById('restoreReplaceBtn').onclick = async () => {
    if(!confirm('This will PERMANENTLY REPLACE existing data in the affected sections. Continue?')) return;
    for(const s of foundKeys){
      db[s] = parsed[s];
      await IDB.clear(s);
      await IDB.bulkPut(s, db[s]);
    }
    closeModal(); render(); alert('Backup restored successfully.');
  };
}

async function sha256Hex(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b)=>b.toString(16).padStart(2,'0')).join('');
}

function openSetPinModal(onDone){
  openModal('🔒 Set a PIN', `
    <div class="form-field"><label>New PIN (4-6 digits)</label><input type="password" inputmode="numeric" id="pinNew" maxlength="6"></div>
    <div class="form-field"><label>Confirm PIN</label><input type="password" inputmode="numeric" id="pinConfirm" maxlength="6"></div>
  `, `<button class="btn grey" id="pinCancelBtn">Cancel</button><button class="btn" id="pinSaveBtn">Save PIN</button>`);
  document.getElementById('pinCancelBtn').onclick = closeModal;
  document.getElementById('pinSaveBtn').onclick = async () => {
    const a = document.getElementById('pinNew').value, b = document.getElementById('pinConfirm').value;
    if(!/^\d{4,6}$/.test(a)){ alert('PIN must be 4-6 digits.'); return; }
    if(a!==b){ alert('PINs do not match.'); return; }
    const salt = uid();
    db.settings.pinSalt = salt;
    db.settings.pinHash = await sha256Hex(salt+a);
    saveSettings();
    closeModal(); render();
    onDone && onDone();
  };
}

Object.assign(ACTION_HANDLERS, {
  'set-theme': (id, el) => { db.settings.theme = el.value; saveSettings(); applyTheme(); },
  'set-fontsize': (id, el) => { db.settings.fontSize = el.value; saveSettings(); applyFontSize(); },
  'export-backup': () => exportBackup(),
  'set-pin': () => openSetPinModal(),
  'change-pin': () => openSetPinModal(),
  'remove-pin': () => { if(confirm('Remove PIN lock?')){ db.settings.pinHash=null; db.settings.pinSalt=null; saveSettings(); render(); } },
});

document.addEventListener('change', (e)=>{
  if(e.target && e.target.id==='importBackupFile' && e.target.files[0]){
    importBackup(e.target.files[0]);
    e.target.value = '';
  }
});
/* ---------------------------------------------------------------------- */
/* NOTES (Journal + Quick Notes — unified store via noteType)             */
/* ---------------------------------------------------------------------- */

const JOURNAL_SECTION_KEYS = [
  { key:'achievements', label:'Achievements' },
  { key:'learning', label:'Learning' },
  { key:'ideas', label:'Ideas' },
  { key:'gratitude', label:'Gratitude' },
];

function noteById(id){ return db.notes.find((n)=>n.id===id); }

function renderNotesList(noteType){
  const list = db.notes.filter((n)=>n.noteType===noteType)
    .sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0) || (b.date||'').localeCompare(a.date||''));
  const rows = list.map((n)=>`
    <div class="item-row ${n.pinned?'row-yellow':'row-grey'}">
      <div style="flex:1;min-width:200px;">
        <span class="title">${n.pinned?'📌 ':''}${n.favourite?'⭐ ':''}${escapeHtml(n.title||'(untitled)')}</span>
        <div class="meta">${formatDate(n.date)} — ${stripHtml(n.body||'').slice(0,80)}</div>
      </div>
      <div class="actions-cell">
        <button class="btn sm secondary" data-action="toggle-note-pin" data-id="${n.id}">${n.pinned?'Unpin':'Pin'}</button>
        <button class="btn sm secondary" data-action="edit-note" data-id="${n.id}" data-notetype="${noteType}">Edit</button>
        <button class="btn sm danger" data-action="delete-note" data-id="${n.id}">Delete</button>
      </div>
    </div>`).join('');
  const label = noteType==='journal' ? 'Journal Entry' : 'Quick Note';
  return `
    <div class="toolbar"><div class="spacer"></div><button class="btn" data-action="new-note" data-notetype="${noteType}">➕ New ${label}</button></div>
    <div class="item-list">${rows || `<div class="empty-note">No ${label.toLowerCase()}s yet.</div>`}</div>
  `;
}

function stripHtml(html){ const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }

function openNoteForm(id, noteType){
  const existing = id ? noteById(id) : null;
  noteType = existing ? existing.noteType : noteType;
  const values = existing || { date: todayYMD(), noteType, checklist:[], sections:{}, pinned:false, favourite:false };
  let checklist = (values.checklist||[]).slice();

  const journalSectionsHtml = noteType==='journal' ? JOURNAL_SECTION_KEYS.map((s)=>`
    <div class="form-field full"><label>${s.label}</label><textarea id="section_${s.key}">${escapeHtml((values.sections||{})[s.key]||'')}</textarea></div>
  `).join('') : '';

  openModal((existing?'✏️ Edit ':'➕ New ')+(noteType==='journal'?'Journal Entry':'Quick Note'), `
    <form id="noteForm">
      <div class="form-grid">
        <div class="form-field full"><label>Title</label><input id="f_noteTitle" type="text" value="${escapeHtml(values.title||'')}"></div>
        <div class="form-field"><label>Date</label><input id="f_noteDate" type="date" value="${escapeHtml(values.date||todayYMD())}"></div>
        <div class="form-field"><label>Pinned</label><input id="f_notePinned" type="checkbox" style="width:18px;height:18px;" ${values.pinned?'checked':''}></div>
        <div class="form-field"><label>Favourite</label><input id="f_noteFavourite" type="checkbox" style="width:18px;height:18px;" ${values.favourite?'checked':''}></div>
      </div>
      <div class="form-field full">
        <label>Note</label>
        <div class="richtext-toolbar">
          <button type="button" data-cmd="bold"><b>B</b></button>
          <button type="button" data-cmd="italic"><i>I</i></button>
          <button type="button" data-cmd="insertUnorderedList">• List</button>
        </div>
        <div id="noteBody" class="richtext-body" contenteditable="true">${values.body||''}</div>
      </div>
      ${journalSectionsHtml}
      <div class="form-section" style="margin-top:14px;">
        <h3>Checklist</h3>
        <div id="noteChecklist"></div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <input type="text" id="newNoteChecklistText" placeholder="Add a checklist item…" style="flex:1;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
          <button type="button" class="btn secondary sm" id="addNoteChecklistBtn">Add</button>
        </div>
      </div>
      <div class="form-section">
        <h3>📎 Attachments</h3>
        <div id="attachmentPreviews"><div class="hint">Loading…</div></div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          ${(navigator.mediaDevices && window.MediaRecorder) ? `<button type="button" class="btn secondary sm" id="recordVoiceBtn">🎙️ Record Voice Note</button>` : `<span class="hint">Voice recording is not supported in this browser.</span>`}
          <label class="btn secondary sm" style="display:inline-flex;align-items:center;cursor:pointer;">📷 Add Photo<input type="file" id="photoInput" accept="image/*" style="display:none;"></label>
        </div>
      </div>
    </form>
  `, `<button class="btn grey" id="cancelNoteBtn">Cancel</button><button class="btn" id="saveNoteBtn">💾 Save</button>`);

  document.querySelectorAll('.richtext-toolbar [data-cmd]').forEach((btn)=>{
    btn.onclick = () => { document.execCommand(btn.getAttribute('data-cmd'), false, null); document.getElementById('noteBody').focus(); };
  });

  let workingAttachmentIds = (values.attachmentIds||[]).slice();
  let mediaRecorder = null, recordedChunks = [];

  async function refreshAttachmentPreviews(){
    const container = document.getElementById('attachmentPreviews');
    if(!workingAttachmentIds.length){ container.innerHTML = '<div class="hint">No attachments yet.</div>'; return; }
    const records = await Promise.all(workingAttachmentIds.map((aid)=>loadAttachment(aid)));
    container.innerHTML = records.filter(Boolean).map((rec)=>{
      const url = URL.createObjectURL(rec.blob);
      const preview = rec.blobType==='image'
        ? `<img src="${url}" style="max-width:120px;max-height:90px;border-radius:8px;display:block;">`
        : `<audio controls src="${url}" style="height:32px;"></audio>`;
      return `<div style="display:inline-flex;flex-direction:column;gap:4px;margin:0 10px 10px 0;">${preview}<button type="button" class="btn sm danger" data-att-remove="${rec.id}">Remove</button></div>`;
    }).join('');
    container.querySelectorAll('[data-att-remove]').forEach((btn)=>{
      btn.onclick = () => {
        const aid = btn.getAttribute('data-att-remove');
        workingAttachmentIds = workingAttachmentIds.filter((x)=>x!==aid);
        deleteAttachment(aid);
        refreshAttachmentPreviews();
      };
    });
  }
  refreshAttachmentPreviews();

  const recordBtn = document.getElementById('recordVoiceBtn');
  if(recordBtn){
    recordBtn.onclick = async () => {
      if(mediaRecorder && mediaRecorder.state==='recording'){
        mediaRecorder.stop();
        return;
      }
      try{
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if(e.data.size>0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunks, { type:'audio/webm' });
          const aid = saveAttachmentBlob('note', 'audio', 'audio/webm', blob);
          workingAttachmentIds.push(aid);
          refreshAttachmentPreviews();
          stream.getTracks().forEach((t)=>t.stop());
          recordBtn.textContent = '🎙️ Record Voice Note';
        };
        mediaRecorder.start();
        recordBtn.textContent = '⏹ Stop Recording';
      }catch(err){
        alert('Could not access the microphone: '+err.message);
      }
    };
  }

  document.getElementById('photoInput').onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const aid = saveAttachmentBlob('note', 'image', file.type, file);
    workingAttachmentIds.push(aid);
    refreshAttachmentPreviews();
    e.target.value = '';
  };

  function refreshChecklist(){
    document.getElementById('noteChecklist').innerHTML = checklist.map((it)=>`
      <div class="checklist-row ${it.done?'done':''}">
        <input type="checkbox" data-nc-toggle="${it.id}" ${it.done?'checked':''}>
        <span class="checklist-text" style="flex:1;">${escapeHtml(it.text)}</span>
        <button type="button" class="btn sm danger" data-nc-remove="${it.id}">✕</button>
      </div>`).join('') || '<div class="hint">None yet.</div>';
    document.querySelectorAll('[data-nc-toggle]').forEach((cb)=>{ cb.onchange=()=>{ const it=checklist.find((x)=>x.id===cb.getAttribute('data-nc-toggle')); if(it) it.done=cb.checked; }; });
    document.querySelectorAll('[data-nc-remove]').forEach((btn)=>{ btn.onclick=()=>{ checklist=checklist.filter((x)=>x.id!==btn.getAttribute('data-nc-remove')); refreshChecklist(); }; });
  }
  refreshChecklist();
  document.getElementById('addNoteChecklistBtn').onclick = () => {
    const input = document.getElementById('newNoteChecklistText');
    if(!input.value.trim()) return;
    checklist.push({ id:uid(), text:input.value.trim(), done:false });
    input.value=''; refreshChecklist();
  };

  document.getElementById('cancelNoteBtn').onclick = closeModal;
  document.getElementById('saveNoteBtn').onclick = () => {
    const sections = {};
    JOURNAL_SECTION_KEYS.forEach((s)=>{ const el=document.getElementById('section_'+s.key); if(el) sections[s.key]=el.value; });
    const now = new Date().toISOString();
    const record = Object.assign({}, values, {
      id: existing?existing.id:nextId('NOTE','note'),
      noteType,
      title: document.getElementById('f_noteTitle').value,
      date: document.getElementById('f_noteDate').value,
      pinned: document.getElementById('f_notePinned').checked,
      favourite: document.getElementById('f_noteFavourite').checked,
      body: document.getElementById('noteBody').innerHTML,
      checklist, sections, attachmentIds: workingAttachmentIds,
      createdAt: existing?existing.createdAt:now, updatedAt: now,
    });
    saveRecord('notes', record);
    closeModal(); render();
  };
}

Object.assign(ACTION_HANDLERS, {
  'new-note': (id, el) => openNoteForm(null, el.getAttribute('data-notetype')),
  'edit-note': (id, el) => openNoteForm(id, el.getAttribute('data-notetype')),
  'delete-note': (id) => { if(confirm('Delete this note?')){ deleteRecord('notes', id); render(); } },
  'toggle-note-pin': (id) => { const n = noteById(id); if(n){ n.pinned=!n.pinned; saveRecord('notes', n); render(); } },
});

/* ---------------------------------------------------------------------- */
/* DOCUMENT LINKS (reference-only, no upload)                             */
/* ---------------------------------------------------------------------- */

const DOCUMENT_FIELDS = [
  { key:'title', label:'Title', type:'text', required:true },
  { key:'type', label:'Type', type:'select', options:['PDF','Word','Excel','Image','Website','Folder'], required:true },
  { key:'pathOrUrl', label:'Path / URL', type:'text', required:true, hint:'A local file path or a web URL — this is a reference only, nothing is uploaded.' },
  { key:'notes', label:'Notes', type:'textarea' },
];

function documentById(id){ return db.documents.find((d)=>d.id===id); }

function renderDocuments(){
  const rows = db.documents.map((d)=>`
    <div class="item-row row-blue">
      <div><span class="title">${docTypeIcon(d.type)} ${escapeHtml(d.title)}</span><div class="meta">${escapeHtml(d.pathOrUrl)}</div></div>
      <div class="actions-cell">
        <button class="btn sm secondary" data-action="edit-document" data-id="${d.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-document" data-id="${d.id}">Delete</button>
      </div>
    </div>`).join('');
  return `
    <div class="toolbar"><div class="spacer"></div><button class="btn" data-action="new-document">➕ Add Document Link</button></div>
    <div class="item-list">${rows || '<div class="empty-note">No document links yet.</div>'}</div>
  `;
}
function docTypeIcon(t){ return { PDF:'📕', Word:'📘', Excel:'📗', Image:'🖼️', Website:'🌐', Folder:'📁' }[t] || '📄'; }

function openDocumentForm(id){
  const existing = id ? documentById(id) : null;
  openModal(existing?'✏️ Edit Document Link':'➕ New Document Link', `
    <form id="documentForm"><div class="form-grid">${fieldsToHTML(DOCUMENT_FIELDS, existing||{})}</div></form>
  `, `<button class="btn grey" id="cancelDocBtn">Cancel</button><button class="btn" id="saveDocBtn">💾 Save</button>`);
  document.getElementById('cancelDocBtn').onclick = closeModal;
  document.getElementById('saveDocBtn').onclick = () => {
    const vals = readFieldsFromForm(DOCUMENT_FIELDS, document.getElementById('documentForm'));
    if(!vals.title || !vals.pathOrUrl){ alert('Title and Path/URL are required.'); return; }
    saveRecord('documents', Object.assign({}, existing, vals, { id: existing?existing.id:nextId('DOC','document') }));
    closeModal(); render();
  };
}
Object.assign(ACTION_HANDLERS, {
  'new-document': () => openDocumentForm(null),
  'edit-document': (id) => openDocumentForm(id),
  'delete-document': (id) => { if(confirm('Delete this document link?')){ deleteRecord('documents', id); render(); } },
});

/* ---------------------------------------------------------------------- */
/* CONTACTS                                                                */
/* ---------------------------------------------------------------------- */

const CONTACT_FIELDS = [
  { key:'name', label:'Name', type:'text', required:true },
  { key:'relationOrRole', label:'Relation / Role', type:'text' },
  { key:'category', label:'Category', type:'select', options:['Family','Office','Clinic','Institute','Doctor','Emergency'] },
  { key:'phone', label:'Phone', type:'text' },
  { key:'email', label:'Email', type:'text' },
  { key:'favourite', label:'Favourite', type:'checkbox' },
  { key:'notes', label:'Notes', type:'textarea' },
];

function contactById(id){ return db.contacts.find((c)=>c.id===id); }

function renderContacts(){
  const list = db.contacts.slice().sort((a,b)=>(b.favourite?1:0)-(a.favourite?1:0) || (a.name||'').localeCompare(b.name||''));
  const rows = list.map((c)=>`
    <div class="item-row row-purple">
      <div><span class="title">${c.favourite?'⭐ ':''}${escapeHtml(c.name)}</span><div class="meta">${escapeHtml(c.category||'—')}${c.relationOrRole?' · '+escapeHtml(c.relationOrRole):''}${c.phone?' · '+escapeHtml(c.phone):''}</div></div>
      <div class="actions-cell">
        <button class="btn sm secondary" data-action="edit-contact" data-id="${c.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-contact" data-id="${c.id}">Delete</button>
      </div>
    </div>`).join('');
  return `
    <div class="toolbar"><div class="spacer"></div><button class="btn" data-action="new-contact">➕ Add Contact</button></div>
    <div class="item-list">${rows || '<div class="empty-note">No contacts yet.</div>'}</div>
  `;
}

function openContactForm(id){
  const existing = id ? contactById(id) : null;
  openModal(existing?'✏️ Edit Contact':'➕ New Contact', `
    <form id="contactForm"><div class="form-grid">${fieldsToHTML(CONTACT_FIELDS, existing||{})}</div></form>
  `, `<button class="btn grey" id="cancelContactBtn">Cancel</button><button class="btn" id="saveContactBtn">💾 Save</button>`);
  document.getElementById('cancelContactBtn').onclick = closeModal;
  document.getElementById('saveContactBtn').onclick = () => {
    const vals = readFieldsFromForm(CONTACT_FIELDS, document.getElementById('contactForm'));
    if(!vals.name || !vals.name.trim()){ alert('Name is required.'); return; }
    saveRecord('contacts', Object.assign({}, existing, vals, { id: existing?existing.id:nextId('CONTACT','contact') }));
    closeModal(); render();
  };
}
Object.assign(ACTION_HANDLERS, {
  'new-contact': () => openContactForm(null),
  'edit-contact': (id) => openContactForm(id),
  'delete-contact': (id) => { if(confirm('Delete this contact?')){ deleteRecord('contacts', id); render(); } },
});

/* ---------------------------------------------------------------------- */
/* TRAVEL PLANNER                                                          */
/* ---------------------------------------------------------------------- */

const TRIP_FIELDS = [
  { key:'title', label:'Trip Title', type:'text', required:true },
  { key:'destination', label:'Destination', type:'text' },
  { key:'startDate', label:'Start Date', type:'date' },
  { key:'endDate', label:'End Date', type:'date' },
  { key:'budget', label:'Budget', type:'number' },
  { key:'status', label:'Status', type:'select', options:STATUSES },
  { key:'notes', label:'Notes', type:'textarea' },
];

function tripById(id){ return db.trips.find((t)=>t.id===id); }
function tripExpenseTotal(t){ return (t.expenses||[]).reduce((s,e)=>s+(Number(e.amount)||0),0); }

function renderTravel(){
  const rows = db.trips.slice().sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||'')).map((t)=>`
    <div class="item-row row-blue">
      <div><span class="title">✈️ ${escapeHtml(t.title)}</span><div class="meta">${escapeHtml(t.destination||'—')} · ${formatDate(t.startDate)} – ${formatDate(t.endDate)} · Spent ${formatCurrency(tripExpenseTotal(t))} of ${formatCurrency(t.budget)}</div></div>
      <div class="actions-cell">
        ${statusMeta(t.status)?`<span class="badge badge-${statusMeta(t.status).color}">${statusMeta(t.status).label}</span>`:''}
        <button class="btn sm secondary" data-action="edit-trip" data-id="${t.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-trip" data-id="${t.id}">Delete</button>
      </div>
    </div>`).join('');
  return `
    <div class="toolbar"><div class="spacer"></div><button class="btn" data-action="new-trip">➕ Add Trip</button></div>
    <div class="item-list">${rows || '<div class="empty-note">No trips planned yet.</div>'}</div>
  `;
}

function openTripForm(id){
  const existing = id ? tripById(id) : null;
  const values = existing || { status:'pending', packing:[], bookings:[], expenses:[] };
  let packing = (values.packing||[]).slice();
  let bookings = (values.bookings||[]).slice();
  let expenses = (values.expenses||[]).slice();

  openModal(existing?'✏️ Edit Trip':'➕ New Trip', `
    <form id="tripForm"><div class="form-grid">${fieldsToHTML(TRIP_FIELDS, values)}</div></form>
    <div class="form-section" style="margin-top:14px;">
      <h3>🎒 Packing Checklist</h3>
      <div id="packingList"></div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <input type="text" id="newPackingItem" placeholder="Add an item…" style="flex:1;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
        <button type="button" class="btn secondary sm" id="addPackingBtn">Add</button>
      </div>
    </div>
    <div class="form-section">
      <h3>🏨 Bookings</h3>
      <div id="bookingsList"></div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <select id="newBookingType"><option value="Hotel">Hotel</option><option value="Transport">Transport</option></select>
        <input type="text" id="newBookingName" placeholder="Name / reference" style="flex:1;min-width:120px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
        <input type="number" id="newBookingCost" placeholder="Cost" style="width:100px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
        <button type="button" class="btn secondary sm" id="addBookingBtn">Add</button>
      </div>
    </div>
    <div class="form-section">
      <h3>💰 Expenses</h3>
      <div id="expensesList"></div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <input type="text" id="newExpenseLabel" placeholder="Label" style="flex:1;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
        <input type="number" id="newExpenseAmount" placeholder="Amount" style="width:100px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;">
        <button type="button" class="btn secondary sm" id="addExpenseBtn">Add</button>
      </div>
    </div>
  `, `<button class="btn grey" id="cancelTripBtn">Cancel</button><button class="btn" id="saveTripBtn">💾 Save Trip</button>`);

  function refreshPacking(){
    document.getElementById('packingList').innerHTML = packing.map((p)=>`
      <div class="checklist-row ${p.packed?'done':''}"><input type="checkbox" data-pk-toggle="${p.id}" ${p.packed?'checked':''}><span class="checklist-text" style="flex:1;">${escapeHtml(p.item)}</span><button type="button" class="btn sm danger" data-pk-remove="${p.id}">✕</button></div>
    `).join('') || '<div class="hint">None yet.</div>';
    document.querySelectorAll('[data-pk-toggle]').forEach((cb)=>{ cb.onchange=()=>{ const p=packing.find((x)=>x.id===cb.getAttribute('data-pk-toggle')); if(p) p.packed=cb.checked; }; });
    document.querySelectorAll('[data-pk-remove]').forEach((btn)=>{ btn.onclick=()=>{ packing=packing.filter((x)=>x.id!==btn.getAttribute('data-pk-remove')); refreshPacking(); }; });
  }
  function refreshBookings(){
    document.getElementById('bookingsList').innerHTML = bookings.map((b)=>`
      <div class="checklist-row"><span class="checklist-text" style="flex:1;">${escapeHtml(b.type)}: ${escapeHtml(b.name)} — ${formatCurrency(b.cost)}</span><button type="button" class="btn sm danger" data-bk-remove="${b.id}">✕</button></div>
    `).join('') || '<div class="hint">None yet.</div>';
    document.querySelectorAll('[data-bk-remove]').forEach((btn)=>{ btn.onclick=()=>{ bookings=bookings.filter((x)=>x.id!==btn.getAttribute('data-bk-remove')); refreshBookings(); }; });
  }
  function refreshExpenses(){
    document.getElementById('expensesList').innerHTML = expenses.map((e)=>`
      <div class="checklist-row"><span class="checklist-text" style="flex:1;">${escapeHtml(e.label)} — ${formatCurrency(e.amount)}</span><button type="button" class="btn sm danger" data-ex-remove="${e.id}">✕</button></div>
    `).join('') || '<div class="hint">None yet.</div>';
    document.querySelectorAll('[data-ex-remove]').forEach((btn)=>{ btn.onclick=()=>{ expenses=expenses.filter((x)=>x.id!==btn.getAttribute('data-ex-remove')); refreshExpenses(); }; });
  }
  refreshPacking(); refreshBookings(); refreshExpenses();

  document.getElementById('addPackingBtn').onclick = () => {
    const input = document.getElementById('newPackingItem');
    if(!input.value.trim()) return;
    packing.push({ id:uid(), item:input.value.trim(), packed:false });
    input.value=''; refreshPacking();
  };
  document.getElementById('addBookingBtn').onclick = () => {
    const name = document.getElementById('newBookingName');
    if(!name.value.trim()) return;
    bookings.push({ id:uid(), type:document.getElementById('newBookingType').value, name:name.value.trim(), cost:Number(document.getElementById('newBookingCost').value)||0 });
    name.value=''; document.getElementById('newBookingCost').value=''; refreshBookings();
  };
  document.getElementById('addExpenseBtn').onclick = () => {
    const label = document.getElementById('newExpenseLabel');
    if(!label.value.trim()) return;
    expenses.push({ id:uid(), label:label.value.trim(), amount:Number(document.getElementById('newExpenseAmount').value)||0, date:todayYMD() });
    label.value=''; document.getElementById('newExpenseAmount').value=''; refreshExpenses();
  };

  document.getElementById('cancelTripBtn').onclick = closeModal;
  document.getElementById('saveTripBtn').onclick = () => {
    const vals = readFieldsFromForm(TRIP_FIELDS, document.getElementById('tripForm'));
    if(!vals.title || !vals.title.trim()){ alert('Trip title is required.'); return; }
    saveRecord('trips', Object.assign({}, values, vals, { id: existing?existing.id:nextId('TRIP','trip'), packing, bookings, expenses }));
    closeModal(); render();
  };
}
Object.assign(ACTION_HANDLERS, {
  'new-trip': () => openTripForm(null),
  'edit-trip': (id) => openTripForm(id),
  'delete-trip': (id) => { if(confirm('Delete this trip?')){ deleteRecord('trips', id); render(); } },
});

/* ---------------------------------------------------------------------- */
/* ASSIGNMENT & FOLLOW-UP MANAGEMENT SYSTEM (v1.5.1)                       */
/* ----------------------------------------------------------------------
   A professional task-delegation system layered on top of the same
   IndexedDB-backed db mirror, FIELDS-driven CRUD, and modal/render
   patterns used everywhere else in this module. Two new stores only
   (assignments, people) — the follow-up timeline and follow-up log are
   nested arrays on the assignment record, the same normalization choice
   already used for Trip packing/bookings/expenses.

   Future integration point: window.JMPlanner.ingest(sourceModule, payload)
   (defined further down, near INIT) is where a future WBCYN/Clinic/
   Rental/Trust module would push an auto-created assignment. Nothing
   calls it yet — architecture only, per spec.
------------------------------------------------------------------------- */

const ASSIGNMENT_CATEGORIES = [
  'Office','WBCYN','Clinic','Rental','Trust','Finance','Legal','Meeting',
  'Inspection','Website','Travel','Purchase','Accounts','Research','Personal'
];
function allAssignmentCategories(){ return ASSIGNMENT_CATEGORIES.concat((db.settings.customCategories||[])); }

const ASSIGNMENT_PRIORITIES = [
  { id:'critical', label:'Critical', color:'red' },
  { id:'high', label:'High', color:'orange' },
  { id:'medium', label:'Medium', color:'yellow' },
  { id:'low', label:'Low', color:'blue' },
];
function assignmentPriorityMeta(id){ return ASSIGNMENT_PRIORITIES.find((p)=>p.id===id) || ASSIGNMENT_PRIORITIES[2]; }
function assignmentPriorityBadge(p){ const m = assignmentPriorityMeta(p); return `<span class="badge badge-${m.color}">${escapeHtml(m.label)}</span>`; }

// 'Overdue' is deliberately NOT a stored status — it's derived from the
// expected completion date exactly like isOverdue() does for tasks, so it
// can never drift out of sync with today's date.
const ASSIGNMENT_STATUSES = [
  { id:'Assigned', color:'grey' },
  { id:'Accepted', color:'blue' },
  { id:'In Progress', color:'orange' },
  { id:'Waiting', color:'purple' },
  { id:'Need Clarification', color:'yellow' },
  { id:'Completed', color:'green' },
  { id:'Verified', color:'green' },
  { id:'Rejected', color:'red' },
  { id:'Cancelled', color:'grey' },
];
function assignmentStatusMeta(id){ return ASSIGNMENT_STATUSES.find((s)=>s.id===id) || ASSIGNMENT_STATUSES[0]; }
function isAssignmentOverdue(a){
  return a.expectedCompletionDate && a.expectedCompletionDate < todayYMD() && !['Completed','Verified','Rejected','Cancelled'].includes(a.status);
}
function assignmentStatusBadge(a){
  if(isAssignmentOverdue(a)) return `<span class="badge badge-red">Overdue</span>`;
  const m = assignmentStatusMeta(a.status);
  return `<span class="badge badge-${m.color}">${escapeHtml(a.status)}</span>`;
}

const REMINDER_INTERVAL_OPTIONS = [
  { id:0, label:'Same Day' }, { id:1, label:'1 Day' }, { id:2, label:'2 Days' },
  { id:3, label:'3 Days' }, { id:7, label:'7 Days' }, { id:-1, label:'Custom' },
];

function assignmentById(id){ return db.assignments.find((a)=>a.id===id); }
function personById(id){ return db.people.find((p)=>p.id===id); }
function personName(id){ const p = personById(id); return p ? p.name : '(unknown person)'; }

function addTimelineEvent(a, type, remarks){
  a.timeline = a.timeline || [];
  a.timeline.push({ id:uid(), type, date:todayYMD(), time:new Date().toTimeString().slice(0,5), user: db.settings.ownerName||'Dr. M. Jahangir', remarks:remarks||'' });
}

const ASSIGNMENT_SUB_TABS = [
  { id:'dashboard', label:'Dashboard' },
  { id:'list', label:'Assignments' },
  { id:'people', label:'People' },
  { id:'overdue', label:'Overdue' },
  { id:'reports', label:'Reports' },
];

function renderAssignmentsModule(){
  const tabsHtml = ASSIGNMENT_SUB_TABS.map((t)=>`<button class="btn sm ${state.assignmentView===t.id?'':'secondary'}" data-action="set-assignment-view" data-view="${t.id}">${t.label}</button>`).join('');
  const body =
    state.assignmentView==='list' ? renderAssignmentsList() :
    state.assignmentView==='people' ? renderPeople() :
    state.assignmentView==='overdue' ? renderOverdueMonitor() :
    state.assignmentView==='reports' ? renderAssignmentReports() :
    renderAssignmentDashboard();
  return `<div class="toolbar no-print">${tabsHtml}</div>${body}`;
}
Object.assign(ACTION_HANDLERS, {
  'set-assignment-view': (id, el) => { state.assignmentView = el.getAttribute('data-view'); render(); },
});

/* ---------------------------------------------------------------------- */
/* PERSON DIRECTORY                                                        */
/* ---------------------------------------------------------------------- */

const PERSON_FIELDS = [
  { key:'name', label:'Name', type:'text', required:true },
  { key:'designation', label:'Designation', type:'text' },
  { key:'organisation', label:'Organisation', type:'text' },
  { key:'department', label:'Department', type:'text' },
  { key:'mobile', label:'Mobile', type:'text' },
  { key:'whatsapp', label:'WhatsApp (if different)', type:'text' },
  { key:'email', label:'Email', type:'text' },
  { key:'address', label:'Address', type:'textarea' },
  { key:'notes', label:'Notes', type:'textarea' },
  { key:'status', label:'Status', type:'select', options:['Active','Inactive'] },
];

function renderPeople(){
  const list = db.people.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const rows = list.map((p)=>{
    const given = db.assignments.filter((a)=>a.assignedToPersonId===p.id).length;
    return `<div class="item-row ${p.status==='Inactive'?'row-grey':'row-blue'}">
      <div><span class="title">${escapeHtml(p.name)}</span><div class="meta">${escapeHtml(p.designation||'—')}${p.organisation?' · '+escapeHtml(p.organisation):''}${p.mobile?' · '+escapeHtml(p.mobile):''} · ${given} assignment(s)</div></div>
      <div class="actions-cell">
        <button class="btn sm secondary" data-action="edit-person" data-id="${p.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-person" data-id="${p.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  return `
    <div class="toolbar"><input type="text" id="inlineSearchBox" placeholder="Search people…" value="${escapeHtml(state.search)}"><div class="spacer"></div><button class="btn" data-action="new-person">➕ Add Person</button></div>
    <div class="item-list">${rows || '<div class="empty-note">No people in the directory yet.</div>'}</div>
  `;
}

function openPersonForm(id){
  const existing = id ? personById(id) : null;
  openModal(existing?'✏️ Edit Person':'➕ New Person', `
    <form id="personForm"><div class="form-grid">${fieldsToHTML(PERSON_FIELDS, existing||{status:'Active'})}</div></form>
  `, `<button class="btn grey" id="cancelPersonBtn">Cancel</button><button class="btn" id="savePersonBtn">💾 Save</button>`);
  document.getElementById('cancelPersonBtn').onclick = closeModal;
  document.getElementById('savePersonBtn').onclick = () => {
    const vals = readFieldsFromForm(PERSON_FIELDS, document.getElementById('personForm'));
    if(!vals.name || !vals.name.trim()){ alert('Name is required.'); return; }
    saveRecord('people', Object.assign({}, existing, vals, { id: existing?existing.id:nextId('PERSON','person') }));
    closeModal(); render();
  };
}
Object.assign(ACTION_HANDLERS, {
  'new-person': () => openPersonForm(null),
  'edit-person': (id) => openPersonForm(id),
  'delete-person': (id) => {
    const given = db.assignments.filter((a)=>a.assignedToPersonId===id).length;
    const msg = given ? `This person has ${given} assignment(s) on record. Deleting them will not delete those assignments, but they will show as unassigned. Continue?` : 'Delete this person?';
    if(confirm(msg)){ deleteRecord('people', id); render(); }
  },
});

/* ---------------------------------------------------------------------- */
/* ASSIGNMENT CRUD                                                        */
/* ---------------------------------------------------------------------- */

const ASSIGNMENT_FIELDS = [
  { key:'title', label:'Assignment Title', type:'text', required:true },
  { key:'description', label:'Detailed Description', type:'textarea' },
  { key:'assignedBy', label:'Assigned By', type:'text' },
  { key:'organisation', label:'Organisation', type:'text' },
  { key:'department', label:'Department', type:'text' },
  { key:'category', label:'Category', type:'select', options: () => allAssignmentCategories(), required:true },
  { key:'priority', label:'Priority', type:'select', options: ASSIGNMENT_PRIORITIES, required:true },
  { key:'status', label:'Status', type:'select', options: ASSIGNMENT_STATUSES.map((s)=>({id:s.id,label:s.id})), required:true },
  { key:'dateAssigned', label:'Date Assigned', type:'date', required:true },
  { key:'timeAssigned', label:'Time Assigned', type:'time' },
  { key:'expectedCompletionDate', label:'Expected Completion Date', type:'date', required:true },
  { key:'expectedCompletionTime', label:'Expected Completion Time', type:'time' },
  { key:'estimatedDurationMins', label:'Estimated Duration (mins)', type:'number' },
  { key:'location', label:'Location', type:'text' },
  { key:'relatedModule', label:'Related Module', type:'select', options:['None','WBCYN','Clinic','Rental','Trust','Personal','Other'] },
  { key:'referenceNumber', label:'Reference Number', type:'text' },
  { key:'reminderIntervalDays', label:'Reminder', type:'select', options: REMINDER_INTERVAL_OPTIONS },
  { key:'remarks', label:'Remarks', type:'textarea' },
];

function progressBarHtml(pct){
  pct = Math.max(0, Math.min(100, pct||0));
  return `<div style="background:var(--border);border-radius:6px;height:8px;overflow:hidden;margin-top:6px;"><div style="background:${pct>=100?'var(--green)':'var(--accent)'};height:100%;width:${pct}%;"></div></div>`;
}

function renderAssignmentsList(){
  const f = state.assignmentFilter;
  let list = db.assignments.slice();
  if(state.search){
    const q = state.search.toLowerCase();
    list = list.filter((a)=>[a.id,a.title,a.referenceNumber,a.department,personName(a.assignedToPersonId)].join(' ').toLowerCase().includes(q));
  }
  if(f.status) list = list.filter((a)=>a.status===f.status);
  if(f.category) list = list.filter((a)=>a.category===f.category);
  if(f.priority) list = list.filter((a)=>a.priority===f.priority);
  const sortFns = {
    date: (a,b)=>(a.expectedCompletionDate||'').localeCompare(b.expectedCompletionDate||''),
    priority: (a,b)=>ASSIGNMENT_PRIORITIES.findIndex((p)=>p.id===a.priority)-ASSIGNMENT_PRIORITIES.findIndex((p)=>p.id===b.priority),
    title: (a,b)=>(a.title||'').localeCompare(b.title||''),
  };
  list = list.slice().sort(sortFns[f.sort]||sortFns.date);

  const rows = list.map((a)=>`
    <div class="item-row ${isAssignmentOverdue(a)?'row-red':'row-'+assignmentPriorityMeta(a.priority).color}" style="flex-direction:column;align-items:stretch;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <span class="title">${escapeHtml(a.id)} — ${escapeHtml(a.title)}</span>
          <div class="meta">${escapeHtml(personName(a.assignedToPersonId))} · ${escapeHtml(a.category||'—')} · Due ${formatDate(a.expectedCompletionDate)}${a.expectedCompletionTime?' '+formatTime(a.expectedCompletionTime):''}</div>
          ${progressBarHtml(a.progressPct)}
        </div>
        <div class="actions-cell">
          ${assignmentPriorityBadge(a.priority)} ${assignmentStatusBadge(a)}
          <button class="btn sm secondary" data-action="edit-assignment" data-id="${a.id}">Open</button>
          <button class="btn sm secondary" data-action="whatsapp-assignment" data-id="${a.id}">📲 Remind</button>
          ${a.status==='Completed' ? `
            <button class="btn sm" data-action="verify-assignment" data-id="${a.id}">✅ Approve</button>
            <button class="btn sm danger" data-action="reject-assignment" data-id="${a.id}">❌ Reject</button>
            <button class="btn sm secondary" data-action="revise-assignment" data-id="${a.id}">🔁 Revise</button>
          ` : ''}
          <button class="btn sm secondary" data-action="duplicate-assignment" data-id="${a.id}">Duplicate</button>
          <button class="btn sm danger" data-action="delete-assignment" data-id="${a.id}">Delete</button>
        </div>
      </div>
    </div>`).join('');

  const catOptions = allAssignmentCategories();
  return `
    <div class="toolbar">
      <input type="text" id="inlineSearchBox" placeholder="Search by ID, title, person, department, reference…" value="${escapeHtml(state.search)}">
      <select data-action="set-assignment-filter" data-key="status"><option value="">All Status</option>${ASSIGNMENT_STATUSES.map((s)=>`<option value="${s.id}" ${f.status===s.id?'selected':''}>${s.id}</option>`).join('')}</select>
      <select data-action="set-assignment-filter" data-key="category"><option value="">All Categories</option>${catOptions.map((c)=>`<option value="${escapeHtml(c)}" ${f.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
      <select data-action="set-assignment-filter" data-key="priority"><option value="">All Priorities</option>${ASSIGNMENT_PRIORITIES.map((p)=>`<option value="${p.id}" ${f.priority===p.id?'selected':''}>${p.label}</option>`).join('')}</select>
      <select data-action="set-assignment-filter" data-key="sort"><option value="date" ${f.sort==='date'?'selected':''}>Sort: Due Date</option><option value="priority" ${f.sort==='priority'?'selected':''}>Sort: Priority</option><option value="title" ${f.sort==='title'?'selected':''}>Sort: Title</option></select>
      <div class="spacer"></div>
      <button class="btn" data-action="new-assignment">➕ New Assignment</button>
    </div>
    <div class="item-list">${rows || '<div class="empty-note">No assignments match your filters.</div>'}</div>
  `;
}

function openAssignmentForm(id){
  if(!id && !db.people.length){ alert('Add at least one person to the Directory before creating an assignment.'); state.assignmentView='people'; render(); return; }
  const existing = id ? assignmentById(id) : null;
  const values = existing || {
    assignedBy: db.settings.ownerName||'Dr. M. Jahangir', status:'Assigned', priority:'medium',
    dateAssigned: todayYMD(), expectedCompletionDate: todayYMD(), progressPct:0,
    reminderIntervalDays:1, timeline:[], followUps:[], attachmentIds:[],
  };
  let followUps = (values.followUps||[]).slice();
  let workingAttachmentIds = (values.attachmentIds||[]).slice();

  const personOptions = db.people.map((p)=>`<option value="${p.id}" ${p.id===values.assignedToPersonId?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
  const fieldsHtml = ASSIGNMENT_FIELDS.map((fld)=>{
    const f = Object.assign({}, fld, { options: resolvedOptions(fld) });
    return `<div class="form-field ${f.type==='textarea'?'full':''}"><label>${escapeHtml(f.label)}${f.required?' *':''}</label>${fieldInputHTML(f, values[f.key])}${f.hint?`<span class="hint">${escapeHtml(f.hint)}</span>`:''}</div>`;
  }).join('');

  const timelineHtml = (values.timeline||[]).slice().reverse().map((e)=>`
    <div class="item-row row-blue"><div><span class="title">${escapeHtml(e.type)}</span><div class="meta">${formatDate(e.date)} ${e.time||''} · ${escapeHtml(e.user||'')}${e.remarks?' — '+escapeHtml(e.remarks):''}</div></div></div>
  `).join('') || '<div class="empty-note">No timeline events yet.</div>';

  openModal((existing?'✏️ Edit ':'➕ New ')+'Assignment', `
    <form id="assignmentForm">
      <div class="form-grid">
        <div class="form-field"><label>Assigned To (Person Directory) *</label><select id="f_assignedToPersonId">${personOptions}</select></div>
        ${fieldsHtml}
      </div>
      <div class="form-field full"><label>Progress</label>
        <select id="f_progressPct">${[0,10,20,30,40,50,60,70,80,90,100].map((n)=>`<option value="${n}" ${Number(values.progressPct||0)===n?'selected':''}>${n}%</option>`).join('')}</select>
        ${progressBarHtml(values.progressPct)}
      </div>
    </form>

    <div class="form-section" style="margin-top:14px;">
      <h3>📎 Attachments</h3>
      <div id="attachmentPreviews"><div class="hint">Loading…</div></div>
      <label class="btn secondary sm" style="display:inline-flex;align-items:center;cursor:pointer;margin-top:8px;">📎 Add File<input type="file" id="assignmentFileInput" style="display:none;"></label>
    </div>

    <div class="form-section">
      <h3>📞 Follow-up Log</h3>
      <div id="followUpList"></div>
      <div class="form-grid" style="margin-top:10px;">
        <div class="form-field"><label>Mode</label><select id="newFollowUpMode"><option>Phone</option><option>WhatsApp</option><option>Email</option><option>Meeting</option><option>Office Visit</option><option>Letter</option></select></div>
        <div class="form-field"><label>Next Follow-up Date</label><input type="date" id="newFollowUpNextDate"></div>
        <div class="form-field full"><label>Remarks</label><input type="text" id="newFollowUpRemarks"></div>
      </div>
      <button type="button" class="btn secondary sm" id="addFollowUpBtn">➕ Add Follow-up Entry</button>
    </div>

    <div class="form-section">
      <h3>🕒 Timeline</h3>
      <div class="item-list">${timelineHtml}</div>
    </div>
  `, `<button class="btn grey" id="cancelAssignmentBtn">Cancel</button><button class="btn" id="saveAssignmentBtn">💾 Save Assignment</button>`);

  async function refreshAttachmentPreviews(){
    const container = document.getElementById('attachmentPreviews');
    if(!workingAttachmentIds.length){ container.innerHTML = '<div class="hint">No attachments yet.</div>'; return; }
    const records = await Promise.all(workingAttachmentIds.map((aid)=>loadAttachment(aid)));
    container.innerHTML = records.filter(Boolean).map((rec)=>{
      const url = URL.createObjectURL(rec.blob);
      const preview = rec.blobType==='image'
        ? `<img src="${url}" style="max-width:120px;max-height:90px;border-radius:8px;display:block;">`
        : `<a href="${url}" download="${escapeHtml(rec.fileName||'attachment')}" class="btn sm secondary">📄 ${escapeHtml(rec.fileName||'Download')}</a>`;
      return `<div style="display:inline-flex;flex-direction:column;gap:4px;margin:0 10px 10px 0;">${preview}<button type="button" class="btn sm danger" data-att-remove="${rec.id}">Remove</button></div>`;
    }).join('');
    container.querySelectorAll('[data-att-remove]').forEach((btn)=>{
      btn.onclick = () => { const aid=btn.getAttribute('data-att-remove'); workingAttachmentIds=workingAttachmentIds.filter((x)=>x!==aid); deleteAttachment(aid); refreshAttachmentPreviews(); };
    });
  }
  refreshAttachmentPreviews();
  document.getElementById('assignmentFileInput').onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const aid = saveAttachmentBlob('assignment', file.type.startsWith('image/')?'image':'file', file.type, file, file.name);
    workingAttachmentIds.push(aid);
    refreshAttachmentPreviews();
    e.target.value = '';
  };

  function refreshFollowUps(){
    document.getElementById('followUpList').innerHTML = followUps.slice().reverse().map((fu)=>`
      <div class="item-row row-purple"><div><span class="title">${escapeHtml(fu.mode)}</span><div class="meta">${formatDate(fu.date)} ${fu.time||''}${fu.remarks?' — '+escapeHtml(fu.remarks):''}${fu.nextFollowUpDate?' · Next: '+formatDate(fu.nextFollowUpDate):''}</div></div>
      <button type="button" class="btn sm danger" data-fu-remove="${fu.id}">✕</button></div>
    `).join('') || '<div class="empty-note">No follow-up entries yet.</div>';
    document.querySelectorAll('[data-fu-remove]').forEach((btn)=>{ btn.onclick=()=>{ followUps=followUps.filter((x)=>x.id!==btn.getAttribute('data-fu-remove')); refreshFollowUps(); }; });
  }
  refreshFollowUps();
  document.getElementById('addFollowUpBtn').onclick = () => {
    const mode = document.getElementById('newFollowUpMode').value;
    const remarks = document.getElementById('newFollowUpRemarks').value;
    const nextFollowUpDate = document.getElementById('newFollowUpNextDate').value;
    followUps.push({ id:uid(), date:todayYMD(), time:new Date().toTimeString().slice(0,5), mode, remarks, nextFollowUpDate });
    document.getElementById('newFollowUpRemarks').value=''; document.getElementById('newFollowUpNextDate').value='';
    refreshFollowUps();
  };

  document.getElementById('cancelAssignmentBtn').onclick = closeModal;
  document.getElementById('saveAssignmentBtn').onclick = () => {
    const vals = readFieldsFromForm(ASSIGNMENT_FIELDS, document.getElementById('assignmentForm'));
    vals.assignedToPersonId = document.getElementById('f_assignedToPersonId').value;
    vals.progressPct = Number(document.getElementById('f_progressPct').value);
    vals.reminderIntervalDays = Number(vals.reminderIntervalDays);
    if(!vals.title || !vals.title.trim()){ alert('Assignment Title is required.'); return; }
    if(!vals.assignedToPersonId){ alert('Please select who this is assigned to.'); return; }
    if(!vals.expectedCompletionDate){ alert('Expected Completion Date is required.'); return; }
    const now = new Date().toISOString();
    const record = Object.assign({}, values, vals, {
      id: existing?existing.id:nextId('ASSIGN','assignment'),
      followUps, attachmentIds: workingAttachmentIds,
      timeline: values.timeline||[],
      createdAt: existing?existing.createdAt:now, updatedAt: now,
    });
    if(!existing){
      addTimelineEvent(record, 'Assignment Created', 'Assigned to '+personName(record.assignedToPersonId));
    } else if(existing.status !== record.status){
      addTimelineEvent(record, 'Status Changed', existing.status+' → '+record.status);
    }
    if(existing && Number(existing.progressPct||0) !== record.progressPct){
      addTimelineEvent(record, 'Progress Updated', record.progressPct+'%');
    }
    saveRecord('assignments', record);
    closeModal(); render();
  };
}

Object.assign(ACTION_HANDLERS, {
  'new-assignment': () => openAssignmentForm(null),
  'edit-assignment': (id) => openAssignmentForm(id),
  'delete-assignment': (id) => { if(confirm('Delete this assignment permanently? This also removes its full timeline and follow-up history.')){ deleteRecord('assignments', id); render(); } },
  'duplicate-assignment': (id) => {
    const a = assignmentById(id);
    if(!a) return;
    const now = new Date().toISOString();
    const copy = Object.assign({}, a, { id: nextId('ASSIGN','assignment'), title: a.title+' (Copy)', status:'Assigned', progressPct:0, timeline:[], followUps:[], createdAt:now, updatedAt:now });
    addTimelineEvent(copy, 'Assignment Created', 'Duplicated from '+a.id);
    saveRecord('assignments', copy);
    render();
  },
  'verify-assignment': (id) => openVerificationModal(id, 'approve'),
  'reject-assignment': (id) => openVerificationModal(id, 'reject'),
  'revise-assignment': (id) => openVerificationModal(id, 'revise'),
  'set-assignment-filter': (id, el) => { state.assignmentFilter[el.getAttribute('data-key')] = el.value; render(); },
});

/* ---------------------------------------------------------------------- */
/* VERIFICATION — marking Completed never auto-closes an assignment; only */
/* an explicit Approve here sets it to Verified.                          */
/* ---------------------------------------------------------------------- */

const VERIFICATION_META = {
  approve: { title:'✅ Approve & Verify', newStatus:'Verified', eventType:'Verified', btnLabel:'Approve' },
  reject: { title:'❌ Reject Assignment', newStatus:'Rejected', eventType:'Rejected', btnLabel:'Reject' },
  revise: { title:'🔁 Request Revision', newStatus:'In Progress', eventType:'Revision Requested', btnLabel:'Request Revision' },
};

/* ---------------------------------------------------------------------- */
/* WHATSAPP REMINDER                                                       */
/* ---------------------------------------------------------------------- */

function normalizeIndianMobile(raw){
  const digits = String(raw||'').replace(/\D/g,'');
  if(!digits) return { ok:false, reason:'No mobile number on file for this person.' };
  if(digits.length===10) return { ok:true, number:'91'+digits };
  if(digits.length===12 && digits.startsWith('91')) return { ok:true, number:digits };
  if(digits.length===13 && digits.startsWith('091')) return { ok:true, number:digits.slice(1) };
  return { ok:true, number:digits };
}
function buildWhatsAppLink(number, message){
  return 'https://wa.me/'+number+'?text='+encodeURIComponent(message);
}
function assignmentReminderMessage(a, person){
  return `Dear ${person.name},\n\nThis is a reminder regarding the assignment:\n\n${a.title}\n\nDeadline:\n\n${formatDateLong(a.expectedCompletionDate)}\n\nKindly update the present status.\n\nRegards,\n${a.assignedBy||'Dr. M. Jahangir'}`;
}
function openAssignmentWhatsAppReminder(id){
  const a = assignmentById(id);
  if(!a) return;
  const person = personById(a.assignedToPersonId);
  if(!person){ alert('No person is assigned to this assignment.'); return; }
  const normalized = normalizeIndianMobile(person.whatsapp || person.mobile);
  if(!normalized.ok){ alert(normalized.reason); return; }
  const initialMessage = assignmentReminderMessage(a, person);
  openModal('💬 WhatsApp Reminder — '+escapeHtml(person.name), `
    <div class="form-field full"><label>Message (editable)</label><textarea id="whatsappText" style="height:180px;">${escapeHtml(initialMessage)}</textarea></div>
  `, `<button class="btn grey" id="cancelWhatsAppBtn">Cancel</button><button class="btn" id="sendWhatsAppBtn">📲 Open WhatsApp</button>`);
  document.getElementById('cancelWhatsAppBtn').onclick = closeModal;
  document.getElementById('sendWhatsAppBtn').onclick = () => {
    const msg = document.getElementById('whatsappText').value;
    window.open(buildWhatsAppLink(normalized.number, msg), '_blank');
    addTimelineEvent(a, 'Reminder Sent', 'WhatsApp reminder sent to '+person.name);
    saveRecord('assignments', a);
    closeModal(); render();
  };
}
Object.assign(ACTION_HANDLERS, {
  'whatsapp-assignment': (id) => openAssignmentWhatsAppReminder(id),
});

// Reminder window: true once "today" falls within the assignment's
// configured reminderIntervalDays of its deadline (and it isn't already
// overdue or closed — those are surfaced separately).
function assignmentReminderDue(a){
  if(isAssignmentOverdue(a) || ['Completed','Verified','Rejected','Cancelled'].includes(a.status)) return false;
  const days = daysBetween(a.expectedCompletionDate, todayYMD());
  const interval = Number(a.reminderIntervalDays);
  if(isNaN(interval) || interval<0) return false;
  return days>=0 && days<=interval;
}

function openVerificationModal(id, action){
  const a = assignmentById(id);
  if(!a) return;
  const meta = VERIFICATION_META[action];
  openModal(meta.title, `
    <p>Assignment: <strong>${escapeHtml(a.title)}</strong> (${escapeHtml(a.id)})</p>
    <div class="form-field full"><label>Remarks (optional)</label><textarea id="verificationRemarks"></textarea></div>
  `, `<button class="btn grey" id="verifyCancelBtn">Cancel</button><button class="btn" id="verifyConfirmBtn">${meta.btnLabel}</button>`);
  document.getElementById('verifyCancelBtn').onclick = closeModal;
  document.getElementById('verifyConfirmBtn').onclick = () => {
    const remarks = document.getElementById('verificationRemarks').value;
    a.status = meta.newStatus;
    a.updatedAt = new Date().toISOString();
    addTimelineEvent(a, meta.eventType, remarks);
    saveRecord('assignments', a);
    closeModal(); render();
  };
}

/* Placeholder stubs — filled in during the Dashboard/Overdue/Reports build
   steps so the module stays runnable throughout development. */
// Returns the date an assignment was actually completed (prefers the
// Verified event, falls back to Completed), or null if neither happened
// yet — used for average-completion-time and on-time/late analysis.
function assignmentCompletionDate(a){
  const timeline = a.timeline||[];
  const verified = timeline.find((e)=>e.type==='Verified');
  if(verified) return verified.date;
  // A "Status Changed" event's remarks are recorded as "OldStatus → NewStatus"
  // (see addTimelineEvent calls in openAssignmentForm) — find the one that
  // transitioned into Completed.
  const completedEvt = timeline.find((e)=>e.type==='Status Changed' && /→ Completed$/.test(e.remarks||''));
  return completedEvt ? completedEvt.date : null;
}
function assignmentWasLate(a){
  const d = assignmentCompletionDate(a);
  return d && a.expectedCompletionDate && d > a.expectedCompletionDate;
}

/* ---------------------------------------------------------------------- */
/* PERFORMANCE ANALYSIS — per-person, computed live from db.assignments   */
/* ---------------------------------------------------------------------- */

function personPerformanceStats(personId){
  const given = db.assignments.filter((a)=>a.assignedToPersonId===personId);
  const completed = given.filter((a)=>['Completed','Verified'].includes(a.status));
  const onTime = completed.filter((a)=>!assignmentWasLate(a));
  const late = completed.filter(assignmentWasLate);
  const delays = late.map((a)=>daysBetween(assignmentCompletionDate(a), a.expectedCompletionDate)).filter((n)=>n>0);
  const avgDelay = delays.length ? Math.round(delays.reduce((s,n)=>s+n,0)/delays.length*10)/10 : 0;
  const durations = completed.map((a)=>{ const d=assignmentCompletionDate(a); return d?daysBetween(d,a.dateAssigned):null; }).filter((n)=>n!==null && n>=0);
  const avgCompletionTime = durations.length ? Math.round(durations.reduce((s,n)=>s+n,0)/durations.length*10)/10 : null;
  const completionPct = given.length ? Math.round((completed.length/given.length)*100) : 0;
  const onTimePct = completed.length ? Math.round((onTime.length/completed.length)*100) : 0;
  const pending = given.filter((a)=>!['Completed','Verified','Cancelled','Rejected'].includes(a.status));
  const overdue = given.filter(isAssignmentOverdue);
  // Heuristic only — a simple, transparent blend of completion rate and
  // on-time rate, not an official HR/appraisal metric.
  const ratingScore = Math.round(completionPct*0.6 + onTimePct*0.4);
  const rating = ratingScore>=85 ? 'Excellent' : ratingScore>=70 ? 'Good' : ratingScore>=50 ? 'Average' : given.length ? 'Needs Improvement' : 'No Data';
  return {
    given: given.length, completed: completed.length, completedOnTime: onTime.length, completedLate: late.length,
    avgDelay, avgCompletionTime, completionPct, pending: pending.length, overdue: overdue.length,
    ratingScore, rating,
  };
}

function renderAssignmentDashboard(){
  const today = todayYMD();
  const all = db.assignments;
  const pending = all.filter((a)=>['Assigned','Accepted','Waiting','Need Clarification'].includes(a.status));
  const inProgress = all.filter((a)=>a.status==='In Progress');
  const completed = all.filter((a)=>['Completed','Verified'].includes(a.status));
  const overdue = all.filter(isAssignmentOverdue);
  const cancelled = all.filter((a)=>['Cancelled','Rejected'].includes(a.status));
  const dueToday = all.filter((a)=>a.expectedCompletionDate===today && !['Completed','Verified','Cancelled','Rejected'].includes(a.status));
  const dueTomorrow = all.filter((a)=>a.expectedCompletionDate===ymd(addDays(new Date(),1)) && !['Completed','Verified','Cancelled','Rejected'].includes(a.status));
  const dueThisWeek = all.filter((a)=>{ const d=daysBetween(a.expectedCompletionDate,today); return d>=0 && d<=7 && !['Completed','Verified','Cancelled','Rejected'].includes(a.status); });
  const delayed = completed.filter(assignmentWasLate);
  const completionPct = all.length ? Math.round((completed.length/all.length)*100) : 0;
  const completionDurations = completed.map((a)=>{ const d=assignmentCompletionDate(a); return d ? daysBetween(d, a.dateAssigned) : null; }).filter((n)=>n!==null && n>=0);
  const avgCompletionDays = completionDurations.length ? Math.round(completionDurations.reduce((s,n)=>s+n,0)/completionDurations.length*10)/10 : null;
  const recentlyCompleted = completed.slice().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).slice(0,5);
  const awaitingReview = all.filter((a)=>a.status==='Completed');

  const cards = [
    { num: all.length, lbl:'Total Assignments', icon:'📋' },
    { num: pending.length, lbl:'Pending', icon:'⏳' },
    { num: inProgress.length, lbl:'In Progress', icon:'🔧' },
    { num: completed.length, lbl:'Completed', icon:'✅' },
    { num: overdue.length, lbl:'Overdue', icon:'⚠️' },
    { num: cancelled.length, lbl:'Cancelled', icon:'🚫' },
    { num: dueToday.length, lbl:'Due Today', icon:'📅' },
    { num: dueTomorrow.length, lbl:'Due Tomorrow', icon:'📆' },
    { num: dueThisWeek.length, lbl:'Due This Week', icon:'🗓️' },
    { num: avgCompletionDays===null?'—':avgCompletionDays+' d', lbl:'Avg Completion Time', icon:'⏱️' },
    { num: completionPct+'%', lbl:'Completion %', icon:'📈' },
    { num: delayed.length, lbl:'Delayed Tasks', icon:'🐢' },
  ];
  const cardsHtml = cards.map((c)=>`<div class="card clickable" data-action="goto-assignment-list"><div class="icon">${c.icon}</div><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('');

  const recentHtml = recentlyCompleted.length
    ? recentlyCompleted.map((a)=>`<div class="item-row row-green"><div><span class="title">${escapeHtml(a.title)}</span><div class="meta">${escapeHtml(personName(a.assignedToPersonId))}</div></div>${assignmentStatusBadge(a)}</div>`).join('')
    : '<div class="empty-note">Nothing completed yet.</div>';
  const reviewHtml = awaitingReview.length
    ? awaitingReview.map((a)=>`<div class="item-row row-orange"><div><span class="title">${escapeHtml(a.title)}</span><div class="meta">${escapeHtml(personName(a.assignedToPersonId))}</div></div><div class="actions-cell"><button class="btn sm" data-action="verify-assignment" data-id="${a.id}">✅ Approve</button></div></div>`).join('')
    : '<div class="empty-note">Nothing awaiting review.</div>';

  return `
    <div class="cards-grid">${cardsHtml}</div>
    <div class="section-title">👀 Awaiting My Review</div>
    ${reviewHtml}
    <div class="section-title">🎉 Recently Completed</div>
    ${recentHtml}
  `;
}
Object.assign(ACTION_HANDLERS, {
  'goto-assignment-list': () => { state.assignmentView='list'; render(); },
});

function renderOverdueMonitor(){
  const overdue = db.assignments.filter(isAssignmentOverdue);
  const sortFns = {
    daysOverdue: (a,b)=>daysBetween(todayYMD(),a.expectedCompletionDate)-daysBetween(todayYMD(),b.expectedCompletionDate),
    priority: (a,b)=>ASSIGNMENT_PRIORITIES.findIndex((p)=>p.id===a.priority)-ASSIGNMENT_PRIORITIES.findIndex((p)=>p.id===b.priority),
    person: (a,b)=>personName(a.assignedToPersonId).localeCompare(personName(b.assignedToPersonId)),
    category: (a,b)=>(a.category||'').localeCompare(b.category||''),
  };
  const sorted = overdue.slice().sort(sortFns[state.overdueSort]||sortFns.daysOverdue);
  const rows = sorted.map((a)=>{
    const days = daysBetween(todayYMD(), a.expectedCompletionDate);
    return `<div class="item-row row-red">
      <div><span class="title">${escapeHtml(a.id)} — ${escapeHtml(a.title)}</span><div class="meta">${escapeHtml(personName(a.assignedToPersonId))} · ${escapeHtml(a.category||'—')} · Was due ${formatDate(a.expectedCompletionDate)}</div></div>
      <div class="actions-cell"><span class="badge badge-red">${days} day${days===1?'':'s'} overdue</span>${assignmentPriorityBadge(a.priority)}
      <button class="btn sm secondary" data-action="edit-assignment" data-id="${a.id}">Open</button>
      <button class="btn sm secondary" data-action="whatsapp-assignment" data-id="${a.id}">📲 Remind</button></div>
    </div>`;
  }).join('');
  return `
    <div class="toolbar">
      <label>Sort by:
        <select data-action="set-overdue-sort">
          <option value="daysOverdue" ${state.overdueSort==='daysOverdue'?'selected':''}>Days Overdue</option>
          <option value="priority" ${state.overdueSort==='priority'?'selected':''}>Priority</option>
          <option value="person" ${state.overdueSort==='person'?'selected':''}>Person</option>
          <option value="category" ${state.overdueSort==='category'?'selected':''}>Category</option>
        </select>
      </label>
    </div>
    <div class="item-list">${rows || '<div class="empty-note">Nothing overdue. 🎉</div>'}</div>
  `;
}
Object.assign(ACTION_HANDLERS, {
  'set-overdue-sort': (id, el) => { state.overdueSort = el.value; render(); },
});

/* ---------------------------------------------------------------------- */
/* ASSIGNMENT REPORTS                                                      */
/* ---------------------------------------------------------------------- */

const ASSIGNMENT_REPORT_TABS = [
  { id:'summary', label:'Summary' },
  { id:'pending', label:'Pending' },
  { id:'completedRpt', label:'Completed' },
  { id:'overdueRpt', label:'Overdue' },
  { id:'personWise', label:'Person-wise' },
  { id:'categoryWise', label:'Category-wise' },
  { id:'departmentWise', label:'Department-wise' },
  { id:'monthly', label:'Monthly' },
  { id:'yearly', label:'Yearly' },
  { id:'performance', label:'Performance' },
];
if(!state.assignmentReportView) state.assignmentReportView = 'summary';

function assignmentReportTable(columns, rows, emptyMsg){
  const head = columns.map((c)=>`<th>${escapeHtml(c.label)}</th>`).join('');
  const body = rows.map((r)=>`<tr>${columns.map((c)=>`<td>${escapeHtml(typeof c.value==='function'?c.value(r):r[c.value])}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="empty-note">${emptyMsg}</td></tr>`}</tbody></table></div>`;
}

function renderAssignmentReports(){
  const tabsHtml = ASSIGNMENT_REPORT_TABS.map((t)=>`<button class="btn sm ${state.assignmentReportView===t.id?'':'secondary'}" data-action="set-assignment-report-view" data-view="${t.id}">${t.label}</button>`).join('');
  let body;
  switch(state.assignmentReportView){
    case 'pending': body = renderAssignmentReportPending(); break;
    case 'completedRpt': body = renderAssignmentReportCompleted(); break;
    case 'overdueRpt': body = renderAssignmentReportOverdue(); break;
    case 'personWise': body = renderAssignmentReportPersonWise(); break;
    case 'categoryWise': body = renderAssignmentReportCategoryWise(); break;
    case 'departmentWise': body = renderAssignmentReportDepartmentWise(); break;
    case 'monthly': body = renderAssignmentReportMonthly(); break;
    case 'yearly': body = renderAssignmentReportYearly(); break;
    case 'performance': body = renderAssignmentReportPerformance(); break;
    default: body = renderAssignmentReportSummary();
  }
  return `<div class="toolbar no-print">${tabsHtml}<div class="spacer"></div><button class="btn sm" data-action="print-report">🖨️ Print / PDF</button></div>${body}`;
}
Object.assign(ACTION_HANDLERS, {
  'set-assignment-report-view': (id, el) => { state.assignmentReportView = el.getAttribute('data-view'); render(); },
});

function renderAssignmentReportSummary(){
  const all = db.assignments;
  const byStatus = {};
  ASSIGNMENT_STATUSES.forEach((s)=>{ byStatus[s.id] = all.filter((a)=>a.status===s.id).length; });
  const donutColors = ['#0b3d66','#1565c0','#2e7d32','#fb8c00','#e53935','#6a1b9a','#9aa7b3','#f9a825','#5b6b7b'];
  const segments = Object.keys(byStatus).filter((k)=>byStatus[k]>0).map((k,i)=>({ label:k, value:byStatus[k], color:donutColors[i%donutColors.length] }));
  return `
    <div class="cards-grid">
      <div class="card"><div class="icon">📋</div><div class="num">${all.length}</div><div class="lbl">Total Assignments</div></div>
      <div class="card"><div class="icon">👥</div><div class="num">${db.people.length}</div><div class="lbl">People in Directory</div></div>
    </div>
    <div class="chart-block"><h4>Status Breakdown</h4>${svgDonutChart(segments)}</div>
  `;
}
function renderAssignmentReportPending(){
  const rows = db.assignments.filter((a)=>!['Completed','Verified','Cancelled','Rejected'].includes(a.status));
  return `<div class="toolbar no-print"><div class="spacer"></div><button class="btn sm secondary" data-action="csv-assignments" data-set="pending">⬇️ CSV</button></div>` +
    assignmentReportTable([
      {label:'ID', value:'id'}, {label:'Title', value:'title'}, {label:'Assigned To', value:(r)=>personName(r.assignedToPersonId)},
      {label:'Status', value:'status'}, {label:'Due', value:(r)=>formatDate(r.expectedCompletionDate)},
    ], rows, 'No pending assignments.');
}
function renderAssignmentReportCompleted(){
  const rows = db.assignments.filter((a)=>['Completed','Verified'].includes(a.status));
  return `<div class="toolbar no-print"><div class="spacer"></div><button class="btn sm secondary" data-action="csv-assignments" data-set="completed">⬇️ CSV</button></div>` +
    assignmentReportTable([
      {label:'ID', value:'id'}, {label:'Title', value:'title'}, {label:'Assigned To', value:(r)=>personName(r.assignedToPersonId)},
      {label:'Status', value:'status'}, {label:'Completed', value:(r)=>formatDate(assignmentCompletionDate(r))}, {label:'On Time?', value:(r)=>assignmentWasLate(r)?'Late':'On Time'},
    ], rows, 'Nothing completed yet.');
}
function renderAssignmentReportOverdue(){
  const rows = db.assignments.filter(isAssignmentOverdue);
  return `<div class="toolbar no-print"><div class="spacer"></div><button class="btn sm secondary" data-action="csv-assignments" data-set="overdue">⬇️ CSV</button></div>` +
    assignmentReportTable([
      {label:'ID', value:'id'}, {label:'Title', value:'title'}, {label:'Assigned To', value:(r)=>personName(r.assignedToPersonId)},
      {label:'Days Overdue', value:(r)=>daysBetween(todayYMD(), r.expectedCompletionDate)}, {label:'Priority', value:(r)=>assignmentPriorityMeta(r.priority).label},
    ], rows, 'Nothing overdue.');
}
function renderAssignmentReportPersonWise(){
  const rows = db.people.map((p)=>Object.assign({ name:p.name }, personPerformanceStats(p.id)));
  return `<div class="toolbar no-print"><div class="spacer"></div><button class="btn sm secondary" data-action="csv-assignments" data-set="personWise">⬇️ CSV</button></div>` +
    assignmentReportTable([
      {label:'Person', value:'name'}, {label:'Given', value:'given'}, {label:'Completed', value:'completed'},
      {label:'Pending', value:'pending'}, {label:'Overdue', value:'overdue'}, {label:'Completion %', value:(r)=>r.completionPct+'%'},
    ], rows, 'No people in the directory yet.');
}
function renderAssignmentReportCategoryWise(){
  const counts = {};
  db.assignments.forEach((a)=>{ const c=a.category||'Uncategorised'; counts[c]=(counts[c]||0)+1; });
  const items = Object.keys(counts).map((c)=>({ label:c, a:counts[c] }));
  return `<div class="chart-block"><h4>Assignments by Category</h4>${svgGroupedHBarChart(items, ['Count'], [REPORT_CHART_COLORS.accent])}</div>`;
}
function renderAssignmentReportDepartmentWise(){
  const counts = {};
  db.assignments.forEach((a)=>{ const d=a.department||'(none)'; counts[d]=(counts[d]||0)+1; });
  const items = Object.keys(counts).map((d)=>({ label:d, a:counts[d] }));
  return `<div class="chart-block"><h4>Assignments by Department</h4>${svgGroupedHBarChart(items, ['Count'], [REPORT_CHART_COLORS.purple])}</div>`;
}
function renderAssignmentReportMonthly(){
  const points = Array.from({length:12}, (_,i)=>{
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-(11-i));
    const key = d.getFullYear()+'-'+pad2(d.getMonth()+1);
    const count = db.assignments.filter((a)=>(a.dateAssigned||'').startsWith(key)).length;
    return { label: MONTH_NAMES[d.getMonth()].slice(0,3), value: count };
  });
  return `<div class="chart-block"><h4>Assignments Created — Last 12 Months</h4>${svgLineChart(points, {color:REPORT_CHART_COLORS.accent})}</div>`;
}
function renderAssignmentReportYearly(){
  const years = {};
  db.assignments.forEach((a)=>{ const y=(a.dateAssigned||'').slice(0,4); if(y) years[y]=(years[y]||0)+1; });
  const items = Object.keys(years).sort().map((y)=>({ label:y, a:years[y] }));
  return `<div class="chart-block"><h4>Assignments by Year</h4>${svgGroupedHBarChart(items, ['Count'], [REPORT_CHART_COLORS.blue])}</div>`;
}
function renderAssignmentReportPerformance(){
  const rows = db.people.map((p)=>Object.assign({ name:p.name }, personPerformanceStats(p.id)));
  return `<div class="toolbar no-print"><div class="spacer"></div><button class="btn sm secondary" data-action="csv-assignments" data-set="performance">⬇️ CSV</button></div>` +
    assignmentReportTable([
      {label:'Person', value:'name'}, {label:'Given', value:'given'}, {label:'On Time', value:'completedOnTime'},
      {label:'Late', value:'completedLate'}, {label:'Avg Delay (d)', value:'avgDelay'}, {label:'Avg Completion (d)', value:(r)=>r.avgCompletionTime===null?'—':r.avgCompletionTime},
      {label:'Completion %', value:(r)=>r.completionPct+'%'}, {label:'Rating', value:'rating'},
    ], rows, 'No people in the directory yet.');
}

Object.assign(ACTION_HANDLERS, {
  'csv-assignments': (id, el) => {
    const set = el.getAttribute('data-set');
    if(set==='pending'){
      exportCSV('assignments-pending-'+nowTimestampShort()+'.csv',
        [{label:'ID',value:'id'},{label:'Title',value:'title'},{label:'Assigned To',value:(r)=>personName(r.assignedToPersonId)},{label:'Status',value:'status'},{label:'Due',value:'expectedCompletionDate'}],
        db.assignments.filter((a)=>!['Completed','Verified','Cancelled','Rejected'].includes(a.status)));
    } else if(set==='completed'){
      exportCSV('assignments-completed-'+nowTimestampShort()+'.csv',
        [{label:'ID',value:'id'},{label:'Title',value:'title'},{label:'Assigned To',value:(r)=>personName(r.assignedToPersonId)},{label:'Completed',value:(r)=>assignmentCompletionDate(r)},{label:'On Time',value:(r)=>assignmentWasLate(r)?'Late':'On Time'}],
        db.assignments.filter((a)=>['Completed','Verified'].includes(a.status)));
    } else if(set==='overdue'){
      exportCSV('assignments-overdue-'+nowTimestampShort()+'.csv',
        [{label:'ID',value:'id'},{label:'Title',value:'title'},{label:'Assigned To',value:(r)=>personName(r.assignedToPersonId)},{label:'Days Overdue',value:(r)=>daysBetween(todayYMD(),r.expectedCompletionDate)}],
        db.assignments.filter(isAssignmentOverdue));
    } else if(set==='personWise' || set==='performance'){
      exportCSV('people-'+set+'-'+nowTimestampShort()+'.csv',
        [{label:'Person',value:'name'},{label:'Given',value:'given'},{label:'Completed',value:'completed'},{label:'On Time',value:'completedOnTime'},{label:'Late',value:'completedLate'},{label:'Completion %',value:(r)=>r.completionPct+'%'},{label:'Rating',value:'rating'}],
        db.people.map((p)=>Object.assign({name:p.name}, personPerformanceStats(p.id))));
    }
  },
});

/* ---------------------------------------------------------------------- */
/* AI COMMAND CENTRE — design-only placeholder, no logic (per spec)       */
/* ---------------------------------------------------------------------- */

function renderAiCentre(){
  return `
    <div class="form-section">
      <h3>🤖 AI Command Centre</h3>
      <p>In a future version, you'll be able to type natural commands here and Personal Planner will act on them across every JM Digital Office module — for example:</p>
      <ul>
        <li>"Remind me to reply to Directorate tomorrow."</li>
        <li>"Schedule Clinic every Friday."</li>
        <li>"Prepare November Trek."</li>
      </ul>
      <p class="hint">This section is a design placeholder only. No AI processing runs in this version.</p>
      <button class="btn grey" disabled title="Coming soon">Configure (Coming Soon)</button>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* HEADER / INSTALL BANNER / SERVICE WORKER                               */
/* ---------------------------------------------------------------------- */

function renderHeader(){
  const nameEl = document.getElementById('headerOwnerName');
  if(nameEl) nameEl.textContent = db.settings.ownerName || 'Personal Planner';
  const f = document.getElementById('plannerFooter');
  if(f) f.textContent = 'Personal Planner · Data stored privately on this device';
}

let deferredInstallPrompt = null;
function renderInstallBanner(){
  const root = document.getElementById('pwaBannerRoot');
  if(!root || db.settings.installBannerDismissed) return;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredInstallPrompt = e;
    root.innerHTML = `<div class="pwa-install-banner"><span>Install Personal Planner for offline use.</span>
      <button id="installBtn">Install</button><button class="dismiss" id="dismissBtn">✕</button></div>`;
    document.getElementById('installBtn').onclick = async ()=>{
      root.innerHTML='';
      if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; }
    };
    document.getElementById('dismissBtn').onclick = ()=>{ root.innerHTML=''; db.settings.installBannerDismissed=true; saveSettings(); };
  });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent||'');
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if(isIOS && !isStandalone){
    root.innerHTML = `<div class="pwa-install-banner"><span>Tap Share, then "Add to Home Screen" to install.</span>
      <button class="dismiss" id="dismissBtn2">✕</button></div>`;
    const d = document.getElementById('dismissBtn2');
    if(d) d.onclick = ()=>{ root.innerHTML=''; db.settings.installBannerDismissed=true; saveSettings(); };
  }
}

function registerServiceWorker(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('../service-worker.js').then((reg)=>{
      if(typeof window.attachSWUpdateWatcher==='function') window.attachSWUpdateWatcher(reg);
    }).catch(()=>{});
  }
}

/* ---------------------------------------------------------------------- */
/* FUTURE INTEGRATION — architecture placeholder only, not wired up       */
/* ---------------------------------------------------------------------- */

window.JMPlanner = window.JMPlanner || {};
window.JMPlanner.ingest = function(sourceModule, payload){
  // PLACEHOLDER — not wired to any UI or store yet.
  // Intended future contract: other JM Digital Office modules (WBCYN,
  // Clinic, Rental, Trust) will call this to push events into Planner
  // (e.g. a Clinic appointment becoming a Planner task). The receiving
  // end will write {sourceModule, payload, receivedAt} into the
  // 'crossModuleEvents' IndexedDB store for later processing. No module
  // currently calls this, and nothing currently reads that store.
  console.warn('JMPlanner.ingest called but not implemented yet', sourceModule, payload);
};

/* ---------------------------------------------------------------------- */
/* INIT                                                                    */
/* ---------------------------------------------------------------------- */

/* ---------------------------------------------------------------------- */
/* FAB — quick-create menu                                                */
/* ---------------------------------------------------------------------- */

const FAB_ACTIONS = [
  { label:'New Assignment', icon:'📋', run:()=>openAssignmentForm(null) },
  { label:'New Task', icon:'✅', run:()=>openTaskForm(null,'task') },
  { label:'New Event', icon:'📅', run:()=>openTaskForm(null,'event') },
  { label:'New Reminder', icon:'🔔', run:()=>openReminderForm(null,'generic') },
  { label:'New Goal', icon:'🎯', run:()=>openGoalForm(null) },
  { label:'New Habit', icon:'🔥', run:()=>openHabitForm(null) },
  { label:'New Note', icon:'📝', run:()=>openNoteForm(null,'quick') },
  { label:'New Journal Entry', icon:'📔', run:()=>openNoteForm(null,'journal') },
];

function closeFabMenu(){ const m = document.getElementById('fabMenuRoot'); if(m) m.remove(); }

function toggleFabMenu(){
  if(document.getElementById('fabMenuRoot')){ closeFabMenu(); return; }
  const menu = document.createElement('div');
  menu.className = 'fab-menu';
  menu.id = 'fabMenuRoot';
  menu.innerHTML = FAB_ACTIONS.map((a,i)=>`<button type="button" data-fab-action="${i}">${a.icon} ${escapeHtml(a.label)}</button>`).join('');
  document.body.appendChild(menu);
  menu.querySelectorAll('[data-fab-action]').forEach((btn)=>{
    btn.onclick = () => { const a = FAB_ACTIONS[Number(btn.getAttribute('data-fab-action'))]; closeFabMenu(); a.run(); };
  });
  setTimeout(()=>{
    document.addEventListener('click', function outside(e){
      if(!menu.contains(e.target) && e.target.id!=='fabBtn'){ closeFabMenu(); document.removeEventListener('click', outside); }
    });
  }, 0);
}

function showLockScreen(onUnlock){
  const overlay = document.createElement('div');
  overlay.id = 'lockScreen';
  overlay.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,var(--dark-blue),var(--dark-blue-2));z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:320px;width:90%;text-align:center;">
      <div style="font-size:36px;">🔒</div>
      <h2 style="color:var(--dark-blue);margin:10px 0;">Enter PIN</h2>
      <input type="password" inputmode="numeric" id="lockPinInput" maxlength="6" style="width:100%;padding:10px;text-align:center;font-size:20px;letter-spacing:6px;border:1px solid var(--border);border-radius:8px;">
      <div id="lockError" style="color:var(--red);font-size:12.5px;margin-top:8px;height:16px;"></div>
      <button class="btn" id="lockUnlockBtn" style="width:100%;margin-top:10px;">Unlock</button>
    </div>`;
  document.body.appendChild(overlay);
  const input = document.getElementById('lockPinInput');
  input.focus();
  async function tryUnlock(){
    const hash = await sha256Hex(db.settings.pinSalt + input.value);
    if(hash === db.settings.pinHash){ overlay.remove(); onUnlock(); }
    else { document.getElementById('lockError').textContent = 'Incorrect PIN.'; input.value=''; input.focus(); }
  }
  document.getElementById('lockUnlockBtn').onclick = tryUnlock;
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryUnlock(); });
}

async function init(){
  await loadDB();
  applyTheme();
  applyFontSize();
  renderHeader();

  function startApp(){
    render();
    const bell = document.getElementById('notifBellBtn');
    if(bell) bell.addEventListener('click', ()=>openNotificationCentre());
    const search = document.getElementById('searchBtn');
    if(search) search.addEventListener('click', ()=>openUniversalSearch());
    const fab = document.getElementById('fabBtn');
    if(fab) fab.addEventListener('click', (e)=>{ e.stopPropagation(); toggleFabMenu(); });
    try{ renderInstallBanner(); }catch(e){ console.warn('install banner failed', e); }
    try{ registerServiceWorker(); }catch(e){ console.warn('service worker registration failed', e); }
  }

  if(db.settings.pinHash) showLockScreen(startApp);
  else startApp();
}

/* ---------------------------------------------------------------------- */
/* NOTIFICATION CENTRE                                                     */
/* ---------------------------------------------------------------------- */

function collectAlerts(){
  const today = todayYMD();
  const tasks = tasksOfKind('task');
  const events = tasksOfKind('event');
  const overdueTasks = tasks.filter(isOverdue);
  const todaysEvents = events.filter((t)=>t.date===today);
  const upcomingBirthdays = db.reminders.filter((r)=>r.kind==='birthday').filter((r)=>{
    const d = daysBetween(nextOccurrence(r.date), today);
    return d>=0 && d<=7;
  });
  const goalAlerts = db.goals.filter((g)=>g.targetDate && !['completed','archived','cancelled'].includes(g.status) && daysBetween(g.targetDate, today)>=0 && daysBetween(g.targetDate, today)<=7);
  const habitAlerts = db.habits.filter((h)=>h.active!==false && !(habitLogFor(h.id, today) && habitLogFor(h.id, today).done));
  const pinnedNotes = db.notes.filter((n)=>n.pinned);
  const overdueAssignments = db.assignments.filter(isAssignmentOverdue);
  const assignmentsAwaitingReview = db.assignments.filter((a)=>a.status==='Completed');
  const assignmentsDueSoon = db.assignments.filter(assignmentReminderDue);
  return { overdueTasks, todaysEvents, upcomingBirthdays, goalAlerts, habitAlerts, pinnedNotes, overdueAssignments, assignmentsAwaitingReview, assignmentsDueSoon };
}

function updateNotifBadge(){
  const a = collectAlerts();
  const count = a.overdueTasks.length + a.todaysEvents.length + a.upcomingBirthdays.length + a.goalAlerts.length
    + a.overdueAssignments.length + a.assignmentsAwaitingReview.length + a.assignmentsDueSoon.length;
  const badge = document.getElementById('notifBadge');
  if(!badge) return;
  if(count>0){ badge.textContent = count>99?'99+':String(count); badge.style.display='inline-block'; }
  else badge.style.display = 'none';
}

function openNotificationCentre(){
  const a = collectAlerts();
  function section(title, items, render){
    return `<div class="section-title" style="margin-top:14px;">${title}</div>${items.length ? items.map(render).join('') : '<div class="empty-note">Nothing here.</div>'}`;
  }
  const body = `
    ${section('⚠️ Overdue Tasks', a.overdueTasks, (t)=>`<div class="item-row row-red"><div><span class="title">${escapeHtml(t.title)}</span><div class="meta">Was due ${formatDate(t.date)}</div></div></div>`)}
    ${section('📋 Overdue Assignments', a.overdueAssignments, (as)=>`<div class="item-row row-red"><div><span class="title">${escapeHtml(as.title)}</span><div class="meta">${escapeHtml(personName(as.assignedToPersonId))} · Was due ${formatDate(as.expectedCompletionDate)}</div></div></div>`)}
    ${section('👀 Assignments Awaiting Your Review', a.assignmentsAwaitingReview, (as)=>`<div class="item-row row-orange"><div><span class="title">${escapeHtml(as.title)}</span><div class="meta">${escapeHtml(personName(as.assignedToPersonId))}</div></div><div class="actions-cell"><button class="btn sm" data-action="verify-assignment" data-id="${as.id}">✅ Approve</button></div></div>`)}
    ${section('🔔 Assignments Due Soon', a.assignmentsDueSoon, (as)=>`<div class="item-row row-blue"><div><span class="title">${escapeHtml(as.title)}</span><div class="meta">${escapeHtml(personName(as.assignedToPersonId))} · Due ${formatDate(as.expectedCompletionDate)}</div></div></div>`)}
    ${section("📅 Today's Events", a.todaysEvents, (t)=>`<div class="item-row row-blue"><div><span class="title">${escapeHtml(t.title)}</span><div class="meta">${t.time?formatTime(t.time):'All day'}</div></div></div>`)}
    ${section('🎂 Birthdays This Week', a.upcomingBirthdays, (r)=>`<div class="item-row row-purple"><div><span class="title">${escapeHtml(r.title)}</span></div></div>`)}
    ${section('🎯 Goal Alerts', a.goalAlerts, (g)=>`<div class="item-row row-orange"><div><span class="title">${escapeHtml(g.title)}</span><div class="meta">Target: ${formatDate(g.targetDate)}</div></div></div>`)}
    ${section('🔥 Habit Alerts (not done today)', a.habitAlerts, (h)=>`<div class="item-row row-yellow"><div><span class="title">${escapeHtml(h.icon||'')} ${escapeHtml(h.name)}</span></div></div>`)}
    ${section('📌 Pinned Notes', a.pinnedNotes, (n)=>`<div class="item-row row-grey"><div><span class="title">${escapeHtml(n.title||'(untitled)')}</span></div></div>`)}
  `;
  openModal('🔔 Notifications', body, `<button class="btn grey" onclick="closeModal()">Close</button>`);
  wireDelegatedActions();
}

/* ---------------------------------------------------------------------- */
/* UNIVERSAL SEARCH                                                        */
/* ---------------------------------------------------------------------- */

function openUniversalSearch(){
  openModal('🔍 Search', `
    <input type="text" id="universalSearchInput" placeholder="Search tasks, goals, notes, habits, events, reminders…" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;">
    <div id="universalSearchResults" style="margin-top:14px;"></div>
  `, `<button class="btn grey" onclick="closeModal()">Close</button>`);
  const input = document.getElementById('universalSearchInput');
  input.focus();
  input.oninput = () => runUniversalSearch(input.value);
}

function runUniversalSearch(q){
  const results = document.getElementById('universalSearchResults');
  if(!q || q.trim().length<2){ results.innerHTML = '<div class="hint">Type at least 2 characters…</div>'; return; }
  const needle = q.toLowerCase();
  const matches = (text) => (text||'').toLowerCase().includes(needle);

  const groups = [
    { label:'Tasks & Events', items: db.tasks.filter((t)=>matches(t.title)||matches(t.description)).map((t)=>({ title:t.title, sub:formatDate(t.date), view:t.kind==='event'?'calendar':'tasks' })) },
    { label:'Goals', items: db.goals.filter((g)=>matches(g.title)).map((g)=>({ title:g.title, sub:g.term+' term', view:'goals' })) },
    { label:'Notes & Journal', items: db.notes.filter((n)=>matches(n.title)||matches(stripHtml(n.body))).map((n)=>({ title:n.title||'(untitled)', sub:n.noteType, view:n.noteType==='journal'?'journal':'notes' })) },
    { label:'Habits', items: db.habits.filter((h)=>matches(h.name)).map((h)=>({ title:h.name, sub:h.category||'', view:'habits' })) },
    { label:'Reminders', items: db.reminders.filter((r)=>matches(r.title)).map((r)=>({ title:r.title, sub:formatDate(r.date), view: r.kind==='finance'?'financeReminders':r.kind==='birthday'?'birthdays':'reminders' })) },
    { label:'Contacts', items: db.contacts.filter((c)=>matches(c.name)).map((c)=>({ title:c.name, sub:c.category||'', view:'contacts' })) },
    { label:'Assignments', items: db.assignments.filter((a)=>matches(a.id)||matches(a.title)||matches(a.referenceNumber)||matches(a.department)||matches(a.category)||matches(a.status)||matches(personName(a.assignedToPersonId))).map((a)=>({ title:a.id+' — '+a.title, sub:a.status+' · '+personName(a.assignedToPersonId), view:'assignments', subview:'list' })) },
    { label:'People', items: db.people.filter((p)=>matches(p.name)||matches(p.mobile)||matches(p.department)).map((p)=>({ title:p.name, sub:p.designation||'', view:'assignments', subview:'people' })) },
  ].filter((g)=>g.items.length);

  if(!groups.length){ results.innerHTML = '<div class="empty-note">No matches.</div>'; return; }
  results.innerHTML = groups.map((g)=>`
    <div class="section-title" style="margin-top:10px;">${g.label}</div>
    <div class="item-list">${g.items.slice(0,8).map((it)=>`<div class="item-row row-blue" data-action="search-goto" data-view="${it.view}" ${it.subview?`data-subview="${it.subview}"`:''} style="cursor:pointer;"><div><span class="title">${escapeHtml(it.title)}</span><div class="meta">${escapeHtml(it.sub)}</div></div></div>`).join('')}</div>
  `).join('');
  wireDelegatedActions();
}

Object.assign(ACTION_HANDLERS, {
  'search-goto': (id, el) => {
    closeModal();
    const subview = el.getAttribute('data-subview');
    if(subview) state.assignmentView = subview;
    goto(el.getAttribute('data-view'));
  },
});

document.addEventListener('DOMContentLoaded', init);
