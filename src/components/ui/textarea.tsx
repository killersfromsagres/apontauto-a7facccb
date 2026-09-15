import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "premium-input flex min-h-[100px] w-full rounded-xl border border-input bg-background/60 px-3.5 py-2.5 text-base shadow-sm backdrop-blur-sm transition-[border-color,box-shadow,background-color,color]",
        "placeholder:text-muted-foreground/70",
        "hover:border-border/80",
        "focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "md:text-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
