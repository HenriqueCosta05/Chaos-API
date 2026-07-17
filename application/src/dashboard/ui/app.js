const STORAGE_KEY = "chaos-api:control-url";
const POLL_STORAGE_KEY = "chaos-api:poll-interval";

const controlUrlInput = document.getElementById("control-url");
const pollIntervalInput = document.getElementById("poll-interval");
const connectButton = document.getElementById("connect");
const listEl = document.getElementById("scenario-list");
const bannerEl = document.getElementById("status-banner");
const errorEl = document.getElementById("error");
const addForm = document.getElementById("add-form");
const activityListEl = document.getElementById("activity-list");
const presetCategoriesEl = document.getElementById("preset-categories");
const presetListEl = document.getElementById("preset-list");
const exportButton = document.getElementById("export-config");
const importButton = document.getElementById("import-config");
const importFileInput = document.getElementById("import-file");
const runnerForm = document.getElementById("runner-form");
const runnerResponseEl = document.getElementById("runner-response");

const PRESET_CATEGORIES = [
  { value: "", label: "todas" },
  { value: "seguranca", label: "segurança" },
  { value: "dependencias-externas", label: "deps. externas" },
  { value: "configuracao", label: "configuração" },
  { value: "resource-exhaustion", label: "resource exhaustion" },
  { value: "filesystem", label: "filesystem" },
];
let activePresetCategory = "";

controlUrlInput.value = localStorage.getItem(STORAGE_KEY) || controlUrlInput.value;
pollIntervalInput.value = localStorage.getItem(POLL_STORAGE_KEY) || pollIntervalInput.value;

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

function renderPresetCategories() {
  presetCategoriesEl.innerHTML = "";
  for (const category of PRESET_CATEGORIES) {
    const button = document.createElement("button");
    button.textContent = category.label;
    button.className = category.value === activePresetCategory ? "active" : "";
    button.addEventListener("click", () => {
      activePresetCategory = category.value;
      refreshPresets();
    });
    presetCategoriesEl.appendChild(button);
  }
}

function renderPresets(presets) {
  if (!presets.length) {
    presetListEl.innerHTML = '<p style="color: var(--text-muted)">Nenhum preset nessa categoria.</p>';
    return;
  }

  presetListEl.innerHTML = "";
  for (const preset of presets) {
    const card = document.createElement("div");
    card.className = "preset-card";
    card.innerHTML = `
      <div class="meta">
        <div class="name">${preset.name}</div>
        <div class="description">${preset.description}</div>
      </div>
      <button data-name="${preset.name}" data-action="apply-preset">Aplicar</button>
    `;
    presetListEl.appendChild(card);
  }

  presetListEl.querySelectorAll('[data-action="apply-preset"]').forEach((el) => {
    el.addEventListener("click", async (e) => {
      const name = e.target.getAttribute("data-name");
      await withErrorHandling(() => api(`/api/presets/${name}/apply`, {
        method: "POST",
        body: JSON.stringify({}),
      }));
      await refresh();
    });
  });
}

async function refreshPresets() {
  renderPresetCategories();
  const query = activePresetCategory ? `?category=${activePresetCategory}` : "";
  const presets = await withErrorHandling(() => api(`/api/presets${query}`));
  if (presets) renderPresets(presets);
}

let pollTimer;

function restartPolling() {
  clearInterval(pollTimer);
  const ms = Number(pollIntervalInput.value) || 3000;
  pollTimer = setInterval(refreshActivity, ms);
}

connectButton.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, controlUrlInput.value);
  localStorage.setItem(POLL_STORAGE_KEY, pollIntervalInput.value);
  restartPolling();
  refresh();
  refreshActivity();
  refreshPresets();
});

pollIntervalInput.addEventListener("change", () => {
  localStorage.setItem(POLL_STORAGE_KEY, pollIntervalInput.value);
  restartPolling();
});

exportButton.addEventListener("click", async () => {
  const config = await withErrorHandling(() => api("/api/config"));
  if (!config) return;

  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "chaos-api-config.json";
  link.click();
  URL.revokeObjectURL(url);
});

importButton.addEventListener("click", () => importFileInput.click());

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files[0];
  if (!file) return;

  try {
    const config = JSON.parse(await file.text());
    await withErrorHandling(() => api("/api/config", { method: "POST", body: JSON.stringify(config) }));
    await refresh();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    importFileInput.value = "";
  }
});

runnerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(runnerForm);
  const method = formData.get("method")?.toString() || "GET";
  const url = formData.get("url")?.toString().trim();
  const headersRaw = formData.get("headers")?.toString().trim();
  const bodyRaw = formData.get("body")?.toString().trim();

  runnerResponseEl.innerHTML = "";
  if (!url) return;

  let headers = {};
  if (headersRaw) {
    try {
      headers = JSON.parse(headersRaw);
    } catch {
      runnerResponseEl.innerHTML = '<div class="status error">headers: JSON inválido</div>';
      return;
    }
  }

  const hasBody = bodyRaw && !["GET", "HEAD", "DELETE"].includes(method);

  try {
    const started = performance.now();
    const res = await fetch(url, { method, headers, body: hasBody ? bodyRaw : undefined });
    const elapsedMs = Math.round(performance.now() - started);
    const text = await res.text();
    let pretty = text;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // not JSON — show as-is
    }

    const responseHeaders = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
    runnerResponseEl.innerHTML = "";
    runnerResponseEl.appendChild(
      buildRunnerResult(res.ok, `${res.status} ${res.statusText} · ${elapsedMs}ms`, responseHeaders, pretty),
    );
  } catch (err) {
    runnerResponseEl.innerHTML = "";
    runnerResponseEl.appendChild(buildRunnerResult(false, err.message, "", ""));
  }
});

function buildRunnerResult(ok, statusLine, headersText, bodyText) {
  const wrapper = document.createElement("div");

  const status = document.createElement("div");
  status.className = `status ${ok ? "ok" : "error"}`;
  status.textContent = statusLine;
  wrapper.appendChild(status);

  if (headersText) {
    const headers = document.createElement("div");
    headers.textContent = headersText;
    wrapper.appendChild(headers);
  }

  if (bodyText) {
    const body = document.createElement("div");
    body.style.marginTop = "8px";
    body.textContent = bodyText;
    wrapper.appendChild(body);
  }

  return wrapper;
}

restartPolling();

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
refreshPresets();
