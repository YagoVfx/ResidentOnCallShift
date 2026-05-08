/* =============================================
   GUARDIAS MIR — APP.JS v6
   ============================================= */

// ============================================================
// ESTADO GLOBAL
// ============================================================
const STATE = {
  session:      null,
  viewYear:     null,
  viewMonth:    null,
  drag:         null,
  fakeDay:      null,       // DEV: día simulado
  fakeMonth:    null,       // DEV: mes simulado (0-based)
  fakeYear:     null,       // DEV: año simulado
  addModalDay:  null,
  addModalKey:  null,
};

const SETTINGS_KEY  = 'mir_settings';

// Cache de usuarios y settings para evitar llamadas Firestore en cada tecla
let _usersCache    = null;
let _settingsCache = null;

// Invalidar cache cuando se guardan datos
const _origSaveUsers = async (u) => { _usersCache = u; await dbSet('users', u); };
const _origSaveSettings = async (s) => { _settingsCache = s; await dbSet('settings', s); };
const SHOWN_WELCOME = 'mir_shown_welcome';
const DEV_PASSWORD  = 'dev123';   // contraseña DEV — no mostrar en UI

// ============================================================
// CAPA DE DATOS — Firebase Firestore
// ============================================================
import { initializeApp }                     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAMo1I-x4TV2yb_snMAjvLw8plReHNjzoY",
  authDomain:        "residentoncallshift.firebaseapp.com",
  projectId:         "residentoncallshift",
  storageBucket:     "residentoncallshift.firebasestorage.app",
  messagingSenderId: "430597501785",
  appId:             "1:430597501785:web:cf0713d0954a96fade9248",
};
const _app = initializeApp(firebaseConfig);
const db   = getFirestore(_app);

async function dbGet(key) {
  try { const s=await getDoc(doc(db,'mirapp',key)); return s.exists()?s.data().value:null; }
  catch(e) { console.error('dbGet',key,e); return null; }
}
async function dbSet(key,value) {
  try { await setDoc(doc(db,'mirapp',key),{value}); }
  catch(e) { console.error('dbSet',key,e); }
}

async function loadGuardias()  { return (await dbGet('guardias'))  || {}; }
async function saveGuardias(d) { await dbSet('guardias',d); }
async function loadBackup()    { return await dbGet('guardias_backup'); }
async function saveBackup(d)   { await dbSet('guardias_backup',d); }
async function loadUsers()     {
  if (_usersCache !== null) return _usersCache;
  _usersCache = (await dbGet('users')) || [];
  return _usersCache;
}
async function saveUsers(u)    { await dbSet('users',u); }
async function loadApproved()  { return (await dbGet('approved'))  || {}; }
async function saveApproved(d) { await dbSet('approved',d); }
async function loadSettings()  {
  if (_settingsCache !== null) return _settingsCache;
  _settingsCache = Object.assign({}, defaultSettings(), (await dbGet('settings')) || {});
  return _settingsCache;
}
async function saveSettings(s) { await dbSet('settings',s); }

// Bienvenida y PIN: locales por dispositivo
function hasSeenWelcome(name) {
  try { return (JSON.parse(localStorage.getItem(SHOWN_WELCOME))||[]).includes(name); }
  catch { return false; }
}
function markWelcomeSeen(name) {
  try {
    const s=JSON.parse(localStorage.getItem(SHOWN_WELCOME))||[];
    if (!s.includes(name)){ s.push(name); localStorage.setItem(SHOWN_WELCOME,JSON.stringify(s)); }
  } catch {}
}
// PIN: guardado como "nombre→pin" en localStorage
function getPinForUser(name) {
  try { return (JSON.parse(localStorage.getItem('mir_pins'))||{})[name]||null; }
  catch { return null; }
}
function setPinForUser(name,pin) {
  try {
    const p=JSON.parse(localStorage.getItem('mir_pins'))||{};
    p[name]=pin; localStorage.setItem('mir_pins',JSON.stringify(p));
  } catch {}
}
function hasPinSet(name) { return getPinForUser(name)!==null; }

// ============================================================
// FIN CAPA DE DATOS
// ============================================================

function defaultSettings() {
  return { allowR1R2:false, levelMix:true, limitWeek:true, limitMon:true, limitSat:true, limitSun:true, deadlineOn:true };
}

async function ensureDefaultAdmin() {
  const users=await loadUsers();
  if (!users.some(u=>u.rol==='admin')) {
    users.push({name:'Admin',level:'R4',rol:'admin',pass:'admin123'});
    await saveUsers(users);
  }
}

// ============================================================
// FECHA — respeta fakeDay/fakeMonth/fakeYear del DEV
// ============================================================
function today() {
  const r=new Date();
  const y = STATE.fakeYear  ?? r.getFullYear();
  const m = STATE.fakeMonth ?? r.getMonth();
  const d = STATE.fakeDay   ?? r.getDate();
  return new Date(y,m,d);
}

function monthKey(y,m)       { return `${y}-${String(m+1).padStart(2,'0')}`; }
function daysInMonth(y,m)    { return new Date(y,m+1,0).getDate(); }
function firstDayOfMonth(y,m){ const d=new Date(y,m,1).getDay(); return d===0?6:d-1; }
function dayOfWeek(y,m,d)    { return new Date(y,m,d).getDay(); }

async function maxGuardsForDay(y,m,d) {
  const s=await loadSettings(); const wd=dayOfWeek(y,m,d);
  if (wd===1&&s.limitMon) return 3;
  if (wd===6&&s.limitSat) return 3;
  if (wd===0&&s.limitSun) return 3;
  if (s.limitWeek)        return 2;
  return 99;
}
function hasRequiredLevelMix(g) {
  return g.length>=2 && g.some(x=>x.level==='R3'||x.level==='R4') && g.some(x=>x.level==='R1'||x.level==='R2');
}
async function canPropose(level) {
  if (level==='R3'||level==='R4') return true;
  return (await loadSettings()).allowR1R2;
}

