import { downloadBlob } from "@/lib/download";
import type { GestaoFiltros, GestaoOverviewV2, OsConsolidada } from "../types";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

export type Contexto = {
  overview: GestaoOverviewV2;
  os: OsConsolidada[];
  filtros: GestaoFiltros;
  autor: string;
  unidade: string;
};

/** Identificador simples e estável do relatório (rastreabilidade). */
export function protocolo(ctx: Contexto) {
  const base = `${ctx.filtros.dias}-${ctx.overview.gerado_em}-${ctx.os.length}`;
  let h = 0;
  for (const c of base) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `GEST-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${h.toString(16).toUpperCase().padStart(8, "0")}`;
}

function resumoLinhas(ctx: Contexto): Array<[string, string | number]> {
  const d = ctx.overview;
  const sla = d.os.concluidas > 0 ? Math.round((d.os.sla_ok / d.os.concluidas) * 100) : 0;
  return [
    ["Protocolo", protocolo(ctx)],
    ["Unidade", ctx.unidade],
    ["Autor", ctx.autor],
    ["Gerado em", new Date(d.gerado_em).toLocaleString("pt-BR")],
    ["Período (dias)", d.periodo_dias],
    ["Filtros aplicados", filtrosLegenda(ctx.filtros)],
    ["OS abertas", d.os.abertas],
    ["OS concluídas no período", d.os.concluidas],
    ["OS vencidas", d.os.vencidas],
    ["Vencendo em 24h", d.os.vence_24h],
    ["Vencendo em 48h", d.os.vence_48h],
    ["Backlog acima de 30 dias", d.os.backlog_30],
    ["Cumprimento de SLA (%)", sla],
    ["Tempo médio de atendimento (h)", d.os.tma_horas],
    ["MTTR (h)", d.os.mttr_horas],
    ["OS críticas abertas", d.os.criticas],
    ["Veículos disponíveis", d.frota.disponiveis],
    ["Veículos bloqueados", d.frota.bloqueados],
    ["Checklists no período", d.frota.checklists],
    ["Checklists reprovados", d.frota.reprovados],
    ["Custo de combustível", brl(d.frota.custo)],
    ["Litros abastecidos", d.frota.litros],
    ["Entregas de água", d.agua.entregas],
    ["Bags entregues", d.agua.bags],
    ["Entregas sem evidência", d.agua.sem_evidencia],
    ["Filtros vencidos", d.filtros.vencidos],
    ["Materiais pendentes", d.materiais.pendentes],
    ["Peças aguardando aprovação", d.pecas.aguardando],
    ["Itens legais vencidos", d.legal.vencidos],
    ["Itens legais a vencer em 30 dias", d.legal.proximos_30],
    ["ASO vencidos", d.sst.aso_vencidos],
    ["PT suspensas", d.taludes.pt_suspensas],
    ["Fontes", "vw_gestao_os_consolidada, gestao_overview_v2"],
  ];
}

