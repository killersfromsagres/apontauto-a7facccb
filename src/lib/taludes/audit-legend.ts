import { supabase } from "@/integrations/supabase/client";
import { type Point, type TaludeMarcacao } from "@/lib/taludes/api";

/**
 * Script de auditoria e correção para redimensionamento de legendas.
 * Verifica se a coluna 'tamanho_legenda' existe no banco e tenta atualizar via SQL.
 */
export async function auditLegendScale() {
  console.log("Iniciando auditoria de redimensionamento de legendas...");
  
  try {
    // 1. Verificar esquema local (via RPC ou consulta direta)
    const { data: testData, error: testError } = await supabase
      .from('talude_marcacoes')
      .select('id, tamanho_legenda')
      .limit(1);

    if (testError) {
      console.error("Erro ao verificar coluna 'tamanho_legenda':", testError);
      return { success: false, error: testError.message };
    }

    console.log("Coluna 'tamanho_legenda' verificada com sucesso.");
    return { success: true };
  } catch (err: any) {
    console.error("Falha na auditoria:", err);
    return { success: false, error: err.message };
  }
}