function parseDaysInput(raw,y,m) {
  const maxDay=daysInMonth(y,m); const result={valid:[],errors:[]};
  if (/[^0-9,\s]/.test(raw)){ result.errors.push('Solo números separados por comas.'); return result; }
  const parts=raw.split(',').map(s=>s.trim()).filter(Boolean);
  if (!parts.length){ result.errors.push('Introduce al menos un día.'); return result; }
  const seen=new Set();
  for(const p of parts){
    if(!/^\d+$/.test(p)){ result.errors.push(`"${p}" no válido.`); continue; }
    const n=parseInt(p,10);
    if(n<1||n>maxDay){ result.errors.push(`Día ${n} fuera de rango (1–${maxDay}).`); continue; }
    if(seen.has(n))  { result.errors.push(`Día ${n} duplicado.`); continue; }
    seen.add(n); result.valid.push(n);
  }
  return result;
}
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ============================================================
// AVISO BIENVENIDA
// ============================================================
function showWelcomeIfNeeded(session) {
  if (session.rol!=='user') return;
  if (hasSeenWelcome(session.name)) return;
  document.getElementById('welcome-name').textContent=session.name;
  document.getElementById('welcome-overlay').classList.remove('hidden');
}
function setupWelcome() {
  document.getElementById('btn-welcome-close').addEventListener('click',()=>{
    markWelcomeSeen(STATE.session?.name||'');
    document.getElementById('welcome-overlay').classList.add('hidden');
  });
}

// ============================================================
// LOGIN
// ============================================================
function setupLogin() {
  setupWelcome();

  const nameEl   = document.getElementById('login-name');
  const levelGrp = document.getElementById('login-level-group');
  const passGrp  = document.getElementById('login-admin-pass-group');
  const passEl   = document.getElementById('login-pass');

  nameEl.addEventListener('input', async () => {
    const nameLow = nameEl.value.trim().toLowerCase();
    const pinHint = document.getElementById('login-pin-hint');

    // Reset UI
    levelGrp.classList.remove('hidden');
    passGrp.classList.add('hidden');
    if (pinHint) pinHint.textContent = '';

    if (!nameLow) return;

    // DEV — solo mostrar campo contraseña, nunca el panel DEV en login
    if (nameLow === 'dev') {
      levelGrp.classList.add('hidden');
      passGrp.classList.remove('hidden');
      return;
    }

    const users = await loadUsers();

    // Admin
    if (users.some(u => u.name.toLowerCase()===nameLow && u.rol==='admin')) {
      levelGrp.classList.add('hidden');
      passGrp.classList.remove('hidden');
      if (pinHint) pinHint.textContent = 'Administrador — introduce tu contraseña.';
      return;
    }

    // Usuario registrado — nivel siempre visible, prellenar si existe
    const matched = users.find(u => u.name.toLowerCase()===nameLow && u.rol==='user');
    if (matched) {
      levelGrp.classList.remove('hidden');
      const sel = document.getElementById('login-level');
      if (matched.level && sel) sel.value = matched.level;
      passGrp.classList.remove('hidden');
      if (pinHint) {
        pinHint.textContent = hasPinSet(matched.name)
          ? '🔒 Introduce tu PIN personal.'
          : '🔓 Sin PIN. Puedes crear uno ahora o dejar vacío para entrar.';
      }
      return;
    }

    // Nuevo usuario
    levelGrp.classList.remove('hidden');
    passGrp.classList.remove('hidden');
    if (pinHint) pinHint.textContent = '👋 Nuevo usuario. Elige tu nivel y un PIN opcional.';
  });

  document.getElementById('btn-login-user').addEventListener('click', doLogin);
  nameEl.addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
  passEl.addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });

  document.getElementById('btn-dev-quick-create').addEventListener('click', devQuickCreate);
  document.getElementById('btn-dev-apply-date').addEventListener('click', applyFakeDateLogin);
  document.getElementById('btn-dev-reset-date').addEventListener('click', resetFakeDateLogin);
}

function applyFakeDateLogin() {
  const dv = parseInt(document.getElementById('dev-fake-day').value,10)||null;
  const mv = document.getElementById('dev-fake-month')?.value;
  const yv = parseInt(document.getElementById('dev-fake-year')?.value,10)||null;
  const st = document.getElementById('dev-fake-day-status');
  STATE.fakeDay   = (dv>=1&&dv<=31) ? dv : null;
  STATE.fakeMonth = (mv!==''&&mv!=null) ? parseInt(mv,10) : null;
  STATE.fakeYear  = yv||null;
  if (STATE.fakeDay!==null||STATE.fakeMonth!==null||STATE.fakeYear!==null) {
    st.textContent = `✅ Simulando: ${today().toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'})}`;
  } else { st.textContent='Sin simulación activa.'; }
}
function resetFakeDateLogin() {
  STATE.fakeDay=null; STATE.fakeMonth=null; STATE.fakeYear=null;
  const d=document.getElementById('dev-fake-day');   if(d) d.value='';
  const m=document.getElementById('dev-fake-month'); if(m) m.value='';
  const y=document.getElementById('dev-fake-year');  if(y) y.value='';
  document.getElementById('dev-fake-day-status').textContent='Usando fecha real.';
}

