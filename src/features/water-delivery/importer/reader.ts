// Leitura e normalização da planilha "Programação GPS — Entrega de Água".
//
// A planilha tem uma aba consolidada ("PROGRAMAÇÃO 2") e uma aba por dia útil.
// As abas diárias são a referência da rota real; a aba consolidada é usada
// apenas para detectar divergências (grafia, período declarado, erros de fórmula).

import * as XLSX from "xlsx";

export { DIAS, DIA_LABEL } from "./constants";
import { DIAS, DIA_LABEL } from "./constants";

export type Severidade = "erro" | "alerta" | "info";

export interface Divergencia {
  tipo: string;
  severidade: Severidade;
  mensagem: string;
  referencia?: string;
}

export interface RevisaoPonto {
  motivo: string;
  diasExtras: number[];
  diasFaltando: number[];
}

export interface PontoLido {
  codigo: string;
  predio: string;
  andar: string;
  espaco: string;
  dias: number[];
  /** Preenchido quando a aba consolidada discorda das abas diárias (item 19.2). */
  revisao?: RevisaoPonto;
}

export interface MapeamentoColunas {
  predio?: string;
  andar?: string;
  espaco?: string;
}

export interface OpcoesLeitura {
  /** Aba escolhida manualmente para cada dia (1=segunda … 5=sexta). */
  abas?: Partial<Record<number, string>>;
  /** Cabeçalhos escolhidos manualmente para cada campo. */
  mapeamento?: MapeamentoColunas;
}

export interface AbaInspecionada {
  nome: string;
  linhas: number;
  cabecalhos: string[];
  diaSugerido: number | null;
  consolidada: boolean;
}

export interface InspecaoPlanilha {
  abas: AbaInspecionada[];
  abaPorDia: Partial<Record<number, string>>;
  mapeamentoSugerido: MapeamentoColunas;
  cabecalhos: string[];
}

export interface LeituraAgua {
  pontos: PontoLido[];
  totalLinhas: number;
  totalVisitas: number;
  porDia: Record<number, number>;
  divergencias: Divergencia[];
}

