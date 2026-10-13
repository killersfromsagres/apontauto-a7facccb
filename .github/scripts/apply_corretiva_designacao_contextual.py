from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho, encontrado {count}\n--- trecho ---\n{old}")
    file.write_text(text.replace(old, new, 1))


# 1) Agente técnico: entende abreviações operacionais como "verificar o AR".
replace_once(
    "src/lib/corretiva/technical-domain-agent.ts",
    '''const ELECTRICAL_WIRING_REQUEST =
  /\\b(organizacao|organizar|adequacao|adequar|arrumacao|arrumar|fixacao|fixar|canalizar|passagem)(?:\\s+[a-z0-9]+){0,6}\\s+(fios?|cabos?|fiacao|cabeamento)\\b|\\b(fios?|cabos?|fiacao|cabeamento)(?:\\s+[a-z0-9]+){0,5}\\s+(tomadas?|energia|eletric[oa]s?|impressoras?|computadores?)\\b/;

const SHOWER_HYDRAULIC =''',
    '''const ELECTRICAL_WIRING_REQUEST =
  /\\b(organizacao|organizar|adequacao|adequar|arrumacao|arrumar|fixacao|fixar|canalizar|passagem)(?:\\s+[a-z0-9]+){0,6}\\s+(fios?|cabos?|fiacao|cabeamento)\\b|\\b(fios?|cabos?|fiacao|cabeamento)(?:\\s+[a-z0-9]+){0,5}\\s+(tomadas?|energia|eletric[oa]s?|impressoras?|computadores?)\\b/;

// Em chamados operacionais, "AR" costuma ser abreviação de ar-condicionado.
// A abreviação isolada só é considerada HVAC quando aparece ligada a uma ação
// de manutenção ou a um sintoma típico, evitando falsos positivos por texto genérico.
const HVAC_SHORT_REQUEST =
  /\\b(verificar|verificacao|avaliar|avaliacao|checar|inspecionar|inspecao|manutencao|reparar|reparo|consertar|ajustar|ajuste|regular|limpar|limpeza|higienizar|higienizacao)(?:\\s+(?:o|a|do|da|no|na))?(?:\\s+[a-z0-9]+){0,4}\\s+(?:ar|a c)\\b|\\b(?:ar|a c)\\b(?:\\s+[a-z0-9]+){0,5}\\s+(?:nao gela|nao esta gelando|sem gelar|quente|fraco|barulho|ruido|vazando|pingando|nao liga|nao funciona|sem funcionar|parou|desligando|defeito|problema)\\b/;

const SHOWER_HYDRAULIC =''',
)

replace_once(
    "src/lib/corretiva/technical-domain-agent.ts",
    'const hasHvac = HVAC_OBJECT.test(primaryText);',
    'const hasHvac = HVAC_OBJECT.test(primaryText) || HVAC_SHORT_REQUEST.test(primaryText);',
)

replace_once(
    "src/lib/corretiva/technical-domain-agent.ts",
    '''  const hasElectricalHardRequest = ELECTRICAL_HARD_REQUEST.test(primaryText);

  // Regras de domínio "donas" do chamado.''',
    '''  const hasElectricalHardRequest = ELECTRICAL_HARD_REQUEST.test(primaryText);

  if (HVAC_SHORT_REQUEST.test(primaryText)) {
    scores.Refrigeração += 220;
    scores.Civil = Math.min(scores.Civil, 24);
    scores.Hidráulica = Math.min(scores.Hidráulica, 30);
    scores.Elétrica = Math.min(scores.Elétrica, 35);
    evidence.unshift("agente técnico: abreviação AR com contexto de climatização");
  }

  // Regras de domínio "donas" do chamado.''',
)

# 2) Importação: segunda leitura por IA somente nos casos ambíguos/sem sinal.
replace_once(
    "src/lib/corretiva/preventiva-import.ts",
    '''import { analyzeCorrectiveOrder } from "@/lib/corretiva/designation-agent";
import { supabase } from "@/integrations/supabase/client";''',
    '''import { analyzeCorrectiveOrder } from "@/lib/corretiva/designation-agent";
import { classifyAmbiguousCorrectiveOrdersWithAi } from "@/lib/corretiva/designation-ai.functions";
import { supabase } from "@/integrations/supabase/client";''',
)

