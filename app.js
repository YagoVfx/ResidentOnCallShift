/* =============================================
   GUARDIAS MIR — APP.JS v2
   Todas las correcciones aplicadas
   ============================================= */

// ============================================================
// ESTADO GLOBAL
// ============================================================
const STATE = {
  session: null,       // { name, level, rol }
  viewYear: null,
  viewMonth: null,     // 0-based
  // currentDay/Month/Year del modal abierto
  modalDay: null,
  modalMonthKey: null,
};

// Clave settings DEV
const SETTINGS_KEY = 'mir_settings';

// ============================================================
// STORAGE HELPERS
// ============================================================
function loadGuardias() {
  try { return JSON.parse(localStorage.getItem('guardias')) || {}; }
  catch { return {}; }
}
function saveGuardias(d) { localStorage.setItem('guardias', JSON.stringify(d)); }

function loadBackup() {
  try { return JSON.parse(localStorage.getItem('guardias_backup')) || null; }
  catch { return null; }
}
function saveBackup(d) { localStorage.setItem('guardias_backup', JSON.stringify(d)); }

function loadUsers() {
  try { return JSON.parse(localStorage.getItem('mir_users')) || []; }
  catch { return []; }
}
function saveUsers(u) { localStorage.setItem('mir_users', JSON.stringify(u)); }

function loadApproved() {
  try { return JSON.parse(localStorage.getItem('mir_approved')) || {}; }
  catch { return {}; }
}
function saveApproved(d) { localStorage.setItem('mir_approved', JSON.stringify(d)); }

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { allowR1R2: false }; }
  catch { return { allowR1R2: false }; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ============================================================
// ADMIN POR DEFECTO
// ============================================================
function ensureDefaultAdmin() {
  let users = loadUsers();
  const hasAdmin = users.some(u => u.rol === 'admin');
  if (!hasAdmin) {
    users.push({ name: 'Admin', level: 'R4', rol: 'admin', pass: 'admin123' });
    saveUsers(users);
  }
}

// ============================================================
// HELPERS DE FECHA
// ============================================================
function today() { return new Date(); }
function monthKey(year, month) { return `${year}-${String(month + 1).padStart(2, '0')}`; }

function isWeekendOrMonday(year, month, day) {
  const wd = new Date(year, month, day).getDay(); // 0=Dom,1=Lun,6=Sab
  return wd === 0 || wd === 1 || wd === 6;
}
function maxGuardsForDay(year, month, day) {
  return isWeekendOrMonday(year, month, day) ? 3 : 2;
}
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year, month) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Lunes=0
}

// ============================================================
// VALIDACIÓN DÍAS INPUT
// Acepta solo números enteros separados por comas
// ============================================================
function parseDaysInput(raw, year, month) {
  const maxDay = daysInMonth(year, month);
  const result = { valid: [], errors: [] };

  // Rechazar si hay letras o símbolos no permitidos (solo dígitos, comas y espacios)
  if (/[^0-9,\s]/.test(raw)) {
    result.errors.push('Solo se permiten números separados por comas.');
    return result;
  }

  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    result.errors.push('Introduce al menos un día.');
    return result;
  }

  const seen = new Set();
  for (const p of parts) {
    if (!/^\d+$/.test(p)) {
      result.errors.push(`"${p}" no es un número válido.`);
      continue;
    }
    const n = parseInt(p, 10);
    if (n < 1 || n > maxDay) {
      result.errors.push(`Día ${n} fuera de rango (1–${maxDay}).`);
      continue;
    }
    if (seen.has(n)) {
      result.errors.push(`Día ${n} duplicado.`);
      continue;
    }
    seen.add(n);
    result.valid.push(n);
  }
  return result;
}

// ============================================================
// REGLAS DE NIVELES
// ============================================================
function hasRequiredLevelMix(guards) {
  if (guards.length < 2) return false;
  const senior = guards.some(g => g.level === 'R3' || g.level === 'R4');
  const junior = guards.some(g => g.level === 'R1' || g.level === 'R2');
  return senior && junior;
}

