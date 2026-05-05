let data = JSON.parse(localStorage.getItem("guardias")) || {};
let admin = localStorage.getItem("admin") || null;

const calendarGrid = document.getElementById("calendarGrid");
const userList = document.getElementById("userList");

const year = 2026;
const month = 5;

function save() {
  localStorage.setItem("guardias", JSON.stringify(data));
}

function resetMonth() {
  if (!confirm("¿Borrar todo el mes?")) return;
  data = {};
  save();
  renderAll();
}

function setAdmin() {
  const name = document.getElementById("adminName").value;
  admin = name;
  localStorage.setItem("admin", name);
  renderAll();
}

function isAdmin() {
  return admin !== null;
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

function renderCalendar() {
  calendarGrid.innerHTML = "";
  const days = new Date(year, month + 1, 0).getDate();

  for (let i = 1; i <= days; i++) {
    const dayDiv = document.createElement("div");
    dayDiv.className = "day";
    dayDiv.dataset.day = i;

    const shifts = data[i] || [];

    // VALIDACIÓN
    let conflict = false;

    if (shifts.length > 3) conflict = true;
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

      // DRAG
      div.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text", JSON.stringify({ day: i, index }));
      });

      dayDiv.appendChild(div);
    });

    // DROP
    dayDiv.addEventListener("dragover", e => {
      if (isAdmin()) {
        e.preventDefault();
        dayDiv.classList.add("drag-over");
      }
    });

    dayDiv.addEventListener("dragleave", () => {
      dayDiv.classList.remove("drag-over");
    });

    dayDiv.addEventListener("drop", e => {
      if (!isAdmin()) return;
      e.preventDefault();
      dayDiv.classList.remove("drag-over");

      const { day, index } = JSON.parse(e.dataTransfer.getData("text"));
      const item = data[day][index];

      data[day].splice(index, 1);

      if (!data[i]) data[i] = [];
      data[i].push(item);

      save();
      renderAll();
    });

    calendarGrid.appendChild(dayDiv);
  }
}

function confirmAll() {
  if (!isAdmin()) return;

  Object.keys(data).forEach(d => {
    data[d].forEach(s => {
      s.status = "confirmed";
    });
  });

  save();
  renderAll();
}

function submitProposal() {
  const name = document.getElementById("name").value;
  const level = document.getElementById("level").value;
  const num = parseInt(document.getElementById("numShifts").value);
  const days = document.getElementById("days").value.split(",").map(d => parseInt(d));

  if (days.length !== num) {
    alert("Número de días incorrecto");
    return;
  }

  // evitar solo premium
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
    data[d].push({
      name,
      level,
      status: "suggested"
    });
  });

  save();
  renderAll();
}

function renderUsers() {
  userList.innerHTML = "";

  const users = {};

  Object.values(data).forEach(day => {
    day.forEach(u => {
      if (!users[u.name]) users[u.name] = u.level;
    });
  });

  Object.keys(users).forEach(name => {
    const div = document.createElement("div");
    div.innerText = `${name} (${users[name]})`;
    userList.appendChild(div);
  });
}

function renderAdminPanel() {
  document.getElementById("adminPanel").style.display = isAdmin() ? "block" : "none";
}

function renderAll() {
  renderCalendar();
  renderUsers();
  renderAdminPanel();
}

renderAll();