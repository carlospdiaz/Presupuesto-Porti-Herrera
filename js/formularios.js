/* ============================================================
   BLOQUE 5 · FORMULARIOS (ventana modal)
   Registrar / editar: gasto, ingreso, movimiento de ahorro/deuda, cuenta.
   ============================================================ */
const Form = (() => {
  const { esc, dinero, miles, leerValor } = UI;
  let ctx = null;                        // { tipo, fila? } del formulario abierto
  const $ = (s) => document.querySelector(s);

  /* ---------- 5.1 Modal ---------- */
  function abrir(titulo, cuerpo, tabs = null) {
    $('#modal-titulo').textContent = titulo;
    const t = tabs ? `<div class="tabs">${['gasto', 'ingreso', 'mov'].map((k) =>
      `<button type="button" data-accion="tab-form" data-tab="${k}" class="${k === tabs ? 'activo' : ''}">${{ gasto: 'Gasto', ingreso: 'Ingreso', mov: 'Ahorro / deuda' }[k]}</button>`).join('')}</div>` : '';
    $('#modal-cuerpo').innerHTML = t + `<form id="form-reg" autocomplete="off">${cuerpo}</form>`;
    const m = $('#modal');
    if (!m.open) m.showModal();
    const primero = m.querySelector('[data-foco]') || m.querySelector('form input, form select');
    primero?.focus();
  }
  const cerrar = () => $('#modal').close();

  const campo = (et, html, extra = '') => `<label class="campo" ${extra}>${et}${html}</label>`;
  const valorInput = (v) => `<input name="valor" class="valor num" inputmode="numeric" required placeholder="0" value="${miles(v)}" data-foco>`;
  const pie = (editando) => `<div class="pie-modal">
      ${editando ? '<button type="button" class="btn peligro" data-accion="borrar-registro">Eliminar</button>' : '<span></span>'}
      <div class="acciones"><button type="button" class="btn" data-accion="cerrar-modal">Cancelar</button>
      <button type="submit" class="btn prim">${editando ? 'Guardar cambios' : 'Registrar'}</button></div></div>`;
  const opciones = (lista, sel) => lista.map((x) => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');

  /* ---------- 5.2 Gasto ---------- */
  function catalogo(fechaIso, extra) {           // cat → [conceptos] del presupuesto vigente
    const v = Motor.versionVigente(Motor.periodoDe(fechaIso)), mapa = new Map();
    for (const l of v.lineas) { if (!mapa.has(l.cat)) mapa.set(l.cat, []); mapa.get(l.cat).push(l.concepto); }
    if (extra?.cat) {
      if (!mapa.has(extra.cat)) mapa.set(extra.cat, []);
      if (!mapa.get(extra.cat).includes(extra.concepto)) mapa.get(extra.cat).push(extra.concepto);
    }
    return mapa;
  }

  function gasto(fila = null, pre = {}) {
    const f = fila || { fecha: Motor.hoyIso(), cat: pre.cat || '', concepto: '', detalle: '', valor: '', comentario: '' };
    ctx = { tipo: 'gasto', fila };
    const mapa = catalogo(f.fecha, fila);
    const cats = [...mapa.keys()];
    abrir(fila ? 'Editar gasto' : 'Registrar', `
      <div class="rejilla">
        ${campo('Valor', valorInput(f.valor))}
        ${campo('Fecha', `<input type="date" name="fecha" required value="${f.fecha}">`)}
        ${campo('Categoría', `<select name="cat" required><option value="" disabled ${f.cat ? '' : 'selected'}>Elige…</option>${opciones(cats, f.cat)}</select>`)}
        ${campo('Concepto', `<select name="concepto" required></select>`)}
      </div>
      <div class="rejilla" style="margin-top:.75rem">
        ${campo('Detalle', `<input name="detalle" placeholder="Ej. Compra D1" value="${esc(f.detalle)}">`)}
        ${campo('Comentario', `<input name="comentario" value="${esc(f.comentario)}">`)}
      </div>
      <div class="info-saldo" id="info-saldo" hidden></div>
      ${pie(!!fila)}`, fila ? null : 'gasto');
    poblarConceptos(f.concepto);
    infoGasto();
  }

  function poblarConceptos(sel) {
    const fm = $('#form-reg'), mapa = catalogo(fm.fecha.value, ctx.fila);
    const lista = mapa.get(fm.cat.value) || [];
    fm.concepto.innerHTML = opciones(lista, sel ?? lista[0]);
    fm.concepto.disabled = !lista.length;
  }

  function infoGasto() {
    const fm = $('#form-reg'), box = $('#info-saldo');
    if (!fm.cat.value || !fm.concepto.value || !fm.fecha.value) { box.hidden = true; return; }
    const d = Motor.disponible(fm.fecha.value, fm.cat.value, fm.concepto.value);
    const v = leerValor(fm.valor.value);
    // Al editar, el gasto original ya está descontado: se devuelve para no contarlo dos veces
    const o = ctx.fila, mismoPer = o && Motor.periodoDe(o.fecha) === d.periodo;
    const devL = mismoPer && o.cat === fm.cat.value && o.concepto === fm.concepto.value ? o.valor : 0;
    const devC = mismoPer && o.cat === fm.cat.value ? o.valor : 0;
    const linea = d.linea ? d.linea.rest + devL : 0, cat = d.cat ? d.cat.rest + devC : 0;
    const txt = (antes, despues) => `<b>${dinero(antes)}</b>${v ? ` → después de este gasto <b class="${despues < 0 ? 'neg' : ''}">${dinero(despues)}</b>` : ''}`;
    const mes = Motor.nombrePeriodo(d.periodo);
    let html = `Disponible en <b>${esc(fm.concepto.value)}</b> (${mes}): ${txt(linea, linea - v)}`;
    if (fm.concepto.value !== fm.cat.value) html += `<br>Categoría ${esc(fm.cat.value)}: ${txt(cat, cat - v)}`;
    if (d.linea && d.linea.pres === 0) html += '<br><span class="estado serio">▲ Este concepto no tiene presupuesto asignado</span>';
    box.innerHTML = html; box.hidden = false;
  }

  /* ---------- 5.3 Ingreso ---------- */
  function ingreso(fila = null) {
    const f = fila || { fecha: Motor.hoyIso(), cat: 'Salarios', concepto: '', valor: '', comentario: '' };
    ctx = { tipo: 'ingreso', fila };
    const db = Datos.get();
    const cats = [...new Set(['Salarios', 'Otros', ...db.ingresos.map((x) => x.cat)])];
    const conceptos = [...new Set(db.ingresos.map((x) => x.concepto))];
    abrir(fila ? 'Editar ingreso' : 'Registrar', `
      <div class="rejilla">
        ${campo('Valor', valorInput(f.valor))}
        ${campo('Fecha', `<input type="date" name="fecha" required value="${f.fecha}">`)}
        ${campo('Categoría', `<input name="cat" list="dl-icat" required value="${esc(f.cat)}">`)}
        ${campo('Concepto', `<input name="concepto" list="dl-icon" required placeholder="Ej. Pago GTE" value="${esc(f.concepto)}">`)}
      </div>
      ${campo('Comentario', `<input name="comentario" value="${esc(f.comentario)}">`, 'style="margin-top:.75rem"')}
      <datalist id="dl-icat">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <datalist id="dl-icon">${conceptos.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      ${pie(!!fila)}`, fila ? null : 'ingreso');
  }

  /* ---------- 5.4 Movimiento de ahorro / deuda ---------- */
  const TIPOS = {
    ahorro: [['mas', 'Aporte (+)'], ['menos', 'Retiro (−)'], ['saldo', 'Fijar saldo actual']],
    deuda: [['menos', 'Pago (−)'], ['mas', 'Nuevo cargo (+)'], ['saldo', 'Fijar saldo actual']],
  };
  function mov(fila = null, pre = {}) {
    const db = Datos.get();
    if (!db.cuentas.length) { cuenta(); return; }
    const f = fila || { fecha: Motor.hoyIso(), cuenta: pre.cuenta || db.cuentas[0].id, tipo: pre.tipo || 'mas', valor: '', comentario: '' };
    ctx = { tipo: 'mov', fila };
    const grupo = (clase, et) => {
      const ops = db.cuentas.filter((c) => c.clase === clase)
        .map((c) => `<option value="${c.id}" ${c.id === f.cuenta ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.lugar)}</option>`).join('');
      return ops ? `<optgroup label="${et}">${ops}</optgroup>` : '';
    };
    abrir(fila ? 'Editar movimiento' : 'Registrar', `
      <div class="rejilla">
        ${campo('Cuenta', `<select name="cuenta" required>${grupo('ahorro', 'Ahorros')}${grupo('deuda', 'Deudas')}</select>`)}
        ${campo('Tipo', '<select name="tipo"></select>')}
        ${campo('Valor', valorInput(f.valor))}
        ${campo('Fecha', `<input type="date" name="fecha" required value="${f.fecha}">`)}
      </div>
      ${campo('Comentario', `<input name="comentario" value="${esc(f.comentario)}">`, 'style="margin-top:.75rem"')}
      <div class="info-saldo" id="info-saldo" hidden></div>
      <p class="sub" style="margin:.6rem 0 0">¿Cuenta nueva? <button type="button" class="btn mini" data-accion="nueva-cuenta">+ Crear cuenta</button></p>
      ${pie(!!fila)}`, fila ? null : 'mov');
    poblarTipos(f.tipo);
    infoMov();
  }
  function poblarTipos(sel) {
    const fm = $('#form-reg'), c = Datos.get().cuentas.find((x) => x.id === fm.cuenta.value);
    fm.tipo.innerHTML = TIPOS[c?.clase || 'ahorro'].map(([k, t]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${t}</option>`).join('');
  }
  function infoMov() {
    const fm = $('#form-reg'), box = $('#info-saldo'), db = Datos.get();
    const i = db.cuentas.findIndex((x) => x.id === fm.cuenta.value);
    if (i < 0) { box.hidden = true; return; }
    const actual = Motor.saldos().saldo[i], v = leerValor(fm.valor.value), t = fm.tipo.value;
    const nuevo = t === 'saldo' ? v : t === 'mas' ? actual + v : actual - v;
    box.innerHTML = `Saldo actual: <b>${dinero(actual)}</b>${v && !ctx.fila ? ` → nuevo saldo <b>${dinero(nuevo)}</b>` : ''}`;
    box.hidden = false;
  }

  /* ---------- 5.5 Cuenta ---------- */
  function cuenta(fila = null) {
    const f = fila || { nombre: '', lugar: '', clase: 'ahorro' };
    ctx = { tipo: 'cuenta', fila };
    abrir(fila ? 'Editar cuenta' : 'Nueva cuenta', `
      <div class="rejilla">
        ${campo('Nombre', `<input name="nombre" required placeholder="Ej. Fondo de emergencias" value="${esc(f.nombre)}" data-foco>`)}
        ${campo('Lugar / entidad', `<input name="lugar" placeholder="Ej. NU" value="${esc(f.lugar)}">`)}
        ${campo('Tipo', `<select name="clase"><option value="ahorro" ${f.clase === 'ahorro' ? 'selected' : ''}>Ahorro / inversión</option>
          <option value="deuda" ${f.clase === 'deuda' ? 'selected' : ''}>Deuda</option></select>`)}
        ${fila ? '' : campo('Saldo inicial', '<input name="valor" class="valor num" inputmode="numeric" placeholder="0">')}
      </div>
      ${fila ? '<p class="sub" style="margin:.6rem 0 0">Eliminar la cuenta borra también su historial.</p>' : ''}
      ${pie(!!fila)}`);
  }

  /* ---------- 5.6 Guardar / eliminar ---------- */
  function guardar() {
    const fm = $('#form-reg'), d = Object.fromEntries(new FormData(fm));
    for (const k in d) if (typeof d[k] === 'string') d[k] = d[k].trim();
    if ('valor' in d) d.valor = leerValor(d.valor);
    const { tipo, fila } = ctx;
    if (tipo !== 'cuenta' && !(d.valor > 0) && d.tipo !== 'saldo') { UI.aviso('Escribe un valor mayor que cero'); fm.valor.focus(); return; }

    if (tipo === 'gasto') {
      if (!d.concepto) d.concepto = d.cat;
      fila ? Datos.actualizar('gastos', fila.id, d) : Datos.agregar('gastos', d);
      const r = Motor.disponible(d.fecha, d.cat, d.concepto);
      UI.aviso(`Gasto guardado · quedan ${dinero(r.linea ? r.linea.rest : 0)} en ${d.concepto}`);
    } else if (tipo === 'ingreso') {
      fila ? Datos.actualizar('ingresos', fila.id, d) : Datos.agregar('ingresos', d);
      UI.aviso('Ingreso guardado');
    } else if (tipo === 'mov') {
      fila ? Datos.actualizar('movCuentas', fila.id, d) : Datos.agregar('movCuentas', d);
      UI.aviso('Movimiento guardado');
    } else if (tipo === 'cuenta') {
      const { valor, ...c } = d;
      if (fila) Datos.actualizar('cuentas', fila.id, c);
      else {
        const nueva = Datos.agregar('cuentas', c);
        if (valor > 0) Datos.agregar('movCuentas', { fecha: Motor.hoyIso(), cuenta: nueva.id, tipo: 'saldo', valor, comentario: 'Saldo inicial' });
      }
      UI.aviso('Cuenta guardada');
    }
    cerrar();
    App.render();
  }

  function borrar(boton) {
    if (boton.dataset.seguro !== '1') {            // confirmación en dos toques
      boton.dataset.seguro = '1';
      boton.textContent = '¿Seguro? Toca de nuevo';
      return;
    }
    const col = { gasto: 'gastos', ingreso: 'ingresos', mov: 'movCuentas', cuenta: 'cuentas' }[ctx.tipo];
    Datos.eliminar(col, ctx.fila.id);
    UI.aviso('Eliminado');
    cerrar();
    App.render();
  }

  /* ---------- 5.7 Eventos internos del modal ---------- */
  function alCambiar(e) {
    const n = e.target.name;
    if (e.target.classList.contains('valor') && e.type === 'input') {   // formato 1.234.567 mientras escribe
      const v = leerValor(e.target.value);
      e.target.value = v ? miles(v) : '';
    }
    if (ctx?.tipo === 'gasto') {
      if (n === 'cat' || n === 'fecha') poblarConceptos();
      infoGasto();
    } else if (ctx?.tipo === 'mov') {
      if (n === 'cuenta') poblarTipos();
      infoMov();
    }
  }
  function iniciar() {
    const m = $('#modal');
    m.addEventListener('input', alCambiar);
    m.addEventListener('change', alCambiar);
    m.addEventListener('submit', (e) => { e.preventDefault(); guardar(); });
  }

  return { iniciar, gasto, ingreso, mov, cuenta, cerrar, borrar };
})();
