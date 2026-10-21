from pathlib import Path

path = Path("src/features/relatorio-diario/daily-execution-report.tsx")
text = path.read_text(encoding="utf-8")

# 1) Lucide icons used by the PDF climate configuration UI.
old = '''  Building2,\n  CalendarDays,\n  CheckCircle2,\n  Circle,\n  ClipboardCheck,'''
new = '''  Building2,\n  CalendarDays,\n  CheckCircle2,\n  Circle,\n  ClipboardCheck,\n  Cloud,\n  CloudRain,\n  CloudSun,'''
if old not in text:
    raise SystemExit("lucide import block not found")
text = text.replace(old, new, 1)

old = '''  Search,\n  Upload,\n  UserRound,\n  Wrench,'''
new = '''  Search,\n  Sun,\n  Thermometer,\n  Upload,\n  UserRound,\n  Wrench,'''
if old not in text:
    raise SystemExit("lucide import tail not found")
text = text.replace(old, new, 1)

# 2) Climate persistence + helpers.
old = '''const NOTE_KEY = "apontauto:relatorio-diario:observacao-programacao:v1";\nconst CATALOG_RENDER_LIMIT = 300;'''
new = '''const NOTE_KEY = "apontauto:relatorio-diario:observacao-programacao:v1";\nconst WEATHER_KEY = "apontauto:relatorio-diario:clima:v1";\nconst CATALOG_RENDER_LIMIT = 300;'''
if old not in text:
    raise SystemExit("storage constants not found")
text = text.replace(old, new, 1)

old = '''type PdfLogo = { dataUrl: string; ratio: number };\n\nconst todayIso = () => {'''
new = '''type PdfLogo = { dataUrl: string; ratio: number };\n\ntype WeatherCondition = "ensolarado" | "parcialmente_nublado" | "nublado" | "chuva" | "chuva_forte";\n\ntype DailyWeather = {\n  condition: WeatherCondition;\n  temperature: string;\n  rained: boolean;\n};\n\nconst DEFAULT_WEATHER: DailyWeather = { condition: "ensolarado", temperature: "", rained: false };\n\nconst WEATHER_OPTIONS: Array<{ value: WeatherCondition; label: string }> = [\n  { value: "ensolarado", label: "Ensolarado" },\n  { value: "parcialmente_nublado", label: "Parcialmente nublado" },\n  { value: "nublado", label: "Nublado" },\n  { value: "chuva", label: "Chovendo" },\n  { value: "chuva_forte", label: "Chuva forte" },\n];\n\nconst weatherConditionLabel = (condition: WeatherCondition) =>\n  WEATHER_OPTIONS.find((option) => option.value === condition)?.label ?? "Clima não informado";\n\nconst isRainyWeather = (condition: WeatherCondition) => condition === "chuva" || condition === "chuva_forte";\n\nconst hexToRgb = (hex: string): [number, number, number] => {\n  const normalized = hex.replace("#", "").trim();\n  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [100, 116, 139];\n  return [\n    parseInt(normalized.slice(0, 2), 16),\n    parseInt(normalized.slice(2, 4), 16),\n    parseInt(normalized.slice(4, 6), 16),\n  ];\n};\n\nconst tintRgb = (rgb: [number, number, number], amount = 0.88): [number, number, number] =>\n  rgb.map((channel) => Math.round(channel + (255 - channel) * amount)) as [number, number, number];\n\nconst darkenRgb = (rgb: [number, number, number], amount = 0.62): [number, number, number] =>\n  rgb.map((channel) => Math.max(0, Math.round(channel * amount))) as [number, number, number];\n\nconst todayIso = () => {'''
if old not in text:
    raise SystemExit("PdfLogo type block not found")
text = text.replace(old, new, 1)

