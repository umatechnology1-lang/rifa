/* Capa de datos de la rifa. Dos modos con la misma interfaz:
 *   · local    → localStorage del navegador (sin config de Firebase; útil para probar).
 *   · firebase → Firestore + Auth, para verla y editarla desde cualquier dispositivo.
 *
 * Datos en Firestore (cada número es su PROPIO documento; así el público puede reservar
 * uno sin poder tocar ningún otro dato — ver firestore.rules):
 *   config/ajustes  (lectura pública)     → título, premio, precio, fecha, contacto…
 *   numeros/{n}     (lectura pública)     → EXISTE si el número {n} está ocupado.
 *   ventas/{n}      (solo lee el admin)   → { nombre, telefono, estado, abonado, nota } de ese número.
 */
(function () {
  'use strict';

  const L = window.RifaLogic;
  const SDK = '10.14.1';
  const CFG = window.RIFA_FIREBASE_CONFIG || {};
  const DEFAULTS = window.RIFA_DEFAULTS || {};

  // ?emulator en localhost → usa los emuladores de Firebase (pruebas), sin tocar datos reales.
  const EMULADOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('emulator');
  const CONFIGURADO = !!CFG.apiKey && !/^TU_/.test(CFG.apiKey);

  /* ---------- Modo local ---------- */

  function crearLocal() {
    const K_PUB = 'rifa:publico';
    const K_VEN = 'rifa:ventas';
    const memoria = {}; // por si el navegador bloquea localStorage
    const oyentes = new Set();

    const leer = (k) => {
      try {
        const t = localStorage.getItem(k);
        return t ? JSON.parse(t) : {};
      } catch (e) {
        return memoria[k] || {};
      }
    };
    const escribir = (k, v) => {
      memoria[k] = v;
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* solo memoria */ }
    };
    const avisar = () => oyentes.forEach((f) => f());
    window.addEventListener('storage', avisar); // otra pestaña cambió algo

    const parsePublico = (d) => {
      const ocupados = {};
      if (d.ocupados && typeof d.ocupados === 'object') {
        for (const n of L.NUMEROS) if (d.ocupados[n]) ocupados[n] = true;
      }
      return { config: L.configCompleta(d, DEFAULTS), ocupados, actualizado: d.actualizado ? new Date(d.actualizado) : null };
    };
    const parseVentas = (d) => {
      const ventas = {};
      const src = d.ventas && typeof d.ventas === 'object' ? d.ventas : {};
      for (const n of L.NUMEROS) if (src[n]) {
        const v = L.normalizarVenta(src[n]);
        v.creado = src[n].creado ? new Date(src[n].creado) : null;
        ventas[n] = v;
      }
      return ventas;
    };

    return {
      mode: 'local',
      emulador: false,
      onAuth(cb) { setTimeout(() => cb({ email: 'local' }), 0); return () => {}; },
      signIn() { return Promise.resolve(); },
      signOut() { return Promise.resolve(); },

      subscribePublic(cb) {
        const f = () => cb({ ...parsePublico(leer(K_PUB)), pendiente: false });
        oyentes.add(f);
        f();
        return () => oyentes.delete(f);
      },
      subscribeAdmin(cb) {
        const f = () => cb({ ventas: parseVentas(leer(K_VEN)), pendiente: false });
        oyentes.add(f);
        f();
        return () => oyentes.delete(f);
      },

      // "creado: true" es una señal (no una fecha real) que solo pone admin.js/public.js
      // en una venta NUEVA; aquí se cambia por la fecha de verdad. Si no viene, se
      // conserva la que ya tenía (así editar el pago de alguien no le cambia la fecha
      // en la que reservó su número).
      saveSale(num, venta) {
        const pub = leer(K_PUB), ven = leer(K_VEN);
        pub.ocupados = { ...(pub.ocupados || {}), [num]: true };
        pub.actualizado = Date.now();
        const anterior = (ven.ventas || {})[num] || {};
        const datos = { ...venta };
        if (datos.creado === true) datos.creado = Date.now();
        else delete datos.creado;
        ven.ventas = { ...(ven.ventas || {}), [num]: { ...anterior, ...datos } };
        escribir(K_PUB, pub); escribir(K_VEN, ven);
        avisar();
        return Promise.resolve();
      },
      releaseNumber(num) {
        const pub = leer(K_PUB), ven = leer(K_VEN);
        pub.ocupados = { ...(pub.ocupados || {}) }; delete pub.ocupados[num];
        pub.actualizado = Date.now();
        ven.ventas = { ...(ven.ventas || {}) }; delete ven.ventas[num];
        escribir(K_PUB, pub); escribir(K_VEN, ven);
        avisar();
        return Promise.resolve();
      },
      saveConfig(config) {
        const pub = leer(K_PUB);
        Object.assign(pub, config);
        pub.actualizado = Date.now();
        escribir(K_PUB, pub);
        avisar();
        return Promise.resolve();
      },
    };
  }

  /* ---------- Modo Firebase ---------- */

  function cargarScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function crearFirebase(conAuth) {
    const base = `https://www.gstatic.com/firebasejs/${SDK}/`;
    await cargarScript(base + 'firebase-app-compat.js');
    await Promise.all([
      cargarScript(base + 'firebase-firestore-compat.js'),
      conAuth ? cargarScript(base + 'firebase-auth-compat.js') : null,
    ]);

    const firebase = window.firebase;
    firebase.initializeApp(EMULADOR ? { apiKey: 'demo-key', projectId: 'demo-rifa', authDomain: 'demo-rifa.firebaseapp.com' } : CFG);
    const db = firebase.firestore();
    const auth = conAuth ? firebase.auth() : null;
    if (EMULADOR) {
      db.useEmulator('127.0.0.1', 8080);
      if (auth) auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
    }

    const FV = firebase.firestore.FieldValue;
    const docConfig = db.doc('config/ajustes');
    const colNumeros = db.collection('numeros');
    const colVentas = db.collection('ventas');
    const OPT = { includeMetadataChanges: true };

    // Combina dos listeners (un doc + una colección) en un solo callback, y evita mostrar
    // un estado "vacío" solo porque la caché local todavía no tiene nada (sin conexión).
    // Un error de cualquiera de los dos se avisa igual por onError.
    function combinarDos(sub1, sub2, combinar) {
      return (cb, onError) => {
        let d1 = null, d2 = null, huboReal1 = false, huboReal2 = false;
        const emitir = () => { if (huboReal1 && huboReal2) cb(combinar(d1, d2)); };
        const baja1 = sub1((datos, esReal) => { d1 = datos; huboReal1 = huboReal1 || esReal; emitir(); }, onError);
        const baja2 = sub2((datos, esReal) => { d2 = datos; huboReal2 = huboReal2 || esReal; emitir(); }, onError);
        return () => { baja1(); baja2(); };
      };
    }

    function oyenteDoc(ref) {
      return (cb, onError) => ref.onSnapshot(OPT, (snap) => {
        // fromCache + no existe todavía en absoluto ≠ "de verdad no existe": puede que
        // simplemente aún no haya llegado nada del servidor (por ejemplo, sin conexión).
        const esReal = !snap.metadata.fromCache || snap.exists;
        cb({ datos: snap.data({ serverTimestamps: 'estimate' }) || {}, pendiente: snap.metadata.hasPendingWrites }, esReal);
      }, onError);
    }
    function oyenteColeccion(ref) {
      return (cb, onError) => ref.onSnapshot(OPT, (snap) => {
        const esReal = !snap.metadata.fromCache || snap.size > 0;
        const mapa = {};
        snap.forEach((doc) => { mapa[doc.id] = doc.data(); });
        cb({ mapa, pendiente: snap.metadata.hasPendingWrites }, esReal);
      }, onError);
    }

    const suscribirPublico = combinarDos(oyenteDoc(docConfig), oyenteColeccion(colNumeros), (cfg, num) => {
      const ocupados = {};
      for (const n of L.NUMEROS) if (num.mapa[n]) ocupados[n] = true;
      return {
        config: L.configCompleta(cfg.datos, DEFAULTS),
        ocupados,
        actualizado: new Date(), // el momento en que llegó esta actualización (ya no un campo del servidor)
        pendiente: cfg.pendiente || num.pendiente,
      };
    });

    const escribirLote = (armar) => {
      const lote = db.batch();
      armar(lote);
      return lote.commit();
    };

    return {
      mode: 'firebase',
      emulador: EMULADOR,
      onAuth(cb) {
        if (!auth) { cb(null); return () => {}; }
        return auth.onAuthStateChanged((u) => cb(u ? { email: u.email } : null));
      },
      signIn: (email, clave) => auth.signInWithEmailAndPassword(email, clave),
      signOut: () => auth.signOut(),

      subscribePublic(cb, onError) { return suscribirPublico(cb, onError); },
      subscribeAdmin(cb, onError) {
        return colVentas.onSnapshot(OPT, (snap) => {
          const ventas = {};
          snap.forEach((doc) => {
            const data = doc.data();
            const v = L.normalizarVenta(data);
            v.creado = data.creado && data.creado.toDate ? data.creado.toDate() : null;
            ventas[doc.id] = v;
          });
          cb({ ventas, pendiente: snap.metadata.hasPendingWrites });
        }, onError);
      },

      // "creado: true" es una señal (no una fecha real) que solo pone admin.js/public.js
      // en una venta NUEVA; aquí se cambia por la fecha real del servidor. Si no viene,
      // se omite del todo para que el merge conserve la fecha que ya tenía (editar el
      // pago de alguien no le cambia la fecha en la que reservó su número).
      saveSale: (num, venta) => escribirLote((lote) => {
        const datos = { ...venta };
        if (datos.creado === true) datos.creado = FV.serverTimestamp();
        else delete datos.creado;
        lote.set(colNumeros.doc(num), { ocupado: true });
        lote.set(colVentas.doc(num), datos, { merge: true });
      }),
      releaseNumber: (num) => escribirLote((lote) => {
        lote.delete(colNumeros.doc(num));
        lote.delete(colVentas.doc(num));
      }),
      saveConfig: (config) => docConfig.set(config, { merge: true }),
    };
  }

  /* ---------- API ---------- */

  // conAuth: true en la página de administración (necesita iniciar sesión); false en la pública.
  async function init({ auth: conAuth = false } = {}) {
    if (EMULADOR || CONFIGURADO) return crearFirebase(conAuth);
    return crearLocal();
  }

  window.RifaStore = { init };
})();
