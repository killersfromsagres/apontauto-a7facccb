import fs from 'node:fs';

const patches = [];
function patch(path, from, to, label) {
  let text = fs.readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`Patch not found: ${label} in ${path}`);
  text = text.replace(from, to);
  fs.writeFileSync(path, text);
  patches.push(`${path}: ${label}`);
}

// 1) Corretiva Novo: use unified priority comparator, show Backorder and operational team colors.
patch(
  'src/routes/_authenticated/corretiva-novo.tsx',
  `  classifyPriority,\n  isHighPriority,\n  PRIORITY_ORDER,\n  type PriorityLevel,`,
  `  classifyPriority,\n  comparePriority,\n  isHighPriority,\n  type PriorityLevel,`,
  'priority imports',
);
patch(
  'src/routes/_authenticated/corretiva-novo.tsx',
  `        const priorityOrder =\n          PRIORITY_ORDER[pa.level] - PRIORITY_ORDER[pb.level] || pb.score - pa.score;\n        if (priorityOrder !== 0) return priorityOrder;`,
  `        const priorityOrder = comparePriority(pa, pb);\n        if (priorityOrder !== 0) return priorityOrder;`,
  'unified priority sorting',
);
patch(
  'src/routes/_authenticated/corretiva-novo.tsx',
  `                      equipe !== "todas" && equipeStyles(equipe as any).badge,`,
  `                      equipe !== "todas" && equipeStyles(equipe as any).button,`,
  'team filter button color',
);
patch(
  'src/routes/_authenticated/corretiva-novo.tsx',
  `                              equipeStyles(e as any).badge.replace("shadow-lg", ""),`,
  `                              equipeStyles(e as any).menu,`,
  'team menu colors',
);
patch(
  'src/routes/_authenticated/corretiva-novo.tsx',
  `                    priority.level === "CRÍTICA" && "border-red-400/20",`,
  `                    priority.level === "CRÍTICA" && "border-l-4 border-l-red-500 border-red-400/20",\n                    priority.level === "ALTA" && "border-l-4 border-l-orange-400",\n                    priority.level === "MÉDIA" && "border-l-4 border-l-amber-300",\n                    priority.level === "NORMAL" && "border-l-4 border-l-slate-500/40",`,
  'priority card accent',
);
patch(
  'src/routes/_authenticated/corretiva-novo.tsx',
  `                          <Badge\n                            variant="outline"\n                            className={cn(\n                              "text-[9px] font-extrabold uppercase md:text-[10px]",\n                              priorityBadgeClass(priority.level),\n                            )}\n                            title={\`Score \${priority.score}/100 · \${priority.reasons.join(" · ")}\`}\n                          >\n                            {priority.level} · {priority.score}\n                          </Badge>`,
  `                          <Badge\n                            variant="outline"\n                            className={cn(\n                              "text-[9px] font-extrabold uppercase md:text-[10px]",\n                              priorityBadgeClass(priority.level),\n                            )}\n                            title={\`Score \${priority.score}/100 · \${priority.reasons.join(" · ")}\`}\n                          >\n                            {priority.level} · {priority.score}\n                          </Badge>\n                          {priority.isBackorder && (\n                            <Badge\n                              variant="outline"\n                              className="border-indigo-400/35 bg-indigo-500/15 text-[9px] font-extrabold uppercase text-indigo-100 md:text-[10px]"\n                              title={priority.ageDays > 0 ? \`Backorder · aberto há \${priority.ageDays} dia(s)\` : "Backorder"}\n                            >\n                              BACKORDER\n                            </Badge>\n                          )}`,
  'backorder badge',
);

