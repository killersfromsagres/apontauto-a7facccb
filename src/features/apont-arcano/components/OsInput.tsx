import { memo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ParsedOsNumbers } from "../utils/parseOsNumbers";

export const OsInput = memo(function OsInput({
  value,
  onChange,
  parsed,
}: {
  value: string;
  onChange: (v: string) => void;
  parsed: ParsedOsNumbers;
}) {
  return (
    <div className="space-y-3">
      <Label htmlFor="os-input">Ordens de Serviço</Label>
      <Textarea
        id="os-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={"1540100, 1540101\n1540102 1540103;1540104"}
        className="font-mono text-sm"
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Informadas: {parsed.originalCount}</Badge>
        <Badge variant="outline" className="border-emerald-400/40 text-emerald-200">
          Válidas: {parsed.valid.length}
        </Badge>
        <Badge variant="outline" className="border-amber-400/40 text-amber-200">
          Duplicadas removidas: {parsed.duplicates.length}
        </Badge>
        <Badge variant="outline" className="border-red-400/40 text-red-200">
          Inválidas: {parsed.invalid.length}
        </Badge>
      </div>
      {parsed.valid.length > 0 && (
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-border/50 bg-background/40 p-2">
          {parsed.valid.map((os) => (
            <span
              key={os}
              className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px]"
            >
              {os}
            </span>
          ))}
        </div>
      )}
      {parsed.invalid.length > 0 && (
        <p className="text-xs text-red-300">
          Ignoradas por não serem numéricas: {parsed.invalid.slice(0, 10).join(", ")}
        </p>
      )}
    </div>
  );
});
