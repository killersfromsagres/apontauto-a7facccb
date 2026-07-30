/**
 * Item 18.3 — Exportações do módulo Água: Excel, PDF, pacote de evidências,
 * relatório de divergências, impressão e compartilhamento.
 */

import { exportExcel } from "@/features/bi/export";
import { downloadBlob } from "@/lib/download";
import type { FiltroSolicitacao, Ponto, Visita } from "@/lib/agua/api";
import { VISITA_STATUS_LABEL } from "@/lib/agua/api";
import type { RotaOcorrencia } from "@/lib/agua/execucao";
import type { Rota } from "@/lib/agua/programacao";
import type { EntregaIndicadores, FiltroIndicadores } from "@/lib/agua/indicadores";

type Row = Record<string, unknown>;

const MARCA = "Apont Auto — Abastecimento de Água";

const dataBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const soData = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export const pontoTexto = (pontos: Ponto[], id: string) => {
  const p = pontos.find((x) => x.id === id);
  return p ? `${p.predio}${p.andar ? ` · ${p.andar}` : ""}${p.espaco ? ` · ${p.espaco}` : ""}` : "Ponto removido";
};

/** Identificador estável do documento (hash SHA-256 curto do conteúdo). */
export async function hashDocumento(payload: unknown): Promise<string> {
  const texto = JSON.stringify(payload);
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16).toUpperCase();
  } catch {
    let h = 0;
    for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
    return Math.abs(h).toString(16).toUpperCase().padStart(16, "0");
  }
}

/** Protocolo legível da rota (usado no PDF e no compartilhamento). */
export const protocoloRota = (rota: Rota) =>
  `AGUA-${rota.data.replace(/-/g, "")}-${rota.turno.slice(0, 3).toUpperCase()}-${rota.id.slice(0, 6).toUpperCase()}`;

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

