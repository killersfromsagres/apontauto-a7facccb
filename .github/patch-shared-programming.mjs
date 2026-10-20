import fs from "node:fs";

function replaceOnce(file, from, to, label) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(from)) {
    throw new Error(`Pattern not found (${label}) in ${file}`);
  }
  const next = source.replace(from, to);
  fs.writeFileSync(file, next);
}

const daily = "src/features/relatorio-diario/daily-execution-report.tsx";
const programacao = "src/routes/_authenticated/programacao.tsx";

replaceOnce(
  daily,
  'const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";\n',
  'const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";\nconst ROWS_MIGRATED_KEY = "apontauto:relatorio-diario:programacao-cloud-migrated:v1";\n',
  "daily migration key",
);

replaceOnce(
  daily,
  '  const [loadingPortfolio, setLoadingPortfolio] = useState(false);\n  const [loadingExecutions, setLoadingExecutions] = useState(false);\n',
  '  const [loadingPortfolio, setLoadingPortfolio] = useState(false);\n  const [loadingExecutions, setLoadingExecutions] = useState(false);\n  const [loadingSchedule, setLoadingSchedule] = useState(false);\n',
  "daily loading schedule state",
);

replaceOnce(
  daily,
  `  }, []);\n\n  useEffect(() => {\n    const storedRows = mergeSchedules([], safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));\n    setRows(storedRows);\n    const storedTarget = Number(window.localStorage.getItem(TARGET_KEY) ?? "2");\n    setTargetPerTeam(Number.isFinite(storedTarget) ? Math.min(10, Math.max(1, storedTarget)) : 2);\n    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");\n    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");\n    void Promise.all([loadPortfolio(false), loadExecutions(false)]);\n  }, [loadExecutions, loadPortfolio]);`,
  `  }, []);\n\n  const loadSharedSchedule = useCallback(async (notify = false, migrateLocal = false) => {\n    setLoadingSchedule(true);\n    const cachedRows = mergeSchedules(\n      [],\n      safeRead<ScheduledMaintenance[]>(ROWS_KEY, []),\n    );\n\n    try {\n      const { data, error } = await (supabase as any)\n        .from("relatorio_diario_programacao_rows")\n        .select("payload,atividade_data")\n        .order("atividade_data", { ascending: true })\n        .limit(20000);\n\n      if (error) throw error;\n\n      let nextRows = mergeSchedules(\n        [],\n        ((data ?? []) as Array<{ payload?: ScheduledMaintenance | null }>)\n          .map((record) => record.payload)\n          .filter((row): row is ScheduledMaintenance => Boolean(row?.id && row?.date)),\n      );\n\n      const migrationDone = window.localStorage.getItem(ROWS_MIGRATED_KEY) === "1";\n      if (!nextRows.length && migrateLocal && !migrationDone && cachedRows.length) {\n        const { error: migrationError } = await (supabase as any).rpc(\n          "save_relatorio_diario_programacao",\n          { _rows: cachedRows, _replace: false },\n        );\n        if (migrationError) throw migrationError;\n        nextRows = cachedRows;\n        toast.success("Programação deste computador migrada para a base compartilhada.");\n      }\n\n      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");\n      window.localStorage.setItem(ROWS_KEY, JSON.stringify(nextRows));\n      setRows(nextRows);\n      if (notify) {\n        toast.success(\n          nextRows.length\n            ? `Programação compartilhada atualizada: ${nextRows.length} OS.`\n            : "A programação compartilhada está vazia.",\n        );\n      }\n      return nextRows;\n    } catch (error: any) {\n      console.error("[RelatorioDiario] Falha ao carregar programação compartilhada:", error);\n      if (cachedRows.length) {\n        setRows(cachedRows);\n        if (notify) {\n          toast.warning("Nuvem indisponível. Exibindo a última programação salva neste computador.");\n        }\n      } else if (notify) {\n        toast.error(error?.message || "Não foi possível carregar a programação compartilhada.");\n      }\n      return null;\n    } finally {\n      setLoadingSchedule(false);\n    }\n  }, []);\n\n  useEffect(() => {\n    const cachedRows = mergeSchedules([], safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));\n    setRows(cachedRows);\n    const storedTarget = Number(window.localStorage.getItem(TARGET_KEY) ?? "2");\n    setTargetPerTeam(Number.isFinite(storedTarget) ? Math.min(10, Math.max(1, storedTarget)) : 2);\n    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");\n    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");\n    void Promise.all([\n      loadSharedSchedule(false, true),\n      loadPortfolio(false),\n      loadExecutions(false),\n    ]);\n  }, [loadExecutions, loadPortfolio, loadSharedSchedule]);`,
  "daily shared loader and startup",
);

