'use strict';

/* ================= CONFIG ================= */
const STORAGE_KEY = 'wbcyn_registrar_db_v1';
const CATEGORIES = ['Administrative','Examination','Legal','RTI','Finance','Affiliated Institute','Registration','Government Correspondence','Meeting','Website','Other'];

const MODULES = {
  matters: {
    label:'Action Tracker', icon:'📋', dueField:'dueDate', isMatters:true,
    filterableKeys:['status','category','priority'],
    fields:[
      {key:'matterTitle', label:'Matter Title', type:'text', required:true},
      {key:'category', label:'Category', type:'select', options:CATEGORIES, required:true},
      {key:'description', label:'Description', type:'textarea'},
      {key:'fileNo', label:'File / Memo Number', type:'text'},
      {key:'dateReceived', label:'Date Received', type:'date'},
      {key:'dueDate', label:'Due Date', type:'date'},
      {key:'priority', label:'Priority', type:'select', options:['Low','Normal','High','Urgent'], required:true},
      {key:'status', label:'Status', type:'select', options:['Not Started','In Progress','Awaiting Reply','Submitted','Completed'], required:true},
      {key:'assignedTo', label:'Assigned To', type:'text'},
      {key:'nextAction', label:'Next Action Required', type:'textarea'},
      {key:'remarks', label:'Remarks', type:'textarea'}
    ],
    listCols:['matterTitle','category','dueDate','priority','status']
  },
  correspondence: {
    label:'Correspondence Register', icon:'✉️', dueField:'replyDueDate',
    filterableKeys:['status','letterType','mode'],
    fields:[
      {key:'date', label:'Date', type:'date'},
      {key:'memoNumber', label:'Memo Number', type:'text'},
      {key:'letterType', label:'Letter Type', type:'select', options:['Memo','Notice','Office Order','Circular','Forwarding Letter','Reminder','Reply','Government Letter','Legal Communication','Other']},
      {key:'subject', label:'Subject', type:'text'},
      {key:'sentToFrom', label:'Sent To / Received From', type:'text'},
      {key:'mode', label:'Mode', type:'select', options:['Email','Physical','e-Office','WhatsApp','Other']},
      {key:'status', label:'Current Status', type:'select', options:['Pending','Sent','Awaiting Reply','Replied','Closed']},
      {key:'replyDueDate', label:'Reply Due Date', type:'date'},
      {key:'remarks', label:'Remarks', type:'textarea'}
    ],
    listCols:['date','memoNumber','letterType','subject','status']
  },
  legal: {
    label:'Legal and Court Matters', icon:'⚖️', dueField:'nextHearingDate',
    filterableKeys:['currentStage'],
    fields:[
      {key:'caseNumber', label:'Case Number', type:'text'},
      {key:'caseTitle', label:'Case Title', type:'text'},
      {key:'court', label:'Court', type:'text'},
      {key:'petitioner', label:'Petitioner', type:'text'},
      {key:'respondent', label:'Respondent', type:'text'},
      {key:'advocate', label:'Advocate', type:'text'},
      {key:'nextHearingDate', label:'Next Hearing Date', type:'date'},
      {key:'currentStage', label:'Current Stage', type:'select', options:['Filed','Admitted','Hearing','Reserved for Judgment','Disposed','Other']},
      {key:'actionRequired', label:'Action Required', type:'textarea'},
      {key:'lastUpdate', label:'Last Update', type:'date'},
      {key:'remarks', label:'Remarks', type:'textarea'}
    ],
    listCols:['caseNumber','caseTitle','court','nextHearingDate','currentStage']
  },
  rti: {
    label:'RTI Register', icon:'📄', dueField:'replyDueDate',
    filterableKeys:['status','firstAppealStatus'],
    fields:[
      {key:'rtiNumber', label:'RTI Application Number', type:'text'},
      {key:'applicantName', label:'Applicant Name', type:'text'},
      {key:'dateReceived', label:'Date Received', type:'date'},
      {key:'subject', label:'Subject', type:'text'},
      {key:'informationSought', label:'Information Sought', type:'textarea'},
      {key:'replyDueDate', label:'Reply Due Date', type:'date'},
      {key:'replyDate', label:'Reply Date', type:'date'},
      {key:'status', label:'Status', type:'select', options:['Pending','Replied','Rejected','Transferred','Disposed']},
      {key:'firstAppealStatus', label:'First Appeal Status', type:'select', options:['Not Filed','Pending','Disposed']},
      {key:'remarks', label:'Remarks', type:'textarea'}
    ],
    listCols:['rtiNumber','applicantName','dateReceived','replyDueDate','status']
  },
  meetings: {
    label:'Meetings and Resolutions', icon:'🗓️', dueField:'deadline',
    filterableKeys:['status'],
    fields:[
      {key:'meetingTitle', label:'Meeting Title', type:'text'},
      {key:'dateTime', label:'Date and Time', type:'datetime-local'},
      {key:'venue', label:'Venue', type:'text'},
      {key:'participants', label:'Participants', type:'textarea'},
      {key:'agenda', label:'Agenda', type:'textarea'},
      {key:'decisions', label:'Decisions / Resolutions', type:'textarea'},
      {key:'followUpAction', label:'Follow-up Action', type:'text'},
      {key:'responsiblePerson', label:'Responsible Person', type:'text'},
      {key:'deadline', label:'Deadline', type:'date'},
      {key:'status', label:'Status', type:'select', options:['Scheduled','Held','Pending Action','Completed']}
    ],
    listCols:['meetingTitle','dateTime','venue','deadline','status']
  },
  examinations: {
    label:'Examination Management', icon:'📝', dueField:null,
    filterableKeys:['resultStatus'],
    fields:[
      {key:'session', label:'Session', type:'text'},
      {key:'examName', label:'Examination Name', type:'text'},
      {key:'theoryDate', label:'Theory Examination Date', type:'date'},
      {key:'practicalDate', label:'Practical Examination Date', type:'date'},
      {key:'centre', label:'Examination Centre', type:'text'},
      {key:'numInstitutes', label:'Number of Institutes', type:'number'},
      {key:'numStudents', label:'Number of Students', type:'number'},
      {key:'examinerStatus', label:'Examiner Submission Status', type:'select', options:['Pending','In Progress','Completed']},
      {key:'questionPaperStatus', label:'Question Paper Status', type:'select', options:['Pending','In Progress','Completed']},
      {key:'admitCardStatus', label:'Admit Card Status', type:'select', options:['Pending','Issued']},
      {key:'resultStatus', label:'Result Status', type:'select', options:['Pending','Declared']},
      {key:'remarks', label:'Remarks', type:'textarea'}
    ],
    listCols:['session','examName','theoryDate','practicalDate','resultStatus']
  },
  institutes: {
    label:'Affiliated Institutes', icon:'🏫', dueField:'affiliationValidity',
    filterableKeys:['affiliationStatus'],
    fields:[
      {key:'instituteName', label:'Institute Name', type:'text'},
      {key:'instituteCode', label:'Institute Code', type:'text'},
      {key:'principal', label:'Principal / Head', type:'text'},
      {key:'address', label:'Address', type:'textarea'},
      {key:'mobile', label:'Mobile Number', type:'text'},
      {key:'email', label:'Email', type:'text'},
      {key:'affiliationStatus', label:'Affiliation Status', type:'select', options:['Active','Expired','Pending','Suspended']},
      {key:'affiliationValidity', label:'Affiliation Validity', type:'date'},
      {key:'numStudents', label:'Number of Students', type:'number'},
      {key:'remarks', label:'Remarks', type:'textarea'}
    ],
    listCols:['instituteName','instituteCode','principal','affiliationStatus','affiliationValidity']
  },
  trainers: {
    label:'Registered Yoga Trainers', icon:'🧘', dueField:null,
    filterableKeys:['status'],
    fields:[
      {key:'regNumber', label:'Registration Number', type:'text'},
      {key:'name', label:'Name', type:'text'},
      {key:'dateOfRegistration', label:'Date of Registration', type:'date'},
      {key:'mobile', label:'Mobile Number', type:'text'},
      {key:'address', label:'Address', type:'textarea'},
      {key:'status', label:'Registration Status', type:'select', options:['Active','Expired','Suspended']},
      {key:'remarks', label:'Remarks', type:'textarea'}
    ],
    listCols:['regNumber','name','dateOfRegistration','status']
  },
  contacts: {
    label:'Important Contacts', icon:'📇', dueField:null,
    filterableKeys:[],
    fields:[
      {key:'name', label:'Name', type:'text'},
      {key:'designation', label:'Designation', type:'text'},
      {key:'department', label:'Department / Organisation', type:'text'},
      {key:'mobile', label:'Mobile Number', type:'text'},
      {key:'email', label:'Email', type:'text'},
      {key:'remarks', label:'Remarks', type:'textarea'}
    ],
    listCols:['name','designation','department','mobile']
  }
};
const REGISTER_ORDER = ['correspondence','legal','rti','meetings','examinations','institutes','trainers','contacts','archive'];

