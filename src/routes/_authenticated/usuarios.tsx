import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  createAppUser,
  listAppUsers,
  deleteAppUser,
  setUserBanned,
  setUserRole,
  setUserAllowedMenus,
  MENU_KEYS,
  type MenuKey,
} from "@/lib/users.functions";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated/")({
  component: UsuariosPage,
});

type Role = "admin" | "user";

const MENU_LABELS: Record<MenuKey, string> = {
  dashboard: "Dashboard",
  "base-ativos": "Base de Ativos (PCM)",
  "inteligencia-ativos": "Inteligência de Ativos (PCM)",
  programacao: "Programação Semanal",
  backorder: "Backorder de Corretivas",
  lavanderia: "Controle de Lavanderia",
  preventiva: "Programação Preventiva",
  corretiva: "Programação (Campo)",
  "corretiva-historico": "Programação — Histórico",
  "corretiva-gestor": "Programação — Gestão",
  taludes: "Demarcação de Taludes",
  apontamentos: "Apontamentos",
  "painel-legal": "Painel de Itens Legais",
  refrigeracao: "Refrigeração (Campo)",
  "refrigeracao-gestor": "Refrigeração — Gestão",
  "controle-materiais": "Controle de Materiais",
  "assets-fill": "Ativos — Preencher planilha",
  "assets-catalog": "Ativos — Base/Catálogo",
  "assets-history": "Ativos — Histórico",
  "assets-unmatched": "Ativos — Não encontrados",
  "dashboard-chamados": "Dashboard de Chamados",
  "clima-tempo": "Clima e Tempo",
  "preventiva-ac": "Preventiva AC (PMOC)",
  "seguranca-trabalho": "Segurança do Trabalho",
  "corretiva-pecas-status": "Programação — Status de Peças",
  "refrigeracao-pecas-status": "Refrigeração — Status de Peças",
  "refrigeracao-historico": "Refrigeração — Histórico",

  configuracoes: "Configurações",
};

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
            Você não tem permissão para acessar esta página. Apenas administradores podem gerenciar
            usuários.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Usuários"
      description="Crie, gerencie e configure permissões de acesso dos usuários do sistema."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <CreateUserCard />
        <UsersListCard />
      </div>
    </PageShell>
  );
}

