// ============================================================
// Apont Auto — Painel Prisma · service worker
// Faz polling da tabela prisma_lotes (status = pendente) e
// dispara o content-script na aba autenticada do Prisma4.
// ============================================================

const VERSAO = "2.0.0";
const INTERVALO_POLLING_MIN = 0.5; // 30s
const HORA_INICIO_JORNADA = 8;

// ---------------------------------------------------------------
// Config + auth helpers
// ---------------------------------------------------------------
async function getConfig() {
  return chrome.storage.local.get([
    "supabaseUrl",
    "anonKey",
    "accessToken",
    "refreshToken",
    "expiresAt",
    "userId",
    "userEmail",
    "prismaUrlPattern",
    "automacaoAtiva",
  ]);
}

async function setConfig(patch) {
  await chrome.storage.local.set(patch);
}

async function refreshTokenIfNeeded(cfg) {
  if (!cfg.refreshToken || !cfg.expiresAt) return cfg;
  const agora = Math.floor(Date.now() / 1000);
  if (cfg.expiresAt - agora > 60) return cfg;
  const r = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: cfg.refreshToken }),
  });
  if (!r.ok) throw new Error("Falha ao renovar sessão Supabase. Faça login novamente no popup.");
  const j = await r.json();
  const patch = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
  };
  await setConfig(patch);
  return { ...cfg, ...patch };
}