// 2) Monthly scheduler: Backorder means Backorder, and reserve two corrective slots when Programacao mixes external corrective allocations.
patch(
  'src/lib/preventiva/monthly-scheduler.ts',
  `import { businessDaysUntil, isoDate } from "./business-days";`,
  `import { businessDaysUntil, isoDate } from "./business-days";\nimport { classifyPriority, comparePriority, isBackorderCorrective } from "@/lib/corretiva/priority-classifier";`,
  'classifier imports',
);
patch(
  'src/lib/preventiva/monthly-scheduler.ts',
  `export function isCorrectiveBackorder(\n  row: CorrectiveSourceRow,\n  referenceDate: Date,\n): boolean {\n  const due = dueDate(row);\n  if (!due) return false;\n  const reference = new Date(\n    referenceDate.getFullYear(),\n    referenceDate.getMonth(),\n    referenceDate.getDate(),\n  );\n  return due.getTime() < reference.getTime();\n}`,
  `export function isCorrectiveBackorder(\n  row: CorrectiveSourceRow,\n  _referenceDate: Date,\n): boolean {\n  return isBackorderCorrective(row);\n}`,
  'actual backorder detection',
);
patch(
  'src/lib/preventiva/monthly-scheduler.ts',
  `function priorityLabel(row: CorrectiveSourceRow, referenceDate: Date): string {\n  const severity = problemSeverity(row);\n  const backorder = isCorrectiveBackorder(row, referenceDate);\n  const parts: string[] = [];\n  if (severity === 0) parts.push("Crítica");\n  else if (severity === 1) parts.push("Falha");\n  if (backorder) parts.push("Backorder");\n  return parts.join(" • ") || "Corretiva aberta";\n}`,
  `function priorityLabel(row: CorrectiveSourceRow, referenceDate: Date): string {\n  const priority = classifyPriority(row, referenceDate);\n  const parts = [\`\${priority.level} · \${priority.score}\`];\n  if (priority.isBackorder) parts.push("Backorder");\n  return parts.join(" • ");\n}`,
  'priority label',
);
patch(
  'src/lib/preventiva/monthly-scheduler.ts',
  `export function sortCorrectiveRows(\n  rows: CorrectiveSourceRow[],\n  referenceDate: Date,\n): CorrectiveSourceRow[] {\n  return [...rows].sort((a, b) => {\n    const backorder =\n      Number(!isCorrectiveBackorder(a, referenceDate)) -\n      Number(!isCorrectiveBackorder(b, referenceDate));\n    if (backorder !== 0) return backorder;\n\n    const bothBackorder =\n      isCorrectiveBackorder(a, referenceDate) &&\n      isCorrectiveBackorder(b, referenceDate);\n    if (bothBackorder) {\n      const severity = problemSeverity(a) - problemSeverity(b);\n      if (severity !== 0) return severity;\n    }\n\n    const dueA = dueDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;\n    const dueB = dueDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;\n    if (dueA !== dueB) return dueA - dueB;\n\n    if (!bothBackorder) {\n      const severity = problemSeverity(a) - problemSeverity(b);\n      if (severity !== 0) return severity;\n    }\n\n    const createdA =\n      validDate(a.data_criacao)?.getTime() ?? Number.MAX_SAFE_INTEGER;\n    const createdB =\n      validDate(b.data_criacao)?.getTime() ?? Number.MAX_SAFE_INTEGER;\n    return createdA - createdB;\n  });\n}`,
  `export function sortCorrectiveRows(\n  rows: CorrectiveSourceRow[],\n  referenceDate: Date,\n): CorrectiveSourceRow[] {\n  return [...rows].sort((a, b) => {\n    const priorityOrder = comparePriority(\n      classifyPriority(a, referenceDate),\n      classifyPriority(b, referenceDate),\n    );\n    if (priorityOrder !== 0) return priorityOrder;\n\n    const dueA = dueDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;\n    const dueB = dueDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;\n    if (dueA !== dueB) return dueA - dueB;\n\n    const createdA = validDate(a.data_criacao)?.getTime() ?? Number.MAX_SAFE_INTEGER;\n    const createdB = validDate(b.data_criacao)?.getTime() ?? Number.MAX_SAFE_INTEGER;\n    return createdA - createdB;\n  });\n}`,
  'unified corrective sorting',
);
patch(
  'src/lib/preventiva/monthly-scheduler.ts',
  `    const severity = problemSeverity(row);\n    const backorder = isCorrectiveBackorder(row, referenceDate);\n    if (severity === 0) critical += 1;\n    if (backorder) backorders += 1;`,
  `    const priority = classifyPriority(row, referenceDate);\n    const severity = problemSeverity(row);\n    const backorder = priority.isBackorder;\n    if (priority.level === "CRÍTICA") critical += 1;\n    if (backorder) backorders += 1;`,
  'mapping metrics',
);
patch(
  'src/lib/preventiva/monthly-scheduler.ts',
  `        programacaoBackorder: backorder,\n        programacaoGravidade: severity,`,
  `        programacaoBackorder: backorder,\n        programacaoGravidade: severity,\n        programacaoPrioridade: priority.level,\n        programacaoScore: priority.score,`,
  'mapping priority metadata',
);
patch(
  'src/lib/preventiva/monthly-scheduler.ts',
  `  minCorrectivesPerDay?: number;\n}): TeamMonthlySchedule {`,
  `  minCorrectivesPerDay?: number;\n  /** Reserva capacidade para corretivas que serão anexadas por outro alocador. */\n  reserveCorrectiveSlots?: boolean;\n}): TeamMonthlySchedule {`,
  'reserve option',
);
patch(
  'src/lib/preventiva/monthly-scheduler.ts',
  `    const availableForPreventivas = capSlots - correctiveCount;`,
  `    const reservedExternalCorrectives = options.reserveCorrectiveSlots\n      ? Math.min(minCorrectives, capSlots)\n      : 0;\n    const availableForPreventivas = Math.max(\n      0,\n      capSlots - Math.max(correctiveCount, reservedExternalCorrectives),\n    );`,
  'reserve daily corrective capacity',
);

