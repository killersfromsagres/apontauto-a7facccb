import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listUnmatched, markUnmatchedResolved } from "@/features/assets/services/fill-jobs";

export const Route = createFileRoute("/_authenticated/inteligencia-ativos/nao-encontrados")({
  head: () => ({
    meta: [
      { title: "Ativos não encontrados — Inteligência de Ativos" },
      {
        name: "description",
        content: "Revise e corrija códigos de ativo que não foram localizados no catálogo.",
      },
      { property: "og:title", content: "Ativos não encontrados — Inteligência de Ativos" },
      {
        property: "og:description",
        content: "Fila de revisão de códigos de ativo sem correspondência.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NaoEncontrados,
});

function NaoEncontrados() {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["spreadsheet-unmatched"],
    queryFn: () => listUnmatched(),
  });

  const resolve = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) => markUnmatchedResolved(id, code),
    onSuccess: () => {
      toast.success("Registro marcado como resolvido.");
      qc.invalidateQueries({ queryKey: ["spreadsheet-unmatched"] });
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  const rows = data.filter(
    (r) =>
      !term ||
      r.code.toLowerCase().includes(term.toLowerCase()) ||
      r.sheet_name.toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <PageShell
      eyebrow="PCM · Inteligência de Ativos"
      title="Ativos não encontrados"
      description="Fila de revisão dos códigos que o catálogo não reconheceu, com a origem exata (aba e linha)."
      actions={
        <Button variant="outline" asChild>
          <Link to="/inteligencia-ativos/preencher">
            <ArrowLeft className="mr-2 h-4 w-4" /> Preencher planilha
          </Link>
        </Button>
      }
    >
      <GlassCard className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar por código ou aba"
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum ativo pendente de revisão.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-card/95">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium [&>th]:text-muted-foreground">
                  <th>Aba</th>
                  <th>Linha</th>
                  <th>Código</th>
                  <th>Motivo</th>
                  <th>Status</th>
                  <th>Código correto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="px-3 py-2">{r.sheet_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.row_number}</td>
                    <td className="px-3 py-2 font-mono">{r.code}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.reason}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          r.status === "resolved"
                            ? "border-emerald-500/40 text-emerald-500"
                            : "border-amber-500/40 text-amber-500"
                        }
                      >
                        {r.status === "resolved" ? "resolvido" : "pendente"}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8"
                        defaultValue={r.resolved_code ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                        placeholder="ex.: 10101-001"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={resolve.isPending}
                        onClick={() =>
                          resolve.mutate({ id: r.id, code: drafts[r.id] ?? r.resolved_code ?? "" })
                        }
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