replaceOnce(
  daily,
  `  useEffect(() => {\n    const channel = supabase\n      .channel("relatorio-diario-programacao-real")\n      .on(\n        "postgres_changes",\n        { event: "*", schema: "public", table: "corretiva_os" },\n        () => void loadPortfolio(false),\n      )\n      .subscribe();\n\n    const refreshExecutions = () => void loadExecutions(false);\n    window.addEventListener("focus", refreshExecutions);\n\n    return () => {\n      window.removeEventListener("focus", refreshExecutions);\n      void supabase.removeChannel(channel);\n    };\n  }, [loadExecutions, loadPortfolio]);`,
  `  useEffect(() => {\n    let scheduleTimer: ReturnType<typeof setTimeout> | null = null;\n    let executionTimer: ReturnType<typeof setTimeout> | null = null;\n    const refreshSharedSchedule = () => {\n      if (scheduleTimer) clearTimeout(scheduleTimer);\n      scheduleTimer = setTimeout(() => void loadSharedSchedule(false, false), 180);\n    };\n    const refreshExecutions = () => {\n      if (executionTimer) clearTimeout(executionTimer);\n      executionTimer = setTimeout(() => void loadExecutions(false), 120);\n    };\n\n    const channel = supabase\n      .channel("relatorio-diario-sync-real")\n      .on(\n        "postgres_changes",\n        { event: "*", schema: "public", table: "corretiva_os" },\n        () => void loadPortfolio(false),\n      )\n      .on(\n        "postgres_changes",\n        { event: "*", schema: "public", table: "relatorio_diario_programacao_rows" },\n        refreshSharedSchedule,\n      )\n      .on(\n        "postgres_changes",\n        { event: "*", schema: "public", table: "relatorio_diario_execucoes" },\n        refreshExecutions,\n      )\n      .subscribe();\n\n    const refreshAll = () => {\n      void loadSharedSchedule(false, false);\n      void loadPortfolio(false);\n      void loadExecutions(false);\n    };\n    window.addEventListener("focus", refreshAll);\n\n    return () => {\n      if (scheduleTimer) clearTimeout(scheduleTimer);\n      if (executionTimer) clearTimeout(executionTimer);\n      window.removeEventListener("focus", refreshAll);\n      void supabase.removeChannel(channel);\n    };\n  }, [loadExecutions, loadPortfolio, loadSharedSchedule]);`,
  "daily realtime",
);

replaceOnce(
  daily,
  `      setRows((current) =>\n        shouldReplaceSchedule(current, imported)\n          ? mergeSchedules([], imported)\n          : mergeSchedules(current, imported),\n      );\n\n      const importedDates = Array.from(new Set(imported.map((row) => row.date))).sort();\n      if (importedDates.length) setSelectedDate(importedDates[0]);\n      toast.success(\`${"${imported.length}"} OS da programação semanal carregadas.\`);`,
  `      const replaceCurrent = shouldReplaceSchedule(rows, imported);\n      const nextRows = replaceCurrent\n        ? mergeSchedules([], imported)\n        : mergeSchedules(rows, imported);\n\n      const { error: sharedError } = await (supabase as any).rpc(\n        "save_relatorio_diario_programacao",\n        { _rows: imported, _replace: replaceCurrent },\n      );\n      if (sharedError) {\n        throw new Error(\`A planilha foi lida, mas não pôde ser compartilhada: ${"${sharedError.message || 'erro de sincronização'}"}.\`);\n      }\n\n      setRows(nextRows);\n      window.localStorage.setItem(ROWS_KEY, JSON.stringify(nextRows));\n      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");\n\n      const importedDates = Array.from(new Set(imported.map((row) => row.date))).sort();\n      if (importedDates.length) setSelectedDate(importedDates[0]);\n      toast.success(\`${"${imported.length}"} OS carregadas na programação compartilhada.\`);`,
  "daily import persistence",
);

