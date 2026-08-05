import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Lista de e-mails com permissão de edição
const EDIT_ALLOWED_EMAILS = ["admin", "gabrielvlp33@gmail.com"];

export const checkOrgEditPermission = createServerFn({ method: "GET" })
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!userId) return { allowed: false };

    const { data: user } = await supabase.auth.getUser();
    const email = user.user?.email;

    if (!email) return { allowed: false };

    // Se o e-mail estiver na lista ou se o login (prefixo) estiver (para o caso de logins sem domínio)
    const login = email.split("@")[0];
    const isAllowed = EDIT_ALLOWED_EMAILS.includes(email) || EDIT_ALLOWED_EMAILS.includes(login);

    return { allowed: isAllowed };
  });
