import * as XLSX from "xlsx";
import { RondaInput } from "./types";

export async function readRondasExcel(file: File): Promise<RondaInput[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet) as any[];

        const mesReferencia = new Date().toISOString().slice(0, 7); // YYYY-MM

        // Filtramos as preventivas que contém "calha" no nome
        const filtered = rows
          .filter((r) => {
            const rowValues = Object.values(r).map(v => String(v).toLowerCase());
            return rowValues.some(v => v.includes("calha"));
          })
          .map((r) => {
            // Mapeamento inteligente de prédio/local
            const predio = r.Predio || r.Prédio || r.Localizacao || r.Localização || r.Local || r.Andar || r.Edificio || r.Edifício || 
                          r.PREDIO || r.LOCAL || r.LOCALIZACAO || "Não Identificado";
            
            // Mapeamento inteligente de nome da preventiva/descrição
            const nome = r.Nome || r.preventiva_nome || r.Descricao || r.Descriçāo || r["Descrição OS"] || r["Descricao OS"] || 
                        r.Servico || r.Serviço || r.NOME || r.DESCRICAO || "Ronda de Calha";

            return {
              predio: String(predio),
              preventiva_nome: String(nome),
              mes_referencia: mesReferencia,
            };
          });

        resolve(filtered);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
