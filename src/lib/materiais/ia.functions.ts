import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Agente IA para processar a descrição de solicitação de peça.
 * Extrai itens e quantidades do texto livre.
 */
export const processarDescricaoPecaIA = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ descricao: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const text = data.descricao.toLowerCase();
    
    // Regex simples para capturar padrões comuns como "10 lampadas", "2 motores", "valvula x 5"
    // Em um cenário real, poderíamos usar o Lovable AI Gateway (Gemini) aqui.
    // Mas para velocidade e custo, vamos começar com uma lógica robusta de extração.
    
    const items: Array<{ item: string; qtd: number }> = [];
    
    // Tenta encontrar números próximos a palavras
    const lines = text.split(/[,\n;.]+/);
    
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      let qtd = 1;
      let item = line;
      
      // Padrao: "5 unidades de X" ou "5x X" ou "5 X"
      const matchPrefixo = line.match(/^(\d+)\s*(?:un|und|unidades|x|pcs|pecas)?\s*(?:de|do|da)?\s+(.+)$/i);
      if (matchPrefixo) {
        qtd = parseInt(matchPrefixo[1]);
        item = matchPrefixo[2];
      } else {
        // Padrao: "X - 5 unidades" ou "X 5x"
        const matchSufixo = line.match(/^(.+?)\s*(?:-|:|\s)\s*(\d+)\s*(?:un|und|unidades|x|pcs|pecas)?$/i);
        if (matchSufixo) {
          item = matchSufixo[1];
          qtd = parseInt(matchSufixo[2]);
        }
      }
      
      items.push({ item: item.trim(), qtd });
    }
    
    return { items };
  });
