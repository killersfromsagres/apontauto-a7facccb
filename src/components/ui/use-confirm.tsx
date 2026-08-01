import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  titulo?: string;
  descricao: string;
  confirmar?: string;
  cancelar?: string;
  destrutivo?: boolean;
};

/**
 * Substitui window.confirm() por um AlertDialog acessível.
 *
 * const { confirmar, dialogo } = useConfirm();
 * if (!(await confirmar({ descricao: "Excluir?" }))) return;
 * // ...e renderize {dialogo} no JSX do componente.
 */
export function useConfirm() {
  const [aberto, setAberto] = useState(false);
  const [opcoes, setOpcoes] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirmar = useCallback((opts: ConfirmOptions) => {
    setOpcoes(opts);
    setAberto(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const finalizar = useCallback((valor: boolean) => {
    setAberto(false);
    resolverRef.current?.(valor);
    resolverRef.current = null;
  }, []);

  const dialogo = (
    <AlertDialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) finalizar(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opcoes?.titulo ?? "Confirmar ação"}</AlertDialogTitle>
          <AlertDialogDescription>{opcoes?.descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" onClick={() => finalizar(false)}>
            {opcoes?.cancelar ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              opcoes?.destrutivo
                ? "min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "min-h-11"
            }
            onClick={() => finalizar(true)}
          >
            {opcoes?.confirmar ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmar, dialogo };
}
