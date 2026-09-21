import type { TaludeMarcacao } from "@/lib/taludes/api";
import { PolygonEditorPro } from "./polygon-editor-pro";

interface PolygonEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  marcacoes: TaludeMarcacao[];
  onSave: (marcacao: Partial<TaludeMarcacao>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Fachada estável do editor de Taludes.
 *
 * A versão anterior observava toda a árvore DOM com MutationObserver e alterava
 * nós renderizados pelo React para renomear campos e injetar controles. Ao
 * concluir uma demarcação, a atualização do mapa podia provocar uma cascata de
 * mutações/reconciliações e bloquear a interface. Todos os controles agora são
 * renderizados nativamente pelo PolygonEditorPro.
 */
export function PolygonEditor(props: PolygonEditorProps) {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-950">
      <div className="h-full min-h-0 w-full">
        <PolygonEditorPro {...props} />
      </div>
    </div>
  );
}
