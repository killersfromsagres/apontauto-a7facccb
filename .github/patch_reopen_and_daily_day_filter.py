from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Pattern not found for {label}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# 1) Histórico de corretivas: ação administrativa para desfazer conclusão.
# ---------------------------------------------------------------------------
history_path = Path("src/routes/_authenticated/corretiva-historico.tsx")
history = history_path.read_text(encoding="utf-8")

history = replace_once(
    history,
    "  PenLine,\n  Search,",
    "  PenLine,\n  RotateCcw,\n  Search,",
    "historico import RotateCcw",
)
history = replace_once(
    history,
    'import { supabase } from "@/integrations/supabase/client";\nimport { toast } from "sonner";',
    'import { supabase } from "@/integrations/supabase/client";\nimport { useIsAdmin } from "@/hooks/use-is-admin";\nimport { toast } from "sonner";',
    "historico import useIsAdmin",
)
history = replace_once(
    history,
    '  const [pendingOsId, setPendingOsId] = useState<string | null>(null);\n  const [isExporting, setIsExporting] = useState(false);\n  const queryClient = useQueryClient();',
    '  const [pendingOsId, setPendingOsId] = useState<string | null>(null);\n  const [reopeningOsId, setReopeningOsId] = useState<string | null>(null);\n  const [isExporting, setIsExporting] = useState(false);\n  const queryClient = useQueryClient();\n  const { isAdmin } = useIsAdmin();',
    "historico state admin/reopen",
)

insert_marker = '''  const filtered = useMemo(() => {'''
handler = '''  const handleReopen = useCallback(
    async (os: OsRow) => {
      if (!isAdmin || reopeningOsId || os.status !== "concluida") return;

      const confirmed = window.confirm(
        `Voltar a OS ${os.numero_os} para pendente? A conclusão será desfeita e o chamado voltará para a lista de corretivas abertas.`,
      );
      if (!confirmed) return;

      setReopeningOsId(os.id);
      try {
        const { data, error } = await supabase
          .from("corretiva_os")
          .update({
            status: "aberta",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", os.id)
          .eq("status", "concluida")
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          throw new Error("Este chamado não está mais concluído. Atualize o histórico e tente novamente.");
        }

        if (open?.id === os.id) setOpen(null);
        await queryClient.invalidateQueries({ queryKey: ["corretiva-historico"] });
        toast.success(`OS ${os.numero_os} voltou para pendente.`);
      } catch (error: any) {
        console.error("[CorretivaHistorico] Erro ao voltar OS para pendente:", error);
        toast.error(error?.message || "Não foi possível voltar o chamado para pendente.");
      } finally {
        setReopeningOsId(null);
      }
    },
    [isAdmin, open?.id, queryClient, reopeningOsId],
  );

'''
history = replace_once(history, insert_marker, handler + insert_marker, "historico reopen handler")

history = replace_once(
    history,
    '''                const saving = pendingOsId === os.id;
                const StatusIcon = cancelada ? XCircle : CheckCircle2;''',
    '''                const saving = pendingOsId === os.id;
                const reopening = reopeningOsId === os.id;
                const StatusIcon = cancelada ? XCircle : CheckCircle2;''',
    "historico reopening row state",
)

button_marker = '''                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerification(os)}'''
reopen_button = '''                        {!cancelada && isAdmin && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="Voltar este chamado para o status Aberta"
                            onClick={() => handleReopen(os)}
                            disabled={Boolean(reopeningOsId)}
                            className="h-9 gap-1.5 rounded-lg border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-700 shadow-none hover:bg-amber-500/15 dark:text-amber-300 active:scale-100"
                          >
                            {reopening ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Voltar para pendente
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerification(os)}'''
history = replace_once(history, button_marker, reopen_button, "historico reopen button")
history_path.write_text(history, encoding="utf-8")

# ---------------------------------------------------------------------------
# 2) Relatório diário: recuperar o último dia em que uma corretiva foi marcada
#    na programação, mesmo após o status Concluída limpar os campos atuais.
# ---------------------------------------------------------------------------
daily_path = Path("src/features/relatorio-diario/daily-execution-report.tsx")
daily = daily_path.read_text(encoding="utf-8")

