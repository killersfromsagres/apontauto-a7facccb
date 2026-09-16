import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "sonner";
import {
  UserPlus,
  Loader2,
  ShieldCheck,
  User as UserIcon,
  Trash2,
  Power,
  PowerOff,
  Save,
  Search,
  Activity,
  Layers3,
  CheckCircle2,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listUsers,
  createUser,
  deleteUser,
  setUserBannedState,
  setUserRoleState,
  setUserMenus,
  provisionEncarregados,
  provisionChamados,
} from "@/lib/admin-users.client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  ASSIGNABLE_MENU_KEYS,
  PERMISSION_GROUPS,
  type MenuKey,
} from "@/lib/permission-catalog";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
});

type Role = "admin" | "user";

function UsuariosPage() {
  const { isAdmin, loading: checking } = useIsAdmin();

  if (checking) {
    return (
      <PageShell title="Usuários" description="Verificando permissões…">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell title="Usuários" description="Área restrita">
        <GlassCard>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para acessar esta página. Apenas administradores podem gerenciar usuários.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Gerenciamento de Usuários"
      description="Seção administrativa para criação de contas, definição de logins e gerenciamento granular de permissões de acesso."
    >
      <div className="mb-6 flex flex-col gap-4">
        <ProvisionEncarregadosButton />
        <ProvisionChamadosButton />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <CreateUserCard />
        <UsersListCard />
      </div>
    </PageShell>
  );
}

function ProvisionEncarregadosButton() {
  const provision = provisionEncarregados;
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleProvision = async () => {
    setLoading(true);
    try {
      await provision();
      toast.success(`Login "encarregados" provisionado com sucesso!`);
      qc.invalidateQueries({ queryKey: ["app-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao provisionar encarregados");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard className="flex flex-col sm:flex-row items-center justify-between gap-4 border-primary/20 bg-primary/5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Acesso Operacional Especial</h3>
        <p className="text-xs text-muted-foreground max-w-md">
          Provisiona o login compartilhado <strong>encarregados</strong> com acesso de monitoramento aos módulos de PCM, OS e Frota.
        </p>
      </div>
      <Button onClick={handleProvision} disabled={loading} variant="outline" className="w-full sm:w-auto border-primary/30 hover:bg-primary/10">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
        Provisionar Encarregados
      </Button>
    </GlassCard>
  );
}

function ProvisionChamadosButton() {
  const provision = provisionChamados;
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleProvision = async () => {
    setLoading(true);
    try {
      await provision();
      toast.success(`Login "chamados" provisionado com sucesso!`);
      qc.invalidateQueries({ queryKey: ["app-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao provisionar login de chamados");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard className="flex flex-col sm:flex-row items-center justify-between gap-4 border-emerald-500/20 bg-emerald-500/5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-emerald-500 uppercase tracking-wider">Acesso de Monitoramento (Cliente)</h3>
        <p className="text-xs text-muted-foreground max-w-md">
          Provisiona o login <strong>chamados</strong> com acesso exclusivo para visualização da programação de corretivas e histórico.
        </p>
      </div>
      <Button onClick={handleProvision} disabled={loading} variant="outline" className="w-full sm:w-auto border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
        Provisionar Cliente
      </Button>
    </GlassCard>
  );
}

function CreateUserCard() {
  const qc = useQueryClient();
  
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [allowedMenus, setAllowedMenus] = useState<MenuKey[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedCount = allowedMenus.length;
  const hasEveryPermission = selectedCount === ASSIGNABLE_MENU_KEYS.length;

  const toggleMenu = (key: MenuKey, on: boolean) => {
    setAllowedMenus((current) => on ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key));
  };

  const toggleGroup = (keys: readonly MenuKey[], on: boolean) => {
    setAllowedMenus((current) => {
      if (!on) return current.filter((item) => !keys.includes(item));
      return Array.from(new Set([...current, ...keys]));
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createUser({
        login,
        password,
        fullName: fullName || undefined,
        role,
        allowedMenus: role === "admin" ? [] : allowedMenus,
      });
      toast.success(`Usuário "${login}" criado como ${role === "admin" ? "administrador" : "usuário"}.`);
      setLogin("");
      setPassword("");
      setFullName("");
      setRole("user");
      setAllowedMenus([]);
      qc.invalidateQueries({ queryKey: ["app-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar usuário");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <UserPlus className="h-4 w-4" strokeWidth={1.75} /> Novo usuário
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">Nome completo (opcional)</Label>
          <Input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex.: João da Silva" autoComplete="name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="login">Login</Label>
          <Input id="login" type="text" required minLength={3} maxLength={30} pattern="[a-z0-9._-]{3,30}" value={login} onChange={(e) => setLogin(e.target.value.toLowerCase())} placeholder="ex.: joao.silva" autoComplete="off" />
          <p className="text-xs text-muted-foreground">3-30 caracteres. Letras minúsculas, números e . _ -</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
        </div>

        <div className="space-y-2">
          <Label>Tipo de acesso</Label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRole("user")} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition font-bold ${role === "user" ? "border-primary bg-primary/20 text-primary-glow shadow-[0_0_15px_rgba(135,206,250,0.3)]" : "border-border bg-white/5 text-muted-foreground hover:bg-white/10"}`}>
              <UserIcon className="h-4 w-4" /> Usuário
            </button>
            <button type="button" onClick={() => setRole("admin")} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition font-bold ${role === "admin" ? "border-primary bg-primary/20 text-primary-glow shadow-[0_0_15px_rgba(135,206,250,0.3)]" : "border-border bg-white/5 text-muted-foreground hover:bg-white/10"}`}>
              <ShieldCheck className="h-4 w-4" /> Administrador
            </button>
          </div>
        </div>

        {role === "admin" ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Acesso administrativo total</div>
            Administradores recebem acesso completo. Restrições por módulo não são aplicadas a esta conta.
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4 text-primary" /> Restrições de acesso</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Escolha exatamente os módulos que este login poderá visualizar. Sem seleção, a conta poderá autenticar, mas não terá acesso aos módulos restritos.</p>
              </div>
              <Badge variant={hasEveryPermission ? "default" : "secondary"}>{selectedCount} de {ASSIGNABLE_MENU_KEYS.length}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setAllowedMenus([...ASSIGNABLE_MENU_KEYS])} disabled={hasEveryPermission}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Acesso total
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAllowedMenus([])} disabled={selectedCount === 0}>Limpar</Button>
            </div>

            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
              {PERMISSION_GROUPS.map((group) => {
                const assignableKeys = group.modules.filter((module) => !("requiresAdmin" in module && module.requiresAdmin)).map((module) => module.key) as MenuKey[];
                const selectedInGroup = assignableKeys.filter((key) => allowedMenus.includes(key)).length;
                const groupAll = assignableKeys.length > 0 && selectedInGroup === assignableKeys.length;
                const groupSome = selectedInGroup > 0 && !groupAll;
                return (
                  <section key={group.key} className="overflow-hidden rounded-xl border border-border/60 bg-card/35">
                    <div className="flex items-start justify-between gap-3 border-b border-border/40 bg-muted/20 px-3 py-3">
                      <div className="min-w-0"><div className="text-sm font-semibold">{group.label}</div><p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{group.description}</p></div>
                      {assignableKeys.length > 0 && <Checkbox aria-label={`Selecionar toda a seção ${group.label}`} checked={groupAll ? true : groupSome ? "indeterminate" : false} onCheckedChange={(value) => toggleGroup(assignableKeys, Boolean(value))} />}
                    </div>
                    <div className="grid grid-cols-1 gap-2 p-3">
                      {group.modules.map((module) => {
                        const adminOnly = "requiresAdmin" in module && Boolean(module.requiresAdmin);
                        const checked = !adminOnly && allowedMenus.includes(module.key);
                        return (
                          <label key={module.key} className={`flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${checked ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/35"} ${adminOnly ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-primary/35 hover:bg-muted/30"}`}>
                            <Checkbox className="mt-0.5" checked={checked} disabled={adminOnly} onCheckedChange={(value) => toggleMenu(module.key, Boolean(value))} />
                            <span className="min-w-0"><span className="block leading-snug">{module.label}</span>{adminOnly && <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Somente administrador</span>}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando…</> : <><UserPlus className="mr-2 h-4 w-4" /> Criar usuário</>}
        </Button>
      </form>
    </GlassCard>
  );
}

type AppUser = {
  id: string;
  login: string;
  email: string;
  fullName: string | null;
  role: Role;
  banned: boolean;
  allowedMenus: string[] | null;
  createdAt: string;
};

function UsersListCard() {
  const qc = useQueryClient();
  
  const [filter, setFilter] = useState("");
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["app-users"], queryFn: async () => (await listUsers()) as AppUser[], staleTime: 0, refetchOnWindowFocus: true });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["app-users"] });
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data;
    return data.filter((u) => u.login.toLowerCase().includes(q) || (u.fullName ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [data, filter]);

  return (
    <GlassCard>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Usuários cadastrados</div>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar…" className="h-9 w-56 pl-8" /></div>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários…</div>
      ) : error ? (
        <div className="space-y-2"><p className="text-sm text-destructive">Falha ao carregar usuários: {error instanceof Error ? error.message : String(error)}</p><Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>{isFetching ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Tentar novamente</Button></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      ) : (
        <ul className="space-y-3">{filtered.map((u) => <UserRow key={u.id} user={u} onChanged={invalidate} />)}</ul>
      )}
    </GlassCard>
  );
}

function UserRow({ user, onChanged }: { user: AppUser; onChanged: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localAllowed, setLocalAllowed] = useState<string[]>(user.allowedMenus ?? []);
  const isAdminUser = user.role === "admin";
  const baselineAllowed = (user.allowedMenus ?? []).filter((key) => (ASSIGNABLE_MENU_KEYS as readonly string[]).includes(key));
  const selectedCount = localAllowed.filter((key) => (ASSIGNABLE_MENU_KEYS as readonly string[]).includes(key)).length;
  const hasEveryPermission = selectedCount === ASSIGNABLE_MENU_KEYS.length;
  const permissionsChanged = [...new Set(localAllowed)].sort().join("|") !== [...new Set(baselineAllowed)].sort().join("|");

  useEffect(() => { setLocalAllowed(user.allowedMenus ?? []); }, [user.allowedMenus]);

  const banMut = useMutation({ mutationFn: async (banned: boolean) => setUserBannedState(user.id, banned), onSuccess: () => { toast.success(user.banned ? "Usuário ativado." : "Usuário desativado."); onChanged(); }, onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar status") });
  const roleMut = useMutation({ mutationFn: async (role: Role) => setUserRoleState(user.id, role), onSuccess: () => { toast.success("Papel atualizado."); onChanged(); }, onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar papel") });
  const delMut = useMutation({ mutationFn: async () => deleteUser(user.id), onSuccess: () => { toast.success("Usuário removido."); setConfirmDelete(false); onChanged(); }, onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao remover") });
  const menusMut = useMutation({ mutationFn: async () => setUserMenus(user.id, localAllowed), onSuccess: () => { toast.success("Permissões salvas."); onChanged(); }, onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar permissões") });

  const toggleMenu = (key: MenuKey, on: boolean) => setLocalAllowed((current) => on ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key));
  const toggleGroup = (keys: readonly MenuKey[], on: boolean) => setLocalAllowed((current) => !on ? current.filter((item) => !keys.includes(item as MenuKey)) : Array.from(new Set([...current, ...keys])));

  return (
    <li className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold truncate">{user.login}</span><Badge variant={user.role === "admin" ? "default" : "secondary"} className="uppercase text-[10px]">{user.role}</Badge>{user.banned && <Badge variant="destructive" className="uppercase text-[10px]">desativado</Badge>}</div>
          {user.fullName && <div className="text-xs text-muted-foreground truncate">{user.fullName}</div>}
          <div className="text-[11px] text-muted-foreground/70 truncate">{user.email}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="bg-primary/10 border-primary/30 text-primary-glow hover:bg-primary/20 font-bold" onClick={() => roleMut.mutate(user.role === "admin" ? "user" : "admin")} loading={roleMut.isPending} title="Alternar papel"><ShieldCheck className="mr-1 h-3.5 w-3.5" />{user.role === "admin" ? "Tornar usuário" : "Tornar admin"}</Button>
          <Button size="sm" variant="outline" className="bg-primary/10 border-primary/30 text-primary-glow hover:bg-primary/20 font-bold" onClick={() => banMut.mutate(!user.banned)} loading={banMut.isPending}>{user.banned ? <><Power className="mr-1 h-3.5 w-3.5" /> Ativar</> : <><PowerOff className="mr-1 h-3.5 w-3.5" /> Desativar</>}</Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)} loading={delMut.isPending}><Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir</Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>{expanded ? "Fechar permissões" : "Permissões"}</Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 rounded-xl border border-border/60 bg-background/50 p-3 sm:p-4">
          <div className="flex flex-col gap-3 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1"><div className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4 text-primary" /> Seções visíveis para este login</div><p className="text-xs text-muted-foreground">Marque somente os módulos que devem aparecer e poder ser abertos por <strong>{user.login}</strong>.</p></div>
            <Badge variant={hasEveryPermission ? "default" : "secondary"} className="w-fit">{isAdminUser ? "Acesso administrativo total" : `${selectedCount} de ${ASSIGNABLE_MENU_KEYS.length} liberadas`}</Badge>
          </div>

          {isAdminUser ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">Administradores sempre mantêm acesso total. Para personalizar seções, altere o perfil desta conta para Usuário.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setLocalAllowed([...ASSIGNABLE_MENU_KEYS])} disabled={hasEveryPermission}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Selecionar todas</Button><Button type="button" size="sm" variant="ghost" onClick={() => setLocalAllowed([])} disabled={selectedCount === 0}>Limpar seleção</Button></div>
              <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {PERMISSION_GROUPS.map((group) => {
                  const assignableKeys = group.modules.filter((module) => !("requiresAdmin" in module && module.requiresAdmin)).map((module) => module.key);
                  const selectedInGroup = assignableKeys.filter((key) => localAllowed.includes(key)).length;
                  const groupAll = assignableKeys.length > 0 && selectedInGroup === assignableKeys.length;
                  const groupSome = selectedInGroup > 0 && !groupAll;
                  return (
                    <section key={group.key} className="overflow-hidden rounded-xl border border-border/60 bg-card/35">
                      <div className="flex items-start justify-between gap-3 border-b border-border/40 bg-muted/20 px-3 py-3"><div className="min-w-0"><div className="text-sm font-semibold">{group.label}</div><p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{group.description}</p></div>{assignableKeys.length > 0 && <Checkbox aria-label={`Selecionar toda a seção ${group.label}`} checked={groupAll ? true : groupSome ? "indeterminate" : false} onCheckedChange={(value) => toggleGroup(assignableKeys, Boolean(value))} />}</div>
                      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
                        {group.modules.map((module) => {
                          const adminOnly = "requiresAdmin" in module && Boolean(module.requiresAdmin);
                          const checked = !adminOnly && localAllowed.includes(module.key);
                          return <label key={module.key} className={`flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${checked ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/35"} ${adminOnly ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-primary/35 hover:bg-muted/30"}`}><Checkbox className="mt-0.5" checked={checked} disabled={adminOnly} onCheckedChange={(value) => toggleMenu(module.key, Boolean(value))} /><span className="min-w-0"><span className="block leading-snug">{module.label}</span>{adminOnly && <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Somente administrador</span>}</span></label>;
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-border/50 pt-3 sm:flex-row sm:justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setLocalAllowed(user.allowedMenus ?? []); setExpanded(false); }}>Cancelar</Button>
            <Button size="sm" onClick={async () => { await menusMut.mutateAsync(); setExpanded(false); }} disabled={menusMut.isPending || isAdminUser || !permissionsChanged}>{menusMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}Salvar permissões</Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir usuário?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente. O usuário <strong>{user.login}</strong> perderá o acesso imediatamente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); delMut.mutate(); }}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
