import {
  listStudents, upsertStudent, getStudent, setStudentActive,
  distinctStudentFields, ensureSession, getAttendanceMap, setAttendance,
  listSessions, exportAll, importAll
} from './db.js';
import { lineChart, barChart, exportCanvasPng } from './charts.js';

const $ = (q)=>document.querySelector(q);
const $$ = (q)=>Array.from(document.querySelectorAll(q));

function today(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function clickSound(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type='triangle';
    o.frequency.value=880;
    g.gain.value=0.05;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{o.stop(); ctx.close();}, 55);
  } catch(e){}
}

function toast(msg){
  const el = $('#status');
  if(!el) return;
  el.textContent = msg;
}

let activeTab = 'students';
let state = {
  studentFilters: { q:'', grade:'', group:'' },
  attendanceDate: today(),
  lookback: 12,
};

function setTab(name){
  activeTab = name;
  $$('#tabs .tab').forEach(t=> t.classList.toggle('active', t.dataset.tab===name));
  $$('.view').forEach(v=> v.style.display = v.id===`view-${name}` ? 'block' : 'none');
  if(name==='students') renderStudents();
  if(name==='attendance') renderAttendance();
  if(name==='stats') renderStats();
}

async function renderStudents(){
  const { grades, groups } = await distinctStudentFields();

  // filters UI
  const gradeSel = $('#f-grade');
  const groupSel = $('#f-group');
  fillSelect(gradeSel, [''].concat(grades));
  fillSelect(groupSel, [''].concat(groups));
  gradeSel.value = state.studentFilters.grade;
  groupSel.value = state.studentFilters.group;

  $('#f-q').value = state.studentFilters.q;

  const rows = await listStudents(state.studentFilters);

  const body = $('#students-tbody');
  body.innerHTML = '';
  for(const r of rows){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.id}</td>
      <td><b>${escapeHtml(r.name)}</b></td>
      <td>${escapeHtml(r.grade||'')}</td>
      <td>${escapeHtml(r.group||'')}</td>
      <td>${escapeHtml(r.phone||'')}</td>
      <td><button class="btn" data-edit="${r.id}">수정</button></td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll('[data-edit]').forEach(b=>{
    b.onclick = ()=>{ clickSound(); openStudentEditor(Number(b.dataset.edit)); };
  });

  toast(`학생 ${rows.length}명`);
}

function fillSelect(sel, values){
  sel.innerHTML='';
  for(const v of values){
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v==='' ? '(전체)' : v;
    sel.appendChild(opt);
  }
}

async function openStudentEditor(id=null){
  const modal = $('#modal');
  const title = $('#modal-title');
  const form = $('#student-form');
  form.reset();

  if(id){
    const s = await getStudent(id);
    title.textContent = '학생 수정';
    $('#student-id').value = s.id;
    $('#student-name').value = s.name||'';
    $('#student-grade').value = s.grade||'';
    $('#student-group').value = s.group||'';
    $('#student-phone').value = s.phone||'';
    $('#student-active').value = (s.active===false?'inactive':'active');
  } else {
    title.textContent = '학생 등록';
    $('#student-id').value = '';
    $('#student-active').value = 'active';
  }

  $('#student-delete').style.display = id ? 'inline-flex' : 'none';

  modal.showModal();
}

async function saveStudentFromModal(){
  const id = Number($('#student-id').value||0) || null;
  const name = $('#student-name').value.trim();
  const grade = $('#student-grade').value.trim();
  const group = $('#student-group').value.trim();
  const phone = $('#student-phone').value.trim();
  const active = $('#student-active').value === 'active';

  if(!name || !grade || !group){
    toast('이름/학년/반그룹은 필수입니다.');
    return;
  }

  const payload = { id, name, grade, group, phone, active };
  const newId = await upsertStudent(payload);
  $('#modal').close();
  toast('저장됨');
  await renderStudents();
}

async function deleteStudentFromModal(){
  const id = Number($('#student-id').value||0);
  if(!id) return;
  await setStudentActive(id, false);
  $('#modal').close();
  toast('비활성 처리됨');
  await renderStudents();
}

