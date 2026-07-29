'use strict';

/* ============================================================================
   WBCYN e-Office & Administrative Control System — v1.6.0
   ----------------------------------------------------------------------------
   Upgrade of the original WBCYN Registrar Dashboard (localStorage-based,
   9 simple registers) into a full e-Office system on a dedicated IndexedDB
   database (see idb.js — 'jm_wbcyn_db'), while leaving every byte of the
   original module's code path and data intact and reachable under
   "Legacy Records (Pre-v1.6.0)" (see LEGACY_* functions near the bottom of
   this file, ported verbatim from the pre-v1.6.0 app.js). No existing data
   or module is deleted, per the explicit safety requirements this build was
   commissioned under.
============================================================================ */

/* ================= OFFICE / GLOBAL CONFIG ================= */
const WBCYN_VERSION = '1.6.2';
const DEFAULT_OFFICE_INFO = {
  registrarName: 'Dr. M. Jahangir',
  officeName: 'West Bengal Council of Yoga and Naturopathy',
  officeAddress: 'Purta Bhawan, Room No. 107, Block-DF, Sector-I, Bidhannagar, Kolkata – 700091',
};

const AUTHORITY_CATEGORIES = [
  'Swasthya Bhawan', 'Department of Health & Family Welfare', 'AYUSH Branch',
  'Directorate of AYUSH', 'Additional Secretary, AYUSH', 'Principal Secretary',
  'Special Secretary', 'Finance Department', 'Legal Department', 'Other',
];
const SWASTHYA_BHAWAN_AUTHORITIES = new Set([
  'Swasthya Bhawan', 'Department of Health & Family Welfare', 'AYUSH Branch',
  'Directorate of AYUSH', 'Additional Secretary, AYUSH', 'Principal Secretary', 'Special Secretary',
]);

const PRIORITIES = ['Critical', 'Urgent', 'High', 'Normal', 'Low'];
const COMMUNICATION_TYPES = ['Letter', 'Email', 'File', 'Petition', 'Application', 'Government Communication', 'Notice', 'Other'];
const MODES_OF_RECEIPT = ['Post', 'Speed Post', 'Email', 'e-Office', 'Hand Delivery', 'Courier', 'WhatsApp', 'Fax', 'Other'];
const OUTWARD_TYPES = ['Official Letter', 'Memorandum', 'Forwarding Letter', 'Reminder', 'Notice', 'Office Order', 'Compliance Report', 'Proposal', 'Clarification', 'Reply', 'Meeting Resolution', 'Legal Communication', 'RTI Communication', 'Email Communication', 'e-Office Communication'];
const DELIVERY_MODES = ['Post', 'Speed Post', 'Courier', 'Email', 'e-Office', 'Hand Delivery', 'Messenger', 'Fax', 'Other'];
const RECIPIENT_CATEGORIES = ['Higher Authority', 'Institution', 'Staff', 'Public', 'Court', 'Other Government Office', 'Other'];
const FILE_PURPOSES = ['Administrative Approval', 'Financial Sanction', 'Finance Concurrence', 'Policy Decision', 'Legal Opinion', 'Clarification', 'Permission', 'Ratification', 'Examination Approval', 'Registration Matter', 'Affiliation Matter', 'Appointment or Establishment Matter', 'Compliance Submission', 'Information Submitted', 'Other'];
const REPLY_TYPES = ['Approval', 'Sanction', 'Clarification', 'Query', 'Objection', 'Rejection', 'Return for Compliance', 'Direction', 'Advice', 'Legal Opinion', 'Finance Concurrence', 'Request for Documents', 'Acknowledgement', 'Interim Reply', 'Final Decision', 'Other'];
const FOLLOWUP_MODES = ['Phone', 'WhatsApp', 'Email', 'Verbal', 'Office Meeting', 'Written Reminder', 'Official Letter', 'File Note', 'Personal Visit', 'Other'];
const REMINDER_DRAFT_TYPES = ['First Reminder', 'Second Reminder', 'Urgent Reminder', 'Final Reminder', 'Request for Status Update', 'Request for Early Decision', 'Pending Approval Reminder', 'Pending Sanction Reminder', 'Pending Clarification Reminder', 'Pending Finance Concurrence Reminder', 'Pending Legal Opinion Reminder'];
const ASSIGNMENT_CATEGORIES_WBCYN = ['Government Correspondence', 'File Processing', 'Letter Drafting', 'Examination', 'Registration', 'Affiliation', 'Accounts', 'Audit', 'Legal', 'RTI', 'Website', 'Meeting', 'Data Collection', 'Report Preparation', 'Institution Follow-up', 'Document Verification', 'Purchase', 'Establishment', 'Complaint', 'Court Matter', 'Departmental Compliance', 'Miscellaneous', 'Custom Category'];
const FILE_MOVEMENT_STATUSES = ['With Registrar', 'With Staff', 'With Accounts', 'With Legal Section', 'With Institution', 'With Swasthya Bhawan', 'With Higher Authority', 'Returned to WBCYN', 'Awaiting Receipt', 'Closed'];
const LEGAL_STATUSES = ['New', 'Under Review', 'Affidavit Required', 'Documents Required', 'Hearing Scheduled', 'Order Awaited', 'Order Received', 'Compliance Pending', 'Compliance Completed', 'Disposed', 'Closed'];
const LEGAL_CASE_TYPES = ['Writ Petition', 'Service Matter', 'Civil Suit', 'Criminal', 'Appeal', 'Contempt', 'Consumer', 'Tribunal', 'Other'];
const MEETING_TYPES = ['Governing Council', 'Executive Committee', 'Departmental', 'Staff Meeting', 'Review Meeting', 'Other'];

const INWARD_STATUSES = ['Received', 'Under Review', 'Marked to Staff', 'Action in Progress', 'Reply Under Preparation', 'Awaiting Information', 'Submitted to Registrar', 'Reply Issued', 'Filed', 'Closed', 'No Action Required', 'Overdue'];
const OUTWARD_STATUSES = ['Draft', 'Under Review', 'Approved', 'Signed', 'Ready for Dispatch', 'Dispatched', 'In Transit', 'Delivered', 'Acknowledged', 'Awaiting Reply', 'Follow-up Due', 'Reminder Sent', 'Reply Received', 'Action Required', 'Further Communication Required', 'Closed', 'Returned', 'Cancelled', 'Reply Overdue'];
const FILE_STATUSES = ['Draft', 'Under Preparation', 'Ready for Submission', 'Submitted', 'Received by Authority', 'Under Consideration', 'Awaiting Decision', 'Awaiting Reply', 'Clarification Sought', 'Further Documents Required', 'Compliance Under Preparation', 'Compliance Submitted', 'Reminder Due', 'Reminder Sent', 'Approved', 'Sanctioned', 'Rejected', 'Returned', 'Partly Approved', 'Decision Received', 'Action Pending at WBCYN', 'Closed', 'Overdue'];
const ASSIGNMENT_STATUSES_WBCYN = ['Draft', 'Assigned', 'Acknowledged', 'In Progress', 'Awaiting Information', 'On Hold', 'Submitted for Verification', 'Revision Required', 'Completed', 'Verified', 'Reassigned', 'Cancelled', 'Overdue', 'Closed'];
const REPLY_STATUSES = ['Received', 'Under Review', 'Action Assigned', 'Action in Progress', 'Action Completed', 'Closed'];
const RTI_STATUSES = ['Pending', 'Reply Under Preparation', 'Replied', 'Appeal Filed', 'Appeal Disposed', 'Rejected', 'Transferred', 'Disposed'];
const MEETING_STATUSES = ['Scheduled', 'Held', 'Postponed', 'Cancelled', 'Action Pending', 'Closed'];
const RESOLUTION_STATUSES = ['Open', 'Assigned', 'In Progress', 'Completed', 'Closed'];

/* ================= UTIL ================= */
function genUUID(){
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function todayISO(){ return new Date().toISOString().slice(0, 10); }
function nowTimeHM(){ return new Date().toTimeString().slice(0, 5); }
function addDaysISO(n){ const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function daysUntil(dateStr){
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}
function daysBetweenISO(a, b){
  if (!a || !b) return null;
  return Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
}
// Indian date format DD-MM-YYYY
function fmtDate(dateStr){
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.length > 10 ? dateStr : dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
  } catch (e) { return dateStr; }
}
// 12-hour time, e.g. "02:30 PM"
function fmtTime(t){
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h % 12) || 12);
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}
function fmtDateTime(dateStr, timeStr){ return [fmtDate(dateStr), fmtTime(timeStr)].filter(Boolean).join(' '); }
function escapeHtml(str){
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function csvEscape(v){
  const s = (v === undefined || v === null) ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function downloadBlob(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
function exportCSV(filename, headers, rows){
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((r) => lines.push(r.map(csvEscape).join(',')));
  downloadBlob(filename, lines.join('\n'), 'text/csv');
}
function normalizeIndianMobile(raw){
  if (!raw) return { ok: false, reason: 'No mobile number on record.' };
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, reason: 'Mobile number is not a valid 10-digit Indian number.' };
  return { ok: true, number: '91' + digits };
}
function buildWhatsAppLink(number, text){ return `https://wa.me/${number}?text=${encodeURIComponent(text)}`; }

// Generic status → badge colour classifier. New v1.6.0 status vocabularies
// run to 100+ distinct strings across 9 entity types (see spec); rather than
// hand-assigning a colour to every single one (high maintenance, easy to
// drift out of sync when a status list changes), badge colour is derived
// from common terminology so it stays correct automatically.
function statusBadgeClass(status){
  const s = (status || '').toLowerCase();
  if (/overdue|rejected|cancelled|returned/.test(s)) return 'red';
  if (/urgent|critical|reminder|revision|awaiting|due|pending|escalat/.test(s)) return 'orange';
  if (/draft|not started|new|under review|under preparation|under consideration/.test(s)) return 'grey';
  if (/progress|marked|assigned|scheduled|transit|acknowledged|submitted/.test(s)) return 'blue';
  if (/completed|closed|verified|approved|sanctioned|disposed|filed|delivered|received|held|replied/.test(s)) return 'green';
  return 'grey';
}
function statusBadge(status){ return `<span class="badge badge-${statusBadgeClass(status)}">${escapeHtml(status || '—')}</span>`; }
function priorityBadgeClass(p){
  const s = (p || '').toLowerCase();
  if (s === 'critical') return 'red';
  if (s === 'urgent' || s === 'high') return 'orange';
  if (s === 'normal' || s === 'medium') return 'yellow';
  return 'grey';
}
function priorityBadge(p){ return p ? `<span class="badge badge-${priorityBadgeClass(p)}">${escapeHtml(p)}</span>` : ''; }
function dueBadge(dateStr, closedStatuses){
  const d = daysUntil(dateStr);
  if (d === null) return '';
  if (d < 0) return '<span class="badge badge-red">Overdue by ' + Math.abs(d) + ' day' + (Math.abs(d) === 1 ? '' : 's') + '</span>';
  if (d === 0) return '<span class="badge badge-orange">Due Today</span>';
  if (d <= 3) return '<span class="badge badge-yellow">Due in ' + d + ' day' + (d === 1 ? '' : 's') + '</span>';
  if (d <= 7) return '<span class="badge badge-yellow">Due This Week</span>';
  return '';
}

/* ================= STORAGE (IndexedDB-backed, in-memory mirror) ================= */
// Same synchronous-mirror pattern as planner/idb.js + planner/app.js: every
// store is loaded once at boot into `wdb` (WBCYN db), all rendering reads
// wdb synchronously, writes go through wSaveRecord/wDeleteRecord which
// update wdb immediately (instant re-render) and persist to IndexedDB in
// the background.
const WBCYN_MIRRORED_STORES = ['wbcynStaff', 'wbcynInward', 'wbcynOutward', 'wbcynAssignments', 'wbcynAssignmentTimeline', 'wbcynHigherAuthorityFiles', 'wbcynFileMovements', 'wbcynReplies', 'wbcynFollowUps', 'wbcynDeadlineExtensions', 'wbcynCorrespondenceLinks', 'wbcynLegalMatters', 'wbcynRTI', 'wbcynMeetings', 'wbcynResolutions'];
let wdb = null; // in-memory mirror: { wbcynStaff: [...], ... , settings: {...} }

function freshWbcynSettings(){
  return {
    key: 'settings',
    ...DEFAULT_OFFICE_INFO,
    nextIds: {},
    reminderIntervalDaysDefault: 3,
    migrationNoteShown: false,
  };
}
function ensureWbcynSettingsShape(loaded){
  const fresh = freshWbcynSettings();
  const s = loaded ? Object.assign({}, fresh, loaded) : fresh;
  if (!s.nextIds) s.nextIds = {};
  return s;
}
async function loadWbcynDB(){
  wdb = {};
  const results = await Promise.all(WBCYN_MIRRORED_STORES.map((s) => WBCYN_IDB.getAll(s)));
  WBCYN_MIRRORED_STORES.forEach((s, i) => { wdb[s] = results[i]; });
  const settingsRows = await WBCYN_IDB.getAll('wbcynSettings');
  wdb.settings = ensureWbcynSettingsShape(settingsRows.find((r) => r.key === 'settings'));
}
function wSaveSettings(){ WBCYN_IDB.put('wbcynSettings', wdb.settings).catch((e) => console.error('WBCYN settings put failed', e)); }
// Human-readable tracking numbers (WBCYN-IN-2026-0001 etc). These are a
// SEPARATE field from the UUID primary key `id` — never used as a store key
// — and the per-type counter resets every calendar year, matching the
// spec's numbering examples.
function nextTrackingId(prefix){
  const year = new Date().getFullYear();
  const counterKey = prefix + '_' + year;
  const n = wdb.settings.nextIds[counterKey] || 1;
  wdb.settings.nextIds[counterKey] = n + 1;
  wSaveSettings();
  return `WBCYN-${prefix}-${year}-${String(n).padStart(4, '0')}`;
}
function wSaveRecord(store, record){
  const arr = wdb[store];
  const idx = arr.findIndex((r) => r.id === record.id);
  if (idx >= 0) arr[idx] = record; else arr.push(record);
  WBCYN_IDB.put(store, record).catch((e) => console.error('WBCYN IDB put failed', store, e));
  return record;
}
// Soft-delete: linked records (staff with assignment history, any record
// referenced by another via a tracking/link ID) are never hard-deleted —
// they are marked archived/inactive and excluded from active lists, but
// stay in the store and remain resolvable by anything that links to them.
function wSoftDelete(store, id, activeFlagField){
  const rec = wdb[store].find((r) => r.id === id);
  if (!rec) return;
  rec[activeFlagField || 'archived'] = true;
  rec.archivedAt = new Date().toISOString();
  wSaveRecord(store, rec);
}
function wHardDelete(store, id){
  wdb[store] = wdb[store].filter((r) => r.id !== id);
  WBCYN_IDB.delete(store, id).catch((e) => console.error('WBCYN IDB delete failed', store, e));
}

/* ================= STATE ================= */
let wstate = {
  section: 'dashboard',
  sub: null,
  search: '',
  filters: {},
  legacyView: 'home',
  legacyRegister: 'correspondence',
  legacyFilters: {},
};

/* ================= NAV ================= */
const WBCYN_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'inward', label: 'Inward', icon: '📥' },
  { id: 'outward', label: 'Outward', icon: '📤' },
  { id: 'files', label: 'Higher Authority', icon: '🗂️' },
  { id: 'swasthya', label: 'Swasthya Bhawan', icon: '🏛️' },
  { id: 'assignments', label: 'Assignments', icon: '📝' },
  { id: 'staff', label: 'Staff', icon: '👥' },
  { id: 'movements', label: 'File Movement', icon: '🚚' },
  { id: 'replies', label: 'Replies', icon: '↩️' },
  { id: 'followups', label: 'Follow-up', icon: '⏰' },
  { id: 'pending', label: 'Pending Action', icon: '⚠️' },
  { id: 'legal', label: 'Legal & Court', icon: '⚖️' },
  { id: 'rti', label: 'RTI', icon: '📄' },
  { id: 'meetings', label: 'Meetings', icon: '🗓️' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'legacy', label: 'Legacy (Pre-1.6)', icon: '🗄️' },
];
function renderNav(){
  const html = WBCYN_NAV_ITEMS.map((it) => `<button data-nav="${it.id}" class="${wstate.section === it.id ? 'active' : ''}"><span class="ic">${it.icon}</span><span>${it.label}</span></button>`).join('');
  document.getElementById('topnav').innerHTML = html;
  document.getElementById('bottomnav').innerHTML = html;
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    wstate.section = b.dataset.nav; wstate.search = ''; wstate.filters = {}; wstate.sub = null;
    renderNav(); renderWbcyn();
    window.scrollTo(0, 0);
  }));
}

/* ================= RENDER DISPATCH ================= */
function renderWbcyn(){
  const app = document.getElementById('app');
  const map = {
    dashboard: renderRegistrarDashboard,
    inward: renderInwardSection,
    outward: renderOutwardSection,
    files: renderHigherAuthoritySection,
    swasthya: renderSwasthyaBhawanSection,
    assignments: renderAssignmentsSection,
    staff: renderStaffSection,
    movements: renderFileMovementSection,
    replies: renderRepliesSection,
    followups: renderFollowUpSection,
    pending: renderPendingActionSection,
    legal: renderLegalSection,
    rti: renderRTISection,
    meetings: renderMeetingsSection,
    reports: renderWbcynReports,
    settings: renderWbcynSettings,
    legacy: LEGACY_render,
  };
  const fn = map[wstate.section] || renderRegistrarDashboard;
  app.innerHTML = fn();
  wireWbcynGlobalHandlers();
}
function goSection(section, filters){
  wstate.section = section;
  wstate.filters = filters || {};
  wstate.sub = null;
  renderNav(); renderWbcyn();
  window.scrollTo(0, 0);
}
function wireWbcynGlobalHandlers(){
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
    let f = {};
    try { f = b.dataset.filters ? JSON.parse(b.dataset.filters) : {}; } catch (e) { f = {}; }
    goSection(b.dataset.goto, f);
  }));
  if (wstate.section === 'legacy') { LEGACY_attachCommonHandlers(); if (wstate.legacyView === 'matters') LEGACY_attachRegisterHandlers('matters'); if (wstate.legacyView === 'registers') LEGACY_attachRegisterHandlers(wstate.legacyRegister); if (wstate.legacyView === 'reports') LEGACY_drawReportCharts(); if (wstate.legacyView === 'settings') LEGACY_attachSettingsHandlers(); return; }
  wireSectionHandlers(wstate.section);
}

