import React, { useState, useEffect, useMemo } from 'react';
import './index.css';
import ReactDOM from 'react-dom/client';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, setDoc, query, where, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';

// --- Types & Utils ---
import { User, Reservation, Space, BlockedDate, SuggestionComplaint } from './types';
import { AppRole, canAccessAdmin, canAccessPortaria, isValidRole } from './utils/authorization';
import { triggerHaptic, generatePixBRCode, formatCurrency, compressImage } from './utils/helpers';

// --- Components ---
import { Header } from './components/Header';
import { StatsBanner } from './components/StatsBanner';
import { SpaceCard } from './components/SpaceCard';
import { AdminDashboard } from './components/AdminDashboard';
import { Calendar } from './components/Calendar';
import { ReservationsSection } from './components/ReservationsSection';
import { Toast } from './components/Toast';
import { PackageManagement } from './components/PackageManagement';
import { RegistrationManagement } from './components/RegistrationManagement';
import { CopaSplash } from './components/CopaSplash';
// --- Constants ---
const RESERVATIONS_COLLECTION = 'reservations';
const BLOCKED_DATES_COLLECTION = 'blocked_dates';
const FEEDBACKS_COLLECTION = 'feedbacks';
const CONFIG_COLLECTION = 'config';
const PRICES_DOC = 'prices';
const AVAILABILITY_COLLECTION = 'availability';

const availabilityDocumentId = (spaceName: string, date: string) =>
  spaceName.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-') + '-' + date;
const SPACES_DOC = 'spaces';
const ADMIN_WHATSAPP_NUMBER = import.meta.env.VITE_ADMIN_WHATSAPP || '5521964290113';
const PIX_KEY_CNPJ_FORMATTED = import.meta.env.VITE_PIX_KEY_FORMATTED || '42.181.669/0001-77';
const PIX_KEY_CNPJ_RAW = import.meta.env.VITE_PIX_KEY_RAW || '42181669000177';

const initialPrices = {
  'Churrasqueira Superior': 81,
  'Salão de Festas': 243
};

const initialSpaces: Space[] = [
  {
    id: 1,
    name: 'Churrasqueira Superior',
    capacity: 30,
    features: ['Churrasqueira', 'Mesas e Cadeiras', 'Banheiros Próximos', 'Cozinha Apoio'],
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    icon: (props: any) => <i className={`fas fa-fire-alt text-orange-500 ${props.className || 'text-3xl'}`}></i>
  },
  {
    id: 2,
    name: 'Salão de Festas',
    capacity: 45,
    features: ['Ar Condicionado', 'Cozinha Completa', 'Área Kids', 'Equipamento de Som'],
    image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    icon: (props: any) => <i className={`fas fa-glass-cheers text-blue-500 ${props.className || 'text-3xl'}`}></i>
  }
];

const RULES_TEXT = [
  "Horário de Funcionamento: O uso do espaço é permitido exclusivamente entre 09:00 e 23:00.",
  "Lei do Silêncio: É obrigatório respeitar os níveis de ruído. Som alto é proibido em qualquer horário, devendo ser mantido em volume que não incomode os vizinhos.",
  "Limpeza e Conservação: O espaço deve ser entregue nas mesmas condições de limpeza em que foi recebido. Caso a limpeza NÃO seja realizada pelo morador, será cobrada uma taxa de R$ 100,00 repassada via boleto condominial.",
  "Danos ao Patrimônio: Qualquer dano a móveis ou equipamentos ocorrido durante o evento será de responsabilidade do morador solicitante.",
  "Capacidade Máxima: Respeitar rigorosamente o limite de capacidade (30 pessoas na Churrasqueira / 45 no Salão).",
  "Lixo: Todo o lixo produzido deve ser ensacado e depositado nos locais indicados pela administração.",
  "Proibições: Proibido o uso de pregos, fitas ou colas que danifiquem a pintura das paredes."
];

