from pathlib import Path

EXPORTER = Path('src/lib/corretiva/programacao-excel.ts')
ROUTE = Path('src/routes/_authenticated/corretiva-novo.tsx')
TEST = Path('src/lib/corretiva/programacao-excel-operacional.test.ts')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(old, new, 1)


# ----- Excel exporter -----
text = EXPORTER.read_text()
text = replace_once(text,
'''export type ProgramacaoExportRow = OsCacheRow & {
  tipo_importacao?: string | null;
  programacao_status?: string | null;
  programacao_dia?: string | null;
  programacao_periodo?: string | null;
  programacao_equipe?: string | null;
};''',
'''export type ProgramacaoExportRow = OsCacheRow & {
  tipo_importacao?: string | null;
  programacao_status?: string | null;
  programacao_dia?: string | null;
  programacao_periodo?: string | null;
  programacao_equipe?: string | null;
  situacao_exportacao?: "PENDENTE" | "PROGRAMADO" | "BACKORDER" | string | null;
  peca_solicitada?: boolean | null;
  esta_na_programacao?: boolean | null;
};''', 'tipo exportacao')

text = text.replace('const COLUMN_WIDTHS = [15, 20, 24, 14, 14, 24, 58, 17, 21] as const;',
'''const COLUMN_WIDTHS = [14, 16, 20, 23, 14, 12, 22, 54, 16, 17, 18, 31] as const;''')

text = replace_once(text,
'''function isCompletedStatus(status: unknown) {
  return [
    "CONCLUIDA",
    "CONCLUIDO",
    "FINALIZADA",
    "FINALIZADO",
    "FECHADA",
    "FECHADO",
    "ENCERRADA",
    "ENCERRADO",
  ].includes(normalize(status));
}''',
'''function isCompletedStatus(status: unknown) {
  return [
    "CONCLUIDA",
    "CONCLUIDO",
    "FINALIZADA",
    "FINALIZADO",
    "FECHADA",
    "FECHADO",
    "ENCERRADA",
    "ENCERRADO",
    "CANCELADA",
    "CANCELADO",
  ].includes(normalize(status));
}''', 'status encerrados')

text = replace_once(text,
'''function materialRequested(item: OsCacheRow) {
  return (
    normalize(item.material_status) === "SOLICITADO" ||
    Boolean(String(item.pecas_solicitadas ?? "").trim())
  );
}''',
'''function materialRequested(item: ProgramacaoExportRow) {
  if (typeof item.peca_solicitada === "boolean") return item.peca_solicitada;
  return (
    normalize(item.material_status) === "SOLICITADO" ||
    Boolean(String(item.pecas_solicitadas ?? "").trim())
  );
}

function isProgrammed(item: ProgramacaoExportRow) {
  if (typeof item.esta_na_programacao === "boolean") return item.esta_na_programacao;
  return normalize(item.programacao_status).includes("PROGRAMACAO");
}

function exportSituation(item: ProgramacaoExportRow) {
  const explicit = normalize(item.situacao_exportacao);
  if (explicit) return explicit;
  return isProgrammed(item) ? "PROGRAMADO" : "PENDENTE";
}

function programmingDetails(item: ProgramacaoExportRow) {
  if (!isProgrammed(item)) return "—";
  const pieces = [item.programacao_dia, item.programacao_periodo]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return pieces.length ? pieces.join(" · ") : "EM PROGRAMAÇÃO";
}''', 'material/programacao')

text = text.replace('printArea: `A1:I${lastRow}`', 'printArea: `A1:L${lastRow}`')
text = text.replace('sheet.mergeCells("A1:I1");', 'sheet.mergeCells("A1:L1");')

old_headers = '''  const headers = [
    "OS",
    "Equipe",
    "Solicitante",
    "Prédio",
    "Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "Material",
  ];'''
