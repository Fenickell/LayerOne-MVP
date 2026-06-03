const STORAGE_KEY = "layerone-mvp-filaments";
const PRINTER_STORAGE_KEY = "layerone-mvp-printers";
const THEME_KEY = "layerone-mvp-theme";
const STOCK_VIEW_KEY = "layerone-mvp-stock-view";
const SUPABASE_TABLE = "layerone_filaments";
const PRINTER_TABLE = "layerone_printers";
const PROFILE_TABLE = "layerone_profiles";
const CONFIG_PLACEHOLDER = "COLE_SUA_URL_AQUI";
const TRIAL_DAYS = 7;
const MARKETPLACE_PRESETS = window.LayerOnePricingEngine?.MARKETPLACE_PRESETS || {};
const MARKETPLACE_GUIDES = {
  shopee: {
    description: "A Shopee combina comissão percentual e taxa fixa por oferta. Em produtos baratos, a taxa fixa pode representar uma parcela grande da venda.",
    notice: "As regras podem variar por perfil, campanhas, forma de pagamento e condições da conta. Confira o extrato da sua conta de vendedor antes de publicar o preço."
  },
  mercadoLivre: {
    description: "O Mercado Livre varia a tarifa conforme categoria, tipo de anúncio e preço. O preset atual é uma referência inicial para simulação.",
    notice: "Antes de vender, confira a tarifa exibida no próprio anúncio. Clássico, Premium, categoria e custos de envio podem alterar o resultado."
  },
  lojaPropria: {
    description: "Use este canal para vendas sem comissão de marketplace. Inclua manualmente gateway, frete subsidiado ou outros custos quando existirem.",
    notice: "Venda direta não significa custo zero: considere pagamento, embalagem, anúncio, entrega e impostos quando forem aplicáveis."
  },
  b2bDireto: {
    description: "Use para vendas diretas a lojistas ou distribuidores, normalmente sem taxa fixa de marketplace.",
    notice: "No B2B, valide quantidade mínima, desconto comercial, prazo de pagamento e custo logístico antes de fechar a margem."
  }
};

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

const demoPrinters = [
  {
    id: crypto.randomUUID(),
    name: "Bambu Lab A1",
    model: "A1",
    purchaseCost: 2500,
    lifeHours: 3000,
    averageKw: 0.12
  },
  {
    id: crypto.randomUUID(),
    name: "Snapmaker",
    model: "Snapmaker",
    purchaseCost: 4500,
    lifeHours: 3500,
    averageKw: 0.18
  },
  {
    id: crypto.randomUUID(),
    name: "Bambu Lab H2D",
    model: "H2D",
    purchaseCost: 14000,
    lifeHours: 5000,
    averageKw: 0.28
  }
];

let filaments = loadFilaments();
let printers = loadPrinters();
let currentTheme = loadTheme();
let stockViewMode = loadStockViewMode();
let appConfig = null;
let currentUser = null;
let currentProfile = null;
let authMode = "signin";
let supabaseClient = null;
let isCloudReady = false;
let isHydratingCloud = false;
let isUserScopedStorage = false;
let isPrinterCloudReady = true;
let selectedMarketplaceGuide = "shopee";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const grams = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1
});

const decimal = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2
});

function loadFilaments(useDemoFallback = true) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return useDemoFallback ? demoFilaments : [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? normalizeFilaments(parsed) : useDemoFallback ? demoFilaments : [];
  } catch {
    return useDemoFallback ? demoFilaments : [];
  }
}

function loadPrinters(useDemoFallback = true) {
  const stored = localStorage.getItem(PRINTER_STORAGE_KEY);
  if (!stored) return useDemoFallback ? demoPrinters : [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? normalizePrinters(parsed) : useDemoFallback ? demoPrinters : [];
  } catch {
    return useDemoFallback ? demoPrinters : [];
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

function normalizePrinters(items) {
  return items.map((item) => ({
    id: item.id || crypto.randomUUID(),
    name: String(item.name || item.model || "Impressora 3D").trim(),
    model: String(item.model || item.name || "Modelo não informado").trim(),
    purchaseCost: Number(item.purchaseCost || item.purchase_cost || 0),
    lifeHours: Math.max(1, Number(item.lifeHours || item.life_hours || 3000)),
    averageKw: Number(item.averageKw || item.average_kw || 0.12)
  }));
}

function saveFilaments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filaments));
  if (currentUser) syncFilamentsToCloud();
}

function savePrinters() {
  localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(printers));
  if (currentUser) syncPrintersToCloud();
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
    ...(isUserScopedStorage ? { user_id: currentUser?.id || null } : {}),
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

function toPrinterDatabaseRow(item) {
  return {
    id: item.id,
    user_id: currentUser?.id || null,
    name: item.name,
    model: item.model,
    purchase_cost: Number(item.purchaseCost || 0),
    life_hours: Number(item.lifeHours || 0),
    average_kw: Number(item.averageKw || 0),
    updated_at: new Date().toISOString()
  };
}

function fromPrinterDatabaseRow(row) {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    purchaseCost: Number(row.purchase_cost || 0),
    lifeHours: Number(row.life_hours || 0),
    averageKw: Number(row.average_kw || 0)
  };
}