function CreateUserCard() {
  const qc = useQueryClient();
  const create = useServerFn(createAppUser);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await create({ data: { login, password, fullName: fullName || undefined, role } });
      toast.success(
        `Usuário "${login}" criado como ${role === "admin" ? "administrador" : "usuário"}.`,
      );
      setLogin("");
      setPassword("");
      setFullName("");
      setRole("user");
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
          <UserPlus className="h-4 w-4" strokeWidth={1.75} />
          Novo usuário
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">Nome completo (opcional)</Label>
          <Input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex.: João da Silva"
            autoComplete="name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="login">Login</Label>
          <Input
            id="login"
            type="text"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9._-]{3,30}"
            value={login}
            onChange={(e) => setLogin(e.target.value.toLowerCase())}
            placeholder="ex.: joao.silva"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            3-30 caracteres. Letras minúsculas, números e . _ -
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
        </div>

        <div className="space-y-2">
          <Label>Tipo de acesso</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole("user")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                role === "user"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <UserIcon className="h-4 w-4" /> Usuário
            </button>
            <button
              type="button"
              onClick={() => setRole("admin")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                role === "admin"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> Administrador
            </button>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando…
            </>
          ) : (
            <>
              <UserPlus className="mr-2 h-4 w-4" /> Criar usuário
            </>
          )}
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
  const list = useServerFn(listAppUsers);
  const [filter, setFilter] = useState("");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["app-users"],
    queryFn: async () => (await list()).users as AppUser[],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["app-users"] });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (u) =>
        u.login.toLowerCase().includes(q) ||
        (u.fullName ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [data, filter]);

  return (
    <GlassCard>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Usuários cadastrados
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar…"
            className="h-9 w-56 pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários…
        </div>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            Falha ao carregar usuários: {error instanceof Error ? error.message : String(error)}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Tentar novamente
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((u) => (
            <UserRow key={u.id} user={u} onChanged={invalidate} />
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

function UserRow({ user, onChanged }: { user: AppUser; onChanged: () => void }) {
  const del = useServerFn(deleteAppUser);
  const setBanned = useServerFn(setUserBanned);
  const setRole = useServerFn(setUserRole);
  const setMenus = useServerFn(setUserAllowedMenus);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localAllowed, setLocalAllowed] = useState<string[] | null>(user.allowedMenus);
  const isAdminUser = user.role === "admin";
  const allAllowed = localAllowed === null;

  useEffect(() => {
    setLocalAllowed(user.allowedMenus);
  }, [user.allowedMenus]);

  const banMut = useMutation({
    mutationFn: async (banned: boolean) => setBanned({ data: { userId: user.id, banned } }),
    onSuccess: () => {
      toast.success(user.banned ? "Usuário ativado." : "Usuário desativado.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar status"),
  });

  const roleMut = useMutation({
    mutationFn: async (role: Role) => setRole({ data: { userId: user.id, role } }),
    onSuccess: () => {
      toast.success("Papel atualizado.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar papel"),
  });

  const delMut = useMutation({
    mutationFn: async () => del({ data: { userId: user.id } }),
    onSuccess: () => {
      toast.success("Usuário removido.");
      setConfirmDelete(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  const menusMut = useMutation({
    mutationFn: async () => setMenus({ data: { userId: user.id, allowed: localAllowed } }),
    onSuccess: () => {
      toast.success("Permissões salvas.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar permissões"),
  });

  const toggleMenu = (key: MenuKey, on: boolean) => {
    const current = localAllowed ?? [...MENU_KEYS];
    const next = on ? Array.from(new Set([...current, key])) : current.filter((k) => k !== key);
    setLocalAllowed(next);
  };

  return (
    <li className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold truncate">{user.login}</span>
            <Badge
              variant={user.role === "admin" ? "default" : "secondary"}
              className="uppercase text-[10px]"
            >
              {user.role}
            </Badge>
            {user.banned && (
              <Badge variant="destructive" className="uppercase text-[10px]">
                desativado
              </Badge>
            )}
          </div>
          {user.fullName && (
            <div className="text-xs text-muted-foreground truncate">{user.fullName}</div>
          )}
          <div className="text-[11px] text-muted-foreground/70 truncate">{user.email}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => roleMut.mutate(user.role === "admin" ? "user" : "admin")}
            loading={roleMut.isPending}
            title="Alternar papel"
          >
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            {user.role === "admin" ? "Tornar usuário" : "Tornar admin"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => banMut.mutate(!user.banned)}
            loading={banMut.isPending}
          >
            {user.banned ? (
              <>
                <Power className="mr-1 h-3.5 w-3.5" /> Ativar
              </>
            ) : (
              <>
                <PowerOff className="mr-1 h-3.5 w-3.5" /> Desativar
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
            loading={delMut.isPending}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Fechar permissões" : "Permissões"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 rounded-lg border border-border/50 bg-background/40 p-3">
          {isAdminUser && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Administradores sempre mantêm acesso total, incluindo o menu Usuários.
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Itens de menu permitidos
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={allAllowed}
                disabled={isAdminUser}
                onCheckedChange={(v) => setLocalAllowed(v ? null : [...MENU_KEYS])}
              />
              Acesso total (todos os itens)
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MENU_KEYS.map((key) => {
              const checked = allAllowed || (localAllowed ?? []).includes(key);
              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition ${
                    checked ? "border-primary/60 bg-primary/5" : "border-border bg-transparent"
                  } ${allAllowed ? "opacity-70" : ""}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={allAllowed || isAdminUser}
                    onCheckedChange={(v) => toggleMenu(key, Boolean(v))}
                  />
                  <span className="truncate">{MENU_LABELS[key]}</span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => menusMut.mutate()}
              disabled={menusMut.isPending || isAdminUser}
            >
              {menusMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Salvar permissões
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O usuário <strong>{user.login}</strong> perderá o acesso
              imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                delMut.mutate();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
