import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, ExternalLink, Share2 } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pcm";
import { WhatsAppShareDialog } from "@/features/water-delivery/whatsapp/whatsapp-share-dialog";
import { FilaFotosAviso } from "@/features/water-delivery/components/fila-fotos-aviso";
import { hojeISO, listPontos, listVisitas, pontoLabel, VISITA_STATUS_LABEL } from "@/features/water-delivery/queries/api";
import { listFotos } from "@/features/water-delivery/offline/fotos";
import type { EvidenciaItem } from "@/features/water-delivery/whatsapp/whatsapp";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/evidencias")({
  component: Evidencias,
});

function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const TODOS = "__todos__";

function Evidencias() {
  const [de, setDe] = useState(diasAtras(13));
  const [ate, setAte] = useState(hojeISO());
  const [busca, setBusca] = useState("");
  const [predio, setPredio] = useState(TODOS);
  const [andar, setAndar] = useState(TODOS);
  const [espaco, setEspaco] = useState(TODOS);
  const [colaborador, setColaborador] = useState(TODOS);
  const [veiculo, setVeiculo] = useState(TODOS);
  const [status, setStatus] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [compartilhar, setCompartilhar] = useState(false);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", de, ate],
    queryFn: () => listVisitas(de, ate),
  });
  const fotosDb = useQuery({
    queryKey: ["agua", "fotos", de, ate],
    queryFn: () => listFotos(de, ate),
  });

  const porPonto = useMemo(
    () => new Map((pontos.data ?? []).map((p) => [p.id, p])),
    [pontos.data],
  );
  const porVisita = useMemo(
    () => new Map((visitas.data ?? []).map((v) => [v.id, v])),
    [visitas.data],
  );

  /**
   * O histórico une duas fontes: `agua_fotos` (metadados completos, item 10.1)
   * e a foto principal gravada na visita — assim nada some da galeria mesmo
   * para registros antigos ou já compartilhados no WhatsApp.
   */
  const registros = useMemo(() => {
    type Registro = {
      chave: string;
      url: string;
      thumb: string | null;
      data: string;
      predio: string;
      andar: string;
      espaco: string;
      nome: string;
      colaborador: string;
      veiculo: string;
      status: string;
      tipo: string;
      rotaId: string | null;
    };
    const vistos = new Set<string>();
    const out: Registro[] = [];

    for (const f of fotosDb.data ?? []) {
      const v = f.visita_id ? porVisita.get(f.visita_id) : undefined;
      const p = porPonto.get(f.ponto_id ?? v?.ponto_id ?? "");
      const meta = (f.metadados ?? {}) as Record<string, string | null>;
      out.push({
        chave: f.id,
        url: f.image_url,
        thumb: f.thumbnail_url,
        data: (v?.data ?? meta.data ?? f.enviada_em.slice(0, 10)) as string,
        predio: p?.predio ?? meta.predio ?? "Sem prédio",
        andar: p?.andar ?? meta.andar ?? "",
        espaco: p?.espaco ?? meta.espaco ?? "",
        nome: p ? pontoLabel(p) : (meta.predio ?? "Evidência"),
        colaborador: v?.responsavel ?? meta.colaborador ?? "",
        veiculo: v?.veiculo ?? meta.veiculo ?? "",
        status: v?.status ?? (f.filtro_solicitacao_id ? "filtro" : "—"),
        tipo: f.filtro_solicitacao_id ? "filtro" : f.tipo,
        rotaId: f.rota_id ?? v?.rota_id ?? null,
      });
      vistos.add(f.image_url);
    }

    for (const v of visitas.data ?? []) {
      const urls = [...(v.fotos ?? []), v.foto_url].filter(Boolean) as string[];
      for (const url of urls) {
        if (vistos.has(url)) continue;
        vistos.add(url);
        const p = porPonto.get(v.ponto_id);
        out.push({
          chave: `${v.id}-${url}`,
          url,
          thumb: null,
          data: v.data,
          predio: p?.predio ?? "Sem prédio",
          andar: p?.andar ?? "",
          espaco: p?.espaco ?? "",
          nome: p ? pontoLabel(p) : "Ponto removido",
          colaborador: v.responsavel ?? "",
          veiculo: v.veiculo ?? "",
          status: v.status,
          tipo: "entrega",
          rotaId: v.rota_id ?? null,
        });
      }
    }

    return out.sort((a, b) => b.data.localeCompare(a.data));
  }, [fotosDb.data, visitas.data, porPonto, porVisita]);

  const opcoes = useMemo(() => {
    const uniq = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort();
    return {
      predios: uniq(registros.map((r) => r.predio)),
      andares: uniq(registros.map((r) => r.andar)),
      espacos: uniq(registros.map((r) => r.espaco)),
      colaboradores: uniq(registros.map((r) => r.colaborador)),
      veiculos: uniq(registros.map((r) => r.veiculo)),
      status: uniq(registros.map((r) => r.status)),
      tipos: uniq(registros.map((r) => r.tipo)),
    };
  }, [registros]);

  const fotos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return registros.filter(
      (r) =>
        (!termo || r.nome.toLowerCase().includes(termo)) &&
        (predio === TODOS || r.predio === predio) &&
        (andar === TODOS || r.andar === andar) &&
        (espaco === TODOS || r.espaco === espaco) &&
        (colaborador === TODOS || r.colaborador === colaborador) &&
        (veiculo === TODOS || r.veiculo === veiculo) &&
        (status === TODOS || r.status === status) &&
        (tipo === TODOS || r.tipo === tipo),
    );
  }, [registros, busca, predio, andar, espaco, colaborador, veiculo, status, tipo]);

  const selecionadas = useMemo(
    () => (selecao.size ? fotos.filter((f) => selecao.has(f.chave)) : fotos),
    [fotos, selecao],
  );

  const itens: EvidenciaItem[] = useMemo(
    () => selecionadas.map((f) => ({ predio: f.predio, parada: f.nome, url: f.url })),
    [selecionadas],
  );

  const resumo = useMemo(() => {
    const visitasAlvo = Array.from(
      new Set(
        selecionadas
          .map((f) => porVisita.get(f.chave.split("-")[0]))
          .filter(Boolean),
      ),
    );
    const base = visitas.data ?? [];
    const doDia = base.filter((v) => selecionadas.some((f) => f.data === v.data));
    const alvo = visitasAlvo.length ? visitasAlvo : doDia;
    return {
      data: selecionadas[0]?.data ?? ate,
      colaboradorPrincipal: selecionadas[0]?.colaborador || null,
      veiculoPrefixo: selecionadas[0]?.veiculo || null,
      veiculoPlaca: null,
      podeVerPlaca: false,
      concluidas: alvo.filter((v) => v!.status === "concluida" || v!.status === "parcial").length,
      previstas: alvo.length || selecionadas.length,
      bagsEntregues: alvo.reduce((a, v) => a + (v!.bags_entregues ?? 0), 0),
      ocorrencias: alvo.filter(
        (v) => v!.status !== "concluida" && v!.status !== "parcial" && v!.status !== "pendente",
      ).length,
    };
  }, [selecionadas, visitas.data, porVisita, ate]);

  const alternar = (id: string) => {
    setSelecao((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtro = (
    rotulo: string,
    valor: string,
    setValor: (v: string) => void,
    lista: string[],
    rotuloTodos: string,
  ) => (
    <div className="space-y-1">
      <Label>{rotulo}</Label>
      <Select value={valor} onValueChange={setValor}>
        <SelectTrigger className="min-h-[44px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{rotuloTodos}</SelectItem>
          {lista.map((v) => (
            <SelectItem key={v} value={v}>
              {rotulo === "Status" ? (VISITA_STATUS_LABEL as any)[v] ?? v : v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <FilaFotosAviso />

      <GlassCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ev-de">De</Label>
            <Input id="ev-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-ate">Até</Label>
            <Input id="ev-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-busca">Buscar ponto</Label>
            <Input
              id="ev-busca"
              placeholder="Prédio, andar ou espaço"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtro("Prédio", predio, setPredio, opcoes.predios, "Todos os prédios")}
          {filtro("Andar", andar, setAndar, opcoes.andares, "Todos os andares")}
          {filtro("Espaço", espaco, setEspaco, opcoes.espacos, "Todos os espaços")}
          {filtro(
            "Colaborador",
            colaborador,
            setColaborador,
            opcoes.colaboradores,
            "Todos os colaboradores",
          )}
          {filtro("Veículo", veiculo, setVeiculo, opcoes.veiculos, "Todos os veículos")}
          {filtro("Status", status, setStatus, opcoes.status, "Todos os status")}
          {filtro("Origem", tipo, setTipo, opcoes.tipos, "Entregas e filtros")}
        </div>
      </GlassCard>

      {fotos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setCompartilhar(true)}>
            <Share2 className="mr-1.5 h-4 w-4" /> Enviar evidências ao WhatsApp
          </Button>
          <p className="text-xs text-muted-foreground">
            {selecao.size
              ? `${selecao.size} selecionada(s)`
              : `Todas as ${fotos.length} do filtro atual`}
          </p>
          {selecao.size ? (
            <Button size="sm" variant="ghost" onClick={() => setSelecao(new Set())}>
              Limpar seleção
            </Button>
          ) : null}
        </div>
      ) : null}

      {visitas.isLoading || fotosDb.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : fotos.length === 0 ? (
        <EmptyState
          icon={<Camera className="size-5" />}
          title="Nenhuma evidência no período"
          description="As fotos enviadas na Rota do Dia aparecem aqui automaticamente."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((f) => (
            <div
              key={f.chave}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 transition-colors hover:border-primary/50"
            >
              <div className="absolute left-2 top-2 z-10 rounded-md bg-background/80 p-1 backdrop-blur">
                <Checkbox
                  checked={selecao.has(f.chave)}
                  onCheckedChange={() => alternar(f.chave)}
                  aria-label={`Selecionar evidência de ${f.nome}`}
                />
              </div>
              <a href={f.url} target="_blank" rel="noreferrer">
                <div className="aspect-square overflow-hidden bg-muted/30">
                  <img
                    src={f.thumb || f.url}
                    alt={`Evidência — ${f.nome}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="space-y-0.5 p-2.5">
                  <p className="truncate text-xs font-medium">{f.nome}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {f.data.split("-").reverse().join("/")} ·{" "}
                    {(VISITA_STATUS_LABEL as any)[f.status] ?? f.status}
                    <ExternalLink className="h-3 w-3" />
                  </p>
                  {f.colaborador ? (
                    <p className="truncate text-[11px] text-muted-foreground">{f.colaborador}</p>
                  ) : null}
                </div>
              </a>
            </div>
          ))}
        </div>
      )}

      <WhatsAppShareDialog
        aberto={compartilhar}
        onOpenChange={setCompartilhar}
        resumo={resumo}
        itens={itens}
        escopoTipo="selecao"
      />
    </div>
  );
}
