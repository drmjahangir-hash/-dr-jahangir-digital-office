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
const SCHEMA_VERSION = 2;
const DEFAULT_REMINDER_TEMPLATES = {
  rentReminderTemplate:
`Dear {{tenantName}},
This is a reminder regarding the rent for {{propertyName}}, Unit {{unitNumber}}, for {{month}} {{year}}.
Rent: {{rentAmount}}
Electricity: {{electricityAmount}}
Other Charges: {{otherCharges}}
Previous Due: {{previousDue}}
Total Payable: {{totalPayable}}
Due Date: {{dueDate}}
Kindly arrange payment at your convenience.
Regards,
{{ownerSignatureName}}`,
  electricityReminderTemplate:
`Dear {{tenantName}},
This is a reminder regarding the electricity bill for {{propertyName}}, Unit {{unitNumber}}, for {{month}} {{year}}.
Units Consumed: {{unitsConsumed}}
Rate: {{ratePerUnit}}/unit
Electricity Charge: {{electricityAmount}}
Previous Outstanding: {{previousDue}}
Total Payable: {{totalPayable}}
Kindly arrange payment at your convenience.
Regards,
{{ownerSignatureName}}`,
  combinedBillReminderTemplate:
`Dear {{tenantName}},
Your combined monthly bill for {{propertyName}}, Unit {{unitNumber}}, for {{month}} {{year}} is ready.
Rent: {{rentAmount}}
Maintenance: {{maintenanceAmount}}
Electricity: {{electricityAmount}}
Water: {{waterAmount}}
Parking: {{parkingAmount}}
Other: {{otherCharges}}
Previous Due: {{previousDue}}
Total Payable: {{totalPayable}}
Kindly arrange payment at your convenience.
Regards,
{{ownerSignatureName}}`,
  paymentAcknowledgementTemplate:
`Dear {{tenantName}},
We acknowledge receipt of {{amountReceived}} towards {{purpose}} for {{propertyName}}, Unit {{unitNumber}}, on {{paymentDate}}.
Thank you.
Regards,
{{ownerSignatureName}}`
};
function freshDB(){
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: Object.assign({
      ownerName:'', ownerAddress:'', ownerPhone:'', ownerEmail:'',
      ownerSignatureName:'Dr. M. Jahangir',
      receiptHeader:'', receiptFooter:'',
      whatsappCountryCode:'+91',
      defaultElectricityRate:12,
      defaultRentDueDay:5,
      defaultLateFee:0,
      lateFeeEnabled:false,
      monthlyBillingDay:1,
      meterReadingReminderDay:25,
      receiptPrefix:'RENT',
      electricityBillPrefix:'ELEC',
      billNumberPrefix:'BILL',
      currency:'INR',
      dateFormat:'DD/MM/YYYY'
    }, DEFAULT_REMINDER_TEMPLATES),
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
    backupHistory:[],
    notificationState:{ readIds:[], deletedIds:[], snoozedUntil:{} },
    nextIds:{property:3, unit:1, tenant:1, occupancy:1, rentPayment:1, electricityBill:1, combinedBill:1, deposit:1, expense:1, complaint:1, agreement:1}
  };
}
// Safe, additive schema migration. Never deletes existing records — only
// fills in missing keys introduced by later versions (v1.4.0 added
// reminder templates, backupHistory, combinedBill status, notification
// snoozing, and several new settings fields). Existing Rental Manager data
// (properties, units, tenants, bills, payments, etc.) is always preserved.
function ensureShape(db){
  const fresh = freshDB();
  db.settings = Object.assign({}, fresh.settings, db.settings||{});
  ['properties','units','tenants','occupancyHistory','rentPayments','electricityBills','combinedBills','deposits','expenses','complaints','agreements','backupHistory']
    .forEach(k=>{ if(!Array.isArray(db[k])) db[k] = []; });
  db.notificationState = Object.assign({}, fresh.notificationState, db.notificationState||{});
  if(!Array.isArray(db.notificationState.readIds)) db.notificationState.readIds = [];
  if(!Array.isArray(db.notificationState.deletedIds)) db.notificationState.deletedIds = [];
  if(!db.notificationState.snoozedUntil || typeof db.notificationState.snoozedUntil!=='object') db.notificationState.snoozedUntil = {};
  db.nextIds = Object.assign({}, fresh.nextIds, db.nextIds||{});
  db.properties.forEach(p=>{ if(p.status===undefined) p.status='Active'; });
  db.units.forEach(u=>{ if(!Array.isArray(u.attachments)) u.attachments = []; });
  db.tenants.forEach(t=>{ if(!Array.isArray(t.attachments)) t.attachments = []; });
  db.expenses.forEach(e=>{ if(!Array.isArray(e.attachments)) e.attachments = []; });
  db.complaints.forEach(c=>{ if(!Array.isArray(c.attachments)) c.attachments = []; });
  db.agreements.forEach(a=>{ if(!Array.isArray(a.attachments)) a.attachments = []; });
  db.electricityBills.forEach(b=>{ if(!Array.isArray(b.attachments)) b.attachments = []; });
  // v1.4.0: combined/monthly bills gained a status field. Any bill saved
  // before this version was, by definition, already final — migrate it to
  // 'Finalised' (or 'Paid' if fully settled) rather than leaving it blank,
  // so paid-bill protection logic works correctly on old data too.
  db.combinedBills.forEach(c=>{
    if(!c.status){
      c.status = combinedBalanceDue(c)<=0 ? 'Paid' : (Number(c.amountReceived)>0 ? 'Partly Paid' : 'Finalised');
    }
  });
  db.schemaVersion = SCHEMA_VERSION;
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
function nextCombinedBillNumber(year){
  year = year || new Date().getFullYear();
  const seq = db.combinedBills.filter(c=>String(c.year)===String(year)).length + 1;
  return (db.settings.billNumberPrefix||'BILL') + '/' + year + '/' + String(seq).padStart(3,'0');
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
  {key:'ownerSignatureName', label:'Owner Signature Name', type:'text'},
  {key:'receiptHeader', label:'Receipt Header (optional)', type:'textarea'},
  {key:'receiptFooter', label:'Receipt Footer (optional)', type:'textarea'},
  {key:'whatsappCountryCode', label:'Default WhatsApp Country Code', type:'text'},
  {key:'defaultElectricityRate', label:'Default Electricity Rate (₹ per unit)', type:'number'},
  {key:'defaultRentDueDay', label:'Default Rent Due Day', type:'number'},
  {key:'monthlyBillingDay', label:'Monthly Billing Day', type:'number'},
  {key:'meterReadingReminderDay', label:'Meter Reading Reminder Day', type:'number'},
  {key:'lateFeeEnabled', label:'Enable Late Fee', type:'select', options:['Yes','No']},
  {key:'defaultLateFee', label:'Default Late Fee (₹)', type:'number'},
  {key:'receiptPrefix', label:'Receipt Number Prefix', type:'text'},
  {key:'electricityBillPrefix', label:'Electricity Bill Prefix', type:'text'},
  {key:'billNumberPrefix', label:'Bill Number Prefix (Combined / Monthly)', type:'text'},
  {key:'dateFormat', label:'Date Format', type:'select', options:['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD']}
];
const REMINDER_TEMPLATE_FIELDS = [
  {key:'rentReminderTemplate', label:'Rent Reminder Template', type:'textarea'},
  {key:'electricityReminderTemplate', label:'Electricity Reminder Template', type:'textarea'},
  {key:'combinedBillReminderTemplate', label:'Combined Bill Reminder Template', type:'textarea'},
  {key:'paymentAcknowledgementTemplate', label:'Payment Acknowledgement Template', type:'textarea'}
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
  {id:'billingCentre', label:'Monthly Billing Centre', icon:'🧮'},
  {id:'occupancy', label:'Occupancy Overview', icon:'🏘️'},
  {id:'rent', label:'Rent Collection', icon:'💵'},
  {id:'electricity', label:'Electricity', icon:'⚡'},
  {id:'combinedBills', label:'Combined Bills', icon:'🧾'},
  {id:'receiptHistory', label:'Receipt History', icon:'🧻'},
  {id:'deposits', label:'Deposits', icon:'🏦'},
  {id:'expenses', label:'Expenses', icon:'💸'},
  {id:'maintenance', label:'Maintenance', icon:'🛠️'},
  {id:'agreements', label:'Agreements', icon:'📜'},
  {id:'occupancyHistory', label:'Occupancy History', icon:'🕐'},
  {id:'profitLoss', label:'Profit &amp; Loss', icon:'📈'},
  {id:'reports', label:'Reports', icon:'📊'},
  {id:'notifications', label:'Notifications', icon:'🔔'}
];
const FAMILY_GROUP = {
  properties: ['properties','propertyForm','propertyProfile'],
  units: ['units','unitForm','unitProfile'],
  tenants: ['tenants','tenantForm','tenantProfile'],
  more: ['rent','rentForm','electricity','electricityForm','combinedBills','combinedBillForm',
    'deposits','depositForm','expenses','expenseForm','maintenance','maintenanceForm',
    'agreements','agreementForm','occupancyHistory','reports','notifications',
    'billingCentre','occupancy','receiptHistory','profitLoss']
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
/* WHATSAPP TENANT REMINDERS                                              */
/* The app never sends a message automatically. It only ever opens        */
/* WhatsApp / WhatsApp Web with a pre-filled, user-editable message that   */
/* the user must review and tap Send themselves.                          */
/* ---------------------------------------------------------------------- */
function fillTemplate(tpl, data){
  return String(tpl||'').replace(/\{\{(\w+)\}\}/g, (m,k)=> (data[k]!==undefined && data[k]!==null && data[k]!=='') ? data[k] : '—');
}
// Validates and normalises an Indian mobile number for WhatsApp. Returns
// {ok:true, number:'91XXXXXXXXXX'} or {ok:false, reason:'...'}.
function normalizeIndianMobile(raw, countryCode){
  countryCode = (countryCode||'+91').replace(/\D/g,'') || '91';
  if(!raw) return {ok:false, reason:'No mobile or WhatsApp number saved for this tenant.'};
  let digits = String(raw).replace(/[^\d]/g,'');
  if(digits.length===12 && digits.startsWith(countryCode)) digits = digits.slice(countryCode.length);
  if(digits.length===11 && digits.startsWith('0')) digits = digits.slice(1);
  if(digits.length!==10){
    return {ok:false, reason:`"${raw}" does not look like a valid 10-digit Indian mobile number.`};
  }
  return {ok:true, number: countryCode+digits};
}
function tenantWhatsAppNumber(tenant){
  return normalizeIndianMobile(tenant.whatsapp||tenant.mobile, db.settings.whatsappCountryCode);
}
function buildWhatsAppLink(number, message){
  return 'https://wa.me/'+number+'?text='+encodeURIComponent(message);
}
// Opens an editable-message modal. `tenant` supplies the phone number;
// `initialMessage` is the pre-filled, fully-editable draft text. Nothing is
// sent until the user reviews the text and explicitly taps "Send via WhatsApp".
function openWhatsAppReminderModal(tenant, initialMessage){
  if(!tenant){ alert('No tenant linked to this record.'); return; }
  openModal('💬 WhatsApp Reminder — '+tenant.name, `
    <div class="form-field full">
      <label>To: ${escapeHtml(tenant.name)} (${escapeHtml(tenant.whatsapp||tenant.mobile||'no number saved')})</label>
      <textarea id="waMessageBox" rows="10">${escapeHtml(initialMessage)}</textarea>
    </div>
    <div id="waValidationNote" style="font-size:12.5px;color:var(--muted);margin-top:6px;"></div>
  `, `<button class="btn grey" id="waCancel">Cancel</button><button class="btn" id="waSend">✅ Send via WhatsApp</button>`);
  document.getElementById('waCancel').onclick = closeModal;
  document.getElementById('waSend').onclick = ()=>{
    const check = tenantWhatsAppNumber(tenant);
    if(!check.ok){
      document.getElementById('waValidationNote').textContent = check.reason+' Please add/correct it in the tenant profile first.';
      return;
    }
    const message = document.getElementById('waMessageBox').value;
    const link = buildWhatsAppLink(check.number, message);
    window.open(link, '_blank');
    closeModal();
  };
}
function waRentReminder(rentPaymentOrTenant, unit, prop, rentRec){
  const t = rentPaymentOrTenant;
  const data = {
    tenantName:t.name, propertyName:prop?prop.name:'', unitNumber:unit?unit.unitNumber:'',
    month:rentRec?rentRec.rentMonth:MONTH_NAMES[new Date().getMonth()], year:rentRec?rentRec.rentYear:new Date().getFullYear(),
    rentAmount:formatCurrency(rentRec?rentRec.rentAmount:t.monthlyRent),
    electricityAmount:formatCurrency(0), otherCharges:formatCurrency(rentRec?rentRec.otherCharges:0),
    previousDue:formatCurrency(rentRec?rentRec.previousRentDue:0),
    totalPayable:formatCurrency(rentRec?rentTotalPayable(rentRec):t.monthlyRent),
    dueDate:formatDate(todayISO()), ownerSignatureName:db.settings.ownerSignatureName||db.settings.ownerName||'Management'
  };
  return fillTemplate(db.settings.rentReminderTemplate, data);
}
function waRentOverdueReminder(t, unit, prop, dueDateISO){
  return `Dear ${t.name},\n\nYour rent for ${prop?prop.name:''}, Unit ${unit?unit.unitNumber:''} was due on ${formatDate(dueDateISO)} and is now overdue. Kindly arrange payment at the earliest to avoid late fees.\n\nRegards,\n${db.settings.ownerSignatureName||db.settings.ownerName||'Management'}`;
}
function waElectricityReminder(t, unit, prop, bill){
  const data = {
    tenantName:t.name, propertyName:prop?prop.name:'', unitNumber:unit?unit.unitNumber:'',
    month:bill.billingMonth, year:bill.billingYear, unitsConsumed:billUnitsConsumed(bill), ratePerUnit:formatCurrency(bill.ratePerUnit),
    electricityAmount:formatCurrency(billElectricityCharge(bill)), previousDue:formatCurrency(bill.previousOutstanding),
    totalPayable:formatCurrency(billTotalPayable(bill)), ownerSignatureName:db.settings.ownerSignatureName||db.settings.ownerName||'Management'
  };
  return fillTemplate(db.settings.electricityReminderTemplate, data);
}
function waCombinedBillReminder(t, unit, prop, c){
  const data = {
    tenantName:t.name, propertyName:prop?prop.name:'', unitNumber:unit?unit.unitNumber:'',
    month:c.month, year:c.year, rentAmount:formatCurrency(c.rentAmount), maintenanceAmount:formatCurrency(c.maintenance),
    electricityAmount:formatCurrency(c.electricity), waterAmount:formatCurrency(c.water), parkingAmount:formatCurrency(c.parking),
    otherCharges:formatCurrency(c.other), previousDue:formatCurrency((Number(c.previousRentDue)||0)+(Number(c.previousElectricityDue)||0)),
    totalPayable:formatCurrency(combinedTotalPayable(c)), ownerSignatureName:db.settings.ownerSignatureName||db.settings.ownerName||'Management'
  };
  return fillTemplate(db.settings.combinedBillReminderTemplate, data);
}
function waPartialBalanceReminder(t, unit, prop, balance, context){
  return `Dear ${t.name},\n\nA partial payment balance of ${formatCurrency(balance)} remains outstanding for ${prop?prop.name:''}, Unit ${unit?unit.unitNumber:''} (${context||'account'}). Kindly clear the balance at your convenience.\n\nRegards,\n${db.settings.ownerSignatureName||db.settings.ownerName||'Management'}`;
}
function waAgreementExpiryReminder(t, unit, prop, agreement){
  return `Dear ${t.name},\n\nYour rental agreement for ${prop?prop.name:''}, Unit ${unit?unit.unitNumber:''} is due to expire on ${formatDate(agreement.endDate)}. Kindly let us know if you wish to renew or vacate.\n\nRegards,\n${db.settings.ownerSignatureName||db.settings.ownerName||'Management'}`;
}
function waDepositSettlementReminder(t, unit, prop, deposit){
  return `Dear ${t.name},\n\nRegarding your security deposit of ${formatCurrency(deposit.depositAmount)} for ${prop?prop.name:''}, Unit ${unit?unit.unitNumber:''}: refundable amount is ${formatCurrency(deposit.refundableAmount||deposit.depositAmount)} after adjustments. We will process settlement shortly.\n\nRegards,\n${db.settings.ownerSignatureName||db.settings.ownerName||'Management'}`;
}
function waAcknowledgementReminder(t, unit, prop, amount, purpose, dateISO){
  const data = {
    tenantName:t.name, propertyName:prop?prop.name:'', unitNumber:unit?unit.unitNumber:'',
    amountReceived:formatCurrency(amount), purpose:purpose||'payment', paymentDate:formatDate(dateISO||todayISO()),
    ownerSignatureName:db.settings.ownerSignatureName||db.settings.ownerName||'Management'
  };
  return fillTemplate(db.settings.paymentAcknowledgementTemplate, data);
}
// Central dispatcher used by all "Send WhatsApp Reminder" buttons across the
// app (tenant profile, outstanding lists, agreement list, monthly bill list).
function sendWhatsAppReminder(kind, recordId){
  let tenant, unit, prop, message;
  switch(kind){
    case 'tenant-general':{
      tenant = tenantById(recordId); if(!tenant) return;
      unit = unitById(tenant.unitId); prop = unit?propertyById(unit.propertyId):null;
      message = waRentReminder(tenant, unit, prop, null);
      break;
    }
    case 'rent':{
      const r = db.rentPayments.find(x=>x.id===recordId); if(!r) return;
      tenant = tenantById(r.tenantId); unit = unitById(r.unitId); prop = unit?propertyById(unit.propertyId):null;
      message = rentBalanceDue(r)>0 ? waPartialBalanceReminder(tenant, unit, prop, rentBalanceDue(r), 'rent') : waRentReminder(tenant, unit, prop, r);
      break;
    }
    case 'electricity':{
      const b = db.electricityBills.find(x=>x.id===recordId); if(!b) return;
      tenant = tenantById(b.tenantId); unit = unitById(b.unitId); prop = unit?propertyById(unit.propertyId):null;
      message = waElectricityReminder(tenant, unit, prop, b);
      break;
    }
    case 'combined':{
      const c = db.combinedBills.find(x=>x.id===recordId); if(!c) return;
      tenant = tenantById(c.tenantId); unit = unitById(c.unitId); prop = unit?propertyById(unit.propertyId):null;
      message = waCombinedBillReminder(tenant, unit, prop, c);
      break;
    }
    case 'agreement':{
      const a = db.agreements.find(x=>x.id===recordId); if(!a) return;
      tenant = tenantById(a.tenantId); unit = unitById(a.unitId); prop = unit?propertyById(unit.propertyId):null;
      message = waAgreementExpiryReminder(tenant, unit, prop, a);
      break;
    }
    case 'deposit':{
      const d = db.deposits.find(x=>x.id===recordId); if(!d) return;
      tenant = tenantById(d.tenantId); unit = unitById(d.unitId); prop = unit?propertyById(unit.propertyId):null;
      message = waDepositSettlementReminder(tenant, unit, prop, d);
      break;
    }
    default: return;
  }
  if(!tenant){ alert('Tenant not found for this record.'); return; }
  openWhatsAppReminderModal(tenant, message);
}

/* ---------------------------------------------------------------------- */
/* DASHBOARD                                                              */
/* ---------------------------------------------------------------------- */
/* ---------------------------------------------------------------------- */
/* NATIVE SVG CHARTS — no external chart library, works fully offline.    */
/* ---------------------------------------------------------------------- */
const CHART_COLORS = {blue:'#0b3d66', accent:'#1565c0', green:'#2e7d32', orange:'#fb8c00', red:'#e53935', purple:'#6a1b9a', grey:'#9aa7b3'};
function svgEmptyState(label){
  return `<div class="empty-note">${escapeHtml(label||'No data available for this selection yet.')}</div>`;
}
// Horizontal grouped bar chart — up to 2 series per row (e.g. Expected vs Collected).
function svgGroupedHBarChart(items, seriesLabels, colors){
  if(!items.length) return svgEmptyState();
  const w = 640, leftPad = 130, rightPad = 90, rowH = 46, gap = 10, topPad = 10;
  const max = Math.max(1, ...items.map(it=>Math.max(it.a||0, it.b!==undefined?it.b:0)));
  const h = topPad*2 + items.length*(rowH+gap);
  const bars = items.map((it,i)=>{
    const y = topPad + i*(rowH+gap);
    const barAreaW = w-leftPad-rightPad;
    const wA = Math.max(2, barAreaW*((it.a||0)/max));
    const hasB = it.b!==undefined;
    const wB = hasB ? Math.max(2, barAreaW*((it.b||0)/max)) : 0;
    return `
      <text x="${leftPad-8}" y="${y+12}" text-anchor="end" font-size="11" fill="#333">${escapeHtml(it.label)}</text>
      <rect x="${leftPad}" y="${y}" width="${wA}" height="14" rx="3" fill="${colors[0]}"></rect>
      <text x="${leftPad+wA+6}" y="${y+11}" font-size="10.5" fill="#333">${escapeHtml(formatCurrency(it.a||0))}</text>
      ${hasB?`<rect x="${leftPad}" y="${y+18}" width="${wB}" height="14" rx="3" fill="${colors[1]}"></rect>
      <text x="${leftPad+wB+6}" y="${y+29}" font-size="10.5" fill="#333">${escapeHtml(formatCurrency(it.b||0))}</text>`:''}
    `;
  }).join('');
  const legend = `<div class="chart-legend"><span><span class="sw" style="background:${colors[0]}"></span>${escapeHtml(seriesLabels[0])}</span>${seriesLabels[1]?`<span><span class="sw" style="background:${colors[1]}"></span>${escapeHtml(seriesLabels[1])}</span>`:''}</div>`;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="chart">${bars}</svg>${legend}`;
}
// Simple donut chart for 2+ segments (e.g. Occupied vs Vacant, expense categories).
function svgDonutChart(segments){
  segments = segments.filter(s=>s.value>0);
  if(!segments.length) return svgEmptyState();
  const total = segments.reduce((s,x)=>s+x.value,0);
  const cx=90, cy=90, r=70, sw=28;
  let angle = -90;
  const circumference = 2*Math.PI*r;
  const arcs = segments.map(seg=>{
    const frac = seg.value/total;
    const dash = frac*circumference;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${sw}" stroke-dasharray="${dash} ${circumference-dash}" stroke-dashoffset="${-((angle+90)/360)*circumference}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    angle += frac*360;
    return arc;
  }).join('');
  const legend = `<div class="chart-legend">${segments.map(s=>`<span><span class="sw" style="background:${s.color}"></span>${escapeHtml(s.label)}: ${escapeHtml(formatCurrency(s.value))} (${Math.round((s.value/total)*100)}%)</span>`).join('')}</div>`;
  return `<svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="donut chart" style="max-width:220px;margin:0 auto;display:block;">${arcs}<text x="90" y="94" text-anchor="middle" font-size="13" fill="#333">${escapeHtml(formatCurrency(total))}</text></svg>${legend}`;
}
function monthKeysInRange(fromDate, toDate, fallbackCount){
  const keys = [];
  if(fromDate && toDate){
    let d = new Date(fromDate.slice(0,7)+'-01T00:00:00');
    const end = new Date(toDate.slice(0,7)+'-01T00:00:00');
    let guard = 0;
    while(d<=end && guard<24){ keys.push(d.toISOString().slice(0,7)); d.setMonth(d.getMonth()+1); guard++; }
  }else{
    const now = new Date();
    for(let i=fallbackCount-1;i>=0;i--){
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      keys.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
    }
  }
  return keys;
}
function monthKeyLabel(key){
  const [y,m] = key.split('-');
  return MONTH_NAMES[Number(m)-1].slice(0,3)+' '+y;
}
state.analytics = state.analytics || {propertyId:'all', from:'', to:'', collapsed:true};
function analyticsPropertyMatches(propertyId){ return state.analytics.propertyId==='all' || state.analytics.propertyId===propertyId; }
function renderAnalytics(){
  const a = state.analytics;
  const months = monthKeysInRange(a.from, a.to, 6);

  const rentItems = months.map(mk=>{
    const [y,m] = mk.split('-'); const monthName = MONTH_NAMES[Number(m)-1];
    const recs = db.rentPayments.filter(r=>r.rentMonth===monthName && String(r.rentYear)===String(Number(y)) && (a.propertyId==='all'||(unitById(r.unitId)&&unitById(r.unitId).propertyId===a.propertyId)));
    return {label:monthKeyLabel(mk), a:recs.reduce((s,r)=>s+rentTotalPayable(r),0), b:recs.reduce((s,r)=>s+(Number(r.amountReceived)||0),0)};
  });
  const elecItems = months.map(mk=>{
    const [y,m] = mk.split('-'); const monthName = MONTH_NAMES[Number(m)-1];
    const recs = db.electricityBills.filter(b=>b.billingMonth===monthName && String(b.billingYear)===String(Number(y)) && (a.propertyId==='all'||(unitById(b.unitId)&&unitById(b.unitId).propertyId===a.propertyId)));
    return {label:monthKeyLabel(mk), a:recs.reduce((s,b)=>s+billTotalPayable(b),0), b:recs.reduce((s,b)=>s+(Number(b.amountPaid)||0),0)};
  });
  const incomeExpenseItems = months.map(mk=>{
    const rentRecs = db.rentPayments.filter(r=>(r.paymentDate||'').slice(0,7)===mk && (a.propertyId==='all'||(unitById(r.unitId)&&unitById(r.unitId).propertyId===a.propertyId)));
    const elecRecs = db.electricityBills.filter(b=>(b.paymentDate||'').slice(0,7)===mk && (a.propertyId==='all'||(unitById(b.unitId)&&unitById(b.unitId).propertyId===a.propertyId)));
    const expRecs = db.expenses.filter(e=>(e.date||'').slice(0,7)===mk && (a.propertyId==='all'||e.propertyId===a.propertyId));
    const income = rentRecs.reduce((s,r)=>s+(Number(r.amountReceived)||0),0) + elecRecs.reduce((s,b)=>s+(Number(b.amountPaid)||0),0);
    const expense = expRecs.reduce((s,e)=>s+(Number(e.amount)||0),0);
    return {label:monthKeyLabel(mk), a:income, b:expense};
  });
  const outstandingByProperty = db.properties.filter(p=>analyticsPropertyMatches(p.id)).map(p=>{
    const s = propertyStats(p.id);
    return {label:p.name, a:s.totalOutstanding};
  });
  const unitsInScope = db.units.filter(u=>analyticsPropertyMatches(u.propertyId));
  const occVacSegments = [
    {label:'Occupied', value:unitsInScope.filter(u=>u.status==='Occupied').length, color:CHART_COLORS.green},
    {label:'Vacant', value:unitsInScope.filter(u=>u.status==='Vacant').length, color:CHART_COLORS.grey},
    {label:'Under Maintenance', value:unitsInScope.filter(u=>u.status==='Under Maintenance').length, color:CHART_COLORS.orange},
    {label:'Reserved', value:unitsInScope.filter(u=>u.status==='Reserved').length, color:CHART_COLORS.accent}
  ];
  const expensesInScope = db.expenses.filter(e=>analyticsPropertyMatches(e.propertyId) && (!a.from||e.date>=a.from) && (!a.to||e.date<=a.to));
  const expenseByCategory = {};
  expensesInScope.forEach(e=>{ expenseByCategory[e.category] = (expenseByCategory[e.category]||0)+(Number(e.amount)||0); });
  const expenseColors = [CHART_COLORS.blue,CHART_COLORS.accent,CHART_COLORS.orange,CHART_COLORS.purple,CHART_COLORS.red,CHART_COLORS.green,CHART_COLORS.grey];
  const expenseSegments = Object.keys(expenseByCategory).map((cat,i)=>({label:cat, value:expenseByCategory[cat], color:expenseColors[i%expenseColors.length]}));

  const propOpts = ['<option value="all">All Properties</option>'].concat(db.properties.map(p=>`<option value="${p.id}" ${a.propertyId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`)).join('');

  return `
    <div class="section-title analytics-toggle no-print" data-action="toggle-analytics">📈 Analytics ${a.collapsed?'▸':'▾'}</div>
    ${a.collapsed?'':`
    <div class="toolbar no-print">
      <select id="anaProperty">${propOpts}</select>
      <label style="font-size:12.5px;">From <input type="date" id="anaFrom" value="${escapeHtml(a.from)}"></label>
      <label style="font-size:12.5px;">To <input type="date" id="anaTo" value="${escapeHtml(a.to)}"></label>
    </div>
    <div class="chart-block"><h4>Monthly Rent Expected vs Collected</h4>${svgGroupedHBarChart(rentItems, ['Expected','Collected'], [CHART_COLORS.blue, CHART_COLORS.green])}</div>
    <div class="chart-block"><h4>Monthly Electricity Billed vs Collected</h4>${svgGroupedHBarChart(elecItems, ['Billed','Collected'], [CHART_COLORS.purple, CHART_COLORS.green])}</div>
    <div class="chart-block"><h4>Income vs Expense</h4>${svgGroupedHBarChart(incomeExpenseItems, ['Income','Expense'], [CHART_COLORS.green, CHART_COLORS.red])}</div>
    <div class="chart-block"><h4>Outstanding by Property</h4>${svgGroupedHBarChart(outstandingByProperty, ['Outstanding'], [CHART_COLORS.red])}</div>
    <div class="chart-block"><h4>Occupied vs Vacant Units</h4>${svgDonutChart(occVacSegments)}</div>
    <div class="chart-block"><h4>Expense Category Summary</h4>${svgDonutChart(expenseSegments)}</div>
    `}
  `;
}
function attachAnalyticsHandlers(){
  const p = document.getElementById('anaProperty'), from = document.getElementById('anaFrom'), to = document.getElementById('anaTo');
  if(p) p.addEventListener('change', ()=>{ state.analytics.propertyId = p.value; render(); });
  if(from) from.addEventListener('change', ()=>{ state.analytics.from = from.value; render(); });
  if(to) to.addEventListener('change', ()=>{ state.analytics.to = to.value; render(); });
}

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
    ${renderDashboardAlerts()}
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
    ${renderAnalytics()}
  `;
}
// A compact, high-visibility alert strip shown at the top of the Dashboard —
// separate from (and linking to) the full Notification Centre.
function renderDashboardAlerts(){
  const all = computeNotifications();
  const unread = all.filter(n=>!n.read);
  const top = unread.filter(n=>n.priority==='Urgent'||n.priority==='Important').slice(0,5);
  if(!unread.length) return '';
  const rows = top.map(n=>`
    <div class="notification-card unread priority-${n.priority}" style="margin-bottom:8px;">
      <div style="flex:1;min-width:0;cursor:pointer;" data-action="open-notification" data-linkview="${n.linkView}" data-linkid="${n.linkId||''}">
        <div style="font-weight:700;">${escapeHtml(n.title)}</div>
        <div style="font-size:12px;color:var(--muted);">${escapeHtml(n.module)} · <span class="badge ${notificationBadgeClass(n.priority)}">${n.priority}</span></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn sm secondary" data-action="mark-notification-read" data-nid="${n.id}">Mark Read</button>
        <button class="btn sm secondary" data-action="snooze-notification" data-nid="${n.id}">Snooze</button>
        <button class="btn sm danger" data-action="delete-notification" data-nid="${n.id}">Dismiss</button>
      </div>
    </div>`).join('');
  return `
    <div class="section-title">🔔 Alerts (${unread.length} unread)
      <button class="btn sm secondary no-print" data-action="goto" data-view="notifications">View All</button>
    </div>
    ${rows}
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
        <button class="btn secondary" data-action="whatsapp-reminder" data-kind="tenant-general" data-recid="${t.id}">💬 WhatsApp Reminder</button>
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
/* OCCUPANCY OVERVIEW (live property/floor/unit snapshot)                */
/* ---------------------------------------------------------------------- */
state.occupancy = state.occupancy || {propertyFilter:'all', floorFilter:'all', catFilter:'all', statusFilter:'all', expiringOnly:false};
function unitOutstanding(unit){
  const rentOut = db.rentPayments.filter(r=>r.unitId===unit.id).reduce((s,r)=>s+Math.max(0,rentBalanceDue(r)),0);
  const elecOut = db.electricityBills.filter(b=>b.unitId===unit.id).reduce((s,b)=>s+Math.max(0,billBalanceDue(b)),0);
  return rentOut+elecOut;
}
function unitAgreementExpiry(unit){
  const tenant = currentTenantForUnit(unit.id);
  if(!tenant) return null;
  const list = db.agreements.filter(a=>a.tenantId===tenant.id && a.renewalStatus!=='Terminated').slice().sort((a,b)=>a.endDate<b.endDate?1:-1);
  return list[0] ? list[0].endDate : null;
}
function unitMeterReadingDue(unit){
  const last = lastElectricityBillForUnit(unit.id);
  if(!last) return unit.status==='Occupied';
  const d = daysBetween(last.currReadingDate, todayISO());
  return d!==null && d>35;
}
function unitFloorsForProperty(propertyId){
  const floors = new Set();
  db.units.filter(u=>propertyId==='all' || u.propertyId===propertyId).forEach(u=>{ if(u.floor) floors.add(u.floor); });
  return Array.from(floors);
}
function renderOccupancy(){
  const oc = state.occupancy;
  let units = db.units.slice();
  if(oc.propertyFilter!=='all') units = units.filter(u=>u.propertyId===oc.propertyFilter);
  if(oc.floorFilter!=='all') units = units.filter(u=>u.floor===oc.floorFilter);
  if(oc.catFilter==='Residential') units = units.filter(u=>u.category==='Residential Flat');
  if(oc.catFilter==='Commercial') units = units.filter(u=>u.category && u.category!=='Residential Flat');
  if(oc.statusFilter!=='all') units = units.filter(u=>(u.status||'Vacant')===oc.statusFilter);
  if(oc.expiringOnly) units = units.filter(u=>{ const d=daysBetween(todayISO(), unitAgreementExpiry(u)); return d!==null && d>=0 && d<=90; });

  const allUnits = oc.propertyFilter==='all' ? db.units : db.units.filter(u=>u.propertyId===oc.propertyFilter);
  const occupied = allUnits.filter(u=>u.status==='Occupied').length;
  const vacant = allUnits.filter(u=>u.status==='Vacant').length;
  const residential = allUnits.filter(u=>u.category==='Residential Flat').length;
  const commercial = allUnits.filter(u=>u.category && u.category!=='Residential Flat').length;
  const occPct = allUnits.length ? Math.round((occupied/allUnits.length)*100) : 0;
  const vacantRentPotential = allUnits.filter(u=>u.status==='Vacant').reduce((s,u)=>s+(Number(u.monthlyRent)||0),0);
  const summaryCards = [
    {n:allUnits.length, l:'Total Units'}, {n:occupied, l:'Occupied Units'}, {n:vacant, l:'Vacant Units'},
    {n:residential, l:'Residential Units'}, {n:commercial, l:'Commercial Units'},
    {n:occPct+'%', l:'Occupancy Percentage'}, {n:formatCurrency(vacantRentPotential), l:'Vacant Monthly Rent Potential'}
  ].map(c=>`<div class="card"><div class="num">${c.n}</div><div class="lbl">${c.l}</div></div>`).join('');

  const propOpts = ['<option value="all">All Properties</option>'].concat(db.properties.map(p=>`<option value="${p.id}" ${oc.propertyFilter===p.id?'selected':''}>${escapeHtml(p.name)}</option>`)).join('');
  const floorOpts = ['<option value="all">All Floors</option>'].concat(unitFloorsForProperty(oc.propertyFilter).map(f=>`<option value="${escapeHtml(f)}" ${oc.floorFilter===f?'selected':''}>${escapeHtml(f)}</option>`)).join('');
  const catOpts = ['all','Residential','Commercial'].map(c=>`<option value="${c}" ${oc.catFilter===c?'selected':''}>${c==='all'?'All Types':c}</option>`).join('');
  const statusOpts = ['<option value="all">All Status</option>'].concat(UNIT_STATUSES.map(s=>`<option value="${s}" ${oc.statusFilter===s?'selected':''}>${s}</option>`)).join('');

  // Group filtered units by property, then by floor.
  const byProperty = {};
  units.forEach(u=>{ (byProperty[u.propertyId] = byProperty[u.propertyId]||[]).push(u); });
  const groupsHtml = Object.keys(byProperty).map(pid=>{
    const prop = propertyById(pid);
    const propUnits = byProperty[pid];
    const byFloor = {};
    propUnits.forEach(u=>{ const f = u.floor||'(No floor set)'; (byFloor[f]=byFloor[f]||[]).push(u); });
    const floorsHtml = Object.keys(byFloor).sort().map(floor=>{
      const cards = byFloor[floor].map(u=>{
        const tenant = currentTenantForUnit(u.id);
        const expiry = unitAgreementExpiry(u);
        const outstanding = unitOutstanding(u);
        const meterDue = unitMeterReadingDue(u);
        const statusClass = u.status==='Occupied'?'badge-green':u.status==='Vacant'?'badge-grey':u.status==='Under Maintenance'?'badge-orange':'badge-blue';
        return `<div class="occ-unit-card">
          <div class="occ-head"><b>${escapeHtml(u.unitNumber)}</b><span class="badge ${statusClass}">${escapeHtml(u.status)||'Vacant'}</span></div>
          <div class="occ-meta">
            Floor: ${escapeHtml(floor)} · ${escapeHtml(u.category)||'—'}<br>
            Tenant: ${escapeHtml(tenant?tenant.name:'—')} · Rent: ${formatCurrency(u.monthlyRent)}<br>
            Agreement Expiry: ${expiry?formatDate(expiry):'—'} · Outstanding: ${formatCurrency(outstanding)}<br>
            Meter Reading: ${meterDue?'<span class="badge badge-orange">Due</span>':'<span class="badge badge-green">Up to date</span>'}
          </div>
          <div class="no-print" style="margin-top:8px;"><button class="btn sm secondary" data-action="view-unit" data-id="${u.id}">Open Unit</button></div>
        </div>`;
      }).join('');
      return `<div class="section-title" style="margin-top:14px;">Floor: ${escapeHtml(floor)}</div><div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">${cards}</div>`;
    }).join('');
    return `<div class="property-card"><h3>🏢 ${escapeHtml(prop?prop.name:'—')}</h3>${floorsHtml}</div>`;
  }).join('') || '<div class="empty-note">No units match the selected filters.</div>';

  return moreSubtabsHTML('occupancy') + `
    <div class="cards-grid">${summaryCards}</div>
    <div class="toolbar no-print">
      <select id="occProperty">${propOpts}</select>
      <select id="occFloor">${floorOpts}</select>
      <select id="occCat">${catOpts}</select>
      <select id="occStatus">${statusOpts}</select>
      <label style="font-size:12.5px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="occExpiring" ${oc.expiringOnly?'checked':''}> Agreement expiring soon</label>
    </div>
    ${groupsHtml}
  `;
}
function attachOccupancyHandlers(){
  const oc = state.occupancy;
  const map = {occProperty:'propertyFilter', occFloor:'floorFilter', occCat:'catFilter', occStatus:'statusFilter'};
  Object.keys(map).forEach(elId=>{
    const el = document.getElementById(elId);
    if(el) el.addEventListener('change', ()=>{ oc[map[elId]] = el.value; if(elId==='occProperty') oc.floorFilter='all'; render(); });
  });
  const expiringBox = document.getElementById('occExpiring');
  if(expiringBox) expiringBox.addEventListener('change', ()=>{ oc.expiringOnly = expiringBox.checked; render(); });
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
        ${status!=='Paid'?`<button class="btn sm secondary" data-action="whatsapp-reminder" data-kind="rent" data-recid="${r.id}">💬</button>`:''}
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
/* ---------------------------------------------------------------------- */
/* PROFESSIONAL RECEIPT LAYOUT (shared by all 5 receipt types)            */
/* ---------------------------------------------------------------------- */
function professionalReceiptHTML(opts){
  const s = db.settings;
  const lines = (opts.lineItems||[]).filter(li=>li.value!==undefined && li.value!==null && li.value!=='')
    .map(li=>`<div class="slip-row"><span>${escapeHtml(li.label)}:</span><span>${li.value}</span></div>`).join('');
  return `
    <div class="print-slip receipt-pro">
      ${s.receiptHeader?`<div class="slip-custom-header">${escapeHtml(s.receiptHeader)}</div>`:''}
      <div class="slip-head">
        <h2>${escapeHtml(s.ownerName)||'Rental Manager'}</h2>
        ${opts.propertyName?`<div>${escapeHtml(opts.propertyName)}${opts.propertyAddress?(' — '+escapeHtml(opts.propertyAddress)):''}</div>`:''}
        <div>${s.ownerPhone?('Phone: '+escapeHtml(s.ownerPhone)+' '):''}${s.ownerEmail?('Email: '+escapeHtml(s.ownerEmail)):''}</div>
        <h3 style="margin:10px 0 0;">${escapeHtml(opts.title)}</h3>
      </div>
      <div class="slip-row"><span>Receipt No:</span><span>${escapeHtml(opts.receiptNo)}</span></div>
      <div class="slip-row"><span>Receipt Date:</span><span>${formatDate(opts.receiptDate)}</span></div>
      <div class="slip-row"><span>Tenant:</span><span>${escapeHtml(opts.tenantName)||'—'}</span></div>
      <div class="slip-row"><span>Unit Number:</span><span>${escapeHtml(opts.unitNumber)||'—'}</span></div>
      ${opts.billingMonth?`<div class="slip-row"><span>Billing Month:</span><span>${escapeHtml(opts.billingMonth)}</span></div>`:''}
      <div class="slip-body">
        ${lines}
        <hr>
        <div class="slip-row"><span><b>Total Payable</b></span><span><b>${formatCurrency(opts.totalPayable)}</b></span></div>
        <div class="slip-row"><span>Amount Received</span><span>${formatCurrency(opts.amountReceived)}</span></div>
        <div class="slip-row"><span><b>Balance Due</b></span><span><b>${formatCurrency(opts.balanceDue)}</b></span></div>
        <div class="slip-row"><span>Payment Mode:</span><span>${escapeHtml(opts.paymentMode)||'—'}</span></div>
        <div class="slip-row"><span>Transaction Reference:</span><span>${escapeHtml(opts.transactionRef)||'—'}</span></div>
        ${opts.remarks?`<div class="slip-row"><span>Remarks:</span><span>${escapeHtml(opts.remarks)}</span></div>`:''}
      </div>
      <div class="slip-sign">Authorised Signature<br>${escapeHtml(s.ownerSignatureName)||''}</div>
      ${s.receiptFooter?`<div class="slip-custom-footer">${escapeHtml(s.receiptFooter)}</div>`:''}
    </div>`;
}
function printReceiptDocument(areaId, html){
  getOrCreatePrintArea(areaId).innerHTML = html;
  document.body.classList.add('print-single-rx');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>document.body.classList.remove('print-single-rx'), 300);
  }, 50);
}
function shareReceiptText(summary){
  if(navigator.share){
    navigator.share({text:summary}).catch(()=>{});
  }else{
    alert('Direct sharing is not supported on this browser. Use Print → Save as PDF to share the receipt, or copy this summary:\n\n'+summary);
  }
}
function printRentReceipt(id){
  const r = db.rentPayments.find(x=>x.id===id);
  if(!r) return;
  const t = tenantById(r.tenantId), u = unitById(r.unitId), p = u?propertyById(u.propertyId):null;
  printReceiptDocument('printSlipArea', professionalReceiptHTML({
    title:'RENT RECEIPT', receiptNo:r.receiptNumber||r.id, receiptDate:r.paymentDate,
    propertyName:p?p.name:'', propertyAddress:p?p.address:'', tenantName:t?t.name:'', unitNumber:u?u.unitNumber:'',
    billingMonth:r.rentMonth+' '+r.rentYear,
    lineItems:[
      {label:'Rent', value:formatCurrency(r.rentAmount)},
      {label:'Maintenance', value:formatCurrency(r.maintenanceAmount)},
      {label:'Water', value:formatCurrency(r.waterCharge)},
      {label:'Parking', value:formatCurrency(r.parkingCharge)},
      {label:'Other Charges', value:formatCurrency(r.otherCharges)},
      {label:'Previous Due', value:formatCurrency(r.previousRentDue)},
      {label:'Late Fee', value:formatCurrency(r.lateFee)},
      {label:'Adjustment', value:formatCurrency(r.adjustment)}
    ],
    totalPayable:rentTotalPayable(r), amountReceived:r.amountReceived, balanceDue:rentBalanceDue(r),
    paymentMode:r.paymentMode, transactionRef:r.transactionRef, remarks:r.remarks
  }));
}
function shareRentReceipt(id){
  const r = db.rentPayments.find(x=>x.id===id); if(!r) return;
  const t = tenantById(r.tenantId);
  shareReceiptText(`Rent Receipt ${r.receiptNumber||r.id} — ${t?t.name:''} — ${r.rentMonth} ${r.rentYear} — Received ${formatCurrency(r.amountReceived)}, Balance ${formatCurrency(rentBalanceDue(r))}`);
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
        ${status!=='Paid'?`<button class="btn sm secondary" data-action="whatsapp-reminder" data-kind="electricity" data-recid="${b.id}">💬</button>`:''}
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
  printReceiptDocument('billPrintArea', professionalReceiptHTML({
    title:'ELECTRICITY RECEIPT', receiptNo:b.billNumber||b.id, receiptDate:b.paymentDate||b.currReadingDate,
    propertyName:p?p.name:'', propertyAddress:p?p.address:'', tenantName:t?t.name:'', unitNumber:u?u.unitNumber:'',
    billingMonth:b.billingMonth+' '+b.billingYear,
    lineItems:[
      {label:'Sub-meter Number', value:escapeHtml(b.subMeterNumber)||'—'},
      {label:'Previous Reading', value:b.prevReading+' ('+formatDate(b.prevReadingDate)+')'},
      {label:'Current Reading', value:b.currReading+' ('+formatDate(b.currReadingDate)+')'},
      {label:'Units Consumed', value:billUnitsConsumed(b)},
      {label:'Rate Per Unit', value:formatCurrency(b.ratePerUnit)},
      {label:'Electricity Charge', value:formatCurrency(billElectricityCharge(b))},
      {label:'Previous Due', value:formatCurrency(b.previousOutstanding)},
      {label:'Late Fee', value:formatCurrency(b.lateFee)},
      {label:'Adjustment', value:formatCurrency(b.adjustment)}
    ],
    totalPayable:billTotalPayable(b), amountReceived:b.amountPaid, balanceDue:billBalanceDue(b),
    paymentMode:b.paymentMode, transactionRef:'', remarks:b.remarks
  }));
}
function shareElectricityBill(id){
  const b = db.electricityBills.find(x=>x.id===id); if(!b) return;
  const t = tenantById(b.tenantId);
  shareReceiptText(`Electricity Bill ${b.billNumber||b.id} — ${t?t.name:''} — ${b.billingMonth} ${b.billingYear} — Total ${formatCurrency(billTotalPayable(b))}, Balance ${formatCurrency(billBalanceDue(b))}`);
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
// Displayed status for a combined/monthly bill. Draft/Finalised/Cancelled
// are explicit user-controlled states; Partly Paid/Paid/Overdue are derived
// live from the amounts so they always reflect reality even if the record
// was migrated from an older version.
function combinedBillDisplayStatus(c){
  if(c.status==='Cancelled') return 'Cancelled';
  const totalPayable = combinedTotalPayable(c);
  const bal = combinedBalanceDue(c);
  if(totalPayable>0 && bal<=0) return 'Paid';
  if((Number(c.amountReceived)||0)>0) return 'Partly Paid';
  if(c.status==='Draft') return 'Draft';
  const mIdx = MONTH_NAMES.indexOf(c.month);
  if(mIdx>=0){
    const billEndOfMonth = c.year+'-'+String(mIdx+1).padStart(2,'0')+'-28';
    const d = daysBetween(billEndOfMonth, todayISO());
    if(d!==null && d>10) return 'Overdue';
  }
  return 'Finalised';
}
function combinedBillStatusBadgeClass(status){
  if(status==='Paid') return 'badge-green';
  if(status==='Partly Paid') return 'badge-orange';
  if(status==='Overdue') return 'badge-red';
  if(status==='Draft') return 'badge-grey';
  if(status==='Cancelled') return 'badge-grey';
  return 'badge-blue';
}
function renderCombinedBills(){
  const list = filteredCombinedBills();
  const rows = list.map(c=>{
    const t = tenantById(c.tenantId), u = unitById(c.unitId);
    const status = combinedBillDisplayStatus(c);
    return `<tr>
      <td>${escapeHtml(c.billNumber||c.id)}</td><td>${escapeHtml(t?t.name:'—')}</td><td>${escapeHtml(u?u.unitNumber:'—')}</td>
      <td>${c.month} ${c.year}</td><td>${formatCurrency(combinedTotalPayable(c))}</td><td>${formatCurrency(c.amountReceived)}</td>
      <td><span class="badge ${combinedBillStatusBadgeClass(status)}">${status}</span></td>
      <td class="actions-cell">
        <button class="btn sm secondary" data-action="print-combined-bill" data-id="${c.id}">Print</button>
        ${status!=='Paid'&&status!=='Cancelled'?`<button class="btn sm secondary" data-action="whatsapp-reminder" data-kind="combined" data-recid="${c.id}">💬</button>`:''}
        ${status==='Draft'?`<button class="btn sm secondary" data-action="finalise-combined-bill" data-id="${c.id}">Finalise</button>`:''}
        <button class="btn sm secondary" data-action="edit-combined-bill" data-id="${c.id}">Record Payment</button>
        ${status==='Draft'||status==='Finalised'?`<button class="btn sm danger" data-action="cancel-combined-bill" data-id="${c.id}">Cancel</button>`:''}
        <button class="btn sm danger" data-action="delete-combined-bill" data-id="${c.id}">Delete</button>
      </td></tr>`;
  }).join('');
  return moreSubtabsHTML('combinedBills') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search by tenant..." value="${escapeHtml(state.search)}">
      <div class="spacer"></div>
      <button class="btn secondary" data-action="goto" data-view="billingCentre">🧮 Monthly Billing Centre</button>
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
      if(combinedBillDisplayStatus(existing)==='Paid' && !confirm('This bill is already marked Paid. Editing a paid bill is unusual — continue anyway?')) return;
      Object.assign(existing, vals, {tenantId, unitId, allocation});
    }else{
      db.combinedBills.push(Object.assign({id:nextId('CMB','combinedBill'), billNumber:nextCombinedBillNumber(vals.year), tenantId, unitId, allocation, status:'Finalised', createdAt:todayISO()}, vals));
    }
    saveDB();
    goto('combinedBills');
  });
}
function printCombinedBill(id){
  const c = db.combinedBills.find(x=>x.id===id);
  if(!c) return;
  const t = tenantById(c.tenantId), u = unitById(c.unitId), p = u?propertyById(u.propertyId):null;
  printReceiptDocument('combinedPrintArea', professionalReceiptHTML({
    title:'COMBINED MONTHLY RECEIPT', receiptNo:c.billNumber||c.id, receiptDate:c.paymentDate||c.createdAt,
    propertyName:p?p.name:'', propertyAddress:p?p.address:'', tenantName:t?t.name:'', unitNumber:u?u.unitNumber:'',
    billingMonth:c.month+' '+c.year,
    lineItems:[
      {label:'Rent', value:formatCurrency(c.rentAmount)},
      {label:'Maintenance', value:formatCurrency(c.maintenance)},
      {label:'Electricity', value:formatCurrency(c.electricity)},
      {label:'Water', value:formatCurrency(c.water)},
      {label:'Parking', value:formatCurrency(c.parking)},
      {label:'Other Charges', value:formatCurrency(c.other)},
      {label:'Previous Rent Due', value:formatCurrency(c.previousRentDue)},
      {label:'Previous Electricity Due', value:formatCurrency(c.previousElectricityDue)},
      {label:'Late Fee', value:formatCurrency(c.lateFee)},
      {label:'Adjustment', value:formatCurrency(c.adjustment)}
    ],
    totalPayable:combinedTotalPayable(c), amountReceived:c.amountReceived, balanceDue:combinedBalanceDue(c),
    paymentMode:c.paymentMode, transactionRef:'', remarks:c.remarks
  }));
}
function shareCombinedBill(id){
  const c = db.combinedBills.find(x=>x.id===id); if(!c) return;
  const t = tenantById(c.tenantId);
  shareReceiptText(`Combined Bill ${c.billNumber||c.id} — ${t?t.name:''} — ${c.month} ${c.year} — Total ${formatCurrency(combinedTotalPayable(c))}, Balance ${formatCurrency(combinedBalanceDue(c))}`);
}