async function doLogin() {
  const nameRaw = document.getElementById('login-name').value.trim();
  const level   = document.getElementById('login-level').value;
  const pass    = document.getElementById('login-pass').value;

  if (!nameRaw) { showLoginError('Introduce tu nombre.'); return; }

  // DEV
  if (nameRaw.toLowerCase()==='dev') {
    if (pass!==DEV_PASSWORD) { showLoginError('Credenciales incorrectas.'); return; }
    startSession({name:'DEV', level:'R4', rol:'dev'});
    return;
  }

  const users   = await loadUsers();
  const matched = users.find(u => u.name.toLowerCase()===nameRaw.toLowerCase());

  // Admin
  if (matched && matched.rol==='admin') {
    if (matched.pass && matched.pass!==pass) { showLoginError('Contraseña incorrecta.'); return; }
    startSession({name:matched.name, level:matched.level||'R4', rol:'admin'});
    return;
  }

  // Usuario registrado
  if (matched && matched.rol==='user') {
    // Nivel: usar el del formulario si lo seleccionó, si no el guardado
    const finalLevel = level || matched.level || 'R4';

    if (hasPinSet(matched.name)) {
      if (!pass) { showLoginError('Este usuario tiene PIN. Introdúcelo para entrar.'); return; }
      if (getPinForUser(matched.name)!==pass) { showLoginError('PIN incorrecto.'); return; }
    } else {
      // Sin PIN: si escribe uno ahora, guardarlo
      if (pass) { setPinForUser(matched.name, pass); }
    }

    // Actualizar nivel en Firestore si cambió
    if (level && level!==matched.level) {
      matched.level = level;
      await saveUsers(users);
    }

    startSession({name:matched.name, level:finalLevel, rol:'user'});
    return;
  }

  // Usuario nuevo
  if (!level) { showLoginError('Selecciona tu nivel MIR.'); return; }
  if (pass) { setPinForUser(nameRaw, pass); }
  users.push({name:nameRaw, level, rol:'user'});
  await saveUsers(users);
  startSession({name:nameRaw, level, rol:'user'});
}

async function devQuickCreate() {
  const name =document.getElementById('dev-quick-name').value.trim();
  const level=document.getElementById('dev-quick-level').value;
  const rol  =document.getElementById('dev-quick-rol').value;
  if (!name) { showLoginError('Introduce un nombre.'); return; }
  const users=await loadUsers();
  if (users.some(u=>u.name.toLowerCase()===name.toLowerCase())) { showLoginError('Nombre ya existente.'); return; }
  const u={name,level,rol};
  if (rol==='admin') u.pass='admin123';
  users.push(u); await saveUsers(users);
  document.getElementById('dev-quick-name').value='';
  renderDevLoginList();
  startSession({name,level,rol});
}

async function renderDevLoginList() {
  const users=await loadUsers();
  const el=document.getElementById('dev-login-users-list');
  if (!users.length){ el.innerHTML='<p style="color:#444;font-size:11px;text-align:center">Sin usuarios</p>'; return; }
  el.innerHTML=users.map((u,i)=>`
    <div class="dev-login-user-item">
      <span class="info"><strong>${escHtml(u.name)}</strong> ${u.level?'· '+u.level:''}</span>
      <span class="dev-login-user-badge badge-${u.rol}">${u.rol.toUpperCase()}</span>
      <div style="display:flex;gap:3px">
        <button class="btn-switch-login" onclick="devLoginAs(${i})">Entrar</button>
        <button class="btn-del-login"    onclick="devDelFromLogin(${i})">✕</button>
      </div>
    </div>`).join('');
}

async function devLoginAs(i) {
  const users=await loadUsers(); const u=users[i];
  if (u) startSession({name:u.name,level:u.level||'R4',rol:u.rol});
}
async function devDelFromLogin(i) {
  const users=await loadUsers(); const x=users[i]; if (!x) return;
  if (x.rol==='admin'&&users.filter(a=>a.rol==='admin').length<=1){ showLoginError('Mínimo 1 admin.'); return; }
  users.splice(i,1); await saveUsers(users); renderDevLoginList();
}

function showLoginError(msg) {
  const el=document.getElementById('login-error');
  el.textContent=msg; setTimeout(()=>{ el.textContent=''; },4000);
}

// ============================================================
// SESIÓN
// ============================================================
let navReady=false;
function startSession(sess) {
  STATE.session=sess;
  const now=today();
  STATE.viewYear=now.getFullYear(); STATE.viewMonth=now.getMonth();
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderTopbar(); renderSidebar(); renderCalendar();
  if (!navReady){ setupNavigation(); navReady=true; }
  showWelcomeIfNeeded(sess);
}

function logout() {
  STATE.session=null;
  document.getElementById('welcome-overlay').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-name').value='';
  document.getElementById('login-level').value='';
  document.getElementById('login-pass').value='';
  document.getElementById('login-error').textContent='';
  document.getElementById('login-admin-pass-group').classList.add('hidden');
  document.getElementById('login-level-group').classList.remove('hidden');
  // Ocultar DEV panel
  const tab=document.getElementById('tab-dev');
  tab.classList.remove('dev-visible'); tab.classList.add('tab-dev-hidden');
}

// ============================================================
// TOPBAR
// ============================================================
function renderTopbar() {
  const {session}=STATE;
  const rolEl=document.getElementById('topbar-rol');
  rolEl.textContent=session.rol.toUpperCase(); rolEl.className=`topbar-rol rol-${session.rol}`;
  document.getElementById('topbar-user').textContent=session.name+(session.level?` · ${session.level}`:'');
}

