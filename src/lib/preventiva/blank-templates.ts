// Templates em branco (Grupo GPS e Sherwin Williams) para conferência visual.

import { EQUIPE_COLOR, EQUIPES_ORDEM } from "./triage";
import { generateWeeklyProgramacao } from "./weekly-exporter";
import type { WeekBucket } from "./capacity";
import { isoWeekNumber } from "./capacity";

export async function generateBlankTemplate(titulo: string): Promise<Blob> {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);

  const bucketsPorEquipe = new Map<import("./triage").Equipe, WeekBucket>();
  for (const equipe of EQUIPES_ORDEM) {
    const placeholder = {
      arquivo: "",
      os: "—",
      chamado: "",
      tipo: "",
      nomeOS: `${equipe} — modelo`,
      descricao: "",
      categoria: "OUTROS" as const,
      criticidade: "",
      unidadeNegocio: "",
      ativo: "",
      solicitante: "",
      inicioSLA: "",
      dataLimite: "",
      dataPrevistaMaxima: "",
      status: "",
      dataStatus: "",
      site: "DEMARCHI",
      predio: "",
      andar: "",
      local: "",
      equipamento: "",
      terminoSLA: "",
      terminoSLATs: 0,
      dataConclusao: "",
      raw: {},
      equipe,
    };
    bucketsPorEquipe.set(equipe, {
      week: {
        isoWeek: isoWeekNumber(monday),
        year: monday.getFullYear(),
        monday,
        friday,
        label: `Semana ${isoWeekNumber(monday)}`,
      },
      os: [placeholder],
      porDia: [[placeholder], [], [], [], []],
    });
  }

  // Só para conferência das cores por equipe.
  void EQUIPE_COLOR;

  return generateWeeklyProgramacao({
    titulo,
    week: {
      isoWeek: isoWeekNumber(monday),
      year: monday.getFullYear(),
      monday,
      friday,
      label: `Semana ${isoWeekNumber(monday)}`,
    },
    bucketsPorEquipe,
    ativoIndex: new Map(),
  });
}
