from pathlib import Path

path = Path("src/features/relatorio-diario/daily-execution-report.tsx")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global source
    if old not in source:
        raise RuntimeError(f"Pattern not found: {label}")
    source = source.replace(old, new, 1)


replace_once(
    'type CompletionFilter = "todos" | "concluidas" | "pendentes";\n',
    'type CompletionFilter = "todos" | "concluidas" | "verificacao" | "pendentes";\n'
    'type RowCompletionState = "pendente" | "pendente_verificacao" | "concluida";\n',
    "completion filter type",
)

replace_once(
    '''const rowIsCompleted = (\n  row: WeeklyPlanningRow,\n  executionMap: Map<string, CompletionRecord>,\n  correctiveByOs: Map<string, WeeklyCorrectiveSourceRow>,\n) => {\n  if (isCorrectiveActivity(row)) {\n    const canonical = correctiveByOs.get(correctiveOsKey(row.os));\n    if (canonical) return isCompletedCorrectiveStatus(canonical.status);\n  }\n  return executionMap.has(row.id);\n};\n''',
    '''const rowCompletionState = (\n  row: WeeklyPlanningRow,\n  executionMap: Map<string, CompletionRecord>,\n  correctiveByOs: Map<string, WeeklyCorrectiveSourceRow>,\n): RowCompletionState => {\n  const manualExecution = executionMap.has(row.id);\n\n  if (isCorrectiveActivity(row)) {\n    const canonical = correctiveByOs.get(correctiveOsKey(row.os));\n    if (canonical) {\n      if (isCompletedCorrectiveStatus(canonical.status)) return "concluida";\n      return manualExecution ? "pendente_verificacao" : "pendente";\n    }\n  }\n\n  return manualExecution ? "concluida" : "pendente";\n};\n\nconst rowIsCompleted = (\n  row: WeeklyPlanningRow,\n  executionMap: Map<string, CompletionRecord>,\n  correctiveByOs: Map<string, WeeklyCorrectiveSourceRow>,\n) => rowCompletionState(row, executionMap, correctiveByOs) !== "pendente";\n''',
    "completion state helper",
)

replace_once(
    '''    return dayRows.filter((row) => {\n      const completed = rowIsCompleted(row, completions, correctiveByOs);\n      if (teamFilter !== "todos" && (row.team || "Sem equipe") !== teamFilter) return false;\n      if (completionFilter === "concluidas" && !completed) return false;\n      if (completionFilter === "pendentes" && completed) return false;\n      if (!q) return true;\n''',
    '''    return dayRows.filter((row) => {\n      const completionState = rowCompletionState(row, completions, correctiveByOs);\n      const completed = completionState !== "pendente";\n      if (teamFilter !== "todos" && (row.team || "Sem equipe") !== teamFilter) return false;\n      if (completionFilter === "concluidas" && !completed) return false;\n      if (completionFilter === "verificacao" && completionState !== "pendente_verificacao") return false;\n      if (completionFilter === "pendentes" && completionState !== "pendente") return false;\n      if (!q) return true;\n''',
    "visible row filters",
)

replace_once(
    '''  const selectedCompleted = useMemo(\n    () => dayRows.filter((row) => rowIsCompleted(row, completions, correctiveByOs)).length,\n    [completions, correctiveByOs, dayRows],\n  );\n  const selectedPending = Math.max(0, dayRows.length - selectedCompleted);\n  const completionRate = dayRows.length ? Math.round((selectedCompleted / dayRows.length) * 100) : 0;\n''',
    '''  const selectedCompleted = useMemo(\n    () => dayRows.filter((row) => rowIsCompleted(row, completions, correctiveByOs)).length,\n    [completions, correctiveByOs, dayRows],\n  );\n  const selectedPendingVerification = useMemo(\n    () =>\n      dayRows.filter(\n        (row) => rowCompletionState(row, completions, correctiveByOs) === "pendente_verificacao",\n      ).length,\n    [completions, correctiveByOs, dayRows],\n  );\n  const selectedPending = useMemo(\n    () =>\n      dayRows.filter(\n        (row) => rowCompletionState(row, completions, correctiveByOs) === "pendente",\n      ).length,\n    [completions, correctiveByOs, dayRows],\n  );\n  const completionRate = dayRows.length ? Math.round((selectedCompleted / dayRows.length) * 100) : 0;\n''',
    "daily completion counters",
)

