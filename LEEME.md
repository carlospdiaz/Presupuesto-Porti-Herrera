# Porti-Herrera · finanzas de la casa

App web (HTML + CSS + JavaScript, sin instalar nada) para llevar presupuesto, gastos,
ingresos, ahorros y deudas en pareja. Los datos se comparten a través de un archivo en
Google Drive.

## Estructura

| Archivo | Bloque |
|---|---|
| `index.html` | Página y menú |
| `css/styles.css` | Estilos (paleta del Excel "Contabilidad Sofi") |
| `js/config.js` | **Configuración de Google Drive** (ID de cliente) |
| `js/semilla.js` | Datos iniciales importados de `Presupuesto .xlsx` |
| `js/datos.js` | Base de datos local + combinación de cambios entre dispositivos |
| `js/motor.js` | Cálculos vectorizados (columnas tipadas + agrupación en una pasada) |
| `js/vistas.js` | Pantallas |
| `js/formularios.js` | Registrar / editar |
| `js/exportar.js` | Exportación a CSV |
| `js/nube.js` | Sincronización con Google Drive |
| `js/app.js` | Navegación y eventos |

---

## 1. Registrar la app en Google (una sola vez, gratis)

1. Entra a <https://console.cloud.google.com/> con tu cuenta Google.
2. Arriba: **Seleccionar proyecto → Proyecto nuevo** → nombre `Porti-Herrera` → Crear.
3. Menú ☰ → **APIs y servicios → Biblioteca** → busca **Google Drive API** → **Habilitar**.
4. Menú ☰ → **APIs y servicios → Pantalla de consentimiento de OAuth** (o "Google Auth Platform"):
   - Tipo de usuario: **Externo**. Nombre de la app: `Porti-Herrera`. Tu correo como soporte y contacto.
   - En **Público / Usuarios de prueba** agrega **tu correo y el de tu esposa**.
   - Deja la app en modo **Prueba** (no hace falta publicarla ni verificarla).
5. Menú ☰ → **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - **Orígenes de JavaScript autorizados**: agrega
     - `http://localhost:8000`
     - la dirección donde publiques la app (paso 3), p. ej. `https://TU-USUARIO.github.io`
   - **URI de redireccionamiento autorizados**: agrega la dirección exacta de la página:
     - `http://localhost:8000/` y `http://localhost:8000/index.html`
     - p. ej. `https://TU-USUARIO.github.io/porti-herrera/` y `https://TU-USUARIO.github.io/porti-herrera/index.html`
6. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`) y pégalo en
   `js/config.js` → `clientId: '...'`.

> Al iniciar sesión Google mostrará "Google no verificó esta app" porque es una app personal
> en modo prueba: toca **Continuar**. La app pide acceso a Drive, pero solo lee y escribe
> `Porti-Herrera/porti-herrera-datos.json`.

## 2. Probar en el computador

Google no permite iniciar sesión desde un archivo abierto con doble clic (`file://`).
En la carpeta de la app abre PowerShell y ejecuta:

```powershell
python -m http.server 8000
```

Abre <http://localhost:8000> en el navegador.

## 3. Publicar para usarla desde los celulares (GitHub Pages, gratis)

1. Crea una cuenta en <https://github.com> y un repositorio nuevo, p. ej. `porti-herrera`.
2. Sube el contenido de esta carpeta (botón **Add file → Upload files**),
   **excepto `datos-excel.json`** (tiene sus datos reales; la página publicada es visible para cualquiera).
3. En el repositorio: **Settings → Pages → Branch: main / root → Save**.
4. En 1–2 minutos la app queda en `https://TU-USUARIO.github.io/porti-herrera/`.
   Agrega esa dirección en Google Cloud (paso 1.5) si no lo hiciste.
5. En el celular abre esa dirección y usa **"Agregar a la pantalla de inicio"** para tenerla como app.

> El código publicado no contiene datos: `js/semilla.js` es una base vacía. Los datos reales
> viven solo en su Google Drive y en la memoria de cada navegador.

## 4. Conectar los dos

1. **Tú (dueño), la primera vez:** Ajustes → **Cargar respaldo** → elige `datos-excel.json`
   (los datos de `Presupuesto .xlsx`). Luego **Conectar mi Google Drive**: se crea
   `Porti-Herrera/porti-herrera-datos.json` en tu Drive con esos datos.
2. En Google Drive: clic derecho en la carpeta **Porti-Herrera** → **Compartir** → correo de tu esposa como
   **Editor** → **Copiar vínculo**.
3. **Tu esposa:** abre la app → Ajustes → pega el vínculo en **Drive compartido** → **Conectar al compartido**.

Desde ahí cada cambio se sube en segundos y la app revisa cada 45 s si el otro cambió algo.
La barra superior muestra el estado: ☁ Sincronizado · ↻ Sincronizando · ⚠ Sin conexión.
La sesión de Google dura una hora; al volver a la app se renueva sola (si no, toca el aviso ⚠).

## Exportar

Ajustes → **Exportar datos (CSV)**: gastos, ingresos, movimientos de ahorro, saldos,
presupuesto y resumen mensual por categoría. Separador `;` para Excel en español
o `,` para Python / Power BI. En Movimientos puedes exportar solo lo filtrado.
