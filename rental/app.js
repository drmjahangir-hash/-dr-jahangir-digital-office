'use strict';
/* =========================================================================
   RENTAL MANAGER
   Completely separate module & localStorage namespace from WBCYN / Clinic /
   Trust Manager. Manages multiple properties, units, tenants, rent
   collection, mandatory electricity sub-meter billing, combined bills,
   security deposits, expenses, maintenance, agreements, notifications,
   reports, search, settings and backup/restore.
   ========================================================================= */

const STORAGE_KEY = 'jm_rental_db_v1';

/* ---------------------------------------------------------------------- */
/* UTILITIES (same proven implementations used across every module)       */
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
function formatDate(iso){
  if(!iso) return '—';
  const p = String(iso).slice(0,10).split('-'); if(p.length!==3) return iso;
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
function validateRentalBackup(obj){
  if(!obj || typeof obj!=='object') return {ok:false, reason:'File does not contain a JSON object.'};
  const expectedArrayKeys = ['properties','units','tenants','occupancyHistory','rentPayments','electricityBills','combinedBills','deposits','expenses','complaints','agreements'];
  const missing = expectedArrayKeys.filter(k=>!(k in obj));
  if(missing.length>=expectedArrayKeys.length){
    return {ok:false, reason:'None of the expected Rental Manager data fields were found (e.g. properties, units, tenants).'};
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

/* ---------------------------------------------------------------------- */
/* DATA MODEL                                                             */
/* ---------------------------------------------------------------------- */
function freshDB(){
  return {
    settings:{
      ownerName:'', ownerAddress:'', ownerPhone:'', ownerEmail:'',
      defaultElectricityRate:12,
      defaultRentDueDay:5,
      defaultLateFee:0,
      receiptPrefix:'RENT',
      electricityBillPrefix:'ELEC',
      currency:'INR',
      dateFormat:'DD/MM/YYYY'
    },
    // Only the two named properties are preloaded, and only their Name is
    // filled in. No floor numbers, unit numbers or addresses are invented —
    // the user fills those in via Edit Property.
    properties:[
      {id:'PROP-0001', name:'Nabadiganta Complex', type:'', address:'', floors:'', declaredTotalUnits:'', contactPerson:'', contactNumber:'', electricityRateOverride:'', notes:'', status:'Active', createdAt: (new Date()).toISOString().slice(0,10)},
      {id:'PROP-0002', name:'Sunny Paradise', type:'', address:'', floors:'', declaredTotalUnits:'', contactPerson:'', contactNumber:'', electricityRateOverride:'', notes:'', status:'Active', createdAt: (new Date()).toISOString().slice(0,10)}
    ],
    units:[],
    tenants:[],
    occupancyHistory:[],
    rentPayments:[],
    electricityBills:[],
    combinedBills:[],
    deposits:[],
    expenses:[],
    complaints:[],
    agreements:[],
    notificationState:{ readIds:[], deletedIds:[] },
    nextIds:{property:3, unit:1, tenant:1, occupancy:1, rentPayment:1, electricityBill:1, combinedBill:1, deposit:1, expense:1, complaint:1, agreement:1}
  };
}
function ensureShape(db){
  const fresh = freshDB();
  db.settings = Object.assign({}, fresh.settings, db.settings||{});
  ['properties','units','tenants','occupancyHistory','rentPayments','electricityBills','combinedBills','deposits','expenses','complaints','agreements']
    .forEach(k=>{ if(!Array.isArray(db[k])) db[k] = []; });
  db.notificationState = Object.assign({}, fresh.notificationState, db.notificationState||{});
  if(!Array.isArray(db.notificationState.readIds)) db.notificationState.readIds = [];
  if(!Array.isArray(db.notificationState.deletedIds)) db.notificationState.deletedIds = [];
  db.nextIds = Object.assign({}, fresh.nextIds, db.nextIds||{});
  db.properties.forEach(p=>{ if(p.status===undefined) p.status='Active'; });
  db.units.forEach(u=>{ if(!Array.isArray(u.attachments)) u.attachments = []; });
  db.tenants.forEach(t=>{ if(!Array.isArray(t.attachments)) t.attachments = []; });
  db.expenses.forEach(e=>{ if(!Array.isArray(e.attachments)) e.attachments = []; });
  db.complaints.forEach(c=>{ if(!Array.isArray(c.attachments)) c.attachments = []; });
  db.agreements.forEach(a=>{ if(!Array.isArray(a.attachments)) a.attachments = []; });
  db.electricityBills.forEach(b=>{ if(!Array.isArray(b.attachments)) b.attachments = []; });
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
/* FIELD CONFIGS                                                         */
/* ---------------------------------------------------------------------- */
const PROPERTY_TYPES = ['Residential Complex','Commercial Complex','Mixed Use','Other'];
const PROPERTY_FIELDS = [
  {key:'name', label:'Property Name', type:'text', required:true},
  {key:'type', label:'Property Type', type:'select', options:PROPERTY_TYPES},
  {key:'address', label:'Address', type:'textarea'},
  {key:'floors', label:'Number of Floors', type:'number'},
  {key:'declaredTotalUnits', label:'Total Units (declared)', type:'number'},
  {key:'contactPerson', label:'Contact Person', type:'text'},
  {key:'contactNumber', label:'Contact Number', type:'text'},
  {key:'electricityRateOverride', label:'Electricity Rate Override (₹/unit, optional)', type:'number'},
  {key:'notes', label:'Notes', type:'textarea'},
  {key:'status', label:'Status', type:'select', options:['Active','Inactive']}
];

const UNIT_CATEGORIES = ['Residential Flat','Commercial Shop','Office','Store','Other'];
const UNIT_STATUSES = ['Occupied','Vacant','Under Maintenance','Reserved'];
const UNIT_FIELDS = [
  {key:'unitNumber', label:'Unit Number', type:'text', required:true},
  {key:'floor', label:'Floor', type:'text'},
  {key:'category', label:'Unit Category', type:'select', options:UNIT_CATEGORIES},
  {key:'area', label:'Area (sq ft, optional)', type:'number'},
  {key:'rooms', label:'Rooms (optional)', type:'number'},
  {key:'monthlyRent', label:'Monthly Rent (₹)', type:'number'},
  {key:'maintenanceCharge', label:'Maintenance Charge (₹)', type:'number'},
  {key:'securityDepositRequired', label:'Security Deposit Required (₹)', type:'number'},
  {key:'electricitySubMeterNumber', label:'Electricity Sub-meter Number', type:'text'},
  {key:'electricityRateOverride', label:'Electricity Rate Override (₹/unit, optional)', type:'number'},
  {key:'waterCharge', label:'Water Charge (₹)', type:'number'},
  {key:'parkingCharge', label:'Parking Charge (₹)', type:'number'},
  {key:'otherMonthlyCharge', label:'Other Monthly Charge (₹)', type:'number'},
  {key:'status', label:'Status', type:'select', options:UNIT_STATUSES},
  {key:'notes', label:'Notes', type:'textarea'}
];

const TENANT_TYPES = ['Residential','Commercial'];
const TENANT_STATUSES = ['Active','Notice Given','Vacated','Former Tenant'];
const ID_PROOF_TYPES = ['Aadhaar','PAN','Passport','Voter ID','Driving Licence','Other'];
const TENANT_FIELDS = [
  {key:'name', label:'Full Name', type:'text', required:true},
  {key:'fatherHusbandName', label:'Father / Husband Name', type:'text'},
  {key:'mobile', label:'Mobile Number', type:'text'},
  {key:'whatsapp', label:'WhatsApp Number', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'occupation', label:'Occupation / Business', type:'text'},
  {key:'residentialAddress', label:'Residential Address', type:'textarea'},
  {key:'permanentAddress', label:'Permanent Address', type:'textarea'},
  {key:'idProofType', label:'Identity Proof Type', type:'select', options:ID_PROOF_TYPES},
  {key:'idProofNumber', label:'Identity Proof Number', type:'text'},
  {key:'pan', label:'PAN (Optional)', type:'text'},
  {key:'aadhaar', label:'Aadhaar (Optional)', type:'text'},
  {key:'emergencyContactName', label:'Emergency Contact Name', type:'text'},
  {key:'emergencyContactNumber', label:'Emergency Contact Number', type:'text'},
  {key:'familyMembers', label:'Family Members / Occupants', type:'textarea'},
  {key:'tenantType', label:'Tenant Type', type:'select', options:TENANT_TYPES},
  {key:'moveInDate', label:'Move-in Date', type:'date'},
  {key:'agreementStartDate', label:'Agreement Start Date', type:'date'},
  {key:'agreementEndDate', label:'Agreement End Date', type:'date'},
  {key:'monthlyRent', label:'Monthly Rent (₹)', type:'number'},
  {key:'maintenance', label:'Maintenance (₹)', type:'number'},
  {key:'securityDeposit', label:'Security Deposit (₹)', type:'number'},
  {key:'electricityRate', label:'Electricity Rate (₹/unit, informational)', type:'number'},
  {key:'waterCharge', label:'Water Charge (₹)', type:'number'},
  {key:'parkingCharge', label:'Parking Charge (₹)', type:'number'},
  {key:'otherCharge', label:'Other Charge (₹)', type:'number'},
  {key:'rentDueDay', label:'Rent Due Day', type:'number'},
  {key:'status', label:'Status', type:'select', options:TENANT_STATUSES},
  {key:'remarks', label:'Remarks', type:'textarea'}
];
const MASKED_TENANT_KEYS = ['pan','aadhaar','idProofNumber'];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PAYMENT_MODES = ['Cash','Bank Transfer','UPI','Cheque','Other'];

const RENT_FIELDS = [
  {key:'rentMonth', label:'Rent Month', type:'select', options:MONTH_NAMES, required:true},
  {key:'rentYear', label:'Rent Year', type:'number', required:true},
  {key:'rentAmount', label:'Rent Amount (₹)', type:'number', required:true},
  {key:'maintenanceAmount', label:'Maintenance Amount (₹)', type:'number'},
  {key:'waterCharge', label:'Water Charge (₹)', type:'number'},
  {key:'parkingCharge', label:'Parking Charge (₹)', type:'number'},
  {key:'otherCharges', label:'Other Charges (₹)', type:'number'},
  {key:'previousRentDue', label:'Previous Rent Due (₹)', type:'number'},
  {key:'lateFee', label:'Late Fee (₹)', type:'number'},
  {key:'adjustment', label:'Adjustment / Rebate (₹)', type:'number'},
  {key:'amountReceived', label:'Amount Received (₹)', type:'number', required:true},
  {key:'paymentDate', label:'Payment Date', type:'date', required:true},
  {key:'paymentMode', label:'Payment Mode', type:'select', options:PAYMENT_MODES},
  {key:'transactionRef', label:'Transaction Reference', type:'text'},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

const ELECTRICITY_FIELDS = [
  {key:'billingMonth', label:'Billing Month', type:'select', options:MONTH_NAMES, required:true},
  {key:'billingYear', label:'Billing Year', type:'number', required:true},
  {key:'subMeterNumber', label:'Sub-meter Number', type:'text'},
  {key:'prevReadingDate', label:'Previous Meter Reading Date', type:'date', required:true},
  {key:'prevReading', label:'Previous Meter Reading', type:'number', required:true},
  {key:'currReadingDate', label:'Current Meter Reading Date', type:'date', required:true},
  {key:'currReading', label:'Current Meter Reading', type:'number', required:true},
  {key:'ratePerUnit', label:'Rate Per Unit (₹)', type:'number', required:true},
  {key:'previousOutstanding', label:'Previous Electricity Outstanding (₹)', type:'number'},
  {key:'lateFee', label:'Late Fee (₹, optional)', type:'number'},
  {key:'adjustment', label:'Adjustment / Rebate (₹)', type:'number'},
  {key:'amountPaid', label:'Amount Paid (₹)', type:'number'},
  {key:'paymentDate', label:'Payment Date', type:'date'},
  {key:'paymentMode', label:'Payment Mode', type:'select', options:PAYMENT_MODES},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

const COMBINED_BILL_FIELDS = [
  {key:'month', label:'Month', type:'select', options:MONTH_NAMES, required:true},
  {key:'year', label:'Year', type:'number', required:true},
  {key:'rentAmount', label:'Rent (₹)', type:'number'},
  {key:'maintenance', label:'Maintenance (₹)', type:'number'},
  {key:'electricity', label:'Electricity (₹)', type:'number'},
  {key:'water', label:'Water Charge (₹)', type:'number'},
  {key:'parking', label:'Parking Charge (₹)', type:'number'},
  {key:'other', label:'Other Charge (₹)', type:'number'},
  {key:'previousRentDue', label:'Previous Rent Due (₹)', type:'number'},
  {key:'previousElectricityDue', label:'Previous Electricity Due (₹)', type:'number'},
  {key:'lateFee', label:'Late Fee (₹)', type:'number'},
  {key:'adjustment', label:'Adjustment / Rebate (₹)', type:'number'},
  {key:'amountReceived', label:'Amount Received (₹)', type:'number'},
  {key:'paymentDate', label:'Payment Date', type:'date'},
  {key:'paymentMode', label:'Payment Mode', type:'select', options:PAYMENT_MODES},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

const DEPOSIT_FIELDS = [
  {key:'depositAmount', label:'Deposit Amount (₹)', type:'number', required:true},
  {key:'dateReceived', label:'Date Received', type:'date', required:true},
  {key:'paymentMode', label:'Payment Mode', type:'select', options:PAYMENT_MODES},
  {key:'receiptNumber', label:'Receipt Number', type:'text'},
  {key:'refundableAmount', label:'Refundable Amount (₹)', type:'number'},
  {key:'adjustmentAgainstDues', label:'Adjustment Against Dues (₹)', type:'number'},
  {key:'damageDeduction', label:'Damage Deduction (₹)', type:'number'},
  {key:'otherDeduction', label:'Other Deduction (₹)', type:'number'},
  {key:'refundAmount', label:'Refund Amount (₹)', type:'number'},
  {key:'refundDate', label:'Refund Date', type:'date'},
  {key:'refundStatus', label:'Refund Status', type:'select', options:['Held','Pending Refund','Refunded']},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

const EXPENSE_CATEGORIES = ['Repair','Maintenance','Electrical Work','Plumbing','Cleaning','Security','Tax','Insurance','Legal','Staff Payment','Common Electricity','Water','Lift','Painting','Other'];
const EXPENSE_FIELDS = [
  {key:'date', label:'Date', type:'date', required:true},
  {key:'category', label:'Category', type:'select', options:EXPENSE_CATEGORIES, required:true},
  {key:'description', label:'Description', type:'textarea'},
  {key:'amount', label:'Amount (₹)', type:'number', required:true},
  {key:'paymentMode', label:'Payment Mode', type:'select', options:PAYMENT_MODES},
  {key:'paidTo', label:'Paid To', type:'text'},
  {key:'billNumber', label:'Bill / Voucher Number', type:'text'},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

const COMPLAINT_PRIORITIES = ['Low','Medium','High','Urgent'];
const COMPLAINT_STATUSES = ['Open','In Progress','Completed','Closed'];
const COMPLAINT_FIELDS = [
  {key:'complaintDate', label:'Complaint Date', type:'date', required:true},
  {key:'complaintType', label:'Complaint Type', type:'text'},
  {key:'description', label:'Description', type:'textarea'},
  {key:'priority', label:'Priority', type:'select', options:COMPLAINT_PRIORITIES},
  {key:'assignedTo', label:'Assigned To', type:'text'},
  {key:'estimatedCost', label:'Estimated Cost (₹)', type:'number'},
  {key:'actualCost', label:'Actual Cost (₹)', type:'number'},
  {key:'status', label:'Status', type:'select', options:COMPLAINT_STATUSES},
  {key:'completionDate', label:'Completion Date', type:'date'},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

const AGREEMENT_FIELDS = [
  {key:'startDate', label:'Agreement Start Date', type:'date', required:true},
  {key:'endDate', label:'Agreement End Date', type:'date', required:true},
  {key:'lockInPeriod', label:'Lock-in Period', type:'text'},
  {key:'noticePeriod', label:'Notice Period', type:'text'},
  {key:'rentEscalationDate', label:'Rent Escalation Date', type:'date'},
  {key:'rentEscalationPercent', label:'Rent Escalation Percentage', type:'number'},
  {key:'renewalStatus', label:'Renewal Status', type:'select', options:['Active','Renewed','Expired','Terminated']},
  {key:'remarks', label:'Remarks', type:'textarea'}
];

const SETTINGS_FIELDS = [
  {key:'ownerName', label:'Owner Name', type:'text'},
  {key:'ownerAddress', label:'Owner Address', type:'textarea'},
  {key:'ownerPhone', label:'Owner Phone', type:'text'},
  {key:'ownerEmail', label:'Owner Email', type:'text'},
  {key:'defaultElectricityRate', label:'Default Electricity Rate (₹ per unit)', type:'number'},
  {key:'defaultRentDueDay', label:'Default Rent Due Day', type:'number'},
  {key:'defaultLateFee', label:'Default Late Fee (₹)', type:'number'},
  {key:'receiptPrefix', label:'Receipt Prefix', type:'text'},
  {key:'electricityBillPrefix', label:'Electricity Bill Prefix', type:'text'},
  {key:'dateFormat', label:'Date Format', type:'select', options:['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD']}
];

/* ---------------------------------------------------------------------- */
/* FORM RENDER HELPERS (identical pattern to other modules)               */
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
const state = { view:'dashboard', editingId:null, search:'', moreDefault:'rent', notificationFilter:'all',
  unitPropertyFilter:'all', unitCategoryFilter:'all', unitStatusFilter:'all',
  tenantFilter:'all', reportRange:{from:'', to:''}, reportPropertyFilter:'all' };

const MAIN_NAV = [
  {id:'dashboard', label:'Dashboard', icon:'🏠'},
  {id:'properties', label:'Properties', icon:'🏢'},
  {id:'units', label:'Units', icon:'🚪'},
  {id:'tenants', label:'Tenants', icon:'🧑‍🤝‍🧑'},
  {id:'more', label:'More', icon:'⋯'},
  {id:'settings', label:'Settings', icon:'⚙️'}
];
const MORE_SUBS = [
  {id:'rent', label:'Rent Collection', icon:'💵'},
  {id:'electricity', label:'Electricity', icon:'⚡'},
  {id:'combinedBills', label:'Combined Bills', icon:'🧾'},
  {id:'deposits', label:'Deposits', icon:'🏦'},
  {id:'expenses', label:'Expenses', icon:'💸'},
  {id:'maintenance', label:'Maintenance', icon:'🛠️'},
  {id:'agreements', label:'Agreements', icon:'📜'},
  {id:'occupancyHistory', label:'Occupancy History', icon:'🕐'},
  {id:'reports', label:'Reports', icon:'📊'},
  {id:'notifications', label:'Notifications', icon:'🔔'}
];
const FAMILY_GROUP = {
  properties: ['properties','propertyForm','propertyProfile'],
  units: ['units','unitForm','unitProfile'],
  tenants: ['tenants','tenantForm','tenantProfile'],
  more: ['rent','rentForm','electricity','electricityForm','combinedBills','combinedBillForm',
    'deposits','depositForm','expenses','expenseForm','maintenance','maintenanceForm',
    'agreements','agreementForm','occupancyHistory','reports','notifications']
};
function mainNavActiveId(){
  for(const k in FAMILY_GROUP){ if(FAMILY_GROUP[k].includes(state.view)) return k; }
  return state.view;
}
function goto(view, id){
  state.view = view;
  state.editingId = id||null;
  if(MORE_SUBS.some(s=>s.id===view)) state.moreDefault = view;
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
      if(n==='more') goto(state.moreDefault||'rent');
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

/* ---------------------------------------------------------------------- */
/* DERIVED / COMPUTED HELPERS                                             */
/* ---------------------------------------------------------------------- */
function activeProperties(){ return db.properties.filter(p=>p.status!=='Inactive'); }
function propertyById(id){ return db.properties.find(p=>p.id===id); }
function unitById(id){ return db.units.find(u=>u.id===id); }
function tenantById(id){ return db.tenants.find(t=>t.id===id); }
function unitsForProperty(pid){ return db.units.filter(u=>u.propertyId===pid); }
function currentTenantForUnit(uid_){ return db.tenants.find(t=>t.unitId===uid_ && t.status!=='Vacated' && t.status!=='Former Tenant'); }

// Electricity rate priority: Unit override -> Property override -> Global default.
function effectiveElectricityRate(unit, property){
  if(unit && unit.electricityRateOverride!==undefined && unit.electricityRateOverride!==null && unit.electricityRateOverride!==''){
    return Number(unit.electricityRateOverride);
  }
  if(property && property.electricityRateOverride!==undefined && property.electricityRateOverride!==null && property.electricityRateOverride!==''){
    return Number(property.electricityRateOverride);
  }
  return Number(db.settings.defaultElectricityRate)||12;
}

function propertyStats(pid){
  const units = unitsForProperty(pid);
  const residential = units.filter(u=>u.category==='Residential Flat').length;
  const commercial = units.filter(u=>u.category!=='Residential Flat').length;
  const occupied = units.filter(u=>u.status==='Occupied').length;
  const vacant = units.filter(u=>u.status==='Vacant').length;
  const monthlyRentExpected = units.reduce((s,u)=>s+(Number(u.monthlyRent)||0),0);
  const thisMonth = todayISO().slice(0,7);
  const rentCollected = db.rentPayments.filter(r=>{
    const u = unitById(r.unitId);
    return u && u.propertyId===pid && (r.paymentDate||'').slice(0,7)===thisMonth;
  }).reduce((s,r)=>s+(Number(r.amountReceived)||0),0);
  const electricityOutstanding = db.electricityBills.filter(b=>{
    const u = unitById(b.unitId);
    return u && u.propertyId===pid;
  }).reduce((s,b)=>s+Math.max(0, billBalanceDue(b)),0);
  const rentOutstanding = db.rentPayments.filter(r=>{
    const u = unitById(r.unitId);
    return u && u.propertyId===pid;
  }).reduce((s,r)=>s+Math.max(0, rentBalanceDue(r)),0);
  return {
    totalUnits:units.length, residential, commercial, occupied, vacant,
    monthlyRentExpected, rentCollected, electricityOutstanding,
    totalOutstanding: rentOutstanding + electricityOutstanding
  };
}

function rentTotalPayable(r){
  return (Number(r.rentAmount)||0) + (Number(r.maintenanceAmount)||0) + (Number(r.waterCharge)||0) +
    (Number(r.parkingCharge)||0) + (Number(r.otherCharges)||0) + (Number(r.previousRentDue)||0) +
    (Number(r.lateFee)||0) - (Number(r.adjustment)||0);
}
function rentBalanceDue(r){ return rentTotalPayable(r) - (Number(r.amountReceived)||0); }
function rentStatus(r){
  const bal = rentBalanceDue(r);
  if(bal<=0) return 'Paid';
  if((Number(r.amountReceived)||0)>0) return 'Partly Paid';
  return 'Unpaid';
}

function billUnitsConsumed(b){ return Math.max(0,(Number(b.currReading)||0)-(Number(b.prevReading)||0)); }
function billElectricityCharge(b){ return billUnitsConsumed(b)*(Number(b.ratePerUnit)||0); }
function billTotalPayable(b){
  return billElectricityCharge(b) + (Number(b.previousOutstanding)||0) + (Number(b.lateFee)||0) - (Number(b.adjustment)||0);
}
function billBalanceDue(b){ return billTotalPayable(b) - (Number(b.amountPaid)||0); }
function billStatus(b){
  const bal = billBalanceDue(b);
  if(bal<=0) return 'Paid';
  if((Number(b.amountPaid)||0)>0) return 'Partly Paid';
  return 'Unpaid';
}
// Auto carry-forward: the previous bill's current reading becomes the next
// bill's previous reading for the same unit.
function lastElectricityBillForUnit(unitId, excludeId){
  const list = db.electricityBills.filter(b=>b.unitId===unitId && b.id!==excludeId)
    .slice().sort((a,b)=> (a.currReadingDate||'') < (b.currReadingDate||'') ? 1 : -1);
  return list[0]||null;
}

function combinedTotalPayable(c){
  return (Number(c.rentAmount)||0)+(Number(c.maintenance)||0)+(Number(c.electricity)||0)+(Number(c.water)||0)+
    (Number(c.parking)||0)+(Number(c.other)||0)+(Number(c.previousRentDue)||0)+(Number(c.previousElectricityDue)||0)+
    (Number(c.lateFee)||0)-(Number(c.adjustment)||0);
}
function combinedBalanceDue(c){ return combinedTotalPayable(c)-(Number(c.amountReceived)||0); }

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
  const units = db.units;
  const thisMonth = todayISO().slice(0,7);
  const rentExpected = units.reduce((s,u)=>s+(Number(u.monthlyRent)||0),0);
  const rentCollected = db.rentPayments.filter(r=>(r.paymentDate||'').slice(0,7)===thisMonth).reduce((s,r)=>s+(Number(r.amountReceived)||0),0);
  const elecExpected = db.electricityBills.filter(b=>(b.currReadingDate||'').slice(0,7)===thisMonth).reduce((s,b)=>s+billElectricityCharge(b),0);
  const elecCollected = db.electricityBills.filter(b=>(b.paymentDate||'').slice(0,7)===thisMonth).reduce((s,b)=>s+(Number(b.amountPaid)||0),0);
  const rentOutstanding = db.rentPayments.reduce((s,r)=>s+Math.max(0,rentBalanceDue(r)),0);
  const elecOutstanding = db.electricityBills.reduce((s,b)=>s+Math.max(0,billBalanceDue(b)),0);
  const totalDeposits = db.deposits.reduce((s,d)=>s+(Number(d.depositAmount)||0),0);
  const upcomingExpiry = db.agreements.filter(a=>{
    const d = daysBetween(todayISO(), a.endDate);
    return d!==null && d>=0 && d<=90;
  }).length;
  const cards = [
    {num:db.properties.length, lbl:'Total Properties', icon:'🏢'},
    {num:units.length, lbl:'Total Units', icon:'🚪'},
    {num:units.filter(u=>u.category==='Residential Flat').length, lbl:'Residential Units', icon:'🏠'},
    {num:units.filter(u=>u.category!=='Residential Flat').length, lbl:'Commercial Units', icon:'🏬'},
    {num:units.filter(u=>u.status==='Occupied').length, lbl:'Occupied Units', icon:'✅'},
    {num:units.filter(u=>u.status==='Vacant').length, lbl:'Vacant Units', icon:'🟦'},
    {num:formatCurrency(rentExpected), lbl:'Rent Expected This Month', icon:'💵'},
    {num:formatCurrency(rentCollected), lbl:'Rent Collected This Month', icon:'💰'},
    {num:formatCurrency(elecExpected), lbl:'Electricity Bill Expected', icon:'⚡'},
    {num:formatCurrency(elecCollected), lbl:'Electricity Collected', icon:'🔌'},
    {num:formatCurrency(rentOutstanding+elecOutstanding), lbl:'Total Outstanding', icon:'📌'},
    {num:formatCurrency(totalDeposits), lbl:'Total Security Deposit', icon:'🏦'},
    {num:upcomingExpiry, lbl:'Upcoming Agreement Expiry', icon:'📜'},
    {num:unreadNotificationsCount(), lbl:'Unread Notifications', icon:'🔔'}
  ];
  const cardsHtml = cards.map(c=>`<div class="card"><div class="icon">${c.icon}</div><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('');
  const propCards = db.properties.map(p=>{
    const s = propertyStats(p.id);
    return `<div class="property-card">
      <h3>🏢 ${escapeHtml(p.name)} <button class="btn sm secondary no-print" style="margin-left:auto;" data-action="view-property" data-id="${p.id}">Open</button></h3>
      <div class="prop-stats">
        <div class="prop-stat"><div class="n">${s.totalUnits}</div><div class="l">Total Units</div></div>
        <div class="prop-stat"><div class="n">${s.residential}</div><div class="l">Residential</div></div>
        <div class="prop-stat"><div class="n">${s.commercial}</div><div class="l">Commercial</div></div>
        <div class="prop-stat"><div class="n">${s.occupied}</div><div class="l">Occupied</div></div>
        <div class="prop-stat"><div class="n">${s.vacant}</div><div class="l">Vacant</div></div>
        <div class="prop-stat"><div class="n">${formatCurrency(s.monthlyRentExpected)}</div><div class="l">Monthly Rent Expected</div></div>
        <div class="prop-stat"><div class="n">${formatCurrency(s.rentCollected)}</div><div class="l">Rent Collected</div></div>
        <div class="prop-stat"><div class="n">${formatCurrency(s.electricityOutstanding)}</div><div class="l">Electricity Outstanding</div></div>
        <div class="prop-stat"><div class="n">${formatCurrency(s.totalOutstanding)}</div><div class="l">Total Outstanding</div></div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-note">No properties yet.</div>';
  return `
    <div class="cards-grid">${cardsHtml}</div>
    <div class="quick-actions no-print">
      <button class="btn" data-action="goto" data-view="propertyForm">➕ Add Property</button>
      <button class="btn secondary" data-action="goto" data-view="unitForm">➕ Add Unit</button>
      <button class="btn secondary" data-action="goto" data-view="tenantForm">➕ Add Tenant</button>
      <button class="btn secondary" data-action="goto" data-view="rentForm">➕ Record Rent</button>
      <button class="btn secondary" data-action="goto" data-view="electricityForm">➕ Record Meter Reading / Generate Bill</button>
      <button class="btn secondary" data-action="add-expense">➕ Add Expense</button>
      <button class="btn secondary" data-action="goto" data-view="reports">📌 View Outstanding</button>
      <button class="btn secondary" data-action="global-search">🔍 Global Search</button>
    </div>
    <div class="section-title">🏢 Properties</div>
    ${propCards}
  `;
}

/* ---------------------------------------------------------------------- */
/* PROPERTIES                                                             */
/* ---------------------------------------------------------------------- */
function filteredProperties(){
  const q = (state.search||'').toLowerCase();
  return db.properties.filter(p=>!q || [p.name,p.id,p.address,p.contactPerson].join(' ').toLowerCase().includes(q));
}
function renderProperties(){
  const list = filteredProperties();
  const rows = list.map(p=>{
    const s = propertyStats(p.id);
    return `<tr>
      <td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.type)||'—'}</td>
      <td>${s.totalUnits}</td>
      <td><span class="badge ${p.status==='Active'?'badge-green':'badge-grey'}">${escapeHtml(p.status)||'Active'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-property" data-id="${p.id}">View</button>
        <button class="btn sm secondary" data-action="edit-property" data-id="${p.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-property" data-id="${p.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search properties..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="propertyForm">➕ Add Property</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Units</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="empty-note">No properties yet.</td></tr>'}</tbody></table></div>`;
}
function renderPropertyForm(id){
  const existing = id ? propertyById(id) : null;
  document.getElementById('app').innerHTML = `
    <div class="form-page">
      <div class="form-section"><h3>🏢 Property Details</h3>
        <div class="form-grid">${fieldsToHTML(PROPERTY_FIELDS, existing||{status:'Active'})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="properties">Cancel</button>
        <button class="btn" id="savePropertyBtn">💾 Save Property</button>
      </div>
    </div>`;
  document.getElementById('savePropertyBtn').addEventListener('click',()=>{
    const vals = readFieldsFromForm(PROPERTY_FIELDS, document.getElementById('app'));
    if(!vals.name || !vals.name.trim()){ alert('Property Name is required.'); return; }
    if(existing){ Object.assign(existing, vals); }
    else{ db.properties.push(Object.assign({id:nextId('PROP','property'), createdAt:todayISO()}, vals)); }
    saveDB();
    goto('properties');
  });
}
function renderPropertyProfile(id){
  const p = propertyById(id);
  if(!p) return `<div class="empty-note">Property not found.</div>`;
  const s = propertyStats(p.id);
  const units = unitsForProperty(p.id);
  const unitRows = units.map(u=>`<div class="item-row"><div><div class="title">${escapeHtml(u.unitNumber)} — ${escapeHtml(u.category)||'—'}</div>
    <div class="meta">${escapeHtml(u.status)||'Vacant'} · ${formatCurrency(u.monthlyRent)}</div></div>
    <button class="btn sm secondary" data-action="view-unit" data-id="${u.id}">View</button></div>`).join('') || '<div class="empty-note">No units added for this property yet.</div>';
  return `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(p.name)}</h2>
        <div class="meta-line">${escapeHtml(p.id)} · ${escapeHtml(p.type)||'—'} · ${escapeHtml(p.status)||'Active'}</div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-property" data-id="${p.id}">Edit</button>
        <button class="btn secondary" data-action="goto" data-view="unitForm">➕ Add Unit</button>
        <button class="btn secondary" data-action="print-view">🖨️ Print Summary</button>
        <button class="btn grey" data-action="goto" data-view="properties">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(PROPERTY_FIELDS, p)}</div>
    <div class="cards-grid">
      <div class="card"><div class="icon">🚪</div><div class="num">${s.totalUnits}</div><div class="lbl">Total Units</div></div>
      <div class="card"><div class="icon">✅</div><div class="num">${s.occupied}</div><div class="lbl">Occupied</div></div>
      <div class="card"><div class="icon">🟦</div><div class="num">${s.vacant}</div><div class="lbl">Vacant</div></div>
      <div class="card"><div class="icon">💵</div><div class="num">${formatCurrency(s.monthlyRentExpected)}</div><div class="lbl">Monthly Rent Expected</div></div>
      <div class="card"><div class="icon">💰</div><div class="num">${formatCurrency(s.rentCollected)}</div><div class="lbl">Rent Collected (this month)</div></div>
      <div class="card"><div class="icon">📌</div><div class="num">${formatCurrency(s.totalOutstanding)}</div><div class="lbl">Total Outstanding</div></div>
    </div>
    <div class="section-title">🚪 Units</div>
    <div class="item-list">${unitRows}</div>
  `;
}

/* ---------------------------------------------------------------------- */
/* UNITS                                                                  */
/* ---------------------------------------------------------------------- */
function filteredUnits(){
  const q = (state.search||'').toLowerCase();
  let list = db.units.filter(u=>!q || [u.unitNumber,u.id,u.floor].join(' ').toLowerCase().includes(q));
  if(state.unitPropertyFilter!=='all') list = list.filter(u=>u.propertyId===state.unitPropertyFilter);
  if(state.unitCategoryFilter!=='all') list = list.filter(u=>u.category===state.unitCategoryFilter);
  if(state.unitStatusFilter!=='all') list = list.filter(u=>u.status===state.unitStatusFilter);
  return list;
}
function unitFilterBarHTML(){
  const propOpts = ['<option value="all">All Properties</option>'].concat(db.properties.map(p=>`<option value="${p.id}" ${state.unitPropertyFilter===p.id?'selected':''}>${escapeHtml(p.name)}</option>`)).join('');
  const catOpts = ['<option value="all">All Categories</option>'].concat(UNIT_CATEGORIES.map(c=>`<option value="${c}" ${state.unitCategoryFilter===c?'selected':''}>${c}</option>`)).join('');
  const statusOpts = ['<option value="all">All Status</option>'].concat(UNIT_STATUSES.map(c=>`<option value="${c}" ${state.unitStatusFilter===c?'selected':''}>${c}</option>`)).join('');
  return `<div class="toolbar no-print">
    <select id="unitPropFilter">${propOpts}</select>
    <select id="unitCatFilter">${catOpts}</select>
    <select id="unitStatusFilter">${statusOpts}</select>
  </div>`;
}
function renderUnits(){
  const list = filteredUnits();
  const rows = list.map(u=>{
    const p = propertyById(u.propertyId);
    const tenant = currentTenantForUnit(u.id);
    return `<tr>
      <td>${escapeHtml(u.unitNumber)}</td><td>${escapeHtml(p?p.name:'—')}</td><td>${escapeHtml(u.category)||'—'}</td>
      <td>${formatCurrency(u.monthlyRent)}</td>
      <td><span class="badge ${u.status==='Occupied'?'badge-green':u.status==='Vacant'?'badge-grey':u.status==='Under Maintenance'?'badge-orange':'badge-blue'}">${escapeHtml(u.status)||'Vacant'}</span></td>
      <td>${escapeHtml(tenant?tenant.name:'—')}</td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-unit" data-id="${u.id}">View</button>
        <button class="btn sm secondary" data-action="edit-unit" data-id="${u.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-unit" data-id="${u.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by unit number..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="unitForm">➕ Add Unit</button>
    </div>
    ${unitFilterBarHTML()}
    <div class="table-wrap"><table><thead><tr><th>Unit No.</th><th>Property</th><th>Category</th><th>Rent</th><th>Status</th><th>Tenant</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty-note">No units yet. Add a unit to get started.</td></tr>'}</tbody></table></div>`;
}
function propertySelectHTML(selectedId){
  const opts = activeProperties().map(p=>`<option value="${p.id}" ${selectedId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
  return `<select id="unitPropertySelect">${opts}</select>`;
}
function renderUnitForm(id){
  const existing = id ? unitById(id) : null;
  document.getElementById('app').innerHTML = `
    <div class="form-page">
      <div class="form-section"><h3>🚪 Unit Details</h3>
        <div class="form-grid">
          <div class="form-field"><label>Property *</label>${propertySelectHTML(existing?existing.propertyId:(db.properties[0]&&db.properties[0].id))}</div>
          ${fieldsToHTML(UNIT_FIELDS, existing||{status:'Vacant'})}
        </div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="units">Cancel</button>
        <button class="btn" id="saveUnitBtn">💾 Save Unit</button>
      </div>
    </div>`;
  document.getElementById('saveUnitBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(UNIT_FIELDS, root);
    const propertyId = root.querySelector('#unitPropertySelect').value;
    if(!vals.unitNumber || !vals.unitNumber.trim()){ alert('Unit Number is required.'); return; }
    if(!propertyId){ alert('Please select a Property.'); return; }
    if(existing){ Object.assign(existing, vals, {propertyId}); }
    else{ db.units.push(Object.assign({id:nextId('UNIT','unit'), createdAt:todayISO(), attachments:[]}, vals, {propertyId})); }
    saveDB();
    goto('units');
  });
}
function renderUnitProfile(id){
  const u = unitById(id);
  if(!u) return `<div class="empty-note">Unit not found.</div>`;
  const p = propertyById(u.propertyId);
  const tenant = currentTenantForUnit(u.id);
  const rentHistory = db.rentPayments.filter(r=>r.unitId===u.id).slice().sort((a,b)=>a.paymentDate<b.paymentDate?1:-1);
  const elecHistory = db.electricityBills.filter(b=>b.unitId===u.id).slice().sort((a,b)=>a.currReadingDate<b.currReadingDate?1:-1);
  const ledgerRows = rentHistory.map(r=>`<div class="item-row"><div><div class="title">${r.rentMonth} ${r.rentYear} — Rent</div>
    <div class="meta">${formatCurrency(r.amountReceived)} received · Balance ${formatCurrency(rentBalanceDue(r))} · ${rentStatus(r)}</div></div></div>`).join('') || '<div class="empty-note">No rent records yet.</div>';
  const elecRows = elecHistory.map(b=>`<div class="item-row"><div><div class="title">${b.billingMonth} ${b.billingYear} — Electricity</div>
    <div class="meta">${billUnitsConsumed(b)} units × ₹${b.ratePerUnit} = ${formatCurrency(billElectricityCharge(b))} · Balance ${formatCurrency(billBalanceDue(b))}</div></div></div>`).join('') || '<div class="empty-note">No electricity bills yet.</div>';
  return `
    <div class="profile-header">
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(u.unitNumber)} <span style="font-size:14px;color:var(--muted);">(${escapeHtml(p?p.name:'—')})</span></h2>
        <div class="meta-line">${escapeHtml(u.category)||'—'} · ${escapeHtml(u.status)||'Vacant'} · Tenant: ${escapeHtml(tenant?tenant.name:'—')}</div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-unit" data-id="${u.id}">Edit</button>
        <button class="btn secondary" data-action="print-view">🖨️ Print Details</button>
        <button class="btn grey" data-action="goto" data-view="units">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRows(UNIT_FIELDS, u)}</div>
    <div class="section-title">💵 Rent Ledger</div>
    <div class="item-list">${ledgerRows}</div>
    <div class="section-title">⚡ Electricity Ledger</div>
    <div class="item-list">${elecRows}</div>
  `;
}

/* ---------------------------------------------------------------------- */
/* OCCUPANCY HISTORY HELPERS                                              */
/* ---------------------------------------------------------------------- */
function openOccupancyRecord(tenant, unit){
  db.occupancyHistory.push({
    id:nextId('OCC','occupancy'), tenantId:tenant.id, tenantName:tenant.name,
    propertyId:unit.propertyId, unitId:unit.id,
    startDate: tenant.moveInDate || todayISO(), endDate:'',
    monthlyRent: tenant.monthlyRent||'', securityDeposit: tenant.securityDeposit||'',
    agreementDetails: (tenant.agreementStartDate||'')+' to '+(tenant.agreementEndDate||''),
    reasonForLeaving:'', finalSettlementStatus:'', remarks:''
  });
}
function closeOccupancyRecordForUnit(unitId, tenantId, endDate, reason, settlementStatus){
  const rec = db.occupancyHistory.slice().reverse().find(o=>o.unitId===unitId && o.tenantId===tenantId && !o.endDate);
  if(rec){
    rec.endDate = endDate || todayISO();
    rec.reasonForLeaving = reason||'';
    rec.finalSettlementStatus = settlementStatus||'';
  }
}
function vacateUnit(unit){
  if(!unit) return;
  unit.status = 'Vacant';
  unit.currentTenantId = '';
}
function occupyUnit(unit, tenant){
  unit.status = 'Occupied';
  unit.currentTenantId = tenant.id;
}

/* ---------------------------------------------------------------------- */
/* TENANTS                                                                */
/* ---------------------------------------------------------------------- */
const TENANT_FILTERS = ['all','Active','Notice Given','Vacated','Former Tenant'];
function filteredTenants(){
  const q = (state.search||'').toLowerCase();
  let list = db.tenants.filter(t=>!q || [t.name,t.id,t.mobile].join(' ').toLowerCase().includes(q));
  if(state.tenantFilter && state.tenantFilter!=='all') list = list.filter(t=>t.status===state.tenantFilter);
  return list;
}
function tenantStatusBadgeClass(status){
  if(status==='Active') return 'badge-green';
  if(status==='Notice Given') return 'badge-orange';
  if(status==='Vacated'||status==='Former Tenant') return 'badge-grey';
  return 'badge-blue';
}
function renderTenants(){
  const list = filteredTenants();
  const filterBar = `<div class="subtabs no-print">${TENANT_FILTERS.map(f=>`<button data-action="filter-tenants" data-filter="${f}" class="${(state.tenantFilter||'all')===f?'active':''}">${f==='all'?'All':f}</button>`).join('')}</div>`;
  const rows = list.map(t=>{
    const unit = unitById(t.unitId), prop = unit?propertyById(unit.propertyId):null;
    return `<tr>
      <td>${escapeHtml(t.id)}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.mobile)||'—'}</td>
      <td>${escapeHtml(prop?prop.name:'—')}</td><td>${escapeHtml(unit?unit.unitNumber:'—')}</td>
      <td><span class="badge ${tenantStatusBadgeClass(t.status)}">${escapeHtml(t.status)||'Active'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="view-tenant" data-id="${t.id}">View</button>
        <button class="btn sm secondary" data-action="edit-tenant" data-id="${t.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-tenant" data-id="${t.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search tenants by name or mobile..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="tenantForm">➕ Add Tenant</button>
    </div>
    ${filterBar}
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Property</th><th>Unit</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty-note">No tenants yet.</td></tr>'}</tbody></table></div>`;
}
function vacantUnitsForPropertyOptions(propertyId, includeUnitId){
  const units = db.units.filter(u=>u.propertyId===propertyId && (u.status==='Vacant' || u.id===includeUnitId));
  return units.map(u=>`<option value="${u.id}">${escapeHtml(u.unitNumber)} (${escapeHtml(u.category)||'—'})</option>`).join('');
}
function renderTenantForm(id){
  const existing = id ? tenantById(id) : null;
  const existingUnit = existing ? unitById(existing.unitId) : null;
  const defaultPropId = existingUnit ? existingUnit.propertyId : (db.properties[0]&&db.properties[0].id);
  document.getElementById('app').innerHTML = `
    <div class="form-page">
      <div class="form-section"><h3>🏠 Property &amp; Unit Assignment</h3>
        <div class="form-grid">
          <div class="form-field"><label>Property *</label>${propertySelectHTML(defaultPropId)}</div>
          <div class="form-field"><label>Unit *</label><select id="tenantUnitSelect">${vacantUnitsForPropertyOptions(defaultPropId, existing?existing.unitId:null)}</select></div>
        </div>
      </div>
      <div class="form-section"><h3>🧑 Tenant Details</h3>
        <div class="form-grid">${fieldsToHTML(TENANT_FIELDS, existing||{status:'Active', tenantType:'Residential'})}</div>
      </div>
      <div class="form-section"><h3>📷 Photograph (Optional)</h3>
        <div class="form-field">
          <input type="file" accept="image/*" id="tenantPhotoInput">
          <input type="hidden" id="tenantPhotoValue" value="${escapeHtml(existing?existing.photo:'')}">
          <div style="margin-top:8px;">${existing&&existing.photo?`<img src="${existing.photo}" id="tenantPhotoPreview" style="width:80px;height:80px;border-radius:12px;object-fit:cover;">`:`<img id="tenantPhotoPreview" style="display:none;width:80px;height:80px;border-radius:12px;object-fit:cover;">`}</div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="tenants">Cancel</button>
        <button class="btn" id="saveTenantBtn">💾 Save Tenant</button>
      </div>
    </div>`;
  const propSelect = document.getElementById('unitPropertySelect');
  const unitSelect = document.getElementById('tenantUnitSelect');
  propSelect.addEventListener('change', ()=>{
    unitSelect.innerHTML = vacantUnitsForPropertyOptions(propSelect.value, existing?existing.unitId:null);
  });
  const photoInput = document.getElementById('tenantPhotoInput');
  photoInput.addEventListener('change', async ()=>{
    const file = photoInput.files && photoInput.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const resized = await resizeImageDataURL(raw, 500);
    document.getElementById('tenantPhotoValue').value = resized;
    const prev = document.getElementById('tenantPhotoPreview');
    prev.src = resized; prev.style.display = 'block';
  });
  document.getElementById('saveTenantBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(TENANT_FIELDS, root);
    const newUnitId = unitSelect.value;
    if(!vals.name || !vals.name.trim()){ alert('Full Name is required.'); return; }
    if(!newUnitId){ alert('Please select a vacant unit for this tenant.'); return; }
    const photo = document.getElementById('tenantPhotoValue').value;
    const newUnit = unitById(newUnitId);
    if(existing){
      const oldUnitId = existing.unitId;
      Object.assign(existing, vals, {photo, unitId:newUnitId});
      if(oldUnitId && oldUnitId!==newUnitId){
        const oldUnit = unitById(oldUnitId);
        closeOccupancyRecordForUnit(oldUnitId, existing.id, todayISO(), 'Transferred to another unit', 'Transferred');
        vacateUnit(oldUnit);
        occupyUnit(newUnit, existing);
        openOccupancyRecord(existing, newUnit);
      }
      saveDB();
      goto('tenantProfile', existing.id);
    }else{
      const tenant = Object.assign({id:nextId('TEN','tenant'), createdAt:todayISO(), attachments:[]}, vals, {photo, unitId:newUnitId});
      db.tenants.push(tenant);
      occupyUnit(newUnit, tenant);
      openOccupancyRecord(tenant, newUnit);
      saveDB();
      goto('tenantProfile', tenant.id);
    }
  });
}
function renderTenantProfile(id){
  const t = tenantById(id);
  if(!t) return `<div class="empty-note">Tenant not found.</div>`;
  const unit = unitById(t.unitId), prop = unit?propertyById(unit.propertyId):null;
  const rentHistory = db.rentPayments.filter(r=>r.tenantId===t.id).slice().sort((a,b)=>a.paymentDate<b.paymentDate?1:-1);
  const elecHistory = db.electricityBills.filter(b=>b.tenantId===t.id).slice().sort((a,b)=>a.currReadingDate<b.currReadingDate?1:-1);
  const occHistory = db.occupancyHistory.filter(o=>o.tenantId===t.id).slice().sort((a,b)=>a.startDate<b.startDate?1:-1);
  const rentRows = rentHistory.map(r=>`<div class="item-row"><div><div class="title">${r.rentMonth} ${r.rentYear}</div>
    <div class="meta">${formatCurrency(r.amountReceived)} received · Balance ${formatCurrency(rentBalanceDue(r))} · ${rentStatus(r)}</div></div>
    <button class="btn sm secondary" data-action="print-rent-receipt" data-id="${r.id}">Print</button></div>`).join('') || '<div class="empty-note">No payment history yet.</div>';
  const elecRows = elecHistory.map(b=>`<div class="item-row"><div><div class="title">${b.billingMonth} ${b.billingYear}</div>
    <div class="meta">${formatCurrency(billTotalPayable(b))} payable · Balance ${formatCurrency(billBalanceDue(b))}</div></div>
    <button class="btn sm secondary" data-action="print-electricity-bill" data-id="${b.id}">Print</button></div>`).join('') || '<div class="empty-note">No electricity history yet.</div>';
  const occRows = occHistory.map(o=>`<div class="timeline-card">
    <div class="visit-head"><div class="visit-title">${formatDate(o.startDate)} — ${o.endDate?formatDate(o.endDate):'Present'}</div></div>
    <div>Unit: ${escapeHtml((unitById(o.unitId)||{}).unitNumber)||'—'} · Rent: ${formatCurrency(o.monthlyRent)} · Deposit: ${formatCurrency(o.securityDeposit)}</div>
    ${o.reasonForLeaving?`<div>Reason for leaving: ${escapeHtml(o.reasonForLeaving)}</div>`:''}
    </div>`).join('') || '<div class="empty-note">No occupancy history yet.</div>';
  const canVacate = t.status!=='Vacated' && t.status!=='Former Tenant';
  return `
    <div class="profile-header">
      ${t.photo?`<img class="record-photo" src="${t.photo}">`:`<div class="record-photo record-photo-placeholder">${escapeHtml((t.name||'?')[0])}</div>`}
      <div style="flex:1;min-width:220px;">
        <h2>${escapeHtml(t.name)}</h2>
        <div class="meta-line">${escapeHtml(t.id)} · ${escapeHtml(prop?prop.name:'—')} · Unit ${escapeHtml(unit?unit.unitNumber:'—')} · <span class="badge ${tenantStatusBadgeClass(t.status)}">${escapeHtml(t.status)||'Active'}</span></div>
      </div>
      <div class="profile-actions no-print">
        <button class="btn secondary" data-action="edit-tenant" data-id="${t.id}">Edit</button>
        ${canVacate?`<button class="btn secondary" data-action="vacate-tenant" data-id="${t.id}">🚪 Vacate</button>`:''}
        <button class="btn secondary" data-action="print-view">🖨️ Print Profile</button>
        <button class="btn grey" data-action="goto" data-view="tenants">Back</button>
      </div>
    </div>
    <div class="section-title">Details</div>
    <div class="detail-grid">${detailRowsMasked(TENANT_FIELDS, t, MASKED_TENANT_KEYS)}</div>
    <div class="section-title">💵 Payment History (Rent)</div>
    <div class="item-list">${rentRows}</div>
    <div class="section-title">⚡ Electricity History</div>
    <div class="item-list">${elecRows}</div>
    <div class="section-title">🕐 Occupancy History</div>
    ${occRows}
  `;
}
function vacateTenantFlow(id){
  const t = tenantById(id);
  if(!t) return;
  const reason = prompt('Reason for leaving (optional):','');
  if(reason===null) return;
  if(!confirm('Mark this tenant as Vacated? The unit will become Vacant. Past occupancy history is preserved.')) return;
  const unit = unitById(t.unitId);
  t.status = 'Vacated';
  closeOccupancyRecordForUnit(t.unitId, t.id, todayISO(), reason, 'Settled');
  vacateUnit(unit);
  saveDB();
  goto('tenantProfile', t.id);
}

/* ---------------------------------------------------------------------- */
/* OCCUPANCY HISTORY (aggregate view)                                     */
/* ---------------------------------------------------------------------- */
function renderOccupancyHistory(){
  const q = (state.search||'').toLowerCase();
  const list = db.occupancyHistory.filter(o=>!q || [o.tenantName].join(' ').toLowerCase().includes(q))
    .slice().sort((a,b)=>a.startDate<b.startDate?1:-1);
  const rows = list.map(o=>{
    const unit = unitById(o.unitId), prop = propertyById(o.propertyId);
    return `<tr>
      <td>${escapeHtml(o.tenantName)}</td><td>${escapeHtml(prop?prop.name:'—')}</td><td>${escapeHtml(unit?unit.unitNumber:'—')}</td>
      <td>${formatDate(o.startDate)}</td><td>${o.endDate?formatDate(o.endDate):'Present'}</td>
      <td>${formatCurrency(o.monthlyRent)}</td><td>${escapeHtml(o.reasonForLeaving)||'—'}</td>
    </tr>`;
  }).join('');
  return moreSubtabsHTML('occupancyHistory') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by tenant name..." value="${escapeHtml(state.search)}">
    </div>
    <div class="table-wrap"><table><thead><tr><th>Tenant</th><th>Property</th><th>Unit</th><th>Start</th><th>End</th><th>Monthly Rent</th><th>Reason for Leaving</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty-note">No occupancy history yet.</td></tr>'}</tbody></table></div>`;
}

/* ---------------------------------------------------------------------- */
/* RENT COLLECTION                                                        */
/* ---------------------------------------------------------------------- */
function filteredRentPayments(){
  const q = (state.search||'').toLowerCase();
  return db.rentPayments.filter(r=>{
    const t = tenantById(r.tenantId);
    return !q || [t&&t.name, r.id, r.rentMonth].join(' ').toLowerCase().includes(q);
  }).slice().sort((a,b)=>(a.paymentDate||'')<(b.paymentDate||'')?1:-1);
}
function renderRent(){
  const list = filteredRentPayments();
  const rows = list.map(r=>{
    const t = tenantById(r.tenantId), u = unitById(r.unitId);
    const status = rentStatus(r);
    return `<tr>
      <td>${escapeHtml(r.receiptNumber||r.id)}</td><td>${escapeHtml(t?t.name:'—')}</td><td>${escapeHtml(u?u.unitNumber:'—')}</td>
      <td>${r.rentMonth} ${r.rentYear}</td><td>${formatCurrency(rentTotalPayable(r))}</td><td>${formatCurrency(r.amountReceived)}</td>
      <td><span class="badge ${status==='Paid'?'badge-green':status==='Partly Paid'?'badge-orange':'badge-red'}">${status}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="print-rent-receipt" data-id="${r.id}">Print</button>
        <button class="btn sm secondary" data-action="edit-rent" data-id="${r.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-rent" data-id="${r.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return moreSubtabsHTML('rent') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by tenant or month..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="rentForm">➕ Receive Rent</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Receipt No.</th><th>Tenant</th><th>Unit</th><th>Month</th><th>Payable</th><th>Received</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="empty-note">No rent payments recorded yet.</td></tr>'}</tbody></table></div>`;
}
function occupiedUnitOptionsForTenantSelect(){
  return db.tenants.filter(t=>t.status!=='Vacated'&&t.status!=='Former Tenant').map(t=>{
    const u = unitById(t.unitId);
    return `<option value="${t.id}">${escapeHtml(t.name)} — ${escapeHtml(u?u.unitNumber:'')}</option>`;
  }).join('');
}
function renderRentForm(id){
  const existing = id ? db.rentPayments.find(x=>x.id===id) : null;
  const defaultTenantId = existing ? existing.tenantId : '';
  document.getElementById('app').innerHTML = moreSubtabsHTML('rent') + `
    <div class="form-page">
      <div class="form-section"><h3>🧑 Tenant</h3>
        <div class="form-grid">
          <div class="form-field"><label>Tenant / Unit *</label><select id="rentTenantSelect">${occupiedUnitOptionsForTenantSelect()}</select></div>
        </div>
      </div>
      <div class="form-section"><h3>💵 Rent Details</h3>
        <div class="form-grid">${fieldsToHTML(RENT_FIELDS, existing||{rentMonth:MONTH_NAMES[new Date().getMonth()], rentYear:new Date().getFullYear(), paymentDate:todayISO(), paymentMode:'Cash'})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="rent">Cancel</button>
        <button class="btn" id="saveRentBtn">💾 Save Payment</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  const tenantSelect = document.getElementById('rentTenantSelect');
  if(defaultTenantId) tenantSelect.value = defaultTenantId;
  document.getElementById('saveRentBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(RENT_FIELDS, root);
    const tenantId = tenantSelect.value;
    if(!tenantId){ alert('Please select a tenant.'); return; }
    if(!vals.amountReceived && vals.amountReceived!=='0'){ alert('Amount Received is required.'); return; }
    const tenant = tenantById(tenantId);
    const unitId = tenant.unitId;
    // Prevent accidental duplicate rent entry for same tenant+unit+month.
    const dup = db.rentPayments.find(r=>r.tenantId===tenantId && r.unitId===unitId && r.rentMonth===vals.rentMonth && r.rentYear==vals.rentYear && (!existing || r.id!==existing.id));
    if(dup && !confirm('A rent entry already exists for this tenant, unit and month.\n\nContinue and create another entry anyway?')) return;
    if(existing){
      Object.assign(existing, vals, {tenantId, unitId});
    }else{
      const year = vals.rentYear || new Date().getFullYear();
      const seq = db.rentPayments.filter(r=>String(r.paymentDate||'').slice(0,4)===String(year)).length + 1;
      const receiptNumber = (db.settings.receiptPrefix||'RENT') + '/' + year + '/' + String(seq).padStart(3,'0');
      db.rentPayments.push(Object.assign({id:nextId('RCT','rentPayment'), receiptNumber, tenantId, unitId, createdAt:todayISO()}, vals));
    }
    saveDB();
    goto('rent');
  });
}
function getOrCreatePrintArea(id){
  let el = document.getElementById(id);
  if(!el){
    el = document.createElement('div');
    el.id = id;
    el.className = 'rx-print-area';
    document.body.appendChild(el);
  }
  return el;
}
function printRentReceipt(id){
  const r = db.rentPayments.find(x=>x.id===id);
  if(!r) return;
  const t = tenantById(r.tenantId), u = unitById(r.unitId), p = u?propertyById(u.propertyId):null;
  const s = db.settings;
  getOrCreatePrintArea('printSlipArea').innerHTML = `
    <div class="print-slip">
      <div class="slip-head">
        <h2>${escapeHtml(s.ownerName)||'Rental Manager'}</h2>
        <div>${escapeHtml(s.ownerAddress)||''}</div>
        <div>${s.ownerPhone?('Phone: '+escapeHtml(s.ownerPhone)+' '):''}${s.ownerEmail?('Email: '+escapeHtml(s.ownerEmail)):''}</div>
      </div>
      <div class="slip-row"><span>Receipt No:</span><span>${escapeHtml(r.receiptNumber)||r.id}</span></div>
      <div class="slip-row"><span>Payment Date:</span><span>${formatDate(r.paymentDate)}</span></div>
      <div class="slip-row"><span>Property / Unit:</span><span>${escapeHtml(p?p.name:'—')} / ${escapeHtml(u?u.unitNumber:'—')}</span></div>
      <div class="slip-body">
        Received with thanks from <b>${escapeHtml(t?t.name:'—')}</b> a sum of <b>${formatCurrency(r.amountReceived)}</b> by <b>${escapeHtml(r.paymentMode)}</b>
        towards rent for <b>${escapeHtml(r.rentMonth)} ${escapeHtml(r.rentYear)}</b>.<br><br>
        Rent: ${formatCurrency(r.rentAmount)} · Maintenance: ${formatCurrency(r.maintenanceAmount)} · Water: ${formatCurrency(r.waterCharge)} · Parking: ${formatCurrency(r.parkingCharge)} · Other: ${formatCurrency(r.otherCharges)}<br>
        Previous Due: ${formatCurrency(r.previousRentDue)} · Late Fee: ${formatCurrency(r.lateFee)} · Adjustment: ${formatCurrency(r.adjustment)}<br>
        <b>Total Payable: ${formatCurrency(rentTotalPayable(r))}</b> · Balance Due: <b>${formatCurrency(rentBalanceDue(r))}</b> · Status: <b>${rentStatus(r)}</b>
      </div>
      <div class="slip-sign">Authorised Signatory</div>
    </div>`;
  document.body.classList.add('print-single-rx');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>document.body.classList.remove('print-single-rx'), 300);
  }, 50);
}

/* ---------------------------------------------------------------------- */
/* MANDATORY ELECTRICITY SUB-METER BILLING                               */
/* ---------------------------------------------------------------------- */
function filteredElectricityBills(){
  const q = (state.search||'').toLowerCase();
  return db.electricityBills.filter(b=>{
    const t = tenantById(b.tenantId);
    return !q || [t&&t.name, b.id, b.billNumber, b.subMeterNumber].join(' ').toLowerCase().includes(q);
  }).slice().sort((a,b)=>(a.currReadingDate||'')<(b.currReadingDate||'')?1:-1);
}
function renderElectricity(){
  const list = filteredElectricityBills();
  const rows = list.map(b=>{
    const t = tenantById(b.tenantId), u = unitById(b.unitId);
    const status = billStatus(b);
    return `<tr>
      <td>${escapeHtml(b.billNumber||b.id)}</td><td>${escapeHtml(t?t.name:'—')}</td><td>${escapeHtml(u?u.unitNumber:'—')}</td>
      <td>${b.billingMonth} ${b.billingYear}</td><td>${billUnitsConsumed(b)}</td><td>${formatCurrency(billTotalPayable(b))}</td>
      <td><span class="badge ${status==='Paid'?'badge-green':status==='Partly Paid'?'badge-orange':'badge-red'}">${status}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="print-electricity-bill" data-id="${b.id}">Print</button>
        <button class="btn sm secondary" data-action="edit-electricity" data-id="${b.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-electricity" data-id="${b.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return moreSubtabsHTML('electricity') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by tenant, bill or meter number..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="electricityForm">➕ Generate Electricity Bill</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Bill No.</th><th>Tenant</th><th>Unit</th><th>Month</th><th>Units</th><th>Payable</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="empty-note">No electricity bills yet.</td></tr>'}</tbody></table></div>`;
}
function elecCalcPreviewHTML(prev, curr, rate, prevOutstanding, lateFee, adjustment, amountPaid){
  const units = Math.max(0,(Number(curr)||0)-(Number(prev)||0));
  const charge = units*(Number(rate)||0);
  const totalPayable = charge+(Number(prevOutstanding)||0)+(Number(lateFee)||0)-(Number(adjustment)||0);
  const balance = totalPayable-(Number(amountPaid)||0);
  return `Units Consumed: <b>${units}</b> &nbsp; Charge: <b>${formatCurrency(charge)}</b> &nbsp; Total Payable: <b>${formatCurrency(totalPayable)}</b> &nbsp; Balance Due: <b>${formatCurrency(balance)}</b>`;
}
function renderElectricityForm(id){
  const existing = id ? db.electricityBills.find(x=>x.id===id) : null;
  const defaultTenantId = existing ? existing.tenantId : '';
  let prefill = existing || {billingMonth:MONTH_NAMES[new Date().getMonth()], billingYear:new Date().getFullYear(), paymentMode:'Cash'};
  document.getElementById('app').innerHTML = moreSubtabsHTML('electricity') + `
    <div class="form-page">
      <div class="form-section"><h3>🧑 Tenant / Unit</h3>
        <div class="form-grid">
          <div class="form-field"><label>Tenant / Unit *</label><select id="elecTenantSelect">${occupiedUnitOptionsForTenantSelect()}</select></div>
        </div>
      </div>
      <div class="form-section"><h3>⚡ Meter Reading &amp; Billing</h3>
        <div class="form-grid">${fieldsToHTML(ELECTRICITY_FIELDS, prefill)}</div>
        <div id="elecCalcPreview" style="margin-top:10px;font-size:13.5px;background:var(--light-blue);padding:10px;border-radius:10px;">${elecCalcPreviewHTML(prefill.prevReading,prefill.currReading,prefill.ratePerUnit,prefill.previousOutstanding,prefill.lateFee,prefill.amountPaid)}</div>
      </div>
      ${existing?`<div class="form-section"><h3>✏️ Correction Note (required when editing a saved bill)</h3>
        <div class="form-field full"><textarea id="correctionNote" placeholder="Explain why this saved bill is being corrected..."></textarea></div>
      </div>`:''}
      <div class="form-section"><h3>📷 Meter Photograph (Optional)</h3>
        <div class="form-field">
          <input type="file" accept="image/*" id="meterPhotoInput">
          <input type="hidden" id="meterPhotoValue" value="${escapeHtml(existing?existing.meterPhoto:'')}">
          <div style="margin-top:8px;">${existing&&existing.meterPhoto?`<img src="${existing.meterPhoto}" id="meterPhotoPreview" style="width:80px;height:80px;border-radius:12px;object-fit:cover;">`:`<img id="meterPhotoPreview" style="display:none;width:80px;height:80px;border-radius:12px;object-fit:cover;">`}</div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="electricity">Cancel</button>
        <button class="btn" id="saveElecBtn">💾 Save Bill</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  const tenantSelect = document.getElementById('elecTenantSelect');
  if(defaultTenantId) tenantSelect.value = defaultTenantId;
  function refreshCarryForward(){
    if(existing) return; // never overwrite data of a bill being edited
    const tenantId = tenantSelect.value;
    const tenant = tenantById(tenantId);
    if(!tenant) return;
    const unit = unitById(tenant.unitId);
    const last = lastElectricityBillForUnit(tenant.unitId);
    const prevReadingEl = document.getElementById('f_prevReading');
    const prevReadingDateEl = document.getElementById('f_prevReadingDate');
    const rateEl = document.getElementById('f_ratePerUnit');
    const prevOutstandingEl = document.getElementById('f_previousOutstanding');
    const subMeterEl = document.getElementById('f_subMeterNumber');
    if(last){
      prevReadingEl.value = last.currReading;
      prevReadingDateEl.value = last.currReadingDate;
      prevOutstandingEl.value = Math.max(0, billBalanceDue(last));
    }
    const prop = unit?propertyById(unit.propertyId):null;
    rateEl.value = effectiveElectricityRate(unit, prop);
    if(unit && unit.electricitySubMeterNumber) subMeterEl.value = unit.electricitySubMeterNumber;
    recalcPreview();
  }
  function recalcPreview(){
    const g = (k)=>{ const el=document.getElementById('f_'+k); return el?el.value:''; };
    document.getElementById('elecCalcPreview').innerHTML = elecCalcPreviewHTML(g('prevReading'),g('currReading'),g('ratePerUnit'),g('previousOutstanding'),g('lateFee'),g('amountPaid'));
  }
  tenantSelect.addEventListener('change', refreshCarryForward);
  if(!existing) refreshCarryForward();
  ['prevReading','currReading','ratePerUnit','previousOutstanding','lateFee','adjustment','amountPaid'].forEach(k=>{
    const el = document.getElementById('f_'+k);
    if(el) el.addEventListener('input', recalcPreview);
  });
  const photoInput = document.getElementById('meterPhotoInput');
  photoInput.addEventListener('change', async ()=>{
    const file = photoInput.files && photoInput.files[0];
    if(!file) return;
    const raw = await readFileAsDataURL(file);
    const resized = await resizeImageDataURL(raw, 700);
    document.getElementById('meterPhotoValue').value = resized;
    const prev = document.getElementById('meterPhotoPreview');
    prev.src = resized; prev.style.display = 'block';
  });
  document.getElementById('saveElecBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(ELECTRICITY_FIELDS, root);
    const tenantId = tenantSelect.value;
    if(!tenantId){ alert('Please select a tenant.'); return; }
    if(!vals.prevReadingDate || !vals.currReadingDate){ alert('Both meter reading dates are mandatory.'); return; }
    if(vals.currReadingDate < vals.prevReadingDate){ alert('Current reading date cannot be earlier than previous reading date.'); return; }
    if(Number(vals.currReading) < Number(vals.prevReading)){ alert('Current reading cannot be lower than the previous reading.'); return; }
    if(!(Number(vals.ratePerUnit) > 0)){ alert('Rate per unit must be greater than zero.'); return; }
    if(existing){
      const noteEl = document.getElementById('correctionNote');
      if(!noteEl.value || !noteEl.value.trim()){ alert('A correction note is required when editing a saved electricity bill.'); return; }
    }
    const tenant = tenantById(tenantId);
    const unitId = tenant.unitId;
    const dup = db.electricityBills.find(b=>b.unitId===unitId && b.billingMonth===vals.billingMonth && b.billingYear==vals.billingYear && (!existing || b.id!==existing.id));
    if(dup && !confirm('A bill already exists for this unit and billing month.\n\nContinue and create another bill anyway?')) return;
    const meterPhoto = document.getElementById('meterPhotoValue').value;
    if(existing){
      const noteEl = document.getElementById('correctionNote');
      existing.correctionNotes = existing.correctionNotes||[];
      existing.correctionNotes.push({date:todayISO(), note:noteEl.value});
      Object.assign(existing, vals, {tenantId, unitId, meterPhoto});
    }else{
      const year = vals.billingYear || new Date().getFullYear();
      const seq = db.electricityBills.filter(b=>String(b.billingYear)===String(year)).length + 1;
      const billNumber = (db.settings.electricityBillPrefix||'ELEC') + '/' + year + '/' + String(seq).padStart(3,'0');
      db.electricityBills.push(Object.assign({id:nextId('ELEC','electricityBill'), billNumber, tenantId, unitId, meterPhoto, attachments:[], createdAt:todayISO()}, vals));
    }
    saveDB();
    goto('electricity');
  });
}
function printElectricityBill(id){
  const b = db.electricityBills.find(x=>x.id===id);
  if(!b) return;
  const t = tenantById(b.tenantId), u = unitById(b.unitId), p = u?propertyById(u.propertyId):null;
  const s = db.settings;
  getOrCreatePrintArea('billPrintArea').innerHTML = `
    <div class="print-slip">
      <div class="slip-head">
        <h2>${escapeHtml(s.ownerName)||'Rental Manager'}</h2>
        <div>${escapeHtml(s.ownerAddress)||''}</div>
      </div>
      <div class="slip-row"><span>Electricity Bill No:</span><span>${escapeHtml(b.billNumber)||b.id}</span></div>
      <div class="slip-row"><span>Billing Month:</span><span>${b.billingMonth} ${b.billingYear}</span></div>
      <div class="slip-row"><span>Property / Unit:</span><span>${escapeHtml(p?p.name:'—')} / ${escapeHtml(u?u.unitNumber:'—')}</span></div>
      <div class="slip-row"><span>Tenant:</span><span>${escapeHtml(t?t.name:'—')}</span></div>
      <div class="slip-row"><span>Sub-meter No:</span><span>${escapeHtml(b.subMeterNumber)||'—'}</span></div>
      <div class="slip-body">
        Previous Reading: ${b.prevReading} (${formatDate(b.prevReadingDate)}) &nbsp; Current Reading: ${b.currReading} (${formatDate(b.currReadingDate)})<br>
        Units Consumed: <b>${billUnitsConsumed(b)}</b> × Rate ₹${b.ratePerUnit}/unit = <b>${formatCurrency(billElectricityCharge(b))}</b><br>
        Previous Outstanding: ${formatCurrency(b.previousOutstanding)} · Late Fee: ${formatCurrency(b.lateFee)} · Adjustment: ${formatCurrency(b.adjustment)}<br><br>
        <b>Total Payable: ${formatCurrency(billTotalPayable(b))}</b><br>
        Amount Paid: ${formatCurrency(b.amountPaid)} · <b>Balance Due: ${formatCurrency(billBalanceDue(b))}</b> · Status: <b>${billStatus(b)}</b>
      </div>
      <div class="slip-sign">Authorised Signatory</div>
    </div>`;
  document.body.classList.add('print-single-rx');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>document.body.classList.remove('print-single-rx'), 300);
  }, 50);
}

/* ---------------------------------------------------------------------- */
/* COMBINED MONTHLY BILL                                                  */
/* ---------------------------------------------------------------------- */
function filteredCombinedBills(){
  const q = (state.search||'').toLowerCase();
  return db.combinedBills.filter(c=>{
    const t = tenantById(c.tenantId);
    return !q || [t&&t.name, c.id].join(' ').toLowerCase().includes(q);
  }).slice().sort((a,b)=>(a.createdAt||'')<(b.createdAt||'')?1:-1);
}
function renderCombinedBills(){
  const list = filteredCombinedBills();
  const rows = list.map(c=>{
    const t = tenantById(c.tenantId), u = unitById(c.unitId);
    const bal = combinedBalanceDue(c);
    const status = bal<=0?'Paid':((Number(c.amountReceived)||0)>0?'Partly Paid':'Unpaid');
    return `<tr>
      <td>${escapeHtml(c.id)}</td><td>${escapeHtml(t?t.name:'—')}</td><td>${escapeHtml(u?u.unitNumber:'—')}</td>
      <td>${c.month} ${c.year}</td><td>${formatCurrency(combinedTotalPayable(c))}</td><td>${formatCurrency(c.amountReceived)}</td>
      <td><span class="badge ${status==='Paid'?'badge-green':status==='Partly Paid'?'badge-orange':'badge-red'}">${status}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="print-combined-bill" data-id="${c.id}">Print</button>
        <button class="btn sm secondary" data-action="edit-combined-bill" data-id="${c.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-combined-bill" data-id="${c.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return moreSubtabsHTML('combinedBills') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by tenant..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="combinedBillForm">➕ Generate Combined Bill</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Tenant</th><th>Unit</th><th>Month</th><th>Payable</th><th>Received</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="empty-note">No combined bills generated yet.</td></tr>'}</tbody></table></div>`;
}
function renderCombinedBillForm(id){
  const existing = id ? db.combinedBills.find(x=>x.id===id) : null;
  const defaultTenantId = existing ? existing.tenantId : '';
  document.getElementById('app').innerHTML = moreSubtabsHTML('combinedBills') + `
    <div class="form-page">
      <div class="form-section"><h3>🧑 Tenant / Unit</h3>
        <div class="form-grid">
          <div class="form-field"><label>Tenant / Unit *</label><select id="cmbTenantSelect">${occupiedUnitOptionsForTenantSelect()}</select></div>
        </div>
      </div>
      <div class="form-section"><h3>🧾 Combined Bill Lines</h3>
        <div class="form-grid">${fieldsToHTML(COMBINED_BILL_FIELDS, existing||{month:MONTH_NAMES[new Date().getMonth()], year:new Date().getFullYear(), paymentMode:'Cash'})}</div>
      </div>
      <div class="form-section"><h3>💳 Payment Allocation (optional — split Amount Received across charge types)</h3>
        <div class="form-grid">
          <div class="form-field"><label>Allocated to Rent (₹)</label><input id="allocRent" type="number" value="${existing&&existing.allocation?existing.allocation.rent:''}"></div>
          <div class="form-field"><label>Allocated to Electricity (₹)</label><input id="allocElectricity" type="number" value="${existing&&existing.allocation?existing.allocation.electricity:''}"></div>
          <div class="form-field"><label>Allocated to Maintenance (₹)</label><input id="allocMaintenance" type="number" value="${existing&&existing.allocation?existing.allocation.maintenance:''}"></div>
          <div class="form-field"><label>Allocated to Other (₹)</label><input id="allocOther" type="number" value="${existing&&existing.allocation?existing.allocation.other:''}"></div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="combinedBills">Cancel</button>
        <button class="btn" id="saveCombinedBtn">💾 Save Combined Bill</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  const tenantSelect = document.getElementById('cmbTenantSelect');
  if(defaultTenantId) tenantSelect.value = defaultTenantId;
  function autofillFromLedger(){
    if(existing) return;
    const tenantId = tenantSelect.value;
    const tenant = tenantById(tenantId);
    if(!tenant) return;
    const unit = unitById(tenant.unitId);
    if(unit){
      const rentEl = document.getElementById('f_rentAmount');
      const maintEl = document.getElementById('f_maintenance');
      const waterEl = document.getElementById('f_water');
      const parkEl = document.getElementById('f_parking');
      const otherEl = document.getElementById('f_other');
      if(rentEl && !rentEl.value) rentEl.value = unit.monthlyRent||'';
      if(maintEl && !maintEl.value) maintEl.value = unit.maintenanceCharge||'';
      if(waterEl && !waterEl.value) waterEl.value = unit.waterCharge||'';
      if(parkEl && !parkEl.value) parkEl.value = unit.parkingCharge||'';
      if(otherEl && !otherEl.value) otherEl.value = unit.otherMonthlyCharge||'';
    }
    const lastElec = lastElectricityBillForUnit(tenant.unitId);
    const elecEl = document.getElementById('f_electricity');
    if(elecEl && !elecEl.value && lastElec) elecEl.value = billElectricityCharge(lastElec);
  }
  tenantSelect.addEventListener('change', autofillFromLedger);
  if(!existing) autofillFromLedger();
  document.getElementById('saveCombinedBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(COMBINED_BILL_FIELDS, root);
    const tenantId = tenantSelect.value;
    if(!tenantId){ alert('Please select a tenant.'); return; }
    const tenant = tenantById(tenantId);
    const unitId = tenant.unitId;
    const allocation = {
      rent:Number(document.getElementById('allocRent').value)||0,
      electricity:Number(document.getElementById('allocElectricity').value)||0,
      maintenance:Number(document.getElementById('allocMaintenance').value)||0,
      other:Number(document.getElementById('allocOther').value)||0
    };
    const allocSum = allocation.rent+allocation.electricity+allocation.maintenance+allocation.other;
    if(allocSum>0 && Math.abs(allocSum-(Number(vals.amountReceived)||0))>0.5){
      if(!confirm('The payment allocation total ('+formatCurrency(allocSum)+') does not match Amount Received ('+formatCurrency(vals.amountReceived)+').\n\nSave anyway?')) return;
    }
    if(existing){
      Object.assign(existing, vals, {tenantId, unitId, allocation});
    }else{
      db.combinedBills.push(Object.assign({id:nextId('CMB','combinedBill'), tenantId, unitId, allocation, createdAt:todayISO()}, vals));
    }
    saveDB();
    goto('combinedBills');
  });
}
function printCombinedBill(id){
  const c = db.combinedBills.find(x=>x.id===id);
  if(!c) return;
  const t = tenantById(c.tenantId), u = unitById(c.unitId), p = u?propertyById(u.propertyId):null;
  const s = db.settings;
  getOrCreatePrintArea('combinedPrintArea').innerHTML = `
    <div class="print-slip">
      <div class="slip-head">
        <h2>${escapeHtml(s.ownerName)||'Rental Manager'}</h2>
        <div>${escapeHtml(s.ownerAddress)||''}</div>
      </div>
      <div class="slip-row"><span>Combined Bill No:</span><span>${escapeHtml(c.id)}</span></div>
      <div class="slip-row"><span>Month:</span><span>${c.month} ${c.year}</span></div>
      <div class="slip-row"><span>Property / Unit:</span><span>${escapeHtml(p?p.name:'—')} / ${escapeHtml(u?u.unitNumber:'—')}</span></div>
      <div class="slip-row"><span>Tenant:</span><span>${escapeHtml(t?t.name:'—')}</span></div>
      <div class="slip-body">
        Rent: ${formatCurrency(c.rentAmount)}<br>Maintenance: ${formatCurrency(c.maintenance)}<br>Electricity: ${formatCurrency(c.electricity)}<br>
        Water: ${formatCurrency(c.water)}<br>Parking: ${formatCurrency(c.parking)}<br>Other: ${formatCurrency(c.other)}<br>
        Previous Rent Due: ${formatCurrency(c.previousRentDue)}<br>Previous Electricity Due: ${formatCurrency(c.previousElectricityDue)}<br>
        Late Fee: ${formatCurrency(c.lateFee)}<br>Adjustment: ${formatCurrency(c.adjustment)}<br><br>
        <b>Total Payable: ${formatCurrency(combinedTotalPayable(c))}</b><br>
        Amount Received: ${formatCurrency(c.amountReceived)} · <b>Balance Due: ${formatCurrency(combinedBalanceDue(c))}</b>
      </div>
      <div class="slip-sign">Authorised Signatory</div>
    </div>`;
  document.body.classList.add('print-single-rx');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>document.body.classList.remove('print-single-rx'), 300);
  }, 50);
}

/* ---------------------------------------------------------------------- */
/* SECURITY DEPOSITS                                                      */
/* ---------------------------------------------------------------------- */
function renderDeposits(){
  const q = (state.search||'').toLowerCase();
  const list = db.deposits.filter(d=>{
    const t = tenantById(d.tenantId);
    return !q || [t&&t.name, d.id].join(' ').toLowerCase().includes(q);
  }).slice().sort((a,b)=>(a.dateReceived||'')<(b.dateReceived||'')?1:-1);
  const held = db.deposits.filter(d=>d.refundStatus!=='Refunded').reduce((s,d)=>s+(Number(d.depositAmount)||0),0);
  const pendingRefund = db.deposits.filter(d=>d.refundStatus==='Pending Refund').length;
  const completedRefund = db.deposits.filter(d=>d.refundStatus==='Refunded').length;
  const summary = `<div class="cards-grid">
    <div class="card"><div class="icon">🏦</div><div class="num">${formatCurrency(held)}</div><div class="lbl">Total Security Deposit Held</div></div>
    <div class="card"><div class="icon">⏳</div><div class="num">${pendingRefund}</div><div class="lbl">Pending Refunds</div></div>
    <div class="card"><div class="icon">✅</div><div class="num">${completedRefund}</div><div class="lbl">Completed Refunds</div></div>
  </div>`;
  const rows = list.map(d=>{
    const t = tenantById(d.tenantId), u = unitById(d.unitId);
    return `<tr>
      <td>${escapeHtml(d.id)}</td><td>${escapeHtml(t?t.name:'—')}</td><td>${escapeHtml(u?u.unitNumber:'—')}</td>
      <td>${formatCurrency(d.depositAmount)}</td><td>${formatDate(d.dateReceived)}</td>
      <td><span class="badge ${d.refundStatus==='Refunded'?'badge-green':d.refundStatus==='Pending Refund'?'badge-orange':'badge-grey'}">${escapeHtml(d.refundStatus)||'Held'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="edit-deposit" data-id="${d.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-deposit" data-id="${d.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return moreSubtabsHTML('deposits') + summary + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by tenant..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="depositForm">➕ Add Deposit</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Tenant</th><th>Unit</th><th>Amount</th><th>Date Received</th><th>Refund Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty-note">No security deposits recorded yet.</td></tr>'}</tbody></table></div>`;
}
function renderDepositForm(id){
  const existing = id ? db.deposits.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = moreSubtabsHTML('deposits') + `
    <div class="form-page">
      <div class="form-section"><h3>🧑 Tenant / Unit</h3>
        <div class="form-grid">
          <div class="form-field"><label>Tenant / Unit *</label><select id="depTenantSelect">${occupiedUnitOptionsForTenantSelect()}</select></div>
        </div>
      </div>
      <div class="form-section"><h3>🏦 Deposit Details</h3>
        <div class="form-grid">${fieldsToHTML(DEPOSIT_FIELDS, existing||{dateReceived:todayISO(), paymentMode:'Cash', refundStatus:'Held'})}</div>
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="deposits">Cancel</button>
        <button class="btn" id="saveDepositBtn">💾 Save Deposit</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  const tenantSelect = document.getElementById('depTenantSelect');
  if(existing) tenantSelect.value = existing.tenantId;
  document.getElementById('saveDepositBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(DEPOSIT_FIELDS, root);
    const tenantId = tenantSelect.value;
    if(!tenantId){ alert('Please select a tenant.'); return; }
    if(!vals.depositAmount){ alert('Deposit Amount is required.'); return; }
    const tenant = tenantById(tenantId);
    const unitId = tenant.unitId;
    if(existing){ Object.assign(existing, vals, {tenantId, unitId}); }
    else{ db.deposits.push(Object.assign({id:nextId('DEP','deposit'), tenantId, unitId, createdAt:todayISO()}, vals)); }
    saveDB();
    goto('deposits');
  });
}

/* ---------------------------------------------------------------------- */
/* EXPENSES                                                               */
/* ---------------------------------------------------------------------- */
function renderExpenses(){
  const q = (state.search||'').toLowerCase();
  const list = db.expenses.filter(e=>!q || [e.category,e.description,e.paidTo,e.id].join(' ').toLowerCase().includes(q))
    .slice().sort((a,b)=>(a.date||'')<(b.date||'')?1:-1);
  const rows = list.map(e=>{
    const p = propertyById(e.propertyId);
    return `<tr>
      <td>${escapeHtml(e.id)}</td><td>${formatDate(e.date)}</td><td>${escapeHtml(p?p.name:'—')}</td>
      <td>${escapeHtml(e.category)}</td><td>${formatCurrency(e.amount)}</td><td>${escapeHtml(e.paidTo)||'—'}</td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="edit-expense" data-id="${e.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-expense" data-id="${e.id}">Delete</button>
      </td></tr>`;
  }).join('');
  const total = list.reduce((s,e)=>s+(Number(e.amount)||0),0);
  return moreSubtabsHTML('expenses') + `
    <div class="cards-grid"><div class="card"><div class="icon">💸</div><div class="num">${formatCurrency(total)}</div><div class="lbl">Total Expenses (filtered)</div></div></div>
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search expenses..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="expenseForm">➕ Add Expense</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Property</th><th>Category</th><th>Amount</th><th>Paid To</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty-note">No expenses recorded yet.</td></tr>'}</tbody></table></div>`;
}
function renderExpenseForm(id){
  const existing = id ? db.expenses.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = moreSubtabsHTML('expenses') + `
    <div class="form-page">
      <div class="form-section"><h3>🏢 Property</h3>
        <div class="form-grid">
          <div class="form-field"><label>Property *</label>${propertySelectHTML(existing?existing.propertyId:(db.properties[0]&&db.properties[0].id))}</div>
        </div>
      </div>
      <div class="form-section"><h3>💸 Expense Details</h3>
        <div class="form-grid">${fieldsToHTML(EXPENSE_FIELDS, existing||{date:todayISO(), paymentMode:'Cash'})}</div>
      </div>
      <div class="form-section"><h3>📎 Attachment (Optional)</h3>
        ${attachmentsSectionHTML('expense', existing||{id:'', attachments:[]})}
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="expenses">Cancel</button>
        <button class="btn" id="saveExpenseBtn">💾 Save Expense</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  document.getElementById('saveExpenseBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(EXPENSE_FIELDS, root);
    const propertyId = root.querySelector('#unitPropertySelect').value;
    if(!vals.amount){ alert('Amount is required.'); return; }
    if(existing){ Object.assign(existing, vals, {propertyId}); saveDB(); goto('expenses'); }
    else{ db.expenses.push(Object.assign({id:nextId('EXP','expense'), propertyId, attachments:[], createdAt:todayISO()}, vals)); saveDB(); goto('expenses'); }
  });
}
function openExpenseQuickModal(){
  goto('expenseForm');
}

/* ---------------------------------------------------------------------- */
/* MAINTENANCE / COMPLAINTS                                               */
/* ---------------------------------------------------------------------- */
function renderMaintenance(){
  const q = (state.search||'').toLowerCase();
  const list = db.complaints.filter(c=>!q || [c.complaintType,c.description,c.id].join(' ').toLowerCase().includes(q))
    .slice().sort((a,b)=>(a.complaintDate||'')<(b.complaintDate||'')?1:-1);
  const rows = list.map(c=>{
    const t = tenantById(c.tenantId), u = unitById(c.unitId);
    return `<tr>
      <td>${escapeHtml(c.id)}</td><td>${formatDate(c.complaintDate)}</td><td>${escapeHtml(u?u.unitNumber:'—')}</td>
      <td>${escapeHtml(t?t.name:'—')}</td><td>${escapeHtml(c.complaintType)||'—'}</td>
      <td><span class="badge ${c.priority==='Urgent'?'badge-red':c.priority==='High'?'badge-orange':'badge-blue'}">${escapeHtml(c.priority)||'Low'}</span></td>
      <td><span class="badge ${c.status==='Completed'||c.status==='Closed'?'badge-green':'badge-grey'}">${escapeHtml(c.status)||'Open'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="edit-maintenance" data-id="${c.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-maintenance" data-id="${c.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return moreSubtabsHTML('maintenance') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search complaints..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="maintenanceForm">➕ Add Complaint</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Unit</th><th>Tenant</th><th>Type</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="empty-note">No maintenance complaints yet.</td></tr>'}</tbody></table></div>`;
}
function allTenantUnitOptionsHTML(selectedTenantId){
  return db.tenants.map(t=>{
    const u = unitById(t.unitId);
    return `<option value="${t.id}" ${selectedTenantId===t.id?'selected':''}>${escapeHtml(t.name)} — ${escapeHtml(u?u.unitNumber:'')}</option>`;
  }).join('');
}
function renderMaintenanceForm(id){
  const existing = id ? db.complaints.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = moreSubtabsHTML('maintenance') + `
    <div class="form-page">
      <div class="form-section"><h3>🧑 Tenant / Unit (Optional)</h3>
        <div class="form-grid">
          <div class="form-field"><label>Tenant / Unit</label><select id="cmpTenantSelect"><option value="">— Not linked to a tenant —</option>${allTenantUnitOptionsHTML(existing?existing.tenantId:'')}</select></div>
        </div>
      </div>
      <div class="form-section"><h3>🛠️ Complaint Details</h3>
        <div class="form-grid">${fieldsToHTML(COMPLAINT_FIELDS, existing||{complaintDate:todayISO(), priority:'Medium', status:'Open'})}</div>
      </div>
      <div class="form-section"><h3>📷 Photograph (Optional)</h3>
        ${attachmentsSectionHTML('complaint', existing||{id:'', attachments:[]})}
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="maintenance">Cancel</button>
        <button class="btn" id="saveMaintenanceBtn">💾 Save Complaint</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  document.getElementById('saveMaintenanceBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(COMPLAINT_FIELDS, root);
    const tenantId = document.getElementById('cmpTenantSelect').value;
    const tenant = tenantId ? tenantById(tenantId) : null;
    const unitId = tenant ? tenant.unitId : '';
    const propertyId = unitId ? (unitById(unitId)||{}).propertyId : '';
    if(existing){ Object.assign(existing, vals, {tenantId, unitId, propertyId}); }
    else{ db.complaints.push(Object.assign({id:nextId('CMP','complaint'), tenantId, unitId, propertyId, attachments:[], createdAt:todayISO()}, vals)); }
    saveDB();
    goto('maintenance');
  });
}

/* ---------------------------------------------------------------------- */
/* AGREEMENT MANAGEMENT                                                   */
/* ---------------------------------------------------------------------- */
function renderAgreements(){
  const q = (state.search||'').toLowerCase();
  const list = db.agreements.filter(a=>{
    const t = tenantById(a.tenantId);
    return !q || [t&&t.name, a.id].join(' ').toLowerCase().includes(q);
  }).slice().sort((a,b)=>(a.endDate||'')<(b.endDate||'')?1:-1);
  const rows = list.map(a=>{
    const t = tenantById(a.tenantId), u = unitById(a.unitId);
    const d = daysBetween(todayISO(), a.endDate);
    const expiring = d!==null && d<=90 && d>=0;
    return `<tr class="${expiring?'row-orange':''}">
      <td>${escapeHtml(a.id)}</td><td>${escapeHtml(t?t.name:'—')}</td><td>${escapeHtml(u?u.unitNumber:'—')}</td>
      <td>${formatDate(a.startDate)}</td><td>${formatDate(a.endDate)}</td>
      <td><span class="badge ${a.renewalStatus==='Active'?'badge-green':a.renewalStatus==='Expired'?'badge-red':'badge-blue'}">${escapeHtml(a.renewalStatus)||'Active'}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="edit-agreement" data-id="${a.id}">Edit</button>
        <button class="btn sm danger" data-action="delete-agreement" data-id="${a.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return moreSubtabsHTML('agreements') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by tenant..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn" data-action="goto" data-view="agreementForm">➕ Add Agreement</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Tenant</th><th>Unit</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty-note">No agreements recorded yet.</td></tr>'}</tbody></table></div>`;
}
function renderAgreementForm(id){
  const existing = id ? db.agreements.find(x=>x.id===id) : null;
  document.getElementById('app').innerHTML = moreSubtabsHTML('agreements') + `
    <div class="form-page">
      <div class="form-section"><h3>🧑 Tenant / Unit</h3>
        <div class="form-grid">
          <div class="form-field"><label>Tenant / Unit *</label><select id="agrTenantSelect">${occupiedUnitOptionsForTenantSelect()}</select></div>
        </div>
      </div>
      <div class="form-section"><h3>📜 Agreement Details</h3>
        <div class="form-grid">${fieldsToHTML(AGREEMENT_FIELDS, existing||{renewalStatus:'Active'})}</div>
      </div>
      <div class="form-section"><h3>📎 Document Attachment (Optional)</h3>
        ${attachmentsSectionHTML('agreement', existing||{id:'', attachments:[]})}
      </div>
      <div class="form-actions">
        <button class="btn grey" data-action="goto" data-view="agreements">Cancel</button>
        <button class="btn" id="saveAgreementBtn">💾 Save Agreement</button>
      </div>
    </div>`;
  attachMoreSubtabHandlers();
  const tenantSelect = document.getElementById('agrTenantSelect');
  if(existing) tenantSelect.value = existing.tenantId;
  document.getElementById('saveAgreementBtn').addEventListener('click',()=>{
    const root = document.getElementById('app');
    const vals = readFieldsFromForm(AGREEMENT_FIELDS, root);
    const tenantId = tenantSelect.value;
    if(!tenantId){ alert('Please select a tenant.'); return; }
    if(!vals.startDate || !vals.endDate){ alert('Agreement Start and End Date are required.'); return; }
    const tenant = tenantById(tenantId);
    const unitId = tenant.unitId;
    if(existing){ Object.assign(existing, vals, {tenantId, unitId}); }
    else{ db.agreements.push(Object.assign({id:nextId('AGR','agreement'), tenantId, unitId, attachments:[], createdAt:todayISO()}, vals)); }
    saveDB();
    goto('agreements');
  });
}

/* ---------------------------------------------------------------------- */
/* GENERIC ATTACHMENTS (Expenses / Complaints / Agreements)               */
/* ---------------------------------------------------------------------- */
function attachmentListFor(kind){
  switch(kind){
    case 'expense': return db.expenses;
    case 'complaint': return db.complaints;
    case 'agreement': return db.agreements;
    case 'unit': return db.units;
    case 'tenant': return db.tenants;
    case 'electricityBill': return db.electricityBills;
    default: return [];
  }
}
function attachmentsSectionHTML(kind, entity){
  const atts = (entity && entity.attachments) || [];
  const grid = atts.map(a=>`
    <div class="attachment-card">
      ${a.isImage?`<img class="attachment-thumb" src="${a.dataUrl}">`:`<div class="attachment-thumb attachment-thumb-file">📄</div>`}
      <div class="attachment-meta"><div class="attachment-name">${escapeHtml(a.name)}</div><div class="attachment-sub">${formatDate(a.addedAt)}</div></div>
      ${entity.id?`<button class="btn sm danger no-print" data-action="delete-attachment" data-kind="${kind}" data-id="${entity.id}" data-attid="${a.id}">Delete</button>`:''}
    </div>`).join('') || '<div class="empty-note">No attachments yet.</div>';
  const addBtn = entity.id ? `<button class="btn sm no-print" data-action="add-attachment" data-kind="${kind}" data-id="${entity.id}">➕ Add</button>` : `<span style="font-size:12px;color:var(--muted);">(Save the record first, then add attachments from its profile)</span>`;
  return `
    <div class="section-title">📎 Attachments ${addBtn}</div>
    <div class="attachments-grid">${grid}</div>`;
}
const ATTACHMENT_PROFILE_VIEW = { expense:'expenseForm', complaint:'maintenanceForm', agreement:'agreementForm', unit:'unitProfile', tenant:'tenantProfile', electricityBill:'electricity' };
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
    if(!entity) return;
    entity.attachments = entity.attachments||[];
    entity.attachments.push({id:uid(), name:file.name, dataUrl, isImage, addedAt:todayISO()});
    saveDB();
    goto(ATTACHMENT_PROFILE_VIEW[kind]||'dashboard', id);
  };
  input.click();
}
function deleteAttachment(kind, id, attId){
  if(!confirm('Delete this attachment?')) return;
  const entity = attachmentListFor(kind).find(x=>x.id===id);
  if(!entity) return;
  entity.attachments = (entity.attachments||[]).filter(a=>a.id!==attId);
  saveDB();
  goto(ATTACHMENT_PROFILE_VIEW[kind]||'dashboard', id);
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
function activeTenants(){ return db.tenants.filter(t=>t.status==='Active'||t.status==='Notice Given'); }
function computeNotifications(){
  const list = [];
  const today = todayISO();
  const thisMonth = today.slice(0,7);

  // Rent overdue / partial payment
  activeTenants().forEach(t=>{
    const unit = unitById(t.unitId);
    if(!unit) return;
    const dueDay = Number(t.rentDueDay)||Number(db.settings.defaultRentDueDay)||5;
    const dueDateThisMonth = thisMonth+'-'+String(dueDay).padStart(2,'0');
    const rec = db.rentPayments.find(r=>r.tenantId===t.id && (r.paymentDate||'').slice(0,7)===thisMonth);
    if(!rec){
      const d = daysBetween(today, dueDateThisMonth);
      if(d!==null && d<0){
        list.push({id:'rentoverdue-'+t.id+'-'+thisMonth, title:`Rent overdue: ${t.name} (Unit ${unit.unitNumber})`, module:'Rent Collection', date:dueDateThisMonth, priority:'Urgent', linkView:'tenantProfile', linkId:t.id});
      }
    }else if(rentBalanceDue(rec)>0){
      list.push({id:'rentpartial-'+rec.id, title:`Partial rent payment balance: ${t.name} (${formatCurrency(rentBalanceDue(rec))})`, module:'Rent Collection', date:rec.paymentDate, priority:'High', linkView:'rent', linkId:null});
    }
  });

  // Electricity overdue / partial + meter reading due
  activeTenants().forEach(t=>{
    const unit = unitById(t.unitId);
    if(!unit) return;
    const lastBill = lastElectricityBillForUnit(unit.id);
    if(!lastBill){
      list.push({id:'meterdue-'+unit.id, title:`Meter reading due: ${unit.unitNumber} (no bill generated yet)`, module:'Electricity', date:today, priority:'Medium', linkView:'electricityForm', linkId:null});
    }else{
      const daysSince = daysBetween(lastBill.currReadingDate, today);
      if(daysSince!==null && daysSince>35){
        list.push({id:'meterdue-'+lastBill.id, title:`Meter reading due: ${unit.unitNumber} (last reading ${formatDate(lastBill.currReadingDate)})`, module:'Electricity', date:lastBill.currReadingDate, priority:'Medium', linkView:'electricity', linkId:null});
      }
      const bal = billBalanceDue(lastBill);
      if(bal>0){
        list.push({id:'elecoverdue-'+lastBill.id, title:`Electricity ${billStatus(lastBill)==='Partly Paid'?'partial payment':'overdue'}: ${t.name} (${formatCurrency(bal)})`, module:'Electricity', date:lastBill.currReadingDate, priority: billStatus(lastBill)==='Unpaid'?'Urgent':'High', linkView:'electricity', linkId:null});
      }
    }
  });

  // Agreement expiry + rent escalation
  db.agreements.forEach(a=>{
    if(a.renewalStatus==='Terminated') return;
    const d = daysBetween(today, a.endDate);
    if(d!==null && d<=90){
      const t = tenantById(a.tenantId);
      list.push({id:'agrexp-'+a.id, title:`Agreement expiring: ${t?t.name:a.id}`, module:'Agreements', date:a.endDate, priority:priorityFromDays(d), linkView:'agreements', linkId:null});
    }
    if(a.rentEscalationDate){
      const de = daysBetween(today, a.rentEscalationDate);
      if(de!==null && de>=0 && de<=30){
        const t = tenantById(a.tenantId);
        list.push({id:'escalation-'+a.id, title:`Rent escalation date approaching: ${t?t.name:a.id}`, module:'Agreements', date:a.rentEscalationDate, priority:priorityFromDays(de), linkView:'agreements', linkId:null});
      }
    }
  });

  // Vacant units
  db.units.forEach(u=>{
    if(u.status==='Vacant'){
      const p = propertyById(u.propertyId);
      list.push({id:'vacant-'+u.id, title:`Vacant unit: ${u.unitNumber} (${p?p.name:''})`, module:'Units', date:today, priority:'Low', linkView:'unitProfile', linkId:u.id});
    }
  });

  // Security deposit refund pending
  db.deposits.forEach(d=>{
    if(d.refundStatus==='Pending Refund'){
      const t = tenantById(d.tenantId);
      list.push({id:'deprefund-'+d.id, title:`Security deposit refund pending: ${t?t.name:d.id}`, module:'Deposits', date:d.dateReceived, priority:'Medium', linkView:'deposits', linkId:null});
    }
  });

  // Maintenance complaints pending
  db.complaints.forEach(c=>{
    if(c.status==='Open'||c.status==='In Progress'){
      list.push({id:'complaint-'+c.id, title:`Maintenance complaint pending: ${c.complaintType||'Complaint'} (${escapeHtml(c.priority||'Low')})`, module:'Maintenance', date:c.complaintDate, priority: c.priority==='Urgent'?'Urgent':(c.priority||'Medium'), linkView:'maintenance', linkId:null});
    }
  });

  // Monthly combined bill not generated for occupied units
  db.units.filter(u=>u.status==='Occupied').forEach(u=>{
    const has = db.combinedBills.some(c=>c.unitId===u.id && c.month===MONTH_NAMES[new Date().getMonth()] && String(c.year)===String(new Date().getFullYear()));
    if(!has){
      list.push({id:'nobill-'+u.id, title:`Monthly combined bill not generated: ${u.unitNumber}`, module:'Combined Bills', date:today, priority:'Low', linkView:'combinedBillForm', linkId:null});
    }
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
function openNotificationLink(view, id){ goto(view, id||null); }
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
        <div style="font-size:12.5px;color:var(--muted);">${escapeHtml(n.module)} · ${formatDate(n.date)} · <span class="badge ${n.priority==='Urgent'?'badge-red':n.priority==='High'?'badge-orange':n.priority==='Medium'?'badge-blue':'badge-grey'}">${n.priority}</span></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${!n.read?`<button class="btn sm secondary" data-action="mark-notification-read" data-nid="${n.id}">Mark Read</button>`:''}
        <button class="btn sm danger" data-action="delete-notification" data-nid="${n.id}">Delete</button>
      </div>
    </div>`).join('') || '<div class="empty-note">No notifications right now. You will be notified about rent/electricity overdue, agreement expiry, vacant units, pending deposit refunds, maintenance complaints and more.</div>';
  return moreSubtabsHTML('notifications') + `
    <div class="toolbar no-print"><div class="spacer"></div><button class="btn secondary" data-action="mark-all-notifications-read">✅ Mark All as Read</button></div>
    ${filterBar}
    ${rows}
  `;
}

/* ---------------------------------------------------------------------- */
/* REPORTS (19+ types, with date range + property filters)                */
/* ---------------------------------------------------------------------- */
const REPORT_TYPES = [
  {id:'propertySummary', label:'Property Summary'},
  {id:'unitOccupancy', label:'Unit Occupancy Report'},
  {id:'vacantUnits', label:'Vacant Unit Report'},
  {id:'tenantList', label:'Tenant List'},
  {id:'formerTenants', label:'Former Tenant List'},
  {id:'monthlyRentCollection', label:'Monthly Rent Collection'},
  {id:'monthlyElectricityCollection', label:'Monthly Electricity Collection'},
  {id:'rentOutstanding', label:'Rent Outstanding'},
  {id:'electricityOutstanding', label:'Electricity Outstanding'},
  {id:'combinedOutstanding', label:'Combined Outstanding'},
  {id:'securityDeposits', label:'Security Deposit Report'},
  {id:'expenseReport', label:'Expense Report'},
  {id:'maintenanceReport', label:'Maintenance Report'},
  {id:'agreementExpiry', label:'Agreement Expiry Report'},
  {id:'propertyIncome', label:'Property-wise Income'},
  {id:'propertyExpense', label:'Property-wise Expense'},
  {id:'netCollectionSummary', label:'Net Collection Summary'},
  {id:'tenantLedger', label:'Tenant Ledger'},
  {id:'unitLedger', label:'Unit Ledger'},
  {id:'meterHistory', label:'Meter Reading History'}
];
function inDateRange(dateVal){
  const {from,to} = state.reportRange||{};
  if(from && (!dateVal || dateVal<from)) return false;
  if(to && (!dateVal || dateVal>to)) return false;
  return true;
}
function reportPropertyMatches(propertyId){
  return state.reportPropertyFilter==='all' || state.reportPropertyFilter===propertyId;
}
function tableHTML(headers, rows){
  const head = '<tr>'+headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')+'</tr>';
  const body = rows.length ? rows.map(r=>'<tr>'+r.map(c=>`<td>${c===undefined||c===null||c===''?'—':c}</td>`).join('')+'</tr>').join('')
    : `<tr><td colspan="${headers.length}" class="empty-note">No data for the selected filters.</td></tr>`;
  return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
function generateReportHTML(type){
  switch(type){
    case 'propertySummary':
      return tableHTML(['Property','Type','Total Units','Occupied','Vacant','Monthly Rent Expected'],
        db.properties.filter(p=>reportPropertyMatches(p.id)).map(p=>{
          const s = propertyStats(p.id);
          return [escapeHtml(p.name), escapeHtml(p.type)||'—', s.totalUnits, s.occupied, s.vacant, formatCurrency(s.monthlyRentExpected)];
        }));
    case 'unitOccupancy':
      return tableHTML(['Unit','Property','Category','Status','Tenant'],
        db.units.filter(u=>reportPropertyMatches(u.propertyId)).map(u=>{
          const p = propertyById(u.propertyId), t = currentTenantForUnit(u.id);
          return [escapeHtml(u.unitNumber), escapeHtml(p?p.name:'—'), escapeHtml(u.category)||'—', escapeHtml(u.status)||'Vacant', escapeHtml(t?t.name:'—')];
        }));
    case 'vacantUnits':
      return tableHTML(['Unit','Property','Category','Monthly Rent'],
        db.units.filter(u=>u.status==='Vacant' && reportPropertyMatches(u.propertyId)).map(u=>{
          const p = propertyById(u.propertyId);
          return [escapeHtml(u.unitNumber), escapeHtml(p?p.name:'—'), escapeHtml(u.category)||'—', formatCurrency(u.monthlyRent)];
        }));
    case 'tenantList':
      return tableHTML(['Name','Mobile','Property','Unit','Status'],
        db.tenants.filter(t=>t.status!=='Former Tenant').map(t=>{
          const u = unitById(t.unitId), p = u?propertyById(u.propertyId):null;
          if(u && !reportPropertyMatches(u.propertyId)) return null;
          return [escapeHtml(t.name), escapeHtml(t.mobile)||'—', escapeHtml(p?p.name:'—'), escapeHtml(u?u.unitNumber:'—'), escapeHtml(t.status)];
        }).filter(Boolean));
    case 'formerTenants':
      return tableHTML(['Name','Mobile','Last Unit','Status'],
        db.tenants.filter(t=>t.status==='Former Tenant'||t.status==='Vacated').map(t=>{
          const u = unitById(t.unitId);
          return [escapeHtml(t.name), escapeHtml(t.mobile)||'—', escapeHtml(u?u.unitNumber:'—'), escapeHtml(t.status)];
        }));
    case 'monthlyRentCollection':
      return tableHTML(['Receipt No.','Tenant','Unit','Month','Received','Date'],
        db.rentPayments.filter(r=>inDateRange(r.paymentDate) && (state.reportPropertyFilter==='all' || (unitById(r.unitId)&&reportPropertyMatches(unitById(r.unitId).propertyId)))).map(r=>{
          const t = tenantById(r.tenantId), u = unitById(r.unitId);
          return [escapeHtml(r.receiptNumber||r.id), escapeHtml(t?t.name:'—'), escapeHtml(u?u.unitNumber:'—'), r.rentMonth+' '+r.rentYear, formatCurrency(r.amountReceived), formatDate(r.paymentDate)];
        }));
    case 'monthlyElectricityCollection':
      return tableHTML(['Bill No.','Tenant','Unit','Month','Amount Paid','Date'],
        db.electricityBills.filter(b=>inDateRange(b.paymentDate) && (state.reportPropertyFilter==='all' || (unitById(b.unitId)&&reportPropertyMatches(unitById(b.unitId).propertyId)))).map(b=>{
          const t = tenantById(b.tenantId), u = unitById(b.unitId);
          return [escapeHtml(b.billNumber||b.id), escapeHtml(t?t.name:'—'), escapeHtml(u?u.unitNumber:'—'), b.billingMonth+' '+b.billingYear, formatCurrency(b.amountPaid), formatDate(b.paymentDate)];
        }));
    case 'rentOutstanding':
      return tableHTML(['Tenant','Unit','Month','Balance Due'],
        db.rentPayments.filter(r=>rentBalanceDue(r)>0 && (state.reportPropertyFilter==='all' || (unitById(r.unitId)&&reportPropertyMatches(unitById(r.unitId).propertyId)))).map(r=>{
          const t = tenantById(r.tenantId), u = unitById(r.unitId);
          return [escapeHtml(t?t.name:'—'), escapeHtml(u?u.unitNumber:'—'), r.rentMonth+' '+r.rentYear, formatCurrency(rentBalanceDue(r))];
        }));
    case 'electricityOutstanding':
      return tableHTML(['Tenant','Unit','Month','Balance Due'],
        db.electricityBills.filter(b=>billBalanceDue(b)>0 && (state.reportPropertyFilter==='all' || (unitById(b.unitId)&&reportPropertyMatches(unitById(b.unitId).propertyId)))).map(b=>{
          const t = tenantById(b.tenantId), u = unitById(b.unitId);
          return [escapeHtml(t?t.name:'—'), escapeHtml(u?u.unitNumber:'—'), b.billingMonth+' '+b.billingYear, formatCurrency(billBalanceDue(b))];
        }));
    case 'combinedOutstanding':{
      const rentOut = db.rentPayments.filter(r=>rentBalanceDue(r)>0).reduce((s,r)=>s+rentBalanceDue(r),0);
      const elecOut = db.electricityBills.filter(b=>billBalanceDue(b)>0).reduce((s,b)=>s+billBalanceDue(b),0);
      const cmbOut = db.combinedBills.filter(c=>combinedBalanceDue(c)>0).reduce((s,c)=>s+combinedBalanceDue(c),0);
      return tableHTML(['Category','Outstanding Amount'],[['Rent',formatCurrency(rentOut)],['Electricity',formatCurrency(elecOut)],['Combined Bills',formatCurrency(cmbOut)],['Total',formatCurrency(rentOut+elecOut+cmbOut)]]);
    }
    case 'securityDeposits':
      return tableHTML(['Tenant','Unit','Amount','Date Received','Refund Status'],
        db.deposits.map(d=>{
          const t = tenantById(d.tenantId), u = unitById(d.unitId);
          return [escapeHtml(t?t.name:'—'), escapeHtml(u?u.unitNumber:'—'), formatCurrency(d.depositAmount), formatDate(d.dateReceived), escapeHtml(d.refundStatus)||'Held'];
        }));
    case 'expenseReport':
      return tableHTML(['Date','Property','Category','Amount','Paid To'],
        db.expenses.filter(e=>inDateRange(e.date) && reportPropertyMatches(e.propertyId)).map(e=>{
          const p = propertyById(e.propertyId);
          return [formatDate(e.date), escapeHtml(p?p.name:'—'), escapeHtml(e.category), formatCurrency(e.amount), escapeHtml(e.paidTo)||'—'];
        }));
    case 'maintenanceReport':
      return tableHTML(['Date','Unit','Type','Priority','Status'],
        db.complaints.filter(c=>inDateRange(c.complaintDate)).map(c=>{
          const u = unitById(c.unitId);
          return [formatDate(c.complaintDate), escapeHtml(u?u.unitNumber:'—'), escapeHtml(c.complaintType)||'—', escapeHtml(c.priority), escapeHtml(c.status)];
        }));
    case 'agreementExpiry':
      return tableHTML(['Tenant','Unit','Start','End','Status'],
        db.agreements.map(a=>{
          const t = tenantById(a.tenantId), u = unitById(a.unitId);
          return [escapeHtml(t?t.name:'—'), escapeHtml(u?u.unitNumber:'—'), formatDate(a.startDate), formatDate(a.endDate), escapeHtml(a.renewalStatus)];
        }));
    case 'propertyIncome':
      return tableHTML(['Property','Rent Collected','Electricity Collected','Total Income'],
        db.properties.filter(p=>reportPropertyMatches(p.id)).map(p=>{
          const rent = db.rentPayments.filter(r=>{const u=unitById(r.unitId);return u&&u.propertyId===p.id && inDateRange(r.paymentDate);}).reduce((s,r)=>s+(Number(r.amountReceived)||0),0);
          const elec = db.electricityBills.filter(b=>{const u=unitById(b.unitId);return u&&u.propertyId===p.id && inDateRange(b.paymentDate);}).reduce((s,b)=>s+(Number(b.amountPaid)||0),0);
          return [escapeHtml(p.name), formatCurrency(rent), formatCurrency(elec), formatCurrency(rent+elec)];
        }));
    case 'propertyExpense':
      return tableHTML(['Property','Total Expense'],
        db.properties.filter(p=>reportPropertyMatches(p.id)).map(p=>{
          const total = db.expenses.filter(e=>e.propertyId===p.id && inDateRange(e.date)).reduce((s,e)=>s+(Number(e.amount)||0),0);
          return [escapeHtml(p.name), formatCurrency(total)];
        }));
    case 'netCollectionSummary':{
      const rent = db.rentPayments.filter(r=>inDateRange(r.paymentDate)).reduce((s,r)=>s+(Number(r.amountReceived)||0),0);
      const elec = db.electricityBills.filter(b=>inDateRange(b.paymentDate)).reduce((s,b)=>s+(Number(b.amountPaid)||0),0);
      const expense = db.expenses.filter(e=>inDateRange(e.date)).reduce((s,e)=>s+(Number(e.amount)||0),0);
      return tableHTML(['Category','Amount'],[['Rent Collected',formatCurrency(rent)],['Electricity Collected',formatCurrency(elec)],['Total Collected',formatCurrency(rent+elec)],['Total Expenses',formatCurrency(expense)],['Net',formatCurrency(rent+elec-expense)]]);
    }
    case 'tenantLedger':
      return tableHTML(['Tenant','Unit','Rent Paid (Total)','Electricity Paid (Total)','Balance Due'],
        db.tenants.map(t=>{
          const u = unitById(t.unitId);
          const rentPaid = db.rentPayments.filter(r=>r.tenantId===t.id).reduce((s,r)=>s+(Number(r.amountReceived)||0),0);
          const elecPaid = db.electricityBills.filter(b=>b.tenantId===t.id).reduce((s,b)=>s+(Number(b.amountPaid)||0),0);
          const bal = db.rentPayments.filter(r=>r.tenantId===t.id).reduce((s,r)=>s+Math.max(0,rentBalanceDue(r)),0) + db.electricityBills.filter(b=>b.tenantId===t.id).reduce((s,b)=>s+Math.max(0,billBalanceDue(b)),0);
          return [escapeHtml(t.name), escapeHtml(u?u.unitNumber:'—'), formatCurrency(rentPaid), formatCurrency(elecPaid), formatCurrency(bal)];
        }));
    case 'unitLedger':
      return tableHTML(['Unit','Property','Rent Collected (Total)','Electricity Collected (Total)'],
        db.units.filter(u=>reportPropertyMatches(u.propertyId)).map(u=>{
          const p = propertyById(u.propertyId);
          const rentPaid = db.rentPayments.filter(r=>r.unitId===u.id).reduce((s,r)=>s+(Number(r.amountReceived)||0),0);
          const elecPaid = db.electricityBills.filter(b=>b.unitId===u.id).reduce((s,b)=>s+(Number(b.amountPaid)||0),0);
          return [escapeHtml(u.unitNumber), escapeHtml(p?p.name:'—'), formatCurrency(rentPaid), formatCurrency(elecPaid)];
        }));
    case 'meterHistory':
      return tableHTML(['Unit','Tenant','Billing Month','Previous Reading','Current Reading','Units Consumed'],
        db.electricityBills.filter(b=>state.reportPropertyFilter==='all' || (unitById(b.unitId)&&reportPropertyMatches(unitById(b.unitId).propertyId))).map(b=>{
          const u = unitById(b.unitId), t = tenantById(b.tenantId);
          return [escapeHtml(u?u.unitNumber:'—'), escapeHtml(t?t.name:'—'), b.billingMonth+' '+b.billingYear, b.prevReading, b.currReading, billUnitsConsumed(b)];
        }));
    default:
      return '<div class="empty-note">Select a report type.</div>';
  }
}
function renderReports(){
  const propOpts = ['<option value="all">All Properties</option>'].concat(db.properties.map(p=>`<option value="${p.id}" ${state.reportPropertyFilter===p.id?'selected':''}>${escapeHtml(p.name)}</option>`)).join('');
  const typeOpts = REPORT_TYPES.map(r=>`<option value="${r.id}" ${state.reportType===r.id?'selected':''}>${r.label}</option>`).join('');
  const type = state.reportType || REPORT_TYPES[0].id;
  return moreSubtabsHTML('reports') + `
    <div class="toolbar no-print">
      <select id="reportTypeSelect">${typeOpts}</select>
      <select id="reportPropSelect">${propOpts}</select>
      <label style="font-size:12.5px;">From <input type="date" id="reportFrom" value="${escapeHtml(state.reportRange.from)}"></label>
      <label style="font-size:12.5px;">To <input type="date" id="reportTo" value="${escapeHtml(state.reportRange.to)}"></label>
      <div class="spacer"></div>
      <button class="btn secondary" data-action="print-view">🖨️ Print Report</button>
    </div>
    <div class="section-title">${escapeHtml((REPORT_TYPES.find(r=>r.id===type)||{}).label||'Report')}</div>
    ${generateReportHTML(type)}
  `;
}
function attachReportHandlers(){
  const t = document.getElementById('reportTypeSelect');
  const p = document.getElementById('reportPropSelect');
  const from = document.getElementById('reportFrom');
  const to = document.getElementById('reportTo');
  if(t) t.addEventListener('change', ()=>{ state.reportType = t.value; render(); });
  if(p) p.addEventListener('change', ()=>{ state.reportPropertyFilter = p.value; render(); });
  if(from) from.addEventListener('change', ()=>{ state.reportRange.from = from.value; render(); });
  if(to) to.addEventListener('change', ()=>{ state.reportRange.to = to.value; render(); });
}

/* ---------------------------------------------------------------------- */
/* SETTINGS + BACKUP/RESTORE                                              */
/* ---------------------------------------------------------------------- */
function renderSettings(){
  const s = db.settings;
  return `
    <div class="settings-block">
      <h3>⚙️ Owner &amp; Defaults</h3>
      <div class="form-grid">${fieldsToHTML(SETTINGS_FIELDS, s)}</div>
      <p style="font-size:12px;color:var(--muted);margin-top:8px;">Currency: INR (₹). Changing the default electricity rate only affects future bills — every saved bill keeps the rate that was used at the time it was generated. Units and properties may override this default rate individually (Unit override → Property override → Global default).</p>
      <div class="form-actions"><button class="btn" id="saveSettingsBtn">💾 Save Settings</button></div>
    </div>
    <div class="settings-block">
      <h3>💾 Backup &amp; Restore</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn secondary" id="backupBtn">⬇️ Download Backup (JSON)</button>
        <label class="btn secondary" style="display:inline-flex;align-items:center;">⬆️ Restore from Backup
          <input type="file" accept=".json" id="restoreInput" style="display:none;">
        </label>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:10px;">Backup includes every Rental Manager section: Properties, Units, Tenants, Occupancy History, Rent Payments, Electricity Readings &amp; Bills, Combined Bills, Security Deposits, Expenses, Maintenance Complaints, Agreements, Notifications and Settings. Restoring validates the file first and asks for confirmation before replacing data. WBCYN, Clinic Manager and Trust Manager data are stored separately and are unaffected.</p>
    </div>
    <div class="settings-block">
      <h3>⚠️ Reset Rental Manager Data</h3>
      <p style="font-size:12.5px;color:var(--muted);">This permanently deletes all Rental Manager data on this device (Properties, Units, Tenants, Bills, etc.) and restores the two original preloaded properties. This cannot be undone.</p>
      <button class="btn danger" id="resetRentalBtn">🗑️ Reset All Rental Data</button>
    </div>
  `;
}
function attachSettingsHandlers(){
  const saveBtn = document.getElementById('saveSettingsBtn');
  if(saveBtn) saveBtn.addEventListener('click', ()=>{
    const vals = readFieldsFromForm(SETTINGS_FIELDS, document.getElementById('app'));
    Object.assign(db.settings, vals);
    saveDB();
    renderHeader();
    alert('Settings saved.');
  });
  const backupBtn = document.getElementById('backupBtn');
  if(backupBtn) backupBtn.addEventListener('click', ()=>{
    downloadFile('rental-manager-backup-'+nowTimestamp()+'.json', JSON.stringify(db, null, 2));
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
      const validation = validateRentalBackup(parsed);
      if(!validation.ok){ alert('This does not look like a valid Rental Manager backup file.\n\n'+validation.reason); return; }
      const summary = `Properties: ${(parsed.properties||[]).length}\nUnits: ${(parsed.units||[]).length}\nTenants: ${(parsed.tenants||[]).length}\nRent Payments: ${(parsed.rentPayments||[]).length}\nElectricity Bills: ${(parsed.electricityBills||[]).length}`;
      if(!confirm('This will replace ALL current Rental Manager data with the contents of this backup file.\n\nBackup contains:\n'+summary+'\n\nThis cannot be undone. Continue?')) return;
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
  const resetBtn = document.getElementById('resetRentalBtn');
  if(resetBtn) resetBtn.addEventListener('click', ()=>{
    if(!confirm('This will permanently delete ALL Rental Manager data on this device. This cannot be undone.\n\nAre you absolutely sure?')) return;
    if(!confirm('Please confirm once more: reset Rental Manager to a blank state with only Nabadiganta Complex and Sunny Paradise preloaded?')) return;
    db = freshDB();
    saveDB();
    renderHeader();
    goto('dashboard');
    alert('Rental Manager has been reset.');
  });
}

/* ---------------------------------------------------------------------- */
/* GLOBAL SEARCH (Rental Manager)                                        */
/* ---------------------------------------------------------------------- */
function globalSearchRental(q){
  q = (q||'').toLowerCase();
  if(!q) return [];
  const out = [];
  db.tenants.forEach(t=>{ if((t.name||'').toLowerCase().includes(q)||(t.mobile||'').includes(q)) out.push({type:'Tenant', label:t.name, view:'tenantProfile', id:t.id}); });
  db.properties.forEach(p=>{ if((p.name||'').toLowerCase().includes(q)) out.push({type:'Property', label:p.name, view:'propertyProfile', id:p.id}); });
  db.units.forEach(u=>{ if((u.unitNumber||'').toLowerCase().includes(q)) out.push({type:'Unit', label:u.unitNumber, view:'unitProfile', id:u.id}); });
  db.rentPayments.forEach(r=>{ if((r.receiptNumber||'').toLowerCase().includes(q)) out.push({type:'Rent Receipt', label:r.receiptNumber, view:'rent', id:null}); });
  db.electricityBills.forEach(b=>{ if((b.billNumber||'').toLowerCase().includes(q) || (b.subMeterNumber||'').toLowerCase().includes(q)) out.push({type:'Electricity Bill', label:b.billNumber||b.subMeterNumber, view:'electricity', id:null}); });
  db.agreements.forEach(a=>{ if((a.id||'').toLowerCase().includes(q)) out.push({type:'Agreement', label:a.id, view:'agreements', id:null}); });
  return out;
}

function openGlobalSearchModal(){
  openModal('🔍 Global Search', `
    <div class="form-field full">
      <label>Search by Tenant Name, Mobile, Property, Unit, Receipt No., Bill No., Agreement or Meter No.</label>
      <input type="text" id="globalSearchInput" placeholder="Type to search...">
    </div>
    <div id="globalSearchResults" style="margin-top:10px;"></div>
  `, `<button class="btn grey" id="gsClose">Close</button>`);
  document.getElementById('gsClose').onclick = closeModal;
  const input = document.getElementById('globalSearchInput');
  input.addEventListener('input', ()=>{
    const results = globalSearchRental(input.value);
    document.getElementById('globalSearchResults').innerHTML = results.length ? results.map(r=>
      `<div class="item-row"><div><div class="title">${escapeHtml(r.label)}</div><div class="meta">${escapeHtml(r.type)}</div></div>
      <button class="btn sm secondary" data-action="open-search-result" data-view="${r.view}" data-id="${r.id||''}">Open</button></div>`).join('')
      : (input.value ? '<div class="empty-note">No matches found.</div>' : '');
    document.querySelectorAll('[data-action="open-search-result"]').forEach(btn=>{
      btn.onclick = ()=>{ closeModal(); goto(btn.getAttribute('data-view'), btn.getAttribute('data-id')||null); };
    });
  });
  input.focus();
}

/* ---------------------------------------------------------------------- */
/* MAIN RENDER DISPATCH                                                   */
/* ---------------------------------------------------------------------- */
function renderHeader(){
  const el = document.getElementById('headerOwnerName');
  if(el) el.textContent = db.settings.ownerName || 'Rental Manager';
  const f = document.getElementById('rentalFooter');
  if(f) f.textContent = 'Rental Manager · Data stored privately on this device';
}
function render(){
  renderNav();
  const app = document.getElementById('app');
  const id = state.editingId;
  switch(state.view){
    case 'dashboard': app.innerHTML = renderDashboard(); break;
    case 'properties': app.innerHTML = renderProperties(); break;
    case 'propertyForm': renderPropertyForm(id); break;
    case 'propertyProfile': app.innerHTML = renderPropertyProfile(id); break;
    case 'units': app.innerHTML = renderUnits(); break;
    case 'unitForm': renderUnitForm(id); break;
    case 'unitProfile': app.innerHTML = renderUnitProfile(id); break;
    case 'tenants': app.innerHTML = renderTenants(); break;
    case 'tenantForm': renderTenantForm(id); break;
    case 'tenantProfile': app.innerHTML = renderTenantProfile(id); break;
    case 'occupancyHistory': app.innerHTML = renderOccupancyHistory(); break;
    case 'rent': app.innerHTML = renderRent(); break;
    case 'rentForm': renderRentForm(id); break;
    case 'electricity': app.innerHTML = renderElectricity(); break;
    case 'electricityForm': renderElectricityForm(id); break;
    case 'combinedBills': app.innerHTML = renderCombinedBills(); break;
    case 'combinedBillForm': renderCombinedBillForm(id); break;
    case 'deposits': app.innerHTML = renderDeposits(); break;
    case 'depositForm': renderDepositForm(id); break;
    case 'expenses': app.innerHTML = renderExpenses(); break;
    case 'expenseForm': renderExpenseForm(id); break;
    case 'maintenance': app.innerHTML = renderMaintenance(); break;
    case 'maintenanceForm': renderMaintenanceForm(id); break;
    case 'agreements': app.innerHTML = renderAgreements(); break;
    case 'agreementForm': renderAgreementForm(id); break;
    case 'reports': app.innerHTML = renderReports(); attachReportHandlers(); break;
    case 'notifications': app.innerHTML = renderNotifications(); break;
    case 'settings': app.innerHTML = renderSettings(); attachSettingsHandlers(); break;
    default: app.innerHTML = renderDashboard();
  }
  attachMoreSubtabHandlers();
  wireSearchBox();
  wireUnitFilterBoxes();
  wireDelegatedActions();
  wireMaskToggles();
  updateNotificationBadge();
}
function wireSearchBox(){
  const box = document.getElementById('searchBox');
  if(box) box.addEventListener('input', ()=>{ state.search = box.value; render(); box.focus(); box.setSelectionRange(box.value.length, box.value.length); });
}
function wireUnitFilterBoxes(){
  const pf = document.getElementById('unitPropFilter');
  const cf = document.getElementById('unitCatFilter');
  const sf = document.getElementById('unitStatusFilter');
  if(pf) pf.addEventListener('change', ()=>{ state.unitPropertyFilter = pf.value; render(); });
  if(cf) cf.addEventListener('change', ()=>{ state.unitCategoryFilter = cf.value; render(); });
  if(sf) sf.addEventListener('change', ()=>{ state.unitStatusFilter = sf.value; render(); });
}
function wireDelegatedActions(){
  document.querySelectorAll('[data-action]').forEach(el=>{
    if(el._rentalWired) return;
    el._rentalWired = true;
    el.addEventListener('click', ()=>{
      const action = el.getAttribute('data-action');
      const id = el.getAttribute('data-id');
      switch(action){
        case 'goto': goto(el.getAttribute('data-view'), id); break;

        case 'view-property': goto('propertyProfile', id); break;
        case 'edit-property': goto('propertyForm', id); break;
        case 'delete-property':
          if(confirm('Delete this property? Units and records linked to it will remain but will show as unlinked. This cannot be undone.')){ db.properties = db.properties.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'view-unit': goto('unitProfile', id); break;
        case 'edit-unit': goto('unitForm', id); break;
        case 'delete-unit':
          if(confirm('Delete this unit? This cannot be undone.')){ db.units = db.units.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'view-tenant': goto('tenantProfile', id); break;
        case 'edit-tenant': goto('tenantForm', id); break;
        case 'delete-tenant':
          if(confirm('Delete this tenant record? Occupancy and payment history linked to them will remain but will show as unlinked. This cannot be undone.')){ db.tenants = db.tenants.filter(x=>x.id!==id); saveDB(); render(); }
          break;
        case 'vacate-tenant': vacateTenantFlow(id); break;
        case 'filter-tenants': state.tenantFilter = el.getAttribute('data-filter'); render(); break;

        case 'print-rent-receipt': printRentReceipt(id); break;
        case 'edit-rent': goto('rentForm', id); break;
        case 'delete-rent':
          if(confirm('Delete this rent payment record?')){ db.rentPayments = db.rentPayments.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'print-electricity-bill': printElectricityBill(id); break;
        case 'edit-electricity': goto('electricityForm', id); break;
        case 'delete-electricity':
          if(confirm('Delete this electricity bill?')){ db.electricityBills = db.electricityBills.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'print-combined-bill': printCombinedBill(id); break;
        case 'edit-combined-bill': goto('combinedBillForm', id); break;
        case 'delete-combined-bill':
          if(confirm('Delete this combined bill?')){ db.combinedBills = db.combinedBills.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'edit-deposit': goto('depositForm', id); break;
        case 'delete-deposit':
          if(confirm('Delete this security deposit record?')){ db.deposits = db.deposits.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'add-expense': goto('expenseForm'); break;
        case 'edit-expense': goto('expenseForm', id); break;
        case 'delete-expense':
          if(confirm('Delete this expense record?')){ db.expenses = db.expenses.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'edit-maintenance': goto('maintenanceForm', id); break;
        case 'delete-maintenance':
          if(confirm('Delete this maintenance complaint?')){ db.complaints = db.complaints.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'edit-agreement': goto('agreementForm', id); break;
        case 'delete-agreement':
          if(confirm('Delete this agreement record?')){ db.agreements = db.agreements.filter(x=>x.id!==id); saveDB(); render(); }
          break;

        case 'add-attachment': openAttachmentPicker(el.getAttribute('data-kind'), id); break;
        case 'delete-attachment': deleteAttachment(el.getAttribute('data-kind'), id, el.getAttribute('data-attid')); break;
        case 'print-view': window.print(); break;

        case 'mark-notification-read': markNotificationRead(el.getAttribute('data-nid')); break;
        case 'mark-all-notifications-read': markAllNotificationsRead(); break;
        case 'delete-notification': deleteNotification(el.getAttribute('data-nid')); break;
        case 'open-notification': openNotificationLink(el.getAttribute('data-linkview'), el.getAttribute('data-linkid')); break;
        case 'filter-notifications': state.notificationFilter = el.getAttribute('data-filter'); render(); break;

        case 'global-search': openGlobalSearchModal(); break;
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
    root.innerHTML = `<div class="pwa-install-banner"><span>Install Rental Manager for offline use.</span>
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

