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
  const nome = file.name || "arquivo";
  if (/\.(js|mjs|cjs)$/i.test(nome)) {
    log(`"${nome}" é um arquivo JavaScript. Exporte o lote como JSON na página Automação de OS e importe o .json aqui.`, "err");
    e.target.value = "";
    return;
  }
  try {
    const text = (await file.text()).replace(/^\uFEFF/, "").trim();
    if (!text) throw new Error("Arquivo vazio.");
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      throw new Error(`JSON inválido: ${parseErr.message}. Verifique se o arquivo foi exportado pela página "Automação de OS".`);
    }
    const itens = Array.isArray(data)
      ? data
      : Array.isArray(data?.itens)
        ? data.itens
        : Array.isArray(data?.resultados)
          ? data.resultados
          : null;
    if (!itens || itens.length === 0) throw new Error("JSON não contém 'itens' com OS.");
    const faltando = itens.find((i) => !i || !i.numeroOS || !i.dataHoraInicio || !i.dataHoraFim);
    if (faltando) throw new Error("Cada item precisa de numeroOS, dataHoraInicio e dataHoraFim.");
    loteCarregado = itens;
    await chrome.storage.local.set({ lote: itens });
    loteInfoEl.textContent = `${itens.length} OS carregadas · ${new Set(itens.map((i) => i.categoria)).size} categoria(s).`;
    loteInfoEl.classList.add("ok");
    log(`Lote importado: ${itens.length} OS.`, "ok");
  } catch (err) {
    log(`Erro ao importar: ${err.message}`, "err");
  } finally {
    e.target.value = "";
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
async function iniciar(retomarDe = 0) {
  const usuario = $("usuario").value.trim();
  const senha = $("senha").value;
  if (!usuario || !senha) return log("Salve as credenciais antes.", "err");
  if (!loteCarregado || loteCarregado.length === 0) return log("Importe um lote JSON.", "err");

  if (retomarDe === 0) resultados = [];
  await chrome.storage.local.set({ resultados });
  progEl.value = retomarDe > 0 ? Math.round((retomarDe / loteCarregado.length) * 100) : 0;
  statusEl.textContent = retomarDe > 0 ? `Retomando da OS ${retomarDe + 1}…` : "Abrindo Prisma4…";
  $("iniciarBtn").disabled = true;
  $("pausarBtn").disabled = false;
  $("pausarBtn").textContent = "⏸ Pausar";
  $("pausarBtn").dataset.state = "running";
  $("pararBtn").disabled = false;
  if ($("retomarBtn")) $("retomarBtn").disabled = true;

  await chrome.runtime.sendMessage({
    type: "APONTAUTO_START",
    payload: { usuario, senha, lote: loteCarregado, retomarDe },
  });
}

$("iniciarBtn").onclick = () => iniciar(0);

$("pausarBtn").onclick = async () => {
  const btn = $("pausarBtn");
  if (btn.dataset.state === "paused") {
    await chrome.runtime.sendMessage({ type: "APONTAUTO_RESUME" });
    btn.textContent = "⏸ Pausar";
    btn.dataset.state = "running";
    statusEl.textContent = "Retomando…";
  } else {
    await chrome.runtime.sendMessage({ type: "APONTAUTO_PAUSE" });
    btn.textContent = "▶ Retomar";
    btn.dataset.state = "paused";
    statusEl.textContent = "Pausado.";
  }
};

$("pararBtn").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "APONTAUTO_STOP" });
  statusEl.textContent = "Cancelado.";
  $("iniciarBtn").disabled = false;
  $("pausarBtn").disabled = true;
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
    chrome.storage.local.set({ resultados });
  } else if (msg?.type === "APONTAUTO_DONE") {
    $("iniciarBtn").disabled = false;
    $("pausarBtn").disabled = true;
    $("pausarBtn").textContent = "⏸ Pausar";
    $("pausarBtn").dataset.state = "running";
    $("pararBtn").disabled = true;
    const ok = resultados.filter((r) => r.status === "concluido").length;
    statusEl.textContent = `Concluído: ${ok}/${resultados.length}`;
    log("Automação finalizada.", "ok");
    // Se sobrou trabalho, habilita retomar
    if (loteCarregado && resultados.length < loteCarregado.length && $("retomarBtn")) {
      $("retomarBtn").disabled = false;
    }
  }
});

// Retomar (aparece se houver botão no HTML)
if ($("retomarBtn")) {
  $("retomarBtn").onclick = () => {
    const proxIdx = resultados.length;
    iniciar(proxIdx);
  };
}

// ---------- Restaurar resultados salvos ----------
(async () => {
  const { resultados: salvos } = await chrome.storage.local.get("resultados");
  if (Array.isArray(salvos) && salvos.length) {
    resultados = salvos;
    const ok = salvos.filter((r) => r.status === "concluido").length;
    statusEl.textContent = `Última execução: ${ok}/${salvos.length}`;
    if (loteCarregado && salvos.length < loteCarregado.length && $("retomarBtn")) {
      $("retomarBtn").disabled = false;
    }
  }
})();

// ---------- Exportar relatório ----------
function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

$("exportarLog").onclick = () => {
  const payload = {
    geradoEm: new Date().toISOString(),
    resumo: {
      total: resultados.length,
      concluidas: resultados.filter((r) => r.status === "concluido").length,
      erros: resultados.filter((r) => r.status === "erro").length,
    },
    resultados,
    log: logEl.innerText,
  };
  baixar(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `apontauto-relatorio-${Date.now()}.json`,
  );
};

if ($("exportarCsv")) {
  $("exportarCsv").onclick = () => {
    const linhas = [["indice", "os", "status", "duracao_seg", "mensagem"]];
    for (const r of resultados) {
      linhas.push([
        r.indice ?? "",
        r.os ?? "",
        r.status ?? "",
        r.duracaoSeg ?? "",
        (r.mensagem ?? "").replace(/"/g, '""'),
      ]);
    }
    const csv = linhas.map((l) => l.map((c) => `"${String(c)}"`).join(",")).join("\n");
    baixar(new Blob([csv], { type: "text/csv;charset=utf-8" }), `apontauto-relatorio-${Date.now()}.csv`);
  };
}
