from pathlib import Path

path = Path('src/routes/_authenticated/corretiva-historico.tsx')
text = path.read_text(encoding='utf-8')

old = '  const [reopeningOsId, setReopeningOsId] = useState<string | null>(null);\n  const [isExporting, setIsExporting] = useState(false);'
new = '  const [reopeningOsId, setReopeningOsId] = useState<string | null>(null);\n  const [returningDailyKey, setReturningDailyKey] = useState<string | null>(null);\n  const [isExporting, setIsExporting] = useState(false);'
assert old in text
text = text.replace(old, new, 1)

anchor = '''  const filtered = useMemo(() => {\n'''
handler = '''  const handleReturnDailyToProgramming = useCallback(\n    async (os: OsRow, record: DailyReportExecution) => {\n      if (returningDailyKey || isCanonicalHistoryStatus(os.status)) return;\n      const confirmed = window.confirm(\n        `Voltar a OS ${os.numero_os} para programação? A conclusão lançada no Relatório Diário de ${record.atividade_data.split("-").reverse().join("/")} será removida. O status atual do Corretiva Novo não será alterado.`,\n      );\n      if (!confirmed) return;\n\n      setReturningDailyKey(record.item_key);\n      try {\n        const { data, error } = await (supabase as any)\n          .from("relatorio_diario_execucoes")\n          .delete()\n          .eq("item_key", record.item_key)\n          .eq("os", record.os)\n          .select("item_key")\n          .maybeSingle();\n        if (error) throw error;\n        if (!data) throw new Error("Este registro do Relatório Diário não existe mais. Atualize o histórico e tente novamente.");\n\n        if (open?.id === os.id) setOpen(null);\n        await Promise.all([\n          queryClient.invalidateQueries({ queryKey: ["corretiva-historico-relatorio-diario"] }),\n          queryClient.invalidateQueries({ queryKey: ["corretiva-historico"] }),\n        ]);\n        toast.success(`OS ${os.numero_os} voltou para programação. A conclusão do Relatório Diário foi removida sem alterar o Corretiva Novo.`);\n      } catch (error: any) {\n        console.error("[CorretivaHistorico] Erro ao devolver OS para programação:", error);\n        toast.error(error?.message || "Não foi possível devolver o chamado para programação.");\n      } finally {\n        setReturningDailyKey(null);\n      }\n    },\n    [open?.id, queryClient, returningDailyKey],\n  );\n\n'''
assert anchor in text
text = text.replace(anchor, handler + anchor, 1)

old = '''                const reopening = reopeningOsId === os.id;\n                const StatusIcon = cancelada ? XCircle : CheckCircle2;'''
new = '''                const reopening = reopeningOsId === os.id;\n                const returningToProgramming = returningDailyKey === dailyRecord?.item_key;\n                const StatusIcon = cancelada ? XCircle : CheckCircle2;'''
assert old in text
text = text.replace(old, new, 1)

anchor = '''                        {os.status === "concluida" && isAdmin && (\n'''
button = '''                        {dailyOnly && dailyRecord && (\n                          <Button\n                            type="button"\n                            variant="outline"\n                            size="sm"\n                            title="Remover a conclusão do Relatório Diário e deixar o chamado disponível novamente para programação"\n                            onClick={() => void handleReturnDailyToProgramming(os, dailyRecord)}\n                            disabled={Boolean(returningDailyKey)}\n                            className="h-9 gap-1.5 rounded-lg border-amber-500/30 bg-amber-500/10 px-2.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"\n                          >\n                            {returningToProgramming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}\n                            Voltar para programação\n                          </Button>\n                        )}\n'''
assert anchor in text
text = text.replace(anchor, button + anchor, 1)

path.write_text(text, encoding='utf-8')
