import { memo, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/glass-card";
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { STATUS_CATS, STATUS_COLOR, STATUS_LABEL, type StatusCat } from "@/lib/backorder/status";

export interface StatusBoardRow {
  os: string;
  nome: string;
  equipe: string;
  predio: string;
  andar?: string;
  espaco?: string;
  outros: string;
  data_solicitacao: string;
  status_origem?: string;
  statusCat: StatusCat;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

/** Quadro por status detalhado da coluna G — otimizado para mobile. */
export function StatusBoard({
  rows,
  onSelect,
}: {
  rows: StatusBoardRow[];
  onSelect?: (os: string) => void;
}) {
  const [cat, setCat] = useState<StatusCat | "todos">("todos");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const m = {} as Record<string, number>;
    for (const r of rows) m[r.statusCat] = (m[r.statusCat] ?? 0) + 1;
    return m;
  }, [rows]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => (cat === "todos" ? true : r.statusCat === cat))
      .filter((r) =>
        !s
          ? true
          : r.os.toLowerCase().includes(s) ||
            r.nome.toLowerCase().includes(s) ||
            r.outros.toLowerCase().includes(s) ||
            r.predio.toLowerCase().includes(s),
      )
      .sort((a, b) => +new Date(b.data_solicitacao) - +new Date(a.data_solicitacao));
  }, [rows, cat, q]);

  return (
    <div className="space-y-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex w-max gap-2">
          <button
            type="button"
            onClick={() => setCat("todos")}
            className={`min-h-11 rounded-full border px-3 text-xs font-medium transition ${
              cat === "todos"
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground"
            }`}
          >
            Todos <span className="ml-1 opacity-70">{rows.length}</span>
          </button>
          {STATUS_CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`min-h-11 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition ${
                cat === c ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              <span
                className="mr-1.5 inline-block size-2 rounded-full align-middle"
                style={{ background: STATUS_COLOR[c] }}
              />
              {STATUS_LABEL[c]} <span className="ml-1 opacity-70">{counts[c] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por OS, descrição, solicitante ou prédio"
          className="h-11 pl-9"
        />
      </div>

      {list.length === 0 ? (
        <GlassCard>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum chamado nesta seleção.
          </p>
        </GlassCard>
      ) : (
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/20 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <button
              key={r.os}
              type="button"
              onClick={() => onSelect?.(r.os)}
              className="rounded-2xl border bg-card/60 p-3 text-left transition active:scale-[0.99] hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{r.os}</span>
                <Badge
                  className="shrink-0 text-[10px] text-white"
                  style={{ background: STATUS_COLOR[r.statusCat] }}
                >
                  {STATUS_LABEL[r.statusCat]}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-medium">{r.nome || "Sem descrição"}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {[r.predio, r.andar, r.espaco].filter(Boolean).join(" · ") || "Local não informado"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">
                  {r.equipe || "Sem equipe"}
                </Badge>
                <span className="truncate">{r.outros || "Solicitante não informado"}</span>
                <span className="ml-auto">{fmtDate(r.data_solicitacao)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
