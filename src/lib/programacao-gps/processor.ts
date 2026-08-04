import ExcelJS from "exceljs";

export interface GpsRecord {
  descricao: string;
  solicitante: string;
  predio: string;
  andar: string;
  local: string;
  dataHora: string;
  equipe: string;
}

export const TEAM_KEYWORDS: Record<string, string[]> = {
  "Chaveiro": ["chave", "fechadura", "cadeado", "mola aérea"],
  "Civil": ["parede", "piso", "teto", "telhado", "vidro", "alvenaria"],
  "Hidráulica": ["vazamento", "pia", "vaso", "torneira", "tubo", "água", "esgoto"],
  "Elétrica": ["lâmpada", "tomada", "disjuntor", "curto", "energia", "luz"],
  "Refrigeração": ["ar condicionado", "geladeira", "fancoil", "chiller", "split"],
  "Pintura": ["pintar", "pintura", "látex", "esmalte", "massa"],
};

export function classifyTeam(description: string): string {
  const desc = description.toLowerCase();
  for (const [team, keywords] of Object.entries(TEAM_KEYWORDS)) {
    if (keywords.some(k => desc.includes(k))) return team;
  }
  return "Outros";
}

export async function processPcmAtivosFile(file: File): Promise<GpsRecord[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha vazia.");
  
  const rows = XLSX.utils.sheet_to_json<any>(sheet);
  const records: GpsRecord[] = [];

  // Use the alias system from corretiva/reader if possible, or simple mapping
  // C: Data/Hora Solicitação -> Column index 2 (0-based)
  // E: Denominação do Solicitante -> Column index 4
  // F: Prédio -> Column index 5
  // G: Andar -> Column index 6
  // H: Local -> Column index 7
  // B: Descrição do Chamado -> Column index 1
  
  // Actually, sheet_to_json with header: 1 is safer for exact column indices
  const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;

    const description = String(row[1] || "");
    const dataHora = String(row[2] || "");
    const solicitante = String(row[4] || "");
    const predio = String(row[5] || "");
    const andar = String(row[6] || "");
    const local = String(row[7] || "");

    if (!description && !solicitante) continue;

    records.push({
      descricao: description,
      solicitante,
      predio,
      andar,
      local,
      dataHora,
      equipe: classifyTeam(description)
    });
  }

  return records;
}

export async function generateGpsFiles(records: GpsRecord[], templateAsset: { url: string }): Promise<Map<string, Blob>> {
  const files = new Map<string, Blob>();
  const teams = ["Chaveiro", "Civil", "Hidráulica", "Elétrica", "Refrigeração", "Pintura", "Outros"];
  
  // Load template from the asset URL
  const templateResponse = await fetch(templateAsset.url);
  const templateBuffer = await templateResponse.arrayBuffer();

  for (const team of teams) {
    const teamRecords = records.filter(r => r.equipe === team);
    if (teamRecords.length === 0) continue;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);
    const worksheet = workbook.worksheets[0];

    // Filling logic: User requested:
    // Column C: Prédio
    // Column D: Andar
    // Column E: Local
    // Column F: Data/Hora Solicitação
    // Column G: Solicitante
    
    // We insert rows to avoid overwriting existing formatting if possible, 
    // or just start at a fixed row. Templates usually have headers.
    let currentRow = 11; // Standard starting point for GPS-style forms
    
    teamRecords.forEach(rec => {
      worksheet.getCell(`C${currentRow}`).value = rec.predio;
      worksheet.getCell(`D${currentRow}`).value = rec.andar;
      worksheet.getCell(`E${currentRow}`).value = rec.local;
      worksheet.getCell(`F${currentRow}`).value = rec.dataHora;
      worksheet.getCell(`G${currentRow}`).value = rec.solicitante;
      // Also description for the team to know what to do
      worksheet.getCell(`B${currentRow}`).value = rec.descricao;
      
      // Basic styling for the new row
      ["B", "C", "D", "E", "F", "G"].forEach(col => {
        const cell = worksheet.getCell(`${col}${currentRow}`);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      });
      
      currentRow++;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    files.set(team, new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  return files;
}


