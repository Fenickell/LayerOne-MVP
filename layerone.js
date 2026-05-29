const STORAGE_KEY = "layerone-mvp-filaments";
const THEME_KEY = "layerone-mvp-theme";
const SUPABASE_TABLE = "layerone_filaments";
const CONFIG_PLACEHOLDER = "COLE_SUA_URL_AQUI";
const MARKETPLACE_PRESETS = window.LayerOnePricingEngine?.MARKETPLACE_PRESETS || {};

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
    button.textContent = theme === "dark" ? "Claro" : "Escuro";
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
  const emptyOption = "<option value=\"\" disabled selected>Cadastre um filamento primeiro</option>";
  const optionHtml = filaments.length
    ? filaments.map((item) => `<option value="${item.id}">${getFilamentLabel(item)}</option>`).join("")
    : emptyOption;

  document.querySelector("#filament-select").innerHTML = optionHtml;

  if (filaments.some((item) => item.id === selected)) {
    document.querySelector("#filament-select").value = selected;
  }

  const movementSelect = document.querySelector("#movement-filament");
  const movementSelected = movementSelect.value;
  movementSelect.innerHTML = optionHtml;

  if (filaments.some((item) => item.id === movementSelected)) {
    movementSelect.value = movementSelected;
  }

  const smartSelect = document.querySelector("#smart-filament-select");
  if (smartSelect) {
    const smartSelected = smartSelect.value;
    smartSelect.innerHTML = optionHtml;

    if (filaments.some((item) => item.id === smartSelected)) {
      smartSelect.value = smartSelected;
    }
  }
}

function renderMarketplaceOptions() {
  const select = document.querySelector("#smart-marketplace");
  if (!select) return;

  const selected = select.value || "shopee";
  select.innerHTML = Object.values(MARKETPLACE_PRESETS)
    .map((marketplace) => `<option value="${marketplace.id}">${marketplace.name}</option>`)
    .join("");

  if (MARKETPLACE_PRESETS[selected]) {
    select.value = selected;
  }
}

function normalizeVisibleText() {
  document.querySelector('[data-tab="dashboard"]') && (document.querySelector('[data-tab="dashboard"]').textContent = "Início");
  document.querySelector('[data-tab="calculadora"]') && (document.querySelector('[data-tab="calculadora"]').textContent = "Cálculo simples");
  document.querySelector('[data-tab="inteligente"]') && (document.querySelector('[data-tab="inteligente"]').textContent = "Preço inteligente");

  const replacements = [
    ["GestÃ£o", "Gestão"],
    ["PrecificaÃƒÂ§ÃƒÂ£o", "Precificação"],
    ["PrecificaÃ§Ã£o", "Precificação"],
    ["MÃƒÂ©dio", "Médio"],
    ["mÃ©dio", "médio"],
    ["mÃƒÂ©dio", "médio"],
    ["mÃ©dia", "média"],
    ["ReposiÃ§Ã£o", "Reposição"],
    ["MovimentaÃ§Ã£o", "Movimentação"],
    ["rÃ¡pida", "rápida"],
    ["impressÃ£o", "impressão"],
    ["ParÃ¢metros", "Parâmetros"],
    ["MÃ©todo", "Método"],
    ["mÃ¡quina", "máquina"],
    ["preÃ§o", "preço"],
    ["PreÃ§o", "Preço"],
    ["produÃ§Ã£o", "produção"],
    ["ProduÃ§Ã£o", "Produção"],
    ["mÃ£o", "mão"],
    ["MÃ£o", "Mão"],
    ["DepreciaÃ§Ã£o", "Depreciação"],
    ["cÃ¡lculo", "cálculo"],
    ["CÃ¡lculo", "Cálculo"],
    ["automÃ¡tico", "automático"],
    ["mÃ­nimo", "mínimo"],
    ["Ãºtil", "útil"],
    ["Ã¡", "á"],
    ["Ã©", "é"],
    ["Ã­", "í"],
    ["Ã³", "ó"],
    ["Ãº", "ú"],
    ["Ã£", "ã"],
    ["Ã§", "ç"],
    ["ÃƒÂ¡", "á"],
    ["ÃƒÂ©", "é"],
    ["ÃƒÂ­", "í"],
    ["ÃƒÂ³", "ó"],
    ["ÃƒÂº", "ú"],
    ["ÃƒÂ£", "ã"],
    ["ÃƒÂ§", "ç"],
    ["ÃƒÂ¡", "á"],
    ["ÃƒÂ­", "í"],
    ["ÃƒÂ£", "ã"]
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    let text = node.nodeValue;
    replacements.forEach(([bad, good]) => {
      text = text.replaceAll(bad, good);
    });
    node.nodeValue = text;
  });
}