/* ---------------------------------------------------------------------- */
/* MONTHLY BILLING CENTRE (batch draft generation for combined bills)    */
/* ---------------------------------------------------------------------- */
state.billingCentre = state.billingCentre || {propertyId:'all', month:MONTH_NAMES[new Date().getMonth()], year:new Date().getFullYear(), preview:null};
function occupiedUnitsForBillingCentre(propertyId){
  return db.units.filter(u=>u.status==='Occupied' && (propertyId==='all' || u.propertyId===propertyId));
}
// Computes (without saving) what a combined bill for this unit/month would
// look like, using the unit's own recurring charges plus any already-saved
// electricity bill and outstanding previous dues for its current tenant.
function draftBillForUnit(unit, month, year){
  const tenant = currentTenantForUnit(unit.id);
  if(!tenant) return null;
  const prop = propertyById(unit.propertyId);
  const elecBill = db.electricityBills.find(b=>b.unitId===unit.id && b.billingMonth===month && String(b.billingYear)===String(year));
  const prevRentOutstanding = db.rentPayments.filter(r=>r.unitId===unit.id && !(r.rentMonth===month && String(r.rentYear)===String(year))).reduce((s,r)=>s+Math.max(0,rentBalanceDue(r)),0);
  const lastElec = lastElectricityBillForUnit(unit.id);
  const prevElecOutstanding = (lastElec && !(lastElec.billingMonth===month && String(lastElec.billingYear)===String(year))) ? Math.max(0,billBalanceDue(lastElec)) : 0;
  const lateFee = db.settings.lateFeeEnabled ? (Number(db.settings.defaultLateFee)||0) : 0;
  const draft = {
    tenantId:tenant.id, unitId:unit.id, propertyId:unit.propertyId,
    tenantName:tenant.name, unitNumber:unit.unitNumber, propertyName:prop?prop.name:'',
    month, year,
    rentAmount:Number(unit.monthlyRent)||0, maintenance:Number(unit.maintenanceCharge)||0,
    electricity: elecBill ? billElectricityCharge(elecBill) : 0,
    water:Number(unit.waterCharge)||0, parking:Number(unit.parkingCharge)||0, other:Number(unit.otherMonthlyCharge)||0,
    previousRentDue:prevRentOutstanding, previousElectricityDue:prevElecOutstanding,
    lateFee, adjustment:0, amountReceived:0, paymentMode:'Cash', remarks: elecBill?'':'Electricity bill not yet generated for this month — add manually if needed.'
  };
  draft.totalPayable = combinedTotalPayable(draft);
  draft.existing = db.combinedBills.find(c=>c.unitId===unit.id && c.month===month && String(c.year)===String(year)) || null;
  return draft;
}
function renderBillingCentre(){
  const bc = state.billingCentre;
  const propOpts = ['<option value="all">All Properties</option>'].concat(db.properties.map(p=>`<option value="${p.id}" ${bc.propertyId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`)).join('');
  const monthOpts = MONTH_NAMES.map(m=>`<option value="${m}" ${bc.month===m?'selected':''}>${m}</option>`).join('');
  let previewHtml = '';
  if(bc.preview){
    if(!bc.preview.length){
      previewHtml = '<div class="empty-note">No occupied units found for this selection.</div>';
    }else{
      const rows = bc.preview.map((d,i)=>`<tr>
        <td>${escapeHtml(d.propertyName)}</td><td>${escapeHtml(d.unitNumber)}</td><td>${escapeHtml(d.tenantName)}</td>
        <td>${formatCurrency(d.rentAmount)}</td><td>${formatCurrency(d.electricity)}</td>
        <td>${formatCurrency(d.previousRentDue+d.previousElectricityDue)}</td><td>${formatCurrency(d.totalPayable)}</td>
        <td>${d.existing?`<span class="badge badge-orange">Bill exists (${combinedBillDisplayStatus(d.existing)})</span>`:'<span class="badge badge-green">Will create Draft</span>'}</td>
        <td class="actions-cell">${d.existing?`<button class="btn sm secondary" data-action="goto" data-view="combinedBillForm" data-id="${d.existing.id}">View Existing</button>`:''}</td>
      </tr>`).join('');
      previewHtml = `
        <div class="table-wrap"><table><thead><tr><th>Property</th><th>Unit</th><th>Tenant</th><th>Rent</th><th>Electricity</th><th>Previous Due</th><th>Total Payable</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        <div class="form-actions">
          <button class="btn grey" id="bcCancelPreview">Cancel Preview</button>
          <button class="btn" id="bcConfirmSave">✅ Confirm &amp; Save New Drafts</button>
        </div>
        <p style="font-size:12px;color:var(--muted);">Units that already have a bill for this month are skipped automatically — open "View Existing" to update or record payment instead. This never overwrites an existing bill.</p>
      `;
    }
  }
  return moreSubtabsHTML('billingCentre') + `
    <div class="form-section">
      <h3>🧮 Generate Monthly Bills</h3>
      <div class="form-grid">
        <div class="form-field"><label>Property</label><select id="bcProperty">${propOpts}</select></div>
        <div class="form-field"><label>Billing Month</label><select id="bcMonth">${monthOpts}</select></div>
        <div class="form-field"><label>Billing Year</label><input id="bcYear" type="number" value="${bc.year}"></div>
      </div>
      <div class="form-actions"><button class="btn" id="bcPreviewBtn">👁️ Preview</button></div>
    </div>
    ${previewHtml}
  `;
}
function attachBillingCentreHandlers(){
  const bc = state.billingCentre;
  const propSel = document.getElementById('bcProperty'), monthSel = document.getElementById('bcMonth'), yearInput = document.getElementById('bcYear');
  const previewBtn = document.getElementById('bcPreviewBtn');
  if(previewBtn) previewBtn.addEventListener('click', ()=>{
    bc.propertyId = propSel.value; bc.month = monthSel.value; bc.year = Number(yearInput.value)||bc.year;
    const units = occupiedUnitsForBillingCentre(bc.propertyId);
    bc.preview = units.map(u=>draftBillForUnit(u, bc.month, bc.year)).filter(Boolean);
    render();
  });
  const cancelBtn = document.getElementById('bcCancelPreview');
  if(cancelBtn) cancelBtn.addEventListener('click', ()=>{ bc.preview = null; render(); });
  const confirmBtn = document.getElementById('bcConfirmSave');
  if(confirmBtn) confirmBtn.addEventListener('click', ()=>{
    const toCreate = bc.preview.filter(d=>!d.existing);
    if(!toCreate.length){ alert('Nothing to save — every selected unit already has a bill for this month.'); return; }
    if(!confirm(`Create ${toCreate.length} new draft bill(s) for ${bc.month} ${bc.year}? You can review and Finalise each one afterwards.`)) return;
    toCreate.forEach(d=>{
      db.combinedBills.push({
        id:nextId('CMB','combinedBill'), billNumber:nextCombinedBillNumber(d.year), tenantId:d.tenantId, unitId:d.unitId, status:'Draft', createdAt:todayISO(),
        month:d.month, year:d.year, rentAmount:d.rentAmount, maintenance:d.maintenance, electricity:d.electricity,
        water:d.water, parking:d.parking, other:d.other, previousRentDue:d.previousRentDue, previousElectricityDue:d.previousElectricityDue,
        lateFee:d.lateFee, adjustment:d.adjustment, amountReceived:0, paymentMode:'Cash', remarks:d.remarks
      });
    });
    saveDB();
    bc.preview = null;
    alert(toCreate.length+' draft bill(s) created. Open Combined Bills to review, Finalise and print them.');
    goto('combinedBills');
  });
}