// 3) Programacao calls scheduler with reserved capacity.
patch(
  'src/routes/_authenticated/programacao.tsx',
  `            minutosPorOS: tempoPorEquipe[equipe],\n          });`,
  `            minutosPorOS: tempoPorEquipe[equipe],\n            reserveCorrectiveSlots: true,\n          });`,
  'reserve slots in Programacao',
);

// 4) Corrective allocator: priority first and spread scarce correctives across weekdays.
patch(
  'src/lib/preventiva/corrective-program-reservations.ts',
  `    // Backorders continuam entrando primeiro.\n    const backorderOrder =\n      Number(isCorrectiveBackorder(b, referenceDate)) -\n      Number(isCorrectiveBackorder(a, referenceDate));\n    if (backorderOrder !== 0) return backorderOrder;\n\n    const aPriority = priorityOf(a);\n    const bPriority = priorityOf(b);\n    const priorityOrder =\n      PRIORITY_ORDER[aPriority.level] - PRIORITY_ORDER[bPriority.level] ||\n      bPriority.score - aPriority.score;\n    if (priorityOrder !== 0) return priorityOrder;`,
  `    const aPriority = priorityOf(a);\n    const bPriority = priorityOf(b);\n    const priorityOrder =\n      PRIORITY_ORDER[aPriority.level] - PRIORITY_ORDER[bPriority.level] ||\n      bPriority.score - aPriority.score ||\n      Number(bPriority.isBackorder) - Number(aPriority.isBackorder) ||\n      bPriority.ageDays - aPriority.ageDays;\n    if (priorityOrder !== 0) return priorityOrder;`,
  'priority before backorder',
);
patch(
  'src/lib/preventiva/corrective-program-reservations.ts',
  `  // Completa cada dia até 2 corretivas antes de avançar ao dia seguinte.\n  for (const row of eligible) {\n    if (totalAllocated(byDay) >= limit) break;\n    const keys = rowKeys(row);\n    if (keys.some((key) => selectedKeys.has(key))) continue;\n\n    const dayIndex = nextAvailableDay(byDay, perDay);\n    if (dayIndex < 0) break;\n\n    byDay[dayIndex].push(row);\n    keys.forEach((key) => selectedKeys.add(key));\n  }`,
  `  // Distribui a fila em rodadas: primeiro cobre SEG→SEX com uma corretiva,\n  // depois completa a segunda vaga. Com 10 disponíveis ficam 2 em cada dia;\n  // com menos, evita concentrar tudo no começo da semana.\n  const remaining = eligible.filter((row) => {\n    const keys = rowKeys(row);\n    return !keys.some((key) => selectedKeys.has(key));\n  });\n  let cursor = 0;\n  for (let round = 0; round < perDay && cursor < remaining.length; round += 1) {\n    for (let dayIndex = 0; dayIndex < businessDays && cursor < remaining.length; dayIndex += 1) {\n      if (byDay[dayIndex].length > round || byDay[dayIndex].length >= perDay) continue;\n      const row = remaining[cursor++];\n      byDay[dayIndex].push(row);\n      rowKeys(row).forEach((key) => selectedKeys.add(key));\n    }\n  }\n  while (cursor < remaining.length && totalAllocated(byDay) < limit) {\n    const dayIndex = nextAvailableDay(byDay, perDay);\n    if (dayIndex < 0) break;\n    const row = remaining[cursor++];\n    byDay[dayIndex].push(row);\n    rowKeys(row).forEach((key) => selectedKeys.add(key));\n  }`,
  'balanced weekday allocation',
);

