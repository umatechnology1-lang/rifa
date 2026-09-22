# Rifa con propósito

Rifa de 100 números (00–99) con dos vistas:

| Página | Para quién | Qué hace |
|---|---|---|
| `index.html` | Cualquier persona con el enlace | Ve en tiempo real qué números quedan y puede **reservar uno para sí misma** (toca el número → escribe su nombre → confirma). Nunca ve el nombre de nadie más, ni puede tocar un número ya vendido; queda marcado como "Vendida", nunca con el nombre de otra persona. Después de reservar, un botón le abre WhatsApp con un mensaje ya escrito avisando cuál número reservó. |
| `admin.html` | Solo tú (con correo y contraseña) | Ves todos los números (los reservados por la gente y los que asignes tú), marcas si **pagó / abonó / no ha pagado**, ves cuánto llevas recaudado y cuánto te deben, buscas por nombre, y copias la lista de disponibles para pegarla en WhatsApp. |

Funciona desde cualquier dispositivo (celular, tablet, computador) porque es una página web estática + Firebase para guardar los datos.

## 1. Probarla ya mismo (modo local)

Sin configurar nada, la rifa funciona en **modo local**: los datos se guardan solo en ese navegador. Sirve para probar cómo se ve y se usa.

```bash
cd rifa
python -m http.server 5173
```

Abre <http://localhost:5173/admin.html> (administrar) y <http://localhost:5173/> (vista pública). Un aviso amarillo te recuerda que estás en modo local.

## 2. Conectar Firebase (para usarla desde varios dispositivos)

1. Entra a <https://console.firebase.google.com> y crea un proyecto nuevo (ej. `rifa`). Puedes desactivar Google Analytics.
   *(Conviene un proyecto aparte del de tu planeación, para no mezclar reglas de seguridad.)*
2. **Compilación → Firestore Database → Crear base de datos**. Elige la ubicación más cercana y el modo **producción** (las reglas del paso 3 lo protegen).
3. **Compilación → Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar**.
4. En la pestaña **Users → Agregar usuario**: escribe **tu correo** y una **contraseña**. Esa será tu cuenta de administrador.
   *(Recomendado: en **Settings → User actions** desactiva la creación de cuentas nuevas, así nadie más puede registrarse.)*
5. **Configuración del proyecto (⚙) → General → Tus apps → `</>` (Web)**: registra una app y copia el objeto `firebaseConfig`.
6. Pega esos valores en [js/config.js](js/config.js), reemplazando los `TU_...`.

## 3. Publicar las reglas de seguridad (importante)

Las reglas son lo que garantiza que: cualquiera pueda **leer** el tablero, que la gente solo pueda reservar un número **libre** (nunca robarse uno ya tomado, ni marcarse a sí misma como pagada), y que **solo tú** puedas ver nombres y pagos o editar algo ya existente.

1. Abre [firestore.rules](firestore.rules) y cambia `umatechnology1@gmail.com` por **tu correo de administrador, todo en minúsculas** (Firebase guarda los correos así y la comparación distingue mayúsculas).
2. En Firebase: **Firestore Database → Reglas**, pega el contenido completo del archivo y pulsa **Publicar**.

Si olvidas este paso, la app te avisará "Esta cuenta no tiene permiso de administrador".

## 4. Publicarla en internet (GitHub Pages)

Esta carpeta es autocontenida (solo usa rutas relativas), así que puedes publicarla de dos formas:

- **Junto a tu planeación**: al hacer push del repo `mi-planeacion` (con Pages activado), quedará en `https://TU_USUARIO.github.io/mi-planeacion/rifa/`.
- **En su propio repositorio** (más limpio): copia el contenido de `rifa/` a un repo nuevo, sube a `main` y en **Settings → Pages** elige *Deploy from a branch → main → / (root)*. Quedará en `https://TU_USUARIO.github.io/NOMBRE_REPO/`.

Comparte con la gente **solo la dirección principal** (la que termina en `/` o `/rifa/`). Tu panel está en la misma dirección + `admin.html`.

