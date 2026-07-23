import React, { useState } from 'react';

export const ApontAuto: React.FC = () => {
  const [equipeIds, setEquipeIds] = useState('436057, 123456');
  const [ordensServico, setOrdensServico] = useState('1533199\n1533200');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [horaInicio, setHoraInicio] = useState('07:00');
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
  const [horaFim, setHoraFim] = useState('17:00');
  const [status, setStatus] = useState('');

  const dispararParaExtensao = () => {
    const tecnicos = equipeIds.split(',').map(s => s.trim()).filter(Boolean);
    const osList = ordensServico.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

    if (!tecnicos.length || !osList.length) {
      setStatus('⚠️ Preencha os IDs e as Ordens de Serviço.');
      return;
    }

    const payload = {
      tecnicos,
      osList,
      dataInicio: dataInicio.split('-').reverse().join('/'),
      horaInicio,
      dataFim: dataFim.split('-').reverse().join('/'),
      horaFim
    };

    // Comunica com o content.js que repassa para o background.js da extensão
    window.postMessage({
      source: 'LOVABLE_PRISMA_APP',
      action: 'ENVIAR_OS',
      payload
    }, '*');

    setStatus('🚀 Enviando ordem para a aba do PRISMA...');
    
    // Limpa a notificação de envio após 3 segundos
    setTimeout(() => setStatus(''), 3500);
  };

  return (
    <div className="p-6 max-w-lg mx-auto bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl text-white">
      <h2 className="text-xl font-bold text-blue-400 mb-4 flex items-center gap-2">
        <span>⚡</span> Central de Apontamento PRISMA
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">IDs dos Colaboradores</label>
          <input type="text" value={equipeIds} onChange={(e) => setEquipeIds(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Ordens de Serviço</label>
          <textarea rows={3} value={ordensServico} onChange={(e) => setOrdensServico(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Data Início</label>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm" /></div>
          <div><label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Hora Início</label>
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Data Fim</label>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm" /></div>
          <div><label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Hora Fim</label>
            <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm" /></div>
        </div>

        <button onClick={dispararParaExtensao} className="w-full mt-2 py-3 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-semibold rounded-xl shadow-lg transition-all">
          Transmitir para Extensão
        </button>

        {status && <div className="p-2.5 mt-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300 text-center">{status}</div>}
      </div>
    </div>
  );
};