from pathlib import Path

REPORT = Path("src/features/relatorio-diario/daily-execution-report.tsx")
HISTORY = Path("src/routes/_authenticated/corretiva-historico.tsx")

report = REPORT.read_text(encoding="utf-8")
history = HISTORY.read_text(encoding="utf-8")

old = '''function buildDailyRows({
  date,
  scheduleRows,
  planningRows,
  portfolio,
  completions,
}: {
  date: string;
  scheduleRows: ScheduledMaintenance[];
  planningRows: WeeklyPlanningRow[];
  portfolio: CorrectiveCatalogSource[];
  completions: Map<string, CompletionRecord>;
}) {
  const canonicalByOs = buildCorrectiveByOs(portfolio);
  const preventives: DailyReportRow[] = scheduleRows
    .filter((row) => row.date === date && isPreventiveActivity(row))
    .map((row) => ({ ...row, planningOrigin: "planilha-semanal" as const }));

  const scheduledCorrectives = reportCorrectivesForDate(planningRows, date).map((row) => {
    const source = canonicalByOs.get(correctiveOsKey(row.os));
    return source ? sourceToDailyRow(source, date, row.id, row) : ({ ...row } as DailyReportRow);
  });

  const correctiveRows = [...scheduledCorrectives];
  const knownItemKeys = new Set(correctiveRows.map((row) => row.id));
  const knownOs = new Set(correctiveRows.map((row) => correctiveOsKey(row.os)).filter(Boolean));
'''
new = '''function buildDailyRows({
  date,
  scheduleRows,
  portfolio,
  completions,
}: {
  date: string;
  scheduleRows: ScheduledMaintenance[];
  portfolio: CorrectiveCatalogSource[];
  completions: Map<string, CompletionRecord>;
}) {
  const canonicalByOs = buildCorrectiveByOs(portfolio);
  const preventives: DailyReportRow[] = scheduleRows
    .filter((row) => row.date === date && isPreventiveActivity(row))
    .map((row) => ({ ...row, planningOrigin: "planilha-semanal" as const }));

  // Corretivas programadas servem apenas como referência no catálogo.
  // Elas entram no Relatório Diário/PDF somente depois de o usuário clicar
  // em "Adicionar e concluir", o que cria um registro de execução do dia.
  const correctiveRows: DailyReportRow[] = [];
  const knownItemKeys = new Set<string>();
  const knownOs = new Set<string>();
'''
if old not in report:
    raise SystemExit("buildDailyRows block not found")
report = report.replace(old, new, 1)

# Remove planningRows from every buildDailyRows call.
report = report.replace("        planningRows: planning.rows,\n", "")
report = report.replace("      const dayRows = buildDailyRows({ date, scheduleRows: rows, planningRows: planning.rows, portfolio, completions });", "      const dayRows = buildDailyRows({ date, scheduleRows: rows, portfolio, completions });")
report = report.replace("        planningRows: freshPlanning.rows,\n", "")

old = '''  async function addCorrectiveToDailyReport(row: DailyReportRow, source?: CorrectiveCatalogSource) {
    if (savingKey) return;
    const description =
      draftValue(row).trim() ||
      String(source?.observacao_conclusao ?? "").trim() ||
      String(row.name ?? "").trim() ||
      String(row.equipment ?? "").trim() ||
      "Concluída no Relatório Diário";

    setSavingKey(row.id);
    try {
      await upsertExecution(row, description);
      setWorkDrafts((current) => ({ ...current, [row.id]: description }));
      toast.success(`OS ${row.os} adicionada à planilha e marcada como concluída no Relatório Diário.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível adicionar esta corretiva à planilha do dia.");
    } finally {
      setSavingKey(null);
    }
  }
'''
new = '''  async function addCorrectiveToDailyReport(row: DailyReportRow, source?: CorrectiveCatalogSource) {
    if (savingKey === row.id || completions.has(row.id)) return;
    const description =
      draftValue(row).trim() ||
      String(source?.observacao_conclusao ?? "").trim() ||
      String(row.name ?? "").trim() ||
      String(row.equipment ?? "").trim() ||
      "Concluída via Relatório Diário";
    const optimistic: CompletionRecord = {
      item_key: row.id,
      atividade_data: row.date,
      os: row.os || "",
      atividade: "Corretiva",
      equipe: row.team || null,
      descricao: description,
      concluida_em: new Date().toISOString(),
      concluida_por: null,
    };

    setSavingKey(row.id);
    setWorkDrafts((current) => ({ ...current, [row.id]: description }));
    // Resposta imediata ao clique: a OS já aparece como concluída e entra no
    // relatório/PDF. Se o banco falhar, o estado otimista é revertido.
    setCompletions((current) => {
      const next = new Map(current);
      next.set(row.id, optimistic);
      return next;
    });

    try {
      await upsertExecution(row, description);
      toast.success(
        `OS ${row.os} adicionada e concluída via Relatório Diário. Ela já aparece no Corretiva Histórico com essa origem.`,
      );
    } catch (error: any) {
      setCompletions((current) => {
        const next = new Map(current);
        next.delete(row.id);
        return next;
      });
      toast.error(error?.message || "Não foi possível adicionar e concluir esta corretiva. A alteração foi desfeita.");
    } finally {
      setSavingKey(null);
    }
  }
'''
if old not in report:
    raise SystemExit("addCorrectiveToDailyReport block not found")
