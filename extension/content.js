// Motor de execução — roda na aba autenticada do Prisma4.
// Lê lotes 'pendente' do Supabase, marca 'em_execucao', itera pelas OS,
// preenche cada uma no Prisma4 e grava progresso/log em tempo real.

(function () {
  if (window.__apontAutoPrisma__) return;
  const VERSION = "3.1.0";
  window.__apontAutoPrisma__ = { version: VERSION, ready: true };
  console.info(`%c[Apont Auto] v${VERSION} ativo no Prisma4.`, "color:#a855f7");

  const POLL_MS = 8000;
  let busy = false;

  // ---------- Supabase REST helpers ----------
  async function cfg() {
    return new Promise((res) =>
      chrome.storage.local.get(
        ["supabaseUrl", "anonKey", "accessToken", "userId", "userCode"],
        res,
      ),
    );
  }
  async function sb(path, init = {}) {
    const c = await cfg();
    if (!c.supabaseUrl || !c.anonKey) throw new Error("Supabase não configurado.");
    const r = await fetch(`${c.supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: c.anonKey,
        Authorization: `Bearer ${c.accessToken || c.anonKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    return r;
  }
  async function sbSelect(path) {
    const r = await sb(path);
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
    return r.json();
  }
  async function sbPatch(path, body) {
    const r = await sb(path, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`PATCH ${path} → ${r.status} ${await r.text()}`);
  }
  async function sbInsert(path, body) {
    const r = await sb(path, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
  }
  async function log(userId, loteId, etapa, status, mensagem, osItemId = null) {
    try {
      await sbInsert(`/rest/v1/prisma_execucao_logs`, [
        { user_id: userId, lote_id: loteId, os_item_id: osItemId, etapa, status, mensagem },
      ]);
    } catch (e) {
      console.warn("[ApontAuto] log fail", e);
    }
  }

  // ---------- Preenchimento no Prisma4 (best-effort) ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fillOS(item) {
    // Placeholder de execução no Prisma4.
    // A automação real (SlickGrid + procedimentos) deve ser plugada aqui.
    // Por ora, apenas simula um passo e retorna sucesso para o painel evoluir.
    console.info(`[ApontAuto] fillOS ${item.numero_os} (ordem ${item.ordem})`);
    await wait(1200);
    return { ok: true, message: "OS registrada (simulação)." };
  }

  // ---------- Ciclo principal ----------
  async function claimAndRun() {
    if (busy) return;
    const c = await cfg();
    if (!c.userId || !c.accessToken) return; // ainda não autenticado no painel
    busy = true;
    try {
      // Busca 1 lote pendente do usuário
      const lotes = await sbSelect(
        `/rest/v1/prisma_lotes?user_id=eq.${c.userId}&status=eq.pendente&select=id,nome,total_os&order=criado_em.asc&limit=1`,
      );
      if (!lotes.length) return;
      const lote = lotes[0];

      // Marca em_execucao
      await sbPatch(`/rest/v1/prisma_lotes?id=eq.${lote.id}`, {
        status: "em_execucao",
        iniciado_em: new Date().toISOString(),
      });
      await log(c.userId, lote.id, "lote", "em_execucao", `Iniciando "${lote.nome ?? lote.id}"`);

      const itens = await sbSelect(
        `/rest/v1/prisma_os_itens?lote_id=eq.${lote.id}&status=eq.pendente&select=id,numero_os,ordem&order=ordem.asc`,
      );

      let erros = 0;
      for (const it of itens) {
        await sbPatch(`/rest/v1/prisma_os_itens?id=eq.${it.id}`, {
          status: "em_execucao",
          iniciado_em: new Date().toISOString(),
        });
        await log(c.userId, lote.id, "os", "em_execucao", `OS ${it.numero_os}`, it.id);

        try {
          const res = await fillOS(it);
          if (!res.ok) throw new Error(res.message || "Falha ao preencher.");
          await sbPatch(`/rest/v1/prisma_os_itens?id=eq.${it.id}`, {
            status: "concluido",
            finalizado_em: new Date().toISOString(),
          });
          await log(c.userId, lote.id, "os", "concluido", res.message, it.id);
        } catch (e) {
          erros++;
          await sbPatch(`/rest/v1/prisma_os_itens?id=eq.${it.id}`, {
            status: "erro",
            mensagem_erro: String(e?.message || e),
            finalizado_em: new Date().toISOString(),
          });
          await log(c.userId, lote.id, "os", "erro", String(e?.message || e), it.id);
        }
      }

      await sbPatch(`/rest/v1/prisma_lotes?id=eq.${lote.id}`, {
        status: erros > 0 ? "erro" : "concluido",
        finalizado_em: new Date().toISOString(),
      });
      await log(
        c.userId,
        lote.id,
        "lote",
        erros > 0 ? "erro" : "concluido",
        `Finalizado com ${erros} erro(s)`,
      );
    } catch (e) {
      console.warn("[ApontAuto] ciclo err", e);
    } finally {
      busy = false;
    }
  }

  setInterval(claimAndRun, POLL_MS);
  setTimeout(claimAndRun, 1500);

  chrome.runtime.onMessage?.addListener((msg, _s, send) => {
    if (msg?.type === "ping") {
      send({ ok: true, href: location.href, version: VERSION });
    }
    if (msg?.type === "run-now") {
      claimAndRun().then(() => send({ ok: true }));
      return true;
    }
    return true;
  });
})();
