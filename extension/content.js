// Content script — executa a automação dentro da página do Prisma4.
// Replica o fluxo de apontamento-prisma4.js (Playwright) usando DOM nativo.
(() => {
  if (window.__apontautoRunning) return;
  window.__apontautoRunning = true;

  let STOP = false;
  let PAUSED = false;

  function send(msg) {
    try { chrome.runtime.sendMessage(msg); } catch (_) {}
  }
  function log(msg, kind = "") { send({ type: "APONTAUTO_LOG", msg, kind }); }
  function progress(percent, status) { send({ type: "APONTAUTO_PROGRESS", percent, status }); }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitWhilePaused() {
    while (PAUSED && !STOP) await sleep(300);
  }

  async function waitFor(pred, { timeout = 10000, interval = 200, msg = "condição" } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (STOP) throw new Error("Cancelado pelo usuário.");
      const v = await pred();
      if (v) return v;
      await sleep(interval);
    }
    throw new Error(`Timeout esperando: ${msg}`);
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  async function waitEl(sel, opts) {
    return waitFor(() => $(sel), { msg: `seletor ${sel}`, ...opts });
  }

  function findByText(text, tag = "*") {
    const t = text.trim();
    return $$(tag).find((el) => (el.textContent || "").trim() === t);
  }

  function findContainsText(text, tag = "*") {
    const t = text.trim().toLowerCase();
    return $$(tag).find((el) => (el.textContent || "").trim().toLowerCase().includes(t));
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function typeSequentially(el, text, delay = 40) {
    el.focus();
    setNativeValue(el, "");
    for (const ch of text) {
      if (STOP) throw new Error("Cancelado.");
      setNativeValue(el, el.value + ch);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
      await sleep(delay);
    }
  }

  async function pressEnter(el) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
  }

  // ---------------- Login ----------------
  async function login(usuario, senha) {
    log("Verificando página de login…", "info");
    const isLoginPage = location.pathname.toLowerCase().includes("login");
    if (isLoginPage) {
      const userInput = await waitEl('input[name="Usuario"], input[name="usuario"], #Usuario, #usuario', { timeout: 15000 });
      const passInput = $('input[type="password"]');
      if (!userInput || !passInput) throw new Error("Campos de login não encontrados.");
      setNativeValue(userInput, usuario);
      setNativeValue(passInput, senha);
      const okBtn = findByText("OK", "button") || findContainsText("OK", "button") || $('button[type="submit"], input[type="submit"]');
      if (!okBtn) throw new Error("Botão OK não encontrado.");
      okBtn.click();
      log("Login enviado, aguardando dashboard…", "info");
      await waitFor(() => findContainsText("Ordens de Serviço", "a"), { timeout: 20000, msg: "menu Ordens de Serviço" });
    } else {
      log("Sessão já ativa.", "ok");
    }
  }

  // ------------- Navegação -------------
  async function abrirOSCompleta() {
    log("Navegando: Ordens de Serviço → Registro → OS Completa…", "info");
    const menu = findContainsText("Ordens de Serviço", "a");
    if (!menu) throw new Error("Menu 'Ordens de Serviço' não encontrado.");
    menu.click();
    await sleep(400);
    let registro = findContainsText("Registro", "a");
    if (!registro) {
      menu.click();
      await sleep(600);
      registro = await waitFor(() => findContainsText("Registro", "a"), { timeout: 10000, msg: "link Registro" });
    }
    registro.click();
    await sleep(400);
    const osCompleta = await waitFor(() => findContainsText("OS Completa", "a"), { timeout: 10000, msg: "link OS Completa" });
    osCompleta.click();
    await waitEl("#TBWorkOrder", { timeout: 15000 });
    await sleep(500);
  }

  async function preencherNumeroOS(numeroOS) {
    log(`OS ${numeroOS}: preenchendo número…`, "info");
    const inp = await waitEl("#TBWorkOrder");
    setNativeValue(inp, numeroOS);
    // Clique fora para disparar o load
    const alvo = $("#tabWorkOrderCreation1 > div:nth-child(2)") || document.body;
    alvo.click();
    await sleep(1500);
  }

  async function marcarEstadoConcluido() {
    log("Marcando Estado como CONCLUÍDO…", "info");
    const btn = $("div:nth-child(13) > div:nth-child(2) > .sp-input-cluster-section.code > .sp-input-cluster-container-wrapper > .sp-input-button > .sp-input-cluster-help-button");
    if (!btn) throw new Error("Botão de estado não encontrado.");
    btn.click();
    const concluido = await waitFor(() => findByText("CONCLUÍDO"), { timeout: 6000, msg: "opção CONCLUÍDO" });
    concluido.click();
    await sleep(400);
  }

  // ------------- Mão-de-Obra -------------
  async function esperarLinhas(gridSel, n) {
    await waitFor(() => $$(`${gridSel} .slick-row`).length >= n, {
      timeout: 12000,
      msg: `${n} linha(s) em ${gridSel}`,
    });
  }

  async function adicionarMaoDeObra(item, usuarioLogado) {
    const { colaboradores, dataHoraInicio } = item;
    const duracao = Number(item.tempoTrabalhoHoras) > 0 ? Number(item.tempoTrabalhoHoras) : 1;
    const gridSel = "#GWorkOrderWorkerLabor";
    log("Abrindo aba Mão-de-Obra por OS…", "info");
    const abaMO = $$("li").find((li) => (li.textContent || "").includes("Mão-de-Obra por OS"));
    if (!abaMO) throw new Error("Aba Mão-de-Obra não encontrada.");
    abaMO.click();
    await sleep(500);

    const lista = colaboradores.length ? colaboradores : [usuarioLogado];
    for (let i = 0; i < lista.length; i++) {
      const addBtn = $(".grid-btn");
      if (!addBtn) throw new Error("Botão adicionar linha não encontrado.");
      addBtn.click();
      await esperarLinhas(gridSel, i + 1);
    }

    for (let i = 0; i < lista.length; i++) {
      const valorTec = lista[i];
      log(`Linha ${i + 1}: técnico "${valorTec}"…`, "info");

      // Clica na célula do técnico (procura pelo código do usuário logado exibido por padrão)
      const grid = $(gridSel);
      const celTec = $$(".cell-content", grid).find((c) => (c.textContent || "").trim() === usuarioLogado);
      if (celTec) celTec.click();
      else $$(`${gridSel} .slick-row`)[i]?.querySelector(".slick-cell")?.click();
      const inputTec = await waitEl("#CLaborWorkerW", { timeout: 6000 });
      setNativeValue(inputTec, "");
      await typeSequentially(inputTec, valorTec, 30);
      await pressEnter(inputTec);
      await sleep(500);

      log(`Linha ${i + 1}: data início "${dataHoraInicio}"…`, "info");
      const celData = $$(`${gridSel} .slick-cell.l6 .cell-content`)[i];
      celData?.click();
      const inputData = await waitEl("#CLaborInitDateW", { timeout: 6000 });
      await typeSequentially(inputData, dataHoraInicio, 50);
      await pressEnter(inputData);
      await sleep(500);

      log(`Linha ${i + 1}: tempo trabalho ${duracao}h…`, "info");
      const celTempo = $$(`${gridSel} .slick-cell.l8 .cell-content`)[i];
      celTempo?.click();
      const inputTempo = await waitEl("#CLaborTimeW", { timeout: 6000 });
      setNativeValue(inputTempo, String(duracao));
      await pressEnter(inputTempo);
      await sleep(1200);
    }
    log("Mão-de-Obra preenchida.", "ok");
  }

  // ------------- Procedimentos -------------
  async function preencherProcedimentos(dataFinal, categoria) {
    log(`Aba Procedimentos, data ${dataFinal}…`, "info");
    const aba = $$("#formTabs li").find((li) => (li.textContent || "").includes("Procedimentos por OS"));
    if (!aba) throw new Error("Aba Procedimentos não encontrada.");
    aba.click();
    await waitEl("#GWorkOrderOperation .slick-row", { timeout: 12000 });
    await sleep(800);

    const linhas = $$("#GWorkOrderOperation .slick-row");
    for (let i = 0; i < linhas.length; i++) {
      if (STOP) throw new Error("Cancelado.");
      const linha = linhas[i];
      linha.scrollIntoView?.({ block: "center" });
      const celula = linha.querySelector(".slick-cell.l6 .cell-content");
      if (!celula) continue;

      let ok = false;
      for (let tent = 0; tent < 3 && !ok; tent++) {
        try {
          celula.click();
          await sleep(200);
          const inp = await waitEl("#COperationDate", { timeout: 4000 });
          setNativeValue(inp, "");
          await typeSequentially(inp, dataFinal, 35);
          await pressEnter(inp);
          await sleep(500);
          const txt = (celula.textContent || "").trim();
          if (txt.includes(dataFinal.substring(0, 10))) ok = true;
          else { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(200); }
        } catch (e) {
          if (tent === 2) throw new Error(`Data linha ${i + 1}: ${e.message}`);
          await sleep(400);
        }
      }
    }

    if ((categoria || "").toLowerCase() === "refrigeracao") {
      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        linha.scrollIntoView?.({ block: "center" });
        const codigoEl = linha.querySelector(".cell-content");
        const codigo = (codigoEl?.textContent || "").trim().toUpperCase();
        if (!codigo.startsWith("MED")) continue;
        const celMed = linha.querySelector(".slick-cell.l11 .cell-content");
        if (!celMed) continue;
        for (let tent = 0; tent < 3; tent++) {
          try {
            celMed.click();
            await sleep(200);
            const inp = await waitEl("#COperationMeasureValue", { timeout: 4000 });
            setNativeValue(inp, "0");
            await pressEnter(inp);
            await sleep(400);
            break;
          } catch (e) {
            if (tent === 2) throw new Error(`Medição linha ${i + 1}: ${e.message}`);
            await sleep(300);
          }
        }
      }
    }
    log("Procedimentos concluídos.", "ok");
  }

  async function salvar() {
    log("Salvando OS…", "info");
    const btn = findByText("Salvar", "button") || findContainsText("Salvar", "button") || findContainsText("Salvar", "a");
    if (!btn) throw new Error("Botão Salvar não encontrado.");
    btn.click();
    await sleep(2500);
  }

  // ------------- Loop principal -------------
  // ------------- Loop principal -------------
  async function processarOS(item, usuarioLogado) {
    await waitWhilePaused();
    await abrirOSCompleta();
    await preencherNumeroOS(item.numeroOS);
    await marcarEstadoConcluido();
    await adicionarMaoDeObra(item, usuarioLogado);
    await preencherProcedimentos(item.dataHoraFim, item.categoria);
    await salvar();
  }

  async function run(payload) {
    const { usuario, senha, lote, retomarDe } = payload;
    const inicioTotal = Date.now();
    try {
      await login(usuario, senha);
      const startIdx = Math.max(0, Number(retomarDe) || 0);
      if (startIdx > 0) log(`Retomando a partir da OS ${startIdx + 1}/${lote.length}.`, "info");
      for (let i = startIdx; i < lote.length; i++) {
        if (STOP) break;
        await waitWhilePaused();
        const item = lote[i];
        const t0 = Date.now();
        const feitas = i - startIdx;
        const restantes = lote.length - i;
        const mediaMs = feitas > 0 ? (Date.now() - inicioTotal) / feitas : 0;
        const etaMin = mediaMs > 0 ? Math.round((mediaMs * restantes) / 60000) : null;
        progress(
          Math.round((i / lote.length) * 100),
          `OS ${item.numeroOS} (${i + 1}/${lote.length})${etaMin != null ? ` · ETA ~${etaMin}min` : ""}`,
        );
        try {
          await processarOS(item, usuario);
          const dur = ((Date.now() - t0) / 1000).toFixed(1);
          send({ type: "APONTAUTO_RESULT", result: { indice: i, os: item.numeroOS, status: "concluido", duracaoSeg: Number(dur) } });
          log(`OS ${item.numeroOS} concluída em ${dur}s ✓`, "ok");
        } catch (err) {
          const dur = ((Date.now() - t0) / 1000).toFixed(1);
          send({ type: "APONTAUTO_RESULT", result: { indice: i, os: item.numeroOS, status: "erro", mensagem: err.message, duracaoSeg: Number(dur) } });
          log(`OS ${item.numeroOS} falhou após ${dur}s: ${err.message}`, "err");
        }
      }
      progress(100, STOP ? "Cancelado" : "Finalizado");
    } catch (err) {
      log(`Erro fatal: ${err.message}`, "err");
    } finally {
      send({ type: "APONTAUTO_DONE" });
      window.__apontautoRunning = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "APONTAUTO_RUN") run(msg.payload);
    else if (msg?.type === "APONTAUTO_STOP") { STOP = true; PAUSED = false; }
    else if (msg?.type === "APONTAUTO_PAUSE") { PAUSED = true; log("Pausado pelo usuário.", "info"); }
    else if (msg?.type === "APONTAUTO_RESUME") { PAUSED = false; log("Retomado.", "info"); }
  });

  send({ type: "APONTAUTO_LOG", msg: "Runner carregado na página.", kind: "ok" });
})();
