import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fuel, Gauge, Plus, Truck, Wallet, ShieldAlert } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DataTable, KpiCard, EmptyState, type DataTableColumn } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/abastecimento")({
  head: () => ({
    meta: [
      { title: "Abastecimento — Frota | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Registro e controle de abastecimentos da frota: litros, custo, hodômetro e consumo médio por veículo.",
      },
      { property: "og:title", content: "Abastecimento — Frota | Apont Auto PCM" },
      {
        property: "og:description",
        content: "Controle de combustível, custo e consumo médio da frota operacional.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AbastecimentoPage,
});

type Veiculo = {
  id: string;
  placa: string;
  modelo: string | null;
  situacao: string;
};

type Abastecimento = {
  id: string;
  placa: string;
  data_abastecimento: string;
  motorista: string | null;
  hodometro: number | null;
  litros: number;
  valor_litro: number | null;
  valor_total: number | null;
  combustivel: string;
  posto: string | null;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AbastecimentoPage() {
  const { allowed, isLoading: loadingAccess } = useCanAccessModule("abastecimento", "read");
  const { allowed: canCreate } = useCanAccessModule("abastecimento", "create");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const veiculos = useQuery({
    queryKey: ["frota-veiculos"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("frota_veiculos")
        .select("id, placa, modelo, situacao")
        .order("placa");
      if (error) throw error;
      return (data ?? []) as Veiculo[];
    },
  });

  const abastecimentos = useQuery({
    queryKey: ["frota-abastecimentos"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("frota_abastecimentos")
        .select(
          "id, placa, data_abastecimento, motorista, hodometro, litros, valor_litro, valor_total, combustivel, posto",
        )
        .order("data_abastecimento", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Abastecimento[];
    },
  });

  const criar = useMutation({
    mutationFn: async (form: FormData) => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");

      const placa = String(form.get("placa") ?? "").trim().toUpperCase();
      const litros = Number(String(form.get("litros") ?? "").replace(",", "."));
      const valorLitro = Number(String(form.get("valor_litro") ?? "").replace(",", "."));
      const hodometro = Number(String(form.get("hodometro") ?? "").replace(",", "."));
      if (!placa) throw new Error("Informe a placa do veículo.");
      if (!Number.isFinite(litros) || litros <= 0) throw new Error("Litros inválidos.");

      const veiculo = veiculos.data?.find((v) => v.placa === placa) ?? null;
      const total =
        Number.isFinite(valorLitro) && valorLitro > 0
          ? Number((litros * valorLitro).toFixed(2))
          : null;

      const { error } = await supabase.from("frota_abastecimentos").insert({
        veiculo_id: veiculo?.id ?? null,
        placa,
        motorista: String(form.get("motorista") ?? "").trim() || null,
        hodometro: Number.isFinite(hodometro) && hodometro > 0 ? hodometro : null,
        litros,
        valor_litro: Number.isFinite(valorLitro) && valorLitro > 0 ? valorLitro : null,
        valor_total: total,
        combustivel: String(form.get("combustivel") ?? "diesel").trim() || "diesel",
        posto: String(form.get("posto") ?? "").trim() || null,
        cupom: String(form.get("cupom") ?? "").trim() || null,
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Abastecimento registrado.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["frota-abastecimentos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível registrar."),
  });

  const kpis = useMemo(() => {
    const rows = abastecimentos.data ?? [];
    const litros = rows.reduce((a, r) => a + Number(r.litros ?? 0), 0);
    const custo = rows.reduce((a, r) => a + Number(r.valor_total ?? 0), 0);
    const placas = new Set(rows.map((r) => r.placa)).size;
    return {
      litros,
      custo,
      placas,
      medio: litros > 0 ? custo / litros : 0,
      registros: rows.length,
    };
  }, [abastecimentos.data]);

  const columns: DataTableColumn<Abastecimento>[] = [
    {
      key: "placa",
      header: "Placa",
      mobilePrimary: true,
      sortValue: (r) => r.placa,
      cell: (r) => <span className="font-semibold tracking-wide">{r.placa}</span>,
      headClassName: "min-w-[96px]",
    },
    {
      key: "data",
      header: "Data",
      sortValue: (r) => r.data_abastecimento,
      cell: (r) =>
        new Date(r.data_abastecimento).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }),
      headClassName: "whitespace-nowrap",
    },
    {
      key: "motorista",
      header: "Motorista",
      sortValue: (r) => r.motorista ?? "",
      cell: (r) => r.motorista ?? "—",
    },
    {
      key: "hodometro",
      header: "Hodômetro",
      mobileHidden: true,
      sortValue: (r) => r.hodometro ?? 0,
      cell: (r) => (r.hodometro ? `${r.hodometro.toLocaleString("pt-BR")} km` : "—"),
    },
    {
      key: "litros",
      header: "Litros",
      sortValue: (r) => r.litros,
      cell: (r) => `${Number(r.litros).toLocaleString("pt-BR")} L`,
    },
    {
      key: "total",
      header: "Total",
      sortValue: (r) => r.valor_total ?? 0,
      cell: (r) => (r.valor_total ? brl(Number(r.valor_total)) : "—"),
    },
    {
      key: "posto",
      header: "Posto",
      mobileHidden: true,
      cell: (r) => r.posto ?? "—",
    },
  ];

  if (!loadingAccess && !allowed) {
    return (
      <PageShell
        eyebrow="Frota e Abastecimento"
        title="Acesso restrito"
        description="Este módulo é liberado apenas para os papéis de frota e gestão PCM."
      >
        <GlassCard variant="block" className="p-6">
          <EmptyState
            icon={<ShieldAlert className="size-6" />}
            title="Você não tem permissão para o módulo de Abastecimento"
            description="Peça ao administrador o papel Gestor de Frota ou Operador de Frota. Perfis de corretiva e climatização não têm acesso a dados de frota."
          />
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Frota e Abastecimento"
      title="Abastecimento"
      description="Registro de combustível por veículo, com custo, hodômetro e consumo consolidado da frota."
      actions={
        canCreate ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 gap-2">
                <Plus className="size-4" /> Novo abastecimento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Registrar abastecimento</DialogTitle>
                <DialogDescription>
                  Informe os dados do cupom fiscal. O valor total é calculado automaticamente.
                </DialogDescription>
              </DialogHeader>
              <form
                id="form-abastecimento"
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  criar.mutate(new FormData(e.currentTarget));
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="placa">Placa</Label>
                  <Input id="placa" name="placa" list="placas" required className="h-11 uppercase" />
                  <datalist id="placas">
                    {(veiculos.data ?? []).map((v) => (
                      <option key={v.id} value={v.placa}>
                        {v.modelo ?? ""}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="motorista">Motorista</Label>
                  <Input id="motorista" name="motorista" className="h-11" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="hodometro">Hodômetro (km)</Label>
                  <Input id="hodometro" name="hodometro" inputMode="decimal" className="h-11" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="combustivel">Combustível</Label>
                  <Input
                    id="combustivel"
                    name="combustivel"
                    defaultValue="diesel"
                    className="h-11"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="litros">Litros</Label>
                  <Input id="litros" name="litros" inputMode="decimal" required className="h-11" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="valor_litro">Valor por litro</Label>
                  <Input id="valor_litro" name="valor_litro" inputMode="decimal" className="h-11" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="posto">Posto</Label>
                  <Input id="posto" name="posto" className="h-11" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cupom">Cupom</Label>
                  <Input id="cupom" name="cupom" className="h-11" />
                </div>
              </form>
              <DialogFooter>
                <Button
                  type="submit"
                  form="form-abastecimento"
                  className="h-11 w-full"
                  disabled={criar.isPending}
                >
                  {criar.isPending ? "Salvando…" : "Salvar registro"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Litros no período"
          value={`${kpis.litros.toLocaleString("pt-BR")} L`}
          icon={<Fuel className="size-4" />}
          loading={abastecimentos.isLoading}
        />
        <KpiCard
          label="Custo total"
          value={brl(kpis.custo)}
          icon={<Wallet className="size-4" />}
          loading={abastecimentos.isLoading}
        />
        <KpiCard
          label="Preço médio / L"
          value={brl(kpis.medio)}
          icon={<Gauge className="size-4" />}
          loading={abastecimentos.isLoading}
        />
        <KpiCard
          label="Veículos abastecidos"
          value={kpis.placas}
          hint={`${kpis.registros} registros`}
          icon={<Truck className="size-4" />}
          loading={abastecimentos.isLoading}
        />
      </div>

      <GlassCard variant="block" className="mt-5 p-3 sm:p-5">
        <DataTable
          data={abastecimentos.data ?? []}
          columns={columns}
          rowKey={(r) => r.id}
          loading={abastecimentos.isLoading}
          emptyTitle="Nenhum abastecimento registrado"
          emptyDescription="Cadastre o primeiro abastecimento para acompanhar consumo e custo da frota."
        />
      </GlassCard>
    </PageShell>
  );
}
