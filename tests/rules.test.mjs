// Pruebas de las reglas de seguridad contra el emulador de Firestore.
// Ejecutar con: npm run test:rules   (levanta el emulador, corre esto y lo apaga)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, deleteField } from 'firebase/firestore';

const ADMIN_EMAIL = 'admin@rifa.test';
const plantilla = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let env;

before(async () => {
  // El archivo real trae un correo de ejemplo; se reemplaza para poder probar al "admin".
  assert.ok(plantilla.includes('tu_correo@gmail.com'), 'firestore.rules debería traer el correo de ejemplo');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rifa',
    firestore: { rules: plantilla.replaceAll('tu_correo@gmail.com', ADMIN_EMAIL), host, port: Number(port) },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rifa/publico'), { ocupados: { '07': true }, precio: 30000 });
    await setDoc(doc(db, 'privado/ventas'), { ventas: { '07': { nombre: 'Ana', estado: 'pago', abonado: 30000 } } });
  });
});

const anonimo = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext('uid-admin', { email: ADMIN_EMAIL }).firestore();
const otro = () => env.authenticatedContext('uid-otro', { email: 'otro@ejemplo.com' }).firestore();


test('cualquiera puede leer el tablero público', async () => {
  await assertSucceeds(getDoc(doc(anonimo(), 'rifa/publico')));
  await assertSucceeds(getDoc(doc(otro(), 'rifa/publico')));
});

test('el público NO puede leer nombres ni pagos', async () => {
  await assertFails(getDoc(doc(anonimo(), 'privado/ventas')));
  await assertFails(getDoc(doc(otro(), 'privado/ventas')));
});

test('el público NO puede modificar nada', async () => {
  const db = anonimo();
  await assertFails(setDoc(doc(db, 'rifa/publico'), { ocupados: { '08': true } }, { merge: true }));
  await assertFails(setDoc(doc(db, 'rifa/publico'), { ocupados: { '07': deleteField() } }, { merge: true }));
  await assertFails(deleteDoc(doc(db, 'rifa/publico')));
  await assertFails(setDoc(doc(db, 'privado/ventas'), { ventas: { '08': { nombre: 'X' } } }, { merge: true }));
  await assertFails(setDoc(doc(db, 'rifa/otro'), { x: 1 }));
});

test('un usuario con sesión pero que NO es el admin tampoco puede escribir ni leer lo privado', async () => {
  const db = otro();
  await assertFails(setDoc(doc(db, 'rifa/publico'), { ocupados: { '08': true } }, { merge: true }));
  await assertFails(setDoc(doc(db, 'privado/ventas'), { ventas: { '08': { nombre: 'X' } } }, { merge: true }));
  await assertFails(getDoc(doc(db, 'privado/ventas')));
});

test('el admin puede leer y escribir todo (lo mismo que hace la app)', async () => {
  const db = admin();
  await assertSucceeds(getDoc(doc(db, 'privado/ventas')));
  await assertSucceeds(setDoc(doc(db, 'privado/ventas'), { ventas: { '08': { nombre: 'Luis', estado: 'abono', abonado: 5000 } } }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'rifa/publico'), { ocupados: { '08': true }, actualizado: serverTimestamp() }, { merge: true }));
  // liberar un número
  await assertSucceeds(setDoc(doc(db, 'privado/ventas'), { ventas: { '08': deleteField() } }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'rifa/publico'), { ocupados: { '08': deleteField() } }, { merge: true }));
  // ajustes
  await assertSucceeds(setDoc(doc(db, 'rifa/publico'), { precio: 25000, subtitulo: 'Nueva' }, { merge: true }));
});

test('colecciones desconocidas están bloqueadas incluso para el admin', async () => {
  await assertFails(setDoc(doc(admin(), 'cualquiera/cosa'), { x: 1 }));
  await assertFails(getDoc(doc(admin(), 'cualquiera/cosa')));
});
