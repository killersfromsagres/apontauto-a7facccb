# Modelos 3D dos veículos e placas reais

## 1. Modelos 3D

O seletor usa `<model-viewer>` (Google) com **fallback estático** automático: se o modelo não carregar
ou o aparelho for fraco, é exibida a imagem do veículo — a tela nunca quebra.

### Formato
- Arquivo **`.glb`** (glTF binário), com textura embutida.
- Até **3 MB** por veículo (ideal 1–2 MB), no máximo ~50 mil triângulos.
- Eixo Y para cima, veículo centrado na origem, frente apontando para **+Z**.
- Inclua um `.webp`/`.jpg` de 1200×800 como imagem de fallback (`poster`).

### Onde colocar
1. Salve em `public/models/<prefixo>.glb` e o poster em `public/models/<prefixo>.webp`
   (ex.: `public/models/VW-01.glb`).
2. No cadastro do veículo (**Frota → Gestão → Editar**), preencha o campo de modelo com
   `/models/<prefixo>.glb` e o de imagem com `/models/<prefixo>.webp`.
3. Sem esses campos, o card usa a silhueta genérica por tipo (utilitário, van, caminhonete).

### Como obter
- Escaneamento por fotogrametria (Polycam, RealityScan) → exportar `.glb` → reduzir polígonos no Blender (*Decimate*).
- Ou usar modelo genérico do fabricante e aplicar a cor/adesivagem da frota.

### Teste
Abra `/abastecimento` no celular: gire o modelo com um dedo, dê zoom com dois. Se não girar, verifique
o tamanho do arquivo e o caminho.

## 2. Placas reais

- A **placa é editável** e o **prefixo é único** (não repete entre veículos).
- Aceita formato antigo (`ABC-1234`) e Mercosul (`ABC1D23`); a validação é automática.
- Para trocar a placa: **Frota → Gestão → Editar veículo → Placa → Salvar**.
  A alteração fica registrada na Trilha de Auditoria (valor anterior e novo).
- O prefixo aparece nos checklists, abastecimentos e relatórios; a placa aparece no cabeçalho do PDF.
- Ao substituir um veículo da frota, **não exclua** o registro antigo: marque como inativo para
  preservar checklists, abastecimentos e ocorrências históricas.
