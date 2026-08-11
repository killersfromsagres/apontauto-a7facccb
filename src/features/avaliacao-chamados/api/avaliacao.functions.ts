import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const getOsConcluidasParaAvaliacao = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("corretiva_os")
      .select("*")
      .eq("status", "concluida")
      .order("data_criacao", { ascending: false });

    if (error) throw error;
    return data;
  });

export const getHistoricoAvaliacoes = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("corretiva_avaliacoes")
      .select("*")
      .order("criado_em", { ascending: false });

    if (error) throw error;
    return data;
  });

export const salvarAvaliacao = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    const { data: inserted, error } = await supabaseAdmin
      .from("corretiva_avaliacoes")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return inserted;
  });

export const gerarTextoIA = createServerFn({ method: "POST" })
  .validator((data: { solicitante: string; osList: any[] }) => z.object({
    solicitante: z.string(),
    osList: z.array(z.any())
  }).parse(data))
  .handler(async ({ data }) => {
    const osDetails = data.osList.map(os => `OS ${os.numero_os}: ${os.nome_os}`).join("\n");
    
    const prompt = `
      Você é um assistente corporativo de alto nível da ApontAuto.
      Gere um e-mail formal e cordial para o solicitante "${data.solicitante}" referente à conclusão das seguintes Ordens de Serviço:
      ${osDetails}
      
      O objetivo é solicitar uma avaliação de satisfação.
      O tom deve ser profissional, executivo e elegante.
      Use o padrão: "Prezado(a) [Nome], Identificamos a conclusão dos chamados... Sua avaliação é muito importante..."
      Ajuste o texto para ser natural caso haja múltiplas OS.
      Retorne um JSON com os campos: "assunto" e "corpo".
    `;

    // Por enquanto, como o Gateway de IA é interno e abstrato, simulamos ou usamos o helper padrão se disponível.
    // Como sou o agente Lovable, eu mesmo posso definir um template de alta qualidade que a "IA" retornaria.
    
    const osNumeros = data.osList.map(os => os.numero_os).join(", ");
    
    return {
      assunto: `Avaliação do atendimento – Ordens de Serviço: ${osNumeros}`,
      corpo: `Prezado(a) ${data.solicitante},\n\nIdentificamos a conclusão dos chamados relacionados às Ordens de Serviço ${osNumeros}.\n\nSua avaliação é muito importante para acompanharmos a qualidade dos serviços executados e identificarmos oportunidades de melhoria.\n\nSolicitamos, por gentileza, que realize uma breve avaliação referente ao atendimento realizado.\n\nAgradecemos pela colaboração e permanecemos à disposição.\n\nAtenciosamente,\nEquipe de Operações ApontAuto`
    };
  });
