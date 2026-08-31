import { toast } from "sonner";

import { loadMensageriaSnapshot } from "@/lib/mensageria/local-database";
import type { Envio, Malote } from "@/lib/mensageria/models";
import { MENSAGERIA_SECTORS } from "@/lib/mensageria/seed-data";
import { buildMensageriaPremiumWorkbook } from "@/lib/mensageria/premium-workbook";

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function compatibilityMalotes(malotes: Malote[]) {
  const sectorMap = new Map(MENSAGERIA_SECTORS.map((item) => [item.nome, item.responsavel]));
  return malotes.map((item) => ({
    Status: item.status === "entregue" ? "ENTREGUE" : "PENDENTE",
    Setor: item.setor,
    "Responsável do setor": sectorMap.get(item.setor) ?? "",
    Remetente: item.remetente,
    Destinatário: item.destinatario,
    "Código de rastreio": item.codigo_rastreio ?? "",
    "Código interno": item.codigo_interno ?? "",
    Item: item.item_descricao ?? "",
    Quantidade: item.quantidade,
    "Data recebimento": formatDateTime(item.recebido_em),
    Local: item.local_recebimento,
    "Recebido por": item.recebido_por,
    "Assinatura portaria": item.assinatura_portaria_data_url ? "SIM" : "NÃO DISPONÍVEL",
    "Data entrega": formatDateTime(item.entregue_em),
    "Entregue para": item.entregue_para ?? "",
    "Assinatura destinatário": item.assinatura_entrega_data_url ? "SIM" : "NÃO DISPONÍVEL",
    "Observações recebimento": item.observacoes ?? "",
    "Observações entrega": item.entrega_observacoes ?? "",
    Origem: item.legacy_import ? "PLANILHA IMPORTADA" : "REGISTRO LOCAL",
  }));
}

function compatibilityEnvios(envios: Envio[]) {
  const categoryLabel = (item: Envio) => ({
    correios: "Correios",
    juridico: "Jurídico",
    malote_interno: "Malote interno",
    outro: "Outro",
  })[item.categoria];

  return envios.map((item) => ({
    Status: item.status.toLocaleUpperCase("pt-BR"),
    Categoria: categoryLabel(item),
    Remetente: item.remetente,
    Destinatário: item.destinatario,
    "Código de rastreio": item.codigo_rastreio ?? "",
    Item: item.item_descricao ?? "",
    "Nota fiscal": item.nota_fiscal ?? "",
    "Data envio": formatDateTime(item.enviado_em),
    "Enviado por": item.enviado_por ?? "",
    "Data conclusão": formatDateTime(item.finalizado_em),
    Observações: item.observacoes ?? "",
    Origem: item.legacy_import ? "PLANILHA IMPORTADA" : "REGISTRO LOCAL",
  }));
}

async function exportCompatibilityBackup(malotes: Malote[], envios: Envio[]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet([
    ["MENSAGERIA E MALOTES — BACKUP DE COMPATIBILIDADE"],
    ["Gerado em", new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date())],
    [],
    ["Indicador", "Quantidade"],
    ["Total de malotes", malotes.length],
    ["Pendentes", malotes.filter((item) => item.status === "aguardando_entrega").length],
    ["Entregues", malotes.filter((item) => item.status === "entregue").length],
    ["Envios", envios.length],
  ]);
  summary["!cols"] = [{ wch: 34 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Resumo");

  const maloteRows = compatibilityMalotes(malotes);
  const malotesSheet = maloteRows.length
    ? XLSX.utils.json_to_sheet(maloteRows)
    : XLSX.utils.aoa_to_sheet([["Nenhum malote registrado"]]);
  malotesSheet["!cols"] = Array.from({ length: 19 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(workbook, malotesSheet, "Malotes");

  const envioRows = compatibilityEnvios(envios);
  const enviosSheet = envioRows.length
    ? XLSX.utils.json_to_sheet(envioRows)
    : XLSX.utils.aoa_to_sheet([["Nenhum envio registrado"]]);
  enviosSheet["!cols"] = Array.from({ length: 12 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(workbook, enviosSheet, "Envios");

  const setoresSheet = XLSX.utils.json_to_sheet(
    MENSAGERIA_SECTORS.map((item) => ({ Setor: item.nome, Responsável: item.responsavel })),
  );
  setoresSheet["!cols"] = [{ wch: 34 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(workbook, setoresSheet, "Setores");

  const fileName = `mensageria-backup-compatibilidade-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName, { compression: true });
}

export async function exportMensageriaPremiumBackup() {
  const toastId = toast.loading("Preparando backup premium...");
  let snapshot: Awaited<ReturnType<typeof loadMensageriaSnapshot>> | null = null;

  try {
    snapshot = await loadMensageriaSnapshot();
    const { malotes, envios } = snapshot;

    if (!malotes.length && !envios.length) {
      toast.error("Não há dados de Mensageria para exportar.", { id: toastId });
      return;
    }

    const workbook = buildMensageriaPremiumWorkbook(malotes, envios);
    const buffer = await workbook.xlsx.writeBuffer();
    const { saveAs } = await import("file-saver");
    const fileName = `mensageria-backup-premium-${new Date().toISOString().slice(0, 10)}.xlsx`;

    saveAs(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      fileName,
    );

    toast.success("Backup premium exportado.", {
      id: toastId,
      description: "Arquivo validado e organizado com resumo, filtros, cores por status e tabelas profissionais.",
    });
  } catch (premiumError) {
    console.error("Falha no gerador premium da Mensageria:", premiumError);

    if (snapshot) {
      try {
        await exportCompatibilityBackup(snapshot.malotes, snapshot.envios);
        toast.warning("Backup exportado em modo de compatibilidade.", {
          id: toastId,
          description: "O gerador premium encontrou uma incompatibilidade, mas o backup foi preservado e baixado normalmente.",
        });
        return;
      } catch (fallbackError) {
        console.error("Falha também no backup de compatibilidade:", fallbackError);
      }
    }

    toast.error("Não foi possível gerar o backup.", {
      id: toastId,
      description: premiumError instanceof Error ? premiumError.message : "Tente novamente.",
    });
  }
}
