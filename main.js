// main.js - manager with inline edit, year normalization, CSV import/export, QR support
const EVENTS_KEY = "events";
const STUDENTS_KEY = "students";
const ATT_KEY = "attendance";

function readEvents(){ return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); }
function writeEvents(v){ localStorage.setItem(EVENTS_KEY, JSON.stringify(v)); }
function readStudents(){ return JSON.parse(localStorage.getItem(STUDENTS_KEY) || "{}"); }
function writeStudents(v){ localStorage.setItem(STUDENTS_KEY, JSON.stringify(v)); }
function readAttendance(){ return JSON.parse(localStorage.getItem(ATT_KEY) || "[]"); }
function writeAttendance(v){ localStorage.setItem(ATT_KEY, JSON.stringify(v)); }
function el(id){ return document.getElementById(id); }

// -- year normalization utility --
function normalizeYear(raw){
  if (raw === undefined || raw === null) return "Other";
  const s = String(raw).trim().toLowerCase();
  if (!s) return "Other";
  if (/^(1|1st|first|year\s*1|yr\s*1)/i.test(s) || /^1\b/.test(s)) return "1";
  if (/^(2|2nd|second|year\s*2|yr\s*2)/i.test(s) || /^2\b/.test(s)) return "2";
  if (/^(3|3rd|third|year\s*3|yr\s*3)/i.test(s) || /^3\b/.test(s)) return "3";
  if (/^(4|4th|fourth|year\s*4|yr\s*4)/i.test(s) || /^4\b/.test(s)) return "4";
  if (/\b1\b/.test(s)) return "1";
  if (/\b2\b/.test(s)) return "2";
  if (/\b3\b/.test(s)) return "3";
  if (/\b4\b/.test(s)) return "4";
  return "Other";
}

// grouping config
const groupOrder = ["1","2","3","4","Other"];
const groupLabels = { "1":"1st Year","2":"2nd Year","3":"3rd Year","4":"4th Year","Other":"Other / Not specified" };
let collapsedGroups = { "1": false, "2": false, "3": false, "4": false, "Other": false };

// ---------- render events ----------
function renderEvents(){
  const ul = el("eventsList");
  if (!ul) return;
  ul.innerHTML = "";
  const events = readEvents();
  events.sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
  events.forEach(ev=>{
    const li = document.createElement("li");
    const dt = new Date(ev.datetime);
    li.innerHTML = `<div><strong>${ev.name}</strong><br/><small class="small">${dt.toLocaleString()} ${ev.desc? "· "+ev.desc:""}</small></div>
      <div>
        <button class="btn" data-id="${ev.id}" onclick="openScannerFor(event)">Scan</button>
        <button class="btn" data-id="${ev.id}" onclick="deleteEvent('${ev.id}')">Delete</button>
      </div>`;
    ul.appendChild(li);
  });
  renderAttendanceEventFilter();
}

