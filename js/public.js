/* Vista pública: solo lectura. Muestra qué números están disponibles, en tiempo real. */
(function () {
  'use strict';

  const L = window.RifaLogic;
  const $ = (s) => document.querySelector(s);

  const celdas = {};
  let datos = null;
  let cargado = false;
  let toastTimer;

  /* ---------- Tablero ---------- */
  // Una celda ocupada solo puede decir "Vendida": nunca se le manda un nombre a esta
  // página (el documento público de Firestore solo trae números, nunca personas).

  const tablero = $('#tablero');
  L.NUMEROS.forEach((n) => {
    const li = document.createElement('li');
    li.className = 'num cargando';
    const numero = document.createElement('span');
    numero.className = 'n';
    numero.textContent = n;
    const marca = document.createElement('span');
    marca.className = 'marca';
    marca.setAttribute('aria-hidden', 'true');
    const estado = document.createElement('span');
    estado.className = 'sr-only';
    li.append(numero, marca, estado);
    celdas[n] = { li, marca, estado };
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

    const wa = L.waLink(config.telefono, `Hola${config.contactoNombre ? ' ' + config.contactoNombre.split(' ')[0] : ''}, quiero apartar un número de la rifa «${config.subtitulo}».`);
    $('#btnWhatsapp').hidden = !wa;
    if (wa) $('#btnWhatsapp').href = wa;
    $('#btnCopiar').hidden = !L.soloDigitos(config.telefono);

    // Números: una celda ocupada solo dice "Vendida", nunca un nombre.
    let libres = 0;
    for (const n of L.NUMEROS) {
      const c = celdas[n];
      const ocupado = !!ocupados[n];
      if (!ocupado) libres++;
      c.li.className = 'num ' + (ocupado ? 'ocupado' : 'libre');
      c.marca.textContent = ocupado ? 'Vendida' : '';
      c.estado.textContent = ocupado ? ', vendida' : ', disponible';
    }

    const quedan = $('#quedan');
    if (libres === 0) quedan.textContent = '¡Se vendieron todos los números!';
    else quedan.innerHTML = `Quedan <b>${libres}</b> ${libres === 1 ? 'número disponible' : 'números disponibles'}`;
    $('#progreso').style.width = `${L.TOTAL - libres}%`;

    refrescarHora();
  }

  function refrescarHora() {
    const el = $('#actualizado');
    if (!datos || !datos.actualizado) { el.textContent = ''; return; }
    el.textContent = `Actualizado ${L.tiempoRelativo(datos.actualizado)}`;
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

  window.RifaStore.init({ auth: false }).then((store) => {
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
