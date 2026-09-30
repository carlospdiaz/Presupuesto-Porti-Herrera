/* ============================================================
   BLOQUE 3 · UTILIDADES DE INTERFAZ
   ============================================================ */
const UI = (() => {
  const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const MIL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dinero = (v) => COP.format(Math.round(v || 0));
  const miles = (v) => (v ? MIL.format(v) : '');
  const leerValor = (s) => +String(s ?? '').replace(/[^\d]/g, '') || 0;
  const fecha = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

  /* Estado de una línea de presupuesto: color + icono + texto (nunca solo color) */
  function estado(pres, gast) {
    if (pres <= 0) return gast > 0 ? { cls: 'serio', txt: '▲ Sin presupuesto' } : { cls: 'ok', txt: '' };
    const r = gast / pres;
    if (r > 1) return { cls: 'critico', txt: '✕ Excedido' };
    if (r >= 0.8) return { cls: 'alerta', txt: '▲ Cerca del límite' };
    return { cls: 'ok', txt: '✓ Bien' };
  }
  function medidor(pres, gast, grande = false) {
    const e = estado(pres, gast);
    const pct = pres > 0 ? Math.min(100, (gast / pres) * 100) : gast > 0 ? 100 : 0;
    const real = pres > 0 ? Math.round((gast / pres) * 100) : 0;
    return `<div class="medidor${grande ? ' grande' : ''}" role="meter" aria-valuemin="0" aria-valuemax="100"
      aria-valuenow="${real}" title="${real}% usado"><i class="${e.cls}" style="width:${pct}%"></i></div>`;
  }
  function restanteTxt(rest) {
    return rest >= 0 ? `Quedan <b>${dinero(rest)}</b>` : `<b class="neg">Excedido ${dinero(-rest)}</b>`;
  }

  /* Anillo de % usado (gastado / presupuesto). Color de estado + % en el centro + texto al lado. */
  function anillo(pres, gast, tam = 84, grosor = 9, sub = '') {
    const e = estado(pres, gast), c = tam / 2, r = (tam - grosor) / 2, circ = 2 * Math.PI * r;
    const frac = pres > 0 ? Math.min(1, gast / pres) : gast > 0 ? 1 : 0;
    const pct = pres > 0 ? `${Math.round((gast / pres) * 100)}%` : gast > 0 ? '—' : '0%';
    return `<svg class="anillo" viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" role="img" aria-label="${pct} del presupuesto usado">
      <circle class="pista" cx="${c}" cy="${c}" r="${r}" stroke-width="${grosor}"/>
      ${frac > 0 ? `<circle class="arco ${e.cls}" cx="${c}" cy="${c}" r="${r}" stroke-width="${grosor}"
        stroke-dasharray="${(frac * circ).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>` : ''}
      <text class="pct" x="${c}" y="${sub ? c - tam * 0.05 : c}" style="font-size:${Math.round(tam * 0.22)}px">${pct}</text>
      ${sub ? `<text class="pct-sub" x="${c}" y="${c + tam * 0.13}" style="font-size:${Math.round(tam * 0.085)}px">${sub}</text>` : ''}
    </svg>`;
  }

  /* Tooltips: los datos se guardan aquí y se pintan con textContent (son datos del usuario) */
  const tips = [];
  const tip = (titulo, filas) => tips.push({ titulo, filas }) - 1;
  const reiniciarTips = () => { tips.length = 0; };
  const obtenerTip = (i) => tips[i];

  let temporizador;
  function aviso(txt) {
    const el = document.getElementById('aviso');
    el.textContent = txt; el.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => (el.hidden = true), 2600);
  }

  /* Ordena posiciones (Int32Array) por la columna fnum del índice */
  const ordenarPorFecha = (pos, fnum, desc = true) => Int32Array.from(pos).sort((a, b) => (desc ? fnum[b] - fnum[a] : fnum[a] - fnum[b]));

  return { esc, dinero, miles, leerValor, fecha, estado, medidor, restanteTxt, anillo, aviso, ordenarPorFecha,
           tip, reiniciarTips, obtenerTip };
})();

/* ============================================================
   BLOQUE 4 · VISTAS
   Cada vista devuelve un string HTML; se pinta con un solo innerHTML.
   ============================================================ */
const Vistas = (() => {
  const { esc, dinero, fecha, estado, medidor, restanteTxt, ordenarPorFecha } = UI;
  const st = { periodoHoja: null, tabMov: 'gastos', filtros: null, borrador: null, exp: null, rep: null, catAbierta: null };

  /* Agrupa las líneas visibles por categoría (vigentes o con gasto) */
  function lineasPorCategoria(r, I) {
    const grupos = I.cats.map(() => []);
    for (let k = 0; k < I.lineas.length; k++) if (r.enVersion[k] || r.gast[k] > 0) grupos[I.linCat[k]].push(k);
    return grupos;
  }

  /* ---------- 4.1 INICIO ---------- */
  function bienvenida() {
    return `<h1>¡Bienvenidos a Porti-Herrera!</h1>
      <div class="tarjeta"><p>Este dispositivo todavía no tiene datos. Elige una opción:</p>
        <ol>
          <li><b>Si tu pareja ya configuró la app:</b> ve a <a href="#ajustes">Ajustes</a> y conéctate al Google Drive compartido.</li>
          <li><b>Si eres el primero:</b> en <a href="#ajustes">Ajustes</a> → “Cargar respaldo” elige <code>datos-excel.json</code>
            (los datos del Excel) y luego conecta tu Google Drive.</li>
          <li><b>Empezar desde cero:</b> arma el presupuesto en <a href="#presupuesto">Presupuesto</a>.</li>
        </ol></div>`;
  }

  function inicio() {
    const db = Datos.get();
    if (!db.presupuestos.length && !db.gastos.length && !db.ingresos.length) return bienvenida();
    const p = Motor.periodoActual(), r = Motor.resumen(p), I = Motor.indice(), t = r.tot;
    const cuentas = Motor.totalesCuentas();
    const rango = Motor.rangoPeriodo(p);
    const diaN = Math.round((new Date(Motor.hoyIso()) - new Date(rango.ini)) / 864e5) + 1;
    const usado = t.presupuesto > 0 ? Math.round((t.gastado / t.presupuesto) * 100) : 0;
    const grupos = lineasPorCategoria(r, I);
    const visibles = I.cats.map((_, c) => c).filter((c) => grupos[c].length);

    // Sobrantes y excesos por categoría (vectorizado sobre restC)
    let sobrantes = 0, excesos = 0;
    for (const c of visibles) r.restC[c] >= 0 ? (sobrantes += r.restC[c]) : (excesos -= r.restC[c]);
    const potencial = Math.max(0, t.restante);

    /* Anillos por categoría (toca uno para ver sus conceptos) */
    const anillos = visibles.map((c) => {
      const cat = I.cats[c], ec = estado(r.presC[c], r.gastC[c]), abierta = st.catAbierta === cat;
      let html = `<button class="anillo-cat${abierta ? ' abierta' : ''}" data-accion="ver-cat" data-cat="${esc(cat)}" aria-expanded="${abierta}">
        ${UI.anillo(r.presC[c], r.gastC[c])}
        <span class="nombre">${esc(cat)}</span>
        <span class="cifra">${restanteTxt(r.restC[c])}</span>
        <span class="de">de ${dinero(r.presC[c])}${ec.cls !== 'ok' ? ` · <span class="estado ${ec.cls}">${ec.txt}</span>` : ''}</span></button>`;
      if (abierta) {
        const ks = grupos[c];
        html += `<div class="cat-detalle"><div class="entre"><h2>${esc(cat)}</h2>
            <button class="btn mini" data-accion="nuevo-gasto" data-cat="${esc(cat)}">+ Gasto en ${esc(cat)}</button></div>
          ${ks.map((k) => `<div class="fila"><span>${esc(I.lineas[k].concepto)}</span>${medidor(r.pres[k], r.gast[k])}
            <span class="cifras">${dinero(r.gast[k])} de ${dinero(r.pres[k])} · ${restanteTxt(r.rest[k])}</span></div>`).join('')}</div>`;
      }
      return html;
    }).join('');

    /* Barras: presupuesto = gastado + ahorro potencial (o + exceso) */
    let max = 0;
    for (const c of visibles) max = Math.max(max, r.presC[c], r.gastC[c]);
    const pc = (v) => (max ? (v / max) * 100 : 0);
    const barras = visibles.slice().sort((a, b) => r.presC[b] - r.presC[a]).map((c) => {
      const p = r.presC[c], g = r.gastC[c], dentro = Math.min(g, p), sobra = Math.max(0, p - g), exceso = Math.max(0, g - p);
      const segs = [['g', dentro], ['s', sobra], ['x', exceso]].filter(([, v]) => v > 0);
      let x = 0;
      const html = segs.map(([k, v], i) => {
        const s = `<i class="${k}${i === segs.length - 1 ? ' fin' : ''}" style="left:calc(${pc(x)}% + ${i ? 2 : 0}px);width:max(1px, calc(${pc(v)}% - ${i ? 2 : 0}px))"></i>`;
        x += v; return s;
      }).join('');
      const t2 = UI.tip(I.cats[c], [
        { c: '#52514e', n: 'Presupuesto', v: dinero(p) }, { c: '#2a78d6', n: 'Gastado', v: dinero(g) },
        exceso ? { c: '#d03b3b', n: 'Excedido', v: dinero(exceso) } : { c: '#4a3aa7', n: 'Ahorro potencial', v: dinero(sobra) }]);
      return `<div class="pfila" data-tip="${t2}" tabindex="0"><span class="hnom">${esc(I.cats[c])}</span>
        <span class="ppista">${html}${p > 0 ? `<b style="left:${pc(p)}%"></b>` : ''}</span>
        <span class="hval">${exceso ? `<span class="neg">▲ Excedido ${dinero(exceso)}</span>` : `${dinero(sobra)}<small>sin gastar</small>`}
          ${exceso ? `<small>gastado ${dinero(g)} de ${dinero(p)}</small>` : ''}</span></div>`;
    }).join('');

    const eMes = estado(t.presupuesto, t.gastado);

    const ultimos = ordenarPorFecha(r.filasGastos, I.g.fnum).slice(0, 8);
    const filasUlt = Array.from(ultimos, (i) => {
      const g = I.G[i];
      return `<tr class="clic" data-accion="editar-gasto" data-id="${g.id}"><td>${fecha(g.fecha)}</td>
        <td>${esc(g.detalle || g.concepto)}</td><td>${esc(g.cat)}</td><td class="num">${dinero(g.valor)}</td></tr>`;
    }).join('');

    return `
      <h1>${Motor.nombrePeriodo(p)}</h1>
      <p class="sub">${Motor.detallePeriodo(p)} · día ${diaN} de ${rango.dias}</p>

      <div class="tarjeta hero">
        <div class="hero-anillo">${UI.anillo(t.presupuesto, t.gastado, 168, 16, 'del presupuesto')}</div>
        <div class="hero-datos">
          <div class="hd"><span class="et">Presupuesto del mes</span><b>${dinero(t.presupuesto)}</b></div>
          <div class="hd"><span class="et">Gastado</span><b>${dinero(t.gastado)}</b>
            ${eMes.txt ? `<span class="estado ${eMes.cls}">${eMes.txt}</span>` : ''}</div>
          <div class="hd"><span class="et">Sin gastar · ahorro potencial</span><b class="${t.restante < 0 ? 'neg' : 'violeta'}">${dinero(t.restante)}</b>
            ${excesos ? `<span class="det">sobrantes ${dinero(sobrantes)} − excesos ${dinero(excesos)}</span>` : ''}</div>
          <p class="sub" style="margin:0">Llevas el ${usado}% del presupuesto con el ${Math.round((diaN / rango.dias) * 100)}% del mes transcurrido ·
            ${rango.dias - diaN === 1 ? 'queda 1 día' : `quedan ${rango.dias - diaN} días`}.</p>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi chico verde"><div class="et">Ingresos del mes</div><div class="val">${dinero(t.ingresos)}</div></div>
        <div class="kpi chico azul"><div class="et">Ingresos − gastos</div><div class="val ${t.balance < 0 ? 'neg' : ''}">${dinero(t.balance)}</div></div>
        <div class="kpi chico caqui"><div class="et">Ahorros totales</div><div class="val">${dinero(cuentas.ahorro)}</div>
          <div class="det">Aportes del mes: ${dinero(t.aportes)}</div></div>
        <div class="kpi chico morado"><div class="et">Deudas</div><div class="val">${dinero(cuentas.deuda)}</div></div>
      </div>

      <div class="tarjeta"><div class="entre"><h2>Presupuesto por categoría</h2>
        <span class="sub" style="margin:0">Toca una categoría para ver sus conceptos</span></div>
        <div class="anillos">${anillos || '<p class="vacio">No hay presupuesto definido.</p>'}</div></div>

      <div class="tarjeta"><h2>Presupuesto, gasto y ahorro potencial</h2>
        <p class="sub" style="margin:-.35rem 0 .6rem">Si no gastan lo que queda, este mes ahorrarían
          <b class="violeta">${dinero(potencial)}</b> adicionales.</p>
        <div class="leyenda"><span><i class="r" style="--c:#2a78d6"></i>Gastado</span><span><i class="r" style="--c:#4a3aa7"></i>Ahorro potencial</span>
          <span><i class="r" style="--c:#d03b3b"></i>▲ Exceso</span><span><i class="l" style="--c:#52514e"></i>Presupuesto</span></div>
        <div class="hbarras">${barras || '<p class="vacio">Sin presupuesto.</p>'}</div></div>

      <div class="tarjeta"><div class="entre"><h2>Últimos gastos del mes</h2><a href="#movimientos" class="btn mini">Ver todos</a></div>
        <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Detalle</th><th>Categoría</th><th class="num">Valor</th></tr></thead>
        <tbody>${filasUlt || '<tr><td colspan="4" class="vacio">Aún no hay gastos este mes.</td></tr>'}</tbody></table></div></div>`;
  }

  /* ---------- 4.2 HOJA DEL MES (estilo Contabilidad Sofi) ---------- */
  function bloque(color, titulo, cols, filas, pie, ancho = false) {
    return `<div class="bloque b-${color}${ancho ? ' ancho' : ''}"><table>
      <thead><tr class="titulo"><th colspan="${cols.length}">${titulo}</th></tr>
      <tr class="cols">${cols.map((c) => `<th${c.num ? ' class="num"' : ''}>${c.t}</th>`).join('')}</tr></thead>
      <tbody>${filas || `<tr><td colspan="${cols.length}" class="vacio">Sin registros</td></tr>`}</tbody>
      ${pie ? `<tfoot><tr>${pie}</tr></tfoot>` : ''}</table></div>`;
  }

  function hoja() {
    const p = st.periodoHoja ?? Motor.periodoActual();
    st.periodoHoja = p;
    const r = Motor.resumen(p), I = Motor.indice(), db = Datos.get(), t = r.tot;
    const rango = Motor.rangoPeriodo(p);

    const filasIng = Array.from(ordenarPorFecha(r.filasIngresos, I.ing.fnum, false), (i) => {
      const x = I.I[i];
      return `<tr data-accion="editar-ingreso" data-id="${x.id}"><td>${fecha(x.fecha)}</td><td>${esc(x.concepto)}</td><td class="num">${UI.miles(x.valor)}</td></tr>`;
    }).join('');
    const filasGas = Array.from(ordenarPorFecha(r.filasGastos, I.g.fnum, false), (i) => {
      const x = I.G[i];
      return `<tr data-accion="editar-gasto" data-id="${x.id}"><td>${fecha(x.fecha)}</td><td>${esc(x.detalle || x.concepto)}</td>
        <td>${esc(x.cat)}</td><td class="num">${UI.miles(x.valor)}</td></tr>`;
    }).join('');
    const filasPres = I.cats.map((cat, c) => (r.presC[c] || r.gastC[c]) ? `<tr class="vacio-clic"><td>${esc(cat)}</td>
      <td class="num">${UI.miles(r.presC[c])}</td><td class="num">${UI.miles(r.gastC[c])}</td>
      <td class="num ${r.restC[c] < 0 ? 'neg' : ''}">${UI.miles(r.restC[c]) || 0}</td></tr>` : '').join('');

    // Un bloque por cuenta que tuvo movimientos este mes (colores rotan como en el Excel)
    const colores = ['azul', 'caqui', 'morado'];
    const saldoCierre = Motor.saldos(rango.fin).saldo;
    const porCuenta = new Map();
    for (const i of r.filasMov) { const c = I.mov.cta[i]; if (!porCuenta.has(c)) porCuenta.set(c, []); porCuenta.get(c).push(i); }
    const etiquetaTipo = (cl, ti) => (ti === 'saldo' ? 'Saldo' : cl === 'deuda' ? (ti === 'mas' ? 'Cargo' : 'Pago') : ti === 'mas' ? 'Aporte' : 'Retiro');
    let n = 0;
    const bloquesCta = [...porCuenta].map(([c, filas]) => {
      const cta = db.cuentas[c];
      const f = filas.map((i) => {
        const m = I.M[i];
        const signo = m.tipo === 'menos' ? '−' : '';
        return `<tr data-accion="editar-mov" data-id="${m.id}"><td>${fecha(m.fecha)}</td><td>${etiquetaTipo(cta.clase, m.tipo)}</td><td class="num">${signo}${UI.miles(m.valor)}</td></tr>`;
      }).join('');
      return bloque(cta.clase === 'deuda' ? 'rojo' : colores[n++ % 3], `${cta.clase === 'deuda' ? 'Deuda' : 'Ahorro'} ${esc(cta.nombre)}`,
        [{ t: 'Fecha' }, { t: 'Movimiento' }, { t: 'Valor', num: 1 }], f,
        `<td colspan="2">Saldo al cierre</td><td class="num">${UI.miles(saldoCierre[c]) || 0}</td>`);
    }).join('');

    const filasAhorro = db.cuentas.map((c, i) => c.clase === 'ahorro' ? `<tr data-accion="mov-cuenta" data-cuenta="${c.id}" data-tipo="saldo">
      <td>${esc(c.nombre)}</td><td>${esc(c.lugar)}</td><td class="num">${UI.miles(saldoCierre[i]) || 0}</td></tr>` : '').join('');
    let totAhorro = 0;
    db.cuentas.forEach((c, i) => { if (c.clase === 'ahorro') totAhorro += saldoCierre[i]; });

    return `
      <div class="selector-mes">
        <button class="btn" data-accion="mes" data-d="-1" aria-label="Mes anterior">◀</button>
        <strong>${Motor.nombrePeriodo(p)}</strong>
        <button class="btn" data-accion="mes" data-d="1" aria-label="Mes siguiente">▶</button>
        <small>${Motor.detallePeriodo(p)}</small>
        ${p !== Motor.periodoActual() ? '<button class="btn mini" data-accion="mes" data-d="0">Mes actual</button>' : ''}
      </div>
      <div class="hoja">
        ${bloque('verde', 'INGRESOS', [{ t: 'Fecha' }, { t: 'Concepto' }, { t: 'Valor', num: 1 }], filasIng,
          `<td colspan="2">TOTAL INGRESOS</td><td class="num">${UI.miles(t.ingresos) || 0}</td>`)}
        ${bloque('rojo', 'GASTOS', [{ t: 'Fecha' }, { t: 'Concepto' }, { t: 'Categoría' }, { t: 'Valor', num: 1 }], filasGas,
          `<td colspan="3">TOTAL GASTOS</td><td class="num">${UI.miles(t.gastado) || 0}</td>`)}
        ${bloque('amarillo', 'PRESUPUESTO DEL MES', [{ t: 'Categoría' }, { t: 'Presup.', num: 1 }, { t: 'Gastado', num: 1 }, { t: 'Queda', num: 1 }], filasPres,
          `<td>TOTAL</td><td class="num">${UI.miles(t.presupuesto)}</td><td class="num">${UI.miles(t.gastado) || 0}</td>
           <td class="num ${t.restante < 0 ? 'neg' : ''}">${UI.miles(t.restante) || 0}</td>`)}
        ${bloquesCta}
        ${bloque('azul', 'DINERO AHORRADO', [{ t: 'Ahorro' }, { t: 'Lugar' }, { t: 'Saldo', num: 1 }], filasAhorro,
          `<td colspan="2">Total</td><td class="num">${UI.miles(totAhorro) || 0}</td>`)}
      </div>
      <div class="gran-total" style="margin-top:1.5rem"><div>TOTAL</div><div class="${t.balance < 0 ? 'neg' : ''}">${dinero(t.balance)}</div></div>
      <p class="sub" style="margin-top:.4rem">TOTAL = ingresos − gastos del mes. Toca cualquier fila para editarla.</p>`;
  }

  /* ---------- 4.3 MOVIMIENTOS ---------- */
  function movimientos() {
    if (!st.filtros) {
      const r = Motor.rangoPeriodo(Motor.periodoActual());
      st.filtros = { desde: r.ini, hasta: r.fin, cat: '', texto: '' };
    }
    const f = st.filtros, I = Motor.indice(), esGasto = st.tabMov === 'gastos';
    const res = esGasto ? Motor.filtrarGastos(f) : Motor.filtrarIngresos(f);
    const pos = ordenarPorFecha(res.filas, esGasto ? I.g.fnum : I.ing.fnum);
    const filas = Array.from(pos, (i) => {
      const x = esGasto ? I.G[i] : I.I[i];
      return esGasto
        ? `<tr class="clic" data-accion="editar-gasto" data-id="${x.id}"><td>${fecha(x.fecha)}</td><td>${esc(x.cat)}</td>
           <td>${esc(x.concepto)}</td><td>${esc(x.detalle)}</td><td class="num">${dinero(x.valor)}</td><td>${esc(x.comentario)}</td></tr>`
        : `<tr class="clic" data-accion="editar-ingreso" data-id="${x.id}"><td>${fecha(x.fecha)}</td><td>${esc(x.cat)}</td>
           <td>${esc(x.concepto)}</td><td class="num">${dinero(x.valor)}</td><td>${esc(x.comentario)}</td></tr>`;
    }).join('');
    const cab = esGasto
      ? '<th>Fecha</th><th>Categoría</th><th>Concepto</th><th>Detalle</th><th class="num">Valor</th><th>Comentario</th>'
      : '<th>Fecha</th><th>Categoría</th><th>Concepto</th><th class="num">Valor</th><th>Comentario</th>';
    const nCols = esGasto ? 6 : 5;
    return `
      <div class="entre"><div><h1>Movimientos</h1><p class="sub" style="margin:0">Registro por fechas de gastos e ingresos</p></div>
        <button class="btn" data-accion="csv-filtro">⬇ Exportar lo filtrado (CSV)</button></div>
      <div class="tabs"><button data-accion="tab-mov" data-tab="gastos" class="${esGasto ? 'activo' : ''}">Gastos</button>
        <button data-accion="tab-mov" data-tab="ingresos" class="${esGasto ? '' : 'activo'}">Ingresos</button></div>
      <div class="filtros" id="filtros">
        <label class="campo">Desde<input type="date" name="desde" value="${f.desde}"></label>
        <label class="campo">Hasta<input type="date" name="hasta" value="${f.hasta}"></label>
        ${esGasto ? `<label class="campo">Categoría<select name="cat"><option value="">Todas</option>
          ${I.cats.map((c) => `<option ${c === f.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
        <label class="campo">Buscar<input type="search" name="texto" value="${esc(f.texto)}" placeholder="D1, Luz, Sofi…"></label>
      </div>
      <div class="tarjeta"><div class="tabla-wrap"><table class="tabla">
        <thead><tr>${cab}</tr></thead>
        <tbody>${filas || `<tr><td colspan="${nCols}" class="vacio">No hay movimientos con esos filtros.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="${esGasto ? 4 : 3}">Total (${pos.length} registros)</td><td class="num">${dinero(res.total)}</td><td></td></tr></tfoot>
      </table></div></div>`;
  }

  /* ---------- 4.4 AHORROS Y DEUDAS ---------- */
  function ahorros() {
    const db = Datos.get(), I = Motor.indice(), { saldo, ultima } = Motor.saldos(), tot = Motor.totalesCuentas();
    const tarjeta = (c, i) => {
      const deuda = c.clase === 'deuda';
      const u = ultima[i] ? `${String(ultima[i] % 100).padStart(2, '0')}/${String(((ultima[i] / 100) | 0) % 100).padStart(2, '0')}/${(ultima[i] / 10000) | 0}` : '—';
      return `<div class="cuenta ${c.clase}">
        <div class="entre" style="margin:0"><b>${esc(c.nombre)}</b><button class="btn mini" data-accion="editar-cuenta" data-id="${c.id}" aria-label="Editar cuenta">✎</button></div>
        <span class="lugar">${esc(c.lugar)} · actualizado ${u}</span>
        <span class="saldo">${dinero(saldo[i])}</span>
        <div class="acciones">
          <button class="btn mini" data-accion="mov-cuenta" data-cuenta="${c.id}" data-tipo="mas">${deuda ? '+ Cargo' : '+ Aporte'}</button>
          <button class="btn mini" data-accion="mov-cuenta" data-cuenta="${c.id}" data-tipo="menos">${deuda ? '− Pago' : '− Retiro'}</button>
          <button class="btn mini" data-accion="mov-cuenta" data-cuenta="${c.id}" data-tipo="saldo">Fijar saldo</button>
        </div></div>`;
    };
    const lista = (clase) => db.cuentas.map((c, i) => (c.clase === clase ? tarjeta(c, i) : '')).join('');
    const nombres = { saldo: 'Saldo fijado', mas: 'Aporte / cargo', menos: 'Retiro / pago' };
    const hist = Array.from(I.M.keys()).reverse().slice(0, 40).map((i) => {
      const m = I.M[i], c = db.cuentas[I.mov.cta[i]];
      return `<tr class="clic" data-accion="editar-mov" data-id="${m.id}"><td>${fecha(m.fecha)}</td><td>${esc(c.nombre)}</td>
        <td>${nombres[m.tipo]}</td><td class="num">${dinero(m.valor)}</td><td>${esc(m.comentario)}</td></tr>`;
    }).join('');

    return `
      <div class="entre"><div><h1>Ahorros y deudas</h1><p class="sub" style="margin:0">Fija el saldo de cada cuenta o suma aportes y retiros</p></div>
        <button class="btn prim" data-accion="nueva-cuenta">+ Nueva cuenta</button></div>
      <div class="kpis" style="margin-top:1rem">
        <div class="kpi azul"><div class="et">Total ahorrado</div><div class="val">${dinero(tot.ahorro)}</div></div>
        <div class="kpi rojo"><div class="et">Total deudas</div><div class="val">${dinero(tot.deuda)}</div></div>
        <div class="kpi verde"><div class="et">Patrimonio neto</div><div class="val ${tot.neto < 0 ? 'neg' : ''}">${dinero(tot.neto)}</div></div>
      </div>
      <h2>Ahorros</h2><div class="cuentas">${lista('ahorro') || '<p class="vacio">Sin cuentas de ahorro.</p>'}</div>
      <h2>Deudas</h2><div class="cuentas">${lista('deuda') || '<p class="sub">No hay deudas registradas. Usa “+ Nueva cuenta” y elige tipo Deuda.</p>'}</div>
      <div class="tarjeta"><h2>Historial</h2><div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Cuenta</th><th>Movimiento</th><th class="num">Valor</th><th>Comentario</th></tr></thead>
        <tbody>${hist || '<tr><td colspan="5" class="vacio">Sin movimientos.</td></tr>'}</tbody></table></div></div>`;
  }

  /* ---------- 4.5 PRESUPUESTO (editor) ---------- */
  function presupuesto() {
    const db = Datos.get(), pAct = Motor.periodoActual();
    if (!st.borrador) {
      const v = Motor.versionVigente(pAct);
      st.borrador = { desde: Motor.periodoAYm(pAct), lineas: v.lineas.map((l) => ({ ...l })) };
    }
    const b = st.borrador;
    const total = b.lineas.reduce((s, l) => s + (+l.valor || 0), 0);
    const cats = [...new Set(b.lineas.map((l) => l.cat).filter(Boolean))];
    const filas = b.lineas.map((l, i) => `<tr>
      <td><input list="lista-cats" data-i="${i}" data-campo="cat" value="${esc(l.cat)}" aria-label="Categoría"></td>
      <td><input data-i="${i}" data-campo="concepto" value="${esc(l.concepto)}" aria-label="Concepto"></td>
      <td><input data-i="${i}" data-campo="valor" class="num" inputmode="numeric" value="${UI.miles(l.valor)}" aria-label="Valor"></td>
      <td><button class="btn mini peligro" data-accion="quitar-linea" data-i="${i}" aria-label="Quitar">✕</button></td></tr>`).join('');
    const versiones = db.presupuestos.map((v) => {
      const s = v.lineas.reduce((a, l) => a + (+l.valor || 0), 0);
      return `<li>Desde <b>${Motor.nombrePeriodo(Motor.ymAPeriodo(v.desde))}</b> · ${v.lineas.length} conceptos · ${dinero(s)}
        <button class="btn mini" data-accion="cargar-version" data-desde="${v.desde}">Editar</button></li>`;
    }).join('');

    return `
      <h1>Presupuesto base</h1>
      <p class="sub">Monto mensual por categoría y concepto. Cada mes el contador arranca de cero con este presupuesto.</p>
      <div class="tarjeta">
        <div class="entre"><label class="campo" style="max-width:220px">Vigente desde el mes
          <input type="month" id="pres-desde" value="${b.desde}"></label>
          <div class="kpi amarillo chico" style="box-shadow:none"><div class="et">Total mensual</div><div class="val" id="pres-total">${dinero(total)}</div></div></div>
        <datalist id="lista-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <div class="tabla-wrap"><table class="tabla" id="tabla-pres">
          <thead><tr><th>Categoría</th><th>Concepto</th><th class="num">Valor mensual</th><th></th></tr></thead>
          <tbody>${filas}</tbody></table></div>
        <div class="acciones" style="margin-top:.9rem">
          <button class="btn" data-accion="agregar-linea">+ Agregar concepto</button>
          <button class="btn prim" data-accion="guardar-pres">Guardar presupuesto</button>
          <button class="btn" data-accion="descartar-pres">Descartar cambios</button></div>
      </div>
      <div class="tarjeta"><h2>Versiones guardadas</h2>
        <p class="sub">Si cambias el presupuesto desde un mes nuevo, los meses anteriores conservan el que tenían.</p>
        <ul>${versiones}</ul></div>`;
  }

  /* 4.6 REPORTES → ver js/reportes.js (Bloque 9) */

  /* ---------- 4.7 AJUSTES ---------- */
  function seccionNube() {
    const n = Nube.info();
    if (!n.hayClientId) return `<p class="sub">Falta un paso de configuración: registrar la app en Google Cloud y pegar el
      <b>ID de cliente</b> en <code>js/config.js</code>. Los pasos están en <code>LEEME.md</code>.</p>`;
    if (!n.esSeguro) return `<p class="sub">Para conectar con Google Drive la app debe abrirse desde su dirección web (https) o desde
      <code>http://localhost</code>, no con doble clic sobre el archivo. Ver <code>LEEME.md</code>.</p>`;
    if (n.conectado) {
      const hora = n.ultima ? new Date(n.ultima).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      return `<p>Conectado como <b>${esc(n.usuario?.completo || '')}</b> (${esc(n.usuario?.correo || '')})
          · ${n.modo === 'dueno' ? 'dueño del archivo' : 'archivo compartido'}</p>
        <p class="sub">Archivo: <code>${esc(n.ruta || '')}</code> · última sincronización: ${hora}
          ${n.fase !== 'ok' ? `<br><span class="estado critico">${esc(n.txt || '')}</span>` : ''}</p>
        <div class="acciones">
          <button class="btn prim" data-accion="nube-sync">Sincronizar ahora</button>
          ${n.fase === 'login' ? '<button class="btn" data-accion="nube-reconectar">Volver a iniciar sesión</button>' : ''}
          <button class="btn peligro" data-accion="nube-salir">Desconectar este dispositivo</button></div>
        ${n.modo === 'dueno' ? `<p class="sub" style="margin-top:.75rem">Para que tu pareja vea y edite: en Google Drive, clic derecho en la carpeta
          <b>${esc(CONFIG.carpeta)}</b> → Compartir → escribe su correo como <b>Editor</b> → Copiar vínculo.
          Ella abre la app, va a Ajustes y pega ese vínculo en “Drive compartido”.</p>` : ''}`;
    }
    return `<p class="sub">Guarda los datos en Google Drive para que ambos vean y editen lo mismo desde cualquier dispositivo.
        Los datos actuales de este dispositivo se combinan con los del archivo, sin borrar nada.</p>
      <div class="rejilla">
        <div class="tarjeta" style="box-shadow:none;border:1px solid var(--line);margin:0"><h2>Es mi Drive</h2>
          <p class="sub">Crea (o abre) <code>${esc(CONFIG.carpeta)}/${esc(CONFIG.archivo)}</code> en tu Google Drive.</p>
          <button class="btn prim" data-accion="nube-dueno">Conectar mi Google Drive</button></div>
        <div class="tarjeta" style="box-shadow:none;border:1px solid var(--line);margin:0"><h2>Drive compartido</h2>
          <p class="sub">Pega el vínculo de la carpeta que tu pareja te compartió.</p>
          <input id="nube-enlace" style="width:100%;margin-bottom:.5rem" placeholder="https://drive.google.com/drive/folders/…">
          <button class="btn prim" data-accion="nube-invitado">Conectar al compartido</button></div>
      </div>`;
  }

  function seccionExportar() {
    const I = Motor.indice();
    if (!st.exp) {
      let min = 99999999;
      for (const col of [I.g.fnum, I.ing.fnum, I.mov.fnum]) for (let i = 0; i < col.length; i++) if (col[i] < min) min = col[i];
      const desde = min < 99999999 ? `${(min / 10000) | 0}-${String(((min / 100) | 0) % 100).padStart(2, '0')}-${String(min % 100).padStart(2, '0')}` : Motor.hoyIso();
      st.exp = { desde, hasta: Motor.rangoPeriodo(Motor.periodoActual()).fin, sep: ';' };
    }
    const e = st.exp;
    const botones = Object.entries(Exportar.TABLAS).map(([k, t]) => `<button class="btn" data-accion="csv" data-tabla="${k}">${t.t}</button>`).join('');
    return `<p class="sub">La app no modifica un Excel: guarda sus propios datos (en este dispositivo y en Google Drive).
        Desde aquí los descargas en CSV para abrirlos en Excel o usarlos en análisis. Cada fila trae la columna
        <b>Periodo</b> (mes financiero del 25 al 24) para agrupar por mes, semestre o año.</p>
      <div class="filtros" id="exp-opc">
        <label class="campo">Desde<input type="date" name="desde" value="${e.desde}"></label>
        <label class="campo">Hasta<input type="date" name="hasta" value="${e.hasta}"></label>
        <label class="campo">Separador<select name="sep">
          <option value=";" ${e.sep === ';' ? 'selected' : ''}>Punto y coma ( ; ) · Excel en español</option>
          <option value="," ${e.sep === ',' ? 'selected' : ''}>Coma ( , ) · Python, Power BI, Sheets</option></select></label>
      </div>
      <div class="acciones">${botones}<button class="btn prim" data-accion="csv-todo">Descargar todo</button></div>`;
  }

  function ajustes() {
    const d = Motor.diaInicio();
    const opciones = Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${i + 1 === d ? 'selected' : ''}>${i + 1}</option>`).join('');
    return `
      <h1>Ajustes</h1>
      <div class="tarjeta"><h2>Google Drive compartido</h2>${seccionNube()}</div>
      <div class="tarjeta"><h2>Exportar datos (CSV)</h2>${seccionExportar()}</div>
      <div class="tarjeta"><h2>Inicio del mes financiero</h2>
        <p class="sub">Si el mes de ustedes va de quincena a quincena o desde el día de pago (ej. del 25 al 24), elige ese día.
          Con día 25, el ciclo 25-sep → 24-oct se llama “Octubre”, como en el Excel de Sofi.</p>
        <label class="campo" style="max-width:200px">Día de inicio<select id="dia-inicio">${opciones}</select></label></div>
      <div class="tarjeta"><h2>Respaldo completo</h2>
        <p class="sub">Copia exacta de todos los datos en un solo archivo. Al cargar un respaldo (o <code>datos-excel.json</code>)
          se combina con lo que ya hay, sin borrar nada.</p>
        <div class="acciones">
          <button class="btn" data-accion="exportar">Descargar respaldo (.json)</button>
          <label class="btn">Cargar respaldo<input type="file" id="importar" accept=".json,application/json" hidden></label>
        </div></div>
      <div class="tarjeta"><h2>Zona de cuidado</h2>
        <div class="acciones">
          <button class="btn peligro" data-accion="vaciar">Borrar todos los movimientos</button></div>
        <p class="sub" style="margin-top:.6rem">Pide confirmación. Conserva el presupuesto y las cuentas.
          Si están conectados a Drive, el borrado también se aplica en el dispositivo de tu pareja.</p></div>`;
  }

  return { st, inicio, hoja, movimientos, ahorros, presupuesto, ajustes };
})();
