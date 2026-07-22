import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LoteStatus = "rascunho" | "pendente" | "em_execucao" | "concluido" | "erro";
export type OsStatus = "pendente" | "em_execucao" | "concluido" | "erro";
export type LoteCategoria = "refrigeracao" | "geral";

export type Lote = {
  id: string;
  user_id: string;
  nome: string | null;
  categoria: LoteCategoria;
  data_inicio: string;
  hora_limite_jornada: string;
  duracao_padrao_horas: number;
  status: LoteStatus;
  total_os: number;
  os_concluidas: number;
  os_com_erro: number;
  iniciado_em: string | null;
  finalizado_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type OsItem = {
  id: string;
  lote_id: string;
  numero_os: string;
  ordem: number;
  status: OsStatus;
  mensagem_erro: string | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
};

export type Tecnico = {
  id: string;
  nome: string;
  matricula: string | null;
  ativo: boolean;
};

export type Equipe = { id: string; nome: string };

export type ExecLog = {
  id: string;
  lote_id: string;
  os_item_id: string | null;
  etapa: string;
  status: string;
  mensagem: string | null;
  criado_em: string;
};

/** Invalida queries do painel quando qualquer linha do usuário muda. */
export function usePrismaRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("prisma-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "prisma_lotes" }, () => {
        qc.invalidateQueries({ queryKey: ["prisma-lotes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prisma_os_itens" }, () => {
        qc.invalidateQueries({ queryKey: ["prisma-os-itens"] });
        qc.invalidateQueries({ queryKey: ["prisma-lotes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prisma_execucao_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["prisma-logs"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "prisma_extensao_status" }, () => {
        qc.invalidateQueries({ queryKey: ["prisma-ext-status"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function useLotes() {
  return useQuery({
    queryKey: ["prisma-lotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_lotes")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Lote[];
    },
  });
}

export function useOsItens(loteId: string | null) {
  return useQuery({
    queryKey: ["prisma-os-itens", loteId],
    enabled: !!loteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_os_itens")
        .select("*")
        .eq("lote_id", loteId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as OsItem[];
    },
  });
}

export function useLogs(loteId: string | null) {
  return useQuery({
    queryKey: ["prisma-logs", loteId],
    enabled: !!loteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_execucao_logs")
        .select("*")
        .eq("lote_id", loteId!)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as ExecLog[];
    },
  });
}

export function useTecnicos() {
  return useQuery({
    queryKey: ["prisma-tecnicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_tecnicos")
        .select("id,nome,matricula,ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Tecnico[];
    },
  });
}

export function useEquipes() {
  return useQuery({
    queryKey: ["prisma-equipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prisma_equipes").select("id,nome").order("nome");
      if (error) throw error;
      return (data ?? []) as Equipe[];
    },
  });
}

export function useEquipeTecnicos(equipeId: string | null) {
  return useQuery({
    queryKey: ["prisma-equipe-tecnicos", equipeId],
    enabled: !!equipeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_equipe_tecnicos")
        .select("tecnico_id")
        .eq("equipe_id", equipeId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.tecnico_id as string);
    },
  });
}

export function useExtStatus() {
  return useQuery({
    queryKey: ["prisma-ext-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_extensao_status")
        .select("ultima_atividade,versao,info")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as { ultima_atividade: string; versao: string | null; info: unknown } | null;
    },
    refetchInterval: 15000,
  });
}