function setAuthMessage(message, type = "") {
  const element = document.querySelector("#auth-message");
  if (!element) return;

  element.textContent = message;
  element.classList.remove("error", "success");
  if (type) element.classList.add(type);
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "signin";
  const submitButton = document.querySelector("#auth-submit");
  const passwordInput = document.querySelector("#login-form input[name='password']");
  const helpText = document.querySelector("#auth-help");

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === authMode);
  });

  if (submitButton) {
    submitButton.textContent = authMode === "signup" ? "Criar conta" : "Entrar";
  }

  if (passwordInput) {
    passwordInput.autocomplete = authMode === "signup" ? "new-password" : "current-password";
    passwordInput.placeholder = authMode === "signup" ? "Crie uma senha com 6+ caracteres" : "Sua senha";
  }

  if (helpText) {
    helpText.textContent = authMode === "signup"
      ? "Você pode testar por 7 dias. Use uma senha com pelo menos 6 caracteres."
      : "Use seu e-mail e senha cadastrados.";
  }

  setAuthMessage(
    authMode === "signup"
      ? "Preencha e-mail e senha para criar sua conta."
      : "",
    ""
  );
}

function getAuthErrorMessage(error, mode) {
  const status = Number(error?.status || error?.__isAuthError?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || error?.error_code || "").toLowerCase();

  if (code === "weak_password" || message.includes("password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "O Supabase está exigindo confirmação por e-mail. Desative essa opção no painel para cadastro direto.";
  }

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos. Se ainda não tem conta, clique em Criar conta.";
  }

  if (code === "user_already_exists" || message.includes("already registered") || message.includes("user already")) {
    return "Este e-mail já tem uma conta. Use Entrar ou recupere a senha quando esse recurso estiver disponível.";
  }

  if (code === "signup_disabled" || message.includes("signup is disabled")) {
    return "Cadastro desativado no Supabase. Ative Email em Authentication > Providers.";
  }

  if (status === 429 || message.includes("rate limit") || message.includes("too many")) {
    return "O Supabase bloqueou temporariamente novas tentativas. Aguarde alguns minutos e tente de novo.";
  }

  if (mode === "signup") {
    return "Não foi possível criar a conta. Revise e-mail, senha e configuração de cadastro no Supabase.";
  }

  return "Não foi possível entrar. Verifique seus dados e tente novamente.";
}

function showAuthScreen() {
  document.querySelector("#auth-screen").hidden = false;
  document.querySelector("#app-shell").hidden = true;
}

function showAppShell() {
  document.querySelector("#auth-screen").hidden = true;
  document.querySelector("#app-shell").hidden = false;
}

function renderUserState() {
  const userEmail = document.querySelector("#user-email");
  const sidebarUserEmail = document.querySelector("#sidebar-user-email");
  const logoutButton = document.querySelector("#logout-button");
  const trialStatus = document.querySelector("#trial-status");
  const shouldShow = Boolean(currentUser);

  if (userEmail) {
    userEmail.hidden = !shouldShow;
    userEmail.textContent = currentUser?.email || "";
  }

  if (sidebarUserEmail) {
    sidebarUserEmail.textContent = currentUser?.email || "Conta ativa";
  }

  if (logoutButton) {
    logoutButton.hidden = !shouldShow;
  }

  if (trialStatus && !shouldShow) {
    trialStatus.hidden = true;
    trialStatus.textContent = "";
    trialStatus.classList.remove("expired");
  }
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function getFallbackTrialProfile() {
  if (!currentUser?.created_at) return null;

  const startedAt = new Date(currentUser.created_at);
  const expiresAt = new Date(startedAt);
  expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS);

  return {
    trial_started_at: startedAt.toISOString(),
    trial_expires_at: expiresAt.toISOString(),
    plan_status: "trial"
  };
}

function renderTrialStatus() {
  const trialStatus = document.querySelector("#trial-status");
  if (!trialStatus || !currentUser) return;

  const profile = currentProfile || getFallbackTrialProfile();
  if (!profile?.trial_expires_at) {
    trialStatus.hidden = true;
    return;
  }

  const now = new Date();
  const expiresAt = new Date(profile.trial_expires_at);
  const msRemaining = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000));
  const isExpired = msRemaining <= 0;

  trialStatus.hidden = false;
  trialStatus.classList.toggle("expired", isExpired);
  trialStatus.textContent = isExpired
    ? `Teste expirado em ${formatDate(expiresAt)}`
    : `Teste válido até ${formatDate(expiresAt)} · ${daysRemaining} dia${daysRemaining === 1 ? "" : "s"} restante${daysRemaining === 1 ? "" : "s"}`;
}

async function hydrateCloudFilaments() {
  if (!isCloudReady || !supabaseClient || !currentUser) return;

  try {
    isHydratingCloud = true;
    const { data, error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    filaments = Array.isArray(data) ? normalizeFilaments(data.map(fromDatabaseRow)) : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filaments));
    renderAll();
  } catch (error) {
    console.warn("Supabase indisponivel. Mantendo dados locais.", error);
    filaments = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filaments));
    if (String(error?.code || "") === "42P01") {
      setAuthMessage("Banco ainda não configurado. Rode o SQL completo do LayerOne no Supabase.", "error");
    }
    renderAll();
  } finally {
    isHydratingCloud = false;
  }
}

async function hydrateCloudPrinters() {
  if (!isCloudReady || !supabaseClient || !currentUser || !isPrinterCloudReady) return;

  try {
    isHydratingCloud = true;
    const { data, error } = await supabaseClient
      .from(PRINTER_TABLE)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    printers = Array.isArray(data) ? normalizePrinters(data.map(fromPrinterDatabaseRow)) : [];
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(printers));
    renderAll();
  } catch (error) {
    console.warn("Tabela de impressoras indisponivel. Mantendo impressoras locais.", error);
    if (String(error?.code || "") === "42P01") {
      isPrinterCloudReady = false;
    }
    printers = loadPrinters(true);
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(printers));
    renderAll();
  } finally {
    isHydratingCloud = false;
  }
}

