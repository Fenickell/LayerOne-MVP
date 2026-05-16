const STORAGE_KEY = "layerone-mvp-filaments";
const THEME_KEY = "layerone-mvp-theme";
const SUPABASE_TABLE = "layerone_filaments";
const CONFIG_PLACEHOLDER = "COLE_SUA_URL_AQUI";

const demoFilaments = [
  {
    id: crypto.randomUUID(),
    brand: "Bambu Lab",
    supplier: "Loja oficial",
    type: "PLA Matte",
    colorName: "Preto",
    colorHex: "#202124",
    initialWeight: 1000,
    currentWeight: 340,
    rollCost: 105,
    avgCostPerGram: 0.105,
    stockValue: 35.7,
    minAlert: 220
  },
  {
    id: crypto.randomUUID(),
    brand: "Voolt3D",
    supplier: "Mercado Livre",
    type: "PLA",
    colorName: "Vermelho",
    colorHex: "#d92d20",
    initialWeight: 1000,
    currentWeight: 780,
    rollCost: 89,
    avgCostPerGram: 0.089,
    stockValue: 69.42,
    minAlert: 200
  },
  {
    id: crypto.randomUUID(),
    brand: "Bambu Lab",
    supplier: "Shopee",
    type: "PLA Silk",
    colorName: "Dourado",
    colorHex: "#c9972b",
    initialWeight: 1000,
    currentWeight: 160,
    rollCost: 125,
    avgCostPerGram: 0.125,
    stockValue: 20,
    minAlert: 250
  },
  {
    id: crypto.randomUUID(),
    brand: "3D Lab",
    supplier: "Loja local",
    type: "PETG",
    colorName: "Azul",
    colorHex: "#2563eb",
    initialWeight: 1000,
    currentWeight: 520,
    rollCost: 98,
    avgCostPerGram: 0.098,
    stockValue: 50.96,
    minAlert: 200
  }
];

let filaments = loadFilaments();
let currentTheme = loadTheme();
let supabaseClient = null;
let isCloudReady = false;
let isHydratingCloud = false;

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const grams = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1
});

function loadFilaments() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return demoFilaments;

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length ? normalizeFilaments(parsed) : demoFilaments;
  } catch {
    return demoFilaments;
  }
}

function normalizeFilaments(items) {
  return items.map((item) => {
    const costPerGram = normalizeCostPerGram(item);
    const currentWeight = Number(item.currentWeight || 0);
    const stockValue = Number.isFinite(Number(item.stockValue)) && Number(item.stockValue) > 0
      ? Number(item.stockValue)
      : currentWeight * costPerGram;

    return {
      ...item,
      supplier: item.supplier || "Compra anterior",
      avgCostPerGram: currentWeight > 0 ? stockValue / currentWeight : costPerGram,
      stockValue,
      rollCost: Number((costPerGram * 1000).toFixed(2))
    };
  });
}

function saveFilaments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filaments));
  syncFilamentsToCloud();
}

function isConfigReady(config) {
  return Boolean(
    config?.supabaseUrl &&
    config?.supabaseKey &&
    config.supabaseUrl !== CONFIG_PLACEHOLDER &&
    config.supabaseKey !== "COLE_SUA_ANON_KEY_AQUI"
  );
}

async function loadAppConfig() {
  const localConfig = window.APP_CONFIG || {};
  if (isConfigReady(localConfig)) return localConfig;

  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) throw new Error("Config remota indisponivel");
    const remoteConfig = await response.json();
    if (isConfigReady(remoteConfig)) return remoteConfig;
  } catch {
    return localConfig;
  }

  return localConfig;
}

function toDatabaseRow(item) {
  return {
    id: item.id,
    brand: item.brand,
    supplier: item.supplier || "",
    type: item.type,
    color_name: item.colorName,
    color_hex: item.colorHex,
    initial_weight: Number(item.initialWeight || 0),
    current_weight: Number(item.currentWeight || 0),
    roll_cost: Number(item.rollCost || 0),
    avg_cost_per_gram: getCostPerGram(item),
    stock_value: Number(item.stockValue || 0),
    min_alert: Number(item.minAlert || 0),
    updated_at: new Date().toISOString()
  };
}

