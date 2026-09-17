const DB = 'ivp-editor';
const STORE = 'workspace';

export interface EditorTab {
  id: string;
  name: string;
  language: string;
  text: string;
  pane: 0 | 1;
}

export interface EditorWorkspace {
  tabs: EditorTab[];
  active: string | undefined;
  compare: boolean;
  font: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWorkspace(ws: EditorWorkspace): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(ws, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadWorkspace(): Promise<EditorWorkspace | undefined> {
  const db = await openDb();
  const ws = await new Promise<EditorWorkspace | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('current');
    req.onsuccess = () => resolve(req.result as EditorWorkspace | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return ws;
}
