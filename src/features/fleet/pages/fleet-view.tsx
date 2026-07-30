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
        <TabsList className="flex w-full overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-w-[7.5rem] flex-1 gap-1.5">
              <t.icon className="h-4 w-4" />
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
