// Content script — executa a automação dentro da página do Prisma4.
// Replica o fluxo de apontamento-prisma4.js (Playwright) usando DOM nativo,
// com eventos "reais" (mouse + teclado) para SlickGrid e inputs custom.
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
  async function waitWhilePaused() { while (PAUSED && !STOP) await sleep(300); }

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

  async function waitEl(sel, opts) { return waitFor(() => $(sel), { msg: `seletor ${sel}`, ...opts }); }
  async function waitVisibleEl(sel, opts) {
    return waitFor(() => {
      const el = $(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return (r.width > 0 && r.height > 0) ? el : null;
    }, { msg: `elemento visível ${sel}`, ...opts });
  }

  function findByText(text, tag = "*") {
    const t = text.trim();
    return $$(tag).find((el) => (el.textContent || "").trim() === t);
  }
  function findContainsText(text, tag = "*") {
    const t = text.trim().toLowerCase();
    return $$(tag).find((el) => (el.textContent || "").trim().toLowerCase().includes(t));
  }

  // -------- Eventos "reais" --------
  function fireMouse(el, type, opts = {}) {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, button: 0, buttons: 1,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, ...opts,
    }));
  }
  function realClick(el) {
    if (!el) return;
    el.scrollIntoView?.({ block: "center", inline: "center" });
    fireMouse(el, "mouseover");
    fireMouse(el, "mousedown");
    fireMouse(el, "mouseup");
    fireMouse(el, "click");
    if (typeof el.click === "function") { try { el.click(); } catch (_) {} }
  }
  function realDblClick(el) {
    realClick(el);
    fireMouse(el, "dblclick");
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function clearInput(el) {
    el.focus();
    try { el.select?.(); } catch (_) {}
    setNativeValue(el, "");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    await sleep(20);
  }

  async function typeSequentially(el, text, delay = 45) {
    el.focus();
    await clearInput(el);
    for (const ch of String(text)) {
      if (STOP) throw new Error("Cancelado.");
      const keyOpts = { key: ch, char: ch, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
      el.dispatchEvent(new KeyboardEvent("keypress", keyOpts));
      setNativeValue(el, el.value + ch);
      el.dispatchEvent(new KeyboardEvent("keyup", keyOpts));
      await sleep(delay);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function pressEnter(el) {
    const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", o));
    el.dispatchEvent(new KeyboardEvent("keypress", o));
    el.dispatchEvent(new KeyboardEvent("keyup", o));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(80);
  }

  async function pressTab(el) {
    const o = { key: "Tab", code: "Tab", keyCode: 9, which: 9, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", o));
    el.dispatchEvent(new KeyboardEvent("keyup", o));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try { el.blur(); } catch (_) {}
    await sleep(80);
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
      realClick(okBtn);
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
    realClick(menu);
    await sleep(500);
    let registro = findContainsText("Registro", "a");
    if (!registro) {
      realClick(menu);
      await sleep(700);
      registro = await waitFor(() => findContainsText("Registro", "a"), { timeout: 10000, msg: "link Registro" });
    }
    realClick(registro);
    await sleep(500);
    const osCompleta = await waitFor(() => findContainsText("OS Completa", "a"), { timeout: 10000, msg: "link OS Completa" });
    realClick(osCompleta);
    await waitEl("#TBWorkOrder", { timeout: 15000 });
    await sleep(600);
  }

  async function preencherNumeroOS(numeroOS) {
    log(`OS ${numeroOS}: preenchendo número…`, "info");
    const inp = await waitEl("#TBWorkOrder");
    inp.focus();
    await clearInput(inp);
    await typeSequentially(inp, String(numeroOS), 30);
    await pressTab(inp);
    // Clique fora para disparar o load
    const alvo = $("#tabWorkOrderCreation1 > div:nth-child(2)") || document.body;
    realClick(alvo);
    await sleep(1500);
  }

  async function marcarEstadoConcluido() {
    log("Marcando Estado como CONCLUÍDO…", "info");
    const btn = $("div:nth-child(13) > div:nth-child(2) > .sp-input-cluster-section.code > .sp-input-cluster-container-wrapper > .sp-input-button > .sp-input-cluster-help-button");
    if (!btn) throw new Error("Botão de estado não encontrado.");
    realClick(btn);
    const concluido = await waitFor(() => findByText("CONCLUÍDO"), { timeout: 6000, msg: "opção CONCLUÍDO" });
    realClick(concluido);
    await sleep(500);
  }

  // ------------- Mão-de-Obra -------------
  async function esperarLinhas(gridSel, n) {
    await waitFor(() => $$(`${gridSel} .slick-row`).length >= n, {
      timeout: 12000, msg: `${n} linha(s) em ${gridSel}`,
    });
  }

  async function editarCelulaGrid(cellContentEl, inputSel, valor, { pressEnterAoFim = true, sequencial = true } = {}) {
    if (!cellContentEl) throw new Error("Célula não encontrada para edição.");
    // SlickGrid: um clique seleciona, mais um clique entra em modo edição.
    realClick(cellContentEl);
    await sleep(120);
    let inp = $(inputSel);
    if (!inp || getComputedStyle(inp).display === "none") {
      realClick(cellContentEl);
      await sleep(150);
      inp = await waitVisibleEl(inputSel, { timeout: 5000 });
    }
    if (!inp) inp = await waitVisibleEl(inputSel, { timeout: 5000 });
    inp.focus();
    await clearInput(inp);
    if (sequencial) await typeSequentially(inp, valor, 40);
    else setNativeValue(inp, String(valor));
    if (pressEnterAoFim) await pressEnter(inp);
    await sleep(300);
    return inp;
  }

  async function adicionarMaoDeObra(item, usuarioLogado) {
    const { colaboradores, dataHoraInicio } = item;
    const duracao = Number(item.tempoTrabalhoHoras) > 0 ? Number(item.tempoTrabalhoHoras) : 1;
    const gridSel = "#GWorkOrderWorkerLabor";
    log("Abrindo aba Mão-de-Obra por OS…", "info");
    const abaMO = $$("li").find((li) => (li.textContent || "").includes("Mão-de-Obra por OS"));
    if (!abaMO) throw new Error("Aba Mão-de-Obra não encontrada.");
    realClick(abaMO);
    await sleep(700);

    const lista = (colaboradores && colaboradores.length) ? colaboradores : [usuarioLogado];

    // Adiciona todas as linhas primeiro (igual ao script Playwright).
    for (let i = 0; i < lista.length; i++) {
      const addBtn = $(`${gridSel} ~ * .grid-btn`) || $(".grid-btn");
      if (!addBtn) throw new Error("Botão 'Adicionar Linha' não encontrado.");
      realClick(addBtn);
      await esperarLinhas(gridSel, i + 1);
      await sleep(200);
    }

    for (let i = 0; i < lista.length; i++) {
      const valorTec = String(lista[i]);
      log(`Linha ${i + 1}: técnico "${valorTec}"…`, "info");

      // Localiza a célula do técnico da linha i. Preferimos a i-ésima linha, coluna do técnico (l4/l5 conforme grid).
      const grid = $(gridSel);
      const rows = $$(".slick-row", grid);
      const row = rows[i];
      if (!row) throw new Error(`Linha ${i + 1} não encontrada na grid.`);
      // Célula do técnico: o script Playwright clica no texto do código do usuário logado.
      let celTec = $$(".cell-content", row).find((c) => (c.textContent || "").trim() === String(usuarioLogado));
      if (!celTec) celTec = row.querySelector(".slick-cell.l4 .cell-content") || row.querySelector(".slick-cell.l3 .cell-content") || row.querySelector(".slick-cell .cell-content");
      await editarCelulaGrid(celTec, "#CLaborWorkerW", valorTec);

      log(`Linha ${i + 1}: data início "${dataHoraInicio}"…`, "info");
      const celData = row.querySelector(".slick-cell.l6 .cell-content");
      await editarCelulaGrid(celData, "#CLaborInitDateW", dataHoraInicio);

      log(`Linha ${i + 1}: tempo trabalho ${duracao}h…`, "info");
      const celTempo = row.querySelector(".slick-cell.l8 .cell-content");
      await editarCelulaGrid(celTempo, "#CLaborTimeW", String(duracao));
      await sleep(700);
    }
    log("Mão-de-Obra preenchida.", "ok");
  }

  // ------------- Procedimentos -------------
  async function preencherProcedimentos(dataFinal, categoria) {
    log(`Aba Procedimentos, data ${dataFinal}…`, "info");
    const aba = $$("#formTabs li").find((li) => (li.textContent || "").includes("Procedimentos por OS"));
    if (!aba) throw new Error("Aba Procedimentos não encontrada.");
    realClick(aba);
    await waitEl("#GWorkOrderOperation .slick-row", { timeout: 12000 });
    await sleep(1000);

    const totalLinhas = $$("#GWorkOrderOperation .slick-row").length;
    for (let i = 0; i < totalLinhas; i++) {
      if (STOP) throw new Error("Cancelado.");
      const linhas = $$("#GWorkOrderOperation .slick-row");
      const linha = linhas[i];
      if (!linha) continue;
      linha.scrollIntoView?.({ block: "center" });
      const celula = linha.querySelector(".slick-cell.l6 .cell-content");
      if (!celula) continue;

      let ok = false;
      for (let tent = 0; tent < 3 && !ok; tent++) {
        try {
          await editarCelulaGrid(celula, "#COperationDate", dataFinal);
          const txt = (celula.textContent || "").trim();
          if (txt.includes(dataFinal.substring(0, 10))) ok = true;
          else {
            document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            await sleep(250);
          }
        } catch (e) {
          if (tent === 2) throw new Error(`Data linha ${i + 1}: ${e.message}`);
          await sleep(400);
        }
      }
    }

    if ((categoria || "").toLowerCase() === "refrigeracao") {
      const linhas = $$("#GWorkOrderOperation .slick-row");
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
            await editarCelulaGrid(celMed, "#COperationMeasureValue", "0", { sequencial: false });
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
    realClick(btn);
    await sleep(2800);
  }

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

  send({ type: "APONTAUTO_LOG", msg: "Runner carregado na página (v1.1.1).", kind: "ok" });
})();
