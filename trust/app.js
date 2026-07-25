'use strict';
/* =========================================================================
   DR. NURUL ISLAM MEMORIAL CHARITABLE TRUST MANAGER
   Completely separate module & localStorage namespace from WBCYN / Clinic.
   ========================================================================= */

const STORAGE_KEY = 'jm_trust_db_v1';

/* ---------------------------------------------------------------------- */
/* UTILITIES                                                              */
/* ---------------------------------------------------------------------- */
function escapeHtml(s){
  if(s===undefined||s===null) return '';
  return String(s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowTimestamp(){
  const d = new Date();
  const pad = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function validateTrustBackup(obj){
  if(!obj || typeof obj!=='object') return {ok:false, reason:'File does not contain a JSON object.'};
  const expectedArrayKeys = ['beneficiaries','donors','projects','volunteers','transactions','documents','events','meetings'];
  const missing = expectedArrayKeys.filter(k=>!(k in obj));
  if(missing.length>=expectedArrayKeys.length){
    return {ok:false, reason:'None of the expected Trust Manager data fields were found (e.g. beneficiaries, donors, projects).'};
  }
  for(const k of expectedArrayKeys){
    if(k in obj && !Array.isArray(obj[k])){
      return {ok:false, reason:`Field "${k}" was expected to be a list but is not.`};
    }
  }
  if('settings' in obj && typeof obj.settings!=='object'){
    return {ok:false, reason:'Field "settings" is not a valid object.'};
  }
  return {ok:true};
}
function formatDate(iso){
  if(!iso) return '—';
  const p = iso.split('-'); if(p.length!==3) return iso;
  return `${p[2]}/${p[1]}/${p[0]}`;
}
function formatCurrency(n){
  n = Number(n)||0;
  return '₹' + n.toLocaleString('en-IN',{maximumFractionDigits:2});
}
function uid(){ return 'x'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
function maskSensitive(value){
  if(!value) return '—';
  const s = String(value);
  if(s.length<=4) return '••••';
  return '•'.repeat(Math.max(0,s.length-4)) + s.slice(-4);
}
function daysBetween(fromISO, toISO){
  if(!fromISO || !toISO) return null;
  const a = new Date(fromISO+'T00:00:00');
  const b = new Date(toISO+'T00:00:00');
  if(isNaN(a)||isNaN(b)) return null;
  return Math.round((b-a)/86400000);
}

function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function resizeImageDataURL(dataUrl, maxDim){
  maxDim = maxDim || 900;
  return new Promise((resolve)=>{
    let settled = false;
    const finish = (val)=>{ if(settled) return; settled = true; resolve(val); };
    try{
      const img = new Image();
      img.onload = ()=>{
        try{
          let w = img.width, h = img.height;
          if(w<=0||h<=0){ finish(dataUrl); return; }
          if(w>maxDim||h>maxDim){
            if(w>h){ h = Math.round(h*maxDim/w); w = maxDim; }
            else{ w = Math.round(w*maxDim/h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext && canvas.getContext('2d');
          if(!ctx){ finish(dataUrl); return; }
          ctx.drawImage(img,0,0,w,h);
          finish(canvas.toDataURL('image/jpeg',0.82));
        }catch(e){ finish(dataUrl); }
      };
      img.onerror = ()=>finish(dataUrl);
      img.src = dataUrl;
    }catch(e){ finish(dataUrl); }
    setTimeout(()=>finish(dataUrl),3000);
  });
}
function downloadFile(filename, text, mime){
  const blob = new Blob([text],{type:mime||'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },200);
}

/* ---------------------------------------------------------------------- */
/* DATA MODEL                                                             */
/* ---------------------------------------------------------------------- */
function freshDB(){
  return {
    settings:{
      trustName:'Dr. Nurul Islam Memorial Charitable Trust',
      logo:'', address:'', phone:'', email:'', website:'',
      regNumber:'', pan:'', bankDetails:'', receiptFormat:'Standard', footerNote:'',
      trustMotto:'',
      founderName:'', founderPhoto:'', founderBio:'', founderVision:'', founderMission:'',
      founderValues:'', founderQuote:'', founderLegacy:'',
      founderDOB:'', founderDOD:'', founderPlaceOfBirth:'', founderEducation:'',
      founderProfession:'', founderMessage:''
    },
    trustProfile:{
      logo:'', fullName:'', shortName:'', regNumber:'', dateOfRegistration:'', trustDeedNumber:'',
      pan:'', reg12ANumber:'', reg12AValidity:'', reg80GNumber:'', reg80GValidity:'',
      fcraNumber:'', fcraValidity:'', csrRegNumber:'',
      registeredAddress:'', correspondenceAddress:'', phone:'', mobile:'', email:'', website:'',
      bankName:'', branch:'', accountNumber:'', ifsc:'', dateOfEstablishment:'',
      mission:'', vision:'', objectives:'', motto:'', coreValues:''
    },
    beneficiaries:[],
    donors:[],
    projects:[],
    volunteers:[],
    transactions:[],
    documents:[],
    events:[],
    meetings:[],
    trustees:[],
    trusteeMeetings:[],
    resolutions:[],
    compliance:[],
    founderTimeline:[],
    founderGallery:[],
    founderMemorialDocs:[],
    notificationState:{ readIds:[], deletedIds:[] },
    nextIds:{beneficiary:1,donor:1,project:1,volunteer:1,event:1,meeting:1,transaction:1,document:1,trustee:1,trusteeMeeting:1,resolution:1,compliance:1}
  };
}
function ensureShape(db){
  const fresh = freshDB();
  db.settings = Object.assign({}, fresh.settings, db.settings||{});
  db.trustProfile = Object.assign({}, fresh.trustProfile, db.trustProfile||{});
  ['beneficiaries','donors','projects','volunteers','transactions','documents','events','meetings','trustees','trusteeMeetings','resolutions','compliance','founderTimeline','founderGallery','founderMemorialDocs']
    .forEach(k=>{ if(!Array.isArray(db[k])) db[k] = []; });
  db.notificationState = Object.assign({}, fresh.notificationState, db.notificationState||{});
  if(!Array.isArray(db.notificationState.readIds)) db.notificationState.readIds = [];
  if(!Array.isArray(db.notificationState.deletedIds)) db.notificationState.deletedIds = [];
  db.nextIds = Object.assign({}, fresh.nextIds, db.nextIds||{});
  db.beneficiaries.forEach(b=>{
    if(!Array.isArray(b.familyMembers)) b.familyMembers = [];
    if(!Array.isArray(b.assistanceHistory)) b.assistanceHistory = [];
  });
  db.donors.forEach(d=>{ if(!Array.isArray(d.donations)) d.donations = []; });
  db.projects.forEach(p=>{ if(!Array.isArray(p.attachments)) p.attachments = []; });
  db.events.forEach(e=>{ if(!Array.isArray(e.attachments)) e.attachments = []; });
  db.meetings.forEach(m=>{ if(!Array.isArray(m.attachments)) m.attachments = []; });
  db.volunteers.forEach(v=>{ if(!Array.isArray(v.attendance)) v.attendance = []; });
  db.trustees.forEach(t=>{ if(!Array.isArray(t.attachments)) t.attachments = []; });
  db.resolutions.forEach(r=>{ if(!Array.isArray(r.attachments)) r.attachments = []; });
  db.trusteeMeetings.forEach(m=>{ if(!Array.isArray(m.attendance)) m.attendance = []; });
  db.compliance.forEach(c=>{ if(!Array.isArray(c.attachments)) c.attachments = []; });
  return db;
}
let db;
function loadDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    db = raw ? ensureShape(JSON.parse(raw)) : freshDB();
  }catch(e){ db = freshDB(); }
  saveDB();
}
function saveDB(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}
function nextId(prefix, key){
  const n = db.nextIds[key]||1;
  db.nextIds[key] = n+1;
  return prefix + '-' + String(n).padStart(4,'0');
}

/* ---------------------------------------------------------------------- */
/* FIELD CONFIGS                                                          */
/* ---------------------------------------------------------------------- */
const BENEFICIARY_FIELDS = [
  {key:'name', label:'Name', type:'text', required:true},
  {key:'fatherHusbandName', label:'Father / Husband Name', type:'text'},
  {key:'age', label:'Age', type:'number'},
  {key:'gender', label:'Gender', type:'select', options:['Male','Female','Other']},
  {key:'occupation', label:'Occupation', type:'text'},
  {key:'address', label:'Address', type:'textarea'},
  {key:'phone', label:'Phone', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'income', label:'Monthly Income (₹)', type:'number'},
  {key:'category', label:'Category', type:'select', options:['Medical','Education','Financial','Disability','Widow','Old Age','Orphan','Other']},
  {key:'medicalCondition', label:'Medical Condition', type:'textarea'},
  {key:'remarks', label:'Remarks', type:'textarea'}
];
const DONOR_FIELDS = [
  {key:'name', label:'Name', type:'text', required:true},
  {key:'address', label:'Address', type:'textarea'},
  {key:'phone', label:'Phone', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'pan', label:'PAN (Optional)', type:'text'}
];
const DONATION_FIELDS = [
  {key:'date', label:'Donation Date', type:'date', required:true},
  {key:'amount', label:'Donation Amount (₹)', type:'number', required:true},
  {key:'type', label:'Donation Type', type:'select', options:['Cash','Bank','Online','Cheque'], required:true},
  {key:'purpose', label:'Purpose', type:'text'},
  {key:'receiptNumber', label:'Receipt Number', type:'text'}
];
const PROJECT_TYPES = ['Medical Camp','Yoga Camp','Health Awareness','Education Support','Relief Distribution','Food Distribution','Skill Development','Tree Plantation','Blood Donation','Other Activities'];
const PROJECT_FIELDS = [
  {key:'name', label:'Project Name', type:'text', required:true},
  {key:'type', label:'Project Type', type:'select', options:PROJECT_TYPES},
  {key:'date', label:'Date', type:'date'},
  {key:'venue', label:'Venue', type:'text'},
  {key:'description', label:'Description', type:'textarea'},
  {key:'budget', label:'Budget (₹)', type:'number'},
  {key:'expenditure', label:'Expenditure (₹)', type:'number'},
  {key:'beneficiariesText', label:'Beneficiaries (names / notes)', type:'textarea'},
  {key:'volunteersText', label:'Volunteers (names / notes)', type:'textarea'},
  {key:'status', label:'Completion Status', type:'select', options:['Planned','Ongoing','Completed','Cancelled']}
];
const VOLUNTEER_FIELDS = [
  {key:'name', label:'Name', type:'text', required:true},
  {key:'phone', label:'Phone', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'address', label:'Address', type:'textarea'},
  {key:'skills', label:'Skills', type:'textarea'},
  {key:'availability', label:'Availability', type:'text'},
  {key:'projectsParticipatedText', label:'Projects Participated', type:'textarea'},
  {key:'certificateStatus', label:'Certificate Status', type:'select', options:['Not Issued','Issued']}
];
const EVENT_FIELDS = [
  {key:'name', label:'Event Name', type:'text', required:true},
  {key:'date', label:'Date', type:'date'},
  {key:'venue', label:'Venue', type:'text'},
  {key:'description', label:'Description', type:'textarea'},
  {key:'participants', label:'Participants', type:'number'},
  {key:'budget', label:'Budget (₹)', type:'number'},
  {key:'attendanceCount', label:'Attendance', type:'number'},
  {key:'reportNotes', label:'Report Notes', type:'textarea'},
  {key:'status', label:'Status', type:'select', options:['Upcoming','Completed','Cancelled']}
];
const MEETING_FIELDS = [
  {key:'date', label:'Meeting Date', type:'date', required:true},
  {key:'agenda', label:'Agenda', type:'textarea'},
  {key:'attendance', label:'Attendance', type:'textarea'},
  {key:'resolution', label:'Resolution', type:'textarea'},
  {key:'actionTaken', label:'Action Taken', type:'textarea'},
  {key:'minutes', label:'Minutes', type:'textarea'}
];
const INCOME_TYPES = ['Grant','Membership','Interest','Other Income'];
const EXPENDITURE_TYPES = ['Medicine','Food','Printing','Travel','Administrative','Programme Expenses','Other Expenses'];
const TRANSACTION_FIELDS = [
  {key:'date', label:'Date', type:'date', required:true},
  {key:'type', label:'Type', type:'select', options:[...INCOME_TYPES, ...EXPENDITURE_TYPES], required:true},
  {key:'amount', label:'Amount (₹)', type:'number', required:true},
  {key:'mode', label:'Mode', type:'select', options:['Cash','Bank'], required:true},
  {key:'description', label:'Description', type:'textarea'}
];
const DOCUMENT_TYPES = ['Trust Deed','Registration Certificate','PAN','12A','80G','Audit Report','Annual Report','Meeting Minutes','Photograph','PDF','Scanned Document','Other'];
const DOCUMENT_FIELDS = [
  {key:'title', label:'Title', type:'text', required:true},
  {key:'type', label:'Document Type', type:'select', options:DOCUMENT_TYPES},
  {key:'date', label:'Date', type:'date'},
  {key:'notes', label:'Notes', type:'textarea'}
];

/* ---- TRUSTEE BODY field configs ---- */
const TRUSTEE_CATEGORIES = ['Founder Trustee','Managing Trustee','Chairman','Vice Chairman','Secretary','Joint Secretary','Treasurer','Trustee','Advisor','Patron','Other'];
const OFFICE_BEARER_CATEGORIES = ['Managing Trustee','Chairman','Vice Chairman','Secretary','Joint Secretary','Treasurer'];
const TRUSTEE_FIELDS = [
  {key:'name', label:'Full Name', type:'text', required:true},
  {key:'designation', label:'Designation', type:'text'},
  {key:'category', label:'Category', type:'select', options:TRUSTEE_CATEGORIES},
  {key:'gender', label:'Gender', type:'select', options:['Male','Female','Other']},
  {key:'dob', label:'Date of Birth', type:'date'},
  {key:'occupation', label:'Occupation', type:'text'},
  {key:'eduQualification', label:'Educational Qualification', type:'text'},
  {key:'profQualification', label:'Professional Qualification', type:'text'},
  {key:'mobile', label:'Mobile Number', type:'text'},
  {key:'whatsapp', label:'WhatsApp Number', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'residentialAddress', label:'Residential Address', type:'textarea'},
  {key:'officeAddress', label:'Office Address', type:'textarea'},
  {key:'pan', label:'PAN', type:'text'},
  {key:'aadhaar', label:'Aadhaar (Optional)', type:'text'},
  {key:'dateOfAppointment', label:'Date of Appointment', type:'date'},
  {key:'termOfOffice', label:'Term of Office', type:'text'},
  {key:'termDurationYears', label:'Term Duration (Years)', type:'number'},
  {key:'termStartDate', label:'Term Start Date', type:'date'},
  {key:'termExpiryDate', label:'Term Expiry Date', type:'date'},
  {key:'status', label:'Status', type:'select', options:['Active','Inactive','Vacant','Expired','Resigned','Removed','Deceased']},
  {key:'dateOfExit', label:'Date of Resignation / Removal', type:'date'},
  {key:'exitReason', label:'Reason', type:'textarea'},
  {key:'reappointmentDate', label:'Reappointment Date', type:'date'},
  {key:'remarks', label:'Remarks', type:'textarea'}
];
const ROLE_FIELDS = [
  {key:'responsibilities', label:'Responsibilities', type:'textarea'},
  {key:'assignedDepartments', label:'Assigned Departments', type:'textarea'},
  {key:'projectsResponsible', label:'Projects Responsible', type:'textarea'},
  {key:'committees', label:'Committees', type:'textarea'},
  {key:'notes', label:'Notes', type:'textarea'}
];
const RESOLUTION_FIELDS = [
  {key:'resolutionNumber', label:'Resolution Number', type:'text', required:true},
  {key:'meetingNumber', label:'Meeting Number', type:'text'},
  {key:'date', label:'Meeting Date', type:'date', required:true},
  {key:'meetingType', label:'Meeting Type', type:'select', options:['Board Meeting','General Body Meeting','AGM','Special Meeting','Circular Resolution','Other']},
  {key:'agendaNumber', label:'Agenda Number', type:'text'},
  {key:'subject', label:'Subject', type:'text', required:true},
  {key:'backgroundNote', label:'Background Note', type:'textarea'},
  {key:'resolutionText', label:'Resolution Text', type:'textarea'},
  {key:'proposedBy', label:'Proposed By', type:'text'},
  {key:'secondedBy', label:'Seconded By', type:'text'},
  {key:'membersPresent', label:'Members Present', type:'textarea'},
  {key:'membersAbsent', label:'Members Absent', type:'textarea'},
  {key:'votingMethod', label:'Voting Method', type:'select', options:['Show of Hands','Voice Vote','Secret Ballot','Circular Resolution','Unanimous']},
  {key:'votingResult', label:'Voting Result', type:'select', options:['Approved','Rejected','Deferred','Passed','Unanimous']},
  {key:'implementationResponsibility', label:'Implementation Responsibility', type:'text'},
  {key:'targetCompletionDate', label:'Target Completion Date', type:'date'},
  {key:'implementationStatus', label:'Implementation Status', type:'select', options:['Pending','In Progress','Completed','Closed']},
  {key:'actionTaken', label:'Action Taken', type:'textarea'},
  {key:'completionDate', label:'Completion Date', type:'date'},
  {key:'remarks', label:'Remarks', type:'textarea'}
];
const FOUNDER_SETTINGS_FIELDS = [
  {key:'founderName', label:'Founder Name', type:'text'},
  {key:'trustMotto', label:'Trust Motto', type:'text'},
  {key:'founderDOB', label:'Date of Birth', type:'date'},
  {key:'founderDOD', label:'Date of Death', type:'date'},
  {key:'founderPlaceOfBirth', label:'Place of Birth', type:'text'},
  {key:'founderEducation', label:'Education', type:'text'},
  {key:'founderProfession', label:'Profession', type:'text'},
  {key:'founderBio', label:'Biography', type:'textarea'},
  {key:'founderVision', label:'Life Journey / Vision', type:'textarea'},
  {key:'founderMission', label:'Social Contributions / Mission', type:'textarea'},
  {key:'founderValues', label:'Philosophy / Values', type:'textarea'},
  {key:'founderQuote', label:'Inspirational Quote(s)', type:'textarea'},
  {key:'founderLegacy', label:'Awards, Recognition &amp; Legacy', type:'textarea'},
  {key:'founderMessage', label:'Message from the Founder President', type:'textarea'}
];

/* ---- TRUST PROFILE field config ---- */
const TRUST_PROFILE_FIELDS = [
  {key:'fullName', label:'Full Trust Name', type:'text', required:true},
  {key:'shortName', label:'Short Name', type:'text'},
  {key:'regNumber', label:'Registration Number', type:'text'},
  {key:'dateOfRegistration', label:'Date of Registration', type:'date'},
  {key:'trustDeedNumber', label:'Trust Deed Number', type:'text'},
  {key:'pan', label:'PAN', type:'text'},
  {key:'reg12ANumber', label:'12A Registration Number', type:'text'},
  {key:'reg12AValidity', label:'12A Validity', type:'date'},
  {key:'reg80GNumber', label:'80G Registration Number', type:'text'},
  {key:'reg80GValidity', label:'80G Validity', type:'date'},
  {key:'fcraNumber', label:'FCRA Number (Optional)', type:'text'},
  {key:'fcraValidity', label:'FCRA Validity (Optional)', type:'date'},
  {key:'csrRegNumber', label:'CSR Registration Number (Optional)', type:'text'},
  {key:'registeredAddress', label:'Registered Address', type:'textarea'},
  {key:'correspondenceAddress', label:'Correspondence Address', type:'textarea'},
  {key:'phone', label:'Phone', type:'text'},
  {key:'mobile', label:'Mobile', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'website', label:'Website', type:'text'},
  {key:'bankName', label:'Bank Name', type:'text'},
  {key:'branch', label:'Branch', type:'text'},
  {key:'accountNumber', label:'Account Number', type:'text'},
  {key:'ifsc', label:'IFSC', type:'text'},
  {key:'dateOfEstablishment', label:'Date of Establishment', type:'date'},
  {key:'mission', label:'Mission', type:'textarea'},
  {key:'vision', label:'Vision', type:'textarea'},
  {key:'objectives', label:'Objectives', type:'textarea'},
  {key:'motto', label:'Motto', type:'text'},
  {key:'coreValues', label:'Core Values', type:'textarea'}
];
const MASKED_PROFILE_KEYS = ['pan','accountNumber'];

/* ---- COMPLIANCE field config ---- */
const COMPLIANCE_TYPES = ['Trust Audit','Income Tax Return','12A Renewal','80G Renewal','FCRA Return','FCRA Renewal','CSR Compliance','Trustee Meeting','Annual General Meeting','Bank KYC','PAN Update','Registration Renewal','Annual Report','Other Compliance'];
const COMPLIANCE_FIELDS = [
  {key:'name', label:'Compliance Name', type:'select', options:COMPLIANCE_TYPES, required:true},
  {key:'department', label:'Department / Authority', type:'text'},
  {key:'financialYear', label:'Financial Year', type:'text'},
  {key:'dueDate', label:'Due Date', type:'date', required:true},
  {key:'completionDate', label:'Completion Date', type:'date'},
  {key:'status', label:'Status', type:'select', options:['Not Started','In Progress','Completed','Overdue','Not Applicable']},
  {key:'personResponsible', label:'Person Responsible', type:'text'},
  {key:'reminderDate', label:'Reminder Date', type:'date'},
  {key:'notes', label:'Notes', type:'textarea'}
];

/* ---------------------------------------------------------------------- */
/* FORM RENDER HELPERS                                                    */
/* ---------------------------------------------------------------------- */
function fieldInputHTML(f, value){
  value = value===undefined||value===null ? '' : value;
  const id = 'f_'+f.key;
  if(f.type==='select'){
    const opts = f.options.map(o=>`<option value="${escapeHtml(o)}" ${String(o)===String(value)?'selected':''}>${escapeHtml(o)}</option>`).join('');
    return `<select id="${id}" data-field="${f.key}">${!f.required?'<option value="">—</option>':''}${opts}</select>`;
  }
  if(f.type==='textarea'){
    return `<textarea id="${id}" data-field="${f.key}">${escapeHtml(value)}</textarea>`;
  }
  return `<input id="${id}" data-field="${f.key}" type="${f.type}" value="${escapeHtml(value)}">`;
}
function fieldsToHTML(fields, values){
  values = values || {};
  return fields.map(f=>`
    <div class="form-field ${f.type==='textarea'?'full':''}">
      <label>${escapeHtml(f.label)}${f.required?' *':''}</label>
      ${fieldInputHTML(f, values[f.key])}
    </div>`).join('');
}
function readFieldsFromForm(fields, root){
  const out = {};
  fields.forEach(f=>{
    const el = root.querySelector('#f_'+f.key);
    out[f.key] = el ? el.value : '';
  });
  return out;
}
function detailRows(fields, values){
  values = values||{};
  return fields.map(f=>`
    <div class="${f.type==='textarea'?'full':''}">
      <div class="dl">${escapeHtml(f.label)}</div>
      <div class="dv">${escapeHtml(values[f.key])||'—'}</div>
    </div>`).join('');
}
function detailRowsMasked(fields, values, maskedKeys){
  values = values||{};
  maskedKeys = maskedKeys||[];
  return fields.map(f=>{
    if(maskedKeys.includes(f.key) && values[f.key]){
      const real = escapeHtml(values[f.key]);
      const masked = escapeHtml(maskSensitive(values[f.key]));
      return `<div class="${f.type==='textarea'?'full':''}">
        <div class="dl">${escapeHtml(f.label)}</div>
        <div class="dv mask-row">
          <span class="mask-value" data-real="${real}" data-masked="${masked}">${masked}</span>
          <button type="button" class="btn sm secondary no-print mask-toggle-btn" style="margin-left:8px;">Show</button>
        </div>
      </div>`;
    }
    return `<div class="${f.type==='textarea'?'full':''}">
      <div class="dl">${escapeHtml(f.label)}</div>
      <div class="dv">${escapeHtml(values[f.key])||'—'}</div>
    </div>`;
  }).join('');
}
function wireMaskToggles(){
  document.querySelectorAll('.mask-toggle-btn').forEach(btn=>{
    if(btn._maskWired) return;
    btn._maskWired = true;
    btn.addEventListener('click', ()=>{
      const span = btn.previousElementSibling;
      const showing = btn.textContent.trim()==='Hide';
      span.textContent = showing ? span.getAttribute('data-masked') : span.getAttribute('data-real');
      btn.textContent = showing ? 'Show' : 'Hide';
    });
  });
}

/* ---------------------------------------------------------------------- */
/* STATE & NAVIGATION                                                     */
/* ---------------------------------------------------------------------- */
const state = { view:'dashboard', editingId:null, search:'', moreDefault:'volunteers', trusteeDefault:'trusteeDashboard', trusteeFilter:'all', resolutionYearFilter:'all', resolutionStatusFilter:'all', notificationFilter:'all' };

const MAIN_NAV = [
  {id:'dashboard', label:'Dashboard', icon:'🏠'},
  {id:'beneficiaries', label:'Beneficiaries', icon:'🧑‍🤝‍🧑'},
  {id:'donors', label:'Donors', icon:'💝'},
  {id:'projects', label:'Projects', icon:'📁'},
  {id:'trusteeBody', label:'Trustee Body', icon:'🏛'},
  {id:'more', label:'More', icon:'⋯'},
  {id:'settings', label:'Settings', icon:'⚙️'}
];
const MORE_SUBS = [
  {id:'trustProfile', label:'Trust Profile', icon:'🏢'},
  {id:'founder', label:'Founder Memorial', icon:'🌟'},
  {id:'volunteers', label:'Volunteers', icon:'🙋'},
  {id:'financial', label:'Finance', icon:'💰'},
  {id:'events', label:'Events', icon:'📅'},
  {id:'meetings', label:'Meetings', icon:'📝'},
  {id:'resolutions', label:'Resolution Register', icon:'⚖️'},
  {id:'compliance', label:'Compliance', icon:'📋'},
  {id:'documents', label:'Documents', icon:'📄'},
  {id:'reports', label:'Reports', icon:'📊'},
  {id:'notifications', label:'Notifications', icon:'🔔'}
];
const TRUSTEE_SUBS = [
  {id:'trusteeDashboard', label:'Dashboard', icon:'📊'},
  {id:'trustees', label:'Directory', icon:'📇'},
  {id:'trusteeBoard', label:'Board', icon:'🖼️'},
  {id:'trusteeMeetings', label:'Attendance', icon:'🗓️'}
];
const FAMILY_GROUP = {
  beneficiaries: ['beneficiaries','beneficiaryForm','beneficiaryProfile'],
  donors: ['donors','donorForm','donorProfile'],
  projects: ['projects','projectForm','projectProfile'],
  more: ['volunteers','volunteerForm','volunteerProfile','financial','documents','documentForm','events','eventForm','eventProfile','meetings','meetingForm','meetingProfile','reports',
    'trustProfile','trustProfileForm','founder','resolutions','resolutionForm','resolutionProfile','compliance','complianceForm','complianceProfile','notifications'],
  trusteeBody: ['trusteeDashboard','trustees','trusteeForm','trusteeProfile','trusteeBoard','trusteeMeetings','trusteeMeetingForm','trusteeDocuments']
};
function mainNavActiveId(){
  for(const k in FAMILY_GROUP){ if(FAMILY_GROUP[k].includes(state.view)) return k; }
  return state.view;
}
function goto(view, id){
  state.view = view;
  state.editingId = id||null;
  if(MORE_SUBS.some(s=>s.id===view)) state.moreDefault = view;
  if(TRUSTEE_SUBS.some(s=>s.id===view)) state.trusteeDefault = view;
  render();
  window.scrollTo(0,0);
}
function renderNav(){
  const activeMain = mainNavActiveId();
  const btn = (n)=>`<button data-nav="${n.id}" class="${activeMain===n.id?'active':''}"><span class="ic">${n.icon}</span><span class="lbl">${n.label}</span></button>`;
  const topHtml = MAIN_NAV.map(n=>`<button data-nav="${n.id}" class="${activeMain===n.id?'active':''}">${n.icon} ${n.label}</button>`).join('');
  const bottomHtml = MAIN_NAV.map(btn).join('');
  document.getElementById('topnav').innerHTML = topHtml;
  document.getElementById('bottomnav').innerHTML = bottomHtml;
  document.querySelectorAll('[data-nav]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const n = b.getAttribute('data-nav');
      if(n==='more') goto(state.moreDefault||'volunteers');
      else if(n==='trusteeBody') goto(state.trusteeDefault||'trusteeDashboard');
      else goto(n);
    });
  });
}
function moreSubtabsHTML(active){
  return `<div class="subtabs no-print">${MORE_SUBS.map(s=>`<button data-moresub="${s.id}" class="${active===s.id?'active':''}">${s.icon} ${s.label}</button>`).join('')}</div>`;
}
function attachMoreSubtabHandlers(){
  document.querySelectorAll('[data-moresub]').forEach(b=>{
    b.addEventListener('click', ()=>goto(b.getAttribute('data-moresub')));
  });
}
function trusteeSubtabsHTML(active){
  return `<div class="subtabs no-print">${TRUSTEE_SUBS.map(s=>`<button data-trusteesub="${s.id}" class="${active===s.id?'active':''}">${s.icon} ${s.label}</button>`).join('')}</div>`;
}
function attachTrusteeSubtabHandlers(){
  document.querySelectorAll('[data-trusteesub]').forEach(b=>{
    b.addEventListener('click', ()=>goto(b.getAttribute('data-trusteesub')));
  });
}
function attachTrusteeFilterHandlers(){
  document.querySelectorAll('[data-trusteefilter]').forEach(b=>{
    b.addEventListener('click', ()=>{ state.trusteeFilter = b.getAttribute('data-trusteefilter'); render(); });
  });
}

/* ---------------------------------------------------------------------- */
/* DERIVED / COMPUTED HELPERS                                             */
/* ---------------------------------------------------------------------- */
function allDonationEntries(){
  const out = [];
  db.donors.forEach(d=>{
    (d.donations||[]).forEach(don=>{
      out.push({date:don.date, amount:Number(don.amount)||0, mode: don.type==='Cash'?'Cash':'Bank', label:'Donation — '+d.name, source:'donor', donorId:d.id, donationId:don.id, category:'income', type:'Donation'});
    });
  });
  return out;
}
function allLedgerEntries(){
  const manual = db.transactions.map(t=>({date:t.date, amount:Number(t.amount)||0, mode:t.mode, label:t.type, source:'manual', category: (INCOME_TYPES.includes(t.type)?'income':'expenditure'), type:t.type, id:t.id, description:t.description}));
  return allDonationEntries().concat(manual).sort((a,b)=> (a.date||'') < (b.date||'') ? 1 : -1);
}
function totalDonations(){ return allDonationEntries().reduce((s,e)=>s+e.amount,0); }
function totalIncome(){ return allLedgerEntries().filter(e=>e.category==='income').reduce((s,e)=>s+e.amount,0); }
function totalExpenditure(){ return allLedgerEntries().filter(e=>e.category==='expenditure').reduce((s,e)=>s+e.amount,0); }
function availableBalance(){ return totalIncome()-totalExpenditure(); }
function upcomingEvents(){
  const t = todayISO();
  return db.events.filter(e=>e.date && e.date>=t).sort((a,b)=>a.date<b.date?-1:1);
}
function todaysTasksCount(){
  const t = todayISO();
  let n = 0;
  db.events.forEach(e=>{ if(e.date===t) n++; });
  db.meetings.forEach(m=>{ if(m.date===t) n++; });
  return n;
}
function recentActivities(limit){
  limit = limit||10;
  const acts = [];
  db.beneficiaries.forEach(b=>acts.push({date:b.createdAt||b.id, text:`New beneficiary registered: ${b.name}`}));
  db.donors.forEach(d=>(d.donations||[]).forEach(don=>acts.push({date:don.date, text:`Donation received: ${formatCurrency(don.amount)} from ${d.name}`})));
  db.projects.forEach(p=>acts.push({date:p.date||p.createdAt, text:`Project: ${p.name} (${p.status||'Planned'})`}));
  db.events.forEach(e=>acts.push({date:e.date||e.createdAt, text:`Event: ${e.name}`}));
  db.meetings.forEach(m=>acts.push({date:m.date, text:`Meeting held — ${m.agenda? m.agenda.slice(0,40):''}`}));
  db.transactions.forEach(t=>acts.push({date:t.date, text:`${t.category==='income'?'Income':'Expenditure'}: ${t.type} — ${formatCurrency(t.amount)}`}));
  return acts.filter(a=>a.date).sort((a,b)=>a.date<b.date?1:-1).slice(0,limit);
}

/* ---------------------------------------------------------------------- */
/* MODAL                                                                  */
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
  document.getElementById('modalOverlay').addEventListener('click',(e)=>{
    if(e.target.id==='modalOverlay') closeModal();
  });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }

/* ---------------------------------------------------------------------- */
/* DASHBOARD                                                              */
/* ---------------------------------------------------------------------- */
function renderDashboard(){
  const ongoing = db.projects.filter(p=>p.status==='Ongoing'||p.status==='Planned').length;
  const cards = [
    {num:db.beneficiaries.length, lbl:'Total Beneficiaries', icon:'🧑‍🤝‍🧑'},
    {num:ongoing, lbl:'Ongoing Projects', icon:'📁'},
    {num:db.volunteers.length, lbl:'Total Volunteers', icon:'🙋'},
    {num:upcomingEvents().length, lbl:'Upcoming Events', icon:'📅'},
    {num:todaysTasksCount(), lbl:"Today's Tasks", icon:'✅'},
    {num:formatCurrency(totalDonations()), lbl:'Total Donations Received', icon:'💝'},
    {num:formatCurrency(totalExpenditure()), lbl:'Total Expenditure', icon:'💸'},
    {num:formatCurrency(availableBalance()), lbl:'Available Balance', icon:'🏦'}
  ];
  const cardsHtml = cards.map(c=>`<div class="card"><div class="icon">${c.icon}</div><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('');
  const govCards = [
    {num:db.trustees.length, lbl:'Total Trustees', icon:'🏛'},
    {num:db.trustees.filter(t=>t.status==='Active'||!t.status).length, lbl:'Active Trustees', icon:'✅'},
    {num:pendingResolutionsCount(), lbl:'Pending Resolutions', icon:'⚖️'},
    {num:complianceDueWithin30().length, lbl:'Compliance Due', icon:'📋'},
    {num:complianceOverdue().length, lbl:'Compliance Overdue', icon:'🚨'},
    {num:unreadNotificationsCount(), lbl:'Unread Notifications', icon:'🔔'}
  ];
  const govCardsHtml = govCards.map(c=>`<div class="card grey"><div class="icon">${c.icon}</div><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('');
  const acts = recentActivities(10);
  const actsHtml = acts.length? acts.map(a=>`<div class="item-row"><div><div class="title">${escapeHtml(a.text)}</div><div class="meta">${formatDate(a.date && a.date.slice ? a.date.slice(0,10) : a.date)}</div></div></div>`).join('')
    : `<div class="empty-note">No recent activity yet.</div>`;
  return `
    <div class="cards-grid">${cardsHtml}</div>
    <div class="section-title">🏛 Governance Snapshot</div>
    <div class="cards-grid">${govCardsHtml}</div>
    <div class="quick-actions no-print">
      <button class="btn" data-action="goto" data-view="beneficiaryForm">➕ Add Beneficiary</button>
      <button class="btn" data-action="goto" data-view="donorForm">➕ Add Donor</button>
      <button class="btn" data-action="goto" data-view="projectForm">➕ New Project</button>
      <button class="btn secondary" data-action="goto" data-view="eventForm">➕ New Event</button>
      <button class="btn secondary" data-action="add-transaction">➕ Add Transaction</button>
    </div>
    <div class="section-title">📰 Recent Activities</div>
    <div class="item-list">${actsHtml}</div>
  `;
}

/* ---------------------------------------------------------------------- */
/* BENEFICIARIES                                                          */
/* ---------------------------------------------------------------------- */
function filteredBeneficiaries(){
  const q = (state.search||'').toLowerCase();
  return db.beneficiaries.filter(b=>!q || [b.name,b.id,b.category,b.phone].join(' ').toLowerCase().includes(q));
}
function renderBeneficiaries(){
  const list = filteredBeneficiaries();
  const rows = list.map(b=>`
    <tr>
      <td>${escapeHtml(b.id)}</td>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.category)||'—'}</td>
      <td>${escapeHtml(b.phone)||'—'}</td>
      <td>${escapeHtml(b.age)||'—'}</td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-beneficiary" data-id="${b.id}">View</button>
        <button class="btn sm secondary" data-action="edit-beneficiary" data-id="${b.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-beneficiary" data-id="${b.id}">Delete</button>
      </td>
    </tr>`).join('');
  const cards = list.map(b=>`
    <div class="record-card row-blue">
      ${b.photo?`<img class="record-card-photo" src="${b.photo}">`:`<div class="record-card-photo record-card-photo-placeholder">${escapeHtml((b.name||'?')[0])}</div>`}
      <div class="record-card-body">
        <div class="record-card-name">${escapeHtml(b.name)}</div>
        <div class="record-card-meta">${escapeHtml(b.id)} · ${escapeHtml(b.category)||'—'}</div>
        <div class="record-card-meta">${escapeHtml(b.phone)||'—'}</div>
        <div class="record-card-actions">
          <button class="btn sm secondary" data-action="view-beneficiary" data-id="${b.id}">View</button>
          <button class="btn sm secondary" data-action="edit-beneficiary" data-id="${b.id}">Edit</button>
          <button class="btn sm danger" data-action="delete-beneficiary" data-id="${b.id}">Delete</button>
        </div>
      </div>
    </div>`).join('');
  return `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search beneficiaries..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="beneficiaryForm">➕ Add Beneficiary</button>
    </div>
    <div class="records-table-wrap table-wrap">
      <table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Phone</th><th>Age</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty-note">No beneficiaries yet.</td></tr>'}</tbody></table>
    </div>
    <div class="records-cards-wrap">${cards || '<div class="empty-note">No beneficiaries yet.</div>'}</div>
  `;
}
function beneficiaryFormHTML(existing){
  const b = existing || {};
  return `
  <div class="form-page">
    <div class="form-section">
      <h3>👤 Beneficiary Details</h3>
      <div class="form-grid">${fieldsToHTML(BENEFICIARY_FIELDS, b)}</div>
    </div>
    <div class="form-section">
      <h3>📷 Photograph &amp; Identity Document</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>Photograph</label>
          <input type="file" accept="image/*" id="photoInput">
          <input type="hidden" id="photoValue" value="${escapeHtml(b.photo)}">
          <div style="margin-top:8px;">${b.photo?`<img src="${b.photo}" id="photoPreview" style="width:80px;height:80px;border-radius:12px;object-fit:cover;">`:`<img id="photoPreview" style="display:none;width:80px;height:80px;border-radius:12px;object-fit:cover;">`}</div>
        </div>
        <div class="form-field">
          <label>Identity Document</label>
          <input type="file" accept="image/*,.pdf" id="idDocInput">
          <input type="hidden" id="idDocValue" value="${escapeHtml(b.idDocument)}">
          <div style="margin-top:8px;font-size:12.5px;color:var(--muted);" id="idDocStatus">${b.idDocument?'Document attached ✓':'No document uploaded'}</div>
        </div>
      </div>
    </div>
    <div class="form-section">
      <h3>👪 Family Members</h3>
      <div id="familyRows">
        ${(b.familyMembers||[]).map(fm=>familyRowHTML(fm)).join('')}
      </div>
      <button type="button" class="btn secondary sm" id="addFamilyRowBtn">➕ Add Family Member</button>
    </div>
    <div class="form-actions">
      <button class="btn grey" data-action="goto" data-view="beneficiaries">Cancel</button>
      <button class="btn" id="saveBeneficiaryBtn">💾 Save Beneficiary</button>
    </div>
  </div>`;
}
function familyRowHTML(fm){
  fm = fm||{};
  return `<div class="sub-list-row fm-row">
    <input placeholder="Name" class="fm-name" value="${escapeHtml(fm.name)}">
    <input placeholder="Relation" class="fm-relation" value="${escapeHtml(fm.relation)}">
    <input placeholder="Age" class="fm-age" value="${escapeHtml(fm.age)}">
    <button type="button" class="btn sm danger removeFamilyRowBtn">✕</button>
  </div>`;
}
function renderBeneficiaryForm(id){
  const existing = id ? db.beneficiaries.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = beneficiaryFormHTML(existing);
  const familyRows = document.getElementById('familyRows');
  document.getElementById('addFamilyRowBtn').addEventListener('click',()=>{
    familyRows.insertAdjacentHTML('beforeend', familyRowHTML({}));
    wireFamilyRemove();
  });
  function wireFamilyRemove(){
    familyRows.querySelectorAll('.removeFamilyRowBtn').forEach(btn=>{
      btn.onclick = ()=>btn.closest('.fm-row').remove();
    });
  }
  wireFamilyRemove();
  const photoInput = document.getElementById('photoInput');
  photoInput.addEventListener('change', async ()=>{
    const file = photoInput.files && photoInput.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const resized = await resizeImageDataURL(raw, 500);
    document.getElementById('photoValue').value = resized;
    const prev = document.getElementById('photoPreview');
    prev.src = resized; prev.style.display='block';
  });
  const idDocInput = document.getElementById('idDocInput');
  idDocInput.addEventListener('change', async ()=>{
    const file = idDocInput.files && idDocInput.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    document.getElementById('idDocValue').value = raw;
    document.getElementById('idDocStatus').textContent = 'Document attached ✓';
  });
  document.getElementById('saveBeneficiaryBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(BENEFICIARY_FIELDS, root);
    if(!vals.name || !vals.name.trim()){ alert('Name is required.'); return; }
    const familyMembers = Array.from(root.querySelectorAll('.fm-row')).map(r=>({
      name:r.querySelector('.fm-name').value,
      relation:r.querySelector('.fm-relation').value,
      age:r.querySelector('.fm-age').value
    })).filter(f=>f.name);
    const photo = document.getElementById('photoValue').value;
    const idDocument = document.getElementById('idDocValue').value;
    if(existing){
      Object.assign(existing, vals, {photo, idDocument, familyMembers});
    }else{
      db.beneficiaries.push(Object.assign({id:nextId('BEN','beneficiary'), createdAt:todayISO(), assistanceHistory:[]}, vals, {photo, idDocument, familyMembers}));
    }
    saveDB();
    goto('beneficiaries');
  });
}
function renderBeneficiaryProfile(id){
  const b = db.beneficiaries.find(x=>x.id===id);
  if(!b) return `<div class="empty-note">Beneficiary not found.</div>`;
  const family = (b.familyMembers||[]).length ? `<table style="width:100%;font-size:13.5px;"><thead><tr><th>Name</th><th>Relation</th><th>Age</th></tr></thead><tbody>${b.familyMembers.map(f=>`<tr><td>${escapeHtml(f.name)}</td><td>${escapeHtml(f.relation)}</td><td>${escapeHtml(f.age)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-note">No family members recorded.</div>';
  const history = (b.assistanceHistory||[]).slice().sort((x,y)=>x.date<y.date?1:-1).map(h=>`
    <div class="timeline-card">
      <div class="visit-head"><div class="visit-title">${formatDate(h.date)} — ${escapeHtml(h.type)}</div>
      <div class="visit-actions"><button class="btn sm danger" data-action="delete-assistance" data-bid="${b.id}" data-hid="${h.id}">Delete</button></div></div>
      <div>${escapeHtml(h.description)||'—'} ${h.amount?('· '+formatCurrency(h.amount)):''}</div>
    </div>`).join('') || '<div class="empty-note">No assistance history yet.</div>';
  return `
    <div class="profile-header">
      ${b.photo?`<img class="record-photo" src="${b.photo}">`:`<div class="record-photo record-photo-placeholder">${escapeHtml((b.name||'?')[0])}</div>`}
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(b.name)}</h2>
        <div class="meta-line">${escapeHtml(b.id)} · ${escapeHtml(b.category)||'—'} · ${escapeHtml(b.phone)||'—'}</div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-beneficiary" data-id="${b.id}">Edit</button>
        <button class="btn" data-action="add-assistance" data-id="${b.id}">➕ Assistance Record</button>
        <button class="btn grey" data-action="goto" data-view="beneficiaries">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(BENEFICIARY_FIELDS, b)}</div>
    <div class="section-title">👪 Family Members</div>
    ${family}
    <div class="section-title">🕐 History of Assistance</div>
    ${history}
  `;
}
function openAssistanceModal(bid){
  openModal('Add Assistance Record', `
    <div class="form-grid">
      <div class="form-field"><label>Date *</label><input type="date" id="asDate" value="${todayISO()}"></div>
      <div class="form-field"><label>Type</label><input type="text" id="asType" placeholder="e.g. Medical / Financial / Education"></div>
      <div class="form-field full"><label>Description</label><textarea id="asDesc"></textarea></div>
      <div class="form-field"><label>Amount (₹)</label><input type="number" id="asAmount"></div>
    </div>`,
    `<button class="btn grey" id="asCancel">Cancel</button><button class="btn" id="asSave">Save</button>`);
  document.getElementById('asCancel').onclick = closeModal;
  document.getElementById('asSave').onclick = ()=>{
    const date = document.getElementById('asDate').value;
    if(!date){ alert('Date is required.'); return; }
    const b = db.beneficiaries.find(x=>x.id===bid);
    b.assistanceHistory.push({id:uid(), date, type:document.getElementById('asType').value, description:document.getElementById('asDesc').value, amount:document.getElementById('asAmount').value});
    saveDB(); closeModal(); goto('beneficiaryProfile', bid);
  };
}

/* ---------------------------------------------------------------------- */
/* DONORS                                                                 */
/* ---------------------------------------------------------------------- */
function filteredDonors(){
  const q = (state.search||'').toLowerCase();
  return db.donors.filter(d=>!q || [d.name,d.id,d.phone].join(' ').toLowerCase().includes(q));
}
function donorTotal(d){ return (d.donations||[]).reduce((s,x)=>s+(Number(x.amount)||0),0); }
function renderDonors(){
  const list = filteredDonors();
  const rows = list.map(d=>`
    <tr>
      <td>${escapeHtml(d.id)}</td><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.phone)||'—'}</td>
      <td>${formatCurrency(donorTotal(d))}</td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-donor" data-id="${d.id}">View</button>
        <button class="btn sm secondary" data-action="edit-donor" data-id="${d.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-donor" data-id="${d.id}">Delete</button>
      </td></tr>`).join('');
  return `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search donors..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="donorForm">➕ Add Donor</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Total Donated</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty-note">No donors yet.</td></tr>'}</tbody></table>
    </div>`;
}
function renderDonorForm(id){
  const existing = id ? db.donors.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = `
    <div class="form-page">
      <div class="form-section"><h3>💝 Donor Details</h3>
        <div class="form-grid">${fieldsToHTML(DONOR_FIELDS, existing||{})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="donors">Cancel</button>
        <button class="btn" id="saveDonorBtn">💾 Save Donor</button>
      </div>
    </div>`;
  document.getElementById('saveDonorBtn').addEventListener('click',()=>{
    const vals = readFieldsFromForm(DONOR_FIELDS, document.getElementById('app'));
    if(!vals.name || !vals.name.trim()){ alert('Name is required.'); return; }
    if(existing){ Object.assign(existing, vals); }
    else{ db.donors.push(Object.assign({id:nextId('DON','donor'), createdAt:todayISO(), donations:[]}, vals)); }
    saveDB();
    goto('donors');
  });
}
function renderDonorProfile(id){
  const d = db.donors.find(x=>x.id===id);
  if(!d) return `<div class="empty-note">Donor not found.</div>`;
  const donations = (d.donations||[]).slice().sort((a,b)=>a.date<b.date?1:-1).map(don=>`
    <div class="timeline-card">
      <div class="visit-head">
        <div class="visit-title">${formatDate(don.date)} — ${formatCurrency(don.amount)} (${escapeHtml(don.type)})</div>
        <div class="visit-actions">
          <button class="btn sm secondary" data-action="print-receipt" data-did="${d.id}" data-donid="${don.id}">🖨️ Receipt</button>
          <button class="btn sm danger" data-action="delete-donation" data-did="${d.id}" data-donid="${don.id}">Delete</button>
        </div>
      </div>
      <div>Purpose: ${escapeHtml(don.purpose)||'—'} · Receipt #: ${escapeHtml(don.receiptNumber)||'—'}</div>
    </div>`).join('') || '<div class="empty-note">No donations recorded yet.</div>';
  return `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(d.name)}</h2>
        <div class="meta-line">${escapeHtml(d.id)} · ${escapeHtml(d.phone)||'—'} · Total donated: ${formatCurrency(donorTotal(d))}</div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-donor" data-id="${d.id}">Edit</button>
        <button class="btn" data-action="add-donation" data-id="${d.id}">➕ Add Donation</button>
        <button class="btn grey" data-action="goto" data-view="donors">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(DONOR_FIELDS, d)}</div>
    <div class="section-title">🕐 Donation History</div>
    ${donations}
    <div id="printSlipArea" class="rx-print-area"></div>
  `;
}
function openDonationModal(did){
  openModal('Add Donation', `<div class="form-grid">${fieldsToHTML(DONATION_FIELDS,{date:todayISO()})}</div>`,
    `<button class="btn grey" id="donCancel">Cancel</button><button class="btn" id="donSave">Save</button>`);
  document.getElementById('donCancel').onclick = closeModal;
  document.getElementById('donSave').onclick = ()=>{
    const vals = readFieldsFromForm(DONATION_FIELDS, document.getElementById('modalBody'));
    if(!vals.date || !vals.amount){ alert('Date and Amount are required.'); return; }
    const d = db.donors.find(x=>x.id===did);
    d.donations.push(Object.assign({id:uid()}, vals));
    saveDB(); closeModal(); goto('donorProfile', did);
  };
}
function printReceipt(did, donid){
  const d = db.donors.find(x=>x.id===did);
  const don = d && (d.donations||[]).find(x=>x.id===donid);
  if(!d||!don) return;
  const s = db.settings;
  document.getElementById('printSlipArea').innerHTML = `
    <div class="print-slip">
      <div class="slip-head">
        <h2>${escapeHtml(s.trustName)}</h2>
        <div>${escapeHtml(s.address)||''}</div>
        <div>${s.phone?('Phone: '+escapeHtml(s.phone)+' '):''}${s.email?('Email: '+escapeHtml(s.email)):''}</div>
        ${s.regNumber?`<div>Reg. No: ${escapeHtml(s.regNumber)}${s.pan?(' · PAN: '+escapeHtml(s.pan)):''}</div>`:''}
      </div>
      <div class="slip-row"><span>Receipt No:</span><span>${escapeHtml(don.receiptNumber)||don.id}</span></div>
      <div class="slip-row"><span>Date:</span><span>${formatDate(don.date)}</span></div>
      <div class="slip-body">
        Received with thanks from <b>${escapeHtml(d.name)}</b>${d.address?(', '+escapeHtml(d.address)):''}
        ${d.pan?(' (PAN: '+escapeHtml(d.pan)+')'):''}
        a sum of <b>${formatCurrency(don.amount)}</b> by <b>${escapeHtml(don.type)}</b>
        towards <b>${escapeHtml(don.purpose)||'general donation'}</b> to ${escapeHtml(s.trustName)}.
      </div>
      <div class="slip-sign">Authorised Signatory</div>
      ${s.footerNote?`<div style="margin-top:20px;font-size:11.5px;text-align:center;color:var(--muted);">${escapeHtml(s.footerNote)}</div>`:''}
    </div>`;
  document.body.classList.add('print-single-rx');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>document.body.classList.remove('print-single-rx'), 300);
  }, 50);
}

/* ---------------------------------------------------------------------- */
/* PROJECTS                                                               */
/* ---------------------------------------------------------------------- */
function renderProjects(){
  const q = (state.search||'').toLowerCase();
  const list = db.projects.filter(p=>!q || [p.name,p.id,p.type].join(' ').toLowerCase().includes(q));
  const rows = list.map(p=>`
    <tr><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.type)}</td><td>${formatDate(p.date)}</td>
      <td><span class="badge ${p.status==='Completed'?'badge-green':p.status==='Ongoing'?'badge-blue':p.status==='Cancelled'?'badge-red':'badge-yellow'}">${escapeHtml(p.status)||'Planned'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-project" data-id="${p.id}">View</button>
        <button class="btn sm secondary" data-action="edit-project" data-id="${p.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-project" data-id="${p.id}">Delete</button>
      </td></tr>`).join('');
  return `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search projects..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="projectForm">➕ New Project</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="empty-note">No projects yet.</td></tr>'}</tbody></table></div>`;
}
function renderProjectForm(id){
  const existing = id ? db.projects.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = `
    <div class="form-page">
      <div class="form-section"><h3>📁 Project Details</h3>
        <div class="form-grid">${fieldsToHTML(PROJECT_FIELDS, existing||{})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="projects">Cancel</button>
        <button class="btn" id="saveProjectBtn">💾 Save Project</button>
      </div>
    </div>`;
  document.getElementById('saveProjectBtn').addEventListener('click',()=>{
    const vals = readFieldsFromForm(PROJECT_FIELDS, document.getElementById('app'));
    if(!vals.name || !vals.name.trim()){ alert('Project name is required.'); return; }
    if(existing){ Object.assign(existing, vals); }
    else{ db.projects.push(Object.assign({id:nextId('PRJ','project'), createdAt:todayISO(), attachments:[]}, vals)); }
    saveDB();
    goto('projects');
  });
}
function renderProjectProfile(id){
  const p = db.projects.find(x=>x.id===id);
  if(!p) return `<div class="empty-note">Project not found.</div>`;
  return `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(p.name)}</h2>
        <div class="meta-line">${escapeHtml(p.id)} · ${escapeHtml(p.type)} · ${formatDate(p.date)}</div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-project" data-id="${p.id}">Edit</button>
        <button class="btn grey" data-action="goto" data-view="projects">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(PROJECT_FIELDS, p)}</div>
    ${attachmentsSectionHTML('project', p)}
  `;
}

/* ---------------------------------------------------------------------- */
/* GENERIC ATTACHMENTS (Projects / Events / Meetings — photos & documents) */
/* ---------------------------------------------------------------------- */
function attachmentListFor(kind){
  switch(kind){
    case 'project': return db.projects;
    case 'event': return db.events;
    case 'meeting': return db.meetings;
    case 'trustee': return db.trustees;
    case 'resolution': return db.resolutions;
    case 'compliance': return db.compliance;
    default: return [];
  }
}
function attachmentsSectionHTML(kind, entity){
  const atts = entity.attachments||[];
  const grid = atts.map(a=>`
    <div class="attachment-card">
      ${a.isImage?`<img class="attachment-thumb" src="${a.dataUrl}">`:`<div class="attachment-thumb attachment-thumb-file">📄</div>`}
      <div class="attachment-meta"><div class="attachment-name">${escapeHtml(a.name)}</div><div class="attachment-sub">${formatDate(a.addedAt)}</div></div>
      <button class="btn sm danger no-print" data-action="delete-attachment" data-kind="${kind}" data-id="${entity.id}" data-attid="${a.id}">Delete</button>
    </div>`).join('') || '<div class="empty-note">No photographs or documents attached yet.</div>';
  return `
    <div class="section-title">📎 Photographs &amp; Documents
      <button class="btn sm no-print" data-action="add-attachment" data-kind="${kind}" data-id="${entity.id}">➕ Add</button>
    </div>
    <div class="attachments-grid">${grid}</div>`;
}
const ATTACHMENT_PROFILE_VIEW = {
  project:'projectProfile', event:'eventProfile', meeting:'meetingProfile',
  trustee:'trusteeProfile', resolution:'resolutionProfile', compliance:'complianceProfile'
};
function openAttachmentPicker(kind, id){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.pdf,.doc,.docx';
  input.onchange = async ()=>{
    const file = input.files && input.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const isImage = file.type && file.type.startsWith('image/');
    const dataUrl = isImage ? await resizeImageDataURL(raw, 1000) : raw;
    const entity = attachmentListFor(kind).find(x=>x.id===id);
    entity.attachments.push({id:uid(), name:file.name, dataUrl, isImage, addedAt:todayISO()});
    saveDB();
    goto(ATTACHMENT_PROFILE_VIEW[kind]||'dashboard', id);
  };
  input.click();
}
function deleteAttachment(kind, id, attId){
  if(!confirm('Delete this attachment?')) return;
  const entity = attachmentListFor(kind).find(x=>x.id===id);
  entity.attachments = entity.attachments.filter(a=>a.id!==attId);
  saveDB();
  goto(ATTACHMENT_PROFILE_VIEW[kind]||'dashboard', id);
}

/* ---------------------------------------------------------------------- */
/* VOLUNTEERS                                                             */
/* ---------------------------------------------------------------------- */
function renderVolunteers(){
  const q = (state.search||'').toLowerCase();
  const list = db.volunteers.filter(v=>!q || [v.name,v.id,v.skills].join(' ').toLowerCase().includes(q));
  const rows = list.map(v=>`
    <tr><td>${escapeHtml(v.id)}</td><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.phone)||'—'}</td>
      <td><span class="badge ${v.certificateStatus==='Issued'?'badge-green':'badge-grey'}">${escapeHtml(v.certificateStatus)||'Not Issued'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-volunteer" data-id="${v.id}">View</button>
        <button class="btn sm secondary" data-action="edit-volunteer" data-id="${v.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-volunteer" data-id="${v.id}">Delete</button>
      </td></tr>`).join('');
  return moreSubtabsHTML('volunteers') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search volunteers..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="volunteerForm">➕ Add Volunteer</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Certificate</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="empty-note">No volunteers yet.</td></tr>'}</tbody></table></div>`;
}
function renderVolunteerForm(id){
  const existing = id ? db.volunteers.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = moreSubtabsHTML('volunteers') + `
    <div class="form-page">
      <div class="form-section"><h3>🙋 Volunteer Details</h3>
        <div class="form-grid">${fieldsToHTML(VOLUNTEER_FIELDS, existing||{})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="volunteers">Cancel</button>
        <button class="btn" id="saveVolunteerBtn">💾 Save Volunteer</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  document.getElementById('saveVolunteerBtn').addEventListener('click',()=>{
    const vals = readFieldsFromForm(VOLUNTEER_FIELDS, document.getElementById('app'));
    if(!vals.name || !vals.name.trim()){ alert('Name is required.'); return; }
    if(existing){ Object.assign(existing, vals); }
    else{ db.volunteers.push(Object.assign({id:nextId('VOL','volunteer'), createdAt:todayISO(), attendance:[]}, vals)); }
    saveDB();
    goto('volunteers');
  });
}
function renderVolunteerProfile(id){
  const v = db.volunteers.find(x=>x.id===id);
  if(!v) return moreSubtabsHTML('volunteers') + `<div class="empty-note">Volunteer not found.</div>`;
  const attendance = (v.attendance||[]).slice().sort((a,b)=>a.date<b.date?1:-1).map(a=>`
    <div class="timeline-card">
      <div class="visit-head"><div class="visit-title">${formatDate(a.date)} — ${escapeHtml(a.project)||'—'}</div>
      <div class="visit-actions"><button class="btn sm danger" data-action="delete-attendance" data-vid="${v.id}" data-aid="${a.id}">Delete</button></div></div>
      <div>Status: ${escapeHtml(a.status)||'—'}</div>
    </div>`).join('') || '<div class="empty-note">No attendance recorded yet.</div>';
  return moreSubtabsHTML('volunteers') + `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;"><h2>${escapeHtml(v.name)}</h2>
      <div class="meta-line">${escapeHtml(v.id)} · ${escapeHtml(v.phone)||'—'}</div></div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-volunteer" data-id="${v.id}">Edit</button>
        <button class="btn" data-action="add-attendance" data-id="${v.id}">➕ Attendance</button>
        <button class="btn grey" data-action="goto" data-view="volunteers">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(VOLUNTEER_FIELDS, v)}</div>
    <div class="section-title">🕐 Attendance / Certificate</div>
    ${attendance}
  `;
}
function openAttendanceModal(vid){
  openModal('Add Attendance', `
    <div class="form-grid">
      <div class="form-field"><label>Date *</label><input type="date" id="atDate" value="${todayISO()}"></div>
      <div class="form-field"><label>Project</label><input type="text" id="atProject"></div>
      <div class="form-field"><label>Status</label><select id="atStatus"><option>Present</option><option>Absent</option></select></div>
    </div>`, `<button class="btn grey" id="atCancel">Cancel</button><button class="btn" id="atSave">Save</button>`);
  document.getElementById('atCancel').onclick = closeModal;
  document.getElementById('atSave').onclick = ()=>{
    const date = document.getElementById('atDate').value;
    if(!date){ alert('Date is required.'); return; }
    const v = db.volunteers.find(x=>x.id===vid);
    v.attendance.push({id:uid(), date, project:document.getElementById('atProject').value, status:document.getElementById('atStatus').value});
    saveDB(); closeModal(); goto('volunteerProfile', vid);
  };
}

/* ---------------------------------------------------------------------- */
/* FINANCIAL                                                              */
/* ---------------------------------------------------------------------- */
function renderFinancial(){
  const entries = allLedgerEntries();
  const cash = entries.filter(e=>e.mode==='Cash');
  const bank = entries.filter(e=>e.mode==='Bank');
  const rowHtml = (list)=> list.map(e=>`
    <tr><td>${formatDate(e.date)}</td><td>${escapeHtml(e.type)}</td>
      <td><span class="badge ${e.category==='income'?'badge-green':'badge-red'}">${e.category==='income'?'Income':'Expenditure'}</span></td>
      <td>${formatCurrency(e.amount)}</td><td class="wrap">${escapeHtml(e.description||e.label||'')}</td></tr>`).join('')
    || '<tr><td colspan="5" class="empty-note">No entries.</td></tr>';
  return moreSubtabsHTML('financial') + `
    <div class="balance-strip">
      <div>💰 Total Income: ${formatCurrency(totalIncome())}</div>
      <div>💸 Total Expenditure: ${formatCurrency(totalExpenditure())}</div>
      <div>🏦 Available Balance: ${formatCurrency(availableBalance())}</div>
    </div>
    <div class="toolbar no-print">
      <button class="btn" data-action="add-transaction">➕ Add Transaction (Grant / Membership / Interest / Other Income / Expenditure)</button>
      <button class="btn secondary" data-action="print-view">🖨️ Print / Save as PDF</button>
    </div>
    <div class="section-title">💵 Cash Book</div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Notes</th></tr></thead><tbody>${rowHtml(cash)}</tbody></table></div>
    <div class="section-title">🏦 Bank Book</div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Notes</th></tr></thead><tbody>${rowHtml(bank)}</tbody></table></div>
  `;
}
function openTransactionModal(){
  openModal('Add Transaction', `<div class="form-grid">${fieldsToHTML(TRANSACTION_FIELDS,{date:todayISO()})}</div>`,
    `<button class="btn grey" id="txCancel">Cancel</button><button class="btn" id="txSave">Save</button>`);
  document.getElementById('txCancel').onclick = closeModal;
  document.getElementById('txSave').onclick = ()=>{
    const vals = readFieldsFromForm(TRANSACTION_FIELDS, document.getElementById('modalBody'));
    if(!vals.date || !vals.type || !vals.amount || !vals.mode){ alert('Date, Type, Amount and Mode are required.'); return; }
    db.transactions.push(Object.assign({id:nextId('TXN','transaction'), createdAt:todayISO()}, vals));
    saveDB(); closeModal();
    goto(state.view==='dashboard' ? 'dashboard' : 'financial');
  };
}

/* ---------------------------------------------------------------------- */
/* DOCUMENTS                                                              */
/* ---------------------------------------------------------------------- */
function renderDocuments(){
  const list = db.documents.slice().sort((a,b)=>(b.date||'')<(a.date||'')?-1:1);
  const grid = list.map(doc=>`
    <div class="attachment-card">
      ${doc.isImage?`<img class="attachment-thumb" src="${doc.fileDataUrl}">`:`<div class="attachment-thumb attachment-thumb-file">📄</div>`}
      <div class="attachment-meta"><div class="attachment-name">${escapeHtml(doc.title)}</div><div class="attachment-sub">${escapeHtml(doc.type)} · ${formatDate(doc.date)}</div></div>
      <button class="btn sm danger no-print" data-action="delete-document" data-id="${doc.id}">Delete</button>
    </div>`).join('') || '<div class="empty-note">No documents stored yet.</div>';
  return moreSubtabsHTML('documents') + `
    <div class="toolbar no-print"><div class="spacer"></div><button class="btn" data-action="goto" data-view="documentForm">➕ Add Document</button></div>
    <div class="attachments-grid">${grid}</div>`;
}
function renderDocumentForm(){
  document.getElementById('app').innerHTML = moreSubtabsHTML('documents') + `
    <div class="form-page">
      <div class="form-section"><h3>📄 Document Details</h3>
        <div class="form-grid">${fieldsToHTML(DOCUMENT_FIELDS,{date:todayISO()})}</div>
        <div class="form-field full" style="margin-top:10px;">
          <label>File (image or PDF)</label>
          <input type="file" id="docFileInput" accept="image/*,.pdf">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="documents">Cancel</button>
        <button class="btn" id="saveDocBtn">💾 Save Document</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  document.getElementById('saveDocBtn').addEventListener('click', async ()=>{
    const vals = readFieldsFromForm(DOCUMENT_FIELDS, document.getElementById('app'));
    if(!vals.title || !vals.title.trim()){ alert('Title is required.'); return; }
    const fileInput = document.getElementById('docFileInput');
    let fileDataUrl = '', isImage = false, fileName = '';
    const file = fileInput.files && fileInput.files[0];
    if(file){
      fileName = file.name;
      isImage = file.type && file.type.startsWith('image/');
      const raw = await readFileAsDataURL(file);
      fileDataUrl = isImage ? await resizeImageDataURL(raw, 1200) : raw;
    }
    db.documents.push(Object.assign({id:nextId('DOC','document'), createdAt:todayISO(), fileDataUrl, isImage, fileName}, vals));
    saveDB();
    goto('documents');
  });
}