function renderSmartPricingShell() {
  const form = document.querySelector("#smart-pricing-form");
  if (!form) return;

  form.innerHTML = `
    <div class="section-title">
      <h2>Precificação inteligente</h2>
      <span>Venda com margem líquida, marketplace e produção em lote</span>
    </div>

    <ol class="smart-flow" aria-label="Etapas da precificação">
      <li class="active"><strong>1</strong><span>Produto</span></li>
      <li><strong>2</strong><span>Produção</span></li>
      <li><strong>3</strong><span>Venda</span></li>
      <li><strong>4</strong><span>Resultado</span></li>
    </ol>

    <div class="smart-block">
      <div class="smart-block-title">
        <h3>O que será vendido?</h3>
        <p>Defina o produto, o filamento e se a oferta é uma peça individual ou um kit.</p>
      </div>
      <div class="form-grid">
        <label>Produto<input name="productName" value="Chaveiro articulado"></label>
        <label>Filamento<select name="filamentId" id="smart-filament-select"></select></label>
        <label>Marketplace<select name="marketplace" id="smart-marketplace"></select></label>
        <label>Margem líquida desejada (%)<input name="targetNetMarginPercent" min="0" max="80" step="0.1" type="number" value="35"></label>
      </div>
    </div>

    <div class="smart-block">
      <div class="smart-block-title">
        <h3>Como será produzido?</h3>
        <p>Use unitário para uma peça sozinha ou plate quando várias peças saem na mesma impressão.</p>
      </div>
      <div class="mode-card-grid" role="radiogroup" aria-label="Modo de produção">
        <label class="mode-card"><input checked name="mode" type="radio" value="unit"><strong>Unitário</strong><span>1 peça impressa sozinha</span></label>
        <label class="mode-card"><input name="mode" type="radio" value="plate"><strong>Plate / lote</strong><span>várias peças na mesma impressão</span></label>
      </div>
      <div class="form-grid">
        <label>Peças na impressão<input name="physicalUnits" min="1" step="1" type="number" value="1"></label>
        <label>Peças por kit/oferta<input name="unitsPerOffer" min="1" step="1" type="number" value="1"></label>
        <label>Peso total da impressão (g)<input name="totalWeightGrams" min="0" step="0.1" type="number" value="8"></label>
        <label>Falhas/perdas (%)<input name="failureRatePercent" min="0" step="0.1" type="number" value="8"></label>
      </div>
      <div class="time-grid">
        <label>Tempo total - horas<input name="totalTimeWholeHours" min="0" step="1" type="number" value="0"></label>
        <label>Tempo total - minutos<input name="totalTimeMinutes" min="0" max="59" step="1" type="number" value="40"></label>
      </div>
    </div>

    <details class="smart-advanced">
      <summary>Custos e parâmetros avançados</summary>
      <div class="form-grid">
        <label>Embalagem por oferta (R$)<input name="packagingCostPerOffer" min="0" step="0.01" type="number" value="1.20"></label>
        <label>Mão de obra por oferta (R$)<input name="laborCostPerOffer" min="0" step="0.01" type="number" value="1.00"></label>
        <label>Extras por oferta (R$)<input name="extraCostPerOffer" min="0" step="0.01" type="number" value="0"></label>
        <label>Custos extras do lote (R$)<input name="batchExtraCost" min="0" step="0.01" type="number" value="0"></label>
        <label>kWh local (R$)<input name="kwhCost" min="0" step="0.01" type="number" value="0.95"></label>
        <label>Consumo médio (kW)<input name="printerKw" min="0" step="0.01" type="number" value="0.12"></label>
        <label>Valor Bambulab A1 (R$)<input name="machineCost" min="0" step="0.01" type="number" value="2500"></label>
        <label>Vida útil estimada (h)<input name="machineLifeHours" min="1" step="1" type="number" value="3000"></label>
      </div>
    </details>
  `;
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

function readSmartPricingForm() {
  const form = document.querySelector("#smart-pricing-form");
  if (!form) return null;

  const data = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(data)) {
    if (!["productName", "filamentId", "marketplace", "mode"].includes(key)) {
      data[key] = Number(data[key] || 0);
    }
  }

  return data;
}

