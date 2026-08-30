const STORAGE_PREFIX = "apont-auto:corretiva-historico:verificadas:v1";

type VerificationStorage = Pick<Storage, "getItem" | "setItem">;

function resolveStorage(
  storage?: VerificationStorage,
): VerificationStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function verifiedOsStorageKey(scope: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope)}`;
}

export function loadVerifiedOsIds(
  scope: string,
  storage?: VerificationStorage,
): Set<string> {
  const target = resolveStorage(storage);
  if (!target) return new Set();

  try {
    const raw = target.getItem(verifiedOsStorageKey(scope));
    if (!raw) return new Set();

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );
  } catch {
    return new Set();
  }
}

export function saveVerifiedOsIds(
  scope: string,
  ids: ReadonlySet<string>,
  storage?: VerificationStorage,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(
      verifiedOsStorageKey(scope),
      JSON.stringify([...ids].sort()),
    );
    return true;
  } catch {
    return false;
  }
}

export function withVerifiedOs(
  ids: ReadonlySet<string>,
  osId: string,
  verified: boolean,
) {
  const next = new Set(ids);
  if (verified) next.add(osId);
  else next.delete(osId);
  return next;
}