replace_once(
    "src/lib/corretiva/preventiva-import.ts",
    '''export type CorretivaRow = CorretivaOsImport & { tipo: string; equipe: string };

/**
 * Resolve a equipe de uma Corretiva importada usando TODOS os campos disponíveis.''',
    '''export type CorretivaRow = CorretivaOsImport & { tipo: string; equipe: string };

const IMPORT_AI_BATCH_SIZE = 24;

/**
 * Refina apenas os casos que o motor técnico local considerou ambíguos ou de
 * baixa confiança. A descrição completa continua sendo lida localmente; a IA
 * funciona como segunda opinião e nunca substitui uma evidência técnica decisiva.
 */
export async function refineImportedCorrectiveRowsWithAi(
  rows: CorretivaRow[],
): Promise<CorretivaRow[]> {
  const candidates = rows
    .map((row, index) => ({
      index,
      row,
      analysis: analyzeCorrectiveOrder({
        nome_os: row.nome_os,
        equipamento: row.equipamento,
        ativo: row.ativo,
        local: row.local,
        predio: row.predio,
        andar: row.andar,
        solicitante: row.solicitante,
        equipe: row.equipe,
      }),
    }))
    .filter(
      ({ analysis }) =>
        !analysis.hasSignal || analysis.ambiguo || analysis.confianca === "baixa",
    );

  if (candidates.length === 0) return rows;

  const decisions = new Map<number, string>();

  for (let start = 0; start < candidates.length; start += IMPORT_AI_BATCH_SIZE) {
    const batch = candidates.slice(start, start + IMPORT_AI_BATCH_SIZE);
    try {
      const response = await classifyAmbiguousCorrectiveOrdersWithAi({
        data: {
          rows: batch.map(({ index, row }) => ({
            id: String(index),
            numero_os: row.numero_os,
            nome_os: row.nome_os,
            equipamento: row.equipamento,
            ativo: row.ativo,
            local: row.local,
            predio: row.predio,
            andar: row.andar,
            solicitante: row.solicitante,
            equipe: row.equipe,
          })),
        },
      });

      for (const decision of response.decisions) {
        const index = Number(decision.id);
        if (
          Number.isInteger(index) &&
          decision.equipe &&
          decision.confianca !== "baixa"
        ) {
          decisions.set(index, decision.equipe);
        }
      }
    } catch (error) {
      console.warn(
        "[Import] Segunda leitura por IA indisponível; mantendo classificação técnica local:",
        error,
      );
      break;
    }
  }

  if (decisions.size === 0) return rows;
  return rows.map((row, index) => {
    const equipe = decisions.get(index);
    return equipe ? { ...row, equipe } : row;
  });
}

/**
 * Resolve a equipe de uma Corretiva importada usando TODOS os campos disponíveis.''',
)

# 3) Dialog de importação: usa a segunda leitura automaticamente ao importar Corretivas.
replace_once(
    "src/components/corretiva/preventiva-import-dialog.tsx",
    '''  EQUIPES_PREVENTIVA,
  type PreventivaRow,
  type CorretivaRow,
} from "@/lib/corretiva/preventiva-import";''',
    '''  EQUIPES_PREVENTIVA,
  refineImportedCorrectiveRowsWithAi,
  type PreventivaRow,
  type CorretivaRow,
} from "@/lib/corretiva/preventiva-import";''',
)

replace_once(
    "src/components/corretiva/preventiva-import-dialog.tsx",
    '''      const parsed =
        mode === "corretiva" || mode === "backorder-mensal"
          ? await lerCorretivaFile(f)
          : await lerPreventivaFile(f);
      if (parsed.length === 0) toast.warning("Nenhuma linha válida encontrada.");
      else toast.success(`${parsed.length} ${label} separadas automaticamente por equipe.`);
      setRows(parsed);''',
    '''      const parsedBase =
        mode === "corretiva" || mode === "backorder-mensal"
          ? await lerCorretivaFile(f)
          : await lerPreventivaFile(f);
      const parsed =
        mode === "corretiva"
          ? await refineImportedCorrectiveRowsWithAi(parsedBase as CorretivaRow[])
          : parsedBase;
      if (parsed.length === 0) toast.warning("Nenhuma linha válida encontrada.");
      else
        toast.success(
          `${parsed.length} ${label} classificadas por descrição, equipamento e contexto.`,
        );
      setRows(parsed);''',
)

replace_once(
    "src/components/corretiva/preventiva-import-dialog.tsx",
    '''                  Novas OS são separadas automaticamente por equipe. Ao atualizar uma planilha já
                  importada, a equipe atualmente designada no sistema é preservada para cada OS,
                  evitando perder correções e realocações feitas anteriormente.''',
    '''                  Novas OS são classificadas lendo a descrição completa, equipamento, ativo e
                  contexto do chamado; casos ambíguos recebem uma segunda leitura automática. Ao
                  atualizar uma planilha já importada, a equipe atualmente designada no sistema é
                  preservada para cada OS, evitando perder correções e realocações feitas anteriormente.''',
)