/* ---------------------------------------------------------------------- */
/* EVENTS                                                                 */
/* ---------------------------------------------------------------------- */
function renderEvents(){
  const list = db.events.slice().sort((a,b)=>(a.date||'')<(b.date||'')?1:-1);
  const rows = list.map(e=>`
    <tr><td>${escapeHtml(e.id)}</td><td>${escapeHtml(e.name)}</td><td>${formatDate(e.date)}</td><td>${escapeHtml(e.venue)||'—'}</td>
      <td><span class="badge ${e.status==='Completed'?'badge-green':e.status==='Cancelled'?'badge-red':'badge-blue'}">${escapeHtml(e.status)||'Upcoming'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-event" data-id="${e.id}">View</button>
        <button class="btn sm secondary" data-action="edit-event" data-id="${e.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-event" data-id="${e.id}">Delete</button>
      </td></tr>`).join('');
  return moreSubtabsHTML('events') + `
    <div class="toolbar no-print"><div class="spacer"></div><button class="btn" data-action="goto" data-view="eventForm">➕ New Event</button></div>
    <div class="section-title">📅 Upcoming &amp; Past Events</div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Date</th><th>Venue</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="empty-note">No events yet.</td></tr>'}</tbody></table></div>`;
}
function renderEventForm(id){
  const existing = id ? db.events.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = moreSubtabsHTML('events') + `
    <div class="form-page">
      <div class="form-section"><h3>📅 Event Details</h3>
        <div class="form-grid">${fieldsToHTML(EVENT_FIELDS, existing||{})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="events">Cancel</button>
        <button class="btn" id="saveEventBtn">💾 Save Event</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  document.getElementById('saveEventBtn').addEventListener('click',()=>{
    const vals = readFieldsFromForm(EVENT_FIELDS, document.getElementById('app'));
    if(!vals.name || !vals.name.trim()){ alert('Event name is required.'); return; }
    if(existing){ Object.assign(existing, vals); }
    else{ db.events.push(Object.assign({id:nextId('EVT','event'), createdAt:todayISO(), attachments:[]}, vals)); }
    saveDB();
    goto('events');
  });
}
function renderEventProfile(id){
  const e = db.events.find(x=>x.id===id);
  if(!e) return moreSubtabsHTML('events') + `<div class="empty-note">Event not found.</div>`;
  return moreSubtabsHTML('events') + `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;"><h2>${escapeHtml(e.name)}</h2>
      <div class="meta-line">${escapeHtml(e.id)} · ${formatDate(e.date)} · ${escapeHtml(e.venue)||'—'}</div></div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-event" data-id="${e.id}">Edit</button>
        <button class="btn grey" data-action="goto" data-view="events">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(EVENT_FIELDS, e)}</div>
    ${attachmentsSectionHTML('event', e)}
  `;
}

/* ---------------------------------------------------------------------- */
/* MEETINGS                                                               */
/* ---------------------------------------------------------------------- */
function renderMeetings(){
  const list = db.meetings.slice().sort((a,b)=>(a.date||'')<(b.date||'')?1:-1);
  const rows = list.map(m=>`
    <tr><td>${escapeHtml(m.id)}</td><td>${formatDate(m.date)}</td><td class="wrap">${escapeHtml(m.agenda)||'—'}</td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-meeting" data-id="${m.id}">View</button>
        <button class="btn sm secondary" data-action="edit-meeting" data-id="${m.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-meeting" data-id="${m.id}">Delete</button>
      </td></tr>`).join('');
  return moreSubtabsHTML('meetings') + `
    <div class="toolbar no-print"><div class="spacer"></div><button class="btn" data-action="goto" data-view="meetingForm">➕ New Meeting</button></div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Agenda</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="empty-note">No meetings recorded yet.</td></tr>'}</tbody></table></div>`;
}
function renderMeetingForm(id){
  const existing = id ? db.meetings.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = moreSubtabsHTML('meetings') + `
    <div class="form-page">
      <div class="form-section"><h3>📝 Meeting Details</h3>
        <div class="form-grid">${fieldsToHTML(MEETING_FIELDS, existing||{})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="meetings">Cancel</button>
        <button class="btn" id="saveMeetingBtn">💾 Save Meeting</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  document.getElementById('saveMeetingBtn').addEventListener('click',()=>{
    const vals = readFieldsFromForm(MEETING_FIELDS, document.getElementById('app'));
    if(!vals.date){ alert('Meeting date is required.'); return; }
    if(existing){ Object.assign(existing, vals); }
    else{ db.meetings.push(Object.assign({id:nextId('MTG','meeting'), createdAt:todayISO(), attachments:[]}, vals)); }
    saveDB();
    goto('meetings');
  });
}
function renderMeetingProfile(id){
  const m = db.meetings.find(x=>x.id===id);
  if(!m) return moreSubtabsHTML('meetings') + `<div class="empty-note">Meeting not found.</div>`;
  return moreSubtabsHTML('meetings') + `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;"><h2>Meeting — ${formatDate(m.date)}</h2>
      <div class="meta-line">${escapeHtml(m.id)}</div></div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-meeting" data-id="${m.id}">Edit</button>
        <button class="btn grey" data-action="goto" data-view="meetings">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(MEETING_FIELDS, m)}</div>
    ${attachmentsSectionHTML('meeting', m)}
  `;
}

/* ---------------------------------------------------------------------- */
/* REPORTS                                                                */
/* ---------------------------------------------------------------------- */
function renderReports(){
  const html = moreSubtabsHTML('reports') + `
    <div class="print-only">
      <h2 style="color:var(--dark-blue);">${escapeHtml(db.settings.trustName)} — Reports</h2>
      <div>Generated: ${formatDate(todayISO())}</div>
    </div>
    <div class="toolbar no-print"><div class="spacer"></div><button class="btn secondary" data-action="print-view">🖨️ Printable PDF Report</button></div>
    <div class="cards-grid">
      <div class="card"><div class="num">${db.beneficiaries.length}</div><div class="lbl">Beneficiaries</div></div>
      <div class="card"><div class="num">${db.donors.length}</div><div class="lbl">Donors</div></div>
      <div class="card"><div class="num">${formatCurrency(totalDonations())}</div><div class="lbl">Total Donations</div></div>
      <div class="card"><div class="num">${db.projects.length}</div><div class="lbl">Projects</div></div>
      <div class="card"><div class="num">${db.volunteers.length}</div><div class="lbl">Volunteers</div></div>
      <div class="card"><div class="num">${formatCurrency(totalIncome())}</div><div class="lbl">Total Income</div></div>
      <div class="card"><div class="num">${formatCurrency(totalExpenditure())}</div><div class="lbl">Total Expenditure</div></div>
      <div class="card"><div class="num">${formatCurrency(availableBalance())}</div><div class="lbl">Balance</div></div>
    </div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Beneficiaries by Category</h3><canvas id="chartBenCat"></canvas></div>
      <div class="chart-card"><h3>Monthly Donations</h3><canvas id="chartDonMonthly"></canvas></div>
      <div class="chart-card"><h3>Income vs Expenditure (Yearly)</h3><canvas id="chartIncExp"></canvas></div>
      <div class="chart-card"><h3>Projects by Type</h3><canvas id="chartProjType"></canvas></div>
    </div>
  `;
  return html;
}
function drawReportCharts(){
  if(typeof Chart==='undefined'){
    document.querySelectorAll('.chart-card canvas').forEach(c=>{
      c.outerHTML = '<div class="empty-note">Chart library unavailable offline (will render once online).</div>';
    });
    return;
  }
  const byCat = {};
  db.beneficiaries.forEach(b=>{ const c=b.category||'Other'; byCat[c]=(byCat[c]||0)+1; });
  const c1 = document.getElementById('chartBenCat');
  if(c1) new Chart(c1, {type:'pie', data:{labels:Object.keys(byCat), datasets:[{data:Object.values(byCat), backgroundColor:['#1565c0','#2e7d32','#fb8c00','#e53935','#6a1b9a','#f9a825','#0b3d66']}]}});

  const monthly = {};
  allDonationEntries().forEach(e=>{ const m=(e.date||'').slice(0,7); if(!m) return; monthly[m]=(monthly[m]||0)+e.amount; });
  const months = Object.keys(monthly).sort();
  const c2 = document.getElementById('chartDonMonthly');
  if(c2) new Chart(c2, {type:'bar', data:{labels:months, datasets:[{label:'Donations (₹)', data:months.map(m=>monthly[m]), backgroundColor:'#1565c0'}]}});

  const c3 = document.getElementById('chartIncExp');
  if(c3) new Chart(c3, {type:'bar', data:{labels:['This Year'], datasets:[
    {label:'Income', data:[totalIncome()], backgroundColor:'#2e7d32'},
    {label:'Expenditure', data:[totalExpenditure()], backgroundColor:'#e53935'}
  ]}});

  const byType = {};
  db.projects.forEach(p=>{ const t=p.type||'Other'; byType[t]=(byType[t]||0)+1; });
  const c4 = document.getElementById('chartProjType');
  if(c4) new Chart(c4, {type:'doughnut', data:{labels:Object.keys(byType), datasets:[{data:Object.values(byType), backgroundColor:['#1565c0','#2e7d32','#fb8c00','#e53935','#6a1b9a','#f9a825','#0b3d66','#5b6b7b','#0e4d80','#c62828']}]}});
}

/* ---------------------------------------------------------------------- */
/* SETTINGS                                                               */
/* ---------------------------------------------------------------------- */
const SETTINGS_FIELDS = [
  {key:'trustName', label:'Trust Name', type:'text'},
  {key:'address', label:'Address', type:'textarea'},
  {key:'phone', label:'Phone', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'website', label:'Website', type:'text'},
  {key:'regNumber', label:'Registration Number', type:'text'},
  {key:'pan', label:'PAN', type:'text'},
  {key:'bankDetails', label:'Bank Details', type:'textarea'},
  {key:'receiptFormat', label:'Receipt Format', type:'select', options:['Standard','Detailed']},
  {key:'footerNote', label:'Receipt / Report Footer Note', type:'textarea'}
];
function renderSettings(){
  const s = db.settings;
  return `
    <div class="settings-block">
      <h3>🏢 Trust Details</h3>
      <div class="form-grid">${fieldsToHTML(SETTINGS_FIELDS, s)}</div>
      <div class="form-field" style="margin-top:10px;">
        <label>Logo</label>
        <input type="file" accept="image/*" id="logoInput">
        <input type="hidden" id="logoValue" value="${escapeHtml(s.logo)}">
        <div style="margin-top:8px;">${s.logo?`<img src="${s.logo}" id="logoPreview" style="width:70px;height:70px;object-fit:cover;border-radius:10px;">`:`<img id="logoPreview" style="display:none;width:70px;height:70px;object-fit:cover;border-radius:10px;">`}</div>
      </div>
      <div class="form-actions"><button class="btn" id="saveSettingsBtn">💾 Save Settings</button></div>
    </div>
    <div class="settings-block">
      <h3>🌟 Founder Page &amp; Trust Identity</h3>
      <div class="form-grid">${fieldsToHTML(FOUNDER_SETTINGS_FIELDS, s)}</div>
      <div class="form-field" style="margin-top:10px;">
        <label>Founder Photograph</label>
        <input type="file" accept="image/*" id="founderPhotoInput">
        <input type="hidden" id="founderPhotoValue" value="${escapeHtml(s.founderPhoto)}">
        <div style="margin-top:8px;">${s.founderPhoto?`<img src="${s.founderPhoto}" id="founderPhotoPreview" style="width:70px;height:70px;object-fit:cover;border-radius:10px;">`:`<img id="founderPhotoPreview" style="display:none;width:70px;height:70px;object-fit:cover;border-radius:10px;">`}</div>
      </div>
      <div class="form-actions"><button class="btn" id="saveFounderBtn">💾 Save Founder Page</button></div>
    </div>
    <div class="settings-block">
      <h3>💾 Backup &amp; Restore</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn secondary" id="backupBtn">⬇️ Download Backup (JSON)</button>
        <label class="btn secondary" style="display:inline-flex;align-items:center;">⬆️ Restore from Backup
          <input type="file" accept=".json" id="restoreInput" style="display:none;">
        </label>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:10px;">Backup includes every Trust Manager section: Trust Profile, Trustees &amp; trustee terms, Resolutions, Compliance, Founder Memorial (incl. timeline, gallery &amp; documents), Notifications, beneficiaries, donors, projects, volunteers, finance records, events, meetings, documents and settings. Restoring validates the file first and asks for confirmation before replacing data. WBCYN and Clinic Manager data are stored separately and are unaffected.</p>
    </div>
  `;
}
function attachSettingsHandlers(){
  const logoInput = document.getElementById('logoInput');
  if(logoInput) logoInput.addEventListener('change', async ()=>{
    const file = logoInput.files && logoInput.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const resized = await resizeImageDataURL(raw, 400);
    document.getElementById('logoValue').value = resized;
    const prev = document.getElementById('logoPreview');
    prev.src = resized; prev.style.display = 'block';
  });
  const saveBtn = document.getElementById('saveSettingsBtn');
  if(saveBtn) saveBtn.addEventListener('click', ()=>{
    const vals = readFieldsFromForm(SETTINGS_FIELDS, document.getElementById('app'));
    Object.assign(db.settings, vals, {logo:document.getElementById('logoValue').value});
    saveDB();
    renderHeader();
    alert('Settings saved.');
  });
  const founderPhotoInput = document.getElementById('founderPhotoInput');
  if(founderPhotoInput) founderPhotoInput.addEventListener('change', async ()=>{
    const file = founderPhotoInput.files && founderPhotoInput.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const resized = await resizeImageDataURL(raw, 500);
    document.getElementById('founderPhotoValue').value = resized;
    const prev = document.getElementById('founderPhotoPreview');
    prev.src = resized; prev.style.display = 'block';
  });
  const saveFounderBtn = document.getElementById('saveFounderBtn');
  if(saveFounderBtn) saveFounderBtn.addEventListener('click', ()=>{
    const vals = readFieldsFromForm(FOUNDER_SETTINGS_FIELDS, document.getElementById('app'));
    Object.assign(db.settings, vals, {founderPhoto:document.getElementById('founderPhotoValue').value});
    saveDB();
    alert('Founder page saved.');
  });
  const backupBtn = document.getElementById('backupBtn');
  if(backupBtn) backupBtn.addEventListener('click', ()=>{
    downloadFile('trust-manager-backup-'+nowTimestamp()+'.json', JSON.stringify(db, null, 2));
  });
  const restoreInput = document.getElementById('restoreInput');
  if(restoreInput) restoreInput.addEventListener('change', ()=>{
    const file = restoreInput.files && restoreInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      let parsed;
      try{ parsed = JSON.parse(reader.result); }
      catch(e){ alert('Invalid backup file: not valid JSON.'); return; }
      const validation = validateTrustBackup(parsed);
      if(!validation.ok){ alert('This does not look like a valid Trust Manager backup file.\n\n'+validation.reason); return; }
      const summary = `Beneficiaries: ${(parsed.beneficiaries||[]).length}\nDonors: ${(parsed.donors||[]).length}\nTrustees: ${(parsed.trustees||[]).length}\nResolutions: ${(parsed.resolutions||[]).length}\nCompliance Items: ${(parsed.compliance||[]).length}`;
      if(!confirm('This will replace ALL current Trust Manager data with the contents of this backup file.\n\nBackup contains:\n'+summary+'\n\nThis cannot be undone. Continue?')) return;
      try{
        db = ensureShape(parsed);
        saveDB();
        renderHeader();
        goto('dashboard');
        alert('Restore complete.');
      }catch(e){ alert('Invalid backup file.'); }
    };
    reader.readAsText(file);
  });
}

/* ---------------------------------------------------------------------- */
/* TRUSTEE BODY — DIRECTORY / PROFILE / BOARD                             */
/* ---------------------------------------------------------------------- */
const TRUSTEE_FILTERS = [
  {id:'all', label:'All'},
  {id:'current', label:'Current Trustees'},
  {id:'former', label:'Former Trustees'},
  {id:'expiredTerms', label:'Expired Terms'},
  {id:'vacant', label:'Vacant Positions'},
  {id:'officeBearers', label:'Office Bearers'}
];
function trusteeStatusBadgeClass(status){
  if(status==='Active') return 'badge-green';
  if(status==='Vacant') return 'badge-grey';
  if(status==='Expired') return 'badge-red';
  if(status==='Removed') return 'badge-red';
  if(status==='Deceased') return 'badge-purple';
  if(status==='Resigned') return 'badge-yellow';
  return 'badge-grey';
}
function applyTrusteeFilter(list, filter){
  switch(filter){
    case 'current': return list.filter(t=>t.status==='Active'||!t.status);
    case 'former': return list.filter(t=>['Resigned','Removed','Deceased'].includes(t.status));
    case 'expiredTerms': return list.filter(t=>t.status==='Expired' || termActiveOrExpired(t)==='Expired');
    case 'vacant': return list.filter(t=>t.status==='Vacant');
    case 'officeBearers': return list.filter(t=>OFFICE_BEARER_CATEGORIES.includes(t.category));
    default: return list;
  }
}
function filteredTrustees(){
  const q = (state.search||'').toLowerCase();
  let list = db.trustees.filter(t=>!q || [t.name,t.id,t.designation,t.category,t.mobile,t.email].join(' ').toLowerCase().includes(q));
  list = applyTrusteeFilter(list, state.trusteeFilter||'all');
  return list;
}
function renderTrustees(){
  const list = filteredTrustees();
  const filterBar = `<div class="subtabs no-print" style="margin-bottom:14px;">${TRUSTEE_FILTERS.map(f=>`<button data-trusteefilter="${f.id}" class="${(state.trusteeFilter||'all')===f.id?'active':''}">${f.label}</button>`).join('')}</div>`;
  const rows = list.map(t=>`
    <tr>
      <td>${escapeHtml(t.id)}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.category)||'—'}</td>
      <td>${escapeHtml(t.mobile)||'—'}</td>
      <td><span class="badge ${trusteeStatusBadgeClass(t.status)}">${escapeHtml(t.status)||'Active'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-trustee" data-id="${t.id}">View</button>
        <button class="btn sm secondary" data-action="edit-trustee" data-id="${t.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-trustee" data-id="${t.id}">Delete</button>
      </td>
    </tr>`).join('');
  const cards = list.map(t=>`
    <div class="record-card row-blue">
      ${t.photo?`<img class="record-card-photo" src="${t.photo}">`:`<div class="record-card-photo record-card-photo-placeholder">${escapeHtml((t.name||'?')[0])}</div>`}
      <div class="record-card-body">
        <div class="record-card-name">${escapeHtml(t.name)}</div>
        <div class="record-card-meta">${escapeHtml(t.id)} · ${escapeHtml(t.category)||'—'}</div>
        <div class="record-card-meta">${escapeHtml(t.mobile)||'—'}</div>
        <div class="record-card-meta"><span class="badge ${trusteeStatusBadgeClass(t.status)}">${escapeHtml(t.status)||'Active'}</span></div>
        <div class="record-card-actions">
          <button class="btn sm secondary" data-action="view-trustee" data-id="${t.id}">View</button>
          <button class="btn sm secondary" data-action="edit-trustee" data-id="${t.id}">Edit</button>
          <button class="btn sm danger" data-action="delete-trustee" data-id="${t.id}">Delete</button>
        </div>
      </div>
    </div>`).join('');
  return trusteeSubtabsHTML('trustees') + filterBar + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by name, designation, phone, email, ID..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn secondary" data-action="print-view">🖨️ Print</button>
      <button class="btn secondary" data-action="export-trustees">⬇️ Export</button>
      <button class="btn" data-action="goto" data-view="trusteeForm">➕ Add Trustee</button>
    </div>
    <div class="records-table-wrap table-wrap">
      <table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Mobile</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty-note">No trustees match this filter.</td></tr>'}</tbody></table>
    </div>
    <div class="records-cards-wrap">${cards || '<div class="empty-note">No trustees match this filter.</div>'}</div>
  `;
}
function renderTrusteeForm(id){
  const existing = id ? db.trustees.find(x=>x.id===id) : null;
  const t = existing || {};
  document.getElementById('app').innerHTML = trusteeSubtabsHTML('trustees') + `
    <div class="form-page">
      <div class="form-section">
        <h3>🏛 Trustee Details</h3>
        <div class="form-grid">${fieldsToHTML(TRUSTEE_FIELDS, t)}</div>
      </div>
      <div class="form-section">
        <h3>📷 Photograph</h3>
        <div class="form-field">
          <input type="file" accept="image/*" id="trPhotoInput">
          <input type="hidden" id="trPhotoValue" value="${escapeHtml(t.photo)}">
          <div style="margin-top:8px;">${t.photo?`<img src="${t.photo}" id="trPhotoPreview" style="width:80px;height:80px;border-radius:12px;object-fit:cover;">`:`<img id="trPhotoPreview" style="display:none;width:80px;height:80px;border-radius:12px;object-fit:cover;">`}</div>
        </div>
      </div>
      <div class="form-section">
        <h3>🧭 Roles &amp; Responsibilities</h3>
        <div class="form-grid">${fieldsToHTML(ROLE_FIELDS, t)}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="trustees">Cancel</button>
        <button class="btn" id="saveTrusteeBtn">💾 Save Trustee</button>
      </div>
    </div>`;
  attachTrusteeSubtabHandlers();
  const photoInput = document.getElementById('trPhotoInput');
  photoInput.addEventListener('change', async ()=>{
    const file = photoInput.files && photoInput.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const resized = await resizeImageDataURL(raw, 500);
    document.getElementById('trPhotoValue').value = resized;
    const prev = document.getElementById('trPhotoPreview');
    prev.src = resized; prev.style.display = 'block';
  });
  document.getElementById('saveTrusteeBtn').addEventListener('click', ()=>{
    const root = document.getElementById('app');
    const vals = Object.assign(readFieldsFromForm(TRUSTEE_FIELDS, root), readFieldsFromForm(ROLE_FIELDS, root));
    if(!vals.name || !vals.name.trim()){ alert('Full Name is required.'); return; }
    const photo = document.getElementById('trPhotoValue').value;
    if(existing){ Object.assign(existing, vals, {photo}); }
    else{ db.trustees.push(Object.assign({id:nextId('TRU','trustee'), createdAt:todayISO(), attachments:[]}, vals, {photo})); }
    saveDB();
    goto('trustees');
  });
}
function renderTrusteeProfile(id){
  const t = db.trustees.find(x=>x.id===id);
  if(!t) return trusteeSubtabsHTML('trustees') + `<div class="empty-note">Trustee not found.</div>`;
  const pct = attendancePercent(t.id);
  return trusteeSubtabsHTML('trustees') + `
    <div class="profile-header">
      ${t.photo?`<img class="record-photo" src="${t.photo}">`:`<div class="record-photo record-photo-placeholder">${escapeHtml((t.name||'?')[0])}</div>`}
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(t.name)}</h2>
        <div class="meta-line">${escapeHtml(t.id)} · ${escapeHtml(t.category)||'—'} · ${escapeHtml(t.mobile)||'—'}</div>
        <div class="meta-line">Attendance: ${pct===null?'—':pct+'%'}</div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-trustee" data-id="${t.id}">Edit</button>
        <button class="btn grey" data-action="goto" data-view="trustees">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRowsMasked(TRUSTEE_FIELDS, t, ['pan','aadhaar'])}</div>
    <div class="section-title">🧭 Roles &amp; Responsibilities</div>
    <div class="detail-grid">${detailRows(ROLE_FIELDS, t)}</div>
    ${termStatusPanelHTML(t)}
    ${attachmentsSectionHTML('trustee', t)}
  `;
}
function termStatusPanelHTML(t){
  const today = todayISO();
  const remaining = t.termExpiryDate ? daysBetween(today, t.termExpiryDate) : null;
  const yrs = yearsCompleted(t);
  const termState = termActiveOrExpired(t);
  return `
    <div class="section-title">⏳ Term Status</div>
    <div class="balance-strip">
      <div>Years Completed: ${yrs===null?'—':yrs}</div>
      <div>Remaining Days: ${remaining===null?'—':(remaining<0?'Expired '+Math.abs(remaining)+' days ago':remaining+' days')}</div>
      <div>Term Status: <span class="badge ${termState==='Expired'?'badge-red':termState==='Active'?'badge-green':'badge-grey'}">${termState}</span></div>
    </div>
  `;
}
function renderTrusteeBoard(){
  const active = db.trustees.filter(t=>t.status==='Active'||!t.status);
  const cards = active.map(t=>`
    <div class="record-card row-blue">
      ${t.photo?`<img class="record-card-photo" src="${t.photo}">`:`<div class="record-card-photo record-card-photo-placeholder">${escapeHtml((t.name||'?')[0])}</div>`}
      <div class="record-card-body">
        <div class="record-card-name">${escapeHtml(t.name)}</div>
        <div class="record-card-meta">${escapeHtml(t.category)||t.designation||'—'}</div>
        <div class="record-card-meta">${escapeHtml(t.mobile)||'—'}</div>
        <div class="record-card-meta">${escapeHtml(t.email)||'—'}</div>
        <div class="record-card-meta">Appointed: ${formatDate(t.dateOfAppointment)}</div>
        <div class="record-card-meta"><span class="badge badge-green">${escapeHtml(t.status)||'Active'}</span></div>
      </div>
    </div>`).join('') || '<div class="empty-note">No active trustees to display on the board yet.</div>';
  return trusteeSubtabsHTML('trusteeBoard') + `
    <div class="section-title">🖼️ Current Trustee Board</div>
    <div class="attachments-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));">${cards}</div>
  `;
}

