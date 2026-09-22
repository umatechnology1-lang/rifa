const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

const DEFAULTS = {
  subtitulo: 'Con propósito', premio: 1000000, precio: 30000, fecha: '2026-10-30',
  loteria: 'Lotería de Risaralda', contactoNombre: 'Karen Medina', telefono: '3193866037',
};

test('hay 100 números, del 00 al 99', () => {
  assert.equal(L.NUMEROS.length, 100);
  assert.equal(L.NUMEROS[0], '00');
  assert.equal(L.NUMEROS[7], '07');
  assert.equal(L.NUMEROS[99], '99');
  assert.equal(new Set(L.NUMEROS).size, 100);
});

test('formatCOP usa punto como separador de miles', () => {
  assert.equal(L.formatCOP(1000000), '$1.000.000');
  assert.equal(L.formatCOP(30000), '$30.000');
  assert.equal(L.formatCOP(0), '$0');
  assert.equal(L.formatCOP(999), '$999');
  assert.equal(L.formatCOP(undefined), '$0');
  assert.equal(L.formatCOP('abc'), '$0');
});

test('parseMonto acepta lo que la gente escribe', () => {
  assert.equal(L.parseMonto('30.000'), 30000);
  assert.equal(L.parseMonto('30,000'), 30000);
  assert.equal(L.parseMonto('$ 10 000'), 10000);
  assert.equal(L.parseMonto(''), 0);
  assert.equal(L.parseMonto(null), 0);
  assert.equal(L.parseMonto(15000), 15000);
  assert.equal(L.parseMonto(-5), 0);
});

test('formatTelefono y waLink', () => {
  assert.equal(L.formatTelefono('3193866037'), '(319) 386-6037');
  assert.equal(L.formatTelefono('319 386 6037'), '(319) 386-6037');
  assert.equal(L.formatTelefono('+57 319 386 6037'), '+57 319 386 6037');
  assert.equal(L.waLink('3193866037'), 'https://wa.me/573193866037');
  assert.equal(L.waLink('(319) 386-6037', 'Hola & adiós'), 'https://wa.me/573193866037?text=Hola%20%26%20adi%C3%B3s');
  assert.equal(L.waLink('573193866037'), 'https://wa.me/573193866037');
  assert.equal(L.waLink(''), null);
  assert.equal(L.waLink('123'), null);
});

test('fechaParts valida fechas reales', () => {
  assert.deepEqual(L.fechaParts('2026-10-30'), { anio: 2026, mes: 9, dia: 30, mesNombre: 'octubre' });
  assert.equal(L.fechaParts('2026-02-30'), null);
  assert.equal(L.fechaParts('30/10/2026'), null);
  assert.equal(L.fechaParts(''), null);
  assert.equal(L.fechaParts(undefined), null);
});

test('cuenta regresiva', () => {
  const hoy = new Date(2026, 8, 21, 15, 30); // 21 sep 2026, por la tarde
  assert.equal(L.diasRestantes('2026-10-30', hoy), 39);
  assert.equal(L.diasRestantes('2026-09-21', hoy), 0);
  assert.equal(L.diasRestantes('2026-09-20', hoy), -1);
  assert.equal(L.diasRestantes('nada', hoy), null);
  assert.equal(L.textoCuentaRegresiva(39), 'Faltan 39 días');
  assert.equal(L.textoCuentaRegresiva(1), 'Falta 1 día');
  assert.equal(L.textoCuentaRegresiva(0), '¡Es hoy!');
  assert.equal(L.textoCuentaRegresiva(-3), 'Ya se jugó');
  assert.equal(L.textoCuentaRegresiva(null), '');
});

test('cuenta regresiva no se descuadra con el cambio de horario', () => {
  // Cualquier día del año: de hoy a hoy+N días siempre da N.
  for (let d = 0; d < 400; d += 7) {
    const base = new Date(2026, 0, 1, 23, 59);
    const objetivo = new Date(2026, 0, 1 + d);
    const iso = `${objetivo.getFullYear()}-${String(objetivo.getMonth() + 1).padStart(2, '0')}-${String(objetivo.getDate()).padStart(2, '0')}`;
    assert.equal(L.diasRestantes(iso, base), d);
  }
});

test('tiempoRelativo', () => {
  const ahora = new Date(2026, 8, 21, 12, 0, 0);
  assert.equal(L.tiempoRelativo(new Date(ahora - 20 * 1000), ahora), 'hace un momento');
  assert.equal(L.tiempoRelativo(new Date(ahora - 5 * 60 * 1000), ahora), 'hace 5 min');
  assert.equal(L.tiempoRelativo(new Date(ahora - 3 * 3600 * 1000), ahora), 'hace 3 h');
  assert.equal(L.tiempoRelativo(new Date(ahora - 30 * 3600 * 1000), ahora), 'hace 1 día');
  assert.equal(L.tiempoRelativo(new Date(ahora - 4 * 86400 * 1000), ahora), 'hace 4 días');
  assert.equal(L.tiempoRelativo(null, ahora), '');
});

