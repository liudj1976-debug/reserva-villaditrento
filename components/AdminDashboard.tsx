import React, { useMemo, useState } from 'react';
import { Space, Reservation, BlockedDate, SuggestionComplaint } from '../types';
import { formatCurrency, triggerHaptic } from '../utils/helpers';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AdminDashboardProps {
  user: any;
  admins: {uid: string, email: string, promotedAt: string}[];
  handleRemoveAdmin?: (uid: string) => void;
  handlePromoteSelf?: () => void;
  isAdminMode: boolean;
  reservations: Reservation[];
  blockedDates: BlockedDate[];
  prices: { [key: string]: number };
  spaces: Space[];
  feedbacks: SuggestionComplaint[];
  replyToFeedback: (id: string, reply: string) => void;
  handleDeleteFeedback: (id: string) => void;
  setIsAdminMode: (val: boolean) => void;
  confirmReservation: (id: string, adminName: string) => void;
  handleCancelReservation: (id: string) => void;
  rejectReservation: (id: string, adminName: string) => void;
  handleBlockDate: (spaceName: string, date: string, reason: string) => void;
  handleUnblockDate: (id: string) => void;
  setChangeValuesModalOpen: (val: boolean) => void;
  setEditSpaceModalOpen: (space: Space) => void;
  setIsRegistrationMode: (val: boolean) => void;
  handleDeleteReservation: (id: string) => void;
  onExportCSV: () => void;
  syncAvailability: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  admins,
  handleRemoveAdmin,
  handlePromoteSelf,
  isAdminMode,
  reservations,
  blockedDates,
  prices,
  spaces,
  feedbacks,
  replyToFeedback,
  handleDeleteFeedback,
  setIsAdminMode,
  confirmReservation,
  handleCancelReservation,
  rejectReservation,
  handleBlockDate,
  handleUnblockDate,
  setChangeValuesModalOpen,
  setEditSpaceModalOpen,
  setIsRegistrationMode,
  handleDeleteReservation,
  onExportCSV,
  syncAvailability
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [proofModal, setProofModal] = useState<string | null>(null);
  const [proofRotation, setProofRotation] = useState(0);
  const [adminName, setAdminName] = useState('');

  React.useEffect(() => {
    if (user && !adminName) {
      setAdminName(user.displayName || user.email?.split('@')[0] || '');
    }
  }, [user]);

  const monthlyReport = useMemo(() => {
    const now = new Date();
    const thisMonth = reservations.filter(r => {
      const d = new Date(r.date + 'T12:00:00Z');
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && r.status !== 'Cancelado';
    });
    return {
      total: thisMonth.length,
      pending: thisMonth.filter(r => r.status === 'Pendente').length,
      confirmed: thisMonth.filter(r => r.status === 'Confirmado').length,
      revenue: formatCurrency(thisMonth.filter(r => r.status === 'Confirmado').reduce((sum, r) => sum + r.value, 0))
    };
  }, [reservations]);

  const [chartMonthFilter, setChartMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = -12; i <= 0; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  if (!isAdminMode) return null;

  const MonthlyStatCard = ({ title, value, color, border, icon }: { title: string, value: string | number, color: string, border: string, icon?: React.ReactNode }) => (
    <div className={`p-6 rounded-2xl shadow-sm border ${border} ${color} transition-all hover:translate-y-[-2px] hover:shadow-md relative overflow-hidden group`}>
      <div className="relative z-10 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{title}</div>
      <div className="relative z-10 text-3xl font-bold dark:text-white">{value}</div>
      {icon && <div className="absolute right-[-10px] bottom-[-10px] text-6xl text-gray-200 dark:text-white/5 opacity-50 group-hover:scale-110 transition-transform">{icon}</div>}
    </div>
  );

  const RevenueChart = () => {
    const data = spaces.map(s => {
      const [yearFilter, monthFilter] = chartMonthFilter.split('-').map(Number);
      const filtered = reservations
        .filter(r => {
          if (!r.date) return false;
          let resDate: Date;
          if (typeof r.date === 'string') {
            if (r.date.includes('-')) resDate = new Date(r.date + 'T12:00:00Z');
            else if (r.date.includes('/')) {
              const [d, m, y] = r.date.split('/').map(Number);
              resDate = new Date(y, m - 1, d, 12, 0, 0);
            } else resDate = new Date(r.date);
          } else if ((r.date as any)?.toDate) resDate = (r.date as any).toDate();
          else resDate = new Date(r.date);

          return r.spaceName.toLowerCase().trim() === s.name.toLowerCase().trim() &&
                 r.status === 'Confirmado' &&
                 !isNaN(resDate.getTime()) &&
                 resDate.getFullYear() === yearFilter &&
                 (resDate.getMonth() + 1) === monthFilter;
        });
      const total = filtered.reduce((sum, r) => sum + r.value, 0);
      return { name: s.name, total, count: filtered.length };
    });

    const max = Math.max(...data.map(d => d.total), 1);
    const grandTotal = data.reduce((sum, d) => sum + d.total, 0);
    const grandCount = data.reduce((sum, d) => sum + d.count, 0);

    return (
      <div className="bg-white dark:bg-neutral-900 border dark:border-white/5 rounded-3xl p-8 mb-8 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
              <i className="fas fa-chart-line text-green-500"></i> Receita por Espaço
            </h3>
            <div className="flex gap-4 mt-1">
              <span className="text-xs font-bold text-green-600 dark:text-green-400">Total: R$ {formatCurrency(grandTotal)}</span>
              <span className="text-xs font-bold text-gray-400">{grandCount} Reservas</span>
            </div>
          </div>
          <select
            value={chartMonthFilter}
            onChange={(e) => setChartMonthFilter(e.target.value)}
            className="bg-gray-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none dark:text-white"
          >
            {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-8">
          {data.map((d, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-gray-600 dark:text-gray-300 uppercase tracking-tight">
                  {d.name} <span className="text-[10px] bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full ml-2">{d.count}x</span>
                </span>
                <span className="text-green-600 dark:text-green-400">R$ {formatCurrency(d.total)}</span>
              </div>
              <div className="h-4 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-300 rounded-full transition-all duration-1000 ease-out shadow-lg shadow-green-500/20"
                  style={{ width: `${(d.total / max) * 100}%`, transitionDelay: `${i * 0.2}s` } as any}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 my-8 animate-fade-in">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <h2 className="text-3xl font-bold dark:text-white mb-2">Painel do Síndico</h2>
          <p className="text-gray-500 dark:text-gray-400">Gerencie as reservas e valores do condomínio.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => { triggerHaptic(); setIsRegistrationMode(true); }} className="bg-blue-600/10 text-blue-700 dark:text-blue-400 font-bold py-3 px-6 rounded-xl border border-blue-200 dark:border-blue-900/50 hover:bg-blue-600/20 transition flex items-center gap-2">
            <i className="fas fa-users-cog"></i> Moradores
          </button>
          <button onClick={() => { triggerHaptic(); setChangeValuesModalOpen(true); }} className="bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-200 font-bold py-3 px-6 rounded-xl shadow-sm border dark:border-white/5 hover:bg-gray-50 transition flex items-center gap-2">
            <i className="fas fa-edit"></i> Ajustar Preços
          </button>
          <button onClick={() => { triggerHaptic(); syncAvailability(); }} className="bg-violet-600/10 text-violet-700 dark:text-violet-400 font-bold py-3 px-6 rounded-xl border border-violet-200 dark:border-violet-900/50 hover:bg-violet-600/20 transition flex items-center gap-2" title="Cria somente os marcadores públicos de data e espaço para reservas ativas já existentes">
            <i className="fas fa-calendar-check"></i> Sincronizar Calendário
          </button>          <button onClick={() => { triggerHaptic(); onExportCSV(); }} className="bg-green-600/10 text-green-700 dark:text-green-400 font-bold py-3 px-6 rounded-xl border border-green-200 dark:border-green-900/50 hover:bg-green-600/20 transition flex items-center gap-2">
            <i className="fas fa-file-export"></i> CSV
          </button>
          <button
            onClick={() => {
              triggerHaptic();
              const confirmedRes = reservations
                .filter(r => r.status === 'Confirmado')
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

              const reportMonth = chartMonthFilter;
              const [yF, mF] = reportMonth.split('-').map(Number);
              const filteredForReport = confirmedRes.filter(r => {
                if (!r.date) return false;
                let resDate: Date;
                if (typeof r.date === 'string') {
                  if (r.date.includes('-')) resDate = new Date(r.date + 'T12:00:00Z');
                  else if (r.date.includes('/')) {
                    const [d, m, y] = r.date.split('/').map(Number);
                    resDate = new Date(y, m - 1, d, 12, 0, 0);
                  } else resDate = new Date(r.date);
                } else if ((r.date as any)?.toDate) resDate = (r.date as any).toDate();
                else resDate = new Date(r.date);

                return !isNaN(resDate.getTime()) && resDate.getFullYear() === yF && (resDate.getMonth() + 1) === mF;
              });

              if (filteredForReport.length === 0) {
                alert(`Não há reservas confirmadas para ${reportMonth} para gerar o relatório.`);
                return;
              }

              const doc = new jsPDF();
              const totalRevenue = filteredForReport.reduce((sum, r) => sum + r.value, 0);

              // Agrupar por espaço
              const statsBySpace = spaces.map(s => {
                const spaceRes = filteredForReport.filter(r => r.spaceName.toLowerCase().trim() === s.name.toLowerCase().trim());
                return {
                  name: s.name,
                  count: spaceRes.length,
                  total: spaceRes.reduce((sum, r) => sum + r.value, 0)
                };
              }).sort((a, b) => b.count - a.count);

              // --- CABEÇALHO ---
              doc.setFillColor(22, 163, 74);
              doc.rect(0, 0, 210, 40, 'F');
              doc.setFontSize(22);
              doc.setTextColor(255, 255, 255);
              doc.text("Relatório de Gestão Mensal", 14, 20);
              doc.setFontSize(10);
              doc.text(`Villa Di Trento | Referência: ${reportMonth} | Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);

              // --- RESUMO FINANCEIRO ---
              doc.setTextColor(0, 0, 0);
              doc.setFontSize(14);
              doc.setFont("helvetica", "bold");
              doc.text("Resumo Financeiro", 14, 55);

              autoTable(doc, {
                startY: 60,
                head: [["Espaço", "Qtd. Reservas", "Receita Gerada"]],
                body: [
                  ...statsBySpace.map(s => [s.name, s.count, `R$ ${formatCurrency(s.total)}`]),
                  [{ content: 'TOTAL GERAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }, { content: `R$ ${formatCurrency(totalRevenue)}`, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]
                ],
                theme: 'striped',
                headStyles: { fillColor: [50, 50, 50] }
              });

              // --- GRÁFICO DE OCUPAÇÃO ---
              const chartStartY = (doc as any).lastAutoTable.finalY + 15;
              doc.setFontSize(14);
              doc.text("Ranking de Uso por Área", 14, chartStartY);

              const maxCount = Math.max(...statsBySpace.map(s => s.count), 1);
              let currentY = chartStartY + 10;

              statsBySpace.forEach((s) => {
                const barWidth = (s.count / maxCount) * 100;
                doc.setFontSize(9);
                doc.setFont("helvetica", "normal");
                doc.text(`${s.name} (${s.count})`, 14, currentY + 4);

                doc.setFillColor(22, 163, 74, 0.2);
                doc.rect(60, currentY, 100, 6, 'F');
                doc.setFillColor(22, 163, 74);
                doc.rect(60, currentY, barWidth, 6, 'F');

                currentY += 12;
              });

              // --- DETALHAMENTO ---
              const detailsStartY = currentY + 15;

              // Verifica se o detalhamento cabe na página atual, senão pula
              let tableStartY: number;
              if (detailsStartY > 240) {
                doc.addPage();
                doc.setFontSize(14);
                doc.setFont("helvetica", "bold");
                doc.text("Detalhamento das Operações", 14, 20);
                tableStartY = 25;
              } else {
                doc.setFontSize(14);
                doc.setFont("helvetica", "bold");
                doc.text("Detalhamento das Operações", 14, detailsStartY);
                tableStartY = detailsStartY + 5;
              }

              const tableColumn = ["Data", "Espaço", "Apto", "Valor", "Verificado Por"];
              const tableRows = filteredForReport.map(r => [
                new Date(r.date + 'T12:00:00Z').toLocaleDateString('pt-BR'),
                r.spaceName,
                r.apartment,
                `R$ ${formatCurrency(r.value)}`,
                r.confirmedBy || 'N/A'
              ]);

              autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: tableStartY,
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 8 }
              });

              doc.save(`gestao_villa_di_trento_${reportMonth}.pdf`);
            }}
            className="bg-amber-600/10 text-amber-700 dark:text-amber-400 font-bold py-3 px-6 rounded-xl border border-amber-200 dark:border-amber-900/50 hover:bg-amber-600/20 transition flex items-center gap-2"
          >
            <i className="fas fa-file-pdf"></i> Relatório PDF
          </button>
          <button onClick={() => { triggerHaptic(); setIsAdminMode(false); }} className="bg-red-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-red-600 transition flex items-center gap-2">
            Sair do Painel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar -mx-4 px-4 mb-8">
        <div className="flex p-1 bg-gray-100 dark:bg-neutral-800 rounded-2xl w-fit min-w-full md:min-w-0">
          <button onClick={() => setActiveTab('overview')} className={`flex-1 md:flex-none px-4 md:px-8 py-3 rounded-xl font-bold transition whitespace-nowrap ${activeTab === 'overview' ? 'bg-white dark:bg-neutral-700 shadow-sm text-green-600' : 'text-gray-500'}`}>Resumo</button>
          <button onClick={() => setActiveTab('reservations')} className={`flex-1 md:flex-none px-4 md:px-8 py-3 rounded-xl font-bold transition whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'reservations' ? 'bg-white dark:bg-neutral-700 shadow-sm text-green-600' : 'text-gray-500'}`}>
            Reservas
            {reservations.filter(r => r.status === 'Pendente').length > 0 && (
              <span className="bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full animate-bounce-subtle">
                {reservations.filter(r => r.status === 'Pendente').length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('feedbacks')} className={`flex-1 md:flex-none px-4 md:px-8 py-3 rounded-xl font-bold transition whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'feedbacks' ? 'bg-white dark:bg-neutral-700 shadow-sm text-green-600' : 'text-gray-500'}`}>
            <i className="fas fa-bullhorn text-xs"></i> Mensagens
            {feedbacks.filter(f => f.status === 'Pendente').length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full animate-pulse">
                {feedbacks.filter(f => f.status === 'Pendente').length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('maintenance')} className={`flex-1 md:flex-none px-4 md:px-8 py-3 rounded-xl font-bold transition whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'maintenance' ? 'bg-white dark:bg-neutral-700 shadow-sm text-green-600' : 'text-gray-500'}`}>
            <i className="fas fa-tools text-xs"></i> Manutenção
          </button>
          {user?.email === 'lizandro.miranda@gmail.com' && (
            <button onClick={() => setActiveTab('mandates')} className={`flex-1 md:flex-none px-4 md:px-8 py-3 rounded-xl font-bold transition whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'mandates' ? 'bg-white dark:bg-neutral-700 shadow-sm text-green-600' : 'text-gray-500'}`}>
              <i className="fas fa-user-shield text-xs"></i> Mandatos
            </button>
          )}
        </div>
      </div>

      <div className="animate-fade-in">
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MonthlyStatCard title="Total" value={monthlyReport.total} color="bg-gray-50 dark:bg-neutral-800" border="dark:border-white/5" icon={<i className="fas fa-calendar"></i>} />
              <MonthlyStatCard title="Pendentes" value={monthlyReport.pending} color="bg-amber-50 dark:bg-amber-900/10" border="border-amber-100 dark:border-amber-900/20" icon={<i className="fas fa-clock"></i>} />
              <MonthlyStatCard title="Confirmadas" value={monthlyReport.confirmed} color="bg-green-50 dark:bg-green-900/10" border="border-green-100 dark:border-green-900/20" icon={<i className="fas fa-check"></i>} />
              <MonthlyStatCard title="Receita" value={`R$ ${monthlyReport.revenue}`} color="bg-green-600 text-white" border="border-transparent" icon={<i className="fas fa-money-bill-wave"></i>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <RevenueChart />
              </div>
              <div className="space-y-6">
                {spaces.map(s => (
                  <div key={s.id} className="p-6 rounded-2xl bg-gray-50 dark:bg-neutral-800 border dark:border-white/5 relative group overflow-hidden transition-all hover:shadow-md">
                    <div className="flex justify-between items-start mb-1 relative z-10">
                      <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-widest">{s.name}</p>
                      <button onClick={() => setEditSpaceModalOpen(s)} className="text-gray-300 hover:text-green-600 transition p-1">
                        <i className="fas fa-pencil-alt text-[10px]"></i>
                      </button>
                    </div>
                    <p className="text-3xl font-bold dark:text-white">R$ {formatCurrency(prices[s.name])}</p>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                       {s.icon({ className: "text-8xl" })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reservations' && (
          <div className="animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
                <i className="fas fa-list text-green-500"></i> Histórico Completo
              </h3>
              <div className="relative w-full md:w-64">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Buscar apto ou espaço..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-neutral-800 border-none rounded-xl focus:ring-2 focus:ring-green-500 outline-none dark:text-white text-sm"
                />
              </div>
            </div>

            {reservations.filter(r =>
              r.apartment.toLowerCase().includes(searchTerm.toLowerCase()) ||
              r.spaceName.toLowerCase().includes(searchTerm.toLowerCase())
            ).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reservations.filter(r =>
                  r.apartment.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  r.spaceName.toLowerCase().includes(searchTerm.toLowerCase())
                ).sort((a,b) => (a.status === 'Pendente' ? -1 : 1)).map(res => (
                  <div key={res.id} className={`bg-gray-50 dark:bg-neutral-800/50 border rounded-2xl p-5 relative overflow-hidden group transition-all ${res.status === 'Pendente' ? 'border-amber-200 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/5' : 'dark:border-white/5'}`}>
                    {res.status === 'Pendente' && (
                      <div className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-tighter z-10 animate-pulse">Pendente</div>
                    )}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-bold text-gray-800 dark:text-white">{res.spaceName}</p>
                        <p className={`text-xs font-bold uppercase ${
                          res.status === 'Confirmado' ? 'text-green-600' :
                          res.status === 'Cancelado' ? 'text-red-500' :
                          'text-amber-500'
                        }`}>{res.status}</p>
                      </div>
                      <div className="flex gap-2">
                        {res.status === 'Pendente' && (
                          <button
                            onClick={() => {
                              triggerHaptic();
                              if (res.proofUrl) {
                                setProofModal(res.proofUrl);
                                (window as any).pendingConfirmId = res.id;
                              } else {
                                confirmReservation(res.id);
                              }
                            }}
                            className="p-2 bg-green-500 text-white hover:bg-green-600 rounded-lg shadow-sm"
                            title="Confirmar"
                          >
                            <i className="fas fa-check"></i>
                          </button>
                        )}
                        {(res.status === 'Cancelado' || res.status === 'Rejeitado') && (
                          <button onClick={() => { triggerHaptic('heavy'); handleDeleteReservation(res.id); }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Excluir Permanentemente"><i className="fas fa-trash-alt"></i></button>
                        )}
                        <button onClick={() => { triggerHaptic('heavy'); handleCancelReservation(res.id); }} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg" title="Cancelar"><i className="fas fa-ban"></i></button>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                      <p className="flex items-center gap-2"><i className="fas fa-calendar-alt w-4"></i> {new Date(res.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</p>
                      <p className="flex items-center gap-2"><i className="fas fa-home w-4"></i> Apto: {res.apartment}</p>
                      <p className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-300"><i className="fas fa-coins w-4"></i> R$ {formatCurrency(res.value)}</p>
                      {res.confirmedBy && (
                        <p className="text-[10px] text-green-600 dark:text-green-400 font-bold flex items-center gap-1 mt-1 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-md w-fit">
                          <i className="fas fa-user-check"></i> Verificado por: {res.confirmedBy}
                        </p>
                      )}
                    </div>

                    {res.proofUrl && (
                      <div className="mt-4 pt-4 border-t dark:border-white/5">
                        <button
                          onClick={() => setProofModal(res.proofUrl!)}
                          className="w-full py-2 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition flex items-center justify-center gap-2"
                        >
                          <i className="fas fa-image"></i> Ver Comprovante
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
               <p className="text-center py-20 text-gray-400">Nenhuma reserva encontrada para "{searchTerm}".</p>
            )}
          </div>
        )}

        {activeTab === 'feedbacks' && (
          <div className="animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
                <i className="fas fa-inbox text-green-500"></i> Caixa de Entrada
              </h3>
              <button
                onClick={() => {
                  triggerHaptic();
                  if (feedbacks.length === 0) {
                    alert('Nenhuma mensagem para exportar.');
                    return;
                  }
                  const doc = new jsPDF();

                  doc.setFillColor(22, 163, 74);
                  doc.rect(0, 0, 210, 30, 'F');
                  doc.setFontSize(18);
                  doc.setTextColor(255, 255, 255);
                  doc.text("Relatório de Sugestões e Reclamações", 14, 20);
                  doc.setFontSize(10);
                  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 26);

                  const tableRows = feedbacks.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(f => [
                    new Date(f.createdAt).toLocaleDateString('pt-BR'),
                    f.type,
                    f.apartment,
                    f.subject,
                    f.description,
                    f.adminReply || 'Aguardando resposta...'
                  ]);

                  autoTable(doc, {
                    startY: 35,
                    head: [["Data", "Tipo", "Apto", "Assunto", "Mensagem do Morador", "Resposta do Síndico"]],
                    body: tableRows,
                    theme: 'striped',
                    headStyles: { fillColor: [50, 50, 50] },
                    styles: { fontSize: 8 },
                    columnStyles: {
                      4: { cellWidth: 50 },
                      5: { cellWidth: 50 }
                    }
                  });

                  doc.save(`sugestoes_reclamacoes_${new Date().toISOString().split('T')[0]}.pdf`);
                }}
                className="bg-amber-600/10 text-amber-700 dark:text-amber-400 font-bold py-2 px-4 rounded-xl border border-amber-200 dark:border-amber-900/50 hover:bg-amber-600/20 transition flex items-center gap-2 text-sm"
              >
                <i className="fas fa-file-pdf"></i> Exportar Livro de Ocorrências
              </button>
            </div>

            {feedbacks.length === 0 ? (
              <p className="text-center py-20 text-gray-400 border-2 border-dashed border-gray-200 dark:border-neutral-800 rounded-3xl">Nenhuma sugestão ou reclamação recebida.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {feedbacks.sort((a,b) => {
                  if (a.status === 'Pendente' && b.status !== 'Pendente') return -1;
                  if (a.status !== 'Pendente' && b.status === 'Pendente') return 1;
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                }).map(feedback => (
                  <div key={feedback.id} className={`bg-white dark:bg-neutral-900 border rounded-2xl p-6 relative overflow-hidden group transition-all ${feedback.status === 'Pendente' ? 'border-amber-300 dark:border-amber-900 shadow-md' : 'border-gray-200 dark:border-neutral-800'}`}>
                    {feedback.status === 'Pendente' && (
                      <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-tighter shadow-sm animate-pulse">Aguardando Resposta</div>
                    )}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex gap-2">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${feedback.type === 'Sugestão' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {feedback.type}
                        </span>
                        <p className="text-xs text-gray-500 font-bold bg-gray-100 dark:bg-neutral-800 px-2 py-1 rounded-lg"><i className="fas fa-home text-green-600"></i> Apto: {feedback.apartment}</p>
                      </div>
                      <button
                        onClick={() => { triggerHaptic('heavy'); handleDeleteFeedback(feedback.id); }}
                        className="text-gray-400 hover:text-red-500 transition p-1"
                        title="Excluir Mensagem"
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>

                    <h4 className="font-bold text-gray-800 dark:text-white mb-2">{feedback.subject}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 whitespace-pre-wrap">{feedback.description}</p>
                    <p className="text-[10px] text-gray-400 mb-6 border-b dark:border-white/5 pb-4">Enviado em {new Date(feedback.createdAt).toLocaleDateString('pt-BR')} às {new Date(feedback.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>

                    {feedback.status === 'Pendente' ? (
                      <form onSubmit={(e: any) => {
                        e.preventDefault();
                        replyToFeedback(feedback.id, e.target.reply.value);
                      }} className="space-y-3">
                        <textarea name="reply" required placeholder="Escreva sua resposta para o morador..." rows={3} className="w-full p-3 bg-gray-50 dark:bg-neutral-800 border-none rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-green-500 text-sm resize-none"></textarea>
                        <button type="submit" className="w-full bg-green-600 text-white font-bold py-2 rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-600/20">Enviar Resposta</button>
                      </form>
                    ) : (
                      <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 p-4 rounded-xl">
                        <div className="text-[10px] font-bold text-green-600 dark:text-green-400 flex items-center gap-1 mb-2">
                          <i className="fas fa-check-double"></i> Você respondeu:
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{feedback.adminReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="animate-fade-in space-y-8">
            <div className="bg-white dark:bg-neutral-900 border dark:border-white/5 rounded-3xl p-8 shadow-sm">
              <h3 className="text-xl font-bold dark:text-white mb-6 flex items-center gap-2">
                <i className="fas fa-plus-circle text-green-500"></i> Bloquear Nova Data
              </h3>
              <form onSubmit={(e: any) => {
                e.preventDefault();
                handleBlockDate(e.target.space.value, e.target.date.value, e.target.reason.value);
                e.target.reset();
              }} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <select name="space" required className="bg-gray-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3 dark:text-white outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">Selecione o Espaço</option>
                  {spaces.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <input type="date" name="date" required className="bg-gray-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3 dark:text-white outline-none focus:ring-2 focus:ring-green-500" />
                <input type="text" name="reason" placeholder="Motivo (ex: Pintura)" required className="bg-gray-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3 dark:text-white outline-none focus:ring-2 focus:ring-green-500" />
                <button type="submit" className="bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition">Bloquear Data</button>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {blockedDates.length > 0 ? (
                blockedDates.map(b => (
                  <div key={b.id} className="bg-gray-50 dark:bg-neutral-800/50 border dark:border-white/5 rounded-2xl p-5 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-800 dark:text-white">{b.spaceName}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(b.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium italic mt-1">{b.reason}</p>
                    </div>
                    <button onClick={() => { triggerHaptic('heavy'); handleUnblockDate(b.id); }} className="p-3 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-xl" title="Remover Bloqueio">
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-12 text-center text-gray-400">Nenhuma manutenção agendada.</div>
              )}
            </div>
          </div>
        )}

        {false && activeTab === 'mandates' && (
          <div className="animate-fade-in space-y-6">
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-6 rounded-3xl">
              <h3 className="text-xl font-bold text-amber-900 dark:text-amber-400 mb-2 flex items-center gap-2">
                <i className="fas fa-user-shield"></i> Gestão de Mandatos (Desenvolvedor)
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-300/70">
                Esta área é exclusiva para você. Aqui você pode remover o acesso de qualquer síndico cujo mandato tenha terminado.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {admins.length === 0 ? (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-200 dark:border-white/10 rounded-3xl">
                  <i className="fas fa-user-shield text-4xl text-gray-300 dark:text-gray-700 mb-4"></i>
                  <p className="text-gray-500 dark:text-gray-400">Nenhum administrador cadastrado no banco de dados.</p>
                  <button
                    onClick={() => handlePromoteSelf && handlePromoteSelf()}
                    className="mt-4 bg-amber-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-amber-700 transition"
                  >
                    Me tornar Administrador Oficial
                  </button>
                </div>
              ) : (
                <>
                  {admins.map(admin => (
                    <div key={admin.uid} className="bg-white dark:bg-neutral-900 border dark:border-white/5 rounded-2xl p-5 shadow-sm flex justify-between items-center group">
                      <div>
                        <p className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                          {admin.email}
                          {admin.email === user.email && <span className="bg-blue-100 text-blue-600 text-[8px] px-2 py-0.5 rounded-full">VOCÊ</span>}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Início do Mandato: {new Date(admin.promotedAt).toLocaleDateString('pt-BR')}</p>
                        <p className="text-[10px] text-amber-600 font-bold mt-1 uppercase tracking-tighter">
                          Mandato de 2 anos (Expira em: {new Date(new Date(admin.promotedAt).setFullYear(new Date(admin.promotedAt).getFullYear() + 2)).toLocaleDateString('pt-BR')})
                        </p>
                      </div>
                      {admin.email !== user.email && (
                        <button
                          onClick={() => {
                            if (confirm(`Tem certeza que deseja REVOGAR o acesso de ${admin.email}? Ele não poderá mais acessar o painel.`)) {
                              handleRemoveAdmin?.(admin.uid);
                            }
                          }}
                          className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition"
                          title="Revogar Acesso"
                        >
                          <i className="fas fa-user-slash"></i>
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="col-span-full mt-4 flex justify-center">
                     <button
                      onClick={() => handlePromoteSelf && handlePromoteSelf()}
                      className="text-amber-600 border border-amber-600/30 px-6 py-2 rounded-xl text-sm font-bold hover:bg-amber-600 hover:text-white transition"
                    >
                      + Adicionar eu mesmo como Admin
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {proofModal && (
        <div className="fixed inset-0 bg-black/95 z-[70] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={() => { setProofModal(null); setProofRotation(0); (window as any).pendingConfirmId = null; }}>
          <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <div className="bg-neutral-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                <h3 className="text-white font-bold">Verificação de Comprovante</h3>
                <button onClick={() => { setProofModal(null); setProofRotation(0); (window as any).pendingConfirmId = null; }} className="text-white/50 hover:text-white"><i className="fas fa-times text-xl"></i></button>
              </div>

              <div className="p-2 bg-black/40 text-center">
                <div className="inline-block rounded-lg overflow-hidden max-w-full bg-black">
                  <img src={proofModal} style={{ transform: `rotate(${proofRotation}deg)`, transition: 'transform 0.3s ease' }} className="max-h-[50vh] max-w-full object-contain mx-auto" alt="Comprovante" />
                </div>
                <div className="mt-2 pb-1">
                  <button type="button" onClick={() => setProofRotation(prev => (prev + 90) % 360)} className="bg-white/10 hover:bg-white/20 text-white font-bold py-1.5 px-4 rounded-lg text-xs flex items-center gap-1.5 mx-auto transition">
                    <i className="fas fa-redo"></i> Girar Comprovante 90°
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {(window as any).pendingConfirmId && (
                  <div className="bg-green-600/10 border border-green-500/30 p-4 rounded-xl">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        id="verifyCheckbox"
                        className="mt-1 w-5 h-5 rounded border-white/20 bg-white/5 text-green-500 focus:ring-green-500"
                        onChange={(e) => {
                          const btn = document.getElementById('finalConfirmBtn') as HTMLButtonElement;
                          if (btn) btn.disabled = !e.target.checked;
                        }}
                      />
                      <span className="text-sm text-green-100 font-medium leading-tight group-hover:text-white transition-colors">
                        Eu verifiquei manualmente esta imagem e confirmo que é um comprovante de pagamento válido para esta reserva.
                      </span>
                    </label>
                  </div>
                )}

                {(window as any).pendingConfirmId && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/50 uppercase tracking-widest ml-1">Seu Nome (Responsável pela Verificação)</label>
                    <input
                      type="text"
                      placeholder="Digite seu nome completo"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full p-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => { setProofModal(null); setProofRotation(0); (window as any).pendingConfirmId = null; }}
                    className="flex-1 bg-white/5 text-white py-4 rounded-xl font-bold hover:bg-white/10 transition"
                  >
                    Voltar
                  </button>

                  {(window as any).pendingConfirmId && (
                    <>
                      <button
                        onClick={() => {
                          const id = (window as any).pendingConfirmId;
                          if (id) {
                            rejectReservation(id, adminName);
                            setProofModal(null);
                            setProofRotation(0);
                            (window as any).pendingConfirmId = null;
                          }
                        }}
                        className="flex-1 bg-red-500/20 text-red-500 py-4 rounded-xl font-bold hover:bg-red-500/30 transition border border-red-500/30"
                      >
                        Rejeitar
                      </button>
                      <button
                        id="finalConfirmBtn"
                        disabled={!adminName.trim()}
                        onClick={() => {
                          const id = (window as any).pendingConfirmId;
                          if (id) {
                            confirmReservation(id, adminName);
                            setProofModal(null);
                            setProofRotation(0);
                            setAdminName('');
                            (window as any).pendingConfirmId = null;
                          }
                        }}
                        className="flex-[2] bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-green-600/20 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-green-50 transition"
                      >
                        Aprovar Reserva
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
