/* Panel de administración: asignar números, registrar pagos, ajustar la rifa. */
(function () {
  'use strict';

  const L = window.RifaLogic;
  const $ = (s) => document.querySelector(s);
  const MARCA = { sin_pagar: '✕', abono: '◐', pago: '✓' };

  const state = {
    config: L.configCompleta({}, window.RIFA_DEFAULTS),
    ventas: {},
    filtro: 'todos',
    q: '',
    cargadoPub: false,
    cargadoVen: false,
    pendPub: false,
    pendVen: false,
  };

  let store = null;
  let bajas = [];
  let avisoLogin = '';
  let toastTimer;
  const celdas = {};

  /* ---------- Utilidades ---------- */

  function toast(texto, error) {
    const t = $('#toast');
    t.textContent = texto;
    t.classList.toggle('error', !!error);
    t.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('visible'), error ? 6000 : 2600);
  }

  const MENSAJES = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
    'auth/network-request-failed': 'No hay conexión a internet.',
    'auth/user-disabled': 'Esta cuenta está desactivada.',
    'auth/invalid-api-key': 'La configuración de Firebase no es válida. Revisa js/config.js.',
    'auth/unauthorized-domain': 'Este sitio no está autorizado en Firebase (Authentication → Settings → Authorized domains).',
    'permission-denied': 'Esta cuenta no tiene permiso de administrador. Revisa las reglas de Firestore (README, paso 3).',
    unavailable: 'Sin conexión con el servidor.',
  };
  const mensajeError = (err) => MENSAJES[err && err.code] || (err && err.message) || 'Ocurrió un error inesperado.';

  // Muestra un mensaje de error bajo cada campo con problema y enfoca el primero.
  function marcarErrores(form, contenedores, errores) {
    form.querySelectorAll('.error-campo').forEach((e) => e.remove());
    form.querySelectorAll('.con-error').forEach((e) => e.classList.remove('con-error'));
    let primero = null;
    for (const [campo, msg] of Object.entries(errores)) {
      const cont = contenedores[campo];
      if (!cont) continue;
      cont.classList.add('con-error');
      const p = document.createElement('p');
      p.className = 'error-campo';
      p.setAttribute('role', 'alert');
      p.textContent = msg;
      cont.appendChild(p);
      primero = primero || cont.querySelector('input, textarea');
    }
    if (primero) primero.focus();
  }

  // Al corregir un campo, su mensaje de error desaparece sin esperar a guardar de nuevo.
  function limpiarErrorAlEscribir(form) {
    const limpiar = (e) => {
      const cont = e.target.closest('.con-error');
      if (!cont) return;
      cont.classList.remove('con-error');
      cont.querySelectorAll('.error-campo').forEach((p) => p.remove());
    };
    form.addEventListener('input', limpiar);
    form.addEventListener('change', limpiar);
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

  const plano = (n) => L.formatCOP(n).replace('$', '');
  const listo = () => state.cargadoPub && state.cargadoVen;

  /* ---------- Tablero ---------- */

  const tablero = $('#tablero');
  L.NUMEROS.forEach((n) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'celda libre';
    b.dataset.n = n;
    b.disabled = true;
    b.innerHTML = '<span class="marca" aria-hidden="true"></span><span class="n"></span><span class="quien"></span>';
    b.querySelector('.n').textContent = n;
    li.appendChild(b);
    tablero.appendChild(li);
    celdas[n] = { li, b, marca: b.querySelector('.marca'), quien: b.querySelector('.quien') };
  });
  const vacio = document.createElement('li');
  vacio.className = 'vacio';
  vacio.textContent = 'No hay números que coincidan con el filtro.';
  vacio.hidden = true;
  tablero.appendChild(vacio);

  tablero.addEventListener('click', (e) => {
    const b = e.target.closest('.celda');
    if (b && !b.disabled) abrirVenta(b.dataset.n);
  });

  function render() {
    const { config, ventas } = state;
    const r = L.resumen(ventas, config.precio);

    $('#hSubtitulo').textContent = config.subtitulo;
    $('#recaudado').textContent = L.formatCOP(r.recaudado);
    $('#porCobrar').textContent = L.formatCOP(r.porCobrar);
    $('#cTodos').textContent = L.TOTAL;
    $('#cLibres').textContent = r.disponibles;
    $('#cSinPagar').textContent = r.sinPagar;
    $('#cAbono').textContent = r.abonos;
    $('#cPago').textContent = r.pagados;

    const visibles = new Set(L.filtrarNumeros(ventas, { filtro: state.filtro, q: state.q }));
    const ok = listo();
    for (const n of L.NUMEROS) {
      const c = celdas[n];
      const v = ventas[n];
      c.li.hidden = !visibles.has(n);
      c.b.disabled = !ok;
      c.b.className = 'celda ' + (v ? v.estado : 'libre');
      c.marca.textContent = v ? MARCA[v.estado] : '';
      c.quien.textContent = v ? v.nombre : 'libre';
      c.b.setAttribute('aria-label', v
        ? `Número ${n}, ${v.nombre}, ${L.ESTADO_TEXTO[v.estado]}`
        : `Número ${n}, libre`);
    }
    vacio.hidden = visibles.size > 0;
    pintarSync();
  }

  function pintarSync() {
    const s = $('#sync');
    let texto, clase;
    if (store && store.mode === 'local') { texto = 'Modo local'; clase = 'pend'; }
    else if (!listo()) { texto = 'Cargando…'; clase = 'pend'; }
    else if (!navigator.onLine) { texto = 'Sin conexión'; clase = 'off'; }
    else if (state.pendPub || state.pendVen) { texto = 'Guardando…'; clase = 'pend'; }
    else { texto = 'Todo guardado ✓'; clase = 'ok'; }
    s.textContent = texto;
    s.className = 'sync ' + clase;
  }

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filtro = chip.dataset.f;
      document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      render();
    });
  });
  $('#buscar').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  window.addEventListener('online', pintarSync);
  window.addEventListener('offline', pintarSync);

  /* ---------- Asignar / editar un número ---------- */

  const dlgV = $('#dlgVenta');
  const formV = $('#formVenta');
  const CONT_V = { nombre: $('#cNombre'), telefono: $('#cTelefono'), estado: $('#cEstado'), abonado: $('#cAbonado'), nota: $('#cNota') };
  let numActual = null;
  let liberarTimer = null;

  limpiarErrorAlEscribir(formV);
  const estadoElegido = () => (formV.querySelector('input[name="estado"]:checked') || {}).value;

  function actualizarAbono() {
    const esAbono = estadoElegido() === L.ABONO;
    $('#cAbonado').hidden = !esAbono;
    const abono = L.parseMonto($('#vAbonado').value);
    const precio = state.config.precio;
    $('#vDebe').textContent = esAbono && abono > 0 && abono < precio ? `Le quedan por pagar ${L.formatCOP(precio - abono)}` : '';
  }
  formV.querySelectorAll('input[name="estado"]').forEach((r) => r.addEventListener('change', () => {
    actualizarAbono();
    if (estadoElegido() === L.ABONO) $('#vAbonado').focus();
  }));
  $('#vAbonado').addEventListener('input', actualizarAbono);

  function reiniciarLiberar() {
    clearTimeout(liberarTimer);
    const b = $('#btnLiberar');
    b.classList.remove('confirmar');
    b.textContent = 'Liberar número';
  }

  function abrirVenta(n) {
    const v = state.ventas[n];
    numActual = n;
    $('#vTitulo').textContent = `Número ${n}`;
    $('#vSub').textContent = v ? 'Edita los datos de esta venta.' : 'Está disponible. Asígnalo a una persona.';
    $('#vError').hidden = true;
    marcarErrores(formV, CONT_V, {});
    $('#vNombre').value = v ? v.nombre : '';
    $('#vTelefono').value = v ? v.telefono : '';
    $('#vNota').value = v ? v.nota : '';
    const estado = v ? v.estado : L.SIN_PAGAR;
    formV.querySelector(`input[name="estado"][value="${estado}"]`).checked = true;
    $('#vAbonado').value = v && v.estado === L.ABONO ? plano(v.abonado) : '';
    actualizarAbono();
    $('#btnLiberar').hidden = !v;
    reiniciarLiberar();
    $('#btnGuardar').disabled = false;
    dlgV.showModal();
    if (!v) $('#vNombre').focus();
  }

  formV.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = numActual;
    const res = L.validarVenta({
      nombre: $('#vNombre').value,
      telefono: $('#vTelefono').value,
      estado: estadoElegido(),
      abonado: $('#vAbonado').value,
      nota: $('#vNota').value,
    }, state.config.precio);
    marcarErrores(formV, CONT_V, res.errores);
    if (!res.ok) return;

    dlgV.close();
    toast(`Guardando el ${n}…`);
    store.saveSale(n, res.venta).then(
      () => toast(`Número ${n} guardado ✓`),
      (err) => toast(`No se pudo guardar el ${n}: ${mensajeError(err)}`, true)
    );
  });

  $('#btnCancelar').addEventListener('click', () => dlgV.close());
  dlgV.addEventListener('close', reiniciarLiberar);

  // Liberar pide confirmación con un segundo toque, para no borrar una venta por error.
  $('#btnLiberar').addEventListener('click', () => {
    const b = $('#btnLiberar');
    if (!b.classList.contains('confirmar')) {
      b.classList.add('confirmar');
      b.textContent = `¿Liberar el ${numActual}? Toca otra vez`;
      liberarTimer = setTimeout(reiniciarLiberar, 4000);
      return;
    }
    const n = numActual;
    reiniciarLiberar();
    dlgV.close();
    toast(`Liberando el ${n}…`);
    store.releaseNumber(n).then(
      () => toast(`Número ${n} liberado`),
      (err) => toast(`No se pudo liberar el ${n}: ${mensajeError(err)}`, true)
    );
  });

  /* ---------- Ajustes ---------- */

  const dlgA = $('#dlgAjustes');
  const formA = $('#formAjustes');
  limpiarErrorAlEscribir(formA);
  const CONT_A = {
    subtitulo: $('#aCSubtitulo'), premio: $('#aCPremio'), precio: $('#aCPrecio'), fecha: $('#aCFecha'),
    loteria: $('#aCLoteria'), contactoNombre: $('#aCContacto'), telefono: $('#aCTelefono'),
  };

  $('#btnAjustes').addEventListener('click', () => {
    const c = state.config;
    $('#aError').hidden = true;
    marcarErrores(formA, CONT_A, {});
    $('#aSubtitulo').value = c.subtitulo;
    $('#aPremio').value = plano(c.premio);
    $('#aPrecio').value = plano(c.precio);
    $('#aFecha').value = c.fecha;
    $('#aLoteria').value = c.loteria;
    $('#aContacto').value = c.contactoNombre;
    $('#aTelefono').value = c.telefono;
    dlgA.showModal();
  });

  formA.addEventListener('submit', (e) => {
    e.preventDefault();
    const res = L.validarConfig({
      subtitulo: $('#aSubtitulo').value,
      premio: $('#aPremio').value,
      precio: $('#aPrecio').value,
      fecha: $('#aFecha').value,
      loteria: $('#aLoteria').value,
      contactoNombre: $('#aContacto').value,
      telefono: $('#aTelefono').value,
    });
    marcarErrores(formA, CONT_A, res.errores);
    if (!res.ok) return;

    dlgA.close();
    toast('Guardando ajustes…');
    store.saveConfig(res.config).then(
      () => toast('Ajustes guardados ✓'),
      (err) => toast(`No se pudieron guardar los ajustes: ${mensajeError(err)}`, true)
    );
  });
  $('#aCancelar').addEventListener('click', () => dlgA.close());

  /* ---------- Compartir disponibles ---------- */

  $('#btnCompartir').addEventListener('click', async () => {
    const libres = L.NUMEROS.filter((n) => !state.ventas[n]);
    const texto = L.textoDisponibles(state.config, libres, new URL('./', location.href).href);
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try { await navigator.share({ text: texto }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    toast((await copiarTexto(texto)) ? 'Lista copiada. Pégala en WhatsApp.' : 'No se pudo copiar la lista.', false);
  });

  /* ---------- Sesión y suscripciones ---------- */

  function detener() {
    bajas.forEach((f) => f());
    bajas = [];
  }

  function falloLectura(err) {
    console.error(err);
    detener();
    if (err && err.code === 'permission-denied') {
      avisoLogin = mensajeError(err);
      store.signOut();
    } else {
      toast(mensajeError(err), true);
    }
  }

  function mostrarLogin() {
    detener();
    $('#cargando').hidden = true;
    $('#panel').hidden = true;
    $('#login').hidden = false;
    $('#loginClave').value = '';
    const e = $('#loginError');
    e.textContent = avisoLogin;
    e.hidden = !avisoLogin;
    avisoLogin = '';
  }

  function entrar() {
    detener();
    state.cargadoPub = state.cargadoVen = false;
    state.pendPub = state.pendVen = false;
    $('#cargando').hidden = true;
    $('#login').hidden = true;
    $('#panel').hidden = false;
    $('#btnSalir').hidden = store.mode === 'local';
    render();
    bajas.push(store.subscribePublic((d) => {
      state.config = d.config; state.cargadoPub = true; state.pendPub = d.pendiente; render();
    }, falloLectura));
    bajas.push(store.subscribeAdmin((d) => {
      state.ventas = d.ventas; state.cargadoVen = true; state.pendVen = d.pendiente; render();
    }, falloLectura));
  }

  $('#formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError');
    const email = $('#loginEmail').value.trim();
    const clave = $('#loginClave').value;
    if (!email || !clave) {
      err.textContent = 'Escribe tu correo y tu contraseña.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    const btn = $('#btnEntrar');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await store.signIn(email, clave);
    } catch (ex) {
      err.textContent = mensajeError(ex);
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  $('#btnSalir').addEventListener('click', () => store.signOut());

  /* ---------- Arranque ---------- */

  // Conserva ?emulator al pasar entre páginas (solo se usa en pruebas locales).
  $('#lnkPublica').href = 'index.html' + location.search;
  $('#lnkPublicaLogin').href = 'index.html' + location.search;

  window.RifaStore.init({ auth: true }).then((s) => {
    store = s;
    const aviso = $('#aviso');
    if (s.emulador) {
      aviso.textContent = 'Modo de prueba: estás usando los emuladores de Firebase, no los datos reales.';
      aviso.hidden = false;
    } else if (s.mode === 'local') {
      aviso.textContent = 'Modo local: los datos solo se guardan en este navegador. Conecta Firebase para usarla desde varios dispositivos (ver README).';
      aviso.hidden = false;
    }
    s.onAuth((user) => (user ? entrar() : mostrarLogin()));
  }).catch((err) => {
    console.error(err);
    $('#cargando').textContent = 'No se pudo cargar. Revisa tu conexión a internet y recarga la página.';
  });
})();
