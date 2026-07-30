# Manual de Configuração do ImgBB (evidências)

O ImgBB hospeda as fotos. O banco guarda somente **URL e metadados**
(hash, tamanho, data, autor) — nunca o arquivo.

## Como está montado

```text
Celular → /api/imgbb-upload (nosso servidor) → ImgBB → URL salva em agua_fotos
```

- A chave `IMGBB_API_KEY` vive **apenas no servidor**. O navegador nunca a vê.
- O endpoint exige sessão válida e a permissão *Enviar evidências*.
- A imagem é redimensionada e comprimida no aparelho, fora da thread principal,
  segundo a qualidade e o lado máximo definidos nas Configurações.

## Configurar

1. Crie a chave em uma conta ImgBB.
2. Cadastre o segredo `IMGBB_API_KEY` no ambiente do projeto.
3. Em **Água → Configurações → Técnico**, confira o indicador: *configurado* ou
   *ausente*. O valor nunca é exibido.
4. Use **Testar integração** para enviar uma imagem de prova.

## Se o ImgBB falhar

- A foto **não se perde**: fica no aparelho e a fila tenta de novo com intervalo
  crescente.
- Depois do limite de tentativas, o item vai para revisão (dead-letter) e
  aparece no cartão de sincronização e no Painel Técnico.
- A parada só pode ser finalizada quando as fotos terminarem de subir.

## Retenção e privacidade

- Nenhum dado pessoal (CPF, documento) é enviado junto com a imagem; os
  registros são higienizados antes de sair do aparelho.
- A política de retenção de evidências é definida nas Configurações.
