from pathlib import Path

repo = Path('.')
editor = repo / 'src/components/taludes/polygon-editor-pro.tsx'
api = repo / 'src/lib/taludes/api.ts'

text = editor.read_text(encoding='utf-8')
api_text = api.read_text(encoding='utf-8')

# 1) API type + defaults
api_text = api_text.replace('  data_scale?: number;\n', '  data_scale?: number;\n  data_text_scale?: number;\n', 1)
api_text = api_text.replace('      numero_cor_texto: (m as any).numero_cor_texto || "#ffffff",\n', '      numero_cor_texto: (m as any).numero_cor_texto || "#ffffff",\n      data_text_scale: Number((m as any).data_text_scale ?? 1),\n', 1)
api_text = api_text.replace('        data_scale: payload.data_scale ?? 1,\n', '        data_scale: payload.data_scale ?? 1,\n        data_text_scale: payload.data_text_scale ?? 1,\n', 1)
api.write_text(api_text, encoding='utf-8')

# 2) New markings get a slightly more print-friendly date number scale
text = text.replace('        data_scale: 1,\n        numero_visivel: true,', '        data_scale: 1,\n        data_text_scale: 1.2,\n        numero_visivel: true,', 1)

# 3) Canvas/PNG export: separate number scale from card scale and expand width when needed
old = '''          const s = marking.data_scale || 1;\n          const currentDate = formatShortDate(marking.rotulo?.split(" - ")[1] || "");\n          const deadline = formatShortDate(marking.prazo_rotulo);\n          const width = 154 * s;\n          const height = (deadline ? 76 : 52) * s;'''
new = '''          const s = marking.data_scale || 1;\n          const textScale = marking.data_text_scale || 1;\n          const currentDate = formatShortDate(marking.rotulo?.split(" - ")[1] || "");\n          const deadline = formatShortDate(marking.prazo_rotulo);\n          const baseWidth = 154 + Math.max(0, textScale - 1) * 92;\n          const width = baseWidth * s;\n          const height = (deadline ? 76 : 52) * s;\n          const labelX = dataPos.x - width / 2 + 14 * s;\n          const valueX = dataPos.x - width / 2 + 72 * s;'''
if old not in text:
    raise SystemExit('canvas date block not found')
text = text.replace(old, new, 1)
text = text.replace('ctx.fillText("DE", dataPos.x - 62 * s, dataPos.y - (deadline ? 19 : 9) * s);', 'ctx.fillText("DE", labelX, dataPos.y - (deadline ? 19 : 9) * s);', 1)
text = text.replace('ctx.font = `800 ${18 * s}px Inter, Arial, sans-serif`;\n          ctx.fillText(currentDate || "—", dataPos.x - 6 * s, dataPos.y - (deadline ? 19 : 9) * s);', 'ctx.font = `800 ${18 * s * textScale}px Inter, Arial, sans-serif`;\n          ctx.fillText(currentDate || "—", valueX, dataPos.y - (deadline ? 19 : 9) * s);', 1)
text = text.replace('ctx.moveTo(dataPos.x - 62 * s, dataPos.y);\n            ctx.lineTo(dataPos.x + 62 * s, dataPos.y);', 'ctx.moveTo(dataPos.x - width / 2 + 14 * s, dataPos.y);\n            ctx.lineTo(dataPos.x + width / 2 - 14 * s, dataPos.y);', 1)
text = text.replace('ctx.fillText("ATÉ", dataPos.x - 62 * s, dataPos.y + 19 * s);', 'ctx.fillText("ATÉ", labelX, dataPos.y + 19 * s);', 1)
text = text.replace('ctx.font = `800 ${18 * s}px Inter, Arial, sans-serif`;\n            ctx.fillText(deadline, dataPos.x - 6 * s, dataPos.y + 19 * s);', 'ctx.font = `800 ${18 * s * textScale}px Inter, Arial, sans-serif`;\n            ctx.fillText(deadline, valueX, dataPos.y + 19 * s);', 1)

