import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Droplets,
  HardHat,
  ShieldCheck,
  SprayCan,
  Trees,
  Wrench,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { useMyAccess } from "@/hooks/use-my-access";

const quickModules = [
  { key: "preventiva", title: "Preventiva", to: "/preventiva", icon: CalendarClock, tint: "text-sky-600 dark:text-sky-400" },
  { key: "corretiva", title: "Corretiva", to: "/corretiva", icon: Wrench, tint: "text-red-600 dark:text-red-400" },
  { key: "backorder", title: "Backorder", to: "/backorder", icon: AlertTriangle, tint: "text-amber-600 dark:text-amber-400" },
  { key: "apontamentos", title: "Abastecimento", to: "/apontamentos", icon: Droplets, tint: "text-cyan-600 dark:text-cyan-400" },
  { key: "apontamentos", title: "Limpeza", to: "/apontamentos", icon: SprayCan, tint: "text-emerald-600 dark:text-emerald-400" },
  { key: "apontamentos", title: "Jardinagem", to: "/apontamentos", icon: Trees, tint: "text-green-600 dark:text-green-400" },
  { key: "painel-legal", title: "Itens Legais", to: "/painel-legal", icon: ShieldCheck, tint: "text-purple-600 dark:text-purple-400" },
  { key: "seguranca-trabalho", title: "Segurança", to: "/seguranca-trabalho", icon: HardHat, tint: "text-orange-600 dark:text-orange-400" },
] as const;

export function QuickAccessStrip() {
  const { access } = useMyAccess();
  const visible = quickModules.filter(
    (m) => access.isAdmin || !access.allowed || access.allowed.includes(m.key),
  );
  if (visible.length === 0) return null;

  return (
    <GlassCard delay={0.05}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <div className="glass-tile rounded-lg p-1.5">
            <ArrowRight className="h-4 w-4 text-primary" strokeWidth={1.75} />
          </div>
          <h3 className="text-sm font-semibold">Acesso rápido</h3>
        </div>
        <div className="scroll-fluid flex-1 overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {visible.map((m, idx) => (
              <Link
                key={`${m.key}-${idx}`}
                to={m.to}
                className="glass-tile group flex shrink-0 items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.04] hover:border-primary/60 hover:text-foreground hover:shadow-[0_8px_20px_-10px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
              >
                <m.icon
                  className={`h-3.5 w-3.5 ${m.tint} transition-transform duration-200 group-hover:scale-110 group-hover:drop-shadow-[0_0_6px_currentColor]`}
                  strokeWidth={2}
                />
                <span>{m.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