/* ================= GENERIC MODAL ================= */
function openModal(title, bodyHTML, footHTML){
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h2>${title}</h2>
        <div id="modalBody">${bodyHTML}</div>
        <div class="modal-actions">${footHTML || ''}</div>
      </div>
    </div>`;
  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML = ''; }

/* ================= GENERIC CONFIG-DRIVEN FORM ENGINE ================= */
// Every v1.6.0 register (Inward, Outward, Higher Authority Files, Legal,
// RTI, Meetings, Resolutions, Replies, File Movements, Follow-ups, Staff)
// is driven by one of these module configs, rendered through the shared
// card-list / form / detail engine below. This keeps ~250 individually
// spec'd fields manageable as data instead of near-duplicate render code
// per entity, and gives every register the same mobile-friendly card +
// collapsible-detail treatment instead of a wide table.
const WBCYN_MODULES = {};

function resolvedOptions(f){ return typeof f.options === 'function' ? f.options() : f.options; }
function fieldInputHTML(f, value){
  const req = f.required ? 'required' : '';
  if (f.type === 'select') {
    const opts = resolvedOptions(f) || [];
    const optHtml = opts.map((o) => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      return `<option value="${escapeHtml(v)}" ${String(v) === String(value) ? 'selected' : ''}>${escapeHtml(l)}</option>`;
    }).join('');
    return `<select name="${f.key}" ${req}><option value="">Select...</option>${optHtml}</select>`;
  }
  if (f.type === 'multiselect') {
    const opts = resolvedOptions(f) || [];
    const selected = Array.isArray(value) ? value : (value ? String(value).split('|') : []);
    return `<div class="chip-select" data-multiselect="${f.key}">${opts.map((o) => `<label class="chip-opt"><input type="checkbox" value="${escapeHtml(o)}" ${selected.includes(o) ? 'checked' : ''}> ${escapeHtml(o)}</label>`).join('')}</div>`;
  }
  if (f.type === 'textarea') return `<textarea name="${f.key}" ${req}>${escapeHtml(value)}</textarea>`;
  return `<input type="${f.type}" name="${f.key}" value="${escapeHtml(value)}" ${req}${f.step ? ` step="${f.step}"` : ''}>`;
}
function fieldsToHTML(sections, values){
  return sections.map((sec) => {
    const fieldsHtml = sec.fields.map((f) => {
      const full = (f.type === 'textarea' || f.type === 'multiselect' || f.full) ? 'full' : '';
      return `<div class="form-field ${full}"><label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>${fieldInputHTML(f, values ? values[f.key] : '')}</div>`;
    }).join('');
    return `<div class="form-section"><div class="form-section-title">${escapeHtml(sec.title)}</div><div class="form-grid">${fieldsHtml}</div></div>`;
  }).join('');
}
function allFields(cfg){ return cfg.sections.reduce((acc, s) => acc.concat(s.fields), []); }
// Shared value-for-display logic for a single field on a single record —
// used by CSV export, the Reports table, and anywhere else a plain string
// (not the richer detail-view HTML) is needed. Staff-reference fields are
// resolved through getStaffDisplayName so raw UUIDs never reach a CSV,
// printed report, or table cell.
function csvFieldValue(f, r){
  const val = r[f.key];
  if (f.staffRef) return getStaffDisplayName(val);
  return Array.isArray(val) ? val.join('; ') : val;
}
function readFieldsFromForm(cfg, root){
  const data = {};
  allFields(cfg).forEach((f) => {
    if (f.type === 'multiselect') {
      const boxes = root.querySelectorAll(`[data-multiselect="${f.key}"] input:checked`);
      data[f.key] = Array.from(boxes).map((b) => b.value);
    } else {
      const el = root.querySelector(`[name="${f.key}"]`);
      data[f.key] = el ? el.value : '';
    }
  });
  return data;
}

function moduleRecords(cfg){ return wdb[cfg.store].filter((r) => !r.archived); }
function moduleById(cfg, id){ return wdb[cfg.store].find((r) => r.id === id); }
function moduleMatchesFilters(cfg, rec){
  const s = (wstate.filters.search || wstate.search || '').toLowerCase();
  if (s) {
    const hay = (cfg.searchFields || []).map((k) => rec[k]).concat([rec.trackingId]).join(' ').toLowerCase();
    if (!hay.includes(s)) return false;
  }
  // Dashboard cards for date-range groups (Due Today / This Week / Overdue)
  // use this special key against the module's own dueField, since those
  // aren't a literal stored field value.
  if (wstate.filters.__due && cfg.dueField) {
    const d = daysUntil(rec[cfg.dueField]);
    if (d === null) return false;
    const w = wstate.filters.__due;
    if (w === 'today' && d !== 0) return false;
    if (w === 'tomorrow' && d !== 1) return false;
    if (w === 'week' && !(d >= 0 && d <= 7)) return false;
    if (w === 'overdue' && !(d < 0)) return false;
  }
  for (const k in wstate.filters) {
    if (k === 'search' || k === '__due') continue;
    const v = wstate.filters[k];
    if (v && v !== 'All' && rec[k] !== v) return false;
  }
  return true;
}
function openModuleForm(cfg, id, presets){
  const existing = id ? moduleById(cfg, id) : null;
  const singular = cfg.singularLabel || cfg.label;
  const title = existing ? `Edit ${singular}` : `New ${singular}`;
  const fieldsHtml = fieldsToHTML(cfg.sections, existing || presets || {});
  openModal(title, `<form id="moduleForm">${fieldsHtml}</form>`,
    `<button type="button" class="btn grey" id="modFormCancel">Cancel</button><button type="button" class="btn" id="modFormSave">Save</button>`);
  document.getElementById('modFormCancel').onclick = closeModal;
  document.getElementById('modFormSave').onclick = () => {
    const form = document.getElementById('moduleForm');
    const required = allFields(cfg).filter((f) => f.required);
    for (const f of required) {
      const el = form.querySelector(`[name="${f.key}"]`);
      if (el && !el.value) { alert(`"${f.label}" is required.`); el.focus(); return; }
    }
    const data = readFieldsFromForm(cfg, form);
    const now = new Date().toISOString();
    const rec = existing ? Object.assign({}, existing, data) : Object.assign({ id: genUUID(), trackingId: nextTrackingId(cfg.prefix), createdAt: now }, data);
    rec.updatedAt = now;
    if (cfg.beforeSave) cfg.beforeSave(rec, existing);
    wSaveRecord(cfg.store, rec);
    closeModal();
    if (cfg.afterSave) cfg.afterSave(rec, existing);
    renderWbcyn();
  };
}
function openModuleDetail(cfg, id){
  const rec = moduleById(cfg, id);
  if (!rec) return;
  const rows = cfg.sections.map((sec) => {
    const fieldsHtml = sec.fields.map((f) => {
      let val = rec[f.key];
      if (f.staffRef) val = getStaffDisplayName(val, { withDesignation: true });
      else if (f.type === 'date') val = fmtDate(val);
      else if (f.type === 'time') val = fmtTime(val);
      else if (Array.isArray(val)) val = val.join(', ');
      const full = (f.type === 'textarea' || f.full) ? 'full' : '';
      return `<div class="${full}"><div class="dl">${escapeHtml(f.label)}</div><div class="dv">${escapeHtml(val) || '—'}</div></div>`;
    }).join('');
    return `<div class="form-section"><div class="form-section-title">${escapeHtml(sec.title)}</div><div class="detail-grid">${fieldsHtml}</div></div>`;
  }).join('');
  const extra = cfg.extraDetailHTML ? cfg.extraDetailHTML(rec) : '';
  openModal(`${escapeHtml(cfg.label)} — ${escapeHtml(rec.trackingId || '')}`, rows + extra,
    `<button class="btn grey" id="modDetailClose">Close</button><button class="btn secondary" id="modDetailEdit">Edit</button><button class="btn danger" id="modDetailDelete">Archive</button>`);
  document.getElementById('modDetailClose').onclick = closeModal;
  document.getElementById('modDetailEdit').onclick = () => { closeModal(); openModuleForm(cfg, id); };
  document.getElementById('modDetailDelete').onclick = () => { closeModal(); moduleArchive(cfg, id); };
  if (cfg.wireDetailHandlers) cfg.wireDetailHandlers(rec);
}
function moduleArchive(cfg, id){
  if (!confirm('Archive this record? It will be hidden from active lists but not permanently deleted, and anything linked to it will still resolve correctly.')) return;
  wSoftDelete(cfg.store, id, 'archived');
  renderWbcyn();
}
function renderModuleCardList(cfg){
  let records = moduleRecords(cfg).filter((r) => moduleMatchesFilters(cfg, r));
  if (cfg.sortFn) records = records.sort(cfg.sortFn); else records = records.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const filterSelects = (cfg.filterableKeys || []).map((key) => {
    const f = allFields(cfg).find((x) => x.key === key);
    const opts = f ? (resolvedOptions(f) || []) : [];
    const optHtml = ['All'].concat(opts).map((o) => `<option value="${escapeHtml(o)}" ${wstate.filters[key] === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
    return `<select data-modfilter="${key}">${optHtml}</select>`;
  }).join('');
  const cardsHtml = records.map((rec) => renderRecordCard(cfg, rec)).join('') || `<div class="empty-note">No records found. ${cfg.emptyHint || ''}</div>`;
  return `
    <div class="section-title no-print">${cfg.icon} ${cfg.label}</div>
    <div class="toolbar no-print">
      <button class="btn" data-modadd="1">+ New ${cfg.singularLabel || cfg.label}</button>
      <input type="text" data-modsearch="1" placeholder="Search..." value="${escapeHtml(wstate.filters.search || '')}">
      ${filterSelects}
      <span class="spacer"></span>
      <button class="btn secondary" data-modexport="1">Export CSV</button>
      <button class="btn secondary" data-modprint="1">Print</button>
    </div>
    <div class="record-card-grid">${cardsHtml}</div>
  `;
}
function renderRecordCard(cfg, rec){
  const meta = cfg.cardMeta ? cfg.cardMeta(rec) : [];
  const badges = [];
  if (rec[cfg.statusField]) badges.push(statusBadge(rec[cfg.statusField]));
  if (cfg.priorityField && rec[cfg.priorityField]) badges.push(priorityBadge(rec[cfg.priorityField]));
  if (cfg.dueField) { const db = dueBadge(rec[cfg.dueField]); if (db && !(cfg.closedStatuses || []).includes(rec[cfg.statusField])) badges.push(db); }
  const title = rec[cfg.titleField] || cfg.label;
  return `
    <div class="record-card">
      <div class="rc-head">
        <div>
          <div class="rc-track">${escapeHtml(rec.trackingId || '')}</div>
          <div class="rc-title">${escapeHtml(title)}</div>
        </div>
        <div class="rc-badges">${badges.join(' ')}</div>
      </div>
      <div class="rc-meta">${meta.filter(Boolean).map((m) => `<span>${escapeHtml(m)}</span>`).join('<span class="rc-dot">·</span>')}</div>
      <details class="rc-details"><summary>Details</summary>
        <div class="rc-details-body">${(cfg.cardDetailsHTML ? cfg.cardDetailsHTML(rec) : '') }</div>
      </details>
      <div class="rc-actions no-print">
        <button class="btn sm secondary" data-modview="${rec.id}">View</button>
        <button class="btn sm grey" data-modedit="${rec.id}">Edit</button>
        ${cfg.extraActions ? cfg.extraActions(rec) : ''}
        <button class="btn sm danger" data-modarchive="${rec.id}">Archive</button>
      </div>
    </div>`;
}
function wireModuleHandlers(cfg){
  const search = document.querySelector('[data-modsearch]');
  if (search) search.addEventListener('input', (e) => { wstate.filters.search = e.target.value; renderWbcyn(); });
  document.querySelectorAll('[data-modfilter]').forEach((sel) => sel.addEventListener('change', (e) => {
    wstate.filters[e.target.dataset.modfilter] = e.target.value === 'All' ? '' : e.target.value;
    renderWbcyn();
  }));
  const addBtn = document.querySelector('[data-modadd]');
  if (addBtn) addBtn.addEventListener('click', () => openModuleForm(cfg));
  document.querySelectorAll('[data-modview]').forEach((b) => b.addEventListener('click', () => openModuleDetail(cfg, b.dataset.modview)));
  document.querySelectorAll('[data-modedit]').forEach((b) => b.addEventListener('click', () => openModuleForm(cfg, b.dataset.modedit)));
  document.querySelectorAll('[data-modarchive]').forEach((b) => b.addEventListener('click', () => moduleArchive(cfg, b.dataset.modarchive)));
  const exportBtn = document.querySelector('[data-modexport]');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    const flds = allFields(cfg);
    exportCSV(`WBCYN_${cfg.store}_${todayISO()}.csv`, ['Tracking ID'].concat(flds.map((f) => f.label)), moduleRecords(cfg).map((r) => [r.trackingId].concat(flds.map((f) => csvFieldValue(f, r)))));
  });
  const printBtn = document.querySelector('[data-modprint]');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
  if (cfg.wireExtraHandlers) cfg.wireExtraHandlers();
}
function wireSectionHandlers(section){
  const cfg = WBCYN_MODULES[section];
  if (cfg) { wireModuleHandlers(cfg); return; }
  const custom = SECTION_HANDLERS[section];
  if (custom) custom();
}
const SECTION_HANDLERS = {};

/* ================= STAFF DIRECTORY ================= */
function activeStaff(){ return wdb.wbcynStaff.filter((s) => s.status !== 'Inactive'); }
function staffById(id){ return wdb.wbcynStaff.find((s) => s.id === id); }
// Canonical staff-UUID resolver — every user-facing surface that shows a
// staff reference (assignedToStaffId, markedToStaffId, responsibleStaffId,
// actionAssignedToStaffId, staffAssignedId, pioStaffId, ...) must go through
// this instead of interpolating the raw id, or through getStaffListDisplay
// for a field holding more than one id. Handles the two cases a raw id
// would otherwise leak in: the staff member was later marked Inactive
// (historical records must keep showing their name), or the id no longer
// matches any record at all (never surface the UUID itself).
function getStaffDisplayName(staffId, opts){
  opts = opts || {};
  if (!staffId) return opts.emptyText !== undefined ? opts.emptyText : '';
  const s = staffById(staffId);
  if (!s) return 'Unknown Staff';
  const inactiveSuffix = s.status === 'Inactive' ? ' (Inactive)' : '';
  if (opts.withDesignation && s.designation) return `${s.name}${inactiveSuffix} — ${s.designation}`;
  return `${s.name}${inactiveSuffix}`;
}
function getStaffListDisplay(staffIds, opts){
  if (!staffIds) return '';
  const ids = Array.isArray(staffIds) ? staffIds : [staffIds];
  return ids.filter(Boolean).map((id) => getStaffDisplayName(id, opts)).join(', ');
}
function staffName(id){ return id ? getStaffDisplayName(id) : '(unassigned)'; }
function staffOptions(){ return activeStaff().map((s) => ({ value: s.id, label: s.name + (s.designation ? ' — ' + s.designation : '') })); }

WBCYN_MODULES.staff = {
  store: 'wbcynStaff', prefix: 'STAFF', label: 'Staff Directory', singularLabel: 'Staff Member', icon: '👥',
  titleField: 'name', statusField: 'status', filterableKeys: ['status', 'department'],
  searchFields: ['name', 'designation', 'department', 'mobile', 'email'],
  sections: [
    { title: 'Staff Details', fields: [
      { key: 'name', label: 'Full Name', type: 'text', required: true },
      { key: 'designation', label: 'Designation', type: 'text' },
      { key: 'department', label: 'Section / Department', type: 'text' },
      { key: 'employeeId', label: 'Employee ID', type: 'text' },
      { key: 'mobile', label: 'Mobile Number', type: 'text' },
      { key: 'whatsapp', label: 'WhatsApp Number', type: 'text' },
      { key: 'email', label: 'Email Address', type: 'email' },
      { key: 'officeLocation', label: 'Office Location', type: 'text' },
      { key: 'reportingOfficer', label: 'Reporting Officer', type: 'text' },
      { key: 'dateOfJoining', label: 'Date of Joining', type: 'date' },
      { key: 'status', label: 'Active or Inactive', type: 'select', options: ['Active', 'Inactive'], required: true },
      { key: 'responsibilities', label: 'Responsibilities', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
  cardMeta: (rec) => [rec.designation, rec.department, rec.mobile],
  cardDetailsHTML: (rec) => {
    const stats = computeStaffStats(rec.id);
    return `<p>${escapeHtml(rec.responsibilities || '')}</p>
      <div class="mini-stats">
        <span>Total Assigned: <b>${stats.total}</b></span>
        <span>Active: <b>${stats.active}</b></span>
        <span>Overdue: <b>${stats.overdue}</b></span>
        <span>On-time %: <b>${stats.onTimePct}%</b></span>
      </div>`;
  },
  extraActions: (rec) => rec.status === 'Active' ? '' : `<button class="btn sm" data-staffrestore="${rec.id}">Reactivate</button>`,
  beforeSave: (rec, existing) => { if (!existing) rec.status = rec.status || 'Active'; },
  wireExtraHandlers: () => {
    document.querySelectorAll('[data-staffrestore]').forEach((b) => b.addEventListener('click', () => {
      const s = staffById(b.dataset.staffrestore); if (!s) return;
      s.status = 'Active'; wSaveRecord('wbcynStaff', s); renderWbcyn();
    }));
  },
  emptyHint: 'Add staff members to assign them work.',
};
// Deactivating a staff member never deletes them (they may be linked from
// years of assignments/correspondence) — "Archive" on Staff soft-sets
// status to Inactive instead of the generic archived flag, so History and
// existing assignment links keep resolving correctly.
function moduleArchiveOverrideStaff(){
  const orig = moduleArchive;
  return function (cfg, id) {
    if (cfg.store !== 'wbcynStaff') return orig(cfg, id);
    if (!confirm('Mark this staff member as Inactive? Their assignment history and correspondence links are preserved.')) return;
    const s = staffById(id); if (!s) return;
    s.status = 'Inactive'; wSaveRecord('wbcynStaff', s);
    renderWbcyn();
  };
}
moduleArchive = moduleArchiveOverrideStaff();

function computeStaffStats(staffId){
  const all = wdb.wbcynAssignments.filter((a) => a.assignedToStaffId === staffId);
  const active = all.filter((a) => !['Verified', 'Closed', 'Cancelled', 'Rejected'].includes(a.status));
  const overdue = active.filter((a) => isAssignmentOverdueW(a));
  const closed = all.filter((a) => ['Verified', 'Closed'].includes(a.status));
  let onTime = 0, late = 0, totalDelay = 0, totalDuration = 0, durCount = 0;
  closed.forEach((a) => {
    const compDate = assignmentCompletionDateW(a);
    if (compDate && a.deadlineDate) {
      const delay = daysBetweenISO(compDate, a.deadlineDate);
      if (delay <= 0) onTime++; else { late++; totalDelay += delay; }
    }
    if (compDate && a.dateAssigned) { totalDuration += Math.max(0, daysBetweenISO(compDate, a.dateAssigned)); durCount++; }
  });
  const onTimePct = closed.length ? Math.round((onTime / closed.length) * 100) : 0;
  return {
    total: all.length, active: active.length, overdue: overdue.length,
    pending: all.filter((a) => ['Assigned', 'Acknowledged'].includes(a.status)).length,
    inProgress: all.filter((a) => a.status === 'In Progress').length,
    submitted: all.filter((a) => a.status === 'Submitted for Verification').length,
    verified: all.filter((a) => a.status === 'Verified').length,
    revisionRequired: all.filter((a) => a.status === 'Revision Required').length,
    completedBeforeDeadline: onTime, completedLate: late,
    avgDelay: late ? Math.round(totalDelay / late) : 0,
    avgCompletionDays: durCount ? Math.round(totalDuration / durCount) : 0,
    onTimePct,
    criticalPending: active.filter((a) => a.priority === 'Critical').length,
  };
}

/* ================= STAFF ASSIGNMENTS ================= */
function isAssignmentOverdueW(a){
  return a.deadlineDate && a.deadlineDate < todayISO() && !['Verified', 'Closed', 'Cancelled', 'Rejected'].includes(a.status);
}
function assignmentTimelineOf(id){ return wdb.wbcynAssignmentTimeline.filter((e) => e.assignmentId === id).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); }
function addAssignmentTimelineEvent(assignmentId, type, remarks){
  wSaveRecord('wbcynAssignmentTimeline', { id: genUUID(), assignmentId, type, date: todayISO(), time: nowTimeHM(), user: wdb.settings.registrarName || 'Registrar', remarks: remarks || '' });
}
function assignmentCompletionDateW(a){
  const tl = assignmentTimelineOf(a.id);
  const verified = tl.find((e) => e.type === 'Verified');
  if (verified) return verified.date;
  const completed = tl.slice().reverse().find((e) => e.type === 'Status Changed' && /→ (Submitted for Verification|Completed)$/.test(e.remarks || ''));
  return completed ? completed.date : null;
}
function setAssignmentStatus(a, newStatus, remarks){
  const old = a.status;
  a.status = newStatus;
  a.updatedAt = new Date().toISOString();
  wSaveRecord('wbcynAssignments', a);
  addAssignmentTimelineEvent(a.id, 'Status Changed', `${old} → ${newStatus}${remarks ? ' — ' + remarks : ''}`);
}

WBCYN_MODULES.assignments = {
  store: 'wbcynAssignments', prefix: 'ASG', label: 'Staff Assignments', singularLabel: 'Assignment', icon: '📝',
  titleField: 'title', statusField: 'status', priorityField: 'priority', dueField: 'deadlineDate',
  closedStatuses: ['Verified', 'Closed', 'Cancelled', 'Rejected'],
  filterableKeys: ['status', 'category', 'priority'],
  searchFields: ['title', 'instructions', 'expectedDeliverable'],
  sections: [
    { title: 'Identification', fields: [
      { key: 'title', label: 'Assignment Title', type: 'text', required: true },
      { key: 'instructions', label: 'Detailed Instructions', type: 'textarea' },
      { key: 'category', label: 'Category', type: 'select', options: ASSIGNMENT_CATEGORIES_WBCYN, required: true },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true },
      { key: 'status', label: 'Current Status', type: 'select', options: ASSIGNMENT_STATUSES_WBCYN, required: true },
    ] },
    { title: 'Assignment Details', fields: [
      { key: 'assignedBy', label: 'Assigned By', type: 'text' },
      { key: 'assignedToStaffId', label: 'Assigned To', type: 'select', options: staffOptions, required: true, staffRef: true },
      { key: 'additionalStaff', label: 'Additional Staff Involved', type: 'multiselect', options: () => activeStaff().map((s) => s.name) },
      { key: 'dateAssigned', label: 'Date Assigned', type: 'date' },
      { key: 'timeAssigned', label: 'Time Assigned', type: 'time' },
      { key: 'expectedStartDate', label: 'Expected Start Date', type: 'date' },
      { key: 'deadlineDate', label: 'Deadline Date', type: 'date', required: true },
      { key: 'deadlineTime', label: 'Deadline Time', type: 'time' },
      { key: 'estimatedDuration', label: 'Estimated Duration', type: 'text' },
      { key: 'expectedDeliverable', label: 'Expected Deliverable', type: 'textarea' },
    ] },
    { title: 'Related References', fields: [
      { key: 'relatedInwardId', label: 'Related Inward Record', type: 'select', options: () => wdb.wbcynInward.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.subject || '') })) },
      { key: 'relatedOutwardId', label: 'Related Outward Letter', type: 'select', options: () => wdb.wbcynOutward.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.subject || '') })) },
      { key: 'relatedFileId', label: 'Related Higher Authority File', type: 'select', options: () => wdb.wbcynHigherAuthorityFiles.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.fileTitle || '') })) },
      { key: 'relatedFileNumber', label: 'Related WBCYN File Number', type: 'text' },
      { key: 'relatedMemoNumber', label: 'Related Memo Number', type: 'text' },
      { key: 'relatedMeetingId', label: 'Related Meeting', type: 'select', options: () => wdb.wbcynMeetings.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.meetingTitle || '') })) },
      { key: 'relatedInstitution', label: 'Related Institution', type: 'text' },
      { key: 'relatedCourtCaseId', label: 'Related Court Case', type: 'select', options: () => wdb.wbcynLegalMatters.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.caseNumber || '') })) },
      { key: 'relatedRtiId', label: 'Related RTI', type: 'select', options: () => wdb.wbcynRTI.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.applicantName || '') })) },
      { key: 'relatedExamination', label: 'Related Examination', type: 'text' },
      { key: 'relatedRegistrationMatter', label: 'Related Registration Matter', type: 'text' },
      { key: 'relatedAffiliationMatter', label: 'Related Affiliation Matter', type: 'text' },
    ] },
    { title: 'Progress and Follow-up', fields: [
      { key: 'progressPct', label: 'Progress Percentage', type: 'number', step: '10' },
      { key: 'followUpRequired', label: 'Follow-up Required', type: 'select', options: ['Yes', 'No'] },
      { key: 'followUpFrequency', label: 'Follow-up Frequency', type: 'select', options: ['Daily', 'Every 2 Days', 'Weekly', 'Fortnightly', 'Custom'] },
      { key: 'firstFollowUpDate', label: 'First Follow-up Date', type: 'date' },
      { key: 'nextFollowUpDate', label: 'Next Follow-up Date', type: 'date' },
      { key: 'lastFollowUpDate', label: 'Last Follow-up Date', type: 'date' },
      { key: 'reminderIntervalDays', label: 'Reminder Interval (days before deadline)', type: 'number' },
      { key: 'progressRemarks', label: 'Progress Remarks', type: 'textarea' },
    ] },
    { title: 'Completion and Verification', fields: [
      { key: 'workSubmittedDate', label: 'Work Submitted Date', type: 'date' },
      { key: 'workSubmittedTime', label: 'Work Submitted Time', type: 'time' },
      { key: 'completionRemarks', label: 'Completion Remarks', type: 'textarea' },
      { key: 'verificationDate', label: 'Verification Date', type: 'date' },
      { key: 'registrarRemarks', label: 'Registrar’s Remarks', type: 'textarea' },
      { key: 'revisionInstructions', label: 'Revision Instructions', type: 'textarea' },
      { key: 'resubmissionDate', label: 'Resubmission Date', type: 'date' },
      { key: 'finalClosureDate', label: 'Final Closure Date', type: 'date' },
    ] },
  ],
  cardMeta: (rec) => [staffName(rec.assignedToStaffId), rec.category, rec.deadlineDate ? 'Deadline ' + fmtDate(rec.deadlineDate) : ''],
  cardDetailsHTML: (rec) => `
    <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${Number(rec.progressPct) || 0}%"></div></div>
    <p style="font-size:12.5px;color:var(--muted);margin:4px 0 0;">${Number(rec.progressPct) || 0}% complete</p>
    <p>${escapeHtml(rec.instructions || '')}</p>`,
  extraActions: (rec) => `<button class="btn sm" data-asgworkflow="${rec.id}">Workflow</button>`,
  beforeSave: (rec, existing) => {
    if (!existing) {
      rec.status = rec.status || 'Draft';
      rec.dateAssigned = rec.dateAssigned || todayISO();
      rec.originalDeadlineDate = rec.deadlineDate; // never overwritten again — see extendAssignmentDeadline()
      rec.assignedBy = rec.assignedBy || wdb.settings.registrarName || 'Dr. M. Jahangir';
      rec.progressPct = rec.progressPct || 0;
    } else if (existing.deadlineDate !== rec.deadlineDate) {
      // Manual edits to the deadline via the plain form still must not
      // silently overwrite the original — force use of "Extend Deadline"
      // instead, which records the change properly.
      rec.deadlineDate = existing.deadlineDate;
      alert('To change the deadline, use "Workflow → Extend Deadline" so the original deadline and the reason for the change are preserved. The deadline field was not modified.');
    }
  },
  afterSave: (rec, existing) => {
    if (!existing) addAssignmentTimelineEvent(rec.id, 'Created', 'Assignment created and assigned to ' + staffName(rec.assignedToStaffId));
  },
  wireDetailHandlers: (rec) => wireAssignmentWorkflowButtons(rec),
  extraDetailHTML: (rec) => renderAssignmentTimelineHTML(rec),
  wireExtraHandlers: () => {
    document.querySelectorAll('[data-asgworkflow]').forEach((b) => b.addEventListener('click', () => openAssignmentWorkflowModal(b.dataset.asgworkflow)));
  },
  emptyHint: 'Use "+ New Assignment" or assign work from an Inward record, Higher Authority File, or Meeting resolution.',
};

function renderAssignmentTimelineHTML(rec){
  const tl = assignmentTimelineOf(rec.id);
  const rows = tl.map((e) => `<div class="tl-row"><div class="tl-dot"></div><div><div class="tl-type">${escapeHtml(e.type)} <span class="tl-date">${fmtDate(e.date)} ${fmtTime(e.time)}</span></div><div class="tl-remarks">${escapeHtml(e.remarks || '')}</div></div></div>`).join('') || '<div class="empty-note">No timeline events yet.</div>';
  const ext = wdb.wbcynDeadlineExtensions.filter((x) => x.assignmentId === rec.id);
  const extRows = ext.map((x) => `<div class="tl-row"><div class="tl-dot" style="background:var(--orange)"></div><div><div class="tl-type">Deadline Extended to ${fmtDate(x.newDeadline)} <span class="tl-date">${fmtDate(x.date)}</span></div><div class="tl-remarks">${escapeHtml(x.reason || '')} — approved by ${escapeHtml(x.approvedBy || '')}</div></div></div>`).join('');
  return `<div class="form-section"><div class="form-section-title">Timeline</div><div class="timeline">${extRows}${rows}</div></div>
    <div class="form-section"><div class="form-section-title">Original vs Current Deadline</div>
      <p>Original: <b>${fmtDate(rec.originalDeadlineDate || rec.deadlineDate)}</b> &nbsp;→&nbsp; Current: <b>${fmtDate(rec.deadlineDate)}</b></p>
    </div>`;
}

