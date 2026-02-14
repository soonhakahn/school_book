// IndexedDB wrapper (tiny)
const DB_NAME = 'school_book';
const DB_VERSION = 1;

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // students
      const st = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
      st.createIndex('name', 'name', { unique: false });
      st.createIndex('grade', 'grade', { unique: false });
      st.createIndex('group', 'group', { unique: false });
      st.createIndex('active', 'active', { unique: false });

      // sessions (by date)
      db.createObjectStore('sessions', { keyPath: 'date' });

      // attendance (compound key: date|studentId)
      const at = db.createObjectStore('attendance', { keyPath: 'key' });
      at.createIndex('date', 'date', { unique: false });
      at.createIndex('studentId', 'studentId', { unique: false });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeNames, mode='readonly') {
  return db.transaction(storeNames, mode);
}

export async function listStudents(filters={}) {
  const db = await openDb();
  const t = tx(db, ['students']);
  const store = t.objectStore('students');
  const req = store.getAll();
  const rows = await promisify(req);

  const q = (filters.q || '').trim().toLowerCase();
  const grade = (filters.grade || '').trim();
  const group = (filters.group || '').trim();
  const activeOnly = filters.activeOnly !== false;

  return rows
    .filter(r => !activeOnly || r.active !== false)
    .filter(r => !q || (r.name || '').toLowerCase().includes(q))
    .filter(r => !grade || r.grade === grade)
    .filter(r => !group || r.group === group)
    .sort((a,b) => (a.grade||'').localeCompare(b.grade||'') || (a.group||'').localeCompare(b.group||'') || (a.name||'').localeCompare(b.name||''));
}

export async function upsertStudent(student) {
  const db = await openDb();
  const t = tx(db, ['students'], 'readwrite');
  const store = t.objectStore('students');
  if (!student.id) {
    student.createdAt = student.createdAt || new Date().toISOString();
    student.active = student.active !== false;
    const req = store.add(student);
    const id = await promisify(req);
    await completeTx(t);
    return id;
  } else {
    const req = store.put(student);
    await promisify(req);
    await completeTx(t);
    return student.id;
  }
}

export async function getStudent(id) {
  const db = await openDb();
  const t = tx(db, ['students']);
  const req = t.objectStore('students').get(Number(id));
  return await promisify(req);
}

export async function setStudentActive(id, active) {
  const s = await getStudent(id);
  if (!s) return;
  s.active = !!active;
  await upsertStudent(s);
}

export async function distinctStudentFields() {
  const rows = await listStudents({ activeOnly: false });
  const grades = [...new Set(rows.map(r => r.grade).filter(Boolean))].sort();
  const groups = [...new Set(rows.map(r => r.group).filter(Boolean))].sort();
  return { grades, groups };
}

export async function ensureSession(date) {
  const db = await openDb();
  const t = tx(db, ['sessions'], 'readwrite');
  const store = t.objectStore('sessions');
  const existing = await promisify(store.get(date));
  if (existing) return existing;
  const row = { date, createdAt: new Date().toISOString() };
  await promisify(store.put(row));
  await completeTx(t);
  return row;
}

export async function listSessions(limit=24) {
  const db = await openDb();
  const t = tx(db, ['sessions']);
  const store = t.objectStore('sessions');
  const rows = await promisify(store.getAll());
  return rows
    .sort((a,b) => (a.date||'').localeCompare(b.date||''))
    .slice(-limit);
}

function attKey(date, studentId) {
  return `${date}|${studentId}`;
}

export async function getAttendanceMap(date) {
  const db = await openDb();
  const t = tx(db, ['attendance']);
  const idx = t.objectStore('attendance').index('date');
  const rows = await promisify(idx.getAll(date));
  const map = {};
  for (const r of rows) map[r.studentId] = r.status;
  return map;
}

export async function setAttendance(date, studentId, status) {
  const db = await openDb();
  const t = tx(db, ['attendance'], 'readwrite');
  const store = t.objectStore('attendance');
  const row = {
    key: attKey(date, studentId),
    date,
    studentId,
    status: status === 'present' ? 'present' : 'absent',
    updatedAt: new Date().toISOString(),
  };
  await promisify(store.put(row));
  await completeTx(t);
}

export async function exportAll() {
  const db = await openDb();
  const stores = ['students','sessions','attendance'];
  const t = tx(db, stores);
  const out = {};
  for (const s of stores) {
    out[s] = await promisify(t.objectStore(s).getAll());
  }
  out.meta = { exportedAt: new Date().toISOString(), version: DB_VERSION };
  return out;
}

export async function importAll(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid payload');
  const db = await openDb();
  const stores = ['students','sessions','attendance'];
  const t = tx(db, stores, 'readwrite');
  for (const s of stores) {
    const store = t.objectStore(s);
    await promisify(store.clear());
    const rows = payload[s] || [];
    for (const r of rows) await promisify(store.put(r));
  }
  await completeTx(t);
}

// helpers
function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function completeTx(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
