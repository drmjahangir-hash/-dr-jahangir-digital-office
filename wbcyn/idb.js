'use strict';

/* ============================================================================
   WBCYN e-Office & Administrative Control System — IndexedDB wrapper
   ----------------------------------------------------------------------------
   v1.6.0 introduces this new, dedicated database for the e-Office feature set
   (Inward/Outward registers, Higher Authority Files, Staff Assignments,
   Legal/RTI/Meetings, etc). It is completely separate from:
     - the original WBCYN localStorage database ('wbcyn_registrar_db_v1'),
       which is left untouched forever and is still reachable read/write via
       the "Legacy Records (Pre-v1.6.0)" section of the app (see app.js) —
       nothing in this file ever reads, writes, or clears that key.
     - Personal Planner's own IndexedDB database ('jm_planner_db').
   Modeled on planner/idb.js: tiny, dependency-free, guarded store creation
   (never destructive — re-running onupgradeneeded only adds stores/indexes
   that don't already exist, never drops or recreates existing ones).
============================================================================ */

const WBCYN_DB_NAME = 'jm_wbcyn_db';
const WBCYN_DB_VERSION = 1;

const WBCYN_STORE_DEFS = [
  { name: 'wbcynStaff', keyPath: 'id', indexes: ['status', 'department'] },
  { name: 'wbcynInward', keyPath: 'id', indexes: ['status', 'dateReceived', 'priority', 'markedToStaffId', 'communicationType', 'subject'] },
  { name: 'wbcynOutward', keyPath: 'id', indexes: ['status', 'letterDate', 'priority', 'memoNumber', 'dispatchDate', 'expectedReplyDate', 'responsibleStaffId'] },
  { name: 'wbcynAssignments', keyPath: 'id', indexes: ['status', 'assignedToStaffId', 'category', 'priority', 'deadlineDate'] },
  { name: 'wbcynAssignmentTimeline', keyPath: 'id', indexes: ['assignmentId', 'date'] },
  { name: 'wbcynHigherAuthorityFiles', keyPath: 'id', indexes: ['status', 'priority', 'authorityCategory', 'dateFileSent', 'expectedDecisionDate', 'fileNumber', 'responsibleStaffId'] },
  { name: 'wbcynFileMovements', keyPath: 'id', indexes: ['fileId', 'status', 'dateSent'] },
  { name: 'wbcynReplies', keyPath: 'id', indexes: ['status', 'replyDate', 'linkedType', 'linkedId', 'replyMemoNumber'] },
  { name: 'wbcynFollowUps', keyPath: 'id', indexes: ['date', 'nextFollowUpDate', 'entityType', 'entityId', 'status'] },
  { name: 'wbcynDeadlineExtensions', keyPath: 'id', indexes: ['assignmentId', 'date'] },
  { name: 'wbcynCorrespondenceLinks', keyPath: 'id', indexes: ['fromType', 'fromId', 'toType', 'toId'] },
  { name: 'wbcynLegalMatters', keyPath: 'id', indexes: ['status', 'nextHearingDate', 'complianceDeadline', 'caseNumber'] },
  { name: 'wbcynRTI', keyPath: 'id', indexes: ['status', 'replyDeadline', 'rtiNumber'] },
  { name: 'wbcynMeetings', keyPath: 'id', indexes: ['date', 'status'] },
  { name: 'wbcynResolutions', keyPath: 'id', indexes: ['meetingId', 'deadline', 'status'] },
  { name: 'wbcynSettings', keyPath: 'key', indexes: [] },
];

const WBCYN_IDB = {
  _db: null,

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(WBCYN_DB_NAME, WBCYN_DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        WBCYN_STORE_DEFS.forEach((def) => {
          if (db.objectStoreNames.contains(def.name)) return;
          const store = db.createObjectStore(def.name, {
            keyPath: def.keyPath,
            autoIncrement: !!def.autoIncrement,
          });
          def.indexes.forEach((idx) => store.createIndex('by_' + idx, idx, { unique: false }));
        });
      };
      req.onsuccess = () => {
        this._db = req.result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  },

  tx(store, mode) {
    return this._db.transaction(store, mode || 'readonly').objectStore(store);
  },

  getAll(store) {
    return new Promise((resolve, reject) => {
      const r = this.tx(store).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },

  get(store, key) {
    return new Promise((resolve, reject) => {
      const r = this.tx(store).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },

  put(store, value) {
    return new Promise((resolve, reject) => {
      const r = this.tx(store, 'readwrite').put(value);
      r.onsuccess = () => resolve(value);
      r.onerror = () => reject(r.error);
    });
  },

  bulkPut(store, values) {
    return new Promise((resolve, reject) => {
      const t = this._db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      values.forEach((v) => s.put(v));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  delete(store, key) {
    return new Promise((resolve, reject) => {
      const r = this.tx(store, 'readwrite').delete(key);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  },

  clear(store) {
    return new Promise((resolve, reject) => {
      const r = this.tx(store, 'readwrite').clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  },
};