const ASSIGNMENT_WORKFLOW_ACTIONS = [
  { id: 'acknowledge', label: 'Acknowledge', status: 'Acknowledged', from: ['Assigned'] },
  { id: 'start', label: 'Start Progress', status: 'In Progress', from: ['Acknowledged', 'Revision Required'] },
  { id: 'hold', label: 'Put On Hold', status: 'On Hold', from: ['In Progress', 'Acknowledged'] },
  { id: 'clarify', label: 'Need Clarification', status: 'Awaiting Information', from: ['In Progress'] },
  { id: 'submit', label: 'Submit for Verification', status: 'Submitted for Verification', from: ['In Progress', 'On Hold', 'Awaiting Information'] },
  { id: 'revise', label: 'Request Revision (Registrar)', status: 'Revision Required', from: ['Submitted for Verification'], needsRemarks: true },
  { id: 'verify', label: 'Verify (Registrar)', status: 'Verified', from: ['Submitted for Verification'] },
  { id: 'close', label: 'Close (Registrar)', status: 'Closed', from: ['Verified'] },
  { id: 'reassign', label: 'Reassign', status: 'Reassigned', from: ['Assigned', 'Acknowledged', 'In Progress', 'On Hold'] },
  { id: 'cancel', label: 'Cancel', status: 'Cancelled', from: ['Draft', 'Assigned', 'Acknowledged', 'In Progress', 'On Hold', 'Awaiting Information'] },
];
function wireAssignmentWorkflowButtons(){ /* buttons live in the workflow modal, wired there */ }
function openAssignmentWorkflowModal(id){
  const a = wdb.wbcynAssignments.find((x) => x.id === id);
  if (!a) return;
  const available = ASSIGNMENT_WORKFLOW_ACTIONS.filter((w) => w.from.includes(a.status));
  const btns = available.map((w) => `<button class="btn sm" data-wf="${w.id}">${w.label}</button>`).join(' ') || '<p class="empty-note">No workflow transitions available from the current status.</p>';
  openModal(`Workflow — ${escapeHtml(a.title)}`, `
    <p>Current status: ${statusBadge(a.status)}</p>
    <div class="form-field full"><label>Progress %</label><input type="number" id="wfProgress" value="${Number(a.progressPct) || 0}" min="0" max="100" step="10"></div>
    <div class="wf-actions">${btns}</div>
    <hr>
    <button class="btn sm secondary" data-wf="extend">📅 Extend Deadline</button>
    <button class="btn sm secondary" data-wf="whatsapp">💬 WhatsApp Reminder</button>
  `, `<button class="btn grey" id="wfClose">Close</button><button class="btn" id="wfSaveProgress">Save Progress</button>`);
  document.getElementById('wfClose').onclick = () => { closeModal(); renderWbcyn(); };
  document.getElementById('wfSaveProgress').onclick = () => {
    const p = Number(document.getElementById('wfProgress').value) || 0;
    if (p !== Number(a.progressPct)) { a.progressPct = p; wSaveRecord('wbcynAssignments', a); addAssignmentTimelineEvent(a.id, 'Progress Updated', `Progress set to ${p}%`); }
    closeModal(); renderWbcyn();
  };
  document.querySelectorAll('[data-wf]').forEach((b) => b.addEventListener('click', () => {
    const id2 = b.dataset.wf;
    if (id2 === 'extend') { openExtendDeadlineModal(a); return; }
    if (id2 === 'whatsapp') { openAssignmentWhatsAppReminder(a); return; }
    const w = ASSIGNMENT_WORKFLOW_ACTIONS.find((x) => x.id === id2);
    if (!w) return;
    if (w.needsRemarks) {
      const remarks = prompt('Revision instructions for staff (required):');
      if (!remarks) return;
      a.revisionInstructions = remarks;
      setAssignmentStatus(a, w.status, remarks);
    } else if (w.id === 'submit') {
      a.workSubmittedDate = todayISO(); a.workSubmittedTime = nowTimeHM();
      setAssignmentStatus(a, w.status);
    } else if (w.id === 'verify') {
      if (!confirm('Only the Registrar should verify completed work. Confirm verification?')) return;
      a.verificationDate = todayISO();
      setAssignmentStatus(a, w.status);
    } else if (w.id === 'close') {
      if (!confirm('Closing this assignment marks it permanently finished. Continue?')) return;
      a.finalClosureDate = todayISO();
      setAssignmentStatus(a, w.status);
    } else {
      setAssignmentStatus(a, w.status);
    }
    closeModal(); renderWbcyn();
  }));
}
function openExtendDeadlineModal(a){
  openModal('Extend Deadline', `
    <p>Original deadline: <b>${fmtDate(a.originalDeadlineDate || a.deadlineDate)}</b></p>
    <p>Current deadline: <b>${fmtDate(a.deadlineDate)}</b></p>
    <div class="form-field full"><label>New Deadline *</label><input type="date" id="extNewDate" value="${a.deadlineDate || ''}"></div>
    <div class="form-field full"><label>Reason for Extension *</label><textarea id="extReason"></textarea></div>
    <div class="form-field full"><label>Extension Approved By</label><input type="text" id="extApprover" value="${escapeHtml(wdb.settings.registrarName || '')}"></div>
  `, `<button class="btn grey" id="extCancel">Cancel</button><button class="btn" id="extSave">Save Extension</button>`);
  document.getElementById('extCancel').onclick = closeModal;
  document.getElementById('extSave').onclick = () => {
    const newDate = document.getElementById('extNewDate').value;
    const reason = document.getElementById('extReason').value;
    if (!newDate || !reason) { alert('New deadline and reason are both required.'); return; }
    wSaveRecord('wbcynDeadlineExtensions', { id: genUUID(), assignmentId: a.id, date: todayISO(), previousDeadline: a.deadlineDate, newDeadline: newDate, reason, approvedBy: document.getElementById('extApprover').value });
    a.deadlineDate = newDate; // original stays in a.originalDeadlineDate, set once at creation and never touched again
    wSaveRecord('wbcynAssignments', a);
    addAssignmentTimelineEvent(a.id, 'Deadline Extended', `New deadline ${fmtDate(newDate)} — ${reason}`);
    closeModal(); renderWbcyn();
  };
}
function assignmentReminderMessageW(a, person){
  return `Dear ${person.name},\n\nThis is a reminder regarding the assignment:\n\n${a.title}\n\nDeadline: ${fmtDate(a.deadlineDate)}\n\nKindly update the present status.\n\nRegards,\n${a.assignedBy || wdb.settings.registrarName || 'Dr. M. Jahangir'}`;
}
function openAssignmentWhatsAppReminder(a){
  const person = staffById(a.assignedToStaffId);
  if (!person) { alert('No staff member is assigned to this assignment.'); return; }
  const normalized = normalizeIndianMobile(person.whatsapp || person.mobile);
  if (!normalized.ok) { alert(normalized.reason); return; }
  const msg = assignmentReminderMessageW(a, person);
  openModal('💬 WhatsApp Reminder — ' + escapeHtml(person.name), `<div class="form-field full"><label>Message (editable — nothing is sent automatically)</label><textarea id="asgWhatsAppText" style="height:180px;">${escapeHtml(msg)}</textarea></div>`,
    `<button class="btn grey" id="asgWhatsAppCancel">Cancel</button><button class="btn" id="asgWhatsAppSend">📲 Open WhatsApp</button>`);
  document.getElementById('asgWhatsAppCancel').onclick = closeModal;
  document.getElementById('asgWhatsAppSend').onclick = () => {
    const text = document.getElementById('asgWhatsAppText').value;
    window.open(buildWhatsAppLink(normalized.number, text), '_blank');
    addAssignmentTimelineEvent(a.id, 'Reminder Sent', 'WhatsApp reminder sent to ' + person.name);
    closeModal(); renderWbcyn();
  };
}

function renderStaffSection(){ return renderModuleCardList(WBCYN_MODULES.staff); }
function renderAssignmentsSection(){ return renderModuleCardList(WBCYN_MODULES.assignments); }

/* ================= INWARD REGISTER ================= */
WBCYN_MODULES.inward = {
  store: 'wbcynInward', prefix: 'IN', label: 'Inward Register', singularLabel: 'Inward Entry', icon: '📥',
  titleField: 'subject', statusField: 'status', priorityField: 'priority', dueField: 'actionDeadline',
  closedStatuses: ['Filed', 'Closed', 'No Action Required', 'Reply Issued'],
  filterableKeys: ['status', 'communicationType', 'priority'],
  searchFields: ['subject', 'briefSummary', 'senderName', 'senderOrganisation', 'diaryNumber', 'senderMemoNumber'],
  sections: [
    { title: 'Identification', fields: [
      { key: 'diaryNumber', label: 'Diary or Receipt Number', type: 'text' },
      { key: 'dateReceived', label: 'Date Received', type: 'date', required: true },
      { key: 'timeReceived', label: 'Time Received', type: 'time' },
      { key: 'modeOfReceipt', label: 'Mode of Receipt', type: 'select', options: MODES_OF_RECEIPT },
      { key: 'communicationType', label: 'Communication Type', type: 'select', options: COMMUNICATION_TYPES },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true },
      { key: 'status', label: 'Current Status', type: 'select', options: INWARD_STATUSES, required: true },
    ] },
    { title: 'Sender Details', fields: [
      { key: 'senderName', label: 'Sender Name', type: 'text' },
      { key: 'senderDesignation', label: 'Designation', type: 'text' },
      { key: 'senderOrganisation', label: 'Organisation', type: 'text' },
      { key: 'senderDepartment', label: 'Department', type: 'text' },
      { key: 'senderBranch', label: 'Branch', type: 'text' },
      { key: 'senderAddress', label: 'Address', type: 'textarea' },
      { key: 'senderMobile', label: 'Mobile Number', type: 'text' },
      { key: 'senderEmail', label: 'Email Address', type: 'email' },
    ] },
    { title: 'Communication Details', fields: [
      { key: 'senderMemoNumber', label: 'Sender Memo Number', type: 'text' },
      { key: 'senderLetterDate', label: 'Sender Letter Date', type: 'date' },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'briefSummary', label: 'Brief Summary', type: 'textarea' },
      { key: 'actionRequested', label: 'Action or Information Requested', type: 'textarea' },
      { key: 'numPages', label: 'Number of Pages', type: 'number' },
      { key: 'numEnclosures', label: 'Number of Enclosures', type: 'number' },
      { key: 'attachmentReference', label: 'Attachment Reference', type: 'text' },
      { key: 'scannedDocRef', label: 'Scanned Document Reference', type: 'text' },
    ] },
    { title: 'Internal Processing', fields: [
      { key: 'receivedBy', label: 'Received By', type: 'text' },
      { key: 'placedBeforeRegistrarDate', label: 'Placed Before Registrar Date', type: 'date' },
      { key: 'registrarDirection', label: 'Registrar’s Direction', type: 'textarea' },
      { key: 'markedToStaffId', label: 'Marked To Staff', type: 'select', options: staffOptions, staffRef: true },
      { key: 'dateAssignedToStaff', label: 'Date Assigned', type: 'date' },
      { key: 'actionDeadline', label: 'Action Deadline', type: 'date' },
      { key: 'relatedFileNumber', label: 'Related WBCYN File Number', type: 'text' },
      { key: 'relatedOutwardId', label: 'Related Outward Letter', type: 'select', options: () => wdb.wbcynOutward.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.subject || '') })) },
      { key: 'relatedPreviousCorrespondence', label: 'Related Previous Correspondence', type: 'text' },
      { key: 'followUpRequired', label: 'Follow-up Required', type: 'select', options: ['Yes', 'No'] },
      { key: 'nextActionDate', label: 'Next Action Date', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ] },
  ],
  cardMeta: (rec) => [rec.senderName, rec.senderOrganisation, 'Received ' + fmtDate(rec.dateReceived), rec.markedToStaffId ? 'To ' + staffName(rec.markedToStaffId) : ''],
  cardDetailsHTML: (rec) => `<p>${escapeHtml(rec.briefSummary || '')}</p>`,
  extraActions: (rec) => `<button class="btn sm" data-inwassign="${rec.id}">Assign to Staff</button> <button class="btn sm" data-inwreply="${rec.id}">Add Reply</button>`,
  wireExtraHandlers: () => {
    document.querySelectorAll('[data-inwassign]').forEach((b) => b.addEventListener('click', () => {
      const rec = moduleById(WBCYN_MODULES.inward, b.dataset.inwassign);
      openModuleForm(WBCYN_MODULES.assignments, null, { title: 'Action on: ' + (rec.subject || rec.trackingId), relatedInwardId: rec.id, deadlineDate: rec.actionDeadline || '' });
    }));
    document.querySelectorAll('[data-inwreply]').forEach((b) => b.addEventListener('click', () => {
      const rec = moduleById(WBCYN_MODULES.inward, b.dataset.inwreply);
      openModuleForm(WBCYN_MODULES.replies, null, { linkedInwardId: rec.id, subject: rec.subject || '' });
    }));
  },
  emptyHint: 'Use "+ New Inward Entry" to log a letter, email, file or petition received.',
};
function renderInwardSection(){ return renderModuleCardList(WBCYN_MODULES.inward); }

/* ================= OUTWARD REGISTER ================= */
WBCYN_MODULES.outward = {
  store: 'wbcynOutward', prefix: 'OUT', label: 'Outward Register', singularLabel: 'Outward Letter', icon: '📤',
  titleField: 'subject', statusField: 'status', priorityField: 'priority', dueField: 'expectedReplyDate',
  closedStatuses: ['Closed', 'Cancelled'],
  filterableKeys: ['status', 'communicationType', 'priority'],
  searchFields: ['subject', 'memoNumber', 'addresseeName', 'addresseeDepartment', 'briefSummary'],
  sections: [
    { title: 'Identification', fields: [
      { key: 'memoNumber', label: 'Official Memo Number', type: 'text' },
      { key: 'letterDate', label: 'Letter Date', type: 'date', required: true },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'communicationType', label: 'Communication Type', type: 'select', options: OUTWARD_TYPES },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true },
      { key: 'status', label: 'Current Status', type: 'select', options: OUTWARD_STATUSES, required: true },
    ] },
    { title: 'Addressee', fields: [
      { key: 'addresseeName', label: 'Addressee Name', type: 'text' },
      { key: 'addresseeDesignation', label: 'Designation', type: 'text' },
      { key: 'addresseeDepartment', label: 'Department', type: 'text' },
      { key: 'addresseeBranch', label: 'Branch', type: 'text' },
      { key: 'addresseeOffice', label: 'Office', type: 'text' },
      { key: 'addresseeAddress', label: 'Complete Address', type: 'textarea' },
      { key: 'recipientCategory', label: 'Recipient Category', type: 'select', options: RECIPIENT_CATEGORIES },
      { key: 'addresseeEmail', label: 'Email', type: 'email' },
      { key: 'addresseeMobile', label: 'Mobile Number', type: 'text' },
    ] },
    { title: 'Content and Reference', fields: [
      { key: 'briefSummary', label: 'Brief Summary', type: 'textarea' },
      { key: 'purpose', label: 'Purpose', type: 'textarea' },
      { key: 'actionRequested', label: 'Action Requested', type: 'textarea' },
      { key: 'relatedFileNumber', label: 'Related WBCYN File Number', type: 'text' },
      { key: 'relatedInwardId', label: 'Related Inward Tracking ID', type: 'select', options: () => wdb.wbcynInward.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.subject || '') })) },
      { key: 'relatedPreviousMemoNumber', label: 'Related Previous Memo Number', type: 'text' },
      { key: 'relatedGovernmentOrder', label: 'Related Government Order', type: 'text' },
      { key: 'relatedInstitution', label: 'Related Institution', type: 'text' },
      { key: 'relatedMeetingId', label: 'Related Meeting', type: 'select', options: () => wdb.wbcynMeetings.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.meetingTitle || '') })) },
      { key: 'relatedCourtCaseId', label: 'Related Court Case', type: 'select', options: () => wdb.wbcynLegalMatters.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.caseNumber || '') })) },
      { key: 'relatedRtiId', label: 'Related RTI', type: 'select', options: () => wdb.wbcynRTI.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.applicantName || '') })) },
      { key: 'enclosureList', label: 'Enclosure List', type: 'textarea' },
      { key: 'draftFileRef', label: 'Draft File Reference', type: 'text' },
      { key: 'signedCopyRef', label: 'Signed Copy Reference', type: 'text' },
      { key: 'scannedLetterRef', label: 'Scanned Letter Reference', type: 'text' },
    ] },
    { title: 'Preparation and Approval', fields: [
      { key: 'draftedBy', label: 'Drafted By', type: 'text' },
      { key: 'checkedBy', label: 'Checked By', type: 'text' },
      { key: 'approvedBy', label: 'Approved By', type: 'text' },
      { key: 'signedBy', label: 'Signed By', type: 'text' },
      { key: 'dateSigned', label: 'Date Signed', type: 'date' },
      { key: 'approvalRemarks', label: 'Approval Remarks', type: 'textarea' },
    ] },
    { title: 'Dispatch', fields: [
      { key: 'dispatchDate', label: 'Dispatch Date', type: 'date' },
      { key: 'dispatchTime', label: 'Dispatch Time', type: 'time' },
      { key: 'deliveryMode', label: 'Delivery Mode', type: 'select', options: DELIVERY_MODES },
      { key: 'dispatchNumber', label: 'Dispatch Number', type: 'text' },
      { key: 'consignmentNumber', label: 'Speed Post / Consignment Number', type: 'text' },
      { key: 'eOfficeReceiptNumber', label: 'e-Office Receipt Number', type: 'text' },
      { key: 'emailSentDate', label: 'Email Sent Date', type: 'date' },
      { key: 'emailSentTime', label: 'Email Sent Time', type: 'time' },
      { key: 'messengerName', label: 'Messenger Name', type: 'text' },
      { key: 'handDeliveryDetails', label: 'Hand Delivery Details', type: 'text' },
      { key: 'dispatchRemarks', label: 'Dispatch Remarks', type: 'textarea' },
    ] },
    { title: 'Follow-up', fields: [
      { key: 'deliveryConfirmed', label: 'Delivery Confirmed', type: 'select', options: ['Yes', 'No'] },
      { key: 'deliveredDate', label: 'Delivered Date', type: 'date' },
      { key: 'ackRequired', label: 'Acknowledgement Required', type: 'select', options: ['Yes', 'No'] },
      { key: 'ackReceived', label: 'Acknowledgement Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'ackDate', label: 'Acknowledgement Date', type: 'date' },
      { key: 'expectedReplyDate', label: 'Expected Reply Date', type: 'date' },
      { key: 'followUpRequired', label: 'Follow-up Required', type: 'select', options: ['Yes', 'No'] },
      { key: 'nextFollowUpDate', label: 'Next Follow-up Date', type: 'date' },
      { key: 'responsibleStaffId', label: 'Responsible Staff', type: 'select', options: staffOptions, staffRef: true },
      { key: 'numReminders', label: 'Number of Reminders', type: 'number' },
      { key: 'lastReminderDate', label: 'Last Reminder Date', type: 'date' },
      { key: 'pendingReason', label: 'Current Pending Reason', type: 'text' },
      { key: 'closureOutcome', label: 'Closure Outcome', type: 'textarea' },
      { key: 'closureDate', label: 'Closure Date', type: 'date' },
    ] },
  ],
  cardMeta: (rec) => [rec.addresseeName, rec.addresseeDepartment, rec.memoNumber, rec.dispatchDate ? 'Dispatched ' + fmtDate(rec.dispatchDate) : 'Not dispatched'],
  cardDetailsHTML: (rec) => `<p>${escapeHtml(rec.briefSummary || '')}</p>`,
  extraActions: (rec) => `<button class="btn sm" data-outreminder="${rec.id}">Reminder Draft</button> <button class="btn sm" data-outreply="${rec.id}">Add Reply</button>`,
  beforeSave: (rec, existing) => {
    if (rec.status === 'Closed' && (!existing || existing.status !== 'Closed') && !rec.closureDate) rec.closureDate = todayISO();
  },
  wireExtraHandlers: () => {
    document.querySelectorAll('[data-outreminder]').forEach((b) => b.addEventListener('click', () => openReminderDraftGenerator({ type: 'outward', id: b.dataset.outreminder })));
    document.querySelectorAll('[data-outreply]').forEach((b) => b.addEventListener('click', () => {
      const rec = moduleById(WBCYN_MODULES.outward, b.dataset.outreply);
      openModuleForm(WBCYN_MODULES.replies, null, { linkedOutwardId: rec.id, subject: rec.subject || '' });
    }));
  },
  emptyHint: 'Use "+ New Outward Letter" to draft a letter, memo, or reminder for dispatch.',
};
function renderOutwardSection(){ return renderModuleCardList(WBCYN_MODULES.outward); }

