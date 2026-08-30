export type MensageriaErrorKind =
  | "schema"
  | "permission"
  | "session"
  | "network"
  | "relation"
  | "duplicate"
  | "validation"
  | "unknown";

export type MensageriaErrorInfo = {
  kind: MensageriaErrorKind;
  title: string;
  message: string;
  reference: string;
  retryable: boolean;
};

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | null {
  return typeof value === "object" && value !== null ? (value as ErrorRecord) : null;
}

function readText(record: ErrorRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function readStatus(record: ErrorRecord | null) {
  const value = record?.status ?? record?.statusCode;
  return typeof value === "number" || typeof value === "string" ? String(value) : "";
}

export function describeMensageriaError(error: unknown): MensageriaErrorInfo {
  const record = asRecord(error);
  const code = readText(record, "code").toUpperCase();
  const status = readStatus(record);
  const message = [
    error instanceof Error ? error.message : "",
    readText(record, "message"),
    readText(record, "details"),
    readText(record, "hint"),
  ]
    .join(" ")
    .toLocaleLowerCase("pt-BR");
  const reference = code || (status ? `HTTP ${status}` : "MENSAGERIA_UNKNOWN");

  if (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("relation") && message.includes("does not exist")) ||
    message.includes("could not find the table")
  ) {
    return {
      kind: "schema",
      title: "Estrutura da Mensageria não encontrada",
      message:
        "O módulo ainda não foi provisionado no Supabase desta sessão. A autenticação foi preservada; um administrador precisa aplicar a migration da Mensageria neste mesmo projeto.",
      reference,
      retryable: false,
    };
  }

  if (code === "42703" || code === "PGRST204" || message.includes("schema cache")) {
    return {
      kind: "schema",
      title: "Base da Mensageria desatualizada",
      message:
        "A estrutura encontrada não corresponde à versão atual do painel. Aplique as migrations pendentes no Supabase da autenticação antes de continuar.",
      reference,
      retryable: false,
    };
  }

  if (
    code === "42501" ||
    status === "403" ||
    message.includes("permission denied") ||
    message.includes("row-level security") ||
    message.includes("row level security")
  ) {
    return {
      kind: "permission",
      title: "Acesso à Mensageria não autorizado",
      message:
        "Sua conta está autenticada, mas não possui permissão para consultar ou alterar este módulo. Solicite o menu Mensageria ao administrador do sistema.",
      reference,
      retryable: false,
    };
  }

  if (
    code === "PGRST301" ||
    status === "401" ||
    message.includes("jwt expired") ||
    message.includes("invalid jwt") ||
    message.includes("not authenticated")
  ) {
    return {
      kind: "session",
      title: "Sessão expirada",
      message:
        "Entre novamente para renovar sua sessão e voltar a acessar os protocolos de Mensageria.",
      reference,
      retryable: false,
    };
  }

  if (
    error instanceof TypeError ||
    status === "0" ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("timeout")
  ) {
    return {
      kind: "network",
      title: "Falha de conexão com a Mensageria",
      message:
        "Não foi possível alcançar o servidor agora. Verifique a conexão e tente novamente; nenhum dado foi alterado.",
      reference: code || "MENSAGERIA_NETWORK",
      retryable: true,
    };
  }

  if (code === "23503") {
    return {
      kind: "relation",
      title: "Setor não disponível",
      message:
        "O setor selecionado não existe mais ou foi desativado. Atualize a página e escolha um setor disponível.",
      reference,
      retryable: true,
    };
  }

  if (code === "23505") {
    return {
      kind: "duplicate",
      title: "Protocolo já cadastrado",
      message:
        "Já existe um registro com essa referência. Confira o código de rastreio ou o código interno antes de tentar novamente.",
      reference,
      retryable: false,
    };
  }

  if (code === "23514" || code === "22007" || code === "22008") {
    return {
      kind: "validation",
      title: "Dados do protocolo inválidos",
      message:
        "Revise datas, quantidade, status e assinatura. Os dados não atendem às regras de integridade da Mensageria.",
      reference,
      retryable: false,
    };
  }

  return {
    kind: "unknown",
    title: "Não foi possível acessar a Mensageria",
    message:
      "O servidor não concluiu a operação. Tente novamente e, se o problema continuar, informe a referência técnica ao administrador.",
    reference,
    retryable: true,
  };
}
