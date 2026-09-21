from pathlib import Path

route = Path('src/routes/_authenticated/inteligencia-ativos.preencher.tsx')
text = route.read_text(encoding='utf-8')

replacements = [
    (
        '''    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-card/60 p-5 backdrop-blur-xl sm:p-7",
        tone === "accent"
          ? "border-primary/40 shadow-[0_0_60px_-25px_oklch(0.85_0.12_220/0.9)]"
          : "border-border/60",
        className,
      )}
    >''',
        '''    <div
      data-asset-fill-panel={tone}
      className={cn(
        "asset-fill-panel relative overflow-hidden rounded-2xl border bg-card/70 p-5 sm:p-6",
        tone === "accent" ? "border-primary/30" : "border-border/60",
        className,
      )}
    >'''
    ),
    (
        '''                  "flex h-7 items-center gap-2 rounded-full border px-3 text-[11px] font-medium transition-colors sm:text-xs",''',
        '''                  "asset-fill-step flex h-8 items-center gap-2 border px-3 text-[11px] font-medium transition-colors sm:text-xs",'''
    ),
    (
        '''              <span
                className={cn(''',
        '''              <span
                aria-current={i === stepIndex ? "step" : undefined}
                className={cn('''
    ),
    (
        '''                "flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed px-4 py-12 transition-all sm:py-16",
                dragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-primary/25",''',
        '''                "asset-fill-dropzone flex flex-col items-center gap-5 rounded-2xl border border-dashed px-4 py-12 transition-all sm:py-16",
                dragging ? "border-primary bg-primary/[0.07] scale-[1.005]" : "border-primary/25",'''
    ),
    (
        '''                <div className="absolute inset-0 -z-10 animate-pulse rounded-3xl bg-gradient-to-br from-primary/40 to-violet-500/40 blur-2xl" />''',
        '''                <div className="asset-fill-upload-aura absolute inset-0 -z-10 rounded-3xl bg-primary/30 blur-2xl" />'''
    ),
    (
        '''                <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/25 via-violet-500/20 to-transparent shadow-elegant">''',
        '''                <div className="asset-fill-upload-icon flex h-24 w-24 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">'''
    ),
    (
        '''                className="h-12 rounded-2xl bg-primary text-primary-foreground shadow-[0_0_20px_-5px_oklch(0.85_0.12_220/0.5)] px-8 text-base font-semibold hover:opacity-90 hover:shadow-[0_0_25px_-5px_oklch(0.85_0.12_220/0.6)] transition-all"''',
        '''                className="asset-fill-primary-action h-12 px-8 text-base font-semibold"'''
    ),
    (
        '''          <LiquidPanel tone="accent" className="space-y-5 text-center">''',
        '''          <LiquidPanel tone="accent" className="asset-fill-processing space-y-5 text-center">'''
    ),
    (
        '''                className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-primary/40 bg-background/60 backdrop-blur-md p-4 text-left transition-all hover:border-primary/70 hover:shadow-[0_0_20px_-5px_oklch(0.85_0.12_220/0.3)] disabled:opacity-60 sm:p-5"''',
        '''                className="asset-fill-download-card group relative flex w-full items-center gap-4 overflow-hidden border p-4 text-left transition-all disabled:opacity-60 sm:p-5"'''
    ),
    (
        '''                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_0_15px_-3px_oklch(0.85_0.12_220/0.5)]">''',
        '''                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">'''
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Route patch target not found:\n{old[:220]}')
    text = text.replace(old, new, 1)

route.write_text(text, encoding='utf-8')

root = Path('src/routes/__root.tsx')
root_text = root.read_text(encoding='utf-8')
old = '      { rel: "stylesheet", href: "/corretiva-card-alignment.css" },'
new = old + '\n      { rel: "stylesheet", href: "/inteligencia-ativos-preencher-premium.css" },'
if old not in root_text:
    raise SystemExit('Root stylesheet insertion point not found')
if '/inteligencia-ativos-preencher-premium.css' not in root_text:
    root_text = root_text.replace(old, new, 1)
root.write_text(root_text, encoding='utf-8')
