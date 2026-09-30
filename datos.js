/* ============================================================
   BLOQUE 1 · DATOS — la "base de datos" de la app
   Estructura (igual a Presupuesto.xlsx):
     presupuestos[] : versiones { desde:'YYYY-MM', lineas:[{cat, concepto, valor}], mod }
     gastos[]       : { id, fecha, cat, concepto, detalle, valor, comentario, por, mod }
     ingresos[]     : { id, fecha, cat, concepto, valor, comentario, por, mod }
     cuentas[]      : { id, clase:'ahorro'|'deuda', nombre, lugar, mod }
     movCuentas[]   : { id, fecha, cuenta, tipo:'saldo'|'mas'|'menos', valor, comentario, por, mod }
     borrados{}     : { id: marcaDeTiempo } — "lápidas" para que un borrado se propague
   `mod` (marca de tiempo) permite combinar los cambios de dos personas
   registro por registro: gana la versión más reciente.
   Copia local en localStorage; la copia compartida vive en OneDrive (Bloque 7).
   ============================================================ */
const Datos = (() => {
  const CLAVE = 'porti-herrera.v1';
  const CLAVE_ANTIGUA = 'bupeta.v1';     // nombre anterior de la app: se lee una vez si existe
  const COLECCIONES = ['presupuestos', 'gastos', 'ingresos', 'cuentas', 'movCuentas'];
  let db = null;
  let rev = 0;
  let autor = '';
  let oyente = null;                      // se llama cuando hay un cambio LOCAL (para subirlo)

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clonar = (o) => JSON.parse(JSON.stringify(o));
  const ahora = () => Date.now();
  const clave = (col, x) => (col === 'presupuestos' ? 'p:' + x.desde : x.id);

  function valido(o) {
    return o && (o.version === 1 || o.version === 2) && o.ajustes && COLECCIONES.every((k) => Array.isArray(o[k]));
  }
  /* v1 → v2: agrega marcas de tiempo y lápidas; el mes pasa a iniciar el 25 */
  function migrar(o) {
    if (o.version === 1) {
      o.version = 2;
      o.borrados = {};
      o.ajustes = { ...o.ajustes, diaInicio: 25, mod: 0 };
      for (const col of COLECCIONES) for (const x of o[col]) x.mod = x.mod || 0;
    }
    o.borrados = o.borrados || {};
    return o;
  }

  function cargar() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE) || localStorage.getItem(CLAVE_ANTIGUA));
      if (valido(guardado)) db = migrar(guardado);
    } catch (e) { console.warn('No se pudo leer localStorage', e); }
    if (!db) db = migrar(clonar(SEMILLA));
    persistir();
    rev++;
    return db;
  }

  function persistir() {
    try { localStorage.setItem(CLAVE, JSON.stringify(db)); return true; }
    catch (e) { console.error(e); return false; }
  }
  function guardar(local = true) {
    rev++;
    persistir();
    if (local && oyente) oyente();
  }

  /* ---- CRUD genérico ---- */
  function agregar(col, fila) {
    fila.id = fila.id || uid();
    fila.mod = ahora();
    if (autor && !fila.por && col !== 'cuentas') fila.por = autor;
    db[col].push(fila);
    guardar();
    return fila;
  }
  /* Siempre posterior a la versión anterior, aunque el reloj de otro dispositivo vaya adelantado */
  const despuesDe = (x) => Math.max(ahora(), (x?.mod || 0) + 1);

  function actualizar(col, id, cambios) {
    const fila = db[col].find((x) => x.id === id);
    if (fila) { Object.assign(fila, cambios, { mod: despuesDe(fila) }); guardar(); }
    return fila;
  }
  function eliminar(col, id) {
    const t = despuesDe(db[col].find((x) => x.id === id));
    db.borrados[id] = t;
    db[col] = db[col].filter((x) => x.id !== id);
    if (col === 'cuentas') {
      db.movCuentas.forEach((m) => { if (m.cuenta === id) db.borrados[m.id] = Math.max(t, despuesDe(m)); });
      db.movCuentas = db.movCuentas.filter((m) => m.cuenta !== id);
    }
    guardar();
  }

  /* ---- Presupuesto: una versión por mes de vigencia ---- */
  function guardarPresupuesto(desde, lineas) {
    const i = db.presupuestos.findIndex((v) => v.desde === desde);
    const version = { desde, lineas, mod: despuesDe(db.presupuestos[i]) };
    if (i >= 0) db.presupuestos[i] = version; else db.presupuestos.push(version);
    db.presupuestos.sort((a, b) => a.desde.localeCompare(b.desde));
    guardar();
  }

  function ajustar(cambios) { Object.assign(db.ajustes, cambios, { mod: despuesDe(db.ajustes) }); guardar(); }

  /* ---- Combinar con otra copia (OneDrive o respaldo) ----
     Devuelve { cambioLocal, faltaRemoto }:
       cambioLocal → la otra copia traía algo nuevo (hay que repintar)
       faltaRemoto → esta copia tiene algo que la otra no (hay que subir) */
  function fusionar(otro) {
    const r = migrar(clonar(otro));
    let cambioLocal = false, faltaRemoto = false;

    const B = { ...db.borrados };
    for (const [k, t] of Object.entries(r.borrados)) if (!(B[k] >= t)) B[k] = t;
    for (const k in B) {
      if (r.borrados[k] !== B[k]) faltaRemoto = true;
      if (db.borrados[k] !== B[k]) cambioLocal = true;
    }

    const res = { version: 2, borrados: B };
    for (const col of COLECCIONES) {
      const L = new Map(db[col].map((x) => [clave(col, x), x]));
      const R = new Map(r[col].map((x) => [clave(col, x), x]));
      const F = new Map(L);
      for (const [k, x] of R) { const l = F.get(k); if (!l || (x.mod || 0) > (l.mod || 0)) F.set(k, x); }
      const final = [];
      for (const [k, x] of F) {
        if (B[k] >= (x.mod || 0)) continue;                   // borrado después de su último cambio
        final.push(x);
        if (R.get(k)?.mod !== x.mod) faltaRemoto = true;
        if (L.get(k)?.mod !== x.mod) cambioLocal = true;
      }
      if (final.length !== L.size) cambioLocal = true;
      if (final.length !== R.size) faltaRemoto = true;
      res[col] = final;
    }
    res.presupuestos.sort((a, b) => a.desde.localeCompare(b.desde));

    const ra = r.ajustes.mod || 0, la = db.ajustes.mod || 0;
    res.ajustes = ra > la ? r.ajustes : db.ajustes;
    if (ra > la) cambioLocal = true; else if (la > ra) faltaRemoto = true;

    db = res;
    if (cambioLocal) guardar(false); else persistir();
    return { cambioLocal, faltaRemoto };
  }

  /* ---- Respaldo ---- */
  const exportar = () => JSON.stringify(db);
  function importar(texto) {
    const obj = JSON.parse(texto);
    if (!valido(obj)) throw new Error('El archivo no tiene el formato de Porti-Herrera.');
    const r = fusionar(obj);
    if (r.faltaRemoto || r.cambioLocal) guardar();
  }
  function marcarTodoBorrado(cols) {
    for (const col of cols) for (const x of db[col]) db.borrados[clave(col, x)] = despuesDe(x);
  }
  function vaciar() {
    marcarTodoBorrado(['gastos', 'ingresos', 'movCuentas']);
    db.gastos = []; db.ingresos = []; db.movCuentas = [];
    guardar();
  }

  return {
    cargar, guardar, agregar, actualizar, eliminar, guardarPresupuesto, ajustar, fusionar,
    exportar, importar, vaciar,
    get: () => db, rev: () => rev,
    alCambiar: (fn) => { oyente = fn; },
    fijarAutor: (nombre) => { autor = nombre || ''; },
  };
})();