function fromDatabaseRow(row) {
  return {
    id: row.id,
    brand: row.brand,
    supplier: row.supplier,
    type: row.type,
    colorName: row.color_name,
    colorHex: row.color_hex,
    initialWeight: Number(row.initial_weight || 0),
    currentWeight: Number(row.current_weight || 0),
    rollCost: Number(row.roll_cost || 0),
    avgCostPerGram: Number(row.avg_cost_per_gram || 0),
    stockValue: Number(row.stock_value || 0),
    minAlert: Number(row.min_alert || 0)
  };
}

async function initializeCloudStorage() {
  const config = await loadAppConfig();
  if (!isConfigReady(config) || !window.supabase?.createClient) return;

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
  isCloudReady = true;

  try {
    isHydratingCloud = true;
    const { data, error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (Array.isArray(data) && data.length) {
      filaments = normalizeFilaments(data.map(fromDatabaseRow));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filaments));
      renderAll();
    } else {
      await syncFilamentsToCloud();
    }
  } catch (error) {
    console.warn("Supabase indisponivel. Mantendo dados locais.", error);
  } finally {
    isHydratingCloud = false;
  }
}

async function syncFilamentsToCloud() {
  if (!isCloudReady || isHydratingCloud || !supabaseClient) return;

  try {
    const rows = filaments.map(toDatabaseRow);
    if (!rows.length) return;

    const { error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .upsert(rows, { onConflict: "id" });

    if (error) throw error;
  } catch (error) {
    console.warn("Nao foi possivel sincronizar com Supabase.", error);
  }
}

async function deleteFilamentFromCloud(filamentId) {
  if (!isCloudReady || !supabaseClient || !filamentId) return;

  try {
    const { error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .delete()
      .eq("id", filamentId);

    if (error) throw error;
  } catch (error) {
    console.warn("Nao foi possivel excluir no Supabase.", error);
  }
}

async function deleteFilamentsFromCloud(filamentIds) {
  if (!isCloudReady || !supabaseClient || !filamentIds.length) return;

  try {
    const { error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .delete()
      .in("id", filamentIds);

    if (error) throw error;
  } catch (error) {
    console.warn("Nao foi possivel limpar os filamentos no Supabase.", error);
  }
}

function loadTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  currentTheme = theme;
  document.body.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);

  const button = document.querySelector("#theme-toggle");
  if (button) {
    button.textContent = theme === "dark" ? "Modo claro" : "Modo escuro";
    button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }
}

function normalizeCostPerGram(filament) {
  const rollCost = Number(filament.rollCost || 0);
  const initialWeight = Number(filament.initialWeight || 0);
  const savedAverage = Number(filament.avgCostPerGram || 0);
  const costFromRoll = initialWeight > 0 ? rollCost / initialWeight : 0;
  const correctedRollCost = rollCost > 500 && initialWeight >= 1000 ? rollCost / 10 : rollCost;
  const correctedCostFromRoll = initialWeight > 0 ? correctedRollCost / initialWeight : 0;

  if (savedAverage > 0 && savedAverage <= 0.5) return savedAverage;
  if (costFromRoll > 0 && costFromRoll <= 0.5) return costFromRoll;
  if (correctedCostFromRoll > 0 && correctedCostFromRoll <= 0.5) return correctedCostFromRoll;
  if (savedAverage > 0 && savedAverage <= 5 && rollCost > 0 && initialWeight >= 1000) return correctedCostFromRoll || costFromRoll;

  return costFromRoll || savedAverage || 0;
}

function getCostPerGram(filament) {
  const currentWeight = Number(filament.currentWeight || 0);
  const stockValue = Number(filament.stockValue || 0);

  if (currentWeight > 0 && stockValue > 0) {
    return stockValue / currentWeight;
  }

  return normalizeCostPerGram(filament);
}

function getRemainingPercent(filament) {
  return Math.max(0, Math.min(100, (Number(filament.currentWeight) / Number(filament.initialWeight || 1)) * 100));
}

function formatStock(weightInGrams) {
  const value = Number(weightInGrams || 0);
  if (value >= 1000) {
    return `${grams.format(value / 1000)} kg`;
  }

  return `${grams.format(value)}g`;
}

function getStatus(filament) {
  const percent = getRemainingPercent(filament);
  if (Number(filament.currentWeight) <= Number(filament.minAlert) || percent <= 20) {
    return { label: "Crítico", className: "critical" };
  }
  if (percent <= 50) {
    return { label: "Atenção", className: "warn" };
  }
  return { label: "OK", className: "ok" };
}

function getFilamentLabel(item) {
  return `${item.type} ${item.colorName} - ${item.brand} (${item.supplier || "sem fornecedor"})`;
}

function setActiveTab(tabName) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const panel = document.querySelector(`#${tabName}`);
  if (!tab || !panel) return;

  document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  panel.classList.add("active");
}

