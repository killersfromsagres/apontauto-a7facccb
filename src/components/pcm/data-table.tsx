import { useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonState } from "./states";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  className?: string;
  headClassName?: string;
  /** Valor usado na ordenação; ausente = coluna não ordenável. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** No mobile: destaca a coluna como título do card (a primeira é o padrão). */
  mobilePrimary?: boolean;
  /** No mobile: oculta a coluna do card (ruído/densidade). */
  mobileHidden?: boolean;
};


export type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Quantidade inicial exibida; o restante entra via "Carregar mais". */
  pageSize?: number;
  /** Acima deste total de linhas o corpo da tabela é virtualizado (desktop). */
  virtualizeAfter?: number;
  /** Altura máxima da área rolável quando virtualizada. */
  virtualHeight?: number;
  className?: string;
};

/** Tabela padrão com ordenação, paginação incremental e estados (item 6.2). */
export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading,
  emptyTitle = "Nenhum registro",
  emptyDescription,
  emptyAction,
  onRowClick,
  pageSize = 50,
  virtualizeAfter = 100,
  virtualHeight = 620,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [visible, setVisible] = useState(pageSize);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = col.sortValue!(a) ?? "";
      const vb = col.sortValue!(b) ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb), "pt-BR") * factor;
    });
  }, [data, sort, columns]);

  if (loading) return <SkeletonState rows={6} />;
  if (!data.length) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  const rows = sorted.slice(0, visible);
  const virtualize = rows.length > virtualizeAfter;
  const mobileCols = columns.filter((c) => !c.mobileHidden);
  const primaryCol = mobileCols.find((c) => c.mobilePrimary) ?? mobileCols[0];
  const secondaryCols = mobileCols.filter((c) => c.key !== primaryCol?.key);
  const sortableCols = columns.filter((c) => c.sortValue);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Mobile: lista de cards — elimina a rolagem horizontal das tabelas densas. */}
      <div className="space-y-2 md:hidden">
        {sortableCols.length > 0 ? (
          <div className="scroll-fluid -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {sortableCols.map((col) => {
              const active = sort?.key === col.key;
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() =>
                    setSort((prev) =>
                      prev?.key === col.key
                        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
                        : { key: col.key, dir: "asc" },
                    )
                  }
                  className={cn(
                    "glass-tile flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium",
                    active
                      ? "border-primary/60 text-primary"
                      : "border-border/60 text-muted-foreground",
                  )}
                >
                  {col.header}
                  {active ? (sort!.dir === "asc" ? "▲" : "▼") : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {rows.map((row, index) => {
          const clickable = Boolean(onRowClick);
          return (
            <div
              key={rowKey(row, index)}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onRowClick!(row) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick!(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                "rounded-2xl border border-border/60 bg-card/60 p-3",
                clickable && "cursor-pointer active:scale-[0.99] transition-transform",
              )}
            >
              {primaryCol ? (
                <div className="min-w-0 text-sm font-semibold">
                  {primaryCol.cell(row, index)}
                </div>
              ) : null}
              {secondaryCols.length > 0 ? (
                <dl className="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                  {secondaryCols.map((col) => (
                    <div key={col.key} className="contents">
                      <dt className="text-muted-foreground">{col.header}</dt>
                      <dd className="min-w-0 break-words text-right font-medium">
                        {col.cell(row, index)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="hidden overflow-x-auto rounded-2xl border border-border/60 md:block"
        style={virtualize ? { maxHeight: virtualHeight, overflowY: "auto" } : undefined}
      >
        <Table>

          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn("whitespace-nowrap", col.headClassName)}
                  onClick={
                    col.sortValue
                      ? () =>
                          setSort((prev) =>
                            prev?.key === col.key
                              ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
                              : { key: col.key, dir: "asc" },
                          )
                      : undefined
                  }
                  aria-sort={
                    sort?.key === col.key
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      col.sortValue && "cursor-pointer select-none hover:text-foreground",
                    )}
                  >
                    {col.header}
                    {sort?.key === col.key ? (sort.dir === "asc" ? "▲" : "▼") : null}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {virtualize ? (
              <VirtualRows
                rows={rows}
                columns={columns}
                rowKey={rowKey}
                onRowClick={onRowClick}
                scrollRef={scrollRef}
              />
            ) : (
              rows.map((row, index) => (
              <TableRow
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(row, index)}
                  </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {visible < sorted.length ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + pageSize)}>
            Carregar mais ({sorted.length - visible})
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Corpo virtualizado: só as linhas visíveis vão para o DOM, com espaçadores
 * acima/abaixo para preservar a barra de rolagem. Mantém tabelas de milhares
 * de registros fluidas mesmo em celulares e máquinas modestas.
 */
function VirtualRows<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  scrollRef,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length ? items[0].start : 0;
  const paddingBottom = items.length
    ? virtualizer.getTotalSize() - items[items.length - 1].end
    : 0;

  return (
    <>
      {paddingTop > 0 ? (
        <TableRow aria-hidden>
          <TableCell colSpan={columns.length} style={{ height: paddingTop, padding: 0 }} />
        </TableRow>
      ) : null}
      {items.map((item) => {
        const row = rows[item.index];
        return (
          <TableRow
            key={rowKey(row, item.index)}
            data-index={item.index}
            ref={virtualizer.measureElement}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(onRowClick && "cursor-pointer")}
          >
            {columns.map((col) => (
              <TableCell key={col.key} className={col.className}>
                {col.cell(row, item.index)}
              </TableCell>
            ))}
          </TableRow>
        );
      })}
      {paddingBottom > 0 ? (
        <TableRow aria-hidden>
          <TableCell colSpan={columns.length} style={{ height: paddingBottom, padding: 0 }} />
        </TableRow>
      ) : null}
    </>
  );
}