/* ---------------------------------------------------------------------- */
/* TRUSTEE BODY — FOUNDER PAGE                                            */
/* ---------------------------------------------------------------------- */
function founderAgeLine(s){
  if(s.founderDOB && s.founderDOD) return `${formatDate(s.founderDOB)} — ${formatDate(s.founderDOD)}`;
  if(s.founderDOB) return `Born ${formatDate(s.founderDOB)}`;
  return '';
}
function renderFounderPage(){
  const s = db.settings;
  const timeline = (db.founderTimeline||[]).slice().sort((a,b)=>String(a.year)<String(b.year)?-1:1).map(t=>`
    <div class="timeline-card origin">
      <div class="visit-head"><div class="visit-title">${escapeHtml(t.year)} — ${escapeHtml(t.title)}</div>
        <div class="visit-actions no-print"><button class="btn sm danger" data-action="delete-founder-timeline" data-tid="${t.id}">Delete</button></div>
      </div>
      ${t.photo?`<img src="${t.photo}" style="width:100%;max-width:260px;border-radius:10px;margin-bottom:8px;">`:''}
      <div>${escapeHtml(t.description)||''}</div>
    </div>`).join('') || '<div class="empty-note">No timeline events added yet.</div>';
  const gallery = (db.founderGallery||[]).map(g=>`
    <div class="attachment-card">
      <img class="attachment-thumb" src="${g.url}">
      <div class="attachment-meta"><div class="attachment-name">${escapeHtml(g.caption)||'Photo'}</div></div>
      <button class="btn sm danger no-print" data-action="delete-founder-gallery" data-gid="${g.id}">Delete</button>
    </div>`).join('') || '<div class="empty-note">No photos in the gallery yet.</div>';
  const docs = (db.founderMemorialDocs||[]).map(d=>`
    <div class="attachment-card">
      ${d.isImage?`<img class="attachment-thumb" src="${d.dataUrl}">`:`<div class="attachment-thumb attachment-thumb-file">📄</div>`}
      <div class="attachment-meta"><div class="attachment-name">${escapeHtml(d.name)}</div><div class="attachment-sub">${formatDate(d.addedAt)}</div></div>
      <button class="btn sm danger no-print" data-action="delete-founder-doc" data-did="${d.id}">Delete</button>
    </div>`).join('') || '<div class="empty-note">No supporting documents uploaded yet.</div>';
  return moreSubtabsHTML('founder') + `
    <div class="profile-header">
      ${s.founderPhoto?`<img class="record-photo" src="${s.founderPhoto}" style="width:110px;height:110px;">`:`<div class="record-photo record-photo-placeholder" style="width:110px;height:110px;font-size:44px;">${escapeHtml((s.founderName||'F')[0])}</div>`}
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(s.founderName)||'Founder details not yet added'}</h2>
        <div class="meta-line">${founderAgeLine(s)}${s.founderPlaceOfBirth?(' · '+escapeHtml(s.founderPlaceOfBirth)):''}</div>
        <div class="meta-line">${escapeHtml(s.trustMotto)||''}</div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="goto" data-view="settings">✏️ Edit Memorial Page</button>
        <button class="btn secondary" data-action="print-view">🖨️ Print Memorial Page</button>
      </div>
    </div>
    <div class="section-title">🎓 Education &amp; Profession</div>
    <div class="detail-grid">
      <div><div class="dl">Education</div><div class="dv">${escapeHtml(s.founderEducation)||'—'}</div></div>
      <div><div class="dl">Profession</div><div class="dv">${escapeHtml(s.founderProfession)||'—'}</div></div>
    </div>
    <div class="section-title">📖 Biography</div>
    <div class="detail-grid full"><div class="full"><div class="dv">${escapeHtml(s.founderBio)||'—'}</div></div></div>
    <div class="section-title">🚶 Life Journey</div>
    <div class="detail-grid full"><div class="full"><div class="dv">${escapeHtml(s.founderVision)||'—'}</div></div></div>
    <div class="section-title">🤝 Social Contributions</div>
    <div class="detail-grid full"><div class="full"><div class="dv">${escapeHtml(s.founderMission)||'—'}</div></div></div>
    <div class="section-title">💎 Philosophy</div>
    <div class="detail-grid full"><div class="full"><div class="dv">${escapeHtml(s.founderValues)||'—'}</div></div></div>
    <div class="section-title">🕊️ Inspirational Quote(s)</div>
    <div class="detail-grid full"><div class="full"><div class="dv" style="font-style:italic;">${escapeHtml(s.founderQuote)||'—'}</div></div></div>
    <div class="section-title">🏛 Awards, Recognition &amp; Legacy</div>
    <div class="detail-grid full"><div class="full"><div class="dv">${escapeHtml(s.founderLegacy)||'—'}</div></div></div>
    ${s.founderMessage?`<div class="section-title">💬 Message from the Founder President</div><div class="detail-grid full"><div class="full"><div class="dv" style="font-style:italic;">${escapeHtml(s.founderMessage)}</div></div></div>`:''}

    <div class="section-title">📜 Life Timeline
      <button class="btn sm no-print" data-action="add-founder-timeline">➕ Add Event</button>
    </div>
    ${timeline}

    <div class="section-title">🖼️ Photo Gallery
      <button class="btn sm no-print" data-action="add-founder-gallery">➕ Add Photo</button>
    </div>
    <div class="attachments-grid">${gallery}</div>

    <div class="section-title">📎 Supporting Documents
      <button class="btn sm no-print" data-action="add-founder-doc">➕ Add Document</button>
    </div>
    <div class="attachments-grid">${docs}</div>
  `;
}
function openFounderTimelineModal(){
  openModal('Add Timeline Event', `
    <div class="form-grid">
      <div class="form-field"><label>Year *</label><input type="text" id="ftYear" placeholder="e.g. 1985"></div>
      <div class="form-field"><label>Event Title *</label><input type="text" id="ftTitle"></div>
      <div class="form-field full"><label>Description</label><textarea id="ftDesc"></textarea></div>
      <div class="form-field full"><label>Photograph (optional)</label><input type="file" accept="image/*" id="ftPhoto"></div>
    </div>`, `<button class="btn grey" id="ftCancel">Cancel</button><button class="btn" id="ftSave">Save</button>`);
  document.getElementById('ftCancel').onclick = closeModal;
  document.getElementById('ftSave').onclick = async ()=>{
    const year = document.getElementById('ftYear').value;
    const title = document.getElementById('ftTitle').value;
    if(!year || !title){ alert('Year and Event Title are required.'); return; }
    let photo = '';
    const file = document.getElementById('ftPhoto').files[0];
    if(file){ const raw = await readFileAsDataURL(file); photo = await resizeImageDataURL(raw, 900); }
    db.founderTimeline.push({id:uid(), year, title, description:document.getElementById('ftDesc').value, photo});
    saveDB(); closeModal(); goto('founder');
  };
}
function openFounderGalleryPicker(){
  openModal('Add Photo to Gallery', `
    <div class="form-grid">
      <div class="form-field full"><label>Photo *</label><input type="file" accept="image/*" id="fgPhoto"></div>
      <div class="form-field full"><label>Caption</label><input type="text" id="fgCaption"></div>
    </div>`, `<button class="btn grey" id="fgCancel">Cancel</button><button class="btn" id="fgSave">Save</button>`);
  document.getElementById('fgCancel').onclick = closeModal;
  document.getElementById('fgSave').onclick = async ()=>{
    const file = document.getElementById('fgPhoto').files[0];
    if(!file){ alert('Please choose a photo.'); return; }
    const raw = await readFileAsDataURL(file);
    const url = await resizeImageDataURL(raw, 1000);
    db.founderGallery.push({id:uid(), url, caption:document.getElementById('fgCaption').value});
    saveDB(); closeModal(); goto('founder');
  };
}
function openFounderDocumentPicker(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.pdf,.doc,.docx';
  input.onchange = async ()=>{
    const file = input.files && input.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const isImage = file.type && file.type.startsWith('image/');
    const dataUrl = isImage ? await resizeImageDataURL(raw, 1000) : raw;
    db.founderMemorialDocs.push({id:uid(), name:file.name, dataUrl, isImage, addedAt:todayISO()});
    saveDB();
    goto('founder');
  };
  input.click();
}

