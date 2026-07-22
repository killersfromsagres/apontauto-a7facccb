// Popup — orquestra UI, storage e disparo da automação.

const $ = (id) => document.getElementById(id);
const logEl = $("log");
const statusEl = $("statusLine");
const progEl = $("progresso");
const loteInfoEl = $("loteInfo");

let loteCarregado = null;
let resultados = [];

// ---------- Log ----------
function log(msg, kind = "") {
  const line = document.createElement("div");
  if (kind) line.className = kind;
  const hora = new Date().toLocaleTimeString("pt-BR");
  line.textContent = `[${hora}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- Storage ----------
async function loadCreds() {
  const { creds } = await chrome.storage.local.get("creds");
  if (creds) {
    $("usuario").value = creds.usuario || "";
    $("senha").value = creds.senha || "";
  }
}
$("salvarCreds").onclick = async () => {
  const creds = { usuario: $("usuario").value.trim(), senha: $("senha").value };
  if (!creds.usuario || !creds.senha) {
    log("Preencha usuário e senha.", "err");
    return;
  }
  await chrome.storage.local.set({ creds });
  log("Credenciais salvas neste navegador.", "ok");
};

// ---------- Importar lote ----------
$("importarBtn").onclick = () => $("importInput").click();
$("importInput").onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const itens = Array.isArray(data) ? data : data.itens;
    if (!Array.isArray(itens) || itens.length === 0) throw new Error("JSON vazio ou inválido.");
    loteCarregado = itens;
    await chrome.storage.local.set({ lote: itens });
    loteInfoEl.textContent = `${itens.length} OS carregadas · ${new Set(itens.map((i) => i.categoria)).size} categoria(s).`;
    loteInfoEl.classList.add("ok");
    log(`Lote importado: ${itens.length} OS.`, "ok");
  } catch (err) {
    log(`Erro ao importar: ${err.message}`, "err");
  }
};

$("limparBtn").onclick = async () => {
  loteCarregado = null;
  await chrome.storage.local.remove("lote");
  loteInfoEl.textContent = "Nenhum lote carregado.";
  loteInfoEl.classList.remove("ok");
  logEl.textContent = "";
  progEl.value = 0;
  statusEl.textContent = "Aguardando…";
  resultados = [];
};

// ---------- Restaurar sessão ----------
(async () => {
  await loadCreds();
  const { lote } = await chrome.storage.local.get("lote");
  if (Array.isArray(lote) && lote.length) {
    loteCarregado = lote;
    loteInfoEl.textContent = `${lote.length} OS carregadas (sessão anterior).`;
    loteInfoEl.classList.add("ok");
  }
})();

// ---------- Iniciar ----------
$("iniciarBtn").onclick = async () => {
  const usuario = $("usuario").value.trim();
  const senha = $("senha").value;
  if (!usuario || !senha) return log("Salve as credenciais antes.", "err");
  if (!loteCarregado || loteCarregado.length === 0) return log("Importe um lote JSON.", "err");

  resultados = [];
  progEl.value = 0;
  statusEl.textContent = "Abrindo Prisma4…";
  $("iniciarBtn").disabled = true;
  $("pararBtn").disabled = false;

  await chrome.runtime.sendMessage({
    type: "APONTAUTO_START",
    payload: { usuario, senha, lote: loteCarregado },
  });
};

$("pararBtn").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "APONTAUTO_STOP" });
  statusEl.textContent = "Cancelado.";
  $("iniciarBtn").disabled = false;
  $("pararBtn").disabled = true;
};

// ---------- Mensagens do background/content ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "APONTAUTO_LOG") {
    log(msg.msg, msg.kind || "");
  } else if (msg?.type === "APONTAUTO_PROGRESS") {
    progEl.value = msg.percent;
    statusEl.textContent = msg.status;
  } else if (msg?.type === "APONTAUTO_RESULT") {
    resultados.push(msg.result);
  } else if (msg?.type === "APONTAUTO_DONE") {
    $("iniciarBtn").disabled = false;
    $("pararBtn").disabled = true;
    statusEl.textContent = `Concluído: ${resultados.filter((r) => r.status === "concluido").length}/${resultados.length}`;
    log("Automação finalizada.", "ok");
  }
});

// ---------- Exportar relatório ----------
$("exportarLog").onclick = () => {
  const payload = {
    geradoEm: new Date().toISOString(),
    resultados,
    log: logEl.innerText,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `apontauto-relatorio-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
