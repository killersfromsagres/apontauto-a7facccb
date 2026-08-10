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
        const altPath = path.join(process.cwd(), "bundle", "public", "manual", fileName);
        const finalPath = fs.existsSync(filePath) ? filePath : altPath;


        try {
          if (!fs.existsSync(finalPath)) {
            return new Response(`Arquivo "${fileName}" não encontrado no manual. Caminho: ${finalPath}`, { status: 404 });
          }

          const content = fs.readFileSync(finalPath);

          const ext = path.extname(fileName).toLowerCase();
          
          let contentType = "application/octet-stream";
          if (ext === ".html") contentType = "text/html";
          else if (ext === ".sql") contentType = "text/plain";
          else if (ext === ".md") contentType = "text/markdown";
          else if (ext === ".css") contentType = "text/css";
          else if (ext === ".js") contentType = "application/javascript";

          return new Response(content, {
            headers: {
              "Content-Type": `${contentType}; charset=utf-8`,
              "Content-Disposition": ext === ".html" ? "inline" : `attachment; filename="${fileName}"`,
              "Access-Control-Allow-Origin": "*",
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