# 4) Reclassificação manual: grava de forma confirmada e não recarrega/fecha a tela.
replace_once(
    "src/components/corretiva/os-details-dialog.tsx",
    '''  onClose: () => void;
  onUpdate: () => void;
}''',
    '''  onClose: () => void;
  onUpdate: (patch?: Record<string, unknown>) => void;
}''',
)

replace_once(
    "src/components/corretiva/os-details-dialog.tsx",
    '''const MAX_MATERIAL_PHOTOS = 8;
const MAX_MATERIAL_PHOTO_SIZE = 10 * 1024 * 1024;

const TEAM_OPTIONS = [''',
    '''const MAX_MATERIAL_PHOTOS = 8;
const MAX_MATERIAL_PHOTO_SIZE = 10 * 1024 * 1024;

function isTransientConnectionError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown } | null)?.message ?? error ?? "");
  return (
    error instanceof TypeError ||
    /(failed to fetch|network|fetch error|timeout|timed out|connection|offline)/i.test(message)
  );
}

const TEAM_OPTIONS = [''',
)

replace_once(
    "src/components/corretiva/os-details-dialog.tsx",
    '''  const [observacao, setObservacao] = useState(os.observacao_conclusao || "");
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);''',
    '''  const [observacao, setObservacao] = useState(os.observacao_conclusao || "");
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [reclassifyingTeam, setReclassifyingTeam] = useState<string | null>(null);''',
)

replace_once(
    "src/components/corretiva/os-details-dialog.tsx",
    '''  const handleReclassificar = async (novaEquipe: string) => {
    if (loading) return;

    setLoading(true);
    const toastId = toast.loading(`Reclassificando para ${novaEquipe}...`);

    try {
      const { outboxAdd, updateCachedOs } = await import("@/lib/corretiva/db");
      await outboxAdd({
        id: `status:${os.id}:equipe:${crypto.randomUUID()}`,
        kind: "status",
        osId: os.id,
        numeroOs: os.numero_os,
        payload: { equipe: novaEquipe },
        createdAt: Date.now(),
        attempts: 0,
      });
      await updateCachedOs(os.id, {
        equipe: novaEquipe,
        updated_at: new Date().toISOString(),
      });

      const syncResult = await syncBestEffort();
      if (syncResult && syncResult.failed === 0) {
        toast.success(`OS reclassificada para ${novaEquipe}`, { id: toastId });
      } else {
        toast.success(`Reclassificação para ${novaEquipe} protegida e aguardando sincronização.`, {
          id: toastId,
        });
      }

      if (onUpdate) onUpdate();
      setTimeout(() => onClose(), 350);
    } catch (error: any) {
      console.error("[CorretivaReclassificar] Erro ao salvar localmente:", error);
      toast.error(`Erro ao reclassificar: ${error.message || "Tente novamente"}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };''',
    '''  const handleReclassificar = async (novaEquipe: string) => {
    if (loading || reclassifyingTeam || novaEquipe === os.equipe) return;

    setReclassifyingTeam(novaEquipe);
    const toastId = toast.loading(`Reclassificando para ${novaEquipe}...`);
    const updatedAt = new Date().toISOString();

    try {
      const { outboxAdd, updateCachedOs } = await import("@/lib/corretiva/db");
      let queuedForSync = !navigator.onLine;

      if (!queuedForSync) {
        const { data: persisted, error } = await supabase
          .from("corretiva_os")
          .update({ equipe: novaEquipe, updated_at: updatedAt } as any)
          .eq("id", os.id)
          .select("id, equipe")
          .maybeSingle();

        if (error) {
          if (isTransientConnectionError(error)) queuedForSync = true;
          else throw error;
        } else if (!persisted) {
          throw new Error(
            "O banco não confirmou a reclassificação. Verifique sua permissão para alterar a equipe.",
          );
        } else if (String((persisted as any).equipe ?? "") !== novaEquipe) {
          throw new Error("O banco retornou uma equipe diferente da selecionada.");
        }
      }

      if (queuedForSync) {
        await outboxAdd({
          id: `status:${os.id}:equipe:${crypto.randomUUID()}`,
          kind: "status",
          osId: os.id,
          numeroOs: os.numero_os,
          payload: { equipe: novaEquipe },
          createdAt: Date.now(),
          attempts: 0,
        });
      }

      await updateCachedOs(os.id, {
        equipe: novaEquipe,
        updated_at: updatedAt,
      });

      // Atualiza somente a OS aberta no estado da página. Não chama loadData(),
      // não move o usuário para o primeiro chamado e não fecha o modal.
      onUpdate({ equipe: novaEquipe, updated_at: updatedAt });

      toast.success(
        queuedForSync
          ? `Reclassificação para ${novaEquipe} salva neste aparelho e aguardando sincronização.`
          : `OS reclassificada para ${novaEquipe}.`,
        { id: toastId },
      );
    } catch (error: any) {
      console.error("[CorretivaReclassificar] Erro ao persistir equipe:", error);
      toast.error(`Erro ao reclassificar: ${error.message || "Tente novamente"}`, { id: toastId });
    } finally {
      setReclassifyingTeam(null);
    }
  };''',
)

