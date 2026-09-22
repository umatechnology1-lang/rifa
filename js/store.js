/* Capa de datos de la rifa. Dos modos con la misma interfaz:
 *   · local    → localStorage del navegador (sin config de Firebase; útil para probar).
 *   · firebase → Firestore + Auth, para verla y editarla desde cualquier dispositivo.
 *
 * Datos en Firestore:
 *   rifa/publico   (lectura pública)  → ajustes de la rifa + ocupados { "07": true } + actualizado
 *   privado/ventas (solo el admin)    → ventas { "07": { nombre, telefono, estado, abonado, nota } }
 * Así cualquiera puede ver qué números quedan, pero solo el admin ve nombres y pagos.
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

  /* ---------- Conversión de documentos ---------- */

  function aFecha(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  function parsePublico(d) {
    d = d && typeof d === 'object' ? d : {};
    const ocupados = {};
    if (d.ocupados && typeof d.ocupados === 'object') {
      for (const n of L.NUMEROS) if (d.ocupados[n]) ocupados[n] = true;
    }
    return { config: L.configCompleta(d, DEFAULTS), ocupados, actualizado: aFecha(d.actualizado) };
  }

  function parseVentas(d) {
    const ventas = {};
    const src = d && d.ventas && typeof d.ventas === 'object' ? d.ventas : {};
    for (const n of L.NUMEROS) if (src[n]) ventas[n] = L.normalizarVenta(src[n]);
    return ventas;
  }

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
        const f = () => cb({ ventas: parseVentas({ ventas: leer(K_VEN).ventas }), pendiente: false });
        oyentes.add(f);
        f();
        return () => oyentes.delete(f);
      },

      saveSale(num, venta) {
        const pub = leer(K_PUB), ven = leer(K_VEN);
        pub.ocupados = { ...(pub.ocupados || {}), [num]: true };
        pub.actualizado = Date.now();
        ven.ventas = { ...(ven.ventas || {}), [num]: venta };
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
    const docPub = db.doc('rifa/publico');
    const docVen = db.doc('privado/ventas');
    const OPT = { includeMetadataChanges: true };

    // Un documento que aún no llegó del servidor (caché vacía) no se toma como "no existe":
    // así nunca se muestran todos los números libres solo porque no hay conexión.
    const autoritativo = (snap) => !(snap.metadata.fromCache && !snap.exists);
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

      subscribePublic(cb, onError) {
        return docPub.onSnapshot(OPT, (snap) => {
          if (!autoritativo(snap)) return;
          cb({ ...parsePublico(snap.data({ serverTimestamps: 'estimate' })), pendiente: snap.metadata.hasPendingWrites });
        }, onError);
      },
      subscribeAdmin(cb, onError) {
        return docVen.onSnapshot(OPT, (snap) => {
          if (!autoritativo(snap)) return;
          cb({ ventas: parseVentas(snap.data()), pendiente: snap.metadata.hasPendingWrites });
        }, onError);
      },

      saveSale: (num, venta) => escribirLote((lote) => {
        lote.set(docVen, { ventas: { [num]: venta } }, { merge: true });
        lote.set(docPub, { ocupados: { [num]: true }, actualizado: FV.serverTimestamp() }, { merge: true });
      }),
      releaseNumber: (num) => escribirLote((lote) => {
        lote.set(docVen, { ventas: { [num]: FV.delete() } }, { merge: true });
        lote.set(docPub, { ocupados: { [num]: FV.delete() }, actualizado: FV.serverTimestamp() }, { merge: true });
      }),
      saveConfig: (config) => docPub.set({ ...config, actualizado: FV.serverTimestamp() }, { merge: true }),
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
