from pathlib import Path
import re

path = Path("src/routes/auth.tsx")
text = path.read_text(encoding="utf-8")

# Keep a timeout only for secondary operations such as password reset. The old
# 6.5s Promise.race around password sign-in could report a false network error
# while the Supabase request was still completing in the background.
text = text.replace("const AUTH_TIMEOUT_MS = 6500;", "const AUTH_TIMEOUT_MS = 20000;")

pattern = re.compile(
    r"async function signInWithRetry\(email: string, password: string\) \{.*?\n\}\n\nexport const Route",
    re.S,
)
replacement = '''async function signInWithRetry(email: string, password: string) {
  let lastError: unknown;

  // Do not race sign-in against an artificial client timeout. Promise.race
  // does not cancel the underlying Supabase request and could therefore show
  // "Não foi possível conectar" even when authentication completed moments
  // later. Retry only real network failures reported by fetch/Supabase.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });

      if (!result.error) return result.data;
      lastError = result.error;
      if (!isNetworkFailure(result.error)) throw result.error;
    } catch (error) {
      lastError = error;
      if (!isNetworkFailure(error)) throw error;
    }

    // If a response was lost after Supabase persisted a valid session, accept
    // that local session instead of presenting a false connection failure.
    const { data: local } = await supabase.auth.getSession();
    if (local.session?.user) {
      return { user: local.session.user, session: local.session };
    }

    if (attempt < 2) await delay(650 * (attempt + 1));
  }

  throw lastError ?? new Error(NETWORK_ERROR_MESSAGE);
}

export const Route'''

text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit("Could not locate signInWithRetry block; refusing to modify the file.")

path.write_text(text, encoding="utf-8")
