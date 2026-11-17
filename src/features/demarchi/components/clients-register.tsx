import { useState } from "react";
import { KeyRound, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { createAccount, removeClientAccount, savePerson } from "../api";
import type { DemPerson } from "../domain";
import {
  CLIENT_PASSWORD_MIN_LENGTH,
  clientIdNumber,
  displayClientId,
  normalizeClientId,
} from "../../../../supabase/functions/_shared/demarchi-login";
import { Field, Modal, SearchBox } from "./shared";

export function ClientsRegister({
  people,
  refresh,
}: {
  people: DemPerson[];
  refresh: () => unknown;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<DemPerson> | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<DemPerson | null>(null);
  const clients = people.filter((p) => p.kind === "solicitante" && !p.removed_at);
  const filtered = clients.filter((p) =>
    `${p.name} ${p.login_id || ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="dem-clients-register">
      <div className="dem-section-title">
        <div>
          <h2>
            <UserRound size={20} />
            Clientes
          </h2>
          <p>Informe a numeração do ID e defina a senha. O prefixo Sherwin já vem preenchido.</p>
        </div>
        <button
          type="button"
          className="dem-btn"
          onClick={() => {
            setEditing({ name: "", login_id: "", kind: "solicitante", active: true });
            setPassword("");
          }}
        >
          <Plus size={17} />
          Cadastrar cliente
        </button>
      </div>
      <div className="dem-client-register-summary">
        <KeyRound size={21} />
        <div>
          <strong>Acesso individual por ID e senha</strong>
          <p>O cliente acessa o portal com o ID definido por você.</p>
        </div>
        <span>{clients.filter((p) => p.active).length} ativo(s)</span>
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder="Buscar cliente por nome ou ID" />
      <div className="dem-people-grid">
        {filtered.map((p) => (
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
              <p className="dem-mono">
                ID: {p.login_id ? displayClientId(p.login_id) : "Não definido"}
              </p>
              <span className="dem-badge">{p.active ? "Ativo" : "Inativo"}</span>
            </div>
            <button
              type="button"
              className="dem-icon-btn"
              aria-label={`Editar cliente ${p.name}`}
              onClick={() => setEditing({ ...p })}
            >
              <Pencil size={17} />
            </button>
            <button
              type="button"
              className="dem-icon-btn dem-remove-client"
              disabled={busy}
              aria-label={`Remover cliente ${p.name}`}
              title="Remover cliente"
              onClick={() => setRemoving(p)}
            >
              <Trash2 size={17} />
            </button>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="dem-empty">
          <UserRound size={32} />
          <h3>
            {clients.length ? "Nenhum cliente encontrado." : "Cadastre seu primeiro cliente."}
          </h3>
          <p>Informe o nome, a numeração do ID Sherwin e a senha de acesso.</p>
        </div>
      )}
      {editing && (
        <Modal
          title={editing.id ? "Editar cliente" : "Cadastrar cliente"}
          close={() => setEditing(null)}
        >
          <form
            className="dem-section-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                if (editing.id)
                  await savePerson({
                    id: editing.id,
                    name: editing.name!.trim(),
                    active: editing.active,
                  });
                else
                  await createAccount({
                    name: editing.name!.trim(),
                    loginId: normalizeClientId(editing.login_id || ""),
                    password,
                    kind: "solicitante",
                    specialty: "",
                  });
                await refresh();
                setEditing(null);
                setPassword("");
                toast.success(
                  editing.id
                    ? "Cliente atualizado."
                    : "Cliente cadastrado. O acesso já pode ser utilizado.",
                );
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Nome do cliente">
              <input
                required
                minLength={2}
                maxLength={160}
                autoComplete="off"
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Nome completo do solicitante"
              />
            </Field>
            <Field
              label="ID de acesso"
              hint={
                editing.id
                  ? "ID definido na criação do acesso."
                  : `Preencha somente os números. Login: Sherwin${clientIdNumber(editing.login_id || "") || "001234"}.`
              }
            >
              <div className="dem-id-compose">
                <span aria-hidden="true">Sherwin</span>
                <input
                  required
                  aria-label="Numeração do ID Sherwin"
                  inputMode="numeric"
                  minLength={1}
                  maxLength={33}
                  pattern="[0-9]{1,33}"
                  readOnly={!!editing.id}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  value={clientIdNumber(editing.login_id || "")}
                  onChange={(e) => setEditing({ ...editing, login_id: e.target.value })}
                  placeholder="001234"
                />
              </div>
            </Field>
            {!editing.id && (
              <Field label="Senha de acesso" hint="Mínimo de 6 caracteres.">
                <input
                  type="password"
                  required
                  minLength={CLIENT_PASSWORD_MIN_LENGTH}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Defina a senha deste cliente"
                />
              </Field>
            )}
            {editing.id && (
              <label className="dem-check">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Cliente ativo no portal
              </label>
            )}
            <button type="submit" className="dem-btn" disabled={busy}>
              {busy ? "Salvando…" : editing.id ? "Salvar alterações" : "Criar acesso do cliente"}
            </button>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Remover cliente"
          close={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <div className="dem-section-form">
            <p>
              Remover o acesso de <strong>{removing.name}</strong>
              {removing.login_id && <> ({displayClientId(removing.login_id)})</>}?
            </p>
            <p className="dem-help">
              O cliente não poderá mais acessar o portal. Os chamados e o histórico serão
              preservados.
            </p>
            <div className="dem-removal-actions">
              <button
                type="button"
                className="dem-btn dem-btn-secondary"
                disabled={busy}
                onClick={() => setRemoving(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="dem-btn dem-btn-danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await removeClientAccount(removing.id);
                    await refresh();
                    setRemoving(null);
                    toast.success("Acesso do cliente removido.");
                  } catch (e: any) {
                    toast.error(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Removendo…" : "Remover acesso"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
