from pathlib import Path

path = Path('src/features/relatorio-diario/daily-execution-report.tsx')
text = path.read_text(encoding='utf-8')

old = '''const buildExecutionByDayOs = (records: Map<string, CompletionRecord>) => {
  const map = new Map<string, CompletionRecord>();
  records.forEach((record) => {
    if (activityKey(record.atividade) !== "corretiva") return;
    const key = executionDayOsKey(record.atividade_data, record.os);
    if (key.endsWith("|")) return;
    const current = map.get(key);
    const currentTime = new Date(current?.concluida_em ?? "").getTime() || 0;
    const nextTime = new Date(record.concluida_em).getTime() || 0;
    if (!current || nextTime >= currentTime) map.set(key, record);
  });
  return map;
};
'''
new = old + '''
const buildCorrectiveExecutionByOs = (records: Map<string, CompletionRecord>) => {
  const map = new Map<string, CompletionRecord>();
  records.forEach((record) => {
    if (activityKey(record.atividade) !== "corretiva") return;
    const key = correctiveOsKey(record.os);
    if (!key) return;
    const current = map.get(key);
    if (!current) {
      map.set(key, record);
      return;
    }
    const currentDate = String(current.atividade_data || "9999-12-31");
    const nextDate = String(record.atividade_data || "9999-12-31");
    const currentTime = new Date(current.concluida_em ?? "").getTime() || 0;
    const nextTime = new Date(record.concluida_em ?? "").getTime() || 0;
    if (nextDate < currentDate || (nextDate === currentDate && nextTime < currentTime)) {
      map.set(key, record);
    }
  });
  return map;
};
'''
if old not in text:
    raise SystemExit('buildExecutionByDayOs block not found')
text = text.replace(old, new, 1)

old = '''  const correctiveByOs = useMemo(() => buildCorrectiveByOs(portfolio), [portfolio]);
  const executionByDayOs = useMemo(() => buildExecutionByDayOs(completions), [completions]);
  const dates = planning.days.map((day) => day.date);
'''
new = '''  const correctiveByOs = useMemo(() => buildCorrectiveByOs(portfolio), [portfolio]);
  const executionByDayOs = useMemo(() => buildExecutionByDayOs(completions), [completions]);
  const correctiveExecutionByOs = useMemo(() => buildCorrectiveExecutionByOs(completions), [completions]);
  const dates = planning.days.map((day) => day.date);
'''
if old not in text:
    raise SystemExit('memo block not found')
text = text.replace(old, new, 1)

old = '''  async function addCorrectiveToDailyReport(row: DailyReportRow, source?: CorrectiveCatalogSource) {
    if (savingKey === row.id || completions.has(row.id)) return;
    const description =
'''
new = '''  async function addCorrectiveToDailyReport(row: DailyReportRow, source?: CorrectiveCatalogSource) {
    if (savingKey === row.id || completions.has(row.id)) return;
    const previousExecution = correctiveExecutionByOs.get(correctiveOsKey(row.os));
    if (previousExecution) {
      toast.info(
        `OS ${row.os} já foi adicionada ao Relatório Diário em ${formatDateBr(previousExecution.atividade_data)}. Para usar novamente, desfaça primeiro o registro original.`,
      );
      return;
    }
    const description =
'''
if old not in text:
    raise SystemExit('add function header not found')
text = text.replace(old, new, 1)

old = '''    } catch (error: any) {
      setCompletions((current) => {
        const next = new Map(current);
        next.delete(row.id);
        return next;
      });
      toast.error(error?.message || "Não foi possível adicionar e concluir esta corretiva. A alteração foi desfeita.");
    } finally {
'''
new = '''    } catch (error: any) {
      setCompletions((current) => {
        const next = new Map(current);
        next.delete(row.id);
        return next;
      });
      if (error?.code === "23505") {
        void loadExecutions(false);
        toast.warning(error?.message || `A OS ${row.os} já foi adicionada ao Relatório Diário anteriormente.`);
      } else {
        toast.error(error?.message || "Não foi possível adicionar e concluir esta corretiva. A alteração foi desfeita.");
      }
    } finally {
'''
if old not in text:
    raise SystemExit('add function catch not found')
