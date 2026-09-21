from pathlib import Path

route = Path("src/routes/_authenticated/programacao.tsx")
text = route.read_text(encoding="utf-8")

import_anchor = 'import { GlassCard } from "@/components/glass-card";\n'
import_line = 'import { BackorderSpreadsheetBuilder } from "@/components/backorder/spreadsheet-builder";\n'
if import_line not in text:
    if import_anchor not in text:
        raise SystemExit("GlassCard import anchor not found")
    text = text.replace(import_anchor, import_anchor + import_line, 1)

jsx_anchor = '''        <GlassCard>\n          <div className="space-y-5">\n            <SectionHeading\n              step="01"\n              icon={Layers3}\n              title="Planilhas mensais por equipe"'''
jsx_replacement = '''        <BackorderSpreadsheetBuilder />\n\n        <GlassCard>\n          <div className="space-y-5">\n            <SectionHeading\n              step="01"\n              icon={Layers3}\n              title="Planilhas mensais por equipe"'''
if '<BackorderSpreadsheetBuilder />' not in text:
    if jsx_anchor not in text:
        raise SystemExit("Programacao first step anchor not found")
    text = text.replace(jsx_anchor, jsx_replacement, 1)

route.write_text(text, encoding="utf-8")