daily = replace_once(
    daily,
    '''type CompletionRecord = {
  item_key: string;
  atividade_data: string;
  os: string;
  atividade: string;
  equipe: string | null;
  descricao: string | null;
  concluida_em: string;
  concluida_por?: string | null;
};

type PdfLogo = {''',
    '''type CompletionRecord = {
  item_key: string;
  atividade_data: string;
  os: string;
  atividade: string;
  equipe: string | null;
  descricao: string | null;
  concluida_em: string;
  concluida_por?: string | null;
};

type CorrectiveProgrammingHistory = {
  os_id: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  dia_indice: number | null;
  equipe: string | null;
  created_at: string;
};

type PdfLogo = {''',
    "daily history type",
)

old_load = '''      const { data, error } = await supabase
        .from("corretiva_os")
        .select(
          "id,numero_os,status,fim,observacao_conclusao,data_programada,data_criacao,data_sla,equipe,nome_os,equipamento,ativo,patrimonio,predio,andar,local,programacao_status,programacao_periodo_inicio,programacao_periodo_fim,programacao_dia_indice,programacao_equipe,programacao_tentativas,tipo_importacao,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(10000);

      if (error) throw error;
      const next = (data ?? []) as WeeklyCorrectiveSourceRow[];
      setPortfolio(next);'''
new_load = '''      const [osResult, historyResult] = await Promise.all([
        supabase
          .from("corretiva_os")
          .select(
            "id,numero_os,status,fim,observacao_conclusao,data_programada,data_criacao,data_sla,equipe,nome_os,equipamento,ativo,patrimonio,predio,andar,local,programacao_status,programacao_periodo_inicio,programacao_periodo_fim,programacao_dia_indice,programacao_equipe,programacao_tentativas,tipo_importacao,updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(10000),
        (supabase as any).rpc("get_relatorio_diario_latest_programacao"),
      ]);

      if (osResult.error) throw osResult.error;
      if (historyResult.error) throw historyResult.error;

      const latestProgramming = new Map<string, CorrectiveProgrammingHistory>();
      ((historyResult.data ?? []) as CorrectiveProgrammingHistory[]).forEach((record) => {
        const key = String(record.os_id ?? "").trim();
        if (key && !latestProgramming.has(key)) latestProgramming.set(key, record);
      });

      const next = ((osResult.data ?? []) as WeeklyCorrectiveSourceRow[]).map((row) => {
        if (!isCompletedCorrectiveStatus(row.status)) return row;
        if (
          row.programacao_status === "em_programacao" &&
          row.programacao_periodo_inicio &&
          row.programacao_periodo_fim &&
          Number.isInteger(Number(row.programacao_dia_indice))
        ) {
          return row;
        }

        const historical = latestProgramming.get(String(row.id ?? "").trim());
        if (!historical?.periodo_inicio || !historical.periodo_fim) return row;
        const dayIndex = Number(historical.dia_indice);
        if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 4) return row;

        return {
          ...row,
          programacao_status: "em_programacao",
          programacao_periodo_inicio: historical.periodo_inicio,
          programacao_periodo_fim: historical.periodo_fim,
          programacao_dia_indice: dayIndex,
          programacao_equipe: historical.equipe || row.equipe,
        };
      });
      setPortfolio(next);'''
daily = replace_once(daily, old_load, new_load, "daily load portfolio with history")
daily_path.write_text(daily, encoding="utf-8")

# ---------------------------------------------------------------------------
# 3) Planejamento: o dia marcado é a fonte da verdade. Concluir em outro dia
#    apenas atualiza o status/texto; nunca cria/move a OS para o dia da conclusão.
# ---------------------------------------------------------------------------
planning_path = Path("src/features/relatorio-diario/lib/weekly-planning.ts")
planning = planning_path.read_text(encoding="utf-8")

