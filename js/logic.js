/* Lógica pura de la rifa: sin DOM ni red. Se usa en el navegador (window.RifaLogic) y en las pruebas de Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RifaLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TOTAL = 100;
  const NUMEROS = Array.from({ length: TOTAL }, (_, i) => String(i).padStart(2, '0'));

  const SIN_PAGAR = 'sin_pagar';
  const ABONO = 'abono';
  const PAGO = 'pago';
  const ESTADOS = [SIN_PAGAR, ABONO, PAGO];
  const ESTADO_TEXTO = { sin_pagar: 'Sin pagar', abono: 'Abonó', pago: 'Pagó' };

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /* ---------- Formatos ---------- */

  function formatCOP(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '-$' : '$') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // "30.000", "30,000" o 30000 -> 30000. Solo dígitos (los pesos no llevan decimales).
  function parseMonto(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    return Number(String(v == null ? '' : v).replace(/\D/g, '')) || 0;
  }

  function soloDigitos(s) {
    return String(s == null ? '' : s).replace(/\D/g, '');
  }

  function formatTelefono(s) {
    const d = soloDigitos(s);
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return String(s == null ? '' : s).trim();
  }

  // Enlace de WhatsApp. Un número de 10 dígitos se asume de Colombia (+57).
  function waLink(telefono, texto) {
    let d = soloDigitos(telefono);
    if (d.length < 7) return null;
    if (d.length === 10) d = '57' + d;
    return `https://wa.me/${d}` + (texto ? `?text=${encodeURIComponent(texto)}` : '');
  }

  /* ---------- Fechas ---------- */

  // "2026-10-30" -> { anio, mes (0-11), dia, mesNombre } o null si no es una fecha real.
  function fechaParts(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    const anio = +m[1], mes = +m[2] - 1, dia = +m[3];
    const f = new Date(anio, mes, dia);
    if (f.getFullYear() !== anio || f.getMonth() !== mes || f.getDate() !== dia) return null;
    return { anio, mes, dia, mesNombre: MESES[mes] };
  }

  function diasRestantes(iso, ahora) {
    const p = fechaParts(iso);
    if (!p) return null;
    const hoy = ahora || new Date();
    const a = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const b = Date.UTC(p.anio, p.mes, p.dia);
    return Math.round((b - a) / 86400000);
  }

  function textoCuentaRegresiva(dias) {
    if (dias == null) return '';
    if (dias === 0) return '¡Es hoy!';
    if (dias === 1) return 'Falta 1 día';
    if (dias > 1) return `Faltan ${dias} días`;
    return 'Ya se jugó';
  }

  function tiempoRelativo(fecha, ahora) {
    if (!(fecha instanceof Date) || isNaN(fecha)) return '';
    const seg = Math.max(0, Math.round(((ahora || new Date()) - fecha) / 1000));
    if (seg < 60) return 'hace un momento';
    const min = Math.floor(seg / 60);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'hace 1 día' : `hace ${d} días`;
  }

  /* ---------- Configuración ---------- */

  // Mezcla lo guardado con los valores por defecto, descartando datos raros.
  function configCompleta(raw, defaults) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const d = defaults || {};
    const txt = (k) => (typeof r[k] === 'string' && r[k].trim() ? r[k].trim() : String(d[k] == null ? '' : d[k]));
    const num = (k) => {
      const v = r[k];
      return v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : Number(d[k]) || 0;
    };
    return {
      subtitulo: txt('subtitulo'),
      premio: num('premio'),
      precio: num('precio'),
      fecha: fechaParts(r.fecha) ? r.fecha : String(d.fecha || ''),
      loteria: txt('loteria'),
      contactoNombre: txt('contactoNombre'),
      telefono: txt('telefono'),
    };
  }

  function validarConfig(input) {
    const errores = {};
    const subtitulo = String(input.subtitulo || '').trim();
    const loteria = String(input.loteria || '').trim();
    const contactoNombre = String(input.contactoNombre || '').trim();
    const telefono = String(input.telefono || '').trim();
    const premio = parseMonto(input.premio);
    const precio = parseMonto(input.precio);
    const fecha = String(input.fecha || '').trim();

    if (!subtitulo) errores.subtitulo = 'Escribe el título de la rifa.';
    else if (subtitulo.length > 40) errores.subtitulo = 'Máximo 40 letras.';
    if (!(precio > 0)) errores.precio = 'El precio por número debe ser mayor a 0.';
    if (!(premio > 0)) errores.premio = 'Escribe el valor del premio.';
    if (!fechaParts(fecha)) errores.fecha = 'Elige la fecha en que juega la rifa.';
    if (!loteria) errores.loteria = 'Escribe con qué lotería juega.';
    else if (loteria.length > 40) errores.loteria = 'Máximo 40 letras.';
    if (contactoNombre.length > 40) errores.contactoNombre = 'Máximo 40 letras.';
    if (telefono && soloDigitos(telefono).length < 7) errores.telefono = 'Escribe un teléfono válido.';

    return { ok: !Object.keys(errores).length, errores, config: { subtitulo, premio, precio, fecha, loteria, contactoNombre, telefono } };
  }

  /* ---------- Ventas ---------- */

  function normalizarVenta(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      nombre: String(r.nombre || '').trim(),
      telefono: String(r.telefono || '').trim(),
      estado: ESTADOS.includes(r.estado) ? r.estado : SIN_PAGAR,
      abonado: parseMonto(r.abonado),
      nota: String(r.nota || '').trim(),
    };
  }

  function validarVenta(input, precio) {
    const errores = {};
    const nombre = String(input.nombre || '').replace(/\s+/g, ' ').trim();
    const telefono = String(input.telefono || '').trim();
    const nota = String(input.nota || '').trim();
    const estado = input.estado;

    if (!nombre) errores.nombre = 'Escribe el nombre de quien compra.';
    else if (nombre.length > 60) errores.nombre = 'El nombre es muy largo (máximo 60 letras).';
    if (telefono.length > 20) errores.telefono = 'El teléfono es muy largo.';
    if (nota.length > 200) errores.nota = 'La nota es muy larga (máximo 200 letras).';
    if (!ESTADOS.includes(estado)) errores.estado = 'Elige si pagó, abonó o no ha pagado.';

    let abonado = 0;
    if (estado === PAGO) {
      abonado = precio;
    } else if (estado === ABONO) {
      abonado = parseMonto(input.abonado);
      if (!(abonado > 0)) errores.abonado = 'Escribe cuánto abonó.';
      else if (abonado >= precio) errores.abonado = 'Si ya pagó todo, marca «Pagó».';
    }

    return { ok: !Object.keys(errores).length, errores, venta: { nombre, telefono, estado, abonado, nota } };
  }

  const NOTA_AUTORRESERVA = 'Reservado desde la página pública.';

  // Cuando la propia persona reserva su número (sin pasar por el admin). Nunca deja
  // que se marque a sí misma como pagada: eso lo sigue confirmando el organizador.
  function validarReserva(input) {
    const errores = {};
    const nombre = String(input.nombre || '').replace(/\s+/g, ' ').trim();
    const telefono = String(input.telefono || '').trim();

    if (!nombre) errores.nombre = 'Escribe tu nombre.';
    else if (nombre.length > 60) errores.nombre = 'El nombre es muy largo (máximo 60 letras).';
    if (telefono.length > 20) errores.telefono = 'El teléfono es muy largo.';

    return {
      ok: !Object.keys(errores).length,
      errores,
      venta: { nombre, telefono, estado: SIN_PAGAR, abonado: 0, nota: NOTA_AUTORRESERVA },
    };
  }

  // Mensaje de WhatsApp que confirma "ya reservé este número", listo para el organizador.
  function textoReserva(config, numero, nombre) {
    const quien = config.contactoNombre ? ` ${config.contactoNombre.split(' ')[0]}` : '';
    return `¡Hola${quien}! 🎟️ Reservé el número *${numero}* de la rifa «${config.subtitulo}». Mi nombre es ${nombre}. Quedo atento(a) para coordinar el pago.`;
  }

  // Totales para el panel de administración.
  function resumen(ventas, precio) {
    const r = { vendidos: 0, disponibles: TOTAL, pagados: 0, abonos: 0, sinPagar: 0, recaudado: 0, porCobrar: 0 };
    for (const n of NUMEROS) {
      if (!ventas || !ventas[n]) continue;
      const v = normalizarVenta(ventas[n]);
      if (v.estado === PAGO) {
        r.pagados++;
        r.recaudado += v.abonado || precio;
      } else if (v.estado === ABONO) {
        r.abonos++;
        r.recaudado += v.abonado;
        r.porCobrar += Math.max(precio - v.abonado, 0);
      } else {
        r.sinPagar++;
        r.porCobrar += precio;
      }
    }
    r.vendidos = r.pagados + r.abonos + r.sinPagar;
    r.disponibles = TOTAL - r.vendidos;
    return r;
  }

  function normalizarTexto(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // filtro: 'todos' | 'libres' | 'sin_pagar' | 'abono' | 'pago'. q busca por número o por nombre.
  function filtrarNumeros(ventas, { filtro = 'todos', q = '' } = {}) {
    const busca = normalizarTexto(q);
    return NUMEROS.filter((n) => {
      const v = ventas && ventas[n] ? normalizarVenta(ventas[n]) : null;
      if (filtro === 'libres' && v) return false;
      if (ESTADOS.includes(filtro) && (!v || v.estado !== filtro)) return false;
      if (!busca) return true;
      return n.includes(busca) || (v !== null && normalizarTexto(v.nombre).includes(busca));
    });
  }

  // Mensaje listo para pegar en WhatsApp.
  function textoDisponibles(config, libres, url) {
    const p = fechaParts(config.fecha);
    const cuando = p ? ` el ${p.dia} de ${p.mesNombre}` : '';
    const lineas = [
      `🎟️ *RIFA ${String(config.subtitulo || '').toUpperCase()}*`,
      `Premio ${formatCOP(config.premio)} · ${formatCOP(config.precio)} cada número`,
      `Juega${cuando} · ${config.loteria}`,
      '',
    ];
    if (libres.length) {
      lineas.push(`Números disponibles (${libres.length}):`, libres.join(' · '));
    } else {
      lineas.push('¡Ya se vendieron todos los números!');
    }
    if (url) lineas.push('', `Míralos en vivo: ${url}`);
    return lineas.join('\n');
  }

  return {
    TOTAL, NUMEROS, ESTADOS, ESTADO_TEXTO, SIN_PAGAR, ABONO, PAGO,
    formatCOP, parseMonto, soloDigitos, formatTelefono, waLink,
    fechaParts, diasRestantes, textoCuentaRegresiva, tiempoRelativo,
    configCompleta, validarConfig, normalizarVenta, validarVenta,
    validarReserva, textoReserva, NOTA_AUTORRESERVA,
    resumen, normalizarTexto, filtrarNumeros, textoDisponibles,
  };
});
