/// <reference lib="webworker" />
// Worker de importação do Backorder.
//
// Faz o trabalho pesado (ler o .xlsx, resolver Prédio/Andar/Ambiente pela
// árvore de ativos, classificar a equipe e montar o payload final) fora da
// thread principal — arquivos de 20 MB / 15 mil+ OS não travam mais a UI.

import { readBackorderWorkbook, type BackorderRow, type AssetImportRow } from "./reader";
import { setDynamicRules, type DynamicRule, type Categoria } from "./classify";
import { CATEGORIA_TO_EQUIPE } from "./classify";
import { classifyTeamByText } from "./team-classifier";
import {
  applyLearnedToResolved,
  buildLearnedIndex,
  type LearnedLocation,
  type LearnedTeam,
} from "./learned";
import { resolveAtivoTree, type AssetsMap } from "./assets";
import { buildAssetGraph, resolveAsset } from "@/features/assets/services/asset-resolver";
import type { AssetRecord } from "@/features/assets/types";

export interface ImportPayloadRow {
  os: string;
  nome: string;
  ativo: string;
  predio: string;
  andar: string;
  espaco: string;
  atividade: string;
  equipe: string;
  termino_sla: string | null;
  data_solicitacao: string;
  outros: string;
  criticidade: string;
  revisao_manual: boolean;
  origem_predio_andar_espaco: string;
  origem_equipe: string;
  status_origem: string;
  finalizado: boolean;
  cancelado: boolean;
  data_conclusao: string | null;
}

export interface ImportRunMessage {
  type: "run";
  file: File;
  assetsMap: AssetsMap;
  /** Catálogo de ativos vigente — mesmo motor da tela "Preencher localização". */
  assetRecords?: AssetRecord[];
  dynamicRules: DynamicRule[] | null;
  learnedLoc: LearnedLocation[];
  learnedTeam: LearnedTeam[];
  overrides: Array<[string, string]>;
}


export type ImportOutMessage =
  | { type: "progress"; phase: "lendo" | "processando"; done: number; total: number }
  | {
      type: "result";
      rows: ImportPayloadRow[];
      embeddedAssets: AssetImportRow[];
      concluidas: number;
      canceladas: number;
      abertas: number;
    }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<ImportRunMessage>) => {
  const msg = ev.data;
  if (msg?.type !== "run") return;
  try {
    setDynamicRules(msg.dynamicRules);
    ctx.postMessage({ type: "progress", phase: "lendo", done: 0, total: 1 } as ImportOutMessage);

    const assets = msg.assetsMap;
    const { rows: parsed, embeddedAssets } = await readBackorderWorkbook(msg.file, assets);

    const learnedIdx = buildLearnedIndex(msg.learnedLoc, msg.learnedTeam);
    const overrideMap = new Map(msg.overrides);

    const out: ImportPayloadRow[] = [];
    let concluidas = 0;
    let canceladas = 0;
    const total = parsed.length || 1;

    parsed.forEach((r: BackorderRow, i) => {
      const tree = resolveAtivoTree(assets, r.ativo);
      const applied = applyLearnedToResolved(learnedIdx, r.ativo, tree, r.atividade);
      const override = overrideMap.get(r.os) as Categoria | undefined;
      const textResult = classifyTeamByText(r.nome ?? "");

      const atividadeFinal: Categoria = override ?? (textResult.equipe as Categoria);
      const equipeFinal = CATEGORIA_TO_EQUIPE[atividadeFinal];

      const predio = r.predio || applied.predio || "";
      const andar = r.andar || applied.andar || "";
      const espaco = r.espaco || applied.espaco || "";

      if (r.cancelado) canceladas++;
      else if (r.finalizado) concluidas++;

      out.push({
        os: r.os,
        nome: r.nome,
        ativo: r.ativo,
        predio,
        andar,
        espaco,
        atividade: atividadeFinal,
        equipe: equipeFinal,
        termino_sla: r.termino_sla,
        data_solicitacao: r.data_solicitacao,
        outros: r.outros,
        criticidade: r.criticidade ?? "",
        revisao_manual: r.finalizado
          ? false
          : (applied.revisao_manual && !override && !predio && !andar && !espaco) ||
            (!override && textResult.ambiguo),
        origem_predio_andar_espaco: r.predio
          ? "planilha"
          : applied.origem_predio_andar_espaco !== "pendente"
            ? applied.origem_predio_andar_espaco
            : predio || andar || espaco
              ? "arvore_ativos"
              : "pendente",
        origem_equipe: override ? "regra_aprendida" : textResult.ambiguo ? "pendente" : "regra_local",
        status_origem: r.status_origem,
        finalizado: r.finalizado,
        cancelado: r.cancelado,
        data_conclusao: r.data_conclusao,
      });

      if (i % 2000 === 0) {
        ctx.postMessage({
          type: "progress",
          phase: "processando",
          done: i,
          total,
        } as ImportOutMessage);
      }
    });

    ctx.postMessage({
      type: "result",
      rows: out,
      embeddedAssets,
      concluidas,
      canceladas,
      abertas: out.length - concluidas - canceladas,
    } as ImportOutMessage);
  } catch (e) {
    ctx.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    } as ImportOutMessage);
  }
};