/* ================= HIGHER AUTHORITY FILE TRACKER ================= */
WBCYN_MODULES.files = {
  store: 'wbcynHigherAuthorityFiles', prefix: 'FILE', label: 'Higher Authority File Tracker', singularLabel: 'Higher Authority File', icon: '🗂️',
  titleField: 'fileTitle', statusField: 'status', priorityField: 'priority', dueField: 'expectedDecisionDate',
  closedStatuses: ['Approved', 'Sanctioned', 'Rejected', 'Closed', 'Returned', 'Partly Approved'],
  filterableKeys: ['status', 'authorityCategory', 'priority'],
  searchFields: ['fileTitle', 'subject', 'fileNumber', 'addressee', 'briefBackground'],
  sections: [
    { title: 'File Details', fields: [
      { key: 'fileNumber', label: 'Official WBCYN File Number', type: 'text' },
      { key: 'fileTitle', label: 'File Title', type: 'text', required: true },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'fileCategory', label: 'File Category', type: 'text' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true },
      { key: 'status', label: 'Current Status', type: 'select', options: FILE_STATUSES, required: true },
    ] },
    { title: 'Authority Details', fields: [
      { key: 'authorityCategory', label: 'Authority Category', type: 'select', options: AUTHORITY_CATEGORIES, required: true },
      { key: 'addressee', label: 'Addressee', type: 'text' },
      { key: 'addresseeDesignation', label: 'Designation', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'office', label: 'Office', type: 'text' },
    ] },
    { title: 'Submission Details', fields: [
      { key: 'dateFileSent', label: 'Date File Sent', type: 'date' },
      { key: 'timeFileSent', label: 'Time File Sent', type: 'time' },
      { key: 'modeOfSubmission', label: 'Mode of Submission', type: 'select', options: DELIVERY_MODES },
      { key: 'eOfficeFileNumber', label: 'e-Office File Number', type: 'text' },
      { key: 'eOfficeReceiptNumber', label: 'e-Office Receipt Number', type: 'text' },
      { key: 'dispatchNumber', label: 'Dispatch Number', type: 'text' },
      { key: 'messengerDetails', label: 'Messenger Details', type: 'text' },
      { key: 'acknowledgementNumber', label: 'Acknowledgement Number', type: 'text' },
      { key: 'dateReceivedByAuthority', label: 'Date Received by Authority', type: 'date' },
      { key: 'receivingSection', label: 'Receiving Section', type: 'text' },
      { key: 'receivingOfficer', label: 'Receiving Officer, if known', type: 'text' },
    ] },
    { title: 'Purpose', fields: [
      { key: 'purpose', label: 'Purpose (select one or more)', type: 'multiselect', options: FILE_PURPOSES },
    ] },
    { title: 'Background and Documents', fields: [
      { key: 'briefBackground', label: 'Brief Background', type: 'textarea' },
      { key: 'actionRequested', label: 'Action Requested from Authority', type: 'textarea' },
      { key: 'importantDocumentsEnclosed', label: 'Important Documents Enclosed', type: 'textarea' },
      { key: 'relatedMemoNumbers', label: 'Related Memo Numbers', type: 'text' },
      { key: 'relatedGovernmentOrders', label: 'Related Government Orders', type: 'text' },
      { key: 'relatedCourtCaseId', label: 'Related Court Matters', type: 'select', options: () => wdb.wbcynLegalMatters.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.caseNumber || '') })) },
      { key: 'relatedMeetingId', label: 'Related Meetings', type: 'select', options: () => wdb.wbcynMeetings.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.meetingTitle || '') })) },
      { key: 'relatedInstitutions', label: 'Related Institutions', type: 'text' },
      { key: 'responsibleStaffId', label: 'Responsible WBCYN Staff', type: 'select', options: staffOptions, staffRef: true },
      { key: 'attachmentReferences', label: 'Attachment References', type: 'text' },
    ] },
    { title: 'Follow-up', fields: [
      { key: 'expectedDecisionDate', label: 'Expected Decision Date', type: 'date' },
      { key: 'expectedReplyDate', label: 'Expected Reply Date', type: 'date' },
      { key: 'firstFollowUpDate', label: 'First Follow-up Date', type: 'date' },
      { key: 'nextFollowUpDate', label: 'Next Follow-up Date', type: 'date' },
      { key: 'followUpOfficer', label: 'Follow-up Officer', type: 'text' },
      { key: 'lastFollowUpDate', label: 'Last Follow-up Date', type: 'date' },
      { key: 'numRemindersSent', label: 'Number of Reminders Sent', type: 'number' },
      { key: 'currentPendingReason', label: 'Current Pending Reason', type: 'text' },
      { key: 'escalationRequired', label: 'Escalation Required', type: 'select', options: ['Yes', 'No'] },
      { key: 'registrarRemarks', label: 'Registrar’s Remarks', type: 'textarea' },
    ] },
    { title: 'Outcome', fields: [
      { key: 'replyReceived', label: 'Reply Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'approvalReceived', label: 'Approval Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'sanctionReceived', label: 'Sanction Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'clarificationReceived', label: 'Clarification Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'legalOpinionReceived', label: 'Legal Opinion Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'financeConcurrenceReceived', label: 'Finance Concurrence Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'objectionReceived', label: 'Objection Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'returnedForCompliance', label: 'Returned for Compliance', type: 'select', options: ['Yes', 'No'] },
      { key: 'furtherDocumentsRequired', label: 'Further Documents Required', type: 'select', options: ['Yes', 'No'] },
      { key: 'rejected', label: 'Rejected', type: 'select', options: ['Yes', 'No'] },
      { key: 'partlyApproved', label: 'Partly Approved', type: 'select', options: ['Yes', 'No'] },
      { key: 'finalOutcome', label: 'Final Outcome', type: 'textarea' },
      { key: 'closureDate', label: 'Closure Date', type: 'date' },
    ] },
  ],
  cardMeta: (rec) => [rec.authorityCategory, rec.fileNumber, rec.dateFileSent ? 'Sent ' + fmtDate(rec.dateFileSent) : 'Not yet sent', rec.responsibleStaffId ? staffName(rec.responsibleStaffId) : ''],
  cardDetailsHTML: (rec) => `<p>${escapeHtml(rec.briefBackground || '')}</p><p style="font-size:12.5px;color:var(--muted);">Purpose: ${(rec.purpose || []).join(', ') || '—'}</p>`,
  extraActions: (rec) => `<button class="btn sm" data-filemove="${rec.id}">Log Movement</button> <button class="btn sm" data-filereminder="${rec.id}">Reminder Draft</button> <button class="btn sm" data-filereply="${rec.id}">Add Reply</button>`,
  wireExtraHandlers: () => {
    document.querySelectorAll('[data-filemove]').forEach((b) => b.addEventListener('click', () => {
      const rec = moduleById(WBCYN_MODULES.files, b.dataset.filemove);
      openModuleForm(WBCYN_MODULES.movements, null, { fileId: rec.id, fileNumberText: rec.fileNumber || '', dateSent: todayISO() });
    }));
    document.querySelectorAll('[data-filereminder]').forEach((b) => b.addEventListener('click', () => openReminderDraftGenerator({ type: 'file', id: b.dataset.filereminder })));
    document.querySelectorAll('[data-filereply]').forEach((b) => b.addEventListener('click', () => {
      const rec = moduleById(WBCYN_MODULES.files, b.dataset.filereply);
      openModuleForm(WBCYN_MODULES.replies, null, { linkedFileId: rec.id, subject: rec.subject || rec.fileTitle || '' });
    }));
  },
  emptyHint: 'Use "+ New Higher Authority File" to start tracking a file sent for approval, sanction, or decision.',
};
function renderHigherAuthoritySection(){ return renderModuleCardList(WBCYN_MODULES.files); }