replace_once(
    '''    const canonicalCorrective = isCorrectiveActivity(row)\n      ? correctiveByOs.get(correctiveOsKey(row.os))\n      : undefined;\n    if (canonicalCorrective) {\n      toast.info(`A OS ${row.os} é sincronizada automaticamente com o status do Corretiva Novo.`);\n      return;\n    }\n\n    const current = completions.get(row.id);\n''',
    '''    const canonicalCorrective = isCorrectiveActivity(row)\n      ? correctiveByOs.get(correctiveOsKey(row.os))\n      : undefined;\n    if (canonicalCorrective && isCompletedCorrectiveStatus(canonicalCorrective.status)) {\n      toast.info(`A OS ${row.os} já está concluída e verificada pelo Corretiva Novo.`);\n      return;\n    }\n\n    const current = completions.get(row.id);\n''',
    "allow corrective manual completion",
)

replace_once(
    '''        toast.success(`OS ${row.os} voltou para pendente no relatório diário.`);\n        return;\n''',
    '''        toast.success(\n          canonicalCorrective\n            ? `OS ${row.os} voltou para pendente e deixou de aguardar verificação.`\n            : `OS ${row.os} voltou para pendente no relatório diário.`,\n        );\n        return;\n''',
    "manual completion undo message",
)

replace_once(
    '''      toast.success(`OS ${row.os} marcada como concluída.`);\n''',
    '''      toast.success(\n        canonicalCorrective\n          ? `OS ${row.os} marcada como concluída no Relatório Diário. Agora está pendente de verificação no Corretiva Novo.`\n          : `OS ${row.os} marcada como concluída.`,\n      );\n''',
    "manual completion success message",
)

replace_once(
    '''      const freshCorrectiveByOs = buildCorrectiveByOs(freshPortfolio);\n      const isDone = (row: WeeklyPlanningRow) =>\n        rowIsCompleted(row, freshCompletions, freshCorrectiveByOs);\n\n      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });\n''',
    '''      const freshCorrectiveByOs = buildCorrectiveByOs(freshPortfolio);\n      const completionStateOf = (row: WeeklyPlanningRow) =>\n        rowCompletionState(row, freshCompletions, freshCorrectiveByOs);\n      const isDone = (row: WeeklyPlanningRow) => completionStateOf(row) !== "pendente";\n\n      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });\n''',
    "pdf completion state",
)

replace_once(
    '''      const completed = pdfRows.filter(isDone).length;\n      const pending = pdfRows.length - completed;\n      const rate = pdfRows.length ? Math.round((completed / pdfRows.length) * 100) : 0;\n''',
    '''      const completed = pdfRows.filter(isDone).length;\n      const pendingVerification = pdfRows.filter(\n        (row) => completionStateOf(row) === "pendente_verificacao",\n      ).length;\n      const pending = pdfRows.filter((row) => completionStateOf(row) === "pendente").length;\n      const rate = pdfRows.length ? Math.round((completed / pdfRows.length) * 100) : 0;\n''',
    "pdf counters",
)

replace_once(
    '''      doc.setFillColor(5, 150, 105);\n      doc.circle(legendX, infoValueY - 0.9, 1, "F");\n      doc.setTextColor(71, 85, 105);\n      doc.text("Concluído", legendX + 2.4, infoValueY);\n      doc.setFillColor(217, 119, 6);\n      doc.circle(legendX + 20, infoValueY - 0.9, 1, "F");\n      doc.text("Pendente", legendX + 22.4, infoValueY);\n''',
    '''      doc.setFillColor(5, 150, 105);\n      doc.circle(legendX, infoValueY - 0.9, 1, "F");\n      doc.setTextColor(71, 85, 105);\n      doc.text("Concluído", legendX + 2.4, infoValueY);\n      doc.setFillColor(2, 132, 199);\n      doc.circle(legendX + 20, infoValueY - 0.9, 1, "F");\n      doc.text("A verificar", legendX + 22.4, infoValueY);\n      doc.setFillColor(217, 119, 6);\n      doc.circle(legendX + 43, infoValueY - 0.9, 1, "F");\n      doc.text("Pendente", legendX + 45.4, infoValueY);\n''',
    "pdf legend",
)

