/// <reference lib="webworker" />
// Web Worker: executa a resolução em lotes sem travar a UI.

import { buildAssetGraph } from "../services/asset-resolver";
import {
  processRows,
  type FillOptions,
  type RowResult,
  type TargetColumns,
} from "../services/sheet-fill";
import type { AssetRecord } from "../types";

export interface WorkerSheetInput {
  name: string;
  rows: string[][];
  headerRow: number;
  ativoIndex: number;
  targets: TargetColumns;
}

export interface WorkerRunMessage {
  type: "run";
  records: AssetRecord[];
  sheets: WorkerSheetInput[];
  options: FillOptions;
  batchSize?: number;
}

export type WorkerOutMessage =
  | {
      type: "progress";
      sheet: string;
      sheetIndex: number;
      done: number;
      total: number;
      overall: number;
    }
  | { type: "sheet-done"; sheet: string; results: RowResult[] }
  | { type: "sheet-error"; sheet: string; message: string }
  | { type: "done" }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<WorkerRunMessage>) => {
  const msg = ev.data;
  if (msg?.type !== "run") return;
  try {
    const graph = buildAssetGraph(msg.records);
    const batch = msg.batchSize ?? 500;
    const grandTotal = msg.sheets.reduce((a, s) => a + s.rows.length, 0) || 1;
    let processedOverall = 0;

    msg.sheets.forEach((sheet, sheetIndex) => {
      try {
        const results: RowResult[] = [];
        for (let i = 0; i < sheet.rows.length; i += batch) {
          const slice = sheet.rows.slice(i, i + batch);
          const part = processRows(graph, {
            rows: slice,
            ativoIndex: sheet.ativoIndex,
            targets: sheet.targets,
            headerRow: sheet.headerRow,
            options: msg.options,
          });
          // reindexa em relação à aba inteira
          for (const r of part) {
            r.i += i;
            r.row = sheet.headerRow + 2 + r.i;
            results.push(r);
          }
          processedOverall += slice.length;
          ctx.postMessage({
            type: "progress",
            sheet: sheet.name,
            sheetIndex,
            done: Math.min(i + batch, sheet.rows.length),
            total: sheet.rows.length,
            overall: processedOverall / grandTotal,
          } satisfies WorkerOutMessage);
        }
        ctx.postMessage({
          type: "sheet-done",
          sheet: sheet.name,
          results,
        } satisfies WorkerOutMessage);
      } catch (e) {
        ctx.postMessage({
          type: "sheet-error",
          sheet: sheet.name,
          message: e instanceof Error ? e.message : String(e),
        } satisfies WorkerOutMessage);
      }
    });

    ctx.postMessage({ type: "done" } satisfies WorkerOutMessage);
  } catch (e) {
    ctx.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    } satisfies WorkerOutMessage);
  }
};
