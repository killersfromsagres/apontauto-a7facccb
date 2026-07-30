import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  acknowledge,
  categoryMeta,
  DEFAULT_PREFS,
  ensureDelivered,
  fetchInbox,
  fetchMyReceipts,
  fetchPrefs,
  filtrarPorPreferencias,
  markRead,
  savePrefs,
  setArchived,
  type NotificationPrefs,
  type NotificationRow,
  type ReceiptRow,
} from "@/lib/notifications";

const TOASTED_KEY = "pcm:notif:toasted";

/** Ids já exibidos em toast — persistidos para não repetir a cada reload. */
function loadToasted(): Set<string> {
  try {
    const raw = localStorage.getItem(TOASTED_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}
function saveToasted(set: Set<string>) {
  try {
    localStorage.setItem(TOASTED_KEY, JSON.stringify([...set].slice(-300)));
  } catch {
    /* storage indisponível — o toast simplesmente pode repetir */
  }
}

export type InboxItem = NotificationRow & {
  receipt: ReceiptRow | null;
  isRead: boolean;
  isAcked: boolean;
  isArchived: boolean;
};

export function useNotifications() {
  const qc = useQueryClient();
  const toasted = useRef<Set<string>>(new Set());
  const hydrated = useRef(false);
  if (!hydrated.current && typeof window !== "undefined") {
    toasted.current = loadToasted();
    hydrated.current = true;
  }

  const session = useQuery({
    queryKey: ["auth-user-id"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  const userId = session.data ?? null;

  const inbox = useQuery({
    queryKey: ["notifications-inbox"],
    queryFn: fetchInbox,
    staleTime: 30_000,
    // Fallback quando o realtime cai; o cache do TanStack mantém a lista offline.
    refetchInterval: 120_000,
  });

  const receipts = useQuery({
    queryKey: ["notification-receipts", userId],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: fetchMyReceipts,
  });

  const prefsQuery = useQuery({
    queryKey: ["notification-prefs", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchPrefs(userId as string),
  });
  const prefs =
    prefsQuery.data ?? ({ user_id: userId ?? "", ...DEFAULT_PREFS } as NotificationPrefs);

  // Realtime em canal privado do usuário autenticado.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`, { config: { private: true } })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications-inbox"] });
        qc.invalidateQueries({ queryKey: ["notifications-admin"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, userId]);

  const todos: InboxItem[] = useMemo(() => {
    const byId = new Map((receipts.data ?? []).map((r) => [r.notification_id, r]));
    const base = (inbox.data ?? []).map((n) => {
      const receipt = byId.get(n.id) ?? null;
      return {
        ...n,
        receipt,
        isRead: Boolean(receipt?.read_at),
        isAcked: Boolean(receipt?.acknowledged_at),
        isArchived: Boolean(receipt?.archived_at),
      };
    });
    return filtrarPorPreferencias(base, prefsQuery.data ?? null);
  }, [inbox.data, receipts.data, prefsQuery.data]);

  const items = useMemo(() => todos.filter((i) => !i.isArchived), [todos]);
  const archived = useMemo(() => todos.filter((i) => i.isArchived), [todos]);

  // Registra entrega e dispara toast só para itens realmente novos.
  useEffect(() => {
    if (!userId || items.length === 0) return;
    const known = new Set((receipts.data ?? []).map((r) => r.notification_id));
    const undelivered = items.filter((i) => !known.has(i.id)).map((i) => i.id);
    if (undelivered.length > 0) {
      ensureDelivered(userId, undelivered)
        .then(() => qc.invalidateQueries({ queryKey: ["notification-receipts", userId] }))
        .catch(() => undefined);
    }
    if (!prefs.toast) return;
    const fresh = items.filter((i) => !i.isRead && !toasted.current.has(i.id));
    if (fresh.length === 0) return;
    for (const n of fresh.slice(0, 3)) {
      const meta = categoryMeta(n.category);
      const fn =
        meta.tone === "danger"
          ? toast.error
          : meta.tone === "warning"
            ? toast.warning
            : meta.tone === "success"
              ? toast.success
              : toast.info;
      fn(n.title, { description: n.body ?? undefined, duration: 6000 });
      toasted.current.add(n.id);
    }
    saveToasted(toasted.current);
  }, [items, receipts.data, userId, qc, prefs.toast]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["notification-receipts", userId] });
  }, [qc, userId]);

  const read = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!userId) return;
      await markRead(userId, ids);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const ack = useMutation({
    mutationFn: async (id: string) => {
      if (!userId) return;
      await acknowledge(userId, id);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Ciência confirmada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async (args: { ids: string[]; archived?: boolean }) => {
      if (!userId) return;
      await setArchived(userId, args.ids, args.archived ?? true);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePrefs = useMutation({
    mutationFn: async (patch: Partial<NotificationPrefs>) => {
      if (!userId) return;
      await savePrefs(userId, { ...prefs, ...patch });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-prefs", userId] });
      toast.success("Preferências salvas.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unread = items.filter((i) => !i.isRead);
  const pendingAck = items.filter((i) => i.requires_ack && !i.isAcked);

  return {
    userId,
    items,
    archived,
    unread,
    pendingAck,
    unreadCount: unread.length,
    prefs,
    isLoading: inbox.isLoading || receipts.isLoading,
    error: (inbox.error ?? null) as Error | null,
    refetch: () => {
      inbox.refetch();
      receipts.refetch();
    },
    markRead: read.mutate,
    acknowledge: ack.mutate,
    archiveItems: (ids: string[]) => archive.mutate({ ids, archived: true }),
    unarchiveItems: (ids: string[]) => archive.mutate({ ids, archived: false }),
    savePreferences: updatePrefs.mutate,
    isMutating: read.isPending || ack.isPending || archive.isPending,
  };
}