replaceOnce(
  daily,
  `  function clearImportedBase() {\n    if (!window.confirm("Limpar somente as planilhas semanais importadas desta tela? Os registros de conclusão permanecerão salvos no servidor.")) return;\n    setRows([]);\n    window.localStorage.removeItem(ROWS_KEY);\n    toast.success("Programação importada removida desta tela.");\n  }`,
  `  async function clearImportedBase() {\n    if (\n      !window.confirm(\n        "Limpar a programação semanal compartilhada? Ela será removida para todos os usuários e computadores com acesso ao Relatório Diário. Os registros de conclusão permanecerão salvos.",\n      )\n    ) return;\n\n    setLoadingSchedule(true);\n    try {\n      const { error } = await (supabase as any).rpc(\n        "save_relatorio_diario_programacao",\n        { _rows: [], _replace: true },\n      );\n      if (error) throw error;\n      setRows([]);\n      window.localStorage.removeItem(ROWS_KEY);\n      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");\n      toast.success("Programação compartilhada removida para todos os usuários autorizados.");\n    } catch (error: any) {\n      toast.error(error?.message || "Não foi possível limpar a programação compartilhada.");\n    } finally {\n      setLoadingSchedule(false);\n    }\n  }`,
  "daily clear shared",
);

replaceOnce(
  daily,
  '  const syncing = loadingPortfolio || loadingExecutions;\n',
  '  const syncing = loadingPortfolio || loadingExecutions || loadingSchedule;\n',
  "daily syncing state",
);

replaceOnce(
  daily,
  '                onClick={() => void Promise.all([loadPortfolio(true), loadExecutions(false)])}\n',
  '                onClick={() => void Promise.all([loadSharedSchedule(true, false), loadPortfolio(true), loadExecutions(false)])}\n',
  "daily update button",
);

replaceOnce(
  daily,
  '              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Planilhas .xlsx/.xls. A agenda é combinada com as corretivas abertas.</span>\n',
  '              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Planilhas .xlsx/.xls. A programação fica compartilhada na nuvem e aparece para todos os usuários autorizados.</span>\n',
  "daily shared copy",
);

replaceOnce(
  programacao,
  'import { cn } from "@/lib/utils";\n',
  'import { cn } from "@/lib/utils";\nimport { supabase } from "@/integrations/supabase/client";\n',
  "programacao supabase import",
);

replaceOnce(
  programacao,
  'const TITULO_PADRAO = "GRUPO GPS • SHERWIN WILLIAMS / DEMARCHI";\n',
  'const TITULO_PADRAO = "GRUPO GPS • SHERWIN WILLIAMS / DEMARCHI";\nconst PROGRAMACAO_IMPORT_BUCKET = "programacao-importacoes";\nconst XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";\nconst sharedImportPath = (slot: SlotId) => `shared/${slot}.xlsx`;\n',
  "programacao shared constants",
);

replaceOnce(
  programacao,
  '  const [historico, setHistorico] = useState<HistoricoItem[]>([]);\n',
  '  const [historico, setHistorico] = useState<HistoricoItem[]>([]);\n  const [loadingSharedFiles, setLoadingSharedFiles] = useState(false);\n  const [syncingSlot, setSyncingSlot] = useState<SlotId | null>(null);\n',
  "programacao sync states",
);

