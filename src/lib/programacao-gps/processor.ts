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
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  const records: GpsRecord[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    // Column Mapping:
    // C: Data/Hora Solicitação -> F (GPS)
    // E: Denominação do Solicitante -> G (GPS)
    // F: Prédio -> C (GPS)
    // G: Andar -> D (GPS)
    // H: Local -> E (GPS)
    // B: Descrição do Chamado -> Used for classification
    
    const description = row.getCell(2).value?.toString() || "";
    const dataHora = row.getCell(3).value?.toString() || "";
    const solicitante = row.getCell(5).value?.toString() || "";
    const predio = row.getCell(6).value?.toString() || "";
    const andar = row.getCell(7).value?.toString() || "";
    const local = row.getCell(8).value?.toString() || "";

    records.push({
      descricao: description,
      solicitante,
      predio,
      andar,
      local,
      dataHora,
      equipe: classifyTeam(description)
    });
  });

  return records;
}
