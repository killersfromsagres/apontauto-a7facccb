-- Monitoramento multifonte de clima/chuva para Taludes.
-- Mantém o cron existente que chama public.capture_open_meteo_weather() a cada 5 minutos,
-- mas amplia a captura para condição atual de São Bernardo + METAR SBSP e cria eventos automáticos.

create or replace function public.capture_open_meteo_weather()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_response extensions.http_response;
  v_json jsonb;
  v_current jsonb;
  v_obs_at timestamptz;
  v_mm numeric := 0;
  v_code integer;
  v_temp numeric;
  v_humidity numeric;
  v_wind numeric;
  v_wttr_response extensions.http_response;
  v_wttr jsonb;
  v_wttr_current jsonb;
  v_wttr_desc text := '';
  v_wttr_mm numeric := 0;
  v_wttr_code integer := 3;
  v_wttr_wet boolean := false;
  v_metar_response extensions.http_response;
  v_metar jsonb;
  v_metar_row jsonb;
  v_metar_raw text := '';
  v_metar_at timestamptz;
  v_metar_wet boolean := false;
  v_metar_temp numeric;
  v_wet boolean := false;
  v_intensity text := null;
  v_sources text[] := '{}'::text[];
  v_confidence numeric := 0.6;
  v_event_id uuid;