replaceOnce(
  programacao,
  `  const reloadHistorico = useCallback(async () => {\n    try {\n      setHistorico(await listHistorico());\n    } catch (error) {\n      console.error(error);\n    }\n  }, []);\n\n  useEffect(() => void reloadHistorico(), [reloadHistorico]);`,
  `  const reloadHistorico = useCallback(async () => {\n    try {\n      setHistorico(await listHistorico());\n    } catch (error) {\n      console.error(error);\n    }\n  }, []);\n\n  const loadSharedSlotFiles = useCallback(async (notify = false) => {\n    setLoadingSharedFiles(true);\n    try {\n      const { data, error } = await (supabase as any)\n        .from("programacao_importacoes")\n        .select("slot,filename,storage_path,updated_at")\n        .order("slot", { ascending: true });\n      if (error) throw error;\n\n      const next: Record<SlotId, File | null> = {\n        CCH: null,\n        REFRIG: null,\n        ELETRICA: null,\n      };\n\n      for (const row of data ?? []) {\n        const slot = String(row.slot ?? "") as SlotId;\n        if (!SLOTS.some((item) => item.id === slot)) continue;\n        const storagePath = String(row.storage_path ?? "");\n        if (!storagePath) continue;\n\n        const { data: blob, error: downloadError } = await supabase.storage\n          .from(PROGRAMACAO_IMPORT_BUCKET)\n          .download(storagePath);\n        if (downloadError || !blob) throw downloadError || new Error("Arquivo compartilhado não encontrado.");\n\n        const updatedAt = new Date(String(row.updated_at ?? "")).getTime();\n        next[slot] = new File(\n          [blob],\n          String(row.filename || `${"${slot}"}.xlsx`),\n          {\n            type: blob.type || XLSX_CONTENT_TYPE,\n            lastModified: Number.isFinite(updatedAt) ? updatedAt : Date.now(),\n          },\n        );\n      }\n\n      setSlotFiles(next);\n      if (notify) toast.success("Planilhas compartilhadas atualizadas.");\n      return next;\n    } catch (error: any) {\n      console.error("[Programacao] Falha ao carregar planilhas compartilhadas:", error);\n      if (notify) {\n        toast.error(error?.message || "Não foi possível carregar as planilhas compartilhadas.");\n      }\n      return null;\n    } finally {\n      setLoadingSharedFiles(false);\n    }\n  }, []);\n\n  useEffect(() => {\n    void Promise.all([reloadHistorico(), loadSharedSlotFiles(false)]);\n  }, [loadSharedSlotFiles, reloadHistorico]);\n\n  useEffect(() => {\n    let importTimer: ReturnType<typeof setTimeout> | null = null;\n    let historyTimer: ReturnType<typeof setTimeout> | null = null;\n    const refreshImports = () => {\n      if (importTimer) clearTimeout(importTimer);\n      importTimer = setTimeout(() => void loadSharedSlotFiles(false), 180);\n    };\n    const refreshHistory = () => {\n      if (historyTimer) clearTimeout(historyTimer);\n      historyTimer = setTimeout(() => void reloadHistorico(), 180);\n    };\n\n    const channel = supabase\n      .channel("programacao-compartilhada")\n      .on(\n        "postgres_changes",\n        { event: "*", schema: "public", table: "programacao_importacoes" },\n        refreshImports,\n      )\n      .on(\n        "postgres_changes",\n        { event: "*", schema: "public", table: "programacao_arquivos" },\n        refreshHistory,\n      )\n      .subscribe();\n\n    const refreshAll = () => {\n      void loadSharedSlotFiles(false);\n      void reloadHistorico();\n    };\n    window.addEventListener("focus", refreshAll);\n\n    return () => {\n      if (importTimer) clearTimeout(importTimer);\n      if (historyTimer) clearTimeout(historyTimer);\n      window.removeEventListener("focus", refreshAll);\n      void supabase.removeChannel(channel);\n    };\n  }, [loadSharedSlotFiles, reloadHistorico]);`,
  "programacao shared loader realtime",
);