// ============================================================
// SIDEBAR
// ============================================================
async function renderSidebar() {
  const {session}=STATE; const rol=session.rol; const isAdm=rol==='admin'||rol==='dev';
  document.getElementById('admin-card').classList.toggle('hidden',!isAdm);
  document.getElementById('dev-card').classList.toggle('hidden',rol!=='dev');
  document.getElementById('users-card').classList.toggle('hidden',!isAdm);
  document.getElementById('cal-hint').classList.toggle('hidden',!isAdm);
  document.getElementById('prop-name').value=session.name;
  document.getElementById('prop-level').value=session.level;
  if (rol==='dev') { await syncDevToggles(); renderDevSwitchList(); }
  await updateFormState();
  if (isAdm) { await renderUsersList(); }
  if (isAdm) {
    const key=monthKey(STATE.viewYear,STATE.viewMonth);
    const approved=await loadApproved();
    document.getElementById('admin-status').textContent=approved[key]?'✅ Mes aprobado':'📋 Mes pendiente';
  }
}

async function syncDevToggles() {
  const s=await loadSettings();
  document.getElementById('toggle-r1r2').checked       =s.allowR1R2;
  document.getElementById('toggle-level-mix').checked  =s.levelMix;
  document.getElementById('toggle-limit-week').checked =s.limitWeek;
  document.getElementById('toggle-limit-mon').checked  =s.limitMon;
  document.getElementById('toggle-limit-sat').checked  =s.limitSat;
  document.getElementById('toggle-limit-sun').checked  =s.limitSun;
  document.getElementById('toggle-deadline').checked   =s.deadlineOn;
}

async function updateFormState() {
  const {session,viewYear,viewMonth}=STATE;
  const now=today(); const curY=now.getFullYear(),curM=now.getMonth(),curD=now.getDate();
  const s=await loadSettings();
  const isNextMonth=(viewYear>curY)||(viewYear===curY&&viewMonth>curM);
  const isCurrentMonth=viewYear===curY&&viewMonth===curM;
  const warnEl=document.getElementById('form-deadline-warning');
  const infoEl=document.getElementById('form-current-month-info');
  const btn=document.getElementById('btn-submit-prop');
  warnEl.classList.add('hidden'); infoEl.classList.add('hidden'); btn.disabled=false;
  if (!(await canPropose(session.level))) {
    warnEl.classList.remove('hidden');
    warnEl.textContent=`ℹ️ Tu nivel (${session.level}) no puede proponer guardias aún. El administrador puede activarlo.`;
    btn.disabled=true; return;
  }
  if (isNextMonth&&s.deadlineOn&&curD>15) {
    warnEl.classList.remove('hidden');
    warnEl.textContent='⚠️ Plazo cerrado. Las propuestas del mes siguiente se cierran el día 15 a las 00:00.';
    btn.disabled=true; return;
  }
  if (isCurrentMonth) infoEl.classList.remove('hidden');
}

async function renderUsersList() {
  const users=await loadUsers();
  document.getElementById('users-count-badge').textContent=users.length;
  const el=document.getElementById('users-list');
  el.innerHTML=users.length
    ?users.map(u=>`<div class="user-item"><span class="user-item-name">${escHtml(u.name)} <small>${u.level||''}</small></span><span class="user-badge badge-${u.rol}">${u.rol.toUpperCase()}</span></div>`).join('')
    :'<p style="color:#444;font-size:12px;text-align:center;padding:4px 0">Sin usuarios</p>';
}

async function renderDevSwitchList() {
  const users=await loadUsers();
  const el=document.getElementById('dev-user-switch-list');
  if (!users.length){ el.innerHTML='<p style="color:#444;font-size:11px">Sin usuarios</p>'; return; }
  el.innerHTML=users.map((u,i)=>`
    <div class="switch-item">
      <span class="info"><strong>${escHtml(u.name)}</strong> ${u.level?'·'+u.level:''} <span class="dev-login-user-badge badge-${u.rol}">${u.rol}</span></span>
      <button class="btn-switch" onclick="devSwitchInApp(${i})">Entrar</button>
      <button class="btn-del"    onclick="devDelInApp(${i})">✕</button>
    </div>`).join('');
}

async function devSwitchInApp(i) {
  const users=await loadUsers(); const u=users[i]; if(!u) return;
  STATE.session={name:u.name,level:u.level||'R4',rol:u.rol};
  renderTopbar(); renderSidebar(); renderCalendar();
}
async function devDelInApp(i) {
  const users=await loadUsers(); const x=users[i]; if(!x) return;
  if (x.rol==='admin'&&users.filter(a=>a.rol==='admin').length<=1){ alert('Mínimo 1 admin.'); return; }
  users.splice(i,1); await saveUsers(users);
  renderDevSwitchList(); renderUsersList();
}

