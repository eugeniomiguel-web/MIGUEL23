// scan.js - improved scanner with camera selection & friendly errors
const EVENTS_KEY = "events";
const STUDENTS_KEY = "students";
const ATT_KEY = "attendance";

function readEvents(){ return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); }
function readStudents(){ return JSON.parse(localStorage.getItem(STUDENTS_KEY) || "{}"); }
function readAttendance(){ return JSON.parse(localStorage.getItem(ATT_KEY) || "[]"); }
function writeAttendance(v){ localStorage.setItem(ATT_KEY, JSON.stringify(v)); }
function el(id){ return document.getElementById(id); }

let scanner = null;
let scannerRunning = false;

function loadEventsIntoSelect(){
  const sel = el("eventSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Event --</option>';
  const events = readEvents();
  events.forEach(e=>{ const opt=document.createElement("option"); opt.value=e.id; opt.textContent=e.name+" — "+new Date(e.datetime).toLocaleString(); sel.appendChild(opt); });
  const params = new URLSearchParams(window.location.search); const evId = params.get("eventId"); if (evId) sel.value = evId;
}

function loadCameraList(){
  const sel = el("cameraSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading cameras…</option>';
  if (!Html5Qrcode || !Html5Qrcode.getCameras) {
    sel.innerHTML = '<option value="">Camera API not available</option>';
    el("errorMsg").textContent = "Camera API not available in this browser.";
    return;
  }
  Html5Qrcode.getCameras().then(cameras=>{
    sel.innerHTML = "";
    if (!cameras || cameras.length===0){ sel.innerHTML = '<option value="__FACING_ENV__">Use back camera (facingMode)</option>'; return; }
    let preferred = 0;
    cameras.forEach((c,i)=>{ const opt=document.createElement("option"); opt.value=c.id; opt.textContent=c.label || ("Camera "+(i+1)); sel.appendChild(opt); const label=(c.label||"").toLowerCase(); if(label.includes("back")||label.includes("rear")||label.includes("environment")) preferred=i; });
    sel.selectedIndex = preferred;
  }).catch(err=>{
    console.warn("getCameras err", err);
    sel.innerHTML = '<option value="__FACING_ENV__">Use back camera (facingMode)</option>';
    el("errorMsg").textContent = "Unable to enumerate cameras. Try another browser or allow camera permission.";
  });
}

function showResult(eventObj, studentId, studentObj, date, time, status){
  el("result").style.display="block";
  el("attendanceEvent").textContent = eventObj.name;
  el("studentId").textContent = studentId;
  el("studentName").textContent = studentObj ? studentObj.name : "Student not registered";
  el("studentCourse").textContent = studentObj ? studentObj.course||"" : "---";
  el("studentYear").textContent = studentObj ? studentObj.year||"" : "---";
  el("studentSection").textContent = studentObj ? studentObj.section||"" : "---";
  el("attendanceDate").textContent = date;
  el("attendanceTime").textContent = time;
  el("studentStatus").textContent = status;
}

function handleScanned(studentId){
  const eventId = el("eventSelect") ? el("eventSelect").value : "";
  if (!eventId){ alert("Select an event first."); return; }
  const events = readEvents(); const eventObj = events.find(e=>e.id===eventId);
  if (!eventObj){ alert("Event not found"); return; }
  const students = readStudents(); const studentObj = students[studentId] || null;
  const now = new Date(); const date = now.toLocaleDateString(); const time = now.toLocaleTimeString();
  const attendance = readAttendance();
  if (studentObj){
    const already = attendance.some(r => r.eventId===eventId && r.studentId===studentId);
    if (already){ showResult(eventObj, studentId, studentObj, date, time, "Already Present ⚠️"); alert(studentObj.name+" already present."); return; }
    const record = { eventId: eventObj.id, eventName: eventObj.name, studentId, name: studentObj.name, course: studentObj.course||"", year: studentObj.year||"", section: studentObj.section||"", date, time, status: "Present" };
    attendance.push(record); writeAttendance(attendance);
    showResult(eventObj, studentId, studentObj, date, time, "Present ✅"); alert("Attendance recorded: "+studentObj.name);
  } else {
    showResult(eventObj, studentId, null, date, time, "Not Registered ❌"); alert("Student not registered: "+studentId);
  }
}

function startScanner(){
  if (scannerRunning) return;
  const eventSel = el("eventSelect");
  if (!eventSel || !eventSel.value){ alert("Please select an event first."); return; }
  const camSel = el("cameraSelect");
  const camVal = camSel ? camSel.value : "";
  scanner = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };
  let cameraArg = camVal === "__FACING_ENV__" || !camVal ? { facingMode: "environment" } : { deviceId: { exact: camVal } };
  el("errorMsg").textContent = "";
  scanner.start(cameraArg, config,
    (decodedText)=>{ const id = decodedText.trim().toUpperCase(); stopScanner().then(()=>handleScanned(id)).catch(()=>handleScanned(id)); },
    (err)=>{ /* ignore per-frame errors */ }
  ).then(()=>{ scannerRunning=true; el("startBtn").disabled=true; el("stopBtn").disabled=false; }).catch(err=>{
    console.error("start err", err);
    if (err && /PermissionDenied|NotAllowedError/i.test(err.name||err.message||"")) el("errorMsg").textContent = "Camera permission denied. Allow camera in site settings.";
    else el("errorMsg").textContent = "Could not start camera. Use HTTPS and allow camera access.";
  });
}

function stopScanner(){
  if (scanner && scannerRunning){
    return scanner.stop().then(()=>{ scannerRunning=false; el("startBtn").disabled=false; el("stopBtn").disabled=true; }).catch(err=>{ console.warn("stop err", err); scannerRunning=false; el("startBtn").disabled=false; el("stopBtn").disabled=true; });
  }
  return Promise.resolve();
}

// manual hooks
document.addEventListener('DOMContentLoaded', function(){
  loadEventsIntoSelect();
  loadCameraList();
  el("startBtn")?.addEventListener("click", startScanner);
  el("stopBtn")?.addEventListener("click", ()=>stopScanner());
  el("scanAgainBtn")?.addEventListener("click", ()=>{ el("result").style.display="none"; startScanner(); });
  el("manualScan")?.addEventListener("click", ()=>{ const id=(el("manualId")?el("manualId").value.trim().toUpperCase():""); if (!id){ alert("Enter ID"); return; } handleScanned(id); });
  el("manualMarkBtn")?.addEventListener("click", ()=>{ const id = prompt("Enter Student ID to mark:"); if (id) handleScanned(id.trim().toUpperCase()); });

  // if only one camera option and it's a deviceId, keep selected; otherwise picks facingMode fallback
});