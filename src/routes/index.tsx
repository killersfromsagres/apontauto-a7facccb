import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Apont Auto · Design System Premium" },
      {
        name: "description",
        content: "Evolução da identidade visual, arquitetura e gestão do Apont Auto.",
      },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const content = `2. NOVO DESIGN SYSTEM PREMIUM

2.1 Direção visual

Evolua a identidade visual para:

premium;

minimalista;

corporativa;

elegante;

moderna;

profissional;

inspirada na clareza dos produtos Apple;

com superfícies de vidro fosco;

sem excesso de neon;

sem aparência gamer;

sem brilhos exagerados;

sem animações contínuas desnecessárias.

Mantenha personalidade industrial discreta.

2.2 Liquid Glass controlado

Utilize vidro apenas em superfícies elevadas:

barra superior;

sidebar;

bottom navigation;

filtros;

cards principais;

dialogs;

drawers;

menus.

Padrão sugerido:

fundo translúcido;

backdrop-blur entre 16 e 28 px;

borda branca de baixa opacidade;

sombra suave;

brilho interno discreto;

transparência suficiente para mostrar profundidade;

contraste legível em light e dark mode.

Não aplique blur pesado em listas extensas ou em todos os elementos, pois isso prejudica desempenho.

2.3 Tokens

Centralize tokens para:

cores;

superfícies;

bordas;

blur;

raio;

espaçamento;

sombra;

elevação;

duração;

easing;

tipografia;

estados semânticos.

Use uma única identidade.

Modo escuro:

preto azulado;

grafite;

azul marinho;

branco frio;

azul como destaque;

ciano somente para informação;

verde para sucesso;

âmbar para atenção;

vermelho para risco.

Modo claro:

fundo branco gelo;

cinza azulado;

superfícies translúcidas;

texto grafite;

azul profissional.

2.4 Tipografia

Use tipografia limpa e legível.

Preferência:

Inter ou fonte de sistema semelhante a SF Pro;

números tabulares em KPIs;

hierarquia simples;

títulos menos exagerados;

textos mobile nunca menores que 12 px;

corpo entre 14 e 16 px;

títulos responsivos;

evitar excesso de caixa alta e espaçamento entre letras.

2.5 Botões

Padronize variantes:

Primary

Secondary

Glass

Ghost

Destructive

Success

Icon

Floating Action

Segmented Control

Requisitos:

altura mínima de 44 px no mobile;

feedback de toque;

loading interno;

ícone consistente;

estado desabilitado claro;

foco visível;

tooltip quando for apenas ícone;

sem saltos de layout;

confirmação para ações perigosas.

2.6 Campos

Melhore inputs, selects, date pickers, comboboxes e textareas:

label permanente;

ajuda opcional;

validação inline;

ícones funcionais;

preenchimento automático quando seguro;

teclado mobile adequado;

busca em selects longos;

mensagem de erro vinculada por aria-describedby;

estado de sucesso;

skeleton;

autocomplete;

scanner de QR quando aplicável.

2.7 Cards

Crie padrões:

KPI card;

action card;

entity card;

vehicle card;

OS card;

route card;

alert card;

empty state;

error state;

offline state.

Cards não devem levantar ou animar excessivamente ao passar o mouse. Use movimento discreto.

2.8 Movimento

Animações:

160 a 260 ms;

easing suave;

fade;

slide curto;

scale mínima;

transição entre tabs;

abertura de drawer;

skeleton shimmer discreto.

Respeite prefers-reduced-motion.

Não use glow pulsante contínuo fora de alertas realmente críticos.`;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/80">
        {content}
      </div>
      <div className="mt-12 flex justify-center">
        <a 
          href="/auth"
          className="rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          Acessar Sistema
        </a>
      </div>
    </div>
  );
}
