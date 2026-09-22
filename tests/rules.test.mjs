// Pruebas de las reglas de seguridad contra el emulador de Firestore.
// Ejecutar con: npm run test:rules   (levanta el emulador, corre esto y lo apaga)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

const ADMIN_EMAIL = 'admin@rifa.test';
const plantilla = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let env;

before(async () => {
  // El archivo real trae el correo del administrador; se reemplaza para poder probar.
  assert.ok(plantilla.includes('umatechnology1@gmail.com'), 'firestore.rules debería traer el correo del administrador');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rifa',
    firestore: { rules: plantilla.replaceAll('umatechnology1@gmail.com', ADMIN_EMAIL), host, port: Number(port) },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const anonimo = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext('uid-admin', { email: ADMIN_EMAIL }).firestore();
const otro = () => env.authenticatedContext('uid-otro', { email: 'otro@ejemplo.com' }).firestore();

const ventaValida = { nombre: 'Ana', telefono: '3001234567', estado: 'sin_pagar', abonado: 0, nota: '', creado: serverTimestamp() };

async function sembrarAdmin(coleccion, id, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), coleccion, id), data);
  });
}

/* ---------- Lectura pública ---------- */

test('cualquiera puede leer los ajustes y qué números existen (ocupados)', async () => {
  await sembrarAdmin('config', 'ajustes', { subtitulo: 'Con propósito', precio: 30000 });
  await sembrarAdmin('numeros', '07', { ocupado: true });
  await assertSucceeds(getDoc(doc(anonimo(), 'config/ajustes')));
  await assertSucceeds(getDoc(doc(otro(), 'numeros/07')));
  await assertSucceeds(getDocs(collection(anonimo(), 'numeros')));
});

test('nadie que no sea el admin puede leer las ventas (nombres y pagos)', async () => {
  await sembrarAdmin('ventas', '07', ventaValida);
  await assertFails(getDoc(doc(anonimo(), 'ventas/07')));
  await assertFails(getDoc(doc(otro(), 'ventas/07')));
  await assertFails(getDocs(collection(anonimo(), 'ventas')));
});

/* ---------- El público NO puede tocar los ajustes ---------- */

test('el público no puede cambiar los ajustes de la rifa', async () => {
  await assertFails(setDoc(doc(anonimo(), 'config/ajustes'), { subtitulo: 'Hackeado' }));
  await assertFails(setDoc(doc(otro(), 'config/ajustes'), { subtitulo: 'Hackeado' }));
});

/* ---------- Autorreservar un número (numeros/{n}) ---------- */

test('cualquiera puede reservar un número libre, pero solo marcándolo ocupado y nada más', async () => {
  await assertSucceeds(setDoc(doc(anonimo(), 'numeros/07'), { ocupado: true }));
  await assertSucceeds(setDoc(doc(otro(), 'numeros/08'), { ocupado: true }));
});

test('no se puede colar ningún campo extra al reservar un número', async () => {
  await assertFails(setDoc(doc(anonimo(), 'numeros/07'), { ocupado: true, nombre: 'Ana' }));
  await assertFails(setDoc(doc(anonimo(), 'numeros/07'), { ocupado: true, en: new Date() }));
});

test('no se puede reservar un número con un valor distinto de true', async () => {
  await assertFails(setDoc(doc(anonimo(), 'numeros/07'), { ocupado: false }));
  await assertFails(setDoc(doc(anonimo(), 'numeros/07'), { ocupado: 'si' }));
});

test('no se puede "reservar" un número que ya está ocupado (ni el mismo, ni otro que llegue después)', async () => {
  await sembrarAdmin('numeros', '07', { ocupado: true });
  await assertFails(setDoc(doc(anonimo(), 'numeros/07'), { ocupado: true })); // ya existía: esto es "update", no "create"
  await assertFails(setDoc(doc(otro(), 'numeros/07'), { ocupado: true }));
});

test('el público no puede liberar (borrar) ni editar un número, ni siquiera el que acaba de crear', async () => {
  const db = anonimo();
  await setDoc(doc(db, 'numeros/09'), { ocupado: true });
  await assertFails(deleteDoc(doc(db, 'numeros/09')));
  await assertFails(setDoc(doc(db, 'numeros/09'), { ocupado: true, extra: 1 }));
});

