/* ============================================================
   BLOQUE 9 · REPORTES
   Todo sale de Motor.matriz (periodo × categoría, un solo bincount)
   y se re-agrupa por mes / trimestre / semestre / año con otro bincount.
   Gráficos en SVG propio (sin librerías), con tooltip al pasar el mouse
   o al enfocar con teclado, y una tabla con todos los valores.
   Colores por entidad (fijos en toda la página):
     Gastos = azul · Ingresos = aqua · Ahorros = violeta · Deudas = naranja (línea punteada)
   ============================================================ */
const Reportes = (() => {
  const { esc, dinero, miles } = UI;
  const C = { gastos: '#2a78d6', ingresos: '#1baf7a', ahorro: '#4a3aa7', deuda: '#eb6834', ref: '#52514e' };
  const GRAN = { mes: 'Mes', trim: 'Trimestre', sem: 'Semestre', anio: 'Año' };
  const MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /* ---------- 9.1 Estado y rango ---------- */
  function rangoDatos() {
    const I = Motor.indice(), pAct = Motor.periodoActual();
    let min = pAct;
    for (const col of [I.g.per, I.ing.per]) for (let i = 0; i < col.length; i++) if (col[i] < min) min = col[i];
    return { min, max: pAct };
  }
  function estado() {
    const st = Vistas.st;
    if (!st.rep) { const { min, max } = rangoDatos(); st.rep = { gran: 'mes', p0: Math.max(min, max - 5), p1: max }; }
    return st.rep;
  }
  const PRESETS = {
    'este-mes': (m) => [m.max, m.max, 'mes'],
    '3m': (m) => [m.max - 2, m.max, 'mes'],
    '6m': (m) => [m.max - 5, m.max, 'mes'],
    '12m': (m) => [m.max - 11, m.max, 'mes'],
    'este-anio': (m) => [Math.floor(m.max / 12) * 12, m.max, 'mes'],
    'todo': (m) => [m.min, m.max, null],
  };
  function preset(k) {
    const r = estado(), m = rangoDatos(), [p0, p1, gran] = PRESETS[k](m);
    r.p0 = Math.max(Math.min(p0, p1), m.min - 120); r.p1 = p1; if (gran) r.gran = gran; r.preset = k;
  }

  /* ---------- 9.2 Cálculo (vectorizado) ---------- */
  function claveCubeta(p, gran) {
    const y = Math.floor(p / 12), m = p % 12;
    return gran === 'mes' ? p : gran === 'trim' ? y * 4 + Math.floor(m / 3) : gran === 'sem' ? y * 2 + Math.floor(m / 6) : y;
  }
  function nombreCubeta(c, gran) {
    if (gran === 'mes') return `${MES_C[c % 12]} ${Math.floor(c / 12)}`;
    if (gran === 'trim') return `T${(c % 4) + 1} ${Math.floor(c / 4)}`;
    if (gran === 'sem') return `S${(c % 2) + 1} ${Math.floor(c / 2)}`;
    return String(c);
  }

  function calcular({ p0, p1, gran }) {
    const M = Motor.matriz(p0, p1), { nP, nC } = M;
    // periodo → cubeta
    const cub = new Int32Array(nP), nombres = [], ultimo = [];
    let prev = null;
    for (let k = 0; k < nP; k++) {
      const c = claveCubeta(p0 + k, gran);
      if (c !== prev) { nombres.push(nombreCubeta(c, gran)); prev = c; }
      cub[k] = nombres.length - 1; ultimo[cub[k]] = p0 + k;
    }
    const nB = nombres.length;
    // claves expandidas para la matriz (k*nC + c)
    const kB = new Int32Array(nP * nC), kBC = new Int32Array(nP * nC), kC = new Int32Array(nP * nC);
    for (let k = 0; k < nP; k++) for (let c = 0; c < nC; c++) {
      const j = k * nC + c; kB[j] = cub[k]; kBC[j] = cub[k] * nC + c; kC[j] = c;
    }
    const b = Motor.bincount;
    const R = {
      nB, nC, nombres, cats: M.cats, meses: b(cub, new Float64Array(nP).fill(1), nB),
      gastB: b(kB, M.gast, nB), presB: b(kB, M.pres, nB), ingB: b(cub, M.ing, nB),
      gastBC: b(kBC, M.gast, nB * nC), presBC: b(kBC, M.pres, nB * nC),
      gastC: b(kC, M.gast, nC), presC: b(kC, M.pres, nC),
    };
    R.tot = { gast: Motor.suma(R.gastB), pres: Motor.suma(R.presB), ing: Motor.suma(R.ingB), meses: nP };
    // saldos al cierre de cada cubeta (una pasada ordenada por cubeta)
    const cs = Datos.get().cuentas;
    R.ahorroB = new Float64Array(nB); R.deudaB = new Float64Array(nB);
    for (let i = 0; i < nB; i++) {
      const { saldo } = Motor.saldos(Motor.rangoPeriodo(ultimo[i]).fin);
      for (let c = 0; c < cs.length; c++) (cs[c].clase === 'deuda' ? R.deudaB : R.ahorroB)[i] += saldo[c];
    }
    // gastos más grandes del rango
    const I = Motor.indice(), pos = Motor.posiciones(Motor.entre(I.g.per, p0, p1));
    R.top = Array.from(pos).sort((a, c) => I.g.val[c] - I.g.val[a]).slice(0, 10).map((i) => I.G[i]);
    return R;
  }

  /* ---------- 9.3 Utilidades de gráfico ---------- */
  function corto(v) {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',').replace(',0', '')} M`;
    if (a >= 1e3) return `${s}$${Math.round(a / 1e3)} mil`;
    return `${s}$${Math.round(a)}`;
  }
  function escalaY(max, n = 4) {
    if (max <= 0) return { tope: 1, ticks: [0] };
    const bruto = max / n, pot = 10 ** Math.floor(Math.log10(bruto));
    const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((x) => x >= bruto);
    const tope = Math.ceil(max / paso) * paso;
    return { tope, ticks: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
  }
  /* Barra con esquinas superiores redondeadas (4px), anclada a la línea base */
  function barra(x, y, w, h, color) {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `<path d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z" fill="${color}"/>`;
  }
  const tip = UI.tip;                             // tooltips compartidos (se pintan con textContent)
  const ancho = () => Math.max(300, Math.min(1100, (document.getElementById('vista')?.clientWidth || 900) - 80));
  const leyenda = (items) => `<div class="leyenda">${items.map((i) =>
    `<span><i class="${i.linea ? 'l' : 'r'}${i.dash ? ' d' : ''}" style="--c:${i.color}"></i>${esc(i.t)}</span>`).join('')}</div>`;

  /* ---------- 9.4 Gráfico: ingresos, gastos y presupuesto por periodo ---------- */
  function graficoPeriodos(R) {
    const W = ancho(), H = 280, m = { l: 62, r: 10, t: 22, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, nB = R.nB;
    let max = 0;
    for (let i = 0; i < nB; i++) max = Math.max(max, R.gastB[i], R.ingB[i], R.presB[i]);
    const { tope, ticks } = escalaY(max), y = (v) => m.t + ih - (v / tope) * ih;
    const banda = iw / nB, grupo = Math.min(banda * 0.72, 70), bw = (grupo - 2) / 2;
    const cadaN = Math.ceil(nB / Math.max(1, Math.floor(iw / 64)));
    let s = ticks.map((t) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="eje" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${corto(t)}</text>`).join('');
    for (let i = 0; i < nB; i++) {
      const x0 = m.l + i * banda + (banda - grupo) / 2, xg = x0 + bw + 2;
      const g = R.gastB[i], p = R.presB[i], ing = R.ingB[i];
      s += barra(x0, y(ing), bw, y(0) - y(ing), C.ingresos) + barra(xg, y(g), bw, y(0) - y(g), C.gastos);
      if (p > 0) s += `<line class="ref" x1="${xg - 4}" x2="${xg + bw + 4}" y1="${y(p)}" y2="${y(p)}"/>`;
      if (p > 0 && g > p) s += `<text class="exceso" x="${xg + bw / 2}" y="${Math.min(y(g), y(p)) - 6}" text-anchor="middle">▲ ${Math.round((g / p) * 100)}%</text>`;
      if (i % cadaN === 0) s += `<text class="eje" x="${m.l + i * banda + banda / 2}" y="${H - 8}" text-anchor="middle">${esc(R.nombres[i])}</text>`;
      const t = tip(R.nombres[i], [
        { c: C.ingresos, n: 'Ingresos', v: dinero(ing) }, { c: C.gastos, n: 'Gastos', v: dinero(g) },
        { c: C.ref, n: 'Presupuesto', v: dinero(p) + (p ? ` · ${Math.round((g / p) * 100)}% usado` : '') },
        { n: 'Ingresos − gastos', v: dinero(ing - g) }]);
      s += `<rect class="hit" x="${m.l + i * banda}" y="${m.t}" width="${banda}" height="${ih}" data-tip="${t}" tabindex="0"/>`;
    }
    s += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
    return `<div class="tarjeta"><h2>Ingresos, gastos y presupuesto por ${GRAN[estado().gran].toLowerCase()}</h2>
      ${leyenda([{ t: 'Ingresos', color: C.ingresos }, { t: 'Gastos', color: C.gastos }, { t: 'Presupuesto', color: C.ref, linea: 1 }])}
      <div class="grafico"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ingresos, gastos y presupuesto por periodo">${s}</svg></div></div>`;
  }

  /* ---------- 9.5 Gráfico: gasto por categoría (barras horizontales) ---------- */
  function graficoCategorias(R) {
    const orden = Array.from({ length: R.nC }, (_, c) => c).filter((c) => R.gastC[c] || R.presC[c])
      .sort((a, b) => R.gastC[b] - R.gastC[a]);
    let max = 0;
    for (const c of orden) max = Math.max(max, R.gastC[c], R.presC[c]);
    const filas = orden.map((c) => {
      const g = R.gastC[c], p = R.presC[c], e = UI.estado(p, g);
      const t = tip(R.cats[c], [{ c: C.gastos, n: 'Gastado', v: dinero(g) }, { c: C.ref, n: 'Presupuesto', v: dinero(p) },
        { n: p - g >= 0 ? 'Sobrante' : 'Excedido', v: dinero(Math.abs(p - g)) }, { n: 'Promedio mensual', v: dinero(g / R.tot.meses) }]);
      return `<div class="hfila" data-tip="${t}" tabindex="0">
        <span class="hnom">${esc(R.cats[c])}</span>
        <span class="hpista"><i style="width:${max ? (g / max) * 100 : 0}%"></i>${p > 0 ? `<b style="left:${(p / max) * 100}%"></b>` : ''}</span>
        <span class="hval">${dinero(g)}<small>${p > 0 ? `${Math.round((g / p) * 100)}% de ${corto(p)}` : ''}
          ${e.cls !== 'ok' ? ` <span class="estado ${e.cls}">${e.txt}</span>` : ''}</small></span></div>`;
    }).join('');
    return `<div class="tarjeta"><h2>Gasto por categoría en el rango</h2>
      ${leyenda([{ t: 'Gastado', color: C.gastos }, { t: 'Presupuesto del rango', color: C.ref, linea: 1 }])}
      <div class="hbarras">${filas || '<p class="vacio">Sin gastos en el rango.</p>'}</div></div>`;
  }

  /* ---------- 9.6 Gráfico: evolución de ahorros y deudas (líneas) ---------- */
  function graficoAhorros(R) {
    const hayDeuda = R.deudaB.some((v) => v > 0);
    const W = ancho(), H = 240, m = { l: 62, r: 16, t: 16, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, nB = R.nB, banda = iw / nB;
    let max = 0;
    for (let i = 0; i < nB; i++) max = Math.max(max, R.ahorroB[i], R.deudaB[i]);
    const { tope, ticks } = escalaY(max), y = (v) => m.t + ih - (v / tope) * ih, x = (i) => m.l + i * banda + banda / 2;
    const cadaN = Math.ceil(nB / Math.max(1, Math.floor(iw / 64)));
    const linea = (vals, color, dash) => `<path d="${Array.from(vals, (v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')}"
      fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" ${dash ? 'stroke-dasharray="6 4"' : ''}/>`
      + Array.from(vals, (v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>`).join('');
    let s = ticks.map((t) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="eje" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${corto(t)}</text>`).join('');
    s += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
    for (let i = 0; i < nB; i++) {
      const filas = [{ c: C.ahorro, n: 'Ahorros', v: dinero(R.ahorroB[i]) }];
      if (hayDeuda) filas.push({ c: C.deuda, n: 'Deudas', v: dinero(R.deudaB[i]), dash: 1 }, { n: 'Neto', v: dinero(R.ahorroB[i] - R.deudaB[i]) });
      if (i > 0) filas.push({ n: 'Cambio en ahorros', v: dinero(R.ahorroB[i] - R.ahorroB[i - 1]) });
      s += `<g class="banda" data-tip="${tip('Al cierre de ' + R.nombres[i], filas)}" tabindex="0">
        <rect class="hit" x="${m.l + i * banda}" y="${m.t}" width="${banda}" height="${ih}"/>
        <line class="guia" x1="${x(i)}" x2="${x(i)}" y1="${m.t}" y2="${m.t + ih}"/></g>`;
      if (i % cadaN === 0) s += `<text class="eje" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(R.nombres[i])}</text>`;
    }
    s += linea(R.ahorroB, C.ahorro) + (hayDeuda ? linea(R.deudaB, C.deuda, true) : '');
    // etiqueta directa solo en el último punto
    s += `<text class="dato" x="${x(nB - 1)}" y="${y(R.ahorroB[nB - 1]) - 10}" text-anchor="${nB > 1 ? 'end' : 'middle'}">${corto(R.ahorroB[nB - 1])}</text>`;
    return `<div class="tarjeta"><h2>Evolución de ahorros${hayDeuda ? ' y deudas' : ''}</h2>
      ${hayDeuda ? leyenda([{ t: 'Ahorros', color: C.ahorro, linea: 1 }, { t: 'Deudas', color: C.deuda, linea: 1, dash: 1 }]) : '<p class="sub" style="margin:-.4rem 0 .5rem">Saldo total de las cuentas de ahorro al cierre de cada periodo</p>'}
      <div class="grafico"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolución de ahorros">${s}</svg></div></div>`;
  }

  /* ---------- 9.7 Tabla categoría × periodo ---------- */
  function tabla(R) {
    const cols = R.nombres.map((n) => `<th class="num">${esc(n)}</th>`).join('');
    const filas = R.cats.map((cat, c) => {
      if (!R.gastC[c] && !R.presC[c]) return '';
      const celdas = R.nombres.map((_, b) => {
        const g = R.gastBC[b * R.nC + c], p = R.presBC[b * R.nC + c];
        return `<td class="num${p > 0 && g > p ? ' neg' : ''}">${g > p && p > 0 ? '▲ ' : ''}${miles(g) || '–'}</td>`;
      }).join('');
      const g = R.gastC[c], p = R.presC[c];
      return `<tr><td>${esc(cat)}</td>${celdas}<td class="num"><b>${miles(g) || 0}</b></td><td class="num">${miles(p) || 0}</td>
        <td class="num ${p > 0 && g > p ? 'neg' : ''}">${p ? Math.round((g / p) * 100) + '%' : '–'}</td><td class="num">${miles(Math.round(g / R.tot.meses)) || 0}</td></tr>`;
    }).join('');
    const pie = R.nombres.map((_, b) => `<td class="num">${miles(R.gastB[b]) || 0}</td>`).join('');
    const ing = R.nombres.map((_, b) => `<td class="num">${miles(R.ingB[b]) || 0}</td>`).join('');
    return `<div class="tarjeta"><h2>Detalle por categoría</h2>
      <p class="sub">Gastado por periodo. ▲ en rojo = se pasó del presupuesto de ese periodo.</p>
      <div class="tabla-wrap"><table class="tabla tabla-rep"><thead><tr><th>Categoría</th>${cols}<th class="num">Total</th>
        <th class="num">Presup.</th><th class="num">% usado</th><th class="num">Prom. mes</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td>Total gastos</td>${pie}<td class="num">${miles(R.tot.gast)}</td><td class="num">${miles(R.tot.pres)}</td>
        <td class="num">${R.tot.pres ? Math.round((R.tot.gast / R.tot.pres) * 100) + '%' : '–'}</td><td class="num">${miles(Math.round(R.tot.gast / R.tot.meses))}</td></tr>
        <tr class="sec"><td>Ingresos</td>${ing}<td class="num">${miles(R.tot.ing) || 0}</td><td colspan="3"></td></tr></tfoot>
      </table></div></div>`;
  }

  function topGastos(R) {
    const filas = R.top.map((g) => `<tr class="clic" data-accion="editar-gasto" data-id="${g.id}"><td>${UI.fecha(g.fecha)}</td>
      <td>${esc(g.detalle || g.concepto)}</td><td>${esc(g.cat)}</td><td class="num">${dinero(g.valor)}</td></tr>`).join('');
    return `<div class="tarjeta"><h2>Los 10 gastos más grandes</h2><div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Detalle</th><th>Categoría</th><th class="num">Valor</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="4" class="vacio">Sin gastos en el rango.</td></tr>'}</tbody></table></div></div>`;
  }

  /* ---------- 9.8 Vista ---------- */
  function vista() {
    const r = estado(), R = calcular(r), t = R.tot;
    const e = UI.estado(t.pres, t.gast), bal = t.ing - t.gast;
    const opcMes = (sel) => {
      const { min, max } = rangoDatos(); let o = '';
      for (let p = max; p >= Math.min(min, sel); p--) o += `<option value="${p}" ${p === sel ? 'selected' : ''}>${Motor.nombrePeriodo(p)}</option>`;
      return o;
    };
    const presets = [['este-mes', 'Este mes'], ['3m', 'Últimos 3 meses'], ['6m', 'Últimos 6 meses'], ['12m', 'Últimos 12 meses'], ['este-anio', 'Este año'], ['todo', 'Todo']]
      .map(([k, n]) => `<button class="btn mini${r.preset === k ? ' activo' : ''}" data-accion="rep-preset" data-p="${k}">${n}</button>`).join('');
    return `
      <div class="entre"><div><h1>Reportes</h1>
        <p class="sub" style="margin:0">${Motor.nombrePeriodo(r.p0)} – ${Motor.nombrePeriodo(r.p1)} · ${t.meses} ${t.meses === 1 ? 'mes' : 'meses'} financieros (del 25 al 24)</p></div></div>
      <div class="tarjeta filtro-rep">
        <div class="acciones">${presets}</div>
        <div class="filtros" id="rep-opc" style="margin:.75rem 0 0">
          <label class="campo">Desde<select name="p0">${opcMes(r.p0)}</select></label>
          <label class="campo">Hasta<select name="p1">${opcMes(r.p1)}</select></label>
          <label class="campo">Agrupar por<select name="gran">${Object.entries(GRAN).map(([k, n]) => `<option value="${k}" ${k === r.gran ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div></div>
      <div class="kpis">
        <div class="kpi rojo"><div class="et">Gastado</div><div class="val">${dinero(t.gast)}</div>
          <div class="det">Promedio ${dinero(t.gast / t.meses)} al mes</div></div>
        <div class="kpi amarillo"><div class="et">Presupuesto</div><div class="val">${dinero(t.pres)}</div>
          <div class="det">${t.pres ? Math.round((t.gast / t.pres) * 100) : 0}% usado · <span class="estado ${e.cls}">${e.txt}</span></div></div>
        <div class="kpi verde"><div class="et">Ingresos</div><div class="val">${dinero(t.ing)}</div>
          <div class="det">Promedio ${dinero(t.ing / t.meses)} al mes</div></div>
        <div class="kpi azul"><div class="et">Ingresos − gastos</div><div class="val ${bal < 0 ? 'neg' : ''}">${dinero(bal)}</div>
          <div class="det">${t.ing ? `Tasa de ahorro ${Math.round((bal / t.ing) * 100)}%` : 'Sin ingresos registrados'}</div></div>
      </div>
      ${graficoPeriodos(R)}
      ${graficoCategorias(R)}
      ${graficoAhorros(R)}
      ${tabla(R)}
      ${topGastos(R)}`;
  }

  /* ---------- 9.9 Tooltip (DOM + textContent: los nombres son datos del usuario) ---------- */
  function mostrarTip(el, ev) {
    const d = UI.obtenerTip(+el.dataset.tip), caja = document.getElementById('tip');
    if (!d || !caja) return;
    caja.replaceChildren();
    const h = document.createElement('div'); h.className = 'tt'; h.textContent = d.titulo; caja.appendChild(h);
    for (const f of d.filas) {
      const fila = document.createElement('div'); fila.className = 'tf';
      const k = document.createElement('i'); if (f.c) { k.style.background = f.c; if (f.dash) k.className = 'd'; } else k.className = 'vacia';
      const v = document.createElement('b'); v.textContent = f.v;
      const n = document.createElement('span'); n.textContent = f.n;
      fila.append(k, v, n); caja.appendChild(fila);
    }
    caja.hidden = false;
    const r = el.getBoundingClientRect(), w = caja.offsetWidth, hgt = caja.offsetHeight;
    let x = ev && ev.clientX ? ev.clientX + 14 : r.left + r.width / 2, yy = ev && ev.clientY ? ev.clientY + 14 : r.top;
    if (x + w > innerWidth - 8) x = (ev?.clientX || r.right) - w - 14;
    if (yy + hgt > innerHeight - 8) yy = (ev?.clientY || r.top) - hgt - 14;
    caja.style.left = Math.max(8, x) + 'px'; caja.style.top = Math.max(8, yy) + 'px';
  }
  function ocultarTip() { const c = document.getElementById('tip'); if (c) c.hidden = true; }

  function iniciar() {
    const v = document.getElementById('vista');
    v.addEventListener('pointermove', (e) => { const el = e.target.closest('[data-tip]'); el ? mostrarTip(el, e) : ocultarTip(); });
    v.addEventListener('pointerleave', ocultarTip);
    v.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (el) mostrarTip(el); });
    v.addEventListener('focusout', ocultarTip);
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (location.hash === '#reportes') App.render(); }, 200); });
  }

  return { vista, preset, estado, iniciar };
})();