/* ================= STATE ================= */
let DB = null;
let state = { view:'home', register:'correspondence', search:'', filters:{}, editModule:null };

/* ================= UTIL ================= */
function uid(){ return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function daysUntil(dateStr){ if(!dateStr) return null; const d=new Date(dateStr+'T00:00:00'); const t=new Date(); t.setHours(0,0,0,0); return Math.round((d-t)/86400000); }
function fmtDate(dateStr){ if(!dateStr) return '—'; try{ const d=new Date(dateStr.length>10?dateStr:dateStr+'T00:00:00'); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }catch(e){return dateStr;} }
function esc(s){ return (s===undefined||s===null)?'':String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function saveDB(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
function loadDB(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){ try{ return JSON.parse(raw); }catch(e){ /* fallthrough to fresh */ } }
  return null;
}
function freshDB(){
  return {
    matters:[], correspondence:[], legal:[], rti:[], meetings:[], examinations:[], institutes:[], trainers:[], contacts:[],
    settings:{ registrarName:'Dr. M. Jahangir', officeName:'West Bengal Council of Yoga and Naturopathy',
      officeAddress:'Purta Bhawan, Room No. 107, Block-DF, Sector-I, Bidhannagar, Kolkata – 700091' },
    seeded:false
  };
}
function ensureShape(db){
  const f = freshDB();
  Object.keys(f).forEach(k=>{ if(!(k in db)) db[k]=f[k]; });
  if(!db.settings) db.settings = f.settings;
  return db;
}

/* ================= SAMPLE DATA ================= */
function seedSampleData(){
  DB.matters.push(
    {id:uid(), _sample:true, matterTitle:'Reply to Directorate on Annual Report', category:'Government Correspondence', description:'Submit annual report to the Department of AYUSH.', fileNo:'WBCYN/AR/2026/12', dateReceived:addDays(-10), dueDate:addDays(-5), priority:'Urgent', status:'In Progress', assignedTo:'Registrar Office', nextAction:'Finalise draft and obtain signature', remarks:'Follow up pending'},
    {id:uid(), _sample:true, matterTitle:'Issue Admit Cards for July Exam', category:'Examination', description:'Generate and dispatch admit cards to affiliated institutes.', fileNo:'WBCYN/EX/2026/45', dateReceived:addDays(-3), dueDate:addDays(0), priority:'High', status:'Awaiting Reply', assignedTo:'Exam Section', nextAction:'Coordinate with printing unit', remarks:''},
    {id:uid(), _sample:true, matterTitle:'Institute Affiliation Renewal - Sample Institute', category:'Affiliated Institute', description:'Process renewal application.', fileNo:'WBCYN/AI/2026/09', dateReceived:addDays(-2), dueDate:addDays(4), priority:'Normal', status:'Not Started', assignedTo:'Affiliation Cell', nextAction:'Site inspection', remarks:''},
    {id:uid(), _sample:true, matterTitle:'Update Council Website Notice Board', category:'Website', description:'Upload latest circular to website.', fileNo:'WBCYN/WB/2026/03', dateReceived:addDays(-1), dueDate:addDays(20), priority:'Low', status:'Not Started', assignedTo:'IT Cell', nextAction:'Send content to webmaster', remarks:''},
    {id:uid(), _sample:true, matterTitle:'Finance Audit Query Response', category:'Finance', description:'Respond to internal audit observations.', fileNo:'WBCYN/FIN/2026/21', dateReceived:addDays(-20), dueDate:addDays(-15), priority:'High', status:'Completed', assignedTo:'Accounts Section', nextAction:'', remarks:'Submitted to audit team', completedDate:addDays(-14)}
  );
  DB.correspondence.push(
    {id:uid(), _sample:true, date:addDays(-6), memoNumber:'WBCYN/COR/101', letterType:'Government Letter', subject:'Request for guidelines on new curriculum', sentToFrom:'Department of AYUSH, Govt. of WB', mode:'e-Office', status:'Awaiting Reply', replyDueDate:addDays(2), remarks:''},
    {id:uid(), _sample:true, date:addDays(-2), memoNumber:'WBCYN/COR/102', letterType:'Circular', subject:'Office order on examination duty', sentToFrom:'All Affiliated Institutes', mode:'Email', status:'Sent', replyDueDate:'', remarks:'Circulated to all institutes'}
  );
  DB.legal.push(
    {id:uid(), _sample:true, caseNumber:'WP 1234/2026', caseTitle:'Sample Petitioner vs WBCYN', court:'Calcutta High Court', petitioner:'Sample Petitioner', respondent:'WBCYN', advocate:'Adv. S. Roy', nextHearingDate:addDays(6), currentStage:'Hearing', actionRequired:'Prepare affidavit-in-opposition', lastUpdate:addDays(-3), remarks:''}
  );
  DB.rti.push(
    {id:uid(), _sample:true, rtiNumber:'RTI/2026/077', applicantName:'Sample Applicant', dateReceived:addDays(-8), subject:'Details of registered yoga trainers', informationSought:'List of trainers registered in 2025-26', replyDueDate:addDays(2), replyDate:'', status:'Pending', firstAppealStatus:'Not Filed', remarks:''}
  );
  DB.meetings.push(
    {id:uid(), _sample:true, meetingTitle:'Governing Council Meeting - Q2', dateTime:addDays(-4)+'T11:00', venue:'Council Office, Purta Bhawan', participants:'Council Members', agenda:'Review of affiliation renewals; Examination calendar', decisions:'Approved renewal of 3 institutes; Exam dates fixed', followUpAction:'Issue office order on exam dates', responsiblePerson:'Registrar', deadline:addDays(3), status:'Pending Action'}
  );
  DB.examinations.push(
    {id:uid(), _sample:true, session:'2025-26', examName:'Diploma in Yoga Science - Annual Exam', theoryDate:addDays(15), practicalDate:addDays(20), centre:'Kolkata Regional Centre', numInstitutes:12, numStudents:340, examinerStatus:'In Progress', questionPaperStatus:'Completed', admitCardStatus:'Pending', resultStatus:'Pending', remarks:''}
  );
  DB.institutes.push(
    {id:uid(), _sample:true, instituteName:'Sample Yoga & Naturopathy College', instituteCode:'WBCYN-INS-001', principal:'Dr. A. Sen', address:'Kolkata, West Bengal', mobile:'9800000000', email:'info@sampleinstitute.edu', affiliationStatus:'Active', affiliationValidity:addDays(180), numStudents:120, remarks:''}
  );
  DB.trainers.push(
    {id:uid(), _sample:true, regNumber:'WBCYN-TR-2026-001', name:'Sample Trainer', dateOfRegistration:addDays(-100), mobile:'9800000001', address:'Kolkata', status:'Active', remarks:''}
  );
  DB.contacts.push(
    {id:uid(), _sample:true, name:'Shri A. Kumar', designation:'Joint Secretary', department:'Dept. of AYUSH, Govt. of WB', mobile:'9800000002', email:'ayush.dept@wb.gov.in', remarks:'Nodal officer'},
    {id:uid(), _sample:true, name:'Ms. R. Das', designation:'System Administrator', department:'WBCYN IT Cell', mobile:'9800000003', email:'it@wbcyn.org', remarks:'Website / server support'}
  );
  DB.seeded = true;
}

/* ================= INIT ================= */
function init(){
  DB = loadDB();
  if(!DB){ DB = freshDB(); }
  DB = ensureShape(DB);
  if(!DB.seeded && DB.matters.length===0){ seedSampleData(); saveDB(); }
  renderNav();
  renderHeader();
  render();
}
function renderHeader(){
  const nameEl = document.getElementById('headerRegistrarName');
  const roleEl = document.getElementById('headerRegistrarRole');
  if(nameEl) nameEl.textContent = DB.settings.registrarName || 'Registrar';
  if(roleEl) roleEl.textContent = 'Registrar, WBCYN';
}

/* ================= NAV ================= */
const NAV_ITEMS = [
  {id:'home', label:'Home', icon:'🏠'},
  {id:'matters', label:'Matters', icon:'📋'},
  {id:'registers', label:'Registers', icon:'📚'},
  {id:'reports', label:'Reports', icon:'📊'},
  {id:'settings', label:'Settings', icon:'⚙️'}
];
function renderNav(){
  const html = NAV_ITEMS.map(it=>`<button data-nav="${it.id}" class="${state.view===it.id?'active':''}"><span class="ic">${it.icon}</span><span>${it.label}</span></button>`).join('');
  document.getElementById('topnav').innerHTML = html;
  document.getElementById('bottomnav').innerHTML = html;
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{ state.view=b.dataset.nav; state.search=''; state.filters={}; renderNav(); render(); }));
}