/* ---------------------------------------------------------------------- */
/* TRUSTEE BODY — MEETING ATTENDANCE                                     */
/* ---------------------------------------------------------------------- */
function yearsCompleted(t){
  const start = t.termStartDate || t.dateOfAppointment;
  if(!start) return null;
  const days = daysBetween(start, todayISO());
  if(days===null || days<0) return null;
  return Math.floor(days/365.25*10)/10;
}
function termActiveOrExpired(t){
  if(!t.termExpiryDate) return '—';
  const remaining = daysBetween(todayISO(), t.termExpiryDate);
  if(remaining===null) return '—';
  return remaining < 0 ? 'Expired' : 'Active';
}
function termExpiryWindowDays(t){
  if(!t.termExpiryDate) return null;
  return daysBetween(todayISO(), t.termExpiryDate);
}
function trusteesWithUpcomingExpiry(){
  const windows = [90,60,30,7];
  return db.trustees.filter(t=>{
    const d = termExpiryWindowDays(t);
    return d!==null && d>=0 && windows.some(w=>d<=w);
  });
}
function attendancePercent(trusteeId){
  let total=0, present=0;
  db.trusteeMeetings.forEach(m=>{
    const rec = (m.attendance||[]).find(a=>a.trusteeId===trusteeId);
    if(rec){ total++; if(rec.status==='Present') present++; }
  });
  if(total===0) return null;
  return Math.round((present/total)*100);
}
function overallAttendancePercent(){
  const withRecords = db.trustees.filter(t=>attendancePercent(t.id)!==null);
  if(!withRecords.length) return null;
  const sum = withRecords.reduce((s,t)=>s+attendancePercent(t.id),0);
  return Math.round(sum/withRecords.length);
}
function renderTrusteeMeetings(){
  const list = db.trusteeMeetings.slice().sort((a,b)=>(a.date||'')<(b.date||'')?1:-1);
  const rows = list.map(m=>{
    const p = (m.attendance||[]).filter(a=>a.status==='Present').length;
    const total = (m.attendance||[]).length;
    return `<tr><td>${escapeHtml(m.id)}</td><td>${formatDate(m.date)}</td><td>${escapeHtml(m.name)}</td>
      <td>${p}/${total} present</td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="edit-trustee-meeting" data-id="${m.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-trustee-meeting" data-id="${m.id}">Delete</button>
      </td></tr>`;
  }).join('');
  const trusteeRows = db.trustees.map(t=>`<tr><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.category)||'—'}</td><td>${attendancePercent(t.id)===null?'—':attendancePercent(t.id)+'%'}</td></tr>`).join('');
  return trusteeSubtabsHTML('trusteeMeetings') + `
    <div class="toolbar no-print"><div class="spacer"></div><button class="btn" data-action="goto" data-view="trusteeMeetingForm">➕ Record Meeting Attendance</button></div>
    <div class="section-title">🗓️ Meeting Sessions</div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Meeting Name</th><th>Attendance</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="empty-note">No meeting attendance recorded yet.</td></tr>'}</tbody></table></div>
    <div class="section-title">📈 Attendance % by Trustee</div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Category</th><th>Attendance %</th></tr></thead>
    <tbody>${trusteeRows || '<tr><td colspan="3" class="empty-note">No trustees added yet.</td></tr>'}</tbody></table></div>
  `;
}
function renderTrusteeMeetingForm(id){
  const existing = id ? db.trusteeMeetings.find(x=>x.id===id) : null;
  const attByTrustee = {};
  if(existing) (existing.attendance||[]).forEach(a=>{ attByTrustee[a.trusteeId] = a.status; });
  const rowsHtml = db.trustees.map(t=>`
    <div class="sub-list-row" style="grid-template-columns:2fr 1fr;">
      <div style="align-self:center;font-weight:600;">${escapeHtml(t.name)} <span style="color:var(--muted);font-weight:400;">(${escapeHtml(t.id)})</span></div>
      <select class="tm-status" data-trustee-id="${t.id}">
        <option value="Present" ${attByTrustee[t.id]==='Present'?'selected':''}>Present</option>
        <option value="Absent" ${attByTrustee[t.id]==='Absent'?'selected':''}>Absent</option>
        <option value="Leave" ${attByTrustee[t.id]==='Leave'?'selected':''}>Leave</option>
      </select>
    </div>`).join('') || '<div class="empty-note">Add trustees in the Directory first to record attendance.</div>';
  document.getElementById('app').innerHTML = trusteeSubtabsHTML('trusteeMeetings') + `
    <div class="form-page">
      <div class="form-section">
        <h3>🗓️ Meeting Details</h3>
        <div class="form-grid">
          <div class="form-field"><label>Meeting Date *</label><input type="date" id="tmDate" value="${escapeHtml(existing? existing.date : todayISO())}"></div>
          <div class="form-field"><label>Meeting Name</label><input type="text" id="tmName" value="${escapeHtml(existing? existing.name : '')}"></div>
        </div>
      </div>
      <div class="form-section">
        <h3>✅ Attendance</h3>
        <div id="tmRows">${rowsHtml}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="trusteeMeetings">Cancel</button>
        <button class="btn" id="saveTrusteeMeetingBtn">💾 Save Attendance</button>
      </div>
    </div>`;
  attachTrusteeSubtabHandlers();
  document.getElementById('saveTrusteeMeetingBtn').addEventListener('click', ()=>{
    const date = document.getElementById('tmDate').value;
    if(!date){ alert('Meeting date is required.'); return; }
    const name = document.getElementById('tmName').value;
    const attendance = Array.from(document.querySelectorAll('.tm-status')).map(sel=>({trusteeId:sel.getAttribute('data-trustee-id'), status:sel.value}));
    if(existing){ Object.assign(existing, {date, name, attendance}); }
    else{ db.trusteeMeetings.push({id:nextId('TMT','trusteeMeeting'), date, name, attendance, createdAt:todayISO()}); }
    saveDB();
    goto('trusteeMeetings');
  });
}

