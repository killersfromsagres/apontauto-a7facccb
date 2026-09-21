from pathlib import Path

route = Path("src/routes/_authenticated/inteligencia-ativos.preencher.tsx")
text = route.read_text(encoding="utf-8")

text = text.replace('import { Switch } from "@/components/ui/switch";\n', '')

old = '''function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
'''

new = '''function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      className="asset-fill-option-card"
      onClick={() => onChange(!checked)}
    >
      <span className="asset-fill-option-copy">
        <span className="asset-fill-option-title">{label}</span>
        <span className="asset-fill-option-hint">{hint}</span>
      </span>

      <span className="asset-fill-option-control" data-state={checked ? "checked" : "unchecked"} aria-hidden="true">
        <span className="asset-fill-option-state">{checked ? "Ativado" : "Desativado"}</span>
        <span className="asset-fill-option-indicator">
          {checked ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </span>
      </span>
    </button>
  );
}
'''

if old not in text:
    raise SystemExit("ToggleRow original block not found; refusing unsafe patch")

route.write_text(text.replace(old, new), encoding="utf-8")

css_path = Path("public/inteligencia-ativos-preencher-premium.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* === Glass controls v2 · clear state + neutral actions · 2026-09-21 === */"
if marker not in css:
    css += r'''

/* === Glass controls v2 · clear state + neutral actions · 2026-09-21 === */
[data-page-title="Preencher Planilha"] {
  --asset-glass-line: rgb(255 255 255 / 0.105);
  --asset-glass-line-strong: rgb(255 255 255 / 0.17);
  --asset-glass-fill: rgb(255 255 255 / 0.045);
  --asset-glass-fill-hover: rgb(255 255 255 / 0.072);
  --asset-glass-active: rgb(52 211 153 / 0.10);
  --asset-glass-active-line: rgb(110 231 183 / 0.34);
  --asset-glass-text: rgb(244 247 250 / 0.96);
  --asset-glass-muted: rgb(203 213 225 / 0.58);
}

/* Option rows are now full-size, explicit glass switches instead of tiny toggles. */
[data-page-title="Preencher Planilha"] .asset-fill-option-card {
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: 5.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
  padding: 1rem 1.05rem 1rem 1.15rem;
  overflow: hidden;
  border: 1px solid var(--asset-glass-line) !important;
  border-radius: 1.15rem !important;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 0.052), rgb(255 255 255 / 0.014) 54%, rgb(255 255 255 / 0.026)),
    rgb(8 14 21 / 0.58) !important;
  color: var(--asset-glass-text) !important;
  text-align: left;
  backdrop-filter: blur(24px) saturate(1.12);
  -webkit-backdrop-filter: blur(24px) saturate(1.12);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.055),
    0 16px 38px -34px rgb(0 0 0 / 0.78) !important;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: 0 999px 999px 0;
  background: rgb(255 255 255 / 0.12);
  opacity: 0.55;
  transition: background 180ms ease, opacity 180ms ease, box-shadow 180ms ease;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-card::after {
  content: "";
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 92% 50%, rgb(255 255 255 / 0.045), transparent 28%);
  opacity: 0.7;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-card:hover {
  transform: translateY(-1px);
  border-color: var(--asset-glass-line-strong) !important;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 0.072), rgb(255 255 255 / 0.022) 54%, rgb(255 255 255 / 0.036)),
    rgb(8 14 21 / 0.66) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.075),
    0 20px 44px -34px rgb(0 0 0 / 0.85) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-card[data-state="checked"] {
  border-color: var(--asset-glass-active-line) !important;
  background:
    linear-gradient(135deg, rgb(52 211 153 / 0.075), rgb(255 255 255 / 0.025) 48%, rgb(16 185 129 / 0.045)),
    rgb(8 15 20 / 0.66) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.075),
    inset 0 0 0 1px rgb(52 211 153 / 0.025),
    0 20px 46px -36px rgb(16 185 129 / 0.34) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-card[data-state="checked"]::before {
  background: linear-gradient(180deg, rgb(167 243 208 / 0.95), rgb(52 211 153 / 0.88));
  opacity: 1;
  box-shadow: 0 0 18px rgb(52 211 153 / 0.28);
}

[data-page-title="Preencher Planilha"] .asset-fill-option-card:focus-visible {
  outline: none !important;
  border-color: rgb(255 255 255 / 0.26) !important;
  box-shadow:
    0 0 0 3px rgb(255 255 255 / 0.08),
    inset 0 1px 0 rgb(255 255 255 / 0.08) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-copy {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.28rem;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-title {
  display: block;
  color: rgb(248 250 252 / 0.96);
  font-size: 0.94rem;
  font-weight: 720;
  letter-spacing: -0.018em;
  line-height: 1.3;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-hint {
  display: block;
  color: var(--asset-glass-muted);
  font-size: 0.76rem;
  font-weight: 500;
  line-height: 1.45;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-control {
  min-width: 9.6rem;
  height: 2.7rem;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  padding: 0.3rem 0.34rem 0.3rem 0.85rem;
  border: 1px solid rgb(255 255 255 / 0.10);
  border-radius: 999px;
  background: rgb(2 6 10 / 0.42);
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.025);
  transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-state {
  flex: 1 1 auto;
  color: rgb(203 213 225 / 0.50);
  font-size: 0.64rem;
  font-weight: 780;
  letter-spacing: 0.105em;
  text-transform: uppercase;
  text-align: center;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-indicator {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 0.08);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.055);
  color: rgb(203 213 225 / 0.55);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.035);
  transition: transform 180ms ease, background 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

[data-page-title="Preencher Planilha"] .asset-fill-option-control[data-state="checked"] {
  border-color: rgb(110 231 183 / 0.27);
  background: rgb(16 185 129 / 0.075);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.045), 0 8px 22px -18px rgb(16 185 129 / 0.65);
}

[data-page-title="Preencher Planilha"] .asset-fill-option-control[data-state="checked"] .asset-fill-option-state {
  color: rgb(167 243 208 / 0.92);
}

[data-page-title="Preencher Planilha"] .asset-fill-option-control[data-state="checked"] .asset-fill-option-indicator {
  transform: rotate(0deg) scale(1.02);
  border-color: rgb(209 250 229 / 0.76);
  background: rgb(236 253 245 / 0.96);
  color: rgb(6 78 59 / 0.98);
  box-shadow: 0 7px 18px -11px rgb(52 211 153 / 0.85), inset 0 1px 0 white;
}

/* Neutral glass button language: removes the old cyan/blue action treatment. */
[data-page-title="Preencher Planilha"] [data-slot="button"]:not(.asset-fill-option-card),
[data-page-title="Preencher Planilha"] a[role="button"] {
  border-color: var(--asset-glass-line) !important;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.062), rgb(255 255 255 / 0.018)),
    rgb(8 14 21 / 0.54) !important;
  color: rgb(241 245 249 / 0.92) !important;
  backdrop-filter: blur(18px) saturate(1.08);
  -webkit-backdrop-filter: blur(18px) saturate(1.08);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.055), 0 12px 28px -26px rgb(0 0 0 / 0.82) !important;
}

[data-page-title="Preencher Planilha"] [data-slot="button"]:not(.asset-fill-option-card):hover:not(:disabled),
[data-page-title="Preencher Planilha"] a[role="button"]:hover {
  border-color: var(--asset-glass-line-strong) !important;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.092), rgb(255 255 255 / 0.028)),
    rgb(8 14 21 / 0.64) !important;
  color: white !important;
  transform: translateY(-1px);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.075), 0 17px 32px -27px rgb(0 0 0 / 0.9) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-primary-action,
[data-page-title="Preencher Planilha"] button.bg-primary {
  border-color: rgb(255 255 255 / 0.20) !important;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.145), rgb(255 255 255 / 0.052)),
    rgb(15 23 31 / 0.72) !important;
  color: rgb(248 250 252 / 0.98) !important;
  filter: none !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.12),
    inset 0 0 0 1px rgb(255 255 255 / 0.018),
    0 18px 34px -28px rgb(0 0 0 / 0.94) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-primary-action:hover:not(:disabled),
[data-page-title="Preencher Planilha"] button.bg-primary:hover:not(:disabled) {
  border-color: rgb(167 243 208 / 0.30) !important;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.17), rgb(52 211 153 / 0.055)),
    rgb(15 23 31 / 0.80) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.14),
    0 20px 40px -30px rgb(16 185 129 / 0.32) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-primary-action svg,
[data-page-title="Preencher Planilha"] button.bg-primary svg {
  color: rgb(209 250 229 / 0.92) !important;
}

/* Active preview filters stay obvious without returning to blue. */
[data-page-title="Preencher Planilha"] button.bg-primary.rounded-full {
  border-color: rgb(110 231 183 / 0.30) !important;
  background: rgb(16 185 129 / 0.085) !important;
  color: rgb(209 250 229 / 0.96) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.055) !important;
}

/* Neutralize cyan remnants in result actions and download hero. */
[data-page-title="Preencher Planilha"] .asset-fill-download-card {
  border-color: rgb(255 255 255 / 0.13) !important;
  background:
    radial-gradient(circle at 8% 50%, rgb(255 255 255 / 0.04), transparent 28%),
    linear-gradient(180deg, rgb(255 255 255 / 0.045), rgb(255 255 255 / 0.012)),
    rgb(8 14 21 / 0.66) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.065), 0 22px 48px -40px rgb(0 0 0 / 0.88) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card > div:first-of-type {
  border-color: rgb(255 255 255 / 0.16) !important;
  background: linear-gradient(145deg, rgb(255 255 255 / 0.105), rgb(255 255 255 / 0.035)) !important;
  color: rgb(236 253 245 / 0.92) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 12px 26px -20px rgb(0 0 0 / 0.8) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-download-card + .flex.flex-wrap.gap-2 svg {
  color: rgb(226 232 240 / 0.82) !important;
}

[data-page-title="Preencher Planilha"] .asset-fill-step[aria-current="step"] {
  border-color: rgb(110 231 183 / 0.25) !important;
  background: linear-gradient(180deg, rgb(52 211 153 / 0.075), rgb(255 255 255 / 0.018)) !important;
  color: rgb(236 253 245 / 0.94) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.045) !important;
}

[data-page-title="Preencher Planilha"] button:focus-visible,
[data-page-title="Preencher Planilha"] input:focus-visible,
[data-page-title="Preencher Planilha"] [role="combobox"]:focus-visible {
  box-shadow: 0 0 0 3px rgb(255 255 255 / 0.085) !important;
}

@media (max-width: 640px) {
  [data-page-title="Preencher Planilha"] .asset-fill-option-card {
    align-items: stretch;
    flex-direction: column;
    gap: 0.9rem;
  }

  [data-page-title="Preencher Planilha"] .asset-fill-option-control {
    width: 100%;
    min-width: 0;
    justify-content: space-between;
  }
}
'''
    css_path.write_text(css, encoding="utf-8")
