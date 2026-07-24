# Apont Auto — Automação Prisma4 (Playwright / CMD)

Automação em Node.js + Playwright para preencher e salvar Ordens de Serviço
no Prisma4 (cimogps.com.br), lendo os lotes gerados pelo painel
**Apontamento OS** do Apont Auto.

## 1. Requisitos

- Node.js 18 ou superior
- Windows, macOS ou Linux com acesso ao Prisma4
- Conta válida no Prisma4

## 2. Instalação (uma vez)

Abra o CMD/PowerShell na pasta descompactada e execute:

```bash
npm install
npx playwright install chromium
```

Copie `.env.example` para `.env` e preencha:

```
PRISMA_USUARIO=seu_usuario_prisma
PRISMA_SENHA=sua_senha_prisma
```

## 3. Gerar o lote no painel

1. Abra **Apont Auto → Apontamento OS**.
2. Cadastre colaboradores e monte a equipe.
3. Cole a lista de OS e defina data/hora de início e duração.
4. Clique em **Baixar entradas-os.txt** e salve o arquivo dentro
   desta pasta (substituindo o existente, se houver).

## 4. Executar

```bash
node meczada.js
```

Para forçar uma data de início diferente da que está no arquivo:

```bash
node meczada.js "09/07/2026 08:00"
```

A janela do Chromium abrirá, fará login e processará cada OS.
Ao final, uma tabela `console.table` mostra o status de cada OS.
Screenshots de depuração ficam em `debug/`.

## 5. Formato do `entradas-os.txt`

```
inicio: 09/07/2026 08:00

[LOTE]
categoria: refrigeracao
tecnicos: 969717, 420155
os: 1540453, 1540452, 1540240
```

Vários blocos `[LOTE]` podem ser encadeados no mesmo arquivo.