// ¿Puede este usuario proponer? (R1/R2 bloqueados salvo setting activo)
function canPropose(level) {
  if (level === 'R3' || level === 'R4') return true;
  const s = loadSettings();
  return s.allowR1R2 === true;
}

// ============================================================
// DEV MODE TRIGGER (triple clic en esquina)
// ============================================================
function setupDevTrigger() {
  const el = document.getElementById('dev-trigger');

  if (!el) {
    console.warn('dev-trigger no encontrado');
    return;
  }

  let clicks = 0;
  let timer = null;

  el.addEventListener('click', () => {
    console.log('click dev trigger'); // 👈 DEBUG

    clicks++;
    clearTimeout(timer);

    timer = setTimeout(() => { clicks = 0; }, 1200);

    if (clicks >= 3) {
      clicks = 0;
      console.log('DEV MODE ACTIVADO'); // 👈 DEBUG
      toggleDevTab();
    }
  });
}

function toggleDevTab() {
  const tab = document.getElementById('tab-dev');
  const isVisible = tab.classList.contains('dev-visible');
  if (isVisible) {
    tab.classList.remove('dev-visible');
    tab.classList.add('tab-dev-hidden');
  } else {
    tab.classList.remove('tab-dev-hidden');
    tab.classList.add('dev-visible');
    renderDevLoginList();
  }
}

