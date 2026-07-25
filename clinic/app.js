'use strict';

/* =========================================================================
   Private Clinic Manager - Version 2.0 (Premium)
   Part of JM Digital Office. Completely isolated from the WBCYN Registrar
   module: separate localStorage namespace (jm_clinic_db_v1), separate files,
   no shared data, no server upload of any kind - everything stays on this
   device.

   This version upgrades Version 1.0 in place. All data saved under
   Version 1.0 is automatically migrated (never deleted) the first time it
   loads here - see migratePatient() / ensureShape() below.
   ========================================================================= */

const STORAGE_KEY = 'jm_clinic_db_v1';

const SEX_OPTIONS = ['Male','Female','Other'];
const PAYMENT_OPTIONS = ['Paid','Unpaid','Partial'];
const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'];
const ATTACHMENT_CATEGORIES = ['Clinical Photograph','Laboratory Report','PDF File','Investigation Report','Image','Other'];

/* -------------------------------------------------------------------------
   FUTURE AI SUPPORT (placeholder only - NOT implemented in this version)
   These hooks and the "AI Assist" buttons scattered through the forms below
   are inert placeholders. Wiring a real assistant later means only filling
   in these functions and swapping handleAiStub() for a real call - the
   patient/visit data structure below does not need to change at all, since
   AI output would simply be typed text a user could otherwise have entered
   into the very same fields (Narrative History, Repertorisation Notes,
   Assessment, Advice, etc.)
   ------------------------------------------------------------------------- */
const AI_HOOKS = {
  draftNarrativeHistory: null,     // (patient, chiefComplaints) => Promise<string>
  draftRepertorisation: null,      // (patient, symptoms) => Promise<string>
  draftPrescriptionSuggestion: null, // (patient, visit) => Promise<string>
  generateClinicalSummary: null    // (patient) => Promise<string>
};
function handleAiStub(){
  alert('AI assistance is planned for a future update.\n\nThis button is a placeholder only: nothing is generated automatically and no data is sent anywhere.');
}

/* ================= FIELD CONFIG ================= */
const REG_FIELDS = [
  {key:'regDate', label:'Registration Date', type:'date', required:true},
  {key:'name', label:'Patient Name', type:'text', required:true},
  {key:'dob', label:'Date of Birth', type:'date'},
  {key:'age', label:'Age (if DOB unknown)', type:'number'},
  {key:'sex', label:'Sex', type:'select', options:SEX_OPTIONS, required:true},
  {key:'mobile', label:'Mobile Number', type:'text', required:true},
  {key:'altMobile', label:'Alternate Mobile Number', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'address', label:'Address', type:'textarea'},
  {key:'occupation', label:'Occupation', type:'text'},
  {key:'bloodGroup', label:'Blood Group', type:'select', options:BLOOD_GROUPS},
  {key:'referredBy', label:'Referred By', type:'text'},
  {key:'emergencyContact', label:'Emergency Contact', type:'text'}
];

