/* ============================================================
   BLOQUE 6 · APP — navegación (menú por #hash) y eventos delegados
   ============================================================ */
const App = (() => {
  const RUTAS = {
    inicio: Vistas.inicio, hoja: Vistas.hoja, movimientos: Vistas.movimientos,
    ahorros: Vistas.ahorros, presupuesto: Vistas.presupuesto, reportes: Reportes.vista, ajustes: Vistas.ajustes,
  };
  const st = Vistas.st;
  const ruta = () => (RUTAS[location.hash.slice(1)] ? location.hash.slice(1) : 'inicio');
  const buscar = (col, id) => Datos.get()[col].find((x) => x.id === id);

  function render() {
    const r = ruta(), y = window.scrollY;
    UI.reiniciarTips();
    document.getElementById('vista').innerHTML = RUTAS[r]();
    document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('activo', a.dataset.vista === r));
    window.scrollTo(0, y);
  }

  /* ---------- 6.1 Acciones (clic en cualquier [data-accion]) ---------- */
  const ACCIONES = {
    'registrar': () => Form.gasto(),
    'nuevo-gasto': (el) => Form.gasto(null, { cat: el.dataset.cat }),
    'editar-gasto': (el) => Form.gasto(buscar('gastos', el.dataset.id)),
    'editar-ingreso': (el) => Form.ingreso(buscar('ingresos', el.dataset.id)),
    'editar-mov': (el) => Form.mov(buscar('movCuentas', el.dataset.id)),
    'mov-cuenta': (el) => Form.mov(null, { cuenta: el.dataset.cuenta, tipo: el.dataset.tipo }),
    'nueva-cuenta': () => Form.cuenta(),
    'editar-cuenta': (el) => Form.cuenta(buscar('cuentas', el.dataset.id)),
    'tab-form': (el) => ({ gasto: () => Form.gasto(), ingreso: () => Form.ingreso(), mov: () => Form.mov() })[el.dataset.tab](),
    'cerrar-modal': () => Form.cerrar(),
    'borrar-registro': (el) => Form.borrar(el),

    'mes': (el) => {
      const d = +el.dataset.d;
      st.periodoHoja = d === 0 ? Motor.periodoActual() : st.periodoHoja + d;
      render();
    },
    'tab-mov': (el) => { st.tabMov = el.dataset.tab; render(); },
    'ver-cat': (el) => { st.catAbierta = st.catAbierta === el.dataset.cat ? null : el.dataset.cat; render(); },
    'rep-preset': (el) => { Reportes.preset(el.dataset.p); render(); },

    'agregar-linea': () => { st.borrador.lineas.push({ cat: '', concepto: '', valor: 0 }); render(); },
    'quitar-linea': (el) => { st.borrador.lineas.splice(+el.dataset.i, 1); render(); },
    'descartar-pres': () => { st.borrador = null; render(); },
    'cargar-version': (el) => {
      const v = Datos.get().presupuestos.find((x) => x.desde === el.dataset.desde);
      st.borrador = { desde: v.desde, lineas: v.lineas.map((l) => ({ ...l })) };
      render(); window.scrollTo(0, 0);
    },
    'guardar-pres': guardarPresupuesto,

    /* Google Drive */
    'ir-ajustes': () => {
      if (Nube.info().fase === 'login') Nube.iniciarSesion();
      else location.hash = 'ajustes';
    },
    'nube-dueno': () => Nube.iniciarSesion({ modo: 'dueno', enlace: '' }),
    'nube-invitado': () => {
      const enlace = document.getElementById('nube-enlace').value.trim();
      if (!enlace) { UI.aviso('Pega primero el vínculo de la carpeta compartida'); return; }
      Nube.iniciarSesion({ modo: 'invitado', enlace });
    },
    'nube-sync': () => Nube.sincronizar().then(render),
    'nube-reconectar': () => Nube.iniciarSesion(),
    'nube-salir': () => {
      if (!confirm('¿Desconectar este dispositivo de Google Drive? Los datos quedan guardados aquí y en Drive.')) return;
      Nube.desconectar(); render();
    },

    /* CSV */
    'csv': (el) => { const n = Exportar.tabla(el.dataset.tabla, st.exp); UI.aviso(`CSV descargado (${n} filas)`); },
    'csv-todo': () => Exportar.todo(st.exp),
    'csv-filtro': () => {
      const f = st.filtros, esGasto = st.tabMov === 'gastos';
      const res = esGasto ? Motor.filtrarGastos(f) : Motor.filtrarIngresos(f);
      const I = Motor.indice();
      const pos = UI.ordenarPorFecha(res.filas, esGasto ? I.g.fnum : I.ing.fnum, false);
      const n = Exportar.tabla(esGasto ? 'gastos' : 'ingresos', { desde: f.desde, hasta: f.hasta, sep: st.exp?.sep || ';' }, pos);
      UI.aviso(`CSV descargado (${n} filas)`);
    },

    'exportar': () => {
      const blob = new Blob([Datos.exportar()], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `porti-herrera-respaldo-${Motor.hoyIso()}.json` });
      a.click(); URL.revokeObjectURL(a.href);
    },
    'vaciar': () => {
      if (!confirm('¿Borrar todos los gastos, ingresos y movimientos de ahorro? El presupuesto y las cuentas se conservan.')) return;
      Datos.vaciar(); reiniciarEstado(); UI.aviso('Movimientos borrados'); render();
    },
  };

  function guardarPresupuesto() {
    const b = st.borrador, vistos = new Set();
    const lineas = [];
    for (const l of b.lineas) {
      const cat = (l.cat || '').trim(), concepto = (l.concepto || '').trim() || cat;
      if (!cat) continue;
      const k = cat + '|' + concepto;
      if (vistos.has(k)) { UI.aviso(`“${concepto}” está repetido en ${cat}`); return; }
      vistos.add(k);
      lineas.push({ cat, concepto, valor: +l.valor || 0 });
    }
    if (!/^\d{4}-\d{2}$/.test(b.desde)) { UI.aviso('Elige el mes de vigencia'); return; }
    Datos.guardarPresupuesto(b.desde, lineas);
    st.borrador = null;
    UI.aviso('Presupuesto guardado');
    render();
  }

  function reiniciarEstado() { st.periodoHoja = null; st.filtros = null; st.borrador = null; st.exp = null; st.rep = null; }

  /* ---------- 6.2 Entradas dentro de las vistas ---------- */
  function alEscribir(e) {
    const el = e.target;
    if (el.closest('#rep-opc')) {                                  // rango / agrupación de Reportes
      if (e.type !== 'change') return;
      const r = Reportes.estado();
      r[el.name] = el.name === 'gran' ? el.value : +el.value;
      if (r.p0 > r.p1) [r.p0, r.p1] = [r.p1, r.p0];
      r.preset = null;
      render();
    } else if (el.closest('#exp-opc')) {                           // opciones de exportación CSV
      st.exp[el.name] = el.value;
    } else if (el.closest('#filtros')) {                           // filtros de Movimientos
      st.filtros[el.name] = el.value;
      if (e.type === 'change' || el.type === 'search') {
        render();
        const foco = document.querySelector(`#filtros [name="${el.name}"]`);
        if (el.type === 'search' && foco) { foco.focus(); foco.setSelectionRange(foco.value.length, foco.value.length); }
      }
    } else if (el.dataset.campo) {                                 // editor de presupuesto (sin repintar)
      const l = st.borrador.lineas[+el.dataset.i];
      if (el.dataset.campo === 'valor') {
        l.valor = UI.leerValor(el.value);
        el.value = UI.miles(l.valor);
        const total = st.borrador.lineas.reduce((s, x) => s + (+x.valor || 0), 0);
        document.getElementById('pres-total').textContent = UI.dinero(total);
      } else l[el.dataset.campo] = el.value;
    } else if (el.id === 'pres-desde') {
      st.borrador.desde = el.value;
    } else if (el.id === 'dia-inicio' && e.type === 'change') {
      Datos.ajustar({ diaInicio: +el.value });
      reiniciarEstado();
      UI.aviso(`El mes ahora empieza el día ${el.value}`);
    } else if (el.id === 'importar' && e.type === 'change' && el.files[0]) {
      el.files[0].text().then((txt) => {
        try { Datos.importar(txt); reiniciarEstado(); UI.aviso('Respaldo cargado'); render(); }
        catch (err) { UI.aviso('No se pudo cargar: ' + err.message); }
      });
    }
  }

  /* ---------- 6.3 Arranque ---------- */
  function iniciar() {
    Datos.cargar();
    Form.iniciar();
    Reportes.iniciar();
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-accion]');
      if (el && ACCIONES[el.dataset.accion]) ACCIONES[el.dataset.accion](el);
    });
    const vista = document.getElementById('vista');
    vista.addEventListener('input', alEscribir);
    vista.addEventListener('change', alEscribir);
    window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
    // Si el mes cambia con la app abierta, al volver a la pestaña se recalcula
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.getElementById('modal').open) render(); });
    render();
    Nube.iniciar().finally(render);                                // al volver de Google, repinta con los datos del Drive
  }

  return { iniciar, render };
})();

document.addEventListener('DOMContentLoaded', App.iniciar);