// ============================================================
// LOGIN
// ============================================================
function setupLogin() {
  ensureDefaultAdmin();
  setupDevTrigger();

  // Tabs normales
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Solo ocultar tabs normales (no el dev)
      document.getElementById('tab-user').classList.remove('active');
      document.getElementById('tab-admin').classList.remove('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Login usuario
  document.getElementById('btn-login-user').addEventListener('click', loginUser);
  document.getElementById('login-user-name').addEventListener('keydown', e => { if (e.key === 'Enter') loginUser(); });
  document.getElementById('login-user-level').addEventListener('keydown', e => { if (e.key === 'Enter') loginUser(); });

  // Login admin
  document.getElementById('btn-login-admin').addEventListener('click', loginAdmin);
  document.getElementById('login-admin-pass').addEventListener('keydown', e => { if (e.key === 'Enter') loginAdmin(); });

  // Login DEV
  document.getElementById('btn-login-dev').addEventListener('click', () => {
    startSession({ name: 'DEV', level: 'R4', rol: 'dev' });
  });

  // Crear usuario rápido desde login DEV
  document.getElementById('btn-dev-quick-create').addEventListener('click', devQuickCreate);
}

function loginUser() {
  const name = document.getElementById('login-user-name').value.trim();
  const level = document.getElementById('login-user-level').value;
  if (!name) return showLoginError('Introduce tu nombre completo.');
  if (!level) return showLoginError('Selecciona tu nivel MIR.');

  let users = loadUsers();
  const existing = users.find(u => u.name === name && u.rol === 'user');
  if (!existing) {
    users.push({ name, level, rol: 'user' });
    saveUsers(users);
  }
  startSession({ name, level, rol: 'user' });
}

function loginAdmin() {
  const name = document.getElementById('login-admin-name').value.trim();
  const pass = document.getElementById('login-admin-pass').value;
  if (!name) return showLoginError('Introduce el nombre de administrador.');
  const users = loadUsers();
  const admin = users.find(u => u.name === name && u.rol === 'admin');
  if (!admin) return showLoginError('Administrador no encontrado.');
  if (admin.pass && admin.pass !== pass) return showLoginError('Contraseña incorrecta.');
  startSession({ name: admin.name, level: admin.level || 'R4', rol: 'admin' });
}

function devQuickCreate() {
  const name = document.getElementById('dev-quick-name').value.trim();
  const level = document.getElementById('dev-quick-level').value;
  const rol = document.getElementById('dev-quick-rol').value;
  if (!name) { showLoginError('Introduce un nombre para el usuario.'); return; }

  let users = loadUsers();
  if (users.some(u => u.name === name)) { showLoginError('Ya existe un usuario con ese nombre.'); return; }

  const u = { name, level, rol };
  if (rol === 'admin') u.pass = 'admin123';
  users.push(u);
  saveUsers(users);
  document.getElementById('dev-quick-name').value = '';
  renderDevLoginList();
  // Entrar directamente
  startSession({ name, level, rol });
}

function renderDevLoginList() {
  const users = loadUsers();
  const el = document.getElementById('dev-login-users-list');
  if (users.length === 0) {
    el.innerHTML = '<p style="color:#444;font-size:11px;text-align:center;padding:6px 0">Sin usuarios registrados</p>';
    return;
  }
  el.innerHTML = users.map((u, i) => `
    <div class="dev-login-user-item">
      <span class="info"><strong>${u.name}</strong> ${u.level ? `· ${u.level}` : ''}</span>
      <span class="dev-login-user-badge badge-${u.rol}">${u.rol.toUpperCase()}</span>
      <div style="display:flex;gap:3px">
        <button class="btn-switch-login" onclick="devLoginAs(${i})">Entrar</button>
        <button class="btn-del-login" onclick="devDeleteFromLogin(${i})">✕</button>
      </div>
    </div>
  `).join('');
}

function devLoginAs(i) {
  const users = loadUsers();
  const u = users[i];
  if (u) startSession({ name: u.name, level: u.level || 'R4', rol: u.rol });
}

function devDeleteFromLogin(i) {
  let users = loadUsers();
  const u = users[i];
  if (!u) return;
  if (u.rol === 'admin' && users.filter(x => x.rol === 'admin').length <= 1) {
    showLoginError('Debe existir al menos 1 administrador.');
    return;
  }
  users.splice(i, 1);
  saveUsers(users);
  renderDevLoginList();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

// ============================================================
// SESIÓN
// ============================================================
let navigationSetup = false;

function startSession(session) {
  STATE.session = session;
  const now = today();
  STATE.viewYear = now.getFullYear();
  STATE.viewMonth = now.getMonth();

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  renderTopbar();
  renderSidebar();
  renderCalendar();

  if (!navigationSetup) {
    setupNavigation();
    navigationSetup = true;
  }
}

function logout() {
  STATE.session = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');

  // Limpiar campos
  document.getElementById('login-user-name').value = '';
  document.getElementById('login-user-level').value = '';
  document.getElementById('login-admin-name').value = '';
  document.getElementById('login-admin-pass').value = '';
  document.getElementById('login-error').textContent = '';

  // Resetear tabs
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.getElementById('tab-user').classList.add('active');
  document.getElementById('tab-admin').classList.remove('active');

  // Ocultar DEV tab
  const devTab = document.getElementById('tab-dev');
  devTab.classList.remove('dev-visible');
  devTab.classList.add('tab-dev-hidden');
}

// ============================================================
// TOPBAR
// ============================================================
function renderTopbar() {
  const { session } = STATE;
  const rolEl = document.getElementById('topbar-rol');
  rolEl.textContent = session.rol.toUpperCase();
  rolEl.className = `topbar-rol rol-${session.rol}`;
  document.getElementById('topbar-user').textContent =
    session.name + (session.level ? ` · ${session.level}` : '');
}

// ============================================================
// SIDEBAR
// ============================================================
function renderSidebar() {
  const { session } = STATE;
  const rol = session.rol;
  const isAdminOrDev = rol === 'admin' || rol === 'dev';

  // Visibilidad de cards
  document.getElementById('admin-card').classList.toggle('hidden', !isAdminOrDev);
  document.getElementById('dev-card').classList.toggle('hidden', rol !== 'dev');
  document.getElementById('users-card').classList.toggle('hidden', !isAdminOrDev);

  // Formulario propuesta: siempre visible, estado según condiciones
  document.getElementById('prop-name').value = session.name;
  document.getElementById('prop-level').value = session.level;

  // Toggle R1/R2 (DEV)
  if (rol === 'dev') {
    const settings = loadSettings();
    document.getElementById('toggle-r1r2').checked = settings.allowR1R2;
  }

  updateFormState();

  if (isAdminOrDev) {
    renderUsersList();
    if (rol === 'dev') renderDevSwitchList();
  }

  // Admin status
  if (isAdminOrDev) {
    const approved = loadApproved();
    const key = monthKey(STATE.viewYear, STATE.viewMonth);
    document.getElementById('admin-status').textContent =
      approved[key] ? '✅ Mes aprobado' : '📋 Mes pendiente de aprobación';
  }
}

// Actualiza el estado del formulario según mes visible y usuario
function updateFormState() {
  const { session, viewYear, viewMonth } = STATE;
  const now = today();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const curDay = now.getDate();

  const isCurrentMonth = viewYear === curYear && viewMonth === curMonth;
  const isNextMonth = (viewYear > curYear) || (viewYear === curYear && viewMonth > curMonth);

  const deadlineWarn = document.getElementById('form-deadline-warning');
  const currentInfo = document.getElementById('form-current-month-info');
  const submitBtn = document.getElementById('btn-submit-prop');

  deadlineWarn.classList.add('hidden');
  currentInfo.classList.add('hidden');

  let blocked = false;

  // Bloquear R1/R2 si setting no activo
  if (!canPropose(session.level)) {
    blocked = true;
    deadlineWarn.classList.remove('hidden');
    deadlineWarn.textContent = 'ℹ️ Tu nivel (' + session.level + ') no tiene permiso para proponer guardias en este momento. El administrador puede activar esta opción.';
  } else if (isNextMonth) {
    // Propuestas mes siguiente: solo del día 1 al 15 del mes actual
    if (curDay > 15) {
      blocked = true;
      deadlineWarn.classList.remove('hidden');
      deadlineWarn.textContent = '⚠️ Fuera de plazo. Las propuestas del mes siguiente se cierran el día 15 del mes actual.';
    }
    // Si curDay <= 15 está bien, puede proponer
  } else if (isCurrentMonth) {
    currentInfo.classList.remove('hidden');
  }

  submitBtn.disabled = blocked;
}

function renderUsersList() {
  const users = loadUsers();
  const el = document.getElementById('users-list');
  const badge = document.getElementById('users-count-badge');
  badge.textContent = users.length;

  if (users.length === 0) {
    el.innerHTML = '<p style="color:#444;font-size:12px;text-align:center;padding:4px 0">Sin usuarios</p>';
    return;
  }
  el.innerHTML = users.map(u => `
    <div class="user-item">
      <span class="user-item-name">${u.name} <small>${u.level || ''}</small></span>
      <span class="user-badge badge-${u.rol}">${u.rol.toUpperCase()}</span>
    </div>
  `).join('');
}

function renderDevSwitchList() {
  const users = loadUsers();
  const el = document.getElementById('dev-user-switch-list');
  if (users.length === 0) {
    el.innerHTML = '<p style="color:#444;font-size:11px">Sin usuarios</p>';
    return;
  }
  el.innerHTML = users.map((u, i) => `
    <div class="switch-item">
      <span class="info"><strong>${u.name}</strong> ${u.level ? `· ${u.level}` : ''} <span class="dev-login-user-badge badge-${u.rol}">${u.rol}</span></span>
      <button class="btn-switch" onclick="devSwitchInApp(${i})">Entrar</button>
      <button class="btn-del" onclick="devDeleteInApp(${i})">✕</button>
    </div>
  `).join('');
}

function devSwitchInApp(i) {
  const users = loadUsers();
  const u = users[i];
  if (!u) return;
  STATE.session = { name: u.name, level: u.level || 'R4', rol: u.rol };
  renderTopbar();
  renderSidebar();
  renderCalendar();
}

function devDeleteInApp(i) {
  let users = loadUsers();
  const u = users[i];
  if (!u) return;
  if (u.rol === 'admin' && users.filter(x => x.rol === 'admin').length <= 1) {
    alert('Debe existir al menos 1 administrador.');
    return;
  }
  users.splice(i, 1);
  saveUsers(users);
  renderDevSwitchList();
  renderUsersList();
}

// ============================================================
// NAVEGACIÓN Y SETUP
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
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('day-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('day-modal')) closeModal();
  });
  document.getElementById('btn-modal-add-guard').addEventListener('click', modalAddGuard);

  // Validación en tiempo real del input días
  document.getElementById('prop-days').addEventListener('input', () => {
    const raw = document.getElementById('prop-days').value;
    if (/[^0-9,\s]/.test(raw)) {
      // Limpiar caracteres no permitidos automáticamente
      document.getElementById('prop-days').value = raw.replace(/[^0-9,\s]/g, '');
      document.getElementById('prop-days-warning').textContent = 'Solo se permiten números separados por comas.';
    } else {
      document.getElementById('prop-days-warning').textContent = '';
    }
  });

  // Límite prop-count 1-5
  document.getElementById('prop-count').addEventListener('input', () => {
    const v = parseInt(document.getElementById('prop-count').value, 10);
    if (v < 1) document.getElementById('prop-count').value = 1;
    if (v > 5) document.getElementById('prop-count').value = 5;
  });

  // Toggle R1/R2
  document.getElementById('toggle-r1r2').addEventListener('change', e => {
    const s = loadSettings();
    s.allowR1R2 = e.target.checked;
    saveSettings(s);
    updateFormState();
  });
}