const INITIAL_FIELDS = [
  {key:'chiefComplaints', label:'Chief Complaints', type:'textarea', required:true},
  {key:'history', label:'Narrative Clinical History', type:'textarea', ai:true},
  {key:'historyPresentIllness', label:'History of Present Illness', type:'textarea'},
  {key:'associatedComplaints', label:'Associated Complaints', type:'textarea'},
  {key:'pastHistory', label:'Past History', type:'textarea'},
  {key:'familyHistory', label:'Family History', type:'textarea'},
  {key:'personalHistory', label:'Personal History', type:'textarea'},
  {key:'mentalSymptoms', label:'Mental Generals', type:'textarea'},
  {key:'generalSymptoms', label:'Physical Generals', type:'textarea'},
  {key:'particularSymptoms', label:'Particular Symptoms', type:'textarea'},
  {key:'physicalExamination', label:'Clinical Examination', type:'textarea'},
  {key:'vitalSigns', label:'Vital Signs', type:'text'},
  {key:'investigationFindings', label:'Investigations', type:'textarea'},
  {key:'provisionalDiagnosis', label:'Provisional Diagnosis', type:'text'},
  {key:'finalDiagnosis', label:'Final Diagnosis', type:'text'},
  {key:'totality', label:'Totality of Symptoms', type:'textarea', ai:true},
  {key:'repertorisationNotes', label:'Repertorisation Notes', type:'textarea', ai:true},
  {key:'medicine', label:'Homoeopathic Medicine', type:'text'},
  {key:'potency', label:'Potency', type:'text'},
  {key:'dose', label:'Dose', type:'text'},
  {key:'repetition', label:'Repetition', type:'text'},
  {key:'bachFlower', label:'Bach Flower Medicine', type:'text'},
  {key:'dietAdvice', label:'Diet Advice', type:'textarea'},
  {key:'lifestyleAdvice', label:'Lifestyle Advice', type:'textarea'},
  {key:'nextFollowUpDate', label:'Next Follow-up Date', type:'date'},
  {key:'fee', label:'Consultation Fee (₹)', type:'number', required:true},
  {key:'paymentStatus', label:'Payment Status', type:'select', options:PAYMENT_OPTIONS, required:true},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

const FOLLOWUP_FIELDS = [
  {key:'date', label:'Follow-up Date', type:'date', required:true},
  {key:'changesSinceLastVisit', label:'Changes Since Previous Visit', type:'textarea'},
  {key:'symptomsImproved', label:'Symptoms Improved', type:'textarea'},
  {key:'symptomsWorsened', label:'Symptoms Worse', type:'textarea'},
  {key:'symptomsUnchanged', label:'Symptoms Unchanged', type:'textarea'},
  {key:'newSymptoms', label:'New Symptoms', type:'textarea'},
  {key:'generalCondition', label:'General Condition', type:'textarea'},
  {key:'clinicalExamination', label:'Clinical Examination', type:'textarea'},
  {key:'investigationUpdates', label:'Investigations', type:'textarea'},
  {key:'clinicalAssessment', label:'Assessment', type:'textarea', ai:true},
  {key:'medicine', label:'Medicine', type:'text'},
  {key:'potency', label:'Potency', type:'text'},
  {key:'dose', label:'Dose', type:'text'},
  {key:'repetition', label:'Repetition', type:'text'},
  {key:'bachFlower', label:'Bach Flower Medicine', type:'text'},
  {key:'advice', label:'Advice', type:'textarea', ai:true},
  {key:'fee', label:'Fee (₹)', type:'number', required:true},
  {key:'paymentStatus', label:'Payment Status', type:'select', options:PAYMENT_OPTIONS, required:true},
  {key:'nextFollowUpDate', label:'Next Follow-up', type:'date'},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

/* ================= STATE ================= */
let DB = null;
let state = { view:'dashboard', currentPatientId:null, search:'', filters:{}, apptTab:'today', followupTab:'overdue' };

/* ================= UTIL ================= */
function uid(){ return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function daysUntil(dateStr){ if(!dateStr) return null; const d=new Date(dateStr+'T00:00:00'); const t=new Date(); t.setHours(0,0,0,0); return Math.round((d-t)/86400000); }
function fmtDate(dateStr){ if(!dateStr) return '—'; try{ const d=new Date(dateStr.length>10?dateStr:dateStr+'T00:00:00'); return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }catch(e){return dateStr;} }
function fmtTime(t){ if(!t) return ''; const parts=t.split(':'); if(parts.length<2) return t; let h=parseInt(parts[0],10); const m=parts[1]; const ap = h>=12?'PM':'AM'; h = h%12; if(h===0) h=12; return `${h}:${m} ${ap}`; }
function fmtCurrency(n){ const v = Number(n)||0; return '₹' + v.toLocaleString('en-IN'); }
function esc(s){ return (s===undefined||s===null)?'':String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function calcAgeFromDob(dob){ if(!dob) return null; const d=new Date(dob+'T00:00:00'); const t=new Date(); let age=t.getFullYear()-d.getFullYear(); const m=t.getMonth()-d.getMonth(); if(m<0||(m===0&&t.getDate()<d.getDate())) age--; return age; }
function displayAge(p){ const a = p.dob ? calcAgeFromDob(p.dob) : (p.age!==undefined && p.age!=='' && p.age!==null ? Number(p.age) : null); return (a===null||isNaN(a)) ? '—' : a; }

function saveDB(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
function loadDB(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){ try{ return JSON.parse(raw); }catch(e){ /* fall through */ } }
  return null;
}
function freshDB(){
  return {
    patients:[], appointments:[], nextPatientSeq:1,
    settings:{
      doctorName:'Dr. M. Jahangir',
      qualification:'BHMS',
      registrationNumber:'',
      phone:'',
      clinicName:'Private Homoeopathic Clinic',
      clinicAddress:'',
      logo:'',
      prescriptionFooter:'',
      newPatientFee:1000,
      followUpFee:300
    },
    seeded:false
  };
}
function migratePatient(p){
  if(!Array.isArray(p.followUps)) p.followUps=[];
  if(!p.initial) p.initial={};
  if(p.email===undefined) p.email='';
  if(p.bloodGroup===undefined) p.bloodGroup='';
  if(p.photograph===undefined) p.photograph='';
  if(!Array.isArray(p.attachments)) p.attachments=[];

  const ini = p.initial;
  if(ini.historyPresentIllness===undefined) ini.historyPresentIllness = ini.durationProgression || '';
  if(ini.associatedComplaints===undefined) ini.associatedComplaints = '';
  if(ini.particularSymptoms===undefined) ini.particularSymptoms = '';
  if(ini.dose===undefined) ini.dose = ini.doseRepetition || '';
  if(ini.repetition===undefined) ini.repetition = '';
  if(ini.dietAdvice===undefined) ini.dietAdvice = '';
  if(ini.lifestyleAdvice===undefined) ini.lifestyleAdvice = ini.generalAdvice || '';

  (p.followUps||[]).forEach(f=>{
    if(f.clinicalExamination===undefined) f.clinicalExamination='';
    if(f.medicine===undefined) f.medicine = f.prescription || '';
    if(f.dose===undefined) f.dose = f.doseRepetition || '';
    if(f.repetition===undefined) f.repetition = '';
  });
}
function ensureShape(db){
  const f = freshDB();
  Object.keys(f).forEach(k=>{ if(!(k in db)) db[k]=f[k]; });
  if(!db.settings) db.settings = f.settings;
  Object.keys(f.settings).forEach(k=>{ if(!(k in db.settings)) db.settings[k]=f.settings[k]; });
  if(!Array.isArray(db.patients)) db.patients=[];
  if(!Array.isArray(db.appointments)) db.appointments=[];
  if(!db.nextPatientSeq) db.nextPatientSeq=1;
  db.patients.forEach(migratePatient);
  return db;
}
function generatePatientId(){
  const n = DB.nextPatientSeq || 1;
  DB.nextPatientSeq = n + 1;
  return 'CLN-' + String(n).padStart(4,'0');
}

/* ================= SAMPLE DATA ================= */
function seedSampleData(){
  const p1id = uid();
  DB.patients.push({
    id:p1id, _sample:true, patientId: generatePatientId(),
    regDate: addDays(-20), name:'Sample Patient - Anita Roy', dob:'', age:'34', sex:'Female',
    mobile:'9830000001', altMobile:'', email:'anita.sample@example.com', address:'Salt Lake, Kolkata',
    occupation:'Teacher', bloodGroup:'B+', referredBy:'Self', emergencyContact:'9830000099',
    photograph:'', attachments:[],
    initial:{
      chiefComplaints:'Recurrent headache for 2 months', history:'Sample demo record for illustration only.',
      historyPresentIllness:'Gradual onset, worse in the evening, mild nausea associated',
      associatedComplaints:'Mild nausea', pastHistory:'No major illness', familyHistory:'Mother has migraine',
      personalHistory:'Vegetarian, moderate stress', mentalSymptoms:'Irritable when in pain, better for consolation',
      generalSymptoms:'Better in open air, thirstless', particularSymptoms:'Throbbing pain, right sided',
      physicalExamination:'No abnormal findings', vitalSigns:'BP 118/76, Pulse 78/min',
      investigationFindings:'', provisionalDiagnosis:'Tension headache', finalDiagnosis:'',
      totality:'Sample totality notes', repertorisationNotes:'Sample repertorisation notes',
      medicine:'Belladonna', potency:'30C', dose:'2 pills', repetition:'Twice daily for 5 days', bachFlower:'',
      dietAdvice:'Avoid caffeine', lifestyleAdvice:'Adequate rest and hydration', nextFollowUpDate: addDays(6),
      fee: DB.settings.newPatientFee, paymentStatus:'Paid', remarks:'Sample demo entry - safe to delete.'
    },
    followUps:[
      { id:uid(), date: addDays(-6), changesSinceLastVisit:'Headache frequency reduced', symptomsImproved:'Headache intensity',
        symptomsUnchanged:'Occasional nausea', symptomsWorsened:'', newSymptoms:'', generalCondition:'Improved',
        clinicalExamination:'No new findings', investigationUpdates:'', clinicalAssessment:'Responding well to treatment',
        medicine:'Belladonna', potency:'30C', dose:'2 pills', repetition:'Once daily for 5 days', bachFlower:'',
        advice:'Continue same routine', fee: DB.settings.followUpFee, paymentStatus:'Paid', nextFollowUpDate: addDays(1),
        remarks:'Sample demo entry.' }
    ]
  });

  const p2id = uid();
  DB.patients.push({
    id:p2id, _sample:true, patientId: generatePatientId(),
    regDate: addDays(-2), name:'Sample Patient - Rakesh Sen', dob:'', age:'45', sex:'Male',
    mobile:'9830000002', altMobile:'9830000003', email:'', address:'Behala, Kolkata',
    occupation:'Shop owner', bloodGroup:'O+', referredBy:'Dr. Ghosh', emergencyContact:'9830000098',
    photograph:'', attachments:[],
    initial:{
      chiefComplaints:'Acidity and indigestion since 3 weeks', history:'Sample demo record for illustration only.',
      historyPresentIllness:'Worse after meals, bloating', associatedComplaints:'Bloating',
      pastHistory:'Hypertension, on regular medication', familyHistory:'Father had diabetes',
      personalHistory:'Non-vegetarian, irregular meal timing', mentalSymptoms:'Anxious about business',
      generalSymptoms:'Thirstless', particularSymptoms:'Burning sensation in stomach',
      physicalExamination:'Mild abdominal tenderness', vitalSigns:'BP 138/88, Pulse 82/min',
      investigationFindings:'', provisionalDiagnosis:'Functional dyspepsia', finalDiagnosis:'',
      totality:'Sample totality notes', repertorisationNotes:'Sample repertorisation notes',
      medicine:'Nux Vomica', potency:'200C', dose:'Single dose', repetition:'Repeat SOS', bachFlower:'Rescue Remedy',
      dietAdvice:'Avoid spicy food', lifestyleAdvice:'Regular meal timing', nextFollowUpDate: addDays(-1),
      fee: DB.settings.newPatientFee, paymentStatus:'Paid', remarks:'Sample demo entry - safe to delete.'
    },
    followUps:[]
  });

  const p3id = uid();
  DB.patients.push({
    id:p3id, _sample:true, patientId: generatePatientId(),
    regDate: addDays(0), name:'Sample Patient - Priya Das', dob:'', age:'8', sex:'Female',
    mobile:'9830000004', altMobile:'', email:'', address:'Dum Dum, Kolkata',
    occupation:'Student', bloodGroup:'A+', referredBy:'Family friend', emergencyContact:'9830000097',
    photograph:'', attachments:[],
    initial:{
      chiefComplaints:'Recurrent cold and cough', history:'Sample demo record for illustration only.',
      historyPresentIllness:'Recurs every few weeks', associatedComplaints:'Low appetite',
      pastHistory:'Frequent upper respiratory infections', familyHistory:'No significant family history',
      personalHistory:'School going child', mentalSymptoms:'Clingy when unwell', generalSymptoms:'Chilly patient',
      particularSymptoms:'Nasal congestion worse at night', physicalExamination:'Mild throat congestion',
      vitalSigns:'Temp 99.1 F', investigationFindings:'', provisionalDiagnosis:'Recurrent URI', finalDiagnosis:'',
      totality:'Sample totality notes', repertorisationNotes:'Sample repertorisation notes',
      medicine:'Calcarea Carbonica', potency:'200C', dose:'2 pills', repetition:'Weekly dose', bachFlower:'',
      dietAdvice:'Warm fluids', lifestyleAdvice:'Avoid cold exposure', nextFollowUpDate: addDays(14),
      fee: DB.settings.newPatientFee, paymentStatus:'Unpaid', remarks:'Sample demo entry - safe to delete.'
    },
    followUps:[]
  });

  DB.appointments.push(
    { id:uid(), _sample:true, patientRefId:p1id, patientName:'Sample Patient - Anita Roy', mobile:'9830000001', date: todayISO(), time:'11:00', type:'Follow-up', status:'Scheduled', notes:'Sample demo appointment.' },
    { id:uid(), _sample:true, patientRefId:'', patientName:'Sample Walk-in - Debashis Roy', mobile:'9830000010', date: addDays(1), time:'16:30', type:'New', status:'Scheduled', notes:'Sample demo appointment (walk-in, not yet registered).' }
  );

  DB.seeded = true;
}

/* ================= CLINICAL / DERIVED HELPERS ================= */
function allVisits(patient){
  const visits = [];
  if(patient.initial) visits.push(Object.assign({}, patient.initial, {date: patient.regDate, kind:'initial'}));
  (patient.followUps||[]).forEach(f=> visits.push(Object.assign({}, f, {kind:'followup'})));
  visits.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  return visits;
}
function lastVisit(patient){ const v = allVisits(patient); return v.length ? v[v.length-1] : null; }
function nextFollowUpDateFor(patient){ const lv = lastVisit(patient); return lv ? lv.nextFollowUpDate : null; }
function followUpStatus(patient){
  const d = nextFollowUpDateFor(patient);
  if(!d) return {status:'none', label:'No Follow-up Scheduled', cls:'badge-grey', rowCls:''};
  const days = daysUntil(d);
  if(days===null) return {status:'none', label:'No Follow-up Scheduled', cls:'badge-grey', rowCls:''};
  if(days<0) return {status:'overdue', label:'Overdue', cls:'badge-red', rowCls:'row-red'};
  if(days===0) return {status:'today', label:'Due Today', cls:'badge-orange', rowCls:'row-orange'};
  if(days<=7) return {status:'soon', label:'Due Soon', cls:'badge-yellow', rowCls:'row-yellow'};
  return {status:'upcoming', label:'Upcoming', cls:'badge-blue', rowCls:'row-blue'};
}
function diagnosisOf(patient){ return (patient.initial && (patient.initial.finalDiagnosis || patient.initial.provisionalDiagnosis)) || ''; }
function outstandingBalance(patient){
  return allVisits(patient).reduce((sum,v)=> sum + (v.paymentStatus && v.paymentStatus!=='Paid' ? (Number(v.fee)||0) : 0), 0);
}
function nextVisitSummary(patient){
  const lv = lastVisit(patient);
  const nfu = nextFollowUpDateFor(patient);
  const outstanding = outstandingBalance(patient);
  if(!lv) return {lastVisitDate:null, lastPrescription:'—', lastAssessment:'—', investigations:'—', nextFollowUp:nfu, outstanding};
  const med = [lv.medicine, lv.potency, lv.dose, lv.repetition].filter(Boolean).join(' · ') || '—';
  const assessment = lv.kind==='initial' ? (lv.finalDiagnosis || lv.provisionalDiagnosis || '—') : (lv.clinicalAssessment || '—');
  const inv = lv.kind==='initial' ? (lv.investigationFindings || '—') : (lv.investigationUpdates || '—');
  return {lastVisitDate: lv.date, lastPrescription: med, lastAssessment: assessment, investigations: inv, nextFollowUp: nfu, outstanding};
}

/* ================= DASHBOARD COUNTS ================= */
function counts(){
  const today = todayISO();
  const tomorrow = addDays(1);
  const monthPrefix = today.slice(0,7);
  let patientsToday=0, newToday=0, followupToday=0, feesToday=0, feesMonth=0;
  DB.patients.forEach(p=>{
    let visitToday=false;
    if(p.regDate===today){ newToday++; visitToday=true; }
    if(p.regDate===today && p.initial && p.initial.paymentStatus==='Paid') feesToday += Number(p.initial.fee)||0;
    if(p.regDate && p.regDate.slice(0,7)===monthPrefix && p.initial && p.initial.paymentStatus==='Paid') feesMonth += Number(p.initial.fee)||0;
    (p.followUps||[]).forEach(f=>{
      if(f.date===today){ followupToday++; visitToday=true; if(f.paymentStatus==='Paid') feesToday += Number(f.fee)||0; }
      if(f.date && f.date.slice(0,7)===monthPrefix && f.paymentStatus==='Paid') feesMonth += Number(f.fee)||0;
    });
    if(visitToday) patientsToday++;
  });
  const appointmentsToday = DB.appointments.filter(a=>a.date===today).length;
  const appointmentsTomorrow = DB.appointments.filter(a=>a.date===tomorrow).length;
  const followUpsDue = DB.patients.filter(p=>{ const st=followUpStatus(p).status; return st==='overdue'||st==='today'; }).length;
  return { patientsToday, newToday, followupToday, appointmentsToday, appointmentsTomorrow, followUpsDue, totalPatients: DB.patients.length, feesToday, feesMonth };
}
function recentlyVisited(limit){
  return DB.patients.map(p=>({p, last:lastVisit(p)})).filter(x=>x.last)
    .sort((a,b)=> (b.last.date||'').localeCompare(a.last.date||''))
    .slice(0, limit||6).map(x=>x.p);
}
function recentPayments(limit){
  const rows = [];
  DB.patients.forEach(p=>{
    allVisits(p).forEach(v=>{ if(v.paymentStatus==='Paid'){ rows.push({name:p.name, patientId:p.patientId, date:v.date, fee:v.fee, kind:v.kind}); } });
  });
  return rows.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0, limit||8);
}
function monthKeys(months){
  const now = new Date(); const keys=[];
  for(let i=months-1;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); keys.push(d.toISOString().slice(0,7)); }
  return keys;
}
function monthLabel(k){ const [y,m]=k.split('-'); const d=new Date(Number(y), Number(m)-1, 1); return d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}); }
function monthlyTrend(months){
  const keys = monthKeys(months); const result={}; keys.forEach(k=>result[k]=0);
  DB.patients.forEach(p=>{
    if(p.regDate && result[p.regDate.slice(0,7)]!==undefined) result[p.regDate.slice(0,7)]++;
    (p.followUps||[]).forEach(f=>{ if(f.date && result[f.date.slice(0,7)]!==undefined) result[f.date.slice(0,7)]++; });
  });
  return { keys, labels: keys.map(monthLabel), values: keys.map(k=>result[k]) };
}

