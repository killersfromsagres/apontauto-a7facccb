// Item 15 — catálogo de permissões e papéis do módulo de Água.
// Espelha exatamente as linhas de `pcm_permissions` / `pcm_role_permissions`
// criadas na migração; serve para montar telas de RBAC e para os testes.

export const AGUA_PERMISSOES = [
  "water_delivery.view",
  "water_delivery.plan",
  "water_delivery.assign",
  "water_delivery.execute",
  "water_delivery.correct",
  "water_delivery.manage",
  "water_delivery.export",
  "water_delivery.photos.view",
  "water_delivery.photos.upload",
  "water_delivery.whatsapp.share",
  "water_delivery.whatsapp.automatic",
  "water_bags.manage",
  "water_filters.view",
  "water_filters.request",
  "water_filters.triage",
  "water_filters.execute",
  "water_filters.manage",
  "water_filters.export",
] as const;

export type AguaPermissao = (typeof AGUA_PERMISSOES)[number];

export const AGUA_PERMISSAO_LABEL: Record<AguaPermissao, string> = {
  "water_delivery.view": "Visualizar entregas",
  "water_delivery.plan": "Programar rotas",
  "water_delivery.assign": "Atribuir rota a colaborador",
  "water_delivery.execute": "Executar rota em campo",
  "water_delivery.correct": "Retificar registro finalizado",
  "water_delivery.manage": "Gerenciar o módulo",
  "water_delivery.export": "Exportar dados",
  "water_delivery.photos.view": "Ver evidências",
  "water_delivery.photos.upload": "Enviar evidências",
  "water_delivery.whatsapp.share": "Compartilhar no WhatsApp",
  "water_delivery.whatsapp.automatic": "Envio automático WhatsApp",
  "water_bags.manage": "Gerenciar bags e estoque",
  "water_filters.view": "Visualizar solicitações de filtro",
  "water_filters.request": "Abrir solicitação de filtro",
  "water_filters.triage": "Triagem e aprovação de filtro",
  "water_filters.execute": "Executar troca de filtro",
  "water_filters.manage": "Gerenciar filtros",
  "water_filters.export": "Exportar filtros",
};

/** Módulo do RBAC ao qual cada permissão pertence. */
export function moduloDaPermissao(p: AguaPermissao): string {
  if (p.startsWith("water_bags")) return "agua-bags";
  if (p.startsWith("water_filters")) return "agua-filtros";
  return "abastecimento-agua";
}

const GESTAO_COMPLETA = [...AGUA_PERMISSOES] as AguaPermissao[];

export const AGUA_PAPEIS: Record<string, AguaPermissao[]> = {
  operador_frota: [
    "water_delivery.execute",
    "water_delivery.photos.view",
    "water_delivery.photos.upload",
    "water_delivery.whatsapp.share",
  ],
  gestor_frota: GESTAO_COMPLETA,
  gestor_pcm: GESTAO_COMPLETA,
  administrador: GESTAO_COMPLETA,
  proprietario: GESTAO_COMPLETA,
  solicitante_filtro: ["water_filters.request", "water_filters.view"],
  tecnico_filtro: ["water_filters.execute", "water_filters.view", "water_delivery.photos.upload"],
};

/**
 * Papéis que NÃO recebem acesso automático ao módulo de água.
 * Corretiva e climatização só entram por concessão explícita no RBAC.
 */
export const AGUA_PAPEIS_SEM_ACESSO_AUTOMATICO = [
  "tecnico_corretiva",
  "tecnico_climatizacao",
] as const;

export function papelTemPermissao(papel: string, perm: AguaPermissao): boolean {
  return (AGUA_PAPEIS[papel] ?? []).includes(perm);
}

/** Um operador "puro" (só executa) enxerga apenas as próprias rotas. */
export function escopoRestrito(perms: readonly AguaPermissao[]): boolean {
  return (
    perms.includes("water_delivery.execute") &&
    !perms.includes("water_delivery.manage") &&
    !perms.includes("water_delivery.plan") &&
    !perms.includes("water_delivery.view")
  );
}
