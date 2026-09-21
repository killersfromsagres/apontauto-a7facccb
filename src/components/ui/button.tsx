import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative isolate inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-[0.95rem] text-sm font-semibold tracking-[-0.01em] cursor-pointer transition-[transform,filter,opacity,color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none hover:-translate-y-px hover:brightness-[1.06] active:translate-y-0 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:brightness-100 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "text-foreground",
        premium: "text-foreground",
        destructive: "text-foreground",
        success: "text-foreground",
        warning: "text-foreground",
        outline: "text-foreground",
        glass: "text-foreground",
        soft: "text-foreground",
        secondary: "text-foreground",
        ghost: "text-foreground",
        link: "rounded-lg text-foreground underline-offset-4 hover:translate-y-0 hover:underline active:scale-100",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-[0.8rem] px-3.5 text-xs",
        lg: "h-11 px-6",
        xl: "h-12 rounded-2xl px-8 text-base",
        icon: "h-10 w-10 rounded-[0.85rem]",
        "icon-sm": "h-8 w-8 rounded-[0.7rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

const BASE_GLASS: React.CSSProperties = {
  border: "1px solid color-mix(in oklch, var(--border) 78%, white 8%)",
  background:
    "linear-gradient(180deg, color-mix(in oklch, var(--card) 76%, white 7%) 0%, color-mix(in oklch, var(--card) 90%, transparent) 100%)",
  color: "var(--foreground)",
  boxShadow:
    "inset 0 1px 0 rgb(255 255 255 / 0.10), inset 0 -1px 0 rgb(255 255 255 / 0.025), 0 12px 28px -22px rgb(0 0 0 / 0.72)",
  backdropFilter: "blur(18px) saturate(145%)",
  WebkitBackdropFilter: "blur(18px) saturate(145%)",
};

function visualStyle(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case "destructive":
      return {
        ...BASE_GLASS,
        borderColor: "color-mix(in oklch, var(--destructive) 32%, var(--border))",
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--destructive) 16%, var(--card)) 0%, color-mix(in oklch, var(--destructive) 8%, var(--card)) 100%)",
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / 0.09), 0 12px 28px -22px color-mix(in oklch, var(--destructive) 50%, transparent)",
      };
    case "success":
      return {
        ...BASE_GLASS,
        borderColor: "color-mix(in oklch, var(--success) 30%, var(--border))",
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--success) 14%, var(--card)) 0%, color-mix(in oklch, var(--success) 7%, var(--card)) 100%)",
      };
    case "warning":
      return {
        ...BASE_GLASS,
        borderColor: "color-mix(in oklch, var(--warning) 28%, var(--border))",
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--warning) 14%, var(--card)) 0%, color-mix(in oklch, var(--warning) 7%, var(--card)) 100%)",
      };
    case "outline":
    case "glass":
      return {
        ...BASE_GLASS,
        borderColor: "color-mix(in oklch, var(--border) 86%, white 6%)",
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--card) 60%, white 4%) 0%, color-mix(in oklch, var(--card) 72%, transparent) 100%)",
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / 0.07), 0 10px 24px -23px rgb(0 0 0 / 0.66)",
      };
    case "soft":
      return {
        ...BASE_GLASS,
        borderColor: "color-mix(in oklch, var(--foreground) 10%, var(--border))",
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--foreground) 7%, var(--card)) 0%, color-mix(in oklch, var(--foreground) 3%, var(--card)) 100%)",
      };
    case "secondary":
      return {
        ...BASE_GLASS,
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--secondary) 82%, white 5%) 0%, color-mix(in oklch, var(--secondary) 90%, transparent) 100%)",
      };
    case "ghost":
      return {
        border: "1px solid transparent",
        background: "color-mix(in oklch, var(--card) 18%, transparent)",
        color: "var(--foreground)",
        boxShadow: "none",
        backdropFilter: "blur(12px) saturate(125%)",
        WebkitBackdropFilter: "blur(12px) saturate(125%)",
      };
    case "link":
      return {
        border: "1px solid transparent",
        background: "transparent",
        color: "var(--foreground)",
        boxShadow: "none",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
      };
    case "premium":
    case "default":
    default:
      return {
        ...BASE_GLASS,
        borderColor: "color-mix(in oklch, var(--foreground) 14%, var(--border))",
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--card) 70%, white 10%) 0%, color-mix(in oklch, var(--card) 88%, transparent) 100%)",
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / 0.13), inset 0 -1px 0 rgb(255 255 255 / 0.025), 0 14px 30px -22px rgb(0 0 0 / 0.75)",
      };
  }
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Exibe spinner, desabilita o botão e anuncia o carregamento a leitores de tela. */
  loading?: boolean;
  /** Texto opcional exibido enquanto `loading` está ativo. */
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const resolvedVariant = (variant ?? "default") as ButtonVariant;
    const resolvedStyle: React.CSSProperties = {
      ...style,
      ...visualStyle(resolvedVariant),
    };

    if (asChild) {
      return (
        <Comp
          data-slot="button"
          data-variant={resolvedVariant}
          className={cn(buttonVariants({ variant, size, className }))}
          style={resolvedStyle}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        data-slot="button"
        data-variant={resolvedVariant}
        className={cn(buttonVariants({ variant, size, className }))}
        style={resolvedStyle}
        ref={ref}
        {...props}
        aria-busy={loading || undefined}
        disabled={loading || props.disabled}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{loadingText ?? children}</span>
            <span className="sr-only">Carregando…</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