text = text.replace(old, new, 1)

old = '''                    const scheduled = scheduledByOs.get(osKey);
                    const existingExecution = executionByDayOs.get(executionDayOsKey(selectedDate, source.numero_os));
                    const itemKey = existingExecution?.item_key || scheduled?.id || dailyCorrectiveItemKey(rows, selectedDate, source.numero_os);
                    const row = sourceToDailyRow(source, selectedDate, itemKey, scheduled);
                    const record = completions.get(row.id) ?? existingExecution;
                    const effectiveRow = record && record.item_key !== row.id
                      ? sourceToDailyRow(source, selectedDate, record.item_key, scheduled)
                      : row;
                    const state = rowCompletionState(effectiveRow, completions, correctiveByOs);
                    const text = workDrafts[effectiveRow.id] ?? record?.descricao ?? "";
                    const teamColor = equipeHex(effectiveRow.team);
'''
new = '''                    const scheduled = scheduledByOs.get(osKey);
                    const existingExecution = executionByDayOs.get(executionDayOsKey(selectedDate, source.numero_os));
                    const previousExecution = correctiveExecutionByOs.get(osKey);
                    const itemKey = existingExecution?.item_key || scheduled?.id || dailyCorrectiveItemKey(rows, selectedDate, source.numero_os);
                    const row = sourceToDailyRow(source, selectedDate, itemKey, scheduled);
                    const record = completions.get(row.id) ?? existingExecution;
                    const historicalRecord = record ? null : previousExecution;
                    const effectiveRow = record && record.item_key !== row.id
                      ? sourceToDailyRow(source, selectedDate, record.item_key, scheduled)
                      : row;
                    const state = record
                      ? rowCompletionState(effectiveRow, completions, correctiveByOs)
                      : historicalRecord
                        ? "concluida"
                        : rowCompletionState(effectiveRow, completions, correctiveByOs);
                    const text = record
                      ? workDrafts[effectiveRow.id] ?? record.descricao ?? ""
                      : historicalRecord?.descricao ?? workDrafts[effectiveRow.id] ?? "";
                    const teamColor = equipeHex(effectiveRow.team);
'''
if old not in text:
    raise SystemExit('catalog record block not found')
text = text.replace(old, new, 1)

text = text.replace('className={cn("border-l-[3px] px-3 py-2", record && "bg-emerald-500/[0.035]")}', 'className={cn("border-l-[3px] px-3 py-2", (record || historicalRecord) && "bg-emerald-500/[0.035]")}', 1)
text = text.replace('style={{ borderLeftColor: record ? "#10b981" : teamColor }}', 'style={{ borderLeftColor: record || historicalRecord ? "#10b981" : teamColor }}', 1)

old = '''                              {record && <span className="rounded-full border border-sky-500/25 bg-sky-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold text-sky-700 dark:text-sky-300">Na planilha • concluída via Relatório Diário</span>}
'''
new = '''                              {record && <span className="rounded-full border border-sky-500/25 bg-sky-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold text-sky-700 dark:text-sky-300">Na planilha • concluída via Relatório Diário</span>}
                              {historicalRecord && (
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
                                  Já adicionada ao relatório • {formatDateBr(historicalRecord.atividade_data)}
                                </span>
                              )}
'''
if old not in text:
    raise SystemExit('record badge block not found')
text = text.replace(old, new, 1)