// ============================================================
// NAVEGACIÓN
// ============================================================
function setupNavigation() {
  document.getElementById('btn-prev').addEventListener('click',navPrev);
  document.getElementById('btn-next').addEventListener('click',navNext);
  document.getElementById('btn-logout').addEventListener('click',logout);
  document.getElementById('btn-submit-prop').addEventListener('click',submitProposal);
  document.getElementById('btn-approve').addEventListener('click',approveMonth);
  document.getElementById('btn-reset').addEventListener('click',resetMonth);
  document.getElementById('btn-restore').addEventListener('click',restoreBackup);
  document.getElementById('btn-dev-create').addEventListener('click',devCreateUser);
  document.getElementById('btn-export-pdf').addEventListener('click',()=>window.print());
  document.getElementById('btn-admin-add-user').addEventListener('click',adminAddUser);
  document.getElementById('admin-new-name').addEventListener('keydown',e=>{ if(e.key==='Enter') adminAddUser(); });

  document.getElementById('prop-days').addEventListener('input',()=>{
    const raw=document.getElementById('prop-days').value;
    if(/[^0-9,\s]/.test(raw)){
      document.getElementById('prop-days').value=raw.replace(/[^0-9,\s]/g,'');
      document.getElementById('prop-days-warning').textContent='Solo números separados por comas.';
    } else document.getElementById('prop-days-warning').textContent='';
  });
  document.getElementById('prop-count').addEventListener('input',()=>{
    const v=parseInt(document.getElementById('prop-count').value,10);
    if(v<1) document.getElementById('prop-count').value=1;
    if(v>5) document.getElementById('prop-count').value=5;
  });

  const toggleMap={'toggle-r1r2':'allowR1R2','toggle-level-mix':'levelMix','toggle-limit-week':'limitWeek',
    'toggle-limit-mon':'limitMon','toggle-limit-sat':'limitSat','toggle-limit-sun':'limitSun','toggle-deadline':'deadlineOn'};
  Object.entries(toggleMap).forEach(([id,key])=>{
    document.getElementById(id).addEventListener('change',async e=>{
      const s=await loadSettings(); s[key]=e.target.checked; await saveSettings(s);
      updateFormState(); renderCalendar();
    });
  });

  // DEV fake date en app
  document.getElementById('btn-dev-apply-date-app').addEventListener('click', applyFakeDateApp);
  document.getElementById('btn-dev-reset-date-app').addEventListener('click', resetFakeDateApp);

  document.getElementById('add-modal-close').addEventListener('click',closeAddModal);
  document.getElementById('add-modal').addEventListener('click',e=>{ if(e.target===document.getElementById('add-modal')) closeAddModal(); });
  document.getElementById('btn-add-modal-confirm').addEventListener('click',confirmAddModal);
}

function applyFakeDateApp() {
  const dv=parseInt(document.getElementById('dev-fake-day-app').value,10)||null;
  const mv=document.getElementById('dev-fake-month-app').value;
  const yv=parseInt(document.getElementById('dev-fake-year-app').value,10)||null;
  const st=document.getElementById('dev-fake-day-status-app');
  STATE.fakeDay   = (dv>=1&&dv<=31)?dv:null;
  STATE.fakeMonth = (mv!=='')?parseInt(mv,10):null;
  STATE.fakeYear  = yv||null;
  if (STATE.fakeDay!==null||STATE.fakeMonth!==null||STATE.fakeYear!==null) {
    const td=today();
    st.textContent=`✅ ${td.toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'})}`;
    // Resincronizar vista al mes simulado si corresponde
    STATE.viewYear=td.getFullYear(); STATE.viewMonth=td.getMonth();
  } else { st.textContent='Fecha real restaurada.'; }
  updateFormState(); renderCalendar();
}
function resetFakeDateApp() {
  STATE.fakeDay=null; STATE.fakeMonth=null; STATE.fakeYear=null;
  document.getElementById('dev-fake-day-app').value='';
  document.getElementById('dev-fake-month-app').value='';
  document.getElementById('dev-fake-year-app').value='';
  document.getElementById('dev-fake-day-status-app').textContent='Fecha real restaurada.';
  // Volver a la vista del mes real actual sin borrar nada
  const now=new Date();
  STATE.viewYear=now.getFullYear();
  STATE.viewMonth=now.getMonth();
  // Llamar a renderCalendar directamente (sin cleanOldMonths)
  updateFormState();
  renderCalendar();
}

function navPrev() {
  const now=today();
  if(STATE.viewYear===now.getFullYear()&&STATE.viewMonth===now.getMonth()) return;
  STATE.viewMonth--; if(STATE.viewMonth<0){STATE.viewMonth=11;STATE.viewYear--;}
  renderCalendar(); updateFormState();
}
function navNext() {
  const now=today(); let ny=now.getFullYear(),nm=now.getMonth()+1; if(nm>11){nm=0;ny++;}
  if(STATE.viewYear===ny&&STATE.viewMonth===nm) return;
  STATE.viewMonth++; if(STATE.viewMonth>11){STATE.viewMonth=0;STATE.viewYear++;}
  renderCalendar(); updateFormState();
}

// ============================================================
// ADMIN: AÑADIR USUARIO
// ============================================================
async function adminAddUser() {
  const name =document.getElementById('admin-new-name').value.trim();
  const level=document.getElementById('admin-new-level').value;
  const warnEl=document.getElementById('admin-add-user-warning');
  warnEl.textContent=''; warnEl.style.color='';
  if (!name){ warnEl.textContent='Introduce un nombre.'; return; }
  const users=await loadUsers();
  if (users.some(u=>u.name.toLowerCase()===name.toLowerCase())){ warnEl.textContent='Ese nombre ya está registrado.'; return; }
  users.push({name,level,rol:'user'});
  await saveUsers(users);
  document.getElementById('admin-new-name').value='';
  renderUsersList();
  warnEl.style.color='var(--green)';
  warnEl.textContent=`✅ Usuario "${name}" (${level}) añadido.`;
  setTimeout(()=>{ warnEl.textContent=''; warnEl.style.color=''; },3000);
}

