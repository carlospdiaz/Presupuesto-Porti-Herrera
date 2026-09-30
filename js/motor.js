/* ============================================================
   BLOQUE 2 · MOTOR — cálculos vectorizados
   Idea: cada tabla (gastos, ingresos, movimientos) se convierte UNA vez
   en columnas tipadas (Int32Array / Float64Array / Uint16Array) con las
   categorías codificadas como enteros. Luego todo total por categoría,
   concepto o periodo sale de un `bincount` de una sola pasada, O(n),
   en lugar de filtrar la lista una vez por cada categoría, O(n·k).
   La caché se invalida sola cuando Datos.rev() cambia.
   ============================================================ */
const Motor = (() => {
  const SEP = '␟';                       // separador interno cat␟concepto
  const TIPO = { saldo: 0, mas: 1, menos: 2 };
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
                 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /* ---------- 2.1 Fechas y periodos ----------
     fnum = AAAAMMDD (entero, comparable)   periodo = año*12 + mes0
     Con diaInicio = 1 el periodo es el mes calendario.
     Con diaInicio > 15 (ej. 25) el ciclo 25-sep → 24-oct se llama "Octubre"
     (así lo nombra el Excel de Sofi). Con 2..15 se nombra por el mes en que empieza. */
  const aFnum = (iso) => +iso.slice(0, 4) * 10000 + +iso.slice(5, 7) * 100 + +iso.slice(8, 10);
  const dateAIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoyIso = () => dateAIso(new Date());
  const ymAPeriodo = (ym) => +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1);
  const periodoAYm = (p) => `${Math.floor(p / 12)}-${String((p % 12) + 1).padStart(2, '0')}`;

  function periodoDeFnum(f, dia) {
    const y = (f / 10000) | 0, m = (((f / 100) | 0) % 100) - 1, d = f % 100;
    const base = y * 12 + m;
    if (dia <= 1) return base;
    if (dia > 15) return d >= dia ? base + 1 : base;
    return d >= dia ? base : base - 1;
  }
  const periodoDe = (iso, dia = diaInicio()) => periodoDeFnum(aFnum(iso), dia);
  const periodoActual = () => periodoDe(hoyIso());

  function rangoPeriodo(p, dia = diaInicio()) {
    const y = Math.floor(p / 12), m = p % 12;
    let ini, fin;
    if (dia <= 1) { ini = new Date(y, m, 1); fin = new Date(y, m + 1, 0); }
    else if (dia > 15) { ini = new Date(y, m - 1, dia); fin = new Date(y, m, dia - 1); }
    else { ini = new Date(y, m, dia); fin = new Date(y, m + 1, dia - 1); }
    return { ini: dateAIso(ini), fin: dateAIso(fin), dias: Math.round((fin - ini) / 864e5) + 1 };
  }
  const nombrePeriodo = (p) => `${MESES[p % 12]} ${Math.floor(p / 12)}`;
  function detallePeriodo(p) {
    const r = rangoPeriodo(p);
    return `${fechaCorta(r.ini)} – ${fechaCorta(r.fin)}`;
  }
  const fechaCorta = (iso) => `${+iso.slice(8, 10)} ${MES_CORTO[+iso.slice(5, 7) - 1]}`;
  const diaInicio = () => Datos.get().ajustes.diaInicio || 1;

  /* ---------- 2.2 Primitivas vectoriales ---------- */
  function codificar(valores, dic) {            // strings → códigos enteros (diccionario)
    const out = new Uint16Array(valores.length);
    for (let i = 0; i < valores.length; i++) {
      let c = dic.get(valores[i]);
      if (c === undefined) { c = dic.size; dic.set(valores[i], c); }
      out[i] = c;
    }
    return out;
  }
  function bincount(idx, pesos, tam, mascara) { // suma de pesos agrupada por código
    const out = new Float64Array(tam);
    if (mascara) { for (let i = 0; i < idx.length; i++) if (mascara[i]) out[idx[i]] += pesos[i]; }
    else { for (let i = 0; i < idx.length; i++) out[idx[i]] += pesos[i]; }
    return out;
  }
  function entre(col, a, b) {                   // máscara booleana a <= col <= b
    const m = new Uint8Array(col.length);
    for (let i = 0; i < col.length; i++) m[i] = col[i] >= a && col[i] <= b ? 1 : 0;
    return m;
  }
  function y(m1, m2) { const m = new Uint8Array(m1.length); for (let i = 0; i < m.length; i++) m[i] = m1[i] & m2[i]; return m; }
  function igual(col, v) { const m = new Uint8Array(col.length); for (let i = 0; i < col.length; i++) m[i] = col[i] === v ? 1 : 0; return m; }
  function suma(v, mascara) {
    let s = 0;
    if (mascara) { for (let i = 0; i < v.length; i++) if (mascara[i]) s += v[i]; }
    else { for (let i = 0; i < v.length; i++) s += v[i]; }
    return s;
  }
  function restar(a, b) { const r = new Float64Array(a.length); for (let i = 0; i < a.length; i++) r[i] = a[i] - b[i]; return r; }
  function posiciones(mascara) {                // máscara → índices de filas
    let n = 0; for (let i = 0; i < mascara.length; i++) n += mascara[i];
    const out = new Int32Array(n);
    for (let i = 0, j = 0; i < mascara.length; i++) if (mascara[i]) out[j++] = i;
    return out;
  }

  /* ---------- 2.3 Índice columnar (cacheado por revisión) ---------- */
  function columnas(filas, dia) {
    const n = filas.length;
    const c = { n, fnum: new Int32Array(n), per: new Int32Array(n), val: new Float64Array(n) };
    for (let i = 0; i < n; i++) {
      const f = aFnum(filas[i].fecha);
      c.fnum[i] = f; c.per[i] = periodoDeFnum(f, dia); c.val[i] = +filas[i].valor || 0;
    }
    return c;
  }

  let cache = null;
  function indice() {
    const db = Datos.get(), rev = Datos.rev();
    if (cache && cache.rev === rev) return cache;
    const dia = db.ajustes.diaInicio || 1;

    // Diccionario de líneas: primero las del presupuesto (orden natural del Excel), luego las nuevas de gastos
    const dicLin = new Map(), dicCat = new Map(), dicIngCat = new Map();
    for (const v of db.presupuestos) codificar(v.lineas.map((l) => l.cat + SEP + l.concepto), dicLin);

    const G = db.gastos, g = columnas(G, dia);
    g.lin = codificar(G.map((x) => x.cat + SEP + x.concepto), dicLin);
    const lineas = [...dicLin.keys()].map((k) => { const [cat, concepto] = k.split(SEP); return { cat, concepto }; });
    const linCat = codificar(lineas.map((l) => l.cat), dicCat);
    g.cat = new Uint16Array(g.n);
    for (let i = 0; i < g.n; i++) g.cat[i] = linCat[g.lin[i]];

    const I = db.ingresos, ing = columnas(I, dia);
    ing.cat = codificar(I.map((x) => x.cat), dicIngCat);

    const posCta = new Map(db.cuentas.map((c, i) => [c.id, i]));
    const M = db.movCuentas.filter((m) => posCta.has(m.cuenta))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));   // sort estable
    const mov = columnas(M, dia);
    mov.cta = Uint16Array.from(M, (m) => posCta.get(m.cuenta));
    mov.tipo = Uint8Array.from(M, (m) => TIPO[m.tipo] ?? 0);

    cache = { rev, dia, G, I, M, g, ing, mov, lineas, linCat, dicLin, cats: [...dicCat.keys()],
              ingCats: [...dicIngCat.keys()], memo: new Map() };
    return cache;
  }

  /* ---------- 2.4 Presupuesto vigente ---------- */
  function versionVigente(p) {
    const vs = Datos.get().presupuestos;
    let v = vs[0];
    for (const x of vs) if (ymAPeriodo(x.desde) <= p) v = x;
    return v || { desde: periodoAYm(p), lineas: [] };
  }

  /* ---------- 2.5 Resumen de un periodo ---------- */
  function resumen(p) {
    const I = indice();
    if (I.memo.has(p)) return I.memo.get(p);
    const nL = I.lineas.length, nC = I.cats.length;
    const ver = versionVigente(p);

    const pres = new Float64Array(nL), enVersion = new Uint8Array(nL);
    for (const l of ver.lineas) {
      const k = I.dicLin.get(l.cat + SEP + l.concepto);
      pres[k] += +l.valor || 0; enVersion[k] = 1;
    }
    const mG = igual(I.g.per, p);
    const gast = bincount(I.g.lin, I.g.val, nL, mG);           // gastado por concepto
    const presC = bincount(I.linCat, pres, nC);                 // presupuesto por categoría
    const gastC = bincount(I.linCat, gast, nC);                 // gastado por categoría
    const mI = igual(I.ing.per, p);
    const mM = igual(I.mov.per, p);
    const aportes = suma(I.mov.val, y(mM, igual(I.mov.tipo, TIPO.mas)));
    const retiros = suma(I.mov.val, y(mM, igual(I.mov.tipo, TIPO.menos)));

    const r = {
      p, ver, pres, gast, rest: restar(pres, gast), presC, gastC, restC: restar(presC, gastC), enVersion,
      filasGastos: posiciones(mG), filasIngresos: posiciones(mI), filasMov: posiciones(mM),
      tot: {
        presupuesto: suma(pres), gastado: suma(gast), ingresos: suma(I.ing.val, mI), aportes, retiros,
      },
    };
    r.tot.restante = r.tot.presupuesto - r.tot.gastado;
    r.tot.balance = r.tot.ingresos - r.tot.gastado;
    I.memo.set(p, r);
    return r;
  }

  /* Disponible de una línea en el periodo de una fecha (para el formulario de gasto) */
  function disponible(fechaIso, cat, concepto) {
    const I = indice(), r = resumen(periodoDe(fechaIso));
    const k = I.dicLin.get(cat + SEP + concepto);
    const c = I.cats.indexOf(cat);
    return {
      linea: k === undefined ? null : { pres: r.pres[k], gast: r.gast[k], rest: r.rest[k] },
      cat: c < 0 ? null : { pres: r.presC[c], gast: r.gastC[c], rest: r.restC[c] },
      periodo: r.p,
    };
  }

  /* ---------- 2.6 Saldos de ahorros y deudas (una sola pasada ordenada) ---------- */
  function saldos(hastaIso = '9999-12-31') {
    const I = indice(), nC = Datos.get().cuentas.length, tope = aFnum(hastaIso);
    const saldo = new Float64Array(nC), ultima = new Int32Array(nC);
    const { fnum, cta, tipo, val, n } = I.mov;
    for (let i = 0; i < n && fnum[i] <= tope; i++) {
      const c = cta[i];
      saldo[c] = tipo[i] === 0 ? val[i] : tipo[i] === 1 ? saldo[c] + val[i] : saldo[c] - val[i];
      ultima[c] = fnum[i];
    }
    return { saldo, ultima };
  }
  function totalesCuentas(hastaIso) {
    const { saldo } = saldos(hastaIso), cs = Datos.get().cuentas;
    let ahorro = 0, deuda = 0;
    for (let i = 0; i < cs.length; i++) cs[i].clase === 'deuda' ? (deuda += saldo[i]) : (ahorro += saldo[i]);
    return { ahorro, deuda, neto: ahorro - deuda };
  }

  /* ---------- 2.7 Filtro de movimientos (tabla de Movimientos) ---------- */
  function filtrarGastos({ desde, hasta, cat, texto }) {
    const I = indice(), g = I.g;
    let m = entre(g.fnum, desde ? aFnum(desde) : 0, hasta ? aFnum(hasta) : 99999999);
    if (cat) { const c = I.cats.indexOf(cat); m = y(m, igual(g.cat, c)); }
    if (texto) {
      const t = texto.toLowerCase();
      for (let i = 0; i < g.n; i++) if (m[i]) {
        const x = I.G[i];
        if (!`${x.detalle} ${x.concepto} ${x.cat} ${x.comentario}`.toLowerCase().includes(t)) m[i] = 0;
      }
    }
    return { filas: posiciones(m), total: suma(g.val, m) };
  }
  function filtrarIngresos({ desde, hasta, texto }) {
    const I = indice(), c = I.ing;
    const m = entre(c.fnum, desde ? aFnum(desde) : 0, hasta ? aFnum(hasta) : 99999999);
    if (texto) {
      const t = texto.toLowerCase();
      for (let i = 0; i < c.n; i++) if (m[i] && !`${I.I[i].concepto} ${I.I[i].cat} ${I.I[i].comentario}`.toLowerCase().includes(t)) m[i] = 0;
    }
    return { filas: posiciones(m), total: suma(c.val, m) };
  }

  /* ---------- 2.8 Matriz periodo × categoría (resumen mensual / reportes) ----------
     Un solo bincount con clave compuesta (periodo - p0) * nCats + categoría. */
  function matriz(p0, p1) {
    const I = indice(), nC = I.cats.length, nP = p1 - p0 + 1;
    const m = entre(I.g.per, p0, p1);
    const clave = new Int32Array(I.g.n);
    for (let i = 0; i < I.g.n; i++) clave[i] = (I.g.per[i] - p0) * nC + I.g.cat[i];
    const gast = bincount(clave, I.g.val, nP * nC, m);
    const pres = new Float64Array(nP * nC);
    const porVersion = new Map();                       // presupuesto por categoría, calculado una vez por versión
    for (let k = 0; k < nP; k++) {
      const v = versionVigente(p0 + k);
      if (!porVersion.has(v)) {
        const lin = new Float64Array(I.lineas.length);
        for (const l of v.lineas) lin[I.dicLin.get(l.cat + SEP + l.concepto)] += +l.valor || 0;
        porVersion.set(v, bincount(I.linCat, lin, nC));
      }
      pres.set(porVersion.get(v), k * nC);
    }
    const ing = bincount(Int32Array.from(I.ing.per, (p) => p - p0), I.ing.val, nP, entre(I.ing.per, p0, p1));
    return { p0, p1, nP, nC, cats: I.cats, gast, pres, ing };
  }

  return {
    SEP, MESES, aFnum, hoyIso, periodoDe, periodoActual, rangoPeriodo, nombrePeriodo, detallePeriodo,
    fechaCorta, ymAPeriodo, periodoAYm, diaInicio,
    indice, versionVigente, resumen, disponible, saldos, totalesCuentas, filtrarGastos, filtrarIngresos, matriz,
    // primitivas expuestas para el bloque de Reportes
    bincount, entre, igual, y, suma, restar, posiciones,
  };
})();
