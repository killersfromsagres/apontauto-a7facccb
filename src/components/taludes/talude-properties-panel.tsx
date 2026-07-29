import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  updateMarcacao,
  type TaludeMap,
  type TaludeMarcacao,
} from "@/lib/taludes/api";
import { formatArea, formatLength } from "@/lib/taludes/geometry";
import { medidas, scaleOf } from "@/lib/taludes/export";

const RISCOS = ["Baixo", "Médio", "Alto", "Crítico"];
const ESTADOS = ["Estável", "Em observação", "Em intervenção", "Instável", "Interditado"];
const SOLOS = ["Argiloso", "Arenoso", "Siltoso", "Rochoso", "Aterro", "Misto"];
const VEGETACOES = ["Exposto", "Gramínea", "Arbustiva", "Arbórea", "Mista"];

export const CORES_TALUDE = [
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

export function TaludePropertiesPanel({
  map,
  marcacao,
}: {
  map: TaludeMap;
  marcacao: TaludeMarcacao;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(marcacao);

  useEffect(() => setForm(marcacao), [marcacao]);

  const med = useMemo(() => medidas(map, marcacao), [map, marcacao]);
  const calibrado = scaleOf(map) != null;

  const save = useMutation({
    mutationFn: async () => {
      const { id, map_id: _m, owner_id: _o, created_at: _c, updated_at: _u, ...patch } = form;
      void _m;
      void _o;
      void _c;
      void _u;
      await updateMarcacao(id, patch);
    },
    onSuccess: () => {
      toast.success("Dados do talude salvos");
      qc.invalidateQueries({ queryKey: ["talude_marcacoes", map.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof TaludeMarcacao>(k: K, v: TaludeMarcacao[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const txt = (k: keyof TaludeMarcacao) => (String(form[k] ?? "") as string);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Talude {form.numero}</Badge>
        {calibrado ? (
          <span className="text-xs text-muted-foreground">
            {med.areaM2 != null ? formatArea(med.areaM2) : "—"} ·{" "}
            {med.perimetroM != null ? formatLength(med.perimetroM) : "—"}
          </span>
        ) : (
          <span className="text-xs text-amber-500">Mapa não calibrado — sem área/perímetro</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Código">
          <Input value={txt("codigo")} onChange={(e) => set("codigo", e.target.value)} />
        </Field>
        <Field label="Número">
          <Input
            type="number"
            value={form.numero}
            onChange={(e) => set("numero", Number(e.target.value) || 1)}
          />
        </Field>
      </div>

      <Field label="Nome">
        <Input value={txt("nome")} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Talude Norte" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Setor">
          <Input value={txt("setor")} onChange={(e) => set("setor", e.target.value)} />
        </Field>
        <Field label="Classificação de risco">
          <Picker value={txt("risco")} onChange={(v) => set("risco", v)} options={RISCOS} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Inclinação estimada (°)">
          <Input
            type="number"
            value={form.inclinacao ?? ""}
            onChange={(e) => set("inclinacao", e.target.value === "" ? null : Number(e.target.value))}
          />
        </Field>
        <Field label="Tipo de solo">
          <Picker value={txt("tipo_solo")} onChange={(v) => set("tipo_solo", v)} options={SOLOS} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Vegetação">
          <Picker value={txt("vegetacao")} onChange={(v) => set("vegetacao", v)} options={VEGETACOES} />
        </Field>
        <Field label="Estado operacional">
          <Picker
            value={txt("estado_operacional")}
            onChange={(v) => set("estado_operacional", v)}
            options={ESTADOS}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Serviço atual">
          <Input value={txt("servico_atual")} onChange={(e) => set("servico_atual", e.target.value)} />
        </Field>
        <Field label="Equipe responsável">
          <Input value={txt("equipe")} onChange={(e) => set("equipe", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Data prevista">
          <Input
            type="date"
            value={form.data_prevista ?? ""}
            onChange={(e) => set("data_prevista", e.target.value || null)}
          />
        </Field>
        <Field label="Data executada">
          <Input
            type="date"
            value={form.data_executada ?? ""}
            onChange={(e) => set("data_executada", e.target.value || null)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Última inspeção">
          <Input
            type="date"
            value={form.ultima_inspecao ?? ""}
            onChange={(e) => set("ultima_inspecao", e.target.value || null)}
          />
        </Field>
        <Field label="Próxima inspeção">
          <Input
            type="date"
            value={form.proxima_inspecao ?? ""}
            onChange={(e) => set("proxima_inspecao", e.target.value || null)}
          />
        </Field>
      </div>

      <Field label="Data de referência">
        <Input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} />
      </Field>

      <Field label="Observações">
        <Textarea
          rows={3}
          value={txt("observacao")}
          onChange={(e) => set("observacao", e.target.value)}
        />
      </Field>

      <div>
        <Label className="text-xs">Cor e opacidade</Label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {CORES_TALUDE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set("cor", c)}
              className={`h-8 w-8 rounded-lg border-2 transition-transform ${
                form.cor === c ? "ring-2 ring-primary scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
          <input
            type="color"
            value={form.cor}
            onChange={(e) => set("cor", e.target.value)}
            className="h-8 w-8 cursor-pointer rounded-lg border"
            aria-label="Cor personalizada"
          />
          <input
            type="range"
            min={5}
            max={90}
            value={Math.round((form.opacidade ?? 0.32) * 100)}
            onChange={(e) => set("opacidade", Number(e.target.value) / 100)}
            className="ml-auto w-28"
            aria-label="Opacidade"
          />
        </div>
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full gap-2">
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar dados do talude
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Picker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Selecionar" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