// ============================================================
// CALENDARIO
// ============================================================
async function renderCalendar() {
  const {viewYear:y,viewMonth:m,session}=STATE;
  const now=today(); const curY=now.getFullYear(),curM=now.getMonth();

  const title=new Date(y,m,1).toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  document.getElementById('calendar-title').textContent=title.charAt(0).toUpperCase()+title.slice(1);

  document.getElementById('btn-prev').disabled=(y===curY&&m===curM);
  let ny=curY,nm=curM+1; if(nm>11){nm=0;ny++;}
  document.getElementById('btn-next').disabled=(y===ny&&m===nm);

  const guardias=await loadGuardias(); const key=monthKey(y,m);
  const monthData=guardias[key]||{};
  const approved=await loadApproved(); const isApproved=!!approved[key];
  const rol=session.rol; const isAdm=rol==='admin'||rol==='dev'; const isUser=rol==='user';

  const firstDay=firstDayOfMonth(y,m); const totalDays=daysInMonth(y,m);
  const totalCells=Math.ceil((firstDay+totalDays)/7)*7;
  const grid=document.getElementById('calendar-grid');

  // Panel debug DEV: muestra mes actual simulado vs meses disponibles
  const debugEl=document.getElementById('dev-month-debug');
  if (debugEl) {
    if (rol==='dev') {
      const simulatedNow=today();
      const curLabel=simulatedNow.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
      let nextY=simulatedNow.getFullYear(),nextM=simulatedNow.getMonth()+1;
      if(nextM>11){nextM=0;nextY++;}
      const nextLabel=new Date(nextY,nextM,1).toLocaleDateString('es-ES',{month:'long',year:'numeric'});
      debugEl.textContent=`📅 Hoy simulado: ${simulatedNow.toLocaleDateString('es-ES')} | Mes visible: ${title} | Disponibles: ${curLabel} y ${nextLabel}`;
      debugEl.classList.remove('hidden');
    } else { debugEl.classList.add('hidden'); }
  }

  // Cargar settings UNA sola vez antes del bucle (evita parpadeo celda a celda)
  const _settings = await loadSettings();
  const _getMaxG  = (day) => {
    const wd = dayOfWeek(y, m, day);
    if (wd===1 && _settings.limitMon) return 3;
    if (wd===6 && _settings.limitSat) return 3;
    if (wd===0 && _settings.limitSun) return 3;
    if (_settings.limitWeek)          return 2;
    return 99;
  };

  // Construir todo el grid en un DocumentFragment (una sola inserción al DOM)
  const fragment = document.createDocumentFragment();

  for(let i=0;i<totalCells;i++){
    const dn=i-firstDay+1; const cell=document.createElement('div');
    if(i<firstDay||dn>totalDays){ cell.className='cal-day empty'; fragment.appendChild(cell); continue; }

    const dayGuards=monthData[String(dn)]||[];
    const maxG=_getMaxG(dn);
    const isFull=dayGuards.length>=maxG;
    const isToday=y===curY&&m===curM&&dn===now.getDate();
    const isWknd=[0,6].includes(dayOfWeek(y,m,dn));

    cell.className=['cal-day',isToday?'today':'',isWknd?'weekend':'',isFull?'full-day':''].filter(Boolean).join(' ');

    const numEl=document.createElement('div'); numEl.className='day-num'; numEl.textContent=dn;
    cell.appendChild(numEl);

    if(isFull&&maxG<99){
      const badge=document.createElement('span'); badge.className='day-full-badge'; badge.textContent='LLENO';
      cell.appendChild(badge);
    }

    dayGuards.forEach((g,idx)=>{
      const wrap=document.createElement('div'); wrap.className='guard-chip-wrap';
      const chip=document.createElement('span');
      chip.className=`guard-chip ${isApproved?'approved':'pending'}`;
      chip.textContent=`${g.name} (${g.level})`; chip.title=`${g.name} · ${g.level}`;
      wrap.appendChild(chip);

      if(isAdm){
        chip.draggable=true;
        chip.addEventListener('dragstart',e=>{
          STATE.drag={name:g.name,level:g.level,fromKey:key,fromDay:dn,fromIdx:idx};
          chip.classList.add('dragging');
          const ghost=document.getElementById('drag-ghost');
          ghost.textContent=`${g.name} (${g.level})`; ghost.classList.remove('hidden');
          e.dataTransfer.effectAllowed='move';
        });
        chip.addEventListener('dragend',()=>{
          chip.classList.remove('dragging');
          document.getElementById('drag-ghost').classList.add('hidden');
          STATE.drag=null;
          document.querySelectorAll('.cal-day.drag-over').forEach(c=>c.classList.remove('drag-over'));
        });
      }

      // X: admin/dev siempre; usuario normal SOLO sus propias guardias
      const canDelete=isAdm||(isUser&&g.name===session.name);
      if(canDelete){
        const xBtn=document.createElement('button');
        xBtn.className='chip-delete-btn'; xBtn.title='Eliminar'; xBtn.innerHTML='✕';
        xBtn.addEventListener('click',e=>{
          e.stopPropagation();
          if(isUser&&!confirm(`¿Eliminar tu guardia del día ${dn}?`)) return;
          deleteGuard(key,dn,idx);
        });
        wrap.appendChild(xBtn);
      }
      cell.appendChild(wrap);
    });

    if(isAdm){
      cell.addEventListener('dragover',e=>{ e.preventDefault(); if(STATE.drag) cell.classList.add('drag-over'); });
      cell.addEventListener('dragleave',()=>cell.classList.remove('drag-over'));
      cell.addEventListener('drop',e=>{ e.preventDefault(); cell.classList.remove('drag-over'); if(STATE.drag) dropGuard(dn,key); });
      if(!isFull||maxG>=99){
        const addBtn=document.createElement('button');
        addBtn.className='day-add-btn'; addBtn.title='Añadir guardia'; addBtn.innerHTML='＋';
        addBtn.addEventListener('click',e=>{ e.stopPropagation(); openAddModal(dn,key,maxG); });
        cell.appendChild(addBtn);
      }
    }
    fragment.appendChild(cell);
  }

  // Insertar todo el grid de una vez (sin parpadeo)
  grid.innerHTML = '';
  grid.appendChild(fragment);

  document.onmousemove=e=>{
    const ghost=document.getElementById('drag-ghost');
    if(!ghost.classList.contains('hidden')){ ghost.style.left=e.clientX+'px'; ghost.style.top=(e.clientY-20)+'px'; }
  };

  document.getElementById('pdf-section').classList.toggle('hidden',!(isApproved&&isAdm));
  if(isAdm) document.getElementById('admin-status').textContent=isApproved?'✅ Mes aprobado':'📋 Mes pendiente';
}

