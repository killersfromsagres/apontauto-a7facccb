import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { addComment, addWorklog, ticketEvents, updateTicket } from "../api";
import {
  locationText,
  protocol,
  STATUSES,
  PRIORITIES,
  type DemAsset,
  type DemPerson,
  type DemTicket,
  type DemWorklog,
  type TicketStatus,
  type Priority,
} from "../domain";
import { dateLabel, Field, Modal, PriorityBadge, StatusBadge, today } from "./shared";

export function TicketDetail({
  ticket,
  assets,
  people = [],
  logs = [],
  admin = false,
  close,
  refresh,
}: {
  ticket: DemTicket;
  assets: DemAsset[];
  people?: DemPerson[];
  logs?: DemWorklog[];
  admin?: boolean;
  close: () => void;
  refresh: () => unknown;
}) {
  const [status, setStatus] = useState(ticket.status),
    [priority, setPriority] = useState(ticket.priority),
    [assigned, setAssigned] = useState(ticket.assigned_to || ""),
    [date, setDate] = useState(ticket.scheduled_for || ""),
    [resolution, setResolution] = useState(ticket.resolution);
  const [comment, setComment] = useState(""),
    [person, setPerson] = useState(ticket.assigned_to || ""),
    [minutes, setMinutes] = useState("60"),
    [activity, setActivity] = useState(""),
    [performed, setPerformed] = useState(today()),
    [busy, setBusy] = useState(false);
  const events = useQuery({
    queryKey: ["demarchi", "events", ticket.id],
    queryFn: () => ticketEvents(ticket.id),
  });
  const technicians = people.filter((p) => p.kind === "tecnico" && p.active);
  async function act(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await refresh();
      await events.refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={protocol(ticket.number)} close={close} light={!admin}>
      <div className="dem-ticket-heading">
        <PriorityBadge value={ticket.priority} />
        <StatusBadge ticket={ticket} />
        <h3>{ticket.title}</h3>
        <p>{locationText(ticket.asset_id, assets)}</p>
      </div>
      <dl className="dem-detail-grid">
        <div>
          <dt>Solicitante</dt>
          <dd>{ticket.requester_name}</dd>
          <small>{ticket.requester_email}</small>
        </div>
        <div>
          <dt>Aberto em</dt>
          <dd>{dateLabel(ticket.created_at, true)}</dd>
        </div>
        <div>
          <dt>Prazo de atendimento</dt>
          <dd>{dateLabel(ticket.deadline, true)}</dd>
        </div>
        <div>
          <dt>Programação</dt>
          <dd>{dateLabel(ticket.scheduled_for)}</dd>
        </div>
      </dl>
      <div className="dem-note">
        <h4>O que precisa ser feito</h4>
        <p className="dem-prewrap">{ticket.description}</p>
        {ticket.location_detail && (
          <p>
            <strong>Referência: </strong>
            {ticket.location_detail}
          </p>
        )}
      </div>
      {ticket.resolution && (
        <div className="dem-note">
          <h4>Serviço realizado</h4>
          <p className="dem-prewrap">{ticket.resolution}</p>
        </div>
      )}
      {admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await updateTicket(ticket, {
                status,
                priority,
                assigned_to: assigned || null,
                scheduled_for: date || null,
                resolution,
              });
              close();
            }, "Chamado atualizado.");
          }}
          className="dem-section-form"
        >
          <h3>Programação e atendimento</h3>
          <div className="dem-form-grid">
            <Field label="Situação">
              <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                {Object.entries(STATUSES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
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
            <Field label="Colaborador responsável">
              <select value={assigned} onChange={(e) => setAssigned(e.target.value)}>
                <option value="">Não atribuído</option>
                {technicians.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data programada">
              <input
                type="date"
                value={date}
                required={status === "programado"}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Serviço realizado / motivo do encerramento">
            <textarea
              value={resolution}
              maxLength={10000}
              minLength={status === "concluido" ? 5 : undefined}
              required={status === "concluido"}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Descreva a solução e registre o apontamento abaixo antes de concluir."
            />
          </Field>
          <button className="dem-btn" disabled={busy}>
            Salvar atendimento
          </button>
        </form>
      )}
      {admin && (
        <form
          className="dem-section-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await addWorklog({
                ticket_id: ticket.id,
                person_id: person,
                minutes: Number(minutes),
                description: activity,
                performed_on: performed,
              });
              setActivity("");
            }, "Apontamento registrado.");
          }}
        >
          <h3>Apontar atividade realizada</h3>
          <div className="dem-form-grid">
            <Field label="Colaborador">
              <select required value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Selecione</option>
                {technicians.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tempo trabalhado (minutos)">
              <input
                type="number"
                required
                min="1"
                max="1440"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </Field>
            <Field label="Data da execução">
              <input
                type="date"
                required
                value={performed}
                max={today()}
                onChange={(e) => setPerformed(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Atividade executada">
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
            />
          </Field>
          <button className="dem-btn dem-btn-secondary" disabled={busy || !technicians.length}>
            Registrar apontamento
          </button>
          {logs
            .filter((l) => l.ticket_id === ticket.id)
            .map((l) => (
              <p key={l.id} className="dem-log-row">
                <strong>{people.find((p) => p.id === l.person_id)?.name}</strong> · {l.minutes} min
                · {dateLabel(l.performed_on)}
                <br />
                {l.description}
              </p>
            ))}
        </form>
      )}
      <section className="dem-section-form">
        <h3>Acompanhamento do chamado</h3>
        {events.isError && <p role="alert">Não foi possível carregar o histórico.</p>}
        <ol className="dem-timeline">
          {events.data?.map((ev) => (
            <li key={ev.id}>
              <span />
              <div>
                <strong>{ev.actor_name}</strong>
                <time>{dateLabel(ev.created_at, true)}</time>
                <p>{ev.message}</p>
              </div>
            </li>
          ))}
        </ol>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await addComment(ticket.id, comment);
              setComment("");
            }, "Mensagem adicionada.");
          }}
        >
          <Field label="Adicionar informação">
            <textarea
              required
              minLength={2}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Complemente a solicitação ou informe o andamento."
            />
          </Field>
          <button className="dem-btn dem-btn-secondary" disabled={busy}>
            Enviar mensagem
          </button>
        </form>
      </section>
    </Modal>
  );
}
