from pathlib import Path

path = Path('src/routes/_authenticated/painel-legal.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace(
    'import { useMemo, useState } from "react";',
    'import { useEffect, useMemo, useState } from "react";',
    1,
)

old_states = '''  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("anual");
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [ultimaExecucao, setUltimaExecucao] = useState<string>("");
  const [agendamento, setAgendamento] = useState("");'''
new_states = '''  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("anual");
  const [dataInicio, setDataInicio] = useState("");
  const [proximaManual, setProximaManual] = useState(false);
  const [ultimaExecucao, setUltimaExecucao] = useState<string>("");
  const [agendamento, setAgendamento] = useState("");'''
if old_states not in text:
    raise SystemExit('State block not found')
text = text.replace(old_states, new_states, 1)

old_reset = '''  useMemo(() => {
    if (editing) {
      setTitulo(editing.titulo);
      setEmpresa(editing.empresa);
      setPredio(editing.predio);
      setPeriodicidade(editing.periodicidade);
      setDataInicio(editing.proximaExecucao || todayISO());
      setUltimaExecucao(editing.ultimaExecucao ?? "");
      setAgendamento(editing.agendamento ?? "");
      setObservacoes(editing.observacoes);
      setPrecisaAndaime(editing.precisaAndaime);
    } else {
      setTitulo("");
      setEmpresa("");
      setPredio("");
      setPeriodicidade("anual");
      setDataInicio(todayISO());
      setUltimaExecucao("");
      setAgendamento("");
      setObservacoes("");
      setPrecisaAndaime(false);
    }
  }, [editing, open]);

  // Se última execução mudar e não houver próxima definida manualmente, sugerir próxima automática.
  const autoNext = useMemo(() => {
    if (!ultimaExecucao) return "";
    return addMonths(ultimaExecucao, monthsFor(periodicidade));
  }, [ultimaExecucao, periodicidade]);'''
new_reset = '''  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitulo(editing.titulo);
      setEmpresa(editing.empresa);
      setPredio(editing.predio);
      setPeriodicidade(editing.periodicidade);
      setDataInicio(editing.proximaExecucao ?? "");
      setProximaManual(false);
      setUltimaExecucao(editing.ultimaExecucao ?? "");
      setAgendamento(editing.agendamento ?? "");
      setObservacoes(editing.observacoes);
      setPrecisaAndaime(editing.precisaAndaime);
    } else {
      setTitulo("");
      setEmpresa("");
      setPredio("");
      setPeriodicidade("anual");
      setDataInicio("");
      setProximaManual(false);
      setUltimaExecucao("");
      setAgendamento("");
      setObservacoes("");
      setPrecisaAndaime(false);
    }
  }, [editing, open]);

  const autoNext = useMemo(() => {
    if (!ultimaExecucao) return "";
    return addMonths(ultimaExecucao, monthsFor(periodicidade));
  }, [ultimaExecucao, periodicidade]);

  const handlePeriodicidadeChange = (value: Periodicidade) => {
    setPeriodicidade(value);
    if (!proximaManual && ultimaExecucao) {
      setDataInicio(addMonths(ultimaExecucao, monthsFor(value)));
    }
  };

  const handleUltimaExecucaoChange = (value: string) => {
    setUltimaExecucao(value);
    if (!proximaManual) {
      setDataInicio(value ? addMonths(value, monthsFor(periodicidade)) : "");
    }
  };

  const handleProximaExecucaoChange = (value: string) => {
    if (value) {
      setDataInicio(value);
      setProximaManual(true);
      return;
    }
    setProximaManual(false);
    setDataInicio(autoNext);
  };'''
if old_reset not in text:
    raise SystemExit('Reset/autoNext block not found')
text = text.replace(old_reset, new_reset, 1)

old_period = '''              <Select
                value={periodicidade}
                onValueChange={(v) => setPeriodicidade(v as Periodicidade)}
              >'''
new_period = '''              <Select
                value={periodicidade}
                onValueChange={(v) => handlePeriodicidadeChange(v as Periodicidade)}
              >'''
if old_period not in text:
    raise SystemExit('Periodicidade select not found')
text = text.replace(old_period, new_period, 1)

old_last = '''              <Input
                id="ult"
                type="date"
                value={ultimaExecucao}
                onChange={(e) => setUltimaExecucao(e.target.value)}
              />'''
new_last = '''              <Input
                id="ult"
                type="date"
                value={ultimaExecucao}
                onChange={(e) => handleUltimaExecucaoChange(e.target.value)}
              />'''
if old_last not in text:
    raise SystemExit('Last execution input not found')
text = text.replace(old_last, new_last, 1)

old_next = '''              <Input
                id="ini"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                required
              />
              {autoNext && autoNext !== dataInicio && (
                <button
                  type="button"
                  className="text-[11px] text-primary underline underline-offset-2"
                  onClick={() => setDataInicio(autoNext)}
                >
                  Sugerir {new Date(autoNext + "T00:00:00").toLocaleDateString("pt-BR")} (base
                  última + {PERIODICIDADE_LABEL[periodicidade].toLowerCase()})
                </button>
              )}'''
new_next = '''              <Input
                id="ini"
                type="date"
                value={dataInicio}
                onChange={(e) => handleProximaExecucaoChange(e.target.value)}
                required
              />
              {ultimaExecucao && dataInicio && !proximaManual ? (
                <p className="text-[11px] text-emerald-400">
                  Preenchida automaticamente: última execução + {PERIODICIDADE_LABEL[periodicidade].toLowerCase()}.
                </p>
              ) : proximaManual ? (
                <p className="text-[11px] text-muted-foreground">Data definida manualmente.</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Informe a última execução para calcular automaticamente a próxima data.
                </p>
              )}'''
if old_next not in text:
    raise SystemExit('Next execution block not found')
text = text.replace(old_next, new_next, 1)

path.write_text(text, encoding='utf-8')