/* ================= RENDER DISPATCH ================= */
function render(){
  const app = document.getElementById('app');
  if(state.view==='home') app.innerHTML = renderHome();
  else if(state.view==='matters') app.innerHTML = renderRegister('matters');
  else if(state.view==='registers') app.innerHTML = renderRegistersWrap();
  else if(state.view==='reports') app.innerHTML = renderReports();
  else if(state.view==='settings') app.innerHTML = renderSettings();
  attachCommonHandlers();
  if(state.view==='matters') attachRegisterHandlers('matters');
  if(state.view==='registers') attachRegisterHandlers(state.register);
  if(state.view==='reports') drawReportCharts();
  if(state.view==='settings') attachSettingsHandlers();
}

/* ================= HOME ================= */
function counts(){
  const m = DB.matters;
  const notCompleted = m.filter(x=>x.status!=='Completed');
  return {
    totalPending: notCompleted.length,
    urgent: notCompleted.filter(x=>x.priority==='Urgent').length,
    dueThisWeek: notCompleted.filter(x=>{ const d=daysUntil(x.dueDate); return d!==null && d>=0 && d<=7; }).length,
    pendingLetters: DB.correspondence.filter(x=>!['Replied','Closed'].includes(x.status)).length,
    pendingRTI: DB.rti.filter(x=>x.status==='Pending').length,
    legalMatters: DB.legal.filter(x=>x.currentStage!=='Disposed').length,
    examMatters: DB.examinations.filter(x=>x.resultStatus!=='Declared').length,
    completed: m.filter(x=>x.status==='Completed').length
  };
}
function renderHome(){
  const c = counts();
  const cards = [
    {lbl:'Total Pending Matters', num:c.totalPending, icon:'📋'},
    {lbl:'Urgent Matters', num:c.urgent, icon:'🔴'},
    {lbl:'Due This Week', num:c.dueThisWeek, icon:'⏳'},
    {lbl:'Pending Letters', num:c.pendingLetters, icon:'✉️'},
    {lbl:'Pending RTI Matters', num:c.pendingRTI, icon:'📄'},
    {lbl:'Legal Matters', num:c.legalMatters, icon:'⚖️'},
    {lbl:'Examination Matters', num:c.examMatters, icon:'📝'},
    {lbl:'Completed Matters', num:c.completed, icon:'✅'}
  ];
  const cardsHtml = cards.map(cd=>`<div class="card"><span class="icon">${cd.icon}</span><span class="num">${cd.num}</span><span class="lbl">${cd.lbl}</span></div>`).join('');

  const upcoming = DB.matters.filter(x=>x.status!=='Completed' && x.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,8);
  const deadlineRows = upcoming.map(m=>{
    const d = daysUntil(m.dueDate);
    let cls='row-green', badge='';
    if(d<0){cls='row-red'; badge='<span class="badge badge-red">Overdue</span>';}
    else if(d===0){cls='row-orange'; badge='<span class="badge badge-orange">Due Today</span>';}
    else if(d<=7){cls='row-yellow'; badge='<span class="badge badge-yellow">Due Soon</span>';}
    else {cls=''; badge='<span class="badge badge-grey">Upcoming</span>';}
    return `<div class="deadline-row ${cls}"><div><div class="title">${esc(m.matterTitle)}</div><div class="meta">${esc(m.category)} &middot; Due ${fmtDate(m.dueDate)}</div></div>${badge}</div>`;
  }).join('') || '<div class="empty-note">No upcoming deadlines.</div>';

  return `
    <div class="section-title">📊 Dashboard Overview</div>
    <div class="cards-grid">${cardsHtml}</div>
    <div class="section-title">⏳ Upcoming Deadlines</div>
    <div class="deadline-list">${deadlineRows}</div>
  `;
}

