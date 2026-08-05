import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Mail, Briefcase } from "lucide-react";
import { OrgNode } from "@/features/organograma/types";

interface InteractiveOrgCardProps extends React.HTMLAttributes<HTMLDivElement> {
  node: OrgNode;
  canEdit: boolean;
  onEdit: () => void;
  onAdd: () => void;
  onDelete: () => void;
}

export function InteractiveOrgCard({
  className,
  node,
  canEdit,
  onEdit,
  onAdd,
  onDelete,
  ...props
}: InteractiveOrgCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({});

  // --- MOUSE MOVE HANDLER (From uploaded component.tsx) ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const { left, top, width, height } = cardRef.current.getBoundingClientRect();
    const x = e.clientX - left;
    const y = e.clientY - top;

    const rotateX = (y - height / 2) / (height / 2) * -8; // Max rotation 8deg
    const rotateY = (x - width / 2) / (width / 2) * 8;   // Max rotation 8deg

    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`,
      transition: "transform 0.1s ease-out",
    });
  };

  // --- MOUSE LEAVE HANDLER (From uploaded component.tsx) ---
  const handleMouseLeave = () => {
    setStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      transition: "transform 0.4s ease-in-out",
    });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className={cn(
        "group relative w-full max-w-[340px] aspect-[9/11] rounded-3xl bg-[#0A0F1E] shadow-2xl overflow-hidden cursor-default",
        "transform-style-3d transition-all duration-300",
        className
      )}
      {...props}
    >
      {/* Background Image - with 3D depth */}
      <div 
        className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
        style={{ transform: "translateZ(-20px) scale(1.1)" }}
      >
        {node.foto_url ? (
          <img
            src={node.foto_url}
            alt={node.nome}
            className="h-full w-full object-cover opacity-60 mix-blend-overlay grayscale group-hover:grayscale-0 transition-all duration-700"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 to-blue-900/40 opacity-40" />
        )}
      </div>

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070C] via-[#05070C]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Main Content with 3D effect */}
      <div
        className="absolute inset-0 p-6 flex flex-col justify-end"
        style={{ transform: "translateZ(40px)" }}
      >
        {/* Glassmorphism Actions - Hidden by default, appears on hover */}
        <div className="absolute top-6 right-6 flex flex-col gap-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
          {canEdit && (
            <>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 text-primary hover:bg-primary/20 hover:scale-110 transition-all backdrop-blur-md" 
                onClick={(e) => { e.stopPropagation(); onAdd(); }}
                title="Adicionar Subordinado"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:scale-110 transition-all backdrop-blur-md" 
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 text-rose-400 hover:bg-rose-400/20 hover:scale-110 transition-all backdrop-blur-md" 
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>

        {/* User Info Container */}
        <div className="space-y-4">
          <div className="relative inline-block">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary to-blue-400 opacity-0 blur-sm group-hover:opacity-40 transition-opacity duration-500" />
            <Avatar className="h-16 w-16 border-2 border-white/10 shadow-2xl ring-2 ring-primary/20 group-hover:scale-105 transition-transform duration-500">
              <AvatarImage src={node.foto_url} alt={node.nome} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-xl font-bold text-white uppercase">
                {node.nome.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-black tracking-tight text-white uppercase group-hover:text-primary transition-colors duration-300">
                {node.nome}
              </h3>
              {node.email === "admin" && (
                <Badge className="bg-primary text-[9px] font-black text-white px-2 py-0 animate-pulse">
                  CEO
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-primary/80 font-bold uppercase tracking-[0.2em] text-[10px]">
              <Briefcase className="h-3 w-3" />
              {node.cargo}
            </div>
          </div>

          {node.email && (
            <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 p-3 backdrop-blur-sm transition-all duration-300 group-hover:bg-white/10 group-hover:border-white/20">
              <Mail className="h-3.5 w-3.5 text-primary/70" />
              <span className="truncate text-[11px] font-medium text-white/40 group-hover:text-white/80 transition-colors">
                {node.email}
              </span>
            </div>
          )}
        </div>

        {/* Decorative elements from original design */}
        <div className="mt-6 flex w-full justify-start gap-1.5 opacity-30">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className={cn(
                "h-1 w-6 rounded-full bg-primary",
                index > 0 && "w-2 opacity-50"
              )}
            />
          ))}
        </div>
      </div>
      
      {/* Corner Glow */}
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
    </div>
  );
}