old = '''                                {state === "concluida" ? "Concluída no relatório" : state === "pendente_verificacao" ? "Concluída no Corretiva Novo" : "Pendente"}
'''
new = '''                                {historicalRecord
                                  ? `Já adicionada em ${formatDateBr(historicalRecord.atividade_data)}`
                                  : state === "concluida"
                                    ? "Concluída no relatório"
                                    : state === "pendente_verificacao"
                                      ? "Concluída no Corretiva Novo"
                                      : "Pendente"}
'''
if old not in text:
    raise SystemExit('state label block not found')
text = text.replace(old, new, 1)

old = '''                            <textarea
                              value={text}
                              onChange={(event) => setWorkDrafts((current) => ({ ...current, [effectiveRow.id]: event.target.value }))}
                              rows={1}
                              className="mt-1 h-8 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[10px] leading-4"
                              placeholder={String(source.observacao_conclusao ?? "").trim() ? `Sugestão: ${String(source.observacao_conclusao).trim()}` : "Serviço executado (opcional)"}
                            />
'''
new = '''                            <textarea
                              value={text}
                              onChange={(event) => setWorkDrafts((current) => ({ ...current, [effectiveRow.id]: event.target.value }))}
                              rows={1}
                              readOnly={Boolean(historicalRecord)}
                              className={cn(
                                "mt-1 h-8 w-full resize-none rounded-md border border-input px-2 py-1.5 text-[10px] leading-4",
                                historicalRecord ? "cursor-default bg-emerald-500/[0.04] text-muted-foreground" : "bg-background",
                              )}
                              placeholder={String(source.observacao_conclusao ?? "").trim() ? `Sugestão: ${String(source.observacao_conclusao).trim()}` : "Serviço executado (opcional)"}
                            />
'''
if old not in text:
    raise SystemExit('textarea block not found')
text = text.replace(old, new, 1)

old = '''                            {record ? (
                              <>
                                <Button type="button" size="sm" variant="outline" disabled={savingKey === effectiveRow.id} onClick={() => void undoCorrective(effectiveRow)} className="h-7 px-2 text-[9px]">Desfazer</Button>
                                <Button type="button" size="sm" disabled={savingKey === effectiveRow.id} onClick={() => void saveCorrectiveDescription(effectiveRow)} className="h-7 gap-1 px-2 text-[9px]">
                                  {savingKey === effectiveRow.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={savingKey === effectiveRow.id}
                                onClick={() => void addCorrectiveToDailyReport(effectiveRow, source)}
                                className="h-8 gap-1.5 bg-sky-600 px-3 text-[10px] font-semibold text-white hover:bg-sky-700"
                              >
                                {savingKey === effectiveRow.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {savingKey === effectiveRow.id ? "Adicionando..." : "Adicionar e concluir"}
                              </Button>
                            )}
'''
new = '''                            {record ? (
                              <>
                                <Button type="button" size="sm" variant="outline" disabled={savingKey === effectiveRow.id} onClick={() => void undoCorrective(effectiveRow)} className="h-7 px-2 text-[9px]">Desfazer</Button>
                                <Button type="button" size="sm" disabled={savingKey === effectiveRow.id} onClick={() => void saveCorrectiveDescription(effectiveRow)} className="h-7 gap-1 px-2 text-[9px]">
                                  {savingKey === effectiveRow.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                                </Button>
                              </>
                            ) : historicalRecord ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled
                                className="h-8 gap-1.5 border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 text-[9px] font-semibold text-emerald-700 opacity-100 dark:text-emerald-300"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Já adicionada {formatDateBr(historicalRecord.atividade_data)}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={savingKey === effectiveRow.id}
                                onClick={() => void addCorrectiveToDailyReport(effectiveRow, source)}
                                className="h-8 gap-1.5 bg-sky-600 px-3 text-[10px] font-semibold text-white hover:bg-sky-700"
                              >
                                {savingKey === effectiveRow.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {savingKey === effectiveRow.id ? "Adicionando..." : "Adicionar e concluir"}
                              </Button>
                            )}
'''
if old not in text:
    raise SystemExit('actions block not found')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
