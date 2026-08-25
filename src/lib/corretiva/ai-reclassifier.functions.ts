/**
 * Compatibilidade de importação.
 *
 * A implementação passou para o agente client-side porque a sessão Supabase/RLS
 * do usuário autenticado vive no navegador. Manter este arquivo evita quebrar a
 * rota e qualquer import legado enquanto o botão Designar usa o agente dedicado.
 */
export {
  analyzeCorrectiveOrder,
  designateAllCorrectiveOrders,
  planCorrectiveDesignations,
  reclassifyAllOsWithAi,
  type CorrectiveDesignationPlan,
  type CorrectiveDesignationRow,
  type DesignationRunResult,
} from "@/lib/corretiva/designation-agent";