# 4) UI: rename old slider and add independent print-focused number sizing
text = text.replace('<FieldLabel>Tamanho de DE / ATÉ</FieldLabel>', '<FieldLabel>Tamanho do campo de datas</FieldLabel>', 1)
needle = '''                  aria-label="Tamanho dos campos De e Até"\n                />\n              </div>\n            </AccordionSection>'''
insert = '''                  aria-label="Tamanho dos campos De e Até"\n                />\n              </div>\n              <div className="space-y-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-2.5">\n                <div className="flex items-start justify-between gap-3">\n                  <div className="min-w-0">\n                    <FieldLabel>Tamanho dos números da data</FieldLabel>\n                    <p className="mt-1 text-[9px] leading-relaxed text-white/35">Aumenta somente 21/09, 22/09 etc. Ideal para impressão em folha A4.</p>\n                  </div>\n                  <span className="shrink-0 rounded-md border border-amber-300/15 bg-amber-300/[0.06] px-2 py-1 font-mono text-[9px] font-black tabular-nums text-amber-200">\n                    {(selected.data_text_scale || 1).toFixed(1)}x\n                  </span>\n                </div>\n                <input\n                  type="range"\n                  min="0.8"\n                  max="2.4"\n                  step="0.1"\n                  value={selected.data_text_scale || 1}\n                  onChange={(e) => updateLocal(selected.id, { data_text_scale: Number(e.target.value) })}\n                  onPointerUp={() => void persistPatch(selected.id, { data_text_scale: local.find((m) => m.id === selected.id)?.data_text_scale || 1 })}\n                  onKeyUp={() => void persistPatch(selected.id, { data_text_scale: local.find((m) => m.id === selected.id)?.data_text_scale || 1 })}\n                  className="w-full accent-amber-300"\n                  aria-label="Tamanho dos números das datas"\n                />\n                <div className="grid grid-cols-3 gap-1.5">\n                  {([[1, "Normal"], [1.7, "A4"], [2.2, "A4 grande"]] as const).map(([value, label]) => (\n                    <Button\n                      key={label}\n                      type="button"\n                      size="sm"\n                      variant={Math.abs((selected.data_text_scale || 1) - value) < 0.05 ? "warning" : "outline"}\n                      className="h-8 px-2 text-[9px]"\n                      onClick={() => void persistPatch(selected.id, { data_text_scale: value }, `Tamanho ${label} aplicado`)}\n                    >\n                      {label}\n                    </Button>\n                  ))}\n                </div>\n              </div>\n            </AccordionSection>'''
if needle not in text:
    raise SystemExit('date size UI insertion point not found')
text = text.replace(needle, insert, 1)

# 5) SVG screen rendering: independent number size + adaptive card width
old = '''              const statusDate = formatShortDate(marking.rotulo?.split(" - ")[1] || "");\n              const deadline = formatShortDate(marking.prazo_rotulo);'''
new = '''              const statusDate = formatShortDate(marking.rotulo?.split(" - ")[1] || "");\n              const deadline = formatShortDate(marking.prazo_rotulo);\n              const dateTextScale = marking.data_text_scale || 1;\n              const dateCardWidth = 154 + Math.max(0, dateTextScale - 1) * 92;\n              const dateLabelX = -dateCardWidth / 2 + 14;\n              const dateValueX = -dateCardWidth / 2 + 72;'''
if old not in text:
    raise SystemExit('svg date variables block not found')
text = text.replace(old, new, 1)
text = text.replace('<rect x="-77" y={deadline ? -38 : -26} width="154" height={deadline ? 76 : 52}', '<rect x={-dateCardWidth / 2} y={deadline ? -38 : -26} width={dateCardWidth} height={deadline ? 76 : 52}', 1)
text = text.replace('<text x="-63" y={deadline ? -17 : -5}', '<text x={dateLabelX} y={deadline ? -17 : -5}', 1)
text = text.replace('<text x="-6" y={deadline ? -17 : -5} fill={dateText} fontSize="18"', '<text x={dateValueX} y={deadline ? -17 : -5} fill={dateText} fontSize={18 * dateTextScale}', 1)
text = text.replace('<line x1="-63" x2="63" y1="0" y2="0"', '<line x1={-dateCardWidth / 2 + 14} x2={dateCardWidth / 2 - 14} y1="0" y2="0"', 1)
text = text.replace('<text x="-63" y="22"', '<text x={dateLabelX} y="22"', 1)
text = text.replace('<text x="-6" y="22" fill={dateText} fontSize="18"', '<text x={dateValueX} y="22" fill={dateText} fontSize={18 * dateTextScale}', 1)

editor.write_text(text, encoding='utf-8')
print('Taludes independent date number scaling applied')
