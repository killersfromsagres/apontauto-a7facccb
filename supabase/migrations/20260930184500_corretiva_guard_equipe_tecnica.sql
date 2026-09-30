create or replace function public.corretiva_guard_equipe_tecnica()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  technical_text text;
begin
  technical_text := lower(
    coalesce(new.nome_os, '') || ' ' ||
    coalesce(new.equipamento, '') || ' ' ||
    coalesce(new.ativo, '')
  );

  -- Ferragens/fechamento de porta têm precedência. "Mola hidráulica da porta"
  -- continua sendo serviço de Chaveiro, não Hidráulica.
  if technical_text ~ '(\mfechaduras?\M|\mmiolo(s)? de fechadura\M|\mcadeados?\M|\mc[oó]pia(s)? (da|de|das|dos) chaves?\M|\mchaves? quebradas?\M|\mporta(s)? travadas?\M|\mporta(s)? trancadas?\M|\mtrincos?\M|\mlinguetas?\M|\mma[cç]anetas?\M|\mcilindros? de fechadura\M|\mmolas? hidr[aá]ulicas? (da|de) porta\M|\mmolas? de porta\M|\mdobradi[cç]as?\M|\mbarras? antip[aâ]nico\M|\mpuxadores?\M)' then
    new.equipe := 'Chaveiro';
    return new;
  end if;

  -- HVAC explícito vence palavras genéricas de energia ou vazamento.
  if technical_text ~ '(\mar condicionado\M|\msplits?\M|\mfancoils?\M|\mfan coils?\M|\mcassetes?\M|\mcondensadoras?\M|\mevaporadoras?\M|\mchillers?\M|\mvrf\M|\mvrv\M|\mhvac\M|\mcompressor(es)? frigor[ií]ficos?\M|\mg[aá]s refrigerante\M|\mserpentinas?\M|\mc[aâ]maras? frias?\M|\mfreezers?\M|\mgeladeiras?\M)' then
    new.equipe := 'Refrigeração';
    return new;
  end if;

  if technical_text ~ '(\ml[aâ]mpadas?\M|\mlumin[aá]rias?\M|\mrefletores?\M|\mtomadas?\M|\minterruptores?\M|\mdisjuntores?\M|\mqgbt\M|\mqdl\M|\mqdc\M|\mccm\M|\mquadro(s)? el[eé]tricos?\M|\mpain[eé]is? el[eé]tricos?\M|\mcurto circuito\M|\mfia[cç][aã]o el[eé]trica\M|\mcabeamento el[eé]trico\M|\mpontos? el[eé]tricos?\M|\materramento\M|\mreatores?\M|\mfotoc[eé]lulas?\M|\msensores? de presen[cç]a\M|\mnobreak\M|\mfus[ií]veis?\M|\mcontatores?\M|\mtransformadores?\M|\meletrodutos?\M|\minversores? de frequ[eê]ncia\M|\msem energia\M|\mfalta de energia\M)' then
    new.equipe := 'Elétrica';
    return new;
  end if;

  if technical_text ~ '(\mmict[oó]rios?\M|\mprivadas?\M|\mvasos? sanit[aá]rios?\M|\mbacias? sanit[aá]rias?\M|\mdescargas?\M|\mv[aá]lvulas? de descarga\M|\mtorneiras?\M|\msif[oõ]es?\M|\mralos?\M|\mesgoto\M|\mtubula[cç][oõ]es? de [aá]gua\M|\mencanamento\M|\mregistros? de [aá]gua\M|\mcaixa(s)? d.?[aá]gua\M|\mbombas? d.?[aá]gua\M|\mbocas? de lobo\M|\mcaixas? pluviais?\M|\mrede pluvial\M|\mefluente\M|\mpias?\M|\mcubas?\M|\mlavat[oó]rios?\M|\mbebedouros?\M|\mpurificadores? de [aá]gua\M|\mdesentup[a-z]*\M|\mentup[a-z]*\M|\mvazamento(s)?\M)' then
    new.equipe := 'Hidráulica';
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_corretiva_guard_equipe_tecnica on public.corretiva_os;
create trigger trg_corretiva_guard_equipe_tecnica
before insert or update of nome_os, equipamento, ativo, equipe
on public.corretiva_os
for each row
execute function public.corretiva_guard_equipe_tecnica();

-- Reprocessa somente chamados ainda operacionais. O trigger altera apenas
-- descrições com evidência técnica inequívoca e preserva as demais equipes.
update public.corretiva_os
set equipe = equipe
where lower(status::text) in ('aberta', 'em_andamento');
