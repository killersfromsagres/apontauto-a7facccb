from pathlib import Path

path = Path('public/inteligencia-ativos-preencher-premium.css')
text = path.read_text(encoding='utf-8')
marker = '/* === Premium action hierarchy · 2026-09-21 === */'
if marker in text:
    raise SystemExit('button polish already applied')

append = r'''

/* === Premium action hierarchy · 2026-09-21 === */
/* Navigation between stages */
[data-page-title="Preencher Planilha"] .justify-between.gap-2:has(> [data-slot="button"]) {
  align-items: center !important;
  gap: 0.85rem !important;
  margin-top: 0.25rem;
}

[data-page-title="Preencher Planilha"] .justify-between.gap-2:has(> [data-slot="button"]) > [data-slot="button"] {
  min-height: 3.05rem !important;
  padding-inline: 1.25rem !important;
  border-radius: 0.9rem !important;
  font-size: 0.9rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.012em;
}

[data-page-title="Preencher Planilha"] .justify-between.gap-2:has(> [data-slot="button"]) > [data-slot="button"]:first-child {
  border: 1px solid color-mix(in oklch, var(--border) 82%, white 5%) !important;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.012)) !important;
  color: color-mix(in oklch, var(--foreground) 82%, var(--muted-foreground) 18%) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.035) !important;
}

[data-page-title="Preencher Planilha"] .justify-between.gap-2:has(> [data-slot="button"]) > [data-slot="button"]:first-child:hover {
  border-color: color-mix(in oklch, var(--primary) 28%, var(--border)) !important;
  background: color-mix(in oklch, var(--primary) 4%, var(--card)) !important;
  color: var(--foreground) !important;
  transform: translateY(-1px);
}

[data-page-title="Preencher Planilha"] .asset-fill-primary-action {
  position: relative;
  overflow: hidden;
  min-width: 9.5rem;
  min-height: 3.05rem !important;
  padding-inline: 1.35rem !important;
  border-radius: 0.92rem !important;
  border-color: color-mix(in oklch, var(--primary) 58%, white 10%) !important;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.12), transparent 46%),
    linear-gradient(135deg, color-mix(in oklch, var(--primary) 92%, white 8%), color-mix(in oklch, var(--primary) 82%, #1d6c86 18%)) !important;
  color: var(--primary-foreground) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.2),
    0 12px 28px -20px color-mix(in oklch, var(--primary) 64%, transparent) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-primary-action::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 32%, rgb(255 255 255 / 0.10) 50%, transparent 68%);
  opacity: 0;
  transition: opacity 160ms ease;
}

[data-page-title="Preencher Planilha"] .asset-fill-primary-action:hover:not(:disabled)::after {
  opacity: 1;
}

/* Final processed-file hero action */
[data-page-title="Preencher Planilha"] .asset-fill-download-card {
  min-height: 7rem;
  padding: 1.25rem 1.35rem !important;
  border-radius: 1.15rem !important;
  border: 1px solid color-mix(in oklch, var(--primary) 28%, var(--border)) !important;
  background:
    radial-gradient(circle at 8% 50%, color-mix(in oklch, var(--primary) 9%, transparent), transparent 28%),
    linear-gradient(180deg, rgb(255 255 255 / 0.03), transparent 55%),
    color-mix(in oklch, var(--card) 95%, #07131f 5%) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.055),
    0 22px 48px -40px color-mix(in oklch, var(--primary) 56%, transparent) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card > div:first-of-type {
  width: 3.5rem !important;
  height: 3.5rem !important;
  border-radius: 1rem !important;
  border-color: color-mix(in oklch, var(--primary) 34%, var(--border)) !important;
  background:
    linear-gradient(145deg, color-mix(in oklch, var(--primary) 18%, var(--card)), color-mix(in oklch, var(--primary) 6%, var(--card))) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.09), 0 12px 26px -20px color-mix(in oklch, var(--primary) 55%, transparent) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card p.font-display {
  font-size: clamp(1.05rem, 1.8vw, 1.3rem) !important;
  letter-spacing: -0.025em;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card:hover:not(:disabled) {
  border-color: color-mix(in oklch, var(--primary) 48%, var(--border)) !important;
  transform: translateY(-2px);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.07),
    0 28px 60px -42px color-mix(in oklch, var(--primary) 68%, transparent) !important;
}

/* Result action bar */
[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.7rem !important;
  width: 100%;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > [data-slot="button"],
[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > a {
  width: 100% !important;
  min-width: 0 !important;
  min-height: 3.05rem !important;
  height: auto !important;
  justify-content: flex-start !important;
  gap: 0.65rem !important;
  padding: 0.72rem 0.9rem !important;
  border-radius: 0.9rem !important;
  border: 1px solid color-mix(in oklch, var(--border) 82%, white 4%) !important;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.012)),
    color-mix(in oklch, var(--card) 86%, transparent) !important;
  color: color-mix(in oklch, var(--foreground) 88%, var(--muted-foreground) 12%) !important;
  font-size: 0.78rem !important;
  font-weight: 650 !important;
  line-height: 1.2 !important;
  text-align: left !important;
  white-space: normal !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.035) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > [data-slot="button"] svg,
[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > a svg {
  width: 1rem !important;
  height: 1rem !important;
  color: color-mix(in oklch, var(--primary) 80%, #78d9e0 20%) !important;
  transition: transform 160ms ease, color 160ms ease;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > [data-slot="button"]:hover,
[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > a:hover {
  border-color: color-mix(in oklch, var(--primary) 34%, var(--border)) !important;
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--primary) 7%, transparent), transparent),
    color-mix(in oklch, var(--card) 92%, var(--primary) 8%) !important;
  color: var(--foreground) !important;
  transform: translateY(-1px);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.05), 0 14px 28px -26px color-mix(in oklch, var(--primary) 52%, transparent) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > [data-slot="button"]:hover svg,
[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > a:hover svg {
  transform: translateY(-1px) scale(1.05);
}

/* Make the unmatched report the strongest secondary action. */
[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > [data-slot="button"]:first-child {
  border-color: color-mix(in oklch, var(--primary) 36%, var(--border)) !important;
  background: linear-gradient(180deg, color-mix(in oklch, var(--primary) 8%, var(--card)), color-mix(in oklch, var(--card) 95%, black 5%)) !important;
}

/* Process another file is intentionally quiet. */
[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 > [data-slot="button"]:last-child {
  border-color: color-mix(in oklch, var(--border) 70%, transparent) !important;
  background: transparent !important;
  color: var(--muted-foreground) !important;
}

@media (max-width: 1180px) {
  [data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  [data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 {
    grid-template-columns: 1fr !important;
  }

  [data-page-title="Preencher Planilha"] .asset-fill-download-card {
    align-items: flex-start !important;
    min-height: 0;
  }

  [data-page-title="Preencher Planilha"] .justify-between.gap-2:has(> [data-slot="button"]) {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
  }
}
'''

path.write_text(text.rstrip() + append + '\n', encoding='utf-8')
