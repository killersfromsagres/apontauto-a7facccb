const $ = (id) => document.getElementById(id);

async function get() {
  return chrome.storage.local.get([
    "supabaseUrl", "anonKey", "accessToken", "refreshToken", "expiresAt",
    "userId", "userEmail", "prismaUrlPattern", "codigoUsuarioPrisma", "automacaoAtiva",
  ]);
}
async function set(patch) { await chrome.storage.local.set(patch); }

function setStatus(msg, tone = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + tone;
}

function renderState(cfg) {
  const conectado = !!(cfg.accessToken && cfg.userId);
  $("setup").hidden = conectado;
  $("controls").hidden = !conectado;
  const badge = $("statusBadge");
  if (conectado) {
    badge.className = "badge on";
    badge.textContent = cfg.automacaoAtiva ? "Ativa" : "Conectada";
    $("userInfo").textContent = cfg.userEmail || "";
    $("btnToggle").textContent = cfg.automacaoAtiva ? "Pausar automação" : "Ativar automação";
  } else {
    badge.className = "badge off";
    badge.textContent = "Desconectada";
  }
}

async function boot() {
  const cfg = await get();
  for (const k of ["supabaseUrl", "anonKey", "prismaUrlPattern", "codigoUsuarioPrisma"]) {
    if (cfg[k]) $(k).value = cfg[k];
  }
  if (cfg.userEmail) $("email").value = cfg.userEmail;
  renderState(cfg);
}

$("btnLogin").addEventListener("click", async () => {
  const supabaseUrl = $("supabaseUrl").value.trim().replace(/\/$/, "");
  const anonKey = $("anonKey").value.trim();
  const email = $("email").value.trim();
  const password = $("password").value;
  const prismaUrlPattern = $("prismaUrlPattern").value.trim() || "https://*.cimogps.com.br/*";
  const codigoUsuarioPrisma = $("codigoUsuarioPrisma").value.trim();
  if (!supabaseUrl || !anonKey || !email || !password) {
    setStatus("Preencha todos os campos.", "err");
    return;
  }
  setStatus("Conectando...");
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.msg || "Falha ao autenticar.");
    await set({
      supabaseUrl, anonKey, prismaUrlPattern, codigoUsuarioPrisma,
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      userId: j.user?.id,
      userEmail: j.user?.email,
    });
    setStatus("Conectado.", "ok");
    renderState(await get());
  } catch (e) {
    setStatus(e.message, "err");
  }
});

$("btnLogout").addEventListener("click", async () => {
  await set({ accessToken: null, refreshToken: null, expiresAt: null, userId: null, automacaoAtiva: false });
  setStatus("Desconectado.");
  renderState(await get());
});

$("btnToggle").addEventListener("click", async () => {
  const cfg = await get();
  const novo = !cfg.automacaoAtiva;
  await set({ automacaoAtiva: novo });
  setStatus(novo ? "Automação ativa." : "Automação pausada.", novo ? "ok" : "");
  renderState(await get());
});

$("btnCiclo").addEventListener("click", async () => {
  setStatus("Verificando...");
  chrome.runtime.sendMessage({ tipo: "DISPARAR_CICLO" }, (res) => {
    if (chrome.runtime.lastError) setStatus(chrome.runtime.lastError.message, "err");
    else if (res?.ok) setStatus("Ciclo executado.", "ok");
    else setStatus(res?.erro || "Falha.", "err");
  });
});

boot();
