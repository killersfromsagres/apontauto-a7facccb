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
  "Chaveiro": ["chave", "fechadura", "cadeado", "mola aérea", "dobradiça", "maçaneta", "miolo"],
  "Civil": [
    "parede", "piso", "teto", "telhado", "vidro", "alvenaria", "porta", "janela", 
    "forro", "cerâmica", "rejunte", "piso tátil", "rodapé", "furo", "buraco", "trinca", "rachadura",
    "divisória", "drywall", "gesso", "persiana", "carpet", "marcenaria", "batente"
  ],
  "Hidráulica": [
    "vazamento", "pia", "vaso", "torneira", "tubo", "água", "esgoto", "ralo", 
    "sifão", "descarga", "caixa acoplada", "chuveiro", "registro", "bóia", "flexível", "filtro d'água",
    "bebedouro", "mictório", "bucha", "encanamento", "sanitário"
  ],
  "Elétrica": [
    "lâmpada", "tomada", "disjuntor", "curto", "energia", "luz", "fio", "cabo", 
    "reator", "interruptor", "quadro", "sensor", "contatora", "relé", "soquete",
    "iluminação", "refletor", "estabilizador", "nobreak", "trifásico", "reator"
  ],
  "Refrigeração": [
    "ar condicionado", "geladeira", "fancoil", "chiller", "split", "resfriamento", 
    "barulho", "vazamento de gás", "compressor", "ventilador", "exaustor", "dreno",
    "ar-condicionado", "climatização", "gelando", "quente", "evaporadora", "condensadora"
  ],
  "Pintura": ["pintar", "pintura", "látex", "esmalte", "massa", "verniz", "selador", "lixar", "retoc", "tinta"],
};

export function classifyTeam(description: string): string {
  const desc = description.toLowerCase();
  
  // High-priority specific terms for precision
  if (desc.includes("filtro d'água") || desc.includes("bebedouro") || desc.includes("vazamento de água")) return "Hidráulica";
  if (desc.includes("ar-condicionado") || desc.includes(" split ") || desc.includes("fancoil")) return "Refrigeração";
  if (desc.includes("curto-circuito") || desc.includes("disjuntor caiu") || desc.includes("sem energia")) return "Elétrica";
  if (desc.includes("fechadura") || desc.includes("chave quebrada")) return "Chaveiro";
  if (desc.includes("pintar") || desc.includes("tinta")) return "Pintura";
  
  // Check keywords in priority order
  const priorityOrder = ["Refrigeração", "Elétrica", "Hidráulica", "Chaveiro", "Pintura", "Civil"];
  
  for (const team of priorityOrder) {
    const keywords = TEAM_KEYWORDS[team];
    if (keywords.some(k => desc.includes(k))) return team;
  }
  
  return "Civil"; 
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

export async function generateGpsFiles(
  records: GpsRecord[], 
  templateAsset: { url: string },
  logos: { sherwin: string; gps: string }
): Promise<Map<string, Blob>> {
  const files = new Map<string, Blob>();
  const teams = ["Chaveiro", "Civil", "Hidráulica", "Elétrica", "Refrigeração", "Pintura", "Outros"];
  
  const templateResponse = await fetch(templateAsset.url);
  const templateBuffer = await templateResponse.arrayBuffer();

  const sherwinResponse = await fetch(logos.sherwin);
  const sherwinBuffer = await sherwinResponse.arrayBuffer();
  
  const gpsResponse = await fetch(logos.gps);
  const gpsBuffer = await gpsResponse.arrayBuffer();

  for (const team of teams) {
    const teamRecords = records.filter(r => r.equipe === team);
    if (teamRecords.length === 0) continue;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);
    const worksheet = workbook.worksheets[0];

    // Add logos (ensure they are in the same position as the model)
    // Typically Column A/B for one and Column G/H for another
    const sherwinImg = workbook.addImage({
      buffer: sherwinBuffer,
      extension: 'png',
    });
    
    const gpsImg = workbook.addImage({
      buffer: gpsBuffer,
      extension: 'png',
    });

    // Positioning based on common GPS templates (adjust if necessary)
    worksheet.addImage(sherwinImg, {
      tl: { col: 0, row: 0 },
      ext: { width: 140, height: 45 }
    });

    worksheet.addImage(gpsImg, {
      tl: { col: 6, row: 0 },
      ext: { width: 140, height: 45 }
    });

    // Header for the data table (row 1)
    const headerRow = worksheet.getRow(1);
    headerRow.values = ["OS", "Descrição do Chamado", "Prédio", "Andar", "Espaço", "DATA", "Solicitante", "Equipe"];
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    let currentRow = 2; 
    worksheet.getRow(1).height = 40; // Space for logos
    
    teamRecords.forEach(rec => {
      worksheet.getCell(`A${currentRow}`).value = ""; // OS placeholder
      worksheet.getCell(`B${currentRow}`).value = rec.descricao;
      worksheet.getCell(`C${currentRow}`).value = rec.predio;
      worksheet.getCell(`D${currentRow}`).value = rec.andar;
      worksheet.getCell(`E${currentRow}`).value = rec.local;
      worksheet.getCell(`F${currentRow}`).value = rec.dataHora;
      worksheet.getCell(`G${currentRow}`).value = rec.solicitante;
      worksheet.getCell(`H${currentRow}`).value = team.toUpperCase();
      
      ["A", "B", "C", "D", "E", "F", "G", "H"].forEach(col => {
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



