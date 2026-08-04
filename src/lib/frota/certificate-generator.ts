import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fiorinoAsset from '@/assets/fiorino_template.pdf.asset.json';
import saveiroAsset from '@/assets/saveiro_template.pdf.asset.json';
import type { Checklist, Vehicle } from './api';

export type CertificateData = {
  protocol: string;
  plate: string;
  vehicleLabel: string;
  date: string;
  status: string;
  score: string;
  driver: string;
  location: string;
  purpose: string;
};

/**
 * Mapeia o veículo para o template correto conforme a regra:
 * - Veículos "água" e "máscara" -> Fiorino
 * - Veículo "saveiro" -> Saveiro
 */
export function getTemplateForVehicle(vehicle: Vehicle): string {
  const model = (vehicle.model || '').toLowerCase();
  const prefix = (vehicle.prefix || '').toLowerCase();
  
  if (model.includes('saveiro') || prefix.includes('saveiro')) {
    return saveiroAsset.url;
  }
  
  // Padrão ou se conter água/máscara
  return fiorinoAsset.url;
}

/**
 * Gera o PDF modificado preenchendo as informações do checklist no template.
 */
export async function generateVehicleCertificate(
  checklist: Checklist,
  vehicle: Vehicle,
  driverName?: string
): Promise<Uint8Array> {
  const templateUrl = getTemplateForVehicle(vehicle);
  
  // Carregar o PDF base
  const response = await fetch(templateUrl);
  const pdfBytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();
  
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 12;
  const textColor = rgb(0.1, 0.1, 0.1);

  const dateStr = new Date(checklist.submitted_at).toLocaleDateString('pt-BR');
  
  // Coordenadas aproximadas para preenchimento. 
  // Em um cenário real, estas coordenadas seriam calibradas conforme o layout do PDF original.
  const fields = [
    { text: checklist.protocol, x: 450, y: height - 100 }, // Topo Direita (Protocolo)
    { text: vehicle.plate || 'N/A', x: 150, y: height - 250 }, // Placa
    { text: `${vehicle.brand} ${vehicle.model} ${vehicle.version || ''}`, x: 150, y: height - 270 }, // Modelo
    { text: driverName || 'Não informado', x: 150, y: height - 290 }, // Condutor
    { text: dateStr, x: 150, y: height - 310 }, // Data
    { text: checklist.overall_status.toUpperCase(), x: 150, y: height - 330 }, // Status
    { text: `${checklist.integrity_score}%`, x: 150, y: height - 350 }, // Pontuação
    { text: checklist.location || 'Base', x: 150, y: height - 370 }, // Local
  ];

  for (const field of fields) {
    firstPage.drawText(field.text, {
      x: field.x,
      y: field.y,
      size: fontSize,
      font,
      color: textColor,
    });
  }

  // Salvar o PDF
  return await pdfDoc.save();
}

/**
 * Função utilitária para download do certificado gerado.
 */
export function downloadUint8Array(data: Uint8Array, filename: string) {
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
