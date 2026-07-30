/**
 * Backend em memória usado pelos testes de integração e E2E do módulo Água.
 *
 * Reproduz o suficiente do cliente Supabase (query builder, auth e rpc) para
 * exercitar o código real de produção, incluindo uma camada que imita as
 * políticas de RLS do item 15: quem não recebeu permissão explícita ao módulo
 * (corretiva, climatização) simplesmente não lê nem escreve nada.
 */

export type Papel =
  | "gestor"
  | "operador"
  | "tecnico_filtro"
  | "solicitante"
  | "corretiva"
  | "climatizacao";

export type Row = Record<string, any>;

const TABELAS_AGUA = /^agua_/;

/** Papéis com acesso de leitura ao módulo (espelho de agua_can('read')). */
const LEITURA: Papel[] = ["gestor", "operador", "tecnico_filtro", "solicitante"];
/** Papéis com escrita operacional (espelho de agua_can('update')). */
const ESCRITA: Papel[] = ["gestor", "operador", "tecnico_filtro"];

export interface Sessao {
  userId: string;
  papel: Papel;
  /** Nome usado pelas políticas de escopo restrito do operador. */
  nome?: string;
}

export class RlsError extends Error {
  code = "42501";
  constructor(tabela: string) {
    super(`permission denied for table ${tabela}`);
    this.name = "RlsError";
  }
}

function combina(row: Row, filtros: Filtro[]): boolean {
  return filtros.every((f) => {
    const v = row[f.coluna];
    switch (f.op) {
      case "eq":
        return v === f.valor;
      case "neq":
        return v !== f.valor;
      case "in":
        return (f.valor as unknown[]).includes(v);
      case "is":
        return f.valor === null ? v === null || v === undefined : v === f.valor;
      case "gte":
        return v >= (f.valor as any);
      case "lte":
        return v <= (f.valor as any);
      case "gt":
        return v > (f.valor as any);
      case "lt":
        return v < (f.valor as any);

      default:
        return true;
    }
  });
}

type Filtro = { coluna: string; op: string; valor: unknown };

let seq = 0;
function novoId(prefixo: string): string {
  seq += 1;
  return `${prefixo}-${String(seq).padStart(6, "0")}`;
}

export class FakeSupabase {
  tabelas = new Map<string, Row[]>();
  sessao: Sessao = { userId: "user-gestor", papel: "gestor", nome: "Gestor" };
  /** Chamadas de rpc registradas (notificações, geração de rotas…). */
  rpcs: Array<{ nome: string; args: Row }> = [];
  /** Rotas em que o operador atual pode escrever (escopo restrito do item 15). */
  rotasDoOperador = new Set<string>();

  entrar(papel: Papel, nome?: string): void {
    this.sessao = { userId: `user-${papel}`, papel, nome: nome ?? papel };
  }

  linhas(tabela: string): Row[] {
    if (!this.tabelas.has(tabela)) this.tabelas.set(tabela, []);
    return this.tabelas.get(tabela)!;
  }

  semear(tabela: string, rows: Row[]): void {
    this.linhas(tabela).push(...rows.map((r) => ({ ...r })));
  }

  /* --------------------------- RLS --------------------------- */

  private podeLer(tabela: string): boolean {
    if (!TABELAS_AGUA.test(tabela)) return true;
    return LEITURA.includes(this.sessao.papel);
  }

  private podeEscrever(tabela: string, row?: Row): boolean {
    if (!TABELAS_AGUA.test(tabela)) return true;
    if (!ESCRITA.includes(this.sessao.papel)) return false;
    // Operador só escreve nas paradas das rotas ativas atribuídas a ele.
    if (
      this.sessao.papel === "operador" &&
      tabela === "agua_visitas" &&
      row?.rota_id &&
      !this.rotasDoOperador.has(row.rota_id)
    ) {
      return false;
    }
    return true;
  }

  /* ----------------------- query builder ---------------------- */

  from(tabela: string) {
    return new FakeQuery(this, tabela);
  }