function navPrev() {
  const now = today();
  if (STATE.viewYear === now.getFullYear() && STATE.viewMonth === now.getMonth()) return;
  STATE.viewMonth--;
  if (STATE.viewMonth < 0) { STATE.viewMonth = 11; STATE.viewYear--; }
  renderCalendar();
  updateFormState();
}

function navNext() {
  const now = today();
  let ny = now.getFullYear(), nm = now.getMonth() + 1;
  if (nm > 11) { nm = 0; ny++; }
  if (STATE.viewYear === ny && STATE.viewMonth === nm) return;
  STATE.viewMonth++;
  if (STATE.viewMonth > 11) { STATE.viewMonth = 0; STATE.viewYear++; }
  renderCalendar();
  updateFormState();
}

// ============================================================
// CALENDARIO
// ============================================================
function renderCalendar() {
  const { viewYear, viewMonth } = STATE;
  const now = today();
  const curYear = now.getFullYear(), curMonth = now.getMonth();

  // Limpiar meses pasados
  cleanOldMonths(curYear, curMonth);

  // Título
  const title = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  document.getElementById('calendar-title').textContent =
    title.charAt(0).toUpperCase() + title.slice(1);

  // Navegar buttons
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  prevBtn.disabled = (viewYear === curYear && viewMonth === curMonth);
  let ny = curYear, nm = curMonth + 1;
  if (nm > 11) { nm = 0; ny++; }
  nextBtn.disabled = (viewYear === ny && viewMonth === nm);

  const guardias = loadGuardias();
  const key = monthKey(viewYear, viewMonth);
  const monthData = guardias[key] || {};
  const approved = loadApproved();
  const isApproved = !!approved[key];

  const firstDay = firstDayOfMonth(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const totalCells = Math.ceil((firstDay + totalDays) / 7) * 7;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    const dayNum = i - firstDay + 1;

    if (i < firstDay || dayNum > totalDays) {
      cell.className = 'cal-day empty';
    } else {
      const dayGuards = monthData[String(dayNum)] || [];
      const maxG = maxGuardsForDay(viewYear, viewMonth, dayNum);
      const isToday = viewYear === curYear && viewMonth === curMonth && dayNum === now.getDate();
      const isWknd = isWeekendOrMonday(viewYear, viewMonth, dayNum);
      const isFull = dayGuards.length >= maxG;

      cell.className = [
        'cal-day',
        isToday ? 'today' : '',
        isWknd ? 'weekend' : '',
        isFull ? 'full-day' : '',
      ].filter(Boolean).join(' ');

      const numEl = document.createElement('div');
      numEl.className = 'day-num';
      numEl.textContent = dayNum;
      cell.appendChild(numEl);

      if (isFull) {
        const badge = document.createElement('span');
        badge.className = 'day-full-badge';
        badge.textContent = 'LLENO';
        cell.appendChild(badge);
      }

      dayGuards.forEach(g => {
        const chip = document.createElement('span');
        chip.className = `guard-chip ${isApproved ? 'approved' : 'pending'}`;
        chip.textContent = `${g.name} (${g.level})`;
        chip.title = `${g.name} · ${g.level}`;
        cell.appendChild(chip);
      });

      const d = dayNum;
      cell.addEventListener('click', () => openDayModal(d, isApproved, key, maxG));
    }
    grid.appendChild(cell);
  }

  // PDF section
  const rol = STATE.session.rol;
  const pdfSection = document.getElementById('pdf-section');
  pdfSection.classList.toggle('hidden', !(isApproved && (rol === 'admin' || rol === 'dev')));

  // Admin status
  if (rol === 'admin' || rol === 'dev') {
    document.getElementById('admin-status').textContent =
      isApproved ? '✅ Mes aprobado' : '📋 Mes pendiente de aprobación';
  }
}