/* ---------------------------------------------------------------------- */
/* TRUSTEE BODY — RESOLUTION REGISTER                                     */
/* ---------------------------------------------------------------------- */
const RESOLUTION_CODE_PREFIX = 'DNIMCT';
function nextResolutionNumber(){
  const year = new Date().getFullYear();
  const countThisYear = db.resolutions.filter(r=>(r.resolutionNumber||'').includes('/'+year+'/')).length;
  return `${RESOLUTION_CODE_PREFIX}/RES/${year}/${String(countThisYear+1).padStart(3,'0')}`;
}
function resolutionYears(){
  const yrs = new Set(db.resolutions.map(r=>(r.date||'').slice(0,4)).filter(Boolean));
  return Array.from(yrs).sort().reverse();
}
function attachResolutionFilterHandlers(){
  const yearSel = document.getElementById('resYearFilter');
  if(yearSel) yearSel.addEventListener('change', ()=>{ state.resolutionYearFilter = yearSel.value; render(); });
  const statusSel = document.getElementById('resStatusFilter');
  if(statusSel) statusSel.addEventListener('change', ()=>{ state.resolutionStatusFilter = statusSel.value; render(); });
}
function renderResolutions(){
  const q = (state.search||'').toLowerCase();
  let list = db.resolutions.filter(r=>!q || [r.resolutionNumber,r.subject,r.id].join(' ').toLowerCase().includes(q));
  if(state.resolutionYearFilter && state.resolutionYearFilter!=='all') list = list.filter(r=>(r.date||'').slice(0,4)===state.resolutionYearFilter);
  if(state.resolutionStatusFilter && state.resolutionStatusFilter!=='all') list = list.filter(r=>(r.implementationStatus||'Pending')===state.resolutionStatusFilter);
  list = list.slice().sort((a,b)=>(a.date||'')<(b.date||'')?1:-1);
  const years = resolutionYears();
  const rows = list.map(r=>`
    <tr><td>${escapeHtml(r.resolutionNumber)||escapeHtml(r.id)}</td><td>${formatDate(r.date)}</td><td class="wrap">${escapeHtml(r.subject)}</td>
      <td><span class="badge ${r.implementationStatus==='Completed'||r.implementationStatus==='Closed'?'badge-green':r.implementationStatus==='In Progress'?'badge-blue':'badge-yellow'}">${escapeHtml(r.implementationStatus)||'Pending'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-resolution" data-id="${r.id}">View</button>
        <button class="btn sm secondary" data-action="edit-resolution" data-id="${r.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-resolution" data-id="${r.id}">Delete</button>
      </td></tr>`).join('');
  return moreSubtabsHTML('resolutions') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search resolutions..." value="${escapeHtml(state.search)}">
      <select id="resYearFilter"><option value="all">All Years</option>${years.map(y=>`<option value="${y}" ${state.resolutionYearFilter===y?'selected':''}>${y}</option>`).join('')}</select>
      <select id="resStatusFilter">
        <option value="all" ${state.resolutionStatusFilter==='all'?'selected':''}>All Statuses</option>
        ${['Pending','In Progress','Completed','Closed'].map(s=>`<option value="${s}" ${state.resolutionStatusFilter===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      <button class="btn secondary" data-action="print-view">🖨️ Print List</button>
      <button class="btn" data-action="goto" data-view="resolutionForm">➕ New Resolution</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>No.</th><th>Date</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="empty-note">No resolutions match the current search/filter.</td></tr>'}</tbody></table></div>
  `;
}
function renderResolutionForm(id){
  const existing = id ? db.resolutions.find(x=>x.id===id) : null;
  const defaults = existing || {resolutionNumber: nextResolutionNumber(), date: todayISO()};
  document.getElementById('app').innerHTML = moreSubtabsHTML('resolutions') + `
    <div class="form-page">
      <div class="form-section"><h3>⚖️ Resolution Details</h3>
        <p style="font-size:12.5px;color:var(--muted);margin-top:-6px;">Resolution Number is auto-suggested (e.g. ${RESOLUTION_CODE_PREFIX}/RES/${new Date().getFullYear()}/001) but can be edited manually.</p>
        <div class="form-grid">${fieldsToHTML(RESOLUTION_FIELDS, defaults)}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="resolutions">Cancel</button>
        <button class="btn" id="saveResolutionBtn">💾 Save Resolution</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  document.getElementById('saveResolutionBtn').addEventListener('click', ()=>{
    const vals = readFieldsFromForm(RESOLUTION_FIELDS, document.getElementById('app'));
    if(!vals.subject || !vals.subject.trim() || !vals.date){ alert('Meeting Date and Subject are required.'); return; }
    if(existing){ Object.assign(existing, vals); }
    else{ db.resolutions.push(Object.assign({id:nextId('RES','resolution'), createdAt:todayISO(), attachments:[]}, vals)); }
    saveDB();
    goto('resolutions');
  });
}
function renderResolutionProfile(id){
  const r = db.resolutions.find(x=>x.id===id);
  if(!r) return moreSubtabsHTML('resolutions') + `<div class="empty-note">Resolution not found.</div>`;
  return moreSubtabsHTML('resolutions') + `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;"><h2>${escapeHtml(r.resolutionNumber)||escapeHtml(r.id)} — ${escapeHtml(r.subject)}</h2>
      <div class="meta-line">${formatDate(r.date)}</div></div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-resolution" data-id="${r.id}">Edit</button>
        <button class="btn secondary" data-action="print-resolution" data-id="${r.id}">🖨️ Printable Resolution</button>
        <button class="btn grey" data-action="goto" data-view="resolutions">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(RESOLUTION_FIELDS, r)}</div>
    ${attachmentsSectionHTML('resolution', r)}
    <div id="resolutionPrintArea" class="rx-print-area"></div>
  `;
}
function printResolutionDocument(id){
  const r = db.resolutions.find(x=>x.id===id);
  if(!r) return;
  const s = db.settings;
  document.getElementById('resolutionPrintArea').innerHTML = `
    <div class="print-slip">
      <div class="slip-head">
        <h2>${escapeHtml(s.trustName)}</h2>
        <div>${escapeHtml(s.address)||''}</div>
        ${s.regNumber?`<div>Reg. No: ${escapeHtml(s.regNumber)}</div>`:''}
      </div>
      <div class="slip-row"><span>Resolution No:</span><span>${escapeHtml(r.resolutionNumber)||r.id}</span></div>
      <div class="slip-row"><span>Meeting Date:</span><span>${formatDate(r.date)}</span></div>
      <div class="slip-row"><span>Meeting Type:</span><span>${escapeHtml(r.meetingType)||'—'}</span></div>
      <div class="slip-row"><span>Meeting No:</span><span>${escapeHtml(r.meetingNumber)||'—'}</span></div>
      <div class="slip-row"><span>Agenda No:</span><span>${escapeHtml(r.agendaNumber)||'—'}</span></div>
      <div class="slip-body">
        <b>Subject:</b> ${escapeHtml(r.subject)}<br><br>
        ${r.backgroundNote?`<b>Background:</b> ${escapeHtml(r.backgroundNote)}<br><br>`:''}
        <b>Resolution:</b><br>${escapeHtml(r.resolutionText)||'—'}<br><br>
        <b>Proposed By:</b> ${escapeHtml(r.proposedBy)||'—'} &nbsp; <b>Seconded By:</b> ${escapeHtml(r.secondedBy)||'—'}<br>
        <b>Members Present:</b> ${escapeHtml(r.membersPresent)||'—'}<br>
        <b>Members Absent:</b> ${escapeHtml(r.membersAbsent)||'—'}<br>
        <b>Voting Method:</b> ${escapeHtml(r.votingMethod)||'—'} &nbsp; <b>Result:</b> ${escapeHtml(r.votingResult)||'—'}<br><br>
        <b>Implementation Responsibility:</b> ${escapeHtml(r.implementationResponsibility)||'—'}<br>
        <b>Target Completion Date:</b> ${formatDate(r.targetCompletionDate)}<br>
        <b>Implementation Status:</b> ${escapeHtml(r.implementationStatus)||'Pending'}<br>
      </div>
      <div class="slip-sign">Chairman / Secretary Signature</div>
    </div>`;
  document.body.classList.add('print-single-rx');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>document.body.classList.remove('print-single-rx'), 300);
  }, 50);
}

/* ---------------------------------------------------------------------- */
/* TRUST PROFILE                                                          */
/* ---------------------------------------------------------------------- */
function renderTrustProfile(){
  const p = db.trustProfile;
  const hasData = Object.values(p).some(v=>v);
  return moreSubtabsHTML('trustProfile') + `
    <div class="profile-header">
      ${p.logo?`<img class="record-photo" src="${p.logo}">`:`<div class="record-photo record-photo-placeholder">${escapeHtml((p.fullName||db.settings.trustName||'T')[0])}</div>`}
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(p.fullName)||escapeHtml(db.settings.trustName)}</h2>
        <div class="meta-line">${escapeHtml(p.shortName)||''} ${p.motto?(' · '+escapeHtml(p.motto)):''}</div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="goto" data-view="trustProfileForm">✏️ Edit</button>
        <button class="btn secondary" data-action="print-view">🖨️ Print Profile</button>
        <button class="btn secondary" data-action="export-trust-profile">⬇️ Export Profile</button>
      </div>
    </div>
    ${!hasData ? '<div class="empty-note">Trust Profile has not been filled in yet. Click Edit to add official registration details.</div>' : ''}
    <div class="section-title">🏢 Registration &amp; Legal</div>
    <div class="detail-grid">${detailRowsMasked(TRUST_PROFILE_FIELDS.slice(0,13), p, MASKED_PROFILE_KEYS)}</div>
    <div class="section-title">📍 Contact</div>
    <div class="detail-grid">${detailRowsMasked(TRUST_PROFILE_FIELDS.slice(13,19), p, MASKED_PROFILE_KEYS)}</div>
    <div class="section-title">🏦 Bank Details</div>
    <div class="detail-grid">${detailRowsMasked(TRUST_PROFILE_FIELDS.slice(19,24), p, MASKED_PROFILE_KEYS)}</div>
    <div class="section-title">🎯 Mission, Vision &amp; Values</div>
    <div class="detail-grid">${detailRows(TRUST_PROFILE_FIELDS.slice(24), p)}</div>
  `;
}
function renderTrustProfileForm(){
  const p = db.trustProfile;
  document.getElementById('app').innerHTML = moreSubtabsHTML('trustProfile') + `
    <div class="form-page">
      <div class="form-section">
        <h3>🏢 Trust Profile</h3>
        <div class="form-field" style="margin-bottom:14px;">
          <label>Trust Logo</label>
          <input type="file" accept="image/*" id="tpLogoInput">
          <input type="hidden" id="tpLogoValue" value="${escapeHtml(p.logo)}">
          <div style="margin-top:8px;">${p.logo?`<img src="${p.logo}" id="tpLogoPreview" style="width:70px;height:70px;object-fit:cover;border-radius:10px;">`:`<img id="tpLogoPreview" style="display:none;width:70px;height:70px;object-fit:cover;border-radius:10px;">`}</div>
        </div>
        <div class="form-grid">${fieldsToHTML(TRUST_PROFILE_FIELDS, p)}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="trustProfile">Cancel</button>
        <button class="btn" id="saveTrustProfileBtn">💾 Save Trust Profile</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  const logoInput = document.getElementById('tpLogoInput');
  logoInput.addEventListener('change', async ()=>{
    const file = logoInput.files && logoInput.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const resized = await resizeImageDataURL(raw, 500);
    document.getElementById('tpLogoValue').value = resized;
    const prev = document.getElementById('tpLogoPreview');
    prev.src = resized; prev.style.display = 'block';
  });
  document.getElementById('saveTrustProfileBtn').addEventListener('click', ()=>{
    const vals = readFieldsFromForm(TRUST_PROFILE_FIELDS, document.getElementById('app'));
    if(!vals.fullName || !vals.fullName.trim()){ alert('Full Trust Name is required.'); return; }
    Object.assign(db.trustProfile, vals, {logo:document.getElementById('tpLogoValue').value});
    saveDB();
    goto('trustProfile');
  });
}

