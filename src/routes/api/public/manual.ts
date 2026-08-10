import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";

export const Route = createFileRoute("/api/public/manual")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const fileName = url.searchParams.get("file") || "index.html";

        // Segurança: impede acesso a arquivos fora da pasta manual
        if (fileName.includes("..") || fileName.startsWith("/") || fileName.includes("~")) {
          return new Response("Acesso negado", { status: 403 });
        }

        const filePath = path.join(process.cwd(), "public", "manual", fileName);

        try {
          if (!fs.existsSync(filePath)) {
            return new Response("Arquivo não encontrado no manual", { status: 404 });
          }

          const content = fs.readFileSync(filePath);
          const ext = path.extname(fileName).toLowerCase();
          const contentType =
            ext === ".html"
              ? "text/html"
              : ext === ".sql"
              ? "text/plain"
              : ext === ".md"
              ? "text/markdown"
              : "application/octet-stream";

          return new Response(content, {
            headers: {
              "Content-Type": `${contentType}; charset=utf-8`,
            },
          });
        } catch (error) {
          console.error("Erro ao ler manual:", error);
          return new Response("Erro interno ao carregar manual", { status: 500 });
        }
      },
    },
  },
});
