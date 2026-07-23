// ============================================================
// Apont Auto — content-script do Prisma4  (v2.1.0)
// Espelha fielmente o script Playwright de referência
// (apontamento-prisma4-4.js), corrigindo:
//   - duplicação do número da OS (fill "atômico", sem key-by-key)
//   - falha ao marcar CONCLUÍDO (espera pelo item aparecer)
//   - campo de data pulando em Procedimentos (Ctrl+A + type + Enter,
//     com re-clique da célula alvo antes de cada preenchimento)
//   - técnico na Mão-de-Obra: clica na célula que contém o código
//     do usuário logado (default) ao invés da 1ª .cell-content
// ============================================================
(() => {
  if (window.__APONTAUTO_LOADED__) return;
  window.__APONTAUTO_LOADED__ = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(selector, { timeout = 8000, visivel = true } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(selector);
      if (el && (!visivel || el.offsetParent !== null)) return el;
      await sleep(100);
    }
    throw new Error(`Elemento "${selector}" não apareceu em ${timeout}ms.`);
  }

  async function waitHidden(selector, { timeout = 3000 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(selector);
      if (!el || el.offsetParent === null) return true;
      await sleep(100);
    }
    return false;
  }

  function realClick(el) {
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    const rect = el.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
    };
    for (const t of ["mousedown", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(t, opts));
    }
  }

  function setNativeValue(el, val) {
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc?.set?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function key(el, type, k) {
    el.dispatchEvent(
      new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: k,
        code: k === "Enter" ? "Enter" : `Key${(k[0] || "").toUpperCase()}`,
        keyCode: k === "Enter" ? 13 : k.charCodeAt(0),
        which: k === "Enter" ? 13 : k.charCodeAt(0),
      }),
    );
  }

  function pressEnter(el) {
    for (const t of ["keydown", "keypress", "keyup"]) key(el, t, "Enter");
  }

  // Equivalente ao .fill() do Playwright: substitui todo o valor de uma vez.
  async function fillInput(el, val) {
    el.focus();
    // seleciona tudo
    try { el.select?.(); } catch (_) {}
    setNativeValue(el, "");
    setNativeValue(el, String(val));
    await sleep(30);
  }

  // Equivalente ao pressSequentially do Playwright — usado apenas em datas,
  // porque o editor de data escuta keydown para navegar entre dia/mês/ano.
  async function typeSequentially(el, val, delay = 30) {
    el.focus();
    // limpa (Ctrl+A + delete via setNativeValue)
    try { el.select?.(); } catch (_) {}
    setNativeValue(el, "");
    for (const ch of String(val)) {
      const evInit = { bubbles: true, cancelable: true, key: ch };
      el.dispatchEvent(new KeyboardEvent("keydown", evInit));
      el.dispatchEvent(new KeyboardEvent("keypress", evInit));
      setNativeValue(el, (el.value || "") + ch);
      el.dispatchEvent(new KeyboardEvent("keyup", evInit));
      if (delay) await sleep(delay);
    }
  }

  // ---------------------------------------------------------------
  // Edição de célula SlickGrid — reabre editor se necessário e
  // confirma o valor comparando o textContent depois do commit.
  // ---------------------------------------------------------------
  async function editarCelulaTexto(celula, seletorInput, valor, { tentativas = 3 } = {}) {
    const alvo = String(valor).trim();
    for (let i = 0; i < tentativas; i++) {
      realClick(celula);
      let input;
      try {
        input = await waitFor(seletorInput, { timeout: 2500 });
      } catch {
        realClick(celula); // segundo clique reabre o editor
        input = await waitFor(seletorInput, { timeout: 3000 });
      }
      await fillInput(input, alvo);
      pressEnter(input);
      await waitHidden(seletorInput, { timeout: 2500 });
      await sleep(200);
      const txt = (celula.textContent || "").trim();
      if (txt.includes(alvo)) return true;
      await sleep(250);
    }
    throw new Error(`Não confirmei o valor "${valor}" na célula.`);
  }

  async function editarCelulaData(celula, seletorInput, valor, { tentativas = 3 } = {}) {
    const prefixo = String(valor).slice(0, 10); // dd/mm/yyyy
    for (let i = 0; i < tentativas; i++) {
      realClick(celula);
      let input;
      try {
        input = await waitFor(seletorInput, { timeout: 2500 });
      } catch {
        realClick(celula);
        input = await waitFor(seletorInput, { timeout: 3000 });
      }
      await typeSequentially(input, valor, 30);
      pressEnter(input);
      await waitHidden(seletorInput, { timeout: 2500 });
      await sleep(250);
      const txt = (celula.textContent || "").trim();
      if (txt.includes(prefixo)) return true;
      await sleep(300);
    }
    throw new Error(`Não confirmei a data "${valor}" na célula.`);
  }

  // ---------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------
  async function abrirOSCompleta() {
    if (document.querySelector("#TBWorkOrder")) return;
    const menu = Array.from(document.querySelectorAll("a")).find((a) =>
      (a.textContent || "").includes("Ordens de Serviço"),
    );
    if (menu) realClick(menu);
    await sleep(500);
    let registro = Array.from(document.querySelectorAll("a")).find(
      (a) => (a.textContent || "").trim() === "Registro",
    );
    if (!registro || registro.offsetParent === null) {
      if (menu) realClick(menu);
      await sleep(600);
      registro = Array.from(document.querySelectorAll("a")).find(
        (a) => (a.textContent || "").trim() === "Registro",
      );
    }
    if (registro) realClick(registro);
    await sleep(400);
    const osc = Array.from(document.querySelectorAll("a")).find(
      (a) => (a.textContent || "").trim() === "OS Completa",
    );
    if (osc) realClick(osc);
    await waitFor("#TBWorkOrder", { timeout: 10000 });
  }

  async function preencherNumeroOS(num) {
    const input = await waitFor("#TBWorkOrder");
    // fill "atômico" evita duplicação por key-by-key
    await fillInput(input, num);
    // dispara o botão de busca (mesmo seletor do script Playwright)
    const btn = document.querySelector("#tabWorkOrderCreation1 > div:nth-child(2)");
    if (btn) realClick(btn);
    await sleep(1200);
  }

  async function marcarConcluido() {
    const help = document.querySelector(
      "div:nth-child(13) > div:nth-child(2) > .sp-input-cluster-section.code > .sp-input-cluster-container-wrapper > .sp-input-button > .sp-input-cluster-help-button",
    );
    if (!help) throw new Error("Botão de estado da OS não encontrado.");
    realClick(help);

    // espera o item "CONCLUÍDO" ficar visível
    const t0 = Date.now();
    let alvo = null;
    while (Date.now() - t0 < 5000) {
      alvo = Array.from(document.querySelectorAll("*")).find(
        (el) => el.children.length === 0 && (el.textContent || "").trim() === "CONCLUÍDO",
      );
      if (alvo && alvo.offsetParent !== null) break;
      await sleep(150);
    }
    if (!alvo) throw new Error("Opção CONCLUÍDO não apareceu.");
    realClick(alvo);
    await sleep(500);
  }

  async function abrirAba(nome) {
    const item = Array.from(document.querySelectorAll("#formTabs li, li")).find((el) =>
      (el.textContent || "").includes(nome),
    );
    if (item) realClick(item);
    await sleep(700);
  }

  async function esperarLinhas(seletorGrid, esperado, timeout = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const n = document.querySelectorAll(`${seletorGrid} .slick-row`).length;
      if (n >= esperado) return n;
      await sleep(200);
    }
    return document.querySelectorAll(`${seletorGrid} .slick-row`).length;
  }

  async function preencherMaoDeObra({ tecnicos, dataHoraInicio, duracaoHoras }) {
    await abrirAba("Mão-de-Obra por OS");
    const seletorGrid = "#GWorkOrderWorkerLabor";
    await waitFor(seletorGrid, { timeout: 8000 });

    // 1) cria N linhas
    for (let i = 0; i < tecnicos.length; i++) {
      const btn = document.querySelector(".grid-btn");
      if (btn) realClick(btn);
      await esperarLinhas(seletorGrid, i + 1);
      await sleep(200);
    }

    // 2) preenche cada linha em ordem
    for (let i = 0; i < tecnicos.length; i++) {
      // re-busca as linhas a cada iteração (SlickGrid recria nós)
      const linhas = document.querySelectorAll(`${seletorGrid} .slick-row`);
      const linha = linhas[i];
      if (!linha) continue;

      // célula de técnico = primeira cell-content da linha
      const celTec = linha.querySelector(".cell-content");
      if (celTec) await editarCelulaTexto(celTec, "#CLaborWorkerW", tecnicos[i]);

      // Data Início — coluna l6
      const celData = linha.querySelector(".slick-cell.l6 .cell-content");
      if (celData) await editarCelulaData(celData, "#CLaborInitDateW", dataHoraInicio);

      // Tempo Trabalho — coluna l8
      const celTempo = linha.querySelector(".slick-cell.l8 .cell-content");
      if (celTempo) await editarCelulaTexto(celTempo, "#CLaborTimeW", String(duracaoHoras));

      await sleep(500);
    }
  }

  async function preencherProcedimentos(dataFim, categoria) {
    await abrirAba("Procedimentos por OS");
    await waitFor("#GWorkOrderOperation", { timeout: 8000 });

    // Snapshot inicial da contagem (SlickGrid pode reciclar nós, então
    // buscamos por índice a cada iteração para evitar "campo pula").
    const totalLinhas = document.querySelectorAll("#GWorkOrderOperation .slick-row").length;

    for (let i = 0; i < totalLinhas; i++) {
      const linhas = document.querySelectorAll("#GWorkOrderOperation .slick-row");
      const linha = linhas[i];
      if (!linha) continue;

      const codEl = linha.querySelector(".cell-content");
      const codigo = codEl ? (codEl.textContent || "").trim() : "";

      // Data — sempre re-busca a célula da linha atual
      const celData = linha.querySelector(".l6 .cell-content");
      if (celData) {
        await editarCelulaData(celData, "#COperationDate", dataFim);
      }

      // Medição — apenas categoria refrigeracao + código MED*
      if (categoria === "refrigeracao" && codigo.toUpperCase().startsWith("MED")) {
        await sleep(250);
        const linhas2 = document.querySelectorAll("#GWorkOrderOperation .slick-row");
        const celMed = linhas2[i]?.querySelector(".l11 .cell-content");
        if (celMed) await editarCelulaTexto(celMed, "#COperationMeasureValue", "0");
      }
      await sleep(350);
    }
  }

  async function salvar() {
    const btn = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && (el.textContent || "").trim() === "Salvar",
    );
    if (btn) realClick(btn);
    await sleep(2500);
  }

  async function processar(payload) {
    await abrirOSCompleta();
    await preencherNumeroOS(payload.numeroOS);
    await marcarConcluido();
    await preencherMaoDeObra({
      tecnicos: payload.tecnicos,
      dataHoraInicio: payload.dataHoraInicio,
      duracaoHoras: payload.duracaoHoras,
    });
    await preencherProcedimentos(payload.dataHoraFim, payload.categoria);
    await salvar();
  }

  chrome.runtime.onMessage.addListener((msg, _s, respond) => {
    if (msg?.tipo !== "PROCESSAR_OS") return;
    processar(msg.payload)
      .then(() => respond({ sucesso: true }))
      .catch((e) => respond({ sucesso: false, erro: e.message }));
    return true; // async
  });
})();