# 3) Professional vector climate icon for jsPDF + UI icon component.
old = '''function drawContainedLogo(\n  doc: jsPDF,\n  logo: PdfLogo,\n  x: number,\n  y: number,\n  boxWidth: number,\n  boxHeight: number,\n) {\n  const boxRatio = boxWidth / boxHeight;\n  const width = logo.ratio >= boxRatio ? boxWidth : boxHeight * logo.ratio;\n  const height = logo.ratio >= boxRatio ? boxWidth / logo.ratio : boxHeight;\n  doc.addImage(\n    logo.dataUrl,\n    "PNG",\n    x + (boxWidth - width) / 2,\n    y + (boxHeight - height) / 2,\n    width,\n    height,\n    undefined,\n    "FAST",\n  );\n}\n\nexport function DailyExecutionReport() {'''
new = '''function drawContainedLogo(\n  doc: jsPDF,\n  logo: PdfLogo,\n  x: number,\n  y: number,\n  boxWidth: number,\n  boxHeight: number,\n) {\n  const boxRatio = boxWidth / boxHeight;\n  const width = logo.ratio >= boxRatio ? boxWidth : boxHeight * logo.ratio;\n  const height = logo.ratio >= boxRatio ? boxWidth / logo.ratio : boxHeight;\n  doc.addImage(\n    logo.dataUrl,\n    "PNG",\n    x + (boxWidth - width) / 2,\n    y + (boxHeight - height) / 2,\n    width,\n    height,\n    undefined,\n    "FAST",\n  );\n}\n\nfunction drawPdfWeatherIcon(doc: jsPDF, condition: WeatherCondition, x: number, y: number) {\n  const rainy = isRainyWeather(condition);\n  const cloudy = condition !== "ensolarado";\n  const partlyCloudy = condition === "parcialmente_nublado";\n\n  if (!cloudy || partlyCloudy) {\n    doc.setDrawColor(217, 119, 6);\n    doc.setFillColor(245, 158, 11);\n    const sunX = partlyCloudy ? x - 1.3 : x;\n    const sunY = partlyCloudy ? y - 0.8 : y;\n    doc.circle(sunX, sunY, 2.1, "F");\n    doc.setLineWidth(0.45);\n    for (let angle = 0; angle < 360; angle += 45) {\n      const radians = (angle * Math.PI) / 180;\n      doc.line(\n        sunX + Math.cos(radians) * 3.1,\n        sunY + Math.sin(radians) * 3.1,\n        sunX + Math.cos(radians) * 4.1,\n        sunY + Math.sin(radians) * 4.1,\n      );\n    }\n  }\n\n  if (cloudy) {\n    const cloudX = partlyCloudy ? x + 1.5 : x;\n    const cloudY = partlyCloudy ? y + 1.2 : y;\n    doc.setFillColor(rainy ? 14 : 100, rainy ? 165 : 116, rainy ? 233 : 139);\n    doc.circle(cloudX - 2.2, cloudY + 0.2, 1.8, "F");\n    doc.circle(cloudX, cloudY - 0.8, 2.25, "F");\n    doc.circle(cloudX + 2.4, cloudY + 0.15, 1.75, "F");\n    doc.roundedRect(cloudX - 3.8, cloudY, 7.6, 2.4, 1, 1, "F");\n    if (rainy) {\n      doc.setDrawColor(2, 132, 199);\n      doc.setLineWidth(0.45);\n      const drops = condition === "chuva_forte" ? [-2.4, -0.8, 0.8, 2.4] : [-1.7, 0, 1.7];\n      drops.forEach((offset, index) => {\n        const dropY = cloudY + 3.4 + (index % 2) * 0.5;\n        doc.line(cloudX + offset, dropY, cloudX + offset - 0.55, dropY + 1.35);\n      });\n    }\n  }\n}\n\nfunction WeatherUiIcon({ condition, className }: { condition: WeatherCondition; className?: string }) {\n  if (condition === "ensolarado") return <Sun className={className} />;\n  if (condition === "parcialmente_nublado") return <CloudSun className={className} />;\n  if (isRainyWeather(condition)) return <CloudRain className={className} />;\n  return <Cloud className={className} />;\n}\n\nexport function DailyExecutionReport() {'''
if old not in text:
    raise SystemExit("drawContainedLogo block not found")
text = text.replace(old, new, 1)

# 4) Weather state.
old = '''  const [author, setAuthor] = useState("");\n  const [note, setNote] = useState("");\n  const [loadingPortfolio, setLoadingPortfolio] = useState(false);'''
new = '''  const [author, setAuthor] = useState("");\n  const [note, setNote] = useState("");\n  const [weatherByDate, setWeatherByDate] = useState<Record<string, DailyWeather>>({});\n  const [loadingPortfolio, setLoadingPortfolio] = useState(false);'''
if old not in text:
    raise SystemExit("state insertion point not found")
text = text.replace(old, new, 1)

old = '''  const [generating, setGenerating] = useState(false);\n  const [dragging, setDragging] = useState(false);\n\n  const loadPortfolio = useCallback(async (notify = false) => {'''
new = '''  const [generating, setGenerating] = useState(false);\n  const [dragging, setDragging] = useState(false);\n  const weather = weatherByDate[selectedDate] ?? DEFAULT_WEATHER;\n\n  const updateWeather = (patch: Partial<DailyWeather>) => {\n    setWeatherByDate((current) => ({\n      ...current,\n      [selectedDate]: { ...(current[selectedDate] ?? DEFAULT_WEATHER), ...patch },\n    }));\n  };\n\n  const loadPortfolio = useCallback(async (notify = false) => {'''
if old not in text:
    raise SystemExit("weather derived state insertion point not found")