function changeFilamentStock(filamentId, amount, mode, entryCost = 0) {
  const filament = filaments.find((item) => item.id === filamentId);
  if (!filament) return;

  if (mode === "add") {
    const currentWeight = Number(filament.currentWeight);
    const incomingWeight = Number(amount);
    const currentCostPerGram = getCostPerGram(filament);
    const incomingCost = Number(entryCost) > 0 ? Number(entryCost) : incomingWeight * currentCostPerGram;
    const newWeight = currentWeight + incomingWeight;
    const currentValue = Number(filament.stockValue || currentWeight * currentCostPerGram);
    const newValue = currentValue + incomingCost;

    filament.currentWeight = newWeight;
    filament.initialWeight = Math.max(Number(filament.initialWeight), newWeight);
    filament.stockValue = Number(newValue.toFixed(4));
    filament.avgCostPerGram = newWeight > 0 ? newValue / newWeight : currentCostPerGram;
    filament.rollCost = Number((filament.avgCostPerGram * 1000).toFixed(2));
  }

  if (mode === "use") {
    const currentWeight = Number(filament.currentWeight);
    const currentCostPerGram = getCostPerGram(filament);
    const usedWeight = Math.min(currentWeight, Number(amount));
    const newWeight = Math.max(0, currentWeight - usedWeight);

    filament.currentWeight = newWeight;
    filament.stockValue = Number(Math.max(0, Number(filament.stockValue || currentWeight * currentCostPerGram) - usedWeight * currentCostPerGram).toFixed(4));
    filament.avgCostPerGram = newWeight > 0 ? filament.stockValue / newWeight : currentCostPerGram;
  }

  renderAll();
}

function removeFilament(filamentId) {
  filaments = filaments.filter((item) => item.id !== filamentId);
  deleteFilamentFromCloud(filamentId);
  renderAll();
}

function closeSwipeRows(exceptRow = null) {
  document.querySelectorAll(".swipe-row.revealed").forEach((row) => {
    if (row !== exceptRow) {
      row.classList.remove("revealed");
      row.style.removeProperty("--swipe-x");
    }
  });
}

