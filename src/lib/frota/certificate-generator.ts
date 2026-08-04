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
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 10;
  const textColor = rgb(0.1, 0.1, 0.1);

  const dateStr = new Date(checklist.submitted_at).toLocaleDateString('pt-BR');
  
  // Mapeamento de campos baseado no layout esperado dos certificados fornecidos.
  // Como não temos as coordenadas exatas, definimos posições que costumam 
  // ser usadas em formulários desse tipo (cabeçalho e corpo).
  
  // Cabeçalho / Protocolo
  firstPage.drawText(`PROTOCOLO: ${checklist.protocol}`, { x: 400, y: height - 50, size: 8, font: fontBold, color: textColor });
  
  // Bloco de Identificação do Veículo
  firstPage.drawText(vehicle.plate || 'N/A', { x: 135, y: height - 165, size: 14, font: fontBold }); // Placa Centralizada
  firstPage.drawText(`${vehicle.brand} ${vehicle.model}`, { x: 135, y: height - 185, size: 12, font }); 
  
  // Bloco de Dados do Checklist
  const startY = height - 240;
  const lineHeight = 18;
  
  const infoFields = [
    { label: 'CONDUTOR:', value: driverName || 'Não informado' },
    { label: 'DATA:', value: dateStr },
    { label: 'ODÔMETRO:', value: `${checklist.odometer_km?.toLocaleString('pt-BR')} KM` },
    { label: 'STATUS GERAL:', value: checklist.overall_status?.toUpperCase() },
    { label: 'PONTUAÇÃO:', value: `${checklist.integrity_score}%` },
    { label: 'LOCALIDADE:', value: checklist.location || 'Base São Bernardo' },
  ];

  infoFields.forEach((f, i) => {
    const y = startY - (i * lineHeight);
    firstPage.drawText(f.label, { x: 80, y, size: fontSize, font: fontBold });
    firstPage.drawText(f.value, { x: 200, y, size: fontSize, font });
  });

  // Se houver observações, imprimir no rodapé ou área dedicada
  if (checklist.notes) {
    firstPage.drawText('OBSERVAÇÕES:', { x: 80, y: startY - (infoFields.length * lineHeight) - 10, size: fontSize, font: fontBold });
    const notesLines = checklist.notes.match(/.{1,80}/g) || [];
    notesLines.slice(0, 3).forEach((line, i) => {
      firstPage.drawText(line, { 
        x: 80, 
        y: startY - (infoFields.length * lineHeight) - 25 - (i * 12), 
        size: 9, 
        font 
      });
    });
  }

  // Protocolo no rodapé para rastreabilidade
  firstPage.drawText(`Autenticação: ${checklist.protocol}`, { x: 50, y: 30, size: 7, font, color: rgb(0.5, 0.5, 0.5) });


  // Salvar o PDF
  return await pdfDoc.save();
}

/**
 * Função utilitária para download do certificado gerado.
 */
export function downloadUint8Array(data: Uint8Array, filename: string) {
  const blob = new Blob([data as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
