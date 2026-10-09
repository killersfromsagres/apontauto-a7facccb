from pathlib import Path
import re

# 1) Corretiva Novo: preservar explicitamente equipes de apoio no report.
path = Path("src/features/relatorio-diario/lib/corrective-report.ts")
text = path.read_text()
anchor = '''const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .trim()
    .toLowerCase();
'''
helper = anchor + '''
export const REPORT_SUPPORT_TEAMS = ["Chaveiro", "Pintura", "Limpeza"] as const;

const SUPPORT_TEAM_MATCHERS = [
  { canonical: "Chaveiro", aliases: ["chaveiro"] },
  { canonical: "Pintura", aliases: ["pintura", "pintor"] },
  { canonical: "Limpeza", aliases: ["limpeza", "higienizacao", "conservacao"] },
] as const;

/**
 * Mantém Chaveiro, Pintura e Limpeza como equipes explícitas no report.
 * A descrição só é usada como fallback quando o cadastro da equipe veio vazio,
 * evitando reclassificações indevidas de outras disciplinas.
 */
export function normalizeReportTeam(value: unknown, fallbackText = "") {
  const explicit = String(value ?? "").trim();
  const explicitNormalized = normalize(explicit);
  for (const group of SUPPORT_TEAM_MATCHERS) {
    if (group.aliases.some((alias) => explicitNormalized.includes(alias))) return group.canonical;
  }
  if (explicit) return explicit;

  const fallbackNormalized = normalize(fallbackText);
  for (const group of SUPPORT_TEAM_MATCHERS) {
    if (group.aliases.some((alias) => fallbackNormalized.includes(alias))) return group.canonical;
  }
  return "Sem equipe";
}
'''
if "REPORT_SUPPORT_TEAMS" not in text:
    if anchor not in text:
        raise SystemExit("normalize anchor not found in corrective-report.ts")
    text = text.replace(anchor, helper, 1)
old_team = '  const team = String(source.equipe ?? "").trim() || "Sem equipe";'
new_team = '  const team = normalizeReportTeam(source.equipe, `${source.nome_os ?? ""} ${source.equipamento ?? ""}`);'
if old_team in text:
    text = text.replace(old_team, new_team, 1)
elif new_team not in text:
    raise SystemExit("team mapping anchor not found in corrective-report.ts")
path.write_text(text)

# 2) Testes de regressão: equipes de apoio + período ativo da programação.
path = Path("src/features/relatorio-diario/lib/corrective-report.test.ts")
text = path.read_text()
marker = '  it("nova semana sem sobreposição substitui; mesmo período mescla", () => {'
tests = '''  it("mantém Chaveiro, Pintura e Limpeza como equipes próprias nas conclusões do dia", () => {
    const supportRows: CorrectiveReportSourceRow[] = [
      { id: "ch", numero_os: "901", status: "concluida", fim: "2026-10-06T12:00:00.000Z", equipe: "CHAVEIRO - APOIO", nome_os: "Troca de miolo" },
      { id: "pi", numero_os: "902", status: "concluida", fim: "2026-10-06T13:00:00.000Z", equipe: "PINTURA", nome_os: "Retoque de parede" },
      { id: "li", numero_os: "903", status: "concluida", fim: "2026-10-06T14:00:00.000Z", equipe: "Limpeza / Conservação", nome_os: "Limpeza técnica" },
    ];

    const reportRows = buildCompletedReportRows({
      scheduledRows: [],
      executions: {},
      correctiveRows: supportRows,
      selectedDate: "2026-10-06",
    });

    expect(reportRows.map((row) => row.os).sort()).toEqual(["901", "902", "903"]);
    expect(reportRows.map((row) => row.team).sort()).toEqual(["Chaveiro", "Limpeza", "Pintura"]);
    expect(reportRows.every((row) => row.activity === "Corretiva")).toBe(true);
  });

  it("não cria dias antigos para equipes de apoio fora do período importado", () => {
    const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((date, i) => ({
      ...scheduled[0],
      id: `support-${date}-${i}`,
      date,
      os: `S${i}`,
    }));
    const summaries = buildReportDaySummaries({
      scheduledRows: week,
      executions: {},
      correctiveRows: [
        { id: "old-paint", numero_os: "904", status: "concluida", fim: "2026-09-29T12:00:00.000Z", equipe: "Pintura" },
        { id: "old-clean", numero_os: "905", status: "concluida", fim: "2026-09-29T13:00:00.000Z", equipe: "Limpeza" },
        { id: "current-key", numero_os: "906", status: "concluida", fim: "2026-10-05T14:00:00.000Z", equipe: "Chaveiro" },
      ],
    });

    expect(summaries.some((item) => item.date === "2026-09-29")).toBe(false);
    expect(summaries.find((item) => item.date === "2026-10-05")?.completedCorrective).toBe(1);
  });

'''
if 'mantém Chaveiro, Pintura e Limpeza como equipes próprias' not in text:
    if marker not in text:
        raise SystemExit("test insertion anchor not found")
    text = text.replace(marker, tests + marker, 1)
