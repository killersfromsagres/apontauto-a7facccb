from pathlib import Path

path = Path("src/components/taludes/polygon-editor-pro.tsx")
text = path.read_text(encoding="utf-8")

canvas_old = 'ctx.font = `800 ${16 * s}px Inter, Arial, sans-serif`;'
canvas_new = 'ctx.font = `800 ${18 * s}px Inter, Arial, sans-serif`;'
svg_old = 'fontSize="16" fontWeight="900"'
svg_new = 'fontSize="18" fontWeight="900"'

canvas_count = text.count(canvas_old)
svg_count = text.count(svg_old)

if canvas_count != 2:
    raise SystemExit(f"Expected 2 canvas date font occurrences, found {canvas_count}")
if svg_count != 2:
    raise SystemExit(f"Expected 2 SVG date font occurrences, found {svg_count}")

text = text.replace(canvas_old, canvas_new)
text = text.replace(svg_old, svg_new)
path.write_text(text, encoding="utf-8")

print("Taludes date numbers increased from 16px to 18px in screen and PNG export")