export async function exportarIndicadoresExcel(args: {
  entrega: EntregaIndicadores;
  filtros: FiltroIndicadores;
  periodo: string;
}) {
  const { entrega, filtros, periodo } = args;
  await exportExcel(
    [
      {
        name: "Resumo entrega",
        rows: [
          { Indicador: "Paradas no período", Valor: entrega.totalParadas },
          { Indicador: "Taxa de conclusão (%)", Valor: entrega.taxaConclusao },
          { Indicador: "Bags previstas", Valor: entrega.bagsPrevistas },
          { Indicador: "Bags entregues", Valor: entrega.bagsEntregues },
          { Indicador: "Bags recolhidas", Valor: entrega.bagsRecolhidas },
          { Indicador: "Média por ponto", Valor: entrega.mediaPorPonto },
          { Indicador: "Paradas não realizadas", Valor: entrega.naoRealizadas },
          { Indicador: "Evidências faltantes", Valor: entrega.evidenciasFaltantes },
          { Indicador: "Divergências de bags", Valor: entrega.divergenciasBags },
          { Indicador: "Tempo médio por parada (min)", Valor: entrega.tempoMedioParadaMin },
          { Indicador: "Duração média por rota (min)", Valor: entrega.duracaoMediaRotaMin },
          { Indicador: "Quilometragem total (km)", Valor: entrega.kmTotal },
          { Indicador: "Previsto x realizado (%)", Valor: entrega.aderenciaPrevistoRealizado },
        ] as Row[],
      },
      {
        name: "Por dia",
        rows: entrega.porDia.map((l) => ({
          Dia: l.chave, Paradas: l.total, Concluídas: l.concluidas, "Taxa (%)": l.taxa, Bags: l.bags,
        })) as Row[],
      },
      {
        name: "Por prédio",
        rows: entrega.porPredio.map((l) => ({
          Prédio: l.chave, Paradas: l.total, Concluídas: l.concluidas, "Taxa (%)": l.taxa, Bags: l.bags,
        })) as Row[],
      },
      {
        name: "Produtividade",
        rows: entrega.porColaborador.map((l) => ({
          Colaborador: l.chave, Paradas: l.total, Concluídas: l.concluidas, Bags: l.bags,
          "Tempo médio (min)": l.tempoMedioParadaMin, "Bags/hora": l.produtividadeBagsHora,
        })) as Row[],
      },
      {
        name: "Rotas",
        rows: entrega.rotas.map((r) => ({
          Data: soData(r.data), Turno: r.turno, Equipe: r.equipe, Veículo: r.veiculo,
          Paradas: r.paradas, Concluídas: r.concluidas, "Duração (min)": r.duracaoMin ?? "—",
          "Km": r.km ?? "—", "Bags carregadas": r.bagsCarregadas, "Bags entregues": r.bagsEntregues,
          Divergência: r.divergencia,
        })) as Row[],
      },
      {
        name: "Motivos",
        rows: entrega.motivos.map((m) => ({ Motivo: m.motivo, Ocorrências: m.qtd })) as Row[],
      },
      {
        name: "Veículos",
        rows: entrega.porVeiculo.map((v) => ({
          Veículo: v.veiculo, Rotas: v.rotas, Km: Math.round(v.km * 10) / 10, Paradas: v.paradas, Bags: v.bags,
        })) as Row[],
      },
      {
        name: "Consumo por local",
        rows: entrega.consumoPorLocal.map((c) => ({
          Prédio: c.predio, Pontos: c.pontos, Bags: c.bags, "Média por ponto": c.mediaPorPonto,
        })) as Row[],
      },
      {
        name: "Filtros",
        rows: [
          { Indicador: "Solicitações", Valor: filtros.total },
          { Indicador: "Abertas", Valor: filtros.abertas },
          { Indicador: "Vencidas", Valor: filtros.vencidas },
          { Indicador: "Concluídas", Valor: filtros.concluidas },
          { Indicador: "Tempo médio de triagem (h)", Valor: filtros.tempoTriagemMedioH },
          { Indicador: "Tempo médio de conclusão (h)", Valor: filtros.tempoConclusaoMedioH },
          { Indicador: "Cumprimento de SLA (%)", Valor: filtros.slaCumprimentoPct },
          { Indicador: "Reincidências", Valor: filtros.reincidencia },
          { Indicador: "Preventivas", Valor: filtros.preventivas },
          { Indicador: "Corretivas", Valor: filtros.corretivas },
          { Indicador: "Avaliação média", Valor: filtros.avaliacaoMedia ?? "—" },
          { Indicador: "Custo/material informado", Valor: filtros.custoTotal ?? "—" },
        ] as Row[],
      },
    ],
    "agua-indicadores",
    `${MARCA} · ${periodo}`,
  );
}

/** Relatório por prédio (18.3). */
export async function exportarRelatorioPredio(entrega: EntregaIndicadores, periodo: string) {
  await exportExcel(
    [
      {
        name: "Prédios",
        rows: entrega.porPredio.map((l) => {
          const consumo = entrega.consumoPorLocal.find((c) => c.predio === l.chave);
          return {
            Prédio: l.chave, Paradas: l.total, Concluídas: l.concluidas,
            "Não realizadas": l.naoRealizadas, "Taxa (%)": l.taxa,
            "Bags entregues": l.bags, Pontos: consumo?.pontos ?? 0,
            "Média por ponto": consumo?.mediaPorPonto ?? 0,
          };
        }) as Row[],
      },
    ],
    "agua-relatorio-predio",
    `${MARCA} · Relatório por prédio · ${periodo}`,
  );
}

