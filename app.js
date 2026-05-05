const calendarGrid = document.getElementById("calendarGrid");
const monthTitle = document.getElementById("monthTitle");
const userList = document.getElementById("userList");

let data = JSON.parse(localStorage.getItem("guardias")) || {};

const year = 2026;
const month = 5; // junio (0-index)

function getDaysInMonth() {
  return new Date(year, month + 1, 0).getDate();
}

function getDayType(day) {
  const date = new Date(year, month, day);
  const d = date.getDay();

  if (d === 0) return "domingo";
  if (d === 6) return "sabado";
  if (d === 5) return "viernes";
  if (d === 1) return "lunes";
  return "normal";
}

function getPoints(type) {
  return {
    domingo: 3,
    sabado: 2,
    viernes: 1.5,
    lunes: 1,
    normal: 0.5
  }[type];
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  const days = getDaysInMonth();

  for (let i = 1; i <= days; i++) {
    const dayDiv = document.createElement("div");
    dayDiv.className = "day";

    const type = getDayType(i);

    dayDiv.innerHTML = `<div class="day-number">${i}</div>`;

    const shifts = data[i] || [];

    let hasConflict = shifts.length > 3;

    shifts.forEach(s => {
      const div = document.createElement("div");
      div.className = "shift suggested";

      if (hasConflict) div.className = "shift conflict";

      div.innerText = `${s.name} (${s.level})`;
      dayDiv.appendChild(div);
    });

    calendarGrid.appendChild(dayDiv);
  }

  monthTitle.innerText = "Junio 2026";
}

function submitProposal() {
  const name = document.getElementById("name").value;
  const level = document.getElementById("level").value;
  const num = parseInt(document.getElementById("numShifts").value);
  const days = document.getElementById("days").value.split(",").map(d => parseInt(d.trim()));

  if (days.length !== num) {
    alert("Debes seleccionar exactamente " + num + " días");
    return;
  }

  // evitar solo premium
  let premiumCount = 0;
  days.forEach(d => {
    const type = getDayType(d);
    if (type === "domingo" || type === "sabado") premiumCount++;
  });

  if (premiumCount === days.length) {
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

  localStorage.setItem("guardias", JSON.stringify(data));
  renderCalendar();
  renderUsers();
}

function renderUsers() {
  userList.innerHTML = "";
  const all = [];

  Object.values(data).forEach(day => {
    day.forEach(u => all.push(u.name + " (" + u.level + ")"));
  });

  [...new Set(all)].forEach(u => {
    const div = document.createElement("div");
    div.innerText = u;
    userList.appendChild(div);
  });
}

renderCalendar();
renderUsers();