// ---------- render students with inline edit ----------
function renderStudents(filterYear=""){
  const container = el("studentsList");
  if (!container) return;
  container.innerHTML = "";
  const students = readStudents();
  const groups = {};
  groupOrder.forEach(g=>groups[g]=[]);
  Object.keys(students).sort().forEach(id=>{
    const s = students[id];
    const year = normalizeYear(s.year);
    if (filterYear && filterYear !== "" && filterYear !== year) return;
    groups[year].push({ id, ...s, year });
  });

  groupOrder.forEach(key=>{
    const items = groups[key];
    const header = document.createElement("div");
    header.className = "group-header";
    header.innerHTML = `<div><strong>${groupLabels[key]}</strong> <span class="small" style="margin-left:8px;color:var(--muted)">(${items.length})</span></div>`;
    const controls = document.createElement("div");
    controls.style.display="flex"; controls.style.gap="8px";
    const toggle = document.createElement("button");
    toggle.className = "btn";
    toggle.textContent = collapsedGroups[key] ? "Expand" : "Collapse";
    toggle.onclick = ()=>{ collapsedGroups[key] = !collapsedGroups[key]; renderStudents(el("studentYearFilter")?.value || ""); };
    const gen = document.createElement("button");
    gen.className = "btn"; gen.textContent = "QR (first)";
    gen.onclick = ()=>{ if (items.length) generateQrFor(items[0].id); else alert("No students in this group."); };
    controls.appendChild(toggle); controls.appendChild(gen);
    header.appendChild(controls);
    container.appendChild(header);

    const body = document.createElement("div");
    body.className = "group-body";

    if (!collapsedGroups[key]) {
      if (items.length === 0){
        const note = document.createElement("div"); note.className="small"; note.textContent = "No students in this year."; body.appendChild(note);
      } else {
        items.forEach(s=>{
          const row = document.createElement("div");
          row.className = "student-row";

          // info area
          const info = document.createElement("div");
          info.className = "info";
          const title = document.createElement("div");
          title.className = "title";
          title.textContent = `${s.id} — ${s.name}`;
          const meta = document.createElement("div");
          meta.className = "small";
          meta.textContent = `${s.course || ""} ${s.section ? "· "+s.section : ""}`;
          info.appendChild(title); info.appendChild(meta);

          // actions
          const actions = document.createElement("div");
          actions.style.display="flex"; actions.style.gap="8px";

          const qrBtn = document.createElement("button"); qrBtn.className="btn"; qrBtn.textContent="QR";
          qrBtn.onclick = ()=>generateQrFor(s.id);
          actions.appendChild(qrBtn);

          // Inline Edit button (shown for all; change to condition if you want only Other)
          const editBtn = document.createElement("button");
          editBtn.className = "btn";
          editBtn.textContent = "Edit";
          editBtn.onclick = () => enableInlineEdit(row, s);
          actions.appendChild(editBtn);

          const removeBtn = document.createElement("button"); removeBtn.className="btn danger"; removeBtn.textContent="Remove";
          removeBtn.onclick = ()=>{ removeStudent(s.id); };
          actions.appendChild(removeBtn);

          row.appendChild(info);
          row.appendChild(actions);
          body.appendChild(row);
        });
      }
    } else {
      const note = document.createElement("div"); note.className="small"; note.style.padding="8px"; note.textContent="Group collapsed."; body.appendChild(note);
    }
    container.appendChild(body);
  });
}

// ---------- inline edit helper ----------
function enableInlineEdit(rowEl, student){
  // Clear row and build edit UI
  rowEl.innerHTML = "";
  rowEl.style.alignItems = "flex-start";

  // Left: inputs
  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.flexDirection = "column";
  left.style.gap = "6px";
  left.style.flex = "1";

  const idField = document.createElement("div");
  idField.className = "small";
  idField.textContent = student.id;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = student.name || "";
  nameInput.style.width = "100%";

  const courseInput = document.createElement("input");
  courseInput.type = "text";
  courseInput.value = student.course || "";
  courseInput.style.width = "100%";

  const yearSelect = document.createElement("select");
  const yearOptions = [
    {v:"", t:"-- Year --"},
    {v:"1", t:"1st Year"},
    {v:"2", t:"2nd Year"},
    {v:"3", t:"3rd Year"},
    {v:"4", t:"4th Year"},
    {v:"Other", t:"Other / Not specified"}
  ];
  yearOptions.forEach(o=>{
    const opt = document.createElement("option");
    opt.value = o.v;
    opt.textContent = o.t;
    if (o.v === student.year) opt.selected = true;
    yearSelect.appendChild(opt);
  });
  yearSelect.style.width = "180px";

  const sectionInput = document.createElement("input");
  sectionInput.type = "text";
  sectionInput.value = student.section || "";
  sectionInput.style.width = "100%";

  left.appendChild(idField);
  left.appendChild(nameInput);
  left.appendChild(courseInput);
  const row = document.createElement("div"); row.style.display="flex"; row.style.gap="8px";
  row.appendChild(yearSelect);
  row.appendChild(sectionInput);
  left.appendChild(row);

  // Right: action buttons
  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.flexDirection = "column";
  right.style.gap = "8px";
  right.style.marginLeft = "12px";

  const saveBtn = document.createElement("button"); saveBtn.className="btn"; saveBtn.textContent = "Save";
  const cancelBtn = document.createElement("button"); cancelBtn.className="btn"; cancelBtn.textContent = "Cancel";
  cancelBtn.style.background = "linear-gradient(180deg,#ddd,#ccc)"; cancelBtn.style.color = "#000";

  saveBtn.onclick = function(){
    const newName = (nameInput.value||"").trim();
    if (!newName){ alert("Name required"); return; }
    const newCourse = (courseInput.value||"").trim();
    const newYearRaw = (yearSelect.value||"").trim();
    const newYear = normalizeYear(newYearRaw);
    const newSection = (sectionInput.value||"").trim();
    // update storage
    const students = readStudents();
    if (!students[student.id]) { alert("Student not found"); return; }
    students[student.id] = { name: newName, course: newCourse, year: newYear, section: newSection };
    writeStudents(students);
    // re-render list
    renderStudents(el("studentYearFilter")?.value || "");
  };

  cancelBtn.onclick = function(){
    renderStudents(el("studentYearFilter")?.value || "");
  };

  right.appendChild(saveBtn);
  right.appendChild(cancelBtn);

  rowEl.appendChild(left);
  rowEl.appendChild(right);
}