/* ================= REGISTERS WRAP (sub tabs) ================= */
function renderRegistersWrap(){
  const tabs = REGISTER_ORDER.map(id=>{
    const label = id==='archive' ? 'Completed Work Archive' : MODULES[id].label;
    const icon = id==='archive' ? '🗄️' : MODULES[id].icon;
    return `<button data-reg="${id}" class="${state.register===id?'active':''}">${icon} ${label}</button>`;
  }).join('');
  return `<div class="subtabs">${tabs}</div><div id="registerHost">${renderRegister(state.register)}</div>`;
}

/* ================= GENERIC REGISTER RENDER ================= */
function getRecords(moduleId){
  if(moduleId==='archive') return DB.matters.filter(m=>m.status==='Completed');
  return DB[moduleId];
}
function moduleConfig(moduleId){
  if(moduleId==='archive') return MODULES.matters;
  return MODULES[moduleId];
}
function badgeForRecord(moduleId, rec){
  const cfg = moduleConfig(moduleId);
  if(moduleId==='matters' && rec.status==='Completed') return {cls:'row-green', badge:'<span class="badge badge-green">Completed</span>'};
  if(moduleId==='archive') return {cls:'row-green', badge:'<span class="badge badge-green">Completed</span>'};
  if(!cfg.dueField) return {cls:'', badge:''};
  const d = daysUntil(rec[cfg.dueField]);
  if(d===null) return {cls:'', badge:''};
  if(d<0) return {cls:'row-red', badge:'<span class="badge badge-red">Overdue</span>'};
  if(d===0) return {cls:'row-orange', badge:'<span class="badge badge-orange">Due Today</span>'};
  if(d<=7) return {cls:'row-yellow', badge:'<span class="badge badge-yellow">Due Soon</span>'};
  return {cls:'', badge:''};
}
function matchesFilters(moduleId, rec){
  const s = (state.filters.search||'').toLowerCase();
  if(s){
    const cfg = moduleConfig(moduleId);
    const hay = cfg.fields.map(f=>rec[f.key]).join(' ').toLowerCase();
    if(!hay.includes(s)) return false;
  }
  for(const k in state.filters){
    if(k==='search') continue;
    const v = state.filters[k];
    if(v && v!=='All' && rec[k]!==v) return false;
  }
  return true;
}
function renderRegister(moduleId){
  const cfg = moduleConfig(moduleId);
  const isArchive = moduleId==='archive';
  let records = getRecords(moduleId).filter(r=>matchesFilters(moduleId,r));
  if(moduleId==='matters') records = records.slice().sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));

  const filterSelects = (cfg.filterableKeys||[]).map(key=>{
    const f = cfg.fields.find(x=>x.key===key);
    if(!f) return '';
    const opts = ['All',...f.options].map(o=>`<option value="${esc(o)}" ${state.filters[key]===o?'selected':''}>${esc(o)}</option>`).join('');
    return `<select data-filter="${key}">${opts}</select>`;
  }).join('');

  const quickDeadlineBtns = moduleId==='matters' ? `
    <select data-filter="__due">
      <option value="">All Due Dates</option>
      <option value="overdue" ${state.filters.__due==='overdue'?'selected':''}>Overdue</option>
      <option value="today" ${state.filters.__due==='today'?'selected':''}>Due Today</option>
      <option value="week" ${state.filters.__due==='week'?'selected':''}>Due This Week</option>
    </select>` : '';

  if(moduleId==='matters' && state.filters.__due){
    records = records.filter(r=>{
      if(r.status==='Completed') return false;
      const d = daysUntil(r.dueDate);
      if(d===null) return false;
      if(state.filters.__due==='overdue') return d<0;
      if(state.filters.__due==='today') return d===0;
      if(state.filters.__due==='week') return d>=0 && d<=7;
      return true;
    });
  }

  const cols = cfg.listCols;
  const thead = cols.map(c=>`<th>${esc(cfg.fields.find(f=>f.key===c)?.label || c)}</th>`).join('') + '<th>Flag</th><th class="no-print">Actions</th>';
  const rows = records.map(rec=>{
    const b = badgeForRecord(moduleId, rec);
    const tds = cols.map(c=>{
      const f = cfg.fields.find(x=>x.key===c);
      let val = rec[c];
      if(f && (f.type==='date')) val = fmtDate(val);
      return `<td>${esc(val)||'—'}</td>`;
    }).join('');
    let actionBtns = `<button class="btn sm secondary" data-view="${rec.id}" data-mod="${moduleId}">View</button>`;
    if(!isArchive){
      actionBtns += ` <button class="btn sm grey" data-edit="${rec.id}" data-mod="${moduleId}">Edit</button>`;
      if(moduleId==='matters' && rec.status!=='Completed') actionBtns += ` <button class="btn sm" style="background:var(--green);border-color:var(--green)" data-complete="${rec.id}">Complete</button>`;
      actionBtns += ` <button class="btn sm danger" data-del="${rec.id}" data-mod="${moduleId}">Delete</button>`;
    } else {
      actionBtns += ` <button class="btn sm" style="background:var(--accent);border-color:var(--accent)" data-restore="${rec.id}">Restore</button>`;
      actionBtns += ` <button class="btn sm danger" data-del="${rec.id}" data-mod="matters">Delete</button>`;
    }
    return `<tr class="${b.cls}">${tds}<td>${b.badge}</td><td class="actions-cell no-print">${actionBtns}</td></tr>`;
  }).join('') || `<tr><td colspan="${cols.length+2}"><div class="empty-note">No records found.</div></td></tr>`;

  const title = isArchive ? 'Completed Work Archive' : cfg.label;
  const addBtn = isArchive ? '' : `<button class="btn" id="btnAddRecord" data-mod="${moduleId}">+ Add New ${moduleId==='matters'?'Matter':'Record'}</button>`;

  return `
    <div class="print-only"><strong>${esc(DB.settings.officeName)}</strong><br>${esc(title)} — Printed on ${fmtDate(todayISO())}</div>
    <div class="section-title no-print">${cfg.icon||'🗄️'} ${title}</div>
    <div class="toolbar no-print">
      ${addBtn}
      <input type="text" id="searchBox" placeholder="Search..." value="${esc(state.filters.search||'')}">
      ${filterSelects}
      ${quickDeadlineBtns}
      <span class="spacer"></span>
      <button class="btn secondary" id="btnExportCSV" data-mod="${moduleId}">Export CSV</button>
      <button class="btn secondary" id="btnPrint">Print</button>
    </div>
    <div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${rows}</tbody></table></div>
  `;
}