// Remove now-unused actual-backorder import in reservations if TypeScript flags it.
patch(
  'src/lib/preventiva/corrective-program-reservations.ts',
  `import {\n  isCorrectiveBackorder,\n  resolveCorrectiveTeam,\n} from "./monthly-scheduler";`,
  `import { resolveCorrectiveTeam } from "./monthly-scheduler";`,
  'remove unused backorder import',
);

// 5) Weekly export: only the OS cell of a corrective is yellow/black.
const allRowYellow = `        if (isCorrective(os)) {\n          cell.fill = {\n            type: "pattern",\n            pattern: "solid",\n            fgColor: { argb: PALETTE.correctiveBg },\n          };\n          cell.font = {\n            ...cell.font,\n            color: { argb: PALETTE.correctiveText },\n          };\n        }`;
// Two occurrences (main sheet and team print sheet).
patch('src/lib/preventiva/weekly-exporter.ts', allRowYellow, `        // Corretivas mantêm o estilo normal da linha; apenas a célula OS recebe amarelo.`, 'remove full-row yellow main');
patch('src/lib/preventiva/weekly-exporter.ts', allRowYellow, `        // Corretivas mantêm o estilo normal da linha; apenas a célula OS recebe amarelo.`, 'remove full-row yellow team');

const osStyleMain = `        if (column.key === "os") {\n          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: teamArgb } };\n          cell.font = {\n            name: APTOS_EXTRABOLD,\n            bold: true,\n            size: 11,\n            color: { argb: readableTextColor(teamHex) },\n          };\n        } else if (column.key === "equipe") {`;
patch(
  'src/lib/preventiva/weekly-exporter.ts',
  osStyleMain,
  `        if (column.key === "os") {\n          const corrective = isCorrective(os);\n          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: corrective ? PALETTE.correctiveBg : teamArgb } };\n          cell.font = {\n            name: APTOS_EXTRABOLD,\n            bold: true,\n            size: 11,\n            color: { argb: corrective ? PALETTE.correctiveText : readableTextColor(teamHex) },\n          };\n        } else if (column.key === "equipe") {`,
  'yellow OS only main',
);
const osStyleTeam = `        if (column.key === "os") {\n          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: teamArgb } };\n          cell.font = {\n            name: APTOS_EXTRABOLD,\n            bold: true,\n            size: 10,\n            color: { argb: readableTextColor(teamHex) },\n          };\n        } else if (column.key === "equipe") {`;
patch(
  'src/lib/preventiva/weekly-exporter.ts',
  osStyleTeam,
  `        if (column.key === "os") {\n          const corrective = isCorrective(os);\n          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: corrective ? PALETTE.correctiveBg : teamArgb } };\n          cell.font = {\n            name: APTOS_EXTRABOLD,\n            bold: true,\n            size: 10,\n            color: { argb: corrective ? PALETTE.correctiveText : readableTextColor(teamHex) },\n          };\n        } else if (column.key === "equipe") {`,
  'yellow OS only team',
);
// Do not make Activity yellow either.
const activityMain = `        } else if (column.key === "atividade" && isCorrective(os)) {\n          cell.fill = {\n            type: "pattern",\n            pattern: "solid",\n            fgColor: { argb: PALETTE.warningBg },\n          };\n          cell.font = {\n            name: APTOS_SEMIBOLD,\n            bold: true,\n            size: 11,\n            color: { argb: PALETTE.warningText },\n          };\n        } else if (`;
patch('src/lib/preventiva/weekly-exporter.ts', activityMain, `        } else if (`, 'normal activity cell main');
const activityTeam = `        } else if (column.key === "atividade" && isCorrective(os)) {\n          cell.fill = {\n            type: "pattern",\n            pattern: "solid",\n            fgColor: { argb: PALETTE.warningBg },\n          };\n          cell.font = {\n            name: APTOS_SEMIBOLD,\n            bold: true,\n            size: 10,\n            color: { argb: PALETTE.warningText },\n          };\n        } else if (`;
patch('src/lib/preventiva/weekly-exporter.ts', activityTeam, `        } else if (`, 'normal activity cell team');

