/**
 * Compatibilidade de importação.
 *
 * A rota Corretiva Novo continua importando este módulo, mas o botão "Designar"
 * agora é encaminhado para um agente exclusivo que lê todos os chamados abertos.
 */
export {
  analyzeCorrectiveOrder,
  planCorrectiveDesignations,
  type CorrectiveDesignationPlan,
  type CorrectiveDesignationRow,
  type DesignationRunResult,
} from "@/lib/corretiva/designation-agent";

export {
  designateAllCorrectiveOrders,
  reclassifyAllOsWithAi,
} from "@/lib/corretiva/exclusive-designation-agent";