// ---------- attendance table ----------
function renderAttendanceTable(filterEventId=""){
  const table = el("attendanceTable");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  let records = readAttendance();
  if (filterEventId) records = records.filter(r=>r.eventId===filterEventId);
  records.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.eventName}</td><td>${r.studentId}</td><td>${r.name}</td><td>${r.date}</td><td>${r.time}</td><td>${r.status}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------- CSV utilities ----------
function downloadCsv(rows, filename){
  const csv = rows.map(r => r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function exportStudentsCsv(filterYear = ""){
  const students = readStudents();
  const rows = [["id","name","course","year","section"]];
  Object.keys(students).sort().forEach(id=>{
    const s = students[id];
    const year = normalizeYear(s.year);
    if (filterYear && filterYear !== "" && filterYear !== year) return;
    rows.push([id, s.name || "", s.course || "", year, s.section || ""]);
  });
  const filename = filterYear ? `students_year${filterYear}.csv` : `students_all.csv`;
  downloadCsv(rows, filename);
}

// ---------- Edit modal (kept for compatibility) ----------
function showEditModal(studentId){
  const students = readStudents();
  const s = students[studentId];
  if (!s) { alert("Student not found"); return; }
  if (!el("editStuId")) return; // modal might not be present on every page
  el("editStuId").value = studentId;
  el("editName").value = s.name || "";
  el("editCourse").value = s.course || "";
  el("editYear").value = s.year || "Other";
  el("editSection").value = s.section || "";
  const modal = el("editModal");
  if (modal) modal.style.display = "flex";
}
function closeEditModal(){ const modal = el("editModal"); if (modal) modal.style.display = "none"; }
function saveEdit(){
  if (!el("editStuId")) return;
  const id = el("editStuId").value;
  if (!id) { alert("No student selected"); return; }
  const name = (el("editName").value || "").trim();
  if (!name) { alert("Name required"); return; }
  const course = (el("editCourse").value || "").trim();
  const rawYear = (el("editYear").value || "").trim();
  const year = normalizeYear(rawYear);
  const section = (el("editSection").value || "").trim();
  const students = readStudents();
  if (!students[id]) { alert("Student not found"); return; }
  students[id] = { name, course, year, section };
  writeStudents(students);
  closeEditModal();
  renderStudents(el("studentYearFilter")?.value || "");
  alert("Student updated.");
}
function attachEditHandlers(){
  const save = el("editSaveBtn"); if (save) save.addEventListener("click", saveEdit);
  const cancel = el("editCancelBtn"); if (cancel) cancel.addEventListener("click", closeEditModal);
}

// ---------- bindings (safeAttach) ----------
function safeAttach(){
  // event form
  const eventForm = el("eventForm");
  if (eventForm){
    eventForm.addEventListener("submit", function(e){
      e.preventDefault();
      const name = (el("eventName")? el("eventName").value.trim() : "");
      let datetime = (el("eventDatetime")? el("eventDatetime").value : "");
      const desc = (el("eventDesc")? el("eventDesc").value.trim() : "");
      if (!name) { alert("Event name required"); return; }
      if (!datetime){
        const now = new Date(); const pad = n => String(n).padStart(2,'0');
        datetime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      }
      const events = readEvents();
      events.push({ id: "evt-"+Date.now(), name, datetime, desc });
      writeEvents(events);
      eventForm.reset();
      renderEvents();
    });
  }

  // student form
  const studentForm = el("studentForm");
  if (studentForm){
    studentForm.addEventListener("submit", function(e){
      e.preventDefault();
      const id = (el("stuId")? el("stuId").value.trim().toUpperCase() : "");
      const name = (el("stuName")? el("stuName").value.trim() : "");
      if (!id || !name){ alert("ID and name required"); return; }
      const students = readStudents();
      const rawYear = (el("stuYear")? el("stuYear").value : "");
      const year = normalizeYear(rawYear);
      students[id] = { name, course: (el("stuCourse")? el("stuCourse").value.trim() : ""), year, section: (el("stuSection")? el("stuSection").value.trim() : "") };
      writeStudents(students);
      studentForm.reset();
      collapsedGroups[year] = false;
      renderStudents(el("studentYearFilter")?.value || "");
    });
  }

  // import CSV
  const importBtn = el("importCsv");
  if (importBtn){
    importBtn.addEventListener("click", function(){
      const input = el("csvInput");
      if (!input) return;
      const text = input.value.trim();
      if (!text){ alert("Paste CSV data first"); return; }
      const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const students = readStudents();
      lines.forEach(line=>{
        const cols = line.split(",");
        const first = (cols[0]||"").trim().toLowerCase();
        if (first === "id" || first === "student id") return;
        const id = (cols[0]||"").trim().toUpperCase();
        if (!id) return;
        const rawName = (cols[1]||"").trim();
        const rawCourse = (cols[2]||"").trim();
        const rawYear = (cols[3]||"").trim();
        const rawSection = (cols[4]||"").trim();
        const year = normalizeYear(rawYear);
        students[id] = { name: rawName || id, course: rawCourse, year, section: rawSection };
      });
      writeStudents(students);
      input.value = "";
      renderStudents(el("studentYearFilter")?.value || "");
    });
  }

  // export all / visible
  const exportBtn = el("exportStudents");
  if (exportBtn) exportBtn.addEventListener("click", ()=>exportStudentsCsv(""));
  const exportVisibleBtn = el("exportVisible");
  if (exportVisibleBtn) exportVisibleBtn.addEventListener("click", ()=>{
    const filter = el("studentYearFilter") ? el("studentYearFilter").value : "";
    exportStudentsCsv(filter || "");
  });

  // year filter
  const yearFilter = el("studentYearFilter");
  if (yearFilter) yearFilter.addEventListener("change", function(){ renderStudents(this.value); });

  // expand / collapse
  const expandAll = el("expandAll");
  if (expandAll) expandAll.addEventListener("click", function(){ groupOrder.forEach(g=>collapsedGroups[g]=false); renderStudents(el("studentYearFilter")?.value || ""); });
  const collapseAll = el("collapseAll");
  if (collapseAll) collapseAll.addEventListener("click", function(){ groupOrder.forEach(g=>collapsedGroups[g]=true); renderStudents(el("studentYearFilter")?.value || ""); });

  // attendance export/clear (if present)
  const exportAttendance = el("exportAttendance");
  if (exportAttendance) exportAttendance.addEventListener("click", function(){
    const filter = el("attendanceEventFilter") ? el("attendanceEventFilter").value : "";
    let records = readAttendance(); if (filter) records = records.filter(r=>r.eventId===filter);
    const rows = [["eventId","eventName","studentId","name","course","year","section","date","time","status"]];
    records.forEach(r=>rows.push([r.eventId,r.eventName,r.studentId,r.name,r.course||"",r.year||"",r.section||"",r.date,r.time,r.status]));
    downloadCsv(rows, "attendance.csv");
  });
  const clearAttendanceBtn = el("clearAttendance");
  if (clearAttendanceBtn) clearAttendanceBtn.addEventListener("click", function(){
    if (!confirm("Clear all attendance records?")) return;
    localStorage.removeItem(ATT_KEY);
    renderAttendanceTable();
  });
}

// ---------- QR generator (kept simple) ----------
function generateQrFor(studentId){
  const canvas = el("qrCanvas"), modal = el("qrModal");
  if (modal && canvas){
    const idSpan = el("qrStudentId"); if (idSpan) idSpan.textContent = studentId;
    try {
      const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
      if (typeof QRious !== "undefined") {
        new QRious({ element: canvas, value: studentId, size: Math.min(260, canvas.width), level: 'H' });
      } else {
        ctx.font="18px sans-serif"; ctx.fillStyle="#000"; ctx.fillText(studentId,10,50);
      }
    } catch(err){ alert("QR generation failed: "+err); return; }
    modal.style.display = "block"; return;
  }
  if (typeof QRious !== "undefined"){
    const tmp = document.createElement("canvas"); tmp.width=260; tmp.height=260; new QRious({ element: tmp, value: studentId, size:260, level:'H' });
    const dataUrl = tmp.toDataURL("image/png"); const w = window.open(""); w.document.write(`<img src="${dataUrl}" /><p>${studentId}</p>`); w.document.close(); w.focus();
  } else alert("QR generator missing and no modal on this page.");
}

function attachQrControls(){
  const dl = el("downloadQrBtn"); if (dl) dl.addEventListener("click", ()=>{ const c=el("qrCanvas"); if(!c){alert("QR canvas missing");return;} const a=document.createElement("a"); a.href=c.toDataURL("image/png"); a.download=(el("qrStudentId")?el("qrStudentId").textContent:"qr")+".png"; document.body.appendChild(a); a.click(); a.remove(); });
  const pr = el("printQrBtn"); if (pr) pr.addEventListener("click", ()=>{ const c=el("qrCanvas"); if(!c){alert("QR canvas missing");return;} const data=c.toDataURL("image/png"); const w=window.open(""); w.document.write(`<img src="${data}" style="width:260px;height:260px" />`); w.document.close(); w.focus(); w.print(); w.close(); });
  const close = el("closeQrBtn"); if (close) close.addEventListener("click", ()=>{ const m=el("qrModal"); if (m) m.style.display="none"; const c=el("qrCanvas"); if (c){ const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); } });
}

// ---------- other utilities ----------
function removeStudent(id){
  if (!confirm("Remove student " + id + "?")) return;
  const s = readStudents(); delete s[id]; writeStudents(s); renderStudents(el("studentYearFilter")?.value || "");
}

function deleteEvent(id){ if(!confirm("Delete this event?")) return; let ev = readEvents(); ev = ev.filter(e=>e.id!==id); writeEvents(ev); renderEvents(); }
function openScannerFor(ev){ const id = ev.target ? ev.target.getAttribute("data-id") : null; if (!id) return; const url = new URL(window.location.href); const base = url.origin + url.pathname.replace(/[^/]*$/, '') + "miguel2.html"; window.open(base + "?eventId=" + encodeURIComponent(id), "_blank"); }

function renderAttendanceEventFilter(){
  const eventSelect = el("attendanceEventFilter");
  if (!eventSelect) return;
  eventSelect.innerHTML = '<option value="">-- All events --</option>';
  const events = readEvents();
  events.forEach(e=>{ const opt=document.createElement("option"); opt.value=e.id; opt.textContent = e.name + " — " + new Date(e.datetime).toLocaleString(); eventSelect.appendChild(opt); });
  eventSelect.onchange = ()=>renderAttendanceTable(eventSelect.value);
}

// Migration: normalize all existing student.year values in storage
function normalizeAllStudentYears(){
  const students = readStudents();
  let changed = false;
  Object.keys(students).forEach(id=>{
    const s = students[id];
    const norm = normalizeYear(s.year);
    if (s.year !== norm){
      students[id].year = norm;
      changed = true;
    }
  });
  if (changed) writeStudents(students);
}

// initial boot
window.addEventListener('load', function(){
  normalizeAllStudentYears();
  safeAttach();
  attachQrControls();
  attachEditHandlers();
  if (el("eventsList")) renderEvents();
  if (el("studentsList")) renderStudents();
  if (el("attendanceTable")) renderAttendanceTable();
  if (el("attendanceEventFilter")) renderAttendanceEventFilter();
});