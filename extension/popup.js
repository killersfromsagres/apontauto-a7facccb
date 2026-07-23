const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = await chrome.storage.local.get(["supabaseUrl", "anonKey", "userCode"]);
  $("url").value = cfg.supabaseUrl || "";
  $("key").value = cfg.anonKey || "";
  $("code").value = cfg.userCode || "";
  refreshStatus();
}

async function refreshStatus() {
  const cfg = await chrome.storage.local.get(["supabaseUrl", "anonKey", "userCode", "lastHeartbeat"]);
  const el = $("status");
  if (!cfg.supabaseUrl || !cfg.anonKey) {
    el.innerHTML = '<span class="dot warn"></span> Configure URL e Anon Key.';
    return;
  }
  const hb = cfg.lastHeartbeat ? new Date(cfg.lastHeartbeat).toLocaleTimeString("pt-BR") : "—";
  el.innerHTML =
    `<span class="dot ok"></span> Configurado.<br>Último heartbeat: <b>${hb}</b>` +
    (cfg.userCode ? `<br>Usuário Prisma: <b>${cfg.userCode}</b>` : "");
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    supabaseUrl: $("url").value.trim().replace(/\/$/, ""),
    anonKey: $("key").value.trim(),
    userCode: $("code").value.trim(),
  });
  chrome.runtime.sendMessage({ type: "config-updated" });
  refreshStatus();
});

$("test").addEventListener("click", async () => {
  const cfg = await chrome.storage.local.get(["supabaseUrl", "anonKey"]);
  if (!cfg.supabaseUrl || !cfg.anonKey) {
    $("status").innerHTML = '<span class="dot err"></span> Preencha URL e Anon Key primeiro.';
    return;
  }
  try {
    const r = await fetch(`${cfg.supabaseUrl}/rest/v1/prisma_lotes?select=id&limit=1`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
    });
    if (r.ok) {
      $("status").innerHTML = '<span class="dot ok"></span> Conexão OK.';
    } else {
      $("status").innerHTML = `<span class="dot err"></span> HTTP ${r.status} — verifique a chave.`;
    }
  } catch (e) {
    $("status").innerHTML = `<span class="dot err"></span> Falha: ${e.message}`;
  }
});

$("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://cimogps.com.br/Prisma4" });
});

load();
