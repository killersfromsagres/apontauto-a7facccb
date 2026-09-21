from pathlib import Path

path = Path('public/inteligencia-ativos-preencher-premium.css')
text = path.read_text(encoding='utf-8')
marker = '/* === Processed spreadsheet CTA visibility fix · 2026-09-21 === */'
if marker in text:
    raise SystemExit('CTA visibility fix already applied')

append = r'''

/* === Processed spreadsheet CTA visibility fix · 2026-09-21 === */
[data-page-title="Preencher Planilha"] .asset-fill-download-card {
  position: relative !important;
  isolation: isolate;
  display: flex !important;
  align-items: center !important;
  gap: 1rem !important;
  min-height: 7.6rem !important;
  padding: 1.25rem 1.35rem !important;
  cursor: pointer !important;
  border: 1px solid color-mix(in oklch, var(--primary) 42%, var(--border)) !important;
  background:
    radial-gradient(circle at 3.5rem 50%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 12rem),
    linear-gradient(180deg, rgb(255 255 255 / 0.045), rgb(255 255 255 / 0.012)),
    color-mix(in oklch, var(--card) 94%, #07131f 6%) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.07),
    0 24px 56px -42px color-mix(in oklch, var(--primary) 62%, transparent) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: 1.15rem 0 0 1.15rem;
  background: linear-gradient(180deg, color-mix(in oklch, var(--primary) 78%, white 22%), color-mix(in oklch, var(--primary) 72%, #24a7bd 28%));
  opacity: 0.95;
  pointer-events: none;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card > div:first-of-type {
  width: 4rem !important;
  height: 4rem !important;
  flex: 0 0 4rem !important;
  border-radius: 1.05rem !important;
  border: 1px solid color-mix(in oklch, var(--primary) 72%, white 16%) !important;
  background:
    linear-gradient(145deg, color-mix(in oklch, var(--primary) 90%, white 10%), color-mix(in oklch, var(--primary) 82%, #167b94 18%)) !important;
  color: white !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.28),
    0 14px 30px -20px color-mix(in oklch, var(--primary) 84%, transparent) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card > div:first-of-type svg {
  width: 1.6rem !important;
  height: 1.6rem !important;
  color: white !important;
  stroke: white !important;
  stroke-width: 2.15 !important;
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.2));
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card > .min-w-0.flex-1 {
  min-width: 0 !important;
  padding-right: 0.5rem;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card p.font-display {
  margin: 0 !important;
  color: #f4f9ff !important;
  font-size: clamp(1.08rem, 1.7vw, 1.3rem) !important;
  font-weight: 760 !important;
  line-height: 1.15 !important;
  letter-spacing: -0.028em !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card p.text-xs {
  margin-top: 0.35rem !important;
  color: color-mix(in oklch, var(--muted-foreground) 84%, white 16%) !important;
  font-size: 0.75rem !important;
  line-height: 1.35 !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card p.text-\[11px\] {
  margin-top: 0.2rem !important;
  color: color-mix(in oklch, var(--muted-foreground) 90%, white 10%) !important;
  font-size: 0.7rem !important;
  line-height: 1.4 !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card::after {
  content: "BAIXAR XLSX";
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 8.7rem;
  min-height: 2.95rem;
  margin-left: auto;
  padding: 0.7rem 1rem;
  border: 1px solid color-mix(in oklch, var(--primary) 72%, white 14%);
  border-radius: 0.85rem;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.14), transparent 48%),
    color-mix(in oklch, var(--primary) 88%, #167c95 12%);
  color: #041016;
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.065em;
  text-align: center;
  white-space: nowrap;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.28),
    0 10px 26px -19px color-mix(in oklch, var(--primary) 82%, transparent);
  transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
  pointer-events: none;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card:hover:not(:disabled) {
  border-color: color-mix(in oklch, var(--primary) 62%, var(--border)) !important;
  transform: translateY(-2px);
  background:
    radial-gradient(circle at 3.5rem 50%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 13rem),
    linear-gradient(180deg, color-mix(in oklch, var(--primary) 5%, white 3%), transparent 58%),
    color-mix(in oklch, var(--card) 91%, var(--primary) 9%) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.085),
    0 30px 62px -42px color-mix(in oklch, var(--primary) 78%, transparent) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card:hover:not(:disabled)::after {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.32),
    0 14px 30px -18px color-mix(in oklch, var(--primary) 90%, transparent);
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card:focus-visible {
  outline: none !important;
  border-color: color-mix(in oklch, var(--primary) 78%, white 12%) !important;
  box-shadow:
    0 0 0 3px color-mix(in oklch, var(--primary) 22%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.08) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card > svg.text-emerald-500 {
  width: 1.15rem !important;
  height: 1.15rem !important;
  flex: 0 0 auto;
  color: #65d6a4 !important;
}

@media (max-width: 720px) {
  [data-page-title="Preencher Planilha"] .asset-fill-download-card {
    flex-wrap: wrap !important;
    align-items: flex-start !important;
    gap: 0.85rem !important;
    padding: 1rem !important;
  }

  [data-page-title="Preencher Planilha"] .asset-fill-download-card > div:first-of-type {
    width: 3.4rem !important;
    height: 3.4rem !important;
    flex-basis: 3.4rem !important;
  }

  [data-page-title="Preencher Planilha"] .asset-fill-download-card > .min-w-0.flex-1 {
    flex: 1 1 calc(100% - 4.4rem) !important;
    padding-right: 0 !important;
  }

  [data-page-title="Preencher Planilha"] .asset-fill-download-card p.text-xs {
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    overflow-wrap: anywhere;
  }

  [data-page-title="Preencher Planilha"] .asset-fill-download-card::after {
    flex: 1 0 100%;
    width: 100%;
    margin-left: 0;
    min-height: 3rem;
  }
}
'''

path.write_text(text.rstrip() + append + '\n', encoding='utf-8')
