import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  ListFilter,
  Plus,
  RefreshCw,
  Users,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageShell } from "@/components/page-shell";
import { useDemarchi } from "./use-demarchi";
import { createTicket } from "./api";
import {
  compareTickets,
  dueState,
  isClosed,
  locationText,
  locationIndex,
  productivity,
  protocol,
  PRIORITIES,
  STATUSES,
  type DemAsset,
  type DemTicket,
  type Priority,
} from "./domain";
import {
  AssetPicker,
  dateLabel,
  Field,
  Modal,
  PriorityBadge,
  SearchBox,
  StatusBadge,
  today,
} from "./components/shared";
import { TicketDetail } from "./components/ticket-detail";
import { AssetsRegister, PeopleRegister, PlansRegister, Pager } from "./components/registers";
import { ClientsRegister } from "./components/clients-register";
import "./demarchi.css";

const TABS = [
  { key: "chamados", label: "Chamados", icon: ClipboardList },
  { key: "programacao", label: "Programação", icon: CalendarDays },
  { key: "backorders", label: "Backorders", icon: ListFilter },
  { key: "preventivas", label: "Preventivas", icon: Wrench },
  { key: "ativos", label: "Ativos e locais", icon: Building2 },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "pessoas", label: "Colaboradores", icon: Users },
  { key: "produtividade", label: "Produtividade", icon: BarChart3 },
];
export function AdminCentral() {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <div className="dem-app dem-loading">Verificando acesso…</div>;
  if (!isAdmin)
    return (
      <div className="dem-app dem-empty">
        <h1>Central administrativa</h1>
        <p>Esta área é exclusiva da administração de manutenção.</p>
        <a className="dem-btn" href="/cliente">
          Ir para o portal do cliente
        </a>
      </div>
    );
  return <AdminWorkspace />;
}
function AdminWorkspace() {
  const data = useDemarchi(true),
    [tab, setTab] = useState("chamados"),
    [search, setSearch] = useState(""),
    [priority, setPriority] = useState(""),
    [status, setStatus] = useState("pendentes"),
    [building, setBuilding] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<DemTicket | null>(null),
    [creating, setCreating] = useState(false),
    [exporting, setExporting] = useState(false);
  const assets = data.assets.data || [],
    tickets = data.tickets.data || [],
    people = data.people.data || [],
    logs = data.logs.data || [],
    plans = data.plans.data || [];
  const locations = useMemo(() => locationIndex(assets), [assets]);
  const filtered = useMemo(
    () =>
      tickets
        .filter((t) => {
          if (tab === "backorders" && isClosed(t.status)) return false;
          if (priority && t.priority !== priority) return false;
          if (status === "pendentes" && isClosed(t.status)) return false;
          if (status && status !== "pendentes" && t.status !== status) return false;
          if (building && !locations.get(t.asset_id)?.split(" / ").includes(building)) return false;
          return `${protocol(t.number)} ${t.title} ${t.requester_name} ${locations.get(t.asset_id)}`
            .toLowerCase()
            .includes(search.toLowerCase());
        })
        .sort(compareTickets),
    [tickets, priority, status, building, search, locations, tab],
  );
  const pending = tickets.filter((t) => !isClosed(t.status)),
    late = pending.filter((t) => dueState(t) === "vencido");
  async function exportSheet() {
    setExporting(true);
    try {
      const { exportTickets } = await import("./export");
      await exportTickets(filtered, assets, people, logs);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  }
  function changeTab(key: string) {
    setTab(key);
    setPage(0);
    if (key === "backorders") setStatus("pendentes");
  }
  return (
    <PageShell
      title="Central Demarchi"
      eyebrow="MANUTENÇÃO E ATENDIMENTO"
      description="Da solicitação ao serviço realizado, em um só lugar."
      actions={
        <div className="dem-app dem-header-actions">
          <a className="dem-btn dem-btn-secondary" href="/cliente" target="_blank" rel="noreferrer">
            Portal do cliente
            <ExternalLink size={16} />
          </a>
          <button className="dem-btn" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Novo chamado
          </button>
        </div>
      }
    >
      <div className="dem-app dem-admin">
        <div className="dem-overview">
          <div className="dem-stat">
            <span>Em atendimento</span>
            <strong>{pending.length}</strong>
            <small>Todos os chamados pendentes</small>
          </div>
          <div className="dem-stat dem-stat-alert">
            <span>Prazo vencido</span>
            <strong>{late.length}</strong>
            <small>Priorizar na programação</small>
          </div>
          <div className="dem-stat">
            <span>Emergenciais</span>
            <strong>{pending.filter((t) => t.priority === "emergencial").length}</strong>
            <small>Prazo de até 1 dia corrido</small>
          </div>
          <div className="dem-stat">
            <span>Concluídos</span>
            <strong>{tickets.filter((t) => t.status === "concluido").length}</strong>
            <small>Com solução e apontamento</small>
          </div>
        </div>
        <div className="dem-status-line">
          <span className={`dem-live ${data.connection === "SUBSCRIBED" ? "" : "dem-live-off"}`}>
            <i />
            {data.connection === "SUBSCRIBED"
              ? "Atualização em tempo real"
              : "Conexão ao vivo em recuperação · atualização periódica ativa"}
          </span>
          <button className="dem-text-btn" onClick={() => void data.refresh()}>
            <RefreshCw size={15} />
            Atualizar
          </button>
        </div>
        <nav className="dem-tabs" aria-label="Seções da Central Demarchi">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "selected" : ""}
              onClick={() => changeTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}
        </nav>
        {data.error ? (
          <div className="dem-error" role="alert">
            <h2>Não foi possível carregar os dados</h2>
            <p>{data.error.message}</p>
            <button className="dem-btn" onClick={() => void data.refresh()}>
              Tentar novamente
            </button>
          </div>
        ) : data.assets.isPending || data.tickets.isPending ? (
          <div className="dem-loading" role="status">
            Carregando a Central Demarchi…
          </div>
        ) : (
          <>
            {["chamados", "backorders", "programacao"].includes(tab) && (
              <section>
                <div className="dem-section-title">
                  <div>
                    <h2>
                      {tab === "backorders"
                        ? "Backorders de manutenção"
                        : tab === "programacao"
                          ? "Programação das atividades"
                          : "Fila de chamados"}
                    </h2>
                    <p>
                      {tab === "backorders"
                        ? "Pendências abertas, ordenadas por criticidade e prazo."
                        : tab === "programacao"
                          ? "Distribua as atividades por data e colaborador no detalhe do chamado."
                          : "Abra um chamado para atribuir responsável, programar, registrar atividades ou concluir."}
                    </p>
                  </div>
                  <button
                    className="dem-btn dem-btn-secondary"
                    onClick={() => void exportSheet()}
                    disabled={exporting}
                  >
                    <Download size={17} />
                    {exporting ? "Exportando…" : "Exportar planilha"}
                  </button>
                </div>
                <div className="dem-toolbar">
                  <SearchBox
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(0);
                    }}
                    placeholder="Buscar protocolo, solicitante, problema ou local"
                  />
                  <select
                    aria-label="Filtrar criticidade"
                    value={priority}
                    onChange={(e) => {
                      setPriority(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">Todas as criticidades</option>
                    {Object.entries(PRIORITIES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar situação"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="pendentes">Em atendimento</option>
                    <option value="">Todas as situações</option>
                    {Object.entries(STATUSES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar prédio"
                    value={building}
                    onChange={(e) => {
                      setBuilding(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">Todos os prédios</option>
                    {assets
                      .filter((a) => a.kind === "predio")
                      .map((a) => (
                        <option key={a.id} value={a.name}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                {tab === "programacao" ? (
                  <div className="dem-schedule">
                    {[...new Set(filtered.map((t) => t.scheduled_for || "Não programados"))]
                      .sort((a, b) =>
                        a === "Não programados"
                          ? -1
                          : b === "Não programados"
                            ? 1
                            : a.localeCompare(b),
                      )
                      .map((day) => (
                        <section key={day}>
                          <h3>
                            <CalendarDays size={18} />
                            {day === "Não programados" ? day : dateLabel(day)}
                            <span>
                              {
                                filtered.filter(
                                  (t) => (t.scheduled_for || "Não programados") === day,
                                ).length
                              }
                            </span>
                          </h3>
                          {filtered
                            .filter((t) => (t.scheduled_for || "Não programados") === day)
                            .map((t) => (
                              <button key={t.id} onClick={() => setSelected(t)}>
                                <small>{protocol(t.number)}</small>
                                <strong>{t.title}</strong>
                                <p>{locations.get(t.asset_id)}</p>
                                <footer>
                                  <PriorityBadge value={t.priority} />
                                  <span>
                                    {people.find((p) => p.id === t.assigned_to)?.name ||
                                      "Definir responsável"}
                                  </span>
                                </footer>
                              </button>
                            ))}
                        </section>
                      ))}
                  </div>
                ) : (
                  <>
                    <div className="dem-table-wrap dem-ticket-table">
                      <table className="dem-table">
                        <thead>
                          <tr>
                            <th>Protocolo / chamado</th>
                            <th>Solicitante</th>
                            <th>Local</th>
                            <th>Criticidade</th>
                            <th>Prazo</th>
                            <th>Situação</th>
                            <th>Responsável</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.slice(page * 50, (page + 1) * 50).map((t) => (
                            <tr
                              key={t.id}
                              className={dueState(t) === "vencido" ? "dem-row-late" : ""}
                            >
                              <td>
                                <small className="dem-mono">{protocol(t.number)}</small>
                                <button className="dem-table-title" onClick={() => setSelected(t)}>
                                  {t.title}
                                </button>
                                {t.preventive_plan_id && <small>Preventiva</small>}
                              </td>
                              <td>
                                {t.requester_name}
                                <small>{dateLabel(t.created_at, true)}</small>
                              </td>
                              <td>{locations.get(t.asset_id)}</td>
                              <td>
                                <PriorityBadge value={t.priority} />
                                <small>{PRIORITIES[t.priority].days} dia(s)</small>
                              </td>
                              <td>
                                {dateLabel(t.deadline, true)}
                                {dueState(t) === "vencido" && (
                                  <small className="dem-danger-text">Prazo vencido</small>
                                )}
                              </td>
                              <td>
                                <StatusBadge ticket={t} />
                              </td>
                              <td>
                                {people.find((p) => p.id === t.assigned_to)?.name ||
                                  "Não atribuído"}
                                <small>{dateLabel(t.scheduled_for)}</small>
                              </td>
                              <td>
                                <button
                                  className="dem-btn dem-btn-secondary"
                                  onClick={() => setSelected(t)}
                                >
                                  Abrir
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="dem-mobile-ticket-list">
                      {filtered.slice(page * 50, (page + 1) * 50).map((t) => (
                        <button key={t.id} onClick={() => setSelected(t)}>
                          <small>{protocol(t.number)}</small>
                          <strong>{t.title}</strong>
                          <p>
                            {t.requester_name} · {locations.get(t.asset_id)}
                          </p>
                          <footer>
                            <PriorityBadge value={t.priority} />
                            <StatusBadge ticket={t} />
                            <span>{dateLabel(t.deadline)}</span>
                          </footer>
                        </button>
                      ))}
                    </div>
                    <Pager count={filtered.length} page={page} setPage={setPage} />
                  </>
                )}
                {!filtered.length && (
                  <div className="dem-empty">
                    <CheckCircle2 size={35} />
                    <h3>Nenhum chamado nesta seleção.</h3>
                    <p>Novas solicitações aparecerão automaticamente na fila.</p>
                  </div>
                )}
              </section>
            )}
            {tab === "ativos" && <AssetsRegister assets={assets} refresh={data.refresh} />}
            {tab === "pessoas" && <PeopleRegister people={people} refresh={data.refresh} />}
            {tab === "clientes" && <ClientsRegister people={people} refresh={data.refresh} />}
            {tab === "preventivas" && (
              <PlansRegister plans={plans} assets={assets} refresh={data.refresh} />
            )}
            {tab === "produtividade" && (
              <Productivity people={people} logs={logs} tickets={tickets} />
            )}
          </>
        )}
        {selected && (
          <TicketDetail
            key={selected.id}
            ticket={selected}
            assets={assets}
            people={people}
            logs={logs}
            admin
            close={() => setSelected(null)}
            refresh={data.refresh}
          />
        )}
        {creating && (
          <NewAdminTicket assets={assets} close={() => setCreating(false)} refresh={data.refresh} />
        )}
      </div>
    </PageShell>
  );
}

function NewAdminTicket({
  assets,
  close,
  refresh,
}: {
  assets: DemAsset[];
  close: () => void;
  refresh: () => unknown;
}) {
  const [asset, setAsset] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [priority, setPriority] = useState<Priority>("baixa"),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Novo chamado" close={close}>
      <form
        className="dem-section-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await createTicket({
              asset_id: asset,
              title,
              description,
              priority,
              location_detail: "",
            });
            await refresh();
            close();
            toast.success("Chamado aberto.");
          } catch (e: any) {
            toast.error(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <AssetPicker assets={assets} value={asset} onChange={setAsset} />
        <Field label="Problema">
          <input
            required
            minLength={3}
            maxLength={180}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Descrição">
          <textarea
            required
            minLength={10}
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Criticidade">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(PRIORITIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l.label} · {l.days} dia(s)
              </option>
            ))}
          </select>
        </Field>
        <button className="dem-btn" disabled={busy || !asset}>
          Abrir chamado
        </button>
      </form>
    </Modal>
  );
}

function Productivity({
  people,
  logs,
  tickets,
}: {
  people: NonNullable<ReturnType<typeof useDemarchi>["people"]["data"]>;
  logs: NonNullable<ReturnType<typeof useDemarchi>["logs"]["data"]>;
  tickets: DemTicket[];
}) {
  const [start, setStart] = useState(today().slice(0, 7) + "-01"),
    [end, setEnd] = useState(today());
  const periodLogs = logs.filter((l) => l.performed_on >= start && l.performed_on <= end),
    rows = productivity(people, periodLogs, tickets);
  const hours = periodLogs.reduce((s, l) => s + l.minutes, 0) / 60;
  const performedTickets = new Set(periodLogs.map((l) => l.ticket_id));
  const done = tickets.filter((t) => t.status === "concluido" && performedTickets.has(t.id));
  const pie = Object.entries(PRIORITIES)
    .map(([key, v]) => ({
      name: v.label,
      value: tickets.filter((t) => !isClosed(t.status) && t.priority === key).length,
    }))
    .filter((x) => x.value);
  return (
    <section>
      <div className="dem-section-title">
        <div>
          <h2>
            <BarChart3 size={20} /> Produtividade da equipe
          </h2>
          <p>Horas registradas e serviços concluídos com apontamentos no período.</p>
        </div>
        <div className="dem-date-filter">
          <Field label="De">
            <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Até">
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="dem-overview">
        <div className="dem-stat">
          <span>Horas apontadas</span>
          <strong>{hours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong>
          <small>Somatório dos registros de execução</small>
        </div>
        <div className="dem-stat">
          <span>Serviços concluídos</span>
          <strong>{done.length}</strong>
          <small>Com apontamentos no período</small>
        </div>
        <div className="dem-stat">
          <span>Colaboradores com apontamento</span>
          <strong>{rows.filter((r) => r.minutes > 0).length}</strong>
          <small>Atividade registrada no período</small>
        </div>
        <div className="dem-stat">
          <span>Tempo médio por serviço</span>
          <strong>
            {performedTickets.size
              ? (hours / performedTickets.size).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })
              : "0"}
            <em> h</em>
          </strong>
          <small>Horas / serviços com apontamento</small>
        </div>
      </div>
      <div className="dem-charts">
        <article>
          <h3>Horas por colaborador</h3>
          {rows.some((r) => r.minutes > 0) ? (
            <div className="dem-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows.map((r) => ({ ...r, hours: Number((r.minutes / 60).toFixed(2)) }))}
                  margin={{ left: 0, right: 16, bottom: 35 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: any) => [
                      `${Number(value).toLocaleString("pt-BR")} h`,
                      "Horas apontadas",
                    ]}
                  />
                  <Bar dataKey="hours" fill="#55b6ed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dem-empty">
              Registre atividades nos chamados para visualizar as horas trabalhadas.
            </div>
          )}
        </article>
        <article>
          <h3>Pendências por criticidade</h3>
          <p className="dem-help">Situação atual, independente do período de apontamentos.</p>
          {pie.length ? (
            <div className="dem-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={4}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pie.map((_, i) => (
                      <Cell key={i} fill={["#ef7181", "#efbb67", "#55b6ed"][i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dem-empty">Nenhum chamado pendente.</div>
          )}
        </article>
      </div>
      <div className="dem-table-wrap">
        <table className="dem-table">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Horas apontadas</th>
              <th>Serviços concluídos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{(r.minutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h</td>
                <td>{r.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