/* ---------------------------------------------------------------------- */
/* COMPLIANCE DASHBOARD                                                   */
/* ---------------------------------------------------------------------- */
function complianceEffectiveStatus(c){
  if(c.status==='Completed'||c.status==='Not Applicable') return c.status;
  if(c.dueDate && c.dueDate < todayISO()) return 'Overdue';
  return c.status||'Not Started';
}
function complianceBadgeClass(effStatus){
  if(effStatus==='Completed') return 'badge-green';
  if(effStatus==='Overdue') return 'badge-red';
  if(effStatus==='In Progress') return 'badge-blue';
  if(effStatus==='Not Applicable') return 'badge-grey';
  return 'badge-yellow';
}
function complianceDueThisMonth(){
  const now = new Date();
  const ym = todayISO().slice(0,7);
  return db.compliance.filter(c=>c.dueDate && c.dueDate.slice(0,7)===ym && complianceEffectiveStatus(c)!=='Completed');
}
function complianceDueWithin30(){
  const today = todayISO();
  return db.compliance.filter(c=>{
    if(!c.dueDate || complianceEffectiveStatus(c)==='Completed') return false;
    const d = daysBetween(today, c.dueDate);
    return d!==null && d>=0 && d<=30;
  });
}
function complianceOverdue(){ return db.compliance.filter(c=>complianceEffectiveStatus(c)==='Overdue'); }
function complianceCompleted(){ return db.compliance.filter(c=>c.status==='Completed'); }
function complianceNotApplicable(){ return db.compliance.filter(c=>c.status==='Not Applicable'); }
function renderComplianceDashboardCards(){
  const cards = [
    {num:db.compliance.length, lbl:'Total Compliance Items', icon:'📋'},
    {num:complianceDueThisMonth().length, lbl:'Due This Month', icon:'🗓️'},
    {num:complianceDueWithin30().length, lbl:'Due Within 30 Days', icon:'⏰'},
    {num:complianceOverdue().length, lbl:'Overdue', icon:'🚨'},
    {num:complianceCompleted().length, lbl:'Completed', icon:'✅'},
    {num:complianceNotApplicable().length, lbl:'Not Applicable', icon:'➖'}
  ];
  return `<div class="cards-grid">${cards.map(c=>`<div class="card"><div class="icon">${c.icon}</div><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('')}</div>`;
}
function renderCompliance(){
  const list = db.compliance.slice().sort((a,b)=>(a.dueDate||'')<(b.dueDate||'')?-1:1);
  const rows = list.map(c=>{
    const eff = complianceEffectiveStatus(c);
    return `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.name)}</td><td>${formatDate(c.dueDate)}</td>
      <td><span class="badge ${complianceBadgeClass(eff)}">${escapeHtml(eff)}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-compliance" data-id="${c.id}">View</button>
        <button class="btn sm secondary" data-action="edit-compliance" data-id="${c.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-compliance" data-id="${c.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return `
    ${renderComplianceDashboardCards()}
    <div class="toolbar no-print"><div class="spacer"></div><button class="btn" data-action="goto" data-view="complianceForm">➕ Add Compliance Item</button></div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Compliance</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="empty-note">No compliance items added yet. Add items such as Trust Audit, Income Tax Return, 12A/80G Renewal, FCRA Return, Trustee Meetings and more — you control every due date.</td></tr>'}</tbody></table></div>
  `;
}
function renderComplianceForm(id){
  const existing = id ? db.compliance.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = `
    <div class="form-page">
      <div class="form-section"><h3>📋 Compliance Item</h3>
        <div class="form-grid">${fieldsToHTML(COMPLIANCE_FIELDS, existing||{})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="compliance">Cancel</button>
        <button class="btn" id="saveComplianceBtn">💾 Save Compliance Item</button>
      </div>
    </div>`;
  document.getElementById('saveComplianceBtn').addEventListener('click', ()=>{
    const vals = readFieldsFromForm(COMPLIANCE_FIELDS, document.getElementById('app'));
    if(!vals.name || !vals.dueDate){ alert('Compliance Name and Due Date are required.'); return; }
    if(existing){ Object.assign(existing, vals); }
    else{ db.compliance.push(Object.assign({id:nextId('CMP','compliance'), createdAt:todayISO(), attachments:[]}, vals)); }
    saveDB();
    goto('compliance');
  });
}
function renderComplianceProfile(id){
  const c = db.compliance.find(x=>x.id===id);
  if(!c) return `<div class="empty-note">Compliance item not found.</div>`;
  const eff = complianceEffectiveStatus(c);
  return `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;"><h2>${escapeHtml(c.name)}</h2>
      <div class="meta-line">${escapeHtml(c.id)} · Due ${formatDate(c.dueDate)} · <span class="badge ${complianceBadgeClass(eff)}">${escapeHtml(eff)}</span></div></div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-compliance" data-id="${c.id}">Edit</button>
        <button class="btn grey" data-action="goto" data-view="compliance">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(COMPLIANCE_FIELDS, c)}</div>
    ${attachmentsSectionHTML('compliance', c)}
  `;
}

/* ---------------------------------------------------------------------- */
/* TRUSTEE BODY — AGGREGATE DOCUMENTS + DASHBOARD                         */
/* ---------------------------------------------------------------------- */
function renderTrusteeDocuments(){
  const rows = [];
  db.trustees.forEach(t=>(t.attachments||[]).forEach(a=>rows.push({trustee:t, a})));
  const grid = rows.map(({trustee,a})=>`
    <div class="attachment-card">
      ${a.isImage?`<img class="attachment-thumb" src="${a.dataUrl}">`:`<div class="attachment-thumb attachment-thumb-file">📄</div>`}
      <div class="attachment-meta"><div class="attachment-name">${escapeHtml(a.name)}</div><div class="attachment-sub">${escapeHtml(trustee.name)} · ${formatDate(a.addedAt)}</div></div>
      <button class="btn sm secondary no-print" data-action="view-trustee" data-id="${trustee.id}">View Trustee</button>
    </div>`).join('') || '<div class="empty-note">No trustee documents uploaded yet. Add appointment letters, consent letters, ID proofs, PAN, Aadhaar, photographs, signatures and other documents from each trustee\'s profile page.</div>';
  return trusteeSubtabsHTML('trusteeDocuments') + `
    <div class="section-title">📁 Trustee Documents (Appointment Letter, Consent Letter, ID Proof, PAN, Aadhaar, Photograph, Signature &amp; Other)</div>
    <div class="attachments-grid">${grid}</div>
  `;
}
function officeBearerCount(){
  return db.trustees.filter(t=>OFFICE_BEARER_CATEGORIES.includes(t.category) && (t.status==='Active'||!t.status)).length;
}
function vacantPositionsCount(){
  const filled = new Set(db.trustees.filter(t=>t.status==='Active'||!t.status).map(t=>t.category));
  return OFFICE_BEARER_CATEGORIES.filter(c=>!filled.has(c)).length;
}
function upcomingTrusteeMeetingsCount(){
  const t = todayISO();
  return db.trusteeMeetings.filter(m=>m.date && m.date>=t).length;
}
function pendingResolutionsCount(){
  return db.resolutions.filter(r=>r.implementationStatus!=='Completed').length;
}
function trusteeExpiryAlertsHTML(){
  const upcoming = trusteesWithUpcomingExpiry();
  if(!upcoming.length) return '';
  const rows = upcoming.map(t=>{
    const d = termExpiryWindowDays(t);
    return `<div class="item-row row-orange"><div><div class="title">${escapeHtml(t.name)} — ${escapeHtml(t.category)||'Trustee'}</div>
      <div class="meta">Term expires ${formatDate(t.termExpiryDate)} (${d} day${d===1?'':'s'} remaining)</div></div>
      <button class="btn sm secondary" data-action="view-trustee" data-id="${t.id}">View</button></div>`;
  }).join('');
  return `<div class="section-title">⚠️ Term Expiry Alerts (within 90 days)</div><div class="item-list">${rows}</div>`;
}
function renderTrusteeDashboard(){
  const active = db.trustees.filter(t=>t.status==='Active'||!t.status).length;
  const pct = overallAttendancePercent();
  const cards = [
    {num:db.trustees.length, lbl:'Total Trustees', icon:'🏛'},
    {num:active, lbl:'Active Trustees', icon:'✅'},
    {num:officeBearerCount(), lbl:'Office Bearers', icon:'🎖️'},
    {num:upcomingTrusteeMeetingsCount(), lbl:'Upcoming Meetings', icon:'🗓️'},
    {num:pendingResolutionsCount(), lbl:'Pending Resolutions', icon:'⚖️'},
    {num:pct===null?'—':pct+'%', lbl:'Attendance %', icon:'📈'},
    {num:vacantPositionsCount(), lbl:'Vacant Positions', icon:'🪑'}
  ];
  const cardsHtml = cards.map(c=>`<div class="card"><div class="icon">${c.icon}</div><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('');
  return trusteeSubtabsHTML('trusteeDashboard') + `
    <div class="cards-grid">${cardsHtml}</div>
    <div class="quick-actions no-print">
      <button class="btn" data-action="goto" data-view="trusteeForm">➕ Add Trustee</button>
      <button class="btn secondary" data-action="goto" data-view="trusteeMeetingForm">➕ Record Attendance</button>
      <button class="btn secondary" data-action="goto" data-view="resolutionForm">➕ New Resolution</button>
      <button class="btn secondary" data-action="goto" data-view="trusteeBoard">🖼️ View Board</button>
      <button class="btn secondary" data-action="goto" data-view="founder">🌟 Founder Memorial</button>
    </div>
    ${trusteeExpiryAlertsHTML()}
  `;
}