export function filtrosLegenda(f: GestaoFiltros) {
  const partes = [
    `Período: ${f.dias} dia(s)`,
    f.modulo ? `Módulo: ${f.modulo}` : null,
    f.equipe ? `Equipe: ${f.equipe}` : null,
    f.predio ? `Prédio: ${f.predio}` : null,
    f.status ? `Status: ${f.status}` : null,
    f.criticidade ? `Criticidade: ${f.criticidade}` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

export function exportarCsv(ctx: Contexto) {
  const linhas = [
    "Indicador;Valor",
    ...resumoLinhas(ctx).map(([k, v]) => `${k};${v}`),
    "",
    "Origem;OS;Descrição;Prédio;Andar;Local;Equipe;Criticidade;Status;Criada em;Prazo;Atraso (dias)",
    ...ctx.os.map((o) =>
      [
        o.origem,
        o.numero_os ?? "",
        (o.descricao ?? "").replaceAll(";", ","),
        o.predio ?? "",
        o.andar ?? "",
        o.local ?? "",
        o.equipe ?? "",
        o.criticidade ?? "",
        o.status_canonico,
        dt(o.criado_em),
        dt(o.prazo_sla),
        o.atrasada ? (o.dias_atraso ?? 0) : 0,
      ].join(";"),
    ),
  ].join("\n");
  downloadBlob(
    new Blob([`\uFEFF${linhas}`], { type: "text/csv;charset=utf-8" }),
    `centro-gestao-${protocolo(ctx)}.csv`,
  );
}

export async function exportarExcel(ctx: Contexto) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = ctx.autor;
  wb.created = new Date();

  const resumo = wb.addWorksheet("Resumo executivo");
  resumo.columns = [
    { header: "Indicador", key: "k", width: 40 },
    { header: "Valor", key: "v", width: 30 },
  ];
  resumoLinhas(ctx).forEach(([k, v]) => resumo.addRow({ k, v }));
  resumo.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  resumo.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

  const det = wb.addWorksheet("Ordens de serviço");
  det.columns = [
    { header: "Origem", key: "origem", width: 14 },
    { header: "OS", key: "os", width: 16 },
    { header: "Descrição", key: "desc", width: 48 },
    { header: "Ativo", key: "ativo", width: 22 },
    { header: "Prédio", key: "predio", width: 18 },
    { header: "Andar", key: "andar", width: 14 },
    { header: "Local", key: "local", width: 20 },
    { header: "Equipe", key: "equipe", width: 18 },
    { header: "Criticidade", key: "crit", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Criada em", key: "criada", width: 14 },
    { header: "Prazo", key: "prazo", width: 14 },
    { header: "Atraso (dias)", key: "atraso", width: 14 },
  ];
  ctx.os.forEach((o) =>
    det.addRow({
      origem: o.origem,
      os: o.numero_os,
      desc: o.descricao,
      ativo: o.ativo,
      predio: o.predio,
      andar: o.andar,
      local: o.local,
      equipe: o.equipe,
      crit: o.criticidade,
      status: o.status_canonico,
      criada: dt(o.criado_em),
      prazo: dt(o.prazo_sla),
      atraso: o.atrasada ? (o.dias_atraso ?? 0) : 0,
    }),
  );
  det.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  det.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  det.autoFilter = { from: "A1", to: "M1" };

  const equipes = wb.addWorksheet("Equipes");
  equipes.columns = [
    { header: "Equipe", key: "e", width: 26 },
    { header: "Abertas", key: "a", width: 12 },
    { header: "Concluídas", key: "c", width: 14 },
    { header: "Atrasadas", key: "t", width: 12 },
    { header: "TMA (h)", key: "h", width: 12 },
  ];
  (ctx.overview.os_equipes ?? []).forEach((e) =>
    equipes.addRow({ e: e.equipe, a: e.abertas, c: e.concluidas, t: e.atrasadas, h: e.tma_horas }),
  );
  equipes.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `centro-gestao-${protocolo(ctx)}.xlsx`,
  );
}

export async function exportarPdf(ctx: Contexto) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, w, 74, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.text("Centro de Gestão — Apont Auto", 40, 34);
  doc.setFontSize(9);
  doc.text(
    `${ctx.unidade} · ${filtrosLegenda(ctx.filtros)} · Gerado em ${new Date().toLocaleString("pt-BR")}`,
    40,
    52,
  );
  doc.text(`Autor: ${ctx.autor} · Protocolo: ${protocolo(ctx)}`, 40, 65);
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: 94,
    head: [["Indicador", "Valor"]],
    body: resumoLinhas(ctx).map(([k, v]) => [String(k), String(v)]),
    theme: "grid",
    headStyles: { fillColor: [15, 118, 110] },
    styles: { fontSize: 8, cellPadding: 4 },
  });

  autoTable(doc, {
    head: [["Origem", "OS", "Descrição", "Prédio", "Equipe", "Status", "Prazo"]],
    body: ctx.os
      .slice(0, 400)
      .map((o) => [
        o.origem,
        o.numero_os ?? "—",
        (o.descricao ?? "—").slice(0, 60),
        o.predio ?? "—",
        o.equipe ?? "—",
        o.status_canonico,
        dt(o.prazo_sla),
      ]),
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 7, cellPadding: 3 },
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `Fontes: vw_gestao_os_consolidada · gestao_overview_v2 — página ${i}/${total}`,
      40,
      doc.internal.pageSize.getHeight() - 20,
    );
  }
  doc.save(`centro-gestao-${protocolo(ctx)}.pdf`);
}