function renderDashboard() {
  const totalGrams = filaments.reduce((sum, item) => sum + Number(item.currentWeight), 0);
  const totalValue = filaments.reduce((sum, item) => sum + Number(item.currentWeight) * getCostPerGram(item), 0);
  const avgCost = totalGrams > 0 ? totalValue / totalGrams : 0;
  const critical = filaments.filter((item) => getStatus(item).className === "critical").length;

  document.querySelector("#metric-stock").textContent = `${grams.format(totalGrams / 1000)} kg`;
  document.querySelector("#metric-value").textContent = currency.format(totalValue);
  document.querySelector("#metric-critical").textContent = critical;
  document.querySelector("#metric-avg").textContent = currency.format(avgCost);

  const alerts = [...filaments]
    .sort((a, b) => getRemainingPercent(a) - getRemainingPercent(b))
    .map((item) => {
      const status = getStatus(item);
      return `
        <div class="swipe-row" data-swipe-id="${item.id}">
          <button class="swipe-delete" data-alert-delete="${item.id}" type="button">Excluir</button>
          <div class="alert-item swipe-content">
            <div>
              <strong><span class="swatch" style="background:${item.colorHex}"></span>${item.type} ${item.colorName}</strong>
              <p>${item.brand} - ${item.supplier || "Fornecedor não informado"} - ${formatStock(item.currentWeight)} restantes</p>
            </div>
            <span class="status ${status.className}">${status.label}</span>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelector("#stock-alerts").innerHTML = alerts || "<p>Nenhum filamento cadastrado.</p>";
}

function renderSpools() {
  const html = filaments
    .map((item) => {
      const percent = getRemainingPercent(item);
      const usedRatio = Math.max(0, Math.min(1, (100 - percent) / 100));
      const status = getStatus(item);
      const currentValue = Number(item.currentWeight) * getCostPerGram(item);

      return `
        <article class="spool-card">
          <header>
            <div>
              <h3>${item.type} ${item.colorName}</h3>
              <p>${item.brand} - ${item.supplier || "Fornecedor não informado"}</p>
            </div>
            <span class="status ${status.className}">${status.label}</span>
          </header>
          <div class="stock-meter vertical-meter" style="--filament-color:${item.colorHex}; --stock-percent:${percent.toFixed(0)}%; --used-ratio:${usedRatio.toFixed(2)}" aria-label="${percent.toFixed(0)}% restante">
            <div class="vertical-spool">
              <span class="spool-side left"></span>
              <span class="spool-side right"></span>
              <span class="vertical-fill"></span>
              <span class="vertical-lines"></span>
              <span class="vertical-empty"></span>
              <span class="stock-meter-label"><span class="percent-line">${percent.toFixed(0)}<small>%</small></span><em>saldo do filamento</em></span>
            </div>
          </div>
          <div class="spool-stats">
            <div><span>Saldo atual</span><strong>${formatStock(item.currentWeight)}</strong></div>
            <div><span>Fornecedor</span><strong>${item.supplier || "Não informado"}</strong></div>
            <div><span>Custo médio/g</span><strong>${currency.format(getCostPerGram(item))}</strong></div>
            <div><span>Valor restante</span><strong>${currency.format(currentValue)}</strong></div>
          </div>
          <div class="quick-card-actions" data-card-actions="${item.id}">
            <div class="quick-inputs">
              <input aria-label="Quantidade para movimentar" min="0" step="0.1" type="number" value="50">
              <input aria-label="Custo da entrada" min="0" step="0.01" type="number" placeholder="R$ entrada">
            </div>
            <div class="quick-buttons">
              <button class="secondary-button" data-stock-action="use" type="button">Usar</button>
              <button class="primary-button" data-stock-action="add" type="button">Entrada</button>
              <button class="danger-button" data-stock-action="remove" type="button">Acabou</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelector("#spool-grid").innerHTML = html || "<p>Nenhum filamento cadastrado.</p>";
}

function renderTable() {
  const rows = filaments
    .map((item) => {
      const status = getStatus(item);
      return `
        <tr>
          <td><span class="swatch" style="background:${item.colorHex}"></span><strong>${item.type} ${item.colorName}</strong><br><small>${item.brand}</small></td>
          <td>${item.supplier || "Não informado"}</td>
          <td>${formatStock(item.currentWeight)} / ${formatStock(item.initialWeight)}</td>
          <td>${currency.format(getCostPerGram(item))}/g<br><small>${currency.format(getCostPerGram(item) * 1000)}/kg</small></td>
          <td><span class="status ${status.className}">${status.label}</span></td>
          <td><button class="danger-button" type="button" data-remove="${item.id}">Remover</button></td>
        </tr>
      `;
    })
    .join("");

  document.querySelector("#filament-table").innerHTML = rows || "<tr><td colspan='6'>Nenhum filamento cadastrado.</td></tr>";
}

function renderFilamentOptions() {
  const selected = document.querySelector("#filament-select").value;
  document.querySelector("#filament-select").innerHTML = filaments
    .map((item) => `<option value="${item.id}">${getFilamentLabel(item)}</option>`)
    .join("");

  if (filaments.some((item) => item.id === selected)) {
    document.querySelector("#filament-select").value = selected;
  }

  const movementSelect = document.querySelector("#movement-filament");
  const movementSelected = movementSelect.value;
  movementSelect.innerHTML = filaments
    .map((item) => `<option value="${item.id}">${getFilamentLabel(item)}</option>`)
    .join("");

  if (filaments.some((item) => item.id === movementSelected)) {
    movementSelect.value = movementSelected;
  }
}

function readPricingForm() {
  const form = new FormData(document.querySelector("#pricing-form"));
  const data = Object.fromEntries(form.entries());

  for (const key of Object.keys(data)) {
    if (key !== "productName" && key !== "filamentId") {
      data[key] = Number(data[key] || 0);
    }
  }

  return data;
}

function calculatePricing() {
  const data = readPricingForm();
  const filament = filaments.find((item) => item.id === data.filamentId) || filaments[0];
  const costPerGram = filament ? getCostPerGram(filament) : 0;
  const materialCost = filament ? data.grams * costPerGram : 0;
  const energyCost = data.hours * data.printerKw * data.kwhCost;
  const depreciationPerHour = data.machineCost / Math.max(1, data.machineLife);
  const depreciationCost = data.hours * depreciationPerHour;
  const baseCost = materialCost + energyCost + depreciationCost + data.packaging + data.labor;
  const failureCost = baseCost * (data.failureRate / 100);
  const totalCost = baseCost + failureCost;
  const taxMultiplier = 1 + data.taxRate / 100;
  const priceB2c = totalCost * (1 + data.marginB2c / 100) * taxMultiplier + data.perceivedValue;
  const priceB2b = totalCost * (1 + data.marginB2b / 100) * taxMultiplier;

  document.querySelector("#cost-total").textContent = currency.format(totalCost);
  document.querySelector("#price-b2c").textContent = currency.format(priceB2c);
  document.querySelector("#price-b2b").textContent = currency.format(priceB2b);

  document.querySelector("#breakdown").innerHTML = `
    <div><span>Material</span><strong>${currency.format(materialCost)}</strong></div>
    <div><span>Energia</span><strong>${currency.format(energyCost)}</strong></div>
    <div><span>Depreciação A1</span><strong>${currency.format(depreciationCost)}</strong></div>
    <div><span>Embalagem + mão de obra</span><strong>${currency.format(data.packaging + data.labor)}</strong></div>
    <div><span>Falhas/perdas</span><strong>${currency.format(failureCost)}</strong></div>
  `;

  document.querySelector("#cost-audit").innerHTML = filament
    ? `
      <div><span>Filamento usado</span><strong>${filament.type} ${filament.colorName}</strong></div>
      <div><span>Custo médio do filamento</span><strong>${currency.format(costPerGram)}/g</strong></div>
      <div><span>Custo médio por kg</span><strong>${currency.format(costPerGram * 1000)}/kg</strong></div>
      <div><span>Conta do material</span><strong>${grams.format(data.grams)}g × ${currency.format(costPerGram)}/g</strong></div>
    `
    : "";

  document.querySelector("#cost-total").closest("article").querySelector("span").textContent = "Custo total de produção";
  document.querySelector("#price-b2c").closest("article").querySelector("span").textContent = `Preço B2C com ${data.marginB2c}%`;
  document.querySelector("#price-b2b").closest("article").querySelector("span").textContent = `Preço B2B com ${data.marginB2b}%`;
}

function renderAll() {
  saveFilaments();
  renderDashboard();
  renderSpools();
  renderTable();
  renderFilamentOptions();
  calculatePricing();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
  });
});