test('configCompleta rellena con los valores por defecto y descarta basura', () => {
  assert.deepEqual(L.configCompleta({}, DEFAULTS), DEFAULTS);
  assert.deepEqual(L.configCompleta(null, DEFAULTS), DEFAULTS);
  const c = L.configCompleta({ precio: 25000, subtitulo: '  Por Sofi ', fecha: 'mala', premio: 'xx', loteria: '' }, DEFAULTS);
  assert.equal(c.precio, 25000);
  assert.equal(c.subtitulo, 'Por Sofi');
  assert.equal(c.fecha, '2026-10-30');
  assert.equal(c.premio, 1000000);
  assert.equal(c.loteria, 'Lotería de Risaralda');
});

test('validarConfig', () => {
  const ok = L.validarConfig({ subtitulo: 'Por Sofi', premio: '2.000.000', precio: '20.000', fecha: '2026-11-15', loteria: 'Lotería de Medellín', contactoNombre: 'Ana', telefono: '300 111 2233' });
  assert.equal(ok.ok, true);
  assert.equal(ok.config.premio, 2000000);
  assert.equal(ok.config.precio, 20000);

  const mal = L.validarConfig({ subtitulo: '', premio: '0', precio: '', fecha: '2026-13-01', loteria: '', telefono: '12' });
  assert.equal(mal.ok, false);
  assert.deepEqual(Object.keys(mal.errores).sort(), ['fecha', 'loteria', 'precio', 'premio', 'subtitulo', 'telefono']);
});

test('validarVenta: sin pagar / pagó / abonó', () => {
  const precio = 30000;
  const base = { nombre: '  María   López ', telefono: '3001234567', nota: '' };

  const sin = L.validarVenta({ ...base, estado: 'sin_pagar', abonado: '999' }, precio);
  assert.equal(sin.ok, true);
  assert.equal(sin.venta.nombre, 'María López');
  assert.equal(sin.venta.abonado, 0); // ignora abonos cuando está "sin pagar"

  const pago = L.validarVenta({ ...base, estado: 'pago' }, precio);
  assert.equal(pago.ok, true);
  assert.equal(pago.venta.abonado, 30000);

  const abono = L.validarVenta({ ...base, estado: 'abono', abonado: '10.000' }, precio);
  assert.equal(abono.ok, true);
  assert.equal(abono.venta.abonado, 10000);
});

test('validarVenta: errores', () => {
  const precio = 30000;
  assert.ok(L.validarVenta({ nombre: '', estado: 'pago' }, precio).errores.nombre);
  assert.ok(L.validarVenta({ nombre: '   ', estado: 'pago' }, precio).errores.nombre);
  assert.ok(L.validarVenta({ nombre: 'x'.repeat(61), estado: 'pago' }, precio).errores.nombre);
  assert.ok(L.validarVenta({ nombre: 'Ana' }, precio).errores.estado);
  assert.ok(L.validarVenta({ nombre: 'Ana', estado: 'invento' }, precio).errores.estado);
  assert.ok(L.validarVenta({ nombre: 'Ana', estado: 'abono', abonado: '' }, precio).errores.abonado);
  assert.ok(L.validarVenta({ nombre: 'Ana', estado: 'abono', abonado: '0' }, precio).errores.abonado);
  assert.ok(L.validarVenta({ nombre: 'Ana', estado: 'abono', abonado: '30000' }, precio).errores.abonado);
  assert.ok(L.validarVenta({ nombre: 'Ana', estado: 'abono', abonado: '45000' }, precio).errores.abonado);
  assert.ok(L.validarVenta({ nombre: 'Ana', estado: 'pago', nota: 'n'.repeat(201) }, precio).errores.nota);
});

