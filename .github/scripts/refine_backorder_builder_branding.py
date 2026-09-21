from pathlib import Path

component = Path('src/components/backorder/spreadsheet-builder.tsx')
route = Path('src/routes/_authenticated/corretiva-novo.tsx')

c = component.read_text(encoding='utf-8')
c = c.replace('  WandSparkles,\n', '')
c = c.replace(
    '    <GlassCard className="overflow-hidden border-rose-400/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))]">',
    '    <GlassCard className="overflow-hidden border-amber-300/[0.10] bg-[linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))]">',
)
c = c.replace(
    '            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] text-rose-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">\n              <WandSparkles className="h-5 w-5" />\n            </div>',
    '            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-300/20 bg-[linear-gradient(145deg,rgba(251,191,36,0.12),rgba(255,255,255,0.025))] text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_14px_32px_-26px_rgba(245,158,11,0.85)] backdrop-blur-xl">\n              <FileSpreadsheet className="h-[1.35rem] w-[1.35rem]" strokeWidth={1.8} />\n            </div>',
)
c = c.replace(
    '                <Badge variant="outline" className="border-white/10 bg-white/[0.035] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">\n                  processamento local\n                </Badge>',
    '                <Badge variant="outline" className="border-white/[0.10] bg-white/[0.035] text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">\n                  processamento local\n                </Badge>',
)
component.write_text(c, encoding='utf-8')

r = route.read_text(encoding='utf-8')
r = r.replace(
    '                <Badge variant="outline" className="border-rose-400/20 bg-rose-400/[0.055] text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-200">\n                  Área exclusiva\n                </Badge>',
    '                <Badge variant="outline" className="border-amber-300/30 bg-[linear-gradient(145deg,rgba(251,191,36,0.14),rgba(245,158,11,0.055))] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_-20px_rgba(245,158,11,0.8)]">\n                  Área exclusiva\n                </Badge>',
)
route.write_text(r, encoding='utf-8')