function calculateSmartPricing() {
  const engine = window.LayerOnePricingEngine;
  const data = readSmartPricingForm();
  if (!engine || !data) return;

  const filament = filaments.find((item) => item.id === data.filamentId) || filaments[0];
  const marketplace = MARKETPLACE_PRESETS[data.marketplace] || MARKETPLACE_PRESETS.lojaPropria;
  if (!filament) {
    document.querySelector("#smart-suggested-price").textContent = "R$ 0,00";
    document.querySelector("#smart-net-profit").textContent = "R$ 0,00";
    document.querySelector("#smart-break-even").textContent = "R$ 0,00";
    document.querySelector("#smart-summary-label").textContent = "Cadastre um filamento para calcular";
    document.querySelector("#smart-warning").innerHTML = "O primeiro passo é cadastrar pelo menos um filamento. Depois disso, a precificação consegue puxar o custo médio por grama automaticamente.";
    document.querySelector("#smart-breakdown").innerHTML = "";
    document.querySelector("#smart-audit").innerHTML = "";
    normalizeVisibleText();
    return;
  }
  const costPerGram = filament ? getCostPerGram(filament) : 0;
  const result = engine.calculateAdvancedPricing({
    production: {
      mode: data.mode,
      physicalUnits: data.mode === "plate" ? data.physicalUnits : 1,
      unitsPerOffer: data.unitsPerOffer,
      totalWeightGrams: data.totalWeightGrams,
      totalTimeWholeHours: data.totalTimeWholeHours,
      totalTimeMinutes: data.totalTimeMinutes,
      filamentCostPerGram: costPerGram,
      kwhCost: data.kwhCost,
      printerKw: data.printerKw,
      machineCost: data.machineCost,
      machineLifeHours: data.machineLifeHours,
      failureRatePercent: data.failureRatePercent,
      packagingCostPerOffer: data.packagingCostPerOffer,
      laborCostPerOffer: data.laborCostPerOffer,
      extraCostPerOffer: data.extraCostPerOffer,
      batchExtraCost: data.batchExtraCost
    },
    marketplace,
    targetNetMarginPercent: data.targetNetMarginPercent,
    taxPercent: 0
  });

  const suggested = result.suggested;
  const breakEven = result.breakEven;
  document.querySelector("#smart-suggested-price").textContent = suggested ? currency.format(suggested.salePrice) : "InviÃ¡vel";
  document.querySelector("#smart-net-profit").textContent = suggested ? currency.format(suggested.netProfit) : currency.format(0);
  document.querySelector("#smart-break-even").textContent = breakEven ? currency.format(breakEven.salePrice) : "InviÃ¡vel";
  document.querySelector("#smart-summary-label").textContent = `${marketplace.name} com margem lÃ­quida de ${data.targetNetMarginPercent}%`;

  const warning = document.querySelector("#smart-warning");
  const commercialOffers = result.production.commercialOffers;
  const hasKit = Number(data.unitsPerOffer) > 1;
  warning.innerHTML = "";
  if (data.mode === "unit" && Number(data.physicalUnits) > 1) {
    warning.innerHTML = "Modo unitÃ¡rio usa 1 peÃ§a por cÃ¡lculo. Para dividir custo entre vÃ¡rias peÃ§as, selecione Plate / lote.";
  } else if (hasKit) {
    warning.innerHTML = `Kit detectado: ${data.unitsPerOffer} peÃ§as fÃ­sicas formam 1 oferta vendida. A taxa fixa do marketplace entra por oferta, nÃ£o por peÃ§a fÃ­sica.`;
  } else if (data.mode === "plate" && Number(data.physicalUnits) <= 1) {
    warning.innerHTML = "Plate com apenas 1 peÃ§a nÃ£o gera rateio. Confira se este cÃ¡lculo deveria ser unitÃ¡rio.";
  }

  document.querySelector("#smart-breakdown").innerHTML = `
    <div><span>Custo real por oferta</span><strong>${currency.format(result.production.finalCostPerOffer)}</strong></div>
    <div><span>Custo de produÃ§Ã£o por oferta</span><strong>${currency.format(result.production.productionCostPerOffer)}</strong></div>
    <div><span>Taxas do marketplace</span><strong>${suggested ? currency.format(suggested.marketplaceFee.totalFee) : currency.format(0)}</strong></div>
    <div><span>Regra aplicada</span><strong>${suggested?.marketplaceFee.ruleLabel || "Sem regra"}</strong></div>
    <div><span>Margem lÃ­quida real</span><strong>${suggested ? `${suggested.netMarginPercent.toFixed(2)}%` : "0%"}</strong></div>
  `;

  document.querySelector("#smart-audit").innerHTML = `
    <div><span>PeÃ§as fÃ­sicas</span><strong>${grams.format(result.production.physicalUnits)}</strong></div>
    <div><span>Ofertas comerciais</span><strong>${grams.format(commercialOffers)}</strong></div>
    <div><span>Peso por peÃ§a</span><strong>${grams.format(result.production.unitWeightGrams)}g</strong></div>
    <div><span>Tempo mÃ©dio por oferta</span><strong>${result.production.averageTimeHoursPerOffer.toFixed(2)}h</strong></div>
    <div><span>Material total</span><strong>${currency.format(result.production.materialCost)}</strong></div>
    <div><span>Energia + depreciaÃ§Ã£o</span><strong>${currency.format(result.production.energyCost + result.production.depreciationCost)}</strong></div>
    <div><span>Embalagem + mÃ£o de obra</span><strong>${currency.format(result.production.packagingCostPerOffer + result.production.laborCostPerOffer)}</strong></div>
  `;
  normalizeVisibleText();
}

function renderAll() {
  normalizeVisibleText();
  saveFilaments();
  renderDashboard();
  renderSpools();
  renderTable();
  renderFilamentOptions();
  renderMarketplaceOptions();
  calculatePricing();
  calculateSmartPricing();
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

document.querySelector("#smart-pricing-form")?.addEventListener("input", calculateSmartPricing);
document.querySelector("#smart-pricing-form")?.addEventListener("change", calculateSmartPricing);

document.querySelector("#consume-stock").addEventListener("click", () => {
  const data = readPricingForm();
  const filament = filaments.find((item) => item.id === data.filamentId);
  if (!filament) return;

  changeFilamentStock(filament.id, Number(data.grams), "use");
});

document.querySelector("#theme-toggle").addEventListener("click", () => {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
});

renderSmartPricingShell();
normalizeVisibleText();
applyTheme(currentTheme);
renderAll();
initializeCloudStorage();