completion_block_start = '''  const completedCorrectiveRows: WeeklyPlanningRow[] = [];
  canonicalByOs.forEach((source, osKey) => {
    if (!isCompletedCorrectiveStatus(source.status)) return;
    const completedDate = toLocalIsoDate(source.fim || source.updated_at);
    if (!completedDate || !dateSet.has(completedDate)) return;

    const sameDayScheduled = baseRows.find(
      (row) =>
        row.activity === "Corretiva" &&
        row.date === completedDate &&
        normalizeOs(row.os).trim().toUpperCase() === osKey,
    );

    if (sameDayScheduled) {
      sameDayScheduled.name = completedActivityLabel(
        source,
        sameDayScheduled.name || sameDayScheduled.equipment,
      );
      sameDayScheduled.observation = completedWorkText(source);
      sameDayScheduled.completedAt = completedDate;
      sameDayScheduled.completionSource = "corretiva-novo";
      sameDayScheduled.extraCorrective = false;
      return;
    }

    completedCorrectiveRows.push(sourceToCompletedPlanningRow(source, completedDate));
  });

'''
planning = replace_once(planning, completion_block_start, "", "remove completion-date injection")

programmed_marker = '''  const programmedOs = new Set(
    alreadyProgrammedRows.map((row) => normalizeOs(row.os).toUpperCase()).filter(Boolean),
  );

  const candidates = sortPlanningCandidates('''
programmed_replacement = '''  const programmedOs = new Set(
    alreadyProgrammedRows.map((row) => normalizeOs(row.os).toUpperCase()).filter(Boolean),
  );

  const plannedRows = [...baseRows, ...alreadyProgrammedRows];

  // O dia programado é a fonte da verdade para o Relatório Diário. Uma OS que
  // foi marcada para segunda continua pertencendo à segunda mesmo se o técnico
  // concluir o chamado na terça. A conclusão apenas enriquece a linha planejada;
  // nunca cria uma nova linha no dia em que o status foi alterado.
  canonicalByOs.forEach((source, osKey) => {
    if (!isCompletedCorrectiveStatus(source.status)) return;

    const planned = plannedRows.find(
      (row) =>
        row.activity === "Corretiva" &&
        normalizeOs(row.os).trim().toUpperCase() === osKey,
    );
    if (!planned) return;

    const completedDate = toLocalIsoDate(source.fim || source.updated_at);
    planned.name = completedActivityLabel(
      source,
      planned.name || planned.equipment,
    );
    planned.observation = completedWorkText(source);
    planned.completedAt = completedDate || undefined;
    planned.completionSource = "corretiva-novo";
  });

  const candidates = sortPlanningCandidates('''
planning = replace_once(planning, programmed_marker, programmed_replacement, "annotate planned completion")

planning = replace_once(
    planning,
    '''  const result = [...baseRows, ...alreadyProgrammedRows, ...completedCorrectiveRows];
  const usedOs = new Set<string>([
    ...programmedOs,
    ...completedCorrectiveRows
      .map((row) => normalizeOs(row.os).toUpperCase())
      .filter(Boolean),
  ]);''',
    '''  const result = [...plannedRows];
  const usedOs = new Set<string>(programmedOs);''',
    "planning result no completion-date rows",
)
planning_path.write_text(planning, encoding="utf-8")

