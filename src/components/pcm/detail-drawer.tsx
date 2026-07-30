import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type DetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left" | "bottom";
  className?: string;
};

/** Painel lateral padrão para detalhes de um registro (item 6.2). */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  className,
}: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-lg", className)}
      >
        <SheetHeader className="border-b border-border/60 p-5 text-left">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs">{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-5">{children}</div>
        </ScrollArea>
        {footer ? <div className="border-t border-border/60 p-4">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Linha rótulo/valor usada dentro do DetailDrawer. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-start gap-3 border-b border-border/40 pb-2 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 break-words text-sm">{children}</span>
    </div>
  );
}