/* ================= INIT ================= */
function init(){
  const rawExisting = loadDB();
  DB = rawExisting || freshDB();
  DB = ensureShape(DB);
  if(!DB.seeded && DB.patients.length===0){ seedSampleData(); }
  // Persist immediately: this writes back any Version 1.0 -> 2.0 field
  // migration (or first-run seed) right away, so the upgrade is never lost
  // even if the user closes the app before making any other change.
  saveDB();
  renderNav();
  renderHeader();
  render();
}
function renderHeader(){
  const nameEl = document.getElementById('headerDoctorName');
  if(nameEl) nameEl.textContent = DB.settings.doctorName || 'Doctor';
}

/* ================= NAV ================= */
const NAV_ITEMS = [
  {id:'dashboard', label:'Dashboard', icon:'📊'},
  {id:'patients', label:'Patients', icon:'🗂️'},
  {id:'appointments', label:'Appts', icon:'📅'},
  {id:'followups', label:'Follow-ups', icon:'⏰'},
  {id:'reports', label:'Reports', icon:'📈'},
  {id:'settings', label:'Settings', icon:'⚙️'}
];
function renderNav(){
  const html = NAV_ITEMS.map(it=>`<button data-nav="${it.id}" class="${state.view===it.id?'active':''}"><span class="ic">${it.icon}</span><span>${it.label}</span></button>`).join('');
  document.getElementById('topnav').innerHTML = html;
  document.getElementById('bottomnav').innerHTML = html;
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{
    state.view=b.dataset.nav; state.currentPatientId=null; state.search=''; state.filters={};
    renderNav(); render();
  }));
  const fab = document.getElementById('fabNewPatient');
  if(fab) fab.onclick = ()=>{ state.view='newPatient'; state.currentPatientId=null; renderNav(); render(); };
}

/* ================= RENDER DISPATCH ================= */
function render(){
  const app = document.getElementById('app');
  document.body.classList.remove('print-single-rx');
  if(state.view==='dashboard') app.innerHTML = renderDashboard();
  else if(state.view==='patients') app.innerHTML = renderPatients();
  else if(state.view==='newPatient') app.innerHTML = renderPatientForm(null);
  else if(state.view==='editPatient') app.innerHTML = renderPatientForm(state.currentPatientId);
  else if(state.view==='patientProfile') app.innerHTML = renderPatientProfile(state.currentPatientId);
  else if(state.view==='appointments') app.innerHTML = renderAppointments();
  else if(state.view==='followups') app.innerHTML = renderFollowupsView();
  else if(state.view==='reports') app.innerHTML = renderReports();
  else if(state.view==='settings') app.innerHTML = renderSettings();

  if(state.view==='dashboard') drawDashboardChart();
  if(state.view==='patients') attachPatientsHandlers();
  if(state.view==='newPatient' || state.view==='editPatient') attachPatientFormHandlers();
  if(state.view==='patientProfile') attachPatientProfileHandlers();
  if(state.view==='appointments') attachAppointmentsHandlers();
  if(state.view==='followups') attachFollowupsHandlers();
  if(state.view==='reports') drawReportCharts();
  if(state.view==='settings') attachSettingsHandlers();
  attachAiButtons();
}
function attachAiButtons(){
  document.querySelectorAll('.ai-btn').forEach(b=>b.addEventListener('click', e=>{ e.preventDefault(); handleAiStub(); }));
}

/* ================= FIELD HELPERS ================= */
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
function fieldsToHTML(fields, values){
  return fields.map(f=>{
    const full = f.type==='textarea' ? 'full' : '';
    const aiBtn = f.ai ? `<button type="button" class="ai-btn" data-ai-field="${esc(f.key)}" title="AI assistance - coming soon">✨ AI</button>` : '';
    return `<div class="form-field ${full}"><label>${esc(f.label)}${f.required?' *':''} ${aiBtn}</label>${fieldInputHTML(f, values[f.key]!==undefined?values[f.key]:'')}</div>`;
  }).join('');
}
function detailRows(fields, values){
  return fields.map(f=>{
    let val = values[f.key];
    if(f.type==='date') val = fmtDate(val);
    if(f.key==='fee') val = (val!==undefined && val!=='') ? fmtCurrency(val) : '';
    const full = f.type==='textarea' ? 'full' : '';
    return `<div class="${full}"><div class="dl">${esc(f.label)}</div><div class="dv">${esc(val)||'—'}</div></div>`;
  }).join('');
}

