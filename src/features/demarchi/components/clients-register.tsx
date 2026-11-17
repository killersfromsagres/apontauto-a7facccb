import { useState } from "react";
import { KeyRound, Pencil, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { createAccount, savePerson } from "../api";
import type { DemPerson } from "../domain";
import { normalizeClientId } from "../../../../supabase/functions/_shared/demarchi-login";
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
  const clients = people.filter((p) => p.kind === "solicitante");
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
          <p>
            Crie o ID e a senha de cada cliente. O nome ficará vinculado aos chamados abertos por
            ele.
          </p>
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
              <p className="dem-mono">ID: {p.login_id || "Não definido"}</p>
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
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="dem-empty">
          <UserRound size={32} />
          <h3>
            {clients.length ? "Nenhum cliente encontrado." : "Cadastre seu primeiro cliente."}
          </h3>
          <p>Informe o nome, escolha um ID e defina a senha de acesso.</p>
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
                  : "Use de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado."
              }
            >
              <input
                required
                minLength={3}
                maxLength={40}
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}"
                readOnly={!!editing.id}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                value={editing.login_id || ""}
                onChange={(e) => setEditing({ ...editing, login_id: e.target.value })}
                placeholder="Ex.: 001234 ou cliente.demarchi"
              />
            </Field>
            {!editing.id && (
              <Field label="Senha de acesso" hint="Mínimo de 10 caracteres.">
                <input
                  type="password"
                  required
                  minLength={10}
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
    </section>
  );
}
