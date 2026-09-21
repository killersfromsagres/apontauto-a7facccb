from pathlib import Path

programacao = Path("src/routes/_authenticated/programacao.tsx")
corretiva = Path("src/routes/_authenticated/corretiva-novo.tsx")

p = programacao.read_text(encoding="utf-8")
p = p.replace('import { BackorderSpreadsheetBuilder } from "@/components/backorder/spreadsheet-builder";\n', "")
p = p.replace('        <BackorderSpreadsheetBuilder />\n\n', "")
programacao.write_text(p, encoding="utf-8")

c = corretiva.read_text(encoding="utf-8")
import_line = 'import { BackorderSpreadsheetBuilder } from "@/components/backorder/spreadsheet-builder";\n'
anchor_import = 'import { GlassCard } from "@/components/glass-card";\n'
if import_line not in c:
    if anchor_import not in c:
        raise SystemExit("Import anchor not found in corretiva-novo.tsx")
    c = c.replace(anchor_import, anchor_import + import_line, 1)

section = '''        <details className="group overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025] [&::-webkit-details-marker]:hidden sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-foreground">Montador de Backorders</span>
                <Badge variant="outline" className="border-rose-400/20 bg-rose-400/[0.055] text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-200">
                  Área exclusiva
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Importe uma planilha de Backorder, classifique automaticamente os chamados por equipe e gere o Excel pronto para impressão.
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t border-white/[0.07] p-3 sm:p-4">
            <BackorderSpreadsheetBuilder />
          </div>
        </details>

'''
anchor_section = '      <div className="space-y-6">\n        <GlassCard className="p-4">'
if '<BackorderSpreadsheetBuilder />' not in c:
    if anchor_section not in c:
        raise SystemExit("Render anchor not found in corretiva-novo.tsx")
    c = c.replace(
        anchor_section,
        '      <div className="space-y-6">\n' + section + '        <GlassCard className="p-4">',
        1,
    )
corretiva.write_text(c, encoding="utf-8")
