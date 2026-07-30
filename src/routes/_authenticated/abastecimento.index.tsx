import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  Fuel,
  Gauge,
  Loader2,
  ShieldAlert,
  Truck,
  Wallet,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, EmptyState, KpiCard, type DataTableColumn } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { VehicleCard3D } from "@/components/frota/vehicle-card-3d";
import { VehicleEditDialog } from "@/components/frota/vehicle-edit-dialog";
import { formatPlate } from "@/lib/frota/plate";
import {
  computeConsumption,
  createFueling,
  detectFuelingAnomalies,
  getChecklistDetail,
  listChecklists,
  listFuelings,
  listOccurrences,
  listVehicles,
  vehicleLabel,
  VEHICLE_STATUS_LABEL,
  type Checklist,
  type Fueling,
  type Occurrence,
  type Vehicle,
} from "@/lib/frota/api";
import { SEVERITY_LABEL } from "@/lib/frota/checklist-catalog";
import { maskCpf } from "@/lib/frota/cpf";

const ChecklistWizard = lazy(() =>
  import("@/components/frota/checklist-wizard").then((m) => ({ default: m.ChecklistWizard })),
);

export const Route = createFileRoute("/_authenticated/abastecimento/")({
  head: () => ({
    meta: [
      { title: "Frota, Checklist e Abastecimento | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Gestão de frota com checklist digital fotográfico, abastecimentos, ocorrências e indicadores de consumo por veículo.",
      },
      { property: "og:title", content: "Frota, Checklist e Abastecimento | Apont Auto PCM" },
      {
        property: "og:description",
        content:
          "Checklist digital com protocolo, evidências fotográficas, controle de combustível e indicadores da frota.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FrotaPage,
});

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function FrotaPage() {
  const { allowed, isLoading } = useCanAccessModule("abastecimento", "read");
  const { allowed: canWrite } = useCanAccessModule("abastecimento", "create");
  const { allowed: canEditVehicle } = useCanAccessModule("abastecimento", "update");
  const [tab, setTab] = useState("visao");

  const vehicles = useQuery({
    queryKey: ["frota", "vehicles"],
    queryFn: listVehicles,
    enabled: allowed,
  });
  const fuelings = useQuery({
    queryKey: ["frota", "fuelings"],
    queryFn: () => listFuelings(),
    enabled: allowed,
  });
  const checklists = useQuery({
    queryKey: ["frota", "checklists"],
    queryFn: () => listChecklists(),
    enabled: allowed,
  });
  const occurrences = useQuery({
    queryKey: ["frota", "occurrences"],
    queryFn: listOccurrences,
    enabled: allowed,
  });

  if (isLoading) {
    return (
      <PageShell title="Frota" description="Carregando permissões…">
        <div className="h-40 animate-pulse rounded-3xl bg-muted/20" />
      </PageShell>
    );
  }

  if (!allowed) {
    return (
      <PageShell title="Frota" eyebrow="Acesso restrito">
        <EmptyState
          icon={<ShieldAlert className="size-5" />}
          title="Você não tem acesso ao módulo de frota"
          description="Solicite a liberação ao administrador do PCM."
        />
      </PageShell>
    );
  }

  const list = vehicles.data ?? [];
  const fuel = fuelings.data ?? [];
  const chks = checklists.data ?? [];
  const occ = (occurrences.data ?? []).filter((o) => o.state !== "encerrada");

  const monthFuel = fuel.filter((f) => new Date(f.fueled_at).getMonth() === new Date().getMonth());
  const monthCost = monthFuel.reduce((a, f) => a + Number(f.total_value ?? 0), 0);
  const blocked = list.filter((v) => v.status === "bloqueado").length;
  const avgScore = chks.length
    ? Math.round(chks.reduce((a, c) => a + Number(c.integrity_score ?? 0), 0) / chks.length)
    : 0;

  return (
    <PageShell
      eyebrow="Operação · Frota"
      title="Frota, Checklist e Abastecimento"
      description="Checklist digital com evidências fotográficas e protocolo, controle de combustível, ocorrências e indicadores de consumo."
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="visao" className="min-h-[40px]">
              Visão geral
            </TabsTrigger>
            <TabsTrigger value="checklist" className="min-h-[40px]">
              Novo checklist
            </TabsTrigger>
            <TabsTrigger value="abastecer" className="min-h-[40px]">
              Abastecimento
            </TabsTrigger>
            <TabsTrigger value="veiculos" className="min-h-[40px]">
              Veículos
            </TabsTrigger>
            <TabsTrigger value="historico" className="min-h-[40px]">
              Histórico
            </TabsTrigger>
            <TabsTrigger value="ocorrencias" className="min-h-[40px]">
              Ocorrências
            </TabsTrigger>
            <TabsTrigger value="indicadores" className="min-h-[40px]">
              Indicadores
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="visao" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Veículos ativos"
              value={list.filter((v) => v.status !== "inativo").length}
              icon={<Truck className="size-4" />}
              loading={vehicles.isLoading}
            />
            <KpiCard
              label="Custo no mês"
              value={money(monthCost)}
              hint={`${monthFuel.length} abastecimentos`}
              icon={<Wallet className="size-4" />}
              loading={fuelings.isLoading}
            />
            <KpiCard
              label="Score médio de checklist"
              value={`${avgScore}/100`}
              icon={<ClipboardCheck className="size-4" />}
              loading={checklists.isLoading}
            />
            <KpiCard
              label="Bloqueios / ocorrências"
              value={`${blocked} / ${occ.length}`}
              icon={<AlertTriangle className="size-4" />}
              loading={occurrences.isLoading}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((v) => (
              <VehicleCard3D
                key={v.id}
                vehicle={v}
                active={false}
                onSelect={() => setTab("veiculos")}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="checklist">
          {canWrite ? (
            <Suspense fallback={<div className="h-48 animate-pulse rounded-3xl bg-muted/20" />}>
              <ChecklistWizard vehicles={list.filter((v) => v.status !== "inativo")} />
            </Suspense>
          ) : (
            <EmptyState
              title="Sem permissão para registrar checklist"
              description="Seu perfil é somente leitura neste módulo."
            />
          )}
        </TabsContent>

        <TabsContent value="abastecer">
          <FuelingTab vehicles={list} fuelings={fuel} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="veiculos">
          <VehiclesTab
            vehicles={list}
            fuelings={fuel}
            checklists={chks}
            canWrite={canEditVehicle}
          />
        </TabsContent>

        <TabsContent value="historico">
          <HistoryTab checklists={chks} vehicles={list} loading={checklists.isLoading} />
        </TabsContent>

        <TabsContent value="ocorrencias">
          <OccurrencesTab
            occurrences={occurrences.data ?? []}
            vehicles={list}
            loading={occurrences.isLoading}
          />
        </TabsContent>

        <TabsContent value="indicadores">
          <IndicatorsTab vehicles={list} fuelings={fuel} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

// ------------------------------------------------------------- abastecimento

function FuelingTab({
  vehicles,
  fuelings,
  canWrite,
}: {
  vehicles: Vehicle[];
  fuelings: Fueling[];
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [vehicleId, setVehicleId] = useState("");
  const [fueledAt, setFueledAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [driverName, setDriverName] = useState("");
  const [odometerKm, setOdometerKm] = useState("");
  const [liters, setLiters] = useState("");
  const [price, setPrice] = useState("");
  const [station, setStation] = useState("");
  const [receipt, setReceipt] = useState("");
  const [fullTank, setFullTank] = useState(true);
  const [notes, setNotes] = useState("");

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const input = {
    vehicleId,
    fueledAt: new Date(fueledAt).toISOString(),
    driverName,
    odometerKm: Number(odometerKm || 0),
    fuelType: vehicle?.fuel_type ?? "flex",
    liters: Number(liters.replace(",", ".") || 0),
    pricePerLiter: Number(price.replace(",", ".") || 0),
    station,
    receiptNumber: receipt,
    fullTank,
    notes,
  };
  const anomalies = vehicleId ? detectFuelingAnomalies(input, vehicle, fuelings) : [];
  const total = input.liters * input.pricePerLiter;

  const save = useMutation({
    mutationFn: () => createFueling(input, anomalies),
    onSuccess: () => {
      toast.success("Abastecimento registrado");
      qc.invalidateQueries({ queryKey: ["frota"] });
      setLiters("");
      setPrice("");
      setReceipt("");
      setNotes("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao registrar"),
  });

  const columns: DataTableColumn<Fueling>[] = [
    {
      key: "data",
      header: "Data",
      mobilePrimary: true,
      cell: (r) => <span className="whitespace-nowrap">{dt(r.fueled_at)}</span>,
      sortValue: (r) => r.fueled_at,
    },
    {
      key: "veiculo",
      header: "Veículo",
      cell: (r) => vehicles.find((v) => v.id === r.vehicle_id)?.prefix ?? "—",
    },
    {
      key: "litros",
      header: "Litros",
      cell: (r) => Number(r.liters).toFixed(2),
      sortValue: (r) => Number(r.liters),
    },
    {
      key: "km",
      header: "Hodômetro",
      cell: (r) => `${Number(r.odometer_km).toLocaleString("pt-BR")} km`,
    },
    {
      key: "total",
      header: "Total",
      cell: (r) => money(Number(r.total_value ?? 0)),
      sortValue: (r) => Number(r.total_value ?? 0),
    },
    {
      key: "anomalias",
      header: "Divergências",
      mobileHidden: true,
      cell: (r) =>
        r.anomalies?.length ? (
          <span className="text-xs text-amber-300">{r.anomalies.join(" · ")}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {canWrite && (
        <GlassCard className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Veículo</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.prefix} — {vehicleLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data e hora</Label>
            <Input
              type="datetime-local"
              className="min-h-[44px] text-base"
              value={fueledAt}
              onChange={(e) => setFueledAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Motorista</Label>
            <Input
              className="min-h-[44px] text-base"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hodômetro (km)</Label>
            <Input
              inputMode="numeric"
              className="min-h-[44px] text-base"
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Litros</Label>
            <Input
              inputMode="decimal"
              className="min-h-[44px] text-base"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Preço por litro</Label>
            <Input
              inputMode="decimal"
              className="min-h-[44px] text-base"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Posto</Label>
            <Input
              className="min-h-[44px] text-base"
              value={station}
              onChange={(e) => setStation(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cupom / nota</Label>
            <Input
              className="min-h-[44px] text-base"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={fullTank} onCheckedChange={(v) => setFullTank(v === true)} />
            Tanque completo
          </label>

          <div className="flex items-center rounded-2xl border border-border/50 px-3 py-2 text-sm">
            Total estimado:&nbsp;
            <strong className="text-primary">{money(Number.isFinite(total) ? total : 0)}</strong>
          </div>

          <div className="sm:col-span-2 lg:col-span-3 space-y-2">
            {anomalies.length > 0 && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {anomalies.join(" · ")} — o registro será salvo sinalizado para auditoria.
                </span>
              </div>
            )}
            <Button
              className="min-h-[48px] w-full"
              disabled={!vehicleId || input.liters <= 0 || input.odometerKm <= 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Fuel className="mr-2 h-4 w-4" />
              )}
              Registrar abastecimento
            </Button>
          </div>
        </GlassCard>
      )}

      <DataTable
        data={fuelings}
        columns={columns}
        rowKey={(r) => r.id}
        emptyTitle="Nenhum abastecimento registrado"
        pageSize={25}
      />
    </div>
  );
}

// ------------------------------------------------------------------ veículos

function VehiclesTab({
  vehicles,
  fuelings,
  checklists,
  canWrite,
}: {
  vehicles: Vehicle[];
  fuelings: Fueling[];
  checklists: Checklist[];
  canWrite: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(vehicles[0]?.id ?? null);
  const vehicle = vehicles.find((v) => v.id === selected) ?? vehicles[0];
  const consumption = useMemo(() => computeConsumption(fuelings), [fuelings]);

  if (!vehicle) return <EmptyState title="Nenhum veículo cadastrado" />;
  const row = consumption.get(vehicle.id);
  const last = checklists.filter((c) => c.vehicle_id === vehicle.id)[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {vehicles.map((v) => (
          <VehicleCard3D
            key={v.id}
            vehicle={v}
            active={v.id === vehicle.id}
            onSelect={(s) => setSelected(s.id)}
          />
        ))}
      </div>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              {vehicle.prefix}
            </p>
            <h3 className="font-display text-xl font-bold">{vehicleLabel(vehicle)}</h3>
            <p className="text-sm text-muted-foreground">
              {formatPlate(vehicle.plate) || "sem placa"} · {vehicle.color ?? "cor não informada"} ·{" "}
              {VEHICLE_STATUS_LABEL[vehicle.status]}
            </p>
          </div>
          {canWrite && <VehicleEditDialog key={vehicle.id} vehicle={vehicle} />}
        </div>

        {vehicle.block_reason && (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            Motivo do bloqueio: {vehicle.block_reason}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Hodômetro"
            value={`${Number(vehicle.current_odometer_km).toLocaleString("pt-BR")} km`}
          />
          <Metric
            label="Consumo médio"
            value={row?.kmPerLiter ? `${row.kmPerLiter.toFixed(2)} km/L` : "—"}
          />
          <Metric label="Custo por km" value={row?.costPerKm ? money(row.costPerKm) : "—"} />
          <Metric label="Último checklist" value={last ? `${last.integrity_score}/100` : "—"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Combustível" value={vehicle.fuel_type} />
          <Metric
            label="Ano fab./mod."
            value={`${vehicle.year_manufacture ?? "—"}/${vehicle.year_model ?? "—"}`}
          />
          <Metric label="Chassi (final)" value={vehicle.chassis_last6 ?? "—"} />
          <Metric
            label="Checklists"
            value={String(checklists.filter((c) => c.vehicle_id === vehicle.id).length)}
          />
        </div>
      </GlassCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 p-3">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

// ----------------------------------------------------------------- histórico

function HistoryTab({
  checklists,
  vehicles,
  loading,
}: {
  checklists: Checklist[];
  vehicles: Vehicle[];
  loading: boolean;
}) {
  const [open, setOpen] = useState<Checklist | null>(null);
  const detail = useQuery({
    queryKey: ["frota", "checklist", open?.id],
    enabled: !!open,
    queryFn: () => getChecklistDetail(open!.id),
  });

  const columns: DataTableColumn<Checklist>[] = [
    {
      key: "protocolo",
      header: "Protocolo",
      mobilePrimary: true,
      cell: (r) => <span className="font-mono text-xs">{r.protocol}</span>,
    },
    {
      key: "data",
      header: "Data",
      cell: (r) => <span className="whitespace-nowrap">{dt(r.submitted_at)}</span>,
      sortValue: (r) => r.submitted_at,
    },
    { key: "tipo", header: "Tipo", cell: (r) => r.checklist_type },
    {
      key: "score",
      header: "Score",
      cell: (r) => `${r.integrity_score}/100`,
      sortValue: (r) => r.integrity_score,
    },
    {
      key: "status",
      header: "Situação",
      cell: (r) => (
        <span
          className={
            r.critical_block
              ? "rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-xs text-rose-200"
              : "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-200"
          }
        >
          {r.critical_block ? "Bloqueio crítico" : r.overall_status}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        data={checklists}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        onRowClick={(r) => setOpen(r)}
        emptyTitle="Nenhum checklist registrado"
        pageSize={25}
      />

      {open && (
        <GlassCard className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-bold">Detalhe do checklist</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                disabled={!detail.data}
                onClick={async () => {
                  const { exportChecklistPdf } = await import("@/lib/frota/pdf");
                  await exportChecklistPdf({
                    checklist: open,
                    vehicle: vehicles.find((v) => v.id === open.vehicle_id),
                    ...detail.data!,
                  });
                }}
              >
                <Download className="mr-1 h-4 w-4" /> PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[40px]"
                onClick={() => setOpen(null)}
              >
                Fechar
              </Button>
            </div>
          </div>

          {detail.isLoading && <div className="h-24 animate-pulse rounded-2xl bg-muted/20" />}
          {detail.data && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Protocolo" value={open.protocol} />
                <Metric label="Hodômetro" value={`${open.odometer_km} km`} />
                <Metric label="Score" value={`${open.integrity_score}/100`} />
              </div>

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Colaboradores
                </p>
                {detail.data.collaborators.map((c: any) => (
                  <p key={c.id} className="text-sm">
                    {c.full_name_snapshot} · CPF {maskCpf(c.cpf_last4)} · {c.role_in_checklist}
                  </p>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {detail.data.items
                  .filter((i: any) => i.status === "nao_conforme")
                  .map((i: any) => (
                    <div
                      key={i.id}
                      className="rounded-2xl border border-rose-400/30 bg-rose-500/5 p-3 text-sm"
                    >
                      <p className="font-semibold">{i.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {SEVERITY_LABEL[(i.severity ?? "media") as keyof typeof SEVERITY_LABEL]}
                        {i.notes ? ` — ${i.notes}` : ""}
                      </p>
                    </div>
                  ))}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {detail.data.photos.map((p: any) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer noopener">
                    <img
                      src={p.url}
                      alt={p.photo_slot}
                      loading="lazy"
                      className="h-28 w-full rounded-xl object-cover"
                    />
                    <span className="text-[11px] text-muted-foreground">{p.photo_slot}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}

// --------------------------------------------------------------- ocorrências

function OccurrencesTab({
  occurrences,
  vehicles,
  loading,
}: {
  occurrences: Occurrence[];
  vehicles: Vehicle[];
  loading: boolean;
}) {
  const columns: DataTableColumn<Occurrence>[] = [
    { key: "desc", header: "Ocorrência", mobilePrimary: true, cell: (r) => r.description },
    {
      key: "veiculo",
      header: "Veículo",
      cell: (r) => vehicles.find((v) => v.id === r.vehicle_id)?.prefix ?? "—",
    },
    {
      key: "sev",
      header: "Severidade",
      cell: (r) => SEVERITY_LABEL[(r.severity ?? "media") as keyof typeof SEVERITY_LABEL],
    },
    { key: "estado", header: "Estado", cell: (r) => r.state },
    {
      key: "data",
      header: "Aberta em",
      cell: (r) => <span className="whitespace-nowrap">{dt(r.opened_at)}</span>,
      sortValue: (r) => r.opened_at,
    },
  ];
  return (
    <DataTable
      data={occurrences}
      columns={columns}
      rowKey={(r) => r.id}
      loading={loading}
      emptyTitle="Nenhuma ocorrência aberta"
      pageSize={25}
    />
  );
}

// -------------------------------------------------------------- indicadores

function IndicatorsTab({ vehicles, fuelings }: { vehicles: Vehicle[]; fuelings: Fueling[] }) {
  const consumption = useMemo(() => computeConsumption(fuelings), [fuelings]);
  const rows = vehicles.map((v) => ({ vehicle: v, row: consumption.get(v.id) }));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(({ vehicle, row }) => (
        <GlassCard key={vehicle.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs tracking-widest text-primary">{vehicle.prefix}</span>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="truncate text-sm font-semibold">{vehicleLabel(vehicle)}</p>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="km/L" value={row?.kmPerLiter ? row.kmPerLiter.toFixed(2) : "—"} />
            <Metric label="R$/km" value={row?.costPerKm ? money(row.costPerKm) : "—"} />
            <Metric label="Litros" value={row ? row.liters.toFixed(1) : "—"} />
            <Metric label="Gasto total" value={row ? money(row.cost) : "—"} />
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