  executar(q: FakeQuery): { data: any; error: any } {
    const tabela = q.tabela;
    const store = this.linhas(tabela);

    try {
      if (q.op === "insert" || q.op === "upsert") {
        const inseridas: Row[] = [];
        for (const bruta of q.payload as Row[]) {
          if (!this.podeEscrever(tabela, bruta)) throw new RlsError(tabela);
          const conflito = q.onConflict
            ? store.find((r) => r[q.onConflict!] === bruta[q.onConflict!])
            : undefined;
          if (conflito && q.op === "upsert") {
            Object.assign(conflito, bruta);
            inseridas.push(conflito);
            continue;
          }
          if (conflito) {
            return { data: null, error: { message: "duplicate key value", code: "23505" } };
          }
          const nova: Row = {
            id: bruta.id ?? novoId(tabela.replace(/^agua_/, "")),
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
            ...(PADROES[tabela] ?? {}),
            ...bruta,

          };
          store.push(nova);
          inseridas.push(nova);
        }
        return { data: q.retornaLinhas ? this.projetar(inseridas, q) : null, error: null };
      }

      if (q.op === "update") {
        const alvos = store.filter((r) => combina(r, q.filtros));
        for (const row of alvos) {
          if (!this.podeEscrever(tabela, row)) throw new RlsError(tabela);
          Object.assign(row, q.payload as Row, { atualizado_em: new Date().toISOString() });
        }
        return { data: q.retornaLinhas ? this.projetar(alvos, q) : null, error: null };
      }

      if (q.op === "delete") {
        const alvos = store.filter((r) => combina(r, q.filtros));
        for (const row of alvos) if (!this.podeEscrever(tabela, row)) throw new RlsError(tabela);
        for (const row of alvos) store.splice(store.indexOf(row), 1);
        return { data: null, error: null };
      }

      // select
      if (!this.podeLer(tabela)) throw new RlsError(tabela);
      let linhas = store.filter((r) => combina(r, q.filtros));
      if (this.sessao.papel === "operador" && tabela === "agua_visitas") {
        linhas = linhas.filter((r) => !r.rota_id || this.rotasDoOperador.has(r.rota_id));
      }
      for (const ordem of q.ordens) {
        linhas = [...linhas].sort((a, b) => {
          const x = a[ordem.coluna];
          const y = b[ordem.coluna];
          if (x === y) return 0;
          const menor = (x ?? "") < (y ?? "") ? -1 : 1;
          return ordem.asc ? menor : -menor;
        });
      }
      if (q.limite != null) linhas = linhas.slice(0, q.limite);
      return { data: this.projetar(linhas, q), error: null };
    } catch (err) {
      if (err instanceof RlsError) {
        return { data: null, error: { message: err.message, code: err.code } };
      }
      throw err;
    }
  }

  private projetar(linhas: Row[], q: FakeQuery) {
    const copias = linhas.map((r) => ({ ...r }));
    if (q.unica) return copias[0] ?? null;
    return copias;
  }

  /* --------------------------- auth --------------------------- */

  auth = {
    getUser: async () => ({ data: { user: { id: this.sessao.userId } }, error: null }),
    getSession: async () => ({
      data: { session: { access_token: "token-de-teste", user: { id: this.sessao.userId } } },
      error: null,
    }),
  };

  async rpc(nome: string, args: Row = {}) {
    this.rpcs.push({ nome, args });
    if (!LEITURA.includes(this.sessao.papel)) {
      return { data: null, error: { message: "sem permissao", code: "42501" } };
    }
    return { data: novoId("rpc"), error: null };
  }

  storage = {
    from: () => ({
      upload: async () => ({ data: null, error: { message: "storage desabilitado no teste" } }),
      createSignedUrl: async () => ({ data: null, error: { message: "indisponível" } }),
    }),
  };
}

class FakeQuery implements PromiseLike<{ data: any; error: any }> {
  op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  payload: unknown = null;
  filtros: Filtro[] = [];
  ordens: Array<{ coluna: string; asc: boolean }> = [];
  limite: number | null = null;
  unica = false;
  retornaLinhas = false;
  onConflict: string | null = null;

  constructor(
    private cliente: FakeSupabase,
    public tabela: string,
  ) {}

  select(_campos?: string) {
    if (this.op === "select") this.op = "select";
    this.retornaLinhas = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict ?? null;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, op: "eq", valor });
    return this;
  }
  neq(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, op: "neq", valor });
    return this;
  }
  in(coluna: string, valor: unknown[]) {
    this.filtros.push({ coluna, op: "in", valor });
    return this;
  }
  is(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, op: "is", valor });
    return this;
  }
  gte(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, op: "gte", valor });
    return this;
  }
  lte(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, op: "lte", valor });
    return this;
  }
  gt(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, op: "gt", valor });
    return this;
  }
  lt(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, op: "lt", valor });
    return this;
  }
  order(coluna: string, opts?: { ascending?: boolean }) {
    this.ordens.push({ coluna, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.limite = n;
    return this;
  }
  single() {
    this.unica = true;
    this.retornaLinhas = true;
    return this;
  }
  maybeSingle() {
    this.unica = true;
    this.retornaLinhas = true;
    return this;
  }

  then<R1 = { data: any; error: any }, R2 = never>(
    onFulfilled?: ((v: { data: any; error: any }) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.cliente.executar(this)).then(onFulfilled, onRejected);
  }
}

export const fakeSupabase = new FakeSupabase();

/** Zera o estado entre testes. */
export function resetarBanco(): void {
  fakeSupabase.tabelas.clear();
  fakeSupabase.rpcs = [];
  fakeSupabase.rotasDoOperador.clear();
  fakeSupabase.entrar("gestor", "Gestor");
}