/** Remove acentos, espaços repetidos, quebras de linha e padroniza caixa alta. */
export function norm(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Normaliza "D55 - D85" / "D55-D85" / "d55 – d85" para uma única grafia. */
export function normPredio(v: unknown): string {
  return norm(v).replace(/\s*[-–—]\s*/g, "-");
}

/** Corrige erros de digitação conhecidos nos nomes de espaço. */
const TYPOS: [RegExp, string][] = [
  [/^CICULACAO$/, "CIRCULACAO"],
  [/^AMBULATORIO *- *RH *- *COPA$/, "AMBULATORIO - RH - COPA"],
];

export function normEspaco(v: unknown): string {
  const base = norm(v).replace(/\s*[-–—]\s*/g, " - ");
  for (const [re, fix] of TYPOS) if (re.test(base)) return fix;
  return base;
}

/** Chave canônica do ponto de entrega. */
export function pontoCodigo(predio: string, andar: string, espaco: string): string {
  return [normPredio(predio), norm(andar), normEspaco(espaco)]
    .map((s) => s.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .join("|");
}

type Linha = Record<string, unknown>;

function col(row: Linha, ...names: string[]): string {
  for (const key of Object.keys(row)) {
    const k = norm(key);
    if (names.some((n) => k === norm(n))) return String(row[key] ?? "");
  }
  return "";
}

/** Dias declarados no texto do campo "Período" da aba consolidada. */
function diasDoPeriodo(texto: string): number[] {
  const t = norm(texto);
  const out: number[] = [];
  for (const d of DIAS) {
    const nome = norm(d.label).split("-")[0];
    if (t.includes(nome)) out.push(d.dia);
  }
  return out;
}

/** Lê cabeçalhos e abas do arquivo para o passo de mapeamento do assistente. */
export function inspecionarPlanilha(buffer: ArrayBuffer): InspecaoPlanilha {
  const wb = XLSX.read(buffer, { type: "array" });
  const abas: AbaInspecionada[] = [];
  const abaPorDia: Partial<Record<number, string>> = {};
  const todosCabecalhos = new Set<string>();

  for (const nome of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, defval: "" });
    const idx = raw.findIndex((r) => r.some((c) => /^pr(é|e)dio$/i.test(String(c).trim())));
    const cabecalhos = (idx >= 0 ? raw[idx] : (raw[0] ?? []))
      .map((c) => String(c ?? "").trim())
      .filter(Boolean);
    for (const c of cabecalhos) todosCabecalhos.add(c);
    const dia = DIAS.find((d) => d.aliases.test(nome.trim()))?.dia ?? null;
    if (dia && !abaPorDia[dia]) abaPorDia[dia] = nome;
    abas.push({
      nome,
      linhas: Math.max(raw.length - (idx >= 0 ? idx + 1 : 1), 0),
      cabecalhos,
      diaSugerido: dia,
      consolidada: /programa/i.test(nome),
    });
  }

  const lista = [...todosCabecalhos];
  const acha = (...alvos: string[]) => lista.find((c) => alvos.some((a) => norm(c) === norm(a)));

  return {
    abas,
    abaPorDia,
    cabecalhos: lista,
    mapeamentoSugerido: {
      predio: acha("Prédio", "Predio"),
      andar: acha("Andar"),
      espaco: acha("Espaço", "Espaco"),
    },
  };
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Lê o arquivo e devolve pontos canônicos + programação + divergências. */
export function lerPlanilhaAgua(buffer: ArrayBuffer, opts: OpcoesLeitura = {}): LeituraAgua {
  const wb = XLSX.read(buffer, { type: "array" });
  const map = opts.mapeamento ?? {};
  const revisoes = new Map<string, RevisaoPonto>();
  const divergencias: Divergencia[] = [];
  const mapa = new Map<string, PontoLido>();
  const porDia: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalLinhas = 0;

  // ---------- abas diárias (fonte da rota real) ----------
  for (const d of DIAS) {
    const escolhida = opts.abas?.[d.dia];
    const nome =
      escolhida && wb.SheetNames.includes(escolhida)
        ? escolhida
        : wb.SheetNames.find((s) => d.aliases.test(s.trim()));
    if (!nome) {
      divergencias.push({
        tipo: "aba_ausente",
        severidade: "alerta",
        mensagem: `A aba de ${d.label} não foi encontrada na planilha.`,
        referencia: d.label,
      });
      continue;
    }
    const linhas = XLSX.utils.sheet_to_json<Linha>(wb.Sheets[nome], { defval: "" });
    for (const row of linhas) {
      const predio = normPredio(
        col(row, ...([map.predio, "Prédio", "Predio"].filter(Boolean) as string[])),
      );
      const espaco = normEspaco(
        col(row, ...([map.espaco, "Espaço", "Espaco"].filter(Boolean) as string[])),
      );
      const andar = norm(col(row, ...([map.andar, "Andar"].filter(Boolean) as string[])));
      if (!predio && !espaco) continue;
      totalLinhas += 1;
      if (!predio) {
        divergencias.push({
          tipo: "predio_vazio",
          severidade: "erro",
          mensagem: `Linha sem prédio na aba ${d.label} (espaço "${espaco}").`,
          referencia: d.label,
        });
        continue;
      }
      const codigo = pontoCodigo(predio, andar, espaco);
      const atual = mapa.get(codigo) ?? { codigo, predio, andar, espaco, dias: [] };
      if (atual.dias.includes(d.dia)) {
        divergencias.push({
          tipo: "duplicidade_no_dia",
          severidade: "alerta",
          mensagem: `${predio} · ${espaco} aparece mais de uma vez em ${d.label}.`,
          referencia: codigo,
        });
      } else {
        atual.dias.push(d.dia);
        porDia[d.dia] += 1;
      }
      mapa.set(codigo, atual);
    }
  }

  // ---------- aba consolidada (checagem cruzada) ----------
  const nomePrincipal = wb.SheetNames.find((s) => /programa/i.test(s));
  if (nomePrincipal) {
    const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomePrincipal], {
      header: 1,
      defval: "",
    });
    const cabecalho = raw.slice(0, 3).flat().map(String).join(" ");
    if (/#VALUE!|#REF!|#N\/A|#DIV\/0!/i.test(cabecalho)) {
      divergencias.push({
        tipo: "formula_erro",
        severidade: "alerta",
        mensagem:
          "O cabeçalho da aba consolidada contém fórmula com erro (#VALUE!). O valor foi ignorado na importação.",
        referencia: nomePrincipal,
      });
    }

    const headerIdx = raw.findIndex((r) => r.some((c) => /^pr(é|e)dio$/i.test(String(c).trim())));
    if (headerIdx >= 0) {
      const header = raw[headerIdx].map((c) => norm(c));
      const iPredio = header.indexOf("PREDIO");
      const iAndar = header.indexOf("ANDAR");
      const iEspaco = header.indexOf("ESPACO");
      const iPeriodo = header.indexOf("PERIODO");
      const grafias = new Map<string, Set<string>>();

      for (const r of raw.slice(headerIdx + 1)) {
        const predioRaw = String(r[iPredio] ?? "");
        const espacoRaw = String(r[iEspaco] ?? "");
        if (!predioRaw.trim() && !espacoRaw.trim()) continue;
        const predio = normPredio(predioRaw);
        const andar = norm(r[iAndar]);
        const espaco = normEspaco(espacoRaw);
        const codigo = pontoCodigo(predio, andar, espaco);

        const set = grafias.get(predio) ?? new Set<string>();
        set.add(predioRaw.trim());
        grafias.set(predio, set);

        if (normEspaco(espacoRaw) !== norm(espacoRaw)) {
          divergencias.push({
            tipo: "grafia_corrigida",
            severidade: "info",
            mensagem: `Grafia corrigida na aba consolidada: "${espacoRaw.trim()}" → "${espaco}".`,
            referencia: codigo,
          });
        }

        const declarados = iPeriodo >= 0 ? diasDoPeriodo(String(r[iPeriodo] ?? "")) : [];
        const reais = mapa.get(codigo)?.dias ?? [];
        if (declarados.length) {
          const extras = reais.filter((d) => !declarados.includes(d));
          const faltando = declarados.filter((d) => !reais.includes(d));
          if (extras.length || faltando.length) {
            revisoes.set(codigo, {
              motivo:
                `Aba consolidada declara ${declarados.map((d) => DIA_LABEL[d]).join(", ") || "—"};` +
                ` abas diárias trazem ${reais.map((d) => DIA_LABEL[d]).join(", ") || "nenhum dia"}.`,
              diasExtras: extras,
              diasFaltando: faltando,
            });
            divergencias.push({
              tipo: "periodo_divergente",
              severidade: "alerta",
              mensagem:
                `${predio} · ${espaco}: período declarado (${declarados.map((d) => DIA_LABEL[d]).join(", ") || "—"})` +
                ` difere das abas diárias (${reais.map((d) => DIA_LABEL[d]).join(", ") || "nenhum dia"}).`,
              referencia: codigo,
            });
          }
        }
        if (!mapa.has(codigo)) {
          divergencias.push({
            tipo: "so_na_consolidada",
            severidade: "alerta",
            mensagem: `${predio} · ${espaco} existe na aba consolidada mas não aparece em nenhuma aba diária.`,
            referencia: codigo,
          });
        }
      }

      for (const [canon, set] of grafias) {
        if (set.size > 1) {
          divergencias.push({
            tipo: "grafia_duplicada",
            severidade: "info",
            mensagem: `Grafias diferentes unificadas em "${canon}": ${[...set].join(" / ")}.`,
            referencia: canon,
          });
        }
      }
    }
  } else {
    divergencias.push({
      tipo: "aba_ausente",
      severidade: "alerta",
      mensagem: "A aba consolidada de programação não foi encontrada.",
    });
  }

  for (const [codigo, revisao] of revisoes) {
    const ponto = mapa.get(codigo);
    if (ponto) ponto.revisao = revisao;
  }

  const pontos = [...mapa.values()].sort(
    (a, b) => a.predio.localeCompare(b.predio) || a.espaco.localeCompare(b.espaco),
  );
  const totalVisitas = pontos.reduce((acc, p) => acc + p.dias.length, 0);

  // Campos que a planilha não possui e passam a ser controlados pelo sistema.
  divergencias.push({
    tipo: "campos_ausentes",
    severidade: "info",
    mensagem:
      "A planilha não traz bags por ponto, ordem da rota, janela de horário, responsável, veículo, status, foto nem histórico. Esses campos passam a ser gerenciados no sistema (valores padrão aplicados na importação).",
  });

  return { pontos, totalLinhas, totalVisitas, porDia, divergencias };
}