async function sbFetch(path, { method = "GET", body, cfg } = {}) {
  const c = await refreshTokenIfNeeded(cfg || (await getConfig()));
  const headers = {
    apikey: c.anonKey,
    "Content-Type": "application/json",
  };
  if (c.accessToken) headers.Authorization = `Bearer ${c.accessToken}`;
  if (method !== "GET") headers.Prefer = "return=representation";
  const r = await fetch(`${c.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase ${method} ${path} → ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.json();
}

// ---------------------------------------------------------------
// Heartbeat + logs
// ---------------------------------------------------------------
async function heartbeat(cfg) {
  try {
    await sbFetch("prisma_extensao_status", {
      method: "POST",
      cfg,
      body: {
        user_id: cfg.userId,
        ultima_atividade: new Date().toISOString(),
        versao: VERSAO,
      },
    }).catch(async () => {
      // upsert manual (POST falha se já existe): tenta PATCH
      await sbFetch(`prisma_extensao_status?user_id=eq.${cfg.userId}`, {
        method: "PATCH",
        cfg,
        body: { ultima_atividade: new Date().toISOString(), versao: VERSAO },
      });
    });
  } catch (e) {
    console.warn("heartbeat", e.message);
  }
}

async function log(cfg, loteId, itemId, etapa, status, mensagem) {
  try {
    await sbFetch("prisma_execucao_logs", {
      method: "POST",
      cfg,
      body: [
        {
          user_id: cfg.userId,
          lote_id: loteId,
          os_item_id: itemId,
          etapa,
          status,
          mensagem: String(mensagem || "").slice(0, 500),
        },
      ],
    });
  } catch (e) {
    console.warn("log", e.message);
  }
}

// ---------------------------------------------------------------
// Agendamento (mesma lógica do script Playwright)
// ---------------------------------------------------------------
function ehDiaUtil(d) {
  const s = d.getDay();
  return s !== 0 && s !== 6;
}
function proximoDiaUtil(d) {
  const n = new Date(d);
  n.setDate(n.getDate() + 1);
  while (!ehDiaUtil(n)) n.setDate(n.getDate() + 1);
  return n;
}
function fmtData(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtHora(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function gerarAgendamento(itens, dataInicioIso, horaLimiteStr, duracaoHoras) {
  const dataInicio = new Date(dataInicioIso);
  let dia = ehDiaUtil(dataInicio) ? new Date(dataInicio) : proximoDiaUtil(dataInicio);
  const [hLimit, mLimit] = horaLimiteStr.split(":").map((x) => parseInt(x, 10));
  const minLimite = hLimit * 60 + (mLimit || 0);
  const minInicioJornada = HORA_INICIO_JORNADA * 60;
  let minutos = dataInicio.getHours() * 60 + dataInicio.getMinutes();
  if (minutos < minInicioJornada || minutos >= minLimite) minutos = minInicioJornada;

  const dur = Math.round(duracaoHoras * 60);
  return itens.map((it) => {
    if (minutos + dur > minLimite) {
      dia = proximoDiaUtil(dia);
      minutos = minInicioJornada;
    }
    const dataHoraInicio = `${fmtData(dia)} ${fmtHora(minutos)}`;
    const dataHoraFim = `${fmtData(dia)} ${fmtHora(minutos + dur)}`;
    minutos += dur;
    return { ...it, dataHoraInicio, dataHoraFim };
  });
}

// ---------------------------------------------------------------
// Aba do Prisma
// ---------------------------------------------------------------
async function encontrarOuAbrirAba(padrao) {
  const abas = await chrome.tabs.query({ url: padrao });
  if (abas.length > 0) {
    await chrome.tabs.update(abas[0].id, { active: true });
    return abas[0];
  }
  const urlBase = padrao.replace(/\*/g, "");
  return chrome.tabs.create({ url: urlBase });
}

async function garantirContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (e) {
    console.warn("inject", e.message);
  }
}

async function enviarMensagemComRetry(tabId, msg, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (e) {
      await garantirContentScript(tabId);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Não consegui comunicar com a aba do Prisma. Verifique se ela está aberta e logada.");
}

// ---------------------------------------------------------------
// Ciclo principal
// ---------------------------------------------------------------
let executando = false;

async function processarLote(cfg, lote) {
  await sbFetch(`prisma_lotes?id=eq.${lote.id}`, {
    method: "PATCH",
    cfg,
    body: { status: "em_execucao", iniciado_em: new Date().toISOString() },
  });
  await log(cfg, lote.id, null, "inicio", "info", "Lote capturado pela extensão.");

  const itens = await sbFetch(`prisma_os_itens?lote_id=eq.${lote.id}&order=ordem.asc`, { cfg });
  const linksTecs = await sbFetch(
    `prisma_lote_tecnicos?lote_id=eq.${lote.id}&select=tecnico:prisma_tecnicos(nome,matricula)`,
    { cfg },
  );
  const tecnicos = (linksTecs || [])
    .map((r) => r.tecnico?.matricula || r.tecnico?.nome)
    .filter(Boolean);

  if (tecnicos.length === 0) {
    await log(cfg, lote.id, null, "config", "erro", "Lote sem técnicos.");
    await sbFetch(`prisma_lotes?id=eq.${lote.id}`, {
      method: "PATCH",
      cfg,
      body: { status: "erro", finalizado_em: new Date().toISOString() },
    });
    return;
  }

  const agendados = gerarAgendamento(itens, lote.data_inicio, lote.hora_limite_jornada, Number(lote.duracao_padrao_horas));

  const aba = await encontrarOuAbrirAba(cfg.prismaUrlPattern || "https://*.cimogps.com.br/*");
  await new Promise((r) => setTimeout(r, 1500));
  await garantirContentScript(aba.id);

  let houveErro = false;

  for (const item of agendados) {
    await sbFetch(`prisma_os_itens?id=eq.${item.id}`, {
      method: "PATCH",
      cfg,
      body: { status: "em_execucao", iniciado_em: new Date().toISOString() },
    });
    await log(cfg, lote.id, item.id, "os", "info", `Processando OS ${item.numero_os}...`);

    try {
      const res = await enviarMensagemComRetry(aba.id, {
        tipo: "PROCESSAR_OS",
        payload: {
          numeroOS: item.numero_os,
          categoria: lote.categoria,
          tecnicos,
          dataHoraInicio: item.dataHoraInicio,
          dataHoraFim: item.dataHoraFim,
          duracaoHoras: Number(lote.duracao_padrao_horas),
        },
      });
      if (!res?.sucesso) throw new Error(res?.erro || "Falha desconhecida");
      await sbFetch(`prisma_os_itens?id=eq.${item.id}`, {
        method: "PATCH",
        cfg,
        body: { status: "concluido", finalizado_em: new Date().toISOString() },
      });
      await log(cfg, lote.id, item.id, "os", "sucesso", `OS ${item.numero_os} concluída.`);
    } catch (e) {
      houveErro = true;
      await sbFetch(`prisma_os_itens?id=eq.${item.id}`, {
        method: "PATCH",
        cfg,
        body: { status: "erro", mensagem_erro: e.message, finalizado_em: new Date().toISOString() },
      });
      await log(cfg, lote.id, item.id, "os", "erro", e.message);
    }
  }

  await sbFetch(`prisma_lotes?id=eq.${lote.id}`, {
    method: "PATCH",
    cfg,
    body: {
      status: houveErro ? "erro" : "concluido",
      finalizado_em: new Date().toISOString(),
    },
  });
  await log(cfg, lote.id, null, "fim", houveErro ? "erro" : "sucesso", "Lote finalizado.");
}

async function ciclo() {
  if (executando) return;
  let cfg;
  try {
    cfg = await getConfig();
  } catch (_) {
    return;
  }
  if (!cfg.automacaoAtiva || !cfg.supabaseUrl || !cfg.anonKey || !cfg.accessToken || !cfg.userId) return;

  try {
    cfg = await refreshTokenIfNeeded(cfg);
    await heartbeat(cfg);
    const pendentes = await sbFetch(
      `prisma_lotes?status=eq.pendente&user_id=eq.${cfg.userId}&order=criado_em.asc&limit=1`,
      { cfg },
    );
    if (pendentes && pendentes.length > 0) {
      executando = true;
      try {
        await processarLote(cfg, pendentes[0]);
      } finally {
        executando = false;
      }
    }
  } catch (e) {
    console.error("ciclo", e);
  }
}

chrome.alarms.create("prisma-polling", { periodInMinutes: INTERVALO_POLLING_MIN });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "prisma-polling") ciclo();
});

// Roda ao iniciar
chrome.runtime.onStartup.addListener(() => ciclo());
chrome.runtime.onInstalled.addListener(() => ciclo());

// Permite disparo manual pelo popup
chrome.runtime.onMessage.addListener((msg, _s, respond) => {
  if (msg?.tipo === "DISPARAR_CICLO") {
    ciclo().then(() => respond({ ok: true })).catch((e) => respond({ ok: false, erro: e.message }));
    return true;
  }
});
