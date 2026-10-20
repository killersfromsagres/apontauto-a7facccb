from pathlib import Path

path = Path("src/features/relatorio-diario/daily-execution-report.tsx")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global source
    if old not in source:
        raise RuntimeError(f"Pattern not found: {label}")
    source = source.replace(old, new, 1)


replace_once(
    '''  if (isCorrectiveActivity(row)) {\n    const canonical = correctiveByOs.get(correctiveOsKey(row.os));\n    if (canonical) {\n      if (isCompletedCorrectiveStatus(canonical.status)) return "concluida";\n      return manualExecution ? "pendente_verificacao" : "pendente";\n    }\n  }\n\n  return manualExecution ? "concluida" : "pendente";\n''',
    '''  if (isCorrectiveActivity(row)) {\n    const canonical = correctiveByOs.get(correctiveOsKey(row.os));\n    if (canonical) {\n      const canonicalCompleted = isCompletedCorrectiveStatus(canonical.status);\n      if (canonicalCompleted && manualExecution) return "concluida";\n      if (canonicalCompleted || manualExecution) return "pendente_verificacao";\n      return "pendente";\n    }\n  }\n\n  return manualExecution ? "concluida" : "pendente";\n''',
    "two-source completion state",
)

replace_once(
    '''    if (canonicalCorrective && isCompletedCorrectiveStatus(canonicalCorrective.status)) {\n      toast.info(`A OS ${row.os} já está concluída e verificada pelo Corretiva Novo.`);\n      return;\n    }\n\n    const current = completions.get(row.id);\n''',
    '''    const canonicalCompleted = Boolean(\n      canonicalCorrective && isCompletedCorrectiveStatus(canonicalCorrective.status),\n    );\n\n    const current = completions.get(row.id);\n''',
    "allow daily verification after canonical completion",
)

replace_once(
    '''        toast.success(\n          canonicalCorrective\n            ? `OS ${row.os} voltou para pendente e deixou de aguardar verificação.`\n            : `OS ${row.os} voltou para pendente no relatório diário.`,\n        );\n''',
    '''        toast.success(\n          canonicalCompleted\n            ? `Verificação da OS ${row.os} desfeita no Relatório Diário. A conclusão do Corretiva Novo continua registrada e voltou a aguardar verificação.`\n            : canonicalCorrective\n              ? `OS ${row.os} voltou para pendente e deixou de aguardar confirmação do Corretiva Novo.`\n              : `OS ${row.os} voltou para pendente no relatório diário.`,\n        );\n''',
    "two-source undo message",
)

replace_once(
    '''      toast.success(\n        canonicalCorrective\n          ? `OS ${row.os} marcada como concluída no Relatório Diário. Agora está pendente de verificação no Corretiva Novo.`\n          : `OS ${row.os} marcada como concluída.`,\n      );\n''',
    '''      toast.success(\n        canonicalCompleted\n          ? `OS ${row.os} verificada no Relatório Diário. A conclusão já estava registrada no Corretiva Novo.`\n          : canonicalCorrective\n            ? `OS ${row.os} marcada como concluída no Relatório Diário. Agora aguarda confirmação do Corretiva Novo.`\n            : `OS ${row.os} marcada como concluída.`,\n      );\n''',
    "two-source completion message",
)

replace_once(
    '''                Corretivas podem ser concluídas aqui. Enquanto o Corretiva Novo ainda não confirmar a conclusão, elas ficam como pendentes de verificação; ao concluir no Corretiva Novo, a confirmação é automática.\n''',
    '''                Corretivas usam verificação em duas vias: concluir aqui ou no Corretiva Novo marca a atividade como concluída e pendente de verificação; quando as duas confirmações existem, ela passa para concluída e verificada.\n''',
    "two-way header copy",
)

replace_once(
    '''                    <p className="mt-0.5 text-[11px] text-muted-foreground">Você pode marcar corretivas como concluídas aqui. Elas ficam pendentes de verificação até o Corretiva Novo confirmar; conclusões feitas no Corretiva Novo entram como verificadas automaticamente.</p>\n''',
    '''                    <p className="mt-0.5 text-[11px] text-muted-foreground">A conclusão é sincronizada nos dois sentidos. Se concluir primeiro no Corretiva Novo, a OS entra aqui como concluída e pendente de verificação; clique para verificar. Se concluir primeiro aqui, ela aguarda a confirmação do Corretiva Novo.</p>\n''',
    "two-way table copy",
)

replace_once(
    '''                      const completionState = rowCompletionState(row, completions, correctiveByOs);\n                      const completed = completionState !== "pendente";\n                      const pendingVerification = completionState === "pendente_verificacao";\n                      const verifiedCorrective =\n                        syncedCorrective && completionState === "concluida";\n''',
    '''                      const completionState = rowCompletionState(row, completions, correctiveByOs);\n                      const completed = completionState !== "pendente";\n                      const pendingVerification = completionState === "pendente_verificacao";\n                      const canonicalCompleted = Boolean(\n                        canonicalCorrective && isCompletedCorrectiveStatus(canonicalCorrective.status),\n                      );\n                      const manualCompleted = Boolean(record);\n                      const verifiedCorrective =\n                        syncedCorrective && completionState === "concluida";\n''',
    "row source flags",
)

replace_once(
    '''                                title="Conclusão confirmada automaticamente pelo Corretiva Novo"\n''',
    '''                                title="Conclusão confirmada no Corretiva Novo e verificada no Relatório Diário"\n''',
    "verified title",
)

replace_once(
    '''                                  pendingVerification\n                                    ? "Concluída no Relatório Diário e aguardando verificação do Corretiva Novo. Clique para desfazer."\n                                    : completed\n                                      ? "Clique para voltar a atividade para pendente"\n                                      : syncedCorrective\n                                        ? "Marcar corretiva como concluída no Relatório Diário; ficará pendente de verificação"\n                                        : "Marcar atividade como concluída"\n''',
    '''                                  pendingVerification\n                                    ? canonicalCompleted && !manualCompleted\n                                      ? "Concluída no Corretiva Novo e pendente de verificação no Relatório Diário. Clique para verificar."\n                                      : "Concluída no Relatório Diário e aguardando confirmação do Corretiva Novo. Clique para desfazer."\n                                    : completed\n                                      ? "Clique para voltar a atividade para pendente"\n                                      : syncedCorrective\n                                        ? "Marcar corretiva como concluída no Relatório Diário; ficará pendente de confirmação do Corretiva Novo"\n                                        : "Marcar atividade como concluída"\n''',
    "pending verification title",
)

replace_once(
    '''                                {pendingVerification\n                                  ? "Concluída • verificar"\n                                  : completed\n''',
    '''                                {pendingVerification\n                                  ? canonicalCompleted && !manualCompleted\n                                    ? "Concluída • verificar"\n                                    : "Concluída • aguarda confirmação"\n                                  : completed\n''',
    "pending verification label",
)

path.write_text(source, encoding="utf-8")
print("Two-way corrective verification patch applied successfully.")
