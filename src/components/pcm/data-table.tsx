import { useMemo, useState, type ReactNode } from "react";
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
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [visible, setVisible] = useState(pageSize);

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

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto rounded-2xl border border-border/60">
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
            {rows.map((row, index) => (
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
            ))}
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