/* ================= HANDLERS: register view ================= */
function attachCommonHandlers(){
  document.querySelectorAll('[data-reg]').forEach(b=>b.addEventListener('click',()=>{
    state.register = b.dataset.reg; state.filters={}; render();
  }));
}
function attachRegisterHandlers(moduleId){
  const searchBox = document.getElementById('searchBox');
  if(searchBox) searchBox.addEventListener('input', e=>{ state.filters.search = e.target.value; render(); });
  document.querySelectorAll('[data-filter]').forEach(sel=>sel.addEventListener('change', e=>{
    const key = e.target.dataset.filter;
    state.filters[key] = e.target.value==='All'?'':e.target.value;
    render();
  }));
  const addBtn = document.getElementById('btnAddRecord');
  if(addBtn) addBtn.addEventListener('click', ()=>openForm(addBtn.dataset.mod));
  document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openForm(b.dataset.mod, b.dataset.edit)));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.mod, b.dataset.view)));
  document.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>deleteRecord(b.dataset.mod, b.dataset.del)));
  document.querySelectorAll('[data-complete]').forEach(b=>b.addEventListener('click',()=>completeMatter(b.dataset.complete)));
  document.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click',()=>restoreMatter(b.dataset.restore)));
  const exportBtn = document.getElementById('btnExportCSV');
  if(exportBtn) exportBtn.addEventListener('click',()=>exportCSV(exportBtn.dataset.mod));
  const printBtn = document.getElementById('btnPrint');
  if(printBtn) printBtn.addEventListener('click',()=>window.print());
}

