// Runtime-editable configuration. Persisted in Lovable Cloud (single shared row).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WhatsAppNumeroAdmin {
  label: string;
  /** Apenas dígitos com DDI (ex.: 5511999999999). */
  numero: string;
}

/** Configuração do botão "Enviar evidências ao WhatsApp" (item 11). */
export interface AguaWhatsappConfig {
  /** Modelo configurável da mensagem (item 11.4). */
  template: string;
  /** Números administrativos salvos — mascarados para quem não é gestor. */
  numeros: WhatsAppNumeroAdmin[];
  /** Limite de links por mensagem para evitar textos enormes (item 11.2). */
  maxLinks: number;
  /** Acima desta quantidade de fotos, gera um PDF resumido único. */
  pdfAcimaDe: number;
  /** Modo avançado opcional — Cloud API oficial da Meta (item 11.3). */
  cloud: {
    habilitado: boolean;
    /** Só permite disparo real depois que o administrador validar. */
    validado: boolean;
    sandbox: boolean;
    destinatarios: string[];
    limiteDiario: number;
  };
}

export interface AppSettings {
  siteAllowed: string;
  refrig1: string[];
  refrig2: string[];
  refrig3: string[];
  hidraulicaKeywords: string[];
  workingHours: {
    morningStart: string;
    morningEnd: string;
    afternoonStart: string;
    afternoonEnd: string;
  };
  defaultTaskMinutes: number;
  workdays: number[];
  aguaWhatsapp: AguaWhatsappConfig;
}

export const DEFAULT_AGUA_WHATSAPP: AguaWhatsappConfig = {
  template: `*Abastecimento de Água — Evidências da Rota*
Data: {data}
Equipe: {equipe}
Veículo: {veiculo}
Progresso: {progresso}
Bags entregues: {bags}
Ocorrências: {ocorrencias}

{lista}

_Registro gerado automaticamente pelo Apont Auto._`,
  numeros: [],
  maxLinks: 30,
  pdfAcimaDe: 12,
  cloud: {
    habilitado: false,
    validado: false,
    sandbox: true,
    destinatarios: [],
    limiteDiario: 50,
  },
};


export const DEFAULT_SETTINGS: AppSettings = {
  siteAllowed: "DEMARCHI",
  refrig1: ["A160", "A170", "ADC", "Ambulatório", "B203"],
  refrig2: [
    "A220","B115","B290","C110","C120","C340","C380","C45","C46","C49","C65","C70","D240","D246",
  ],
  refrig3: [
    "D270","D295","D345","D55","E105","E125","E130","E171","E200","E310","E35","E70","E80",
    "F30","Fundação ECO+","Z210","Z310","Z500",
  ],
  hidraulicaKeywords: [
    "Caixas Pluviais","Fluentes","Canaletas","Tubulações","Limpeza de Calhas",
    "Grelhas","Ralos","Bocas de Lobo",
  ],
  workingHours: {
    morningStart: "08:00",
    morningEnd: "12:00",
    afternoonStart: "13:00",
    afternoonEnd: "17:00",
  },
  defaultTaskMinutes: 60,
  workdays: [1, 2, 3, 4, 5],
  aguaWhatsapp: DEFAULT_AGUA_WHATSAPP,
};


let cache: AppSettings = DEFAULT_SETTINGS;
let rowId: string | null = null;
let loaded = false;
const listeners = new Set<(s: AppSettings) => void>();

export function getSettings(): AppSettings {
  return cache;
}

export async function loadSettings(): Promise<AppSettings> {
  if (loaded) return cache;
  const { data, error } = await supabase
    .from("app_settings")
    .select("id, data")
    .limit(1)
    .maybeSingle();
  if (!error && data) {
    rowId = data.id;
    cache = { ...DEFAULT_SETTINGS, ...(data.data as Partial<AppSettings>) };
  }
  loaded = true;
  listeners.forEach((l) => l(cache));
  return cache;
}

export async function saveSettings(s: AppSettings): Promise<void> {
  cache = s;
  listeners.forEach((l) => l(s));
  if (rowId) {
    const { error } = await supabase
      .from("app_settings")
      .update({ data: s as never })
      .eq("id", rowId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("app_settings")
      .insert({ data: s as never })
      .select("id")
      .single();
    if (error) throw error;
    if (data) rowId = data.id;
    loaded = true;
  }
}

export function subscribeSettings(fn: (s: AppSettings) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): [AppSettings, (s: AppSettings) => Promise<void>] {
  const [s, setS] = useState<AppSettings>(cache);
  useEffect(() => {
    void loadSettings().then(setS);
    const off = subscribeSettings(setS);
    return () => {
      off();
    };
  }, []);
  return [s, saveSettings];
}
