import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { triggerHaptic } from '../utils/helpers';

interface StaffInvite {
  email: string;
  name: string;
  role: 'portaria';
  createdAt?: any;
}

interface StaffAccount {
  uid: string;
  email: string;
  role: string; // 'portaria' (ativo) ou 'revoked' (acesso revogado)
}

// Gestão de funcionários da portaria. Em vez de um e-mail fictício
// compartilhado, o síndico cadastra aqui o e-mail de cada funcionário.
// Quando essa pessoa criar a própria conta (tela "Entrar" > "Criar conta"),
// o sistema reconhece o convite e já nasce com o papel 'portaria' — tudo
// validado também pela regra do Firestore (coleção staff_invites), então
// não depende só do app confiar nisso.
//
// Um funcionário pode estar em 3 estados aqui:
//  - "Convite pendente": cadastrado, mas ainda não criou a própria conta.
//  - "Ativo": já criou a conta e tem acesso à Portaria.
//  - "Acesso revogado": já teve conta, mas o síndico revogou o acesso
//    (ele continua conseguindo logar, mas não vê mais o módulo Portaria).
export const StaffManagement: React.FC = () => {
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'staff_invites'), snap => {
      setInvites(snap.docs.map(d => ({ ...(d.data() as StaffInvite), email: d.id })));
    });
    // Pega quem já tem conta criada com papel de portaria (ativo) ou revogado,
    // pra saber qual status/ação mostrar pra cada funcionário convidado.
    const u2 = onSnapshot(
      query(collection(db, 'users'), where('role', 'in', ['portaria', 'revoked'])),
      snap => setAccounts(snap.docs.map(d => ({ uid: d.id, email: d.data().email, role: d.data().role } as StaffAccount)))
    );
    return () => { u1(); u2(); };
  }, []);

  const resetForm = () => { setName(''); setEmail(''); setEditingEmail(null); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !name.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'staff_invites', cleanEmail), {
        name: name.trim(),
        role: 'portaria',
        createdAt: serverTimestamp()
      }, { merge: true });
      resetForm();
      triggerHaptic('medium');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (inv: StaffInvite) => {
    setEditingEmail(inv.email);
    setName(inv.name);
    setEmail(inv.email);
    triggerHaptic('light');
  };

  // Convite ainda não usado: pode simplesmente excluir.
  const handleCancelInvite = async (inviteEmail: string) => {
    triggerHaptic('heavy');
    await deleteDoc(doc(db, 'staff_invites', inviteEmail));
    if (editingEmail === inviteEmail) resetForm();
  };

  // Funcionário que já criou conta: revogar não apaga o cadastro, só troca
  // o papel pra 'revoked' — ele deixa de enxergar a Portaria imediatamente,
  // mas o síndico pode reativar depois sem precisar de novo convite.
  const handleRevoke = async (uid: string) => {
    triggerHaptic('heavy');
    await updateDoc(doc(db, 'users', uid), { role: 'revoked' });
  };

  const handleReactivate = async (uid: string) => {
    triggerHaptic('medium');
    await updateDoc(doc(db, 'users', uid), { role: 'portaria' });
  };

  const accountFor = (inviteEmail: string) => accounts.find(a => a.email?.toLowerCase() === inviteEmail);

  return (
    <div className="animate-fade-in space-y-8">
      <div className="bg-white dark:bg-neutral-900 border dark:border-white/5 rounded-3xl p-8 shadow-sm">
        <h3 className="text-xl font-bold dark:text-white mb-2 flex items-center gap-2">
          <i className="fas fa-user-shield text-blue-500"></i> Funcionários da Portaria
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Cadastre aqui o e-mail de cada funcionário. Depois, peça para ele criar a própria conta
          na tela de login (com esse mesmo e-mail) — ele já entrará direto com acesso à Portaria,
          sem precisar de senha compartilhada. Se ele esquecer a senha, usa o "Esqueci minha senha"
          da própria tela de login.
        </p>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Nome do funcionário"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="bg-gray-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="email"
            placeholder="email@exemplo.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={!!editingEmail}
            required
            className="bg-gray-50 dark:bg-neutral-800 border-none rounded-xl px-4 py-3 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : editingEmail ? 'Salvar Nome' : 'Cadastrar Funcionário'}
            </button>
            {editingEmail && (
              <button type="button" onClick={resetForm} className="px-4 bg-gray-200 dark:bg-neutral-800 font-bold rounded-xl">
                Cancelar
              </button>
            )}
          </div>
        </form>
        {editingEmail && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            O e-mail não pode ser trocado aqui — só o nome. Pra trocar o e-mail do funcionário, cancele e cadastre de novo.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {invites.length > 0 ? (
          invites.map(inv => {
            const account = accountFor(inv.email);
            const status = !account ? 'pendente' : account.role === 'revoked' ? 'revogado' : 'ativo';
            return (
              <div key={inv.email} className="bg-gray-50 dark:bg-neutral-800/50 border dark:border-white/5 rounded-2xl p-5 flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-800 dark:text-white">{inv.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{inv.email}</p>
                  <p className={`text-xs font-medium italic mt-1 ${
                    status === 'ativo' ? 'text-green-600 dark:text-green-400'
                    : status === 'revogado' ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-600 dark:text-amber-400'
                  }`}>
                    {status === 'ativo' ? 'Ativo — já criou a conta' : status === 'revogado' ? 'Acesso revogado' : 'Convite pendente'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditClick(inv)}
                    className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-sm transition"
                    title="Editar nome"
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  {status === 'ativo' && account && (
                    <button
                      onClick={() => handleRevoke(account.uid)}
                      className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm transition"
                      title="Revogar acesso (ele saiu do condomínio)"
                    >
                      <i className="fas fa-user-slash"></i>
                    </button>
                  )}
                  {status === 'revogado' && account && (
                    <>
                      <button
                        onClick={() => handleReactivate(account.uid)}
                        className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-sm transition"
                        title="Reativar acesso"
                      >
                        <i className="fas fa-user-check"></i>
                      </button>
                      <button
                        onClick={() => handleCancelInvite(inv.email)}
                        className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm transition"
                        title="Remover da lista (a conta continua revogada; para reativar depois, cadastre o funcionário de novo)"
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </>
                  )}
                  {status === 'pendente' && (
                    <button
                      onClick={() => handleCancelInvite(inv.email)}
                      className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm transition"
                      title="Cancelar convite"
                    >
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-12 text-center text-gray-400">Nenhum funcionário cadastrado ainda.</div>
        )}
      </div>
    </div>
  );
};