/* ================= CRUD ================= */
function fieldInputHTML(field, value){
  const req = field.required?'required':'';
  if(field.type==='select'){
    const opts = field.options.map(o=>`<option value="${esc(o)}" ${o===value?'selected':''}>${esc(o)}</option>`).join('');
    return `<select name="${field.key}" ${req}><option value="">Select...</option>${opts}</select>`;
  }
  if(field.type==='textarea'){
    return `<textarea name="${field.key}" ${req}>${esc(value)}</textarea>`;
  }
  return `<input type="${field.type}" name="${field.key}" value="${esc(value)}" ${req}>`;
}
function openForm(moduleId, id){
  const cfg = moduleConfig(moduleId);
  const records = getRecords(moduleId);
  const existing = id ? records.find(r=>r.id===id) : null;
  const title = existing ? `Edit ${cfg.label.replace(/s$/,'')}` : `Add New ${moduleId==='matters'?'Matter':cfg.label.replace(/ Register| Management| and Court Matters| and Resolutions/,'')}`;
  const fieldsHtml = cfg.fields.map(f=>{
    const full = f.type==='textarea' ? 'full' : '';
    return `<div class="form-field ${full}"><label>${esc(f.label)}${f.required?' *':''}</label>${fieldInputHTML(f, existing? existing[f.key]: '')}</div>`;
  }).join('');
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h2>${title}</h2>
        <form id="recordForm">
          <div class="form-grid">${fieldsHtml}</div>
          <div class="modal-actions">
            <button type="button" class="btn grey" id="btnCancel">Cancel</button>
            <button type="submit" class="btn">Save</button>
          </div>
        </form>
      </div>
    </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  document.getElementById('btnCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay') closeModal(); });
  document.getElementById('recordForm').addEventListener('submit', e=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = existing ? {...existing} : {id: uid()};
    cfg.fields.forEach(f=>{ data[f.key] = fd.get(f.key) || ''; });
    if(moduleId==='matters'){
      if(data.status==='Completed' && (!existing || existing.status!=='Completed')) data.completedDate = todayISO();
      if(data.status!=='Completed') data.completedDate = '';
      if(existing && existing._sample) data._sample = true;
    } else if(existing && existing._sample){ data._sample = true; }
    const arr = DB[moduleId==='archive'?'matters':moduleId];
    const idx = arr.findIndex(r=>r.id===data.id);
    if(idx>=0) arr[idx] = data; else arr.push(data);
    saveDB();
    closeModal();
    render();
  });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }

