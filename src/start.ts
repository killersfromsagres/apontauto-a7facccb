import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const alignActiveSupabaseEnvironment = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    // Server providers can keep legacy SUPABASE_* variables from an older
    // integration even after the frontend has been moved to another project.
    // Keep every serverFn on the exact same Supabase project used by the
    // authenticated browser session. Privileged secrets remain server-only and
    // are resolved separately by client.server.ts.
    const activeUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const activePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
      | string
      | undefined;
    const activeProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

    if (activeUrl) process.env.SUPABASE_URL = activeUrl;
    if (activePublishableKey) process.env.SUPABASE_PUBLISHABLE_KEY = activePublishableKey;
    if (activeProjectId) process.env.SUPABASE_PROJECT_ID = activeProjectId;

    return next();
  },
);

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, alignActiveSupabaseEnvironment],
  requestMiddleware: [errorMiddleware],
}));