replace_once(
    '''        body: pdfRows.map((row) => [\n          isDone(row) ? "CONCLUÍDO" : "PENDENTE",\n          row.os,\n''',
    '''        body: pdfRows.map((row) => [\n          completionStateOf(row) === "concluida"\n            ? "CONCLUÍDO"\n            : completionStateOf(row) === "pendente_verificacao"\n              ? "A VERIFICAR"\n              : "PENDENTE",\n          row.os,\n''',
    "pdf row status",
)

replace_once(
    '''          if (isDone(row)) {\n            cell.cell.styles.fillColor = [240, 253, 247];\n            cell.cell.styles.textColor = [30, 41, 59];\n            if (cell.column.index === 0) {\n              cell.cell.styles.fillColor = [209, 250, 229];\n              cell.cell.styles.textColor = [5, 150, 105];\n            }\n          } else if (cell.column.index === 0) {\n            cell.cell.styles.fillColor = [254, 249, 195];\n            cell.cell.styles.textColor = [180, 83, 9];\n          }\n''',
    '''          const completionState = completionStateOf(row);\n          if (completionState === "concluida") {\n            cell.cell.styles.fillColor = [240, 253, 247];\n            cell.cell.styles.textColor = [30, 41, 59];\n            if (cell.column.index === 0) {\n              cell.cell.styles.fillColor = [209, 250, 229];\n              cell.cell.styles.textColor = [5, 150, 105];\n            }\n          } else if (completionState === "pendente_verificacao") {\n            cell.cell.styles.fillColor = [239, 246, 255];\n            cell.cell.styles.textColor = [30, 41, 59];\n            if (cell.column.index === 0) {\n              cell.cell.styles.fillColor = [219, 234, 254];\n              cell.cell.styles.textColor = [2, 132, 199];\n            }\n          } else if (cell.column.index === 0) {\n            cell.cell.styles.fillColor = [254, 249, 195];\n            cell.cell.styles.textColor = [180, 83, 9];\n          }\n''',
    "pdf row colors",
)

replace_once(
    '''                Corretivas são sincronizadas automaticamente com o Corretiva Novo; o PDF é validado novamente antes da emissão.\n''',
    '''                Corretivas podem ser concluídas aqui. Enquanto o Corretiva Novo ainda não confirmar a conclusão, elas ficam como pendentes de verificação; ao concluir no Corretiva Novo, a confirmação é automática.\n''',
    "header explanatory copy",
)

replace_once(
    '''                    <p className="mt-0.5 text-[11px] text-muted-foreground">Corretivas oficiais seguem automaticamente o status do Corretiva Novo; demais atividades permanecem com controle manual.</p>\n''',
    '''                    <p className="mt-0.5 text-[11px] text-muted-foreground">Você pode marcar corretivas como concluídas aqui. Elas ficam pendentes de verificação até o Corretiva Novo confirmar; conclusões feitas no Corretiva Novo entram como verificadas automaticamente.</p>\n''',
    "table explanatory copy",
)

replace_once(
    '''                      <option value="concluidas">Concluídas</option>\n                      <option value="pendentes">Pendentes</option>\n''',
    '''                      <option value="concluidas">Concluídas</option>\n                      <option value="verificacao">Pendente de verificação</option>\n                      <option value="pendentes">Pendentes</option>\n''',
    "verification filter option",
)

replace_once(
    '''                      const syncedCorrective = Boolean(canonicalCorrective);\n                      const completed = rowIsCompleted(row, completions, correctiveByOs);\n                      const waitingProgramming = row.supplementalCorrective && !row.programmedCorrective;\n''',
    '''                      const syncedCorrective = Boolean(canonicalCorrective);\n                      const completionState = rowCompletionState(row, completions, correctiveByOs);\n                      const completed = completionState !== "pendente";\n                      const pendingVerification = completionState === "pendente_verificacao";\n                      const verifiedCorrective =\n                        syncedCorrective && completionState === "concluida";\n                      const waitingProgramming = row.supplementalCorrective && !row.programmedCorrective;\n''',
    "row ui completion state",
)

