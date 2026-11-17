import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  getClaims: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: mocks.getRequest }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { requireSupabaseAuth } from "./auth-middleware";

const run = requireSupabaseAuth as unknown as (options: {
  next: ReturnType<typeof vi.fn>;
}) => Promise<unknown>;

describe("session validation after a backend configuration change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://active.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_active");
    vi.stubEnv("SUPABASE_URL", "https://retired.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_retired");
    mocks.getRequest.mockReturnValue(
      new Request("https://app.example/", {
        headers: { authorization: "Bearer header.payload.signature" },
      }),
    );
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-user" } },
      error: null,
    });
    mocks.createClient.mockReturnValue({ auth: { getClaims: mocks.getClaims } });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("validates the browser's token on its active backend despite stale hosting variables", async () => {
    const next = vi.fn().mockResolvedValue("authorized");
    await expect(run({ next })).resolves.toBe("authorized");
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://active.supabase.co",
      "sb_publishable_active",
      expect.objectContaining({
        global: expect.objectContaining({
          headers: { Authorization: "Bearer header.payload.signature" },
        }),
      }),
    );
    expect(next).toHaveBeenCalledWith({
      context: expect.objectContaining({ userId: "authenticated-user" }),
    });
  });

  it("still rejects an invalid session", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("invalid token") });
    const next = vi.fn();
    await expect(run({ next })).rejects.toThrow("Unauthorized: Invalid token");
    expect(next).not.toHaveBeenCalled();
  });

  it("still rejects requests without a bearer token", async () => {
    mocks.getRequest.mockReturnValue(new Request("https://app.example/"));
    const next = vi.fn();
    await expect(run({ next })).rejects.toThrow("Unauthorized: No authorization header");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