function openDetail(moduleId, id){
  const cfg = moduleConfig(moduleId);
  const rec = getRecords(moduleId).find(r=>r.id===id);
  if(!rec) return;
  const rows = cfg.fields.map(f=>{
    let val = rec[f.key];
    if(f.type==='date') val = fmtDate(val);
    const full = f.type==='textarea' ? 'full' : '';
    return `<div class="${full}"><div class="dl">${esc(f.label)}</div><div class="dv">${esc(val)||'—'}</div></div>`;
  }).join('');
  const isArchive = moduleId==='archive';
  let extraBtns = '';
  if(!isArchive){
    extraBtns += `<button class="btn secondary" id="btnDetailEdit">Edit</button>`;
    if(moduleId==='matters' && rec.status!=='Completed') extraBtns += `<button class="btn" style="background:var(--green);border-color:var(--green)" id="btnDetailComplete">Mark Complete</button>`;
    extraBtns += `<button class="btn danger" id="btnDetailDelete">Delete</button>`;
  } else {
    extraBtns += `<button class="btn" id="btnDetailRestore">Restore</button>`;
    extraBtns += `<button class="btn danger" id="btnDetailDelete">Delete</button>`;
  }
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h2>${esc(cfg.label)} — Details</h2>
        <div class="detail-grid">${rows}</div>
        <div class="modal-actions">
          <button class="btn grey" id="btnDetailClose">Close</button>
          ${extraBtns}
        </div>
      </div>
    </div>`;
  document.getElementById('btnDetailClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay') closeModal(); });
  const editB = document.getElementById('btnDetailEdit');
  if(editB) editB.addEventListener('click', ()=>{ closeModal(); openForm(moduleId, id); });
  const delB = document.getElementById('btnDetailDelete');
  if(delB) delB.addEventListener('click', ()=>{ closeModal(); deleteRecord(moduleId, id); });
  const compB = document.getElementById('btnDetailComplete');
  if(compB) compB.addEventListener('click', ()=>{ closeModal(); completeMatter(id); });
  const restB = document.getElementById('btnDetailRestore');
  if(restB) restB.addEventListener('click', ()=>{ closeModal(); restoreMatter(id); });
}

function deleteRecord(moduleId, id){
  if(!confirm('Are you sure you want to delete this record? This cannot be undone.')) return;
  const arr = DB[moduleId==='archive'?'matters':moduleId];
  const idx = arr.findIndex(r=>r.id===id);
  if(idx>=0) arr.splice(idx,1);
  saveDB();
  render();
}
function completeMatter(id){
  const rec = DB.matters.find(r=>r.id===id);
  if(!rec) return;
  rec.status='Completed'; rec.completedDate=todayISO();
  saveDB(); render();
}
function restoreMatter(id){
  const rec = DB.matters.find(r=>r.id===id);
  if(!rec) return;
  rec.status='Not Started'; rec.completedDate='';
  saveDB(); render();
}

/* ================= CSV EXPORT ================= */
function csvEscape(v){
  const s = (v===undefined||v===null)?'':String(v);
  if(/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
  return s;
}
function exportCSV(moduleId){
  const cfg = moduleConfig(moduleId);
  const records = getRecords(moduleId);
  const headers = cfg.fields.map(f=>f.label);
  const lines = [headers.map(csvEscape).join(',')];
  records.forEach(r=>{ lines.push(cfg.fields.map(f=>csvEscape(r[f.key])).join(',')); });
  const blob = new Blob([lines.join('\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `WBCYN_${moduleId}_${todayISO()}.csv`;
  a.click();
}

/* ================= REPORTS ================= */
function groupCount(arr, key){
  const m = {};
  arr.forEach(r=>{ const v = r[key]||'Unspecified'; m[v]=(m[v]||0)+1; });
  return m;
}
function renderReports(){
  const pendingMatters = DB.matters.filter(m=>m.status!=='Completed');
  const overdue = pendingMatters.filter(m=>daysUntil(m.dueDate)<0);
  const dueSoon = pendingMatters.filter(m=>{ const d=daysUntil(m.dueDate); return d!==null && d>=0 && d<=7; });
  const completedByMonth = {};
  DB.matters.filter(m=>m.status==='Completed' && m.completedDate).forEach(m=>{
    const mo = m.completedDate.slice(0,7);
    completedByMonth[mo] = (completedByMonth[mo]||0)+1;
  });

  const overdueRows = overdue.map(m=>`<div class="deadline-row row-red"><div><div class="title">${esc(m.matterTitle)}</div><div class="meta">${esc(m.category)} &middot; Due ${fmtDate(m.dueDate)}</div></div><span class="badge badge-red">Overdue</span></div>`).join('') || '<div class="empty-note">No overdue matters.</div>';
  const dueSoonRows = dueSoon.map(m=>`<div class="deadline-row row-yellow"><div><div class="title">${esc(m.matterTitle)}</div><div class="meta">${esc(m.category)} &middot; Due ${fmtDate(m.dueDate)}</div></div><span class="badge badge-yellow">Due Soon</span></div>`).join('') || '<div class="empty-note">No matters due in the next 7 days.</div>';

  const examRows = DB.examinations.map(e=>`<tr><td>${esc(e.session)}</td><td>${esc(e.examName)}</td><td>${esc(e.examinerStatus)}</td><td>${esc(e.questionPaperStatus)}</td><td>${esc(e.admitCardStatus)}</td><td>${esc(e.resultStatus)}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-note">No examination records.</div></td></tr>';

  return `
    <div class="section-title no-print">📊 Reports</div>
    <div class="toolbar no-print"><button class="btn secondary" id="btnPrintReports">Print Reports</button></div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Pending Matters by Category</h3><canvas id="chartCategory"></canvas></div>
      <div class="chart-card"><h3>Pending Matters by Status</h3><canvas id="chartStatus"></canvas></div>
      <div class="chart-card"><h3>Priority-wise Matters</h3><canvas id="chartPriority"></canvas></div>
      <div class="chart-card"><h3>Monthly Completed Work</h3><canvas id="chartMonthly"></canvas></div>
      <div class="chart-card"><h3>RTI Status Summary</h3><canvas id="chartRTI"></canvas></div>
      <div class="chart-card"><h3>Legal Matter Summary</h3><canvas id="chartLegal"></canvas></div>
    </div>
    <div class="section-title">🔴 Overdue Matters (${overdue.length})</div>
    <div class="deadline-list">${overdueRows}</div>
    <div class="section-title">🟡 Due in Next 7 Days (${dueSoon.length})</div>
    <div class="deadline-list">${dueSoonRows}</div>
    <div class="section-title">📝 Examination Progress</div>
    <div class="table-wrap"><table><thead><tr><th>Session</th><th>Exam</th><th>Examiner Status</th><th>Question Paper</th><th>Admit Card</th><th>Result</th></tr></thead><tbody>${examRows}</tbody></table></div>
  `;
}
let chartInstances = [];
function drawReportCharts(){
  if(typeof Chart==='undefined'){
    document.querySelectorAll('.chart-card canvas').forEach(cv=>{
      const note = document.createElement('div');
      note.className='empty-note';
      note.textContent='Charts unavailable offline (no internet connection to load chart library).';
      cv.replaceWith(note);
    });
    return;
  }
  chartInstances.forEach(c=>c.destroy());
  chartInstances = [];
  const pendingMatters = DB.matters.filter(m=>m.status!=='Completed');
  const catData = groupCount(pendingMatters,'category');
  const statusData = groupCount(pendingMatters,'status');
  const prioData = groupCount(pendingMatters,'priority');
  const rtiData = groupCount(DB.rti,'status');
  const legalData = groupCount(DB.legal,'currentStage');
  const monthData = {};
  DB.matters.filter(m=>m.status==='Completed' && m.completedDate).forEach(m=>{ const mo=m.completedDate.slice(0,7); monthData[mo]=(monthData[mo]||0)+1; });

  const palette = ['#1565c0','#0b3d66','#42a5f5','#90caf9','#fb8c00','#e53935','#2e7d32','#f9a825','#8e24aa','#00897b'];
  function bar(id,data,label){
    const ctx = document.getElementById(id); if(!ctx) return;
    chartInstances.push(new Chart(ctx,{type:'bar',data:{labels:Object.keys(data),datasets:[{label:label,data:Object.values(data),backgroundColor:palette}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}}));
  }
  function pie(id,data){
    const ctx = document.getElementById(id); if(!ctx) return;
    chartInstances.push(new Chart(ctx,{type:'pie',data:{labels:Object.keys(data),datasets:[{data:Object.values(data),backgroundColor:palette}]}}));
  }
  bar('chartCategory', catData, 'Pending Matters');
  pie('chartStatus', statusData);
  pie('chartPriority', prioData);
  bar('chartMonthly', monthData, 'Completed');
  pie('chartRTI', rtiData);
  bar('chartLegal', legalData, 'Cases');
  const pb = document.getElementById('btnPrintReports');
  if(pb) pb.addEventListener('click',()=>window.print());
}

/* ================= SETTINGS ================= */
function renderSettings(){
  const s = DB.settings;
  return `
    <div class="section-title">⚙️ Settings</div>
    <div class="settings-block">
      <h3>Office & Registrar Details</h3>
      <div class="form-field"><label>Registrar Name</label><input type="text" id="setRegistrar" value="${esc(s.registrarName)}"></div>
      <div class="form-field"><label>Office Name</label><input type="text" id="setOfficeName" value="${esc(s.officeName)}"></div>
      <div class="form-field"><label>Office Address</label><textarea id="setOfficeAddress">${esc(s.officeAddress)}</textarea></div>
      <button class="btn" id="btnSaveSettings">Save Details</button>
    </div>
    <div class="settings-block">
      <h3>Data Management</h3>
      <p style="color:var(--muted);font-size:13.5px;">Backup your data regularly. All data is stored only on this device's browser storage.</p>
      <button class="btn secondary" id="btnBackup">Export Backup (JSON)</button>
      <button class="btn secondary" id="btnRestoreTrigger">Import Backup (JSON)</button>
      <input type="file" id="restoreFile" accept=".json" style="display:none">
      <br><br>
      <button class="btn grey" id="btnClearSample">Clear Sample Data Only</button>
    </div>
    <div class="settings-block" style="background:#fdecea;border-color:#f3c1bd;">
      <h3 style="color:var(--red);">Danger Zone</h3>
      <p style="color:var(--muted);font-size:13.5px;">This permanently erases all records and settings from this device.</p>
      <button class="btn danger" id="btnReset">Reset Application</button>
    </div>
  `;
}
function attachSettingsHandlers(){
  document.getElementById('btnSaveSettings').addEventListener('click',()=>{
    DB.settings.registrarName = document.getElementById('setRegistrar').value;
    DB.settings.officeName = document.getElementById('setOfficeName').value;
    DB.settings.officeAddress = document.getElementById('setOfficeAddress').value;
    saveDB();
    renderHeader();
    alert('Settings saved.');
  });
  document.getElementById('btnBackup').addEventListener('click',()=>{
    const blob = new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `WBCYN_Backup_${todayISO()}.json`;
    a.click();
  });
  const restoreTrigger = document.getElementById('btnRestoreTrigger');
  const restoreFile = document.getElementById('restoreFile');
  restoreTrigger.addEventListener('click', ()=>restoreFile.click());
  restoreFile.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const parsed = JSON.parse(reader.result);
        if(!confirm('This will replace all current data with the backup file. Continue?')) return;
        DB = ensureShape(parsed);
        saveDB();
        render();
        renderHeader();
        alert('Backup restored successfully.');
      }catch(err){ alert('Invalid backup file.'); }
    };
    reader.readAsText(file);
  });
  document.getElementById('btnClearSample').addEventListener('click',()=>{
    if(!confirm('Remove all sample records from every module? Your own records will not be affected.')) return;
    ['matters','correspondence','legal','rti','meetings','examinations','institutes','trainers','contacts'].forEach(k=>{
      DB[k] = DB[k].filter(r=>!r._sample);
    });
    saveDB();
    render();
    alert('Sample data cleared.');
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    const input = prompt('This will permanently delete ALL data on this device. Type RESET to confirm.');
    if(input==='RESET'){
      localStorage.removeItem(STORAGE_KEY);
      DB = freshDB();
      saveDB();
      render();
      renderHeader();
      alert('Application has been reset.');
    }
  });
}

