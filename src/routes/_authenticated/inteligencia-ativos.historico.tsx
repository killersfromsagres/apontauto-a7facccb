import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listJobs } from "@/features/assets/services/fill-jobs";

export const Route = createFileRoute("/_authenticated/inteligencia-ativos/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de processamentos — Inteligência de Ativos" },
      {
        name: "description",
        content: "Auditoria dos preenchimentos de planilha: arquivo, totais, método e data.",
      },
      { property: "og:title", content: "Histórico de processamentos — Inteligência de Ativos" },
      { property: "og:description", content: "Registro auditável de cada planilha preenchida." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Historico,
});

function Historico() {
  const { data = [], isLoading } = useQuery({ queryKey: ["spreadsheet-jobs"], queryFn: () => listJobs() });

  return (
    <PageShell
      eyebrow="PCM · Inteligência de Ativos"
      title="Histórico de processamentos"
      description="Cada planilha preenchida gera um registro auditável com totais e configuração usada."
      actions={
        <Button variant="outline" asChild>
          <Link to="/inteligencia-ativos/preencher">
            <ArrowLeft className="mr-2 h-4 w-4" /> Preencher planilha
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <GlassCard>
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum processamento registrado ainda.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {data.map((job) => (
            <GlassCard key={job.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(job.created_at).toLocaleString("pt-BR")} · {job.sheet_name || "—"} ·{" "}
                    {(job.file_size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{job.total_rows.toLocaleString("pt-BR")} linhas</Badge>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                    {job.matched_rows.toLocaleString("pt-BR")} resolvidos
                  </Badge>
                  {job.unmatched_rows > 0 && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      {job.unmatched_rows.toLocaleString("pt-BR")} não encontrados
                    </Badge>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
