from pathlib import Path

path = Path("src/features/relatorio-diario/daily-execution-report.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    ("        doc.setFillColor(...fill);", "        doc.setFillColor(fill[0], fill[1], fill[2]);"),
    ("        doc.setFillColor(...accent);", "        doc.setFillColor(accent[0], accent[1], accent[2]);"),
    ("        doc.setTextColor(...accent);", "        doc.setTextColor(accent[0], accent[1], accent[2]);"),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Expected PDF color call not found: {old}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
