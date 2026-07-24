/**
 * Automação de apontamentos - Prisma4
 * ------------------------------------
 * Este script executa, para cada OS de uma lista, o mesmo fluxo manual descrito:
 * 1. Login
 * 2. Abrir Ordens de Serviço > Registro > OS Completa
 * 3. Preencher número da OS
 * 4. Marcar Estado OS como "Concluído"
 * 5. Adicionar linhas de Mão-de-Obra por OS (técnicos, data início, hora início, tempo de trabalho)
 * 6. Preencher Procedimentos por OS usando a "Data Cabeçalho" (com a data final da Mão-de-Obra)
 * 7. Preencher Valor Medição = 0 nas linhas "MED..." (se categoria for "refrigeracao")
 * 8. Salvar
 */

const { chromium } = require('playwright');
const fs = require('fs');
require('dotenv').config();

const DEBUG = true;
const PASTA_DEBUG = 'debug';
if (DEBUG && !fs.existsSync(PASTA_DEBUG)) fs.mkdirSync(PASTA_DEBUG);

let contadorPasso = 0;

function logPasso(msg) {
  const hora = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${hora}] ${msg}`);
}

async function esperarQuantidadeLinhas(page, seletorGrid, quantidadeEsperada, timeoutMs = 10000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const total = await page.locator(`${seletorGrid} .slick-row`).count();
    if (total >= quantidadeEsperada) return total;
    await page.waitForTimeout(200);
  }
  const totalFinal = await page.locator(`${seletorGrid} .slick-row`).count();
  throw new Error(
    `Esperei ${timeoutMs}ms por ${quantidadeEsperada} linha(s) em "${seletorGrid}", mas só apareceram ${totalFinal}.`
  );
}

// ------------------------------------------------------------------
// ENTRADA DE DADOS - lotes de técnicos + OS
// ------------------------------------------------------------------
const ARQUIVO_ENTRADA = 'entradas-os.txt';

function parseDataHoraBR(texto) {
  const match = texto
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})$/);

  if (!match) {
    throw new Error(`Data/hora "${texto}" fora do formato esperado "DD/MM/AAAA HH:mm" (ex: 08/07/2026 08:00).`);
  }

  const [, dia, mes, ano, hora, minuto] = match;
  const diaNum = Number(dia);
  const mesNum = Number(mes);
  const horaNum = Number(hora);
  const minutoNum = Number(minuto);

  const data = new Date(Number(ano), mesNum - 1, diaNum, horaNum, minutoNum);
  return data;
}

function carregarListaDeArquivo(caminho) {
  const conteudo = fs.readFileSync(caminho, 'utf-8');

  let dataInicio = null;
  const lista = [];

  const linhas = conteudo.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let temLotes = conteudo.includes('[LOTE]');

  if (!temLotes) {
    let listaOS = [];
    for (const linha of linhas) {
      const lower = linha.toLowerCase();
      if (lower.startsWith('inicio:')) {
        dataInicio = parseDataHoraBR(linha.split(':')[1].trim());
      } else if (lower.startsWith('os:')) {
        const osStr = linha.split(':')[1];
        if (osStr) {
          listaOS.push(...osStr.split(',').map(s => s.trim()).filter(Boolean));
        }
      }
    }
    for (const numeroOS of listaOS) {
      lista.push({ numeroOS, colaboradores: [process.env.PRISMA_USUARIO], categoria: 'refrigeracao' });
    }
  }

  const indicePrimeiroLote = conteudo.search(/\[LOTE\]/i);
  const cabecalho = indicePrimeiroLote === -1 ? conteudo : conteudo.slice(0, indicePrimeiroLote);
  const corpo = indicePrimeiroLote === -1 ? '' : conteudo.slice(indicePrimeiroLote);

  for (const linha of cabecalho.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const separadorIndex = linha.indexOf(':');
    if (separadorIndex === -1) continue;
    const chave = linha.slice(0, separadorIndex).trim().toLowerCase();
    const valor = linha.slice(separadorIndex + 1).trim();
    if (chave === 'inicio' || chave === 'início' || chave === 'data_inicio') {
      dataInicio = parseDataHoraBR(valor);
    }
  }

  const blocos = corpo.split(/\[LOTE\]/i).map((b) => b.trim()).filter(Boolean);
  for (const bloco of blocos) {
    const linhasBloco = bloco.split('\n').map((l) => l.trim()).filter(Boolean);
    let categoria = 'geral';
    let tecnicos = [];
    let listaOS = [];

    for (const linha of linhasBloco) {
      const separadorIndex = linha.indexOf(':');
      if (separadorIndex === -1) continue;

      const chave = linha.slice(0, separadorIndex).trim().toLowerCase();
      const valor = linha.slice(separadorIndex + 1).trim();

      if (chave === 'categoria') categoria = valor.toLowerCase();
      else if (chave === 'tecnicos' || chave === 'técnicos') tecnicos = valor.split(',').map((t) => t.trim()).filter(Boolean);
      else if (chave === 'os') listaOS = valor.split(',').map((o) => o.trim()).filter(Boolean);
    }

    for (const numeroOS of listaOS) {
      lista.push({ numeroOS, colaboradores: tecnicos, categoria });
    }
  }

  return { lista, dataInicio };
}

const OS_PARA_PROCESSAR_EXEMPLO = [
  { numeroOS: '123456', colaboradores: ['João da Silva', 'Marcos Souza'], categoria: 'refrigeracao' }
];

const HORA_INICIO_JORNADA = 8;
const HORA_LIMITE_JORNADA = 17;
const TEMPO_TRABALHO_PADRAO_HORAS = 1;

const MINUTOS_INICIO_JORNADA = HORA_INICIO_JORNADA * 60;
const MINUTOS_LIMITE_JORNADA = HORA_LIMITE_JORNADA * 60;

function ehDiaUtil(data) {
  const diaSemana = data.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  return true;
}

function proximoDiaUtil(data) {
  const proxima = new Date(data);
  proxima.setDate(proxima.getDate() + 1);
  while (!ehDiaUtil(proxima)) {
    proxima.setDate(proxima.getDate() + 1);
  }
  return proxima;
}

function formatarHoraMin(totalMinutos) {
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

function formatarData(data) {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function gerarAgendamento(lista, dataInicial = new Date()) {
  let diaAtual = new Date(dataInicial);
  if (!ehDiaUtil(diaAtual)) diaAtual = proximoDiaUtil(diaAtual);

  let minutosAtuais = dataInicial.getHours() * 60 + dataInicial.getMinutes();
  if (minutosAtuais < MINUTOS_INICIO_JORNADA || minutosAtuais >= MINUTOS_LIMITE_JORNADA) {
    minutosAtuais = MINUTOS_INICIO_JORNADA;
  }

  return lista.map((item) => {
    const duracaoHoras = item.tempoTrabalhoHoras || TEMPO_TRABALHO_PADRAO_HORAS;
    const duracaoMinutos = Math.round(duracaoHoras * 60);

    if (minutosAtuais >= MINUTOS_LIMITE_JORNADA) {
      diaAtual = proximoDiaUtil(diaAtual);
      minutosAtuais = MINUTOS_INICIO_JORNADA;
    }

    const dataHoraInicio = `${formatarData(diaAtual)} ${formatarHoraMin(minutosAtuais)}`;
    const minutosFim = minutosAtuais + duracaoMinutos;
    const dataHoraFim = `${formatarData(diaAtual)} ${formatarHoraMin(minutosFim)}`;

    minutosAtuais = minutosFim;
    return { ...item, dataHoraInicio, dataHoraFim };
  });
}

// ------------------------------------------------------------------
// LOGIN E NAVEGAÇÃO
// ------------------------------------------------------------------
async function login(page) {
  await page.goto('https://cimogps.com.br/Prisma4/AccountCustom/Login?ReturnUrl=%2fPrisma4');
  await page.getByRole('textbox', { name: 'Usuário' }).fill(process.env.PRISMA_USUARIO);
  await page.getByRole('textbox', { name: 'Senha' }).fill(process.env.PRISMA_SENHA);
  await page.getByRole('button', { name: 'OK' }).click();
  await page.getByRole('link', { name: '  Ordens de Serviço' }).waitFor();
}

async function abrirOSCompleta(page) {
  logPasso('Abrindo Ordens de Serviço > Registro > OS Completa...');
  const menuOrdensServico = page.getByRole('link', { name: '  Ordens de Serviço' });
  const linkRegistro = page.locator('a').filter({ hasText: 'Registro' }).first();

  await menuOrdensServico.click();
  try {
    await linkRegistro.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    await menuOrdensServico.click();
    await linkRegistro.waitFor({ state: 'visible', timeout: 10000 });
  }

  await linkRegistro.click();
  await page.locator('a').filter({ hasText: 'OS Completa' }).click();
  await page.waitForSelector('#TBWorkOrder');
}

async function preencherNumeroOS(page, numeroOS) {
  logPasso(`Preenchendo número da OS: ${numeroOS}...`);
  await page.locator('#TBWorkOrder').fill(numeroOS);
  await page.locator('#tabWorkOrderCreation1 > div:nth-child(2)').click();
  await page.waitForTimeout(1000);
}

async function marcarEstadoConcluido(page) {
  logPasso('Marcando Estado OS como CONCLUÍDO...');
  await page.locator('div:nth-child(13) > div:nth-child(2) > .sp-input-cluster-section.code > .sp-input-cluster-container-wrapper > .sp-input-button > .sp-input-cluster-help-button').click();
  await page.getByText('CONCLUÍDO').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByText('CONCLUÍDO').click();
}

// ------------------------------------------------------------------
// ADICIONAR MÃO-DE-OBRA POR OS
// ------------------------------------------------------------------
async function adicionarMaoDeObra(page, item) {
  const { colaboradores, dataHoraInicio, dataHoraFim, tempoTrabalhoHoras } = item;
  const duracao = tempoTrabalhoHoras || TEMPO_TRABALHO_PADRAO_HORAS;
  const seletorGrid = '#GWorkOrderWorkerLabor';
  const codigoUsuarioLogado = process.env.PRISMA_USUARIO;

  logPasso('Abrindo aba Mão-de-Obra por OS...');
  await page.locator('li').filter({ hasText: 'Mão-de-Obra por OS' }).click();

  for (let i = 0; i < colaboradores.length; i++) {
    logPasso(`Clicando em "Adicionar Linha" (${i + 1}/${colaboradores.length})...`);
    await page.locator('.grid-btn').first().click();
    await esperarQuantidadeLinhas(page, seletorGrid, i + 1);
  }

  for (let i = 0; i < colaboradores.length; i++) {
    const valorTecnico = colaboradores[i];
    logPasso(`Preenchendo técnico da linha ${i + 1}: "${valorTecnico}"...`);

    await page.locator(seletorGrid).getByText(codigoUsuarioLogado, { exact: true }).first().click();
    const inputTecnico = page.locator('#CLaborWorkerW');
    await inputTecnico.waitFor({ state: 'visible', timeout: 5000 });
    await inputTecnico.press('ControlOrMeta+a');
    await inputTecnico.fill(valorTecnico);
    await inputTecnico.press('Enter'); 
    await page.waitForTimeout(500); 

    logPasso(`Preenchendo Data Início da linha ${i + 1}: "${dataHoraInicio}"...`);
    await page.locator('.slick-cell.l6 .cell-content').nth(i).click();
    const inputData = page.locator('#CLaborInitDateW');
    await inputData.waitFor({ state: 'visible', timeout: 5000 });
    await inputData.pressSequentially(dataHoraInicio, { delay: 50 });
    await inputData.press('Enter'); 
    await page.waitForTimeout(500);

    logPasso(`Preenchendo Tempo Trabalho da linha ${i + 1}: "${duracao}"...`);
    await page.locator('.slick-cell.l8 .cell-content').nth(i).click();
    const inputTempo = page.locator('#CLaborTimeW');
    await inputTempo.waitFor({ state: 'visible', timeout: 5000 });
    await inputTempo.fill(String(duracao));
    await inputTempo.press('Enter'); 

    await page.waitForTimeout(1500); 
  }

  logPasso('Mão-de-Obra por OS preenchida com sucesso.');
  return dataHoraFim;
}

// ------------------------------------------------------------------
// PREENCHIMENTO DE PROCEDIMENTOS VIA "USAR DATA CABEÇALHO"
// ------------------------------------------------------------------
async function preencherProcedimentos(page, dataFinal, categoria) {
  logPasso(`Abrindo aba Procedimentos por OS e preenchendo Data via Cabeçalho: ${dataFinal}...`);
  await page.locator('#formTabs li').filter({ hasText: 'Procedimentos por OS' }).click();

  if (!dataFinal) throw new Error('Data Final de Mão-de-Obra vazia.');

  const seletorLinhas = '#GWorkOrderOperation .slick-row';
  await page.waitForSelector(seletorLinhas, { timeout: 15000 });

  // 1. Marca a opção "Usar data cabeçalho"
  await page.getByRole('checkbox', { name: 'Usar data cabeçalho' }).check();
  await page.waitForTimeout(300);

  // 2. Limpa e preenche o input global `#TBHeaderOperationDate` com a data final correta
  const inputCabecalho = page.locator('#TBHeaderOperationDate');
  await inputCabecalho.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);
  
  await inputCabecalho.pressSequentially(dataFinal, { delay: 50 });
  await page.waitForTimeout(200);

  // 3. Sequência exata capturada pelo Playwright para confirmar o cabeçalho antes de salvar
  await page.locator('div').filter({ hasText: 'Número OS Origem OS' }).nth(5).click();
  await page.waitForTimeout(500);

  // 4. Se a categoria for refrigeração, preenche as medições (MED...) linha por linha
  if (categoria === 'refrigeracao') {
    let totalLinhas = await page.locator(seletorLinhas).count();
    
    for (let i = 0; i < totalLinhas; i++) {
      try {
        const linha = page.locator(seletorLinhas).nth(i);
        await linha.scrollIntoViewIfNeeded().catch(() => {});

        const codigoElement = linha.locator('.cell-content').first();
        const codigo = (await codigoElement.isVisible()) ? (await codigoElement.textContent()).trim() : '';

        if (codigo.toUpperCase().startsWith('MED')) {
          const celulaMedicao = linha.locator('.slick-cell.l11 .cell-content').first();
          await celulaMedicao.click({ force: true });
          await page.waitForTimeout(200);

          const inputMedicao = page.locator('#COperationMeasureValue');
          if (!(await inputMedicao.isVisible())) {
            await celulaMedicao.dblclick({ force: true });
            await page.waitForTimeout(200);
          }

          await inputMedicao.waitFor({ state: 'visible', timeout: 3000 });
          
          await inputMedicao.click();
          await page.keyboard.press('ControlOrMeta+A');
          await page.keyboard.press('Backspace');
          await inputMedicao.fill('0');
          await inputMedicao.press('Enter');
          await page.waitForTimeout(200);
        }
      } catch (err) {
        logPasso(`Erro ignorado na linha ${i + 1} (Medição): ${err.message.split('\n')[0]}`);
      }
    }

    // Clica novamente na área de referência para garantir estabilização da última medição
    await page.locator('div').filter({ hasText: 'Número OS Origem OS' }).nth(5).click();
    await page.waitForTimeout(500);
  }

  logPasso('Procedimentos por OS processados via Data Cabeçalho com sucesso.');
}