replace_once(
    '''                            ) : syncedCorrective ? (\n                              <span\n                                className={cn(\n                                  "inline-flex min-w-[150px] items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-[10px] font-semibold",\n                                  completed\n                                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"\n                                    : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",\n                                )}\n                                title="Status sincronizado automaticamente com o Corretiva Novo"\n                              >\n                                {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}\n                                {completed ? "Concluída • sincronizada" : "Pendente • sincronizada"}\n                              </span>\n                            ) : (\n                              <Button\n                                type="button"\n                                size="sm"\n                                variant={completed ? "default" : "outline"}\n                                disabled={completingId === row.id}\n                                onClick={() => void toggleCompleted(row)}\n                                className={cn(\n                                  "h-8 min-w-[150px] justify-center gap-1.5 px-2.5 text-[10px]",\n                                  completed && "bg-emerald-600 text-white hover:bg-emerald-700",\n                                )}\n                                title={completed ? "Clique para voltar a atividade para pendente" : "Marcar atividade como concluída"}\n                              >\n                                {completingId === row.id ? (\n                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />\n                                ) : completed ? (\n                                  <CheckCircle2 className="h-3.5 w-3.5" />\n                                ) : (\n                                  <Circle className="h-3.5 w-3.5" />\n                                )}\n                                {completed ? `Concluída${completionTime(record) ? ` • ${completionTime(record)}` : ""}` : "Marcar concluída"}\n                              </Button>\n                            )}\n''',
    '''                            ) : verifiedCorrective ? (\n                              <span\n                                className="inline-flex min-w-[150px] items-center justify-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"\n                                title="Conclusão confirmada automaticamente pelo Corretiva Novo"\n                              >\n                                <CheckCircle2 className="h-3.5 w-3.5" />\n                                Concluída • verificada\n                              </span>\n                            ) : (\n                              <Button\n                                type="button"\n                                size="sm"\n                                variant={completed ? "default" : "outline"}\n                                disabled={completingId === row.id}\n                                onClick={() => void toggleCompleted(row)}\n                                className={cn(\n                                  "h-8 min-w-[150px] justify-center gap-1.5 px-2.5 text-[10px]",\n                                  pendingVerification &&\n                                    "border-sky-500/35 bg-sky-600 text-white hover:bg-sky-700",\n                                  completed &&\n                                    !pendingVerification &&\n                                    "bg-emerald-600 text-white hover:bg-emerald-700",\n                                )}\n                                title={\n                                  pendingVerification\n                                    ? "Concluída no Relatório Diário e aguardando verificação do Corretiva Novo. Clique para desfazer."\n                                    : completed\n                                      ? "Clique para voltar a atividade para pendente"\n                                      : syncedCorrective\n                                        ? "Marcar corretiva como concluída no Relatório Diário; ficará pendente de verificação"\n                                        : "Marcar atividade como concluída"\n                                }\n                              >\n                                {completingId === row.id ? (\n                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />\n                                ) : completed ? (\n                                  <CheckCircle2 className="h-3.5 w-3.5" />\n                                ) : (\n                                  <Circle className="h-3.5 w-3.5" />\n                                )}\n                                {pendingVerification\n                                  ? "Concluída • verificar"\n                                  : completed\n                                    ? `Concluída${completionTime(record) ? ` • ${completionTime(record)}` : ""}`\n                                    : "Marcar concluída"}\n                              </Button>\n                            )}\n''',
    "corrective row button",
)

replace_once(
    '''                  <Stat label="Concluídas" value={selectedCompleted} tone="done" />\n                  <Stat label="Pendentes" value={selectedPending} tone="pending" />\n                  <Stat label="Execução" value={`${completionRate}%`} tone="rate" />\n''',
    '''                  <Stat label="Concluídas" value={selectedCompleted} tone="done" />\n                  <Stat label="A verificar" value={selectedPendingVerification} tone="rate" />\n                  <Stat label="Pendentes" value={selectedPending} tone="pending" />\n                  <Stat label="Execução" value={`${completionRate}%`} tone="rate" />\n''',
    "verification stat",
)

# Keep the PDF summary useful by surfacing how many executions still await canonical verification.
replace_once(
    '''      const metrics = [\n''',
    '''      void pendingVerification;\n      const metrics = [\n''',
    "pdf verification counter usage",
)

path.write_text(source, encoding="utf-8")
print("Daily corrective verification patch applied successfully.")
