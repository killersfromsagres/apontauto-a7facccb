// Automação Prisma4 executada 100% no navegador — porte fiel do meczada.js.
// Consome lotes de chrome.storage.local (fila enviada pelo painel Apont Auto).

(function () {
  if (window.__apontautoPrisma4__) return;
  const VERSION = "1.0.0";
  window.__apontautoPrisma4__ = { version: VERSION };
  console.info(`%c[Apont Auto] Automação Prisma4 v${VERSION} ativa.`, "color:#10b981;font-weight:600");

  const TEMPO_TRABALHO_PADRAO_HORAS = 1;
  const JORNADA_INI = 8, JORNADA_FIM = 17;

  // ---------- helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtData = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const fmtHM = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  const ehDiaUtil = (d) => { const w = d.getDay(); return w !== 0 && w !== 6; };
  const proxDiaUtil = (d) => { const n = new Date(d); n.setDate(n.getDate() + 1); while (!ehDiaUtil(n)) n.setDate(n.getDate() + 1); return n; };

  function log(msg) {
    const h = new Date().toLocaleTimeString("pt-BR");
    console.log(`[${h}] [ApontAuto] ${msg}`);
  }

  // Aguarda condição booleana com timeout.
  async function waitFor(fn, { timeout = 15000, interval = 150, desc = "" } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { const r = fn(); if (r) return r; } catch { /* noop */ }
      await sleep(interval);
    }
    throw new Error(`Timeout aguardando ${desc || "condição"}`);
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function findByText(text, tag = "*", root = document) {
    const t = text.trim().toLowerCase();
    const els = root.querySelectorAll(tag);
    for (const el of els) {
      const inner = (el.textContent || "").trim().toLowerCase();
      if (inner === t || inner.includes(t)) return el;
    }
    return null;
  }

  async function fillReactive(el, value) {
    el.focus();
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    // Digita caractere por caractere para inputs de máscara/autocomplete.
    for (const ch of String(value)) {
      el.value += ch;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
      await sleep(30);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function pressEnter(el) {
    ["keydown", "keypress", "keyup"].forEach((type) => {
      el.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    });
  }

  // ---------- agendamento ----------
  function gerarAgendamento(lista, dataInicial) {
    const jIniMin = JORNADA_INI * 60, jFimMin = JORNADA_FIM * 60;
    let dia = new Date(dataInicial);
    if (!ehDiaUtil(dia)) dia = proxDiaUtil(dia);
    let cur = dia.getHours() * 60 + dia.getMinutes();
    if (cur < jIniMin || cur >= jFimMin) cur = jIniMin;

    return lista.map((item) => {
      const horas = item.tempoTrabalhoHoras || TEMPO_TRABALHO_PADRAO_HORAS;
      const durMin = Math.round(horas * 60);
      if (cur >= jFimMin) { dia = proxDiaUtil(dia); cur = jIniMin; }
      const inicio = `${fmtData(dia)} ${fmtHM(cur)}`;
      const fimMin = cur + durMin;
      const fim = `${fmtData(dia)} ${fmtHM(fimMin)}`;
      cur = fimMin;
      return { ...item, dataHoraInicio: inicio, dataHoraFim: fim };
    });
  }

  // ---------- login ----------
  function isLoginPage() {
    return /Login/i.test(location.pathname) || !!document.querySelector('input[name*="User" i], input[name*="Usu" i]');
  }

  async function tentarLogin(cred) {
    if (!cred?.usuario || !cred?.senha) throw new Error("Credenciais não configuradas no popup.");
    if (!isLoginPage()) {
      location.href = "https://cimogps.com.br/Prisma4/AccountCustom/Login?ReturnUrl=%2fPrisma4";
      await sleep(1500);
    }
    const user = await waitFor(
      () => $$('input').find((i) => /usu/i.test(i.name || "") || /usu/i.test(i.placeholder || "")),
      { desc: "input de usuário" },
    );
    const pass = await waitFor(
      () => $$('input[type="password"]').find(Boolean),
      { desc: "input de senha" },
    );
    await fillReactive(user, cred.usuario);
    await fillReactive(pass, cred.senha);
    const btn = findByText("OK", "button") || $$('button').find((b) => /ok|entrar|login/i.test(b.textContent || ""));
    btn?.click();
    await waitFor(() => !isLoginPage(), { timeout: 15000, desc: "logout da tela de login" });
    await sleep(1000);
  }

  // ---------- navegação para OS Completa ----------
  async function abrirOSCompleta() {
    log("Abrindo Ordens de Serviço > Registro > OS Completa…");
    const menuOS = await waitFor(
      () => $$('a').find((a) => /Ordens de Serviço/i.test(a.textContent || "")),
      { desc: 'menu "Ordens de Serviço"' },
    );
    menuOS.click();
    const registro = await waitFor(
      () => $$('a').find((a) => /^\s*Registro\s*$/i.test((a.textContent || "").trim())),
      { desc: 'submenu "Registro"' },
    );
    registro.click();
    const osCompleta = await waitFor(
      () => $$('a').find((a) => /OS Completa/i.test(a.textContent || "")),
      { desc: 'link "OS Completa"' },
    );
    osCompleta.click();
    await waitFor(() => $('#TBWorkOrder'), { desc: "campo #TBWorkOrder" });
  }

  async function preencherNumeroOS(numeroOS) {
    log(`Preenchendo OS ${numeroOS}…`);
    const tb = await waitFor(() => $('#TBWorkOrder'), { desc: "#TBWorkOrder" });
    await fillReactive(tb, numeroOS);
    const tab = $('#tabWorkOrderCreation1 > div:nth-child(2)');
    tab?.click();
    await sleep(1000);
  }

  async function marcarEstadoConcluido() {
    log("Marcando estado CONCLUÍDO…");
    const helpBtn = await waitFor(
      () => $('div:nth-child(13) > div:nth-child(2) > .sp-input-cluster-section.code > .sp-input-cluster-container-wrapper > .sp-input-button > .sp-input-cluster-help-button'),
      { desc: "botão ajuda estado OS" },
    );
    helpBtn.click();
    const opt = await waitFor(() => findByText("CONCLUÍDO"), { desc: 'opção "CONCLUÍDO"' });
    opt.click();
    await sleep(500);
  }

  // ---------- Mão-de-Obra ----------
  async function esperarLinhas(seletorGrid, qty, timeout = 10000) {
    return waitFor(
      () => $$(`${seletorGrid} .slick-row`).length >= qty ? $$(`${seletorGrid} .slick-row`).length : null,
      { timeout, desc: `${qty} linha(s) em ${seletorGrid}` },
    );
  }

  async function adicionarMaoDeObra(item, codigoUsuarioLogado) {
    const { colaboradores, dataHoraInicio, dataHoraFim, tempoTrabalhoHoras } = item;
    const duracao = tempoTrabalhoHoras || TEMPO_TRABALHO_PADRAO_HORAS;
    const seletorGrid = "#GWorkOrderWorkerLabor";

    log("Abrindo aba Mão-de-Obra por OS…");
    const abaLi = await waitFor(
      () => $$('li').find((li) => /Mão-de-Obra por OS/i.test(li.textContent || "")),
      { desc: 'aba "Mão-de-Obra por OS"' },
    );
    abaLi.click();
    await sleep(400);

    for (let i = 0; i < colaboradores.length; i++) {
      log(`Adicionar Linha (${i + 1}/${colaboradores.length})…`);
      const addBtn = await waitFor(() => $('.grid-btn'), { desc: '"Adicionar Linha"' });
      addBtn.click();
      await esperarLinhas(seletorGrid, i + 1);
      await sleep(200);
    }

    for (let i = 0; i < colaboradores.length; i++) {
      const valorTecnico = colaboradores[i];
      log(`Técnico linha ${i + 1}: "${valorTecnico}"`);

      // Clica na célula do técnico (que abre o input CLaborWorkerW)
      const grid = $(seletorGrid);
      const celula = grid && $$('.cell-content', grid).find((c) => (c.textContent || "").trim() === String(codigoUsuarioLogado));
      (celula || grid.querySelector('.slick-cell.l3 .cell-content'))?.click();

      const inputTec = await waitFor(() => $('#CLaborWorkerW'), { desc: "#CLaborWorkerW" });
      inputTec.focus();
      inputTec.select?.();
      await fillReactive(inputTec, valorTecnico);
      await pressEnter(inputTec);
      await sleep(400);

      log(`Data Início linha ${i + 1}: "${dataHoraInicio}"`);
      const celData = $$('.slick-cell.l6 .cell-content')[i];
      celData?.click();
      const inputData = await waitFor(() => $('#CLaborInitDateW'), { desc: "#CLaborInitDateW" });
      inputData.focus();
      inputData.value = "";
      await fillReactive(inputData, dataHoraInicio);
      await pressEnter(inputData);
      await sleep(400);

      log(`Tempo linha ${i + 1}: ${duracao}h`);
      const celTempo = $$('.slick-cell.l8 .cell-content')[i];
      celTempo?.click();
      const inputTempo = await waitFor(() => $('#CLaborTimeW'), { desc: "#CLaborTimeW" });
      inputTempo.focus();
      inputTempo.value = "";
      await fillReactive(inputTempo, String(duracao));
      await pressEnter(inputTempo);
      await sleep(1000);
    }

    return dataHoraFim;
  }

  // ---------- Procedimentos ----------
  async function preencherProcedimentos(dataFinal, categoria) {
    log(`Abrindo Procedimentos por OS · Data cabeçalho ${dataFinal}…`);
    const aba = await waitFor(
      () => $$('#formTabs li').find((li) => /Procedimentos por OS/i.test(li.textContent || "")),
      { desc: 'aba "Procedimentos por OS"' },
    );
    aba.click();
    if (!dataFinal) throw new Error("Data final da Mão-de-Obra vazia.");

    const seletorLinhas = "#GWorkOrderOperation .slick-row";
    await waitFor(() => $(seletorLinhas), { timeout: 15000, desc: seletorLinhas });

    const chk = $$('input[type="checkbox"]').find((i) => {
      const lbl = i.closest("label") || document.querySelector(`label[for="${i.id}"]`);
      return /Usar data cabeçalho/i.test((lbl?.textContent || i.getAttribute("aria-label") || ""));
    });
    if (chk && !chk.checked) { chk.click(); await sleep(300); }

    const cab = await waitFor(() => $('#TBHeaderOperationDate'), { desc: "#TBHeaderOperationDate" });
    cab.focus();
    cab.select?.();
    cab.value = "";
    cab.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(100);
    await fillReactive(cab, dataFinal);
    await sleep(300);

    const refDiv = $$('div').find((d) => /Número OS Origem OS/.test(d.textContent || ""));
    refDiv?.click();
    await sleep(500);

    if (categoria === "refrigeracao") {
      const linhas = $$(seletorLinhas);
      for (let i = 0; i < linhas.length; i++) {
        try {
          const linha = linhas[i];
          linha.scrollIntoView({ block: "center", behavior: "instant" });
          const codigo = ($$('.cell-content', linha)[0]?.textContent || "").trim();
          if (!codigo.toUpperCase().startsWith("MED")) continue;

          const celMed = $$('.slick-cell.l11 .cell-content', linha)[0];
          celMed?.click();
          await sleep(150);
          let inp = $('#COperationMeasureValue');
          if (!inp) {
            const evt = new MouseEvent("dblclick", { bubbles: true });
            celMed?.dispatchEvent(evt);
            await sleep(150);
            inp = $('#COperationMeasureValue');
          }
          if (!inp) continue;
          inp.focus();
          inp.value = "";
          await fillReactive(inp, "0");
          await pressEnter(inp);
          await sleep(150);
        } catch (e) {
          log(`Erro ignorado linha ${i + 1}: ${e.message}`);
        }
      }
      const refDiv2 = $$('div').find((d) => /Número OS Origem OS/.test(d.textContent || ""));
      refDiv2?.click();
      await sleep(400);
    }
  }

  async function salvar() {
    log("Salvando OS…");
    const btn = findByText("Salvar", "button") || $$('button, a').find((b) => /Salvar/i.test(b.textContent || ""));
    btn?.click();
    await sleep(2000);
  }

  async function processarOS(item, cred) {
    console.log(`%c=== OS ${item.numeroOS} ===`, "color:#a855f7;font-weight:600");
    const etapas = [
      ["Abrir OS Completa", () => abrirOSCompleta()],
      ["Número OS", () => preencherNumeroOS(item.numeroOS)],
      ["Estado Concluído", () => marcarEstadoConcluido()],
      ["Mão-de-Obra", () => adicionarMaoDeObra(item, cred.usuario)],
    ];
    let dataFinal;
    for (const [etapa, fn] of etapas) {
      try { const r = await fn(); if (etapa === "Mão-de-Obra") dataFinal = r; }
      catch (e) { e.etapa = etapa; throw e; }
    }
    try { await preencherProcedimentos(dataFinal, item.categoria); await salvar(); }
    catch (e) { e.etapa = e.etapa || "Procedimentos/Salvar"; throw e; }
  }

  // ---------- overlay UI ----------
  function ensureOverlay() {
    let root = document.getElementById("apontauto-overlay");
    if (root) return root;
    root = document.createElement("div");
    root.id = "apontauto-overlay";
    root.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;background:rgba(15,15,20,.92);color:#fff;font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.4);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.08);min-width:240px;max-width:320px";
    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="width:8px;height:8px;border-radius:50%;background:#10b981"></span>
        <b style="letter-spacing:.05em">Apont Auto · Prisma4</b>
      </div>
      <div id="apontauto-status" style="color:#a1a1aa">Aguardando lote…</div>
      <div id="apontauto-progress" style="margin-top:6px;color:#e4e4e7"></div>
      <div style="margin-top:10px;display:flex;gap:6px">
        <button id="apontauto-run" style="flex:1;padding:6px 8px;border-radius:8px;border:0;background:linear-gradient(135deg,#10b981,#059669);color:#fff;cursor:pointer;font-weight:600">Executar próximo</button>
        <button id="apontauto-close" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#a1a1aa;cursor:pointer">×</button>
      </div>`;
    document.body.appendChild(root);
    $('#apontauto-close', root).addEventListener("click", () => root.remove());
    $('#apontauto-run', root).addEventListener("click", () => runNext(true));
    return root;
  }

  function setStatus(txt) { const el = document.getElementById("apontauto-status"); if (el) el.textContent = txt; }
  function setProgress(txt) { const el = document.getElementById("apontauto-progress"); if (el) el.textContent = txt; }

  let running = false;
  async function runNext(manual = false) {
    if (running) { setStatus("Já em execução."); return; }
    ensureOverlay();
    const { queue = [], credentials = {} } = await chrome.storage.local.get(["queue", "credentials"]);
    const batch = queue.find((b) => b.status === "pending");
    if (!batch) { setStatus(manual ? "Nenhum lote pendente." : "Aguardando lote…"); return; }
    if (!credentials.usuario || !credentials.senha) {
      setStatus("Configure usuário/senha no popup da extensão.");
      return;
    }
    running = true;
    try {
      setStatus(`Executando lote (${batch.os?.length || 0} OS)`);
      if (isLoginPage()) { setStatus("Fazendo login…"); await tentarLogin(credentials); }

      const codigo = credentials.usuario;
      const lista = (batch.os || []).flatMap((numeroOS) =>
        (batch.colaboradores?.length ? [batch.colaboradores] : [[codigo]]).map((tecs) => ({
          numeroOS, colaboradores: tecs, categoria: batch.categoria || "refrigeracao",
          tempoTrabalhoHoras: batch.tempoTrabalhoHoras || 1,
        })),
      );
      const inicial = batch.dataInicio ? new Date(batch.dataInicio) : new Date();
      const agendada = gerarAgendamento(lista, inicial);

      const resultados = [];
      for (let i = 0; i < agendada.length; i++) {
        const it = agendada[i];
        setProgress(`OS ${i + 1}/${agendada.length}: ${it.numeroOS}`);
        try { await processarOS(it, credentials); resultados.push({ os: it.numeroOS, status: "concluido" }); }
        catch (e) {
          console.error("[ApontAuto] erro", e);
          resultados.push({ os: it.numeroOS, status: "erro", etapa: e.etapa, mensagem: e.message });
        }
      }

      const sucesso = resultados.filter((r) => r.status === "concluido").length;
      const erro = resultados.filter((r) => r.status === "erro").length;
      setStatus(`Lote concluído · ${sucesso}✓ ${erro}✗`);
      setProgress("");
      console.table(resultados);
      chrome.runtime.sendMessage({
        type: "apontauto:update-status",
        id: batch.id,
        patch: { status: erro > 0 ? "error" : "done", finishedAt: new Date().toISOString(), resultados },
      });
    } catch (e) {
      console.error("[ApontAuto] fatal", e);
      setStatus(`Erro: ${e.message}`);
      chrome.runtime.sendMessage({
        type: "apontauto:update-status", id: batch.id,
        patch: { status: "error", finishedAt: new Date().toISOString(), erro: e.message },
      });
    } finally { running = false; }
  }

  // Auto-inicia se houver lote pendente ao abrir Prisma4.
  ensureOverlay();
  chrome.storage.local.get(["queue"]).then(({ queue = [] }) => {
    const pending = queue.filter((b) => b.status === "pending").length;
    if (pending > 0) {
      setStatus(`${pending} lote(s) pendente(s). Clique em "Executar próximo".`);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.queue) return;
    const pending = (changes.queue.newValue || []).filter((b) => b.status === "pending").length;
    if (pending > 0 && !running) setStatus(`${pending} lote(s) pendente(s). Clique em "Executar próximo".`);
  });
})();
