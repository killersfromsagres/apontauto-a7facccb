from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if old not in source:
        raise RuntimeError(f"Pattern not found ({label}) in {path}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


daily = "src/features/relatorio-diario/daily-execution-report.tsx"
programacao = "src/routes/_authenticated/programacao.tsx"

replace_once(
    daily,
    'const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";\n',
    'const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";\nconst ROWS_MIGRATED_KEY = "apontauto:relatorio-diario:programacao-cloud-migrated:v1";\n',
    "daily migration key",
)

replace_once(
    daily,
    '''  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
''',
    '''  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
''',
    "daily loading schedule state",
)

replace_once(
    daily,
    '''  }, []);

  useEffect(() => {
    const storedRows = mergeSchedules([], safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));
    setRows(storedRows);
    const storedTarget = Number(window.localStorage.getItem(TARGET_KEY) ?? "2");
    setTargetPerTeam(Number.isFinite(storedTarget) ? Math.min(10, Math.max(1, storedTarget)) : 2);
    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");
    void Promise.all([loadPortfolio(false), loadExecutions(false)]);
  }, [loadExecutions, loadPortfolio]);''',
    '''  }, []);

  const loadSharedSchedule = useCallback(async (notify = false, migrateLocal = false) => {
    setLoadingSchedule(true);
    const cachedRows = mergeSchedules(
      [],
      safeRead<ScheduledMaintenance[]>(ROWS_KEY, []),
    );

    try {
      const { data, error } = await (supabase as any)
        .from("relatorio_diario_programacao_rows")
        .select("payload,atividade_data")
        .order("atividade_data", { ascending: true })
        .limit(20000);

      if (error) throw error;

      let nextRows = mergeSchedules(
        [],
        ((data ?? []) as Array<{ payload?: ScheduledMaintenance | null }>)
          .map((record) => record.payload)
          .filter((row): row is ScheduledMaintenance => Boolean(row?.id && row?.date)),
      );

      const migrationDone = window.localStorage.getItem(ROWS_MIGRATED_KEY) === "1";
      if (!nextRows.length && migrateLocal && !migrationDone && cachedRows.length) {
        const { error: migrationError } = await (supabase as any).rpc(
          "save_relatorio_diario_programacao",
          { _rows: cachedRows, _replace: false },
        );
        if (migrationError) throw migrationError;
        nextRows = cachedRows;
        toast.success("Programação deste computador migrada para a base compartilhada.");
      }

      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");
      window.localStorage.setItem(ROWS_KEY, JSON.stringify(nextRows));
      setRows(nextRows);
      if (notify) {
        toast.success(
          nextRows.length
            ? `Programação compartilhada atualizada: ${nextRows.length} OS.`
            : "A programação compartilhada está vazia.",
        );
      }
      return nextRows;
    } catch (error: any) {
      console.error("[RelatorioDiario] Falha ao carregar programação compartilhada:", error);
      if (cachedRows.length) {
        setRows(cachedRows);
        if (notify) {
          toast.warning("Nuvem indisponível. Exibindo a última programação salva neste computador.");
        }
      } else if (notify) {
        toast.error(error?.message || "Não foi possível carregar a programação compartilhada.");
      }
      return null;
    } finally {
      setLoadingSchedule(false);
    }
  }, []);

  useEffect(() => {
    const cachedRows = mergeSchedules([], safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));
    setRows(cachedRows);
    const storedTarget = Number(window.localStorage.getItem(TARGET_KEY) ?? "2");
    setTargetPerTeam(Number.isFinite(storedTarget) ? Math.min(10, Math.max(1, storedTarget)) : 2);
    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");
    void Promise.all([
      loadSharedSchedule(false, true),
      loadPortfolio(false),
      loadExecutions(false),
    ]);
  }, [loadExecutions, loadPortfolio, loadSharedSchedule]);''',
    "daily shared loader and startup",
)

replace_once(
    daily,
    '''  useEffect(() => {
    const channel = supabase
      .channel("relatorio-diario-programacao-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corretiva_os" },
        () => void loadPortfolio(false),
      )
      .subscribe();

    const refreshExecutions = () => void loadExecutions(false);
    window.addEventListener("focus", refreshExecutions);

    return () => {
      window.removeEventListener("focus", refreshExecutions);
      void supabase.removeChannel(channel);
    };
  }, [loadExecutions, loadPortfolio]);''',
    '''  useEffect(() => {
    let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
    let executionTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshSharedSchedule = () => {
      if (scheduleTimer) clearTimeout(scheduleTimer);
      scheduleTimer = setTimeout(() => void loadSharedSchedule(false, false), 180);
    };
    const refreshExecutions = () => {
      if (executionTimer) clearTimeout(executionTimer);
      executionTimer = setTimeout(() => void loadExecutions(false), 120);
    };

    const channel = supabase
      .channel("relatorio-diario-sync-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corretiva_os" },
        () => void loadPortfolio(false),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "relatorio_diario_programacao_rows" },
        refreshSharedSchedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "relatorio_diario_execucoes" },
        refreshExecutions,
      )
      .subscribe();

    const refreshAll = () => {
      void loadSharedSchedule(false, false);
      void loadPortfolio(false);
      void loadExecutions(false);
    };
    window.addEventListener("focus", refreshAll);

    return () => {
      if (scheduleTimer) clearTimeout(scheduleTimer);
      if (executionTimer) clearTimeout(executionTimer);
      window.removeEventListener("focus", refreshAll);
      void supabase.removeChannel(channel);
    };
  }, [loadExecutions, loadPortfolio, loadSharedSchedule]);''',
    "daily realtime",
)

replace_once(
    daily,
    '''      setRows((current) =>
        shouldReplaceSchedule(current, imported)
          ? mergeSchedules([], imported)
          : mergeSchedules(current, imported),
      );

      const importedDates = Array.from(new Set(imported.map((row) => row.date))).sort();
      if (importedDates.length) setSelectedDate(importedDates[0]);
      toast.success(`${imported.length} OS da programação semanal carregadas.`);''',
    '''      const replaceCurrent = shouldReplaceSchedule(rows, imported);
      const nextRows = replaceCurrent
        ? mergeSchedules([], imported)
        : mergeSchedules(rows, imported);

      const { error: sharedError } = await (supabase as any).rpc(
        "save_relatorio_diario_programacao",
        { _rows: imported, _replace: replaceCurrent },
      );
      if (sharedError) {
        throw new Error(
          `A planilha foi lida, mas não pôde ser compartilhada: ${sharedError.message || "erro de sincronização"}.`,
        );
      }

      setRows(nextRows);
      window.localStorage.setItem(ROWS_KEY, JSON.stringify(nextRows));
      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");

      const importedDates = Array.from(new Set(imported.map((row) => row.date))).sort();
      if (importedDates.length) setSelectedDate(importedDates[0]);
      toast.success(`${imported.length} OS carregadas na programação compartilhada.`);''',
    "daily import persistence",
)

replace_once(
    daily,
    '''  function clearImportedBase() {
    if (!window.confirm("Limpar somente as planilhas semanais importadas desta tela? Os registros de conclusão permanecerão salvos no servidor.")) return;
    setRows([]);
    window.localStorage.removeItem(ROWS_KEY);
    toast.success("Programação importada removida desta tela.");
  }''',
    '''  async function clearImportedBase() {
    if (
      !window.confirm(
        "Limpar a programação semanal compartilhada? Ela será removida para todos os usuários e computadores com acesso ao Relatório Diário. Os registros de conclusão permanecerão salvos.",
      )
    ) return;

    setLoadingSchedule(true);
    try {
      const { error } = await (supabase as any).rpc(
        "save_relatorio_diario_programacao",
        { _rows: [], _replace: true },
      );
      if (error) throw error;
      setRows([]);
      window.localStorage.removeItem(ROWS_KEY);
      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");
      toast.success("Programação compartilhada removida para todos os usuários autorizados.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível limpar a programação compartilhada.");
    } finally {
      setLoadingSchedule(false);
    }
  }''',
    "daily clear shared",
)

replace_once(
    daily,
    '  const syncing = loadingPortfolio || loadingExecutions;\n',
    '  const syncing = loadingPortfolio || loadingExecutions || loadingSchedule;\n',
    "daily syncing state",
)

replace_once(
    daily,
    '                onClick={() => void Promise.all([loadPortfolio(true), loadExecutions(false)])}\n',
    '                onClick={() => void Promise.all([loadSharedSchedule(true, false), loadPortfolio(true), loadExecutions(false)])}\n',
    "daily update button",
)

replace_once(
    daily,
    '              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Planilhas .xlsx/.xls. A agenda é combinada com as corretivas abertas.</span>\n',
    '              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Planilhas .xlsx/.xls. A programação fica compartilhada na nuvem e aparece para todos os usuários autorizados.</span>\n',
    "daily shared copy",
)

replace_once(
    programacao,
    'import { cn } from "@/lib/utils";\n',
    'import { cn } from "@/lib/utils";\nimport { supabase } from "@/integrations/supabase/client";\n',
    "programacao supabase import",
)

replace_once(
    programacao,
    'const TITULO_PADRAO = "GRUPO GPS • SHERWIN WILLIAMS / DEMARCHI";\n',
    'const TITULO_PADRAO = "GRUPO GPS • SHERWIN WILLIAMS / DEMARCHI";\nconst PROGRAMACAO_IMPORT_BUCKET = "programacao-importacoes";\nconst XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";\nconst sharedImportPath = (slot: SlotId) => `shared/${slot}.xlsx`;\n',
    "programacao shared constants",
)

replace_once(
    programacao,
    '  const [historico, setHistorico] = useState<HistoricoItem[]>([]);\n',
    '  const [historico, setHistorico] = useState<HistoricoItem[]>([]);\n  const [loadingSharedFiles, setLoadingSharedFiles] = useState(false);\n  const [syncingSlot, setSyncingSlot] = useState<SlotId | null>(null);\n',
    "programacao sync states",
)

replace_once(
    programacao,
    '''  const reloadHistorico = useCallback(async () => {
    try {
      setHistorico(await listHistorico());
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => void reloadHistorico(), [reloadHistorico]);''',
    '''  const reloadHistorico = useCallback(async () => {
    try {
      setHistorico(await listHistorico());
    } catch (error) {
      console.error(error);
    }
  }, []);

  const loadSharedSlotFiles = useCallback(async (notify = false) => {
    setLoadingSharedFiles(true);
    try {
      const { data, error } = await (supabase as any)
        .from("programacao_importacoes")
        .select("slot,filename,storage_path,updated_at")
        .order("slot", { ascending: true });
      if (error) throw error;

      const next: Record<SlotId, File | null> = {
        CCH: null,
        REFRIG: null,
        ELETRICA: null,
      };

      for (const row of data ?? []) {
        const slot = String(row.slot ?? "") as SlotId;
        if (!SLOTS.some((item) => item.id === slot)) continue;
        const storagePath = String(row.storage_path ?? "");
        if (!storagePath) continue;

        const { data: blob, error: downloadError } = await supabase.storage
          .from(PROGRAMACAO_IMPORT_BUCKET)
          .download(storagePath);
        if (downloadError || !blob) {
          throw downloadError || new Error("Arquivo compartilhado não encontrado.");
        }

        const updatedAt = new Date(String(row.updated_at ?? "")).getTime();
        next[slot] = new File(
          [blob],
          String(row.filename || `${slot}.xlsx`),
          {
            type: blob.type || XLSX_CONTENT_TYPE,
            lastModified: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
          },
        );
      }

      setSlotFiles(next);
      if (notify) toast.success("Planilhas compartilhadas atualizadas.");
      return next;
    } catch (error: any) {
      console.error("[Programacao] Falha ao carregar planilhas compartilhadas:", error);
      if (notify) {
        toast.error(error?.message || "Não foi possível carregar as planilhas compartilhadas.");
      }
      return null;
    } finally {
      setLoadingSharedFiles(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([reloadHistorico(), loadSharedSlotFiles(false)]);
  }, [loadSharedSlotFiles, reloadHistorico]);

  useEffect(() => {
    let importTimer: ReturnType<typeof setTimeout> | null = null;
    let historyTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshImports = () => {
      if (importTimer) clearTimeout(importTimer);
      importTimer = setTimeout(() => void loadSharedSlotFiles(false), 180);
    };
    const refreshHistory = () => {
      if (historyTimer) clearTimeout(historyTimer);
      historyTimer = setTimeout(() => void reloadHistorico(), 180);
    };

    const channel = supabase
      .channel("programacao-compartilhada")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "programacao_importacoes" },
        refreshImports,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "programacao_arquivos" },
        refreshHistory,
      )
      .subscribe();

    const refreshAll = () => {
      void loadSharedSlotFiles(false);
      void reloadHistorico();
    };
    window.addEventListener("focus", refreshAll);

    return () => {
      if (importTimer) clearTimeout(importTimer);
      if (historyTimer) clearTimeout(historyTimer);
      window.removeEventListener("focus", refreshAll);
      void supabase.removeChannel(channel);
    };
  }, [loadSharedSlotFiles, reloadHistorico]);''',
    "programacao shared loader realtime",
)

replace_once(
    programacao,
    '''  const setSlot = useCallback((slot: SlotId, file: File | null) => {
    if (file && !file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Envie um arquivo .xlsx");
      return;
    }
    setSlotFiles((current) => ({ ...current, [slot]: file }));
  }, []);''',
    '''  const setSlot = useCallback(async (slot: SlotId, file: File | null) => {
    if (syncingSlot) {
      toast.info("Aguarde a sincronização da planilha atual.");
      return;
    }
    if (file && !file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Envie um arquivo .xlsx");
      return;
    }

    const storagePath = sharedImportPath(slot);
    const previousFile = slotFiles[slot];
    setSyncingSlot(slot);
    try {
      if (!file) {
        const { error: storageError } = await supabase.storage
          .from(PROGRAMACAO_IMPORT_BUCKET)
          .remove([storagePath]);
        if (storageError) throw storageError;

        const { error: metadataError } = await (supabase as any)
          .from("programacao_importacoes")
          .delete()
          .eq("slot", slot);
        if (metadataError) {
          if (previousFile) {
            await supabase.storage
              .from(PROGRAMACAO_IMPORT_BUCKET)
              .upload(storagePath, previousFile, {
                contentType: previousFile.type || XLSX_CONTENT_TYPE,
                upsert: true,
              });
          }
          throw metadataError;
        }

        setSlotFiles((current) => ({ ...current, [slot]: null }));
        toast.success(`${slot}: planilha compartilhada removida.`);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("Sessão não encontrada.");

      const { error: uploadError } = await supabase.storage
        .from(PROGRAMACAO_IMPORT_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || XLSX_CONTENT_TYPE,
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const now = new Date().toISOString();
      const { error: metadataError } = await (supabase as any)
        .from("programacao_importacoes")
        .upsert(
          {
            slot,
            filename: file.name,
            storage_path: storagePath,
            file_size: file.size,
            uploaded_by: userId,
            uploaded_at: now,
            updated_at: now,
          },
          { onConflict: "slot" },
        );
      if (metadataError) throw metadataError;

      setSlotFiles((current) => ({ ...current, [slot]: file }));
      toast.success(`${slot}: planilha compartilhada com todos os usuários autorizados.`);
    } catch (error: any) {
      console.error(`[Programacao] Falha ao sincronizar ${slot}:`, error);
      toast.error(error?.message || "Não foi possível sincronizar a planilha.");
      await loadSharedSlotFiles(false);
    } finally {
      setSyncingSlot(null);
    }
  }, [loadSharedSlotFiles, slotFiles, syncingSlot]);''',
    "programacao persistent setSlot",
)

replace_once(
    programacao,
    '              description="Envie as planilhas de preventivas e confirme o tempo padrão por OS. A leitura e a distribuição existentes permanecem automáticas."\n',
    '              description="Envie as planilhas de preventivas e confirme o tempo padrão por OS. Os arquivos ficam compartilhados na nuvem e aparecem automaticamente para todos os usuários autorizados, em qualquer computador."\n',
    "programacao shared section copy",
)

replace_once(
    programacao,
    '''                  {attachedCount === 0
                    ? "Aguardando arquivos"
                    : `${attachedCount} de 3 grupos preparados`}''',
    '''                  {loadingSharedFiles
                    ? "Sincronizando nuvem"
                    : attachedCount === 0
                      ? "Aguardando arquivos"
                      : `${attachedCount} de 3 grupos compartilhados`}''',
    "programacao shared badge",
)

replace_once(
    programacao,
    '                  Quando você gerar uma programação, a planilha será salva na nuvem da sua conta para download e impressão futura.\n',
    '                  Quando uma programação for gerada, a planilha ficará no histórico compartilhado para download e impressão por todos os usuários autorizados.\n',
    "programacao shared history copy",
)

replace_once(
    programacao,
    '              {file ? "Arquivo anexado" : "Aguardando arquivo"}\n',
    '              {file ? "Arquivo compartilhado" : "Aguardando arquivo"}\n',
    "programacao slot shared badge",
)

replace_once(
    programacao,
    '              <p className="mt-0.5 text-[9px] text-muted-foreground">Planilha pronta para processamento</p>\n',
    '              <p className="mt-0.5 text-[9px] text-muted-foreground">Sincronizada e disponível em outros usuários/computadores</p>\n',
    "programacao slot shared copy",
)

print("Shared programming patch applied successfully.")