async function detectUserScopedStorage() {
  if (!isCloudReady || !supabaseClient) return;

  const { error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("user_id")
    .limit(1);

  isUserScopedStorage = !error;
}

async function hydrateUserProfile() {
  currentProfile = getFallbackTrialProfile();
  if (!isCloudReady || !supabaseClient || !currentUser) {
    renderTrialStatus();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from(PROFILE_TABLE)
      .upsert(
        {
          user_id: currentUser.id,
          email: currentUser.email || ""
        },
        { onConflict: "user_id" }
      )
      .select("trial_started_at, trial_expires_at, plan_status")
      .single();

    if (error) throw error;
    currentProfile = data || currentProfile;
  } catch (error) {
    console.warn("Nao foi possivel carregar o perfil de teste. Usando fallback do Auth.", error);
  }

  renderTrialStatus();
}

async function handleAuthSession(session) {
  currentUser = session?.user || null;
  currentProfile = null;
  renderUserState();

  if (!currentUser) {
    filaments = [];
    printers = [];
    showAuthScreen();
    setAuthMessage("", "");
    return;
  }

  showAppShell();
  setAuthMessage("Login realizado.", "success");
  await hydrateUserProfile();
  await detectUserScopedStorage();
  await hydrateCloudFilaments();
  await hydrateCloudPrinters();
}

async function initializeCloudStorage() {
  appConfig = await loadAppConfig();

  if (!isConfigReady(appConfig) || !window.supabase?.createClient) {
    isCloudReady = false;
    filaments = loadFilaments(true);
    printers = loadPrinters(true);
    showAppShell();
    renderUserState();
    renderAll();
    return;
  }

  supabaseClient = window.supabase.createClient(appConfig.supabaseUrl, appConfig.supabaseKey);
  isCloudReady = true;

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.warn("Nao foi possivel ler a sessao Supabase.", error);
    showAuthScreen();
    setAuthMessage("Não foi possível validar sua sessão. Tente entrar novamente.", "error");
    return;
  }

  await handleAuthSession(data.session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    handleAuthSession(session);
  });
}

