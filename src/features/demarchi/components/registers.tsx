import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Users, Building2, CalendarDays } from "lucide-react";
import {
  createAccount,
  generatePreventives,
  reschedulePlans,
  saveAsset,
  savePerson,
  savePlan,
} from "../api";
import {
  KINDS,
  locationText,
  locationIndex,
  type AssetKind,
  type DemAsset,
  type DemPerson,
  type DemPlan,
} from "../domain";
import { AssetPicker, dateLabel, Field, Modal, SearchBox, today } from "./shared";

function Pager({
  count,
  page,
  setPage,
  size = 50,
}: {
  count: number;
  page: number;
  setPage: (p: number) => void;
  size?: number;
}) {
  return (
    <div className="dem-pager">
      <span>
        {count
          ? `${page * size + 1}–${Math.min(count, (page + 1) * size)} de ${count}`
          : "Nenhum registro"}
      </span>
      <div>
        <button
          className="dem-btn dem-btn-secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <button
          className="dem-btn dem-btn-secondary"
          disabled={(page + 1) * size >= count}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
export { Pager };

export function AssetsRegister({
  assets,
  refresh,
}: {
  assets: DemAsset[];
  refresh: () => unknown;
}) {
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(0),
    [editing, setEditing] = useState<Partial<DemAsset> | null>(null),
    [busy, setBusy] = useState(false);
  const filtered = useMemo(
    () =>
      assets.filter(
        (a) =>
          (!kind || a.kind === kind) &&
          `${a.code} ${a.name}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [assets, kind, search],
  );
  const parents = editing
    ? assets.filter(
        (a) =>
          a.id !== editing.id &&
          (
            {
              planta: [],
              predio: ["planta"],
              andar: ["predio"],
              ambiente: ["andar"],
              equipamento: ["ambiente", "andar", "predio"],
            }[editing.kind || "ambiente"] as string[]
          ).includes(a.kind),
      )
    : [];
  return (
    <section>
      <div className="dem-section-title">
        <div>
          <h2>
            <Building2 size={20} /> Ativos e locais
          </h2>
          <p>
            Prédio, andar, ambiente e equipamento. Os códigos podem ser alterados sem perder o
            histórico.
          </p>
        </div>
        <button
          className="dem-btn"
          onClick={() => setEditing({ name: "", kind: "ambiente", parent_id: null, enabled: true })}
        >
          <Plus size={17} /> Novo ativo
        </button>
      </div>
      <div className="dem-toolbar">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Pesquisar código ou nome"
        />
        <select
          aria-label="Tipo de ativo"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos os níveis</option>
          {Object.entries(KINDS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="dem-table-wrap">
        <table className="dem-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Denominação</th>
              <th>Nível</th>
              <th>Localização superior</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * 50, (page + 1) * 50).map((a) => (
              <tr key={a.id}>
                <td className="dem-mono">{a.code}</td>
                <td>
                  <strong>{a.name}</strong>
                </td>
                <td>{KINDS[a.kind]}</td>
                <td>{a.parent_id ? locationText(a.parent_id, assets) : "Demarchi"}</td>
                <td>{a.enabled ? "Ativo" : "Inativo"}</td>
                <td>
                  <button
                    className="dem-icon-btn"
                    aria-label={`Editar ${a.name}`}
                    onClick={() => setEditing({ ...a })}
                  >
                    <Pencil size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} page={page} setPage={setPage} />
      {editing && (
        <Modal
          title={editing.id ? "Editar ativo / localização" : "Novo ativo / localização"}
          close={() => setEditing(null)}
        >
          <form
            className="dem-section-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await saveAsset(editing);
                toast.success("Ativo salvo.");
                await refresh();
                setEditing(null);
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Nome do ativo / local">
              <input
                autoFocus
                required
                maxLength={200}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <div className="dem-form-grid">
              <Field
                label="Código"
                hint={
                  editing.id
                    ? "Os vínculos e chamados serão preservados."
                    : "Deixe vazio para gerar o próximo DEM automaticamente."
                }
              >
                <input
                  value={editing.code || ""}
                  maxLength={50}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value || undefined })}
                />
              </Field>
              <Field label="Nível">
                <select
                  value={editing.kind}
                  onChange={(e) =>
                    setEditing({ ...editing, kind: e.target.value as AssetKind, parent_id: null })
                  }
                >
                  {Object.entries(KINDS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {editing.kind !== "planta" && (
              <Field label="Localização superior">
                <select
                  required
                  value={editing.parent_id || ""}
                  onChange={(e) => setEditing({ ...editing, parent_id: e.target.value })}
                >
                  <option value="">Selecione o pai</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {locationText(p.id, assets) || p.name} · {p.code}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <label className="dem-check">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Disponível para novos chamados
            </label>
            <button className="dem-btn" disabled={busy}>
              Salvar ativo
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function PeopleRegister({
  people,
  refresh,
}: {
  people: DemPerson[];
  refresh: () => unknown;
}) {
  const [editing, setEditing] = useState<Partial<DemPerson> | null>(null),
    [password, setPassword] = useState(""),
    [withLogin, setWithLogin] = useState(true),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const team = people.filter((p) => p.kind === "tecnico");
  function create() {
    setEditing({ name: "", email: "", kind: "tecnico", specialty: "", active: true });
    setPassword("");
    setWithLogin(true);
  }
  return (
    <section>
      <div className="dem-section-title">
        <div>
          <h2>
            <Users size={20} /> Colaboradores
          </h2>
          <p>Cadastre os colaboradores técnicos que receberão atividades e apontamentos.</p>
        </div>
        <button className="dem-btn" onClick={create}>
          <Plus size={17} /> Cadastrar colaborador
        </button>
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder="Pesquisar nome ou e-mail" />
      <div className="dem-people-grid">
        {team
          .filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase()))
          .map((p) => (
            <article className="dem-person-card" key={p.id}>
              <span className="dem-avatar">
                {p.name
                  .split(" ")
                  .slice(0, 2)
                  .map((x) => x[0])
                  .join("")}
              </span>
              <div>
                <h3>{p.name}</h3>
                <p>{p.email || "Sem e-mail"}</p>
                <small>
                  {p.kind === "tecnico" ? "Colaborador técnico" : "Solicitante"}
                  {p.specialty && ` · ${p.specialty}`}
                </small>
                <span className="dem-badge">
                  {!p.active
                    ? "Inativo"
                    : p.user_id
                      ? "Acesso ao portal"
                      : "Cadastro para apontamentos"}
                </span>
              </div>
              <button
                className="dem-icon-btn"
                onClick={() => setEditing({ ...p })}
                aria-label={`Editar ${p.name}`}
              >
                <Pencil size={17} />
              </button>
            </article>
          ))}
      </div>
      {!team.length && (
        <div className="dem-empty">
          <Users size={32} />
          <h3>Cadastre seu primeiro colaborador.</h3>
          <p>O nome do colaborador ficará salvo nos apontamentos e relatórios.</p>
        </div>
      )}
      {editing && (
        <Modal
          title={editing.id ? "Editar cadastro" : "Cadastrar colaborador e acesso"}
          close={() => setEditing(null)}
        >
          <form
            className="dem-section-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                if (!editing.id && withLogin) {
                  await createAccount({
                    name: editing.name!,
                    email: editing.email!,
                    password,
                    kind: editing.kind!,
                    specialty: editing.specialty || "",
                  });
                } else {
                  const { user_id, ...values } = editing;
                  await savePerson(values);
                }
                await refresh();
                setEditing(null);
                setPassword("");
                toast.success("Cadastro salvo.");
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Nome completo">
              <input
                autoFocus
                required
                minLength={2}
                maxLength={160}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field
              label="E-mail"
              hint={
                editing.user_id
                  ? "O e-mail de login permanece o definido na criação do acesso."
                  : "Com acesso ao sistema, este e-mail será o login."
              }
            >
              <input
                type="email"
                required={withLogin && !editing.id}
                disabled={!!editing.user_id}
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </Field>
            <div className="dem-form-grid">
              <Field label="Perfil">
                <select
                  value={editing.kind}
                  onChange={(e) =>
                    setEditing({ ...editing, kind: e.target.value as DemPerson["kind"] })
                  }
                >
                  <option value="tecnico">Colaborador técnico</option>
                </select>
              </Field>
              <Field label="Equipe / especialidade (opcional)">
                <input
                  maxLength={160}
                  value={editing.specialty}
                  onChange={(e) => setEditing({ ...editing, specialty: e.target.value })}
                  placeholder="Ex.: elétrica, civil, hidráulica"
                />
              </Field>
            </div>
            {!editing.id ? (
              <>
                <label className="dem-check">
                  <input
                    type="checkbox"
                    checked={withLogin}
                    onChange={(e) => setWithLogin(e.target.checked)}
                  />
                  Criar acesso individual ao portal
                </label>
                {withLogin && (
                  <Field
                    label="Senha inicial"
                    hint="Mínimo de 10 caracteres. Entregue o acesso individualmente ao titular."
                  >
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                )}
              </>
            ) : (
              <label className="dem-check">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Cadastro ativo
              </label>
            )}
            <button className="dem-btn" disabled={busy}>
              {busy ? "Salvando…" : "Salvar cadastro"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function PlansRegister({
  plans,
  assets,
  refresh,
}: {
  plans: DemPlan[];
  assets: DemAsset[];
  refresh: () => unknown;
}) {
  const [search, setSearch] = useState(""),
    [active, setActive] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [date, setDate] = useState(today()),
    [through, setThrough] = useState(today()),
    [editing, setEditing] = useState<Partial<DemPlan> | null>(null),
    [busy, setBusy] = useState(false);
  const locations = useMemo(() => locationIndex(assets), [assets]);
  const filtered = useMemo(
    () =>
      plans.filter(
        (p) =>
          (!active || String(p.active) === active) &&
          `${p.name} ${p.routine_code} ${locations.get(p.asset_id)}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [plans, locations, search, active],
  );
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visible = filtered.slice(page * 50, (page + 1) * 50);
  return (
    <section>
      <div className="dem-section-title">
        <div>
          <h2>
            <CalendarDays size={20} /> Planos preventivos
          </h2>
          <p>
            Planos importados preservam as datas originais e começam pausados. Revise e programe
            antes de gerar atividades.
          </p>
        </div>
        <button
          className="dem-btn"
          onClick={() =>
            setEditing({
              asset_id: "",
              name: "",
              routine_code: "",
              interval_unit: "mes",
              interval_value: 1,
              next_due: today(),
              tolerance_days: 0,
              active: true,
              instructions: "",
            })
          }
        >
          <Plus size={17} /> Nova preventiva
        </button>
      </div>
      <div className="dem-toolbar">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Buscar roteiro, prédio ou atividade"
        />
        <select
          aria-label="Situação do plano"
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos os planos</option>
          <option value="true">Ativos</option>
          <option value="false">Pausados</option>
        </select>
      </div>
      <div className="dem-plan-actions">
        <div>
          <strong>Programar os {selected.length} planos selecionados</strong>
          <div>
            <input
              type="date"
              aria-label="Data inicial dos planos selecionados"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button
              className="dem-btn dem-btn-secondary"
              disabled={busy || !selected.length || !date}
              onClick={() =>
                void act(async () => {
                  await reschedulePlans(selected, date);
                  setSelected([]);
                }, "Planos programados e ativados.")
              }
            >
              Definir data e ativar
            </button>
          </div>
        </div>
        <div>
          <strong>Gerar ordens dos planos ativos</strong>
          <div>
            <input
              type="date"
              aria-label="Gerar preventivas até"
              value={through}
              min={today()}
              onChange={(e) => setThrough(e.target.value)}
            />
            <button
              className="dem-btn"
              disabled={busy || !through}
              onClick={() =>
                void act(async () => {
                  const n = await generatePreventives(through);
                  toast.info(
                    `${n} ordem(ns) criada(s).${n === 200 ? " Limite de 200 por lote: gere novamente para continuar." : ""}`,
                  );
                }, "Planos processados.")
              }
            >
              Gerar até esta data
            </button>
          </div>
        </div>
      </div>
      <div className="dem-table-wrap">
        <table className="dem-table">
          <thead>
            <tr>
              <th>
                <input
                  aria-label="Selecionar os planos desta página"
                  type="checkbox"
                  checked={!!visible.length && visible.every((p) => selected.includes(p.id))}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...new Set([...selected, ...visible.map((p) => p.id)])]
                        : selected.filter((id) => !visible.some((p) => p.id === id)),
                    )
                  }
                />
              </th>
              <th>Roteiro / atividade</th>
              <th>Local</th>
              <th>Intervalo</th>
              <th>Próxima execução</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${p.name}`}
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.id]
                          : selected.filter((id) => id !== p.id),
                      )
                    }
                  />
                </td>
                <td>
                  <small>{p.routine_code}</small>
                  <strong>{p.name}</strong>
                </td>
                <td>{locations.get(p.asset_id)}</td>
                <td>
                  {p.interval_value} {p.interval_unit === "mes" ? "mês(es)" : "dia(s)"}
                </td>
                <td>{dateLabel(p.next_due)}</td>
                <td>{p.active ? "Ativo" : "Pausado"}</td>
                <td>
                  <button
                    className="dem-icon-btn"
                    aria-label={`Editar ${p.name}`}
                    onClick={() => setEditing({ ...p })}
                  >
                    <Pencil size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} page={page} setPage={setPage} />
      {editing && (
        <Modal
          title={editing.id ? "Editar plano preventivo" : "Novo plano preventivo"}
          close={() => setEditing(null)}
        >
          <form
            className="dem-section-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await savePlan(editing);
                setEditing(null);
              }, "Plano preventivo salvo.");
            }}
          >
            <Field label="Atividade / título do plano">
              <input
                required
                minLength={3}
                maxLength={200}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Código do roteiro">
              <input
                maxLength={100}
                value={editing.routine_code}
                onChange={(e) => setEditing({ ...editing, routine_code: e.target.value })}
              />
            </Field>
            <AssetPicker
              allowPlant
              key={editing.id || "new"}
              assets={assets}
              value={editing.asset_id || ""}
              onChange={(id) => setEditing({ ...editing, asset_id: id })}
            />
            <div className="dem-form-grid">
              <Field label="A cada">
                <input
                  type="number"
                  min="1"
                  max="365"
                  required
                  value={editing.interval_value}
                  onChange={(e) =>
                    setEditing({ ...editing, interval_value: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Unidade">
                <select
                  value={editing.interval_unit}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      interval_unit: e.target.value as DemPlan["interval_unit"],
                    })
                  }
                >
                  <option value="dia">Dias</option>
                  <option value="mes">Meses</option>
                </select>
              </Field>
              <Field label="Próxima execução">
                <input
                  type="date"
                  required
                  value={editing.next_due}
                  onChange={(e) => setEditing({ ...editing, next_due: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Instruções / checklist">
              <textarea
                maxLength={10000}
                value={editing.instructions}
                onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                placeholder="Descreva as etapas da inspeção ou manutenção."
              />
            </Field>
            <label className="dem-check">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Plano ativo
            </label>
            {editing.source_due && (
              <p className="dem-help">
                Data preservada da planilha: {dateLabel(editing.source_due)}
              </p>
            )}
            <button className="dem-btn" disabled={busy || !editing.asset_id}>
              Salvar plano
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
