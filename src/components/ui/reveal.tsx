import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Observa um elemento e marca `data-revealed` quando ele entra na viewport.
 * A animação em si vive no CSS (`.reveal`), então não há custo de JS por frame.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
}) {
  const { once = true, rootMargin = "0px 0px -10% 0px", threshold = 0.12 } = options ?? {};
  const ref = React.useRef<T | null>(null);
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setRevealed(false);
          }
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  return { ref, revealed };
}

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Atraso em ms para escalonar itens de uma lista/grade. */
  delay?: number;
  /** Reanima ao sair e voltar para a viewport. */
  repeat?: boolean;
  as?: "div" | "section" | "article" | "li";
}

/** Wrapper de fade-in suave ao rolar. Respeita `prefers-reduced-motion`. */
export const Reveal = React.forwardRef<HTMLDivElement, RevealProps>(
  ({ className, delay = 0, repeat = false, as: Tag = "div", style, children, ...props }, forwardedRef) => {
    const { ref, revealed } = useReveal<HTMLDivElement>({ once: !repeat });

    React.useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);

    return (
      <Tag
        ref={ref}
        data-revealed={revealed ? "true" : "false"}
        className={cn("reveal", className)}
        style={{ ...style, ["--reveal-delay" as string]: `${delay}ms` }}
        {...props}
      >
        {children}
      </Tag>
    );
  },
);
Reveal.displayName = "Reveal";
