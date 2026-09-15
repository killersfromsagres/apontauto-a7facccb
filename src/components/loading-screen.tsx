import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Delayed, non-blocking navigation feedback; cached routes never flash. */
export function NavigationProgress({ loading }: { loading: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!loading) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (!loading || !visible) return null;

  return (
    <div className="navigation-progress" role="status" aria-live="polite">
      <span className="navigation-progress__bar" aria-hidden="true" />
      <span className="navigation-progress__label">Carregando página…</span>
    </div>
  );
}

export function LoadingScreen() {
  const loading = useRouterState({
    select: (s) => s.isLoading || s.status === "pending",
  });
  return <NavigationProgress loading={loading} />;
}