async function syncFilamentsToCloud() {
  if (!isCloudReady || isHydratingCloud || !supabaseClient || !currentUser) return;

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

async function syncPrintersToCloud() {
  if (!isCloudReady || isHydratingCloud || !supabaseClient || !currentUser || !isPrinterCloudReady) return;

  try {
    const rows = printers.map(toPrinterDatabaseRow);
    if (!rows.length) return;

    const { error } = await supabaseClient
      .from(PRINTER_TABLE)
      .upsert(rows, { onConflict: "id" });

    if (error) throw error;
  } catch (error) {
    console.warn("Nao foi possivel sincronizar impressoras com Supabase.", error);
    if (String(error?.code || "") === "42P01") {
      isPrinterCloudReady = false;
    }
  }
}

async function deleteFilamentFromCloud(filamentId) {
  if (!isCloudReady || !supabaseClient || !currentUser || !filamentId) return;

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

async function deletePrinterFromCloud(printerId) {
  if (!isCloudReady || !supabaseClient || !currentUser || !printerId || !isPrinterCloudReady) return;

  try {
    const { error } = await supabaseClient
      .from(PRINTER_TABLE)
      .delete()
      .eq("id", printerId);

    if (error) throw error;
  } catch (error) {
    console.warn("Nao foi possivel excluir impressora no Supabase.", error);
  }
}

async function deleteFilamentsFromCloud(filamentIds) {
  if (!isCloudReady || !supabaseClient || !currentUser || !filamentIds.length) return;

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

function loadStockViewMode() {
  const stored = localStorage.getItem(STOCK_VIEW_KEY);
  return stored === "grouped" ? "grouped" : "rolls";
}

function setStockViewMode(mode) {
  stockViewMode = mode === "grouped" ? "grouped" : "rolls";
  localStorage.setItem(STOCK_VIEW_KEY, stockViewMode);
  renderStockViewToggle();
  renderSpools();
}

function renderStockViewToggle() {
  document.querySelectorAll("[data-stock-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.stockView === stockViewMode);
  });
}

function applyTheme(theme) {
  currentTheme = theme;
  document.body.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);

  const button = document.querySelector("#theme-toggle");
  if (button) {
    const label = button.querySelector(".theme-label");
    if (label) label.textContent = theme === "dark" ? "Dark" : "Light";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHexColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#22c55e";
}

function syncColorPresetState() {
  const colorInput = document.querySelector('#filament-form input[name="colorHex"]');
  if (!colorInput) return;

  const currentColor = safeHexColor(colorInput.value).toLowerCase();
  document.querySelectorAll("[data-color-preset]").forEach((button) => {
    button.classList.toggle("active", String(button.dataset.colorPreset || "").toLowerCase() === currentColor);
  });
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

function getFilamentGroupKey(item) {
  return [
    item.type,
    item.colorName,
    item.colorHex,
    item.brand,
    item.supplier || ""
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function getGroupedFilaments() {
  const groups = new Map();

  filaments.forEach((item) => {
    const key = getFilamentGroupKey(item);
    const costPerGram = getCostPerGram(item);
    const currentWeight = Number(item.currentWeight || 0);
    const stockValue = Number(item.stockValue || currentWeight * costPerGram);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        id: key,
        brand: item.brand,
        supplier: item.supplier,
        type: item.type,
        colorName: item.colorName,
        colorHex: item.colorHex,
        initialWeight: Number(item.initialWeight || 0),
        currentWeight,
        stockValue,
        minAlert: Number(item.minAlert || 0),
        rolls: [item]
      });
      return;
    }

    existing.initialWeight += Number(item.initialWeight || 0);
    existing.currentWeight += currentWeight;
    existing.stockValue += stockValue;
    existing.minAlert += Number(item.minAlert || 0);
    existing.rolls.push(item);
  });

  return [...groups.values()].map((group) => ({
    ...group,
    avgCostPerGram: group.currentWeight > 0 ? group.stockValue / group.currentWeight : 0,
    rollCost: group.currentWeight > 0 ? (group.stockValue / group.currentWeight) * 1000 : 0
  }));
}

function getPrinterLabel(item) {
  return `${item.name} - ${currency.format(item.purchaseCost)} / ${grams.format(item.lifeHours)}h`;
}

function getSelectedPrinter(printerId) {
  return printers.find((item) => item.id === printerId) || printers[0] || null;
}

function getPrinterDepreciationPerHour(printer) {
  if (!printer) return 0;
  return Number(printer.purchaseCost || 0) / Math.max(1, Number(printer.lifeHours || 1));
}

function applyPrinterToForm(form, printer) {
  if (!form || !printer) return;

  const kwInput = form.querySelector('[name="printerKw"]');
  const costInput = form.querySelector('[name="machineCost"]');
  const lifeInput = form.querySelector('[name="machineLife"], [name="machineLifeHours"]');

  if (kwInput) kwInput.value = Number(printer.averageKw || 0);
  if (costInput) costInput.value = Number(printer.purchaseCost || 0);
  if (lifeInput) lifeInput.value = Number(printer.lifeHours || 0);
}

function setActiveTab(tabName) {
  const panel = document.querySelector(`#${tabName}`);
  if (!panel) return;

  document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(`.tab[data-tab="${tabName}"]`).forEach((item) => item.classList.add("active"));
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

function removePrinter(printerId) {
  printers = printers.filter((item) => item.id !== printerId);
  savePrinters();
  deletePrinterFromCloud(printerId);
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
      const colorHex = safeHexColor(item.colorHex);
      const id = escapeHtml(item.id);
      const title = escapeHtml(`${item.type} ${item.colorName}`);
      const source = escapeHtml(`${item.brand} - ${item.supplier || "Fornecedor não informado"}`);
      return `
        <div class="swipe-row" data-swipe-id="${id}">
          <button class="swipe-delete" data-alert-delete="${id}" type="button">Excluir</button>
          <div class="alert-item swipe-content">
            <div>
              <strong><span class="swatch" style="background:${colorHex}"></span>${title}</strong>
              <p>${source} - ${formatStock(item.currentWeight)} restantes</p>
            </div>
            <span class="status ${status.className}">${status.label}</span>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelector("#stock-alerts").innerHTML = alerts || "<p>Nenhum filamento cadastrado.</p>";
}

function renderRollSpoolsLegacy() {
  const html = filaments
    .map((item) => {
      const percent = getRemainingPercent(item);
      const usedRatio = Math.max(0, Math.min(1, (100 - percent) / 100));
      const status = getStatus(item);
      const currentValue = Number(item.currentWeight) * getCostPerGram(item);
      const colorHex = safeHexColor(item.colorHex);
      const id = escapeHtml(item.id);
      const title = escapeHtml(`${item.type} ${item.colorName}`);
      const brand = escapeHtml(item.brand);
      const supplier = escapeHtml(item.supplier || "Fornecedor não informado");

      return `
        <article class="spool-card">
          <header>
            <div>
              <h3>${title}</h3>
              <p>${brand} - ${supplier}</p>
            </div>
            <span class="status ${status.className}">${status.label}</span>
          </header>
          <div class="stock-meter vertical-meter" style="--filament-color:${colorHex}; --stock-percent:${percent.toFixed(0)}%; --used-ratio:${usedRatio.toFixed(2)}" aria-label="${percent.toFixed(0)}% restante">
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
            <div><span>Fornecedor</span><strong>${supplier}</strong></div>
            <div><span>Custo médio/g</span><strong>${currency.format(getCostPerGram(item))}</strong></div>
            <div><span>Valor restante</span><strong>${currency.format(currentValue)}</strong></div>
          </div>
          <div class="quick-card-actions" data-card-actions="${id}">
            <div class="quick-inputs">
              <input aria-label="Gramas usadas" min="0" step="0.1" type="number" value="50" placeholder="g usados">
            </div>
            <div class="quick-buttons">
              <button class="secondary-button" data-stock-action="use" type="button">Usar</button>
              <button class="danger-button" data-stock-action="remove" type="button">Acabou</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelector("#spool-grid").innerHTML = html || "<p>Nenhum filamento cadastrado.</p>";
}

function renderGroupedSpoolCard(group) {
  const percent = getRemainingPercent(group);
  const usedRatio = Math.max(0, Math.min(1, (100 - percent) / 100));
  const status = getStatus(group);
  const colorHex = safeHexColor(group.colorHex);
  const title = escapeHtml(`${group.type} ${group.colorName}`);
  const brand = escapeHtml(group.brand);
  const supplier = escapeHtml(group.supplier || "Fornecedor não informado");
  const rollRows = group.rolls
    .map((roll, index) => `
      <li>
        <span>Rolo ${index + 1}</span>
        <strong>${formatStock(roll.currentWeight)} / ${formatStock(roll.initialWeight)}</strong>
      </li>
    `)
    .join("");

  return `
    <article class="spool-card grouped-spool-card">
      <header>
        <div>
          <h3>${title}</h3>
          <p>${brand} - ${supplier}</p>
        </div>
        <span class="status ${status.className}">${status.label}</span>
      </header>
      <div class="stock-meter vertical-meter" style="--filament-color:${colorHex}; --stock-percent:${percent.toFixed(0)}%; --used-ratio:${usedRatio.toFixed(2)}" aria-label="${percent.toFixed(0)}% restante">
        <div class="vertical-spool">
          <span class="spool-side left"></span>
          <span class="spool-side right"></span>
          <span class="vertical-fill"></span>
          <span class="vertical-lines"></span>
          <span class="vertical-empty"></span>
          <span class="stock-meter-label"><span class="percent-line">${percent.toFixed(0)}<small>%</small></span><em>saldo agrupado</em></span>
        </div>
      </div>
      <div class="spool-stats">
        <div><span>Total agrupado</span><strong>${formatStock(group.currentWeight)}</strong></div>
        <div><span>Rolos no grupo</span><strong>${group.rolls.length}</strong></div>
        <div><span>Custo médio/g</span><strong>${currency.format(getCostPerGram(group))}</strong></div>
        <div><span>Valor em estoque</span><strong>${currency.format(Number(group.stockValue || 0))}</strong></div>
      </div>
      <details class="group-rolls">
        <summary>Ver rolos individuais</summary>
        <ul>${rollRows}</ul>
      </details>
    </article>
  `;
}

function renderGroupedSpools() {
  const html = getGroupedFilaments().map(renderGroupedSpoolCard).join("");
  document.querySelector("#spool-grid").innerHTML = html || "<p>Nenhum filamento cadastrado.</p>";
}

function renderSpools() {
  renderStockViewToggle();
  if (stockViewMode === "grouped") {
    renderGroupedSpools();
    return;
  }

  renderRollSpoolsLegacy();
}

function renderTable() {
  const rows = filaments
    .map((item) => {
      const status = getStatus(item);
      const colorHex = safeHexColor(item.colorHex);
      const id = escapeHtml(item.id);
      const title = escapeHtml(`${item.type} ${item.colorName}`);
      const brand = escapeHtml(item.brand);
      const supplier = escapeHtml(item.supplier || "Não informado");
      return `
        <tr>
          <td><span class="swatch" style="background:${colorHex}"></span><strong>${title}</strong><br><small>${brand}</small></td>
          <td>${supplier}</td>
          <td>${formatStock(item.currentWeight)} / ${formatStock(item.initialWeight)}</td>
          <td>${currency.format(getCostPerGram(item))}/g<br><small>${currency.format(getCostPerGram(item) * 1000)}/kg</small></td>
          <td><span class="status ${status.className}">${status.label}</span></td>
          <td><button class="danger-button" type="button" data-remove="${id}">Remover</button></td>
        </tr>
      `;
    })
    .join("");

  document.querySelector("#filament-table").innerHTML = rows || "<tr><td colspan='6'>Nenhum filamento cadastrado.</td></tr>";
}

function renderPrinterTable() {
  const table = document.querySelector("#printer-table");
  if (!table) return;

  const rows = printers
    .map((item) => {
      const id = escapeHtml(item.id);
      const name = escapeHtml(item.name);
      const model = escapeHtml(item.model);
      const depreciationPerHour = getPrinterDepreciationPerHour(item);
      return `
        <tr>
          <td><strong>${name}</strong><br><small>${model}</small></td>
          <td>${currency.format(item.purchaseCost)}</td>
          <td>${grams.format(item.lifeHours)}h</td>
          <td>${decimal.format(item.averageKw)} kW</td>
          <td>${currency.format(depreciationPerHour)}/h</td>
          <td><button class="danger-button" type="button" data-remove-printer="${id}">Remover</button></td>
        </tr>
      `;
    })
    .join("");

  table.innerHTML = rows || "<tr><td colspan='6'>Nenhuma impressora cadastrada.</td></tr>";
}

function renderFilamentOptions() {
  const selected = document.querySelector("#filament-select").value;
  const emptyOption = "<option value=\"\" disabled selected>Cadastre um filamento primeiro</option>";
  const optionHtml = filaments.length
    ? filaments.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(getFilamentLabel(item))}</option>`).join("")
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

function renderPrinterOptions() {
  const selects = [
    document.querySelector("#printer-select"),
    document.querySelector("#smart-printer-select")
  ].filter(Boolean);

  const emptyOption = "<option value=\"\" disabled selected>Cadastre uma impressora primeiro</option>";
  const optionHtml = printers.length
    ? printers.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(getPrinterLabel(item))}</option>`).join("")
    : emptyOption;

  selects.forEach((select) => {
    const selected = select.value;
    select.innerHTML = optionHtml;

    if (printers.some((item) => item.id === selected)) {
      select.value = selected;
    }
  });

  const pricingForm = document.querySelector("#pricing-form");
  const smartForm = document.querySelector("#smart-pricing-form");
  applyPrinterToForm(pricingForm, getSelectedPrinter(document.querySelector("#printer-select")?.value));
  applyPrinterToForm(smartForm, getSelectedPrinter(document.querySelector("#smart-printer-select")?.value));
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

function getMarketplaceGuide(id) {
  return MARKETPLACE_PRESETS[id] || MARKETPLACE_PRESETS.shopee || Object.values(MARKETPLACE_PRESETS)[0];
}

function getMarketplaceGuideCopy(id) {
  return MARKETPLACE_GUIDES[id] || {
    description: "Confira as taxas deste canal antes de definir o preço final.",
    notice: "Marketplaces podem alterar regras por categoria, perfil e campanha."
  };
}

function renderMarketplaceGuideRules(marketplace) {
  const rules = document.querySelector("#marketplace-guide-rules");
  if (!rules || !marketplace) return;

  if (marketplace.feeModel === "tiered") {
    rules.innerHTML = `
      <div class="marketplace-rule-table">
        <div class="marketplace-rule-row marketplace-rule-labels"><span>Faixa da venda</span><span>Comissão</span><span>Taxa fixa</span></div>
        ${(marketplace.tiers || []).map((tier) => `
          <div class="marketplace-rule-row">
            <strong>${escapeHtml(tier.label)}</strong>
            <span>${decimal.format(Number(tier.percent || 0))}%</span>
            <span>${currency.format(Number(tier.fixed || 0))}</span>
          </div>
        `).join("")}
      </div>
    `;
    return;
  }

  rules.innerHTML = `
    <div class="marketplace-flat-rules">
      <article><span>Comissão de referência</span><strong>${decimal.format(Number(marketplace.percent || 0))}%</strong></article>
      <article><span>Taxa fixa por oferta</span><strong>${currency.format(Number(marketplace.fixed || 0))}</strong></article>
    </div>
  `;
}

function updateMarketplaceSimulator() {
  const engine = window.LayerOnePricingEngine;
  const marketplace = getMarketplaceGuide(selectedMarketplaceGuide);
  const priceInput = document.querySelector("#marketplace-simulator-price");
  if (!engine || !marketplace || !priceInput) return;

  const price = Math.max(0, Number(priceInput.value || 0));
  const fee = engine.calculateMarketplaceFee(marketplace, price);
  const netBeforeProduction = Math.max(0, price - fee.totalFee);
  const effectiveRate = Math.min(100, Number(fee.effectivePercent || 0));

  document.querySelector("#marketplace-simulator-percent").textContent = currency.format(fee.percentageFee);
  document.querySelector("#marketplace-simulator-fixed").textContent = currency.format(fee.fixedFee);
  document.querySelector("#marketplace-simulator-total").textContent = currency.format(fee.totalFee);
  document.querySelector("#marketplace-simulator-net").textContent = currency.format(netBeforeProduction);
  document.querySelector("#marketplace-simulator-effective").textContent = `${decimal.format(fee.effectivePercent)}%`;
  document.querySelector("#marketplace-effective-bar").style.width = `${effectiveRate}%`;

  const tip = document.querySelector("#marketplace-simulator-tip");
  if (!tip) return;

  if (fee.fixedFee > 0 && fee.effectivePercent >= 30) {
    tip.innerHTML = `<strong>Atenção ao ticket baixo.</strong><span>A taxa fixa está pesando bastante nesta venda. Avalie vender em kit para diluir esse valor.</span>`;
  } else if (fee.fixedFee > 0) {
    tip.innerHTML = `<strong>Taxa fixa por oferta.</strong><span>Um kit paga essa taxa uma vez, enquanto vendas separadas pagam uma vez por pedido.</span>`;
  } else if (fee.totalFee > 0) {
    tip.innerHTML = `<strong>Desconto percentual.</strong><span>Quanto maior o preço, maior o valor absoluto da comissão descontada.</span>`;
  } else {
    tip.innerHTML = `<strong>Sem taxa automática.</strong><span>Inclua custos de pagamento, entrega ou negociação nos campos extras da precificação.</span>`;
  }
}

function renderMarketplaceGuide() {
  const selector = document.querySelector("#marketplace-guide-selector");
  const marketplace = getMarketplaceGuide(selectedMarketplaceGuide);
  if (!selector || !marketplace) return;

  selector.innerHTML = Object.values(MARKETPLACE_PRESETS).map((item) => `
    <button class="marketplace-selector-button${item.id === marketplace.id ? " active" : ""}" data-marketplace-guide="${escapeHtml(item.id)}" role="tab" aria-selected="${item.id === marketplace.id}" type="button">
      <span>${escapeHtml(item.name.slice(0, 2).toUpperCase())}</span>
      <strong>${escapeHtml(item.name)}</strong>
      <small>${item.feeModel === "tiered" ? "Por faixas" : `${decimal.format(Number(item.percent || 0))}% base`}</small>
    </button>
  `).join("");

  const guide = getMarketplaceGuideCopy(marketplace.id);
  document.querySelector("#marketplace-guide-badge").textContent = marketplace.feeModel === "tiered" ? "Regra por faixa" : "Regra base";
  document.querySelector("#marketplace-guide-title").textContent = marketplace.name;
  document.querySelector("#marketplace-guide-description").textContent = guide.description;
  document.querySelector("#marketplace-guide-updated").textContent = marketplace.validatedAt
    ? `Preset revisado em ${marketplace.validatedAt.split("-").reverse().join("/")}`
    : "Preset de referência";
  document.querySelector("#marketplace-guide-notice").innerHTML = `<strong>Importante</strong><span>${escapeHtml(guide.notice)}</span>`;

  renderMarketplaceGuideRules(marketplace);
  updateMarketplaceSimulator();
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
      <span>Custo real, lote, marketplace e margem em uma leitura</span>
    </div>

    <div class="pricing-help-callout">
      <div>
        <strong>É sua primeira precificação?</strong>
        <span>Entenda taxas, peça unitária, kit e plate antes de preencher.</span>
      </div>
      <button class="secondary-button" data-open-tab="marketplaces" type="button">Ver guia de custos</button>
    </div>

    <div class="smart-card">
      <div class="smart-block-title">
        <span class="smart-index">1</span>
        <div>
          <h3>Venda e marketplace</h3>
          <p>Defina o item vendido e a margem líquida desejada.</p>
        </div>
      </div>
      <div class="form-grid">
        <label>Produto<input name="productName" value="Chaveiro articulado"></label>
        <label>Marketplace<select name="marketplace" id="smart-marketplace"></select></label>
        <label>Margem líquida desejada (%)<input name="targetNetMarginPercent" min="0" max="80" step="0.1" type="number" value="35"></label>
        <label>Peças por kit/oferta<input name="unitsPerOffer" min="1" step="1" type="number" value="1"></label>
      </div>
    </div>

    <div class="smart-card">
      <div class="smart-block-title">
        <span class="smart-index">2</span>
        <div>
          <h3>Impressora e energia</h3>
          <p>Informe o tempo total da impressão e o consumo elétrico.</p>
        </div>
      </div>
      <div class="time-grid">
        <label>Tempo total - horas<input name="totalTimeWholeHours" min="0" step="1" type="number" value="0"></label>
        <label>Tempo total - minutos<input name="totalTimeMinutes" min="0" max="59" step="1" type="number" value="40"></label>
      </div>
      <div class="form-grid compact-grid">
        <label>Impressora usada<select name="printerId" id="smart-printer-select"></select></label>
        <label>kWh local (R$)<input name="kwhCost" min="0" step="0.01" type="number" value="0.95"></label>
        <label>Consumo médio da impressora (kW)<input name="printerKw" min="0" step="0.01" type="number" value="0.12" readonly></label>
      </div>
    </div>

    <div class="smart-card">
      <div class="smart-block-title">
        <span class="smart-index">3</span>
        <div>
          <h3>Filamento</h3>
          <p>O custo por grama vem do estoque cadastrado.</p>
        </div>
      </div>
      <div class="form-grid">
        <label>Filamento<select name="filamentId" id="smart-filament-select"></select></label>
        <label>Peso total usado (g)<input name="totalWeightGrams" min="0" step="0.1" type="number" value="8"></label>
      </div>
    </div>

    <div class="smart-card">
      <div class="smart-block-title">
        <span class="smart-index">4</span>
        <div>
          <h3>Lote e custos extras</h3>
          <p>Use plate quando várias peças saem juntas na mesma impressão.</p>
        </div>
      </div>
      <div class="mode-card-grid compact-modes" role="radiogroup" aria-label="Modo de produção">
        <label class="mode-card"><input checked name="mode" type="radio" value="unit"><strong>Unitário</strong><span>1 peça sozinha</span></label>
        <label class="mode-card"><input name="mode" type="radio" value="plate"><strong>Plate / lote</strong><span>ratear entre peças</span></label>
      </div>
      <div class="form-grid">
        <label>Peças na impressão<input name="physicalUnits" min="1" step="1" type="number" value="1"></label>
        <label>Falhas/perdas (%)<input name="failureRatePercent" min="0" step="0.1" type="number" value="8"></label>
        <label>Embalagem por oferta (R$)<input name="packagingCostPerOffer" min="0" step="0.01" type="number" value="1.20"></label>
        <label>Mão de obra por oferta (R$)<input name="laborCostPerOffer" min="0" step="0.01" type="number" value="1.00"></label>
        <label>Outros custos por oferta (R$)<input name="extraCostPerOffer" min="0" step="0.01" type="number" value="0"></label>
        <label>Custo extra do lote (R$)<input name="batchExtraCost" min="0" step="0.01" type="number" value="0"></label>
      </div>
      <details class="smart-advanced">
        <summary>Parâmetros da impressora</summary>
        <div class="form-grid">
          <label>Valor da impressora (R$)<input name="machineCost" min="0" step="0.01" type="number" value="2500" readonly></label>
          <label>Vida útil estimada (h)<input name="machineLifeHours" min="1" step="1" type="number" value="3000" readonly></label>
        </div>
      </details>
    </div>
  `;
}

function readPricingForm() {
  const form = new FormData(document.querySelector("#pricing-form"));
  const data = Object.fromEntries(form.entries());

  for (const key of Object.keys(data)) {
    if (!["productName", "filamentId", "printerId"].includes(key)) {
      data[key] = Number(data[key] || 0);
    }
  }

  return data;
}

function calculatePricing() {
  const data = readPricingForm();
  const filament = filaments.find((item) => item.id === data.filamentId) || filaments[0];
  const printer = getSelectedPrinter(data.printerId);
  if (printer) {
    data.printerKw = Number(printer.averageKw || 0);
    data.machineCost = Number(printer.purchaseCost || 0);
    data.machineLife = Number(printer.lifeHours || 1);
    applyPrinterToForm(document.querySelector("#pricing-form"), printer);
  }
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
    <div><span>Depreciação ${escapeHtml(printer?.name || "impressora")}</span><strong>${currency.format(depreciationCost)}</strong></div>
    <div><span>Embalagem + mão de obra</span><strong>${currency.format(data.packaging + data.labor)}</strong></div>
    <div><span>Falhas/perdas</span><strong>${currency.format(failureCost)}</strong></div>
  `;

  document.querySelector("#cost-audit").innerHTML = filament
    ? `
      <div><span>Filamento usado</span><strong>${escapeHtml(`${filament.type} ${filament.colorName}`)}</strong></div>
      <div><span>Custo médio do filamento</span><strong>${currency.format(costPerGram)}/g</strong></div>
      <div><span>Custo médio por kg</span><strong>${currency.format(costPerGram * 1000)}/kg</strong></div>
      <div><span>Conta do material</span><strong>${grams.format(data.grams)}g × ${currency.format(costPerGram)}/g</strong></div>
      <div><span>Impressora usada</span><strong>${escapeHtml(printer?.name || "Não informada")}</strong></div>
      <div><span>Depreciação por hora</span><strong>${currency.format(getPrinterDepreciationPerHour(printer))}/h</strong></div>
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
    if (!["productName", "filamentId", "printerId", "marketplace", "mode"].includes(key)) {
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
  const printer = getSelectedPrinter(data.printerId);
  if (printer) {
    data.printerKw = Number(printer.averageKw || 0);
    data.machineCost = Number(printer.purchaseCost || 0);
    data.machineLifeHours = Number(printer.lifeHours || 1);
    applyPrinterToForm(document.querySelector("#smart-pricing-form"), printer);
  }
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
    <div><span>Impressora usada</span><strong>${escapeHtml(printer?.name || "Não informada")}</strong></div>
    <div><span>Depreciação por hora</span><strong>${currency.format(getPrinterDepreciationPerHour(printer))}/h</strong></div>
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
  renderPrinterTable();
  renderFilamentOptions();
  renderPrinterOptions();
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

document.querySelector("#marketplace-guide-selector")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-marketplace-guide]");
  if (!button || !MARKETPLACE_PRESETS[button.dataset.marketplaceGuide]) return;

  selectedMarketplaceGuide = button.dataset.marketplaceGuide;
  renderMarketplaceGuide();
});

document.querySelector("#marketplace-simulator-price")?.addEventListener("input", updateMarketplaceSimulator);

document.querySelectorAll("[data-stock-view]").forEach((button) => {
  button.addEventListener("click", () => setStockViewMode(button.dataset.stockView));
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
  event.currentTarget.querySelector(".color-field")?.classList.remove("palette-open");
  syncColorPresetState();
  renderAll();
});

document.querySelector("#filament-form")?.addEventListener("focusin", (event) => {
  if (event.target.closest(".color-field")) {
    event.target.closest(".color-field").classList.add("palette-open");
  }
});

document.querySelector("#filament-form")?.addEventListener("click", (event) => {
  const colorField = event.target.closest(".color-field");
  if (colorField) colorField.classList.add("palette-open");

  const presetButton = event.target.closest("[data-color-preset]");
  if (!presetButton) return;

  const colorInput = event.currentTarget.querySelector('input[name="colorHex"]');
  colorInput.value = safeHexColor(presetButton.dataset.colorPreset);
  colorInput.dispatchEvent(new Event("input", { bubbles: true }));
  syncColorPresetState();
});

document.querySelector('#filament-form input[name="colorHex"]')?.addEventListener("input", syncColorPresetState);

document.querySelectorAll("[data-color-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const colorInput = document.querySelector('#filament-form input[name="colorHex"]');
    if (!colorInput) return;

    colorInput.value = safeHexColor(button.dataset.colorPreset);
    colorInput.dispatchEvent(new Event("input", { bubbles: true }));
    syncColorPresetState();
  });
});

document.querySelector("#filament-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;

  removeFilament(button.dataset.remove);
});

document.querySelector("#printer-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());

  printers.push({
    id: crypto.randomUUID(),
    name: data.name.trim(),
    model: data.model.trim(),
    purchaseCost: Number(data.purchaseCost || 0),
    lifeHours: Math.max(1, Number(data.lifeHours || 1)),
    averageKw: Number(data.averageKw || 0)
  });

  event.currentTarget.reset();
  savePrinters();
  renderAll();
});

document.querySelector("#printer-table")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-printer]");
  if (!button) return;

  removePrinter(button.dataset.removePrinter);
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
  const action = button.dataset.stockAction;

  if (action === "remove") {
    removeFilament(filamentId);
    return;
  }

  if (!filamentId || amount <= 0) return;
  changeFilamentStock(filamentId, amount, action);
});

document.querySelector("#pricing-form").addEventListener("input", calculatePricing);
document.querySelector("#pricing-form").addEventListener("change", calculatePricing);

document.querySelector("#smart-pricing-form")?.addEventListener("input", calculateSmartPricing);
document.querySelector("#smart-pricing-form")?.addEventListener("change", calculateSmartPricing);
document.querySelector("#smart-pricing-form")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-tab]");
  if (button) setActiveTab(button.dataset.openTab);
});

document.querySelector("#consume-stock").addEventListener("click", () => {
  const data = readPricingForm();
  const filament = filaments.find((item) => item.id === data.filamentId);
  if (!filament) return;

  changeFilamentStock(filament.id, Number(data.grams), "use");
});

document.querySelector("#theme-toggle").addEventListener("click", () => {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
});

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    setAuthMessage("Configuração do Supabase não encontrada.", "error");
    return;
  }

  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const submitButton = form.querySelector("button[type='submit']");
  const data = Object.fromEntries(new FormData(form).entries());
  const email = String(data.email || "").trim();
  const password = String(data.password || "");

  if (password.length < 6) {
    setAuthMessage("A senha precisa ter pelo menos 6 caracteres.", "error");
    return;
  }

  submitButton.disabled = true;
  setAuthMessage(authMode === "signup" ? "Criando conta..." : "Validando acesso...", "");

  try {
    const { data: authData, error } = authMode === "signup"
      ? await supabaseClient.auth.signUp({
        email,
        password
      })
      : await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
      setAuthMessage(getAuthErrorMessage(error, authMode), "error");
      return;
    }

    form.reset();
    if (authMode === "signup" && !authData.session) {
      setAuthMessage("Conta criada. Se o app não entrar automaticamente, desative a confirmação por e-mail no Supabase.", "success");
      setAuthMode("signin");
      return;
    }

    setAuthMessage(authMode === "signup" ? "Conta criada e login realizado." : "Login realizado.", "success");
  } catch (error) {
    console.warn("Falha de conexão no login Supabase.", error);
    setAuthMessage("Não foi possível conectar ao Supabase. Verifique a URL do projeto e tente novamente.", "error");
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  if (!supabaseClient) return;

  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  filaments = [];
  printers = [];
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PRINTER_STORAGE_KEY);
  renderUserState();
  showAuthScreen();
});

renderSmartPricingShell();
renderMarketplaceGuide();
normalizeVisibleText();
syncColorPresetState();
applyTheme(currentTheme);
initializeCloudStorage();