async function salvar(page) {
  logPasso('Salvando OS...');
  await page.getByText('Salvar').click();
  await page.waitForTimeout(2000);
}

async function processarOS(page, item) {
  console.log(`\n=== Iniciando OS ${item.numeroOS} ===`);
  const etapas = [
    ['Abrir OS Completa', () => abrirOSCompleta(page)],
    ['Preencher número da OS', () => preencherNumeroOS(page, item.numeroOS)],
    ['Marcar Estado Concluído', () => marcarEstadoConcluido(page)],
    ['Mão-de-Obra por OS', () => adicionarMaoDeObra(page, item)],
  ];

  let dataHoraFinal;
  for (const [nomeEtapa, executar] of etapas) {
    try {
      const resultado = await executar();
      if (nomeEtapa === 'Mão-de-Obra por OS') dataHoraFinal = resultado;
    } catch (erro) {
      erro.etapa = nomeEtapa;
      throw erro;
    }
  }

  try {
    await preencherProcedimentos(page, dataHoraFinal, item.categoria);
    await salvar(page);
  } catch (erro) {
    erro.etapa = erro.etapa || 'Procedimentos / Salvar';
    throw erro;
  }
}

async function main() {
  let listaBase;
  let dataInicioArquivo = null;

  if (fs.existsSync(ARQUIVO_ENTRADA)) {
    const resultado = carregarListaDeArquivo(ARQUIVO_ENTRADA);
    listaBase = resultado.lista;
    dataInicioArquivo = resultado.dataInicio;
  } else {
    listaBase = OS_PARA_PROCESSAR_EXEMPLO;
  }

  if (!listaBase || listaBase.length === 0) {
    console.log("Aviso: Lote não detectado ou lista vazia. Tentando leitura alternativa do formato simples do entradas-os.txt...");
    const conteudo = fs.readFileSync(ARQUIVO_ENTRADA, 'utf-8');
    let listaOS = [];
    for (const linha of conteudo.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const lower = linha.toLowerCase();
      if (lower.startsWith('inicio:')) {
        dataInicioArquivo = parseDataHoraBR(linha.split(':')[1].trim());
      } else if (lower.startsWith('os:')) {
        const osStr = linha.split(':')[1];
        if (osStr) {
          listaOS.push(...osStr.split(',').map(s => s.trim()).filter(Boolean));
        }
      }
    }
    listaBase = listaOS.map(numeroOS => ({ numeroOS, colaboradores: [process.env.PRISMA_USUARIO], categoria: 'refrigeracao' }));
  }

  let dataInicial = process.argv[2] ? parseDataHoraBR(process.argv[2]) : (dataInicioArquivo || new Date());
  const listaAgendada = gerarAgendamento(listaBase, dataInicial);

  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  const resultados = [];
  try {
    await login(page);
    for (const item of listaAgendada) {
      try {
        await processarOS(page, item);
        resultados.push({ os: item.numeroOS, status: 'concluido' });
      } catch (erro) {
        resultados.push({ os: item.numeroOS, status: 'erro', etapa: erro.etapa, mensagem: erro.message });
      }
    }
  } finally {
    await browser.close();
  }
  console.table(resultados);
}

main().catch((erro) => {
  console.error(`\nErro: ${erro.message}`);
  process.exit(1);
});