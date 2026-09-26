import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';

let env;
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const projectId = 'villa-di-trento-security-test';

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/sindico-1'), { role: 'sindico', email: 'sindico@example.test' });
    await setDoc(doc(db, 'users/portaria-1'), { role: 'portaria', email: 'portaria@example.test' });
    await setDoc(doc(db, 'users/morador-1'), { role: 'resident', email: 'morador@example.test' });
  });
});

after(async () => { await env.cleanup(); });

test('morador cria apenas seu próprio perfil resident', async () => {
  const db = env.authenticatedContext('novo-morador', { email: 'novo@example.test' }).firestore();
  await assertSucceeds(setDoc(doc(db, 'users/novo-morador'), { role: 'resident', email: 'novo@example.test' }));
  await assertFails(setDoc(doc(db, 'users/novo-morador'), { role: 'sindico', email: 'novo@example.test' }));
});

test('morador não lê reserva de outro morador nem escreve encomendas', async () => {
  const admin = env.authenticatedContext('sindico-1', { email: 'sindico@example.test' }).firestore();
  await assertSucceeds(setDoc(doc(admin, 'reservations/outra'), { userId: 'outro', status: 'Pendente' }));
  const resident = env.authenticatedContext('morador-1', { email: 'morador@example.test' }).firestore();
  await assertFails(getDoc(doc(resident, 'reservations/outra')));
  await assertFails(addDoc(collection(resident, 'packages'), { residentId: 'morador-1' }));
});

test('portaria manipula encomendas, mas não configura o condomínio', async () => {
  const db = env.authenticatedContext('portaria-1', { email: 'portaria@example.test' }).firestore();
  await assertSucceeds(addDoc(collection(db, 'packages'), { residentId: 'morador-1' }));
  await assertFails(setDoc(doc(db, 'config/prices'), { teste: 1 }));
});

test('síndico pode administrar configurações', async () => {
  const db = env.authenticatedContext('sindico-1', { email: 'sindico@example.test' }).firestore();
  await assertSucceeds(setDoc(doc(db, 'config/prices'), { teste: 1 }));
});
test('qualquer usuário lê a disponibilidade, mas apenas uma reserva vinculada pode ocupá-la', async () => {
  const resident = env.authenticatedContext('morador-1', { email: 'morador@example.test' }).firestore();
  const availability = doc(resident, 'availability/churrasqueira-superior-2026-10-03');

  await assertFails(setDoc(availability, {
    spaceName: 'Churrasqueira Superior', date: '2026-10-03', status: 'reserved',
    reservationId: 'sem-reserva', updatedAt: new Date()
  }));

  const reservation = doc(resident, 'reservations/reserva-morador-1');
  const batch = writeBatch(resident);
  batch.set(reservation, {
    userId: 'morador-1', userEmail: 'morador@example.test', spaceName: 'Churrasqueira Superior',
    date: '2026-10-03', apartment: '101', status: 'Pendente', value: 81, createdAt: '2026-09-26T12:00:00.000Z'
  });
  batch.set(availability, {
    spaceName: 'Churrasqueira Superior', date: '2026-10-03', status: 'reserved',
    reservationId: 'reserva-morador-1', updatedAt: new Date()
  });
  await assertSucceeds(batch.commit());

  const otherResident = env.authenticatedContext('morador-2', { email: 'outro@example.test' }).firestore();
  await assertSucceeds(getDoc(doc(otherResident, 'availability/churrasqueira-superior-2026-10-03')));
});