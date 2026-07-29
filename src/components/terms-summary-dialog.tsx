import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BadgeCheck, Database, FileSignature, Lock } from "lucide-react";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/auth/terms";

const BLOCKS = [
  {
    icon: BadgeCheck,
    title: "Uso profissional e autorizado",
    text: "O acesso é individual, corporativo e destinado à operação de manutenção. Não compartilhe suas credenciais.",
  },
  {
    icon: Database,
    title: "Tratamento de dados operacionais",
    text: "Registramos ordens de serviço, fotos, apontamentos e evidências para fins de gestão, auditoria e segurança do trabalho.",
  },
  {
    icon: FileSignature,
    title: "Responsabilidade pelas informações",
    text: "Você responde pela veracidade dos dados, fotos e assinaturas que registrar no sistema.",
  },
  {
    icon: Lock,
    title: "Privacidade e seus direitos",
    text: "Seus dados são usados apenas na operação. Você pode solicitar acesso, correção ou exclusão pelos canais internos.",
  },
];

export function TermsSummaryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resumo dos Termos e da Privacidade</DialogTitle>
          <DialogDescription>
            Versões vigentes: Termos {TERMS_VERSION} · Privacidade {PRIVACY_VERSION}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {BLOCKS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex gap-3 text-xs">
            <a href="/termos" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Termos completos
            </a>
            <a href="/privacidade" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Política completa
            </a>
          </div>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
