import * as React from "react";

const MOBILE_BREAKPOINT = 768;

// Leitura síncrona no client evita "flash" de layout desktop → mobile
// no primeiro paint em celulares. No servidor devolve `false` (SSR safe).
function readIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(readIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    // Sincroniza em caso de mudança entre SSR e client (rare).
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
