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
