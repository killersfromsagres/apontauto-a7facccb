import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wind, Save, FileSpreadsheet, RefreshCw, Trash2, Search, Plus,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob } from "@/lib/download";
import {
  CHECKLIST_PMOC, MEDICOES, TIPOS_EQUIPAMENTO, TIPOS_SERVICO, FLUIDOS, STATUS_EQUIPAMENTO,
  type ChecklistState, type MedicoesState,
} from "@/lib/preventiva-ac/pmoc";
import { generatePmocWorkbook, type PmocRegistro } from "@/lib/preventiva-ac/export";

export const Route = createFileRoute("/_authenticated/preventiva-ac")({
  component: PreventivaAcPage,
  head: () => ({
    meta: [
      { title: "Preventiva AC (PMOC) — Apont Auto" },
      { name: "description", content: "Cadastro e execução de manutenção preventiva de ar-condicionado conforme PMOC." },
    ],
  }),
});

type Form = {
  tag: string;
  tipo_equipamento: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  capacidade_btu: string;
  fluido_refrigerante: string;
  quantidade_fluido: string;
  status_equipamento: string;
  ano_fabricacao: string;
  data_instalacao: string;
  predio: string;
  andar: string;
  local: string;
  ambiente: string;
  area_climatizada: string;
  ocupacao_max: string;
  fabricante: string;
  responsavel_tecnico: string;
  data_manutencao: string;
  tipo_servico: string;
  colaborador: string;
  observacoes: string;
};

const EMPTY_FORM: Form = {
  tag: "", tipo_equipamento: "", marca: "", modelo: "", numero_serie: "",
  capacidade_btu: "", fluido_refrigerante: "", quantidade_fluido: "",
  status_equipamento: "Operando normal",
  ano_fabricacao: "", data_instalacao: "",
  predio: "", andar: "", local: "", ambiente: "", area_climatizada: "", ocupacao_max: "",
  fabricante: "", responsavel_tecnico: "",
  data_manutencao: new Date().toISOString().slice(0, 10),
  tipo_servico: "Inspeção Inicial (Cadastro)",
  colaborador: "", observacoes: "",
};

function toNumOrNull(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && v.trim() !== "" ? n : null;
}

function PreventivaAcPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [medicoes, setMedicoes] = useState<MedicoesState>({});
  const [search, setSearch] = useState("");

  const update = <K extends keyof Form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: registros = [], isLoading, refetch } = useQuery({
    queryKey: ["preventiva-ac"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("preventiva_ac_registros")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.tag.trim()) throw new Error("TAG do equipamento é obrigatória.");
      const payload = {
        tag: form.tag.trim(),
        tipo_equipamento: form.tipo_equipamento || null,
        marca: form.marca || null,
        modelo: form.modelo || null,
        numero_serie: form.numero_serie || null,
        capacidade_btu: toNumOrNull(form.capacidade_btu),
        fluido_refrigerante: form.fluido_refrigerante || null,
        quantidade_fluido: form.quantidade_fluido || null,
        status_equipamento: form.status_equipamento || null,
        ano_fabricacao: toNumOrNull(form.ano_fabricacao),
        data_instalacao: form.data_instalacao || null,
        predio: form.predio || null,
        andar: form.andar || null,
        local: form.local || null,
        ambiente: form.ambiente || null,
        area_climatizada: toNumOrNull(form.area_climatizada),
        ocupacao_max: toNumOrNull(form.ocupacao_max),
        fabricante: form.fabricante || null,
        responsavel_tecnico: form.responsavel_tecnico || null,
        data_manutencao: form.data_manutencao || null,
        tipo_servico: form.tipo_servico || null,
        colaborador: form.colaborador || null,
        observacoes: form.observacoes || null,
        checklist,
        medicoes,
        criado_por: (await supabase.auth.getUser()).data.user?.id ?? null,
      };
      const { data, error } = await (supabase as any)
        .from("preventiva_ac_registros")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      toast.success("Registro salvo. Gerando planilha...");
      try {
        const blob = await generatePmocWorkbook([data as PmocRegistro]);
        downloadBlob(blob, `PMOC_${data.tag}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao gerar planilha");
      }
      setForm(EMPTY_FORM);
      setChecklist({});
      setMedicoes({});
      qc.invalidateQueries({ queryKey: ["preventiva-ac"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("preventiva_ac_registros").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro removido.");
      qc.invalidateQueries({ queryKey: ["preventiva-ac"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover."),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return registros;
    const q = search.toLowerCase();
    return registros.filter((r: any) =>
      [r.tag, r.marca, r.modelo, r.predio, r.local, r.ambiente]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [registros, search]);

  const exportAll = async () => {
    if (registros.length === 0) return toast.error("Nenhum registro para exportar.");
    const blob = await generatePmocWorkbook(registros as PmocRegistro[]);
    downloadBlob(blob, `PMOC_Consolidado_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Planilha consolidada gerada.");
  };

  const grupos = useMemo(() => {
    const m = new Map<string, typeof CHECKLIST_PMOC>();
    for (const it of CHECKLIST_PMOC) {
      if (!m.has(it.grupo)) m.set(it.grupo, [] as any);
      m.get(it.grupo)!.push(it);
    }
    return Array.from(m.entries());
  }, []);

  return (
    <PageShell
      title="Preventiva AC (PMOC)"
      description="Cadastro de equipamentos de ar-condicionado ausentes no sistema principal e execução da manutenção preventiva conforme PMOC (Lei 13.589/2018). Ao salvar, uma planilha é gerada para o responsável importar no sistema interno."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportAll}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar tudo
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        {/* ==== Formulário ==== */}
        <GlassCard className="p-4">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Plus className="h-4 w-4" /> Novo registro PMOC
          </h3>

          <Section title="Essenciais de campo">
            <p className="mb-3 text-xs text-muted-foreground">
              Preencha primeiro o que o técnico precisa em campo. Os demais dados podem ser complementados depois.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FieldText label="TAG *" value={form.tag} onChange={(v) => update("tag", v)} placeholder="Ex.: AC-B203-01" />
              <FieldText label="Modelo do equipamento" value={form.modelo} onChange={(v) => update("modelo", v)} placeholder="Ex.: LG S4-Q12JA3AC" />
              <FieldSelect
                label="Fluido refrigerante"
                value={form.fluido_refrigerante}
                onChange={(v) => update("fluido_refrigerante", v)}
                options={FLUIDOS as unknown as string[]}
              />
              <FieldText label="Quantidade / carga de fluido" value={form.quantidade_fluido} onChange={(v) => update("quantidade_fluido", v)} placeholder="Ex.: 1,2 kg" />
              <FieldSelect
                label="Status do equipamento"
                value={form.status_equipamento}
                onChange={(v) => update("status_equipamento", v)}
                options={STATUS_EQUIPAMENTO as unknown as string[]}
              />
              <FieldText label="Local / Ambiente" value={form.ambiente} onChange={(v) => update("ambiente", v)} placeholder="Onde o equipamento está" />
              <FieldText label="Data manutenção" type="date" value={form.data_manutencao} onChange={(v) => update("data_manutencao", v)} />
              <FieldSelect
                label="Tipo de serviço"
                value={form.tipo_servico}
                onChange={(v) => update("tipo_servico", v)}
                options={TIPOS_SERVICO as unknown as string[]}
              />
              <FieldText label="Técnico responsável" value={form.responsavel_tecnico} onChange={(v) => update("responsavel_tecnico", v)} placeholder="Nome + CREA" />
            </div>
          </Section>

          <Section title="Identificação do equipamento">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FieldSelect
                label="Tipo"
                value={form.tipo_equipamento}
                onChange={(v) => update("tipo_equipamento", v)}
                options={TIPOS_EQUIPAMENTO as unknown as string[]}
              />
              <FieldText label="Marca" value={form.marca} onChange={(v) => update("marca", v)} placeholder="Ex.: LG, Daikin, Carrier" />
              <FieldText label="Nº Série" value={form.numero_serie} onChange={(v) => update("numero_serie", v)} />
              <FieldText label="Capacidade (BTU/h)" value={form.capacidade_btu} onChange={(v) => update("capacidade_btu", v)} placeholder="Ex.: 12000" />
              <FieldText label="Ano fabricação" value={form.ano_fabricacao} onChange={(v) => update("ano_fabricacao", v)} placeholder="Ex.: 2022" />
              <FieldText label="Data instalação" type="date" value={form.data_instalacao} onChange={(v) => update("data_instalacao", v)} />
              <FieldText label="Fabricante" value={form.fabricante} onChange={(v) => update("fabricante", v)} />
            </div>
          </Section>

          <Section title="Localização">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FieldText label="Prédio" value={form.predio} onChange={(v) => update("predio", v)} />
              <FieldText label="Andar" value={form.andar} onChange={(v) => update("andar", v)} />
              <FieldText label="Local" value={form.local} onChange={(v) => update("local", v)} />
              <FieldText label="Ambiente" value={form.ambiente} onChange={(v) => update("ambiente", v)} />
              <FieldText label="Área climatizada (m²)" value={form.area_climatizada} onChange={(v) => update("area_climatizada", v)} />
              <FieldText label="Ocupação máxima" value={form.ocupacao_max} onChange={(v) => update("ocupacao_max", v)} />
            </div>
          </Section>

          <Section title="Execução">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FieldText label="Colaborador / equipe" value={form.colaborador} onChange={(v) => update("colaborador", v)} placeholder="Ex.: Refrigeração 2" />
            </div>
          </Section>

          <Section title="Checklist PMOC">
            <div className="space-y-4">
              {grupos.map(([grupo, itens]) => (
                <div key={grupo}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{grupo}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {itens.map((it) => (
                      <div key={it.key} className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
                        <span className="text-sm">{it.label}</span>
                        <Select
                          value={checklist[it.key] ?? ""}
                          onValueChange={(v) => setChecklist((c) => ({ ...c, [it.key]: v as any }))}
                        >
                          <SelectTrigger className="h-8 w-[140px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="conforme">Conforme</SelectItem>
                            <SelectItem value="nao_conforme">Não conforme</SelectItem>
                            <SelectItem value="na">N/A</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Medições">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MEDICOES.map((m) => (
                <div key={m.key}>
                  <Label>{m.label} ({m.unidade})</Label>
                  <Input
                    className="h-11"
                    value={medicoes[m.key] ?? ""}
                    onChange={(e) => setMedicoes((c) => ({ ...c, [m.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Observações">
            <Textarea rows={4} value={form.observacoes} onChange={(e) => update("observacoes", e.target.value)} />
          </Section>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Salvando..." : "Salvar e gerar planilha"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => { setForm(EMPTY_FORM); setChecklist({}); setMedicoes({}); }}
            >
              Limpar
            </Button>
          </div>
        </GlassCard>

        {/* ==== Lista ==== */}
        <GlassCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Wind className="h-4 w-4" /> Equipamentos cadastrados
            <Badge variant="secondary" className="ml-auto">{registros.length}</Badge>
          </h3>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              placeholder="Buscar TAG, marca, local..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
            )}
            {filtered.map((r: any) => (
              <div key={r.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.tag}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.marca, r.modelo].filter(Boolean).join(" ") || "—"} · {r.tipo_equipamento || "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.predio, r.andar, r.local, r.ambiente].filter(Boolean).join(" / ") || "Sem localização"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {r.tipo_servico ?? "—"} · {r.data_manutencao ?? "s/ data"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Baixar planilha"
                      onClick={async () => {
                        const blob = await generatePmocWorkbook([r as PmocRegistro]);
                        downloadBlob(blob, `PMOC_${r.tag}.xlsx`);
                      }}
                    >
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação removerá o cadastro PMOC de <b>{r.tag}</b>.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeMutation.mutate(r.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary/80">{title}</p>
      {children}
    </div>
  );
}

function FieldText({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type}
        className="h-11"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FieldSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11">
          <SelectValue placeholder="Selecione..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