function cleanOldMonths(curYear, curMonth) {
  const guardias = loadGuardias();
  const approved = loadApproved();
  let changed = false;
  [...Object.keys(guardias), ...Object.keys(approved)].forEach(k => {
    const [y, m] = k.split('-').map(Number);
    if (y < curYear || (y === curYear && m - 1 < curMonth)) {
      delete guardias[k];
      delete approved[k];
      changed = true;
    }
  });
  if (changed) { saveGuardias(guardias); saveApproved(approved); }
}

// ============================================================
// MODAL DÍA
// ============================================================
function openDayModal(day, isApproved, key, maxG) {
  STATE.modalDay = day;
  STATE.modalMonthKey = key;

  const { session } = STATE;
  const rol = session.rol;
  const isAdminOrDev = rol === 'admin' || rol === 'dev';

  const guardias = loadGuardias();
  const dayGuards = (guardias[key] || {})[String(day)] || [];

  const isWknd = isWeekendOrMonday(STATE.viewYear, STATE.viewMonth, day);
  const typeLabel = isWknd ? '(L/S/D — máx 3)' : '(máx 2)';
  document.getElementById('modal-day-title').textContent =
    `Día ${day} — ${new Date(STATE.viewYear, STATE.viewMonth, day).toLocaleDateString('es-ES', { weekday: 'long' })} ${typeLabel}`;

  // Lista guardias
  const listEl = document.getElementById('modal-guards-list');
  listEl.innerHTML = '';

  if (dayGuards.length === 0) {
    listEl.innerHTML = '<p style="color:#555;font-size:13px;text-align:center;padding:4px 0">Sin guardias asignadas</p>';
  } else {
    dayGuards.forEach((g, idx) => {
      const item = document.createElement('div');
      item.className = `modal-guard-item ${isApproved ? 'approved' : 'pending'}`;
      item.innerHTML = `
        <span class="modal-guard-name">${g.name}</span>
        <span class="modal-guard-level">${g.level}</span>
        ${isAdminOrDev
          ? `<button class="btn-delete-guard" ondblclick="deleteGuard('${key}',${day},${idx})">✕ Borrar</button>`
          : ''}
      `;
      listEl.appendChild(item);
    });
  }

  // Sección añadir (admin/dev)
  const addSection = document.getElementById('modal-add-guard-section');
  document.getElementById('modal-add-warning').textContent = '';

  if (isAdminOrDev) {
    addSection.classList.remove('hidden');
    // Poblar select con usuarios que aún no están en este día
    const userSelect = document.getElementById('modal-add-user');
    userSelect.innerHTML = '<option value="">— Selecciona usuario —</option>';
    const users = loadUsers();
    const alreadyIn = new Set(dayGuards.map(g => g.name));
    const available = users.filter(u => !alreadyIn.has(u.name));
    if (dayGuards.length >= maxG) {
      userSelect.innerHTML = '<option value="">Día completo</option>';
      userSelect.disabled = true;
    } else {
      userSelect.disabled = false;
      available.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.name;
        opt.textContent = `${u.name} (${u.level || '-'}) · ${u.rol}`;
        opt.dataset.level = u.level || 'R4';
        userSelect.appendChild(opt);
      });
    }
  } else {
    addSection.classList.add('hidden');
  }

  // Hint
  const hint = document.getElementById('modal-hint');
  if (isAdminOrDev) {
    hint.textContent = 'Doble clic en "Borrar" para eliminar. Solo admin puede añadir manualmente.';
  } else {
    hint.textContent = isApproved ? 'Mes aprobado — solo lectura.' : '';
  }

  document.getElementById('day-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('day-modal').classList.add('hidden');
  STATE.modalDay = null;
  STATE.modalMonthKey = null;
}