Si al iniciar sesión sale `auth/unauthorized-domain`, agrega tu dominio (`TU_USUARIO.github.io`) en Firebase → Authentication → Settings → Authorized domains.

## Uso diario

- **Alguien reserva su propio número**: en la vista pública toca un número libre, escribe su nombre y confirma. Le aparece un botón para avisar por WhatsApp con un mensaje ya escrito. Queda "Sin pagar" hasta que tú confirmes el pago.
- **Vender un número tú mismo**: entra a `admin.html`, toca el número, escribe el nombre, elige *Sin pagar / Abonó / Pagó* (si abonó, cuánto) y guarda. La vista pública se actualiza sola en segundos.
- **Confirmar un pago que alguien reservó solo**: toca ese número en el panel (aparece igual que uno que tú hubieras asignado) y cambia el estado a *Abonó* o *Pagó*.
- **Liberar un número** (si la persona se arrepiente): toca el número → *Liberar número* (pide confirmarlo con un segundo toque).
- **Ajustes**: título, premio, precio, fecha, lotería y datos de contacto. Se ven de inmediato en la vista pública.
- **Compartir disponibles**: en el celular abre el menú de compartir; en el computador copia el texto para pegarlo en WhatsApp.
- **Ver quién compró últimamente**: pestaña *Recientes* en el panel — lista los últimos 20 números reservados, del más nuevo al más viejo, con hace cuánto fue. Útil cuando la rifa se llena rápido y no alcanzas a leer cada aviso. Los números vendidos antes de que existiera esta pestaña aparecen al final como "Fecha desconocida".
- Colores en el panel: **rojo ✕** sin pagar · **ámbar ◐** abonó · **verde ✓** pagó · **rayado ⚠** ocupado sin ninguna venta guardada (rarísimo; solo pasa si alguien escribió directo a la base de datos por fuera de la app) · sin color = libre.

## Cómo protege los datos

Cada número de la rifa es su propio registro en Firestore (así la gente puede reservar un número sin poder tocar ningún otro dato):

- `config/ajustes` → título, premio, precio, fecha, contacto. Lectura pública, escritura solo del admin.
- `numeros/{n}` → EXISTE si el número está ocupado (nada más). Lectura pública. Cualquiera puede crear el suyo (reservarlo) si todavía no existe; nadie más que el admin puede editarlo o borrarlo.
- `ventas/{n}` → nombre, teléfono, estado de pago y nota de quien tiene el número {n}. **Solo el admin** puede leer esto (ni siquiera quien lo reservó puede volver a verlo). Cualquiera puede crear su propia entrada la primera vez, siempre "sin pagar" y con abono en 0 — nunca puede marcarse a sí misma como pagada, ni editar o borrar una entrada ya existente.

La `apiKey` de Firebase que va en `js/config.js` es pública por diseño; la seguridad la dan las reglas de arriba.

**Límite conocido:** alguien con conocimientos técnicos (abriendo las herramientas de desarrollador del navegador) podría, en teoría, marcar números como ocupados muy rápido, o marcar uno como ocupado sin escribir ningún nombre (un número "fantasma"). El panel de administración detecta estos últimos y te deja liberarlos con un clic. No hay una forma sencilla de impedir del todo un abuso así sin agregar sistemas más complejos (como Firebase App Check); para una rifa entre conocidos el riesgo es bajo, pero vale la pena que lo sepas.

## Pruebas

```bash
npm install
npm run test:logic   # formatos, validaciones, totales de dinero, filtros
npm run test:rules   # reglas de seguridad contra el emulador de Firestore (requiere Java)
npm run emuladores   # Auth + Firestore locales; abre admin.html?emulator y index.html?emulator
```

Con `?emulator` en la dirección (solo en `localhost`) las páginas usan los emuladores en lugar de tu Firebase real.

**Windows:** si el emulador falla con `Unable to establish loopback connection`, es un problema de Java con rutas temporales de nombre corto. Crea una carpeta corta y apunta Java a ella antes de correr las pruebas:

```powershell
mkdir C:\Users\Public\jt
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\Users\Public\jt'
```