/* ---------------------------------------------------------------------- */
/* SECURITY DEPOSIT / DEPOSIT REFUND RECEIPTS                            */
/* ---------------------------------------------------------------------- */
function printDepositReceipt(id){
  const d = db.deposits.find(x=>x.id===id);
  if(!d) return;
  const t = tenantById(d.tenantId), u = unitById(d.unitId), p = u?propertyById(u.propertyId):null;
  printReceiptDocument('depositPrintArea', professionalReceiptHTML({
    title:'SECURITY DEPOSIT RECEIPT', receiptNo:d.receiptNumber||d.id, receiptDate:d.dateReceived,
    propertyName:p?p.name:'', propertyAddress:p?p.address:'', tenantName:t?t.name:'', unitNumber:u?u.unitNumber:'',
    lineItems:[
      {label:'Deposit Amount', value:formatCurrency(d.depositAmount)},
      {label:'Refundable Amount', value:formatCurrency(d.refundableAmount)},
      {label:'Refund Status', value:escapeHtml(d.refundStatus)||'Held'}
    ],
    totalPayable:d.depositAmount, amountReceived:d.depositAmount, balanceDue:0,
    paymentMode:d.paymentMode, transactionRef:'', remarks:d.remarks
  }));
}
function printDepositRefundReceipt(id){
  const d = db.deposits.find(x=>x.id===id);
  if(!d) return;
  const t = tenantById(d.tenantId), u = unitById(d.unitId), p = u?propertyById(u.propertyId):null;
  printReceiptDocument('depositRefundPrintArea', professionalReceiptHTML({
    title:'SECURITY DEPOSIT REFUND RECEIPT', receiptNo:(d.receiptNumber||d.id)+'-REFUND', receiptDate:d.refundDate||todayISO(),
    propertyName:p?p.name:'', propertyAddress:p?p.address:'', tenantName:t?t.name:'', unitNumber:u?u.unitNumber:'',
    lineItems:[
      {label:'Original Deposit', value:formatCurrency(d.depositAmount)},
      {label:'Adjustment Against Dues', value:formatCurrency(d.adjustmentAgainstDues)},
      {label:'Damage Deduction', value:formatCurrency(d.damageDeduction)},
      {label:'Other Deduction', value:formatCurrency(d.otherDeduction)}
    ],
    totalPayable:d.refundAmount, amountReceived:d.refundAmount, balanceDue:0,
    paymentMode:d.paymentMode, transactionRef:'', remarks:d.remarks
  }));
}