# ---------------------------------------------------------------------------
# 4) Regressão automatizada do comportamento solicitado.
# ---------------------------------------------------------------------------
test_path = Path("src/features/relatorio-diario/lib/weekly-planning-completed-day.test.ts")
test_path.write_text('''import { describe, expect, it } from "vitest";

import type { ScheduledMaintenance } from "./daily-maintenance";
import { buildWeeklyPlanning, type WeeklyCorrectiveSourceRow } from "./weekly-planning";

const scheduled = (
  date: string,
  os: string,
  name: string,
  activity: ScheduledMaintenance["activity"] = "Corretiva",
): ScheduledMaintenance => ({
  id: `${date}|${os}|CIVIL`,
  date,
  os,
  name,
  building: "Prédio A",
  floor: "Térreo",
  space: "Recepção",
  activity,
  sla: "",
  team: "Civil",
  area: "Civil / Hidráulica",
  asset: "",
  equipment: "",
  observation: "",
  sourceFile: "Programacao.xlsx",
});

describe("relatório diário - respeita o dia marcado", () => {
  it("mantém uma corretiva no dia programado mesmo quando ela é concluída em outro dia", () => {
    const scheduledRows: ScheduledMaintenance[] = [
      scheduled("2026-10-05", "BASE", "Atividade base", "Preventiva"),
      scheduled("2026-10-06", "100", "Ajuste de porta"),
      scheduled("2026-10-07", "300", "Troca de registro"),
      scheduled("2026-10-09", "FIM", "Atividade final", "Preventiva"),
    ];

    const correctiveRows: WeeklyCorrectiveSourceRow[] = [
      {
        id: "a",
        numero_os: "100",
        status: "concluida",
        fim: "2026-10-07T14:00:00-03:00",
        updated_at: "2026-10-07T14:00:00-03:00",
        equipe: "Civil",
        nome_os: "Ajuste de porta",
        observacao_conclusao: "Reguladas as dobradiças e testado o fechamento.",
      },
      {
        id: "b",
        numero_os: "200",
        status: "concluida",
        fim: "2026-10-07T15:00:00-03:00",
        updated_at: "2026-10-07T15:00:00-03:00",
        equipe: "Elétrica",
        nome_os: "Falha no circuito",
        observacao_conclusao: "Rearmado o disjuntor e normalizada a alimentação.",
      },
      {
        id: "c",
        numero_os: "300",
        status: "concluida",
        fim: "2026-10-07T16:00:00-03:00",
        updated_at: "2026-10-07T16:00:00-03:00",
        equipe: "Civil",
        nome_os: "Troca de registro",
        observacao_conclusao: "Registro substituído e vazamento eliminado.",
      },
    ];

    const planning = buildWeeklyPlanning({
      scheduledRows,
      correctiveRows,
      targetCorrectivesPerTeamPerDay: 1,
    });

    const os100 = planning.rows.filter((row) => row.os === "100");
    expect(os100).toHaveLength(1);
    expect(os100[0].date).toBe("2026-10-06");
    expect(os100[0].completedAt).toBe("2026-10-07");
    expect(os100[0].name).toContain("Realizado: Reguladas as dobradiças");

    const os300 = planning.rows.filter((row) => row.os === "300");
    expect(os300).toHaveLength(1);
    expect(os300[0].date).toBe("2026-10-07");
    expect(os300[0].name).toContain("Realizado: Registro substituído");

    // Uma conclusão que nunca foi marcada/programada para a semana não é
    // injetada automaticamente no relatório do dia da conclusão.
    expect(planning.rows.some((row) => row.os === "200")).toBe(false);
  });

  it("mantém a corretiva programada pelo sistema no dia marcado, não no dia da conclusão", () => {
    const planning = buildWeeklyPlanning({
      scheduledRows: [
        scheduled("2026-10-19", "BASE", "Base", "Preventiva"),
        scheduled("2026-10-23", "FIM", "Fim", "Preventiva"),
      ],
      correctiveRows: [
        {
          id: "programada",
          numero_os: "500",
          status: "concluida",
          fim: "2026-10-21T10:00:00-03:00",
          equipe: "Civil",
          nome_os: "Ajuste de fechadura",
          observacao_conclusao: "Fechadura ajustada.",
          programacao_status: "em_programacao",
          programacao_periodo_inicio: "2026-10-19",
          programacao_periodo_fim: "2026-10-23",
          programacao_dia_indice: 0,
          programacao_equipe: "Civil",
        },
      ],
      targetCorrectivesPerTeamPerDay: 1,
    });

    const rows500 = planning.rows.filter((row) => row.os === "500");
    expect(rows500).toHaveLength(1);
    expect(rows500[0].date).toBe("2026-10-19");
    expect(rows500[0].completedAt).toBe("2026-10-21");
    expect(planning.rows.some((row) => row.os === "500" && row.date === "2026-10-21")).toBe(false);
  });
});
''', encoding="utf-8")
