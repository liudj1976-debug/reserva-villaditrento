import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('example configuration has no client-side privileged password', () => {
  const env = read('.env.example');
  assert.doesNotMatch(env, /VITE_(ADMIN|PORTARIA)_PASSWORD/i);
  assert.doesNotMatch(env, /sindico2025|portaria2025/i);
});

test('publication helper cannot deploy, commit, or bulk-stage', () => {
  const script = read('deploy_env.ps1');
  assert.match(script, /disabled/i);
  assert.doesNotMatch(script, /vercel\s+--prod|git\s+add\s+\.|git\s+commit/i);
});

test('Firestore rules use an authenticated profile and deny by default', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/users\/\{userId\}/);
  assert.match(rules, /request\.resource\.data\.role == 'resident'/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false/);
});

test('role helpers recognize exactly resident, portaria, and sindico', () => {
  const source = read('utils/authorization.ts');
  assert.match(source, /\['resident', 'portaria', 'sindico'\]/);
  assert.match(source, /role === 'sindico'/);
  assert.match(source, /role === 'portaria' \|\| role === 'sindico'/);
});

test('senior-panel control is rendered only for the sindico role', () => {
  const header = read('components/Header.tsx');
  assert.match(header, /\{canAccessAdmin\(role\) && \(/);
});
test('public availability contains no resident data and is linked to its reservation', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/availability\/\{id\}/);
  assert.match(rules, /keys\(\)\.hasOnly\(\['spaceName', 'date', 'status', 'reservationId', 'updatedAt'\]\)/);
  assert.match(rules, /getAfter\(\/databases\/\$\(database\)\/documents\/reservations\/\$\(request\.resource\.data\.reservationId\)\)/);
  assert.doesNotMatch(rules, /match \/availability\/[\s\S]*userEmail/);
});

test('resident booking creates availability in one Firestore transaction without Functions', () => {
  const app = read('index.tsx');
  assert.match(app, /await runTransaction\(db, async \(transaction\) =>/);
  assert.match(app, /transaction\.set\(availabilityRef, \{/);
  assert.doesNotMatch(app, /httpsCallable\(functions, 'createReservation'\)/);
});