/* ---------------------------------------------------------------------- */
/* RECEIPT HISTORY (aggregated view across all 5 receipt types)          */
/* ---------------------------------------------------------------------- */
function allReceiptsList(){
  const out = [];
  db.rentPayments.forEach(r=>{
    const t = tenantById(r.tenantId), u = unitById(r.unitId);
    out.push({date:r.paymentDate, type:'Rent', no:r.receiptNumber||r.id, tenant:t?t.name:'—', unit:u?u.unitNumber:'—', amount:r.amountReceived, printAction:'print-rent-receipt', shareAction:'share-rent-receipt', id:r.id});
  });
  db.electricityBills.forEach(b=>{
    const t = tenantById(b.tenantId), u = unitById(b.unitId);
    out.push({date:b.paymentDate||b.currReadingDate, type:'Electricity', no:b.billNumber||b.id, tenant:t?t.name:'—', unit:u?u.unitNumber:'—', amount:b.amountPaid, printAction:'print-electricity-bill', shareAction:'share-electricity-bill', id:b.id});
  });
  db.combinedBills.forEach(c=>{
    const t = tenantById(c.tenantId), u = unitById(c.unitId);
    out.push({date:c.paymentDate||c.createdAt, type:'Combined Bill', no:c.billNumber||c.id, tenant:t?t.name:'—', unit:u?u.unitNumber:'—', amount:c.amountReceived, printAction:'print-combined-bill', shareAction:'share-combined-bill', id:c.id});
  });
  db.deposits.forEach(d=>{
    const t = tenantById(d.tenantId), u = unitById(d.unitId);
    out.push({date:d.dateReceived, type:'Security Deposit', no:d.receiptNumber||d.id, tenant:t?t.name:'—', unit:u?u.unitNumber:'—', amount:d.depositAmount, printAction:'print-deposit-receipt', shareAction:'', id:d.id});
    if(d.refundStatus==='Refunded'){
      out.push({date:d.refundDate||d.dateReceived, type:'Deposit Refund', no:(d.receiptNumber||d.id)+'-REFUND', tenant:t?t.name:'—', unit:u?u.unitNumber:'—', amount:d.refundAmount, printAction:'print-deposit-refund-receipt', shareAction:'', id:d.id});
    }
  });
  return out.sort((a,b)=>(a.date||'')<(b.date||'')?1:-1);
}
function renderReceiptHistory(){
  const q = (state.search||'').toLowerCase();
  const list = allReceiptsList().filter(r=>!q || [r.tenant,r.no,r.type].join(' ').toLowerCase().includes(q));
  const rows = list.map(r=>`<tr>
    <td>${formatDate(r.date)}</td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.no)}</td><td>${escapeHtml(r.tenant)}</td><td>${escapeHtml(r.unit)}</td><td>${formatCurrency(r.amount)}</td>
    <td class="actions-cell">
      <button class="btn sm secondary" data-action="${r.printAction}" data-id="${r.id}">Reprint</button>
      ${r.shareAction?`<button class="btn sm secondary" data-action="${r.shareAction}" data-id="${r.id}">Share</button>`:''}
    </td></tr>`).join('');
  return moreSubtabsHTML('receiptHistory') + `
    <div class="toolbar no-print">
      <input type="text" id="searchBox" placeholder="Search receipt history..." value="${escapeHtml(state.search)}">
    </div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Receipt/Bill No.</th><th>Tenant</th><th>Unit</th><th>Amount</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty-note">No receipts generated yet.</td></tr>'}</tbody></table></div>`;
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
        <button class="btn sm secondary" data-action="print-deposit-receipt" data-id="${d.id}">Print</button>
        ${d.refundStatus==='Refunded'?`<button class="btn sm secondary" data-action="print-deposit-refund-receipt" data-id="${d.id}">Refund Receipt</button>`:''}
        ${d.refundStatus==='Pending Refund'?`<button class="btn sm secondary" data-action="whatsapp-reminder" data-kind="deposit" data-recid="${d.id}">💬</button>`:''}
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
        ${expiring?`<button class="btn sm secondary" data-action="whatsapp-reminder" data-kind="agreement" data-recid="${a.id}">💬</button>`:''}
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
// Priority tiers (v1.4.0): Urgent > Important > Upcoming > Information.
function priorityFromDays(d){
  if(d===null) return 'Information';
  if(d<0) return 'Urgent';
  if(d<=7) return 'Urgent';
  if(d<=30) return 'Important';
  if(d<=60) return 'Upcoming';
  return 'Information';
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
      list.push({id:'rentpartial-'+rec.id, title:`Partial rent payment balance: ${t.name} (${formatCurrency(rentBalanceDue(rec))})`, module:'Rent Collection', date:rec.paymentDate, priority:'Important', linkView:'rent', linkId:null});
    }
  });

  // Electricity overdue / partial + meter reading due
  activeTenants().forEach(t=>{
    const unit = unitById(t.unitId);
    if(!unit) return;
    const lastBill = lastElectricityBillForUnit(unit.id);
    if(!lastBill){
      list.push({id:'meterdue-'+unit.id, title:`Meter reading due: ${unit.unitNumber} (no bill generated yet)`, module:'Electricity', date:today, priority:'Upcoming', linkView:'electricityForm', linkId:null});
    }else{
      const daysSince = daysBetween(lastBill.currReadingDate, today);
      if(daysSince!==null && daysSince>35){
        list.push({id:'meterdue-'+lastBill.id, title:`Meter reading due: ${unit.unitNumber} (last reading ${formatDate(lastBill.currReadingDate)})`, module:'Electricity', date:lastBill.currReadingDate, priority:'Upcoming', linkView:'electricity', linkId:null});
      }
      const bal = billBalanceDue(lastBill);
      if(bal>0){
        list.push({id:'elecoverdue-'+lastBill.id, title:`Electricity ${billStatus(lastBill)==='Partly Paid'?'partial payment':'overdue'}: ${t.name} (${formatCurrency(bal)})`, module:'Electricity', date:lastBill.currReadingDate, priority: billStatus(lastBill)==='Unpaid'?'Urgent':'Important', linkView:'electricity', linkId:null});
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
      list.push({id:'vacant-'+u.id, title:`Vacant unit: ${u.unitNumber} (${p?p.name:''})`, module:'Units', date:today, priority:'Information', linkView:'unitProfile', linkId:u.id});
    }
  });

  // Security deposit refund pending
  db.deposits.forEach(d=>{
    if(d.refundStatus==='Pending Refund'){
      const t = tenantById(d.tenantId);
      list.push({id:'deprefund-'+d.id, title:`Security deposit refund pending: ${t?t.name:d.id}`, module:'Deposits', date:d.dateReceived, priority:'Upcoming', linkView:'deposits', linkId:null});
    }
  });

  // Maintenance complaints pending
  const complaintPriorityMap = {Urgent:'Urgent', High:'Important', Medium:'Upcoming', Low:'Information'};
  db.complaints.forEach(c=>{
    if(c.status==='Open'||c.status==='In Progress'){
      list.push({id:'complaint-'+c.id, title:`Maintenance complaint pending: ${c.complaintType||'Complaint'} (${escapeHtml(c.priority||'Low')})`, module:'Maintenance', date:c.complaintDate, priority: complaintPriorityMap[c.priority]||'Upcoming', linkView:'maintenance', linkId:null});
    }
  });

  // Monthly combined bill not generated for occupied units
  db.units.filter(u=>u.status==='Occupied').forEach(u=>{
    const has = db.combinedBills.some(c=>c.unitId===u.id && c.month===MONTH_NAMES[new Date().getMonth()] && String(c.year)===String(new Date().getFullYear()));
    if(!has){
      list.push({id:'nobill-'+u.id, title:`Monthly combined bill not generated: ${u.unitNumber}`, module:'Combined Bills', date:today, priority:'Information', linkView:'combinedBillForm', linkId:null});
    }
  });

  const deleted = new Set(db.notificationState.deletedIds||[]);
  const read = new Set(db.notificationState.readIds||[]);
  const snoozed = db.notificationState.snoozedUntil||{};
  return list.filter(n=>!deleted.has(n.id))
    .map(n=>Object.assign(n, {read:read.has(n.id), snoozedUntil:snoozed[n.id]||null}))
    .filter(n=>!n.snoozedUntil || n.snoozedUntil<=today)
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
function snoozeNotification(id, days){
  db.notificationState.snoozedUntil = db.notificationState.snoozedUntil||{};
  const until = new Date();
  until.setDate(until.getDate()+(Number(days)||1));
  db.notificationState.snoozedUntil[id] = until.toISOString().slice(0,10);
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
function notificationBadgeClass(priority){
  if(priority==='Urgent') return 'badge-red';
  if(priority==='Important') return 'badge-orange';
  if(priority==='Upcoming') return 'badge-blue';
  return 'badge-grey';
}
const NOTIFICATION_FILTERS = ['all','Unread','Urgent','Important','Upcoming','Information'];
function renderNotifications(){
  let list = computeNotifications();
  const filter = state.notificationFilter||'all';
  if(filter==='Unread') list = list.filter(n=>!n.read);
  else if(filter!=='all') list = list.filter(n=>n.priority===filter);
  const filterBar = `<div class="subtabs no-print" style="margin-bottom:14px;">${NOTIFICATION_FILTERS.map(f=>`<button data-action="filter-notifications" data-filter="${f}" class="${filter===f?'active':''}">${f==='all'?'View All':f}</button>`).join('')}</div>`;
  const rows = list.map(n=>`
    <div class="notification-card ${n.read?'':'unread'} priority-${n.priority}">
      <div style="flex:1;min-width:0;cursor:pointer;" data-action="open-notification" data-linkview="${n.linkView}" data-linkid="${n.linkId||''}">
        <div style="font-weight:700;">${escapeHtml(n.title)} ${!n.read?'<span class=\"badge badge-blue\" style=\"margin-left:6px;\">New</span>':''}</div>
        <div style="font-size:12.5px;color:var(--muted);">${escapeHtml(n.module)} · ${formatDate(n.date)} · <span class="badge ${notificationBadgeClass(n.priority)}">${n.priority}</span></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${!n.read?`<button class="btn sm secondary" data-action="mark-notification-read" data-nid="${n.id}">Mark Read</button>`:''}
        <button class="btn sm secondary" data-action="snooze-notification" data-nid="${n.id}">Snooze</button>
        <button class="btn sm danger" data-action="delete-notification" data-nid="${n.id}">Dismiss</button>
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
/* MONTHLY PROFIT & LOSS REPORT                                           */
/* ---------------------------------------------------------------------- */
function inRangeDate(d, from, to){
  if(!d) return !from && !to;
  if(from && d<from) return false;
  if(to && d>to) return false;
  return true;
}
// Pro-rata split of a rent receipt's amount received across its charge
// categories, so partial payments are attributed fairly across Rent /
// Maintenance / Water / Parking / Other for P&L purposes. Previous dues are
// intentionally excluded from this-period income.
function rentIncomeBreakdown(r){
  const componentsSum = (Number(r.rentAmount)||0)+(Number(r.maintenanceAmount)||0)+(Number(r.waterCharge)||0)+(Number(r.parkingCharge)||0)+(Number(r.otherCharges)||0);
  const received = Number(r.amountReceived)||0;
  const factor = componentsSum>0 ? Math.min(1, received/componentsSum) : 0;
  return {
    rent:(Number(r.rentAmount)||0)*factor, maintenance:(Number(r.maintenanceAmount)||0)*factor,
    water:(Number(r.waterCharge)||0)*factor, parking:(Number(r.parkingCharge)||0)*factor, other:(Number(r.otherCharges)||0)*factor
  };
}
function computeProfitLoss(propertyId, fromDate, toDate){
  const rentRecs = db.rentPayments.filter(r=>{
    const u = unitById(r.unitId);
    if(propertyId!=='all' && (!u || u.propertyId!==propertyId)) return false;
    return inRangeDate(r.paymentDate, fromDate, toDate);
  });
  const elecRecs = db.electricityBills.filter(b=>{
    const u = unitById(b.unitId);
    if(propertyId!=='all' && (!u || u.propertyId!==propertyId)) return false;
    return inRangeDate(b.paymentDate||b.currReadingDate, fromDate, toDate);
  });
  const expRecs = db.expenses.filter(e=>{
    if(propertyId!=='all' && e.propertyId!==propertyId) return false;
    return inRangeDate(e.date, fromDate, toDate);
  });
  let rent=0, maintenance=0, water=0, parking=0, otherIncome=0, electricity=0;
  rentRecs.forEach(r=>{
    const b = rentIncomeBreakdown(r);
    rent+=b.rent; maintenance+=b.maintenance; water+=b.water; parking+=b.parking; otherIncome+=b.other;
    if(rentStatus(r)==='Paid') otherIncome += Number(r.lateFee)||0;
  });
  elecRecs.forEach(b=>{ electricity += Number(b.amountPaid)||0; });
  const totalIncome = rent+maintenance+electricity+water+parking+otherIncome;
  const expenseByCategory = {};
  expRecs.forEach(e=>{ expenseByCategory[e.category] = (expenseByCategory[e.category]||0)+(Number(e.amount)||0); });
  const totalExpense = Object.values(expenseByCategory).reduce((s,v)=>s+v,0);
  const scopeUnits = propertyId==='all' ? db.units : db.units.filter(u=>u.propertyId===propertyId);
  const outstandingRent = db.rentPayments.filter(r=>scopeUnits.some(u=>u.id===r.unitId)).reduce((s,r)=>s+Math.max(0,rentBalanceDue(r)),0);
  const outstandingElectricity = db.electricityBills.filter(b=>scopeUnits.some(u=>u.id===b.unitId)).reduce((s,b)=>s+Math.max(0,billBalanceDue(b)),0);
  const expectedIncome = rentRecs.reduce((s,r)=>s+rentTotalPayable(r),0) + elecRecs.reduce((s,b)=>s+billTotalPayable(b),0);
  const actualCollection = rentRecs.reduce((s,r)=>s+(Number(r.amountReceived)||0),0) + elecRecs.reduce((s,b)=>s+(Number(b.amountPaid)||0),0);
  const collectionEfficiency = expectedIncome>0 ? Math.round((actualCollection/expectedIncome)*10000)/100 : null;
  return {
    income:{rent,maintenance,electricity,water,parking,other:otherIncome,total:totalIncome},
    expense:{byCategory:expenseByCategory, total:totalExpense},
    netSurplusDeficit:totalIncome-totalExpense,
    outstandingRent, outstandingElectricity, expectedIncome, actualCollection, collectionEfficiency
  };
}
state.pnl = state.pnl || {propertyId:'all', periodType:'Monthly', month:MONTH_NAMES[new Date().getMonth()], year:new Date().getFullYear(), from:'', to:''};
function pnlComputeRange(){
  const p = state.pnl;
  if(p.periodType==='Monthly'){
    const mIdx = MONTH_NAMES.indexOf(p.month);
    const from = p.year+'-'+String(mIdx+1).padStart(2,'0')+'-01';
    const lastDay = new Date(p.year, mIdx+1, 0).getDate();
    const to = p.year+'-'+String(mIdx+1).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');
    return {from,to};
  }
  if(p.periodType==='Yearly') return {from:p.year+'-01-01', to:p.year+'-12-31'};
  return {from:p.from, to:p.to};
}
function renderProfitLoss(){
  const p = state.pnl;
  const {from,to} = pnlComputeRange();
  const r = computeProfitLoss(p.propertyId, from, to);
  const propOpts = ['<option value="all">All Properties (Combined)</option>'].concat(db.properties.map(pr=>`<option value="${pr.id}" ${p.propertyId===pr.id?'selected':''}>${escapeHtml(pr.name)}</option>`)).join('');
  const periodOpts = ['Monthly','Yearly','Custom'].map(x=>`<option value="${x}" ${p.periodType===x?'selected':''}>${x}</option>`).join('');
  const monthOpts = MONTH_NAMES.map(m=>`<option value="${m}" ${p.month===m?'selected':''}>${m}</option>`).join('');
  const expenseRows = Object.keys(r.expense.byCategory).map(cat=>`<div class="dl">${escapeHtml(cat)}</div><div class="dv">${formatCurrency(r.expense.byCategory[cat])}</div>`).join('');
  return moreSubtabsHTML('profitLoss') + `
    <div class="toolbar no-print">
      <select id="pnlProperty">${propOpts}</select>
      <select id="pnlPeriodType">${periodOpts}</select>
      ${p.periodType==='Monthly'?`<select id="pnlMonth">${monthOpts}</select><input id="pnlYear" type="number" value="${p.year}">`:''}
      ${p.periodType==='Yearly'?`<input id="pnlYear" type="number" value="${p.year}">`:''}
      ${p.periodType==='Custom'?`<label style="font-size:12.5px;">From <input type="date" id="pnlFrom" value="${escapeHtml(p.from)}"></label><label style="font-size:12.5px;">To <input type="date" id="pnlTo" value="${escapeHtml(p.to)}"></label>`:''}
      <div class="spacer"></div>
      <button class="btn secondary" data-action="print-view">🖨️ Print</button>
      <button class="btn secondary" data-action="export-pnl-csv">⬇️ Export CSV</button>
    </div>
    <p style="font-size:12.5px;color:var(--muted);">Period: ${formatDate(from)} to ${formatDate(to)}</p>
    <div class="section-title">💰 Income</div>
    <div class="detail-grid">
      <div class="dl">Rent Collected</div><div class="dv">${formatCurrency(r.income.rent)}</div>
      <div class="dl">Maintenance Collected</div><div class="dv">${formatCurrency(r.income.maintenance)}</div>
      <div class="dl">Electricity Collected</div><div class="dv">${formatCurrency(r.income.electricity)}</div>
      <div class="dl">Water Collected</div><div class="dv">${formatCurrency(r.income.water)}</div>
      <div class="dl">Parking Collected</div><div class="dv">${formatCurrency(r.income.parking)}</div>
      <div class="dl">Other Income</div><div class="dv">${formatCurrency(r.income.other)}</div>
      <div class="dl"><b>Total Income</b></div><div class="dv"><b>${formatCurrency(r.income.total)}</b></div>
    </div>
    <div class="section-title">💸 Expenses</div>
    <div class="detail-grid">
      ${expenseRows || '<div class="empty-note" style="grid-column:1/-1;">No expenses recorded for this period.</div>'}
      <div class="dl"><b>Total Expense</b></div><div class="dv"><b>${formatCurrency(r.expense.total)}</b></div>
    </div>
    <div class="section-title">📊 Summary</div>
    <div class="cards-grid">
      <div class="card"><div class="num">${formatCurrency(r.netSurplusDeficit)}</div><div class="lbl">${r.netSurplusDeficit>=0?'Net Surplus':'Net Deficit'}</div></div>
      <div class="card"><div class="num">${formatCurrency(r.outstandingRent)}</div><div class="lbl">Outstanding Rent</div></div>
      <div class="card"><div class="num">${formatCurrency(r.outstandingElectricity)}</div><div class="lbl">Outstanding Electricity</div></div>
      <div class="card"><div class="num">${formatCurrency(r.expectedIncome)}</div><div class="lbl">Expected Income (Billed)</div></div>
      <div class="card"><div class="num">${formatCurrency(r.actualCollection)}</div><div class="lbl">Actual Collection</div></div>
      <div class="card"><div class="num">${r.collectionEfficiency===null?'N/A':r.collectionEfficiency+'%'}</div><div class="lbl">Collection Efficiency %</div></div>
    </div>
  `;
}
function attachProfitLossHandlers(){
  const p = state.pnl;
  const propSel = document.getElementById('pnlProperty'), periodSel = document.getElementById('pnlPeriodType');
  const monthSel = document.getElementById('pnlMonth'), yearInput = document.getElementById('pnlYear');
  const fromInput = document.getElementById('pnlFrom'), toInput = document.getElementById('pnlTo');
  if(propSel) propSel.addEventListener('change', ()=>{ p.propertyId = propSel.value; render(); });
  if(periodSel) periodSel.addEventListener('change', ()=>{ p.periodType = periodSel.value; render(); });
  if(monthSel) monthSel.addEventListener('change', ()=>{ p.month = monthSel.value; render(); });
  if(yearInput) yearInput.addEventListener('change', ()=>{ p.year = Number(yearInput.value)||p.year; render(); });
  if(fromInput) fromInput.addEventListener('change', ()=>{ p.from = fromInput.value; render(); });
  if(toInput) toInput.addEventListener('change', ()=>{ p.to = toInput.value; render(); });
}
function exportProfitLossCSV(){
  const p = state.pnl;
  const {from,to} = pnlComputeRange();
  const r = computeProfitLoss(p.propertyId, from, to);
  const propName = p.propertyId==='all' ? 'All Properties (Combined)' : (propertyById(p.propertyId)||{}).name;
  const lines = [
    ['Property', propName], ['Period', formatDate(from)+' to '+formatDate(to)], [''],
    ['Income',''], ['Rent Collected', r.income.rent], ['Maintenance Collected', r.income.maintenance],
    ['Electricity Collected', r.income.electricity], ['Water Collected', r.income.water],
    ['Parking Collected', r.income.parking], ['Other Income', r.income.other], ['Total Income', r.income.total], [''],
    ['Expenses','']
  ];
  Object.keys(r.expense.byCategory).forEach(cat=>lines.push([cat, r.expense.byCategory[cat]]));
  lines.push(['Total Expense', r.expense.total], [''],
    ['Net Surplus / Deficit', r.netSurplusDeficit],
    ['Outstanding Rent', r.outstandingRent], ['Outstanding Electricity', r.outstandingElectricity],
    ['Expected Income', r.expectedIncome], ['Actual Collection', r.actualCollection],
    ['Collection Efficiency %', r.collectionEfficiency===null?'N/A':r.collectionEfficiency]
  );
  const csv = lines.map(row=>row.map(cell=>{
    const s = String(cell===undefined||cell===null?'':cell);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\n');
  downloadFile('profit-loss-'+todayISO()+'.csv', csv, 'text/csv');
}

/* ---------------------------------------------------------------------- */
/* SETTINGS + BACKUP/RESTORE                                              */
/* ---------------------------------------------------------------------- */
function settingsForForm(s){
  // lateFeeEnabled is stored as boolean but rendered as a Yes/No select.
  return Object.assign({}, s, {lateFeeEnabled: s.lateFeeEnabled ? 'Yes' : 'No'});
}
function renderSettings(){
  const s = db.settings;
  const historyRows = (db.backupHistory||[]).slice(0,15).map(h=>`
    <tr><td>${formatDate(h.date.slice(0,10))} ${h.date.slice(11,16)}</td><td>${escapeHtml(h.type)}</td><td>${escapeHtml(h.fileName)}</td><td>${h.recordCount}</td></tr>
  `).join('');
  return `
    <div class="settings-block">
      <h3>⚙️ Owner &amp; Defaults</h3>
      <div class="form-grid">${fieldsToHTML(SETTINGS_FIELDS, settingsForForm(s))}</div>
      <p style="font-size:12px;color:var(--muted);margin-top:8px;">Currency: INR (₹). Changing the default electricity rate only affects future bills — every saved bill keeps the rate that was used at the time it was generated. Units and properties may override this default rate individually (Unit override → Property override → Global default).</p>
      <div class="form-actions"><button class="btn" id="saveSettingsBtn">💾 Save Settings</button></div>
    </div>
    <div class="settings-block">
      <h3>💬 WhatsApp Reminder Templates</h3>
      <p style="font-size:12px;color:var(--muted);">Use placeholders like {{tenantName}}, {{propertyName}}, {{unitNumber}}, {{month}}, {{year}}, {{totalPayable}} — these are filled in automatically. Every message can still be edited by hand right before sending.</p>
      <div class="form-grid">${fieldsToHTML(REMINDER_TEMPLATE_FIELDS, s)}</div>
      <div class="form-actions"><button class="btn" id="saveTemplatesBtn">💾 Save Templates</button></div>
    </div>
    <div class="settings-block">
      <h3>💾 Backup &amp; Restore</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn secondary" id="backupFullBtn">⬇️ Full Rental Backup</button>
        <button class="btn secondary" id="backupSettingsBtn">⬇️ Settings Backup</button>
        <button class="btn secondary" id="backupFinancialBtn">⬇️ Financial Records Backup</button>
        <label class="btn secondary" style="display:inline-flex;align-items:center;">⬆️ Restore from Backup
          <input type="file" accept=".json" id="restoreInput" style="display:none;">
        </label>
      </div>
      <div class="form-field" style="margin-top:10px;max-width:320px;">
        <label>Property-specific Backup</label>
        <div style="display:flex;gap:8px;">
          <select id="backupPropertySelect">${db.properties.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
          <button class="btn sm secondary" id="backupPropertyBtn">⬇️ Download</button>
        </div>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:10px;">Backup includes every Rental Manager section: Properties, Units, Tenants, Occupancy History, Agreements, Rent Bills &amp; Payments, Electricity Readings &amp; Bills, Combined Bills, Security Deposits, Expenses, Maintenance Records, Notifications, Reminder Templates, Settings and Receipt Numbering. Restoring validates the file, shows the backup date, version and record count, and lets you choose to Merge or Replace before anything changes. WBCYN, Clinic Manager and Trust Manager data are stored separately and are never affected. A backup is only ever recorded in the history below once your browser has actually started the download.</p>
      <div class="section-title" style="margin-top:14px;">🧾 Backup History (metadata only)</div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>File Name</th><th>Records</th></tr></thead>
      <tbody>${historyRows || '<tr><td colspan="4" class="empty-note">No backups downloaded yet.</td></tr>'}</tbody></table></div>
    </div>
    <div class="settings-block">
      <h3>⚠️ Reset Rental Manager Data</h3>
      <p style="font-size:12.5px;color:var(--muted);">This permanently deletes all Rental Manager data on this device (Properties, Units, Tenants, Bills, etc.) and restores the two original preloaded properties. This cannot be undone.</p>
      <button class="btn danger" id="resetRentalBtn">🗑️ Reset All Rental Data</button>
    </div>
  `;
}
function nowTimestampShort(){
  const d = new Date();
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function recordCountOf(obj){
  const keys = ['properties','units','tenants','occupancyHistory','rentPayments','electricityBills','combinedBills','deposits','expenses','complaints','agreements'];
  return keys.reduce((s,k)=>s+((obj[k]||[]).length),0);
}
function logBackupHistory(type, fileName, recordCount){
  db.backupHistory = db.backupHistory||[];
  db.backupHistory.unshift({id:uid(), date:new Date().toISOString(), type, fileName, recordCount});
  if(db.backupHistory.length>50) db.backupHistory = db.backupHistory.slice(0,50);
  saveDB();
}
function downloadFullBackup(){
  const payload = Object.assign({}, db, {backupMeta:{type:'Full', version:SCHEMA_VERSION, exportedAt:new Date().toISOString()}});
  const fileName = 'JM-Rental-Backup-'+nowTimestampShort()+'.json';
  downloadFile(fileName, JSON.stringify(payload, null, 2));
  logBackupHistory('Full', fileName, recordCountOf(db));
  render();
}
function downloadPropertyBackup(propertyId){
  const prop = propertyById(propertyId);
  if(!prop){ alert('Property not found.'); return; }
  const unitIds = new Set(db.units.filter(u=>u.propertyId===propertyId).map(u=>u.id));
  const tenantIds = new Set(db.tenants.filter(t=>unitIds.has(t.unitId)).map(t=>t.id));
  const payload = {
    backupMeta:{type:'Property-specific', property:prop.name, version:SCHEMA_VERSION, exportedAt:new Date().toISOString()},
    properties:[prop],
    units: db.units.filter(u=>unitIds.has(u.id)),
    tenants: db.tenants.filter(t=>tenantIds.has(t.id)),
    occupancyHistory: db.occupancyHistory.filter(o=>unitIds.has(o.unitId)),
    rentPayments: db.rentPayments.filter(r=>unitIds.has(r.unitId)),
    electricityBills: db.electricityBills.filter(b=>unitIds.has(b.unitId)),
    combinedBills: db.combinedBills.filter(c=>unitIds.has(c.unitId)),
    deposits: db.deposits.filter(d=>unitIds.has(d.unitId)),
    expenses: db.expenses.filter(e=>e.propertyId===propertyId),
    complaints: db.complaints.filter(c=>unitIds.has(c.unitId)),
    agreements: db.agreements.filter(a=>unitIds.has(a.unitId))
  };
  const fileName = 'JM-Rental-Backup-'+prop.name.replace(/\s+/g,'')+'-'+nowTimestampShort()+'.json';
  downloadFile(fileName, JSON.stringify(payload, null, 2));
  logBackupHistory('Property: '+prop.name, fileName, recordCountOf(payload));
  render();
}
function downloadSettingsBackup(){
  const payload = {backupMeta:{type:'Settings', version:SCHEMA_VERSION, exportedAt:new Date().toISOString()}, settings: db.settings};
  const fileName = 'JM-Rental-Settings-Backup-'+nowTimestampShort()+'.json';
  downloadFile(fileName, JSON.stringify(payload, null, 2));
  logBackupHistory('Settings', fileName, 1);
  render();
}
function downloadFinancialBackup(){
  const payload = {
    backupMeta:{type:'Financial Records', version:SCHEMA_VERSION, exportedAt:new Date().toISOString()},
    rentPayments: db.rentPayments, electricityBills: db.electricityBills, combinedBills: db.combinedBills,
    deposits: db.deposits, expenses: db.expenses
  };
  const fileName = 'JM-Rental-Financial-Backup-'+nowTimestampShort()+'.json';
  downloadFile(fileName, JSON.stringify(payload, null, 2));
  logBackupHistory('Financial Records', fileName, recordCountOf(payload));
  render();
}
function openRestoreReviewModal(parsed, fileName){
  const structuralOk = validateRentalBackup(parsed).ok;
  const meta = parsed.backupMeta || {};
  const type = meta.type || (parsed.settings && !structuralOk ? 'Settings' : (structuralOk ? 'Full' : 'Unknown'));
  if(type==='Unknown'){ alert('This does not look like a valid Rental Manager backup file.'); return; }
  const counts = recordCountOf(parsed);
  const summary = `Backup Type: ${type}\nExported: ${meta.exportedAt ? (formatDate(meta.exportedAt.slice(0,10))+' '+meta.exportedAt.slice(11,16)) : 'Unknown'}\nSchema Version: ${meta.version||'Unknown'}\nTotal Records: ${counts}`;
  const isSettingsOnly = type==='Settings';
  const isPartial = type==='Property-specific' || type==='Financial Records';
  const canReplace = type==='Full';
  openModal('📥 Restore Backup — '+escapeHtml(fileName), `
    <pre style="white-space:pre-wrap;font-size:13px;background:var(--light-blue);padding:10px;border-radius:8px;">${escapeHtml(summary)}</pre>
    <p style="font-size:12.5px;color:var(--muted);">${isSettingsOnly?'This is a Settings-only backup — it will update your Settings without touching any properties, tenants or bills.':
      isPartial?'This is a partial backup ('+escapeHtml(type)+'). It can only be Merged into your existing data (adding/updating matching records) — Replace is disabled for partial backups to avoid accidentally erasing records that are not included in this file.':
      'Merge adds/updates records without deleting anything currently on this device. Replace erases current Rental Manager data and substitutes the backup contents. WBCYN, Clinic Manager and Trust Manager data are never affected either way.'}</p>
  `, isSettingsOnly
    ? `<button class="btn grey" id="restoreCancel">Cancel</button><button class="btn" id="restoreSettingsOnly">Restore Settings</button>`
    : `<button class="btn grey" id="restoreCancel">Cancel</button><button class="btn secondary" id="restoreMerge">🔀 Merge with Existing Data</button>${canReplace?`<button class="btn danger" id="restoreReplace">♻️ Replace Rental Data</button>`:''}`);
  document.getElementById('restoreCancel').onclick = closeModal;
  if(isSettingsOnly){
    document.getElementById('restoreSettingsOnly').onclick = ()=>{ closeModal(); performRestore(parsed, 'merge', type); };
  }else{
    document.getElementById('restoreMerge').onclick = ()=>{ closeModal(); performRestore(parsed, 'merge', type); };
    const replaceBtn = document.getElementById('restoreReplace');
    if(replaceBtn) replaceBtn.onclick = ()=>{
      if(!confirm('This will PERMANENTLY REPLACE all current Rental Manager data with the contents of this backup. This cannot be undone. Continue?')) return;
      closeModal(); performRestore(parsed, 'replace', type);
    };
  }
}
function performRestore(parsed, mode, type){
  const before = JSON.parse(JSON.stringify(db));
  try{
    if(type==='Settings'){
      db.settings = Object.assign({}, db.settings, parsed.settings||{});
      saveDB(); renderHeader(); alert('Settings restored successfully.'); goto('settings');
      return;
    }
    const arrayKeys = ['properties','units','tenants','occupancyHistory','rentPayments','electricityBills','combinedBills','deposits','expenses','complaints','agreements'];
    if(mode==='replace'){
      arrayKeys.forEach(k=>{ if(Array.isArray(parsed[k])) db[k] = parsed[k]; });
      if(parsed.settings) db.settings = Object.assign({}, db.settings, parsed.settings);
      if(parsed.nextIds) db.nextIds = Object.assign({}, db.nextIds, parsed.nextIds);
    }else{
      arrayKeys.forEach(k=>{
        if(!Array.isArray(parsed[k])) return;
        parsed[k].forEach(rec=>{
          const idx = db[k].findIndex(x=>x.id===rec.id);
          if(idx>=0) db[k][idx] = Object.assign({}, db[k][idx], rec);
          else db[k].push(rec);
        });
      });
    }
    db = ensureShape(db);
    saveDB();
    renderHeader();
    goto('dashboard');
    alert((mode==='merge'?'Merge':'Replace')+' restore complete. '+recordCountOf(parsed)+' record(s) processed from the backup. Existing WBCYN, Clinic and Trust data were not touched.');
  }catch(e){
    db = before;
    saveDB();
    alert('Restore failed — no changes were made and your existing Rental Manager data has been preserved.\n\n'+(e&&e.message?e.message:''));
  }
}
function attachSettingsHandlers(){
  const saveBtn = document.getElementById('saveSettingsBtn');
  if(saveBtn) saveBtn.addEventListener('click', ()=>{
    const vals = readFieldsFromForm(SETTINGS_FIELDS, document.getElementById('app'));
    vals.lateFeeEnabled = vals.lateFeeEnabled==='Yes';
    Object.assign(db.settings, vals);
    saveDB();
    renderHeader();
    alert('Settings saved.');
  });
  const saveTemplatesBtn = document.getElementById('saveTemplatesBtn');
  if(saveTemplatesBtn) saveTemplatesBtn.addEventListener('click', ()=>{
    const vals = readFieldsFromForm(REMINDER_TEMPLATE_FIELDS, document.getElementById('app'));
    Object.assign(db.settings, vals);
    saveDB();
    alert('Reminder templates saved.');
  });
  const backupFullBtn = document.getElementById('backupFullBtn');
  if(backupFullBtn) backupFullBtn.addEventListener('click', downloadFullBackup);
  const backupSettingsBtn = document.getElementById('backupSettingsBtn');
  if(backupSettingsBtn) backupSettingsBtn.addEventListener('click', downloadSettingsBackup);
  const backupFinancialBtn = document.getElementById('backupFinancialBtn');
  if(backupFinancialBtn) backupFinancialBtn.addEventListener('click', downloadFinancialBackup);
  const backupPropertyBtn = document.getElementById('backupPropertyBtn');
  if(backupPropertyBtn) backupPropertyBtn.addEventListener('click', ()=>{
    const sel = document.getElementById('backupPropertySelect');
    if(sel && sel.value) downloadPropertyBackup(sel.value);
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
      openRestoreReviewModal(parsed, file.name);
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
    case 'dashboard': app.innerHTML = renderDashboard(); attachAnalyticsHandlers(); break;
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
    case 'receiptHistory': app.innerHTML = renderReceiptHistory(); break;
    case 'rent': app.innerHTML = renderRent(); break;
    case 'rentForm': renderRentForm(id); break;
    case 'electricity': app.innerHTML = renderElectricity(); break;
    case 'electricityForm': renderElectricityForm(id); break;
    case 'combinedBills': app.innerHTML = renderCombinedBills(); break;
    case 'combinedBillForm': renderCombinedBillForm(id); break;
    case 'billingCentre': app.innerHTML = renderBillingCentre(); attachBillingCentreHandlers(); break;
    case 'occupancy': app.innerHTML = renderOccupancy(); attachOccupancyHandlers(); break;
    case 'profitLoss': app.innerHTML = renderProfitLoss(); attachProfitLossHandlers(); break;
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
        case 'finalise-combined-bill':{
          const c = db.combinedBills.find(x=>x.id===id);
          if(c && confirm('Finalise this bill? It will move from Draft to Finalised and be ready for collection and reminders.')){ c.status = 'Finalised'; saveDB(); render(); }
          break;
        }
        case 'cancel-combined-bill':{
          const c = db.combinedBills.find(x=>x.id===id);
          if(c && confirm('Cancel this bill? It will be kept in history marked as Cancelled but will no longer count as outstanding.')){ c.status = 'Cancelled'; saveDB(); render(); }
          break;
        }
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

        case 'whatsapp-reminder': sendWhatsAppReminder(el.getAttribute('data-kind'), el.getAttribute('data-recid')); break;
        case 'print-deposit-receipt': printDepositReceipt(id); break;
        case 'print-deposit-refund-receipt': printDepositRefundReceipt(id); break;
        case 'share-rent-receipt': shareRentReceipt(id); break;
        case 'share-electricity-bill': shareElectricityBill(id); break;
        case 'share-combined-bill': shareCombinedBill(id); break;

        case 'mark-notification-read': markNotificationRead(el.getAttribute('data-nid')); break;
        case 'mark-all-notifications-read': markAllNotificationsRead(); break;
        case 'delete-notification': deleteNotification(el.getAttribute('data-nid')); break;
        case 'snooze-notification':{
          const days = prompt('Snooze this alert for how many days?','3');
          if(days!==null && Number(days)>0) snoozeNotification(el.getAttribute('data-nid'), Number(days));
          break;
        }
        case 'open-notification': openNotificationLink(el.getAttribute('data-linkview'), el.getAttribute('data-linkid')); break;
        case 'filter-notifications': state.notificationFilter = el.getAttribute('data-filter'); render(); break;

        case 'global-search': openGlobalSearchModal(); break;
        case 'toggle-analytics': state.analytics.collapsed = !state.analytics.collapsed; render(); break;
        case 'export-pnl-csv': exportProfitLossCSV(); break;
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

