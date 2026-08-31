import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Package,
  RefreshCw,
  Search,
  FileSpreadsheet,
  BrainCircuit,
  Loader2,
  PencilLine,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { processarDescricaoPecaIA } from "@/lib/materiais/ia.functions";
import { exportComprasPremiumExcel } from "@/lib/materiais/compras-premium-excel";
import {
  loadMaterialRequestPhotos,
  materialPhotoKey,
  type MaterialPhotosByOs,
} from "@/lib/materiais/material-request-photos";
import {
  MaterialRequestEditDialog,
  type EditableMaterialRequest,
} from "@/components/materiais/material-request-edit-dialog";
import { MaterialRequestPhotoGallery } from "@/components/materiais/material-request-photo-gallery";

export const Route = createFileRoute("/_authenticated/corretiva-pecas-status")({
  component: CentralMateriaisUnificadaPage,
  head: () => ({
    meta: [
      { title: "Central Unificada de Materiais · Apont Auto" },
      { property: "og:title", content: "Central Unificada de Materiais" },
    ],
  }),
});

function CentralMateriaisUnificadaPage() {
  const [pecas, setPecas] = useState<any[]>([]);
  const [osById, setOsById] = useState<Map<string, any>>(new Map());
  const [photosByOs, setPhotosByOs] = useState<MaterialPhotosByOs>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fOrigem, setFOrigem] = useState<"todas" | "refrigeracao" | "corretiva">("todas");
  const [editingRequest, setEditingRequest] = useState<EditableMaterialRequest | null>(null);

  const processIA = useServerFn(processarDescricaoPecaIA);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([
        supabase.from("refrigeracao_pecas").select("*").order("created_at", { ascending: false }),
        supabase.from("corretiva_pecas").select("*").order("created_at", { ascending: false }),
      ]);

      const rData = (rRes.data || []).map((p) => ({ ...p, origem: "refrigeracao" }));
      const cData = (cRes.data || []).map((p) => ({ ...p, origem: "corretiva" }));
      const all = [...rData, ...cData].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setPecas(all);

      const rIds = Array.from(new Set(rData.map((p) => p.os_id).filter(Boolean))) as string[];
      const cIds = Array.from(new Set(cData.map((p) => p.os_id).filter(Boolean))) as string[];

      const [rOs, cOs, photoMap] = await Promise.all([
        rIds.length ? supabase.from("refrigeracao_os").select("*").in("id", rIds) : { data: [] },
        cIds.length ? supabase.from("corretiva_os").select("*").in("id", cIds) : { data: [] },
        loadMaterialRequestPhotos(rIds, cIds),
      ]);

      const map = new Map();
      (rOs.data || []).forEach((o) => map.set(o.id, { ...o, origem: "refrigeracao" }));
      (cOs.data || []).forEach((o) => map.set(o.id, { ...o, origem: "corretiva" }));
      setOsById(map);
      setPhotosByOs(photoMap);
    } catch (err: any) {
      toast.error("Erro ao carregar materiais: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return pecas.filter((p) => {
      if (fOrigem !== "todas" && p.origem !== fOrigem) return false;
      const os = osById.get(p.os_id);
      return (
        !query ||
        p.descricao?.toLowerCase().includes(query) ||
        os?.numero_os?.toLowerCase().includes(query) ||
        os?.nome_os?.toLowerCase().includes(query) ||
        os?.predio?.toLowerCase().includes(query)
      );
    });
  }, [pecas, search, fOrigem, osById]);

  const exportExcel = async () => {
    const toastId = toast.loading("Preparando planilha premium de compras...");
    try {
      await exportComprasPremiumExcel(filtered, osById);
      toast.success("Planilha premium de compras exportada!", { id: toastId });
    } catch (error) {
      console.error("Erro ao exportar compras:", error);
      toast.error("Não foi possível gerar a planilha de compras.", { id: toastId });
    }
  };

  const handleMaterialSaved = (updated: EditableMaterialRequest) => {
    setPecas((current) =>
      current.map((item) =>
        item.id === updated.id && item.origem === updated.origem
          ? { ...item, descricao: updated.descricao, quantidade: updated.quantidade }
          : item,
      ),
    );
    setEditingRequest(updated);
  };

  const editingOs = editingRequest ? osById.get(editingRequest.os_id) : null;

  return (
    <PageShell
      title="Central Unificada de Materiais"
      description="Visão consolidada de todas as peças solicitadas em Refrigeração e Corretiva."
      actions={
        <div className="flex gap-2">
          <Button variant="glass" size="sm" onClick={exportExcel} disabled={loading || !filtered.length}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
            Exportar compras
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <GlassCard className="p-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por peça, OS, prédio..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 pl-9"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
              <Button
                variant={fOrigem === "todas" ? "secondary" : "glass"}
                onClick={() => setFOrigem("todas")}
                size="sm"
                className="shrink-0"
              >
                Todas
              </Button>
              <Button
                variant={fOrigem === "refrigeracao" ? "secondary" : "glass"}
                onClick={() => setFOrigem("refrigeracao")}
                size="sm"
                className="shrink-0"
              >
                Refrigeração
              </Button>
              <Button
                variant={fOrigem === "corretiva" ? "secondary" : "glass"}
                onClick={() => setFOrigem("corretiva")}
                size="sm"
                className="shrink-0"
              >
                Corretiva
              </Button>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="mb-6 border-primary/20 bg-primary/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Agente IA de Processamento</h3>
              <p className="text-xs text-muted-foreground">
                O agente analisa as descrições e separa itens/quantidades automaticamente.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <Input
                id="ia-input"
                placeholder="Ex: 5 lampadas led, 2 motores weg, 10m cabo 2.5mm"
                className="h-12 border-white/10 bg-white/5"
              />
            </div>
            <Button
              className="premium h-12 gap-2 px-8 shadow-lg"
              onClick={async () => {
                const input = document.getElementById("ia-input") as HTMLInputElement;
                if (!input.value) return toast.error("Digite algo para a IA analisar");

                const toastId = toast.loading("Agente IA processando...");
                try {
                  const { items } = await processIA({ data: { descricao: input.value } });
                  toast.success(`IA extraiu ${items.length} itens com sucesso!`, { id: toastId });
                  console.log("[IA Results]", items);
                  input.value = "";
                  await loadData();
                } catch (error) {
                  console.error("[CentralMateriais] Erro no processamento da IA:", error);
                  toast.error("Erro no processamento da IA", { id: toastId });
                }
              }}
            >
              <BrainCircuit className="h-4 w-4" />
              Processar Descrição
            </Button>
          </div>

          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase text-primary/70">Exemplos que eu entendo:</p>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="cursor-pointer text-[9px] opacity-70 hover:opacity-100"
                onClick={() =>
                  ((document.getElementById("ia-input") as HTMLInputElement).value = "10 lampadas, 2 reatores")
                }
              >
                &quot;10 lampadas, 2 reatores&quot;
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer text-[9px] opacity-70 hover:opacity-100"
                onClick={() =>
                  ((document.getElementById("ia-input") as HTMLInputElement).value = "Motor WEG x 1, Correia A32 x 4")
                }
              >
                &quot;Motor WEG x 1, Correia A32 x 4&quot;
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer text-[9px] opacity-70 hover:opacity-100"
                onClick={() =>
                  ((document.getElementById("ia-input") as HTMLInputElement).value = "Parafuso (20 unidades)")
                }
              >
                &quot;Parafuso (20 unidades)&quot;
              </Badge>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-10 text-center">
            <Package className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" />
            <p className="font-semibold">Nenhuma solicitação encontrada</p>
            <p className="mt-1 text-sm text-muted-foreground">Ajuste a busca ou o filtro de origem para visualizar materiais.</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const os = osById.get(p.os_id);
              const origem = p.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
              const photos = photosByOs.get(materialPhotoKey(origem, p.os_id)) || [];

              return (
                <GlassCard
                  key={`${p.origem}-${p.id}`}
                  className="group p-4 transition-all hover:border-emerald-500/15 hover:bg-white/5"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold uppercase",
                            p.origem === "refrigeracao"
                              ? "border-sky-500/50 text-sky-400"
                              : "border-orange-500/50 text-orange-400",
                          )}
                        >
                          {p.origem === "refrigeracao" ? "Refrigeração" : "Corretiva"}
                        </Badge>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          OS {os?.numero_os || "—"}
                        </Badge>
                        {photos.length > 0 && (
                          <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-[10px] text-sky-300">
                            {photos.length} {photos.length === 1 ? "foto anexada" : "fotos anexadas"}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(p.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>

                      <div className="flex items-start gap-3">
                        <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary/70" />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-lg font-bold leading-tight">{p.descricao}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {os?.predio} · {os?.andar} · {os?.local}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium italic text-primary/60">
                            Solicitante: {os?.solicitante || "Não informado"}
                          </p>

                          <MaterialRequestPhotoGallery
                            photos={photos}
                            osNumber={os?.numero_os}
                            materialDescription={p.descricao}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch md:shrink-0">
                      <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/5 p-3">
                        <div className="border-r border-white/10 px-4 text-center">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Qtd</p>
                          <p className="text-2xl font-black text-white">{p.quantidade || 1}</p>
                        </div>
                        <div className="min-w-28 text-right">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Equipe</p>
                          <p className="whitespace-nowrap font-bold text-white">{os?.equipe || "—"}</p>
                          <Badge
                            variant="outline"
                            className="mt-1 border-emerald-500/20 bg-emerald-500/10 text-[9px] text-emerald-400"
                          >
                            IA: Identificado
                          </Badge>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => setEditingRequest(p as EditableMaterialRequest)}
                        className="h-auto min-h-12 gap-2 border-emerald-500/20 bg-emerald-500/10 px-4 text-emerald-200 shadow-sm transition-all hover:border-emerald-400/40 hover:bg-emerald-500/20 hover:text-white sm:min-h-full"
                        title="Editar descrição e quantidade desta solicitação"
                      >
                        <PencilLine className="h-4 w-4" />
                        Editar solicitação
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      <MaterialRequestEditDialog
        request={editingRequest}
        open={Boolean(editingRequest)}
        osNumber={editingOs?.numero_os}
        onOpenChange={(open) => {
          if (!open) setEditingRequest(null);
        }}
        onSaved={handleMaterialSaved}
      />
    </PageShell>
  );
}