/* ---------- Autorreservar los datos de la venta (ventas/{n}) ---------- */

test('cualquiera puede registrar su propia venta, siempre sin pagar y con abono 0', async () => {
  await assertSucceeds(setDoc(doc(anonimo(), 'ventas/07'), ventaValida));
  await assertSucceeds(setDoc(doc(otro(), 'ventas/08'), { ...ventaValida, telefono: '' })); // el teléfono es opcional
});

test('nadie puede autorreservarse como pagado ni con abono falso', async () => {
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, estado: 'pago' }));
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, estado: 'abono' }));
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, abonado: 30000 }));
});

test('el nombre es obligatorio y hay límites de tamaño', async () => {
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, nombre: '' }));
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, nombre: 'x'.repeat(61) }));
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, telefono: '1'.repeat(21) }));
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, nota: 'x'.repeat(201) }));
});

test('no se puede colar ningún campo extra en la venta propia', async () => {
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, esAdmin: true }));
});

test('la fecha de reserva tiene que ser la hora real del servidor, no una inventada', async () => {
  const { creado, ...sinFecha } = ventaValida;
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), sinFecha)); // sin creado, para nada
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...sinFecha, creado: new Date('2020-01-01') })); // una fecha inventada
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...sinFecha, creado: 'ayer' }));
});

test('no se puede pisar una venta que ya existe (ni la propia ni la de alguien más)', async () => {
  await sembrarAdmin('ventas', '07', ventaValida);
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), ventaValida));
  await assertFails(setDoc(doc(anonimo(), 'ventas/07'), { ...ventaValida, nombre: 'Otra persona' }));
});

test('el público no puede editar ni borrar una venta, ni siquiera la que acaba de crear', async () => {
  const db = anonimo();
  await setDoc(doc(db, 'ventas/09'), ventaValida);
  await assertFails(deleteDoc(doc(db, 'ventas/09')));
  await assertFails(setDoc(doc(db, 'ventas/09'), { ...ventaValida, nombre: 'Cambiado' }));
});

/* ---------- El admin puede todo (lo mismo que hace el panel) ---------- */

test('el admin puede leer y escribir todo: ajustes, números y ventas', async () => {
  const db = admin();
  await assertSucceeds(setDoc(doc(db, 'config/ajustes'), { subtitulo: 'Nueva', precio: 25000 }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'numeros/10'), { ocupado: true }));
  await assertSucceeds(setDoc(doc(db, 'ventas/10'), { nombre: 'Luis', telefono: '', estado: 'pago', abonado: 30000, nota: '' }));
  await assertSucceeds(getDoc(doc(db, 'ventas/10')));
  // editar una venta ya existente (algo que el público jamás puede hacer)
  await assertSucceeds(setDoc(doc(db, 'ventas/10'), { nombre: 'Luis', telefono: '', estado: 'abono', abonado: 10000, nota: '' }));
  // liberar un número
  await assertSucceeds(deleteDoc(doc(db, 'numeros/10')));
  await assertSucceeds(deleteDoc(doc(db, 'ventas/10')));
});

test('un usuario con sesión pero que no es el admin tiene las mismas restricciones que el público', async () => {
  const db = otro();
  await assertFails(setDoc(doc(db, 'config/ajustes'), { subtitulo: 'Hackeado' }));
  await assertFails(getDoc(doc(db, 'ventas/07')));
  await assertSucceeds(setDoc(doc(db, 'numeros/11'), { ocupado: true })); // sí puede autorreservar, como cualquiera
  await assertFails(setDoc(doc(db, 'ventas/11'), { ...ventaValida, estado: 'pago' }));
});

/* ---------- Todo lo demás, bloqueado ---------- */

test('colecciones desconocidas están bloqueadas incluso para el admin', async () => {
  await assertFails(setDoc(doc(admin(), 'cualquiera/cosa'), { x: 1 }));
  await assertFails(getDoc(doc(admin(), 'cualquiera/cosa')));
});