new_headers = '''  const headers = [
    "OS",
    "Situação",
    "Equipe",
    "Solicitante",
    "Prédio",
    "Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "Peça solicitada?",
    "Está na programação?",
    "Programação",
  ];'''
text = replace_once(text, old_headers, new_headers, 'cabecalhos')
text = text.replace('horizontal: index === 6 ? "left" : "center",', 'horizontal: index === 7 ? "left" : "center",')

old_rows = '''    const material = materialRequested(item);
    const values = [
      item.numero_os || "—",
      item.equipe || "Sem equipe",
      item.solicitante || "—",
      item.predio || "—",
      item.andar || "—",
      item.local || "—",
      item.nome_os || "Sem descrição informada",
      formatDate(item.data_criacao),
      material ? "SOLICITADO" : "NÃO",
    ];'''
new_rows = '''    const material = materialRequested(item);
    const programmed = isProgrammed(item);
    const situation = exportSituation(item);
    const values = [
      item.numero_os || "—",
      situation,
      item.equipe || "Sem equipe",
      item.solicitante || "—",
      item.predio || "—",
      item.andar || "—",
      item.local || "—",
      item.nome_os || "Sem descrição informada",
      formatDate(item.data_criacao),
      material ? "SIM" : "NÃO",
      programmed ? "SIM" : "NÃO",
      programmingDetails(item),
    ];'''
text = replace_once(text, old_rows, new_rows, 'valores linhas')
text = text.replace('vertical: index === 6 ? "top" : "middle",\n        horizontal: index === 6 ? "left" : "center",',
                    'vertical: index === 7 ? "top" : "middle",\n        horizontal: index === 7 ? "left" : "center",')
text = text.replace('size: index === 6 ? 10.5 : 9.5,', 'size: index === 7 ? 10.5 : 9.5,')

old_style = '''    const teamCell = row.getCell(2);
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(palette.bg) } };
    teamCell.font = {
      name: FONT_DISPLAY,
      size: 10,
      bold: true,
      color: { argb: argb(palette.fg) },
    };

    [3, 4, 5, 6].forEach((column) => {
      row.getCell(column).font = {
        name: FONT,
        size: 9.5,
        bold: column === 3,
        color: { argb: C.ink },
      };
    });

    const descriptionCell = row.getCell(7);'''
new_style = '''    const situationCell = row.getCell(2);
    const situationPalette = situation === "BACKORDER"
      ? { bg: C.backorderSoft, fg: C.backorder }
      : situation === "PROGRAMADO"
        ? { bg: C.tealSoft, fg: C.teal }
        : { bg: C.amberSoft, fg: C.amber };
    situationCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: situationPalette.bg } };
    situationCell.font = { name: FONT_DISPLAY, size: 9, bold: true, color: { argb: situationPalette.fg } };

    const teamCell = row.getCell(3);
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(palette.bg) } };
    teamCell.font = {
      name: FONT_DISPLAY,
      size: 10,
      bold: true,
      color: { argb: argb(palette.fg) },
    };

    [4, 5, 6, 7].forEach((column) => {
      row.getCell(column).font = {
        name: FONT,
        size: 9.5,
        bold: column === 4,
        color: { argb: C.ink },
      };
    });

    const descriptionCell = row.getCell(8);'''
text = replace_once(text, old_style, new_style, 'estilos colunas')
text = text.replace('const openingCell = row.getCell(8);', 'const openingCell = row.getCell(9);')
text = text.replace('const materialCell = row.getCell(9);', 'const materialCell = row.getCell(10);')

old_material_tail = '''    materialCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: material ? C.amberSoft : zebra },
    };

    row.height = compactRowHeight(item.nome_os);'''
new_material_tail = '''    materialCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: material ? C.amberSoft : zebra },
    };

    const programmedCell = row.getCell(11);
    programmedCell.font = {
      name: FONT_DISPLAY,
      size: 9,
      bold: true,
      color: { argb: programmed ? C.teal : C.muted },
    };
    programmedCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: programmed ? C.tealSoft : zebra },
    };

    const programmingCell = row.getCell(12);
    programmingCell.font = { name: FONT, size: 9, bold: programmed, color: { argb: programmed ? C.teal : C.muted } };
    programmingCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

    row.height = compactRowHeight(item.nome_os);'''