/* ---------------------------------------------------------------------- */
/* NOTIFICATION CENTRE                                                    */
/* ---------------------------------------------------------------------- */
function priorityFromDays(d){
  if(d===null) return 'Low';
  if(d<0) return 'Urgent';
  if(d<=7) return 'Urgent';
  if(d<=30) return 'High';
  if(d<=60) return 'Medium';
  return 'Low';
}
function computeNotifications(){
  const list = [];
  const today = todayISO();

  // Trustee term expiry
  db.trustees.forEach(t=>{
    const d = termExpiryWindowDays(t);
    if(d!==null && d<=90){
      list.push({id:'term-'+t.id, title:`Trustee term expiring: ${t.name}`, module:'Trustee Body', date:t.termExpiryDate, priority:priorityFromDays(d), linkView:'trusteeProfile', linkId:t.id});
    }
  });

  // Upcoming trustee meetings (within 14 days, future)
  db.trusteeMeetings.forEach(m=>{
    const d = daysBetween(today, m.date);
    if(d!==null && d>=0 && d<=14){
      list.push({id:'tmeet-'+m.id, title:`Upcoming trustee meeting: ${m.name||'Meeting'}`, module:'Trustee Body', date:m.date, priority:priorityFromDays(d), linkView:'trusteeMeetings', linkId:null});
    }
  });

  // Pending resolutions + target completion dates
  db.resolutions.forEach(r=>{
    if(r.implementationStatus!=='Completed' && r.implementationStatus!=='Closed'){
      list.push({id:'respending-'+r.id, title:`Pending resolution: ${r.subject}`, module:'Resolution Register', date:r.date, priority:'Medium', linkView:'resolutionProfile', linkId:r.id});
    }
    if(r.targetCompletionDate){
      const d = daysBetween(today, r.targetCompletionDate);
      if(d!==null && d<=30 && r.implementationStatus!=='Completed' && r.implementationStatus!=='Closed'){
        list.push({id:'restarget-'+r.id, title:`Resolution target date approaching: ${r.subject}`, module:'Resolution Register', date:r.targetCompletionDate, priority:priorityFromDays(d), linkView:'resolutionProfile', linkId:r.id});
      }
    }
  });

  // Compliance due / overdue
  db.compliance.forEach(c=>{
    const eff = complianceEffectiveStatus(c);
    if(eff==='Completed'||eff==='Not Applicable') return;
    const d = daysBetween(today, c.dueDate);
    if(eff==='Overdue'){
      list.push({id:'compover-'+c.id, title:`Compliance overdue: ${c.name}`, module:'Compliance', date:c.dueDate, priority:'Urgent', linkView:'complianceProfile', linkId:c.id});
    }else if(d!==null && d<=30){
      list.push({id:'compdue-'+c.id, title:`Compliance due: ${c.name}`, module:'Compliance', date:c.dueDate, priority:priorityFromDays(d), linkView:'complianceProfile', linkId:c.id});
    }
  });

  // Upcoming Trust events (within 14 days)
  db.events.forEach(e=>{
    const d = daysBetween(today, e.date);
    if(d!==null && d>=0 && d<=14 && e.status!=='Completed' && e.status!=='Cancelled'){
      list.push({id:'event-'+e.id, title:`Upcoming Trust event: ${e.name}`, module:'Events', date:e.date, priority:priorityFromDays(d), linkView:'eventProfile', linkId:e.id});
    }
  });

  // Project completion dates
  db.projects.forEach(p=>{
    if(p.status==='Completed'||p.status==='Cancelled'||!p.date) return;
    const d = daysBetween(today, p.date);
    if(d!==null && d<=30){
      list.push({id:'project-'+p.id, title:`Project date approaching: ${p.name}`, module:'Projects', date:p.date, priority:priorityFromDays(d), linkView:'projectProfile', linkId:p.id});
    }
  });

  // Document expiry (12A / 80G / FCRA validity in Trust Profile)
  const tp = db.trustProfile;
  [['12A Registration', tp.reg12AValidity],['80G Registration', tp.reg80GValidity],['FCRA Registration', tp.fcraValidity]].forEach(([label, dateVal])=>{
    if(!dateVal) return;
    const d = daysBetween(today, dateVal);
    if(d!==null && d<=60){
      list.push({id:'docexp-'+label.replace(/\s/g,''), title:`Document expiring: ${label} validity`, module:'Trust Profile', date:dateVal, priority:priorityFromDays(d), linkView:'trustProfile', linkId:null});
    }
  });

  // Donation acknowledgement pending (no receipt number issued)
  db.donors.forEach(d=>{
    (d.donations||[]).forEach(don=>{
      if(!don.receiptNumber){
        list.push({id:'donack-'+don.id, title:`Donation acknowledgement pending: ${d.name} (${formatCurrency(don.amount)})`, module:'Donors', date:don.date, priority:'Low', linkView:'donorProfile', linkId:d.id});
      }
    });
  });

  const deleted = new Set(db.notificationState.deletedIds||[]);
  const read = new Set(db.notificationState.readIds||[]);
  return list.filter(n=>!deleted.has(n.id)).map(n=>Object.assign(n, {read:read.has(n.id)}))
    .sort((a,b)=>(a.date||'')<(b.date||'')?-1:1);
}
function unreadNotificationsCount(){ return computeNotifications().filter(n=>!n.read).length; }
function markNotificationRead(id){
  if(!db.notificationState.readIds.includes(id)) db.notificationState.readIds.push(id);
  saveDB(); render();
}
function markAllNotificationsRead(){
  const all = computeNotifications().map(n=>n.id);
  db.notificationState.readIds = Array.from(new Set([...db.notificationState.readIds, ...all]));
  saveDB(); render();
}
function deleteNotification(id){
  if(!db.notificationState.deletedIds.includes(id)) db.notificationState.deletedIds.push(id);
  saveDB(); render();
}
function openNotificationLink(view, id){
  markNotificationRead_silent();
  goto(view, id||null);
  function markNotificationRead_silent(){ /* navigation itself is enough; read state set separately via Mark as Read */ }
}
function updateNotificationBadge(){
  const badge = document.getElementById('notifBadge');
  if(!badge) return;
  const n = unreadNotificationsCount();
  if(n>0){ badge.textContent = n>99?'99+':n; badge.style.display='flex'; }
  else{ badge.style.display='none'; }
}
const NOTIFICATION_FILTERS = ['all','Unread','Urgent','High','Medium','Low'];
function renderNotifications(){
  let list = computeNotifications();
  const filter = state.notificationFilter||'all';
  if(filter==='Unread') list = list.filter(n=>!n.read);
  else if(filter!=='all') list = list.filter(n=>n.priority===filter);
  const filterBar = `<div class="subtabs no-print" style="margin-bottom:14px;">${NOTIFICATION_FILTERS.map(f=>`<button data-action="filter-notifications" data-filter="${f}" class="${filter===f?'active':''}">${f==='all'?'All':f}</button>`).join('')}</div>`;
  const rows = list.map(n=>`
    <div class="notification-card ${n.read?'':'unread'} priority-${n.priority}">
      <div style="flex:1;min-width:0;cursor:pointer;" data-action="open-notification" data-linkview="${n.linkView}" data-linkid="${n.linkId||''}">
        <div style="font-weight:700;">${escapeHtml(n.title)} ${!n.read?'<span class=\"badge badge-blue\" style=\"margin-left:6px;\">New</span>':''}</div>
        <div style="font-size:12.5px;color:var(--muted);">${escapeHtml(n.module)} · ${formatDate((n.date||'').slice(0,10))} · <span class="badge ${n.priority==='Urgent'?'badge-red':n.priority==='High'?'badge-orange':n.priority==='Medium'?'badge-blue':'badge-grey'}">${n.priority}</span></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${!n.read?`<button class="btn sm secondary" data-action="mark-notification-read" data-nid="${n.id}">Mark Read</button>`:''}
        <button class="btn sm danger" data-action="delete-notification" data-nid="${n.id}">Delete</button>
      </div>
    </div>`).join('') || '<div class="empty-note">No notifications right now. You will be notified about upcoming trustee term expiries, meetings, pending resolutions, compliance due dates, events, and more.</div>';
  return moreSubtabsHTML('notifications') + `
    <div class="toolbar no-print"><div class="spacer"></div><button class="btn secondary" data-action="mark-all-notifications-read">✅ Mark All as Read</button></div>
    ${filterBar}
    ${rows}
  `;
}

