import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Search, MapPin } from "lucide-react";
import {
  assetPath,
  KINDS,
  PRIORITIES,
  STATUSES,
  dueState,
  type DemAsset,
  type DemTicket,
  type Priority,
} from "../domain";

export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const dateLabel = (value: string | null, time = false) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
      }).format(new Date(value.length === 10 ? value + "T12:00:00-03:00" : value))
    : "—";
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="dem-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Pesquisar",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="dem-search">
      <Search size={18} aria-hidden />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  light = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  light?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = previous;
    };
  }, [close]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`dem-app dem-modal-backdrop${light ? " dem-client" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="dem-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const elements = e.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
          );
          const first = elements[0],
            last = elements[elements.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="dem-icon-btn" onClick={close} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        <div className="dem-modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
export function PriorityBadge({ value }: { value: Priority }) {
  return <span className={`dem-badge dem-priority-${value}`}>{PRIORITIES[value].label}</span>;
}
export function StatusBadge({ ticket }: { ticket: DemTicket }) {
  return (
    <span className={`dem-badge dem-status-${dueState(ticket)}`}>{STATUSES[ticket.status]}</span>
  );
}
export function AssetPicker({
  assets,
  value,
  onChange,
  allowPlant = false,
}: {
  assets: DemAsset[];
  value: string;
  onChange: (id: string) => void;
  allowPlant?: boolean;
}) {
  const [search, setSearch] = useState("");
  const path = assetPath(value, assets);
  const plant = assets.find((a) => a.kind === "planta");
  const wholePlant = allowPlant && value === plant?.id;
  const [building, setBuilding] = useState(path.find((a) => a.kind === "predio")?.id || "");
  const [floor, setFloor] = useState(path.find((a) => a.kind === "andar")?.id || "");
  const [room, setRoom] = useState(path.find((a) => a.kind === "ambiente")?.id || "");
  const active = assets.filter((a) => a.enabled);
  const buildings = active
    .filter((a) => a.kind === "predio")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  const floors = active.filter((a) => a.parent_id === building && a.kind === "andar");
  const rooms = active.filter((a) => a.parent_id === floor && a.kind === "ambiente");
  const equipment = active.filter((a) => a.parent_id === room && a.kind === "equipamento");
  const results =
    search.trim().length >= 2
      ? active
          .filter(
            (a) =>
              (allowPlant || a.kind !== "planta") &&
              `${a.name} ${a.code}`.toLowerCase().includes(search.toLowerCase()),
          )
          .slice(0, 20)
      : [];
  function choose(id: string) {
    const p = assetPath(id, assets);
    setBuilding(p.find((a) => a.kind === "predio")?.id || "");
    setFloor(p.find((a) => a.kind === "andar")?.id || "");
    setRoom(p.find((a) => a.kind === "ambiente")?.id || "");
    onChange(id);
    setSearch("");
  }
  return (
    <div className="dem-location-picker">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Buscar prédio, sala ou código do ativo"
      />
      {search.length >= 2 && (
        <div className="dem-search-results">
          {results.length ? (
            results.map((a) => (
              <button key={a.id} type="button" onClick={() => choose(a.id)}>
                <strong>{a.name}</strong>
                <small>
                  {a.code} · {KINDS[a.kind]}
                </small>
              </button>
            ))
          ) : (
            <p>
              Nenhum local encontrado. Escolha o prédio abaixo e descreva o local no campo de
              referência.
            </p>
          )}
        </div>
      )}
      <div className="dem-form-grid">
        {allowPlant && plant && (
          <label className="dem-check">
            <input
              type="checkbox"
              checked={wholePlant}
              onChange={(e) => choose(e.target.checked ? plant.id : "")}
            />
            Toda a planta Demarchi
          </label>
        )}
        <Field label="Prédio / área">
          <select
            required={!wholePlant}
            disabled={wholePlant}
            value={building}
            onChange={(e) => {
              setBuilding(e.target.value);
              setFloor("");
              setRoom("");
              onChange(e.target.value);
            }}
          >
            <option value="">Selecione o prédio</option>
            {buildings.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Andar">
          <select
            value={floor}
            disabled={!building || !floors.length}
            required={floors.length > 0}
            onChange={(e) => {
              setFloor(e.target.value);
              setRoom("");
              onChange(e.target.value || building);
            }}
          >
            <option value="">
              {floors.length ? "Selecione o andar" : "Sem andares cadastrados"}
            </option>
            {floors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ambiente / local">
          <select
            value={room}
            disabled={!floor || !rooms.length}
            required={rooms.length > 0}
            onChange={(e) => {
              setRoom(e.target.value);
              onChange(e.target.value || floor);
            }}
          >
            <option value="">
              {rooms.length ? "Selecione o ambiente" : "Sem ambientes cadastrados"}
            </option>
            {rooms.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        {equipment.length > 0 && (
          <Field label="Equipamento (opcional)">
            <select
              value={equipment.some((a) => a.id === value) ? value : ""}
              onChange={(e) => onChange(e.target.value || room)}
            >
              <option value="">Problema no ambiente</option>
              {equipment.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.code}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {value && (
        <p className="dem-location-preview">
          <MapPin size={16} />
          {assetPath(value, assets)
            .filter((a) => a.kind !== "planta")
            .map((a) => a.name)
            .join(" / ")}
        </p>
      )}
    </div>
  );
}