/* ================= PWA: install banner (iOS Safari "Add to Home Screen" hint) ================= */
function isStandalone(){
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  return mm || window.navigator.standalone === true;
}
function isiOS(){
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
function renderInstallBanner(){
  const root = document.getElementById('pwaBannerRoot');
  if(!root) return;
  if(isStandalone()) return; // already installed
  if(localStorage.getItem('wbcyn_install_banner_dismissed')==='1') return;
  if(!isiOS()) return; // keep banner simple: iOS Safari has no native install prompt
  root.innerHTML = `
    <div class="pwa-install-banner" id="pwaBanner">
      <span>Install this app: tap the Share icon, then "Add to Home Screen".</span>
      <button id="pwaBannerDismiss" class="dismiss">✕</button>
    </div>`;
  document.getElementById('pwaBannerDismiss').addEventListener('click', ()=>{
    localStorage.setItem('wbcyn_install_banner_dismissed','1');
    root.innerHTML='';
  });
}

/* ================= SERVICE WORKER REGISTRATION ================= */
/* WBCYN is now one part of the larger JM Digital Office project. The service
   worker file lives at the project root, one level up from this folder, and
   its scope automatically covers this whole site (including this /wbcyn/ app)
   because the scope defaults to the directory of the registered script. */
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('../service-worker.js').catch(err=>{
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

/* ================= START ================= */
init();
try{ renderInstallBanner(); }catch(e){ console.warn('Install banner skipped:', e); }
try{ registerServiceWorker(); }catch(e){ console.warn('Service worker registration skipped:', e); }