/* ================= IMAGE HELPERS (photo / logo resize) ================= */
function readFileAsDataURL(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function resizeImageDataURL(dataUrl, maxDim){
  return new Promise((resolve)=>{
    let settled = false;
    const finish = (val)=>{ if(!settled){ settled=true; resolve(val); } };
    // Safety net: if the image never fires load/error for any reason (some
    // browsers/environments do not support in-memory image decoding), fall
    // back to the original, unresized file rather than hanging forever.
    setTimeout(()=>finish(dataUrl), 3000);
    try{
      const img = new Image();
      img.onload = ()=>{
        try{
          let w = img.width, h = img.height;
          if(!w || !h){ finish(dataUrl); return; }
          if(w>maxDim || h>maxDim){
            if(w>h){ h = Math.round(h*maxDim/w); w = maxDim; } else { w = Math.round(w*maxDim/h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if(!ctx){ finish(dataUrl); return; }
          ctx.drawImage(img, 0, 0, w, h);
          finish(canvas.toDataURL('image/jpeg', 0.82));
        }catch(e){ finish(dataUrl); }
      };
      img.onerror = ()=>finish(dataUrl);
      img.src = dataUrl;
    }catch(e){ finish(dataUrl); }
  });
}

/* ================= DASHBOARD ================= */
function renderDashboard(){
  const c = counts();
  const cards = [
    {lbl:'Patients Today', num:c.patientsToday, icon:'🧑‍⚕️'},
    {lbl:'New Patients Today', num:c.newToday, icon:'🆕'},
    {lbl:'Follow-ups Today', num:c.followupToday, icon:'🔁'},
    {lbl:'Pending Follow-ups', num:c.followUpsDue, icon:'⏰'},
    {lbl:"Today's Collection", num:fmtCurrency(c.feesToday), icon:'💰'},
    {lbl:'Monthly Collection', num:fmtCurrency(c.feesMonth), icon:'📈'},
    {lbl:'Total Registered Patients', num:c.totalPatients, icon:'🗂️'},
    {lbl:"Tomorrow's Appointments", num:c.appointmentsTomorrow, icon:'📅'}
  ];
  const cardsHtml = cards.map(cd=>`<div class="card"><span class="icon">${cd.icon}</span><span class="num">${cd.num}</span><span class="lbl">${cd.lbl}</span></div>`).join('');

  const today = todayISO();
  const todaysAppts = DB.appointments.filter(a=>a.date===today).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const apptRows = todaysAppts.map(a=>`<div class="item-row"><div><div class="title">${esc(a.patientName)}</div><div class="meta">${fmtTime(a.time)} &middot; ${esc(a.type)}</div></div><span class="badge ${apptBadgeCls(a.status)}">${esc(a.status)}</span></div>`).join('') || '<div class="empty-note">No appointments scheduled for today.</div>';

  const overdue = DB.patients.filter(p=>followUpStatus(p).status==='overdue')
    .sort((a,b)=>(nextFollowUpDateFor(a)||'').localeCompare(nextFollowUpDateFor(b)||''));
  const overdueRows = overdue.map(p=>{
    const d = nextFollowUpDateFor(p);
    return `<div class="item-row row-red"><div><div class="title">${esc(p.name)} <span style="color:var(--muted);font-weight:400;">(${esc(p.patientId)})</span></div><div class="meta">Was due ${fmtDate(d)}</div></div><span class="badge badge-red">Overdue</span></div>`;
  }).join('') || '<div class="empty-note">No overdue follow-ups.</div>';

  const recent = recentlyVisited(6);
  const recentRows = recent.map(p=>{
    const lv = lastVisit(p);
    return `<div class="item-row"><div><div class="title">${esc(p.name)} <span style="color:var(--muted);font-weight:400;">(${esc(p.patientId)})</span></div><div class="meta">Last visit ${fmtDate(lv.date)} &middot; ${lv.kind==='initial'?'Initial Consultation':'Follow-up'}</div></div><button class="btn sm secondary" data-goto-patient="${p.id}">View</button></div>`;
  }).join('') || '<div class="empty-note">No visits recorded yet.</div>';

  const payments = recentPayments(8);
  const paymentRows = payments.map(pay=>`<div class="item-row row-green"><div><div class="title">${esc(pay.name)} <span style="color:var(--muted);font-weight:400;">(${esc(pay.patientId)})</span></div><div class="meta">${fmtDate(pay.date)} &middot; ${pay.kind==='initial'?'Initial Consultation':'Follow-up'}</div></div><span class="badge badge-green">${fmtCurrency(pay.fee)}</span></div>`).join('') || '<div class="empty-note">No payments recorded yet.</div>';

  return `
    <div class="section-title">📊 Clinic Overview</div>
    <div class="cards-grid">${cardsHtml}</div>

    <div class="section-title">📅 Today's Appointments</div>
    <div class="item-list">${apptRows}</div>

    <div class="section-title">🔴 Overdue Follow-ups</div>
    <div class="item-list">${overdueRows}</div>

    <div class="section-title">🕓 Recent Patients</div>
    <div class="item-list">${recentRows}</div>

    <div class="section-title">📈 Monthly Patient Trend</div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Visits per Month (last 6 months)</h3><canvas id="chartDashTrend"></canvas></div>
    </div>

    <div class="section-title">💰 Recent Payments</div>
    <div class="item-list">${paymentRows}</div>
  `;
}
function apptBadgeCls(status){
  if(status==='Attended') return 'badge-green';
  if(status==='Cancelled') return 'badge-grey';
  if(status==='Missed') return 'badge-red';
  return 'badge-blue';
}
let dashChart = null;
function drawDashboardChart(){
  const canvas = document.getElementById('chartDashTrend');
  if(!canvas) return;
  if(typeof Chart==='undefined'){
    const note = document.createElement('div'); note.className='empty-note';
    note.textContent='Chart unavailable offline (no internet connection to load chart library).';
    canvas.replaceWith(note); return;
  }
  if(dashChart) dashChart.destroy();
  const t = monthlyTrend(6);
  dashChart = new Chart(canvas, {type:'bar', data:{labels:t.labels, datasets:[{label:'Visits', data:t.values, backgroundColor:'#1565c0'}]}, options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, ticks:{precision:0}}}}});
}

/* ================= PATIENTS LIST ================= */
function matchesPatientFilters(p){
  const s = (state.filters.search||'').toLowerCase();
  if(s){
    const hay = [p.patientId, p.name, p.mobile, p.altMobile, p.email].join(' ').toLowerCase();
    if(!hay.includes(s)) return false;
  }
  if(state.filters.regFrom && p.regDate < state.filters.regFrom) return false;
  if(state.filters.regTo && p.regDate > state.filters.regTo) return false;
  if(state.filters.diagnosis){
    const dq = state.filters.diagnosis.toLowerCase();
    if(!diagnosisOf(p).toLowerCase().includes(dq)) return false;
  }
  if(state.filters.medicine){
    const mq = state.filters.medicine.toLowerCase();
    const meds = allVisits(p).map(v=>v.medicine||'').join(' ').toLowerCase();
    if(!meds.includes(mq)) return false;
  }
  if(state.filters.fuStatus && state.filters.fuStatus!=='All'){
    if(followUpStatus(p).status !== state.filters.fuStatus) return false;
  }
  return true;
}
function renderPatients(){
  const list = DB.patients.filter(matchesPatientFilters).sort((a,b)=>(b.regDate||'').localeCompare(a.regDate||''));

  const rows = list.map(p=>{
    const fu = followUpStatus(p);
    return `<tr class="${fu.rowCls}">
      <td>${esc(p.patientId)}</td>
      <td>${esc(p.name)}</td>
      <td>${displayAge(p)} / ${esc(p.sex)}</td>
      <td>${esc(p.mobile)}</td>
      <td>${fmtDate(p.regDate)}</td>
      <td class="wrap">${esc(diagnosisOf(p))||'—'}</td>
      <td><span class="badge ${fu.cls}">${fu.label}</span></td>
      <td class="actions-cell no-print">
        <button class="btn sm secondary" data-goto-patient="${p.id}">View</button>
        <button class="btn sm grey" data-edit-patient="${p.id}">Edit</button>
        <button class="btn sm danger" data-del-patient="${p.id}">Delete</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty-note">No patients found.</div></td></tr>`;

  const cards = list.map(p=>{
    const fu = followUpStatus(p);
    const photo = p.photograph ? `<img src="${p.photograph}" class="patient-card-photo">` : `<div class="patient-card-photo patient-card-photo-placeholder">${esc((p.name||'?').charAt(0).toUpperCase())}</div>`;
    return `<div class="patient-card ${fu.rowCls}">
      ${photo}
      <div class="patient-card-body">
        <div class="patient-card-name">${esc(p.name)}</div>
        <div class="patient-card-meta">${esc(p.patientId)} &middot; ${displayAge(p)} / ${esc(p.sex)}</div>
        <div class="patient-card-meta">${esc(p.mobile)} &middot; Reg. ${fmtDate(p.regDate)}</div>
        <div class="patient-card-meta wrap">${esc(diagnosisOf(p))||'—'}</div>
        <div style="margin-top:6px;"><span class="badge ${fu.cls}">${fu.label}</span></div>
        <div class="patient-card-actions no-print">
          <button class="btn sm secondary" data-goto-patient="${p.id}">View</button>
          <button class="btn sm grey" data-edit-patient="${p.id}">Edit</button>
          <button class="btn sm danger" data-del-patient="${p.id}">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-note">No patients found.</div>';

  return `
    <div class="section-title no-print">🗂️ Patients</div>
    <div class="toolbar no-print">
      <button class="btn" id="btnNewPatientList">＋ New Patient</button>
      <input type="text" id="patSearch" placeholder="Search by ID, name, mobile or email..." value="${esc(state.filters.search||'')}">
      <input type="date" id="patRegFrom" title="Registered from" value="${esc(state.filters.regFrom||'')}">
      <input type="date" id="patRegTo" title="Registered to" value="${esc(state.filters.regTo||'')}">
      <input type="text" id="patDiagnosis" placeholder="Filter by diagnosis..." value="${esc(state.filters.diagnosis||'')}">
      <input type="text" id="patMedicine" placeholder="Filter by medicine..." value="${esc(state.filters.medicine||'')}">
      <select id="patFuStatus">
        <option value="All">All Follow-up Status</option>
        <option value="overdue" ${state.filters.fuStatus==='overdue'?'selected':''}>Overdue</option>
        <option value="today" ${state.filters.fuStatus==='today'?'selected':''}>Due Today</option>
        <option value="soon" ${state.filters.fuStatus==='soon'?'selected':''}>Due Soon</option>
        <option value="upcoming" ${state.filters.fuStatus==='upcoming'?'selected':''}>Upcoming</option>
        <option value="none" ${state.filters.fuStatus==='none'?'selected':''}>None Scheduled</option>
      </select>
      <span class="spacer"></span>
      <button class="btn secondary" id="btnExportPatientsCSV">Export CSV</button>
    </div>
    <div class="patients-table-wrap"><div class="table-wrap"><table><thead><tr><th>Patient ID</th><th>Name</th><th>Age/Sex</th><th>Mobile</th><th>Reg. Date</th><th>Diagnosis</th><th>Follow-up</th><th class="no-print">Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="patients-cards-wrap">${cards}</div>
  `;
}
function attachPatientsHandlers(){
  document.getElementById('btnNewPatientList').addEventListener('click', ()=>{ state.view='newPatient'; state.currentPatientId=null; renderNav(); render(); });
  document.getElementById('patSearch').addEventListener('input', e=>{ state.filters.search=e.target.value; render(); });
  document.getElementById('patRegFrom').addEventListener('change', e=>{ state.filters.regFrom=e.target.value; render(); });
  document.getElementById('patRegTo').addEventListener('change', e=>{ state.filters.regTo=e.target.value; render(); });
  document.getElementById('patDiagnosis').addEventListener('input', e=>{ state.filters.diagnosis=e.target.value; render(); });
  document.getElementById('patMedicine').addEventListener('input', e=>{ state.filters.medicine=e.target.value; render(); });
  document.getElementById('patFuStatus').addEventListener('change', e=>{ state.filters.fuStatus=e.target.value; render(); });
  document.getElementById('btnExportPatientsCSV').addEventListener('click', exportPatientsCSV);
  document.querySelectorAll('[data-goto-patient]').forEach(b=>b.addEventListener('click', ()=>{ state.view='patientProfile'; state.currentPatientId=b.dataset.gotoPatient; renderNav(); render(); }));
  document.querySelectorAll('[data-edit-patient]').forEach(b=>b.addEventListener('click', ()=>{ state.view='editPatient'; state.currentPatientId=b.dataset.editPatient; renderNav(); render(); }));
  document.querySelectorAll('[data-del-patient]').forEach(b=>b.addEventListener('click', ()=>deletePatient(b.dataset.delPatient)));
}
function exportPatientsCSV(){
  const headers = ['Patient ID','Name','Age','Sex','Mobile','Alt. Mobile','Email','Address','Occupation','Blood Group','Referred By','Registration Date','Diagnosis','Next Follow-up'];
  const lines = [headers.map(csvEscape).join(',')];
  DB.patients.forEach(p=>{
    lines.push([p.patientId, p.name, displayAge(p), p.sex, p.mobile, p.altMobile, p.email, p.address, p.occupation, p.bloodGroup, p.referredBy, p.regDate, diagnosisOf(p), nextFollowUpDateFor(p)||''].map(csvEscape).join(','));
  });
  downloadBlob(lines.join('\n'), 'text/csv', `Clinic_Patients_${todayISO()}.csv`);
}
function csvEscape(v){ const s=(v===undefined||v===null)?'':String(v); if(/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"'; return s; }
function downloadBlob(content, type, filename){
  const blob = new Blob([content], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
function deletePatient(id){
  const p = DB.patients.find(x=>x.id===id);
  if(!p) return;
  const typed = prompt(`This will permanently delete "${p.name}" (${p.patientId}) and their entire clinical history, including all follow-ups, photographs and attachments. This cannot be undone.\n\nType DELETE to confirm.`);
  if(typed!=='DELETE') return;
  DB.patients = DB.patients.filter(x=>x.id!==id);
  saveDB();
  if(state.currentPatientId===id){ state.view='patients'; state.currentPatientId=null; }
  render();
}

/* ================= NEW / EDIT PATIENT FORM ================= */
function renderPatientForm(id){
  const existing = id ? DB.patients.find(p=>p.id===id) : null;
  const regValues = existing ? existing : {regDate: todayISO()};
  const initValues = existing ? existing.initial : {fee: DB.settings.newPatientFee, paymentStatus:''};
  const title = existing ? `Edit Patient — ${esc(existing.name)} (${esc(existing.patientId)})` : 'Register New Patient';
  const idNote = existing
    ? `<p style="color:var(--muted);font-size:13px;">Patient ID: <strong>${esc(existing.patientId)}</strong> (not editable)</p>`
    : `<p style="color:var(--muted);font-size:13px;">A Patient ID will be generated automatically when you save (e.g. CLN-0007).</p>`;
  const existingPhoto = existing ? existing.photograph : '';

  return `
    <div class="form-page">
      <div class="section-title">${existing?'✏️':'＋'} ${title}</div>
      ${idNote}
      <form id="patientForm">
        <div class="form-section">
          <h3>Patient Registration</h3>
          <div class="form-grid">
            ${fieldsToHTML(REG_FIELDS, regValues)}
            <div class="form-field full">
              <label>Photograph</label>
              <input type="file" accept="image/*" id="photoInput">
              <input type="hidden" name="photograph" id="photoHiddenInput" value="${esc(existingPhoto)}">
              <div id="photoPreviewWrap" style="margin-top:8px;">${existingPhoto?`<img src="${existingPhoto}" class="patient-photo-preview" id="photoPreviewImg">`:''}</div>
            </div>
          </div>
        </div>
        <div class="form-section">
          <h3>Initial Clinical Record</h3>
          <div class="form-grid">${fieldsToHTML(INITIAL_FIELDS, initValues)}</div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn grey" id="btnCancelPatientForm">Cancel</button>
          <button type="submit" class="btn lg">${existing?'Save Changes':'Save New Patient'}</button>
        </div>
      </form>
    </div>
  `;
}
function attachPatientFormHandlers(){
  document.getElementById('btnCancelPatientForm').addEventListener('click', ()=>{
    if(state.currentPatientId){ state.view='patientProfile'; } else { state.view='patients'; }
    renderNav(); render();
  });
  const photoInput = document.getElementById('photoInput');
  if(photoInput){
    photoInput.addEventListener('change', async e=>{
      const file = e.target.files[0];
      if(!file) return;
      try{
        const rawUrl = await readFileAsDataURL(file);
        const resized = await resizeImageDataURL(rawUrl, 500);
        document.getElementById('photoHiddenInput').value = resized;
        document.getElementById('photoPreviewWrap').innerHTML = `<img src="${resized}" class="patient-photo-preview" id="photoPreviewImg">`;
      }catch(err){ console.warn('Photo processing failed:', err); }
    });
  }
  document.getElementById('patientForm').addEventListener('submit', e=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const isEdit = !!state.currentPatientId && state.view==='editPatient';
    let patient = isEdit ? DB.patients.find(p=>p.id===state.currentPatientId) : null;

    const regData = {};
    REG_FIELDS.forEach(f=>{ regData[f.key] = fd.get(f.key) || ''; });
    regData.photograph = fd.get('photograph') || '';
    const initData = {};
    INITIAL_FIELDS.forEach(f=>{ initData[f.key] = fd.get(f.key) || ''; });

    if(isEdit && patient){
      Object.assign(patient, regData);
      patient.initial = Object.assign({}, patient.initial, initData);
      if(patient._sample) patient._sample = true;
    } else {
      patient = Object.assign({id: uid(), patientId: generatePatientId(), followUps:[], attachments:[]}, regData);
      patient.initial = initData;
      DB.patients.push(patient);
    }
    saveDB();
    state.view='patientProfile';
    state.currentPatientId = patient.id;
    renderNav();
    render();
  });
}

/* ================= PATIENT PROFILE ================= */
function renderPatientProfile(id){
  const p = DB.patients.find(x=>x.id===id);
  if(!p) return `<div class="empty-note">Patient not found. <button class="btn secondary" onclick="history.back()">Go Back</button></div>`;
  const fu = followUpStatus(p);
  const followUpsSorted = (p.followUps||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const summary = nextVisitSummary(p);

  const followUpCards = followUpsSorted.map(f=>`
    <div class="visit-card">
      <div class="visit-head">
        <span class="visit-title">Follow-up — ${fmtDate(f.date)}</span>
        <div class="visit-actions no-print">
          <button class="btn sm secondary" data-print-rx="${f.id}">Print Prescription</button>
          <button class="btn sm secondary" data-pdf-rx="${f.id}">Save as PDF</button>
          <button class="btn sm grey" data-edit-fu="${f.id}">Edit</button>
          <button class="btn sm danger" data-del-fu="${f.id}">Delete</button>
        </div>
      </div>
      <div class="detail-grid">${detailRows(FOLLOWUP_FIELDS, f)}</div>
    </div>
  `).join('') || '<div class="empty-note">No follow-up visits recorded yet.</div>';

  const visits = allVisits(p);
  const rxRows = visits.filter(v=>v.medicine).map(v=>`
    <tr><td>${fmtDate(v.date)}</td><td>${v.kind==='initial'?'Initial':'Follow-up'}</td><td>${esc(v.medicine)}</td><td>${esc(v.potency)||'—'}</td><td>${esc(v.dose)||'—'}</td><td>${esc(v.repetition)||'—'}</td><td>${esc(v.bachFlower)||'—'}</td></tr>
  `).join('') || `<tr><td colspan="7"><div class="empty-note">No prescriptions recorded yet.</div></td></tr>`;

  let totalCollected = 0;
  const feeRows = visits.map(v=>{
    if(v.paymentStatus==='Paid') totalCollected += Number(v.fee)||0;
    return `<tr><td>${fmtDate(v.date)}</td><td>${v.kind==='initial'?'Initial':'Follow-up'}</td><td>${fmtCurrency(v.fee)}</td><td><span class="badge ${v.paymentStatus==='Paid'?'badge-green':(v.paymentStatus==='Partial'?'badge-yellow':'badge-red')}">${esc(v.paymentStatus)||'—'}</span></td></tr>`;
  }).join('') || `<tr><td colspan="4"><div class="empty-note">No visits recorded yet.</div></td></tr>`;

  const attachments = p.attachments || [];
  const attachmentCards = attachments.map(a=>{
    const isImg = (a.type||'').startsWith('image/');
    const thumb = isImg ? `<img src="${a.dataUrl}" class="attachment-thumb">` : `<div class="attachment-thumb attachment-thumb-file">📄</div>`;
    return `<div class="attachment-card">
      <a href="${a.dataUrl}" target="_blank" rel="noopener">${thumb}</a>
      <div class="attachment-meta">
        <div class="attachment-name">${esc(a.name)}</div>
        <div class="attachment-sub"><span class="badge badge-blue">${esc(a.category)}</span> ${fmtDate(a.date)}</div>
        ${a.remarks?`<div class="attachment-sub">${esc(a.remarks)}</div>`:''}
      </div>
      <button class="btn sm danger no-print" data-del-attachment="${a.id}">Delete</button>
    </div>`;
  }).join('') || '<div class="empty-note">No attachments uploaded yet.</div>';

  const photoBlock = p.photograph ? `<img src="${p.photograph}" class="profile-photo">` : `<div class="profile-photo profile-photo-placeholder">${esc((p.name||'?').charAt(0).toUpperCase())}</div>`;

  return `
    <div class="print-only" id="printLetterhead">
      <strong>${esc(DB.settings.clinicName)}</strong><br>
      ${esc(DB.settings.doctorName)}${DB.settings.qualification?(' ('+esc(DB.settings.qualification)+')'):''}${DB.settings.clinicAddress?(' &middot; '+esc(DB.settings.clinicAddress)):''}<br>
      Printed on ${fmtDate(todayISO())}
    </div>
    <div id="profileContent">
      <div class="profile-header">
        ${photoBlock}
        <div style="flex:1;min-width:200px;">
          <h2>${esc(p.name)} <span class="badge badge-blue">${esc(p.patientId)}</span></h2>
          <div class="meta-line">${displayAge(p)} yrs &middot; ${esc(p.sex)} &middot; ${esc(p.mobile)} &middot; Registered ${fmtDate(p.regDate)}</div>
          <div style="margin-top:8px;"><span class="badge ${fu.cls}">${fu.label}</span></div>
        </div>
        <div class="profile-actions no-print">
          <button class="btn secondary" id="btnBackToPatients">&larr; Back to Patients</button>
          <button class="btn secondary" id="btnEditPatientProfile">Edit Patient</button>
          <button class="btn secondary" id="btnPrintSummary">Print Summary</button>
          <button class="btn danger" id="btnDeletePatientProfile">Delete Patient</button>
        </div>
      </div>

      <div class="next-visit-box">
        <div class="section-title" style="margin-top:0;">🧭 Next Visit Summary</div>
        <div class="detail-grid">
          <div><div class="dl">Last Visit</div><div class="dv">${summary.lastVisitDate?fmtDate(summary.lastVisitDate):'—'}</div></div>
          <div><div class="dl">Next Follow-up</div><div class="dv">${summary.nextFollowUp?fmtDate(summary.nextFollowUp):'Not scheduled'}</div></div>
          <div><div class="dl">Last Prescription</div><div class="dv">${esc(summary.lastPrescription)}</div></div>
          <div><div class="dl">Outstanding Payment</div><div class="dv">${fmtCurrency(summary.outstanding)}</div></div>
          <div class="full"><div class="dl">Last Clinical Assessment</div><div class="dv">${esc(summary.lastAssessment)}</div></div>
          <div class="full"><div class="dl">Investigations Noted at Last Visit</div><div class="dv">${esc(summary.investigations)}</div></div>
        </div>
      </div>

      <div class="section-title">👤 Registration Details</div>
      <div class="detail-grid" style="background:var(--grey);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:18px;">${detailRows(REG_FIELDS.filter(f=>f.key!=='regDate'), p)}</div>

      <div class="section-title">📋 Initial Clinical Record — ${fmtDate(p.regDate)}</div>
      <div class="visit-card initial">
        <div class="visit-head">
          <span class="visit-title">Initial Consultation</span>
          <div class="visit-actions no-print">
            <button class="btn sm secondary" data-print-rx="initial">Print Prescription</button>
            <button class="btn sm secondary" data-pdf-rx="initial">Save as PDF</button>
          </div>
        </div>
        <div class="detail-grid">${detailRows(INITIAL_FIELDS, p.initial)}</div>
      </div>

      <div class="section-title no-print">🔁 Follow-up Visits (Timeline)</div>
      <div class="toolbar no-print"><button class="btn" id="btnAddFollowUp">＋ Add Follow-up</button></div>
      ${followUpCards}

      <div class="section-title">💊 Prescription History</div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Visit</th><th>Medicine</th><th>Potency</th><th>Dose</th><th>Repetition</th><th>Bach Flower</th></tr></thead><tbody>${rxRows}</tbody></table></div>

      <div class="section-title">💰 Fees Summary</div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Visit</th><th>Fee</th><th>Status</th></tr></thead><tbody>${feeRows}</tbody></table></div>
      <p style="font-weight:700;color:var(--dark-blue);">Total Collected: ${fmtCurrency(totalCollected)} &nbsp;|&nbsp; Outstanding: ${fmtCurrency(outstandingBalance(p))}</p>

      <div class="section-title no-print">📎 Attachments (Photos, Reports, PDFs)</div>
      <div class="toolbar no-print"><button class="btn" id="btnAddAttachment">＋ Add Attachment</button></div>
      <div class="attachments-grid">${attachmentCards}</div>
    </div>
    <div class="rx-print-area" id="printArea"></div>
  `;
}
function attachPatientProfileHandlers(){
  const p = DB.patients.find(x=>x.id===state.currentPatientId);
  if(!p) return;
  document.getElementById('btnBackToPatients').addEventListener('click', ()=>{ state.view='patients'; renderNav(); render(); });
  document.getElementById('btnEditPatientProfile').addEventListener('click', ()=>{ state.view='editPatient'; renderNav(); render(); });
  document.getElementById('btnDeletePatientProfile').addEventListener('click', ()=>deletePatient(p.id));
  document.getElementById('btnPrintSummary').addEventListener('click', ()=>window.print());
  document.getElementById('btnAddFollowUp').addEventListener('click', ()=>openFollowUpForm(p.id, null));
  document.querySelectorAll('[data-edit-fu]').forEach(b=>b.addEventListener('click', ()=>openFollowUpForm(p.id, b.dataset.editFu)));
  document.querySelectorAll('[data-del-fu]').forEach(b=>b.addEventListener('click', ()=>deleteFollowUp(p.id, b.dataset.delFu)));
  document.querySelectorAll('[data-print-rx]').forEach(b=>b.addEventListener('click', ()=>printPrescription(p.id, b.dataset.printRx)));
  document.querySelectorAll('[data-pdf-rx]').forEach(b=>b.addEventListener('click', ()=>printPrescription(p.id, b.dataset.pdfRx)));
  const addAttBtn = document.getElementById('btnAddAttachment');
  if(addAttBtn) addAttBtn.addEventListener('click', ()=>openAttachmentForm(p.id));
  document.querySelectorAll('[data-del-attachment]').forEach(b=>b.addEventListener('click', ()=>deleteAttachment(p.id, b.dataset.delAttachment)));
}
function deleteFollowUp(patientId, fuId){
  if(!confirm('Delete this follow-up record? This cannot be undone.')) return;
  const p = DB.patients.find(x=>x.id===patientId);
  if(!p) return;
  p.followUps = (p.followUps||[]).filter(f=>f.id!==fuId);
  saveDB();
  render();
}

/* ================= FOLLOW-UP MODAL ================= */
function openFollowUpForm(patientId, fuId){
  const p = DB.patients.find(x=>x.id===patientId);
  if(!p) return;
  const existing = fuId ? (p.followUps||[]).find(f=>f.id===fuId) : null;
  const values = existing || {date: todayISO(), fee: DB.settings.followUpFee, paymentStatus:''};
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h2>${existing?'Edit':'Add'} Follow-up — ${esc(p.name)}</h2>
        <form id="followUpForm">
          <div class="form-grid">${fieldsToHTML(FOLLOWUP_FIELDS, values)}</div>
          <div class="modal-actions">
            <button type="button" class="btn grey" id="btnCancelFu">Cancel</button>
            <button type="submit" class="btn">Save Follow-up</button>
          </div>
        </form>
      </div>
    </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  attachAiButtons();
  document.getElementById('btnCancelFu').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay') closeModal(); });
  document.getElementById('followUpForm').addEventListener('submit', ev=>{
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const data = existing ? Object.assign({}, existing) : {id: uid()};
    FOLLOWUP_FIELDS.forEach(f=>{ data[f.key] = fd.get(f.key) || ''; });
    if(!p.followUps) p.followUps=[];
    const idx = p.followUps.findIndex(f=>f.id===data.id);
    if(idx>=0) p.followUps[idx]=data; else p.followUps.push(data);
    saveDB();
    closeModal();
    render();
  });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }

/* ================= ATTACHMENTS ================= */
function openAttachmentForm(patientId){
  const p = DB.patients.find(x=>x.id===patientId);
  if(!p) return;
  const catOptions = ATTACHMENT_CATEGORIES.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h2>Add Attachment — ${esc(p.name)}</h2>
        <form id="attachmentForm">
          <div class="form-grid">
            <div class="form-field"><label>Category</label><select name="category">${catOptions}</select></div>
            <div class="form-field"><label>Date</label><input type="date" name="date" value="${todayISO()}"></div>
            <div class="form-field full"><label>File (image or PDF) *</label><input type="file" id="attFileInput" accept="image/*,application/pdf" required></div>
            <div class="form-field full"><label>Remarks</label><textarea name="remarks"></textarea></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn grey" id="btnCancelAtt">Cancel</button>
            <button type="submit" class="btn">Save Attachment</button>
          </div>
        </form>
      </div>
    </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  document.getElementById('btnCancelAtt').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay') closeModal(); });
  document.getElementById('attachmentForm').addEventListener('submit', async ev=>{
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const fileInput = document.getElementById('attFileInput');
    const file = fileInput.files[0];
    if(!file){ alert('Please choose a file.'); return; }
    if(file.size > 4*1024*1024){
      if(!confirm('This file is larger than 4 MB. Large files can fill up browser storage quickly. Continue anyway?')) return;
    }
    try{
      const dataUrl = await readFileAsDataURL(file);
      if(!p.attachments) p.attachments=[];
      p.attachments.push({
        id: uid(), name: file.name, type: file.type, dataUrl,
        category: fd.get('category')||'Other', date: fd.get('date')||todayISO(), remarks: fd.get('remarks')||''
      });
      saveDB();
      closeModal();
      render();
    }catch(err){
      alert('Could not read this file.');
    }
  });
}
function deleteAttachment(patientId, attId){
  if(!confirm('Delete this attachment? This cannot be undone.')) return;
  const p = DB.patients.find(x=>x.id===patientId);
  if(!p) return;
  p.attachments = (p.attachments||[]).filter(a=>a.id!==attId);
  saveDB();
  render();
}

/* ================= PRINT PRESCRIPTION ================= */
function printPrescription(patientId, visitRef){
  const p = DB.patients.find(x=>x.id===patientId);
  if(!p) return;
  let visit, visitDate, adviceText;
  if(visitRef==='initial'){
    visit = p.initial; visitDate = p.regDate;
    adviceText = [visit.dietAdvice, visit.lifestyleAdvice].filter(Boolean).join(' &middot; ');
  } else {
    visit = (p.followUps||[]).find(f=>f.id===visitRef); visitDate = visit ? visit.date : '';
    adviceText = visit ? visit.advice : '';
  }
  if(!visit) return;

  const s = DB.settings;
  const logoImg = s.logo ? `<img src="${s.logo}" style="max-height:60px;margin-bottom:8px;">` : '';
  const doseText = [visit.dose, visit.repetition].filter(Boolean).join(' — ');
  const html = `
    <div class="rx-slip">
      <div class="rx-clinic-head">
        ${logoImg}
        <h2>${esc(s.clinicName)}</h2>
        <div>${esc(s.doctorName)}${s.qualification?(' — '+esc(s.qualification)):''}</div>
        ${s.registrationNumber?`<div style="font-size:12px;color:var(--muted);">Reg. No: ${esc(s.registrationNumber)}</div>`:''}
        ${s.clinicAddress?`<div style="font-size:12.5px;color:var(--muted);">${esc(s.clinicAddress)}</div>`:''}
        ${s.phone?`<div style="font-size:12.5px;color:var(--muted);">Phone: ${esc(s.phone)}</div>`:''}
      </div>
      <div class="rx-row"><span>Patient: <strong>${esc(p.name)}</strong> (${esc(p.patientId)})</span><span>Date: ${fmtDate(visitDate)}</span></div>
      <div class="rx-row"><span>Age/Sex: ${displayAge(p)} / ${esc(p.sex)}</span><span>Mobile: ${esc(p.mobile)}</span></div>
      <div class="rx-body">
        <p><strong>Rx</strong></p>
        <p>${esc(visit.medicine)||'—'}${visit.potency?(' &middot; '+esc(visit.potency)):''}</p>
        <p>${esc(doseText)}</p>
        ${visit.bachFlower?`<p>Bach Flower: ${esc(visit.bachFlower)}</p>`:''}
        <p>${esc(adviceText)}</p>
        ${visit.nextFollowUpDate?`<p>Next Follow-up: ${fmtDate(visit.nextFollowUpDate)}</p>`:''}
      </div>
      <div class="rx-sign">${esc(s.doctorName)}<br>Signature</div>
      ${s.prescriptionFooter?`<div style="text-align:center;font-size:11.5px;color:var(--muted);margin-top:20px;">${esc(s.prescriptionFooter)}</div>`:''}
    </div>
  `;
  document.getElementById('printArea').innerHTML = html;
  document.body.classList.add('print-single-rx');
  window.print();
  setTimeout(()=>{ document.body.classList.remove('print-single-rx'); }, 500);
}
window.addEventListener('afterprint', ()=>{ document.body.classList.remove('print-single-rx'); });

/* ================= APPOINTMENTS ================= */
function renderAppointments(){
  const today = todayISO();
  let list;
  if(state.apptTab==='today') list = DB.appointments.filter(a=>a.date===today);
  else if(state.apptTab==='upcoming') list = DB.appointments.filter(a=>a.date>today && a.status==='Scheduled');
  else if(state.apptTab==='completed') list = DB.appointments.filter(a=>a.status==='Attended');
  else if(state.apptTab==='cancelled') list = DB.appointments.filter(a=>a.status==='Cancelled');
  else if(state.apptTab==='missed') list = DB.appointments.filter(a=>a.status==='Missed');
  else list = DB.appointments.slice();
  list = list.slice().sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));

  const tabs = [
    {id:'today', label:'Today'}, {id:'upcoming', label:'Upcoming'}, {id:'completed', label:'Completed'},
    {id:'cancelled', label:'Cancelled'}, {id:'missed', label:'Missed'}, {id:'all', label:'All'}
  ].map(t=>`<button data-appt-tab="${t.id}" class="${state.apptTab===t.id?'active':''}">${t.label}</button>`).join('');

  const rows = list.map(a=>`
    <tr>
      <td>${fmtDate(a.date)}</td>
      <td>${fmtTime(a.time)}</td>
      <td>${esc(a.patientName)}</td>
      <td>${esc(a.mobile)||'—'}</td>
      <td>${esc(a.type)}</td>
      <td><span class="badge ${apptBadgeCls(a.status)}">${esc(a.status)}</span></td>
      <td class="actions-cell no-print">
        ${a.patientRefId?`<button class="btn sm secondary" data-goto-patient="${a.patientRefId}">Patient</button>`:''}
        <button class="btn sm green" data-mark-appt="${a.id}|Attended">Attended</button>
        <button class="btn sm grey" data-mark-appt="${a.id}|Cancelled">Cancel</button>
        <button class="btn sm danger" data-mark-appt="${a.id}|Missed">Missed</button>
        <button class="btn sm grey" data-edit-appt="${a.id}">Reschedule / Edit</button>
        <button class="btn sm danger" data-del-appt="${a.id}">Delete</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="7"><div class="empty-note">No appointments in this view.</div></td></tr>`;

  return `
    <div class="section-title no-print">📅 Appointments</div>
    <div class="toolbar no-print">
      <button class="btn" id="btnAddAppt">＋ Add Appointment</button>
    </div>
    <div class="subtabs no-print">${tabs}</div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Patient</th><th>Mobile</th><th>Type</th><th>Status</th><th class="no-print">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
}
function attachAppointmentsHandlers(){
  document.getElementById('btnAddAppt').addEventListener('click', ()=>openAppointmentForm(null));
  document.querySelectorAll('[data-appt-tab]').forEach(b=>b.addEventListener('click', ()=>{ state.apptTab=b.dataset.apptTab; render(); }));
  document.querySelectorAll('[data-goto-patient]').forEach(b=>b.addEventListener('click', ()=>{ state.view='patientProfile'; state.currentPatientId=b.dataset.gotoPatient; renderNav(); render(); }));
  document.querySelectorAll('[data-edit-appt]').forEach(b=>b.addEventListener('click', ()=>openAppointmentForm(b.dataset.editAppt)));
  document.querySelectorAll('[data-del-appt]').forEach(b=>b.addEventListener('click', ()=>deleteAppointment(b.dataset.delAppt)));
  document.querySelectorAll('[data-mark-appt]').forEach(b=>b.addEventListener('click', ()=>{
    const [id, status] = b.dataset.markAppt.split('|');
    markAppointment(id, status);
  }));
}
function markAppointment(id, status){
  const a = DB.appointments.find(x=>x.id===id);
  if(!a) return;
  a.status = status;
  saveDB();
  render();
}
function deleteAppointment(id){
  if(!confirm('Delete this appointment? This cannot be undone.')) return;
  DB.appointments = DB.appointments.filter(a=>a.id!==id);
  saveDB();
  render();
}
function openAppointmentForm(id){
  const existing = id ? DB.appointments.find(a=>a.id===id) : null;
  const patientOptions = DB.patients.map(p=>`<option value="${p.id}" ${existing && existing.patientRefId===p.id?'selected':''}>${esc(p.patientId)} — ${esc(p.name)}</option>`).join('');
  const v = existing || {date: todayISO(), time:'', type:'Follow-up', status:'Scheduled', patientRefId:'', patientName:'', mobile:'', notes:''};
  const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-box">
        <h2>${existing?'Edit / Reschedule Appointment':'Add Appointment'}</h2>
        <form id="apptForm">
          <div class="form-grid">
            <div class="form-field full">
              <label>Existing Patient (optional)</label>
              <select name="patientRefId" id="apptPatientSelect"><option value="">-- Walk-in / Not Registered --</option>${patientOptions}</select>
            </div>
            <div class="form-field"><label>Patient Name *</label><input type="text" name="patientName" value="${esc(v.patientName)}" required></div>
            <div class="form-field"><label>Mobile Number</label><input type="text" name="mobile" value="${esc(v.mobile)}"></div>
            <div class="form-field"><label>Date *</label><input type="date" name="date" value="${esc(v.date)}" required></div>
            <div class="form-field"><label>Time</label><input type="time" name="time" value="${esc(v.time)}"></div>
            <div class="form-field"><label>Type</label>
              <select name="type"><option ${v.type==='New'?'selected':''}>New</option><option ${v.type==='Follow-up'?'selected':''}>Follow-up</option></select>
            </div>
            <div class="form-field"><label>Status</label>
              <select name="status">
                <option ${v.status==='Scheduled'?'selected':''}>Scheduled</option>
                <option ${v.status==='Attended'?'selected':''}>Attended</option>
                <option ${v.status==='Cancelled'?'selected':''}>Cancelled</option>
                <option ${v.status==='Missed'?'selected':''}>Missed</option>
              </select>
            </div>
            <div class="form-field full"><label>Notes</label><textarea name="notes">${esc(v.notes)}</textarea></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn grey" id="btnCancelAppt">Cancel</button>
            <button type="submit" class="btn">Save Appointment</button>
          </div>
        </form>
      </div>
    </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  document.getElementById('btnCancelAppt').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay') closeModal(); });
  document.getElementById('apptPatientSelect').addEventListener('change', e=>{
    const p = DB.patients.find(x=>x.id===e.target.value);
    if(p){
      document.querySelector('#apptForm [name=patientName]').value = p.name;
      document.querySelector('#apptForm [name=mobile]').value = p.mobile;
    }
  });
  document.getElementById('apptForm').addEventListener('submit', ev=>{
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const data = existing ? Object.assign({}, existing) : {id: uid()};
    ['patientRefId','patientName','mobile','date','time','type','status','notes'].forEach(k=>{ data[k]=fd.get(k)||''; });
    const idx = DB.appointments.findIndex(a=>a.id===data.id);
    if(idx>=0) DB.appointments[idx]=data; else DB.appointments.push(data);
    saveDB();
    closeModal();
    render();
  });
}

/* ================= FOLLOW-UPS (CONSOLIDATED VIEW) ================= */
function renderFollowupsView(){
  const tabs = [
    {id:'overdue', label:'Overdue'}, {id:'today', label:'Due Today'}, {id:'soon', label:'Due Soon (7 days)'},
    {id:'upcoming', label:'Upcoming'}, {id:'none', label:'None Scheduled'}
  ].map(t=>`<button data-fu-tab="${t.id}" class="${state.followupTab===t.id?'active':''}">${t.label}</button>`).join('');

  const list = DB.patients.filter(p=>followUpStatus(p).status===state.followupTab)
    .sort((a,b)=>(nextFollowUpDateFor(a)||'').localeCompare(nextFollowUpDateFor(b)||''));

  const rows = list.map(p=>{
    const fu = followUpStatus(p);
    const d = nextFollowUpDateFor(p);
    return `<div class="item-row ${fu.rowCls}">
      <div><div class="title">${esc(p.name)} <span style="color:var(--muted);font-weight:400;">(${esc(p.patientId)})</span></div>
      <div class="meta">${d?('Next follow-up: '+fmtDate(d)):'No follow-up scheduled'} &middot; ${esc(p.mobile)}</div></div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="badge ${fu.cls}">${fu.label}</span>
        <button class="btn sm secondary" data-goto-patient="${p.id}">View Patient</button>
      </div>
    </div>`;
  }).join('') || '<div class="empty-note">No patients in this category.</div>';

  return `
    <div class="section-title no-print">⏰ Follow-ups</div>
    <div class="subtabs no-print">${tabs}</div>
    <div class="item-list">${rows}</div>
  `;
}
function attachFollowupsHandlers(){
  document.querySelectorAll('[data-fu-tab]').forEach(b=>b.addEventListener('click', ()=>{ state.followupTab=b.dataset.fuTab; render(); }));
  document.querySelectorAll('[data-goto-patient]').forEach(b=>b.addEventListener('click', ()=>{ state.view='patientProfile'; state.currentPatientId=b.dataset.gotoPatient; renderNav(); render(); }));
}

/* ================= REPORTS ================= */
function groupCount(arr, keyFn){
  const m = {};
  arr.forEach(item=>{ const v = keyFn(item) || 'Unspecified'; m[v]=(m[v]||0)+1; });
  return m;
}
function ageDistribution(){
  const buckets = ['0-10','11-20','21-30','31-40','41-50','51-60','61-70','71+'];
  const counts = {}; buckets.forEach(b=>counts[b]=0);
  DB.patients.forEach(p=>{
    const a = typeof displayAge(p)==='number' ? displayAge(p) : null;
    if(a===null) return;
    let b;
    if(a<=10) b='0-10'; else if(a<=20) b='11-20'; else if(a<=30) b='21-30'; else if(a<=40) b='31-40';
    else if(a<=50) b='41-50'; else if(a<=60) b='51-60'; else if(a<=70) b='61-70'; else b='71+';
    counts[b]++;
  });
  return {labels: buckets, values: buckets.map(b=>counts[b])};
}
function diagnosisStats(){
  const m = groupCount(DB.patients, p=>diagnosisOf(p)||'Unspecified');
  const entries = Object.entries(m).sort((a,b)=>b[1]-a[1]);
  const top = entries.slice(0,8);
  const otherTotal = entries.slice(8).reduce((s,e)=>s+e[1],0);
  if(otherTotal>0) top.push(['Other', otherTotal]);
  return {labels: top.map(e=>e[0]), values: top.map(e=>e[1])};
}
function medicineStats(){
  const m = {};
  DB.patients.forEach(p=>{ allVisits(p).forEach(v=>{ const med=(v.medicine||'').trim(); if(med) m[med]=(m[med]||0)+1; }); });
  const entries = Object.entries(m).sort((a,b)=>b[1]-a[1]);
  const top = entries.slice(0,8);
  const otherTotal = entries.slice(8).reduce((s,e)=>s+e[1],0);
  if(otherTotal>0) top.push(['Other', otherTotal]);
  return {labels: top.map(e=>e[0]), values: top.map(e=>e[1])};
}
function newVsFollowupMonthly(months){
  const keys = monthKeys(months);
  const newCounts = {}, fuCounts = {}; keys.forEach(k=>{ newCounts[k]=0; fuCounts[k]=0; });
  DB.patients.forEach(p=>{
    if(p.regDate && newCounts[p.regDate.slice(0,7)]!==undefined) newCounts[p.regDate.slice(0,7)]++;
    (p.followUps||[]).forEach(f=>{ if(f.date && fuCounts[f.date.slice(0,7)]!==undefined) fuCounts[f.date.slice(0,7)]++; });
  });
  return {labels: keys.map(monthLabel), newValues: keys.map(k=>newCounts[k]), fuValues: keys.map(k=>fuCounts[k])};
}
function monthlyIncome(months){
  const keys = monthKeys(months);
  const income = {}; keys.forEach(k=>income[k]=0);
  DB.patients.forEach(p=>{
    if(p.initial && p.initial.paymentStatus==='Paid' && p.regDate && income[p.regDate.slice(0,7)]!==undefined) income[p.regDate.slice(0,7)] += Number(p.initial.fee)||0;
    (p.followUps||[]).forEach(f=>{ if(f.paymentStatus==='Paid' && f.date && income[f.date.slice(0,7)]!==undefined) income[f.date.slice(0,7)] += Number(f.fee)||0; });
  });
  return {labels: keys.map(monthLabel), values: keys.map(k=>income[k])};
}
function yearlyTrend(years){
  const now = new Date(); const yrs=[]; for(let i=years-1;i>=0;i--) yrs.push(String(now.getFullYear()-i));
  const counts={}; yrs.forEach(y=>counts[y]=0);
  DB.patients.forEach(p=>{
    if(p.regDate && counts[p.regDate.slice(0,4)]!==undefined) counts[p.regDate.slice(0,4)]++;
    (p.followUps||[]).forEach(f=>{ if(f.date && counts[f.date.slice(0,4)]!==undefined) counts[f.date.slice(0,4)]++; });
  });
  return {labels:yrs, values:yrs.map(y=>counts[y])};
}
function dailyAttendance(days){
  const keys=[]; const counts={};
  for(let i=days-1;i>=0;i--){ const d=addDays(-i); keys.push(d); counts[d]=0; }
  DB.patients.forEach(p=>{
    if(counts[p.regDate]!==undefined) counts[p.regDate]++;
    (p.followUps||[]).forEach(f=>{ if(counts[f.date]!==undefined) counts[f.date]++; });
  });
  return {labels: keys.map(k=>fmtDate(k)), values: keys.map(k=>counts[k])};
}
function paidUnpaidStats(){
  const stats = {Paid:0, Unpaid:0, Partial:0};
  DB.patients.forEach(p=>{
    if(p.initial && p.initial.paymentStatus) stats[p.initial.paymentStatus] = (stats[p.initial.paymentStatus]||0)+1;
    (p.followUps||[]).forEach(f=>{ if(f.paymentStatus) stats[f.paymentStatus] = (stats[f.paymentStatus]||0)+1; });
  });
  return stats;
}
function pendingPaymentsList(){
  const rows = [];
  DB.patients.forEach(p=>{
    allVisits(p).forEach(v=>{ if(v.paymentStatus && v.paymentStatus!=='Paid'){ rows.push({patient:p, date:v.date, fee:v.fee, status:v.paymentStatus, kind:v.kind}); } });
  });
  return rows.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}
function followUpReportCounts(){
  const counts={overdue:0,today:0,soon:0,upcoming:0,none:0};
  DB.patients.forEach(p=>{ counts[followUpStatus(p).status]++; });
  return {labels:['Overdue','Due Today','Due Soon','Upcoming','None Scheduled'], values:['overdue','today','soon','upcoming','none'].map(c=>counts[c])};
}
function renderReports(){
  const pending = pendingPaymentsList();
  const pendingRows = pending.map(r=>`<tr><td>${esc(r.patient.name)} (${esc(r.patient.patientId)})</td><td>${fmtDate(r.date)}</td><td>${r.kind==='initial'?'Initial':'Follow-up'}</td><td>${fmtCurrency(r.fee)}</td><td><span class="badge ${r.status==='Partial'?'badge-yellow':'badge-red'}">${esc(r.status)}</span></td></tr>`).join('') || `<tr><td colspan="5"><div class="empty-note">No pending payments.</div></td></tr>`;
  const sexCounts = groupCount(DB.patients, p=>p.sex);
  const maleCt = sexCounts['Male']||0, femaleCt = sexCounts['Female']||0;

  return `
    <div class="section-title no-print">📈 Reports</div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Daily Patients (last 14 days)</h3><canvas id="chartDaily"></canvas></div>
      <div class="chart-card"><h3>Monthly Patients (last 6 months)</h3><canvas id="chartMonthlyAttend"></canvas></div>
      <div class="chart-card"><h3>Yearly Patients</h3><canvas id="chartYearly"></canvas></div>
      <div class="chart-card"><h3>New vs Follow-up Patients (monthly)</h3><canvas id="chartNewVsFu"></canvas></div>
      <div class="chart-card"><h3>Age Distribution</h3><canvas id="chartAge"></canvas></div>
      <div class="chart-card"><h3>Male / Female Ratio (${maleCt}:${femaleCt})</h3><canvas id="chartSex"></canvas></div>
      <div class="chart-card"><h3>Disease Statistics</h3><canvas id="chartDiagnosis"></canvas></div>
      <div class="chart-card"><h3>Medicine Statistics</h3><canvas id="chartMedicine"></canvas></div>
      <div class="chart-card"><h3>Income Report (₹, Paid only, monthly)</h3><canvas id="chartIncome"></canvas></div>
      <div class="chart-card"><h3>Paid vs Unpaid Visits</h3><canvas id="chartPaid"></canvas></div>
      <div class="chart-card"><h3>Follow-up Report</h3><canvas id="chartFollowupReport"></canvas></div>
    </div>
    <div class="section-title">💸 Pending Payments</div>
    <div class="table-wrap"><table><thead><tr><th>Patient</th><th>Date</th><th>Visit</th><th>Amount</th><th>Status</th></tr></thead><tbody>${pendingRows}</tbody></table></div>
  `;
}
let reportCharts = [];
function drawReportCharts(){
  if(typeof Chart==='undefined'){
    document.querySelectorAll('.chart-card canvas').forEach(cv=>{
      const note = document.createElement('div'); note.className='empty-note';
      note.textContent='Charts unavailable offline (no internet connection to load chart library).';
      cv.replaceWith(note);
    });
    return;
  }
  reportCharts.forEach(c=>c.destroy());
  reportCharts = [];
  const palette = ['#1565c0','#0b3d66','#42a5f5','#90caf9','#fb8c00','#e53935','#2e7d32','#f9a825','#8e24aa','#00897b'];
  function bar(id,labels,values,label){
    const ctx=document.getElementById(id); if(!ctx) return;
    reportCharts.push(new Chart(ctx,{type:'bar',data:{labels,datasets:[{label,data:values,backgroundColor:palette}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}}));
  }
  function pie(id,labels,values){
    const ctx=document.getElementById(id); if(!ctx) return;
    reportCharts.push(new Chart(ctx,{type:'pie',data:{labels,datasets:[{data:values,backgroundColor:palette}]}}));
  }

  const daily = dailyAttendance(14);
  bar('chartDaily', daily.labels, daily.values, 'Visits');

  const monthly = monthlyTrend(6);
  bar('chartMonthlyAttend', monthly.labels, monthly.values, 'Visits');

  const yearly = yearlyTrend(5);
  bar('chartYearly', yearly.labels, yearly.values, 'Visits');

  const nvf = newVsFollowupMonthly(6);
  const ctxNvf = document.getElementById('chartNewVsFu');
  if(ctxNvf) reportCharts.push(new Chart(ctxNvf, {type:'bar', data:{labels:nvf.labels, datasets:[
    {label:'New', data:nvf.newValues, backgroundColor:'#1565c0'},
    {label:'Follow-up', data:nvf.fuValues, backgroundColor:'#fb8c00'}
  ]}, options:{scales:{y:{beginAtZero:true,ticks:{precision:0}}}}}));

  const age = ageDistribution();
  bar('chartAge', age.labels, age.values, 'Patients');

  const sex = groupCount(DB.patients, p=>p.sex);
  pie('chartSex', Object.keys(sex), Object.values(sex));

  const diag = diagnosisStats();
  bar('chartDiagnosis', diag.labels, diag.values, 'Patients');

  const meds = medicineStats();
  bar('chartMedicine', meds.labels, meds.values, 'Prescriptions');

  const income = monthlyIncome(6);
  bar('chartIncome', income.labels, income.values, 'Income (₹)');

  const paid = paidUnpaidStats();
  pie('chartPaid', Object.keys(paid), Object.values(paid));

  const fur = followUpReportCounts();
  bar('chartFollowupReport', fur.labels, fur.values, 'Patients');
}

/* ================= SETTINGS ================= */
function renderSettings(){
  const s = DB.settings;
  return `
    <div class="section-title">⚙️ Clinic Settings</div>
    <div class="settings-block">
      <h3>Clinic & Doctor Details</h3>
      <div class="form-field"><label>Doctor Name</label><input type="text" id="setDoctorName" value="${esc(s.doctorName)}"></div>
      <div class="form-field"><label>Qualification</label><input type="text" id="setQualification" value="${esc(s.qualification)}"></div>
      <div class="form-field"><label>Registration Number</label><input type="text" id="setRegNumber" value="${esc(s.registrationNumber)}"></div>
      <div class="form-field"><label>Phone Number</label><input type="text" id="setPhone" value="${esc(s.phone)}"></div>
      <div class="form-field"><label>Clinic Name</label><input type="text" id="setClinicName" value="${esc(s.clinicName)}"></div>
      <div class="form-field"><label>Clinic Address</label><textarea id="setClinicAddress">${esc(s.clinicAddress)}</textarea></div>
      <div class="form-field"><label>Clinic Logo</label><input type="file" accept="image/*" id="setLogoInput">
        <div id="logoPreviewWrap" style="margin-top:8px;">${s.logo?`<img src="${s.logo}" style="max-height:70px;">`:''}</div>
        <input type="hidden" id="setLogoHidden" value="${esc(s.logo)}">
      </div>
      <div class="form-field"><label>Prescription Footer Text</label><textarea id="setRxFooter">${esc(s.prescriptionFooter)}</textarea></div>
      <button class="btn" id="btnSaveClinicInfo">Save Details</button>
    </div>
    <div class="settings-block">
      <h3>Default Fees</h3>
      <div class="form-field"><label>New Patient Consultation Fee (₹)</label><input type="number" id="setNewFee" value="${esc(s.newPatientFee)}"></div>
      <div class="form-field"><label>Regular Follow-up Fee (₹)</label><input type="number" id="setFuFee" value="${esc(s.followUpFee)}"></div>
      <p style="color:var(--muted);font-size:13px;">These are used as defaults on new records; the fee can always be changed for an individual visit.</p>
      <button class="btn" id="btnSaveFees">Save Fees</button>
    </div>
    <div class="settings-block">
      <h3>Data Management</h3>
      <p style="color:var(--muted);font-size:13.5px;">Clinic data is stored only on this device's browser storage, completely separate from the WBCYN Registrar module.</p>
      <button class="btn secondary" id="btnBackup">Export Clinic Backup (JSON)</button>
      <button class="btn secondary" id="btnRestoreTrigger">Import Clinic Backup (JSON)</button>
      <input type="file" id="restoreFile" accept=".json" style="display:none">
      <br><br>
      <button class="btn grey" id="btnClearSample">Clear Sample Data Only</button>
    </div>
    <div class="settings-block" style="background:#fdecea;border-color:#f3c1bd;">
      <h3 style="color:var(--red);">Danger Zone</h3>
      <p style="color:var(--muted);font-size:13.5px;">This permanently erases all clinic patients, appointments and settings from this device. The WBCYN Registrar module and JM Digital Office launcher are not affected.</p>
      <button class="btn danger" id="btnReset">Reset Clinic Data</button>
    </div>
  `;
}
function attachSettingsHandlers(){
  const logoInput = document.getElementById('setLogoInput');
  if(logoInput){
    logoInput.addEventListener('change', async e=>{
      const file = e.target.files[0];
      if(!file) return;
      try{
        const rawUrl = await readFileAsDataURL(file);
        const resized = await resizeImageDataURL(rawUrl, 300);
        document.getElementById('setLogoHidden').value = resized;
        document.getElementById('logoPreviewWrap').innerHTML = `<img src="${resized}" style="max-height:70px;">`;
      }catch(err){ console.warn('Logo processing failed:', err); }
    });
  }
  document.getElementById('btnSaveClinicInfo').addEventListener('click', ()=>{
    DB.settings.doctorName = document.getElementById('setDoctorName').value;
    DB.settings.qualification = document.getElementById('setQualification').value;
    DB.settings.registrationNumber = document.getElementById('setRegNumber').value;
    DB.settings.phone = document.getElementById('setPhone').value;
    DB.settings.clinicName = document.getElementById('setClinicName').value;
    DB.settings.clinicAddress = document.getElementById('setClinicAddress').value;
    DB.settings.logo = document.getElementById('setLogoHidden').value;
    DB.settings.prescriptionFooter = document.getElementById('setRxFooter').value;
    saveDB();
    renderHeader();
    alert('Clinic details saved.');
  });
  document.getElementById('btnSaveFees').addEventListener('click', ()=>{
    DB.settings.newPatientFee = Number(document.getElementById('setNewFee').value)||0;
    DB.settings.followUpFee = Number(document.getElementById('setFuFee').value)||0;
    saveDB();
    alert('Default fees saved.');
  });
  document.getElementById('btnBackup').addEventListener('click', ()=>{
    downloadBlob(JSON.stringify(DB,null,2), 'application/json', `Clinic_Backup_${todayISO()}.json`);
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
        if(!confirm('This will replace all current clinic data with the backup file. Continue?')) return;
        DB = ensureShape(parsed);
        saveDB();
        renderHeader();
        render();
        alert('Clinic backup restored successfully.');
      }catch(err){ alert('Invalid backup file.'); }
    };
    reader.readAsText(file);
  });
  document.getElementById('btnClearSample').addEventListener('click', ()=>{
    if(!confirm('Remove all sample patients and appointments? Your own records will not be affected.')) return;
    DB.patients = DB.patients.filter(p=>!p._sample);
    DB.appointments = DB.appointments.filter(a=>!a._sample);
    saveDB();
    render();
    alert('Sample data cleared.');
  });
  document.getElementById('btnReset').addEventListener('click', ()=>{
    const input = prompt('This will permanently delete ALL clinic data on this device (patients, follow-ups, appointments, settings). The WBCYN module is not affected.\n\nType RESET to confirm.');
    if(input==='RESET'){
      localStorage.removeItem(STORAGE_KEY);
      DB = freshDB();
      saveDB();
      renderHeader();
      state.view='dashboard';
      renderNav();
      render();
      alert('Clinic data has been reset.');
    }
  });
}

/* ================= PWA: install banner ================= */
function isStandalone(){
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  return mm || window.navigator.standalone === true;
}
function isiOS(){ return /iphone|ipad|ipod/i.test(window.navigator.userAgent); }
function renderInstallBanner(){
  const root = document.getElementById('pwaBannerRoot');
  if(!root) return;
  if(isStandalone()) return;
  if(localStorage.getItem('jm_install_banner_dismissed')==='1') return;
  if(!isiOS()) return;
  root.innerHTML = `
    <div class="pwa-install-banner" id="pwaBanner">
      <span>Install JM Digital Office: tap the Share icon, then "Add to Home Screen".</span>
      <button id="pwaBannerDismiss" class="dismiss">✕</button>
    </div>`;
  document.getElementById('pwaBannerDismiss').addEventListener('click', ()=>{
    localStorage.setItem('jm_install_banner_dismissed','1');
    root.innerHTML='';
  });
}

/* ================= SERVICE WORKER REGISTRATION ================= */
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('../service-worker.js').then(reg=>{
        if(typeof window.attachSWUpdateWatcher==='function') window.attachSWUpdateWatcher(reg);
      }).catch(err=>{
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

/* ================= START ================= */
init();
try{ renderInstallBanner(); }catch(e){ console.warn('Install banner skipped:', e); }
try{ registerServiceWorker(); }catch(e){ console.warn('Service worker registration skipped:', e); }