test('validarReserva: siempre queda sin_pagar y abonado 0, así se lo pidan distinto', () => {
  const ok = L.validarReserva({ nombre: '  Pedro   Pérez ', telefono: '3001234567' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.venta, { nombre: 'Pedro Pérez', telefono: '3001234567', estado: 'sin_pagar', abonado: 0, nota: L.NOTA_AUTORRESERVA });

  // aunque alguien intente colar estado/abonado, la función los ignora por completo
  const forzado = L.validarReserva({ nombre: 'Ana', estado: 'pago', abonado: 99999 });
  assert.equal(forzado.venta.estado, 'sin_pagar');
  assert.equal(forzado.venta.abonado, 0);
});

test('validarReserva: errores', () => {
  assert.ok(L.validarReserva({ nombre: '' }).errores.nombre);
  assert.ok(L.validarReserva({ nombre: '   ' }).errores.nombre);
  assert.ok(L.validarReserva({ nombre: 'x'.repeat(61) }).errores.nombre);
  assert.ok(L.validarReserva({ nombre: 'Ana', telefono: '1'.repeat(21) }).errores.telefono);
  assert.equal(L.validarReserva({ nombre: 'Ana' }).ok, true); // el teléfono es opcional
});

test('textoReserva', () => {
  const cfg = L.configCompleta({}, DEFAULTS);
  const t = L.textoReserva(cfg, '07', 'Pedro Pérez');
  assert.match(t, /Hola Karen/);
  assert.match(t, /número \*07\*/);
  assert.match(t, /rifa «Con propósito»/);
  assert.match(t, /Pedro Pérez/);
  // sin nombre de contacto, el saludo no debe quedar con un espacio colgando
  const sinContacto = L.textoReserva({ ...cfg, contactoNombre: '' }, '07', 'Ana');
  assert.match(sinContacto, /^¡Hola! /);
});

test('resumen: totales y dinero', () => {
  const ventas = {
    '00': { nombre: 'A', estado: 'pago', abonado: 30000 },
    '01': { nombre: 'B', estado: 'pago', abonado: 30000 },
    '02': { nombre: 'C', estado: 'abono', abonado: 10000 },
    '03': { nombre: 'D', estado: 'sin_pagar', abonado: 0 },
    '04': { nombre: 'E', estado: 'sin_pagar' },
    '77': { nombre: 'F', estado: 'abono', abonado: 20000 },
  };
  const r = L.resumen(ventas, 30000);
  assert.equal(r.vendidos, 6);
  assert.equal(r.disponibles, 94);
  assert.equal(r.pagados, 2);
  assert.equal(r.abonos, 2);
  assert.equal(r.sinPagar, 2);
  assert.equal(r.recaudado, 30000 + 30000 + 10000 + 20000);
  assert.equal(r.porCobrar, 20000 + 30000 + 30000 + 10000);
  assert.deepEqual(L.resumen({}, 30000), { vendidos: 0, disponibles: 100, pagados: 0, abonos: 0, sinPagar: 0, recaudado: 0, porCobrar: 0 });
});

test('resumen: cambiar el precio no altera lo ya pagado', () => {
  const ventas = { '05': { nombre: 'A', estado: 'pago', abonado: 30000 }, '06': { nombre: 'B', estado: 'sin_pagar' } };
  const r = L.resumen(ventas, 40000);
  assert.equal(r.recaudado, 30000);
  assert.equal(r.porCobrar, 40000);
});

test('resumen ignora números fuera de 00-99 y datos corruptos', () => {
  const r = L.resumen({ '100': { nombre: 'X', estado: 'pago' }, '5': { nombre: 'Y', estado: 'pago' }, '09': 'basura' }, 30000);
  assert.equal(r.vendidos, 1); // '09' cuenta como vendido sin pagar aunque el dato sea raro
  assert.equal(r.sinPagar, 1);
});

test('filtrarNumeros por estado y búsqueda', () => {
  const ventas = {
    '07': { nombre: 'José Peña', estado: 'pago', abonado: 30000 },
    '17': { nombre: 'Ana', estado: 'abono', abonado: 5000 },
    '23': { nombre: 'Jose Luis', estado: 'sin_pagar' },
  };
  assert.equal(L.filtrarNumeros(ventas, {}).length, 100);
  assert.equal(L.filtrarNumeros(ventas, { filtro: 'libres' }).length, 97);
  assert.deepEqual(L.filtrarNumeros(ventas, { filtro: 'pago' }), ['07']);
  assert.deepEqual(L.filtrarNumeros(ventas, { filtro: 'abono' }), ['17']);
  assert.deepEqual(L.filtrarNumeros(ventas, { filtro: 'sin_pagar' }), ['23']);
  // búsqueda sin importar mayúsculas ni tildes
  assert.deepEqual(L.filtrarNumeros(ventas, { q: 'JOSÉ' }), ['07', '23']);
  assert.deepEqual(L.filtrarNumeros(ventas, { q: 'pena' }), ['07']);
  assert.deepEqual(L.filtrarNumeros(ventas, { q: '17' }), ['17']);
  assert.deepEqual(L.filtrarNumeros(ventas, { filtro: 'pago', q: 'ana' }), []);
  assert.deepEqual(L.filtrarNumeros(ventas, { q: 'zzz' }), []);
});

test('textoDisponibles', () => {
  const cfg = L.configCompleta({}, DEFAULTS);
  const t = L.textoDisponibles(cfg, ['00', '05', '99'], 'https://x.test/rifa/');
  assert.match(t, /RIFA CON PROPÓSITO/);
  assert.match(t, /Premio \$1\.000\.000 · \$30\.000 cada número/);
  assert.match(t, /Juega el 30 de octubre · Lotería de Risaralda/);
  assert.match(t, /Números disponibles \(3\):\n00 · 05 · 99/);
  assert.match(t, /https:\/\/x\.test\/rifa\//);
  assert.match(L.textoDisponibles(cfg, [], ''), /todos los números/);
});
