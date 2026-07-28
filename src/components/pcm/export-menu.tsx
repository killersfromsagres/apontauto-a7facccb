import { Download, FileSpreadsheet, FileText, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ExportOption = {
  key: string;
  label: string;
  kind?: "xlsx" | "pdf" | "png" | "csv";
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

const ICON = {
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  pdf: FileText,
  png: Image,
} as const;

export function ExportMenu({
  options,
  label = "Exportar",
  disabled,
}: {
  options: ExportOption[];
  label?: string;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-10" disabled={disabled}>
          <Download className="size-4" aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Formatos disponíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const Icon = ICON[option.kind ?? "xlsx"];
          return (
            <DropdownMenuItem
              key={option.key}
              disabled={option.disabled}
              onSelect={() => {
                void option.onSelect();
              }}
            >
              <Icon className="size-4" aria-hidden />
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
