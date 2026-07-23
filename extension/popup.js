const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = await chrome.storage.local.get([
    "supabaseUrl", "anonKey", "userCode", "email", "userId", "accessToken",
  ]);
  $("url").value = cfg.supabaseUrl || "";
  $("key").value = cfg.anonKey || "";
  $("code").value = cfg.userCode || "";
  $("email").value = cfg.email || "";
  refreshStatus(cfg);
}

async function refreshStatus(cfg) {
  cfg = cfg || (await chrome.storage.local.get([
    "supabaseUrl", "anonKey", "userCode", "lastHeartbeat", "userId", "accessToken",
  ]));
  const el = $("status");
  if (!cfg.supabaseUrl || !cfg.anonKey) {
    el.innerHTML = '<span class="dot warn"></span> Configure URL e Anon Key.';
    return;
  }
  if (!cfg.accessToken || !cfg.userId) {
    el.innerHTML = '<span class="dot warn"></span> Faça login para conectar ao painel.';
    return;
  }
  const hb = cfg.lastHeartbeat ? new Date(cfg.lastHeartbeat).toLocaleTimeString("pt-BR") : "—";
  el.innerHTML =
    `<span class="dot ok"></span> Conectado.<br>Heartbeat: <b>${hb}</b>` +
    (cfg.userCode ? `<br>Usuário Prisma: <b>${cfg.userCode}</b>` : "");
}

async function loginSupabase(url, key, email, password) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`Login ${r.status}: ${await r.text()}`);
  return r.json();
}

$("save").addEventListener("click", async () => {
  const url = $("url").value.trim().replace(/\/$/, "");
  const key = $("key").value.trim();
  const email = $("email").value.trim();
  const password = $("pass").value;
  const code = $("code").value.trim();

  await chrome.storage.local.set({
    supabaseUrl: url, anonKey: key, userCode: code, email,
  });

  if (!url || !key) {
    $("status").innerHTML = '<span class="dot err"></span> URL/Key obrigatórios.';
    return;
  }
  if (!email || !password) {
    $("status").innerHTML = '<span class="dot warn"></span> Config salva. Informe email e senha para logar.';
    return;
  }
  try {
    $("status").innerHTML = '<span class="dot warn"></span> Autenticando…';
    const s = await loginSupabase(url, key, email, password);
    await chrome.storage.local.set({
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      userId: s.user?.id,
    });
    chrome.runtime.sendMessage({ type: "config-updated" });
    $("status").innerHTML = '<span class="dot ok"></span> Login OK. Enviando heartbeat…';
    setTimeout(refreshStatus, 1500);
  } catch (e) {
    $("status").innerHTML = `<span class="dot err"></span> ${e.message}`;
  }
});

$("test").addEventListener("click", async () => {
  const cfg = await chrome.storage.local.get(["supabaseUrl", "anonKey", "accessToken"]);
  if (!cfg.supabaseUrl || !cfg.anonKey) {
    $("status").innerHTML = '<span class="dot err"></span> Preencha URL e Anon Key primeiro.';
    return;
  }
  try {
    const r = await fetch(`${cfg.supabaseUrl}/rest/v1/prisma_lotes?select=id&limit=1`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken || cfg.anonKey}`,
      },
    });
    if (r.ok) $("status").innerHTML = '<span class="dot ok"></span> Conexão OK.';
    else $("status").innerHTML = `<span class="dot err"></span> HTTP ${r.status} — refaça o login.`;
  } catch (e) {
    $("status").innerHTML = `<span class="dot err"></span> Falha: ${e.message}`;
  }
});

$("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://cimogps.com.br/Prisma4" });
});

load();