// cleanOldMonths: llamado SOLO al aprobar un mes, borra solo ese mes del pasado
// NO se llama automáticamente en cada render para evitar borrar datos accidentalmente
async function cleanOldMonths(curY,curM) {
  const g=await loadGuardias(),a=await loadApproved(); let ch=false;
  // Solo borrar meses estrictamente anteriores al actual (no el actual ni el siguiente)
  [...new Set([...Object.keys(g),...Object.keys(a)])].forEach(k=>{
    const [y,mo]=k.split('-').map(Number);
    // mo es 1-based, convertir: mo-1 es el índice de mes
    if(y<curY||(y===curY&&(mo-1)<curM)){ delete g[k]; delete a[k]; ch=true; }
  });
  if(ch){ await saveGuardias(g); await saveApproved(a); }
}

// ============================================================
// DRAG & DROP
// ============================================================
async function dropGuard(toDay,toKey) {
  const drag=STATE.drag; if(!drag) return;
  const {fromKey,fromDay,fromIdx,name,level}=drag;
  if(fromKey===toKey&&fromDay===toDay) return;
  const guardias=await loadGuardias();
  const src=(guardias[fromKey]||{})[String(fromDay)]; if(!src) return;
  src.splice(fromIdx,1); if(!src.length) delete guardias[fromKey][String(fromDay)];
  if(!guardias[toKey]) guardias[toKey]={};
  if(!guardias[toKey][String(toDay)]) guardias[toKey][String(toDay)]=[];
  const dest=guardias[toKey][String(toDay)];
  const maxG=await maxGuardsForDay(STATE.viewYear,STATE.viewMonth,toDay);
  const revert=async()=>{
    if(!guardias[fromKey]) guardias[fromKey]={};
    if(!guardias[fromKey][String(fromDay)]) guardias[fromKey][String(fromDay)]=[];
    guardias[fromKey][String(fromDay)].splice(fromIdx,0,{name,level});
    await saveGuardias(guardias);
  };
  if(dest.length>=maxG){ alert(`Día ${toDay} completo (máx ${maxG}).`); await revert(); return; }
  if(dest.some(g=>g.name===name)){ alert(`${name} ya tiene guardia el día ${toDay}.`); await revert(); return; }
  dest.push({name,level}); await saveGuardias(guardias); STATE.drag=null; renderCalendar();
}

async function deleteGuard(key,day,idx) {
  const g=await loadGuardias(); if(!g[key]?.[String(day)]) return;
  g[key][String(day)].splice(idx,1); if(!g[key][String(day)].length) delete g[key][String(day)];
  await saveGuardias(g); renderCalendar();
}

// ============================================================
// MODAL AÑADIR GUARDIA
// ============================================================
async function openAddModal(day,key,maxG) {
  const guardias=await loadGuardias(); const dayGuards=(guardias[key]||{})[String(day)]||[];
  STATE.addModalDay=day; STATE.addModalKey=key;
  const dateStr=new Date(STATE.viewYear,STATE.viewMonth,day).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('add-modal-title').textContent=`Añadir guardia — ${dateStr}`;
  document.getElementById('add-modal-warning').textContent='';
  const sel=document.getElementById('add-modal-user');
  sel.innerHTML='<option value="">— Selecciona usuario —</option>';
  const users=await loadUsers(); const inDay=new Set(dayGuards.map(g=>g.name));
  if(dayGuards.length>=maxG){ sel.innerHTML=`<option value="">Día completo (máx ${maxG})</option>`; sel.disabled=true; }
  else {
    sel.disabled=false;
    users.filter(u=>!inDay.has(u.name)).forEach(u=>{
      const opt=document.createElement('option'); opt.value=u.name;
      opt.textContent=`${u.name} (${u.level||'-'}) · ${u.rol}`; opt.dataset.level=u.level||'R4';
      sel.appendChild(opt);
    });
  }
  document.getElementById('add-modal').classList.remove('hidden');
}
function closeAddModal(){ document.getElementById('add-modal').classList.add('hidden'); STATE.addModalDay=null; STATE.addModalKey=null; }
async function confirmAddModal() {
  const {addModalDay:day,addModalKey:key}=STATE; if(!day||!key) return;
  const sel=document.getElementById('add-modal-user'); const name=sel.value;
  const warnEl=document.getElementById('add-modal-warning'); warnEl.textContent='';
  if(!name){ warnEl.textContent='Selecciona un usuario.'; return; }
  const level=sel.selectedOptions[0]?.dataset.level||'R4';
  const guardias=await loadGuardias();
  if(!guardias[key]) guardias[key]={}; if(!guardias[key][String(day)]) guardias[key][String(day)]=[];
  const existing=guardias[key][String(day)]; const maxG=await maxGuardsForDay(STATE.viewYear,STATE.viewMonth,day);
  if(existing.length>=maxG){ warnEl.textContent='Día completo.'; return; }
  if(existing.some(g=>g.name===name)){ warnEl.textContent='Ese usuario ya tiene guardia ese día.'; return; }
  existing.push({name,level}); await saveGuardias(guardias); closeAddModal(); renderCalendar();
}

