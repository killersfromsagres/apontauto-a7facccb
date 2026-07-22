// ============================================================
// Apont Auto — content-script do Prisma4
// Executa o mesmo fluxo do script Playwright dentro da aba já
// autenticada. Utiliza a lógica robusta de retry em células
// SlickGrid para evitar o bug de "campo pula".
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

  function click(el) {
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    for (const t of ["mousedown", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  }

  function setNativeValue(el, val) {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    desc?.set?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnter(el) {
    for (const t of ["keydown", "keypress", "keyup"]) {
      el.dispatchEvent(new KeyboardEvent(t, { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13 }));
    }
  }

  async function typeInto(el, text) {
    el.focus();
    setNativeValue(el, "");
    setNativeValue(el, text);
    // Alguns editores exigem keydown por caractere
    for (const ch of String(text)) {
      for (const t of ["keydown", "keypress", "keyup"]) {
        el.dispatchEvent(new KeyboardEvent(t, { bubbles: true, cancelable: true, key: ch }));
      }
    }
    pressEnter(el);
  }

  async function editarCelulaData(celula, seletorInput, valor, tentativas = 3) {
    const prefixo = valor.slice(0, 10);
    for (let i = 1; i <= tentativas; i++) {
      click(celula);
      let input;
      try {
        input = await waitFor(seletorInput, { timeout: 3000 });
      } catch {
        click(celula);
        input = await waitFor(seletorInput, { timeout: 3000 });
      }
      await typeInto(input, valor);
      await waitHidden(seletorInput, { timeout: 3000 });
      await sleep(200);
      const txt = (celula.textContent || "").trim();
      if (txt.includes(prefixo)) return true;
      await sleep(300);
    }
    throw new Error(`Não confirmei a data "${valor}" na célula (${tentativas}x).`);
  }

  async function editarCelulaTexto(celula, seletorInput, valor) {
    for (let i = 1; i <= 3; i++) {
      click(celula);
      let input;
      try {
        input = await waitFor(seletorInput, { timeout: 3000 });
      } catch {
        click(celula);
        input = await waitFor(seletorInput, { timeout: 3000 });
      }
      await typeInto(input, valor);
      await waitHidden(seletorInput, { timeout: 3000 });
      await sleep(200);
      const txt = (celula.textContent || "").trim();
      if (txt.includes(String(valor).trim())) return true;
      await sleep(300);
    }
    throw new Error(`Não confirmei o valor "${valor}" na célula.`);
  }

  // ---------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------
  async function abrirOSCompleta() {
    // Se já estamos na tela, o campo #TBWorkOrder existe.
    if (document.querySelector("#TBWorkOrder")) return;
    const menu = Array.from(document.querySelectorAll("a")).find((a) => a.textContent.includes("Ordens de Serviço"));
    if (menu) click(menu);
    await sleep(500);
    const registro = Array.from(document.querySelectorAll("a")).find((a) => a.textContent.trim() === "Registro");
    if (registro) click(registro);
    await sleep(300);
    const osc = Array.from(document.querySelectorAll("a")).find((a) => a.textContent.trim() === "OS Completa");
    if (osc) click(osc);
    await waitFor("#TBWorkOrder", { timeout: 10000 });
  }

  async function preencherNumeroOS(num) {
    const input = await waitFor("#TBWorkOrder");
    await typeInto(input, num);
    const btn = document.querySelector("#tabWorkOrderCreation1 > div:nth-child(2)");
    if (btn) click(btn);
    await sleep(1200);
  }

  async function marcarConcluido() {
    const help = document.querySelector(
      "div:nth-child(13) > div:nth-child(2) > .sp-input-cluster-section.code > .sp-input-cluster-container-wrapper > .sp-input-button > .sp-input-cluster-help-button",
    );
    if (help) click(help);
    await sleep(400);
    const alvo = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && (el.textContent || "").trim() === "CONCLUÍDO",
    );
    if (alvo) click(alvo);
    await sleep(500);
  }

  async function abrirAba(nome) {
    const item = Array.from(document.querySelectorAll("#formTabs li, li")).find((el) => (el.textContent || "").includes(nome));
    if (item) click(item);
    await sleep(600);
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

    for (let i = 0; i < tecnicos.length; i++) {
      const btn = document.querySelector(".grid-btn");
      if (btn) click(btn);
      await esperarLinhas(seletorGrid, i + 1);
    }

    for (let i = 0; i < tecnicos.length; i++) {
      const linhas = document.querySelectorAll(`${seletorGrid} .slick-row`);
      const linha = linhas[i];
      if (!linha) continue;

      const celTec = linha.querySelector(".cell-content");
      await editarCelulaTexto(celTec, "#CLaborWorkerW", tecnicos[i]);

      const celData = linha.querySelector(".slick-cell.l6 .cell-content");
      if (celData) await editarCelulaData(celData, "#CLaborInitDateW", dataHoraInicio);

      const celTempo = linha.querySelector(".slick-cell.l8 .cell-content");
      if (celTempo) await editarCelulaTexto(celTempo, "#CLaborTimeW", String(duracaoHoras));

      await sleep(400);
    }
  }

  async function preencherProcedimentos(dataFim, categoria) {
    await abrirAba("Procedimentos por OS");
    await waitFor("#GWorkOrderOperation", { timeout: 8000 });
    const linhas = document.querySelectorAll("#GWorkOrderOperation .slick-row");
    for (const linha of linhas) {
      const codEl = linha.querySelector(".cell-content");
      const codigo = codEl ? (codEl.textContent || "").trim() : "";

      const celData = linha.querySelector(".l6 .cell-content");
      if (celData) await editarCelulaData(celData, "#COperationDate", dataFim);

      if (categoria === "refrigeracao" && codigo.toUpperCase().startsWith("MED")) {
        const celMed = linha.querySelector(".l11 .cell-content");
        if (celMed) await editarCelulaTexto(celMed, "#COperationMeasureValue", "0");
      }
      await sleep(300);
    }
  }

  async function salvar() {
    const btn = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && (el.textContent || "").trim() === "Salvar",
    );
    if (btn) click(btn);
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
