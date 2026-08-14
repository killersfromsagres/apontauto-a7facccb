export type RondaStatus = 'pendente' | 'concluido';

export interface RondaCalha {
    id: string;
    predio: string;
    preventiva_nome: string;
    status: RondaStatus;
    realizado_por?: string;
    realizado_em?: string;
    problemas_identificados?: string;
    fotos: string[];
    fotos_antes?: string[];
    fotos_depois?: string[];
    mes_referencia: string;
    created_at: string;
}

export interface RondaInput {
    predio: string;
    preventiva_nome: string;
    mes_referencia: string;
}
