/* Vista pública: cualquiera puede ver qué números quedan y reservar uno para sí mismo.
 * Nunca puede ver el nombre de nadie más, ni tocar un número que ya esté ocupado
 * (eso lo garantizan las reglas de seguridad de Firestore, no solo este código). */
(function () {
  'use strict';

  const L = window.RifaLogic;
  const $ = (s) => document.querySelector(s);
  const K_MI_RESERVA = 'rifa:miReserva';

  const celdas = {};
  let datos = null;
  let cargado = false;
  let store = null;
  let toastTimer;

  /* ---------- Tablero ---------- */
  // Una celda ocupada solo puede decir "Vendida": nunca se le manda un nombre a esta
  // página (el documento público de Firestore solo trae números, nunca personas).

  const tablero = $('#tablero');
  L.NUMEROS.forEach((n) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'num cargando';
    b.dataset.n = n;
    b.disabled = true;
    const numero = document.createElement('span');
    numero.className = 'n';
    numero.textContent = n;
    const marca = document.createElement('span');
    marca.className = 'marca';
    marca.setAttribute('aria-hidden', 'true');
    const estado = document.createElement('span');
    estado.className = 'sr-only';
    b.append(numero, marca, estado);
    li.appendChild(b);
    celdas[n] = { b, marca, estado };
    tablero.appendChild(li);
  });

  function toast(texto, error) {
    const t = $('#toast');
    t.textContent = texto;
    t.classList.toggle('error', !!error);
    t.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('visible'), error ? 5000 : 2600);
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { /* sin permiso */ }
      ta.remove();
      return ok;
    }
  }

  function pintar(d) {
    datos = d;
    const { config, ocupados } = d;

    if (!cargado) {
      cargado = true;
      $('#mensajeCarga').hidden = true;
    }

    // Encabezado y datos de la rifa
    $('#subtitulo').textContent = config.subtitulo;
    $('#premio').textContent = L.formatCOP(config.premio);
    $('#precio').textContent = `${L.formatCOP(config.precio)} cada número`;
    $('#tel').textContent = L.formatTelefono(config.telefono);
    $('#contacto').textContent = config.contactoNombre;
    $('#loteria').textContent = config.loteria;
    document.title = `Rifa · ${config.subtitulo} · Números disponibles`;

    const f = L.fechaParts(config.fecha);
    $('#dia').textContent = f ? f.dia : '';
    $('#mes').textContent = f ? f.mesNombre : '';
    $('#cuenta').textContent = L.textoCuentaRegresiva(L.diasRestantes(config.fecha));

    const wa = L.waLink(config.telefono, `Hola${config.contactoNombre ? ' ' + config.contactoNombre.split(' ')[0] : ''}, tengo una pregunta sobre la rifa «${config.subtitulo}».`);
    $('#btnWhatsapp').hidden = !wa;
    if (wa) $('#btnWhatsapp').href = wa;
    $('#btnCopiar').hidden = !L.soloDigitos(config.telefono);

    // Números: una celda ocupada solo dice "Vendida", nunca un nombre. Las libres
    // se pueden tocar para reservarlas; las ya vendidas quedan inertes.
    let libres = 0;
    for (const n of L.NUMEROS) {
      const c = celdas[n];
      const ocupado = !!ocupados[n];
      if (!ocupado) libres++;
      c.b.className = 'num ' + (ocupado ? 'ocupado' : 'libre');
      c.b.disabled = ocupado;
      c.marca.textContent = ocupado ? 'Vendida' : '';
      c.estado.textContent = ocupado ? ', vendida' : ', disponible: toca para reservarla';
    }

    $('#btnAzar').disabled = libres === 0;
    $('#btnAzar').hidden = libres === 0;

    const quedan = $('#quedan');
    if (libres === 0) quedan.textContent = '¡Se vendieron todos los números!';
    else quedan.innerHTML = `Quedan <b>${libres}</b> ${libres === 1 ? 'número disponible' : 'números disponibles'}`;
    $('#progreso').style.width = `${L.TOTAL - libres}%`;

    refrescarHora();
    refrescarMiReserva();
  }

  function refrescarHora() {
    const el = $('#actualizado');
    if (!datos || !datos.actualizado) { el.textContent = ''; return; }
    el.textContent = `Actualizado ${L.tiempoRelativo(datos.actualizado)}`;
  }

  /* ---------- Reservar un número ---------- */

  const dlg = $('#dlgReservar');
  const form = $('#formReservar');
  const pasoElegir = $('#pasoElegir');
  const pasoExito = $('#pasoExito');
  const CONT_R = { nombre: $('#rCNombre'), telefono: $('#rCTelefono') };
  let numActual = null;

  function marcarErrores(errores) {
    form.querySelectorAll('.error-campo').forEach((e) => e.remove());
    form.querySelectorAll('.con-error').forEach((e) => e.classList.remove('con-error'));
    let primero = null;
    for (const [campo, msg] of Object.entries(errores)) {
      const cont = CONT_R[campo];
      if (!cont) continue;
      cont.classList.add('con-error');
      const p = document.createElement('p');
      p.className = 'error-campo';
      p.setAttribute('role', 'alert');
      p.textContent = msg;
      cont.appendChild(p);
      primero = primero || cont.querySelector('input');
    }
    if (primero) primero.focus();
  }

  function limpiarErrorAlEscribir() {
    form.querySelectorAll('.con-error').forEach((c) => { c.classList.remove('con-error'); c.querySelectorAll('.error-campo').forEach((p) => p.remove()); });
  }
  form.addEventListener('input', limpiarErrorAlEscribir);

  tablero.addEventListener('click', (e) => {
    const b = e.target.closest('button.num.libre');
    if (!b || b.disabled) return;
    abrirReserva(b.dataset.n);
  });

  // Pone el número n en el diálogo sin borrar lo que la persona ya escribió
  // (así "Otro número" no le hace volver a escribir su nombre).
  function ponerNumero(n, azar) {
    numActual = n;
    $('#rTitulo').textContent = `Número ${n}`;
    $('#rSub').textContent = azar
      ? `¡Te salió el ${n}! Si te gusta, resérvalo con tu nombre.`
      : 'Este número está disponible. Resérvalo con tu nombre.';
    $('#rOtro').hidden = !azar;
    $('#rError').hidden = true;
    $('#rConfirmar').disabled = false;
    $('#rConfirmar').textContent = `Sí, quiero el número ${n}`;
  }

  function abrirReserva(n, azar = false) {
    ponerNumero(n, azar);
    marcarErrores({});
    $('#rNombre').value = '';
    $('#rTelefono').value = '';
    pasoElegir.hidden = false;
    pasoExito.hidden = true;
    dlg.showModal();
    $('#rNombre').focus();
  }

  // Número al azar: solo elige entre los que esta página ya ve libres; reservarlo
  // sigue pasando por el mismo diálogo y las mismas reglas de siempre.
  $('#btnAzar').addEventListener('click', () => {
    const n = datos && L.numeroAlAzar(datos.ocupados);
    if (!n) { toast('Ya no quedan números libres.'); return; }
    abrirReserva(n, true);
  });
  $('#rOtro').addEventListener('click', () => {
    const n = datos && L.numeroAlAzar(datos.ocupados, numActual);
    if (n) ponerNumero(n, true);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = numActual;
    const res = L.validarReserva({ nombre: $('#rNombre').value, telefono: $('#rTelefono').value });
    marcarErrores(res.errores);
    if (!res.ok) return;

    const btn = $('#rConfirmar');
    btn.disabled = true;
    btn.textContent = 'Reservando…';
    $('#rError').hidden = true;
    try {
      await store.saveSale(n, { ...res.venta, creado: true }); // true = "es nueva, pon la fecha de ahora"
      try { sessionStorage.setItem(K_MI_RESERVA, JSON.stringify({ n, nombre: res.venta.nombre })); } catch (e2) { /* sin permiso */ }
      mostrarExito(n, res.venta.nombre);
    } catch (err) {
      console.error(err);
      const msg = err && err.code === 'permission-denied'
        ? 'Uy, alguien más acaba de reservar este número. Elige otro.'
        : 'No se pudo reservar. Revisa tu conexión e inténtalo de nuevo.';
      $('#rError').textContent = msg;
      $('#rError').hidden = false;
      btn.disabled = false;
      btn.textContent = `Sí, quiero el número ${n}`;
    }
  });

  function mostrarExito(n, nombre) {
    pasoElegir.hidden = true;
    pasoExito.hidden = false;
    $('#rExitoTexto').textContent = `Reservaste el número ${n}.`;
    $('#rLlave').textContent = datos ? L.formatTelefono(datos.config.telefono) : '';
    const wa = datos && L.waLink(datos.config.telefono, L.textoReserva(datos.config, n, nombre));
    const btnWa = $('#rWhatsapp');
    if (wa) { btnWa.href = wa; btnWa.hidden = false; } else { btnWa.hidden = true; }
  }

  $('#rCancelar').addEventListener('click', () => dlg.close());
  $('#rCerrar').addEventListener('click', () => dlg.close());
  $('#rCopiarLlave').addEventListener('click', async () => {
    const llave = datos ? L.soloDigitos(datos.config.telefono) : '';
    if (!llave) return;
    toast((await copiarTexto(llave)) ? 'Llave copiada' : `Llave: ${L.formatTelefono(llave)}`);
  });

  // Desde el aviso "Reservaste el número N" se puede volver a ver el QR para pagar.
  $('#miReservaPagar').addEventListener('click', () => {
    let mia = null;
    try { mia = JSON.parse(sessionStorage.getItem(K_MI_RESERVA) || 'null'); } catch (e) { /* nada */ }
    if (!mia) return;
    mostrarExito(mia.n, mia.nombre);
    dlg.showModal();
  });

  // Si cerró el diálogo de éxito sin avisar por WhatsApp, deja un botón visible
  // el resto de la visita para que pueda avisar cuando quiera.
  function refrescarMiReserva() {
    let mia = null;
    try { mia = JSON.parse(sessionStorage.getItem(K_MI_RESERVA) || 'null'); } catch (e) { /* nada */ }
    const banner = $('#miReserva');
    if (!mia || !datos || !datos.ocupados[mia.n]) { banner.hidden = true; return; }
    const wa = L.waLink(datos.config.telefono, L.textoReserva(datos.config, mia.n, mia.nombre));
    if (!wa) { banner.hidden = true; return; }
    $('#miReservaTexto').textContent = `Reservaste el número ${mia.n}.`;
    $('#miReservaWa').href = wa;
    banner.hidden = false;
  }

  /* ---------- Errores y carga ---------- */

  function mostrarError(err) {
    console.error(err);
    if (cargado) return; // ya hay datos en pantalla; Firestore reintenta solo
    const m = $('#mensajeCarga');
    m.textContent = 'No se pudo cargar la rifa. Revisa tu conexión y vuelve a intentar.';
    m.hidden = false;
    $('#quedan').textContent = 'No se pudieron cargar los números';
  }

  /* ---------- Arranque ---------- */

  $('#btnCopiar').addEventListener('click', async () => {
    const llave = datos ? L.soloDigitos(datos.config.telefono) : '';
    if (!llave) return;
    try {
      await navigator.clipboard.writeText(llave);
      toast('Llave copiada');
    } catch (e) {
      toast(`Llave: ${L.formatTelefono(llave)}`);
    }
  });

  // Pensado para compartir a un Estado de WhatsApp: en el celular abre el mismo menú
  // de compartir que usa cualquier app, donde "Estado" aparece como una opción más.
  $('#btnCompartir').addEventListener('click', async () => {
    const titulo = datos ? `Rifa ${datos.config.subtitulo}` : document.title;
    const texto = `🎟️ Mira los números disponibles de la rifa${datos ? ' ' + datos.config.subtitulo : ''} y anímate a participar 👇`;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url: location.href });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // la persona cerró el menú de compartir
      }
    }
    const ok = await copiarTexto(`${texto}\n${location.href}`);
    toast(ok ? 'Enlace copiado. Pégalo en tu estado o chat de WhatsApp.' : 'No se pudo copiar. Copia el enlace desde la barra de direcciones.', !ok);
  });

  // Conserva ?emulator al pasar entre páginas (solo se usa en pruebas locales).
  $('#lnkAdmin').href = 'admin.html' + location.search;

  setTimeout(() => {
    if (!cargado) {
      const m = $('#mensajeCarga');
      m.textContent = 'Sigue cargando… si no aparece nada, revisa tu conexión a internet.';
      m.hidden = false;
    }
  }, 8000);
  setInterval(refrescarHora, 30000);

  window.RifaStore.init({ auth: false }).then((s) => {
    store = s;
    const aviso = $('#aviso');
    if (store.emulador) {
      aviso.textContent = 'Modo de prueba: estás usando los emuladores de Firebase, no los datos reales.';
      aviso.hidden = false;
    } else if (store.mode === 'local') {
      aviso.textContent = 'Modo local: solo ves lo que se guardó en este navegador. Conecta Firebase para compartir la rifa (ver README).';
      aviso.hidden = false;
    }
    store.subscribePublic(pintar, mostrarError);
  }).catch(mostrarError);
})();