document.querySelectorAll("[data-open-tab]").forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.openTab));
});

document.querySelector("#filament-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());

  filaments.push({
    id: crypto.randomUUID(),
    brand: data.brand.trim(),
    supplier: data.supplier.trim(),
    type: data.type.trim(),
    colorName: data.colorName.trim(),
    colorHex: data.colorHex,
    initialWeight: Number(data.initialWeight),
    currentWeight: Number(data.currentWeight),
    rollCost: Number(data.rollCost),
    avgCostPerGram: Number(data.rollCost) / Number(data.initialWeight || 1),
    stockValue: Number(data.currentWeight) * (Number(data.rollCost) / Number(data.initialWeight || 1)),
    minAlert: Number(data.minAlert)
  });

  event.currentTarget.reset();
  renderAll();
});

document.querySelector("#filament-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;

  removeFilament(button.dataset.remove);
});

document.querySelector("#stock-alerts").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-alert-delete]");
  if (deleteButton) {
    removeFilament(deleteButton.dataset.alertDelete);
    return;
  }

  if (!event.target.closest(".swipe-row.revealed")) {
    closeSwipeRows();
  }
});

document.querySelector("#stock-alerts").addEventListener("pointerdown", (event) => {
  const row = event.target.closest("[data-swipe-id]");
  if (!row || event.target.closest("button")) return;

  closeSwipeRows(row);
  row.dataset.startX = event.clientX;
  row.dataset.dragging = "true";
  row.classList.add("swiping");
  row.setPointerCapture?.(event.pointerId);
});