begin
  begin
    v_response := extensions.http_get('https://api.open-meteo.com/v1/forecast?latitude=-23.7246&longitude=-46.5648&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,rain,showers,precipitation&timezone=America%2FSao_Paulo');
    if v_response.status < 200 or v_response.status >= 300 then raise exception 'Open-Meteo HTTP %', v_response.status; end if;
    v_json := v_response.content::jsonb;
    v_current := v_json->'current';
    v_obs_at := ((v_current->>'time')::timestamp at time zone 'America/Sao_Paulo');
    v_mm := greatest(coalesce((v_current->>'precipitation')::numeric,0),coalesce((v_current->>'rain')::numeric,0),coalesce((v_current->>'showers')::numeric,0));
    v_code := nullif(v_current->>'weather_code','')::integer;
    v_temp := nullif(v_current->>'temperature_2m','')::numeric;
    v_humidity := nullif(v_current->>'relative_humidity_2m','')::numeric;
    v_wind := nullif(v_current->>'wind_speed_10m','')::numeric;
    insert into public.weather_observations(source,source_station_id,data_type,observed_at,latitude,longitude,distance_km,precipitation_mm,rain_rate_mm_h,weather_code,temperature_c,humidity_pct,wind_kmh,confidence,raw_payload)
    values('open-meteo','model-demarchi','previsao',v_obs_at,-23.7246,-46.5648,0,v_mm,v_mm,v_code,v_temp,v_humidity,v_wind,0.6,v_current)
    on conflict (source,observed_at,(coalesce(source_station_id,''))) do update set precipitation_mm=excluded.precipitation_mm,rain_rate_mm_h=excluded.rain_rate_mm_h,weather_code=excluded.weather_code,temperature_c=excluded.temperature_c,humidity_pct=excluded.humidity_pct,wind_kmh=excluded.wind_kmh,raw_payload=excluded.raw_payload;
    insert into public.weather_source_health(source,last_run_at,last_success_at,latency_ms,consecutive_errors,state,last_error,updated_at)
    values('open-meteo',now(),now(),greatest(0,extract(milliseconds from clock_timestamp()-v_started)::int),0,'ok',null,now())
    on conflict(source) do update set last_run_at=excluded.last_run_at,last_success_at=excluded.last_success_at,latency_ms=excluded.latency_ms,consecutive_errors=0,state='ok',last_error=null,updated_at=now();
  exception when others then
    insert into public.weather_source_health(source,last_run_at,consecutive_errors,state,last_error,updated_at)
    values('open-meteo',now(),1,'falha',left(sqlerrm,300),now())
    on conflict(source) do update set last_run_at=excluded.last_run_at,consecutive_errors=public.weather_source_health.consecutive_errors+1,state='falha',last_error=excluded.last_error,updated_at=now();
  end;

  begin
    v_wttr_response := extensions.http_get('https://wttr.in/Sao%20Bernardo%20do%20Campo?format=j1');
    if v_wttr_response.status < 200 or v_wttr_response.status >= 300 then raise exception 'weather aggregate HTTP %', v_wttr_response.status; end if;
    v_wttr := v_wttr_response.content::jsonb;
    v_wttr_current := v_wttr->'current_condition'->0;
    v_wttr_desc := lower(coalesce(v_wttr_current->'weatherDesc'->0->>'value',''));
    v_wttr_mm := coalesce(nullif(v_wttr_current->>'precipMM','')::numeric,0);
    v_wttr_wet := v_wttr_mm > 0 or v_wttr_desc ~ '(rain|drizzle|shower|thunder|storm)';
    v_wttr_code := case when v_wttr_desc ~ '(thunder|storm)' then 95 when v_wttr_desc ~ '(heavy rain|torrential)' then 65 when v_wttr_desc ~ 'drizzle' then 51 when v_wttr_desc ~ '(rain|shower)' then 61 when v_wttr_desc ~ '(fog|mist)' then 45 when v_wttr_desc ~ '(clear|sunny)' then 0 else 3 end;
    insert into public.weather_observations(source,source_station_id,data_type,observed_at,latitude,longitude,distance_km,precipitation_mm,rain_rate_mm_h,weather_code,temperature_c,humidity_pct,wind_kmh,confidence,raw_payload)
    values('weather-aggregate','sbc-current','previsao',date_trunc('minute',now()),-23.7000,-46.5500,3.1,v_wttr_mm,v_wttr_mm,v_wttr_code,nullif(v_wttr_current->>'temp_C','')::numeric,nullif(v_wttr_current->>'humidity','')::numeric,nullif(v_wttr_current->>'windspeedKmph','')::numeric,0.72,v_wttr_current)
    on conflict (source,observed_at,(coalesce(source_station_id,''))) do update set precipitation_mm=excluded.precipitation_mm,rain_rate_mm_h=excluded.rain_rate_mm_h,weather_code=excluded.weather_code,temperature_c=excluded.temperature_c,humidity_pct=excluded.humidity_pct,wind_kmh=excluded.wind_kmh,raw_payload=excluded.raw_payload;
    insert into public.weather_source_health(source,last_run_at,last_success_at,latency_ms,consecutive_errors,state,last_error,updated_at)
    values('weather-aggregate',now(),now(),greatest(0,extract(milliseconds from clock_timestamp()-v_started)::int),0,'ok',null,now())
    on conflict(source) do update set last_run_at=excluded.last_run_at,last_success_at=excluded.last_success_at,latency_ms=excluded.latency_ms,consecutive_errors=0,state='ok',last_error=null,updated_at=now();
  exception when others then
    insert into public.weather_source_health(source,last_run_at,consecutive_errors,state,last_error,updated_at)
    values('weather-aggregate',now(),1,'falha',left(sqlerrm,300),now())
    on conflict(source) do update set last_run_at=excluded.last_run_at,consecutive_errors=public.weather_source_health.consecutive_errors+1,state='falha',last_error=excluded.last_error,updated_at=now();
  end;

  begin
    v_metar_response := extensions.http_get('https://aviationweather.gov/api/data/metar?ids=SBSP&format=json&taf=false');
    if v_metar_response.status < 200 or v_metar_response.status >= 300 then raise exception 'METAR HTTP %', v_metar_response.status; end if;
    v_metar := v_metar_response.content::jsonb;
    v_metar_row := v_metar->0;
    if v_metar_row is null then raise exception 'METAR vazio'; end if;
    v_metar_raw := upper(coalesce(v_metar_row->>'rawOb',''));
    v_metar_at := coalesce(nullif(v_metar_row->>'reportTime','')::timestamptz,now());
    v_metar_temp := nullif(v_metar_row->>'temp','')::numeric;
    v_metar_wet := v_metar_raw ~ '(^|[[:space:]])(\+|-)?(RA|DZ|SHRA|TSRA|TS)([[:space:]]|$)';
    insert into public.weather_observations(source,source_station_id,data_type,observed_at,latitude,longitude,distance_km,precipitation_mm,rain_rate_mm_h,weather_code,temperature_c,humidity_pct,wind_kmh,confidence,raw_payload)
    values('metar-sbsp','SBSP','observacao',v_metar_at,-23.627,-46.655,13.8,0,0,case when v_metar_wet then 61 else 3 end,v_metar_temp,null,coalesce(nullif(v_metar_row->>'wspd','')::numeric,0)*1.852,0.85,v_metar_row)
    on conflict (source,observed_at,(coalesce(source_station_id,''))) do update set weather_code=excluded.weather_code,temperature_c=excluded.temperature_c,wind_kmh=excluded.wind_kmh,raw_payload=excluded.raw_payload;
    insert into public.weather_source_health(source,last_run_at,last_success_at,latency_ms,consecutive_errors,state,last_error,updated_at)
    values('metar-sbsp',now(),now(),greatest(0,extract(milliseconds from clock_timestamp()-v_started)::int),0,'ok',null,now())
    on conflict(source) do update set last_run_at=excluded.last_run_at,last_success_at=excluded.last_success_at,latency_ms=excluded.latency_ms,consecutive_errors=0,state='ok',last_error=null,updated_at=now();
  exception when others then
    insert into public.weather_source_health(source,last_run_at,consecutive_errors,state,last_error,updated_at)
    values('metar-sbsp',now(),1,'falha',left(sqlerrm,300),now())
    on conflict(source) do update set last_run_at=excluded.last_run_at,consecutive_errors=public.weather_source_health.consecutive_errors+1,state='falha',last_error=excluded.last_error,updated_at=now();
  end;

  v_wet := coalesce(v_mm,0)>0 or coalesce(v_code,0)=any(array[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99]) or v_wttr_wet or v_metar_wet;
  if coalesce(v_mm,0)>0 or coalesce(v_code,0)=any(array[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99]) then v_sources:=array_append(v_sources,'open-meteo'); end if;
  if v_wttr_wet then v_sources:=array_append(v_sources,'weather-aggregate'); v_confidence:=greatest(v_confidence,0.72); end if;
  if v_metar_wet then v_sources:=array_append(v_sources,'metar-sbsp'); v_confidence:=greatest(v_confidence,0.85); end if;

  if v_metar_wet or v_wttr_desc~'(thunder|storm)' or coalesce(v_code,0)=any(array[95,96,99]) then v_intensity:='tempestade';
  elsif greatest(coalesce(v_mm,0),coalesce(v_wttr_mm,0))>=8 or coalesce(v_code,0)=any(array[65,67,82]) then v_intensity:='forte';
  elsif greatest(coalesce(v_mm,0),coalesce(v_wttr_mm,0))>=2.5 or coalesce(v_code,0)=any(array[63,66,81]) then v_intensity:='moderada';
  elsif v_wet then v_intensity:=case when v_wttr_desc~'drizzle' or coalesce(v_code,0)=any(array[51,53,55,56,57]) then 'garoa' else 'fraca' end;
  end if;

  select id into v_event_id from public.weather_events where status='aberto' order by started_at desc limit 1;
  if v_wet then
    if v_event_id is null then
      insert into public.weather_events(started_at,status,max_intensity,accumulated_mm,sources,confidence,confirmation_type,notes)
      values(now(),'aberto',v_intensity,greatest(coalesce(v_mm,0),coalesce(v_wttr_mm,0)),v_sources,v_confidence,'automatica','Evento aberto automaticamente por consenso meteorológico multifonte para Taludes.') returning id into v_event_id;
    else
      update public.weather_events set
        sources=(select array_agg(distinct x) from unnest(coalesce(sources,'{}'::text[])||v_sources)x),
        confidence=greatest(confidence,v_confidence),
        accumulated_mm=greatest(accumulated_mm,greatest(coalesce(v_mm,0),coalesce(v_wttr_mm,0))),
        max_intensity=case when max_intensity='tempestade' or v_intensity='tempestade' then 'tempestade' when max_intensity='forte' or v_intensity='forte' then 'forte' when max_intensity='moderada' or v_intensity='moderada' then 'moderada' when max_intensity='fraca' or v_intensity='fraca' then 'fraca' else coalesce(v_intensity,max_intensity,'garoa') end,
        updated_at=now() where id=v_event_id;
    end if;
  else
    if not exists(select 1 from public.weather_observations where observed_at>=now()-interval '60 minutes' and (coalesce(precipitation_mm,0)>0 or weather_code=any(array[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99]))) then
      update public.weather_events set status='encerrado',ended_at=now(),updated_at=now(),notes=coalesce(notes,'')||case when notes is null or notes='' then '' else ' ' end||'Encerrado automaticamente após 60 min sem evidência de precipitação.' where status='aberto' and confirmation_type='automatica' and started_at<=now()-interval '60 minutes';
    end if;
  end if;
end;
$$;

comment on function public.capture_open_meteo_weather() is 'Monitoramento multifonte de Taludes: Open-Meteo + condição atual agregada de São Bernardo + METAR SBSP; registra observações e abre/encerra eventos automáticos de chuva.';
