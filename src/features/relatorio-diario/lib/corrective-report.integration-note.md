# Integração Corretiva Novo → Relatório Diário

O Relatório Diário considera `corretiva_os.status` concluído e usa `corretiva_os.fim` como data real de conclusão.

- A conclusão registrada no Corretiva Novo é a fonte oficial quando existe.
- `data_programada` identifica corretivas programadas diretamente no Corretiva Novo.
- Uma OS concluída sem programação semanal e sem `data_programada` é classificada como **Extra do dia**.
- Chaveiro, Pintura, Limpeza e outras equipes permanecem com o nome original da equipe e entram no agrupamento **Outros** entre Refrigeração e Elétrica no PDF.
- A ordem do report é: Civil/Hidráulica → Refrigeração → Outros → Elétrica.