function deleteGuard(key, day, idx) {
  const guardias = loadGuardias();
  if (!guardias[key]?.[String(day)]) return;
  guardias[key][String(day)].splice(idx, 1);
  if (guardias[key][String(day)].length === 0) delete guardias[key][String(day)];
  saveGuardias(guardias);
  closeModal();
  renderCalendar();
}

function modalAddGuard() {
  const { modalDay, modalMonthKey, viewYear, viewMonth } = STATE;
  if (!modalDay || !modalMonthKey) return;

  const userSelect = document.getElementById('modal-add-user');
  const selectedName = userSelect.value;
  const warnEl = document.getElementById('modal-add-warning');
  warnEl.textContent = '';

  if (!selectedName) { warnEl.textContent = 'Selecciona un usuario.'; return; }

  const selectedOpt = userSelect.selectedOptions[0];
  const selectedLevel = selectedOpt?.dataset.level || 'R4';

  const guardias = loadGuardias();
  if (!guardias[modalMonthKey]) guardias[modalMonthKey] = {};
  const dayKey = String(modalDay);
  if (!guardias[modalMonthKey][dayKey]) guardias[modalMonthKey][dayKey] = [];
  const existing = guardias[modalMonthKey][dayKey];
  const maxG = maxGuardsForDay(viewYear, viewMonth, modalDay);

  if (existing.length >= maxG) { warnEl.textContent = 'Día completo.'; return; }
  if (existing.some(g => g.name === selectedName)) { warnEl.textContent = 'Ese usuario ya tiene guardia este día.'; return; }

  existing.push({ name: selectedName, level: selectedLevel });
  saveGuardias(guardias);

  // Reabrir modal actualizado
  const approved = loadApproved();
  const isApproved = !!approved[modalMonthKey];
  closeModal();
  renderCalendar();
  openDayModal(modalDay, isApproved, modalMonthKey, maxG);
}