/** Relatório de divergências: bags, evidências e ocorrências. */
export async function exportarRelatorioDivergencia(args: {
  entrega: EntregaIndicadores;
  ocorrencias: RotaOcorrencia[];
  periodo: string;
}) {
  const { entrega, ocorrencias, periodo } = args;
  await exportExcel(
    [
      {
        name: "Divergência de bags",
        rows: entrega.rotas
          .filter((r) => r.divergencia !== 0 || r.bagsCarregadas !== r.bagsEntregues)
          .map((r) => ({
            Data: soData(r.data), Turno: r.turno, Equipe: r.equipe, Veículo: r.veiculo,
            "Bags carregadas": r.bagsCarregadas, "Bags entregues": r.bagsEntregues,
            Divergência: r.divergencia,
          })) as Row[],
      },
      {
        name: "Evidências faltantes",
        rows: entrega.evidenciasPendentes.map((e) => ({
          Data: soData(e.data), Ponto: e.ponto, Status: VISITA_STATUS_LABEL[e.status] ?? e.status,
        })) as Row[],
      },
      {
        name: "Ocorrências",
        rows: ocorrencias.map((o) => ({
          Registrada: dataBR(o.criado_em), Tipo: o.tipo, Situação: o.situacao,
          Divergência: o.divergencia ?? "—", Descrição: o.descricao ?? "—", Tratativa: o.tratativa ?? "—",
        })) as Row[],
      },
    ],
    "agua-divergencias",
    `${MARCA} · Divergências · ${periodo}`,
  );
}

/** Relatório de filtros com detalhamento das solicitações. */
export async function exportarRelatorioFiltros(args: {
  indicadores: FiltroIndicadores;
  solicitacoes: FiltroSolicitacao[];
  periodo: string;
}) {
  const { indicadores, solicitacoes, periodo } = args;
  await exportExcel(
    [
      {
        name: "Solicitações",
        rows: solicitacoes.map((s) => ({
          Número: s.numero ?? "—", Aberta: dataBR(s.criado_em), Situação: s.situacao,
          Prioridade: s.prioridade, Tipo: s.tipo, Origem: s.origem,
          Prédio: s.predio ?? "—", "Andar/Setor": s.andar_setor ?? "—", Espaço: s.espaco ?? "—",
          "Vence em": dataBR(s.vence_em), Concluída: dataBR(s.concluida_em),
          Reaberturas: s.reaberturas ?? 0, Avaliação: s.avaliacao_nota ?? "—",
          Responsável: s.responsavel_nome ?? "—", Material: s.material_descricao ?? "—",
        })) as Row[],
      },
      {
        name: "Indicadores",
        rows: [
          { Indicador: "Abertas", Valor: indicadores.abertas },
          { Indicador: "Vencidas", Valor: indicadores.vencidas },
          { Indicador: "SLA (%)", Valor: indicadores.slaCumprimentoPct },
          { Indicador: "Triagem média (h)", Valor: indicadores.tempoTriagemMedioH },
          { Indicador: "Conclusão média (h)", Valor: indicadores.tempoConclusaoMedioH },
          { Indicador: "Reincidência", Valor: indicadores.reincidencia },
          { Indicador: "Preventiva x corretiva", Valor: `${indicadores.preventivas} x ${indicadores.corretivas}` },
        ] as Row[],
      },
      {
        name: "Filtros vencendo",
        rows: indicadores.vencendo.map((v) => ({
          Filtro: v.ponto, "Próxima troca": soData(v.proximaTroca), "Dias restantes": v.diasRestantes,
        })) as Row[],
      },
      {
        name: "Por prédio",
        rows: indicadores.porPredio.map((p) => ({
          Prédio: p.predio, Solicitações: p.qtd, Concluídas: p.concluidas,
        })) as Row[],
      },
    ],
    "agua-filtros",
    `${MARCA} · Filtros · ${periodo}`,
  );
}

/* ------------------------------------------------------------------ */
/* Pacote de evidências                                                */
/* ------------------------------------------------------------------ */

