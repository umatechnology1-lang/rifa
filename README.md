# Rifa con propósito

Rifa de 100 números (00–99) con dos vistas:

| Página | Para quién | Qué hace |
|---|---|---|
| `index.html` | Cualquier persona con el enlace | Solo **mira** qué números quedan disponibles, en tiempo real. No puede editar nada ni ve nombres ni pagos. |
| `admin.html` | Solo tú (con correo y contraseña) | Asignas números con el nombre de la persona, marcas si **pagó / abonó / no ha pagado**, ves cuánto llevas recaudado y cuánto te deben, buscas por nombre, y copias la lista de disponibles para pegarla en WhatsApp. |

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

Las reglas son lo que garantiza que el público solo pueda **leer** el tablero y que solo tú puedas modificar algo o ver nombres y pagos.

1. Abre [firestore.rules](firestore.rules) y cambia `tu_correo@gmail.com` por **tu correo de administrador, todo en minúsculas** (Firebase guarda los correos así y la comparación distingue mayúsculas).
2. En Firebase: **Firestore Database → Reglas**, pega el contenido completo del archivo y pulsa **Publicar**.

Si olvidas este paso, la app te avisará "Esta cuenta no tiene permiso de administrador".

## 4. Publicarla en internet (GitHub Pages)

Esta carpeta es autocontenida (solo usa rutas relativas), así que puedes publicarla de dos formas:

- **Junto a tu planeación**: al hacer push del repo `mi-planeacion` (con Pages activado), quedará en `https://TU_USUARIO.github.io/mi-planeacion/rifa/`.
- **En su propio repositorio** (más limpio): copia el contenido de `rifa/` a un repo nuevo, sube a `main` y en **Settings → Pages** elige *Deploy from a branch → main → / (root)*. Quedará en `https://TU_USUARIO.github.io/NOMBRE_REPO/`.

Comparte con la gente **solo la dirección principal** (la que termina en `/` o `/rifa/`). Tu panel está en la misma dirección + `admin.html`.

Si al iniciar sesión sale `auth/unauthorized-domain`, agrega tu dominio (`TU_USUARIO.github.io`) en Firebase → Authentication → Settings → Authorized domains.

## Uso diario

- **Vender un número**: entra a `admin.html`, toca el número, escribe el nombre, elige *Sin pagar / Abonó / Pagó* (si abonó, cuánto) y guarda. La vista pública se actualiza sola en segundos.
- **Cambiar un pago**: toca el número otra vez y cambia el estado.
- **Liberar un número** (si la persona se arrepiente): toca el número → *Liberar número* (pide confirmarlo con un segundo toque).
- **Ajustes**: título, premio, precio, fecha, lotería y datos de contacto. Se ven de inmediato en la vista pública.
- **Compartir disponibles**: en el celular abre el menú de compartir; en el computador copia el texto para pegarlo en WhatsApp.
- Colores en el panel: **rojo ✕** sin pagar · **ámbar ◐** abonó · **verde ✓** pagó · sin color = libre.

## Cómo protege los datos

Firestore guarda dos documentos:

- `rifa/publico` → ajustes de la rifa y **solo qué números están ocupados** (sin nombres). Lectura pública, escritura solo del admin.
- `privado/ventas` → nombre, teléfono, estado de pago y notas. **Solo el admin** puede leerlo o escribirlo.

La `apiKey` de Firebase que va en `js/config.js` es pública por diseño; la seguridad la dan las reglas de arriba.

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
