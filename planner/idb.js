'use strict';

/* ============================================================================
   Personal Planner - IndexedDB wrapper
   ----------------------------------------------------------------------------
   Every other JM Digital Office module uses localStorage. Planner uses
   IndexedDB instead because it is expected to accumulate years of tasks,
   journal entries, habit logs and photo/voice attachments - well beyond what
   is comfortable in localStorage's ~5-10MB synchronous string budget.

   This wrapper is intentionally tiny and dependency-free (no idb/Dexie),
   matching the project's zero-build, zero-dependency convention. app.js
   loads every store into an in-memory `db` object once at boot (see
   loadDB() in app.js) so the rest of the app can keep reading/rendering
   synchronously exactly like the other modules' localStorage-backed `db` -
   IndexedDB is only ever touched to persist in the background or to lazily
   fetch a single attachment Blob by id.
============================================================================ */

const DB_NAME = 'jm_planner_db';
const DB_VERSION = 2;

const STORE_DEFS = [
  { name: 'tasks', keyPath: 'id', indexes: ['date', 'status', 'kind', 'category', 'priority'] },
  { name: 'reminders', keyPath: 'id', indexes: ['date', 'kind', 'status'] },
  { name: 'goals', keyPath: 'id', indexes: ['term', 'status'] },
  { name: 'habits', keyPath: 'id', indexes: ['category'] },
  { name: 'habitLogs', keyPath: 'id', indexes: ['habitId', 'date'] },
  { name: 'notes', keyPath: 'id', indexes: ['noteType', 'date', 'pinned'] },
  { name: 'documents', keyPath: 'id', indexes: ['type', 'linkedEntityType'] },
  { name: 'contacts', keyPath: 'id', indexes: ['category', 'favourite'] },
  { name: 'trips', keyPath: 'id', indexes: ['startDate'] },
  { name: 'assignments', keyPath: 'id', indexes: ['status', 'assignedToPersonId', 'category', 'expectedCompletionDate'] },
  { name: 'people', keyPath: 'id', indexes: ['status'] },
  { name: 'attachments', keyPath: 'id', indexes: ['ownerType', 'ownerId'] },
  { name: 'settings', keyPath: 'key', indexes: [] },
  { name: 'crossModuleEvents', keyPath: 'id', autoIncrement: true, indexes: ['sourceModule'] },
];

const IDB = {
  _db: null,

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORE_DEFS.forEach((def) => {
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
