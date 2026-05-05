window.onerror = function(msg, src, line) {
  alert("ERROR JS: " + msg + " (" + line + ")");
};

const DEV_MODE = true;

const DEV_USERS = {
  user1: { name: "Ana", role: "user" },
  user2: { name: "Luis", role: "user" },
  user3: { name: "Marta", role: "admin" }
};

let data = JSON.parse(localStorage.getItem("guardias")) || {};
let backup = JSON.parse(localStorage.getItem("guardias_backup")) || null;

let role = null;
let username = null;

const calendarGrid = document.getElementById("calendarGrid");
const userList = document.getElementById("userList");

const year = 2026;
const month = 4;

/* =========================
   LOGIN
========================= */

function loginUser() {
  if (DEV_MODE) {
    username = DEV_USERS.user1.name;
    role = DEV_USERS.user1.role;
    startApp();
    return;
  }

  username = document.getElementById("userNameLogin").value.trim();
  if (!username) return alert("Introduce nombre");

  role = "user";
  startApp();
}

function loginAdmin() {
  if (DEV_MODE) {
    username = DEV_USERS.user3.name;
    role = DEV_USERS.user3.role;
    startApp();
    return;
  }

  const name = document.getElementById("adminNameLogin").value.trim();
  if (!name) return alert("Introduce admin");

  username = name;
  role = "admin";
  startApp();
}

function logout() {
  localStorage.clear();
  location.reload();
}

function switchUser(devKey) {
  if (!DEV_MODE) return;

  username = DEV_USERS[devKey].name;
  role = DEV_USERS[devKey].role;

  document.getElementById("name").value = username;

  setupUI();
  renderAll();
}

function startApp() {
  console.log("START APP EJECUTADO");

  const login = document.getElementById("loginScreen");
  const app = document.getElementById("app");
  const topbar = document.getElementById("topBar");

  login.classList.add("hidden");
  app.classList.remove("hidden");
  topbar.classList.remove("hidden");

  const nameInput = document.getElementById("name");
  if (nameInput) {
    nameInput.value = username;
    nameInput.disabled = true;
  }

  setupUI();
  renderAll();

  if (DEV_MODE) {
    document.getElementById("devPanel").style.display = "flex";
  }
}

/* =========================
   UI ROLE CONTROL
========================= */

function setupUI() {
  const badge = document.getElementById("roleBadge");

  if (role === "admin") {
    badge.innerText = "ADMINISTRADOR";
    badge.className = "admin";

    document.getElementById("resetBtn").style.display = "block";
    document.getElementById("restoreBtn").style.display = "block";
  } else {
    badge.innerText = "USUARIO NORMAL";
    badge.className = "user";

    document.getElementById("resetBtn").style.display = "none";
    document.getElementById("restoreBtn").style.display = "none";
  }
  
}

function isAdmin() {
  return role === "admin";
}

/* =========================
   BACKUP SYSTEM
========================= */

function resetMonth() {
  if (!isAdmin()) return;

  if (!confirm("¿Seguro? Se hará backup automático")) return;

  backup = structuredClone(data);
  localStorage.setItem("guardias_backup", JSON.stringify(backup));

  data = {};
  save();
  renderAll();
}

function restoreMonth() {
  if (!isAdmin()) return;

  if (!backup) return alert("No hay backup");

  data = structuredClone(backup);
  save();
  renderAll();
}

/* =========================
   SAVE
========================= */

function save() {
  localStorage.setItem("guardias", JSON.stringify(data));
}

/* =========================
   INPUT FILTER (days)
========================= */

document.addEventListener("input", (e) => {
  if (e.target.id === "days") {
    e.target.value = e.target.value.replace(/[^0-9,]/g, "");
  }
});

/* =========================
   CALENDAR
========================= */

function renderCalendar() {
  calendarGrid.innerHTML = "";

  const days = new Date(year, month + 1, 0).getDate();

  for (let i = 1; i <= days; i++) {
    const dayDiv = document.createElement("div");
    dayDiv.className = "day";

    const shifts = data[i] || [];

    dayDiv.innerHTML = `<div class="day-number">${i}</div>`;

    shifts.forEach((s, index) => {
      const div = document.createElement("div");
      div.className = "shift suggested";

      div.innerText = `${s.name} (${s.level})`;

      if (isAdmin()) {
        div.ondblclick = () => {
          if (!confirm("Eliminar?")) return;
          data[i].splice(index, 1);
          save();
          renderAll();
        };
      }

      dayDiv.appendChild(div);
    });

    calendarGrid.appendChild(dayDiv);
  }
}

/* =========================
   PROPOSAL
========================= */

function submitProposal() {
  const name = username;
  const level = document.getElementById("level").value;
  const num = parseInt(document.getElementById("numShifts").value);

  const days = document.getElementById("days").value
    .split(",")
    .map(d => parseInt(d.trim()))
    .filter(Boolean);

  if (days.length !== num) {
    return alert("Número de días incorrecto");
  }

  days.forEach(d => {
    if (!data[d]) data[d] = [];
    data[d].push({ name, level, status: "suggested" });
  });

  save();
  renderAll();

  document.getElementById("days").value = "";
}

/* =========================
   USERS
========================= */

function renderUsers() {
  userList.innerHTML = "";

  const users = {};

  Object.values(data).forEach(day => {
    day.forEach(u => users[u.name] = u.level);
  });

  Object.keys(users).forEach(u => {
    const div = document.createElement("div");
    div.innerText = `${u} (${users[u]})`;
    userList.appendChild(div);
  });
}

/* =========================
   MAIN
========================= */

function renderAll() {
  renderCalendar();
  renderUsers();
}