// ============================================================
// PROPONER GUARDIA
// ============================================================
async function submitProposal() {
  const {session,viewYear:y,viewMonth:m}=STATE;
  const now=today(); const curY=now.getFullYear(),curM=now.getMonth(),curD=now.getDate();
  const s=await loadSettings();
  if(!(await canPropose(session.level))) return;
  const isNextMonth=(y>curY)||(y===curY&&m>curM);
  if(isNextMonth&&s.deadlineOn&&curD>15){ alert('Plazo cerrado: propuestas del mes siguiente hasta el día 15 a las 00:00.'); return; }
  const count=parseInt(document.getElementById('prop-count').value,10);
  if(isNaN(count)||count<1||count>5){ document.getElementById('prop-days-warning').textContent='Nº de guardias entre 1 y 5.'; return; }
  const raw=document.getElementById('prop-days').value;
  if(!raw.trim()){ document.getElementById('prop-days-warning').textContent='Introduce los días.'; return; }
  const {valid,errors}=parseDaysInput(raw,y,m);
  if(errors.length){ document.getElementById('prop-days-warning').textContent=errors.join(' | '); return; }
  if(!valid.length){ document.getElementById('prop-days-warning').textContent='Sin días válidos.'; return; }
  const daysToAdd=valid.slice(0,count);
  const guardias=await loadGuardias(); const key=monthKey(y,m); if(!guardias[key]) guardias[key]={};
  const added=[],skipped=[];
  for(const day of daysToAdd){
    if(!guardias[key][String(day)]) guardias[key][String(day)]=[];
    const existing=guardias[key][String(day)]; const maxG=await maxGuardsForDay(y,m,day);
    if(existing.length>=maxG){ skipped.push(`Día ${day}: completo`); continue; }
    if(existing.some(g=>g.name===session.name)){ skipped.push(`Día ${day}: ya apuntado`); continue; }
    const newEntry={name:session.name,level:session.level}; const sim=[...existing,newEntry];
    if(s.levelMix&&maxG<=3&&sim.length===maxG&&!hasRequiredLevelMix(sim)){ skipped.push(`Día ${day}: mezcla de niveles inválida`); continue; }
    existing.push(newEntry); added.push(day);
  }
  await saveGuardias(guardias); renderCalendar();
  let msg=''; if(added.length) msg+=`✅ Añadidas: días ${added.join(', ')}.`;
  if(skipped.length) msg+=`\n⚠️ Omitidos: ${skipped.join(' | ')}`;
  if(!msg) msg='No se añadió ninguna guardia.'; alert(msg);
  document.getElementById('prop-days').value=''; document.getElementById('prop-count').value='';
  document.getElementById('prop-days-warning').textContent='';
}

// ============================================================
// ADMIN: APROBAR, RESETEAR, RESTAURAR
// ============================================================
async function approveMonth() {
  const key=monthKey(STATE.viewYear,STATE.viewMonth);
  const approved=await loadApproved(); approved[key]=true; await saveApproved(approved);
  let users=await loadUsers(); users=users.filter(u=>u.rol==='admin'); await saveUsers(users);
  renderCalendar(); renderUsersList();
  if(STATE.session.rol==='dev') renderDevSwitchList();
  document.getElementById('admin-status').textContent='✅ Mes aprobado. Usuarios reseteados.';
}
async function resetMonth() {
  const key=monthKey(STATE.viewYear,STATE.viewMonth);
  const label=new Date(STATE.viewYear,STATE.viewMonth,1).toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  if(!confirm(`¿Resetear guardias de ${label}?\nSe hará un backup automático.`)) return;
  const g=await loadGuardias(); await saveBackup(JSON.parse(JSON.stringify(g))); delete g[key]; await saveGuardias(g);
  const a=await loadApproved(); delete a[key]; await saveApproved(a);
  renderCalendar(); document.getElementById('admin-status').textContent='🗑️ Mes reseteado. Backup guardado.';
}
async function restoreBackup() {
  const backup=await loadBackup(); if(!backup){ alert('No hay backup disponible.'); return; }
  if(!confirm('¿Restaurar el mes borrado?')) return;
  await saveGuardias(backup); renderCalendar();
  document.getElementById('admin-status').textContent='♻️ Mes restaurado.';
}

// ============================================================
// DEV: CREAR USUARIO
// ============================================================
async function devCreateUser() {
  const name=document.getElementById('dev-new-name').value.trim();
  const level=document.getElementById('dev-new-level').value;
  const rol=document.getElementById('dev-new-rol').value;
  if(!name){ alert('Introduce un nombre.'); return; }
  const users=await loadUsers();
  if(users.some(u=>u.name.toLowerCase()===name.toLowerCase())){ alert('Nombre ya existente.'); return; }
  const u={name,level,rol}; if(rol==='admin') u.pass='admin123';
  users.push(u); await saveUsers(users);
  document.getElementById('dev-new-name').value='';
  renderDevSwitchList(); renderUsersList();
  alert(`Usuario "${name}" (${level} · ${rol}) creado.${rol==='admin'?' Contraseña: admin123':''}`);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async ()=>{
  await ensureDefaultAdmin();
  setupLogin();
});

// ============================================================
// EXPONER FUNCIONES AL SCOPE GLOBAL
// Necesario porque el script carga como "module" (ES modules
// tienen scope propio — los onclick del HTML no las ven sin esto)
// ============================================================
window.devLoginAs        = devLoginAs;
window.devDelFromLogin   = devDelFromLogin;
window.devSwitchInApp    = devSwitchInApp;
window.devDelInApp       = devDelInApp;