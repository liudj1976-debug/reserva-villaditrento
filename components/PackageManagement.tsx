import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, updateDoc, doc, deleteDoc, query, orderBy, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Resident, Package } from '../types';
import { AppRole, canAccessPortaria } from '../utils/authorization';

// ── Constants ──────────────────────────────────────────────────────────────
const STALE_DAYS = 3;
// Quantas encomendas "recentes" carregar de cada vez no Histórico (evita baixar
// o histórico inteiro do condomínio — com fotos — toda vez que a tela abre).
const HISTORY_PAGE_SIZE = 60;
const PACKAGE_TYPES = [
  'Mercado Livre', 'Amazon', 'Shopee', 'Correios PAC',
  'Correios Sedex', 'iFood / 99 Food', 'Transportadora', 'Envelope', 'Outro'
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const daysSince = (dateStr: string): number =>
  Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// ── Component ────────────────────────────────────────────────────────────────
interface Props { onBack: () => void; role: AppRole | null; }

export const PackageManagement: React.FC<Props> = ({ onBack, role }) => {

  // Data
  const [residents, setResidents] = useState<Resident[]>([]);
  const [packages, setPackages]   = useState<Package[]>([]);
  const [loading, setLoading]     = useState(true);
  const [historyLimit, setHistoryLimit]     = useState(HISTORY_PAGE_SIZE);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingMore, setLoadingMore]       = useState(false);

  // UI
  const [tab, setTab]         = useState<'dashboard' | 'new_package' | 'history' | 'residents'>('dashboard');
  const [alert, setAlert]     = useState({ msg: '', type: 'success' as 'success' | 'error' });
  const fileInputRef          = useRef<HTMLInputElement>(null);

  // Form – new package
  const [pkg, setPkg] = useState({ residentId: '', packageType: '', description: '', observations: '' });
  const [resSearch, setResSearch]       = useState('');
  const [showResDrop, setShowResDrop]   = useState(false);
  const [photoBase64, setPhotoBase64]   = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Form – residents
  const [newRes, setNewRes]         = useState({ fullName: '', apartment: '', phone: '', status: 'ativo' as const });
  const [editResId, setEditResId]   = useState<string | null>(null);
  const [resListSearch, setResListSearch] = useState('');

  // History filters
  const [hSearch, setHSearch]   = useState('');
  const [hStatus, setHStatus]   = useState<'all' | 'Recebido' | 'Notificado' | 'Entregue'>('all');
  const [hType, setHType]       = useState<string>('all');
  const [hMonth, setHMonth]     = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [useMonthFilter, setUseMonthFilter] = useState(false);

  // Modals
  const [deliveryModal, setDeliveryModal] = useState<{ open: boolean; pkg: Package | null; name: string }>(
    { open: false, pkg: null, name: '' }
  );
  const [waModal, setWaModal] = useState<{ open: boolean; pkg: Package | null; resident: Resident | null }>(
    { open: false, pkg: null, resident: null }
  );
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  // Edit Package State
  const [editPkgModal, setEditPkgModal] = useState<{ open: boolean; pkg: Package | null }>({ open: false, pkg: null });
  const [editPkgData, setEditPkgData] = useState({ residentId: '', packageType: '', description: '', observations: '' });
  const [editResSearch, setEditResSearch] = useState('');
  const [editShowResDrop, setEditShowResDrop] = useState(false);

  // ── Firebase ───────────────────────────────────────────────────────────────
  // Antes: 1 único listener buscava TODAS as encomendas já cadastradas (com foto
  // embutida em cada uma), sempre, mesmo as entregues há meses. Isso deixava a
  // tela cada vez mais lenta conforme o histórico crescia.
  //
  // Agora: 2 listeners menores e mais rápidos —
  //  1) "pendentes": todas as que ainda não foram retiradas (não tem como ter
  //     limite aqui, senão uma encomenda antiga esquecida sumiria do aviso).
  //  2) "recentes": as últimas N (paginado com "Carregar mais"), usadas pelo
  //     Histórico e pelos contadores de hoje.
  // As duas listas são combinadas (sem duplicar) na variável `packages`.
  useEffect(() => {
    const pendingMap = new Map<string, Package>();
    const recentMap  = new Map<string, Package>();

    const mergeAndSet = () => {
      const merged = new Map<string, Package>([...recentMap, ...pendingMap]);
      setPackages(Array.from(merged.values()).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)));
    };

    const u1 = onSnapshot(collection(db, 'residents'), snap =>
      setResidents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Resident))));

    const uPending = onSnapshot(
      query(collection(db, 'packages'), where('status', '!=', 'Entregue')),
      snap => {
        pendingMap.clear();
        snap.docs.forEach(d => pendingMap.set(d.id, { id: d.id, ...d.data() } as Package));
        mergeAndSet();
        setLoading(false);
      }
    );

    const uRecent = onSnapshot(
      query(collection(db, 'packages'), orderBy('receivedAt', 'desc'), limit(historyLimit)),
      snap => {
        recentMap.clear();
        snap.docs.forEach(d => recentMap.set(d.id, { id: d.id, ...d.data() } as Package));
        setHasMoreHistory(snap.docs.length >= historyLimit);
        mergeAndSet();
        setLoading(false);
        setLoadingMore(false);
      }
    );

    return () => { u1(); uPending(); uRecent(); };
  }, [historyLimit]);

  const loadMoreHistory = () => {
    setLoadingMore(true);
    setHistoryLimit(prev => prev + HISTORY_PAGE_SIZE);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const flash = (msg: string, type: 'success' | 'error' = 'success') => {
    setAlert({ msg, type });
    setTimeout(() => setAlert({ msg: '', type: 'success' }), 4000);
  };

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600; // Mais leve ainda para garantir 100% de sucesso no banco de dados e evitar travamentos na RAM do celular
        let w = img.width, h = img.height;
        if (w > h ? w > MAX : h > MAX)
          w > h ? (h = Math.round(h * MAX / w), w = MAX) : (w = Math.round(w * MAX / h), h = MAX);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.60)); // Extra compressão sem perder leitura
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('Erro ao ler a imagem da câmera.'));
      img.src = URL.createObjectURL(file);
    });

  // ── Derived ────────────────────────────────────────────────────────────────
  const today          = new Date().toISOString().split('T')[0];
  const pending        = packages.filter(p => p.status !== 'Entregue');
  const stale          = pending.filter(p => daysSince(p.receivedAt) >= STALE_DAYS);
  const totalToday     = packages.filter(p => p.receivedAt.startsWith(today)).length;
  const deliveredToday = packages.filter(p => p.status === 'Entregue' && p.deliveredAt?.startsWith(today)).length;

  const filteredRes = residents.filter(r =>
    r.status === 'ativo' &&
    (r.fullName.toLowerCase().includes(resSearch.toLowerCase()) ||
     r.apartment.toLowerCase().includes(resSearch.toLowerCase()))
  );

  const history = packages.filter(p => {
    const s = hSearch.toLowerCase();
    const matchText = p.residentName.toLowerCase().includes(s) ||
                      p.apartment.toLowerCase().includes(s) ||
                      (p.code || '').toLowerCase().includes(s) ||
                      (p.description || '').toLowerCase().includes(s);
    const matchStatus = hStatus === 'all' || p.status === hStatus;
    const matchMonth  = !useMonthFilter || p.receivedAt.startsWith(hMonth);
    const matchType   = hType === 'all' || p.packageType === hType;
    return matchText && matchStatus && matchMonth && matchType;
  });

  // Detecta se a busca é por apartamento específico
  const searchedApt = hSearch.trim().replace(/[^0-9a-zA-Z]/g, '');
  const isAptSearch = history.length > 0 && history.every(p => p.apartment.toLowerCase() === history[0].apartment.toLowerCase());

  // ── PDF Report ─────────────────────────────────────────────────────────────
  const generatePdfReport = (pkgList: Package[], title: string) => {
    const [year, month] = hMonth.split('-');
    const monthLabel = useMonthFilter
      ? new Date(Number(year), Number(month) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
      : 'Todos os Períodos';

    // Agrupar por apartamento
    const byApt: Record<string, Package[]> = {};
    pkgList.forEach(p => {
      if (!byApt[p.apartment]) byApt[p.apartment] = [];
      byApt[p.apartment].push(p);
    });

    const rows = Object.entries(byApt)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([apt, pkgs]) => {
        const delivered = pkgs.filter(p => p.status === 'Entregue').length;
        const pending   = pkgs.filter(p => p.status !== 'Entregue').length;
        const detailRows = pkgs.map(p => `
          <tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:6px 8px;font-size:12px">${fmtDate(p.receivedAt)}</td>
            <td style="padding:6px 8px;font-size:12px">${p.code || '-'}</td>
            <td style="padding:6px 8px;font-size:12px">${p.packageType || '-'}${p.description ? ' — ' + p.description : ''}</td>
            <td style="padding:6px 8px;font-size:12px">${p.residentName}</td>
            <td style="padding:6px 8px;font-size:12px;font-weight:bold;color:${p.status === 'Entregue' ? '#16a34a' : p.status === 'Notificado' ? '#d97706' : '#2563eb'}">${p.status}</td>
            <td style="padding:6px 8px;font-size:12px">${p.deliveredToName || '-'}</td>
          </tr>`);
        return `
          <div style="margin-bottom:28px;page-break-inside:avoid">
            <div style="background:#f8f8f8;border-left:4px solid #16a34a;padding:10px 14px;border-radius:4px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
              <div><strong style="font-size:16px">Apto ${apt}</strong></div>
              <div style="font-size:12px;color:#555">
                Total: <strong>${pkgs.length}</strong> &nbsp;|
                Entregues: <strong style="color:#16a34a">${delivered}</strong> &nbsp;|
                Pendentes: <strong style="color:#dc2626">${pending}</strong>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#f0fdf4">
                <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#555">Recebido em</th>
                <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#555">Código</th>
                <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#555">Tipo / Detalhe</th>
                <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#555">Morador</th>
                <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#555">Status</th>
                <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#555">Retirado por</th>
              </tr></thead>
              <tbody>${detailRows.join('')}</tbody>
            </table>
          </div>`;
      }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Relatório de Encomendas</title>
      <style>body{font-family:Arial,sans-serif;margin:0;padding:32px;color:#222}@media print{body{padding:16px}}</style>
    </head><body>
      <div style="border-bottom:3px solid #16a34a;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <h1 style="margin:0;font-size:22px">${title}</h1>
          <p style="margin:4px 0 0;color:#555;font-size:13px">Período: <strong>${monthLabel}</strong> &nbsp;|&nbsp; Condomínio Villa Di Trento</p>
        </div>
        <div style="text-align:right;font-size:12px;color:#666">
          <p style="margin:0">Emitido em: ${new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })}</p>
          <p style="margin:4px 0 0">Total de registros: <strong>${pkgList.length}</strong></p>
        </div>
      </div>
      ${rows}
      <div style="margin-top:40px;padding-top:12px;border-top:1px dashed #ccc;text-align:center;font-size:11px;color:#aaa">
        Documento interno — Portaria Villa Di Trento
      </div>
    </body></html>`;

    const win = window.open('', '_blank', 'width=1000,height=800');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 600);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  // WhatsApp: abre link → exibe confirmação → só então muda status
  const initiateWA = (p: Package, r: Resident) => {
    const isFood = p.packageType === 'iFood / 99 Food';
    const typeLabel = (p.packageType === 'Outro' && p.description)
      ? `Outro (${p.description})`
      : (p.packageType || p.description);

    const msg = isFood
      ? `🍔 *ENTREGA DE COMIDA* (Cod: ${p.code})\n\nOlá ${r.fullName}!\nSua entrega de comida (*iFood / 99 Food*) chegou na portaria do *Villa Di Trento*!\n\n⚠️ _Como se trata de alimento, por favor, retire na portaria o quanto antes para não esfriar/estragar._\n\n*Apto:* ${p.apartment}\n\n${p.photoUrl ? '_📸 Uma foto da entrega foi registrada no sistema por segurança._\n\n' : ''}Por favor, informe o código *${p.code}* ao retirar.`
      : `📦 *ENCOMENDA REGISTRADA* (Cod: ${p.code})\n\nOlá ${r.fullName}!\nSua encomenda chegou na portaria do *Villa Di Trento*.\n\n*Tipo:* ${typeLabel}\n*Apto:* ${p.apartment}\n\n${p.photoUrl ? '_📸 Uma foto da encomenda foi registrada no sistema por segurança._\n\n' : ''}Por favor, informe o código *${p.code}* ao retirar.\n\n---\n⚠️ *Nota:* Conforme a *Lei RJ 9.226/26*, as entregas devem ser recebidas na portaria para maior segurança de todos.`;

    const phone = r.phone.replace(/\D/g, '');
    const finalPhone = phone.startsWith('55') ? phone : `55${phone}`;
    window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    setWaModal({ open: true, pkg: p, resident: r });
  };

  const confirmWA = async (sent: boolean) => {
    if (sent && waModal.pkg) {
      try {
        await updateDoc(doc(db, 'packages', waModal.pkg.id), {
          status: 'Notificado',
          notifiedAt: new Date().toISOString()
        });
        flash('Morador notificado! Status atualizado ✅');
      } catch { flash('Erro ao atualizar status.', 'error'); }
    }
    setWaModal({ open: false, pkg: null, resident: null });
  };

  // Entrega: pede nome de quem retirou antes de marcar Entregue
  const confirmDelivery = async () => {
    if (!deliveryModal.pkg || !deliveryModal.name.trim()) return;
    try {
      await updateDoc(doc(db, 'packages', deliveryModal.pkg.id), {
        status: 'Entregue',
        deliveredAt: new Date().toISOString(),
        deliveredToName: deliveryModal.name.trim()
      });
      flash(`✅ Entregue! Retirado por: ${deliveryModal.name.trim()}`);
      setDeliveryModal({ open: false, pkg: null, name: '' });
    } catch { flash('Erro ao confirmar entrega.', 'error'); }
  };

  // Novo pacote: upload real no Storage → salva URL
  const handlePkgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkg.residentId || !pkg.packageType) return;
    const resident = residents.find(r => r.id === pkg.residentId);
    if (!resident) return;
    try {
      setLoading(true);

      // Usar a foto em Base64 já comprimida diretamente no Banco (em vez de usar o Storage)
      const photoUrl = photoBase64 || '';

      const pkgCode = Math.random().toString(36).substring(2, 6).toUpperCase();

      await addDoc(collection(db, 'packages'), {
        code: `VT-${pkgCode}`,
        residentId: resident.id, residentName: resident.fullName, apartment: resident.apartment,
        packageType: pkg.packageType, description: pkg.description,
        observations: pkg.observations, photoUrl,
        receivedAt: new Date().toISOString(), status: 'Recebido'
      });
      setPkg({ residentId: '', packageType: '', description: '', observations: '' });
      setResSearch(''); setPhotoBase64(null); setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      flash('Encomenda registrada com sucesso! 📦');
      setTab('dashboard');
    } catch (err: any) {
      flash(`Erro: ${err.message || 'Desconhecido'}`, 'error');
    } finally { setLoading(false); }
  };

  const handleEditPkgClick = (p: Package) => {
    setEditPkgModal({ open: true, pkg: p });
    setEditPkgData({
      residentId: p.residentId,
      packageType: p.packageType || '',
      description: p.description || '',
      observations: p.observations || ''
    });
    setEditResSearch(`${p.residentName} — Apto ${p.apartment}`);
    setEditShowResDrop(false);
  };

  const handlePkgUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPkgModal.pkg || !editPkgData.residentId || !editPkgData.packageType) return;
    const resident = residents.find(r => r.id === editPkgData.residentId);
    if (!resident) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'packages', editPkgModal.pkg.id), {
        residentId: resident.id,
        residentName: resident.fullName,
        apartment: resident.apartment,
        packageType: editPkgData.packageType,
        description: editPkgData.description,
        observations: editPkgData.observations
      });
      flash('Encomenda atualizada com sucesso! 📦');
      setEditPkgModal({ open: false, pkg: null });
    } catch (err: any) {
      flash(`Erro ao atualizar: ${err.message || 'Desconhecido'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePkgDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir permanentemente esta encomenda?')) return;
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'packages', id));
      flash('Encomenda removida com sucesso! 🗑️');
    } catch (err: any) {
      flash(`Erro ao remover: ${err.message || 'Desconhecido'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Moradores
  const handleResSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRes.fullName || !newRes.apartment || !newRes.phone) return;
    try {
      if (editResId) { await updateDoc(doc(db, 'residents', editResId), newRes); flash('Morador atualizado!'); }
      else { await addDoc(collection(db, 'residents'), newRes); flash('Morador cadastrado!'); }
      setNewRes({ fullName: '', apartment: '', phone: '', status: 'ativo' }); setEditResId(null);
    } catch { flash('Erro ao salvar morador.', 'error'); }
  };

  // Busca no banco (não só no que está carregado na tela) para garantir que
  // TODO o histórico do morador seja apagado, mesmo encomendas antigas que já
  // não estão na lista "recente" carregada por padrão.
  const handleResDelete = async (id: string) => {
    if (!window.confirm('Remover este morador e todo o histórico de encomendas?')) return;
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'packages'), where('residentId', '==', id)));
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'packages', d.id));
      }
      await deleteDoc(doc(db, 'residents', id));
      flash('Morador e histórico removidos!');
    } catch { flash('Erro ao remover morador.', 'error'); }
    finally { setLoading(false); }
  };

  const handleCleanOrphans = async () => {
    try {
      setLoading(true);
      // Varredura completa (ação administrativa pontual, não usada no dia a dia)
      const snap = await getDocs(collection(db, 'packages'));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Package));
      const orphans = all.filter(p => !residents.some(r => r.id === p.residentId));
      if (orphans.length === 0) { flash('Nenhum histórico órfão encontrado.'); return; }
      if (!window.confirm(`Apagar ${orphans.length} encomendas de ex-moradores?`)) return;
      for (const p of orphans) {
        await deleteDoc(doc(db, 'packages', p.id));
      }
      flash(`Limpeza concluída! ${orphans.length} registros apagados.`);
    } catch { flash('Erro ao limpar.', 'error'); }
    finally { setLoading(false); }
  };

  if (!canAccessPortaria(role)) { onBack(); return null; }

  // MAIN
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-slate-50 dark:bg-neutral-950 min-h-screen pt-4 pb-20 md:py-8 lg:px-4 text-gray-800 dark:text-gray-100 animate-fade-in">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 glassmorphism p-5 rounded-2xl shadow-sm border border-black/5 dark:border-white/5">
          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700 transition">
                <i className="fas fa-arrow-left"></i>
              </button>
              <div>
                <h1 className="text-2xl font-bold">📦 Portaria e Encomendas</h1>
                <p className="text-xs text-gray-500">Villa Di Trento</p>
              </div>
            </div>
</div>
          <nav className="flex bg-gray-200/50 dark:bg-neutral-800/50 p-1 rounded-xl w-full md:w-auto overflow-x-auto gap-1">
            {(['dashboard','new_package','history','residents'] as const).map(t => {
              const labels = { dashboard:'Dashboard', new_package:'Receber', history:'Histórico', residents:'Moradores' };
              const icons  = { dashboard:'fa-chart-pie', new_package:'fa-plus-circle', history:'fa-history', residents:'fa-users' };
              const hasBadge = t === 'dashboard' && stale.length > 0;
              return (
                <button key={t} onClick={() => setTab(t)}
                  className={`relative flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${tab===t?'bg-white dark:bg-neutral-700 shadow-sm text-green-700 dark:text-green-400':'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'}`}>
                  <i className={`fas ${icons[t]}`}></i>
                  <span className="hidden sm:inline">{labels[t]}</span>
                  {hasBadge && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{stale.length}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── Alert ──────────────────────────────────────────────────────── */}
        {alert.msg && (
          <div className={`p-4 rounded-xl border flex items-center gap-2 animate-slide-up ${alert.type==='success'?'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/50':'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/50'}`}>
            <i className={`fas ${alert.type==='success'?'fa-check-circle':'fa-exclamation-circle'}`}></i>{alert.msg}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            DASHBOARD
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">

            {/* Banner de alerta de encomendas atrasadas */}
            {stale.length > 0 && (
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-800/50 rounded-2xl flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-exclamation-triangle text-orange-500 text-xl"></i>
                </div>
                <div>
                  <p className="font-bold text-orange-800 dark:text-orange-300">
                    {stale.length} encomenda{stale.length>1?'s':''} parada{stale.length>1?'s':''} há mais de {STALE_DAYS} dias!
                  </p>
                  <p className="text-sm text-orange-600 dark:text-orange-400">
                    Apts: {stale.map(p=>`${p.apartment} (${daysSince(p.receivedAt)}d)`).join(' · ')}
                  </p>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label:'Recebidas Hoje', value:totalToday,        color:'blue',   icon:'fa-box' },
                { label:'Pendentes',      value:pending.length,    color:'yellow',  icon:'fa-clock' },
                { label:'Entregues Hoje', value:deliveredToday,    color:'green',   icon:'fa-check-double' },
                { label:'Atrasadas',      value:stale.length,      color: stale.length>0?'red':'gray', icon:'fa-hourglass-end' },
              ].map(({ label, value, color, icon }) => (
                <div key={label} className={`glassmorphism p-4 md:p-5 rounded-2xl border-l-4 border-l-${color}-500 flex items-center gap-4`}>
                  <div className={`p-3 bg-${color}-100 dark:bg-${color}-900/30 text-${color}-600 rounded-xl flex-shrink-0`}>
                    <i className={`fas ${icon} fa-lg`}></i>
                  </div>
                  <div>
                    <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase leading-tight">{label}</p>
                    <p className={`text-3xl font-black ${value>0&&color==='red'?'text-red-600':''}`}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Lista de pendentes */}
            {pending.length > 0 ? (
              <div className="glassmorphism p-6 rounded-2xl border border-black/5 dark:border-white/5">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <i className="fas fa-inbox text-yellow-500"></i>
                  Aguardando Retirada
                  <span className="text-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full font-bold">{pending.length}</span>
                </h2>
                <div className="space-y-3">
                  {pending.map(p => {
                    const res   = residents.find(r => r.id === p.residentId);
                    const days  = daysSince(p.receivedAt);
                    const old   = days >= STALE_DAYS;
                    return (
                      <div key={p.id} className={`p-4 rounded-xl border flex items-center gap-4 transition ${old?'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30':'bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800'}`}>
                        {p.photoUrl
                          ? <img src={p.photoUrl} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 shadow-sm border cursor-pointer hover:opacity-80 transition" alt="" onClick={() => setPhotoModal(p.photoUrl)} />
                          : <div className="w-14 h-14 bg-gray-100 dark:bg-neutral-800 rounded-xl flex items-center justify-center flex-shrink-0"><i className="fas fa-box text-gray-400 text-xl"></i></div>}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <p className="font-bold truncate">{p.residentName}</p>
                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-bold flex-shrink-0">Apto {p.apartment}</span>
                            {p.code && <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-black border border-indigo-200 dark:border-indigo-800">{p.code}</span>}
                            {p.notifiedAt && <span className="text-xs text-green-600 dark:text-green-400 font-medium"><i className="fab fa-whatsapp mr-1"></i>Notif. {fmtDate(p.notifiedAt)}</span>}
                          </div>
                          <p className="text-sm text-gray-500 truncate">{p.packageType || p.description}</p>
                          <p className={`text-xs mt-1 font-semibold ${old?'text-red-500':'text-gray-400'}`}>
                            <i className={`fas ${old?'fa-exclamation-triangle':'fa-clock'} mr-1`}></i>
                            {days===0 ? 'Chegou hoje' : `Há ${days} dia${days>1?'s':''}`}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <div className="flex gap-2">
                            {res && (
                              <button onClick={() => initiateWA(p, res)} title="Avisar via WhatsApp"
                                className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-sm transition">
                                <i className="fab fa-whatsapp"></i>
                              </button>
                            )}
                            <button onClick={() => setDeliveryModal({ open:true, pkg:p, name:'' })} title="Registrar Entrega"
                              className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-sm transition">
                              <i className="fas fa-check"></i>
                            </button>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => handleEditPkgClick(p)} title="Editar Encomenda"
                              className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-sm transition">
                              <i className="fas fa-edit"></i>
                            </button>
                            <button onClick={() => handlePkgDelete(p.id)} title="Excluir Encomenda"
                              className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm transition">
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="glassmorphism p-12 rounded-2xl text-center">
                <i className="fas fa-check-circle text-5xl text-green-500 mb-4 block"></i>
                <p className="text-xl font-bold text-gray-700 dark:text-gray-300">Tudo em dia!</p>
                <p className="text-gray-500 mt-1">Nenhuma encomenda aguardando retirada.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            REGISTRAR ENCOMENDA
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'new_package' && (
          <div className="glassmorphism p-6 md:p-8 rounded-2xl shadow-sm border border-black/5 dark:border-white/5 animate-fade-in max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><i className="fas fa-box-open text-green-600"></i> Registrar Nova Encomenda</h2>
            <form onSubmit={handlePkgSubmit} className="space-y-5">

              {/* Autocomplete Morador */}
              <div className="relative">
                <label className="block text-sm font-bold text-gray-500 mb-2">Morador *</label>
                <div className="relative">
                  <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10"></i>
                  <input type="text" value={resSearch}
                    onChange={e => { setResSearch(e.target.value); setPkg({...pkg, residentId:''}); setShowResDrop(true); }}
                    onFocus={() => setShowResDrop(true)}
                    placeholder="Nome ou número do apartamento..."
                    readOnly={!!pkg.residentId}
                    className="w-full pl-12 pr-10 py-4 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-green-500 outline-none" />
                  {pkg.residentId && (
                    <button type="button" onClick={() => { setPkg({...pkg,residentId:''}); setResSearch(''); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition">
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
                {/* Dropdown autocomplete */}
                {showResDrop && !pkg.residentId && resSearch && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                    {filteredRes.length === 0
                      ? <p className="p-4 text-gray-500 text-sm">Nenhum morador encontrado.</p>
                      : filteredRes.map(r => (
                        <button key={r.id} type="button"
                          onClick={() => { setPkg({...pkg, residentId:r.id}); setResSearch(`${r.fullName} — Apto ${r.apartment}`); setShowResDrop(false); }}
                          className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-neutral-700 transition flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0">{r.apartment}</div>
                          <div><p className="font-bold">{r.fullName}</p><p className="text-xs text-gray-500">{r.phone}</p></div>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">Tipo de Encomenda *</label>
                <div className="flex flex-wrap gap-2">
                  {PACKAGE_TYPES.map(type => (
                    <button key={type} type="button" onClick={() => setPkg({...pkg, packageType:type})}
                      className={`flex-1 sm:flex-none min-w-[30%] sm:min-w-0 py-2 sm:py-2.5 px-3 rounded-xl border-2 text-[11px] sm:text-xs font-bold transition text-center leading-tight break-words flex items-center justify-center ${pkg.packageType===type?'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400':'border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-400 hover:border-green-300'}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detalhes */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">
                  Detalhes adicionais {pkg.packageType === 'Outro' ? <span className="text-orange-600 font-bold animate-pulse">(Obrigatório para 'Outro')</span> : <span className="font-normal">(opcional)</span>}
                </label>
                <input type="text" value={pkg.description} onChange={e => setPkg({...pkg, description:e.target.value})}
                  placeholder={pkg.packageType === 'Outro' ? "Descreva o que chegou (ex: 3 Caixas de Sapato)..." : "Ex: Caixa grande, 2 volumes, frágil..."}
                  className={`w-full p-4 border rounded-xl bg-white dark:bg-neutral-800 outline-none transition-all ${pkg.packageType === 'Outro' && !pkg.description ? 'border-orange-500 ring-2 ring-orange-100 dark:ring-orange-900/20' : 'dark:border-neutral-700 focus:ring-2 focus:ring-green-500'}`} />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">Observações <span className="font-normal">(opcional)</span></label>
                <textarea value={pkg.observations} onChange={e => setPkg({...pkg, observations:e.target.value})}
                  placeholder="Ex: Embalagem chegou amassada, entregador não aguardou assinar..."
                  rows={2} className="w-full p-4 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-green-500 outline-none resize-none" />
              </div>

              {/* Foto */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">Foto da Encomenda <span className="font-normal">(recomendada)</span></label>
                <div className="border-2 border-dashed border-gray-300 dark:border-neutral-700 rounded-xl p-6 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
                  onClick={() => fileInputRef.current?.click()}>
                  {isCompressing
                    ? <div className="py-10 space-y-3"><i className="fas fa-spinner fa-spin fa-3x text-green-500"></i><p className="text-green-600 font-bold animate-pulse">Processando alta resolução da câmera...</p></div>
                    : photoBase64
                      ? <div className="relative"><img src={photoBase64} className="mx-auto h-40 object-cover rounded-md" alt="" /><span className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-bold"><i className="fas fa-check mr-1"></i>Foto reduzida com sucesso!</span></div>
                      : <div className="space-y-2"><i className="fas fa-camera fa-3x text-gray-400"></i><p className="text-gray-500 font-medium">Toque para tirar foto ou fazer upload</p></div>
                  }
                  <input type="file" accept="image/*" className="hidden" ref={fileInputRef} capture="environment"
                    onChange={async e => {
                      if (e.target.files?.[0]) {
                        setIsCompressing(true);
                        try {
                          const base64 = await compressImage(e.target.files[0]);
                          setPhotoBase64(base64);
                        } catch (err) {
                          flash('Erro ao carregar a foto do celular.', 'error');
                        } finally {
                          setIsCompressing(false);
                        }
                      }
                    }} />
                </div>
              </div>

              <button disabled={loading || isCompressing || !pkg.residentId || !pkg.packageType || (pkg.packageType === 'Outro' && !pkg.description.trim())}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg shadow-md transition disabled:opacity-50 flex justify-center items-center gap-2">
                {loading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-save"></i> Registrar Encomenda</>}
              </button>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            HISTÓRICO
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'history' && (
          <div className="glassmorphism p-6 rounded-2xl shadow-sm border border-black/5 dark:border-white/5 animate-fade-in space-y-5">
            {/* Cabeçalho + filtros */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <i className="fas fa-history text-indigo-500"></i> Histórico
                  <button onClick={handleCleanOrphans}
                    className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-1 rounded-full hover:bg-red-200 transition font-bold">
                    <i className="fas fa-broom mr-1"></i>Limpar Órfãs
                  </button>
                </h2>
                {/* Botão PDF geral */}
                <button
                  disabled={history.length === 0}
                  onClick={() => generatePdfReport(history, 'Relatório Geral de Encomendas')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition disabled:opacity-40 flex-shrink-0 shadow-sm">
                  <i className="fas fa-file-pdf"></i>
                  <span>Gerar PDF Geral</span>
                  <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{history.length}</span>
                </button>
              </div>

              {/* Filtros */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                  <input type="text" value={hSearch} onChange={e => setHSearch(e.target.value)}
                    placeholder="Buscar morador, apartamento, código..." className="pl-9 p-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 outline-none w-full" />
                </div>
                <select value={hStatus} onChange={(e:any) => setHStatus(e.target.value)}
                  className="p-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 outline-none w-full sm:w-44">
                  <option value="all">Todos os status</option>
                  <option value="Recebido">Recebidos</option>
                  <option value="Notificado">Notificados</option>
                  <option value="Entregue">Entregues</option>
                </select>
                <select value={hType} onChange={e => setHType(e.target.value)}
                  className="p-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 outline-none w-full sm:w-44">
                  <option value="all">Todos os tipos</option>
                  {PACKAGE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2 p-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 w-full sm:w-auto">
                  <input type="checkbox" id="useMonth" checked={useMonthFilter} onChange={e => setUseMonthFilter(e.target.checked)} className="w-4 h-4 accent-green-600" />
                  <label htmlFor="useMonth" className="text-sm font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap">Mês:</label>
                  <input type="month" value={hMonth} onChange={e => setHMonth(e.target.value)}
                    disabled={!useMonthFilter}
                    className="bg-transparent outline-none text-sm disabled:opacity-40" />
                </div>
              </div>

              {/* Botão PDF por apartamento quando busca é específica */}
              {isAptSearch && history.length > 0 && (
                <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/40 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                      <i className="fas fa-building"></i>
                    </div>
                    <div>
                      <p className="font-bold text-indigo-800 dark:text-indigo-300">Apto {history[0].apartment}</p>
                      <p className="text-xs text-indigo-600 dark:text-indigo-400">{history.length} encomenda{history.length > 1 ? 's' : ''} encontrada{history.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => generatePdfReport(history, `Relatório de Encomendas — Apto ${history[0].apartment}`)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition shadow-sm">
                    <i className="fas fa-file-pdf"></i> PDF deste Apto
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {history.map(p => {
                const res  = residents.find(r => r.id === p.residentId);
                const days = daysSince(p.receivedAt);
                const old  = p.status !== 'Entregue' && days >= STALE_DAYS;
                return (
                  <div key={p.id} className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-4 transition ${old?'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30':'bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800'}`}>
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {p.photoUrl
                        ? <img src={p.photoUrl} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 shadow-sm border cursor-pointer hover:opacity-80 transition" alt="" onClick={() => setPhotoModal(p.photoUrl)} />
                        : <div className="w-16 h-16 bg-gray-100 dark:bg-neutral-800 rounded-xl flex items-center justify-center flex-shrink-0"><i className="fas fa-box text-gray-400 text-2xl"></i></div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="font-bold">{p.residentName}</p>
                          <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-bold">Apto {p.apartment}</span>
                          {p.code && <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-black border border-indigo-200 dark:border-indigo-800">{p.code}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.status==='Recebido'?'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400':p.status==='Notificado'?'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400':'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>{p.status}</span>
                          {old && <span className="text-xs bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-2 py-0.5 rounded-full font-bold"><i className="fas fa-hourglass-end mr-1"></i>{days}d sem retirada</span>}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {p.packageType ? <><strong>{p.packageType}</strong>{p.description ? ` — ${p.description}` : ''}</> : p.description}
                        </p>
                        {p.observations && <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-1"><i className="fas fa-sticky-note"></i>{p.observations}</p>}
                        <div className="text-xs text-gray-400 mt-1.5 space-y-0.5">
                          <p><i className="fas fa-calendar-alt mr-1"></i>Recebido em {fmtDate(p.receivedAt)}</p>
                          {p.notifiedAt && <p className="text-green-600 dark:text-green-400"><i className="fab fa-whatsapp mr-1"></i>Notificado em {fmtDate(p.notifiedAt)}</p>}
                          {p.deliveredToName && <p className="text-blue-600 dark:text-blue-400 font-semibold"><i className="fas fa-user-check mr-1"></i>Retirado por: {p.deliveredToName}</p>}
                          {p.deliveredAt && <p className="text-gray-500"><i className="fas fa-check-double mr-1"></i>Em {fmtDate(p.deliveredAt)}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="flex sm:flex-col gap-2 justify-end sm:ml-2 flex-shrink-0">
                      {p.status !== 'Entregue' && (
                        <div className="flex gap-2 mb-2 sm:mb-0">
                          {res && <button onClick={() => initiateWA(p, res)} title="Avisar WhatsApp"
                            className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-sm transition"><i className="fab fa-whatsapp"></i></button>}
                          <button onClick={() => setDeliveryModal({ open:true, pkg:p, name:'' })} title="Registrar Entrega"
                            className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-sm transition"><i className="fas fa-check"></i></button>
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleEditPkgClick(p)} title="Editar Encomenda"
                          className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-sm transition"><i className="fas fa-edit"></i></button>
                        <button onClick={() => handlePkgDelete(p.id)} title="Excluir Encomenda"
                          className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm transition"><i className="fas fa-trash"></i></button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {history.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  <i className="fas fa-search text-4xl mb-4 block text-gray-300"></i>
                  <p>Nenhuma encomenda encontrada.</p>
                </div>
              )}
              {history.length > 0 && hasMoreHistory && (
                <div className="pt-2 text-center">
                  <button onClick={loadMoreHistory} disabled={loadingMore}
                    className="px-6 py-3 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition disabled:opacity-50 text-sm">
                    {loadingMore ? <><i className="fas fa-spinner fa-spin mr-2"></i>Carregando...</> : <><i className="fas fa-history mr-2"></i>Carregar encomendas mais antigas</>}
                  </button>
                  <p className="text-xs text-gray-400 mt-2">Mostrando as {packages.length} encomendas mais recentes. A busca acima funciona apenas dentro do que já foi carregado.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MORADORES
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'residents' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            <div className="lg:col-span-1">
              <div className="glassmorphism p-6 rounded-2xl shadow-sm border border-black/5 dark:border-white/5 sticky top-24">
                <h2 className="text-xl font-bold mb-4">{editResId ? 'Editar Morador' : 'Adicionar Morador'}</h2>
                <form onSubmit={handleResSave} className="space-y-4">
                  <input required type="text" value={newRes.fullName} onChange={e => setNewRes({...newRes, fullName:e.target.value})} placeholder="Nome Completo" className="w-full p-4 border rounded-xl bg-white dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-green-500" />
                  <input required type="text" value={newRes.apartment} onChange={e => setNewRes({...newRes, apartment:e.target.value})} placeholder="Apartamento (Ex: 101)" className="w-full p-4 border rounded-xl bg-white dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-green-500" />
                  <input required type="tel" value={newRes.phone} onChange={e => setNewRes({...newRes, phone:e.target.value})} placeholder="WhatsApp com DDD" className="w-full p-4 border rounded-xl bg-white dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-green-500" />
                  <select value={newRes.status} onChange={e => setNewRes({...newRes, status:e.target.value as any})} className="w-full p-4 border rounded-xl bg-white dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-green-500">
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 transition">{editResId ? 'Salvar Alterações' : 'Cadastrar'}</button>
                    {editResId && <button type="button" onClick={() => { setEditResId(null); setNewRes({ fullName:'', apartment:'', phone:'', status:'ativo' }); }} className="px-4 bg-gray-200 dark:bg-neutral-800 font-bold rounded-xl">Cancelar</button>}
                  </div>
                </form>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="glassmorphism p-6 rounded-2xl shadow-sm border border-black/5 dark:border-white/5 h-full flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <h2 className="text-xl font-bold">Lista de Moradores ({residents.length})</h2>
                  <div className="relative w-full sm:w-64">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input type="text" value={resListSearch} onChange={e => setResListSearch(e.target.value)}
                      placeholder="Buscar apto ou nome..."
                      className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-gray-50 dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-green-500 outline-none" />
                  </div>
                </div>
                <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 max-h-[600px]">
                  {residents
                    .filter(r =>
                      r.fullName.toLowerCase().includes(resListSearch.toLowerCase()) ||
                      r.apartment.toLowerCase().includes(resListSearch.toLowerCase())
                    )
                    .map(r => (
                    <div key={r.id} className="p-4 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-xl flex items-center justify-between group hover:shadow-md transition">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 ${r.status==='ativo'?'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400':'bg-gray-100 dark:bg-neutral-800 text-gray-400'} rounded-full flex items-center justify-center font-bold`}>{r.apartment}</div>
                        <div>
                          <p className="font-bold">{r.fullName}</p>
                          <p className="text-sm text-gray-500">{r.phone}</p>
                          {r.status === 'inativo' && <span className="text-xs text-gray-400 font-semibold">Inativo</span>}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition flex gap-2">
                        <button onClick={() => { setNewRes({ fullName:r.fullName, apartment:r.apartment, phone:r.phone, status:r.status }); setEditResId(r.id); }} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-neutral-800 hover:bg-blue-100 hover:text-blue-600 transition flex items-center justify-center"><i className="fas fa-edit"></i></button>
                        <button onClick={() => handleResDelete(r.id)} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-neutral-800 hover:bg-red-100 hover:text-red-600 transition flex items-center justify-center"><i className="fas fa-trash"></i></button>
                      </div>
                    </div>
                  ))}
                  {residents.length === 0 && <p className="text-center text-gray-500 py-8">Nenhum morador cadastrado.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL — COMPROVANTE DE ENTREGA
      ════════════════════════════════════════════════════════════════════ */}
      {deliveryModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeliveryModal({open:false,pkg:null,name:''})}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-user-check text-blue-500 text-2xl"></i>
              </div>
              <h3 className="text-xl font-black dark:text-white">Registrar Entrega</h3>
              <p className="text-sm text-gray-500 mt-1">
                Encomenda de <strong>{deliveryModal.pkg?.residentName}</strong> — Apto {deliveryModal.pkg?.apartment}
              </p>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-bold text-gray-500 mb-2">Nome de quem está retirando *</label>
              <input type="text" value={deliveryModal.name} onChange={e => setDeliveryModal({...deliveryModal, name:e.target.value})}
                placeholder="Ex: João Silva (morador), Maria Souza (autorizada)..."
                className="w-full p-4 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><i className="fas fa-shield-alt text-blue-400"></i>Este registro protege o porteiro em caso de disputas.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeliveryModal({open:false,pkg:null,name:''})} className="flex-1 py-4 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-xl transition">Cancelar</button>
              <button disabled={!deliveryModal.name.trim()} onClick={confirmDelivery}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-40">
                <i className="fas fa-check mr-2"></i>Confirmar Entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL — CONFIRMAÇÃO DO WHATSAPP
      ════════════════════════════════════════════════════════════════════ */}
      {waModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in">
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <i className="fab fa-whatsapp text-green-500 text-3xl"></i>
              </div>
              <h3 className="text-lg font-black dark:text-white">Mensagem Enviada?</h3>
              <p className="text-sm text-gray-500 mt-1">Você conseguiu enviar o aviso para <strong>{waModal.resident?.fullName}</strong>?</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => confirmWA(false)}
                className="flex-1 py-3.5 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-neutral-700 transition">
                <i className="fas fa-times mr-2"></i>Não enviou
              </button>
              <button onClick={() => confirmWA(true)}
                className="flex-1 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition">
                <i className="fas fa-check mr-2"></i>Sim, enviou!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL — FOTO AMPLIADA
      ════════════════════════════════════════════════════════════════════ */}
      {photoModal && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={() => setPhotoModal(null)}>
          <button className="absolute top-4 right-4 text-white w-12 h-12 flex items-center justify-center hover:bg-white/10 rounded-full transition" onClick={() => setPhotoModal(null)}>
            <i className="fas fa-times text-2xl"></i>
          </button>
          <img src={photoModal} className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" alt="Encomenda" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL — EDITAR ENCOMENDA
      ════════════════════════════════════════════════════════════════════ */}
      {editPkgModal.open && editPkgModal.pkg && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setEditPkgModal({ open: false, pkg: null })}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-fade-in my-8" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-edit text-amber-600 text-2xl"></i>
              </div>
              <h3 className="text-xl font-black dark:text-white">Editar Encomenda</h3>
              <p className="text-sm text-gray-500 mt-1">Código: <strong>{editPkgModal.pkg.code}</strong></p>
            </div>

            <form onSubmit={handlePkgUpdate} className="space-y-4">
              {/* Autocomplete Morador */}
              <div className="relative">
                <label className="block text-sm font-bold text-gray-500 mb-1">Morador *</label>
                <div className="relative">
                  <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10"></i>
                  <input type="text" value={editResSearch}
                    onChange={e => { setEditResSearch(e.target.value); setEditPkgData({...editPkgData, residentId:''}); setEditShowResDrop(true); }}
                    onFocus={() => setEditShowResDrop(true)}
                    placeholder="Nome ou número do apartamento..."
                    readOnly={!!editPkgData.residentId}
                    className="w-full pl-12 pr-10 py-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-amber-500 outline-none text-sm" />
                  {editPkgData.residentId && (
                    <button type="button" onClick={() => { setEditPkgData({...editPkgData, residentId:''}); setEditResSearch(''); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition">
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
                {editShowResDrop && !editPkgData.residentId && editResSearch && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {residents.filter(r => r.status === 'ativo' && (r.fullName.toLowerCase().includes(editResSearch.toLowerCase()) || r.apartment.toLowerCase().includes(editResSearch.toLowerCase()))).length === 0
                      ? <p className="p-3 text-gray-500 text-xs">Nenhum morador encontrado.</p>
                      : residents
                          .filter(r => r.status === 'ativo' && (r.fullName.toLowerCase().includes(editResSearch.toLowerCase()) || r.apartment.toLowerCase().includes(editResSearch.toLowerCase())))
                          .map(r => (
                            <button key={r.id} type="button"
                              onClick={() => { setEditPkgData({...editPkgData, residentId:r.id}); setEditResSearch(`${r.fullName} — Apto ${r.apartment}`); setEditShowResDrop(false); }}
                              className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-neutral-700 transition flex items-center gap-3 text-sm">
                              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0">{r.apartment}</div>
                              <div><p className="font-bold">{r.fullName}</p></div>
                            </button>
                          ))
                    }
                  </div>
                )}
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-1">Tipo de Encomenda *</label>
                <div className="flex flex-wrap gap-1.5">
                  {PACKAGE_TYPES.map(type => (
                    <button key={type} type="button" onClick={() => setEditPkgData({...editPkgData, packageType:type})}
                      className={`py-1.5 px-2.5 rounded-lg border text-[10px] sm:text-xs font-bold transition text-center leading-tight ${editPkgData.packageType===type?'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400':'border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-400 hover:border-amber-300'}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detalhes */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-1">
                  Detalhes adicionais {editPkgData.packageType === 'Outro' ? <span className="text-orange-600 font-bold">(Obrigatório para 'Outro')</span> : <span className="font-normal">(opcional)</span>}
                </label>
                <input type="text" value={editPkgData.description} onChange={e => setEditPkgData({...editPkgData, description:e.target.value})}
                  placeholder={editPkgData.packageType === 'Outro' ? "Descreva o que chegou..." : "Ex: Caixa grande, 2 volumes..."}
                  className="w-full p-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-amber-500 outline-none text-sm" />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-1">Observações <span className="font-normal">(opcional)</span></label>
                <textarea value={editPkgData.observations} onChange={e => setEditPkgData({...editPkgData, observations:e.target.value})}
                  placeholder="Ex: Embalagem danificada..."
                  rows={2} className="w-full p-3 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-amber-500 outline-none resize-none text-sm" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditPkgModal({ open: false, pkg: null })} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-xl transition text-sm">Cancelar</button>
                <button type="submit" disabled={loading || !editPkgData.residentId || !editPkgData.packageType || (editPkgData.packageType === 'Outro' && !editPkgData.description.trim())}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition disabled:opacity-40 text-sm">
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
