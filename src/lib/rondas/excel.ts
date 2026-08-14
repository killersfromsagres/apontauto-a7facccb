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
            const nome = String(r.Nome || r.preventiva_nome || r.Descricao || r.Descriçāo || r["Descrição OS"] || "").toLowerCase();
            const osDesc = String(r["Descricao OS"] || r["Descriçāo OS"] || r.Servico || r.Serviço || "").toLowerCase();
            return nome.includes("calha") || osDesc.includes("calha");
          })
          .map((r) => ({
            predio: String(r.Predio || r.Prédio || r.Localizacao || r.Localização || r.Local || r.Andar || "Não Identificado"),
            preventiva_nome: String(r.Nome || r.preventiva_nome || r.Descricao || r.Descriçāo || r["Descrição OS"] || "Ronda de Calha"),
            mes_referencia: mesReferencia,
          }));

        resolve(filtered);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
