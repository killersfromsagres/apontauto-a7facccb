from pathlib import Path

path = Path("src/features/relatorio-diario/daily-execution-report.tsx")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global source
    if old not in source:
        raise RuntimeError(f"Pattern not found: {label}")
    source = source.replace(old, new, 1)


replace_once(
    '''  async function toggleCompleted(row: WeeklyPlanningRow) {\n    if (completingId) return;\n    if (row.supplementalCorrective && !row.programmedCorrective) {\n      toast.warning("Confirme este encaixe como Programado antes de marcar a atividade como concluída.");\n      return;\n    }\n\n    const canonicalCorrective = isCorrectiveActivity(row)\n''',
    '''  async function toggleCompleted(row: WeeklyPlanningRow) {\n    if (completingId) return;\n\n    const canonicalCorrective = isCorrectiveActivity(row)\n''',
    "remove programming completion block",
)

replace_once(
    '''                      const verifiedCorrective =\n                        syncedCorrective && completionState === "concluida";\n                      const waitingProgramming = row.supplementalCorrective && !row.programmedCorrective;\n                      return (\n''',
    '''                      const verifiedCorrective =\n                        syncedCorrective && completionState === "concluida";\n                      return (\n''',
    "remove waiting programming flag",
)

replace_once(
    '''                          <div className="flex items-center justify-end gap-2">\n                            {waitingProgramming ? (\n                              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300">AGUARDA PROGRAMAÇÃO</span>\n                            ) : verifiedCorrective ? (\n''',
    '''                          <div className="flex items-center justify-end gap-2">\n                            {verifiedCorrective ? (\n''',
    "make every corrective row actionable",
)

replace_once(
    '''                              </Button>\n                            )}\n                          </div>\n''',
    '''                              </Button>\n                            )}\n                          </div>\n''',
    "keep action closing",
)

replace_once(
    '''                    <p className="mt-0.5 text-[11px] text-muted-foreground">A conclusão é sincronizada nos dois sentidos. Se concluir primeiro no Corretiva Novo, a OS entra aqui como concluída e pendente de verificação; clique para verificar. Se concluir primeiro aqui, ela aguarda a confirmação do Corretiva Novo.</p>\n''',
    '''                    <p className="mt-0.5 text-[11px] text-muted-foreground">Todas as corretivas exibidas podem ser marcadas como concluídas, inclusive encaixes ainda não confirmados como Programado. A conclusão é sincronizada nos dois sentidos: se concluir primeiro no Corretiva Novo, a OS entra aqui como concluída e pendente de verificação; se concluir primeiro aqui, ela aguarda a confirmação do Corretiva Novo.</p>\n''',
    "explain all corrective actions",
)

path.write_text(source, encoding="utf-8")
print("All corrective completion buttons enabled successfully.")
