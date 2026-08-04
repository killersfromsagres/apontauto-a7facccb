/**
 * Paleta neon compartilhada — "Liquid Glass v3".
 *
 * Todas as cores derivam dos tokens semânticos `--chart-1..5` do design system
 * (roxo/azul neon). Usamos `var(--chart-x)` para que os gráficos acompanhem
 * automaticamente qualquer mudança de tema (dark/light) sem hardcode.
 */

/** Sequência principal usada em séries, pizzas e células. */
export const NEON_PALETTE: readonly string[] = [
  "var(--chart-1)", // roxo neon
  "var(--chart-2)", // azul neon
  "var(--chart-3)", // cyan glow
  "var(--chart-4)", // fuchsia
  "var(--chart-5)", // rosa
  "var(--primary)",
  "var(--primary-glow)",
  "var(--info)",
] as const;

/** Cores semânticas de status — mantêm leitura imediata (verde/vermelho/âmbar). */
export const CHART_STATUS = {
  concluido: "var(--success)",
  cancelado: "var(--destructive)",
  aberto: "var(--warning)",
} as const;

/** Retorna uma cor da paleta com wrap-around seguro para índices arbitrários. */
export function neonAt(index: number): string {
  if (!Number.isFinite(index) || index < 0) return NEON_PALETTE[0]!;
  return NEON_PALETTE[Math.floor(index) % NEON_PALETTE.length]!;
}
