import React, { useMemo, useState } from 'react';
import { Reservation, SuggestionComplaint } from '../types';
import { triggerHaptic } from '../utils/helpers';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

interface ReservationsSectionProps {
  reservations: Reservation[];
  feedbacks: SuggestionComplaint[];
  selectedMonthFilter: string;
  setSelectedMonthFilter: (val: string) => void;
  user: any;
  isAdminMode?: boolean;
  isPackageMode?: boolean;
}

export const ReservationsSection: React.FC<ReservationsSectionProps> = ({
  reservations,
  feedbacks,
  selectedMonthFilter,
  setSelectedMonthFilter,
  user,
  isAdminMode = false,
  isPackageMode = false
}) => {
  const [viewProof, setViewProof] = useState<string | null>(null);
  const [proofRotation, setProofRotation] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'feedback'>('all');
  const [hasSeenFeedback, setHasSeenFeedback] = useState(() => localStorage.getItem('hasSeenFeedbackTab') === 'true');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'Sugestão' | 'Reclamação'>('Sugestão');
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackApartment, setFeedbackApartment] = useState('');

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmittingFeedback(true);
    try {
      await addDoc(collection(db, 'feedbacks'), {
        type: feedbackType,
        subject: feedbackSubject,
        description: feedbackDescription,
        userId: user.uid,
        apartment: feedbackApartment,
        createdAt: new Date().toISOString(),
        status: 'Pendente'
      });
      setFeedbackSubject('');
      setFeedbackDescription('');
      setFeedbackApartment('');
      alert("Sua " + feedbackType.toLowerCase() + " foi enviada com sucesso para o síndico!");
    } catch (err: any) {
      alert("Erro ao enviar: " + err.message);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const filteredReservations = useMemo(() => {
    const [yearFilter, monthFilter] = selectedMonthFilter.split('-').map(Number);

    return reservations.filter(r => {
      if (!r.date) return false;

      let resDate: Date;
      if (typeof r.date === 'string') {
        if (r.date.includes('-')) {
          resDate = new Date(r.date + 'T12:00:00Z');
        } else if (r.date.includes('/')) {
          const [d, m, y] = r.date.split('/').map(Number);
          resDate = new Date(y, m - 1, d, 12, 0, 0);
        } else {
          resDate = new Date(r.date);
        }
      } else if ((r.date as any)?.toDate) {
        resDate = (r.date as any).toDate();
      } else {
        resDate = new Date(r.date);
      }

      const isValid = !isNaN(resDate.getTime());
      if (!isValid) return false;

      const matchesMonth = resDate.getFullYear() === yearFilter && (resDate.getMonth() + 1) === monthFilter;
      const matchesUser = activeTab === 'all' || r.userId === user?.uid;
      return matchesMonth && matchesUser;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [reservations, selectedMonthFilter, activeTab, user]);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = -2; i < 10; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  const ADMIN_WA = '5521964290113';

  return (
    <section className="mt-12 animate-slide-up" style={{ '--delay': '0.8s' } as any}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div className="space-y-4 flex-1 min-w-0 max-w-full">
          <div className="flex items-center gap-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white leading-tight">Reservas do Condomínio</h2>
            <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs font-bold px-3 py-1 rounded-full shrink-0">{filteredReservations.length}</span>
          </div>

          <div className="flex p-1 bg-gray-100 dark:bg-neutral-800/50 rounded-xl w-full md:w-fit overflow-x-auto no-scrollbar">
            <button
              onClick={() => { triggerHaptic(); setActiveTab('all'); }}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition whitespace-nowrap ${activeTab === 'all' ? 'bg-white dark:bg-neutral-700 shadow-sm text-green-600' : 'text-gray-500'}`}
            >
              Agenda Geral
            </button>
            <button
              onClick={() => { triggerHaptic(); setActiveTab('mine'); }}
              disabled={!user}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition disabled:opacity-30 whitespace-nowrap ${activeTab === 'mine' ? 'bg-white dark:bg-neutral-700 shadow-sm text-green-600' : 'text-gray-500'}`}
            >
              Minhas Reservas
            </button>
            <button
              onClick={() => {
                triggerHaptic();
                setActiveTab('feedback');
                if(!hasSeenFeedback) {
                  setHasSeenFeedback(true);
                  localStorage.setItem('hasSeenFeedbackTab', 'true');
                }
              }}
              disabled={!user}
              className={`relative px-6 py-2 rounded-lg text-sm font-bold transition disabled:opacity-30 whitespace-nowrap ${activeTab === 'feedback' ? 'bg-white dark:bg-neutral-700 shadow-sm text-green-600' : 'text-gray-500'}`}
            >
              Sugestões e Reclamações
              {!hasSeenFeedback && user && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse shadow-lg">NOVO</span>
              )}
            </button>
          </div>
        </div>

        {activeTab !== 'feedback' && (
          <div className="relative group min-w-[200px]">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest absolute -top-5 left-1">Filtrar por mês</label>
            <select
              value={selectedMonthFilter}
              onChange={(e) => { triggerHaptic(); setSelectedMonthFilter(e.target.value); }}
              className="w-full p-3 pr-10 border dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-900 text-gray-800 dark:text-gray-200 appearance-none focus:ring-2 focus:ring-green-500 outline-none shadow-sm transition"
            >
              {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-green-600">
              <i className="fas fa-chevron-down text-xs"></i>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'feedback' ? (
        <div className="bg-white dark:bg-neutral-900 border dark:border-white/5 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
           <div className="grid md:grid-cols-2 gap-10">
             <div>
               <h3 className="text-xl font-bold mb-4 dark:text-white flex items-center gap-2">
                 <i className="fas fa-bullhorn text-green-600"></i> Enviar Mensagem
               </h3>
               <form onSubmit={handleSubmitFeedback} className="space-y-4">
                  <div className="flex gap-4">
                    <label className="flex-1 flex items-center justify-center gap-2 p-3 border dark:border-neutral-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 transition">
                      <input type="radio" checked={feedbackType === 'Sugestão'} onChange={() => setFeedbackType('Sugestão')} className="text-green-600 focus:ring-green-500" />
                      <span className="font-bold text-sm dark:text-gray-200">Sugestão</span>
                    </label>
                    <label className="flex-1 flex items-center justify-center gap-2 p-3 border dark:border-neutral-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 transition">
                      <input type="radio" checked={feedbackType === 'Reclamação'} onChange={() => setFeedbackType('Reclamação')} className="text-red-600 focus:ring-red-500" />
                      <span className="font-bold text-sm dark:text-gray-200">Reclamação</span>
                    </label>
                  </div>
                  <div>
                    <input type="text" placeholder="Assunto (ex: Limpeza do salão)" value={feedbackSubject} onChange={e => setFeedbackSubject(e.target.value)} required className="w-full p-3 border rounded-xl dark:bg-neutral-800 dark:border-neutral-700 dark:text-white outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <input type="text" placeholder="Seu Apartamento (ex: 101)" value={feedbackApartment} onChange={e => setFeedbackApartment(e.target.value)} required className="w-full p-3 border rounded-xl dark:bg-neutral-800 dark:border-neutral-700 dark:text-white outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <textarea placeholder="Detalhe aqui sua mensagem..." value={feedbackDescription} onChange={e => setFeedbackDescription(e.target.value)} required rows={4} className="w-full p-3 border rounded-xl dark:bg-neutral-800 dark:border-neutral-700 dark:text-white outline-none focus:ring-2 focus:ring-green-500 resize-none"></textarea>
                  </div>
                  <button type="submit" disabled={isSubmittingFeedback || !feedbackSubject || !feedbackDescription || !feedbackApartment} className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition disabled:opacity-50">
                    {isSubmittingFeedback ? 'Enviando...' : 'Enviar para o Síndico'}
                  </button>
               </form>
             </div>

             <div>
               <h3 className="text-xl font-bold mb-4 dark:text-white flex items-center gap-2">
                 <i className="fas fa-history text-blue-500"></i> Meus Envios
               </h3>
               <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                 {feedbacks.filter(f => f.userId === user?.uid).length === 0 ? (
                   <p className="text-gray-500 dark:text-gray-400 text-sm italic">Nenhuma sugestão ou reclamação enviada ainda.</p>
                 ) : (
                   feedbacks.filter(f => f.userId === user?.uid).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(feedback => (
                     <div key={feedback.id} className="p-4 rounded-2xl border dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50">
                       <div className="flex justify-between items-start mb-2">
                         <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${feedback.type === 'Sugestão' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                           {feedback.type}
                         </span>
                         <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${feedback.status === 'Respondido' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                           {feedback.status}
                         </span>
                       </div>
                       <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-1">{feedback.subject}</h4>
                       <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{feedback.description}</p>

                       {feedback.adminReply && (
                         <div className="mt-3 p-3 bg-white dark:bg-neutral-900 rounded-xl border border-green-100 dark:border-green-900/30 relative">
                           <div className="absolute -top-2 left-3 bg-white dark:bg-neutral-900 px-1 text-[10px] font-bold text-green-600 flex items-center gap-1">
                             <i className="fas fa-reply"></i> Resposta do Síndico
                           </div>
                           <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{feedback.adminReply}</p>
                           {feedback.repliedAt && (
                             <p className="text-[9px] text-gray-400 mt-2 text-right">{new Date(feedback.repliedAt).toLocaleDateString('pt-BR')} às {new Date(feedback.repliedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
                           )}
                         </div>
                       )}
                       {!feedback.adminReply && (
                         <p className="text-[10px] text-gray-400 mt-2"><i className="fas fa-clock"></i> Aguardando leitura e resposta pelo síndico...</p>
                       )}
                     </div>
                   ))
                 )}
               </div>
             </div>
           </div>
        </div>
      ) : filteredReservations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReservations.map(res => {
            const isOwner = user && res.userId === user.uid;
            const canSeeSensitiveData = (isAdminMode || isOwner) && !isPackageMode;

            return (
              <div key={res.id} className="bg-white dark:bg-neutral-900 border dark:border-white/5 rounded-2xl p-6 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white">{res.spaceName}</h3>
                    <div className={`text-xs font-bold mt-1 px-2 py-0.5 rounded-full inline-block ${
                      res.status === 'Confirmado' ? 'bg-green-100 text-green-700' :
                      res.status === 'Cancelado' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {res.status}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-neutral-800 rounded-xl text-green-600">
                    <i className="fas fa-calendar-alt"></i>
                  </div>
                </div>

                {res.proofUrl && canSeeSensitiveData && res.status !== 'Cancelado' && (
                  <div className="mb-4 flex items-center gap-2 bg-green-50 dark:bg-green-900/20 p-2 rounded-lg border border-green-100 dark:border-green-900/30">
                    <i className="fas fa-check-circle text-green-600 text-xs"></i>
                    <span className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase">Comprovante enviado pelo sistema</span>
                  </div>
                )}

                <div className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                  <p className="flex items-center gap-3"><i className="fas fa-clock w-4"></i> {new Date(res.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</p>
                  <p className="flex items-center gap-3"><i className="fas fa-building w-4"></i> Apto: {res.apartment}</p>
                  <p className="flex items-center gap-3"><i className="fas fa-coins w-4"></i> R$ {res.value.toFixed(2).replace('.', ',')}</p>
                </div>

                <div className="mt-6 pt-4 border-t dark:border-white/5 space-y-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Suporte Síndico</p>
                  <div className="flex flex-wrap gap-2">
                    {res.proofUrl ? (
                      <button
                        onClick={() => setViewProof(res.proofUrl!)}
                        disabled={!canSeeSensitiveData || res.status === 'Cancelado'}
                        className={`flex-1 min-w-[120px] text-white text-[10px] font-bold py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 ${
                          (canSeeSensitiveData && res.status !== 'Cancelado') ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 dark:bg-neutral-800 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <i className={`fas ${(canSeeSensitiveData && res.status !== 'Cancelado') ? 'fa-eye' : 'fa-lock'} text-[12px]`}></i> {(canSeeSensitiveData && res.status !== 'Cancelado') ? 'Ver Comprovante' : 'Acesso Restrito'}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          alert("⚠️ ATENÇÃO: É obrigatório anexar a foto ou PDF do comprovante na conversa do WhatsApp que será aberta agora.");
                          const message = `Olá! Segue o comprovante da minha reserva: \nEspaço: ${res.spaceName}\nData: ${new Date(res.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}\nApto: ${res.apartment}\n\n[Vou anexar o arquivo do comprovante nesta conversa]`;
                          window.open(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(message)}`, '_blank');
                        }}
                        className="flex-1 min-w-[120px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[10px] font-bold py-2 px-3 rounded-lg hover:bg-green-100 transition flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-file-invoice-dollar text-[12px]"></i> Comprovante
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const message = `Olá! Gostaria de solicitar o CANCELAMENTO da minha reserva: \nEspaço: ${res.spaceName}\nData: ${new Date(res.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}\nApto: ${res.apartment}`;
                        window.open(`https://wa.me/5521964290113?text=${encodeURIComponent(message)}`, '_blank');
                      }}
                      className="flex-1 min-w-[120px] bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-[10px] font-bold py-2 px-3 rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-times-circle text-[12px]"></i> Cancelar
                    </button>
                    <button
                      onClick={() => {
                        const message = `Olá! Tenho uma dúvida sobre a reserva:\nEspaço: ${res.spaceName}\nData: ${new Date(res.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}`;
                        window.open(`https://wa.me/5521964290113?text=${encodeURIComponent(message)}`, '_blank');
                      }}
                      className="w-full bg-gray-50 dark:bg-neutral-800 text-gray-500 dark:text-gray-400 text-[10px] font-bold py-2 px-3 rounded-lg hover:bg-gray-100 transition flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-question-circle text-[12px]"></i> Outras Dúvidas
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-gray-50 dark:bg-neutral-900/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-neutral-800">
          <i className="fas fa-calendar-day text-4xl text-gray-300 dark:text-neutral-700 mb-4"></i>
          <p className="text-gray-400">Nenhuma reserva para este mês.</p>
        </div>
      )}

      {viewProof && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={() => { setViewProof(null); setProofRotation(0); }}>
          <div className="max-w-2xl w-full text-center" onClick={e => e.stopPropagation()}>
            <div className="inline-block rounded-xl border-4 border-white/10 mb-6 bg-black overflow-hidden max-w-full">
              <img src={viewProof} style={{ transform: `rotate(${proofRotation}deg)`, transition: 'transform 0.3s ease' }} className="max-h-[70vh] max-w-full object-contain mx-auto" alt="Comprovante" />
            </div>
            <div className="flex gap-4 justify-center">
              <button onClick={() => setProofRotation(prev => (prev + 90) % 360)} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 transition shadow-xl flex items-center gap-2">
                <i className="fas fa-redo"></i> Girar 90°
              </button>
              <button onClick={() => { setViewProof(null); setProofRotation(0); }} className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-gray-100 transition shadow-xl">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