text = text.replace(old, new, 1)

# 5) Load/persist weather settings by report date.
old = '''    setRows(safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));\n    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");\n    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");\n    void Promise.all(['''
new = '''    setRows(safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));\n    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");\n    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");\n    setWeatherByDate(safeRead<Record<string, DailyWeather>>(WEATHER_KEY, {}));\n    void Promise.all(['''
if old not in text:
    raise SystemExit("initial load block not found")
text = text.replace(old, new, 1)

old = '''  useEffect(() => window.localStorage.setItem(ROWS_KEY, JSON.stringify(rows)), [rows]);\n  useEffect(() => window.localStorage.setItem(AUTHOR_KEY, author), [author]);\n  useEffect(() => window.localStorage.setItem(NOTE_KEY, note), [note]);'''
new = '''  useEffect(() => window.localStorage.setItem(ROWS_KEY, JSON.stringify(rows)), [rows]);\n  useEffect(() => window.localStorage.setItem(AUTHOR_KEY, author), [author]);\n  useEffect(() => window.localStorage.setItem(NOTE_KEY, note), [note]);\n  useEffect(() => window.localStorage.setItem(WEATHER_KEY, JSON.stringify(weatherByDate)), [weatherByDate]);'''
if old not in text:
    raise SystemExit("persistence effects not found")
text = text.replace(old, new, 1)

# 6) Replace four PDF indicators with Activities / Execution / Climate.
old = '''      const metricY = 35;\n      const metricGap = 3.5;\n      const metricW = (width - margin * 2 - metricGap * 3) / 4;\n      const metrics = [\n        ["ATIVIDADES", String(pdfRows.length), [248, 250, 252], [71, 85, 105]],\n        ["REALIZADAS", String(performed), [236, 253, 245], [5, 150, 105]],\n        ["PENDENTES", String(pending), [255, 251, 235], [217, 119, 6]],\n        ["EXECUÇÃO", `${rate}%`, [239, 246, 255], [2, 132, 199]],\n      ] as const;\n      metrics.forEach(([label, value, fill, accent], index) => {\n        const x = margin + index * (metricW + metricGap);\n        doc.setFillColor(fill[0], fill[1], fill[2]);\n        doc.setDrawColor(226, 232, 240);\n        doc.roundedRect(x, metricY, metricW, 14.5, 1.4, 1.4, "FD");\n        doc.setFillColor(accent[0], accent[1], accent[2]);\n        doc.roundedRect(x, metricY, 1.8, 14.5, 0.8, 0.8, "F");\n        doc.setFont("helvetica", "bold");\n        doc.setFontSize(6.2);\n        doc.setTextColor(100, 116, 139);\n        doc.text(label, x + 4.5, metricY + 4.5);\n        doc.setTextColor(accent[0], accent[1], accent[2]);\n        doc.setFontSize(13);\n        doc.text(value, x + 4.5, metricY + 11.8);\n      });\n\n      const infoY = 53.5;'''
new = '''      const metricY = 35;\n      const metricGap = 3.5;\n      const metricH = 17.5;\n      const metricW = (width - margin * 2 - metricGap * 2) / 3;\n      const metrics = [\n        ["ATIVIDADES", String(pdfRows.length), [248, 250, 252], [71, 85, 105]],\n        ["EXECUÇÃO", `${rate}%`, [239, 246, 255], [2, 132, 199]],\n      ] as const;\n      metrics.forEach(([label, value, fill, accent], index) => {\n        const x = margin + index * (metricW + metricGap);\n        doc.setFillColor(fill[0], fill[1], fill[2]);\n        doc.setDrawColor(226, 232, 240);\n        doc.roundedRect(x, metricY, metricW, metricH, 1.4, 1.4, "FD");\n        doc.setFillColor(accent[0], accent[1], accent[2]);\n        doc.roundedRect(x, metricY, 1.8, metricH, 0.8, 0.8, "F");\n        doc.setFont("helvetica", "bold");\n        doc.setFontSize(6.2);\n        doc.setTextColor(100, 116, 139);\n        doc.text(label, x + 4.5, metricY + 4.5);\n        doc.setTextColor(accent[0], accent[1], accent[2]);\n        doc.setFontSize(13);\n        doc.text(value, x + 4.5, metricY + 12.7);\n      });\n\n      const climateX = margin + 2 * (metricW + metricGap);\n      const climateRain = weather.rained || isRainyWeather(weather.condition);\n      const climateAccent: [number, number, number] = climateRain\n        ? [2, 132, 199]\n        : weather.condition === "ensolarado"\n          ? [217, 119, 6]\n          : [71, 85, 105];\n      const climateFill: [number, number, number] = climateRain\n        ? [240, 249, 255]\n        : weather.condition === "ensolarado"\n          ? [255, 251, 235]\n          : [248, 250, 252];\n      const climateTemperature = weather.temperature.trim()\n        ? `${weather.temperature.trim().replace(".", ",")} °C`\n        : "Temperatura não informada";\n      doc.setFillColor(climateFill[0], climateFill[1], climateFill[2]);\n      doc.setDrawColor(226, 232, 240);\n      doc.roundedRect(climateX, metricY, metricW, metricH, 1.4, 1.4, "FD");\n      doc.setFillColor(climateAccent[0], climateAccent[1], climateAccent[2]);\n      doc.roundedRect(climateX, metricY, 1.8, metricH, 0.8, 0.8, "F");\n      doc.setFont("helvetica", "bold");\n      doc.setFontSize(6.2);\n      doc.setTextColor(100, 116, 139);\n      doc.text("CLIMA", climateX + 4.5, metricY + 4.4);\n      doc.setTextColor(climateAccent[0], climateAccent[1], climateAccent[2]);\n      doc.setFontSize(9.2);\n      doc.text(weatherConditionLabel(weather.condition), climateX + 4.5, metricY + 9.8, { maxWidth: metricW - 21 });\n      doc.setFont("helvetica", "normal");\n      doc.setFontSize(6.9);\n      doc.setTextColor(71, 85, 105);\n      doc.text(\n        `${climateTemperature}${climateRain ? " • Chuva registrada" : ""}`,\n        climateX + 4.5,\n        metricY + 14.4,\n        { maxWidth: metricW - 21 },\n      );\n      drawPdfWeatherIcon(doc, weather.condition, climateX + metricW - 10.2, metricY + 8.6);\n\n      const infoY = 56.5;'''
if old not in text:
    raise SystemExit("metric block not found")
