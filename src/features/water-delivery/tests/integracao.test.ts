/**
 * 23.2 e 23.3 — testes de integração e cenários ponta a ponta do módulo Água.
 *
 * Rodam contra o backend em memória de `harness/fake-supabase`, que reproduz o
 * query builder, a autenticação e as políticas de acesso (RLS) do item 15.
 * O código exercitado é o de produção — nada é reimplementado no teste.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { fakeSupabase, resetarBanco } from "./harness/fake-supabase";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: fakeSupabase,
  supabaseAdmin: fakeSupabase,
}));

const {
  aplicarImportacao,
  desfazerLote,
  garantirVisitasDoDia,
  listPontos,
  listProgramacao,
  listVisitas,
  registrarVisita,
  criarFiltro,
  listFiltros,
} = await import("@/features/water-delivery/queries/api");
const { lerPlanilhaAgua } = await import("@/features/water-delivery/importer/reader");
const { validarEntrega } = await import("@/features/water-delivery/mutations/execucao");
const { enfileirar, sincronizarFila, lerFila } = await import(
  "@/features/water-delivery/offline/offline"
);

/* ------------------------------------------------------------------ */
/* Planilha de apoio: 54 pontos distribuídos de segunda a sexta         */
/* ------------------------------------------------------------------ */

const DATA = "2026-07-06"; // segunda-feira