/* ---------------------------------------------------------------------- */
/* MAIN RENDER DISPATCH                                                   */
/* ---------------------------------------------------------------------- */
function renderHeader(){
  document.getElementById('headerTrustName').textContent = db.settings.trustName || 'Dr. Nurul Islam Memorial Charitable Trust';
  const f = document.getElementById('trustFooter');
  if(f) f.textContent = (db.settings.trustName||'Trust Manager') + ' · Data stored privately on this device';
}
function render(){
  renderNav();
  const app = document.getElementById('app');
  const id = state.editingId;
  switch(state.view){
    case 'dashboard': app.innerHTML = renderDashboard(); break;
    case 'beneficiaries': app.innerHTML = renderBeneficiaries(); break;
    case 'beneficiaryForm': renderBeneficiaryForm(id); break;
    case 'beneficiaryProfile': app.innerHTML = renderBeneficiaryProfile(id); break;
    case 'donors': app.innerHTML = renderDonors(); break;
    case 'donorForm': renderDonorForm(id); break;
    case 'donorProfile': app.innerHTML = renderDonorProfile(id); break;
    case 'projects': app.innerHTML = renderProjects(); break;
    case 'projectForm': renderProjectForm(id); break;
    case 'projectProfile': app.innerHTML = renderProjectProfile(id); break;
    case 'volunteers': app.innerHTML = renderVolunteers(); break;
    case 'volunteerForm': renderVolunteerForm(id); break;
    case 'volunteerProfile': app.innerHTML = renderVolunteerProfile(id); break;
    case 'financial': app.innerHTML = renderFinancial(); break;
    case 'documents': app.innerHTML = renderDocuments(); break;
    case 'documentForm': renderDocumentForm(); break;
    case 'events': app.innerHTML = renderEvents(); break;
    case 'eventForm': renderEventForm(id); break;
    case 'eventProfile': app.innerHTML = renderEventProfile(id); break;
    case 'meetings': app.innerHTML = renderMeetings(); break;
    case 'meetingForm': renderMeetingForm(id); break;
    case 'meetingProfile': app.innerHTML = renderMeetingProfile(id); break;
    case 'reports': app.innerHTML = renderReports(); drawReportCharts(); break;
    case 'settings': app.innerHTML = renderSettings(); attachSettingsHandlers(); break;
    case 'trusteeDashboard': app.innerHTML = renderTrusteeDashboard(); break;
    case 'trustees': app.innerHTML = renderTrustees(); break;
    case 'trusteeForm': renderTrusteeForm(id); break;
    case 'trusteeProfile': app.innerHTML = renderTrusteeProfile(id); break;
    case 'trusteeBoard': app.innerHTML = renderTrusteeBoard(); break;
    case 'founder': app.innerHTML = renderFounderPage(); break;
    case 'trusteeMeetings': app.innerHTML = renderTrusteeMeetings(); break;
    case 'trusteeMeetingForm': renderTrusteeMeetingForm(id); break;
    case 'resolutions': app.innerHTML = renderResolutions(); break;
    case 'resolutionForm': renderResolutionForm(id); break;
    case 'resolutionProfile': app.innerHTML = renderResolutionProfile(id); break;
    case 'trusteeDocuments': app.innerHTML = renderTrusteeDocuments(); break;
    case 'trustProfile': app.innerHTML = renderTrustProfile(); break;
    case 'trustProfileForm': renderTrustProfileForm(); break;
    case 'compliance': app.innerHTML = renderCompliance(); break;
    case 'complianceForm': renderComplianceForm(id); break;
    case 'complianceProfile': app.innerHTML = renderComplianceProfile(id); break;
    case 'notifications': app.innerHTML = renderNotifications(); break;
    default: app.innerHTML = renderDashboard();
  }
  attachMoreSubtabHandlers();
  attachTrusteeSubtabHandlers();
  attachTrusteeFilterHandlers();
  attachResolutionFilterHandlers();
  wireSearchBox();
  wireDelegatedActions();
  wireMaskToggles();
  updateNotificationBadge();
}
function wireSearchBox(){
  const box = document.getElementById('searchBox');
  if(box) box.addEventListener('input', ()=>{ state.search = box.value; render(); box.focus(); box.setSelectionRange(box.value.length, box.value.length); });
}
function wireDelegatedActions(){
  document.querySelectorAll('[data-action]').forEach(el=>{
    if(el._trustWired) return;
    el._trustWired = true;
    el.addEventListener('click', (e)=>{
      const action = el.getAttribute('data-action');
      const id = el.getAttribute('data-id');
      switch(action){
        case 'goto': goto(el.getAttribute('data-view'), id); break;
        case 'view-beneficiary': goto('beneficiaryProfile', id); break;
        case 'edit-beneficiary': goto('beneficiaryForm', id); break;
        case 'delete-beneficiary':
          if(confirm('Delete this beneficiary record? This cannot be undone.')){ db.beneficiaries = db.beneficiaries.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'add-assistance': openAssistanceModal(id); break;
        case 'delete-assistance':{
          const bid = el.getAttribute('data-bid'), hid = el.getAttribute('data-hid');
          if(confirm('Delete this assistance record?')){
            const b = db.beneficiaries.find(x=>x.id===bid);
            b.assistanceHistory = b.assistanceHistory.filter(h=>h.id!==hid);
            saveDB(); goto('beneficiaryProfile', bid);
          }
          break;
        }
        case 'view-donor': goto('donorProfile', id); break;
        case 'edit-donor': goto('donorForm', id); break;
        case 'delete-donor':
          if(confirm('Delete this donor and all their donation history?')){ db.donors = db.donors.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'add-donation': openDonationModal(id); break;
        case 'delete-donation':{
          const did = el.getAttribute('data-did'), donid = el.getAttribute('data-donid');
          if(confirm('Delete this donation record?')){
            const d = db.donors.find(x=>x.id===did);
            d.donations = d.donations.filter(x=>x.id!==donid);
            saveDB(); goto('donorProfile', did);
          }
          break;
        }
        case 'print-receipt': printReceipt(el.getAttribute('data-did'), el.getAttribute('data-donid')); break;
        case 'view-project': goto('projectProfile', id); break;
        case 'edit-project': goto('projectForm', id); break;
        case 'delete-project':
          if(confirm('Delete this project?')){ db.projects = db.projects.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'view-volunteer': goto('volunteerProfile', id); break;
        case 'edit-volunteer': goto('volunteerForm', id); break;
        case 'delete-volunteer':
          if(confirm('Delete this volunteer?')){ db.volunteers = db.volunteers.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'add-attendance': openAttendanceModal(id); break;
        case 'delete-attendance':{
          const vid = el.getAttribute('data-vid'), aid = el.getAttribute('data-aid');
          if(confirm('Delete this attendance record?')){
            const v = db.volunteers.find(x=>x.id===vid);
            v.attendance = v.attendance.filter(a=>a.id!==aid);
            saveDB(); goto('volunteerProfile', vid);
          }
          break;
        }
        case 'add-transaction': openTransactionModal(); break;
        case 'view-event': goto('eventProfile', id); break;
        case 'edit-event': goto('eventForm', id); break;
        case 'delete-event':
          if(confirm('Delete this event?')){ db.events = db.events.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'view-meeting': goto('meetingProfile', id); break;
        case 'edit-meeting': goto('meetingForm', id); break;
        case 'delete-meeting':
          if(confirm('Delete this meeting?')){ db.meetings = db.meetings.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'delete-document':
          if(confirm('Delete this document?')){ db.documents = db.documents.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'add-attachment': openAttachmentPicker(el.getAttribute('data-kind'), id); break;
        case 'delete-attachment': deleteAttachment(el.getAttribute('data-kind'), id, el.getAttribute('data-attid')); break;
        case 'print-view': window.print(); break;

        case 'view-trustee': goto('trusteeProfile', id); break;
        case 'edit-trustee': goto('trusteeForm', id); break;
        case 'delete-trustee':
          if(confirm('Delete this trustee record? This cannot be undone.')){ db.trustees = db.trustees.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'export-trustees':
          downloadFile('trustee-directory-'+todayISO()+'.json', JSON.stringify(db.trustees, null, 2));
          break;
        case 'edit-trustee-meeting': goto('trusteeMeetingForm', id); break;
        case 'delete-trustee-meeting':
          if(confirm('Delete this meeting attendance record?')){ db.trusteeMeetings = db.trusteeMeetings.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'view-resolution': goto('resolutionProfile', id); break;
        case 'edit-resolution': goto('resolutionForm', id); break;
        case 'delete-resolution':
          if(confirm('Delete this resolution?')){ db.resolutions = db.resolutions.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'print-resolution': printResolutionDocument(id); break;

        case 'export-trust-profile':
          downloadFile('trust-profile-'+todayISO()+'.json', JSON.stringify(db.trustProfile, null, 2));
          break;
        case 'add-founder-timeline': openFounderTimelineModal(); break;
        case 'delete-founder-timeline':
          if(confirm('Delete this timeline event?')){ db.founderTimeline = db.founderTimeline.filter(x=>x.id!==el.getAttribute('data-tid')); saveDB(); goto('founder'); }
          break;
        case 'add-founder-gallery': openFounderGalleryPicker(); break;
        case 'delete-founder-gallery':
          if(confirm('Delete this photo?')){ db.founderGallery = db.founderGallery.filter(x=>x.id!==el.getAttribute('data-gid')); saveDB(); goto('founder'); }
          break;
        case 'add-founder-doc': openFounderDocumentPicker(); break;
        case 'delete-founder-doc':
          if(confirm('Delete this document?')){ db.founderMemorialDocs = db.founderMemorialDocs.filter(x=>x.id!==el.getAttribute('data-did')); saveDB(); goto('founder'); }
          break;

        case 'view-compliance': goto('complianceProfile', id); break;
        case 'edit-compliance': goto('complianceForm', id); break;
        case 'delete-compliance':
          if(confirm('Delete this compliance item?')){ db.compliance = db.compliance.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'mark-notification-read': markNotificationRead(el.getAttribute('data-nid')); break;
        case 'mark-all-notifications-read': markAllNotificationsRead(); break;
        case 'delete-notification': deleteNotification(el.getAttribute('data-nid')); break;
        case 'open-notification': openNotificationLink(el.getAttribute('data-linkview'), el.getAttribute('data-linkid')); break;
        case 'filter-notifications': state.notificationFilter = el.getAttribute('data-filter'); render(); break;
      }
    });
  });
}

/* ---------------------------------------------------------------------- */
/* PWA INSTALL BANNER + SERVICE WORKER                                    */
/* ---------------------------------------------------------------------- */
let deferredInstallPrompt = null;
function renderInstallBanner(){
  const root = document.getElementById('pwaBannerRoot');
  if(!root) return;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredInstallPrompt = e;
    root.innerHTML = `<div class="pwa-install-banner"><span>Install Trust Manager for offline use.</span>
      <button id="installBtn">Install</button><button class="dismiss" id="dismissBtn">✕</button></div>`;
    document.getElementById('installBtn').onclick = async ()=>{
      root.innerHTML='';
      if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; }
    };
    document.getElementById('dismissBtn').onclick = ()=>{ root.innerHTML=''; };
  });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent||'');
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if(isIOS && !isStandalone){
    root.innerHTML = `<div class="pwa-install-banner"><span>Tap Share, then "Add to Home Screen" to install.</span>
      <button class="dismiss" id="dismissBtn2">✕</button></div>`;
    const d = document.getElementById('dismissBtn2');
    if(d) d.onclick = ()=>{ root.innerHTML=''; };
  }
}
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('../service-worker.js').then(reg=>{
      if(typeof window.attachSWUpdateWatcher==='function') window.attachSWUpdateWatcher(reg);
    }).catch(()=>{});
  }
}

/* ---------------------------------------------------------------------- */
/* INIT                                                                   */
/* ---------------------------------------------------------------------- */
function init(){
  loadDB();
  renderHeader();
  render();
  const bell = document.getElementById('notifBellBtn');
  if(bell) bell.addEventListener('click', ()=>goto('notifications'));
  try{ renderInstallBanner(); }catch(e){ console.warn('install banner failed', e); }
  try{ registerServiceWorker(); }catch(e){ console.warn('service worker registration failed', e); }
}
document.addEventListener('DOMContentLoaded', init);