text = replace_once(text, old_material_tail, new_material_tail, 'estilo programacao')

text = text.replace('sheet.mergeCells("A3:I5");', 'sheet.mergeCells("A3:L5");')
text = text.replace('sheet.autoFilter = "A2:I2";', 'sheet.autoFilter = "A2:L2";')

text = text.replace('aba: "corretiva" | "preventiva" | "backorder",', 'aba: "corretiva" | "preventiva" | "backorder" | "operacional",')
# replacement occurs in both public functions
text = text.replace('''      : aba === "preventiva"
        ? "Programação de Backorder"
        : "Programação de Corretivas";''',
'''      : aba === "preventiva"
        ? "Programação de Backorder"
        : aba === "operacional"
          ? "Controle Operacional de Corretivas"
          : "Programação de Corretivas";''')
text = text.replace('''`${aba === "backorder" ? "backorders" : `programacao_${aba}`}_${slug || "todas_equipes"}_${generatedAt.toISOString().slice(0, 10)}.xlsx`,''',
'''`${aba === "backorder" ? "backorders" : aba === "operacional" ? "corretivas_pendentes_programadas_backorder" : `programacao_${aba}`}_${slug || "todas_equipes"}_${generatedAt.toISOString().slice(0, 10)}.xlsx`,''')
EXPORTER.write_text(text)


# ----- Corretiva Novo route -----
text = ROUTE.read_text()
text = replace_once(text,
'''function isCompletedStatus(status: unknown) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "concluida" || normalized === "concluido";
}''',
'''function isCompletedStatus(status: unknown) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "concluida" || normalized === "concluido";
}

function isClosedExportStatus(status: unknown) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return isCompletedStatus(normalized) || normalized === "cancelada" || normalized === "cancelado";
}''', 'status fechado route')

marker = '''function normalizeSearchValue(value: unknown) {'''
helper = '''async function loadRequestedPartOsIds(rows: any[]) {
  const ids = [...new Set(rows.map((row) => String(row?.id ?? "").trim()).filter(Boolean))];
  const requested = new Set<string>();
  const chunkSize = 300;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("corretiva_pecas")
      .select("os_id")
      .in("os_id", chunk);
    if (error) throw error;
    (data ?? []).forEach((piece: any) => {
      const osId = String(piece?.os_id ?? "").trim();
      if (osId) requested.add(osId);
    });
  }

  return requested;
}

'''
if marker not in text:
    raise SystemExit('marcador normalize nao encontrado')
text = text.replace(marker, helper + marker, 1)

text = replace_once(text,
'''  const [reprogrammingId, setReprogrammingId] = useState<string | null>(null);''',
'''  const [reprogrammingId, setReprogrammingId] = useState<string | null>(null);
  const [isExportingOperational, setIsExportingOperational] = useState(false);''', 'estado exportacao')

text = text.replace('''          !isCompletedStatus(os.status) &&
          !findProgramReservation(os, programReservations),''',
'''          !isClosedExportStatus(os.status) &&
          !findProgramReservation(os, programReservations),''')
text = text.replace('''        return info.isBackorder && !isCompletedStatus(os.status);''',
'''        return info.isBackorder && !isClosedExportStatus(os.status);''')