document.querySelector("#stock-alerts").addEventListener("pointermove", (event) => {
  const row = event.target.closest("[data-swipe-id]");
  if (!row || row.dataset.dragging !== "true") return;

  const startX = Number(row.dataset.startX || event.clientX);
  const delta = Math.min(0, Math.max(-132, (event.clientX - startX) * 1.4));
  row.style.setProperty("--swipe-x", `${delta}px`);
});

document.querySelector("#stock-alerts").addEventListener("pointerup", (event) => {
  const row = event.target.closest("[data-swipe-id]");
  if (!row || row.dataset.dragging !== "true") return;

  const startX = Number(row.dataset.startX || event.clientX);
  const delta = event.clientX - startX;
  row.dataset.dragging = "false";
  const shouldReveal = delta < -40;
  row.classList.remove("swiping");
  row.classList.toggle("revealed", shouldReveal);
  row.style.removeProperty("--swipe-x");

  if (shouldReveal) {
    window.setTimeout(() => row.classList.remove("revealed"), 1400);
  }
});

document.querySelector("#stock-alerts").addEventListener("pointerleave", (event) => {
  const row = event.target.closest("[data-swipe-id]");
  if (!row || row.dataset.dragging !== "true") return;

  row.dataset.dragging = "false";
  row.classList.remove("swiping");
  row.classList.remove("revealed");
  row.style.removeProperty("--swipe-x");
});

document.querySelector("#movement-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const action = submitter?.value;
  const amount = Number(data.amount || 0);
  const entryCost = Number(data.entryCost || 0);

  if (!data.filamentId) return;

  if (action === "remove") {
    removeFilament(data.filamentId);
    return;
  }

  if (amount <= 0) return;
  changeFilamentStock(data.filamentId, amount, action, entryCost);
});

document.querySelector("#spool-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-stock-action]");
  if (!button) return;

  const actionWrap = button.closest("[data-card-actions]");
  const filamentId = actionWrap?.dataset.cardActions;
  const inputs = actionWrap?.querySelectorAll("input");
  const amount = Number(inputs?.[0]?.value || 0);
  const entryCost = Number(inputs?.[1]?.value || 0);
  const action = button.dataset.stockAction;

  if (action === "remove") {
    removeFilament(filamentId);
    return;
  }

  if (!filamentId || amount <= 0) return;
  changeFilamentStock(filamentId, amount, action, entryCost);
});

document.querySelector("#pricing-form").addEventListener("input", calculatePricing);

document.querySelector("#consume-stock").addEventListener("click", () => {
  const data = readPricingForm();
  const filament = filaments.find((item) => item.id === data.filamentId);
  if (!filament) return;

  changeFilamentStock(filament.id, Number(data.grams), "use");
});

document.querySelector("#reset-demo").addEventListener("click", () => {
  const previousIds = filaments.map((item) => item.id);
  filaments = demoFilaments.map((item) => ({ ...item, id: crypto.randomUUID() }));
  deleteFilamentsFromCloud(previousIds);
  renderAll();
});

document.querySelector("#theme-toggle").addEventListener("click", () => {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
});

applyTheme(currentTheme);
renderAll();
initializeCloudStorage();
