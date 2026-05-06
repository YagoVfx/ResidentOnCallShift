/* =============================================
   GUARDIAS MIR — APP.JS v3
   ============================================= */

// ============================================================
// ESTADO GLOBAL
// ============================================================
const STATE = {
  session: null,
  viewYear: null,
  viewMonth: null,
  // Drag & drop
  drag: null,   // { name, level, fromKey, fromDay }
  // Simulated day (DEV)
  fakeDay: null,
  // Modal
  addModalDay: null,
  addModalKey: null,
};

const SETTINGS_KEY = 'mir_settings';

// ============================================================
// SETTINGS DEFAULTS
// ============================================================
function defaultSettings() {
  return {
    allowR1R2:    false,   // R1/R2 pueden proponer
    levelMix:     true,    // Requerir mezcla R3/R4+R1/R2
    limitWeek:    true,    // Entre semana máx 2
    limitMon:     true,    // Lunes máx 3
    limitSat:     true,    // Sábado máx 3
    limitSun:     true,    // Domingo máx 3
    deadlineOn:   true,    // Bloquear propuestas mes sig. tras día 15
  };
}

// ============================================================
// STORAGE
// ============================================================
function loadGuardias() { try { return JSON.parse(localStorage.getItem('guardias')) || {}; } catch { return {}; } }
function saveGuardias(d) { localStorage.setItem('guardias', JSON.stringify(d)); }
function loadBackup()    { try { return JSON.parse(localStorage.getItem('guardias_backup')) || null; } catch { return null; } }
function saveBackup(d)   { localStorage.setItem('guardias_backup', JSON.stringify(d)); }
function loadUsers()     { try { return JSON.parse(localStorage.getItem('mir_users')) || []; } catch { return []; } }
function saveUsers(u)    { localStorage.setItem('mir_users', JSON.stringify(u)); }
function loadApproved()  { try { return JSON.parse(localStorage.getItem('mir_approved')) || {}; } catch { return {}; } }
function saveApproved(d) { localStorage.setItem('mir_approved', JSON.stringify(d)); }
function loadSettings()  { try { return Object.assign({}, defaultSettings(), JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { return defaultSettings(); } }
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ============================================================
// ADMIN POR DEFECTO
// ============================================================
function ensureDefaultAdmin() {
  let users = loadUsers();
  if (!users.some(u => u.rol === 'admin')) {
    users.push({ name: 'Admin', level: 'R4', rol: 'admin', pass: 'admin123' });
    saveUsers(users);
  }
}

// ============================================================
// FECHA (con soporte fakeDay para DEV)
// ============================================================
function today() {
  const real = new Date();
  if (STATE.fakeDay !== null) {
    return new Date(real.getFullYear(), real.getMonth(), STATE.fakeDay);
  }
  return real;
}
function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}`; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOfMonth(y, m) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

function dayOfWeek(y, m, d) { return new Date(y, m, d).getDay(); } // 0=Dom,1=Lun,6=Sab

// ============================================================
// REGLAS DE CAPACIDAD (respetan settings)
// ============================================================
function maxGuardsForDay(y, m, d) {
  const s = loadSettings();
  const wd = dayOfWeek(y, m, d);
  if (wd === 1 && s.limitMon)  return 3;
  if (wd === 6 && s.limitSat)  return 3;
  if (wd === 0 && s.limitSun)  return 3;
  if (s.limitWeek) return 2;
  // Si todos los límites están desactivados → ilimitado en la práctica (usamos 99)
  return 99;
}

function isDaySpecial(y, m, d) {
  // "especial" = lunes/sáb/dom con límite 3 activo
  const s = loadSettings();
  const wd = dayOfWeek(y, m, d);
  return (wd === 1 && s.limitMon) || (wd === 6 && s.limitSat) || (wd === 0 && s.limitSun);
}

function hasRequiredLevelMix(guards) {
  if (guards.length < 2) return false;
  return guards.some(g => g.level === 'R3' || g.level === 'R4') &&
         guards.some(g => g.level === 'R1' || g.level === 'R2');
}

function canPropose(level) {
  if (level === 'R3' || level === 'R4') return true;
  return loadSettings().allowR1R2;
}

// ============================================================
// VALIDACIÓN INPUT DÍAS
// ============================================================
function parseDaysInput(raw, y, m) {
  const maxDay = daysInMonth(y, m);
  const result = { valid: [], errors: [] };
  if (/[^0-9,\s]/.test(raw)) { result.errors.push('Solo números separados por comas.'); return result; }
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) { result.errors.push('Introduce al menos un día.'); return result; }
  const seen = new Set();
  for (const p of parts) {
    if (!/^\d+$/.test(p)) { result.errors.push(`"${p}" no válido.`); continue; }
    const n = parseInt(p, 10);
    if (n < 1 || n > maxDay) { result.errors.push(`Día ${n} fuera de rango (1–${maxDay}).`); continue; }
    if (seen.has(n)) { result.errors.push(`Día ${n} duplicado.`); continue; }
    seen.add(n); result.valid.push(n);
  }
  return result;
}

// ============================================================
// DEV TRIGGER (triple clic esquina)
// ============================================================
function setupDevTrigger() {
  let clicks = 0, timer = null;
  document.getElementById('dev-trigger').addEventListener('click', () => {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(() => { clicks = 0; }, 800);
    if (clicks >= 3) { clicks = 0; toggleDevPanel(); }
  });
}
function toggleDevPanel() {
  const tab = document.getElementById('tab-dev');
  const visible = tab.classList.contains('dev-visible');
  tab.classList.toggle('dev-visible', !visible);
  tab.classList.toggle('tab-dev-hidden', visible);
  if (!visible) renderDevLoginList();
}

// ============================================================
// LOGIN
// ============================================================
function setupLogin() {
  ensureDefaultAdmin();
  setupDevTrigger();

  const nameEl  = document.getElementById('login-name');
  const levelEl = document.getElementById('login-level');
  const passGrp = document.getElementById('login-admin-pass-group');
  const passEl  = document.getElementById('login-pass');

  // Mostrar campo pass si nombre coincide con admin
  nameEl.addEventListener('input', () => {
    const name = nameEl.value.trim();
    const users = loadUsers();
    const isAdmin = users.some(u => u.name === name && u.rol === 'admin');
    passGrp.classList.toggle('hidden', !isAdmin);
    if (isAdmin) { levelEl.closest('.form-group').classList.add('hidden'); }
    else         { levelEl.closest('.form-group').classList.remove('hidden'); }
  });

  document.getElementById('btn-login-user').addEventListener('click', doLogin);
  nameEl.addEventListener('keydown',  e => { if (e.key === 'Enter') doLogin(); });
  passEl.addEventListener('keydown',  e => { if (e.key === 'Enter') doLogin(); });

  // DEV
  document.getElementById('btn-login-dev').addEventListener('click', () => startSession({ name: 'DEV', level: 'R4', rol: 'dev' }));
  document.getElementById('btn-dev-quick-create').addEventListener('click', devQuickCreate);

  // DEV fake day (en login)
  document.getElementById('btn-dev-apply-date').addEventListener('click', () => {
    const v = parseInt(document.getElementById('dev-fake-day').value, 10);
    if (isNaN(v) || v < 1 || v > 31) { document.getElementById('dev-fake-day-status').textContent = '❌ Día inválido.'; return; }
    STATE.fakeDay = v;
    document.getElementById('dev-fake-day-status').textContent = `✅ Día simulado: ${v}`;
  });
  document.getElementById('btn-dev-reset-date').addEventListener('click', () => {
    STATE.fakeDay = null;
    document.getElementById('dev-fake-day').value = '';
    document.getElementById('dev-fake-day-status').textContent = 'Usando fecha real.';
  });
}

function doLogin() {
  const name  = document.getElementById('login-name').value.trim();
  const level = document.getElementById('login-level').value;
  const pass  = document.getElementById('login-pass').value;

  if (!name) { showLoginError('Introduce tu nombre.'); return; }

  const users = loadUsers();
  const admin = users.find(u => u.name === name && u.rol === 'admin');

  if (admin) {
    // Login admin
    if (admin.pass && admin.pass !== pass) { showLoginError('Contraseña incorrecta.'); return; }
    startSession({ name: admin.name, level: admin.level || 'R4', rol: 'admin' });
    return;
  }

  // Login usuario normal
  if (!level) { showLoginError('Selecciona tu nivel MIR.'); return; }
  if (!users.some(u => u.name === name && u.rol === 'user')) {
    users.push({ name, level, rol: 'user' });
    saveUsers(users);
  }
  startSession({ name, level, rol: 'user' });
}

function devQuickCreate() {
  const name  = document.getElementById('dev-quick-name').value.trim();
  const level = document.getElementById('dev-quick-level').value;
  const rol   = document.getElementById('dev-quick-rol').value;
  if (!name) { showLoginError('Introduce un nombre.'); return; }
  let users = loadUsers();
  if (users.some(u => u.name === name)) { showLoginError('Nombre ya existente.'); return; }
  const u = { name, level, rol };
  if (rol === 'admin') u.pass = 'admin123';
  users.push(u);
  saveUsers(users);
  document.getElementById('dev-quick-name').value = '';
  renderDevLoginList();
  startSession({ name, level, rol });
}

function renderDevLoginList() {
  const users = loadUsers();
  const el = document.getElementById('dev-login-users-list');
  if (!users.length) { el.innerHTML = '<p style="color:#444;font-size:11px;text-align:center">Sin usuarios</p>'; return; }
  el.innerHTML = users.map((u, i) => `
    <div class="dev-login-user-item">
      <span class="info"><strong>${escHtml(u.name)}</strong> ${u.level ? '· '+u.level : ''}</span>
      <span class="dev-login-user-badge badge-${u.rol}">${u.rol.toUpperCase()}</span>
      <div style="display:flex;gap:3px">
        <button class="btn-switch-login" onclick="devLoginAs(${i})">Entrar</button>
        <button class="btn-del-login"    onclick="devDelFromLogin(${i})">✕</button>
      </div>
    </div>`).join('');
}
function devLoginAs(i)     { const u = loadUsers()[i]; if (u) startSession({ name: u.name, level: u.level||'R4', rol: u.rol }); }
function devDelFromLogin(i){ let u = loadUsers(); const x = u[i]; if (!x) return; if (x.rol==='admin' && u.filter(a=>a.rol==='admin').length<=1){ showLoginError('Mínimo 1 admin.'); return; } u.splice(i,1); saveUsers(u); renderDevLoginList(); }

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

// ============================================================
// SESIÓN
// ============================================================
let navReady = false;

function startSession(sess) {
  STATE.session = sess;
  const now = today();
  STATE.viewYear  = now.getFullYear();
  STATE.viewMonth = now.getMonth();

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  renderTopbar();
  renderSidebar();
  renderCalendar();

  if (!navReady) { setupNavigation(); navReady = true; }
}

function logout() {
  STATE.session = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-name').value  = '';
  document.getElementById('login-level').value = '';
  document.getElementById('login-pass').value  = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-admin-pass-group').classList.add('hidden');
  document.getElementById('login-level').closest('.form-group').classList.remove('hidden');
  // Ocultar DEV panel
  const tab = document.getElementById('tab-dev');
  tab.classList.remove('dev-visible');
  tab.classList.add('tab-dev-hidden');
}

// ============================================================
// TOPBAR
// ============================================================
function renderTopbar() {
  const { session } = STATE;
  const rolEl = document.getElementById('topbar-rol');
  rolEl.textContent = session.rol.toUpperCase();
  rolEl.className   = `topbar-rol rol-${session.rol}`;
  document.getElementById('topbar-user').textContent = session.name + (session.level ? ` · ${session.level}` : '');
}

// ============================================================
// SIDEBAR
// ============================================================
function renderSidebar() {
  const { session } = STATE;
  const rol = session.rol;
  const isAdm = rol === 'admin' || rol === 'dev';

  document.getElementById('admin-card').classList.toggle('hidden', !isAdm);
  document.getElementById('dev-card').classList.toggle('hidden', rol !== 'dev');
  document.getElementById('users-card').classList.toggle('hidden', !isAdm);
  document.getElementById('cal-hint').classList.toggle('hidden', !isAdm);

  document.getElementById('prop-name').value  = session.name;
  document.getElementById('prop-level').value = session.level;

  if (rol === 'dev') syncDevToggles();
  updateFormState();
  if (isAdm) { renderUsersList(); if (rol === 'dev') renderDevSwitchList(); }

  if (isAdm) {
    const key = monthKey(STATE.viewYear, STATE.viewMonth);
    const approved = loadApproved();
    document.getElementById('admin-status').textContent =
      approved[key] ? '✅ Mes aprobado' : '📋 Mes pendiente';
  }
}

function syncDevToggles() {
  const s = loadSettings();
  document.getElementById('toggle-r1r2').checked       = s.allowR1R2;
  document.getElementById('toggle-level-mix').checked  = s.levelMix;
  document.getElementById('toggle-limit-week').checked = s.limitWeek;
  document.getElementById('toggle-limit-mon').checked  = s.limitMon;
  document.getElementById('toggle-limit-sat').checked  = s.limitSat;
  document.getElementById('toggle-limit-sun').checked  = s.limitSun;
  document.getElementById('toggle-deadline').checked   = s.deadlineOn;
}

function updateFormState() {
  const { session, viewYear, viewMonth } = STATE;
  const now = today();
  const curY = now.getFullYear(), curM = now.getMonth(), curD = now.getDate();
  const s = loadSettings();

  const isNextMonth = (viewYear > curY) || (viewYear === curY && viewMonth > curM);
  const isCurrentMonth = viewYear === curY && viewMonth === curM;

  const warnEl = document.getElementById('form-deadline-warning');
  const infoEl = document.getElementById('form-current-month-info');
  const btn    = document.getElementById('btn-submit-prop');

  warnEl.classList.add('hidden');
  infoEl.classList.add('hidden');
  btn.disabled = false;

  if (!canPropose(session.level)) {
    warnEl.classList.remove('hidden');
    warnEl.textContent = `ℹ️ Tu nivel (${session.level}) no tiene permiso para proponer. El DEV puede activarlo.`;
    btn.disabled = true;
    return;
  }
  if (isNextMonth && s.deadlineOn && curD > 15) {
    warnEl.classList.remove('hidden');
    warnEl.textContent = '⚠️ Plazo cerrado. Las propuestas del mes siguiente se cierran el día 15 del mes actual.';
    btn.disabled = true;
    return;
  }
  if (isCurrentMonth) infoEl.classList.remove('hidden');
}

function renderUsersList() {
  const users = loadUsers();
  document.getElementById('users-count-badge').textContent = users.length;
  const el = document.getElementById('users-list');
  el.innerHTML = users.length
    ? users.map(u => `<div class="user-item"><span class="user-item-name">${escHtml(u.name)} <small>${u.level||''}</small></span><span class="user-badge badge-${u.rol}">${u.rol.toUpperCase()}</span></div>`).join('')
    : '<p style="color:#444;font-size:12px;text-align:center;padding:4px 0">Sin usuarios</p>';
}

function renderDevSwitchList() {
  const users = loadUsers();
  const el = document.getElementById('dev-user-switch-list');
  el.innerHTML = users.length
    ? users.map((u, i) => `<div class="switch-item"><span class="info"><strong>${escHtml(u.name)}</strong> ${u.level?'·'+u.level:''} <span class="dev-login-user-badge badge-${u.rol}">${u.rol}</span></span><button class="btn-switch" onclick="devSwitchInApp(${i})">Entrar</button><button class="btn-del" onclick="devDelInApp(${i})">✕</button></div>`).join('')
    : '<p style="color:#444;font-size:11px">Sin usuarios</p>';
}
function devSwitchInApp(i) { const u = loadUsers()[i]; if (!u) return; STATE.session = { name: u.name, level: u.level||'R4', rol: u.rol }; renderTopbar(); renderSidebar(); renderCalendar(); }
function devDelInApp(i) { let u = loadUsers(); const x=u[i]; if(!x) return; if(x.rol==='admin'&&u.filter(a=>a.rol==='admin').length<=1){alert('Mínimo 1 admin.');return;} u.splice(i,1); saveUsers(u); renderDevSwitchList(); renderUsersList(); }

// ============================================================
// NAVIGATION SETUP
// ============================================================
function setupNavigation() {
  document.getElementById('btn-prev').addEventListener('click', navPrev);
  document.getElementById('btn-next').addEventListener('click', navNext);
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-submit-prop').addEventListener('click', submitProposal);
  document.getElementById('btn-approve').addEventListener('click', approveMonth);
  document.getElementById('btn-reset').addEventListener('click', resetMonth);
  document.getElementById('btn-restore').addEventListener('click', restoreBackup);
  document.getElementById('btn-dev-create').addEventListener('click', devCreateUser);
  document.getElementById('btn-export-pdf').addEventListener('click', () => window.print());

  // Validación live input días
  document.getElementById('prop-days').addEventListener('input', () => {
    const raw = document.getElementById('prop-days').value;
    if (/[^0-9,\s]/.test(raw)) {
      document.getElementById('prop-days').value = raw.replace(/[^0-9,\s]/g, '');
      document.getElementById('prop-days-warning').textContent = 'Solo números separados por comas.';
    } else document.getElementById('prop-days-warning').textContent = '';
  });
  document.getElementById('prop-count').addEventListener('input', () => {
    const v = parseInt(document.getElementById('prop-count').value, 10);
    if (v < 1) document.getElementById('prop-count').value = 1;
    if (v > 5) document.getElementById('prop-count').value = 5;
  });

  // DEV toggles
  const toggleMap = {
    'toggle-r1r2':       'allowR1R2',
    'toggle-level-mix':  'levelMix',
    'toggle-limit-week': 'limitWeek',
    'toggle-limit-mon':  'limitMon',
    'toggle-limit-sat':  'limitSat',
    'toggle-limit-sun':  'limitSun',
    'toggle-deadline':   'deadlineOn',
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', e => {
      const s = loadSettings(); s[key] = e.target.checked; saveSettings(s);
      updateFormState(); renderCalendar();
    });
  });

  // DEV fake day en app
  document.getElementById('btn-dev-apply-date-app').addEventListener('click', () => {
    const v = parseInt(document.getElementById('dev-fake-day-app').value, 10);
    const st = document.getElementById('dev-fake-day-status-app');
    if (isNaN(v)||v<1||v>31) { st.textContent='❌ Inválido.'; return; }
    STATE.fakeDay = v; st.textContent = `✅ Simulando día ${v}`;
    updateFormState(); renderCalendar();
  });
  document.getElementById('btn-dev-reset-date-app').addEventListener('click', () => {
    STATE.fakeDay = null;
    document.getElementById('dev-fake-day-app').value = '';
    document.getElementById('dev-fake-day-status-app').textContent = 'Fecha real restaurada.';
    updateFormState(); renderCalendar();
  });

  // Add modal
  document.getElementById('add-modal-close').addEventListener('click', closeAddModal);
  document.getElementById('add-modal').addEventListener('click', e => { if (e.target === document.getElementById('add-modal')) closeAddModal(); });
  document.getElementById('btn-add-modal-confirm').addEventListener('click', confirmAddModal);
}

function navPrev() {
  const now = today();
  if (STATE.viewYear === now.getFullYear() && STATE.viewMonth === now.getMonth()) return;
  STATE.viewMonth--; if (STATE.viewMonth < 0) { STATE.viewMonth = 11; STATE.viewYear--; }
  renderCalendar(); updateFormState();
}
function navNext() {
  const now = today(); let ny = now.getFullYear(), nm = now.getMonth()+1; if (nm>11){nm=0;ny++;}
  if (STATE.viewYear===ny && STATE.viewMonth===nm) return;
  STATE.viewMonth++; if (STATE.viewMonth>11){STATE.viewMonth=0;STATE.viewYear++;}
  renderCalendar(); updateFormState();
}

// ============================================================
// CALENDARIO
// ============================================================
function renderCalendar() {
  const { viewYear: y, viewMonth: m, session } = STATE;
  const now = today();
  const curY = now.getFullYear(), curM = now.getMonth();

  cleanOldMonths(curY, curM);

  // Título
  const title = new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  document.getElementById('calendar-title').textContent = title.charAt(0).toUpperCase() + title.slice(1);

  // Nav buttons
  document.getElementById('btn-prev').disabled = (y===curY && m===curM);
  let ny=curY, nm=curM+1; if (nm>11){nm=0;ny++;}
  document.getElementById('btn-next').disabled = (y===ny && m===nm);

  const guardias = loadGuardias();
  const key = monthKey(y, m);
  const monthData = guardias[key] || {};
  const approved = loadApproved();
  const isApproved = !!approved[key];
  const rol = session.rol;
  const isAdm = rol === 'admin' || rol === 'dev';

  const firstDay = firstDayOfMonth(y, m);
  const totalDays = daysInMonth(y, m);
  const totalCells = Math.ceil((firstDay + totalDays) / 7) * 7;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  for (let i = 0; i < totalCells; i++) {
    const dn = i - firstDay + 1;
    const cell = document.createElement('div');

    if (i < firstDay || dn > totalDays) {
      cell.className = 'cal-day empty';
      grid.appendChild(cell); continue;
    }

    const dayGuards = monthData[String(dn)] || [];
    const maxG = maxGuardsForDay(y, m, dn);
    const isFull = dayGuards.length >= maxG;
    const isToday = y===curY && m===curM && dn===now.getDate();
    const isWknd  = [0,6].includes(dayOfWeek(y,m,dn));
    const isSpecial = isDaySpecial(y, m, dn);

    cell.className = ['cal-day',
      isToday ? 'today' : '',
      isWknd  ? 'weekend' : '',
      isFull  ? 'full-day' : '',
      isAdm   ? 'can-interact can-dblclick' : 'can-interact',
    ].filter(Boolean).join(' ');

    // Número día
    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = dn;
    cell.appendChild(numEl);

    // Badge "LLENO" (solo en pantalla, no en print)
    if (isFull && maxG < 99) {
      const badge = document.createElement('span');
      badge.className = 'day-full-badge';
      badge.textContent = 'LLENO';
      cell.appendChild(badge);
    }

    // Guard chips
    dayGuards.forEach((g, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'guard-chip-wrap';

      const chip = document.createElement('span');
      chip.className = `guard-chip ${isApproved ? 'approved' : 'pending'}`;
      chip.textContent = `${g.name} (${g.level})`;
      chip.title = `${g.name} · ${g.level}`;
      wrap.appendChild(chip);

      if (isAdm) {
        // Drag handle
        chip.draggable = true;
        chip.addEventListener('dragstart', e => {
          STATE.drag = { name: g.name, level: g.level, fromKey: key, fromDay: dn, fromIdx: idx };
          chip.classList.add('dragging');
          // Actualizar ghost
          const ghost = document.getElementById('drag-ghost');
          ghost.textContent = `${g.name} (${g.level})`;
          ghost.classList.remove('hidden');
          e.dataTransfer.effectAllowed = 'move';
        });
        chip.addEventListener('dragend', () => {
          chip.classList.remove('dragging');
          document.getElementById('drag-ghost').classList.add('hidden');
          STATE.drag = null;
          // Limpiar drag-over
          document.querySelectorAll('.cal-day.drag-over').forEach(c => c.classList.remove('drag-over'));
        });

        // Botón X
        const xBtn = document.createElement('button');
        xBtn.className = 'chip-delete-btn';
        xBtn.title = 'Eliminar guardia';
        xBtn.innerHTML = '✕';
        xBtn.addEventListener('click', e => {
          e.stopPropagation();
          deleteGuard(key, dn, idx);
        });
        wrap.appendChild(xBtn);
      }

      cell.appendChild(wrap);
    });

    // Drop target
    if (isAdm) {
      cell.addEventListener('dragover', e => {
        e.preventDefault();
        if (STATE.drag) cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        if (STATE.drag) dropGuard(dn, key);
      });
      // Doble clic = añadir guardia
      cell.addEventListener('dblclick', () => openAddModal(dn, key, maxG));
    }

    grid.appendChild(cell);
  }

  // Ghost mouse follow
  document.onmousemove = e => {
    const ghost = document.getElementById('drag-ghost');
    if (!ghost.classList.contains('hidden')) {
      ghost.style.left = e.clientX + 'px';
      ghost.style.top  = (e.clientY - 20) + 'px';
    }
  };

  // PDF
  document.getElementById('pdf-section').classList.toggle('hidden', !(isApproved && isAdm));

  // Admin status
  if (isAdm) {
    document.getElementById('admin-status').textContent =
      isApproved ? '✅ Mes aprobado' : '📋 Mes pendiente';
  }
}

function cleanOldMonths(curY, curM) {
  const g = loadGuardias(), a = loadApproved(); let ch = false;
  [...Object.keys(g), ...Object.keys(a)].forEach(k => {
    const [y, m] = k.split('-').map(Number);
    if (y < curY || (y===curY && m-1 < curM)) { delete g[k]; delete a[k]; ch = true; }
  });
  if (ch) { saveGuardias(g); saveApproved(a); }
}

// ============================================================
// DRAG & DROP
// ============================================================
function dropGuard(toDay, toKey) {
  const drag = STATE.drag;
  if (!drag) return;

  const guardias = loadGuardias();
  const { fromKey, fromDay, fromIdx, name, level } = drag;

  // Si caemos en el mismo día, no hacer nada
  if (fromKey === toKey && fromDay === toDay) return;

  const src = (guardias[fromKey]||{})[String(fromDay)];
  if (!src) return;

  // Eliminar del origen
  src.splice(fromIdx, 1);
  if (!src.length) delete guardias[fromKey][String(fromDay)];

  // Añadir al destino
  if (!guardias[toKey]) guardias[toKey] = {};
  if (!guardias[toKey][String(toDay)]) guardias[toKey][String(toDay)] = [];
  const dest = guardias[toKey][String(toDay)];
  const maxG = maxGuardsForDay(STATE.viewYear, STATE.viewMonth, toDay);

  if (dest.length >= maxG) {
    alert(`No se puede mover: el día ${toDay} está completo (máx ${maxG}).`);
    // Revertir: devolver al origen
    if (!guardias[fromKey]) guardias[fromKey] = {};
    if (!guardias[fromKey][String(fromDay)]) guardias[fromKey][String(fromDay)] = [];
    guardias[fromKey][String(fromDay)].splice(fromIdx, 0, { name, level });
    saveGuardias(guardias);
    return;
  }
  if (dest.some(g => g.name === name)) {
    alert(`${name} ya tiene guardia el día ${toDay}.`);
    if (!guardias[fromKey]) guardias[fromKey] = {};
    if (!guardias[fromKey][String(fromDay)]) guardias[fromKey][String(fromDay)] = [];
    guardias[fromKey][String(fromDay)].splice(fromIdx, 0, { name, level });
    saveGuardias(guardias);
    return;
  }

  dest.push({ name, level });
  saveGuardias(guardias);
  STATE.drag = null;
  renderCalendar();
}

// ============================================================
// ELIMINAR GUARDIA (botón X)
// ============================================================
function deleteGuard(key, day, idx) {
  const g = loadGuardias();
  if (!g[key]?.[String(day)]) return;
  g[key][String(day)].splice(idx, 1);
  if (!g[key][String(day)].length) delete g[key][String(day)];
  saveGuardias(g);
  renderCalendar();
}

// ============================================================
// MODAL AÑADIR GUARDIA (doble clic en día)
// ============================================================
function openAddModal(day, key, maxG) {
  const guardias = loadGuardias();
  const dayGuards = (guardias[key]||{})[String(day)] || [];

  STATE.addModalDay = day;
  STATE.addModalKey = key;

  const dateStr = new Date(STATE.viewYear, STATE.viewMonth, day)
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('add-modal-title').textContent = `Añadir guardia — ${dateStr}`;
  document.getElementById('add-modal-warning').textContent = '';

  const sel = document.getElementById('add-modal-user');
  sel.innerHTML = '<option value="">— Selecciona usuario —</option>';

  const users = loadUsers();
  const inDay = new Set(dayGuards.map(g => g.name));
  const avail = users.filter(u => !inDay.has(u.name));

  if (dayGuards.length >= maxG) {
    sel.innerHTML = '<option value="">Día completo (máx ' + maxG + ')</option>';
    sel.disabled = true;
  } else {
    sel.disabled = false;
    avail.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.name;
      opt.textContent = `${u.name} (${u.level||'-'}) · ${u.rol}`;
      opt.dataset.level = u.level || 'R4';
      sel.appendChild(opt);
    });
  }

  document.getElementById('add-modal').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('add-modal').classList.add('hidden');
  STATE.addModalDay = null;
  STATE.addModalKey = null;
}

function confirmAddModal() {
  const { addModalDay: day, addModalKey: key } = STATE;
  if (!day || !key) return;

  const sel = document.getElementById('add-modal-user');
  const name = sel.value;
  const warnEl = document.getElementById('add-modal-warning');
  warnEl.textContent = '';

  if (!name) { warnEl.textContent = 'Selecciona un usuario.'; return; }
  const level = sel.selectedOptions[0]?.dataset.level || 'R4';

  const guardias = loadGuardias();
  if (!guardias[key]) guardias[key] = {};
  if (!guardias[key][String(day)]) guardias[key][String(day)] = [];
  const existing = guardias[key][String(day)];
  const maxG = maxGuardsForDay(STATE.viewYear, STATE.viewMonth, day);

  if (existing.length >= maxG) { warnEl.textContent = 'Día completo.'; return; }
  if (existing.some(g => g.name === name)) { warnEl.textContent = 'Ese usuario ya tiene guardia ese día.'; return; }

  existing.push({ name, level });
  saveGuardias(guardias);
  closeAddModal();
  renderCalendar();
}

// ============================================================
// PROPONER GUARDIA
// ============================================================
function submitProposal() {
  const { session, viewYear: y, viewMonth: m } = STATE;
  const now = today();
  const curY = now.getFullYear(), curM = now.getMonth(), curD = now.getDate();
  const s = loadSettings();

  if (!canPropose(session.level)) return;

  const isNextMonth = (y > curY) || (y === curY && m > curM);
  if (isNextMonth && s.deadlineOn && curD > 15) {
    alert('Plazo cerrado: propuestas del mes siguiente hasta el día 15 del mes actual.');
    return;
  }

  const count = parseInt(document.getElementById('prop-count').value, 10);
  if (isNaN(count) || count < 1 || count > 5) {
    document.getElementById('prop-days-warning').textContent = 'Nº de guardias entre 1 y 5.';
    return;
  }

  const raw = document.getElementById('prop-days').value;
  if (!raw.trim()) { document.getElementById('prop-days-warning').textContent = 'Introduce los días.'; return; }

  const { valid, errors } = parseDaysInput(raw, y, m);
  if (errors.length) { document.getElementById('prop-days-warning').textContent = errors.join(' | '); return; }
  if (!valid.length) { document.getElementById('prop-days-warning').textContent = 'Sin días válidos.'; return; }

  const daysToAdd = valid.slice(0, count);
  const guardias = loadGuardias();
  const key = monthKey(y, m);
  if (!guardias[key]) guardias[key] = {};

  const added = [], skipped = [];

  for (const day of daysToAdd) {
    if (!guardias[key][String(day)]) guardias[key][String(day)] = [];
    const existing = guardias[key][String(day)];
    const maxG = maxGuardsForDay(y, m, day);

    if (existing.length >= maxG) { skipped.push(`Día ${day}: completo`); continue; }
    if (existing.some(g => g.name === session.name)) { skipped.push(`Día ${day}: ya apuntado`); continue; }

    const newEntry = { name: session.name, level: session.level };
    const sim = [...existing, newEntry];
    if (s.levelMix && maxG <= 3 && sim.length === maxG && !hasRequiredLevelMix(sim)) {
      skipped.push(`Día ${day}: mezcla de niveles inválida`); continue;
    }

    existing.push(newEntry);
    added.push(day);
  }

  saveGuardias(guardias);
  renderCalendar();

  let msg = '';
  if (added.length)   msg += `✅ Añadidas: días ${added.join(', ')}.`;
  if (skipped.length) msg += `\n⚠️ Omitidos: ${skipped.join(' | ')}`;
  if (!msg) msg = 'No se añadió ninguna guardia.';
  alert(msg);

  document.getElementById('prop-days').value = '';
  document.getElementById('prop-count').value = '';
  document.getElementById('prop-days-warning').textContent = '';
}

// ============================================================
// ADMIN: APROBAR, RESETEAR, RESTAURAR
// ============================================================
function approveMonth() {
  const key = monthKey(STATE.viewYear, STATE.viewMonth);
  const approved = loadApproved();
  approved[key] = true;
  saveApproved(approved);

  // Resetear lista de usuarios (mantener admins)
  let users = loadUsers();
  users = users.filter(u => u.rol === 'admin');
  saveUsers(users);

  renderCalendar();
  renderUsersList();
  if (STATE.session.rol === 'dev') renderDevSwitchList();
  document.getElementById('admin-status').textContent = '✅ Mes aprobado. Usuarios reseteados.';
}

function resetMonth() {
  const key = monthKey(STATE.viewYear, STATE.viewMonth);
  const label = new Date(STATE.viewYear, STATE.viewMonth, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  if (!confirm(`¿Resetear guardias de ${label}?\nSe hará backup automático.`)) return;

  const g = loadGuardias();
  saveBackup(JSON.parse(JSON.stringify(g)));
  delete g[key];
  saveGuardias(g);

  const a = loadApproved();
  delete a[key];
  saveApproved(a);

  renderCalendar();
  document.getElementById('admin-status').textContent = '🗑️ Mes reseteado. Backup guardado.';
}

function restoreBackup() {
  const backup = loadBackup();
  if (!backup) { alert('No hay backup disponible.'); return; }
  if (!confirm('¿Restaurar el mes borrado? Se sobreescribirán las guardias actuales.')) return;
  saveGuardias(backup);
  renderCalendar();
  document.getElementById('admin-status').textContent = '♻️ Mes restaurado.';
}

// ============================================================
// DEV: CREAR USUARIO (en app)
// ============================================================
function devCreateUser() {
  const name  = document.getElementById('dev-new-name').value.trim();
  const level = document.getElementById('dev-new-level').value;
  const rol   = document.getElementById('dev-new-rol').value;
  if (!name) { alert('Introduce un nombre.'); return; }
  let users = loadUsers();
  if (users.some(u => u.name === name)) { alert('Nombre ya existente.'); return; }
  const u = { name, level, rol };
  if (rol === 'admin') u.pass = 'admin123';
  users.push(u);
  saveUsers(users);
  document.getElementById('dev-new-name').value = '';
  renderDevSwitchList();
  renderUsersList();
  alert(`Usuario "${name}" (${level} · ${rol}) creado.${rol==='admin'?' Contraseña: admin123':''}`);
}

// ============================================================
// UTILS
// ============================================================
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  ensureDefaultAdmin();
  setupLogin();
});