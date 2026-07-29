import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_LENGTH = 8;

/**
 * Bloqueia o uso do sistema enquanto o usuário estiver marcado com
 * `must_change_password` (acesso provisionado com senha temporária).
 * A flag é gravada no metadata do usuário pelo servidor e limpa aqui,
 * junto com a definição da nova senha.
 */
export function ForcePasswordChange() {
  const [open, setOpen] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!ativo) return;
      setOpen(Boolean((data.user?.user_metadata as any)?.must_change_password));
    });
    return () => {
      ativo = false;
    };
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < MIN_LENGTH) {
      setErro(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (senha !== confirma) {
      setErro("As senhas não conferem.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: senha,
        data: { must_change_password: false },
      });
      if (error) throw error;
      toast.success("Senha atualizada. Bom trabalho!");
      setOpen(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível atualizar a senha.");
    } finally {
      setSalvando(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden />
            Defina sua senha
          </DialogTitle>
          <DialogDescription>
            Seu acesso foi criado com uma senha temporária. Escolha uma senha pessoal para
            continuar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirma-senha">Confirmar nova senha</Label>
            <Input
              id="confirma-senha"
              type="password"
              autoComplete="new-password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
            />
          </div>

          <p
            aria-live="polite"
            className={`min-h-4 text-xs ${erro ? "text-destructive" : "text-muted-foreground"}`}
          >
            {erro ?? `Use ao menos ${MIN_LENGTH} caracteres.`}
          </p>

          <Button type="submit" className="w-full" disabled={salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar senha
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
