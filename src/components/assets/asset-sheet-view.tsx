import { useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Camera,
  Lock,
  MapPin,
  Plus,
  ScrollText,
  Wrench,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssetQrDialog } from "@/components/assets/asset-qr-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { STATUS_LABEL, toCanonicalStatus } from "@/modules/work-orders";

async function loadAsset(code: string) {
  const norm = code.trim().toUpperCase();
  const [asset, crit, cor, ref] = await Promise.all([
    supabase
      .from("assets")
      .select("code,name,level,parent_name,business_unit")
      .eq("normalized_code", norm)
      .maybeSingle(),
    supabase.from("asset_criticality").select("*").eq("asset_code", norm).maybeSingle(),
    supabase
      .from("corretiva_os")
      .select("id,numero_os,nome_os,status,predio,andar,local,created_at,equipe")
      .ilike("ativo", code)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("refrigeracao_os")
      .select("id,numero_os,nome_os,status,predio,andar,local,created_at,equipe")
      .ilike("ativo", code)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const fotos = await supabase
    .from("corretiva_fotos")
    .select("image_url,os_id")
    .in("os_id", (cor.data ?? []).map((o) => String(o.id)).slice(0, 20))
    .limit(12);
  return {
    asset: asset.data,
    criticality: crit.data,
    ordens: [
      ...(cor.data ?? []).map((o) => ({ ...o, modalidade: "corretiva" as const })),
      ...(ref.data ?? []).map((o) => ({ ...o, modalidade: "refrigeracao" as const })),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    fotos: (fotos.data ?? []).map((f) => String(f.image_url ?? "")).filter(Boolean),
  };
}

export function AssetSheetView() {
  const { code } = useParams({ from: "/_authenticated/ativo/$code" });
  const { allowed, isLoading: loadingPerm } = useCanAccessModule("base-ativos", "read");
  const q = useQuery({ queryKey: ["asset-sheet", code], queryFn: () => loadAsset(code) });

  const abertas = useMemo(
    () =>
      (q.data?.ordens ?? []).filter(
        (o) => !["concluida", "cancelada"].includes(toCanonicalStatus(o.status as string)),
      ),
    [q.data],
  );

  if (loadingPerm) {
    return (
      <PageShell title="Ficha do ativo">
        <GlassCard>
          <p className="text-sm text-muted-foreground">Verificando permissões…</p>
        </GlassCard>
      </PageShell>
    );
  }

  if (!allowed) {
    return (
      <PageShell eyebrow="Ativos" title="Acesso restrito">
        <GlassCard className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para visualizar fichas de ativos. Solicite acesso ao módulo
            Base de Ativos.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  const a = q.data?.asset;
  const c = q.data?.criticality;
  const ultima = q.data?.ordens?.[0];

  return (
    <PageShell
      eyebrow="Ficha mobile do ativo"
      title={a?.name || code}
      description={`Código ${code}`}
      actions={
        <div className="flex gap-2">
          <AssetQrDialog code={code} name={a?.name ?? undefined} />
          <Button asChild>
            <Link to="/corretiva" search={{ ativo: code } as never}>
              <Plus className="mr-1.5 h-4 w-4" /> Nova OS
            </Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <GlassCard variant="block" className="space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> Localização
          </div>
          <p className="text-sm text-muted-foreground">
            {a
              ? [a.parent_name, a.level, a.business_unit].filter(Boolean).join(" · ") ||
                "Sem hierarquia cadastrada."
              : ultima
                ? [ultima.predio, ultima.andar, ultima.local].filter(Boolean).join(" · ")
                : "Ativo não encontrado no catálogo."}
          </p>
          {c && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline">Classe {c.classe_abc}</Badge>
              {c.redundancia && <Badge variant="outline">com redundância</Badge>}
              {c.proxima_preventiva && (
                <Badge className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
                  <CalendarClock className="mr-1 h-3 w-3" /> preventiva {c.proxima_preventiva}
                </Badge>
              )}
            </div>
          )}
          {!c && (
            <p className="text-xs text-muted-foreground">
              Próxima preventiva: dados insuficientes.
            </p>
          )}
        </GlassCard>

        <GlassCard className="space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <Wrench className="h-4 w-4 text-primary" /> OS abertas ({abertas.length})
          </div>
          {abertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ordem em aberto.</p>
          ) : (
            abertas.map((o) => (
              <div key={o.id} className="rounded-lg border border-border/50 p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">OS {o.numero_os}</span>
                  <Badge variant="outline">{STATUS_LABEL[toCanonicalStatus(o.status as string)]}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{o.nome_os}</div>
              </div>
            ))
          )}
        </GlassCard>

        <GlassCard className="space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <ScrollText className="h-4 w-4 text-primary" /> Histórico
          </div>
          {(q.data?.ordens ?? []).slice(0, 30).map((o) => (
            <div key={`${o.modalidade}-${o.id}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1.5 text-sm last:border-0">
              <span className="truncate">
                {o.numero_os} — {o.nome_os}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(String(o.created_at)).toLocaleDateString("pt-BR")} ·{" "}
                {STATUS_LABEL[toCanonicalStatus(o.status as string)]}
              </span>
            </div>
          ))}
          {(q.data?.ordens ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Sem histórico para este ativo.</p>
          )}
        </GlassCard>

        {(q.data?.fotos ?? []).length > 0 && (
          <GlassCard className="space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <Camera className="h-4 w-4 text-primary" /> Fotos
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(q.data?.fotos ?? []).map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer">
                  <img src={src} alt={`Evidência do ativo ${code}`} loading="lazy" className="h-24 w-full rounded-lg object-cover" />
                </a>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}
