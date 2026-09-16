import fs from 'node:fs';

function patch(path, from, to, label) {
  let text = fs.readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`Patch not found: ${label}`);
  text = text.replace(from, to);
  fs.writeFileSync(path, text);
  console.log(`Applied: ${label}`);
}

const path = 'src/lib/controle/pdf.ts';

patch(
  path,
  `function addPdfHeader(doc: any, exportedCount: number, corretivaCount: number, refrigeracaoCount: number) {`,
  `function addPdfHeader(\n  doc: any,\n  exportedCount: number,\n  corretivaCount: number,\n  refrigeracaoCount: number,\n  fieldCount: number,\n  urgentCount: number,\n) {`,
  'extended material PDF header metrics',
);

patch(
  path,
  `  doc.text(\`Corretiva \${corretivaCount}  ·  Refrigeração \${refrigeracaoCount}\`, right, 20, { align: "right" });`,
  `  doc.text(\`Corretiva \${corretivaCount}  ·  Refrigeração \${refrigeracaoCount}\`, right, 19, { align: "right" });\n  doc.setFont("helvetica", "bold");\n  doc.setTextColor(125, 211, 252);\n  doc.text(\`Campo \${fieldCount}  ·  Urgentes \${urgentCount}\`, right, 26, { align: "right" });`,
  'header field and urgent indicators',
);

patch(
  path,
  `  const corretivaCount = itens.filter((item) => item.origem === "corretiva").length;\n  const refrigeracaoCount = itens.filter((item) => item.origem === "refrigeracao").length;\n  const renderHeader = () => addPdfHeader(doc, itens.length, corretivaCount, refrigeracaoCount);`,
  `  const corretivaCount = itens.filter((item) => item.origem === "corretiva").length;\n  const refrigeracaoCount = itens.filter((item) => item.origem === "refrigeracao").length;\n  const fieldCount = itens.filter((item) => item.fonte === "execucao_campo").length;\n  const urgentCount = itens.filter((item) =>\n    /alta|urgente|crit/i.test(String(item.urgencia ?? item.gravidade ?? "")),\n  ).length;\n  const renderHeader = () =>\n    addPdfHeader(doc, itens.length, corretivaCount, refrigeracaoCount, fieldCount, urgentCount);`,
  'material PDF KPI counts',
);

patch(path, `    y = ensureSpace(doc, y, 72, renderHeader);`, `    y = ensureSpace(doc, y, 78, renderHeader);`, 'larger material cards spacing');
patch(path, `    doc.roundedRect(cardX, cardTop, cardW, 64, 3, 3, "FD");`, `    doc.roundedRect(cardX, cardTop, cardW, 70, 3, 3, "FD");`, 'larger material card');
patch(path, `    doc.roundedRect(cardX, cardTop, 2.2, 64, 1, 1, "F");`, `    doc.roundedRect(cardX, cardTop, 2.2, 70, 1, 1, "F");`, 'longer material accent');

patch(
  path,
  `    const status = item.meta?.status_compra ?? "aguardando";\n    pill(doc, STATUS_COMPRA_LABEL[status], px, py, status === "recebido" ? [220, 252, 231] : [239, 246, 255], status === "recebido" ? [22, 101, 52] : [30, 86, 160]);`,
  `    const status = item.meta?.status_compra ?? "aguardando";\n    px += pill(doc, STATUS_COMPRA_LABEL[status], px, py, status === "recebido" ? [220, 252, 231] : [239, 246, 255], status === "recebido" ? [22, 101, 52] : [30, 86, 160]) + 2;\n    if (item.fonte === "execucao_campo") {\n      pill(doc, "CAMPO", px, py, [219, 234, 254], [30, 64, 175]);\n    }`,
  'field source badge',
);

patch(path, `    doc.setFontSize(11.2);`, `    doc.setFontSize(12.4);`, 'larger material description');
patch(path, `    const firstY = cardTop + 28;`, `    const firstY = cardTop + 30;`, 'detail spacing');
patch(path, `    const secondY = firstY + 12;`, `    const secondY = firstY + 13;`, 'location spacing');
patch(path, `    const thirdY = secondY + 12;`, `    const thirdY = secondY + 13;`, 'purchasing spacing');
patch(path, `    y = cardTop + 69;`, `    y = cardTop + 75;`, 'material card end spacing');

console.log('Material Control PDF upgraded.');