function planilha54(): ArrayBuffer {
  const pontos = Array.from({ length: 54 }, (_, i) => ({
    predio: `Bloco ${String.fromCharCode(65 + (i % 6))}${Math.floor(i / 6) + 1}`,
    andar: `${(i % 3) + 1}º`,
    espaco: i % 2 === 0 ? "Copa" : "Refeitório",
    // 1 a 3 dias por ponto
    dias: [1, ...(i % 2 === 0 ? [3] : []), ...(i % 3 === 0 ? [5] : [])],
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Programação GPS", "", "", ""],
      ["Prédio", "Andar", "Espaço", "Período"],
    ]),
    "PROGRAMAÇÃO 2",
  );
  for (const [dia, nome] of [
    [1, "Segunda-feira"],
    [3, "Quarta-feira"],
    [5, "Sexta-feira"],
  ] as const) {
    const linhas = pontos.filter((p) => p.dias.includes(dia)).map((p) => [p.predio, p.andar, p.espaco]);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Prédio", "Andar", "Espaço"], ...linhas]),
      nome,
    );
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

async function importar(): Promise<{ loteId: string; totalVisitas: number }> {
  const leitura = lerPlanilhaAgua(planilha54());
  const { loteId } = await aplicarImportacao({
    leitura,
    arquivoNome: "programacao-gps.xlsx",
    hash: "hash-teste",
    bagsPadrao: 2,
  });
  return { loteId, totalVisitas: leitura.totalVisitas };
}

beforeEach(() => {
  resetarBanco();
  localStorage?.clear?.();
});

/* ------------------------------------------------------------------ */
/* 23.2 — Integração                                                    */
/* ------------------------------------------------------------------ */

describe("importar planilha e criar a base de pontos", () => {
  it("cria os 54 pontos e a programação semanal correspondente", async () => {
    const { totalVisitas } = await importar();

    const pontos = await listPontos();
    const prog = await listProgramacao();
    expect(pontos).toHaveLength(54);
    expect(prog).toHaveLength(totalVisitas);
    expect(prog.every((p) => p.bags === 2)).toBe(true);
  });

  it("reimportar o mesmo arquivo não duplica pontos nem programação", async () => {
    const primeira = await importar();
    const segunda = await importar();

    expect(await listPontos()).toHaveLength(54);
    expect(await listProgramacao()).toHaveLength(segunda.totalVisitas);
    expect(primeira.loteId).not.toBe(segunda.loteId);
  });

  it("desfazer o lote remove a programação e preserva as execuções", async () => {
    const { loteId } = await importar();
    const visitas = await garantirVisitasDoDia(DATA);
    expect(visitas.length).toBeGreaterThan(0);

    await desfazerLote(loteId);

    expect(await listProgramacao()).toHaveLength(0);
    expect(await listVisitas(DATA, DATA)).toHaveLength(visitas.length);
    expect(await listPontos()).toHaveLength(54);
  });
});

describe("gerar as paradas do dia", () => {
  it("cria uma parada por ponto programado e mantém a contagem diária", async () => {
    await importar();
    const prog = await listProgramacao();
    const daSegunda = prog.filter((p) => p.dia_semana === 1);

    const visitas = await garantirVisitasDoDia(DATA);
    expect(visitas).toHaveLength(daSegunda.length);
    expect(visitas.every((v) => v.status === "pendente")).toBe(true);
    expect(visitas.every((v) => v.bags_previstas === 2)).toBe(true);
  });

  it("gerar duas vezes no mesmo dia não duplica paradas", async () => {
    await importar();
    const primeira = await garantirVisitasDoDia(DATA);
    const segunda = await garantirVisitasDoDia(DATA);
    expect(segunda).toHaveLength(primeira.length);
    expect(new Set(segunda.map((v) => v.id)).size).toBe(primeira.length);
  });
});

describe("concluir parada com evidência", () => {
  it("grava a conclusão e o evento de auditoria", async () => {
    await importar();
    const [visita] = await garantirVisitasDoDia(DATA);

    await registrarVisita(visita.id, {
      status: "concluida",
      bags_entregues: 2,
      fotos: ["https://i.ibb.co/foto.jpg"],
      recebido_por: "Ana",
    } as never);

    const atualizada = (await listVisitas(DATA, DATA)).find((v) => v.id === visita.id)!;
    expect(atualizada.status).toBe("concluida");
    expect(atualizada.bags_entregues).toBe(2);
    expect(fakeSupabase.linhas("agua_visita_eventos")).toHaveLength(1);
    expect(fakeSupabase.linhas("agua_visita_eventos")[0].tipo).toBe("status:concluida");
  });

  it("bloqueia a conclusão sem foto antes de chegar ao servidor", async () => {
    await importar();
    const [visita] = await garantirVisitasDoDia(DATA);

    const erros = validarEntrega(
      {
        status: "concluida",
        bags_entregues: 2,
        bags_recolhidas: 0,
        estoque_antes: null,
        estoque_depois: null,
        condicao: null,
        recebido_por: "Ana",
        observacao: null,
        motivo: null,
        fotos: [],
        assinatura_url: null,
        local_confirmado: true,
        latitude: null,
        longitude: null,
      },
      { saldoDisponivel: 10 },
    );

    expect(erros.length).toBeGreaterThan(0);
    const atual = (await listVisitas(DATA, DATA)).find((v) => v.id === visita.id)!;
    expect(atual.status).toBe("pendente");
  });
});

describe("solicitações de filtro", () => {
  it("cria a solicitação, notifica a gestão e aparece na listagem", async () => {
    await importar();
    const [ponto] = await listPontos();

    await criarFiltro({
      ponto_id: ponto.id,
      tipo: "corretiva",
      prioridade: "alta",
      predio: ponto.predio,
      andar_setor: ponto.andar,
      descricao: "Filtro com vazamento",
    } as never);

    const filtros = await listFiltros();
    expect(filtros).toHaveLength(1);
    expect(filtros[0].situacao).toBe("solicitada");
    expect(fakeSupabase.rpcs.some((r) => r.nome === "notificar_evento")).toBe(true);
  });
});

describe("bloqueio por RLS (item 15)", () => {
  it("login de corretiva não lê nem escreve dados de água", async () => {
    await importar();
    fakeSupabase.entrar("corretiva");

    await expect(listPontos()).rejects.toMatchObject({ code: "42501" });
    await expect(
      criarFiltro({ ponto_id: "x", tipo: "corretiva", prioridade: "media" } as never),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("login de climatização também fica de fora do módulo", async () => {
    await importar();
    fakeSupabase.entrar("climatizacao");
    await expect(listVisitas(DATA, DATA)).rejects.toMatchObject({ code: "42501" });
  });

  it("operador só enxerga e altera as paradas das rotas atribuídas a ele", async () => {
    await importar();
    const visitas = await garantirVisitasDoDia(DATA);
    const minha = visitas[0];
    const outra = visitas[1];
    fakeSupabase.linhas("agua_visitas").find((v) => v.id === minha.id)!.rota_id = "rota-minha";
    fakeSupabase.linhas("agua_visitas").find((v) => v.id === outra.id)!.rota_id = "rota-alheia";

    fakeSupabase.entrar("operador", "João");
    fakeSupabase.rotasDoOperador.add("rota-minha");

    const visiveis = await listVisitas(DATA, DATA);
    expect(visiveis.some((v) => v.id === minha.id)).toBe(true);
    expect(visiveis.some((v) => v.id === outra.id)).toBe(false);

    await expect(
      registrarVisita(outra.id, { status: "concluida", fotos: ["u"] } as never),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

/* ------------------------------------------------------------------ */
/* 23.3 — Cenários ponta a ponta                                        */
/* ------------------------------------------------------------------ */

describe("E2E — gestor importa, operador executa offline e sincroniza", () => {
  it("registra em campo sem rede e envia uma única vez ao voltar a conexão", async () => {
    await importar();
    const visitas = await garantirVisitasDoDia(DATA);
    const parada = visitas[0];

    // Operador perde a rede e conclui a parada localmente.
    const acaoId = await enfileirar("visita.entrega", {
      visitaId: parada.id,
      data: DATA,
      patch: {
        status: "concluida",
        bags_entregues: 2,
        fotos: ["https://i.ibb.co/evidencia.jpg"],
        recebido_por: "Ana",
      },
      baseAtualizadoEm: parada.atualizado_em ?? null,
    } as never);

    expect(await lerFila()).toHaveLength(1);

    // Rede volta: a fila é drenada.
    const primeiro = await sincronizarFila();
    expect(primeiro.sent).toBe(1);
    expect(await lerFila()).toHaveLength(0);

    const salva = fakeSupabase.linhas("agua_visitas").find((v) => v.id === parada.id)!;
    expect(salva.status).toBe("concluida");
    expect(salva.offline_idempotency_key).toBe(acaoId);

    // Reenvio do mesmo registro não gera entrega duplicada.
    const eventosAntes = fakeSupabase.linhas("agua_visita_eventos").length;
    const segundo = await sincronizarFila();
    expect(segundo.sent).toBe(0);
    expect(fakeSupabase.linhas("agua_visita_eventos")).toHaveLength(eventosAntes);
    expect(
      fakeSupabase.linhas("agua_visitas").filter((v) => v.id === parada.id),
    ).toHaveLength(1);
  });

  it("manda para revisão quando o servidor mudou a parada depois do registro local", async () => {
    await importar();
    const [parada] = await garantirVisitasDoDia(DATA);

    const base = "2020-01-01T00:00:00.000Z";
    await enfileirar("visita.entrega", {
      visitaId: parada.id,
      data: DATA,
      patch: { status: "concluida", bags_entregues: 2, fotos: ["u"] },
      baseAtualizadoEm: base,
    } as never);

    // Alguém finalizou a parada pelo painel enquanto o aparelho estava offline.
    fakeSupabase.linhas("agua_visitas").find((v) => v.id === parada.id)!.atualizado_em =
      new Date().toISOString();

    const report = await sincronizarFila();
    expect(report.sent).toBe(0);
    expect(report.deadLetters).toBeGreaterThan(0);
    const fila = await lerFila();
    expect(fila[0].dead).toBe(true);
  });

  it("acompanhamento em tempo real reflete o progresso da rota", async () => {
    await importar();
    const visitas = await garantirVisitasDoDia(DATA);
    for (const v of visitas.slice(0, 3)) {
      await registrarVisita(v.id, {
        status: "concluida",
        bags_entregues: 2,
        fotos: ["https://i.ibb.co/x.jpg"],
      } as never);
    }
    const atuais = await listVisitas(DATA, DATA);
    const concluidas = atuais.filter((v) => v.status === "concluida");
    expect(concluidas).toHaveLength(3);
    expect(Math.round((concluidas.length / atuais.length) * 100)).toBeGreaterThan(0);
  });
});
