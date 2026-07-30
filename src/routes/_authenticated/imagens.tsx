import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  CloudUpload,
  HardDrive,
  ImageIcon,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  inventoryStorageImages,
  listImgbbLinks,
  migrateStorageImagesBatch,
  purgeStorageOrphans,
} from "@/lib/admin/images.functions";

export const Route = createFileRoute("/_authenticated/imagens")({ component: Page });

type Inventory = Awaited<ReturnType<typeof inventoryStorageImages>>;
type Links = Awaited<ReturnType<typeof listImgbbLinks>>;

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function Page() {
  const isAdmin = useIsAdmin();

  const inventory = useServerFn(inventoryStorageImages);
  const migrate = useServerFn(migrateStorageImagesBatch);
  const purge = useServerFn(purgeStorageOrphans);
  const links = useServerFn(listImgbbLinks);

  const [inv, setInv] = useState<Inventory | null>(null);
  const [recent, setRecent] = useState<Links>([]);
  const [phase, setPhase] = useState<"idle" | "listing" | "migrating" | "cleaning" | "done">(
    "idle",
  );
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [current, setCurrent] = useState<string>("");
  const [freed, setFreed] = useState(0);
  const [failures, setFailures] = useState<Array<{ id: string; path: string; error: string }>>([]);

  const busy = phase === "listing" || phase === "migrating" || phase === "cleaning";

  if (isAdmin === false) {
    return (
      <PageShell title="Imagens" description="Acesso restrito.">
        <GlassCard>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Somente administradores podem gerenciar o armazenamento de imagens.
          </div>
        </GlassCard>
      </PageShell>
    );
  }

  const runList = async () => {
    setPhase("listing");
    setFailures([]);
    try {
      const data = await inventory({ data: undefined as never });
      setInv(data);
      setRecent(await links({ data: { limit: 30 } }));
      setPhase("idle");
      if (!data.imgbbConfigured) toast.warning("IMGBB_API_KEY não configurada no servidor.");
    } catch (err: any) {
      setPhase("idle");
      toast.error(err?.message ?? "Falha ao listar imagens");
    }
  };

  const runMigration = async () => {
    let data = inv;
    if (!data) {
      setPhase("listing");
      try {
        data = await inventory({ data: undefined as never });
        setInv(data);
      } catch (err: any) {
        setPhase("idle");
        toast.error(err?.message ?? "Falha ao listar imagens");
        return;
      }
    }
    if (!data.imgbbConfigured) {
      setPhase("idle");
      toast.error("IMGBB_API_KEY não configurada — configure antes de migrar.");
      return;
    }

    const total = data.totals.pendingRows;
    setProgress({ done: 0, total });
    setFreed(0);
    setFailures([]);
    setPhase("migrating");

    const allFailures: Array<{ id: string; path: string; error: string }> = [];
    let freedBytes = 0;
    let done = 0;

    try {
      for (const src of data.sources) {
        if (src.pendingRows === 0) continue;
        setCurrent(src.label);
        let guard = 0;
        // Lotes pequenos: cada volta baixa do Storage, republica no ImgBB,
        // grava o link e só então apaga o binário local.
        while (guard++ < 400) {
          const r = await migrate({ data: { source: src.key, batchSize: 6 } });
          done += r.migrated;
          freedBytes += r.freedBytes;
          allFailures.push(...r.failures);
          setProgress({ done, total });
          setFreed(freedBytes);
          setFailures([...allFailures]);
          // Nada mais a processar, ou o lote inteiro falhou (evita loop infinito).
          if (r.remaining === 0 || r.processed === 0 || r.migrated === 0) break;
        }
      }

      setPhase("cleaning");
      setCurrent("Removendo objetos órfãos");
      for (const src of data.sources) {
        if (src.orphans === 0) continue;
        const p = await purge({ data: { source: src.key } });
        freedBytes += p.freedBytes;
        setFreed(freedBytes);
      }

      const fresh = await inventory({ data: undefined as never });
      setInv(fresh);
      setRecent(await links({ data: { limit: 30 } }));
      setPhase("done");
      toast.success(
        allFailures.length
          ? `Migração concluída com ${allFailures.length} falha(s).`
          : "Migração concluída com sucesso.",
      );
    } catch (err: any) {
      setPhase("idle");
      toast.error(err?.message ?? "Falha durante a migração");
    }
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <PageShell
      eyebrow="Administração"
      title="Imagens e Armazenamento"
      description="Inventaria as imagens guardadas no armazenamento do backend, republica tudo no ImgBB, salva os links e libera o espaço local."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={runList} disabled={busy}>
            {phase === "listing" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Listar imagens
          </Button>
          <Button onClick={runMigration} disabled={busy}>
            {phase === "migrating" || phase === "cleaning" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CloudUpload className="mr-2 h-4 w-4" />
            )}
            Listar e Migrar Imagens
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Progresso / conclusão */}
        {busy && (
          <GlassCard variant="block">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" />
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {phase === "listing"
                    ? "Listando imagens do armazenamento…"
                    : phase === "cleaning"
                      ? "Limpando arquivos residuais…"
                      : `Migrando para o ImgBB — ${current}`}
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${phase === "listing" ? 8 : Math.max(pct, 4)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {progress.done}/{progress.total} imagens · {fmtBytes(freed)} liberados
                </p>
              </div>
            </div>
          </GlassCard>
        )}

        {phase === "done" && (
          <GlassCard variant="block">
            <div className="flex animate-in fade-in zoom-in-95 items-center gap-3 duration-500">
              <CheckCircle2 className="h-10 w-10 shrink-0 animate-in zoom-in-50 text-emerald-500 duration-700" />
              <div>
                <p className="text-sm font-semibold">Procedimento concluído</p>
                <p className="text-xs text-muted-foreground">
                  {progress.done} imagem(ns) migrada(s) para o ImgBB · {fmtBytes(freed)} liberados
                  no armazenamento
                  {failures.length ? ` · ${failures.length} falha(s)` : ""}
                </p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Inventário */}
        {inv && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Kpi icon={ImageIcon} label="Objetos no armazenamento" value={String(inv.totals.objects)} />
              <Kpi icon={HardDrive} label="Espaço ocupado" value={fmtBytes(inv.totals.bytes)} />
              <Kpi icon={CloudUpload} label="Pendentes de migração" value={String(inv.totals.pendingRows)} />
              <Kpi icon={Trash2} label="Órfãos (sem registro)" value={String(inv.totals.orphans)} />
            </div>

            {inv.sources.map((src) => (
              <GlassCard key={src.key}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{src.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      {src.bucket}
                      {src.missing ? " · bucket inexistente" : ""}
                      {src.truncated ? " · lista truncada (mais de 4000 objetos)" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{src.objects} objetos</Badge>
                    <Badge variant="outline">{fmtBytes(src.bytes)}</Badge>
                    <Badge variant={src.pendingRows ? "default" : "secondary"}>
                      {src.pendingRows} a migrar
                    </Badge>
                    {src.orphans > 0 && <Badge variant="destructive">{src.orphans} órfãos</Badge>}
                  </div>
                </div>
                {src.sample.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <ul className="space-y-1 text-xs">
                      {src.sample.map((o) => (
                        <li key={o.path} className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${o.linked ? "bg-primary" : "bg-destructive"}`}
                          />
                          <span className="truncate font-mono text-muted-foreground">{o.path}</span>
                          <span className="ml-auto shrink-0 text-muted-foreground">
                            {fmtBytes(o.size)}
                          </span>
                        </li>
                      ))}
                      {src.objects > src.sample.length && (
                        <li className="text-muted-foreground">
                          + {src.objects - src.sample.length} outros…
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </GlassCard>
            ))}
          </>
        )}

        {failures.length > 0 && (
          <GlassCard>
            <h3 className="mb-2 text-sm font-semibold text-destructive">
              Falhas ({failures.length})
            </h3>
            <ul className="space-y-1 text-xs">
              {failures.slice(0, 30).map((f) => (
                <li key={f.id} className="flex gap-2">
                  <span className="truncate font-mono text-muted-foreground">{f.path}</span>
                  <span className="ml-auto shrink-0 text-destructive">{f.error}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              As imagens com falha continuam intactas no armazenamento — nada foi apagado sem link
              confirmado.
            </p>
          </GlassCard>
        )}

        {recent.length > 0 && (
          <GlassCard>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Link2 className="h-4 w-4" /> Links hospedados no ImgBB
            </h3>
            <ul className="space-y-1.5 text-xs">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {r.module_key ?? "—"}
                  </Badge>
                  <a
                    href={r.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-primary underline-offset-2 hover:underline"
                  >
                    {r.url}
                  </a>
                  <span className="shrink-0 text-muted-foreground">{fmtBytes(r.size_bytes)}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}

        {!inv && !busy && (
          <GlassCard>
            <p className="text-sm text-muted-foreground">
              Clique em <strong>Listar e Migrar Imagens</strong> para inventariar o armazenamento,
              republicar tudo no ImgBB e liberar espaço. Os links ficam salvos no banco e o binário
              local só é apagado depois que o link é confirmado.
            </p>
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ImageIcon;
  label: string;
  value: string;
}) {
  return (
    <GlassCard>
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </GlassCard>
  );
}