replaceOnce(
  programacao,
  `  const setSlot = useCallback((slot: SlotId, file: File | null) => {\n    if (file && !file.name.toLowerCase().endsWith(".xlsx")) {\n      toast.error("Envie um arquivo .xlsx");\n      return;\n    }\n    setSlotFiles((current) => ({ ...current, [slot]: file }));\n  }, []);`,
  `  const setSlot = useCallback(async (slot: SlotId, file: File | null) => {\n    if (syncingSlot) {\n      toast.info("Aguarde a sincronização da planilha atual.");\n      return;\n    }\n    if (file && !file.name.toLowerCase().endsWith(".xlsx")) {\n      toast.error("Envie um arquivo .xlsx");\n      return;\n    }\n\n    const storagePath = sharedImportPath(slot);\n    const previousFile = slotFiles[slot];\n    setSyncingSlot(slot);\n    try {\n      if (!file) {\n        const { error: storageError } = await supabase.storage\n          .from(PROGRAMACAO_IMPORT_BUCKET)\n          .remove([storagePath]);\n        if (storageError) throw storageError;\n\n        const { error: metadataError } = await (supabase as any)\n          .from("programacao_importacoes")\n          .delete()\n          .eq("slot", slot);\n        if (metadataError) {\n          if (previousFile) {\n            await supabase.storage\n              .from(PROGRAMACAO_IMPORT_BUCKET)\n              .upload(storagePath, previousFile, {\n                contentType: previousFile.type || XLSX_CONTENT_TYPE,\n                upsert: true,\n              });\n          }\n          throw metadataError;\n        }\n\n        setSlotFiles((current) => ({ ...current, [slot]: null }));\n        toast.success(`${"${slot}"}: planilha compartilhada removida.`);\n        return;\n      }\n\n      const { data: sessionData } = await supabase.auth.getSession();\n      const userId = sessionData.session?.user?.id;\n      if (!userId) throw new Error("Sessão não encontrada.");\n\n      const { error: uploadError } = await supabase.storage\n        .from(PROGRAMACAO_IMPORT_BUCKET)\n        .upload(storagePath, file, {\n          contentType: file.type || XLSX_CONTENT_TYPE,\n          upsert: true,\n        });\n      if (uploadError) throw uploadError;\n\n      const now = new Date().toISOString();\n      const { error: metadataError } = await (supabase as any)\n        .from("programacao_importacoes")\n        .upsert(\n          {\n            slot,\n            filename: file.name,\n            storage_path: storagePath,\n            file_size: file.size,\n            uploaded_by: userId,\n            uploaded_at: now,\n            updated_at: now,\n          },\n          { onConflict: "slot" },\n        );\n      if (metadataError) throw metadataError;\n\n      setSlotFiles((current) => ({ ...current, [slot]: file }));\n      toast.success(`${"${slot}"}: planilha compartilhada com todos os usuários autorizados.`);\n    } catch (error: any) {\n      console.error(`[Programacao] Falha ao sincronizar ${"${slot}"}:`, error);\n      toast.error(error?.message || "Não foi possível sincronizar a planilha.");\n      await loadSharedSlotFiles(false);\n    } finally {\n      setSyncingSlot(null);\n    }\n  }, [loadSharedSlotFiles, slotFiles, syncingSlot]);`,
  "programacao persistent setSlot",
);

replaceOnce(
  programacao,
  '              description="Envie as planilhas de preventivas e confirme o tempo padrão por OS. A leitura e a distribuição existentes permanecem automáticas."\n',
  '              description="Envie as planilhas de preventivas e confirme o tempo padrão por OS. Os arquivos ficam compartilhados na nuvem e aparecem automaticamente para todos os usuários autorizados, em qualquer computador."\n',
  "programacao shared section copy",
);

replaceOnce(
  programacao,
  `                  {attachedCount === 0\n                    ? "Aguardando arquivos"\n                    : \`${"${attachedCount}"} de 3 grupos preparados\`}`, 
  `                  {loadingSharedFiles\n                    ? "Sincronizando nuvem"\n                    : attachedCount === 0\n                      ? "Aguardando arquivos"\n                      : \`${"${attachedCount}"} de 3 grupos compartilhados\`}`,
  "programacao shared badge",
);

replaceOnce(
  programacao,
  '                  Quando você gerar uma programação, a planilha será salva na nuvem da sua conta para download e impressão futura.\n',
  '                  Quando uma programação for gerada, a planilha ficará no histórico compartilhado para download e impressão por todos os usuários autorizados.\n',
  "programacao shared history copy",
);

replaceOnce(
  programacao,
  '              {file ? "Arquivo anexado" : "Aguardando arquivo"}\n',
  '              {file ? "Arquivo compartilhado" : "Aguardando arquivo"}\n',
  "programacao slot shared badge",
);

replaceOnce(
  programacao,
  '              <p className="mt-0.5 text-[9px] text-muted-foreground">Planilha pronta para processamento</p>\n',
  '              <p className="mt-0.5 text-[9px] text-muted-foreground">Sincronizada e disponível em outros usuários/computadores</p>\n',
  "programacao slot shared copy",
);

console.log("Shared programming patch applied successfully.");
