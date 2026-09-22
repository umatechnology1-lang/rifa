// ─── Conexión a Firebase ───────────────────────────────────────────────────
// Mientras apiKey diga "TU_API_KEY" la rifa funciona en MODO LOCAL: los datos se guardan
// solo en este navegador. Para verla y editarla desde cualquier dispositivo, crea un proyecto
// en Firebase y pega aquí tu configuración (ver README.md, paso 2).
window.RIFA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCPqTJA_If6052K-Gve6dZyFepae9iPLxQ",
  authDomain: "rifa-3aa53.firebaseapp.com",
  projectId: "rifa-3aa53",
  storageBucket: "rifa-3aa53.firebasestorage.app",
  messagingSenderId: "39681801773",
  appId: "1:39681801773:web:d7290cbb6cda4b594d42a4"
};

// ─── Valores iniciales de la rifa ──────────────────────────────────────────
// Salen del volante. Después se cambian desde Administrar → Ajustes, sin tocar este archivo.
window.RIFA_DEFAULTS = {
  subtitulo: "Con propósito",
  premio: 1000000,
  precio: 30000,
  fecha: "2026-10-30",
  loteria: "Lotería de Risaralda",
  contactoNombre: "Karen Medina",
  telefono: "3193866037"
};