marker = '''  const selectedIndex = selectedOs'''
block = '''  const operationalExportRows = useMemo(
    () => exportBaseRows.filter((os) => !isClosedExportStatus(os.status)),
    [exportBaseRows],
  );

  const enrichExportRows = async (rows: any[]) => {
    const requestedPartOsIds = await loadRequestedPartOsIds(rows);

    return rows.map((os) => {
      const reservation = findProgramReservation(os, programReservations);
      const info =
        backorderMap.get(String(os.id ?? os.numero_os ?? "")) ?? getBackorderInfo(os);
      const programmed = Boolean(reservation);
      const hasPieceRequest =
        requestedPartOsIds.has(String(os.id ?? "")) ||
        String(os.material_status ?? "").trim().toLowerCase() === "solicitado" ||
        Boolean(String(os.pecas_solicitadas ?? "").trim());

      return {
        ...os,
        situacao_exportacao: info.isBackorder
          ? "BACKORDER"
          : programmed
            ? "PROGRAMADO"
            : "PENDENTE",
        peca_solicitada: hasPieceRequest,
        esta_na_programacao: programmed,
        programacao_status: programmed ? "EM PROGRAMAÇÃO" : os.programacao_status,
        programacao_dia: reservation
          ? reservationDayLabel(reservation.dayIndex) || "Semana programada"
          : null,
        programacao_periodo: reservation ? formatReservationPeriod(reservation) : null,
        programacao_equipe: reservation?.equipe ?? os.programacao_equipe ?? null,
      };
    });
  };

'''
if marker not in text:
    raise SystemExit('marcador selectedIndex nao encontrado')
text = text.replace(marker, block + marker, 1)

marker = '''  const exportAvailableExcel = async () => {'''
new_export = '''  const exportOperationalExcel = async () => {
    if (!operationalExportRows.length || isExportingOperational) {
      if (!operationalExportRows.length) {
        toast.error("Não há chamados pendentes, programados ou Backorders para exportar.");
      }
      return;
    }

    setIsExportingOperational(true);
    const loadingToast = toast.loading("Conferindo peças e programação antes de gerar o Excel...");
    try {
      const rows = await enrichExportRows(operationalExportRows);
      const pending = rows.filter((row) => row.situacao_exportacao === "PENDENTE").length;
      const programmed = rows.filter((row) => row.situacao_exportacao === "PROGRAMADO").length;
      const backorders = rows.filter((row) => row.situacao_exportacao === "BACKORDER").length;
      await generateProgramacaoExcel(rows, "Todas as equipes", "operacional");
      toast.success(
        `Excel operacional gerado: ${pending} pendente(s), ${programmed} programado(s) e ${backorders} Backorder(s).`,
        { id: loadingToast },
      );
    } catch (error: any) {
      console.error("[CorretivaNovo] Erro no Excel operacional:", error);
      toast.error(
        error?.message || "Não foi possível conferir peças e gerar a planilha operacional.",
        { id: loadingToast },
      );
    } finally {
      setIsExportingOperational(false);
    }
  };

'''
if marker not in text:
    raise SystemExit('marcador export available nao encontrado')
text = text.replace(marker, new_export + marker, 1)

# Enrich legacy dedicated exports too, so the new columns remain truthful in every Excel.
text = text.replace('''      await generateProgramacaoExcel(
        availableExportRows,
        "Todas as equipes · Disponíveis",
        "corretiva",
      );''',
'''      await generateProgramacaoExcel(
        await enrichExportRows(availableExportRows),
        "Todas as equipes · Disponíveis",
        "corretiva",
      );''')
text = text.replace('''      await generateProgramacaoExcel(
        backorderExportRows,
        "Todas as equipes",
        "backorder",
      );''',
'''      await generateProgramacaoExcel(
        await enrichExportRows(backorderExportRows),
        "Todas as equipes",
        "backorder",
      );''')
text = text.replace('''      await generateProgramacaoExcel(
        programmedExportRows,
        "EM PROGRAMAÇÃO · Controle de campo",
        "corretiva",
      );''',
'''      await generateProgramacaoExcel(
        await enrichExportRows(programmedExportRows),
        "EM PROGRAMAÇÃO · Controle de campo",
        "corretiva",
      );''')

