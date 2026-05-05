let data = JSON.parse(localStorage.getItem("guardias")) || {};
let admin = localStorage.getItem("admin") || null;
let role = localStorage.getItem("role") || null;

const calendarGrid = document.getElementById("calendarGrid");
const userList = document.getElementById("userList");

const year = 2026;
const month = 4; // 👈 MAYO (0 = enero)

function save() {
  localStorage.setItem("guardias", JSON.stringify(data));
  localStorage.setItem("admin", admin);
  localStorage.setItem("role", role);
}

/* ======================
   LOGIN SYSTEM
====================== */

function enterUser() {
  role = "user";
  localStorage.setItem("role", role);
  document.getElementById("loginScreen").style.display = "none";
  renderAll();
}

function enterAdmin() {
  const name = document.getElementById("adminLoginName").value;

  if (!name) {
    alert("Introduce nombre admin");
    return;
  }

  if (!["R3", "R4"].includes(name)) {
    alert("Solo R3 o R4 pueden ser admin");
    return;
  }

  admin = name;
  role = "admin";

  localStorage.setItem("admin", admin);
  localStorage.setItem("role", role);

  document.getElementById("loginScreen").style.display = "none";
  renderAll();
}

function isAdmin() {
  return role === "admin";
}

/* ======================
   CORE
====================== */

function resetMonth() {
  if (!isAdmin()) return;

  if (!confirm("¿Borrar todo el mes?")) return;
  data = {};
  save();
  renderAll();
}

function setAdmin() {
  // ya no se usa (lo puedes borrar del HTML)
}

function getDayType(day) {
  const d = new Date(year, month, day).getDay();
  if (d === 0) return "domingo";
  if (d === 6) return "sabado";
  if (d === 5) return "viernes";
  if (d === 1) return "lunes";
  return "normal";
}

function hasSenior(shifts) {
  return shifts.some(s => s.level === "R3" || s.level === "R4");
}

/* ======================
   CALENDAR
====================== */

function renderCalendar() {
  calendarGrid.innerHTML = "";
  const days = new Date(year, month + 1, 0).getDate();

  for (let i = 1; i <= days; i++) {
    const dayDiv = document.createElement("div");
    dayDiv.className = "day";
    dayDiv.dataset.day = i;

    const shifts = data[i] || [];

    let conflict = false;

    let max = 2;
    if (getDayType(i) === "domingo" || getDayType(i) === "sabado") {
      max = 3;
    }

    if (shifts.length > max) conflict = true;
    if (shifts.length >= 2 && !hasSenior(shifts)) conflict = true;

    dayDiv.innerHTML = `<div class="day-number">${i}</div>`;

    shifts.forEach((s, index) => {
      const div = document.createElement("div");

      let cls = "suggested";
      if (conflict) cls = "conflict";
      if (s.status === "confirmed") cls = "confirmed";

      div.className = "shift " + cls;
      div.draggable = isAdmin();
      div.innerText = `${s.name} (${s.level})`;

      if (isAdmin()) {
        div.addEventListener("dblclick", () => {
          if (!confirm("Eliminar guardia?")) return;
          data[i].splice(index, 1);
          save();
          renderAll();
        });
      }

      div.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text", JSON.stringify({ day: i, index }));
      });

      dayDiv.appendChild(div);
    });

    dayDiv.addEventListener("dragover", e => {
      if (!isAdmin()) return;
      e.preventDefault();
      dayDiv.classList.add("drag-over");
    });

    dayDiv.addEventListener("dragleave", () => {
      dayDiv.classList.remove("drag-over");
    });

    dayDiv.addEventListener("drop", e => {
      if (!isAdmin()) return;

      e.preventDefault();
      dayDiv.classList.remove("drag-over");

      const targetDay = parseInt(dayDiv.dataset.day);

      const { day, index } = JSON.parse(e.dataTransfer.getData("text"));
      const item = data[day][index];

      data[day].splice(index, 1);

      if (!data[targetDay]) data[targetDay] = [];
      data[targetDay].push(item);

      save();
      renderAll();
    });

    calendarGrid.appendChild(dayDiv);
  }
}

/* ======================
   OTHER FUNCTIONS
====================== */

function confirmAll() {
  if (!isAdmin()) return;

  Object.keys(data).forEach(d => {
    data[d].forEach(s => s.status = "confirmed");
  });

  save();
  renderAll();
}

function submitProposal() {
  const name = document.getElementById("name").value;
  const level = document.getElementById("level").value;
  const num = parseInt(document.getElementById("numShifts").value);

  const days = document.getElementById("days").value
    .split(",")
    .map(d => parseInt(d.trim()))
    .filter(d => d >= 1 && d <= 31);

  if (!name) {
    alert("Introduce nombre");
    return;
  }

  if (days.length !== num) {
    alert("Número de días incorrecto");
    return;
  }

  let premium = 0;
  days.forEach(d => {
    const t = getDayType(d);
    if (t === "domingo" || t === "sabado") premium++;
  });

  if (premium === days.length) {
    alert("No puedes elegir solo días premium");
    return;
  }

  days.forEach(d => {
    if (!data[d]) data[d] = [];
    data[d].push({ name, level, status: "suggested" });
  });

  save();
  renderAll();

  document.getElementById("name").value = "";
  document.getElementById("days").value = "";
}

/* ======================
   UI
====================== */

function renderUsers() {
  userList.innerHTML = "";

  const users = {};

  Object.values(data).forEach(day => {
    day.forEach(u => {
      users[u.name] = u.level;
    });
  });

  Object.keys(users).forEach(name => {
    const div = document.createElement("div");
    div.innerText = `${name} (${users[name]})`;
    userList.appendChild(div);
  });
}

function renderAdminPanel() {
  document.getElementById("adminPanel").style.display =
    isAdmin() ? "block" : "none";
}

function renderMonthTitle() {
  const months = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  document.getElementById("monthTitle").innerText =
    months[month] + " " + year;
}

function renderAll() {
  renderMonthTitle();
  renderCalendar();
  renderUsers();
  renderAdminPanel();
}

/* INIT */
if (role) {
  document.getElementById("loginScreen").style.display = "none";
}

renderAll();