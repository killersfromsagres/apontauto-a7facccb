import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Save, Plus, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSettings, DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/configuracoes")({ component: Page });

function Page() {
  const [saved, setSaved] = useSettings();
  const [draft, setDraft] = useState<AppSettings>(saved);
  const [dirty, setDirty] = useState(false);

  // Sincroniza o rascunho quando as configurações reais chegam do backend
  // (o hook devolve DEFAULT_SETTINGS de forma síncrona e atualiza depois).
  useEffect(() => {
    if (!dirty) setDraft(saved);
  }, [saved, dirty]);

  const patch = (p: Partial<AppSettings>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...p }));
  };
  const patchHours = (p: Partial<AppSettings["workingHours"]>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, workingHours: { ...d.workingHours, ...p } }));
  };

  const commit = () => {
    setSaved(draft);
    setDirty(false);
    toast.success("Configurações salvas");
  };

  const reset = () => {
    setDraft(DEFAULT_SETTINGS);
    setSaved(DEFAULT_SETTINGS);
    setDirty(false);
    toast.success("Configurações restauradas para o padrão");
  };

  return (
    <PageShell
      title="Configurações"
      description="Regras de distribuição, prédios por equipe de refrigeração, palavras-chave de hidráulica e horário de trabalho."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" /> Restaurar padrão
          </Button>
          <Button onClick={commit}>
            <Save className="mr-2 h-4 w-4" /> Salvar
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Site permitido
          </h3>
          <div className="space-y-2">
            <Label>Nome do site (case-insensitive)</Label>
            <Input
              value={draft.siteAllowed}
              onChange={(e) => patch({ siteAllowed: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Linhas cujo site não contenha este texto serão descartadas no upload.
            </p>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Horário de trabalho
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <TimeField label="Manhã — início" value={draft.workingHours.morningStart}
              onChange={(v) => patchHours({ morningStart: v })} />
            <TimeField label="Manhã — fim" value={draft.workingHours.morningEnd}
              onChange={(v) => patchHours({ morningEnd: v })} />
            <TimeField label="Tarde — início" value={draft.workingHours.afternoonStart}
              onChange={(v) => patchHours({ afternoonStart: v })} />
            <TimeField label="Tarde — fim" value={draft.workingHours.afternoonEnd}
              onChange={(v) => patchHours({ afternoonEnd: v })} />
          </div>
          <Separator className="my-4" />
          <div className="space-y-2">
            <Label>Duração padrão por OS (minutos)</Label>
            <Input
              type="number"
              min={5}
              max={480}
              value={draft.defaultTaskMinutes}
              onChange={(e) => patch({ defaultTaskMinutes: Number(e.target.value) })}
            />
          </div>
        </GlassCard>

        <ListEditor
          title="Refrigeração 1"
          color="bg-emerald-500"
          items={draft.refrig1}
          onChange={(v) => patch({ refrig1: v })}
        />
        <ListEditor
          title="Refrigeração 2"
          color="bg-purple-500"
          items={draft.refrig2}
          onChange={(v) => patch({ refrig2: v })}
        />
        <ListEditor
          title="Refrigeração 3"
          color="bg-cyan-500"
          items={draft.refrig3}
          onChange={(v) => patch({ refrig3: v })}
        />
        <ListEditor
          title="Palavras-chave de Hidráulica"
          color="bg-orange-500"
          items={draft.hidraulicaKeywords}
          onChange={(v) => patch({ hidraulicaKeywords: v })}
          placeholder="ex: Bocas de Lobo"
        />
      </div>
    </PageShell>
  );
}

function TimeField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ListEditor({
  title, color, items, onChange, placeholder = "Adicionar item…",
}: {
  title: string; color: string; items: string[];
  onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (items.includes(v)) return;
    onChange([...items, v]);
    setInput("");
  };
  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} itens</span>
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
        />
        <Button variant="secondary" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Badge
            key={it}
            variant="secondary"
            className="gap-1 rounded-md py-1 pr-1 pl-2 text-xs"
          >
            {it}
            <button
              onClick={() => onChange(items.filter((x) => x !== it))}
              className="ml-1 rounded-sm hover:bg-background/60"
              aria-label={`Remover ${it}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground">Nenhum item.</span>
        )}
      </div>
    </GlassCard>
  );
}