async function renderAttendance(){
  const date = state.attendanceDate;
  $('#att-date').value = date;
  await ensureSession(date);

  const students = await listStudents({ activeOnly: true });
  const map = await getAttendanceMap(date);

  const body = $('#att-tbody');
  body.innerHTML='';

  for(const st of students){
    const val = map[st.id] || 'absent';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${escapeHtml(st.name)}</b></td>
      <td>${escapeHtml(st.grade||'')}</td>
      <td>${escapeHtml(st.group||'')}</td>
      <td>
        <label class="pill"><input type="radio" name="att-${st.id}" value="present" ${val==='present'?'checked':''}/> 출석</label>
        <label class="pill"><input type="radio" name="att-${st.id}" value="absent" ${val!=='present'?'checked':''}/> 결석</label>
      </td>
    `;
    body.appendChild(tr);
  }

  $('#btn-att-save').onclick = async ()=>{
    clickSound();
    for(const st of students){
      const v = (document.querySelector(`input[name=att-${st.id}]:checked`)||{}).value || 'absent';
      await setAttendance(date, st.id, v);
    }
    toast('출석 저장됨');
  };

  toast(`출석 날짜: ${date}`);
}

async function computeStats(lookback){
  const sessions = await listSessions(lookback);
  const students = await listStudents({ activeOnly:true });
  const dates = sessions.map(s=>s.date);

  const sessionRates = [];
  for(const d of dates){
    const map = await getAttendanceMap(d);
    let marked = 0, present=0;
    for(const st of students){
      const v = map[st.id];
      if(!v) continue;
      marked += 1;
      if(v==='present') present += 1;
    }
    const rate = marked ? Math.round((present/marked)*1000)/10 : 0;
    sessionRates.push({ date:d, rate, present, marked });
  }

  // per student (over dates)
  const studentStats = [];
  for(const st of students){
    let marked=0, present=0;
    for(const d of dates){
      const map = await getAttendanceMap(d);
      const v = map[st.id];
      if(!v) continue;
      marked++; if(v==='present') present++;
    }
    const rate = marked ? Math.round((present/marked)*1000)/10 : 0;
    studentStats.push({ id:st.id, name:st.name, grade:st.grade, group:st.group, rate, marked, present });
  }

  // per group
  const keyOf = (st)=>`${st.grade}__${st.group}`;
  const groups = {};
  for(const st of students){
    const k = keyOf(st);
    groups[k] = groups[k] || { grade:st.grade, group:st.group, marked:0, present:0 };
    for(const d of dates){
      const map = await getAttendanceMap(d);
      const v = map[st.id];
      if(!v) continue;
      groups[k].marked++; if(v==='present') groups[k].present++;
    }
  }
  const groupStats = Object.values(groups).map(g=>({
    ...g,
    rate: g.marked ? Math.round((g.present/g.marked)*1000)/10 : 0,
    label: `${g.grade}-${g.group}`
  })).sort((a,b)=>a.label.localeCompare(b.label));

  studentStats.sort((a,b)=> (b.rate-a.rate) || (b.marked-a.marked));

  return { sessionRates, studentStats, groupStats, datesCount: dates.length };
}

async function renderStats(){
  $('#lookback').value = String(state.lookback);
  const { sessionRates, studentStats, groupStats, datesCount } = await computeStats(state.lookback);

  const c1 = $('#chart-sessions');
  const labels = sessionRates.map(r=>r.date.slice(5));
  const values = sessionRates.map(r=>r.rate);
  lineChart(c1, labels, values, { title: '날짜별 출석률(%)', color:'rgba(34,197,94,0.9)' });

  const c2 = $('#chart-groups');
  barChart(c2, groupStats.map(g=>g.label), groupStats.map(g=>g.rate), { title:`반/그룹별 출석률(%) · 최근 ${datesCount}회`, color:'rgba(124,58,237,0.85)'});

  const c3 = $('#chart-students');
  const top = studentStats.slice(0, 40);
  barChart(c3, top.map(s=>`${s.name} (${s.grade}-${s.group})`), top.map(s=>s.rate), { title:`학생별 출석률(%) · 최근 ${datesCount}회 (상위 40)`, color:'rgba(251,191,36,0.75)'});

  // export
  $('#btn-export-sessions').onclick = ()=>{ clickSound(); exportCanvasPng(c1, 'sessions.png'); };
  $('#btn-export-groups').onclick = ()=>{ clickSound(); exportCanvasPng(c2, 'groups.png'); };
  $('#btn-export-students').onclick = ()=>{ clickSound(); exportCanvasPng(c3, 'students.png'); };

  toast('통계 업데이트됨');
}

async function doExport(){
  clickSound();
  const payload = await exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `school_book_export_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('내보내기 완료');
}

async function doImport(file){
  clickSound();
  const text = await file.text();
  const payload = JSON.parse(text);
  await importAll(payload);
  toast('가져오기 완료');
  // refresh current tab
  setTab(activeTab);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function wire(){
  // tabs
  $$('#tabs .tab').forEach(t=> t.onclick = ()=>{ clickSound(); setTab(t.dataset.tab); });

  // student filters
  $('#btn-student-add').onclick = ()=>{ clickSound(); openStudentEditor(null); };
  $('#btn-filter').onclick = ()=>{ clickSound();
    state.studentFilters.q = $('#f-q').value;
    state.studentFilters.grade = $('#f-grade').value;
    state.studentFilters.group = $('#f-group').value;
    renderStudents();
  };
  $('#btn-filter-reset').onclick = ()=>{ clickSound(); state.studentFilters={q:'',grade:'',group:''}; renderStudents(); };

  // modal
  $('#btn-student-save').onclick = ()=>{ clickSound(); saveStudentFromModal(); };
  $('#student-delete').onclick = ()=>{ clickSound(); deleteStudentFromModal(); };

  // attendance date
  $('#btn-att-open').onclick = ()=>{ clickSound(); state.attendanceDate = $('#att-date').value || today(); renderAttendance(); };
  $('#btn-att-today').onclick = ()=>{ clickSound(); state.attendanceDate = today(); renderAttendance(); };

  // stats
  $('#btn-stats-refresh').onclick = ()=>{ clickSound(); state.lookback = Number($('#lookback').value||12); renderStats(); };
  $('#lookback').onchange = ()=>{ state.lookback = Number($('#lookback').value||12); renderStats(); };

  // backup
  $('#btn-export').onclick = ()=> doExport();
  $('#import-file').onchange = (e)=>{
    const f = e.target.files?.[0];
    if(f) doImport(f);
    e.target.value='';
  };
}

window.addEventListener('DOMContentLoaded', ()=>{
  wire();
  setTab('students');
});
