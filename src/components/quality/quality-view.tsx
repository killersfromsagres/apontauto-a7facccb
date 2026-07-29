import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw, ShieldAlert, Wrench } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { applyFix, runQualityChecks, type QualityRow } from "@/features/quality/checks";

const sevClass: Record<string, string> = {
  alta: "border-destructive/40 bg-destructive/10 text-destructive",
  media: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  baixa: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

export function QualityView() {
  const qc = useQueryClient();
  const [fix, setFix] = useState<QualityRow | null>(null);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const checksQ = useQuery({ queryKey: ["quality-checks"], queryFn: runQualityChecks });
  const checks = checksQ.data ?? [];
  const total = useMemo(() => checks.reduce((s, c) => s + c.rows.length, 0), [checks]);
  const criticos = useMemo(
    () => checks.filter((c) => c.severity === "alta").reduce((s, c) => s + c.rows.length, 0),
    [checks],
  );

  async function confirmFix() {
    if (!fix) return;
    try {
      await applyFix(fix, valor, obs);
      toast.success("Correção aplicada e registrada.");
      setFix(null);
      setValor("");
      setObs("");
      qc.invalidateQueries({ queryKey: ["quality-checks"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <PageShell
      eyebrow="Governança de dados"
      title="Central de Qualidade de Dados"
      description="Detecta pendências que comprometem indicadores — OS sem ativo, local incompleto, equipe não classificada, placas duplicadas, hodômetro regressivo, PT sem encerramento e mais — com correção assistida rastreada."
      actions={
        <Button variant="outline" onClick={() => checksQ.refetch()} disabled={checksQ.isFetching}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${checksQ.isFetching ? "animate-spin" : ""}`} />
          Reavaliar
        </Button>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <GlassCard variant="block">
          <div className="text-eyebrow">Pendências</div>
          <div className="mt-1 text-2xl font-bold">{total}</div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow">Severidade alta</div>
          <div className="mt-1 text-2xl font-bold text-destructive">{criticos}</div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow">Verificações</div>
          <div className="mt-1 text-2xl font-bold">{checks.length}</div>
        </GlassCard>
      </div>

      <div className="space-y-3">
        {checksQ.isLoading && (
          <GlassCard>
            <p className="text-sm text-muted-foreground">Avaliando a base…</p>
          </GlassCard>
        )}
        {checks.map((c) => (
          <GlassCard key={c.key} className="space-y-2">
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              onClick={() => setOpen(open === c.key ? null : c.key)}
            >
              <div className="flex items-center gap-2">
                {c.rows.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                )}
                <span className="font-semibold">{c.title}</span>
                <Badge className={sevClass[c.severity]}>{c.severity}</Badge>
              </div>
              <Badge variant="outline">{c.rows.length} ocorrência(s)</Badge>
            </button>
            <p className="text-xs text-muted-foreground">{c.description}</p>

            {open === c.key && c.rows.length > 0 && (
              <div className="max-h-80 space-y-1.5 overflow-y-auto pt-1">
                {c.rows.slice(0, 200).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/40 p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.label}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.detail}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFix(r);
                        setValor(r.current);
                      }}
                    >
                      <Wrench className="mr-1.5 h-3.5 w-3.5" /> Corrigir
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        ))}
      </div>

      <Dialog open={!!fix} onOpenChange={(o) => !o && setFix(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correção assistida</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {fix?.label} — campo <code>{fix?.column}</code> em <code>{fix?.table}</code>.
            </p>
            <div>
              <Label>Novo valor</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
            </div>
            <p className="text-xs text-muted-foreground">
              A correção fica registrada com autor, valor anterior e valor novo.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={confirmFix}>Aplicar correção</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