// 6) Material Control: reconcile field request by MAT reference and avoid duplicate visual rows.
patch(
  'src/lib/controle/data.ts',
  `function requestSignature(numeroOs: string, descricao: string, quantidade: number | null) {`,
  `function extractRequestRef(value: unknown) {\n  const match = String(value ?? "").match(/(?:REF\\.?\\s*)?(MAT-[A-Z0-9-]+)/i);\n  return match?.[1]?.toUpperCase() ?? null;\n}\n\nfunction requestSignature(numeroOs: string, descricao: string, quantidade: number | null) {`,
  'request reference helper',
);
patch(
  'src/lib/controle/data.ts',
  `  (rPecas.data ?? []).forEach((row) => pushPeca(row, "refrigeracao"));\n  (cPecas.data ?? []).forEach((row) => pushPeca(row, "corretiva"));`,
  `  const fieldRequestRefs = new Set(\n    ((fieldRequests.data ?? []) as unknown as MaterialSolicitacaoRow[])\n      .map((request) => extractRequestRef(request.observacao))\n      .filter((value): value is string => Boolean(value)),\n  );\n\n  (rPecas.data ?? []).forEach((row) => pushPeca(row, "refrigeracao"));\n  (cPecas.data ?? []).forEach((row: any) => {\n    const ref = extractRequestRef(row.observacao);\n    // A solicitação material_solicitacoes é a representação canônica na Central.\n    // O registro em corretiva_pecas permanece ligado à OS, mas não vira uma segunda linha.\n    if (ref && fieldRequestRefs.has(ref)) return;\n    pushPeca(row, "corretiva");\n  });`,
  'dedupe field material requests',
);

// 7) Control Materials UI: useful urgent KPI and clearer labels.
patch(
  'src/routes/_authenticated/controle-materiais.tsx',
  `    const received = items.filter((item) => item.meta?.status_compra === "recebido").length;\n    const inPurchase = items.filter((item) =>`,
  `    const received = items.filter((item) => item.meta?.status_compra === "recebido").length;\n    const urgent = items.filter((item) => /alta|urgente|crit/i.test(String(item.urgencia ?? item.gravidade ?? ""))).length;\n    const inPurchase = items.filter((item) =>`,
  'urgent KPI calculation',
);
patch(
  'src/routes/_authenticated/controle-materiais.tsx',
  `      received,\n      inPurchase,`,
  `      received,\n      urgent,\n      inPurchase,`,
  'urgent KPI result',
);
patch(
  'src/routes/_authenticated/controle-materiais.tsx',
  `<Kpi icon={CalendarClock} label="A solicitar" value={kpis.pending} hint="Ainda não enviados" tone="bg-amber-500/12 text-amber-500" />`,
  `<Kpi icon={AlertTriangle} label="Urgentes" value={kpis.urgent} hint="Alta urgência / gravidade" tone="bg-rose-500/12 text-rose-500" />`,
  'urgent KPI card',
);

// 8) Excel Control Materials: larger operational description/location rows.
patch(
  'src/lib/controle/export.ts',
  `    row.height = 22;`,
  `    row.height = 30;`,
  'larger material export rows',
);
patch(
  'src/lib/controle/export.ts',
  `      cell.font = { name: FONT, size: 9, color: { argb: C.ink } };`,
  `      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };`,
  'larger material export font',
);

console.log(`Applied ${patches.length} operation patches`);
for (const line of patches) console.log(`- ${line}`);
