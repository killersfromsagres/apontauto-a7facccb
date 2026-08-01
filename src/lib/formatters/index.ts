import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Utilitários únicos para formatação (Item 7.3)
 */

export const formatters = {
  date: (date: string | Date) => format(new Date(date), "dd/MM/yyyy", { locale: ptBR }),
  dateTime: (date: string | Date) => format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR }),
  time: (date: string | Date) => format(new Date(date), "HH:mm", { locale: ptBR }),
  
  currency: (val: number) => 
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val),
  
  percent: (val: number) => 
    new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 }).format(val / 100),
  
  distance: (km: number) => `${km.toLocaleString("pt-BR")} km`,
  
  volume: (liters: number) => `${liters.toLocaleString("pt-BR")} L`,
  
  duration: (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}min`;
  },

  phone: (v: string) => {
    if (!v) return "";
    const n = v.replace(/\D/g, "");
    if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    return n.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  },

  cpf: (v: string) => {
    if (!v) return "";
    const n = v.replace(/\D/g, "");
    // Máscara de segurança: oculta início e fim para proteção de dados (Item 8.4)
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "***.$2.$3-**");
  }
};
