import { openDB } from 'idb';

// Everything this app needs to work offline, in one IndexedDB database:
// - `session`: the logged-in user, so a reopened/installed app doesn't
//   need a network round-trip just to show the login screen.
// - `cache`: the last successful `list` response, so the UI has real
//   data to show the instant the app opens with no connection.
// - `pendingActions`: mutations made while offline, replayed in order
//   once the connection comes back (see state/AppContext.jsx).
const DB_NAME = 'dta-subscription-control';
const DB_VERSION = 1;

function dbPromise(){
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db){
      if (!db.objectStoreNames.contains('keyval')) db.createObjectStore('keyval');
      if (!db.objectStoreNames.contains('pendingActions')){
        db.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function getKeyval(key){
  const db = await dbPromise();
  return db.get('keyval', key);
}

export async function setKeyval(key, value){
  const db = await dbPromise();
  return db.put('keyval', value, key);
}

export async function deleteKeyval(key){
  const db = await dbPromise();
  return db.delete('keyval', key);
}

export async function queuePendingAction(action, payload){
  const db = await dbPromise();
  return db.add('pendingActions', { action, payload, createdAt: Date.now() });
}

export async function listPendingActions(){
  const db = await dbPromise();
  return db.getAll('pendingActions');
}

export async function removePendingAction(id){
  const db = await dbPromise();
  return db.delete('pendingActions', id);
}