report = report.replace(old, new, 1)

report = report.replace(
    'record && <span className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">Na planilha • concluída</span>',
    'record && <span className="rounded-full border border-sky-500/25 bg-sky-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold text-sky-700 dark:text-sky-300">Na planilha • concluída via Relatório Diário</span>',
    1,
)
report = report.replace(
    '''{savingKey === effectiveRow.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                                Adicionar à planilha''',
    '''{savingKey === effectiveRow.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {savingKey === effectiveRow.id ? "Adicionando..." : "Adicionar e concluir"}''',
    1,
)
report = report.replace(
    'Pesquisa rápida do Corretiva Novo. “Adicionar à planilha” inclui a OS no dia selecionado e já marca a execução como concluída somente no Relatório Diário.',
    'Pesquisa rápida do Corretiva Novo. A programação não inclui a OS automaticamente no relatório: somente “Adicionar e concluir” coloca a corretiva no dia selecionado e registra a conclusão via Relatório Diário.',
    1,
)
report = report.replace(
    'Inclui as preventivas fixas e as corretivas programadas ou adicionadas ao relatório deste dia.',
    'Inclui as preventivas fixas e somente as corretivas adicionadas e concluídas via Relatório Diário neste dia.',
    1,
)

# History: keep canonical status separate, but add a permanent explicit origin field.
old = '''                            >
                              {dailyOnly ? `${sourceStatusLabel(os.status)} no Corretiva Novo` : cancelada ? "Cancelada" : "Finalizada"}
                            </Badge>
                            {os.equipe && (
'''
new = '''                            >
                              {dailyOnly ? `${sourceStatusLabel(os.status)} no Corretiva Novo` : cancelada ? "Cancelada" : "Finalizada"}
                            </Badge>
                            {dailyRecord && (
                              <Badge variant="outline" className="rounded-lg border-sky-500/30 bg-sky-500/10 text-[9px] font-bold text-sky-700 dark:text-sky-300">
                                <FileSpreadsheet className="mr-1 h-3 w-3" /> Concluída via Relatório Diário
                              </Badge>
                            )}
                            {os.equipe && (
'''
if old not in history:
    raise SystemExit("history primary badge block not found")
history = history.replace(old, new, 1)

old = '''                            {completedAt && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarClock className="h-3.5 w-3.5" />{completedAt}</span>}
                          </span>
                        </span>
'''
new = '''                            {completedAt && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarClock className="h-3.5 w-3.5" />{completedAt}</span>}
                          </span>
                          {dailyRecord && (
                            <span className="mt-1.5 block text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                              Origem da conclusão: Relatório Diário • {formatDateTime(dailyRecord.concluida_em) || dailyRecord.atividade_data}
                            </span>
                          )}
                        </span>
'''
if old not in history:
    raise SystemExit("history metadata block not found")
history = history.replace(old, new, 1)

history = history.replace(
    '''                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Concluído no Relatório Diário''',
    '''                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Ver conclusão do relatório''',
    1,
)
history = history.replace(
    'O selo azul identifica a origem “Relatório Diário”. Uma OS somente registrada ali pode aparecer aqui mesmo ainda aberta no Corretiva Novo, mas não entra no Excel de finalizados até o status oficial ser concluído ou cancelado.',
    'O selo azul “Concluída via Relatório Diário” identifica exatamente a origem da conclusão. A OS pode aparecer aqui ainda aberta no Corretiva Novo; o status oficial continua separado e ela só entra no Excel de finalizados quando o Corretiva Novo for concluído ou cancelado.',
    1,
)

REPORT.write_text(report, encoding="utf-8")
HISTORY.write_text(history, encoding="utf-8")
