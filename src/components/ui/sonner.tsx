import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toaster global — variantes com cores semânticas, blur suave e sombra premium.
 * Mantém a API padrão do sonner; só refina o visual.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      offset={16}
      gap={10}
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            "group toast pointer-events-auto flex items-start gap-3 rounded-xl border p-4 text-sm shadow-elegant backdrop-blur-xl " +
            "group-[.toaster]:bg-card/85 group-[.toaster]:text-card-foreground group-[.toaster]:border-border/70",
          title: "font-medium leading-snug",
          description: "text-[13px] leading-snug text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:font-medium hover:group-[.toast]:opacity-90 transition",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs transition hover:group-[.toast]:bg-muted/80",
          closeButton:
            "group-[.toast]:bg-transparent group-[.toast]:border group-[.toast]:border-border/60 group-[.toast]:text-muted-foreground hover:group-[.toast]:text-foreground",
          success:
            "group-[.toaster]:!border-emerald-500/30 group-[.toaster]:!bg-emerald-500/10 group-[.toaster]:!text-emerald-50 [&_[data-icon]]:!text-emerald-400",
          error:
            "group-[.toaster]:!border-red-500/30 group-[.toaster]:!bg-red-500/10 group-[.toaster]:!text-red-50 [&_[data-icon]]:!text-red-400",
          warning:
            "group-[.toaster]:!border-amber-500/30 group-[.toaster]:!bg-amber-500/10 group-[.toaster]:!text-amber-50 [&_[data-icon]]:!text-amber-400",
          info:
            "group-[.toaster]:!border-sky-500/30 group-[.toaster]:!bg-sky-500/10 group-[.toaster]:!text-sky-50 [&_[data-icon]]:!text-sky-300",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
