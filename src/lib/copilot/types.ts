// Tipos compartilhados (client + server) do Copiloto Admin.

export type AcaoTipo =
  | "definir_papel"
  | "definir_menus"
  | "bloquear_usuario"
  | "resetar_senha"
  | "atualizar_status_os"
  | "limpar_tabela";

export interface AcaoProposta {
  id: string;
  tipo: AcaoTipo;
  resumo: string;
  params: Record<string, unknown>;
  perigosa: boolean;
}

export interface CopilotMensagem {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotConsulta {
  sql: string;
  linhas: number;
  amostra: unknown[];
}

export interface CopilotResposta {
  reply: string;
  consultas: CopilotConsulta[];
  acoes: AcaoProposta[];
}

export const ACAO_LABEL: Record<AcaoTipo, string> = {
  definir_papel: "Alterar papel do usuário",
  definir_menus: "Alterar módulos liberados",
  bloquear_usuario: "Ativar/desativar usuário",
  resetar_senha: "Redefinir senha",
  atualizar_status_os: "Atualizar status de OS",
  limpar_tabela: "Limpar tabela",
};
