import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Mail, Briefcase } from "lucide-react";
import { OrgNode } from "@/features/organograma/types";

interface InteractiveOrgCardProps {
  node: OrgNode;
  canEdit: boolean;
  onEdit: () => void;
  onAdd: () => void;
  onDelete: () => void;
}

export function InteractiveOrgCard({ 
  node, 
  canEdit, 
  onEdit, 
  onAdd, 
  onDelete 
}: InteractiveOrgCardProps) {
  return (
    <div className="group relative w-full max-w-sm transition-all duration-500 hover:scale-[1.02]">
      {/* Glow effect background */}
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary/50 to-blue-500/30 opacity-20 blur-xl transition duration-500 group-hover:opacity-40" />
      
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0A0F1E]/80 p-5 backdrop-blur-xl shadow-2xl">
        {/* Header with Avatar and Actions */}
        <div className="flex items-start justify-between">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary to-blue-400 opacity-20 blur-sm group-hover:opacity-40 transition-opacity" />
            <Avatar className="h-16 w-16 border-2 border-white/10 shadow-xl ring-2 ring-primary/20">
              <AvatarImage src={node.foto_url} alt={node.nome} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-xl font-bold text-white">
                {node.nome.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {node.email === "admin" && (
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary shadow-lg ring-2 ring-[#0A0F1E]">
                <Badge className="h-full w-full bg-transparent p-0 flex items-center justify-center">
                  <span className="text-[8px] font-black leading-none text-white">★</span>
                </Badge>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex translate-x-2 gap-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 rounded-full bg-white/5 text-primary hover:bg-primary/20" 
                onClick={onAdd}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 rounded-full bg-white/5 text-white/70 hover:bg-white/10" 
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 rounded-full bg-white/5 text-rose-400 hover:bg-rose-400/20" 
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold tracking-tight text-white group-hover:text-primary transition-colors">
                {node.nome}
              </h3>
              {node.email === "admin" && (
                <Badge variant="outline" className="border-primary/50 bg-primary/10 text-[9px] font-bold text-primary px-1.5 py-0">
                  LÍDER
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-blue-200/60 font-medium">
              <Briefcase className="h-3 w-3" />
              <span className="uppercase tracking-wider text-[10px]">{node.cargo}</span>
            </div>
          </div>

          {node.email && (
            <div className="flex items-center gap-2 rounded-lg bg-white/5 p-2 transition-colors group-hover:bg-white/10">
              <Mail className="h-3.5 w-3.5 text-primary/70" />
              <span className="truncate text-[11px] text-white/50 group-hover:text-white/80 transition-colors">
                {node.email}
              </span>
            </div>
          )}
        </div>

        {/* Decorative corner element */}
        <div className="absolute right-0 top-0 h-16 w-16 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary/10 blur-2xl transition-all group-hover:bg-primary/20" />
      </div>
    </div>
  );
}