const App = () => {
  // --- State ---
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [residentSignupMode, setResidentSignupMode] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [availability, setAvailability] = useState<{ spaceName: string; date: string }[]>([]);
  const [feedbacks, setFeedbacks] = useState<SuggestionComplaint[]>([]);
  const [prices, setPrices] = useState<{ [key: string]: number }>(initialPrices);
  const [spaces, setSpaces] = useState<Space[]>(initialSpaces);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isPackageMode, setIsPackageMode] = useState(false);
  const [isRegistrationMode, setIsRegistrationMode] = useState(false);
  const [isExternalRegistration, setIsExternalRegistration] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  // Legacy invitation routes are deliberately inert; roles are provisioned server-side.
  const isInviteFlow = false;
  const showInviteWelcome = false;



  const [editSpaceModalState, setEditSpaceModalState] = useState<{ open: boolean; space: Space | null }>({ open: false, space: null });
  const [changeValuesModalOpen, setChangeValuesModalOpen] = useState(false);
  const [bookingModalState, setBookingModalState] = useState<{ open: boolean; space: Space | null }>({ open: false, space: null });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [confirmModalState, setConfirmModalState] = useState<{
    open: boolean; title: string; message: string; confirmText: string; onConfirm: (() => void) | null;
  }>({ open: false, title: '', message: '', confirmText: 'Confirmar', onConfirm: null });

  const [selectedMonthFilter, setSelectedMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [toastState, setToastState] = useState<{ open: boolean; message: string; type?: any }>({ open: false, message: '' });
  const lastPendingCountRef = React.useRef<number | null>(null);

  // --- Effects ---
  useEffect(() => {
    if (!user) { setRole(null); return; }
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      const candidate = snapshot.data()?.role;
      setRole(isValidRole(candidate) ? candidate : null);
    });
    return () => unsubscribe();
  }, [user]);


  useEffect(() => {
    setIsAdminMode(canAccessAdmin(role));
    if (!canAccessPortaria(role)) setIsPackageMode(false);
  }, [role]);

  useEffect(() => {
    const pendingCount = reservations.filter(r => r.status === 'Pendente').length;
    if (lastPendingCountRef.current !== null && pendingCount > lastPendingCountRef.current) {
       // Only alert if the admin is logged in or if it's a new pending
       setToastState({ open: true, message: `Nova reserva pendente! (${pendingCount} total)`, type: 'info' });
       triggerHaptic('medium');
    }
    lastPendingCountRef.current = pendingCount;
  }, [reservations]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('cadastro') === 'morador') {
      setResidentSignupMode(true);
      setIsSignUp(true);
      setAuthModalOpen(true);
      return;
    }
    if (searchParams.get('cadastro') === 'true') {
      setIsExternalRegistration(true);
      setIsRegistrationMode(true);
    }
  }, []);

  // showSplash agora é controlado pelo CopaSplash via onClose

  useEffect(() => {
    if (isDarkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
    else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
  }, [isDarkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, CONFIG_COLLECTION, PRICES_DOC), (snap) => {
      if (snap.exists()) {
        // Merge with initialPrices to ensure all spaces have a price
        setPrices({ ...initialPrices, ...snap.data() });
      } else if (user) {
        setDoc(doc(db, CONFIG_COLLECTION, PRICES_DOC), initialPrices);
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, CONFIG_COLLECTION, SPACES_DOC), (snap) => {
      if (snap.exists()) {
        const data = snap.data().list || [];
        const merged = initialSpaces.map(initSp => {
          const found = data.find((s: any) => s.id === initSp.id);
          if (found) {
            return {
              ...initSp,
              ...found,
              icon: initSp.icon // Mantém o ícone local (componente React)
            };
          }
          return initSp;
        });
        setSpaces(merged);
      } else if (user) {
        // Inicializa o Firestore se não existir
        const listToSave = initialSpaces.map(({ icon, ...rest }) => rest);
        setDoc(doc(db, CONFIG_COLLECTION, SPACES_DOC), { list: listToSave });
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) { setReservations([]); return; }
    const source = canAccessAdmin(role)
      ? collection(db, RESERVATIONS_COLLECTION)
      : query(collection(db, RESERVATIONS_COLLECTION), where('userId', '==', user.uid));
    const unsub = onSnapshot(source, (snap) => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation))));
    return () => unsub();
  }, [user, role]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'availability'), (snap) => setAvailability(snap.docs.map(d => ({ spaceName: d.data().spaceName, date: d.data().date }))));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, BLOCKED_DATES_COLLECTION), (snap) => {
      setBlockedDates(snap.docs.map(d => ({ id: d.id, ...d.data() } as BlockedDate)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) { setFeedbacks([]); return; }
    const source = canAccessAdmin(role)
      ? collection(db, FEEDBACKS_COLLECTION)
      : query(collection(db, FEEDBACKS_COLLECTION), where('userId', '==', user.uid));
    const unsub = onSnapshot(source, (snap) => setFeedbacks(snap.docs.map(d => ({ id: d.id, ...d.data() } as SuggestionComplaint))));
    return () => unsub();
  }, [user, role]);

  // --- Handlers ---

  const handleAuth = async (e: React.FormEvent, email: string, pass: string) => {
    e.preventDefault();
    try {
      if (isSignUp) {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, 'users', userCred.user.uid), {
          role: 'resident', email: userCred.user.email, createdAt: new Date().toISOString()
        });
      }
      else await signInWithEmailAndPassword(auth, email, pass);
      setAuthModalOpen(false);
    } catch (err: any) {
      if (isSignUp && err.code === 'auth/email-already-in-use') {
        try {
          await sendPasswordResetEmail(auth, email);
          setIsSignUp(false);
          alert('Este e-mail já possui cadastro. Enviamos um link para criar uma nova senha de acesso.');
        } catch {
          alert('Este e-mail já possui cadastro. Use Esqueci minha senha para recuperar o acesso.');
        }
        return;
      }
      alert('Erro: ' + err.message);
    }
  };

  const handleResetPassword = async () => {
    const emailInput = document.getElementById('authEmailInput') as HTMLInputElement | null;
    const email = emailInput?.value;
    if (!email) {
      alert("Por favor, digite seu e-mail no campo acima.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert("E-mail de redefinição de senha enviado! Verifique sua caixa de entrada e os lixos eletrônicos (spam).");
    } catch (err: any) {
      alert("Erro ao enviar e-mail de recuperação: " + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAdminMode(false);
      setIsPackageMode(false);
      setIsRegistrationMode(false);
      setRole(null);
      setUser(null);
    } catch (e: any) {
      alert("Erro ao sair: " + e.message);
    }
  };

  const handleOpenBookingModal = (space: Space) => {
    triggerHaptic('light');
    if (!user) { setAuthModalOpen(true); return; }
    setBookingModalState({ open: true, space });
  };

  const handleCreateReservation = async (date: string, apartment: string, proofUrl: string = '') => {
    if (!bookingModalState.space) return;
    try {
      if (!user) throw new Error('Faça login para criar uma reserva.');
      const spaceName = bookingModalState.space.name;
      const availabilityRef = doc(db, AVAILABILITY_COLLECTION, availabilityDocumentId(spaceName, date));
      const reservationRef = doc(collection(db, RESERVATIONS_COLLECTION));

      await runTransaction(db, async (transaction) => {
        const availabilitySnapshot = await transaction.get(availabilityRef);
        if (availabilitySnapshot.exists()) {
          throw new Error('Esta data acabou de ser reservada. Escolha outra data.');
        }

        transaction.set(reservationRef, {
          spaceName,
          date,
          apartment,
          status: 'Pendente',
          value: prices[spaceName] || 0,
          proofUrl,
          userId: user.uid,
          userEmail: user.email || '',
          createdAt: new Date().toISOString()
        });
        transaction.set(availabilityRef, {
          spaceName,
          date,
          status: 'reserved',
          reservationId: reservationRef.id,
          updatedAt: serverTimestamp()
        });
      });

      // WhatsApp notification to admin
      const adminMsg = `🔔 *NOVA RESERVA PARA APROVAÇÃO*\n\nUm comprovante foi enviado pelo sistema.\n\n*Espaço:* ${bookingModalState.space.name}\n*Data:* ${new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR')}\n*Apto:* ${apartment}\n\n_Por favor, acesse o painel administrativo para validar o comprovante e confirmar a reserva._`;
      window.open(`https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(adminMsg)}`, '_blank');

      setBookingModalState({ open: false, space: null });
      alert("Reserva enviada com sucesso! O síndico foi notificado para aprovação.");
    } catch (err: any) { alert("Erro: " + err.message); }
  };

  const availabilityRefForReservation = (id: string) => {
    const reservation = reservations.find(item => item.id === id);
    return reservation
      ? doc(db, AVAILABILITY_COLLECTION, availabilityDocumentId(reservation.spaceName, reservation.date))
      : null;
  };
  const confirmReservation = async (id: string, confirmedBy: string = 'Síndico') => {
    try {
      await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), {
        status: 'Confirmado',
        confirmedBy,
        confirmedAt: new Date().toISOString()
      });
    }
    catch (err) { alert("Erro ao confirmar."); }
  };

  const rejectReservation = async (id: string, confirmedBy: string = 'Síndico') => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, RESERVATIONS_COLLECTION, id), {
        status: 'Rejeitado',
        confirmedBy,
        confirmedAt: new Date().toISOString()
      });
      const availabilityRef = availabilityRefForReservation(id);
      if (availabilityRef) batch.delete(availabilityRef);
      await batch.commit();
      setToastState({ open: true, message: 'Reserva rejeitada. O registro foi mantido no histórico.', type: 'warning' });
    }
    catch (err) { alert("Erro ao rejeitar."); }
  };

  const handleDeleteReservation = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja EXCLUIR permanentemente esta reserva? Esta ação não pode ser desfeita.")) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, RESERVATIONS_COLLECTION, id));
      const availabilityRef = availabilityRefForReservation(id);
      if (availabilityRef) batch.delete(availabilityRef);
      await batch.commit();
      setToastState({ open: true, message: 'Reserva excluída permanentemente.', type: 'success' });
    } catch (err) {
      alert("Erro ao excluir reserva.");
    }
  };



  const syncAvailability = async () => {
    if (!canAccessAdmin(role)) return;
    const activeReservations = reservations.filter(reservation =>
      reservation.status !== 'Cancelado' && reservation.status !== 'Rejeitado'
    );
    if (!window.confirm(`Sincronizar ${activeReservations.length} reserva(s) ativa(s) no calendário público? Nenhum dado de morador será copiado.`)) return;

    try {
      const batch = writeBatch(db);
      activeReservations.forEach(reservation => {
        batch.set(doc(db, AVAILABILITY_COLLECTION, availabilityDocumentId(reservation.spaceName, reservation.date)), {
          spaceName: reservation.spaceName,
          date: reservation.date,
          status: 'reserved',
          reservationId: reservation.id,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      setToastState({ open: true, message: `${activeReservations.length} data(s) ativa(s) sincronizada(s) no calendário.`, type: 'success' });
    } catch (error) {
      console.error(error);
      alert('Não foi possível sincronizar o calendário. Nenhuma reserva privada foi alterada.');
    }
  };
  const handleBlockDate = async (spaceName: string, date: string, reason: string) => {
    try {
      await addDoc(collection(db, BLOCKED_DATES_COLLECTION), { spaceName, date, reason });
    } catch (e) {
      console.error(e);
      alert('Erro ao bloquear data.');
    }
  };

  const handleUnblockDate = async (id: string) => {
    try {
      await deleteDoc(doc(db, BLOCKED_DATES_COLLECTION, id));
    } catch (e) {
      console.error(e);
      alert('Erro ao desbloquear data.');
    }
  };

  const handleCancelReservation = (id: string) => {
    setConfirmModalState({
      open: true,
      title: 'Cancelar Reserva?',
      message: 'Esta reserva será marcada como cancelada e sairá da lista principal, mas os dados serão mantidos para histórico. Confirmar?',
      confirmText: 'Confirmar Cancelamento',
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, RESERVATIONS_COLLECTION, id), {
            status: 'Cancelado',
            cancelledAt: new Date().toISOString(),
            cancelledBy: user?.email || 'Admin'
          });
          const availabilityRef = availabilityRefForReservation(id);
          if (availabilityRef) batch.delete(availabilityRef);
          await batch.commit();
          setConfirmModalState({ ...confirmModalState, open: false });
          setToastState({ open: true, message: 'Reserva cancelada com sucesso.', type: 'success' });
        }
        catch (err) { alert("Erro ao cancelar."); }
      }
    });
  };
  const handleUpdateSpace = async (updatedSpace: Space) => {
    const oldSpace = spaces.find(s => s.id === updatedSpace.id);
    const newSpaces = spaces.map(s => s.id === updatedSpace.id ? updatedSpace : s);

    // If name changed, update prices too
    if (oldSpace && oldSpace.name !== updatedSpace.name) {
      const newPrices = { ...prices };
      newPrices[updatedSpace.name] = prices[oldSpace.name] || 0;
      delete newPrices[oldSpace.name];
      setPrices(newPrices);
      await setDoc(doc(db, CONFIG_COLLECTION, PRICES_DOC), newPrices);
    }

    try {
      // Salva no Firestore (removemos o ícone pois funções não são serializáveis)
      const listToSave = newSpaces.map(({ icon, ...rest }) => rest);
      await setDoc(doc(db, CONFIG_COLLECTION, SPACES_DOC), { list: listToSave });
      setEditSpaceModalState({ open: false, space: null });
      setToastState({ open: true, message: 'Espaço atualizado com sucesso!', type: 'success' });
    } catch (err) {
      alert("Erro ao salvar alterações no espaço.");
    }
  };

  const handleUpdatePrices = async (newPrices: { [key: string]: number }) => {
    try {
      await setDoc(doc(db, CONFIG_COLLECTION, PRICES_DOC), newPrices);
      setChangeValuesModalOpen(false);
      alert("Preços atualizados com sucesso!");
    } catch (err) { alert("Erro ao atualizar preços."); }
  };

  const handleReplyToFeedback = async (id: string, reply: string) => {
    try {
      await updateDoc(doc(db, FEEDBACKS_COLLECTION, id), {
        status: 'Respondido',
        adminReply: reply,
        repliedAt: new Date().toISOString()
      });
      setToastState({ open: true, message: 'Resposta enviada com sucesso!', type: 'success' });
    } catch (err: any) {
      alert("Erro ao responder: " + err.message);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta mensagem definitivamente?")) return;
    try {
      await deleteDoc(doc(db, FEEDBACKS_COLLECTION, id));
      setToastState({ open: true, message: 'Mensagem excluída com sucesso!', type: 'success' });
    } catch (err: any) {
      alert("Erro ao excluir mensagem: " + err.message);
    }
  };

  // --- Local Components ---
  const BookingModal = () => {
    const [step, setStep] = useState(1);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [apartment, setApartment] = useState('');
    const [copySuccess, setCopySuccess] = useState('');
    const [proofBase64, setProofBase64] = useState<string | null>(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [rulesAccepted, setRulesAccepted] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    if (!bookingModalState.open || !bookingModalState.space) return null;

    const pixBRCode = generatePixBRCode(PIX_KEY_CNPJ_RAW);
    const pixQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixBRCode)}`;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-end md:items-center justify-center animate-fade-in" onClick={() => setBookingModalState({ open: false, space: null })}>
        <div className="bg-white dark:bg-neutral-900 w-full max-w-lg md:rounded-2xl bottom-sheet p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold dark:text-white">{bookingModalState.space.name}</h2>
            <button onClick={() => setBookingModalState({ open: false, space: null })} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xl"></i></button>
          </div>

          {/* Stepper */}
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full ${step >= s ? 'bg-green-600' : 'bg-gray-200 dark:bg-neutral-800'}`}></div>
            ))}
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <Calendar
                space={bookingModalState.space}
                reservations={reservations}
                blockedDates={blockedDates}
                availability={availability}
                onSelectDate={setSelectedDate}
                selectedDate={selectedDate}
              />
              <div className="relative">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest absolute -top-2 left-3 bg-white dark:bg-neutral-900 px-1">Seu Apartamento</label>
                <input type="text" placeholder="Ex: 101" value={apartment} onChange={e => setApartment(e.target.value)} className="w-full p-4 border rounded-xl dark:bg-neutral-800 dark:border-neutral-700 dark:text-white outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div className="flex items-start gap-3 p-2">
                <input
                  type="checkbox"
                  id="rulesCheckbox"
                  checked={rulesAccepted}
                  onChange={e => setRulesAccepted(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="rulesCheckbox" className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                  Li e concordo com o <button type="button" onClick={() => setShowRules(true)} className="text-green-600 font-bold hover:underline">Regulamento de Uso do Espaço</button>
                </label>
              </div>

              <button disabled={!selectedDate || !apartment || !rulesAccepted} onClick={() => { triggerHaptic(); setStep(2); }} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-green-600/20 disabled:opacity-50">Continuar para Pagamento</button>
            </div>
          ) : step === 2 ? (
            <div className="text-center space-y-5">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-100 dark:border-green-800/30">
                <p className="text-sm text-green-800 dark:text-green-400 font-bold mb-1">Valor da Reserva</p>
                <p className="text-3xl font-black text-green-600">R$ {formatCurrency(prices[bookingModalState.space.name])}</p>
              </div>
              <p className="text-sm text-gray-500">Escaneie o QR Code ou copie o código Pix abaixo para realizar o pagamento.</p>
              <div className="bg-white p-4 rounded-2xl inline-block shadow-sm border border-gray-100">
                <img src={pixQrCode} className="w-48 h-48" alt="Pix" />
              </div>
              <button onClick={() => { triggerHaptic(); navigator.clipboard.writeText(pixBRCode); setCopySuccess('✅ Código Copiado!'); setTimeout(() => setCopySuccess(''), 3000); }}
                className="w-full bg-gray-100 py-4 rounded-xl dark:bg-neutral-800 dark:text-gray-300 font-bold flex items-center justify-center gap-2 transition active:scale-95">
                <i className="fas fa-copy"></i> {copySuccess || 'Copiar Pix Copia e Cola'}
              </button>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-4 text-gray-500 font-bold">Voltar</button>
                <button onClick={() => { triggerHaptic(); setStep(3); }} className="flex-[2] bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-green-600/20">Já paguei, anexar comprovante</button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <i className="fas fa-file-invoice-dollar text-blue-500 text-2xl"></i>
                </div>
                <h3 className="font-bold text-lg dark:text-white">Anexar Comprovante</h3>
                <p className="text-sm text-gray-500">Tire uma foto ou anexe o PDF/Print do seu comprovante Pix.</p>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${proofBase64 ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-gray-300 dark:border-neutral-700 hover:border-green-500 hover:bg-gray-50 dark:hover:bg-neutral-800'}`}
              >
                {isCompressing ? (
                  <div className="space-y-3">
                    <i className="fas fa-spinner fa-spin text-3xl text-green-600"></i>
                    <p className="text-sm font-bold text-green-600">Processando imagem...</p>
                  </div>
                ) : proofBase64 ? (
                  <div className="relative inline-block">
                    <img src={proofBase64} className="h-40 rounded-lg shadow-md mx-auto" alt="Comprovante" />
                    <div className="absolute -top-2 -right-2 bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center border-2 border-white"><i className="fas fa-check text-[10px]"></i></div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <i className="fas fa-camera text-4xl text-gray-400"></i>
                    <p className="text-gray-500 font-medium">Toque para selecionar a foto</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setIsCompressing(true);
                      try {
                        const base64 = await compressImage(file);
                        setProofBase64(base64);
                      } catch (err) {
                        alert("Erro ao processar imagem.");
                      } finally {
                        setIsCompressing(false);
                      }
                    }
                  }}
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-4 text-gray-500 font-bold">Voltar</button>
                <button
                  disabled={!proofBase64 || isCompressing}
                  onClick={() => handleCreateReservation(selectedDate!, apartment, proofBase64!)}
                  className="flex-[2] bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-green-600/20 disabled:opacity-50"
                >
                  Finalizar Reserva
                </button>
              </div>
            </div>
          )}
        </div>

        {showRules && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowRules(false)}>
            <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold dark:text-white">Regulamento de Uso</h3>
                <button onClick={() => setShowRules(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xl"></i></button>
              </div>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {RULES_TEXT.map((text, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => { setRulesAccepted(true); setShowRules(false); }} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold mt-6">Entendi e Aceito</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const ChangeValuesModal = () => {
    const [localPrices, setLocalPrices] = useState(prices);
    if (!changeValuesModalOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center animate-fade-in" onClick={() => setChangeValuesModalOpen(false)}>
        <div className="bg-white dark:bg-neutral-900 w-full max-w-md md:rounded-2xl bottom-sheet p-6" onClick={e => e.stopPropagation()}>
          <h2 className="text-2xl font-bold mb-6 dark:text-white">Ajustar Valores</h2>
          <div className="space-y-4">
            {spaces.map(s => (
              <div key={s.id}>
                <label className="text-sm text-gray-400 block mb-1">{s.name}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">R$</span>
                  <input
                    type="number"
                    value={localPrices[s.name]}
                    onChange={e => setLocalPrices({ ...localPrices, [s.name]: Number(e.target.value) })}
                    className="w-full pl-12 pr-4 py-4 border rounded-xl dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-4 mt-8">
              <button onClick={() => setChangeValuesModalOpen(false)} className="flex-1 py-4 text-gray-400 font-bold">Cancelar</button>
              <button onClick={() => handleUpdatePrices(localPrices)} className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold">Salvar</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleExportCSV = () => {
    if (reservations.length === 0) {
      setToastState({ open: true, message: 'Nenhuma reserva para exportar!', type: 'error' });
      return;
    }
    const headers = "Espaço,Data,Apto,Status,Valor,Criado Em\n";
    const rows = reservations.map(r =>
      `${r.spaceName},${r.date},${r.apartment},${r.status},R$ ${r.value},${r.createdAt}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `reservas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastState({ open: true, message: 'Relatório CSV exportado com sucesso!', type: 'success' });
  };

  const filteredReservations = reservations.filter(r => r.userId === user?.uid);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-neutral-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {showInviteWelcome && !user ? (
        <div className="fixed inset-0 bg-green-600 z-[40] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="bg-white/10 backdrop-blur-md p-10 rounded-3xl border border-white/20 shadow-2xl max-w-md w-full">
            <h1 className="text-3xl font-black text-white mb-4">Bem-vindo, Síndico!</h1>
            <p className="text-green-50 mb-8 leading-relaxed">
              Prepare o seu acesso administrativo para começar a gerenciar o Villa Di Trento com segurança.
            </p>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="w-full bg-white text-green-700 font-black py-4 rounded-2xl shadow-xl hover:scale-105 transition-transform"
            >
              COMEÇAR CADASTRO
            </button>
          </div>
        </div>
      ) : (
        <>
      {showSplash && (
        <CopaSplash onClose={() => setShowSplash(false)} />
      )}

      <Header
        user={user}
        role={role}
        isAdminMode={isAdminMode}
        isPackageMode={isPackageMode}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        handleLogout={handleLogout}
        setAuthModalOpen={setAuthModalOpen}
        setIsAdminMode={setIsAdminMode}
        setIsPackageMode={setIsPackageMode}
        triggerHaptic={triggerHaptic}
      />

      <main className="container mx-auto px-4 py-8">
        {isRegistrationMode && canAccessPortaria(role) ? (
          <RegistrationManagement
            isExternal={isExternalRegistration}
            onBack={isExternalRegistration ? undefined : () => setIsRegistrationMode(false)}
          />
        ) : isPackageMode ? (
          <PackageManagement role={role} onBack={() => setIsPackageMode(false)} />
        ) : (
          <div className="space-y-8">
            {!isAdminMode && <StatsBanner reservations={reservations} spaces={spaces} />}

            <AdminDashboard
              user={user}
              isAdminMode={isAdminMode}
              reservations={reservations}
              blockedDates={blockedDates}
              prices={prices}
              spaces={spaces}
              feedbacks={feedbacks}
              replyToFeedback={handleReplyToFeedback}
              handleDeleteFeedback={handleDeleteFeedback}
              setIsAdminMode={setIsAdminMode}
              confirmReservation={confirmReservation}
              handleCancelReservation={handleCancelReservation}
              rejectReservation={rejectReservation}
              handleBlockDate={handleBlockDate}
              handleUnblockDate={handleUnblockDate}
              setChangeValuesModalOpen={setChangeValuesModalOpen}
              setEditSpaceModalOpen={(space) => setEditSpaceModalState({ open: true, space })}
              setIsRegistrationMode={setIsRegistrationMode}
              handleDeleteReservation={handleDeleteReservation}
              syncAvailability={syncAvailability}
              onExportCSV={() => {
                const confirmed = reservations.filter(r => r.status === 'Confirmado');
                const headers = "Data,Espaço,Apto,Valor,Status,Confirmado Por\n";
                const csv = confirmed.map(r => `${r.date},${r.spaceName},${r.apartment},${r.value},${r.status},${r.confirmedBy || ''}`).join("\n");
                const blob = new Blob([headers + csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `reservas_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
              }}
            />

            {!isAdminMode && (
              <>
                <div className="grid md:grid-cols-2 gap-8">
                  {spaces.map(s => <SpaceCard key={s.id} space={s} delay={0.1} price={prices[s.name]} onBooking={handleOpenBookingModal} />)}
                </div>

                <ReservationsSection
                  reservations={reservations}
                  feedbacks={feedbacks}
                  selectedMonthFilter={selectedMonthFilter}
                  setSelectedMonthFilter={setSelectedMonthFilter}
                  user={user}
                  isAdminMode={isAdminMode}
                  isPackageMode={isPackageMode}
                />
              </>
            )}
          </div>
        )}
      </main>
        </>
      )}

      <BookingModal />

      {authModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">{isSignUp ? 'Criar Conta' : 'Acessar'}</h2>
            {residentSignupMode && <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">Use este link para criar seu acesso. Caso seu e-mail já exista, enviaremos a recuperação de senha.</p>}

            <form onSubmit={e => handleAuth(e, (e.target as any).email.value, (e.target as any).password.value)} className="space-y-4">
              <input id="authEmailInput" name="email" type="email" placeholder="E-mail" className="w-full p-4 border rounded-xl dark:bg-neutral-800 dark:text-white" required />
              <div className="relative w-full">
                <input name="password" type={showPassword ? "text" : "password"} placeholder="Senha" className="w-full p-4 pr-12 border rounded-xl dark:bg-neutral-800 dark:text-white" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              <button className="w-full bg-green-600 text-white py-4 rounded-xl font-bold">{isSignUp ? 'Cadastrar' : 'Entrar'}</button>
            </form>
            <div className="mt-4 text-center space-y-3 flex flex-col items-center">
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-sm text-gray-500 w-full hover:underline">
                {isSignUp ? 'Já tenho conta' : 'Não tenho conta, quero me cadastrar'}
              </button>
              {!isSignUp && (
                <button type="button" onClick={handleResetPassword} className="text-sm text-green-600 dark:text-green-500 font-semibold w-full hover:underline">
                  Esqueci minha senha
                </button>
              )}
            </div>
            {!isInviteFlow && (
              <button onClick={() => setAuthModalOpen(false)} className="mt-4 w-full text-gray-400">Fechar</button>
            )}
          </div>
        </div>
      )}

      {confirmModalState.open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl text-center">
            <h3 className="text-lg font-bold mb-2 dark:text-white">{confirmModalState.title}</h3>
            <p className="text-gray-500 mb-6">{confirmModalState.message}</p>
            <div className="flex gap-4">
              <button onClick={() => setConfirmModalState({ ...confirmModalState, open: false })} className="flex-1 py-3 text-gray-400">Cancelar</button>
              <button onClick={confirmModalState.onConfirm!} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold">{confirmModalState.confirmText}</button>
            </div>
          </div>
        </div>
      )}

      <ChangeValuesModal />

      {toastState.open && <Toast message={toastState.message} type={toastState.type} onClose={() => setToastState({ ...toastState, open: false })} />}

      {editSpaceModalState.open && editSpaceModalState.space && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4" onClick={() => setEditSpaceModalState({ open: false, space: null })}>
          <div className="bg-white dark:bg-neutral-900 w-full max-w-lg md:rounded-2xl p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4 dark:text-white">Editar Espaço</h2>
            <form onSubmit={(e: any) => {
              e.preventDefault();
              handleUpdateSpace({
                ...editSpaceModalState.space!,
                name: e.target.name.value,
                capacity: Number(e.target.capacity.value),
                image: e.target.image.value,
                features: e.target.features.value.split(',').map((f: string) => f.trim())
              });
            }} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">NOME DO ESPAÇO (Predefinido)</label>
                <input name="name" defaultValue={editSpaceModalState.space.name} disabled className="w-full p-4 border rounded-xl dark:bg-neutral-800 dark:text-white opacity-60 cursor-not-allowed" title="O nome não pode ser alterado para evitar conflito com os valores." />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-400 block mb-1">CAPACIDADE</label>
                  <input name="capacity" type="number" defaultValue={editSpaceModalState.space.capacity} placeholder="Capacidade" className="w-full p-4 border rounded-xl dark:bg-neutral-800 dark:text-white" />
                </div>
                <div className="flex-1">
                   <label className="text-xs font-bold text-gray-400 block mb-1">CARACTERÍSTICAS (Separadas por vírgula)</label>
                   <input name="features" defaultValue={editSpaceModalState.space.features.join(', ')} placeholder="Churrasqueira, Mesas..." className="w-full p-4 border rounded-xl dark:bg-neutral-800 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">URL DA IMAGEM (UNSPLASH)</label>
                <input name="image" defaultValue={editSpaceModalState.space.image} placeholder="URL da Imagem" className="w-full p-4 border rounded-xl dark:bg-neutral-800 dark:text-white" />
              </div>
              <div className="flex gap-4 mt-6">
                <button type="button" onClick={() => setEditSpaceModalState({ open: false, space: null })} className="flex-1 py-4 text-gray-400 font-bold">Cancelar</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold">Salvar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
