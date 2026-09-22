from pathlib import Path

path = Path("src/components/taludes/polygon-editor-pro.tsx")
text = path.read_text(encoding="utf-8")

old_canvas = '''          const baseWidth = 154 + Math.max(0, textScale - 1) * 92;\n          const width = baseWidth * s;\n          const height = (deadline ? 76 : 52) * s;\n          const labelX = dataPos.x - width / 2 + 14 * s;\n          const valueX = dataPos.x - width / 2 + 72 * s;'''
new_canvas = '''          const baseWidth = 154 + Math.max(0, textScale - 1) * 92;\n          const valueFontSize = 18 * textScale;\n          const rowHeight = Math.max(38, valueFontSize + 16);\n          const innerGap = deadline ? Math.max(8, 4 * textScale) : 0;\n          const baseHeight = deadline ? rowHeight * 2 + innerGap + 12 : rowHeight + 14;\n          const width = baseWidth * s;\n          const height = baseHeight * s;\n          const firstRowY = deadline ? dataPos.y - ((rowHeight + innerGap) / 2) * s : dataPos.y;\n          const secondRowY = deadline ? dataPos.y + ((rowHeight + innerGap) / 2) * s : dataPos.y;\n          const labelX = dataPos.x - width / 2 + 14 * s;\n          const valueX = dataPos.x - width / 2 + 72 * s;'''
if old_canvas not in text:
    raise SystemExit("Canvas sizing block not found")
text = text.replace(old_canvas, new_canvas, 1)

text = text.replace('ctx.fillText("DE", labelX, dataPos.y - (deadline ? 19 : 9) * s);', 'ctx.fillText("DE", labelX, firstRowY);', 1)
text = text.replace('ctx.fillText(currentDate || "—", valueX, dataPos.y - (deadline ? 19 : 9) * s);', 'ctx.fillText(currentDate || "—", valueX, firstRowY);', 1)
text = text.replace('ctx.fillText("ATÉ", labelX, dataPos.y + 19 * s);', 'ctx.fillText("ATÉ", labelX, secondRowY);', 1)
text = text.replace('ctx.fillText(deadline, valueX, dataPos.y + 19 * s);', 'ctx.fillText(deadline, valueX, secondRowY);', 1)

old_svg_vars = '''              const dateTextScale = marking.data_text_scale || 1;\n              const dateCardWidth = 154 + Math.max(0, dateTextScale - 1) * 92;\n              const dateLabelX = -dateCardWidth / 2 + 14;\n              const dateValueX = -dateCardWidth / 2 + 72;'''
new_svg_vars = '''              const dateTextScale = marking.data_text_scale || 1;\n              const dateCardWidth = 154 + Math.max(0, dateTextScale - 1) * 92;\n              const dateValueFontSize = 18 * dateTextScale;\n              const dateRowHeight = Math.max(38, dateValueFontSize + 16);\n              const dateInnerGap = deadline ? Math.max(8, 4 * dateTextScale) : 0;\n              const dateCardHeight = deadline ? dateRowHeight * 2 + dateInnerGap + 12 : dateRowHeight + 14;\n              const dateFirstRowY = deadline ? -(dateRowHeight + dateInnerGap) / 2 : 0;\n              const dateSecondRowY = deadline ? (dateRowHeight + dateInnerGap) / 2 : 0;\n              const dateLabelX = -dateCardWidth / 2 + 14;\n              const dateValueX = -dateCardWidth / 2 + 72;'''
if old_svg_vars not in text:
    raise SystemExit("SVG sizing variables block not found")
text = text.replace(old_svg_vars, new_svg_vars, 1)

old_svg_block = '''                      <rect x={-dateCardWidth / 2} y={deadline ? -38 : -26} width={dateCardWidth} height={deadline ? 76 : 52} rx="12" fill={hexToRgba(dateBg, 0.9)} stroke={hexToRgba(dateText, 0.25)} strokeWidth="1.2" className="drop-shadow-lg" />\n                      <text x={dateLabelX} y={deadline ? -17 : -5} fill={hexToRgba(dateText, 0.58)} fontSize="9" fontWeight="800">DE</text>\n                      <text x={dateValueX} y={deadline ? -17 : -5} fill={dateText} fontSize={18 * dateTextScale} fontWeight="900">{statusDate || "—"}</text>\n                      {deadline && <><line x1={-dateCardWidth / 2 + 14} x2={dateCardWidth / 2 - 14} y1="0" y2="0" stroke={hexToRgba(dateText, 0.12)} /><text x={dateLabelX} y="22" fill={hexToRgba(dateText, 0.58)} fontSize="9" fontWeight="800">ATÉ</text><text x={dateValueX} y="22" fill={dateText} fontSize={18 * dateTextScale} fontWeight="900">{deadline}</text></>}'''
new_svg_block = '''                      <rect x={-dateCardWidth / 2} y={-dateCardHeight / 2} width={dateCardWidth} height={dateCardHeight} rx="12" fill={hexToRgba(dateBg, 0.9)} stroke={hexToRgba(dateText, 0.25)} strokeWidth="1.2" className="drop-shadow-lg" />\n                      <text x={dateLabelX} y={dateFirstRowY} dominantBaseline="middle" fill={hexToRgba(dateText, 0.58)} fontSize="9" fontWeight="800">DE</text>\n                      <text x={dateValueX} y={dateFirstRowY} dominantBaseline="middle" fill={dateText} fontSize={dateValueFontSize} fontWeight="900">{statusDate || "—"}</text>\n                      {deadline && <><line x1={-dateCardWidth / 2 + 14} x2={dateCardWidth / 2 - 14} y1="0" y2="0" stroke={hexToRgba(dateText, 0.12)} /><text x={dateLabelX} y={dateSecondRowY} dominantBaseline="middle" fill={hexToRgba(dateText, 0.58)} fontSize="9" fontWeight="800">ATÉ</text><text x={dateValueX} y={dateSecondRowY} dominantBaseline="middle" fill={dateText} fontSize={dateValueFontSize} fontWeight="900">{deadline}</text></>}'''
if old_svg_block not in text:
    raise SystemExit("SVG date render block not found")
text = text.replace(old_svg_block, new_svg_block, 1)

path.write_text(text, encoding="utf-8")
print("Taludes date card alignment synchronized with date number scale")
