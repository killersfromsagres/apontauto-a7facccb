import { useState } from "react";
import { ClipboardCheck, Fuel, History, Truck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FleetChecklist } from "@/features/fleet/pages/fleet-checklist";
import { FleetFuelings } from "@/features/fleet/pages/fleet-fuelings";
import { FleetHistory } from "@/features/fleet/pages/fleet-history";
import { FleetVehicles } from "@/features/fleet/pages/fleet-vehicles";

const TABS = [
  { value: "checklist", label: "Checklist", icon: ClipboardCheck },
  { value: "historico", label: "Histórico", icon: History },
  { value: "abastecimento", label: "Abastecimento", icon: Fuel },
  { value: "veiculos", label: "Veículos", icon: Truck },
];

export function FleetView() {
  const [tab, setTab] = useState("checklist");

  return (
    <PageShell
      eyebrow="Frota"
      title="Frota e Abastecimento"
      description="Checklist veicular com fotos, controle financeiro de abastecimentos e cadastro de veículos."
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="scrollbar-none flex w-full gap-1 overflow-x-auto rounded-2xl p-1">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="min-w-[6.5rem] flex-1 gap-1.5 rounded-xl py-2.5 text-xs data-[state=active]:shadow-elegant sm:text-sm"
            >
              <t.icon className="h-4 w-4 shrink-0" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="checklist">
          <FleetChecklist />
        </TabsContent>
        <TabsContent value="historico">
          <FleetHistory />
        </TabsContent>
        <TabsContent value="abastecimento">
          <FleetFuelings />
        </TabsContent>
        <TabsContent value="veiculos">
          <FleetVehicles />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
