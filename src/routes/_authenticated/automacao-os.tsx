import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Gauge, PlusCircle, Users, History, Settings } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { PrismaTabNav, type PrismaTabKey } from "@/components/prisma-panel/tab-nav";
import { DashboardTab } from "@/components/prisma-panel/dashboard-tab";
import { NovoLoteTab } from "@/components/prisma-panel/novo-lote-tab";
import { TecnicosTab } from "@/components/prisma-panel/tecnicos-tab";
import { ExecucoesTab } from "@/components/prisma-panel/execucoes-tab";
import { ConfigTab } from "@/components/prisma-panel/config-tab";
import { usePrismaRealtime } from "@/lib/prisma-panel/hooks";

export const Route = createFileRoute("/_authenticated/automacao-os")({
  head: () => ({
    meta: [
      { title: "Painel Prisma — Apont Auto" },
      { name: "description", content: "Cadastro e acompanhamento em tempo real de lotes de OS para automação no Prisma." },
      { property: "og:title", content: "Painel Prisma — Apont Auto" },
      { property: "og:description", content: "Painel de controle CRUD para automação de apontamentos Prisma via extensão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PainelPrismaPage,
});

const TABS: { key: PrismaTabKey; label: string; icon: typeof Gauge }[] = [
  { key: "dashboard", label: "Dashboard", icon: Gauge },
  { key: "novo", label: "Novo lote", icon: PlusCircle },
  { key: "tecnicos", label: "Técnicos & Equipes", icon: Users },
  { key: "execucoes", label: "Execuções", icon: History },
  { key: "config", label: "Configurações", icon: Settings },
];

function PainelPrismaPage() {
  const [tab, setTab] = useState<PrismaTabKey>("dashboard");
  usePrismaRealtime();

  return (
    <PageShell
      title="Painel Prisma"
      description="Cadastre lotes de OS e acompanhe a execução ao vivo. A automação roda na extensão do navegador."
    >
      <div className="space-y-5">
        <PrismaTabNav active={tab} onChange={setTab} items={TABS} />
        {tab === "dashboard" && <DashboardTab onNovoLote={() => setTab("novo")} />}
        {tab === "novo" && <NovoLoteTab onSaved={() => setTab("dashboard")} />}
        {tab === "tecnicos" && <TecnicosTab />}
        {tab === "execucoes" && <ExecucoesTab />}
        {tab === "config" && <ConfigTab />}
      </div>
    </PageShell>
  );
}