// ============================================================
// PROPONER GUARDIA
// ============================================================
function submitProposal() {
  const { session, viewYear, viewMonth } = STATE;
  const now = today();
  const curYear = now.getFullYear(), curMonth = now.getMonth(), curDay = now.getDate();

  // Verificar permiso de nivel
  if (!canPropose(session.level)) return;

  // Verificar plazo
  const isNextMonth = (viewYear > curYear) || (viewYear === curYear && viewMonth > curMonth);
  if (isNextMonth && curDay > 15) {
    alert('El plazo de propuestas para el mes siguiente ya ha cerrado (día 15 del mes actual).');
    return;
  }

  // Nº guardias (1-5)
  const countRaw = parseInt(document.getElementById('prop-count').value, 10);
  if (isNaN(countRaw) || countRaw < 1 || countRaw > 5) {
    document.getElementById('prop-days-warning').textContent = 'El número de guardias debe ser entre 1 y 5.';
    return;
  }

  const daysRaw = document.getElementById('prop-days').value;
  if (!daysRaw.trim()) {
    document.getElementById('prop-days-warning').textContent = 'Introduce los días.';
    return;
  }

  const { valid, errors } = parseDaysInput(daysRaw, viewYear, viewMonth);

  if (errors.length > 0) {
    document.getElementById('prop-days-warning').textContent = errors.join(' | ');
    return;
  }

  if (valid.length === 0) {
    document.getElementById('prop-days-warning').textContent = 'No hay días válidos en el rango del mes.';
    return;
  }

  // Ajustar al número solicitado (tomar los primeros N válidos)
  const daysToAdd = valid.slice(0, countRaw);

  const guardias = loadGuardias();
  const key = monthKey(viewYear, viewMonth);
  if (!guardias[key]) guardias[key] = {};

  const added = [];
  const skipped = [];

  for (const day of daysToAdd) {
    const dayKey = String(day);
    if (!guardias[key][dayKey]) guardias[key][dayKey] = [];
    const existing = guardias[key][dayKey];
    const maxG = maxGuardsForDay(viewYear, viewMonth, day);

    if (existing.length >= maxG) { skipped.push(`Día ${day}: lleno`); continue; }
    if (existing.some(g => g.name === session.name)) { skipped.push(`Día ${day}: ya apuntado`); continue; }

    // Comprobar mezcla de niveles cuando el día se llena a 2
    const newEntry = { name: session.name, level: session.level };
    const simulated = [...existing, newEntry];
    if (maxG === 2 && simulated.length === 2 && !hasRequiredLevelMix(simulated)) {
      skipped.push(`Día ${day}: combinación de niveles inválida (necesita R3/R4 + R1/R2)`);
      continue;
    }

    existing.push(newEntry);
    added.push(day);
  }

  saveGuardias(guardias);
  renderCalendar();

  let msg = '';
  if (added.length > 0) msg += `✅ Guardias añadidas en días: ${added.join(', ')}.`;
  if (skipped.length > 0) msg += `\n⚠️ Omitidos: ${skipped.join(' | ')}`;
  if (!msg) msg = 'No se pudo añadir ninguna guardia.';

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

  // Resetear lista de usuarios al aprobar
  // (preservar solo admins para que puedan seguir entrando)
  // Según spec: resetear la lista al aprobar el mes
  // Interpretación: limpiar usuarios normales, mantener admins
  let users = loadUsers();
  users = users.filter(u => u.rol === 'admin' || u.rol === 'dev');
  saveUsers(users);

  renderCalendar();
  renderUsersList();
  document.getElementById('admin-status').textContent = '✅ Mes aprobado. Usuarios reseteados.';
}