text = text.replace(old, new, 1)

# Remove now-unused pending variable from PDF calculations.
old = '''      const performed = pdfRows.filter((row) => stateOf(row) !== "pendente").length;\n      const pending = pdfRows.filter((row) => stateOf(row) === "pendente").length;\n      const rate = pdfRows.length ? Math.round((performed / pdfRows.length) * 100) : 0;'''
new = '''      const performed = pdfRows.filter((row) => stateOf(row) !== "pendente").length;\n      const rate = pdfRows.length ? Math.round((performed / pdfRows.length) * 100) : 0;'''
if old not in text:
    raise SystemExit("PDF performed/pending block not found")
text = text.replace(old, new, 1)

# 7) Remove SLA PDF column and redistribute width; make key fields bold.
old = '''        head: [["Status", "OS", "Tipo", "Equipe", "Local", "Atividade / O que foi feito", "Ativo", "SLA"]],'''
new = '''        head: [["Status", "OS", "Tipo", "Equipe", "Local", "Atividade / O que foi feito", "Ativo"]],'''
if old not in text:
    raise SystemExit("PDF head not found")
text = text.replace(old, new, 1)

old = '''            activityText,\n            row.asset || "—",\n            row.sla ? formatDateBr(row.sla) : "—",\n          ];'''
new = '''            activityText,\n            row.asset || "—",\n          ];'''
if old not in text:
    raise SystemExit("PDF SLA body value not found")
text = text.replace(old, new, 1)

old = '''        columnStyles: {\n          0: { cellWidth: 22, fontStyle: "bold", halign: "center" },\n          1: { cellWidth: 20, fontStyle: "bold" },\n          2: { cellWidth: 22 },\n          3: { cellWidth: 30 },\n          4: { cellWidth: 50 },\n          5: { cellWidth: 82 },\n          6: { cellWidth: 31 },\n          7: { cellWidth: 20 },\n        },'''
new = '''        columnStyles: {\n          0: { cellWidth: 22, fontStyle: "bold", halign: "center" },\n          1: { cellWidth: 22, fontStyle: "bold" },\n          2: { cellWidth: 24, fontStyle: "bold" },\n          3: { cellWidth: 33, fontStyle: "bold" },\n          4: { cellWidth: 55, fontStyle: "bold" },\n          5: { cellWidth: 88 },\n          6: { cellWidth: 33, fontStyle: "bold" },\n        },'''
if old not in text:
    raise SystemExit("PDF column styles not found")
