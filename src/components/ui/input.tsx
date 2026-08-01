import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, inputMode, ...props }, ref) => {
    // Mobile: campos numéricos abrem o teclado numérico por padrão (o técnico
    // digita quantidade/odômetro em campo, sem trocar de teclado).
    const resolvedInputMode =
      inputMode ??
      (type === "number"
        ? props.step && props.step !== "1"
          ? "decimal"
          : "numeric"
        : type === "tel"
          ? "tel"
          : undefined);

    return (
      <input
        type={type}
        inputMode={resolvedInputMode}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background/40 backdrop-blur-md px-3.5 py-2 text-base shadow-sm transition-all",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/70",
          "hover:border-border/80",
          "focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
