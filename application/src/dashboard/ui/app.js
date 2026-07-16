const STORAGE_KEY = "chaos-api:control-url";

const controlUrlInput = document.getElementById("control-url");
const connectButton = document.getElementById("connect");
const listEl = document.getElementById("scenario-list");
const bannerEl = document.getElementById("status-banner");
const errorEl = document.getElementById("error");
const addForm = document.getElementById("add-form");
const activityListEl = document.getElementById("activity-list");

controlUrlInput.value = localStorage.getItem(STORAGE_KEY) || controlUrlInput.value;

function controlUrl() {
  return controlUrlInput.value.replace(/\/$/, "");
}

async function api(path, options) {
  const res = await fetch(`${controlUrl()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request failed: ${res.status}`);
  }
  return res.status === 204 ? undefined : res.json();
}

function scopeLabel(scenario) {
  return scenario.scope === "global" ? "global" : scenario.scope.pattern;
}

function renderScenarios(scenarios) {
  listEl.innerHTML = "";
  const activeOnes = scenarios.filter((s) => s.enabled);

  bannerEl.style.display = activeOnes.length ? "block" : "none";
  bannerEl.textContent = activeOnes.length
    ? `${activeOnes.length} cenário(s) ativo(s): ${activeOnes.map((s) => `${s.type} (${scopeLabel(s)})`).join(", ")}`
    : "";

  if (!scenarios.length) {
    listEl.innerHTML = '<p style="color: var(--text-muted)">Nenhum cenário registrado ainda.</p>';
    return;
  }

  for (const scenario of scenarios) {
    const card = document.createElement("div");
    card.className = `card ${scenario.enabled ? "on" : ""}`;
    card.innerHTML = `
      <input type="checkbox" ${scenario.enabled ? "checked" : ""} data-id="${scenario.id}" class="toggle" />
      <div class="meta">
        <div class="type">${scenario.type}</div>
        <div class="scope">${scopeLabel(scenario)} · rate ${scenario.rate}</div>
      </div>
      <button class="danger" data-id="${scenario.id}" data-action="remove">Remover</button>
    `;
    listEl.appendChild(card);
  }

  listEl.querySelectorAll(".toggle").forEach((el) => {
    el.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      await withErrorHandling(() => api(`/api/scenarios/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: e.target.checked }),
      }));
      await refresh();
    });
  });

  listEl.querySelectorAll('[data-action="remove"]').forEach((el) => {
    el.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      await withErrorHandling(() => api(`/api/scenarios/${id}`, { method: "DELETE" }));
      await refresh();
    });
  });
}

async function withErrorHandling(fn) {
  errorEl.textContent = "";
  try {
    return await fn();
  } catch (err) {
    errorEl.textContent = err.message;
    throw err;
  }
}

async function refresh() {
  const scenarios = await withErrorHandling(() => api("/api/scenarios"));
  if (scenarios) renderScenarios(scenarios);
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("pt-BR");
}

function renderActivity(events) {
  if (!events.length) {
    activityListEl.innerHTML = '<p style="color: var(--text-muted); padding: 12px">Nenhum cenário disparado ainda.</p>';
    return;
  }

  activityListEl.innerHTML = events
    .map(
      (event) => `
        <div class="activity-row">
          <span class="activity-time">${formatTime(event.timestamp)}</span>
          <span class="activity-type">${event.scenarioType}</span>
          <span class="activity-dir">${event.direction}</span>
          <span class="activity-path">${event.method} ${event.path}</span>
        </div>
      `,
    )
    .join("");
}

async function refreshActivity() {
  const events = await withErrorHandling(() => api("/api/activity?limit=50"));
  if (events) renderActivity(events);
}

connectButton.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, controlUrlInput.value);
  refresh();
  refreshActivity();
});

setInterval(refreshActivity, 3000);

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(addForm);
  const pattern = formData.get("pattern")?.toString().trim();
  const optionsRaw = formData.get("options")?.toString().trim();

  let options = {};
  if (optionsRaw) {
    try {
      options = JSON.parse(optionsRaw);
    } catch {
      errorEl.textContent = "options: JSON inválido";
      return;
    }
  }

  await withErrorHandling(() => api("/api/scenarios", {
    method: "POST",
    body: JSON.stringify({
      type: formData.get("type"),
      rate: Number(formData.get("rate")),
      scope: pattern ? { pattern } : "global",
      options,
    }),
  }));

  addForm.reset();
  await refresh();
});

refresh();
refreshActivity();