path.write_text(text)

# 3) PDF premium, exclusivamente focado no que foi executado no dia.
path = Path("src/routes/_authenticated/relatorio-diario.tsx")
text = path.read_text()
new_function = r'''  async function generatePdf() {
    setGenerating(true);
    try {
      const latestCorrectiveRows = await loadCorrectiveCompletions(false);
      const sourceCorrectives = latestCorrectiveRows ?? correctiveRows;
      const pdfRows = buildCompletedReportRows({
        scheduledRows: rows,
        executions,
        correctiveRows: sourceCorrectives,
        selectedDate,
      });

      if (!pdfRows.length) {
        toast.error("Não há OS concluídas nesta data para gerar o relatório.");
        return;
      }

      const pdfPreventive = pdfRows.filter((row) => row.activity === "Preventiva").length;
      const pdfCorrective = pdfRows.filter((row) => row.activity === "Corretiva").length;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const margin = 12;
      const titleDate = formatDateBr(selectedDate);
      const [gpsLogo, swLogo] = await Promise.all([
        loadLogo("/logos/gps-logo.png"),
        loadLogo("/logos/sw-logo.png"),
      ]);

      const sorted = [...pdfRows].sort(
        (a, b) =>
          maintenanceAreaRank(rowArea(a)) - maintenanceAreaRank(rowArea(b)) ||
          a.team.localeCompare(b.team) ||
          a.activity.localeCompare(b.activity) ||
          a.os.localeCompare(b.os),
      );

      const grouped = new Map<string, ScheduledMaintenance[]>();
      sorted.forEach((row) => {
        const team = row.team || "Sem equipe";
        const current = grouped.get(team) ?? [];
        current.push(row);
        grouped.set(team, current);
      });

      const supportOrder = (team: string) => {
        const normalized = team.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (normalized.includes("chaveiro")) return 0;
        if (normalized.includes("pintura")) return 1;
        if (normalized.includes("limpeza")) return 2;
        return 9;
      };
      const teamGroups = Array.from(grouped.entries()).sort(([teamA, rowsA], [teamB, rowsB]) => {
        const areaDiff = maintenanceAreaRank(rowArea(rowsA[0])) - maintenanceAreaRank(rowArea(rowsB[0]));
        return areaDiff || supportOrder(teamA) - supportOrder(teamB) || teamA.localeCompare(teamB);
      });

      const reportAreas = Array.from(new Set(pdfRows.map(rowArea))).sort(
        (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
      );
      const noteLines = dailyNote.trim()
        ? (doc.splitTextToSize(dailyNote.trim(), width - margin * 2 - 28) as string[]).slice(0, 2)
        : [];
      const firstTableY = noteLines.length ? 75 : author.trim() ? 70 : 66;

      const drawLogoCard = (logo: LoadedLogo | null, x: number, y: number, maxW: number, maxH: number) => {
        if (!logo) return;
        const h = Math.min(maxH - 4, (maxW - 5) / logo.ratio);
        const w = Math.min(maxW - 5, h * logo.ratio);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, maxW, maxH, 2, 2, "F");
        doc.addImage(logo.data, "PNG", x + (maxW - w) / 2, y + (maxH - h) / 2, w, h);
      };

      const drawPageChrome = (pageNumber: number) => {
        const first = pageNumber === 1;
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, width, first ? 31 : 18, "F");
        doc.setFillColor(178, 146, 82);
        doc.rect(0, first ? 30 : 17, width, 1, "F");

        // Marca d'água discreta: sem branding do sistema.
        doc.setFont("helvetica", "bold");
        doc.setFontSize(26);
        doc.setTextColor(246, 247, 249);
        doc.text("SHERWIN WILLIAMS DEMARCHI", width / 2, height / 2 + 8, {
          align: "center",
          angle: 330,
        });

        if (first) {
          drawLogoCard(gpsLogo, margin, 6, 31, 15);
          drawLogoCard(swLogo, width - margin - 36, 6, 36, 15);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(15.5);
          doc.setTextColor(255, 255, 255);
          doc.text("RELATÓRIO DIÁRIO DE MANUTENÇÃO", width / 2, 11.5, { align: "center" });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(203, 213, 225);
          doc.text("Grupo GPS  •  Sherwin-Williams Demarchi  •  Serviços realizados", width / 2, 18, {
            align: "center",
          });
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.2);
          doc.setTextColor(226, 232, 240);
          doc.text(titleDate, width / 2, 24.3, { align: "center" });

          const cardY = 36;
          const cardH = 15;
          const gap = 4;
          const cardW = 37;
          const cards = [
            { label: "EXECUÇÕES", value: pdfRows.length },
            { label: "PREVENTIVAS", value: pdfPreventive },
            { label: "CORRETIVAS", value: pdfCorrective },
            { label: "EQUIPES", value: teamGroups.length },
          ];
          cards.forEach((card, index) => {
            const x = margin + index * (cardW + gap);
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(x, cardY, cardW, cardH, 2.2, 2.2, "FD");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(13);
            doc.setTextColor(15, 23, 42);
            doc.text(String(card.value), x + 4, cardY + 7);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.3);
            doc.setTextColor(100, 116, 139);
            doc.text(card.label, x + 4, cardY + 11.7);
          });

          const infoX = margin + 4 * (cardW + gap) + 4;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.6);
          doc.setTextColor(71, 85, 105);
          doc.text("RESUMO EXECUTIVO", infoX, cardY + 3.8);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(51, 65, 85);
          doc.text(`Áreas: ${reportAreas.join(" • ")}`, infoX, cardY + 8.2, {
            maxWidth: width - margin - infoX,
          });
          doc.text(`Equipes: ${teamGroups.map(([team]) => team).join(" • ")}`, infoX, cardY + 12.3, {
            maxWidth: width - margin - infoX,
          });

          let detailY = 57.5;
          if (author.trim()) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.8);
            doc.setTextColor(71, 85, 105);
            doc.text("Responsável", margin, detailY);
            doc.setFont("helvetica", "normal");
            doc.text(author.trim(), margin + 18, detailY);
            detailY += 4;
          }
          if (noteLines.length) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.8);
            doc.setTextColor(71, 85, 105);
            doc.text("Observação", margin, detailY);
            doc.setFont("helvetica", "normal");
            doc.text(noteLines, margin + 18, detailY, { maxWidth: width - margin * 2 - 18 });
          }
        } else {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.2);
          doc.setTextColor(255, 255, 255);
          doc.text("RELATÓRIO DIÁRIO DE MANUTENÇÃO", margin, 9.5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.1);
          doc.setTextColor(203, 213, 225);
          doc.text(`Sherwin-Williams Demarchi • ${titleDate}`, width - margin, 9.5, { align: "right" });
        }
      };

      const tableBody: any[] = [];
      const tableMeta: Array<ScheduledMaintenance | null> = [];
      teamGroups.forEach(([team, teamRows]) => {
        const color = equipeHex(team);
        tableBody.push([
          {
            content: `${team.toUpperCase()}  •  ${teamRows.length} ${teamRows.length === 1 ? "EXECUÇÃO" : "EXECUÇÕES"}`,
            colSpan: 6,
            styles: {
              fillColor: subtleTeamTint(color),
              textColor: darkTeamText(color),
              fontStyle: "bold",
              fontSize: 7.5,
              cellPadding: { top: 2.2, right: 2.2, bottom: 2.2, left: 3 },
              lineColor: [226, 232, 240],
              lineWidth: { bottom: 0.18 },
            },
          },
        ]);
        tableMeta.push(null);
        teamRows.forEach((row) => {
          tableBody.push([
            row.os,
            row.activity,
            formatDateBr(row.completedAt || selectedDate),
            maintenanceLocation(row),
            row.name || row.equipment || "—",
            row.asset || "—",
          ]);
          tableMeta.push(row);
        });
      });

      autoTable(doc, {
        startY: firstTableY,
        margin: { left: margin, right: margin, top: 22, bottom: 16 },
        showHead: "everyPage",
        head: [["OS", "Tipo", "Concluída", "Local", "Serviço / Denominação", "Ativo"]],
        body: tableBody,
        theme: "plain",
        styles: {
          font: "helvetica",
          fontSize: 6.9,
          cellPadding: { top: 1.8, right: 1.8, bottom: 1.8, left: 1.8 },
          lineColor: [226, 232, 240],
          lineWidth: { bottom: 0.18 },
          textColor: [30, 41, 59],
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 6.9,
          cellPadding: { top: 2.1, right: 1.8, bottom: 2.1, left: 1.8 },
          lineWidth: 0,
        },
        columnStyles: {
          0: { cellWidth: 18, fontStyle: "bold" },
          1: { cellWidth: 18 },
          2: { cellWidth: 21 },
          3: { cellWidth: 50 },
          4: { cellWidth: 143 },
          5: { cellWidth: 20 },
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const reportRow = tableMeta[data.row.index];
          if (!reportRow) return;
          if (data.row.index % 2 === 0) data.cell.styles.fillColor = [250, 251, 252];
          if (data.column.index === 0) {
            const color = equipeHex(reportRow.team);
            data.cell.styles.fillColor = subtleTeamTint(color);
            data.cell.styles.textColor = darkTeamText(color);
            data.cell.styles.fontStyle = "bold";
          }
        },
        willDrawPage: (data) => drawPageChrome(data.pageNumber),
        didDrawPage: (data) => {
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, height - 11.5, width - margin, height - 11.5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text("Sherwin-Williams Demarchi • Relatório diário de serviços executados", margin, height - 6.7);
          doc.text(`Página ${data.pageNumber}`, width - margin, height - 6.7, { align: "right" });
        },
      });

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setFillColor(255, 255, 255);
        doc.rect(width - margin - 24, height - 9.5, 24, 5, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Página ${page} de ${totalPages}`, width - margin, height - 6.7, { align: "right" });
      }

      doc.setProperties({
        title: `Relatório Diário de Manutenção - ${titleDate}`,
        subject: "Serviços de manutenção executados no dia",
        author: author.trim() || "Grupo GPS / Sherwin-Williams Demarchi",
        creator: "Grupo GPS / Sherwin-Williams Demarchi",
      });
      doc.save(`RELATORIO_DIARIO_MANUTENCAO_${selectedDate}.pdf`);
      toast.success(`PDF premium gerado com ${pdfRows.length} execução(ões) em ${teamGroups.length} equipe(s).`);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGenerating(false);
    }
  }'''
pattern = re.compile(r'  async function generatePdf\(\) \{.*?\n  \}\n\n  const hasBase', re.S)
if not pattern.search(text):
    raise SystemExit("generatePdf block not found")
text = pattern.sub(new_function + "\n\n  const hasBase", text, count=1)
path.write_text(text)
