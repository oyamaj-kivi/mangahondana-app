const DB_NAME = 'manga-app';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('series')) {
        db.createObjectStore('series', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('volumes')) {
        const store = db.createObjectStore('volumes', { keyPath: 'key' });
        store.createIndex('series_id', 'series_id');
      }
      if (!db.objectStoreNames.contains('new_releases')) {
        const store = db.createObjectStore('new_releases', { keyPath: 'id', autoIncrement: true });
        store.createIndex('series_id', 'series_id');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = Array.isArray(storeNames)
      ? Object.fromEntries(storeNames.map((n) => [n, t.objectStore(n)]))
      : t.objectStore(storeNames);
    let result;
    Promise.resolve(fn(stores))
      .then((r) => { result = r; })
      .catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function all(store) { return reqToPromise(store.getAll()); }
export function allByIndex(store, indexName, value) { return reqToPromise(store.index(indexName).getAll(value)); }
export function get(store, key) { return reqToPromise(store.get(key)); }
export function put(store, value) { return reqToPromise(store.put(value)); }
export function add(store, value) { return reqToPromise(store.add(value)); }
export function del(store, key) { return reqToPromise(store.delete(key)); }