/** CSV com o índice das evidências (links do ImgBB) do período. */
export function exportarPacoteEvidencias(args: { visitas: Visita[]; pontos: Ponto[]; periodo: string }) {
  const linhas: string[][] = [["Data", "Ponto", "Status", "Recebido por", "Foto", "Assinatura"]];
  for (const v of args.visitas) {
    const fotos = v.fotos?.length ? v.fotos : v.foto_url ? [v.foto_url] : [];
    if (!fotos.length && !v.assinatura_url) continue;
    for (const foto of fotos.length ? fotos : [""]) {
      linhas.push([
        soData(v.data),
        pontoTexto(args.pontos, v.ponto_id),
        VISITA_STATUS_LABEL[v.status] ?? v.status,
        v.recebido_por ?? "",
        foto,
        v.assinatura_url ?? "",
      ]);
    }
  }
  const csv = linhas
    .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  downloadBlob(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    `agua-evidencias-${args.periodo.replace(/[^\d]/g, "")}.csv`,
  );
  return linhas.length - 1;
}

/* ------------------------------------------------------------------ */
/* PDF de rota (18.3)                                                  */
/* ------------------------------------------------------------------ */

async function imagemBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportarRotaPdf(args: {
  rota: Rota;
  visitas: Visita[];
  pontos: Ponto[];
  ocorrencias?: RotaOcorrencia[];
  incluirFotos?: boolean;
}): Promise<{ protocolo: string; hash: string }> {
  const { rota, visitas, pontos } = args;
  const ocorrencias = args.ocorrencias ?? [];
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const protocolo = protocoloRota(rota);
  const hash = await hashDocumento({ rota, visitas: visitas.map((v) => v.id) });
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  doc.setFillColor(8, 14, 24);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("APONT AUTO — Relatório de Rota de Água", 12, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Protocolo ${protocolo}`, 12, 19);
  doc.text(soData(rota.data), W - 12, 19, { align: "right" });

  const km =
    rota.hodometro_inicial != null && rota.hodometro_final != null
      ? `${Math.max(0, Number(rota.hodometro_final) - Number(rota.hodometro_inicial))} km`
      : "—";

  autoTable(doc, {
    startY: 32,
    head: [["Dados da rota", ""]],
    body: [
      ["Data / turno", `${soData(rota.data)} · ${rota.turno}`],
      ["Equipe", rota.equipe || "—"],
      ["Colaboradores", [rota.colaborador_principal, rota.colaborador_secundario].filter(Boolean).join(" / ") || "—"],
      ["Supervisor", rota.supervisor ?? "—"],
      ["Veículo", rota.veiculo ?? "—"],
      ["Hodômetro inicial", rota.hodometro_inicial != null ? `${rota.hodometro_inicial} km` : "—"],
      ["Hodômetro final", rota.hodometro_final != null ? `${rota.hodometro_final} km` : "—"],
      ["Quilometragem", km],
      ["Status", rota.status],
      ["Início / fim", `${dataBR(rota.iniciada_em)} — ${dataBR(rota.finalizada_em)}`],
    ],
    theme: "grid",
    headStyles: { fillColor: [24, 160, 168], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
  });

  const entregues = visitas.reduce((a, v) => a + (v.bags_entregues ?? 0), 0);
  autoTable(doc, {
    head: [["Bags", ""]],
    body: [
      ["Carregadas", String(rota.bags_carregadas ?? 0)],
      ["Entregues", String(entregues)],
      ["Recolhidas", String(rota.bags_recolhidas ?? visitas.reduce((a, v) => a + (v.bags_recolhidas ?? 0), 0))],
      ["Restantes", String(rota.bags_restantes ?? 0)],
      ["Divergência", String(rota.divergencia_bags ?? 0)],
      ["Justificativa", rota.divergencia_justificativa ?? "—"],
    ],
    theme: "grid",
    headStyles: { fillColor: [24, 160, 168], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
  });

  autoTable(doc, {
    head: [["#", "Parada", "Status", "Previstas", "Entregues", "Recolhidas", "Horário"]],
    body: visitas.map((v, i) => [
      String(i + 1),
      pontoTexto(pontos, v.ponto_id),
      VISITA_STATUS_LABEL[v.status] ?? v.status,
      String(v.bags_previstas ?? 0),
      String(v.bags_entregues ?? 0),
      String(v.bags_recolhidas ?? 0),
      v.executado_em ? new Date(v.executado_em).toLocaleTimeString("pt-BR", { timeStyle: "short" }) : "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
  });

  const ocorrenciasRota = ocorrencias.filter((o) => o.rota_id === rota.id);
  if (ocorrenciasRota.length) {
    autoTable(doc, {
      head: [["Ocorrência", "Situação", "Descrição", "Tratativa"]],
      body: ocorrenciasRota.map((o) => [o.tipo, o.situacao, o.descricao ?? "—", o.tratativa ?? "—"]),
      theme: "grid",
      headStyles: { fillColor: [180, 83, 9], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });
  }

  /* Miniaturas das evidências */
  if (args.incluirFotos !== false) {
    const urls = visitas.flatMap((v) => (v.fotos?.length ? v.fotos : v.foto_url ? [v.foto_url] : [])).slice(0, 12);
    if (urls.length) {
      let y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 10;
      if (y > H - 60) {
        doc.addPage();
        y = 20;
      }
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Evidências fotográficas", 12, y);
      y += 4;
      let x = 12;
      for (const url of urls) {
        const dataUrl = await imagemBase64(url);
        if (!dataUrl) continue;
        if (x + 44 > W - 12) {
          x = 12;
          y += 36;
        }
        if (y + 34 > H - 20) {
          doc.addPage();
          y = 20;
          x = 12;
        }
        try {
          doc.addImage(dataUrl, "JPEG", x, y, 42, 32);
        } catch {
          /* imagem inválida — segue */
        }
        x += 46;
      }
    }
  }

  /* Confirmação e rodapé */
  const assinatura = visitas.find((v) => v.assinatura_url)?.assinatura_url ?? null;
  doc.addPage();
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Confirmação da execução", 12, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Confirmado pelo colaborador principal: ${rota.confirmado_principal ? "sim" : "não"}`,
    12,
    32,
  );
  doc.text(
    `Confirmado pelo colaborador secundário: ${rota.confirmado_secundario ? "sim" : "não"}`,
    12,
    38,
  );
  if (assinatura) {
    const img = await imagemBase64(assinatura);
    if (img) {
      try {
        doc.addImage(img, "PNG", 12, 44, 70, 28);
      } catch {
        /* ignora assinatura inválida */
      }
    }
  }
  doc.setDrawColor(120);
  doc.line(12, 82, 92, 82);
  doc.text("Assinatura / confirmação do recebedor", 12, 87);

  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(`Identificador do documento: ${hash}`, 12, H - 16);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} · ${MARCA}`, 12, H - 11);

  doc.save(`rota-agua-${protocolo}.pdf`);
  return { protocolo, hash };
}

/* ------------------------------------------------------------------ */
/* Impressão e compartilhamento                                        */
/* ------------------------------------------------------------------ */

export function imprimirPainel() {
  window.print();
}

export async function compartilharResumo(texto: string, titulo = "Indicadores — Água"): Promise<boolean> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: titulo, text: texto });
      return true;
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function resumoTexto(entrega: EntregaIndicadores, filtros: FiltroIndicadores, periodo: string) {
  return [
    `${MARCA} · ${periodo}`,
    `Paradas: ${entrega.totalParadas} · Conclusão: ${entrega.taxaConclusao}%`,
    `Bags entregues: ${entrega.bagsEntregues} (previsto ${entrega.bagsPrevistas})`,
    `Não realizadas: ${entrega.naoRealizadas} · Evidências faltantes: ${entrega.evidenciasFaltantes}`,
    `Filtros abertos: ${filtros.abertas} · Vencidos: ${filtros.vencidas} · SLA: ${filtros.slaCumprimentoPct}%`,
  ].join("\n");
}
