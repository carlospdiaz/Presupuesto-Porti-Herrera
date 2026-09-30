/* ============================================================
   CONFIGURACIÓN — conexión con Google Drive
   clientId: el "ID de cliente" OAuth que entrega Google Cloud al
   registrar la app (ver pasos en LEEME.md). No es un secreto.
   ============================================================ */
const CONFIG = {
  clientId: '',                     // ← pegar aquí, ej. '1234-abcd.apps.googleusercontent.com'
  carpeta: 'Porti-Herrera',                // carpeta en el Google Drive del dueño
  archivo: 'porti-herrera-datos.json',     // archivo compartido con los datos
  cadaSegundos: 45,                 // cada cuánto se revisan cambios del otro
};