/* ================= SWASTHYA BHAWAN TRACKER ================= */
// A filtered workspace over Higher Authority Files (and any Outward letter
// addressed to a Swasthya Bhawan / AYUSH authority) — not its own store,
// per spec section 5 ("automatically show ... sent to Swasthya Bhawan...").
function isSwasthyaFile(f){ return SWASTHYA_BHAWAN_AUTHORITIES.has(f.authorityCategory); }
function isSwasthyaOutward(o){ return SWASTHYA_BHAWAN_AUTHORITIES.has(o.addresseeDepartment) || /swasthya|ayush/i.test(o.addresseeDepartment || o.addresseeOffice || ''); }
function swasthyaRecords(){
  const files = wdb.wbcynHigherAuthorityFiles.filter((f) => !f.archived && isSwasthyaFile(f)).map((f) => ({ kind: 'File', rec: f, cfg: WBCYN_MODULES.files, sentDate: f.dateFileSent, ackDate: f.dateReceivedByAuthority, replyDate: f.closureDate, expectedReplyDate: f.expectedDecisionDate || f.expectedReplyDate }));
  const outward = wdb.wbcynOutward.filter((o) => !o.archived && isSwasthyaOutward(o)).map((o) => ({ kind: 'Outward', rec: o, cfg: WBCYN_MODULES.outward, sentDate: o.dispatchDate, ackDate: o.ackDate, replyDate: o.closureDate, expectedReplyDate: o.expectedReplyDate }));
  return files.concat(outward);
}
function renderSwasthyaBhawanSection(){
  let items = swasthyaRecords();
  const f = wstate.filters;
  if (f.search) { const s = f.search.toLowerCase(); items = items.filter((i) => JSON.stringify(i.rec).toLowerCase().includes(s)); }
  if (f.priority) items = items.filter((i) => i.rec.priority === f.priority);
  if (f.status) items = items.filter((i) => i.rec.status === f.status);
  const groups = {
    'Sent Today': items.filter((i) => i.sentDate === todayISO()),
    'Sent This Week': items.filter((i) => i.sentDate && daysUntil(i.sentDate) >= -7 && daysUntil(i.sentDate) <= 0),
    'Awaiting Delivery': items.filter((i) => i.sentDate && !i.ackDate),
    'Delivered but Not Acknowledged': items.filter((i) => i.ackDate && !i.rec.acknowledgementNumber && i.kind === 'File'),
    'Reply Due Today': items.filter((i) => i.expectedReplyDate === todayISO()),
    'Reply Overdue': items.filter((i) => i.expectedReplyDate && daysUntil(i.expectedReplyDate) < 0 && !i.replyDate),
    'Reply Received': items.filter((i) => !!i.replyDate),
  };
  const groupHtml = Object.keys(groups).map((label) => {
    const list = groups[label];
    if (!list.length) return '';
    return `<div class="section-title">${escapeHtml(label)} (${list.length})</div><div class="record-card-grid">${list.map((i) => renderRecordCard(i.cfg, i.rec)).join('')}</div>`;
  }).join('') || '<div class="empty-note">No Swasthya Bhawan / AYUSH-related records match the current filters.</div>';
  return `
    <div class="section-title no-print">🏛️ Swasthya Bhawan Tracker</div>
    <div class="toolbar no-print">
      <input type="text" data-modsearch="1" placeholder="Search subject, file number, addressee..." value="${escapeHtml(f.search || '')}">
      <select data-modfilter="priority"><option value="All">All Priorities</option>${PRIORITIES.map((p) => `<option ${f.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    </div>
    ${groupHtml}
  `;
}
SECTION_HANDLERS.swasthya = () => {
  const search = document.querySelector('[data-modsearch]');
  if (search) search.addEventListener('input', (e) => { wstate.filters.search = e.target.value; renderWbcyn(); });
  document.querySelectorAll('[data-modfilter]').forEach((sel) => sel.addEventListener('change', (e) => { wstate.filters[e.target.dataset.modfilter] = e.target.value === 'All' ? '' : e.target.value; renderWbcyn(); }));
  wireModuleHandlers(WBCYN_MODULES.files);
  wireModuleHandlers(WBCYN_MODULES.outward);
};

/* ================= FILE MOVEMENT TRACKER ================= */
WBCYN_MODULES.movements = {
  store: 'wbcynFileMovements', prefix: 'MOV', label: 'File Movement Tracker', singularLabel: 'Movement Entry', icon: '🚚',
  titleField: 'purposeOfMovement', statusField: 'status', dueField: 'expectedReturnDate',
  closedStatuses: ['Closed', 'Returned to WBCYN'],
  filterableKeys: ['status'],
  searchFields: ['purposeOfMovement', 'fromPersonOrSection', 'toPersonSectionOrAuthority', 'fileNumberText', 'currentLocation'],
  sections: [
    { title: 'Movement Details', fields: [
      { key: 'fileId', label: 'WBCYN File (linked)', type: 'select', options: () => wdb.wbcynHigherAuthorityFiles.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.fileTitle || '') })) },
      { key: 'fileNumberText', label: 'File Number / Title (if not linked above)', type: 'text' },
      { key: 'fromPersonOrSection', label: 'From Person or Section', type: 'text', required: true },
      { key: 'toPersonSectionOrAuthority', label: 'To Person, Section or Authority', type: 'text', required: true },
      { key: 'dateSent', label: 'Date Sent', type: 'date', required: true },
      { key: 'timeSent', label: 'Time Sent', type: 'time' },
      { key: 'dateReceived', label: 'Date Received', type: 'date' },
      { key: 'timeReceived', label: 'Time Received', type: 'time' },
      { key: 'purposeOfMovement', label: 'Purpose of Movement', type: 'text', required: true },
      { key: 'modeOfMovement', label: 'Mode of Movement', type: 'select', options: DELIVERY_MODES },
      { key: 'pendingWith', label: 'Pending With', type: 'text' },
      { key: 'expectedReturnDate', label: 'Expected Return Date', type: 'date' },
      { key: 'actualReturnDate', label: 'Actual Return Date', type: 'date' },
      { key: 'currentLocation', label: 'Current Location', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: FILE_MOVEMENT_STATUSES, required: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ] },
  ],
  cardMeta: (rec) => [rec.fromPersonOrSection + ' → ' + rec.toPersonSectionOrAuthority, 'Sent ' + fmtDate(rec.dateSent), rec.currentLocation],
  cardDetailsHTML: (rec) => {
    if (!rec.fileId) return `<p>${escapeHtml(rec.remarks || '')}</p>`;
    const history = wdb.wbcynFileMovements.filter((m) => m.fileId === rec.fileId).sort((a, b) => (a.dateSent || '').localeCompare(b.dateSent || ''));
    const rows = history.map((m) => `<div class="tl-row"><div class="tl-dot"></div><div><div class="tl-type">${escapeHtml(m.fromPersonOrSection)} → ${escapeHtml(m.toPersonSectionOrAuthority)} <span class="tl-date">${fmtDate(m.dateSent)}</span></div><div class="tl-remarks">${escapeHtml(m.status)}</div></div></div>`).join('');
    return `<p>${escapeHtml(rec.remarks || '')}</p><div class="form-section-title" style="margin-top:8px;">Movement History for this File</div><div class="timeline">${rows}</div>`;
  },
  emptyHint: 'Log the movement of a file within WBCYN or to an external section/authority.',
};
function renderFileMovementSection(){ return renderModuleCardList(WBCYN_MODULES.movements); }

/* ================= REPLIES & DECISIONS ================= */
WBCYN_MODULES.replies = {
  store: 'wbcynReplies', prefix: 'REP', label: 'Replies & Decisions', singularLabel: 'Reply', icon: '↩️',
  titleField: 'subject', statusField: 'status', priorityField: 'actionPriority', dueField: 'actionDeadline',
  closedStatuses: ['Closed'],
  filterableKeys: ['status', 'replyType'],
  searchFields: ['subject', 'briefSummary', 'senderName', 'replyMemoNumber'],
  sections: [
    { title: 'Reply Details', fields: [
      { key: 'replyMemoNumber', label: 'Reply Memo Number', type: 'text' },
      { key: 'replyDate', label: 'Reply Date', type: 'date' },
      { key: 'dateReceived', label: 'Date Received', type: 'date', required: true },
      { key: 'timeReceived', label: 'Time Received', type: 'time' },
      { key: 'senderName', label: 'Sender Name', type: 'text' },
      { key: 'senderDesignation', label: 'Sender Designation', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'branch', label: 'Branch', type: 'text' },
      { key: 'office', label: 'Office', type: 'text' },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'briefSummary', label: 'Brief Summary', type: 'textarea' },
      { key: 'replyType', label: 'Reply Type', type: 'select', options: REPLY_TYPES, required: true },
    ] },
    { title: 'Linked Original Record', fields: [
      { key: 'linkedInwardId', label: 'Original Inward Record', type: 'select', options: () => wdb.wbcynInward.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.subject || '') })) },
      { key: 'linkedOutwardId', label: 'Original Outward Letter', type: 'select', options: () => wdb.wbcynOutward.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.subject || '') })) },
      { key: 'linkedFileId', label: 'Higher Authority File', type: 'select', options: () => wdb.wbcynHigherAuthorityFiles.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.fileTitle || '') })) },
      { key: 'linkedAssignmentId', label: 'Staff Assignment', type: 'select', options: () => wdb.wbcynAssignments.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.title || '') })) },
      { key: 'attachmentReference', label: 'Attachment Reference', type: 'text' },
      { key: 'scannedReplyReference', label: 'Scanned Reply Reference', type: 'text' },
    ] },
    { title: 'Action Required', fields: [
      { key: 'actionRequired', label: 'Action Required', type: 'textarea' },
      { key: 'actionPriority', label: 'Action Priority', type: 'select', options: PRIORITIES },
      { key: 'actionAssignedToStaffId', label: 'Action Assigned To', type: 'select', options: staffOptions, staffRef: true },
      { key: 'actionDeadline', label: 'Action Deadline', type: 'date' },
      { key: 'registrarRemarks', label: 'Registrar’s Remarks', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', options: REPLY_STATUSES, required: true },
      { key: 'closureDate', label: 'Closure Date', type: 'date' },
    ] },
  ],
  cardMeta: (rec) => [rec.senderName, rec.replyType, 'Received ' + fmtDate(rec.dateReceived)],
  cardDetailsHTML: (rec) => `<p>${escapeHtml(rec.briefSummary || '')}</p>`,
  extraActions: (rec) => `<button class="btn sm" data-replyassign="${rec.id}">Assign Action</button>`,
  beforeSave: (rec, existing) => { if (rec.status === 'Closed' && (!existing || existing.status !== 'Closed') && !rec.closureDate) rec.closureDate = todayISO(); },
  extraDetailHTML: (rec) => {
    const anchor = rec.linkedInwardId ? ['inward', rec.linkedInwardId] : rec.linkedOutwardId ? ['outward', rec.linkedOutwardId] : rec.linkedFileId ? ['file', rec.linkedFileId] : null;
    return anchor ? renderCorrespondenceChain(anchor[0], anchor[1]) : '';
  },
  wireExtraHandlers: () => {
    document.querySelectorAll('[data-replyassign]').forEach((b) => b.addEventListener('click', () => {
      const rec = moduleById(WBCYN_MODULES.replies, b.dataset.replyassign);
      openModuleForm(WBCYN_MODULES.assignments, null, { title: 'Action on reply: ' + (rec.subject || rec.trackingId), deadlineDate: rec.actionDeadline || '', category: 'Government Correspondence', assignedToStaffId: rec.actionAssignedToStaffId || '' });
    }));
  },
  emptyHint: 'Log a reply, approval, sanction, or clarification received and link it to the original matter.',
};
function renderRepliesSection(){ return renderModuleCardList(WBCYN_MODULES.replies); }

// Chronological correspondence chain: every Reply linked to the same
// original Inward / Outward / Higher Authority File record, shown on that
// record's own detail view and cross-linked from every reply in the chain.
function linkedReplies(type, id){
  const key = type === 'inward' ? 'linkedInwardId' : type === 'outward' ? 'linkedOutwardId' : 'linkedFileId';
  return wdb.wbcynReplies.filter((r) => r[key] === id && !r.archived);
}
function renderCorrespondenceChain(type, id){
  const replies = linkedReplies(type, id).slice().sort((a, b) => (a.replyDate || a.dateReceived || '').localeCompare(b.replyDate || b.dateReceived || ''));
  if (!replies.length) return '';
  const rows = replies.map((r) => `<div class="tl-row"><div class="tl-dot"></div><div><div class="tl-type">${escapeHtml(r.replyType || 'Reply')} — ${escapeHtml(r.trackingId)} ${statusBadge(r.status)} <span class="tl-date">${fmtDate(r.replyDate || r.dateReceived)}</span></div><div class="tl-remarks">${escapeHtml(r.briefSummary || '')}</div></div></div>`).join('');
  return `<div class="form-section"><div class="form-section-title">Correspondence Chain (${replies.length} ${replies.length === 1 ? 'reply' : 'replies'})</div><div class="timeline">${rows}</div></div>`;
}
WBCYN_MODULES.inward.extraDetailHTML = (rec) => renderCorrespondenceChain('inward', rec.id);
WBCYN_MODULES.outward.extraDetailHTML = (rec) => renderCorrespondenceChain('outward', rec.id);
WBCYN_MODULES.files.extraDetailHTML = (rec) => renderCorrespondenceChain('file', rec.id);

/* ================= FOLLOW-UP CENTRE ================= */
WBCYN_MODULES.followups = {
  store: 'wbcynFollowUps', prefix: 'FUP', label: 'Follow-up Centre', singularLabel: 'Follow-up', icon: '⏰',
  titleField: 'remarks', statusField: 'status', dueField: 'nextFollowUpDate',
  closedStatuses: ['Completed'],
  filterableKeys: ['status', 'entityType', 'communicationMode'],
  searchFields: ['remarks', 'followUpBy', 'supportingReference'],
  sections: [
    { title: 'Follow-up Details', fields: [
      { key: 'entityType', label: 'Relates To', type: 'select', options: ['General', 'Assignment', 'Inward', 'Outward', 'HigherAuthorityFile'] },
      { key: 'entityId', label: 'Linked Record ID (auto-filled when opened from a record)', type: 'text' },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'time' },
      { key: 'followUpBy', label: 'Follow-up By', type: 'text' },
      { key: 'communicationMode', label: 'Communication Mode', type: 'select', options: FOLLOWUP_MODES, required: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea', required: true },
      { key: 'responseReceived', label: 'Response Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'nextFollowUpDate', label: 'Next Follow-up Date', type: 'date' },
      { key: 'nextFollowUpTime', label: 'Next Follow-up Time', type: 'time' },
      { key: 'supportingReference', label: 'Supporting Reference', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Completed'], required: true },
    ] },
  ],
  cardMeta: (rec) => [rec.followUpBy, rec.communicationMode, rec.entityType && rec.entityType !== 'General' ? 'Linked: ' + rec.entityType : ''],
  cardDetailsHTML: (rec) => `<p>${escapeHtml(rec.remarks || '')}</p>`,
  extraActions: (rec) => rec.status === 'Open' ? `<button class="btn sm" data-fupdone="${rec.id}">Mark Completed</button>` : '',
  beforeSave: (rec) => { rec.status = rec.status || 'Open'; rec.date = rec.date || todayISO(); },
  wireExtraHandlers: () => {
    document.querySelectorAll('[data-fupdone]').forEach((b) => b.addEventListener('click', () => {
      const rec = moduleById(WBCYN_MODULES.followups, b.dataset.fupdone);
      rec.status = 'Completed'; wSaveRecord('wbcynFollowUps', rec); renderWbcyn();
    }));
  },
  emptyHint: 'Log follow-up calls, WhatsApp messages, or visits made while chasing a pending matter.',
};
function renderFollowUpSection(){
  const openFups = wdb.wbcynFollowUps.filter((f) => !f.archived && f.status === 'Open');
  const overdue = openFups.filter((f) => f.nextFollowUpDate && daysUntil(f.nextFollowUpDate) < 0);
  const dueToday = openFups.filter((f) => f.nextFollowUpDate === todayISO());
  const assignmentFollowUps = wdb.wbcynAssignments.filter((a) => !a.archived && a.followUpRequired === 'Yes' && a.nextFollowUpDate && !['Verified', 'Closed', 'Cancelled'].includes(a.status));
  const staffOverdue = assignmentFollowUps.filter((a) => daysUntil(a.nextFollowUpDate) < 0);
  const staffToday = assignmentFollowUps.filter((a) => a.nextFollowUpDate === todayISO());
  const replyOverdue = wdb.wbcynReplies.filter((r) => !r.archived && r.actionDeadline && daysUntil(r.actionDeadline) < 0 && r.status !== 'Closed');
  const noFollowUpDate = wdb.wbcynInward.filter((i) => !i.archived && i.followUpRequired === 'Yes' && !i.nextActionDate && !['Closed', 'Filed', 'No Action Required'].includes(i.status));

  const cardsFor = (list, cfg) => list.map((r) => renderRecordCard(cfg, r)).join('') || '<div class="empty-note">None.</div>';
  return `
    <div class="section-title no-print">⏰ Follow-up Centre</div>
    <div class="toolbar no-print"><button class="btn" data-modadd="1">+ Add Follow-up</button></div>
    <div class="section-title">🔴 Staff Follow-ups Overdue (${staffOverdue.length})</div><div class="record-card-grid">${cardsFor(staffOverdue, WBCYN_MODULES.assignments)}</div>
    <div class="section-title">🟠 Staff Follow-ups Due Today (${staffToday.length})</div><div class="record-card-grid">${cardsFor(staffToday, WBCYN_MODULES.assignments)}</div>
    <div class="section-title">🔴 Overdue Follow-up Log Entries (${overdue.length})</div><div class="record-card-grid">${cardsFor(overdue, WBCYN_MODULES.followups)}</div>
    <div class="section-title">🟠 Follow-up Log Due Today (${dueToday.length})</div><div class="record-card-grid">${cardsFor(dueToday, WBCYN_MODULES.followups)}</div>
    <div class="section-title">✉️ Reply / Action Overdue (${replyOverdue.length})</div><div class="record-card-grid">${cardsFor(replyOverdue, WBCYN_MODULES.replies)}</div>
    <div class="section-title">⚠️ Inward Matters With No Follow-up Date Set (${noFollowUpDate.length})</div><div class="record-card-grid">${cardsFor(noFollowUpDate, WBCYN_MODULES.inward)}</div>
  `;
}
SECTION_HANDLERS.followups = () => {
  const addBtn = document.querySelector('[data-modadd]');
  if (addBtn) addBtn.addEventListener('click', () => openModuleForm(WBCYN_MODULES.followups));
  wireModuleHandlers(WBCYN_MODULES.followups);
  wireModuleHandlers(WBCYN_MODULES.assignments);
  wireModuleHandlers(WBCYN_MODULES.replies);
  wireModuleHandlers(WBCYN_MODULES.inward);
};

/* ================= REMINDER DRAFT GENERATOR ================= */
// Always opens editable and requires an explicit "Open WhatsApp / Copy /
// Print" action — nothing here is ever sent or dispatched automatically.
function reminderDraftText(kind, draftType, ctx){
  const days = ctx.daysPending !== null ? `${ctx.daysPending} day${ctx.daysPending === 1 ? '' : 's'}` : 'an extended period';
  return `To,\n${ctx.addressee || 'The Authority Concerned'}\n${ctx.department || ''}\n\nSubject: ${draftType} — ${ctx.subject || ''}\n\nReference: ${ctx.refNumber || ''} dated ${ctx.refDate ? fmtDate(ctx.refDate) : '—'}\nWBCYN File/Tracking: ${ctx.trackingId || ''}\n\nSir/Madam,\n\nWith reference to the above, kindly recall that the matter regarding "${ctx.subject || ''}" was submitted on ${ctx.sentDate ? fmtDate(ctx.sentDate) : '—'} and has been pending for ${days}. ${ctx.previousFollowUps ? 'Previous follow-up(s) were made on: ' + ctx.previousFollowUps + '.' : ''}\n\nIt is respectfully requested that the ${ctx.actionAwaited || 'necessary action / decision / reply'} may kindly be expedited at the earliest.\n\nThanking you,\n\nYours faithfully,\n${wdb.settings.registrarName || 'Dr. M. Jahangir'}\nRegistrar, ${wdb.settings.officeName || 'WBCYN'}`;
}
function openReminderDraftGenerator(target){
  let rec, ctx;
  if (target.type === 'outward') {
    rec = moduleById(WBCYN_MODULES.outward, target.id);
    ctx = { addressee: rec.addresseeName, department: rec.addresseeDepartment, subject: rec.subject, refNumber: rec.memoNumber, refDate: rec.letterDate, trackingId: rec.trackingId, sentDate: rec.dispatchDate, daysPending: rec.dispatchDate ? Math.abs(daysBetweenISO(todayISO(), rec.dispatchDate)) : null, actionAwaited: rec.actionRequested };
  } else {
    rec = moduleById(WBCYN_MODULES.files, target.id);
    ctx = { addressee: rec.addressee, department: rec.department, subject: rec.subject || rec.fileTitle, refNumber: rec.fileNumber, refDate: rec.dateFileSent, trackingId: rec.trackingId, sentDate: rec.dateFileSent, daysPending: rec.dateFileSent ? Math.abs(daysBetweenISO(todayISO(), rec.dateFileSent)) : null, actionAwaited: rec.actionRequested };
  }
  const typeOptions = REMINDER_DRAFT_TYPES.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  openModal('📝 Reminder Draft Generator', `
    <div class="form-field full"><label>Draft Type</label><select id="reminderDraftType">${typeOptions}</select></div>
    <div class="form-field full"><label>Draft Text (editable)</label><textarea id="reminderDraftText" style="height:260px;">${escapeHtml(reminderDraftText(target.type, REMINDER_DRAFT_TYPES[0], ctx))}</textarea></div>
  `, `<button class="btn grey" id="rdgClose">Close</button><button class="btn secondary" id="rdgCopy">Copy Text</button><button class="btn secondary" id="rdgPrint">Print</button><button class="btn" id="rdgSave">Save as Draft (Follow-up Log)</button>`);
  document.getElementById('reminderDraftType').addEventListener('change', (e) => {
    document.getElementById('reminderDraftText').value = reminderDraftText(target.type, e.target.value, ctx);
  });
  document.getElementById('rdgClose').onclick = closeModal;
  document.getElementById('rdgCopy').onclick = () => { navigator.clipboard.writeText(document.getElementById('reminderDraftText').value).then(() => alert('Draft copied to clipboard.')).catch(() => alert('Could not access clipboard — select and copy the text manually.')); };
  document.getElementById('rdgPrint').onclick = () => { const w = window.open('', '_blank'); w.document.write('<pre style="font-family:inherit;white-space:pre-wrap;padding:24px;">' + escapeHtml(document.getElementById('reminderDraftText').value) + '</pre>'); w.document.close(); w.print(); };
  document.getElementById('rdgSave').onclick = () => {
    wSaveRecord('wbcynFollowUps', { id: genUUID(), trackingId: nextTrackingId('FUP'), createdAt: new Date().toISOString(), entityType: target.type === 'outward' ? 'Outward' : 'HigherAuthorityFile', entityId: rec.id, date: todayISO(), time: nowTimeHM(), followUpBy: wdb.settings.registrarName || 'Registrar', communicationMode: 'Written Reminder', remarks: document.getElementById('reminderDraftText').value, status: 'Open', nextFollowUpDate: '' });
    if (target.type === 'outward') { rec.numReminders = (Number(rec.numReminders) || 0) + 1; rec.lastReminderDate = todayISO(); wSaveRecord('wbcynOutward', rec); }
    else { rec.numRemindersSent = (Number(rec.numRemindersSent) || 0) + 1; rec.lastFollowUpDate = todayISO(); wSaveRecord('wbcynHigherAuthorityFiles', rec); }
    closeModal(); renderWbcyn();
    alert('Reminder draft saved to the Follow-up Centre. It has not been sent — dispatch it manually through your usual channel.');
  };
}

/* ================= LEGAL & COURT MATTERS ================= */
WBCYN_MODULES.legal = {
  store: 'wbcynLegalMatters', prefix: 'LEGAL', label: 'Legal & Court Matters', singularLabel: 'Legal Matter', icon: '⚖️',
  titleField: 'caseNumber', statusField: 'status', dueField: 'nextHearingDate',
  closedStatuses: ['Disposed', 'Closed'],
  filterableKeys: ['status', 'caseType'],
  searchFields: ['caseNumber', 'court', 'petitioner', 'respondents', 'subject'],
  sections: [
    { title: 'Case Details', fields: [
      { key: 'caseNumber', label: 'Case Number', type: 'text', required: true },
      { key: 'court', label: 'Court', type: 'text' },
      { key: 'caseType', label: 'Case Type', type: 'select', options: LEGAL_CASE_TYPES },
      { key: 'petitioner', label: 'Petitioner', type: 'text' },
      { key: 'respondents', label: 'Respondents', type: 'text' },
      { key: 'advocate', label: 'Advocate', type: 'text' },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'relatedFileNumber', label: 'Related WBCYN File Number', type: 'text' },
    ] },
    { title: 'Dates and Orders', fields: [
      { key: 'dateFiled', label: 'Date Filed', type: 'date' },
      { key: 'nextHearingDate', label: 'Next Hearing Date', type: 'date' },
      { key: 'orderDate', label: 'Order Date', type: 'date' },
      { key: 'briefOrderSummary', label: 'Brief Order Summary', type: 'textarea' },
      { key: 'complianceRequired', label: 'Compliance Required', type: 'select', options: ['Yes', 'No'] },
      { key: 'complianceDeadline', label: 'Compliance Deadline', type: 'date' },
      { key: 'staffAssignedId', label: 'Staff Assigned', type: 'select', options: staffOptions, staffRef: true },
      { key: 'documentsRequired', label: 'Documents Required', type: 'textarea' },
      { key: 'status', label: 'Current Status', type: 'select', options: LEGAL_STATUSES, required: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
      { key: 'attachmentReference', label: 'Attachment Reference', type: 'text' },
    ] },
  ],
  cardMeta: (rec) => [rec.court, rec.caseType, rec.nextHearingDate ? 'Hearing ' + fmtDate(rec.nextHearingDate) : '', rec.staffAssignedId ? staffName(rec.staffAssignedId) : ''],
  cardDetailsHTML: (rec) => `<p>${escapeHtml(rec.briefOrderSummary || '')}</p>${rec.complianceRequired === 'Yes' ? `<p style="color:var(--red);font-size:12.5px;">Compliance required by ${fmtDate(rec.complianceDeadline)}</p>` : ''}`,
  emptyHint: 'Track a writ petition, service matter, or other court/legal matter.',
};
function renderLegalSection(){ return renderModuleCardList(WBCYN_MODULES.legal); }

/* ================= RTI REGISTER ================= */
WBCYN_MODULES.rti = {
  store: 'wbcynRTI', prefix: 'RTI', label: 'RTI Register', singularLabel: 'RTI Application', icon: '📄',
  titleField: 'subject', statusField: 'status', dueField: 'replyDeadline',
  closedStatuses: ['Replied', 'Disposed', 'Rejected', 'Transferred'],
  filterableKeys: ['status'],
  searchFields: ['applicationNumber', 'applicantName', 'subject'],
  sections: [
    { title: 'Application Details', fields: [
      { key: 'applicationNumber', label: 'Application Number', type: 'text' },
      { key: 'dateReceived', label: 'Date Received', type: 'date', required: true },
      { key: 'applicantName', label: 'Applicant Name', type: 'text', required: true },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'informationRequested', label: 'Information Requested', type: 'textarea' },
      { key: 'pioStaffId', label: 'PIO or Responsible Officer', type: 'select', options: staffOptions, staffRef: true },
    ] },
    { title: 'Deadlines and Reply', fields: [
      { key: 'replyDeadline', label: 'Reply Deadline', type: 'date' },
      { key: 'extensionDate', label: 'Extension, if any', type: 'date' },
      { key: 'thirdPartyConsultation', label: 'Third-party Consultation', type: 'select', options: ['Yes', 'No'] },
      { key: 'replyDate', label: 'Reply Date', type: 'date' },
      { key: 'dispatchDetails', label: 'Dispatch Details', type: 'text' },
      { key: 'appealReceived', label: 'Appeal Received', type: 'select', options: ['Yes', 'No'] },
      { key: 'appealDate', label: 'Appeal Date', type: 'date' },
      { key: 'appellateAuthority', label: 'Appellate Authority', type: 'text' },
      { key: 'status', label: 'Current Status', type: 'select', options: RTI_STATUSES, required: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
      { key: 'attachmentReference', label: 'Attachment Reference', type: 'text' },
    ] },
  ],
  cardMeta: (rec) => [rec.applicantName, rec.applicationNumber, rec.replyDeadline ? 'Reply due ' + fmtDate(rec.replyDeadline) : '', rec.pioStaffId ? staffName(rec.pioStaffId) : ''],
  cardDetailsHTML: (rec) => `<p>${escapeHtml(rec.informationRequested || '')}</p>`,
  emptyHint: 'Log an RTI application and track its statutory reply deadline.',
};
function renderRTISection(){ return renderModuleCardList(WBCYN_MODULES.rti); }

/* ================= MEETINGS & RESOLUTIONS ================= */
WBCYN_MODULES.meetings = {
  store: 'wbcynMeetings', prefix: 'MTG', label: 'Meetings & Resolutions', singularLabel: 'Meeting', icon: '🗓️',
  titleField: 'meetingTitle', statusField: 'status', dueField: 'followUpDate',
  closedStatuses: ['Closed', 'Cancelled'],
  filterableKeys: ['status', 'meetingType'],
  searchFields: ['meetingTitle', 'venue', 'chairperson', 'agendaItems'],
  sections: [
    { title: 'Meeting Details', fields: [
      { key: 'meetingTitle', label: 'Meeting Title', type: 'text', required: true },
      { key: 'meetingType', label: 'Meeting Type', type: 'select', options: MEETING_TYPES },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'time' },
      { key: 'venue', label: 'Venue', type: 'text' },
      { key: 'chairperson', label: 'Chairperson', type: 'text' },
      { key: 'participants', label: 'Participants', type: 'textarea' },
      { key: 'agendaItems', label: 'Agenda Items', type: 'textarea' },
      { key: 'documents', label: 'Documents', type: 'text' },
    ] },
    { title: 'Resolutions, Actions and Follow-up', fields: [
      { key: 'resolutionsSummary', label: 'Resolutions', type: 'textarea' },
      { key: 'actionPointsSummary', label: 'Action Points', type: 'textarea' },
      { key: 'staffAssignedId', label: 'Staff Assigned', type: 'select', options: staffOptions, staffRef: true },
      { key: 'deadline', label: 'Deadline', type: 'date' },
      { key: 'followUpDate', label: 'Follow-up Date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: MEETING_STATUSES, required: true },
    ] },
  ],
  cardMeta: (rec) => [rec.meetingType, fmtDate(rec.date), rec.venue, rec.chairperson],
  cardDetailsHTML: (rec) => `<p>${escapeHtml(rec.resolutionsSummary || '')}</p>`,
  extraActions: (rec) => `<button class="btn sm" data-addresolution="${rec.id}">+ Add Resolution / Action Point</button>`,
  extraDetailHTML: (rec) => renderMeetingResolutionsHTML(rec),
  wireExtraHandlers: () => {
    document.querySelectorAll('[data-addresolution]').forEach((b) => b.addEventListener('click', () => openModuleForm(WBCYN_MODULES.resolutions, null, { meetingId: b.dataset.addresolution })));
  },
  emptyHint: 'Record a Governing Council or committee meeting, its agenda and resolutions.',
};
function renderMeetingsSection(){ return renderModuleCardList(WBCYN_MODULES.meetings); }

WBCYN_MODULES.resolutions = {
  store: 'wbcynResolutions', prefix: 'RES', label: 'Resolutions', singularLabel: 'Resolution / Action Point', icon: '📌',
  titleField: 'resolutionText', statusField: 'status', dueField: 'deadline',
  closedStatuses: ['Completed', 'Closed'],
  filterableKeys: ['status'],
  searchFields: ['resolutionText'],
  sections: [
    { title: 'Resolution / Action Point', fields: [
      { key: 'meetingId', label: 'Meeting', type: 'select', options: () => wdb.wbcynMeetings.map((r) => ({ value: r.id, label: r.trackingId + ' — ' + (r.meetingTitle || '') })), required: true },
      { key: 'resolutionText', label: 'Resolution / Action Point', type: 'textarea', required: true },
      { key: 'staffAssignedId', label: 'Staff Assigned', type: 'select', options: staffOptions, staffRef: true },
      { key: 'deadline', label: 'Deadline', type: 'date' },
      { key: 'followUpDate', label: 'Follow-up Date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: RESOLUTION_STATUSES, required: true },
    ] },
  ],
  beforeSave: (rec) => { rec.status = rec.status || 'Open'; },
  emptyHint: 'Add resolutions from the Meetings screen.',
};
function renderMeetingResolutionsHTML(meeting){
  const items = wdb.wbcynResolutions.filter((r) => r.meetingId === meeting.id && !r.archived);
  if (!items.length) return '';
  const rows = items.map((r) => {
    const links = [];
    links.push(r.convertedAssignmentId ? `<span class="badge badge-green">Assignment Linked</span>` : `<button class="btn sm" data-res2asg="${r.id}">→ Assignment</button>`);
    links.push(r.convertedOutwardId ? `<span class="badge badge-green">Outward Linked</span>` : `<button class="btn sm" data-res2out="${r.id}">→ Outward Letter</button>`);
    links.push(r.convertedFileId ? `<span class="badge badge-green">File Linked</span>` : `<button class="btn sm" data-res2file="${r.id}">→ Higher Authority File</button>`);
    return `<div class="tl-row"><div class="tl-dot"></div><div><div class="tl-type">${escapeHtml(r.resolutionText)} ${statusBadge(r.status)}</div><div class="tl-remarks">${r.staffAssignedId ? staffName(r.staffAssignedId) + ' · ' : ''}${r.deadline ? 'Deadline ' + fmtDate(r.deadline) : ''}</div><div class="tl-remarks">${links.join(' ')}</div></div></div>`;
  }).join('');
  return `<div class="form-section"><div class="form-section-title">Resolutions &amp; Action Points</div><div class="timeline">${rows}</div></div>`;
}
SECTION_HANDLERS.meetings = () => {
  wireModuleHandlers(WBCYN_MODULES.meetings);
  document.querySelectorAll('[data-res2asg]').forEach((b) => b.addEventListener('click', () => convertResolution(b.dataset.res2asg, 'assignment')));
  document.querySelectorAll('[data-res2out]').forEach((b) => b.addEventListener('click', () => convertResolution(b.dataset.res2out, 'outward')));
  document.querySelectorAll('[data-res2file]').forEach((b) => b.addEventListener('click', () => convertResolution(b.dataset.res2file, 'file')));
};
// "Convertible" per spec means linked-by-ID, never a duplicated copy of the
// resolution text — the resolution record keeps a pointer (convertedXId) to
// whatever was created, and re-clicking simply opens that same linked record.
function convertResolution(resId, kind){
  const r = wdb.wbcynResolutions.find((x) => x.id === resId);
  if (!r) return;
  const meeting = wdb.wbcynMeetings.find((m) => m.id === r.meetingId);
  if (kind === 'assignment') {
    if (r.convertedAssignmentId) { openModuleDetail(WBCYN_MODULES.assignments, r.convertedAssignmentId); return; }
    openModuleForm(WBCYN_MODULES.assignments, null, { title: r.resolutionText.slice(0, 80), instructions: r.resolutionText, assignedToStaffId: r.staffAssignedId || '', deadlineDate: r.deadline || '', relatedMeetingId: r.meetingId, category: 'Meeting' });
  } else if (kind === 'outward') {
    if (r.convertedOutwardId) { openModuleDetail(WBCYN_MODULES.outward, r.convertedOutwardId); return; }
    openModuleForm(WBCYN_MODULES.outward, null, { subject: r.resolutionText.slice(0, 80), purpose: r.resolutionText, relatedMeetingId: r.meetingId, letterDate: todayISO() });
  } else if (kind === 'file') {
    if (r.convertedFileId) { openModuleDetail(WBCYN_MODULES.files, r.convertedFileId); return; }
    openModuleForm(WBCYN_MODULES.files, null, { fileTitle: r.resolutionText.slice(0, 80), briefBackground: r.resolutionText, relatedMeetingId: r.meetingId });
  }
}

/* ================= PENDING ACTION CENTRE ================= */
function renderPendingActionSection(){
  const f = wstate.filters;
  const staffFilter = f.staff || '';
  const priorityFilter = f.priority || '';
  const applies = (rec) => (!staffFilter || rec.assignedToStaffId === staffFilter || rec.markedToStaffId === staffFilter || rec.responsibleStaffId === staffFilter || rec.actionAssignedToStaffId === staffFilter || rec.staffAssignedId === staffFilter) && (!priorityFilter || rec.priority === priorityFilter || rec.actionPriority === priorityFilter);

  const groups = [
    { label: 'Inward Letters Not Reviewed', cfg: WBCYN_MODULES.inward, list: wdb.wbcynInward.filter((r) => !r.archived && r.status === 'Received' && applies(r)) },
    { label: 'Letter Draft Pending', cfg: WBCYN_MODULES.outward, list: wdb.wbcynOutward.filter((r) => !r.archived && r.status === 'Draft' && applies(r)) },
    { label: 'Approved but Not Signed', cfg: WBCYN_MODULES.outward, list: wdb.wbcynOutward.filter((r) => !r.archived && r.status === 'Approved' && applies(r)) },
    { label: 'Signed but Not Dispatched', cfg: WBCYN_MODULES.outward, list: wdb.wbcynOutward.filter((r) => !r.archived && r.status === 'Signed' && applies(r)) },
    { label: 'Files Ready but Not Submitted', cfg: WBCYN_MODULES.files, list: wdb.wbcynHigherAuthorityFiles.filter((r) => !r.archived && r.status === 'Ready for Submission' && applies(r)) },
    { label: 'Replies Received but Not Reviewed', cfg: WBCYN_MODULES.replies, list: wdb.wbcynReplies.filter((r) => !r.archived && r.status === 'Received' && applies(r)) },
    { label: 'Clarification Requested (Files)', cfg: WBCYN_MODULES.files, list: wdb.wbcynHigherAuthorityFiles.filter((r) => !r.archived && r.status === 'Clarification Sought' && applies(r)) },
    { label: 'Further Documents Required (Files)', cfg: WBCYN_MODULES.files, list: wdb.wbcynHigherAuthorityFiles.filter((r) => !r.archived && r.status === 'Further Documents Required' && applies(r)) },
    { label: 'Staff Work Pending', cfg: WBCYN_MODULES.assignments, list: wdb.wbcynAssignments.filter((r) => !r.archived && ['Assigned', 'Acknowledged', 'In Progress'].includes(r.status) && applies(r)) },
    { label: 'Work Submitted for Registrar Verification', cfg: WBCYN_MODULES.assignments, list: wdb.wbcynAssignments.filter((r) => !r.archived && r.status === 'Submitted for Verification' && applies(r)) },
    { label: 'Revision Required', cfg: WBCYN_MODULES.assignments, list: wdb.wbcynAssignments.filter((r) => !r.archived && r.status === 'Revision Required' && applies(r)) },
    { label: 'Reminder Draft Pending (Outward Reminder Due)', cfg: WBCYN_MODULES.outward, list: wdb.wbcynOutward.filter((r) => !r.archived && r.status === 'Reminder Due' && applies(r)) },
    { label: 'Reminder Draft Pending (Files Reminder Due)', cfg: WBCYN_MODULES.files, list: wdb.wbcynHigherAuthorityFiles.filter((r) => !r.archived && r.status === 'Reminder Due' && applies(r)) },
    { label: 'Returned File Awaiting Compliance', cfg: WBCYN_MODULES.files, list: wdb.wbcynHigherAuthorityFiles.filter((r) => !r.archived && r.status === 'Returned' && applies(r)) },
    { label: 'Court Deadline Pending (7 days)', cfg: WBCYN_MODULES.legal, list: wdb.wbcynLegalMatters.filter((r) => !r.archived && r.nextHearingDate && daysUntil(r.nextHearingDate) !== null && daysUntil(r.nextHearingDate) <= 7 && daysUntil(r.nextHearingDate) >= 0 && applies(r)) },
    { label: 'RTI Deadline Pending (7 days)', cfg: WBCYN_MODULES.rti, list: wdb.wbcynRTI.filter((r) => !r.archived && r.replyDeadline && daysUntil(r.replyDeadline) !== null && daysUntil(r.replyDeadline) <= 7 && daysUntil(r.replyDeadline) >= 0 && !['Replied', 'Disposed'].includes(r.status) && applies(r)) },
  ];
  const nonEmpty = groups.filter((g) => g.list.length);
  const body = nonEmpty.map((g) => `<div class="section-title">${escapeHtml(g.label)} (${g.list.length})</div><div class="record-card-grid">${g.list.map((r) => renderRecordCard(g.cfg, r)).join('')}</div>`).join('') || '<div class="empty-note">Nothing pending across any category right now.</div>';
  return `
    <div class="section-title no-print">⚠️ Pending Action Centre</div>
    <div class="toolbar no-print">
      <select data-pafilter="staff"><option value="">All Staff</option>${activeStaff().map((s) => `<option value="${s.id}" ${staffFilter === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>
      <select data-pafilter="priority"><option value="">All Priorities</option>${PRIORITIES.map((p) => `<option ${priorityFilter === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    </div>
    ${body}
  `;
}
SECTION_HANDLERS.pending = () => {
  document.querySelectorAll('[data-pafilter]').forEach((sel) => sel.addEventListener('change', (e) => { wstate.filters[e.target.dataset.pafilter] = e.target.value; renderWbcyn(); }));
  // Cards from every entity type can appear here — wire each module's own
  // handlers (view/edit/archive/export/extra actions). wireModuleHandlers
  // is safe to call repeatedly: it only matches elements actually present.
  ['inward', 'outward', 'files', 'replies', 'assignments', 'legal', 'rti'].forEach((k) => wireModuleHandlers(WBCYN_MODULES[k]));
};

/* ================= REGISTRAR CONTROL DASHBOARD ================= */
function dashCard(label, num, icon, section, filters){
  return `<button class="card dash-card" data-goto="${section}" data-filters='${escapeHtml(JSON.stringify(filters || {}))}'><span class="icon">${icon}</span><span class="num">${num}</span><span class="lbl">${escapeHtml(label)}</span></button>`;
}
function purposePending(purposeLabel, receivedField){
  return wdb.wbcynHigherAuthorityFiles.filter((f) => !f.archived && (f.purpose || []).includes(purposeLabel) && f[receivedField] !== 'Yes' && !WBCYN_MODULES.files.closedStatuses.includes(f.status)).length;
}
function renderRegistrarDashboard(){
  const inward = wdb.wbcynInward.filter((r) => !r.archived);
  const outward = wdb.wbcynOutward.filter((r) => !r.archived);
  const files = wdb.wbcynHigherAuthorityFiles.filter((r) => !r.archived);
  const asg = wdb.wbcynAssignments.filter((r) => !r.archived);
  const replies = wdb.wbcynReplies.filter((r) => !r.archived);
  const today = todayISO();
  const notClosed = (r, cfg) => !cfg.closedStatuses.includes(r.status);

  const inwardCards = [
    dashCard('Inward Received Today', inward.filter((r) => r.dateReceived === today).length, '📥', 'inward', { dateReceived: today }),
    dashCard('Inward Received This Week', inward.filter((r) => { const d = daysUntil(r.dateReceived); return d !== null && d >= -7 && d <= 0; }).length, '📥', 'inward', {}),
    dashCard('Unreviewed Inward Letters', inward.filter((r) => r.status === 'Received').length, '👀', 'inward', { status: 'Received' }),
    dashCard('Inward Matters Requiring Action', inward.filter((r) => ['Under Review', 'Marked to Staff', 'Action in Progress', 'Awaiting Information'].includes(r.status)).length, '⚡', 'inward', {}),
    dashCard('Replies Requiring Assignment', replies.filter((r) => r.status === 'Received' && !r.actionAssignedToStaffId).length, '↩️', 'replies', { status: 'Received' }),
    dashCard('Urgent Inward Matters', inward.filter((r) => ['Critical', 'Urgent'].includes(r.priority) && notClosed(r, WBCYN_MODULES.inward)).length, '🔴', 'inward', { priority: 'Urgent' }),
  ];
  const outwardCards = [
    dashCard('Draft Letters', outward.filter((r) => r.status === 'Draft').length, '📝', 'outward', { status: 'Draft' }),
    dashCard('Approved but Not Signed', outward.filter((r) => r.status === 'Approved').length, '✅', 'outward', { status: 'Approved' }),
    dashCard('Signed but Not Dispatched', outward.filter((r) => r.status === 'Signed').length, '✍️', 'outward', { status: 'Signed' }),
    dashCard('Dispatched Today', outward.filter((r) => r.dispatchDate === today).length, '📤', 'outward', {}),
    dashCard('Awaiting Delivery', outward.filter((r) => ['Dispatched', 'In Transit'].includes(r.status)).length, '🚚', 'outward', {}),
    dashCard('Awaiting Acknowledgement', outward.filter((r) => r.ackRequired === 'Yes' && r.ackReceived !== 'Yes').length, '📨', 'outward', {}),
    dashCard('Awaiting Reply', outward.filter((r) => r.status === 'Awaiting Reply').length, '⏳', 'outward', { status: 'Awaiting Reply' }),
    dashCard('Reply Overdue', outward.filter((r) => r.status === 'Reply Overdue' || (r.expectedReplyDate && daysUntil(r.expectedReplyDate) < 0 && !r.closureDate)).length, '🔴', 'outward', { __due: 'overdue' }),
    dashCard('Reminder Due', outward.filter((r) => r.status === 'Reminder Due' || (r.followUpRequired === 'Yes' && r.nextFollowUpDate && daysUntil(r.nextFollowUpDate) <= 0)).length, '🔔', 'outward', {}),
  ];
  const fileCards = [
    dashCard('Files Under Preparation', files.filter((r) => r.status === 'Under Preparation').length, '🗂️', 'files', { status: 'Under Preparation' }),
    dashCard('Files Ready for Submission', files.filter((r) => r.status === 'Ready for Submission').length, '📦', 'files', { status: 'Ready for Submission' }),
    dashCard('Files Sent to Higher Authority', files.filter((r) => r.dateFileSent).length, '📮', 'files', {}),
    dashCard('Awaiting Decision', files.filter((r) => r.status === 'Awaiting Decision').length, '⏳', 'files', { status: 'Awaiting Decision' }),
    dashCard('Awaiting Approval', purposePending('Administrative Approval', 'approvalReceived'), '✅', 'files', {}),
    dashCard('Awaiting Sanction', purposePending('Financial Sanction', 'sanctionReceived'), '💰', 'files', {}),
    dashCard('Awaiting Clarification', files.filter((r) => r.status === 'Clarification Sought').length, '❓', 'files', { status: 'Clarification Sought' }),
    dashCard('Finance Concurrence Pending', purposePending('Finance Concurrence', 'financeConcurrenceReceived'), '💵', 'files', {}),
    dashCard('Legal Opinion Pending', purposePending('Legal Opinion', 'legalOpinionReceived'), '⚖️', 'files', {}),
    dashCard('Long-pending Files (30+ days)', files.filter((r) => r.dateFileSent && daysUntil(r.dateFileSent) <= -30 && notClosed(r, WBCYN_MODULES.files)).length, '🕰️', 'files', {}),
    dashCard('Returned for Compliance', files.filter((r) => r.status === 'Returned').length, '↩️', 'files', { status: 'Returned' }),
  ];
  const asgCards = [
    dashCard('Assigned Today', asg.filter((r) => r.dateAssigned === today).length, '🆕', 'assignments', {}),
    dashCard('Due Today', asg.filter((r) => r.deadlineDate === today && notClosed(r, WBCYN_MODULES.assignments)).length, '📅', 'assignments', { __due: 'today' }),
    dashCard('Due Tomorrow', asg.filter((r) => daysUntil(r.deadlineDate) === 1).length, '📅', 'assignments', { __due: 'tomorrow' }),
    dashCard('Due This Week', asg.filter((r) => { const d = daysUntil(r.deadlineDate); return d !== null && d >= 0 && d <= 7; }).length, '📆', 'assignments', { __due: 'week' }),
    dashCard('In Progress', asg.filter((r) => r.status === 'In Progress').length, '🔄', 'assignments', { status: 'In Progress' }),
    dashCard('Awaiting Information', asg.filter((r) => r.status === 'Awaiting Information').length, '❓', 'assignments', { status: 'Awaiting Information' }),
    dashCard('Awaiting Registrar Verification', asg.filter((r) => r.status === 'Submitted for Verification').length, '🔍', 'assignments', { status: 'Submitted for Verification' }),
    dashCard('Revision Required', asg.filter((r) => r.status === 'Revision Required').length, '✏️', 'assignments', { status: 'Revision Required' }),
    dashCard('Overdue', asg.filter((r) => isAssignmentOverdueW(r)).length, '🔴', 'assignments', { __due: 'overdue' }),
    dashCard('Critical Pending', asg.filter((r) => r.priority === 'Critical' && notClosed(r, WBCYN_MODULES.assignments)).length, '🔥', 'assignments', { priority: 'Critical' }),
    dashCard('Completed Today', asg.filter((r) => r.finalClosureDate === today || r.verificationDate === today).length, '✅', 'assignments', {}),
  ];
  const followCards = [
    dashCard('Follow-ups Due Today', wdb.wbcynFollowUps.filter((f) => !f.archived && f.status === 'Open' && f.nextFollowUpDate === today).length + asg.filter((r) => r.nextFollowUpDate === today).length, '⏰', 'followups', {}),
    dashCard('Overdue Follow-ups', wdb.wbcynFollowUps.filter((f) => !f.archived && f.status === 'Open' && f.nextFollowUpDate && daysUntil(f.nextFollowUpDate) < 0).length + asg.filter((r) => r.nextFollowUpDate && daysUntil(r.nextFollowUpDate) < 0).length, '🔴', 'followups', {}),
    dashCard('Reminders to Prepare', outward.filter((r) => r.status === 'Reminder Due').length + files.filter((r) => r.status === 'Reminder Due').length, '🔔', 'pending', {}),
    dashCard('Replies Received but Not Reviewed', replies.filter((r) => r.status === 'Received').length, '↩️', 'replies', { status: 'Received' }),
    dashCard('Decisions Received but Action Pending', files.filter((r) => ['approvalReceived', 'sanctionReceived', 'clarificationReceived'].some((k) => r[k] === 'Yes') && notClosed(r, WBCYN_MODULES.files)).length, '📋', 'files', {}),
    dashCard('Compliance Deadlines', wdb.wbcynLegalMatters.filter((r) => !r.archived && r.complianceRequired === 'Yes' && r.status !== 'Compliance Completed').length, '📜', 'legal', {}),
    dashCard('Court Deadlines (7 days)', wdb.wbcynLegalMatters.filter((r) => !r.archived && r.nextHearingDate && daysUntil(r.nextHearingDate) >= 0 && daysUntil(r.nextHearingDate) <= 7).length, '⚖️', 'legal', { __due: 'week' }),
    dashCard('RTI Deadlines (7 days)', wdb.wbcynRTI.filter((r) => !r.archived && r.replyDeadline && daysUntil(r.replyDeadline) >= 0 && daysUntil(r.replyDeadline) <= 7).length, '📄', 'rti', { __due: 'week' }),
  ];

  const section = (title, cards) => `<div class="section-title">${title}</div><div class="cards-grid">${cards.join('')}</div>`;
  return `
    <div class="section-title no-print">📊 Registrar Control Dashboard</div>
    ${section('📥 Inward Communication', inwardCards)}
    ${section('📤 Outward Communication', outwardCards)}
    ${section('🗂️ Higher Authority Files', fileCards)}
    ${section('📝 Staff Assignments', asgCards)}
    ${section('⏰ Follow-up and Action', followCards)}
  `;
}

/* ================= UNIVERSAL WBCYN SEARCH ================= */
function performUniversalSearch(q){
  const s = (q || '').toLowerCase().trim();
  if (!s) return [];
  const results = [];
  const pushAll = (arr, cfg, type, fields) => (arr || []).forEach((r) => {
    if (r.archived) return;
    const hay = fields.map((f) => r[f]).concat([r.trackingId]).join(' ').toLowerCase();
    if (hay.includes(s)) results.push({ type, cfg, rec: r });
  });
  pushAll(wdb.wbcynInward, WBCYN_MODULES.inward, 'Inward', ['subject', 'senderName', 'diaryNumber', 'senderMemoNumber', 'senderOrganisation']);
  pushAll(wdb.wbcynOutward, WBCYN_MODULES.outward, 'Outward', ['subject', 'memoNumber', 'addresseeName', 'addresseeDepartment']);
  pushAll(wdb.wbcynHigherAuthorityFiles, WBCYN_MODULES.files, 'File', ['fileTitle', 'fileNumber', 'subject', 'addressee']);
  pushAll(wdb.wbcynAssignments, WBCYN_MODULES.assignments, 'Assignment', ['title', 'instructions']);
  pushAll(wdb.wbcynReplies, WBCYN_MODULES.replies, 'Reply', ['subject', 'replyMemoNumber', 'senderName']);
  pushAll(wdb.wbcynFollowUps, WBCYN_MODULES.followups, 'Follow-up', ['remarks', 'supportingReference']);
  pushAll(wdb.wbcynLegalMatters, WBCYN_MODULES.legal, 'Legal Matter', ['caseNumber', 'court', 'petitioner', 'subject']);
  pushAll(wdb.wbcynRTI, WBCYN_MODULES.rti, 'RTI', ['applicationNumber', 'applicantName', 'subject']);
  pushAll(wdb.wbcynMeetings, WBCYN_MODULES.meetings, 'Meeting', ['meetingTitle', 'venue', 'chairperson']);
  pushAll(wdb.wbcynStaff, WBCYN_MODULES.staff, 'Staff Record', ['name', 'designation', 'department']);
  return results;
}
function openUniversalSearch(){
  openModal('🔍 Universal WBCYN Search', `
    <div class="form-field full"><label>Search Inward, Outward, Files, Assignments, Replies, Follow-ups, Legal, RTI, Meetings, Staff</label><input type="text" id="uniSearchBox" placeholder="Type a name, subject, memo number, tracking ID..."></div>
    <div id="uniSearchResults"></div>
  `, `<button class="btn grey" id="uniSearchClose">Close</button>`);
  document.getElementById('uniSearchClose').onclick = closeModal;
  const box = document.getElementById('uniSearchBox');
  box.addEventListener('input', () => {
    const results = performUniversalSearch(box.value);
    const resultsEl = document.getElementById('uniSearchResults');
    resultsEl.innerHTML = results.length
      ? results.slice(0, 50).map((r) => `<div class="search-result-row" data-searchgo="${r.cfg.store}|${r.rec.id}"><span class="badge badge-grey">${escapeHtml(r.type)}</span> <b>${escapeHtml(r.rec.trackingId || '')}</b> — ${escapeHtml(r.rec[r.cfg.titleField] || '')}</div>`).join('')
      : (box.value ? '<div class="empty-note">No matches.</div>' : '');
    resultsEl.querySelectorAll('[data-searchgo]').forEach((el) => el.addEventListener('click', () => {
      const [store, id] = el.dataset.searchgo.split('|');
      const cfg = Object.values(WBCYN_MODULES).find((c) => c.store === store);
      closeModal();
      if (cfg) openModuleDetail(cfg, id);
    }));
  });
  box.focus();
}

/* ================= REPORTS ================= */
function assignmentWasLateW(a){ const d = assignmentCompletionDateW(a); return !!(d && a.deadlineDate && d > a.deadlineDate); }
const REPORTS_CATALOG = {
  'Inward Reports': [
    { label: 'Inward Register (All)', cfg: () => WBCYN_MODULES.inward, filter: () => true },
    { label: 'Unreviewed Inward Communications', cfg: () => WBCYN_MODULES.inward, filter: (r) => r.status === 'Received' },
    { label: 'Action Pending on Inward Letters', cfg: () => WBCYN_MODULES.inward, filter: (r) => !['Closed', 'Filed', 'No Action Required', 'Reply Issued'].includes(r.status) },
    { label: 'Department-wise Inward Report', cfg: () => WBCYN_MODULES.inward, filter: () => true },
    { label: 'Monthly Inward Report', cfg: () => WBCYN_MODULES.inward, filter: () => true },
  ],
  'Outward Reports': [
    { label: 'Outward Letter Register', cfg: () => WBCYN_MODULES.outward, filter: () => true },
    { label: 'Daily Dispatch Register', cfg: () => WBCYN_MODULES.outward, filter: (r) => r.dispatchDate === todayISO() },
    { label: 'Monthly Dispatch Register', cfg: () => WBCYN_MODULES.outward, filter: (r) => !!r.dispatchDate },
    { label: 'Awaiting Acknowledgement', cfg: () => WBCYN_MODULES.outward, filter: (r) => r.ackRequired === 'Yes' && r.ackReceived !== 'Yes' },
    { label: 'Awaiting Reply', cfg: () => WBCYN_MODULES.outward, filter: (r) => r.status === 'Awaiting Reply' },
    { label: 'Reply Overdue', cfg: () => WBCYN_MODULES.outward, filter: (r) => r.expectedReplyDate && daysUntil(r.expectedReplyDate) < 0 && !r.closureDate },
    { label: 'Reminder Register', cfg: () => WBCYN_MODULES.outward, filter: (r) => (Number(r.numReminders) || 0) > 0 },
    { label: 'Closed Correspondence', cfg: () => WBCYN_MODULES.outward, filter: (r) => r.status === 'Closed' },
  ],
  'Higher Authority Reports': [
    { label: 'Files Sent to Higher Authority', cfg: () => WBCYN_MODULES.files, filter: (r) => !!r.dateFileSent },
    { label: 'Swasthya Bhawan Correspondence', cfg: () => WBCYN_MODULES.files, filter: (r) => isSwasthyaFile(r) },
    { label: 'Files Awaiting Decision', cfg: () => WBCYN_MODULES.files, filter: (r) => r.status === 'Awaiting Decision' },
    { label: 'Approval Pending', cfg: () => WBCYN_MODULES.files, filter: (r) => (r.purpose || []).includes('Administrative Approval') && r.approvalReceived !== 'Yes' },
    { label: 'Sanction Pending', cfg: () => WBCYN_MODULES.files, filter: (r) => (r.purpose || []).includes('Financial Sanction') && r.sanctionReceived !== 'Yes' },
    { label: 'Finance Concurrence Pending', cfg: () => WBCYN_MODULES.files, filter: (r) => (r.purpose || []).includes('Finance Concurrence') && r.financeConcurrenceReceived !== 'Yes' },
    { label: 'Legal Opinion Pending', cfg: () => WBCYN_MODULES.files, filter: (r) => (r.purpose || []).includes('Legal Opinion') && r.legalOpinionReceived !== 'Yes' },
    { label: 'Long-pending Files', cfg: () => WBCYN_MODULES.files, filter: (r) => r.dateFileSent && daysUntil(r.dateFileSent) <= -30 },
    { label: 'Returned Files', cfg: () => WBCYN_MODULES.files, filter: (r) => r.status === 'Returned' },
    { label: 'Compliance Pending', cfg: () => WBCYN_MODULES.files, filter: (r) => r.status === 'Compliance Under Preparation' },
  ],
  'Staff Reports': [
    { label: 'Staff-wise Assignment Report', cfg: () => WBCYN_MODULES.assignments, filter: () => true },
    { label: 'Pending Work', cfg: () => WBCYN_MODULES.assignments, filter: (r) => ['Assigned', 'Acknowledged', 'In Progress'].includes(r.status) },
    { label: 'Overdue Work', cfg: () => WBCYN_MODULES.assignments, filter: (r) => isAssignmentOverdueW(r) },
    { label: 'Due Today', cfg: () => WBCYN_MODULES.assignments, filter: (r) => r.deadlineDate === todayISO() },
    { label: 'Awaiting Verification', cfg: () => WBCYN_MODULES.assignments, filter: (r) => r.status === 'Submitted for Verification' },
    { label: 'On-time Completion', cfg: () => WBCYN_MODULES.assignments, filter: (r) => ['Verified', 'Closed'].includes(r.status) && !assignmentWasLateW(r) },
    { label: 'Delayed Completion', cfg: () => WBCYN_MODULES.assignments, filter: (r) => ['Verified', 'Closed'].includes(r.status) && assignmentWasLateW(r) },
    { label: 'Assignment Follow-up Report', cfg: () => WBCYN_MODULES.assignments, filter: (r) => r.followUpRequired === 'Yes' },
  ],
  'Legal, RTI & Meeting Reports': [
    { label: 'Court Case Register', cfg: () => WBCYN_MODULES.legal, filter: () => true },
    { label: 'Upcoming Hearing Report', cfg: () => WBCYN_MODULES.legal, filter: (r) => r.nextHearingDate && daysUntil(r.nextHearingDate) >= 0 && daysUntil(r.nextHearingDate) <= 30 },
    { label: 'Court Compliance Pending', cfg: () => WBCYN_MODULES.legal, filter: (r) => r.complianceRequired === 'Yes' && r.status !== 'Compliance Completed' },
    { label: 'RTI Register', cfg: () => WBCYN_MODULES.rti, filter: () => true },
    { label: 'RTI Reply Due Report', cfg: () => WBCYN_MODULES.rti, filter: (r) => r.replyDeadline && daysUntil(r.replyDeadline) >= 0 && !['Replied', 'Disposed'].includes(r.status) },
    { label: 'Meeting Register', cfg: () => WBCYN_MODULES.meetings, filter: () => true },
    { label: 'Resolution Action Pending', cfg: () => WBCYN_MODULES.resolutions, filter: (r) => !['Completed', 'Closed'].includes(r.status) },
  ],
};
function activeReport(){
  const cats = Object.keys(REPORTS_CATALOG);
  wstate.reportsCategory = wstate.reportsCategory && cats.includes(wstate.reportsCategory) ? wstate.reportsCategory : cats[0];
  const reports = REPORTS_CATALOG[wstate.reportsCategory];
  wstate.reportsIndex = (wstate.reportsIndex >= 0 && wstate.reportsIndex < reports.length) ? wstate.reportsIndex : 0;
  return { cats, reports, report: reports[wstate.reportsIndex] };
}
function reportRecords(report){
  const cfg = report.cfg();
  let records = wdb[cfg.store].filter((r) => !r.archived).filter(report.filter);
  const dateKey = (r) => r.dateReceived || r.dispatchDate || r.dateFileSent || r.dateAssigned || r.dateFiled || r.letterDate || r.date || r.createdAt || '';
  if (wstate.reportsFrom) records = records.filter((r) => dateKey(r) >= wstate.reportsFrom);
  if (wstate.reportsTo) records = records.filter((r) => dateKey(r) <= wstate.reportsTo);
  if (wstate.reportsStaffFilter) records = records.filter((r) => [r.assignedToStaffId, r.markedToStaffId, r.responsibleStaffId, r.staffAssignedId, r.pioStaffId, r.actionAssignedToStaffId].includes(wstate.reportsStaffFilter));
  return { cfg, records };
}
function renderWbcynReports(){
  const { cats, reports, report } = activeReport();
  const { cfg, records } = reportRecords(report);
  const catTabs = cats.map((c) => `<button class="btn sm ${wstate.reportsCategory === c ? '' : 'secondary'}" data-repcat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join(' ');
  const repTabs = reports.map((r, i) => `<button class="btn sm ${i === wstate.reportsIndex ? '' : 'grey'}" data-repidx="${i}">${escapeHtml(r.label)}</button>`).join(' ');
  const flds = allFields(cfg).slice(0, 7);
  const thead = '<tr><th>Tracking ID</th>' + flds.map((f) => `<th>${escapeHtml(f.label)}</th>`).join('') + '</tr>';
  const rows = records.map((r) => `<tr><td>${escapeHtml(r.trackingId || '')}</td>${flds.map((f) => `<td>${escapeHtml(csvFieldValue(f, r)) || '—'}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${flds.length + 1}"><div class="empty-note">No records match this report.</div></td></tr>`;
  return `
    <div class="section-title no-print">📈 Reports</div>
    <div class="subtabs no-print">${catTabs}</div>
    <div class="subtabs no-print">${repTabs}</div>
    <div class="toolbar no-print">
      <label style="font-size:12px;color:var(--muted);">From <input type="date" id="repFrom" value="${wstate.reportsFrom || ''}"></label>
      <label style="font-size:12px;color:var(--muted);">To <input type="date" id="repTo" value="${wstate.reportsTo || ''}"></label>
      <select id="repStaffFilter"><option value="">All Staff</option>${activeStaff().map((s) => `<option value="${s.id}" ${wstate.reportsStaffFilter === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn secondary" id="repExport">Export CSV</button>
      <button class="btn secondary" id="repPrint">Print / PDF</button>
    </div>
    <p style="color:var(--muted);font-size:13px;">${records.length} record(s) — ${escapeHtml(report.label)}</p>
    <div class="table-wrap"><table><thead>${thead}</thead><tbody>${rows}</tbody></table></div>
  `;
}
SECTION_HANDLERS.reports = () => {
  document.querySelectorAll('[data-repcat]').forEach((b) => b.addEventListener('click', () => { wstate.reportsCategory = b.dataset.repcat; wstate.reportsIndex = 0; renderWbcyn(); }));
  document.querySelectorAll('[data-repidx]').forEach((b) => b.addEventListener('click', () => { wstate.reportsIndex = Number(b.dataset.repidx); renderWbcyn(); }));
  const from = document.getElementById('repFrom'); if (from) from.addEventListener('change', (e) => { wstate.reportsFrom = e.target.value; renderWbcyn(); });
  const to = document.getElementById('repTo'); if (to) to.addEventListener('change', (e) => { wstate.reportsTo = e.target.value; renderWbcyn(); });
  const sf = document.getElementById('repStaffFilter'); if (sf) sf.addEventListener('change', (e) => { wstate.reportsStaffFilter = e.target.value; renderWbcyn(); });
  const exp = document.getElementById('repExport'); if (exp) exp.addEventListener('click', () => {
    const { report } = activeReport();
    const { cfg, records } = reportRecords(report);
    const flds = allFields(cfg);
    exportCSV(`WBCYN_Report_${report.label.replace(/\s+/g, '_')}_${todayISO()}.csv`, ['Tracking ID'].concat(flds.map((f) => f.label)), records.map((r) => [r.trackingId].concat(flds.map((f) => csvFieldValue(f, r)))));
  });
  const prt = document.getElementById('repPrint'); if (prt) prt.addEventListener('click', () => window.print());
};

/* ================= SETTINGS (v1.6.0) ================= */
function fullWbcynBackupObject(){
  const obj = { app: 'WBCYN e-Office & Administrative Control System', version: WBCYN_VERSION, exportedAt: new Date().toISOString(), settings: wdb.settings };
  WBCYN_MIRRORED_STORES.forEach((s) => { obj[s] = wdb[s]; });
  return obj;
}
function downloadFullWbcynBackup(){ downloadBlob(`WBCYN_v${WBCYN_VERSION}_Full_Backup_${todayISO()}.json`, JSON.stringify(fullWbcynBackupObject(), null, 2), 'application/json'); }
function downloadPartialWbcynBackup(stores, label){
  const obj = { app: 'WBCYN e-Office & Administrative Control System', version: WBCYN_VERSION, exportedAt: new Date().toISOString(), stores };
  stores.forEach((s) => { obj[s] = wdb[s]; });
  downloadBlob(`WBCYN_${label}_Backup_${todayISO()}.json`, JSON.stringify(obj, null, 2), 'application/json');
}
function openRestorePreview(parsed){
  const storeKeys = WBCYN_MIRRORED_STORES.filter((s) => Array.isArray(parsed[s]));
  if (!storeKeys.length) { alert('This file does not look like a WBCYN v1.6.0 backup — no recognised stores found.'); return; }
  const rows = storeKeys.map((s) => {
    const incoming = parsed[s].length;
    const currentIds = new Set(wdb[s].map((r) => r.id));
    const dup = parsed[s].filter((r) => currentIds.has(r.id)).length;
    return `<tr><td>${s}</td><td>${incoming}</td><td>${dup}</td></tr>`;
  }).join('');
  openModal('Restore Preview', `
    <p>A safety backup of your <b>current</b> data was just downloaded automatically. This file contains:</p>
    <table><thead><tr><th>Store</th><th>Records in Backup</th><th>Already Exist (same ID)</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="margin-top:10px;font-size:13px;color:var(--muted);"><b>Merge</b> adds new records and updates any with a matching ID — nothing else is touched.<br><b>Replace</b> completely clears these stores first, then imports. Only choose Replace if you are certain.</p>
  `, `<button class="btn grey" id="restCancel">Cancel</button><button class="btn secondary" id="restMerge">Merge</button><button class="btn danger" id="restReplace">Replace</button>`);
  document.getElementById('restCancel').onclick = closeModal;
  document.getElementById('restMerge').onclick = () => performRestore(parsed, storeKeys, 'merge');
  document.getElementById('restReplace').onclick = () => {
    if (!confirm('Replace will permanently erase existing WBCYN v1.6.0 data in the stores listed above before importing. A safety backup was already downloaded. Continue?')) return;
    performRestore(parsed, storeKeys, 'replace');
  };
}
async function performRestore(parsed, storeKeys, mode){
  for (const s of storeKeys) {
    if (mode === 'replace') { await WBCYN_IDB.clear(s); wdb[s] = []; }
    for (const rec of parsed[s]) {
      if (mode === 'merge') { const idx = wdb[s].findIndex((r) => r.id === rec.id); if (idx >= 0) wdb[s][idx] = rec; else wdb[s].push(rec); }
      else wdb[s].push(rec);
      await WBCYN_IDB.put(s, rec);
    }
  }
  if (parsed.settings) { wdb.settings = ensureWbcynSettingsShape(Object.assign({}, wdb.settings, parsed.settings)); wSaveSettings(); }
  closeModal();
  alert('Restore complete.');
  renderWbcyn();
}
function renderWbcynSettings(){
  const s = wdb.settings;
  return `
    <div class="section-title">⚙️ WBCYN Settings</div>
    <div class="settings-block">
      <h3>Office &amp; Registrar Details</h3>
      <div class="form-field"><label>Registrar Name</label><input type="text" id="wSetRegistrar" value="${escapeHtml(s.registrarName)}"></div>
      <div class="form-field"><label>Office Name</label><input type="text" id="wSetOffice" value="${escapeHtml(s.officeName)}"></div>
      <div class="form-field"><label>Office Address</label><textarea id="wSetAddress">${escapeHtml(s.officeAddress)}</textarea></div>
      <button class="btn" id="wSaveSettings">Save Details</button>
    </div>
    <div class="settings-block">
      <h3>Backup</h3>
      <p style="color:var(--muted);font-size:13px;">All e-Office data (v1.6+) is stored locally on this device (IndexedDB). Back up regularly, and always before importing.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        <button class="btn secondary" id="wBackupFull">Full WBCYN Backup</button>
        <button class="btn secondary" id="wBackupCorr">Inward + Outward Backup</button>
        <button class="btn secondary" id="wBackupStaff">Staff + Assignment Backup</button>
        <button class="btn secondary" id="wBackupFiles">Higher Authority File Backup</button>
        <button class="btn secondary" id="wBackupReplies">Reply + Follow-up Backup</button>
        <button class="btn secondary" id="wBackupLegal">Legal + RTI Backup</button>
        <button class="btn secondary" id="wBackupMeetings">Meetings Backup</button>
      </div>
    </div>
    <div class="settings-block">
      <h3>Restore</h3>
      <p style="color:var(--muted);font-size:13px;">Restoring always shows a preview and duplicate check first, and automatically downloads a safety backup of your current data before anything is changed.</p>
      <button class="btn secondary" id="wRestoreTrigger">Choose Backup File to Restore</button>
      <input type="file" id="wRestoreFile" accept=".json" style="display:none">
    </div>
    <div class="settings-block">
      <h3>Legacy Records (Pre-v1.6.0)</h3>
      <p style="color:var(--muted);font-size:13px;">The original registers (Matters, Correspondence, Legal, RTI, Meetings, Examinations, Institutes, Trainers, Contacts) remain fully intact and editable, unchanged by this upgrade.</p>
      <button class="btn secondary" data-goto="legacy" data-filters="{}">Open Legacy Records</button>
    </div>
    <div class="settings-block">
      <h3>About</h3>
      <p style="color:var(--muted);font-size:13px;">WBCYN e-Office &amp; Administrative Control System — Version ${WBCYN_VERSION}</p>
    </div>
  `;
}
SECTION_HANDLERS.settings = () => {
  document.getElementById('wSaveSettings').addEventListener('click', () => {
    wdb.settings.registrarName = document.getElementById('wSetRegistrar').value;
    wdb.settings.officeName = document.getElementById('wSetOffice').value;
    wdb.settings.officeAddress = document.getElementById('wSetAddress').value;
    wSaveSettings();
    alert('Settings saved.');
  });
  document.getElementById('wBackupFull').addEventListener('click', downloadFullWbcynBackup);
  document.getElementById('wBackupCorr').addEventListener('click', () => downloadPartialWbcynBackup(['wbcynInward', 'wbcynOutward'], 'Inward_Outward'));
  document.getElementById('wBackupStaff').addEventListener('click', () => downloadPartialWbcynBackup(['wbcynStaff', 'wbcynAssignments', 'wbcynAssignmentTimeline', 'wbcynDeadlineExtensions'], 'Staff_Assignments'));
  document.getElementById('wBackupFiles').addEventListener('click', () => downloadPartialWbcynBackup(['wbcynHigherAuthorityFiles', 'wbcynFileMovements'], 'Higher_Authority_Files'));
  document.getElementById('wBackupReplies').addEventListener('click', () => downloadPartialWbcynBackup(['wbcynReplies', 'wbcynFollowUps'], 'Replies_FollowUps'));
  document.getElementById('wBackupLegal').addEventListener('click', () => downloadPartialWbcynBackup(['wbcynLegalMatters', 'wbcynRTI'], 'Legal_RTI'));
  document.getElementById('wBackupMeetings').addEventListener('click', () => downloadPartialWbcynBackup(['wbcynMeetings', 'wbcynResolutions'], 'Meetings'));
  const trigger = document.getElementById('wRestoreTrigger');
  const fileInput = document.getElementById('wRestoreFile');
  trigger.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); } catch (err) { alert('Invalid backup file.'); return; }
      downloadFullWbcynBackup(); // automatic safety backup before any import, per safety requirements
      openRestorePreview(parsed);
    };
    reader.readAsText(file);
  });
};

/* ============================================================================
   LEGACY RECORDS (Pre-v1.6.0) — ported verbatim from the original
   wbcyn/app.js (localStorage, key 'wbcyn_registrar_db_v1'). Every identifier
   here is LEGACY_-prefixed specifically to avoid colliding with any v1.6.0
   name above (several original names — renderNav, fieldInputHTML, closeModal,
   fmtDate, exportCSV — would otherwise silently redefine and break the new
   module). This code reads/writes the exact same localStorage key as before,
   so a Registrar's existing data (Matters, Correspondence, Legal, RTI,
   Meetings, Examinations, Institutes, Trainers, Contacts) is completely
   untouched and still fully editable — nothing here was migrated or altered.
   Per explicit decision: kept as its own isolated tab rather than force-fit
   into the new schema, since several of these entity types (Examinations,
   Institutes, Trainers, Contacts) have no equivalent in the new spec.
============================================================================ */
const LEGACY_STORAGE_KEY = 'wbcyn_registrar_db_v1';
const LEGACY_CATEGORIES = ['Administrative', 'Examination', 'Legal', 'RTI', 'Finance', 'Affiliated Institute', 'Registration', 'Government Correspondence', 'Meeting', 'Website', 'Other'];
const LEGACY_MODULES = {
  matters: {
    label: 'Action Tracker', icon: '📋', dueField: 'dueDate', isMatters: true,
    filterableKeys: ['status', 'category', 'priority'],
    fields: [
      { key: 'matterTitle', label: 'Matter Title', type: 'text', required: true },
      { key: 'category', label: 'Category', type: 'select', options: LEGACY_CATEGORIES, required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'fileNo', label: 'File / Memo Number', type: 'text' },
      { key: 'dateReceived', label: 'Date Received', type: 'date' },
      { key: 'dueDate', label: 'Due Date', type: 'date' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Normal', 'High', 'Urgent'], required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Awaiting Reply', 'Submitted', 'Completed'], required: true },
      { key: 'assignedTo', label: 'Assigned To', type: 'text' },
      { key: 'nextAction', label: 'Next Action Required', type: 'textarea' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    listCols: ['matterTitle', 'category', 'dueDate', 'priority', 'status'],
  },
  correspondence: {
    label: 'Correspondence Register', icon: '✉️', dueField: 'replyDueDate',
    filterableKeys: ['status', 'letterType', 'mode'],
    fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'memoNumber', label: 'Memo Number', type: 'text' },
      { key: 'letterType', label: 'Letter Type', type: 'select', options: ['Memo', 'Notice', 'Office Order', 'Circular', 'Forwarding Letter', 'Reminder', 'Reply', 'Government Letter', 'Legal Communication', 'Other'] },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'sentToFrom', label: 'Sent To / Received From', type: 'text' },
      { key: 'mode', label: 'Mode', type: 'select', options: ['Email', 'Physical', 'e-Office', 'WhatsApp', 'Other'] },
      { key: 'status', label: 'Current Status', type: 'select', options: ['Pending', 'Sent', 'Awaiting Reply', 'Replied', 'Closed'] },
      { key: 'replyDueDate', label: 'Reply Due Date', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    listCols: ['date', 'memoNumber', 'letterType', 'subject', 'status'],
  },
  legal: {
    label: 'Legal and Court Matters', icon: '⚖️', dueField: 'nextHearingDate',
    filterableKeys: ['currentStage'],
    fields: [
      { key: 'caseNumber', label: 'Case Number', type: 'text' },
      { key: 'caseTitle', label: 'Case Title', type: 'text' },
      { key: 'court', label: 'Court', type: 'text' },
      { key: 'petitioner', label: 'Petitioner', type: 'text' },
      { key: 'respondent', label: 'Respondent', type: 'text' },
      { key: 'advocate', label: 'Advocate', type: 'text' },
      { key: 'nextHearingDate', label: 'Next Hearing Date', type: 'date' },
      { key: 'currentStage', label: 'Current Stage', type: 'select', options: ['Filed', 'Admitted', 'Hearing', 'Reserved for Judgment', 'Disposed', 'Other'] },
      { key: 'actionRequired', label: 'Action Required', type: 'textarea' },
      { key: 'lastUpdate', label: 'Last Update', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    listCols: ['caseNumber', 'caseTitle', 'court', 'nextHearingDate', 'currentStage'],
  },
  rti: {
    label: 'RTI Register', icon: '📄', dueField: 'replyDueDate',
    filterableKeys: ['status', 'firstAppealStatus'],
    fields: [
      { key: 'rtiNumber', label: 'RTI Application Number', type: 'text' },
      { key: 'applicantName', label: 'Applicant Name', type: 'text' },
      { key: 'dateReceived', label: 'Date Received', type: 'date' },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'informationSought', label: 'Information Sought', type: 'textarea' },
      { key: 'replyDueDate', label: 'Reply Due Date', type: 'date' },
      { key: 'replyDate', label: 'Reply Date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Replied', 'Rejected', 'Transferred', 'Disposed'] },
      { key: 'firstAppealStatus', label: 'First Appeal Status', type: 'select', options: ['Not Filed', 'Pending', 'Disposed'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    listCols: ['rtiNumber', 'applicantName', 'dateReceived', 'replyDueDate', 'status'],
  },
  meetings: {
    label: 'Meetings and Resolutions', icon: '🗓️', dueField: 'deadline',
    filterableKeys: ['status'],
    fields: [
      { key: 'meetingTitle', label: 'Meeting Title', type: 'text' },
      { key: 'dateTime', label: 'Date and Time', type: 'datetime-local' },
      { key: 'venue', label: 'Venue', type: 'text' },
      { key: 'participants', label: 'Participants', type: 'textarea' },
      { key: 'agenda', label: 'Agenda', type: 'textarea' },
      { key: 'decisions', label: 'Decisions / Resolutions', type: 'textarea' },
      { key: 'followUpAction', label: 'Follow-up Action', type: 'text' },
      { key: 'responsiblePerson', label: 'Responsible Person', type: 'text' },
      { key: 'deadline', label: 'Deadline', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Scheduled', 'Held', 'Pending Action', 'Completed'] },
    ],
    listCols: ['meetingTitle', 'dateTime', 'venue', 'deadline', 'status'],
  },
  examinations: {
    label: 'Examination Management', icon: '📝', dueField: null,
    filterableKeys: ['resultStatus'],
    fields: [
      { key: 'session', label: 'Session', type: 'text' },
      { key: 'examName', label: 'Examination Name', type: 'text' },
      { key: 'theoryDate', label: 'Theory Examination Date', type: 'date' },
      { key: 'practicalDate', label: 'Practical Examination Date', type: 'date' },
      { key: 'centre', label: 'Examination Centre', type: 'text' },
      { key: 'numInstitutes', label: 'Number of Institutes', type: 'number' },
      { key: 'numStudents', label: 'Number of Students', type: 'number' },
      { key: 'examinerStatus', label: 'Examiner Submission Status', type: 'select', options: ['Pending', 'In Progress', 'Completed'] },
      { key: 'questionPaperStatus', label: 'Question Paper Status', type: 'select', options: ['Pending', 'In Progress', 'Completed'] },
      { key: 'admitCardStatus', label: 'Admit Card Status', type: 'select', options: ['Pending', 'Issued'] },
      { key: 'resultStatus', label: 'Result Status', type: 'select', options: ['Pending', 'Declared'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    listCols: ['session', 'examName', 'theoryDate', 'practicalDate', 'resultStatus'],
  },
  institutes: {
    label: 'Affiliated Institutes', icon: '🏫', dueField: 'affiliationValidity',
    filterableKeys: ['affiliationStatus'],
    fields: [
      { key: 'instituteName', label: 'Institute Name', type: 'text' },
      { key: 'instituteCode', label: 'Institute Code', type: 'text' },
      { key: 'principal', label: 'Principal / Head', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'mobile', label: 'Mobile Number', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'affiliationStatus', label: 'Affiliation Status', type: 'select', options: ['Active', 'Expired', 'Pending', 'Suspended'] },
      { key: 'affiliationValidity', label: 'Affiliation Validity', type: 'date' },
      { key: 'numStudents', label: 'Number of Students', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    listCols: ['instituteName', 'instituteCode', 'principal', 'affiliationStatus', 'affiliationValidity'],
  },
  trainers: {
    label: 'Registered Yoga Trainers', icon: '🧘', dueField: null,
    filterableKeys: ['status'],
    fields: [
      { key: 'regNumber', label: 'Registration Number', type: 'text' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'dateOfRegistration', label: 'Date of Registration', type: 'date' },
      { key: 'mobile', label: 'Mobile Number', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'status', label: 'Registration Status', type: 'select', options: ['Active', 'Expired', 'Suspended'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    listCols: ['regNumber', 'name', 'dateOfRegistration', 'status'],
  },
  contacts: {
    label: 'Important Contacts', icon: '📇', dueField: null,
    filterableKeys: [],
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'designation', label: 'Designation', type: 'text' },
      { key: 'department', label: 'Department / Organisation', type: 'text' },
      { key: 'mobile', label: 'Mobile Number', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    listCols: ['name', 'designation', 'department', 'mobile'],
  },
};
const LEGACY_REGISTER_ORDER = ['correspondence', 'legal', 'rti', 'meetings', 'examinations', 'institutes', 'trainers', 'contacts', 'archive'];
let LEGACY_DB = null;

function LEGACY_fmtDate(dateStr){
  if (!dateStr) return '—';
  try { const d = new Date(dateStr.length > 10 ? dateStr : dateStr + 'T00:00:00'); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch (e) { return dateStr; }
}
function LEGACY_saveDB(){ localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(LEGACY_DB)); }
function LEGACY_loadDBFromStorage(){
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (raw) { try { return JSON.parse(raw); } catch (e) { /* fall through to fresh */ } }
  return null;
}
function LEGACY_freshDB(){
  return {
    matters: [], correspondence: [], legal: [], rti: [], meetings: [], examinations: [], institutes: [], trainers: [], contacts: [],
    settings: { registrarName: 'Dr. M. Jahangir', officeName: 'West Bengal Council of Yoga and Naturopathy', officeAddress: 'Purta Bhawan, Room No. 107, Block-DF, Sector-I, Bidhannagar, Kolkata – 700091' },
    seeded: false,
  };
}
function LEGACY_ensureShape(db){
  const f = LEGACY_freshDB();
  Object.keys(f).forEach((k) => { if (!(k in db)) db[k] = f[k]; });
  if (!db.settings) db.settings = f.settings;
  return db;
}
function LEGACY_initData(){
  LEGACY_DB = LEGACY_loadDBFromStorage();
  if (!LEGACY_DB) LEGACY_DB = LEGACY_freshDB();
  LEGACY_DB = LEGACY_ensureShape(LEGACY_DB);
  // Deliberately no auto-seeding of sample data here (unlike the original
  // file) — a brand-new v1.6.0 deployment must not inject fake records; see
  // the "no sample/test records in the deployment package" requirement.
}

function LEGACY_counts(){
  const m = LEGACY_DB.matters;
  const notCompleted = m.filter((x) => x.status !== 'Completed');
  return {
    totalPending: notCompleted.length,
    urgent: notCompleted.filter((x) => x.priority === 'Urgent').length,
    dueThisWeek: notCompleted.filter((x) => { const d = daysUntil(x.dueDate); return d !== null && d >= 0 && d <= 7; }).length,
    pendingLetters: LEGACY_DB.correspondence.filter((x) => !['Replied', 'Closed'].includes(x.status)).length,
    pendingRTI: LEGACY_DB.rti.filter((x) => x.status === 'Pending').length,
    legalMatters: LEGACY_DB.legal.filter((x) => x.currentStage !== 'Disposed').length,
    examMatters: LEGACY_DB.examinations.filter((x) => x.resultStatus !== 'Declared').length,
    completed: m.filter((x) => x.status === 'Completed').length,
  };
}
function LEGACY_renderHome(){
  const c = LEGACY_counts();
  const cards = [
    { lbl: 'Total Pending Matters', num: c.totalPending, icon: '📋' },
    { lbl: 'Urgent Matters', num: c.urgent, icon: '🔴' },
    { lbl: 'Due This Week', num: c.dueThisWeek, icon: '⏳' },
    { lbl: 'Pending Letters', num: c.pendingLetters, icon: '✉️' },
    { lbl: 'Pending RTI Matters', num: c.pendingRTI, icon: '📄' },
    { lbl: 'Legal Matters', num: c.legalMatters, icon: '⚖️' },
    { lbl: 'Examination Matters', num: c.examMatters, icon: '📝' },
    { lbl: 'Completed Matters', num: c.completed, icon: '✅' },
  ];
  const cardsHtml = cards.map((cd) => `<div class="card"><span class="icon">${cd.icon}</span><span class="num">${cd.num}</span><span class="lbl">${cd.lbl}</span></div>`).join('');
  const upcoming = LEGACY_DB.matters.filter((x) => x.status !== 'Completed' && x.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8);
  const deadlineRows = upcoming.map((m) => {
    const d = daysUntil(m.dueDate);
    let cls = 'row-green', badge = '';
    if (d < 0) { cls = 'row-red'; badge = '<span class="badge badge-red">Overdue</span>'; }
    else if (d === 0) { cls = 'row-orange'; badge = '<span class="badge badge-orange">Due Today</span>'; }
    else if (d <= 7) { cls = 'row-yellow'; badge = '<span class="badge badge-yellow">Due Soon</span>'; }
    else { cls = ''; badge = '<span class="badge badge-grey">Upcoming</span>'; }
    return `<div class="deadline-row ${cls}"><div><div class="title">${escapeHtml(m.matterTitle)}</div><div class="meta">${escapeHtml(m.category)} &middot; Due ${LEGACY_fmtDate(m.dueDate)}</div></div>${badge}</div>`;
  }).join('') || '<div class="empty-note">No upcoming deadlines.</div>';
  return `<div class="section-title no-print">📊 Legacy Dashboard Overview</div><div class="cards-grid">${cardsHtml}</div><div class="section-title">⏳ Upcoming Deadlines</div><div class="deadline-list">${deadlineRows}</div>`;
}
function LEGACY_renderRegistersWrap(){
  const tabs = LEGACY_REGISTER_ORDER.map((id) => {
    const label = id === 'archive' ? 'Completed Work Archive' : LEGACY_MODULES[id].label;
    const icon = id === 'archive' ? '🗄️' : LEGACY_MODULES[id].icon;
    return `<button data-legreg="${id}" class="${wstate.legacyRegister === id ? 'active' : ''}">${icon} ${label}</button>`;
  }).join('');
  return `<div class="subtabs">${tabs}</div><div id="legacyRegisterHost">${LEGACY_renderRegister(wstate.legacyRegister)}</div>`;
}
function LEGACY_getRecords(moduleId){ if (moduleId === 'archive') return LEGACY_DB.matters.filter((m) => m.status === 'Completed'); return LEGACY_DB[moduleId]; }
function LEGACY_moduleConfig(moduleId){ if (moduleId === 'archive') return LEGACY_MODULES.matters; return LEGACY_MODULES[moduleId]; }
function LEGACY_badgeForRecord(moduleId, rec){
  const cfg = LEGACY_moduleConfig(moduleId);
  if (moduleId === 'matters' && rec.status === 'Completed') return { cls: 'row-green', badge: '<span class="badge badge-green">Completed</span>' };
  if (moduleId === 'archive') return { cls: 'row-green', badge: '<span class="badge badge-green">Completed</span>' };
  if (!cfg.dueField) return { cls: '', badge: '' };
  const d = daysUntil(rec[cfg.dueField]);
  if (d === null) return { cls: '', badge: '' };
  if (d < 0) return { cls: 'row-red', badge: '<span class="badge badge-red">Overdue</span>' };
  if (d === 0) return { cls: 'row-orange', badge: '<span class="badge badge-orange">Due Today</span>' };
  if (d <= 7) return { cls: 'row-yellow', badge: '<span class="badge badge-yellow">Due Soon</span>' };
  return { cls: '', badge: '' };
}
function LEGACY_matchesFilters(moduleId, rec){
  const s = (wstate.legacyFilters.search || '').toLowerCase();
  if (s) { const cfg = LEGACY_moduleConfig(moduleId); const hay = cfg.fields.map((f) => rec[f.key]).join(' ').toLowerCase(); if (!hay.includes(s)) return false; }
  for (const k in wstate.legacyFilters) {
    if (k === 'search') continue;
    const v = wstate.legacyFilters[k];
    if (v && v !== 'All' && rec[k] !== v) return false;
  }
  return true;
}
function LEGACY_renderRegister(moduleId){
  const cfg = LEGACY_moduleConfig(moduleId);
  const isArchive = moduleId === 'archive';
  let records = LEGACY_getRecords(moduleId).filter((r) => LEGACY_matchesFilters(moduleId, r));
  if (moduleId === 'matters') records = records.slice().sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const filterSelects = (cfg.filterableKeys || []).map((key) => {
    const f = cfg.fields.find((x) => x.key === key);
    if (!f) return '';
    const opts = ['All'].concat(f.options).map((o) => `<option value="${escapeHtml(o)}" ${wstate.legacyFilters[key] === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
    return `<select data-legfilter="${key}">${opts}</select>`;
  }).join('');
  const quickDeadlineBtns = moduleId === 'matters' ? `
    <select data-legfilter="__due">
      <option value="">All Due Dates</option>
      <option value="overdue" ${wstate.legacyFilters.__due === 'overdue' ? 'selected' : ''}>Overdue</option>
      <option value="today" ${wstate.legacyFilters.__due === 'today' ? 'selected' : ''}>Due Today</option>
      <option value="week" ${wstate.legacyFilters.__due === 'week' ? 'selected' : ''}>Due This Week</option>
    </select>` : '';
  if (moduleId === 'matters' && wstate.legacyFilters.__due) {
    records = records.filter((r) => {
      if (r.status === 'Completed') return false;
      const d = daysUntil(r.dueDate);
      if (d === null) return false;
      if (wstate.legacyFilters.__due === 'overdue') return d < 0;
      if (wstate.legacyFilters.__due === 'today') return d === 0;
      if (wstate.legacyFilters.__due === 'week') return d >= 0 && d <= 7;
      return true;
    });
  }
  const cols = cfg.listCols;
  const thead = cols.map((c) => `<th>${escapeHtml(cfg.fields.find((f) => f.key === c)?.label || c)}</th>`).join('') + '<th>Flag</th><th class="no-print">Actions</th>';
  const rows = records.map((rec) => {
    const b = LEGACY_badgeForRecord(moduleId, rec);
    const tds = cols.map((c) => { const f = cfg.fields.find((x) => x.key === c); let val = rec[c]; if (f && f.type === 'date') val = LEGACY_fmtDate(val); return `<td>${escapeHtml(val) || '—'}</td>`; }).join('');
    let actionBtns = `<button class="btn sm secondary" data-legview="${rec.id}" data-legmod="${moduleId}">View</button>`;
    if (!isArchive) {
      actionBtns += ` <button class="btn sm grey" data-legedit="${rec.id}" data-legmod="${moduleId}">Edit</button>`;
      if (moduleId === 'matters' && rec.status !== 'Completed') actionBtns += ` <button class="btn sm" style="background:var(--green);border-color:var(--green)" data-legcomplete="${rec.id}">Complete</button>`;
      actionBtns += ` <button class="btn sm danger" data-legdel="${rec.id}" data-legmod="${moduleId}">Delete</button>`;
    } else {
      actionBtns += ` <button class="btn sm" style="background:var(--accent);border-color:var(--accent)" data-legrestore="${rec.id}">Restore</button>`;
      actionBtns += ` <button class="btn sm danger" data-legdel="${rec.id}" data-legmod="matters">Delete</button>`;
    }
    return `<tr class="${b.cls}">${tds}<td>${b.badge}</td><td class="actions-cell no-print">${actionBtns}</td></tr>`;
  }).join('') || `<tr><td colspan="${cols.length + 2}"><div class="empty-note">No records found.</div></td></tr>`;
  const title = isArchive ? 'Completed Work Archive' : cfg.label;
  const addBtn = isArchive ? '' : `<button class="btn" id="legBtnAddRecord" data-legmod="${moduleId}">+ Add New ${moduleId === 'matters' ? 'Matter' : 'Record'}</button>`;
  return `
    <div class="print-only"><strong>${escapeHtml(LEGACY_DB.settings.officeName)}</strong><br>${escapeHtml(title)} — Printed on ${LEGACY_fmtDate(todayISO())}</div>
    <div class="section-title no-print">${cfg.icon || '🗄️'} ${title}</div>
    <div class="toolbar no-print">
      ${addBtn}
      <input type="text" id="legSearchBox" placeholder="Search..." value="${escapeHtml(wstate.legacyFilters.search || '')}">
      ${filterSelects}${quickDeadlineBtns}
      <span class="spacer"></span>
      <button class="btn secondary" id="legBtnExportCSV" data-legmod="${moduleId}">Export CSV</button>
      <button class="btn secondary" id="legBtnPrint">Print</button>
    </div>
    <div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${rows}</tbody></table></div>
  `;
}
function LEGACY_attachCommonHandlers(){
  document.querySelectorAll('[data-legview-mode]').forEach(() => {}); // reserved
  document.querySelectorAll('[data-legtab]').forEach((b) => b.addEventListener('click', () => { wstate.legacyView = b.dataset.legtab; wstate.legacyFilters = {}; renderWbcyn(); }));
  document.querySelectorAll('[data-legreg]').forEach((b) => b.addEventListener('click', () => { wstate.legacyRegister = b.dataset.legreg; wstate.legacyFilters = {}; renderWbcyn(); }));
}
function LEGACY_attachRegisterHandlers(moduleId){
  const searchBox = document.getElementById('legSearchBox');
  if (searchBox) searchBox.addEventListener('input', (e) => { wstate.legacyFilters.search = e.target.value; renderWbcyn(); });
  document.querySelectorAll('[data-legfilter]').forEach((sel) => sel.addEventListener('change', (e) => { const key = e.target.dataset.legfilter; wstate.legacyFilters[key] = e.target.value === 'All' ? '' : e.target.value; renderWbcyn(); }));
  const addBtn = document.getElementById('legBtnAddRecord'); if (addBtn) addBtn.addEventListener('click', () => LEGACY_openForm(addBtn.dataset.legmod));
  document.querySelectorAll('[data-legedit]').forEach((b) => b.addEventListener('click', () => LEGACY_openForm(b.dataset.legmod, b.dataset.legedit)));
  document.querySelectorAll('[data-legview]').forEach((b) => b.addEventListener('click', () => LEGACY_openDetail(b.dataset.legmod, b.dataset.legview)));
  document.querySelectorAll('[data-legdel]').forEach((b) => b.addEventListener('click', () => LEGACY_deleteRecord(b.dataset.legmod, b.dataset.legdel)));
  document.querySelectorAll('[data-legcomplete]').forEach((b) => b.addEventListener('click', () => LEGACY_completeMatter(b.dataset.legcomplete)));
  document.querySelectorAll('[data-legrestore]').forEach((b) => b.addEventListener('click', () => LEGACY_restoreMatter(b.dataset.legrestore)));
  const exportBtn = document.getElementById('legBtnExportCSV'); if (exportBtn) exportBtn.addEventListener('click', () => LEGACY_exportCSV(exportBtn.dataset.legmod));
  const printBtn = document.getElementById('legBtnPrint'); if (printBtn) printBtn.addEventListener('click', () => window.print());
}
function LEGACY_openForm(moduleId, id){
  const cfg = LEGACY_moduleConfig(moduleId);
  const records = LEGACY_getRecords(moduleId);
  const existing = id ? records.find((r) => r.id === id) : null;
  const title = existing ? `Edit ${cfg.label.replace(/s$/, '')}` : `Add New ${moduleId === 'matters' ? 'Matter' : cfg.label.replace(/ Register| Management| and Court Matters| and Resolutions/, '')}`;
  const fieldsHtml = cfg.fields.map((f) => { const full = f.type === 'textarea' ? 'full' : ''; return `<div class="form-field ${full}"><label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>${fieldInputHTML(f, existing ? existing[f.key] : '')}</div>`; }).join('');
  openModal(title, `<form id="legRecordForm"><div class="form-grid">${fieldsHtml}</div></form>`, `<button type="button" class="btn grey" id="legBtnCancel">Cancel</button><button type="button" class="btn" id="legBtnSave">Save</button>`);
  document.getElementById('legBtnCancel').onclick = closeModal;
  document.getElementById('legBtnSave').onclick = () => {
    const form = document.getElementById('legRecordForm');
    const required = cfg.fields.filter((f) => f.required);
    for (const f of required) { const el = form.querySelector(`[name="${f.key}"]`); if (el && !el.value) { alert(`"${f.label}" is required.`); el.focus(); return; } }
    const data = existing ? { ...existing } : { id: genUUID() };
    cfg.fields.forEach((f) => { const el = form.querySelector(`[name="${f.key}"]`); data[f.key] = el ? el.value : ''; });
    if (moduleId === 'matters') {
      if (data.status === 'Completed' && (!existing || existing.status !== 'Completed')) data.completedDate = todayISO();
      if (data.status !== 'Completed') data.completedDate = '';
    }
    const arr = LEGACY_DB[moduleId === 'archive' ? 'matters' : moduleId];
    const idx = arr.findIndex((r) => r.id === data.id);
    if (idx >= 0) arr[idx] = data; else arr.push(data);
    LEGACY_saveDB();
    closeModal();
    renderWbcyn();
  };
}
function LEGACY_openDetail(moduleId, id){
  const cfg = LEGACY_moduleConfig(moduleId);
  const rec = LEGACY_getRecords(moduleId).find((r) => r.id === id);
  if (!rec) return;
  const rows = cfg.fields.map((f) => { let val = rec[f.key]; if (f.type === 'date') val = LEGACY_fmtDate(val); const full = f.type === 'textarea' ? 'full' : ''; return `<div class="${full}"><div class="dl">${escapeHtml(f.label)}</div><div class="dv">${escapeHtml(val) || '—'}</div></div>`; }).join('');
  const isArchive = moduleId === 'archive';
  let extraBtns = '';
  if (!isArchive) { extraBtns += `<button class="btn secondary" id="legDetailEdit">Edit</button>`; if (moduleId === 'matters' && rec.status !== 'Completed') extraBtns += `<button class="btn" style="background:var(--green);border-color:var(--green)" id="legDetailComplete">Mark Complete</button>`; extraBtns += `<button class="btn danger" id="legDetailDelete">Delete</button>`; }
  else { extraBtns += `<button class="btn" id="legDetailRestore">Restore</button><button class="btn danger" id="legDetailDelete">Delete</button>`; }
  openModal(`${escapeHtml(cfg.label)} — Details`, `<div class="detail-grid">${rows}</div>`, `<button class="btn grey" id="legDetailClose">Close</button>${extraBtns}`);
  document.getElementById('legDetailClose').onclick = closeModal;
  const editB = document.getElementById('legDetailEdit'); if (editB) editB.onclick = () => { closeModal(); LEGACY_openForm(moduleId, id); };
  const delB = document.getElementById('legDetailDelete'); if (delB) delB.onclick = () => { closeModal(); LEGACY_deleteRecord(moduleId, id); };
  const compB = document.getElementById('legDetailComplete'); if (compB) compB.onclick = () => { closeModal(); LEGACY_completeMatter(id); };
  const restB = document.getElementById('legDetailRestore'); if (restB) restB.onclick = () => { closeModal(); LEGACY_restoreMatter(id); };
}
function LEGACY_deleteRecord(moduleId, id){
  if (!confirm('Are you sure you want to delete this record? This cannot be undone.')) return;
  const arr = LEGACY_DB[moduleId === 'archive' ? 'matters' : moduleId];
  const idx = arr.findIndex((r) => r.id === id);
  if (idx >= 0) arr.splice(idx, 1);
  LEGACY_saveDB(); renderWbcyn();
}
function LEGACY_completeMatter(id){ const rec = LEGACY_DB.matters.find((r) => r.id === id); if (!rec) return; rec.status = 'Completed'; rec.completedDate = todayISO(); LEGACY_saveDB(); renderWbcyn(); }
function LEGACY_restoreMatter(id){ const rec = LEGACY_DB.matters.find((r) => r.id === id); if (!rec) return; rec.status = 'Not Started'; rec.completedDate = ''; LEGACY_saveDB(); renderWbcyn(); }
function LEGACY_exportCSV(moduleId){
  const cfg = LEGACY_moduleConfig(moduleId);
  const records = LEGACY_getRecords(moduleId);
  exportCSV(`WBCYN_Legacy_${moduleId}_${todayISO()}.csv`, cfg.fields.map((f) => f.label), records.map((r) => cfg.fields.map((f) => r[f.key])));
}
function LEGACY_groupCount(arr, key){ const m = {}; arr.forEach((r) => { const v = r[key] || 'Unspecified'; m[v] = (m[v] || 0) + 1; }); return m; }
function LEGACY_renderReports(){
  const pendingMatters = LEGACY_DB.matters.filter((m) => m.status !== 'Completed');
  const overdue = pendingMatters.filter((m) => daysUntil(m.dueDate) < 0);
  const dueSoon = pendingMatters.filter((m) => { const d = daysUntil(m.dueDate); return d !== null && d >= 0 && d <= 7; });
  const overdueRows = overdue.map((m) => `<div class="deadline-row row-red"><div><div class="title">${escapeHtml(m.matterTitle)}</div><div class="meta">${escapeHtml(m.category)} &middot; Due ${LEGACY_fmtDate(m.dueDate)}</div></div><span class="badge badge-red">Overdue</span></div>`).join('') || '<div class="empty-note">No overdue matters.</div>';
  const dueSoonRows = dueSoon.map((m) => `<div class="deadline-row row-yellow"><div><div class="title">${escapeHtml(m.matterTitle)}</div><div class="meta">${escapeHtml(m.category)} &middot; Due ${LEGACY_fmtDate(m.dueDate)}</div></div><span class="badge badge-yellow">Due Soon</span></div>`).join('') || '<div class="empty-note">No matters due in the next 7 days.</div>';
  const examRows = LEGACY_DB.examinations.map((e) => `<tr><td>${escapeHtml(e.session)}</td><td>${escapeHtml(e.examName)}</td><td>${escapeHtml(e.examinerStatus)}</td><td>${escapeHtml(e.questionPaperStatus)}</td><td>${escapeHtml(e.admitCardStatus)}</td><td>${escapeHtml(e.resultStatus)}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-note">No examination records.</div></td></tr>';
  return `
    <div class="section-title no-print">📊 Legacy Reports</div>
    <div class="toolbar no-print"><button class="btn secondary" id="legBtnPrintReports">Print Reports</button></div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Pending Matters by Category</h3><canvas id="legChartCategory"></canvas></div>
      <div class="chart-card"><h3>Pending Matters by Status</h3><canvas id="legChartStatus"></canvas></div>
      <div class="chart-card"><h3>Priority-wise Matters</h3><canvas id="legChartPriority"></canvas></div>
      <div class="chart-card"><h3>Monthly Completed Work</h3><canvas id="legChartMonthly"></canvas></div>
      <div class="chart-card"><h3>RTI Status Summary</h3><canvas id="legChartRTI"></canvas></div>
      <div class="chart-card"><h3>Legal Matter Summary</h3><canvas id="legChartLegal"></canvas></div>
    </div>
    <div class="section-title">🔴 Overdue Matters (${overdue.length})</div><div class="deadline-list">${overdueRows}</div>
    <div class="section-title">🟡 Due in Next 7 Days (${dueSoon.length})</div><div class="deadline-list">${dueSoonRows}</div>
    <div class="section-title">📝 Examination Progress</div>
    <div class="table-wrap"><table><thead><tr><th>Session</th><th>Exam</th><th>Examiner Status</th><th>Question Paper</th><th>Admit Card</th><th>Result</th></tr></thead><tbody>${examRows}</tbody></table></div>
  `;
}
let LEGACY_chartInstances = [];
function LEGACY_drawReportCharts(){
  if (typeof Chart === 'undefined') {
    document.querySelectorAll('.chart-card canvas').forEach((cv) => { const note = document.createElement('div'); note.className = 'empty-note'; note.textContent = 'Charts unavailable offline (no internet connection to load chart library).'; cv.replaceWith(note); });
    return;
  }
  LEGACY_chartInstances.forEach((c) => c.destroy()); LEGACY_chartInstances = [];
  const pendingMatters = LEGACY_DB.matters.filter((m) => m.status !== 'Completed');
  const catData = LEGACY_groupCount(pendingMatters, 'category');
  const statusData = LEGACY_groupCount(pendingMatters, 'status');
  const prioData = LEGACY_groupCount(pendingMatters, 'priority');
  const rtiData = LEGACY_groupCount(LEGACY_DB.rti, 'status');
  const legalData = LEGACY_groupCount(LEGACY_DB.legal, 'currentStage');
  const monthData = {};
  LEGACY_DB.matters.filter((m) => m.status === 'Completed' && m.completedDate).forEach((m) => { const mo = m.completedDate.slice(0, 7); monthData[mo] = (monthData[mo] || 0) + 1; });
  const palette = ['#1565c0', '#0b3d66', '#42a5f5', '#90caf9', '#fb8c00', '#e53935', '#2e7d32', '#f9a825', '#8e24aa', '#00897b'];
  function bar(id, data, label) { const ctx = document.getElementById(id); if (!ctx) return; LEGACY_chartInstances.push(new Chart(ctx, { type: 'bar', data: { labels: Object.keys(data), datasets: [{ label: label, data: Object.values(data), backgroundColor: palette }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } })); }
  function pie(id, data) { const ctx = document.getElementById(id); if (!ctx) return; LEGACY_chartInstances.push(new Chart(ctx, { type: 'pie', data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: palette }] } })); }
  bar('legChartCategory', catData, 'Pending Matters'); pie('legChartStatus', statusData); pie('legChartPriority', prioData);
  bar('legChartMonthly', monthData, 'Completed'); pie('legChartRTI', rtiData); bar('legChartLegal', legalData, 'Cases');
  const pb = document.getElementById('legBtnPrintReports'); if (pb) pb.addEventListener('click', () => window.print());
}
function LEGACY_renderSettings(){
  const s = LEGACY_DB.settings;
  return `
    <div class="section-title">⚙️ Legacy Settings</div>
    <div class="settings-block">
      <h3>Office &amp; Registrar Details (Legacy)</h3>
      <div class="form-field"><label>Registrar Name</label><input type="text" id="legSetRegistrar" value="${escapeHtml(s.registrarName)}"></div>
      <div class="form-field"><label>Office Name</label><input type="text" id="legSetOfficeName" value="${escapeHtml(s.officeName)}"></div>
      <div class="form-field"><label>Office Address</label><textarea id="legSetOfficeAddress">${escapeHtml(s.officeAddress)}</textarea></div>
      <button class="btn" id="legBtnSaveSettings">Save Details</button>
    </div>
    <div class="settings-block">
      <h3>Legacy Data Management</h3>
      <p style="color:var(--muted);font-size:13.5px;">This backs up only the pre-v1.6.0 legacy registers. Use WBCYN Settings for the new e-Office data.</p>
      <button class="btn secondary" id="legBtnBackup">Export Legacy Backup (JSON)</button>
      <button class="btn secondary" id="legBtnRestoreTrigger">Import Legacy Backup (JSON)</button>
      <input type="file" id="legRestoreFile" accept=".json" style="display:none">
    </div>
    <div class="settings-block" style="background:#fdecea;border-color:#f3c1bd;">
      <h3 style="color:var(--red);">Danger Zone</h3>
      <p style="color:var(--muted);font-size:13.5px;">This permanently erases all LEGACY records and settings on this device. It does not affect v1.6.0 e-Office data.</p>
      <button class="btn danger" id="legBtnReset">Reset Legacy Data</button>
    </div>
  `;
}
function LEGACY_attachSettingsHandlers(){
  document.getElementById('legBtnSaveSettings').addEventListener('click', () => {
    LEGACY_DB.settings.registrarName = document.getElementById('legSetRegistrar').value;
    LEGACY_DB.settings.officeName = document.getElementById('legSetOfficeName').value;
    LEGACY_DB.settings.officeAddress = document.getElementById('legSetOfficeAddress').value;
    LEGACY_saveDB(); alert('Legacy settings saved.');
  });
  document.getElementById('legBtnBackup').addEventListener('click', () => downloadBlob(`WBCYN_Legacy_Backup_${todayISO()}.json`, JSON.stringify(LEGACY_DB, null, 2), 'application/json'));
  const trigger = document.getElementById('legBtnRestoreTrigger');
  const file = document.getElementById('legRestoreFile');
  trigger.addEventListener('click', () => file.click());
  file.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!confirm('This will replace all current LEGACY data with the backup file. Continue?')) return;
        LEGACY_DB = LEGACY_ensureShape(parsed);
        LEGACY_saveDB(); renderWbcyn();
        alert('Legacy backup restored successfully.');
      } catch (err) { alert('Invalid backup file.'); }
    };
    reader.readAsText(f);
  });
  document.getElementById('legBtnReset').addEventListener('click', () => {
    const input = prompt('This will permanently delete ALL legacy data on this device. Type RESET to confirm.');
    if (input === 'RESET') { localStorage.removeItem(LEGACY_STORAGE_KEY); LEGACY_DB = LEGACY_freshDB(); LEGACY_saveDB(); renderWbcyn(); alert('Legacy data has been reset.'); }
  });
}
const LEGACY_NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'matters', label: 'Matters', icon: '📋' },
  { id: 'registers', label: 'Registers', icon: '📚' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];
function LEGACY_render(){
  const tabs = LEGACY_NAV_ITEMS.map((it) => `<button data-legtab="${it.id}" class="${wstate.legacyView === it.id ? 'active' : ''}"><span class="ic">${it.icon}</span><span>${it.label}</span></button>`).join('');
  let body;
  if (wstate.legacyView === 'home') body = LEGACY_renderHome();
  else if (wstate.legacyView === 'matters') body = LEGACY_renderRegister('matters');
  else if (wstate.legacyView === 'registers') body = LEGACY_renderRegistersWrap();
  else if (wstate.legacyView === 'reports') body = LEGACY_renderReports();
  else if (wstate.legacyView === 'settings') body = LEGACY_renderSettings();
  else body = LEGACY_renderHome();
  return `
    <div class="legacy-banner">🗄️ <b>Legacy Records (Pre-v1.6.0)</b> — the original WBCYN registers, unchanged and fully functional. Data here is separate from the new e-Office system.</div>
    <div class="subtabs">${tabs}</div>
    ${body}
  `;
}

/* ================= HEADER, DEEP-LINK ROUTING, PWA, INIT ================= */
function wRenderHeader(){
  const nameEl = document.getElementById('headerRegistrarName');
  const roleEl = document.getElementById('headerRegistrarRole');
  if (nameEl) nameEl.textContent = wdb.settings.registrarName || 'Registrar';
  if (roleEl) roleEl.textContent = 'Registrar, WBCYN';
}
// Supports links from Personal Planner (../wbcyn/index.html#goto=assignments&id=...)
// so opening a linked deadline in WBCYN jumps straight to that record.
function handleDeepLinkHash(){
  const hash = window.location.hash;
  if (!hash || hash.indexOf('goto=') === -1) return;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const section = params.get('goto');
  const id = params.get('id');
  if (!section) return;
  goSection(section);
  if (id) {
    const cfg = WBCYN_MODULES[section];
    if (cfg && moduleById(cfg, id)) openModuleDetail(cfg, id);
  }
}
function isWbcynStandalone(){
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  return mm || window.navigator.standalone === true;
}
function isWbcynIOS(){ return /iphone|ipad|ipod/i.test(window.navigator.userAgent); }
function renderWbcynInstallBanner(){
  const root = document.getElementById('pwaBannerRoot');
  if (!root) return;
  if (isWbcynStandalone()) return;
  if (localStorage.getItem('wbcyn_install_banner_dismissed') === '1') return;
  if (!isWbcynIOS()) return;
  root.innerHTML = `<div class="pwa-install-banner" id="pwaBanner"><span>Install this app: tap the Share icon, then "Add to Home Screen".</span><button id="pwaBannerDismiss" class="dismiss">✕</button></div>`;
  document.getElementById('pwaBannerDismiss').addEventListener('click', () => { localStorage.setItem('wbcyn_install_banner_dismissed', '1'); root.innerHTML = ''; });
}
function registerWbcynServiceWorker(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('../service-worker.js').then((reg) => {
        if (typeof window.attachSWUpdateWatcher === 'function') window.attachSWUpdateWatcher(reg);
      }).catch((err) => console.warn('Service worker registration failed:', err));
    });
  }
}
async function wbcynInit(){
  await WBCYN_IDB.open();
  await loadWbcynDB();
  LEGACY_initData();
  wRenderHeader();
  renderNav();
  renderWbcyn();
  handleDeepLinkHash();
  const searchBtn = document.getElementById('wbcynSearchBtn');
  if (searchBtn) searchBtn.addEventListener('click', openUniversalSearch);
  // v1.6.1: on narrow screens the bottom nav has no scroll affordance, so
  // items past "File Movement" (including Settings, where Backup/Restore
  // live) were unreachable on iPhone. This header button is a permanent,
  // always-visible path to Settings on every screen size, independent of
  // the nav bar's scroll position.
  const settingsBtn = document.getElementById('wbcynSettingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', () => goSection('settings'));
}
wbcynInit().catch((err) => console.error('WBCYN init failed', err));
try { renderWbcynInstallBanner(); } catch (e) { console.warn('Install banner skipped:', e); }
try { registerWbcynServiceWorker(); } catch (e) { console.warn('Service worker registration skipped:', e); }

