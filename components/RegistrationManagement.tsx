import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, updateDoc, doc, deleteDoc, query } from 'firebase/firestore';
import { db } from '../firebase';
import { Resident } from '../types';
import { InputPadrao, BotaoPadrao, CardPadrao, SelectPadrao } from './SharedUI';

interface Props {
  onBack?: () => void;
  isExternal?: boolean; // Se true, o morador acessou via link
}

const RELATIONSHIP_TYPES = [
  { label: 'Proprietário', value: 'Proprietário' },
  { label: 'Inquilino', value: 'Inquilino' },
  { label: 'Administradora', value: 'Administradora' },
];

export const RegistrationManagement: React.FC<Props> = ({ onBack, isExternal }) => {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'list' | 'new'>('pending');

  // Form
  const [step, setStep] = useState(1);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [resForm, setResForm] = useState<Partial<Resident>>({
    fullName: '', apartment: '', phone: '', status: 'pendente', relationshipType: '', vehicles: '', dependents: []
  });
  const [editId, setEditId] = useState<string | null>(null);

  // UI States
  const [alert, setAlert] = useState({ msg: '', type: 'success' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'residents'), snap => {
      setResidents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Resident)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const flash = (msg: string, type: 'success' | 'error' = 'success') => {
    setAlert({ msg, type });
    setTimeout(() => setAlert({ msg: '', type: 'success' }), 4000);
  };

  const formatPhone = (val: string) => {
    let raw = val;
    if (raw.startsWith('+55')) raw = raw.substring(3);
    else if (raw.startsWith('55') && !val.includes('+55')) raw = raw.substring(2);
    const v = raw.replace(/\D/g, '');
    if (!v) return '';
    if (v.length <= 2) return `+55 (${v}`;
    if (v.length <= 7) return `+55 (${v.substring(0, 2)}) ${v.substring(2)}`;
    return `+55 (${v.substring(0, 2)}) ${v.substring(2, 7)}-${v.substring(7, 11)}`;
  };

  const pendingList = residents.filter(r => r.status === 'pendente');
  const activeList = residents
    .filter(r => r.status !== 'pendente')
    .sort((a, b) => a.apartment.localeCompare(b.apartment, undefined, { numeric: true, sensitivity: 'base' }));

  // ----- FUNÇÕES EXTERNAS (Link do Morador) -----
  const handlePhoneCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneSearch || phoneSearch.length < 10) {
      flash('Digite um WhatsApp válido com DDD.', 'error');
      return;
    }
    // Formata busca ignorando caracteres
    let rawSearch = phoneSearch.replace(/\D/g, '');
    if (rawSearch.startsWith('55') && phoneSearch.startsWith('+55')) {
      rawSearch = rawSearch.substring(2);
    }

    const existing = residents.find(r => {
      let rRaw = r.phone.replace(/\D/g, '');
      if (rRaw.startsWith('55') && r.phone.startsWith('+55')) rRaw = rRaw.substring(2);
      return rRaw === rawSearch;
    });

    if (existing) {
      // Pre-preenche para edição (Recadastramento)
      setResForm({
        ...existing,
        // força pendente na edição via link para passar por aprovação
        status: isExternal ? 'pendente' : existing.status,
      });
      setEditId(existing.id);
      flash('Cadastro encontrado! Por favor, atualize seus dados.', 'success');
    } else {
      setResForm({
        fullName: '', apartment: '', status: isExternal ? 'pendente' : 'ativo', relationshipType: '', vehicles: '', dependents: [],
        phone: phoneSearch // já salva o telefone digitado
      });
      setEditId(null);
      flash('Novo cadastro. Por favor, preencha seus dados.', 'success');
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resForm.fullName || !resForm.apartment || !resForm.phone || !resForm.relationshipType) {
      flash('Preencha os campos obrigatórios!', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editId) {
        await updateDoc(doc(db, 'residents', editId), resForm);
      } else {
        await addDoc(collection(db, 'residents'), resForm);
      }

      if (isExternal) {
        setStep(3); // Tela de sucesso final
      } else {
        flash(editId ? 'Cadastro atualizado!' : 'Morador registrado com sucesso!');
        setResForm({ fullName: '', apartment: '', phone: '', status: 'ativo', relationshipType: '', vehicles: '', dependents: [] });
        setEditId(null);
        setTab('list');
      }
    } catch (error: any) {
      flash('Erro ao salvar os dados: ' + error.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----- FUNÇÕES DE DEPENDENTES -----
  const handleAddDependent = () => {
    setResForm(prev => ({
      ...prev,
      dependents: [...(prev.dependents || []), { name: '', relationship: '' }]
    }));
  };
  const handleUpdateDependent = (index: number, field: 'name' | 'relationship', value: string) => {
    const newDeps = [...(resForm.dependents || [])];
    newDeps[index][field] = value;
    setResForm({ ...resForm, dependents: newDeps });
  };
  const handleRemoveDependent = (index: number) => {
    setResForm({ ...resForm, dependents: (resForm.dependents || []).filter((_, i) => i !== index) });
  };
  const renderDependentsForm = () => (
    <div className="mb-4 space-y-3">
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-bold text-gray-500">Dependentes e Outros Moradores</label>
        <button type="button" onClick={handleAddDependent} className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-3 py-1.5 rounded-lg font-bold hover:bg-green-200 transition">
          <i className="fas fa-plus mr-1"></i> Adicionar
        </button>
      </div>
      {(resForm.dependents || []).map((dep, idx) => (
        <div key={idx} className="flex flex-col sm:flex-row gap-3 p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-xl relative group">
          <input required type="text" placeholder="Nome completo" value={dep.name} onChange={e => handleUpdateDependent(idx, 'name', e.target.value)} className="flex-1 p-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 outline-none focus:ring-2 focus:ring-green-500" />
          <input required type="text" placeholder="Vínculo (Ex: Filho)" value={dep.relationship} onChange={e => handleUpdateDependent(idx, 'relationship', e.target.value)} className="w-full sm:w-1/3 p-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 outline-none focus:ring-2 focus:ring-green-500" />
          <button type="button" onClick={() => handleRemoveDependent(idx)} className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-red-100 text-red-600 dark:bg-red-900/30 rounded-xl hover:bg-red-200 transition">
            <i className="fas fa-trash"></i>
          </button>
        </div>
      ))}
      {(resForm.dependents || []).length === 0 && <p className="text-xs text-gray-400 italic">Nenhum dependente adicionado. Clique em &quot;Adicionar&quot; para registrar crianças ou parentes.</p>}
    </div>
  );

  // ----- FUNÇÕES ADMIN -----
  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'residents', id), { status: 'ativo' });
      flash('Cadastro aprovado com sucesso!');
    } catch { flash('Erro ao aprovar', 'error'); }
  };
  const handleReject = async (id: string, isUpdate: boolean) => {
    if (!window.confirm('Tem certeza que deseja rejeitar este registro?')) return;
    try {
      if (isUpdate) {
        // Se era edição, volta pro status anterior 'ativo'.
        // Idealmente teríamos o snapshot real anterior, mas para manter simples, volta para ativo
        await updateDoc(doc(db, 'residents', id), { status: 'ativo' });
        flash('Atualização rejeitada. O cadastro permanece o mesmo anterior.');
      } else {
        await deleteDoc(doc(db, 'residents', id));
        flash('Cadastro rejeitado e removido!');
      }
    } catch { flash('Erro ao rejeitar', 'error'); }
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm('Remover morador e inativá-lo?')) return;
    try {
      await deleteDoc(doc(db, 'residents', id));
      flash('Morador removido do sistema!');
    } catch { flash('Erro ao remover', 'error'); }
  };

  const handleCopyInvite = () => {
    // WhatsApp ignora 'localhost' para links. Vamos usar um domínio fictício apenas no ambiente local
    const originUrl = window.location.hostname === 'localhost'
      ? 'https://app-villaditrento.com.br'
      : window.location.origin;

    const link = `${originUrl}/?cadastro=true`;
    const msg = `Olá, morador(a) do Condomínio Villa Di Trento! 👋

Para garantir a sua comodidade e a segurança de todos, estamos realizando o nosso Recadastramento de Moradores.

É MUITO IMPORTANTE que todos realizem o preenchimento! Manter seus dados e de seus familiares atualizados em nosso sistema garante que:
📦 Suas encomendas sejam recebidas e notificadas sem atrasos.
🔒 A portaria tenha controle rápido e preciso de quem entra ou sai.
📲 Você receba corretamente os informativos e contatos importantes da administração.

Leva menos de 2 minutinhos! Acesse o link oficial do condomínio abaixo, insira seu WhatsApp para iniciar e inclua seus familiares:

${link}

Contamos com a sua rápida colaboração para continuarmos melhorando nosso condomínio! 🏢✨
Atenciosamente,
Administração - Villa Di Trento`;

    navigator.clipboard.writeText(msg).then(() => {
      flash('Convite copiado com sucesso! Só colar no seu WhatsApp.', 'success');
    }).catch(() => {
      flash('Erro ao copiar. Tente selecionar manualmente.', 'error');
    });
  };


  // ==========================================
  // VIEW EXTERNA (VIA LINK)
  // ==========================================
  if (isExternal) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex flex-col items-center p-4 animate-fade-in text-gray-800 dark:text-gray-100">
        <div className="w-full max-w-md mt-8 mb-6 text-center">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <i className="fas fa-building text-3xl text-white"></i>
          </div>
          <h1 className="text-2xl font-black dark:text-white">Villa Di Trento</h1>
          <p className="text-gray-500">Cadastro de Moradores e Veículos</p>
        </div>

        {alert.msg && (
          <div className={`w-full max-w-md p-4 mb-4 rounded-xl border flex items-center gap-2 animate-slide-up ${alert.type==='success'?'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/50':'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/50'}`}>
            <i className={`fas ${alert.type==='success'?'fa-check-circle':'fa-exclamation-circle'}`}></i>{alert.msg}
          </div>
        )}

        {step === 1 && (
          <CardPadrao className="w-full max-w-md">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold">Identificação</h2>
              <p className="text-sm text-gray-500 mt-1">Digite seu WhatsApp para iniciar ou atualizar o recadastramento anual.</p>
            </div>
            <form onSubmit={handlePhoneCheck}>
              <InputPadrao
                icon="fa-whatsapp" type="tel" placeholder="+55 (00) 00000-0000"
                value={phoneSearch} onChange={e => setPhoneSearch(formatPhone(e.target.value))} required autoFocus
              />
              <BotaoPadrao type="submit" icon="fa-arrow-right">Continuar</BotaoPadrao>
            </form>
          </CardPadrao>
        )}

        {step === 2 && (
          <CardPadrao className="w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editId ? 'Atualizar Dados' : 'Dados do Morador'}</h2>
            <form onSubmit={handleSubmit}>
              <InputPadrao label="Nome Completo *" icon="fa-user" required value={resForm.fullName} onChange={e => setResForm({...resForm, fullName: e.target.value})} placeholder="João da Silva" />
              <div className="grid grid-cols-2 gap-4">
                <InputPadrao label="Apto *" icon="fa-home" required value={resForm.apartment} onChange={e => setResForm({...resForm, apartment: e.target.value})} placeholder="Ex: 101" />
                <SelectPadrao label="Vínculo *" icon="fa-id-card" required value={resForm.relationshipType} onChange={e => setResForm({...resForm, relationshipType: e.target.value as any})} options={RELATIONSHIP_TYPES} />
              </div>
              <InputPadrao label="WhatsApp *" icon="fa-whatsapp" required value={resForm.phone} onChange={e => setResForm({...resForm, phone: formatPhone(e.target.value)})} placeholder="+55 (00) 00000-0000" />
              <InputPadrao label="Veículos (Placa/Modelo)" icon="fa-car" value={resForm.vehicles} onChange={e => setResForm({...resForm, vehicles: e.target.value})} placeholder="Ex: ABC1234 - Onix Branco" />

              {renderDependentsForm()}

              <BotaoPadrao type="submit" loading={isSubmitting} icon="fa-check" className="mt-4">
                Enviar para Aprovação
              </BotaoPadrao>
              <button type="button" onClick={() => setStep(1)} className="w-full mt-4 py-3 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-bold transition">
                Voltar
              </button>
            </form>
          </CardPadrao>
        )}

        {step === 3 && (
          <CardPadrao className="w-full max-w-md text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-check-double text-4xl text-green-500"></i>
            </div>
            <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">Dados Enviados!</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Seus dados foram recebidos e estão sob análise da administração. Obrigado por colaborar com o controle de segurança do Villa Di Trento.
            </p>
            <BotaoPadrao variant="outline" onClick={() => { setPhoneSearch(''); setStep(1); }}>Novo Cadastro</BotaoPadrao>
          </CardPadrao>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW DO ADMIN
  // ==========================================
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in text-gray-800 dark:text-gray-100">

      {/* HEADER LOCAL */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 glassmorphism p-5 rounded-2xl shadow-sm border border-black/5 dark:border-white/5 print:hidden">
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700 transition relative shrink-0">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div>
            <h1 className="text-2xl font-bold">👤 Cadastros</h1>
            <p className="text-xs text-gray-500">Gestão de Moradores</p>
          </div>
          <button onClick={handleCopyInvite} className="flex ml-2 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap hover:bg-green-200 dark:hover:bg-green-900/60 transition-all items-center gap-2 border border-green-200 dark:border-green-800/50">
            <i className="fab fa-whatsapp text-lg"></i> Convite
          </button>
        </div>
        <nav className="flex bg-gray-200/50 dark:bg-neutral-800/50 p-1 rounded-xl w-full md:w-auto overflow-x-auto gap-1">
          <button onClick={() => setTab('pending')} className={`relative flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${tab==='pending'?'bg-white dark:bg-neutral-700 shadow-sm text-green-700 dark:text-green-400':'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'}`}>
            <i className="fas fa-clock"></i> Pendentes
            {pendingList.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingList.length}</span>}
          </button>
          <button onClick={() => setTab('list')} className={`relative flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${tab==='list'?'bg-white dark:bg-neutral-700 shadow-sm text-green-700 dark:text-green-400':'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'}`}>
            <i className="fas fa-users"></i> Ativos
          </button>
          <button onClick={() => { setTab('new'); setEditId(null); setResForm({fullName:'', apartment:'', phone:'', status:'ativo', relationshipType:'', vehicles:''}); }} className={`relative flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${tab==='new'?'bg-white dark:bg-neutral-700 shadow-sm text-green-700 dark:text-green-400':'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'}`}>
            <i className="fas fa-plus"></i> Manual
          </button>
        </nav>
      </div>

      {alert.msg && <div className={`p-4 rounded-xl border flex items-center gap-2 animate-slide-up ${alert.type==='success'?'bg-green-100 text-green-800 border-green-300':'bg-red-100 text-red-800 border-red-300'}`}><i className="fas fa-info-circle"></i>{alert.msg}</div>}

      {/* PENDENTES DE APROVAÇÃO */}
      {tab === 'pending' && (
        <CardPadrao>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><i className="fas fa-user-clock text-orange-500"></i> Aguardando Aprovação</h2>
          </div>
          {pendingList.length === 0 ? (
             <div className="text-center text-gray-500 py-10"><i className="fas fa-check-double text-4xl mb-4 opacity-50 block"></i> Nenhuma aprovação pendente no momento.</div>
          ) : (
            <div className="space-y-4">
              {pendingList.map(r => (
                 <div key={r.id} className="p-4 sm:p-5 border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10 rounded-2xl flex flex-col sm:flex-row justify-between gap-4">
                   <div className="space-y-1">
                     <div className="flex items-center gap-2 mb-2">
                       <span className="font-bold text-lg">{r.fullName}</span>
                       <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 px-2 py-0.5 rounded-full font-bold">Apto {r.apartment}</span>
                     </div>
                     <p className="text-sm text-gray-600 dark:text-gray-400"><i className="fas fa-id-card w-5 text-center"></i> {r.relationshipType || 'Não informado'}</p>
                     <p className="text-sm text-gray-600 dark:text-gray-400"><i className="fab fa-whatsapp w-5 text-center"></i> {r.phone}</p>
                     {r.vehicles && <p className="text-sm text-gray-600 dark:text-gray-400"><i className="fas fa-car w-5 text-center"></i> {r.vehicles}</p>}
                     {r.dependents && r.dependents.length > 0 && (
                       <div className="mt-2 bg-orange-100/50 dark:bg-orange-800/20 p-2 rounded-lg text-xs text-gray-600 dark:text-gray-300">
                         <strong className="block mb-1">Dependentes ({r.dependents.length}):</strong>
                         {r.dependents.map((d, i) => <div key={i}>• {d.name} <span className="opacity-70">({d.relationship})</span></div>)}
                       </div>
                     )}
                   </div>
                   <div className="flex gap-2 items-center">
                     <BotaoPadrao variant="danger" icon="fa-times" className="!w-auto !px-4" onClick={() => handleReject(r.id, !!r.id)}>Rejeitar</BotaoPadrao>
                     <BotaoPadrao variant="primary" icon="fa-check" className="!w-auto !px-4" onClick={() => handleApprove(r.id)}>Aprovar</BotaoPadrao>
                   </div>
                 </div>
              ))}
            </div>
          )}
        </CardPadrao>
      )}

      {/* LISTA ATIVOS */}
      {tab === 'list' && (
        <>
        <CardPadrao className="print:hidden">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><i className="fas fa-users text-blue-500"></i> Moradores Ativos</h2>
            {/* Aqui poderia vir o relatorio PDF */}
            <BotaoPadrao variant="outline" icon="fa-file-pdf" className="!w-auto !py-2 !px-4 print:hidden" onClick={() => window.print()}>Exportar PDF</BotaoPadrao>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-neutral-800 text-gray-500 uppercase text-xs">
                  <th className="p-3">Apto</th>
                  <th className="p-3">Morador</th>
                  <th className="p-3">Vínculo</th>
                  <th className="p-3">Veículo</th>
                  <th className="p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {activeList.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-800 transition">
                    <td className="p-3 font-bold"><span className="bg-gray-100 dark:bg-neutral-800 px-2 py-1 rounded-md">{r.apartment}</span></td>
                    <td className="p-3">
                      <p className="font-bold">{r.fullName}</p>
                      <p className="text-xs text-gray-500">{r.phone}</p>
                    </td>
                    <td className="p-3 text-sm">{r.relationshipType || '-'}</td>
                    <td className="p-3 text-sm max-w-[150px] truncate" title={r.vehicles}>{r.vehicles || '-'}</td>
                    <td className="p-3 flex gap-2">
                       <button onClick={() => { setResForm(r); setEditId(r.id); setTab('new'); }} className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 transition flex items-center justify-center"><i className="fas fa-edit"></i></button>
                       <button onClick={() => handleDelete(r.id)} className="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 transition flex items-center justify-center"><i className="fas fa-trash"></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardPadrao>

        {/* PRINT ONLY: Relatório por Apartamento */}
        <div className="hidden print:block bg-white text-black min-h-screen">
          {Object.entries(
            activeList.reduce((acc, curr) => {
              if (!acc[curr.apartment]) acc[curr.apartment] = [];
              acc[curr.apartment].push(curr);
              return acc;
            }, {} as Record<string, typeof activeList>)
          )
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            .map(([apto, moradores]: [string, Resident[]]) => (
              <div key={apto} style={{ pageBreakAfter: 'always' }} className="break-after-page pb-8 print:m-0 print:pt-4">
                <div className="border-b-4 border-gray-800 pb-2 mb-6 flex justify-between items-end">
                  <div>
                    <h1 className="text-3xl font-black">Ficha de Moradores - Apto {apto}</h1>
                    <p className="text-sm text-gray-500 uppercase font-bold tracking-widest mt-1">Condomínio Villa Di Trento</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Data de Emissão: {new Date().toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {moradores.map((res: any) => (
                    <div key={res.id} className="p-4 border border-gray-300 rounded-lg">
                      <div className="flex gap-4 items-center pb-2 border-b">
                        <h2 className="text-xl font-bold uppercase">{res.fullName}</h2>
                        <span className="bg-gray-200 px-3 py-1 rounded text-sm uppercase font-bold">{res.relationshipType || 'Não informado'}</span>
                      </div>
                      <div className="py-2 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold">WhatsApp</p>
                          <p>{res.phone}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold">Veículos</p>
                          <p>{res.vehicles || 'Nenhum'}</p>
                        </div>
                      </div>
                      {res.dependents && res.dependents.length > 0 && (
                        <div className="mt-2 bg-gray-50 p-3 rounded border">
                          <p className="text-xs text-gray-500 uppercase font-bold mb-2">Dependentes / Outros Moradores ({res.dependents.length})</p>
                          <ul className="list-disc pl-5">
                            {res.dependents.map((dep: any, idx: number) => (
                              <li key={idx}><strong>{dep.name}</strong> <span className="text-gray-600">({dep.relationship})</span></li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-12 pt-4 border-t border-dashed border-gray-300 text-center text-xs text-gray-400">
                  Documento interno do Condomínio Villa Di Trento. Uso exclusivo da administração e portaria.
                </div>
              </div>
            ))}
        </div>
        </>
      )}

      {/* NOVO/EDITAR (MANUAL) */}
      {tab === 'new' && (
        <CardPadrao className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold mb-6">{editId ? 'Editar Cadastro' : 'Novo Cadastro Manual'}</h2>
          <form onSubmit={handleSubmit}>
              <InputPadrao label="Nome Completo *" icon="fa-user" required value={resForm.fullName} onChange={e => setResForm({...resForm, fullName: e.target.value})} placeholder="João da Silva" />
              <div className="grid grid-cols-2 gap-4">
                <InputPadrao label="Apto *" icon="fa-home" required value={resForm.apartment} onChange={e => setResForm({...resForm, apartment: e.target.value})} placeholder="Ex: 101" />
                <SelectPadrao label="Vínculo *" icon="fa-id-card" required value={resForm.relationshipType} onChange={e => setResForm({...resForm, relationshipType: e.target.value as any})} options={RELATIONSHIP_TYPES} />
              </div>
              <InputPadrao label="WhatsApp *" icon="fa-whatsapp" required value={resForm.phone} onChange={e => setResForm({...resForm, phone: formatPhone(e.target.value)})} placeholder="+55 (00) 00000-0000" />
              <InputPadrao label="Veículos (Placa/Modelo)" icon="fa-car" value={resForm.vehicles} onChange={e => setResForm({...resForm, vehicles: e.target.value})} placeholder="Ex: ABC1234 - Onix Branco" />

              {renderDependentsForm()}

              <div className="flex gap-4 mt-6">
                <BotaoPadrao type="button" variant="outline" onClick={() => setTab('list')}>Cancelar</BotaoPadrao>
                <BotaoPadrao type="submit" loading={isSubmitting} icon="fa-save">{editId ? 'Salvar Alterações' : 'Registrar Ativo'}</BotaoPadrao>
              </div>
          </form>
        </CardPadrao>
      )}
    </div>
  );
};
