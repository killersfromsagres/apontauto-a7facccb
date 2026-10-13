# Preview da branch `fix/corretiva-novo-busca-avancada` sem tocar na principal

## Resposta curta
Eu não consigo trocar de branch nem fazer checkout de um commit daqui (não tenho acesso a git). O projeto sincroniza com GitHub pela branch conectada. Há dois caminhos seguros.

## Caminho A (recomendado): trocar a branch no editor
1. No editor Lovable, abra o seletor de branch (menu do projeto / GitHub) e escolha `fix/corretiva-novo-busca-avancada`.
2. O preview passa a refletir o código dessa branch (commit `1b2e235`). A branch principal e o commit `dd3216d` não são alterados.
3. NÃO clique em Publicar enquanto estiver nessa branch. A publicação usa o código atual do projeto.
4. Para voltar, selecione novamente a branch principal.
Observação: edições feitas no chat enquanto estiver na branch vão para ela, não para a principal.

## Caminho B: reproduzir só no preview, via rascunho
1. Eu crio um rascunho (draft) isolado do projeto.
2. Aplico no rascunho apenas o arquivo `src/routes/_authenticated/corretiva-novo.tsx` da branch (você cola o conteúdo ou me envia o diff do commit `1b2e235`).
3. Valido typecheck, testes e build no rascunho; a produção e a principal ficam intactas.
4. Só aceito o rascunho se você aprovar.

## Riscos
- Se a branch alterar outros arquivos além de `corretiva-novo.tsx`, o Caminho B exige o diff completo.
- Publicar pelo Lovable com a branch trocada pode enviar esse código à produção.

## Decisão necessária
Qual caminho: A (trocar branch no editor) ou B (rascunho com o arquivo/diff)?