function resetMonth() {
  const key = monthKey(STATE.viewYear, STATE.viewMonth);
  const mLabel = new Date(STATE.viewYear, STATE.viewMonth, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  if (!confirm(`¿Resetear todas las guardias de ${mLabel}?\nSe realizará un backup automático antes.`)) return;

  const guardias = loadGuardias();
  saveBackup(JSON.parse(JSON.stringify(guardias)));
  delete guardias[key];
  saveGuardias(guardias);

  const approved = loadApproved();
  delete approved[key];
  saveApproved(approved);

  renderCalendar();
  document.getElementById('admin-status').textContent = '🗑️ Mes reseteado. Backup guardado.';
}

function restoreBackup() {
  const backup = loadBackup();
  if (!backup) { alert('No hay ningún backup disponible.'); return; }
  if (!confirm('¿Restaurar el backup? Se sobreescribirán las guardias actuales.')) return;
  saveGuardias(backup);
  renderCalendar();
  document.getElementById('admin-status').textContent = '♻️ Backup restaurado correctamente.';
}

// ============================================================
// DEV: CREAR USUARIO (desde sidebar en app)
// ============================================================
function devCreateUser() {
  const name = document.getElementById('dev-new-name').value.trim();
  const level = document.getElementById('dev-new-level').value;
  const rol = document.getElementById('dev-new-rol').value;
  if (!name) { alert('Introduce un nombre.'); return; }

  let users = loadUsers();
  if (users.some(u => u.name === name)) { alert('Ya existe un usuario con ese nombre.'); return; }

  const u = { name, level, rol };
  if (rol === 'admin') u.pass = 'admin123';
  users.push(u);
  saveUsers(users);

  document.getElementById('dev-new-name').value = '';
  renderDevSwitchList();
  renderUsersList();
  alert(`Usuario "${name}" (${level} · ${rol}) creado.${rol === 'admin' ? ' Contraseña: admin123' : ''}`);
}

// ============================================================
// PDF EXPORT
// ============================================================
function exportPDF() {
  window.print();
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  ensureDefaultAdmin();
  setupLogin();
});