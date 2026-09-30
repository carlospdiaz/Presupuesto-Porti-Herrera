/* ============================================================
   CONFIGURACIÓN — conexión con Google Drive
   clientId: el "ID de cliente" OAuth que entrega Google Cloud al
   registrar la app (ver pasos en LEEME.md). No es un secreto.
   ============================================================ */
const CONFIG = {
  clientId: '981746464576-n878ps1vnmpu9sdfuij92k16622fdj1i.apps.googleusercontent.com',                     // ← pegar aquí, ej. '1234-abcd.apps.googleusercontent.com'
  carpeta: 'Presupuesto Porti-Herrera',                // carpeta en el Google Drive del dueño
  archivo: 'Pres-porti-herrera-datos.json',     // archivo compartido con los datos
  cadaSegundos: 45,                 // cada cuánto se revisan cambios del otro
};