old_menu = '''              <DropdownMenuItem onClick={exportAvailableExcel} className="gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                <span className="flex-1">Baixar todos disponíveis</span>
                <span className="text-[10px] text-muted-foreground">
                  {availableExportRows.length}
                </span>
              </DropdownMenuItem>'''
new_menu = '''              <DropdownMenuItem
                onClick={exportOperationalExcel}
                disabled={!operationalExportRows.length || isExportingOperational}
                className="gap-2"
              >
                {isExportingOperational ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                )}
                <span className="flex-1 font-semibold">Excel completo · Pendentes + Programados + Backorders</span>
                <span className="text-[10px] text-muted-foreground">
                  {operationalExportRows.length}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportAvailableExcel} className="gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                <span className="flex-1">Baixar somente pendentes</span>
                <span className="text-[10px] text-muted-foreground">
                  {availableExportRows.length}
                </span>
              </DropdownMenuItem>'''
text = replace_once(text, old_menu, new_menu, 'menu exportacao')
ROUTE.write_text(text)


# ----- Regression test -----
TEST.write_text(r'''import { describe, expect, it } from "vitest";
import { buildProgramacaoWorkbook, type ProgramacaoExportRow } from "./programacao-excel";

const base = (patch: Partial<ProgramacaoExportRow>): ProgramacaoExportRow => ({
  id: crypto.randomUUID(),
  numero_os: "OS-1",
  nome_os: "Atividade teste",
  predio: "A220",
  andar: "1",
  local: "Sala",
  tipo: "Corretiva",
  equipe: "Civil",
  data_sla: null,
  data_programada: null,
  inicio: null,
  fim: null,
  ativo: "AT-01",
  equipamento: "Equipamento",
  patrimonio: null,
  status: "aberta",
  updated_at: "2026-10-22T10:00:00Z",
  solicitante: "Solicitante",
  data_criacao: "2026-10-22T10:00:00Z",
  ...patch,
});

describe("Excel operacional de corretivas", () => {
  it("mantém abas por equipe e informa situação, peça e programação", () => {
    const rows: ProgramacaoExportRow[] = [
      base({ numero_os: "100", equipe: "Civil", situacao_exportacao: "PENDENTE", peca_solicitada: true, esta_na_programacao: false }),
      base({ numero_os: "101", equipe: "Elétrica", situacao_exportacao: "PROGRAMADO", peca_solicitada: false, esta_na_programacao: true, programacao_dia: "Segunda-feira", programacao_periodo: "20/10/2026 a 24/10/2026" }),
      base({ numero_os: "102", equipe: "Civil", situacao_exportacao: "BACKORDER", peca_solicitada: true, esta_na_programacao: true, programacao_dia: "Terça-feira" }),
      base({ numero_os: "103", equipe: "Civil", status: "cancelada", situacao_exportacao: "PENDENTE" }),
    ];

    const workbook = buildProgramacaoWorkbook(rows, "Todas as equipes", "operacional", new Date("2026-10-22T12:00:00Z"));
    const general = workbook.getWorksheet("Programação Geral");
    expect(general).toBeTruthy();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      expect.arrayContaining(["Programação Geral", "Equipe · Civil", "Equipe · Elétrica"]),
    );

    const headers = general!.getRow(2).values as unknown[];
    expect(headers).toEqual(expect.arrayContaining(["Situação", "Peça solicitada?", "Está na programação?", "Programação"]));

    expect(general!.getCell("B3").value).toBe("PENDENTE");
    expect(general!.getCell("J3").value).toBe("SIM");
    expect(general!.getCell("K3").value).toBe("NÃO");
    expect(general!.getCell("B4").value).toBe("PROGRAMADO");
    expect(general!.getCell("K4").value).toBe("SIM");
    expect(String(general!.getCell("L4").value)).toContain("Segunda-feira");
    expect(general!.getCell("B5").value).toBe("BACKORDER");
    expect(general!.rowCount).toBe(5);
  });
});
''')

print('Patch aplicado com sucesso.')