text = text.replace(old, new, 1)

# 8) Team-color cell + yellow Corrective type, while preserving status row colors.
old = '''          } else if (cell.column.index === 0) {\n            cell.cell.styles.fillColor = [254, 249, 195];\n            cell.cell.styles.textColor = [180, 83, 9];\n          }\n        },'''
new = '''          } else if (cell.column.index === 0) {\n            cell.cell.styles.fillColor = [254, 249, 195];\n            cell.cell.styles.textColor = [180, 83, 9];\n          }\n\n          if ([1, 2, 3, 4, 6].includes(cell.column.index)) {\n            cell.cell.styles.fontStyle = "bold";\n          }\n\n          if (cell.column.index === 3) {\n            const teamRgb = hexToRgb(equipeHex(row.team));\n            cell.cell.styles.fillColor = tintRgb(teamRgb);\n            cell.cell.styles.textColor = darkenRgb(teamRgb);\n            cell.cell.styles.fontStyle = "bold";\n          }\n\n          if (cell.column.index === 2 && isCorrectiveActivity(row)) {\n            cell.cell.styles.fillColor = [254, 249, 195];\n            cell.cell.styles.textColor = [161, 98, 7];\n            cell.cell.styles.fontStyle = "bold";\n          }\n        },'''
if old not in text:
    raise SystemExit("didParseCell tail not found")
text = text.replace(old, new, 1)

# 9) Climate controls in the PDF sidebar.
old = '''              <label className="mt-2.5 block text-[10px] font-medium text-muted-foreground">Observação do dia</label>\n              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs" placeholder="Resumo, ocorrências ou observações" />\n              <Button onClick={() => void generatePdf()} disabled={generating} className="mt-3 w-full gap-2" size="sm">'''
new = '''              <label className="mt-2.5 block text-[10px] font-medium text-muted-foreground">Observação do dia</label>\n              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs" placeholder="Resumo, ocorrências ou observações" />\n\n              <div className="mt-3 rounded-xl border border-border bg-muted/20 p-2.5">\n                <div className="flex items-center gap-2">\n                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-sky-600">\n                    <WeatherUiIcon condition={weather.condition} className="h-4 w-4" />\n                  </span>\n                  <div>\n                    <p className="text-[10px] font-semibold">Clima do relatório</p>\n                    <p className="text-[9px] text-muted-foreground">Salvo separadamente para cada dia.</p>\n                  </div>\n                </div>\n\n                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_92px] gap-2">\n                  <div>\n                    <label className="block text-[9px] font-medium text-muted-foreground">Condição</label>\n                    <select\n                      value={weather.condition}\n                      onChange={(event) => {\n                        const condition = event.target.value as WeatherCondition;\n                        updateWeather({\n                          condition,\n                          rained: isRainyWeather(condition) ? true : weather.rained,\n                        });\n                      }}\n                      className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-[10px]"\n                    >\n                      {WEATHER_OPTIONS.map((option) => (\n                        <option key={option.value} value={option.value}>{option.label}</option>\n                      ))}\n                    </select>\n                  </div>\n                  <div>\n                    <label className="block text-[9px] font-medium text-muted-foreground">Temperatura</label>\n                    <div className="relative mt-1">\n                      <Thermometer className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />\n                      <Input\n                        type="number"\n                        step="0.1"\n                        value={weather.temperature}\n                        onChange={(event) => updateWeather({ temperature: event.target.value })}\n                        className="h-8 pl-7 pr-6 text-[10px]"\n                        placeholder="27"\n                      />\n                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-muted-foreground">°C</span>\n                    </div>\n                  </div>\n                </div>\n\n                <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-[10px] font-medium">\n                  <input\n                    type="checkbox"\n                    checked={weather.rained || isRainyWeather(weather.condition)}\n                    disabled={isRainyWeather(weather.condition)}\n                    onChange={(event) => updateWeather({ rained: event.target.checked })}\n                    className="h-3.5 w-3.5 rounded border-input"\n                  />\n                  <CloudRain className="h-3.5 w-3.5 text-sky-600" />\n                  Choveu no período\n                </label>\n              </div>\n\n              <Button onClick={() => void generatePdf()} disabled={generating} className="mt-3 w-full gap-2" size="sm">'''
if old not in text:
    raise SystemExit("PDF sidebar insertion point not found")
text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
