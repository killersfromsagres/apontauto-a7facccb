import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fiorinoAsset from '@/assets/fiorino_template.pdf.asset.json';
import saveiroAsset from '@/assets/saveiro_template.pdf.asset.json';
import type { FleetChecklist, FleetVehicle } from '@/features/fleet/api';

/**
 * Mapeia o veículo para o template correto conforme a regra:
 * - Veículos "água" e "máscara" -> Fiorino
 * - Veículo "saveiro" -> Saveiro
 */
export function getTemplateForVehicle(vehicle: FleetVehicle): string {
  const model = (vehicle.model || '').toLowerCase();
  const prefix = (vehicle.prefix || '').toLowerCase();
  
  if (model.includes('saveiro') || prefix.includes('saveiro')) {
    return saveiroAsset.url;
  }
  
  return fiorinoAsset.url;
}

/**
 * Gera o PDF modificado preenchendo as informações do checklist no template.
 */
export async function generateVehicleCertificate(
  checklist: FleetChecklist,
  vehicle: FleetVehicle,
  protocol: string
): Promise<Uint8Array> {
  const templateUrl = getTemplateForVehicle(vehicle);
  
  const response = await fetch(templateUrl);
  const pdfBytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { height } = firstPage.getSize();
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 10;
  const textColor = rgb(0, 0, 0);

  const dateStr = new Date(checklist.created_at).toLocaleDateString('pt-BR');
  const hSaida = new Date(checklist.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  // Mapeamento preciso baseado no PDF fornecido
  const fields = [
    // Cabeçalho / Protocolo
    { text: protocol, x: 735, y: height - 52, size: 9, font: fontBold },
    { text: dateStr, x: 775, y: height - 90, size: 14, font: fontBold },

    // Linha 1: Motorista e Setor
    { text: checklist.driver_name, x: 155, y: height - 215, size: 10, font },
    { text: 'Manutenção / PCM', x: 505, y: height - 215, size: 10, font },
    { text: 'Manutenção', x: 800, y: height - 215, size: 10, font },

    // Linha 2: Placa e Marca/Modelo
    { text: vehicle.plate || 'N/A', x: 165, y: height - 243, size: 11, font: fontBold },
    { text: `${vehicle.brand} ${vehicle.model}`, x: 550, y: height - 243, size: 10, font },

    // Linha 3: KM
    { text: `${Number(checklist.odometer_km).toLocaleString('pt-BR')} km`, x: 135, y: height - 271, size: 10, font },
    { text: '—', x: 495, y: height - 271, size: 10, font },

    // Linha 4: Horário
    { text: checklist.kind === 'saida' ? hSaida : '—', x: 175, y: height - 299, size: 10, font },
    { text: checklist.kind === 'retorno' ? hSaida : '—', x: 515, y: height - 299, size: 10, font },

    // Linha 5: Responsável e Combustível
    { text: checklist.driver_name, x: 235, y: height - 327, size: 10, font },
    { text: checklist.fuel_level_pct != null ? `${checklist.fuel_level_pct}%` : '—', x: 525, y: height - 327, size: 10, font },

    // Placa abaixo do carro
    { text: vehicle.plate || '', x: 130, y: height - 548, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) },
  ];

  fields.forEach(f => {
    firstPage.drawText(f.text, {
      x: f.x,
      y: f.y,
      size: f.size || fontSize,
      font: f.font || font,
      color: f.color || textColor,
    });
  });

  // Checkbox de itens (mapeamento visual 01-11)
  const itemStartY = height - 598;
  const itemStepY = 24.2;
  (checklist.items || []).slice(0, 11).forEach((item, i) => {
    const y = itemStartY - (i * itemStepY);
    if (item.status === 'ok') {
      firstPage.drawText('X', { x: 602, y: y + 4, size: 12, font: fontBold, color: rgb(0, 0.4, 0) });
    } else {
      firstPage.drawText('X', { x: 678, y: y + 4, size: 12, font: fontBold, color: rgb(0.8, 0, 0) });
    }
  });

  // Assinaturas
  firstPage.drawText(checklist.driver_name, { x: 265, y: 102, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
  firstPage.drawText('Gestor de Frota — Suprimentos', { x: 715, y: 102, size: 9, font, color: rgb(0.2, 0.2, 0.2) });

  // Rodapé
  const footerText = `Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')} · Protocolo ${protocol}`;
  firstPage.drawText(footerText, { x: 60, y: 25, size: 7, font, color: rgb(0.5, 0.5, 0.5) });

  return await pdfDoc.save();
}

/**
 * Função utilitária para download do certificado gerado.
 */
export function downloadUint8Array(data: Uint8Array, filename: string) {
  const blob = new Blob([data as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