replace_once(
    "src/components/corretiva/os-details-dialog.tsx",
    '''                    <DropdownMenuTrigger
                      asChild
                      disabled={!os?.isAdmin && !os?.allowedMenus?.includes("reclassificar-equipe")}
                    >''',
    '''                    <DropdownMenuTrigger
                      asChild
                      disabled={
                        Boolean(reclassifyingTeam) ||
                        (!os?.isAdmin && !os?.allowedMenus?.includes("reclassificar-equipe"))
                      }
                    >''',
)

replace_once(
    "src/components/corretiva/os-details-dialog.tsx",
    '''                      >
                        <LayoutGrid className="mr-1.5 h-3.5 w-3.5 sm:mr-2" />
                        {os.equipe || "Não definida"}
                      </Button>''',
    '''                      >
                        {reclassifyingTeam ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin sm:mr-2" />
                        ) : (
                          <LayoutGrid className="mr-1.5 h-3.5 w-3.5 sm:mr-2" />
                        )}
                        {reclassifyingTeam ? "Salvando..." : os.equipe || "Não definida"}
                      </Button>''',
)

replace_once(
    "src/components/corretiva/os-details-dialog.tsx",
    '''                        <DropdownMenuItem
                          key={team.name}
                          onClick={() => handleReclassificar(team.name)}
                          className={cn(''',
    '''                        <DropdownMenuItem
                          key={team.name}
                          onSelect={() => void handleReclassificar(team.name)}
                          disabled={Boolean(reclassifyingTeam) || os.equipe === team.name}
                          className={cn(''',
)

# 5) A página recebe patches locais sem recarregar a lista inteira.
replace_once(
    "src/routes/_authenticated/corretiva-novo.tsx",
    '''  const navigateSelectedOs = (direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= filtered.length) return;
    setSelectedOs(filtered[nextIndex]);
  };

  const handleReturnToProgrammingQueue = async (''',
    '''  const navigateSelectedOs = (direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= filtered.length) return;
    setSelectedOs(filtered[nextIndex]);
  };

  const handleSelectedOsUpdate = (patch?: Record<string, unknown>) => {
    if (!patch) {
      void loadData();
      return;
    }

    const selectedId = selectedOs?.id;
    if (!selectedId) return;

    setOsList((current) =>
      current.map((item) =>
        item.id === selectedId ? { ...item, ...patch } : item,
      ),
    );
    setSelectedOs((current: any) =>
      current?.id === selectedId ? { ...current, ...patch } : current,
    );
  };

  const handleReturnToProgrammingQueue = async (''',
)

replace_once(
    "src/routes/_authenticated/corretiva-novo.tsx",
    '''          onClose={() => setSelectedOs(null)}
          onUpdate={loadData}
        />''',
    '''          onClose={() => setSelectedOs(null)}
          onUpdate={handleSelectedOsUpdate}
        />''',
)

# 6) Regressões automatizadas para o caso real reportado.
replace_once(
    "src/lib/corretiva/technical-domain-agent.test.ts",
    '''  it("identifica troca de iluminação como Elétrica mesmo se a equipe atual for Civil", () => {''',
    '''  it('interpreta "verificar o AR" como Refrigeração mesmo se vier como Civil', () => {
    const result = analyzeCorrectiveTechnicalDomain({
      nome_os: "Favor verificar o AR da sala administrativa",
      local: "Sala administrativa",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Refrigeração");
    expect(result.decisive).toBe(true);
    expect(result.scores.Refrigeração).toBeGreaterThan(result.scores.Civil);
  });

  it("identifica troca de iluminação como Elétrica mesmo se a equipe atual for Civil", () => {''',
)

replace_once(
    "src/lib/corretiva/preventiva-import.test.ts",
    '''  it("corrige equipe Civil da planilha quando a OS é de Refrigeração", () => {''',
    '''  it('corrige Civil quando a descrição operacional pede "verificar o AR"', () => {
    expect(
      resolveImportedCorrectiveTeam(
        row({
          equipe: "Civil",
          nome_os: "Verificar o AR da sala de reunião",
        }),
      ),
    ).toBe("Refrigeração");
  });

  it("corrige equipe Civil da planilha quando a OS é de Refrigeração", () => {''',
)

print("Correções de designação contextual aplicadas com sucesso.")
