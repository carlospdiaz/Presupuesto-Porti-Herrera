/* ============================================================
   BLOQUE 8 · EXPORTAR A CSV
   Separador ";" por defecto: es el que Excel en español (Colombia) abre
   directo con doble clic. Se incluye BOM UTF-8 para que las tildes se vean bien.
   Cada tabla trae la columna "Periodo" (AAAA-MM del mes financiero) para
   poder hacer tablas dinámicas por mes, semestre o año.
   ============================================================ */
const Exportar = (() => {
  const TIPO_TXT = { saldo: 'Saldo fijado', mas: 'Aporte / cargo', menos: 'Retiro / pago' };

  function csv(filas, columnas, sep) {
    const celda = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return sep === ';' ? String(v).replace('.', ',') : String(v);
      const s = String(v);
      return /["\r\n;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = [columnas.map((c) => celda(c[0])).join(sep)];
    for (const f of filas) lineas.push(columnas.map((c) => celda(c[1](f))).join(sep));
    return '﻿' + lineas.join('\r\n');
  }

  function descargar(nombre, texto) {
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* Filas del índice columnar dentro del rango, ordenadas por fecha */
  function filasEnRango(col, desde, hasta) {
    const m = Motor.entre(col.fnum, Motor.aFnum(desde), Motor.aFnum(hasta));
    return UI.ordenarPorFecha(Motor.posiciones(m), col.fnum, false);
  }
  const periodo = (p) => Motor.periodoAYm(p);
  const mes = (p) => Motor.nombrePeriodo(p);

  /* ---------- Tablas ---------- */
  const TABLAS = {
    gastos: { nombre: 'gastos', t: 'Gastos', crear: ({ desde, hasta }, pos) => {
      const I = Motor.indice();
      pos = pos || filasEnRango(I.g, desde, hasta);
      return [Array.from(pos), [
        ['Fecha', (i) => I.G[i].fecha], ['Periodo', (i) => periodo(I.g.per[i])], ['Mes', (i) => mes(I.g.per[i])],
        ['Categoría', (i) => I.G[i].cat], ['Concepto', (i) => I.G[i].concepto], ['Detalle', (i) => I.G[i].detalle],
        ['Valor', (i) => I.g.val[i]], ['Comentario', (i) => I.G[i].comentario], ['Registrado por', (i) => I.G[i].por || ''],
      ]];
    } },
    ingresos: { nombre: 'ingresos', t: 'Ingresos', crear: ({ desde, hasta }, pos) => {
      const I = Motor.indice();
      pos = pos || filasEnRango(I.ing, desde, hasta);
      return [Array.from(pos), [
        ['Fecha', (i) => I.I[i].fecha], ['Periodo', (i) => periodo(I.ing.per[i])], ['Mes', (i) => mes(I.ing.per[i])],
        ['Categoría', (i) => I.I[i].cat], ['Concepto', (i) => I.I[i].concepto], ['Valor', (i) => I.ing.val[i]],
        ['Comentario', (i) => I.I[i].comentario], ['Registrado por', (i) => I.I[i].por || ''],
      ]];
    } },
    ahorros: { nombre: 'ahorros-deudas-movimientos', t: 'Ahorros y deudas (movimientos)', crear: ({ desde, hasta }) => {
      const I = Motor.indice(), cs = Datos.get().cuentas;
      return [Array.from(filasEnRango(I.mov, desde, hasta)), [
        ['Fecha', (i) => I.M[i].fecha], ['Periodo', (i) => periodo(I.mov.per[i])], ['Cuenta', (i) => cs[I.mov.cta[i]].nombre],
        ['Lugar', (i) => cs[I.mov.cta[i]].lugar], ['Clase', (i) => cs[I.mov.cta[i]].clase], ['Movimiento', (i) => TIPO_TXT[I.M[i].tipo]],
        ['Valor', (i) => I.mov.val[i]], ['Comentario', (i) => I.M[i].comentario], ['Registrado por', (i) => I.M[i].por || ''],
      ]];
    } },
    saldos: { nombre: 'saldos-cuentas', t: 'Saldos por cuenta (a la fecha "hasta")', crear: ({ hasta }) => {
      const { saldo } = Motor.saldos(hasta), cs = Datos.get().cuentas;
      return [cs.map((c, i) => i), [
        ['Cuenta', (i) => cs[i].nombre], ['Lugar', (i) => cs[i].lugar], ['Clase', (i) => cs[i].clase],
        ['Saldo', (i) => saldo[i]], ['Al', () => hasta],
      ]];
    } },
    presupuesto: { nombre: 'presupuesto', t: 'Presupuesto base (todas las versiones)', crear: () => {
      const filas = Datos.get().presupuestos.flatMap((v) => v.lineas.map((l) => ({ ...l, desde: v.desde })));
      return [filas, [['Vigente desde', (l) => l.desde], ['Categoría', (l) => l.cat], ['Concepto', (l) => l.concepto], ['Valor', (l) => +l.valor || 0]]];
    } },
    resumen: { nombre: 'resumen-mensual', t: 'Resumen mensual por categoría', crear: ({ desde, hasta }) => {
      const p0 = Motor.periodoDe(desde), p1 = Motor.periodoDe(hasta), M = Motor.matriz(p0, p1);
      const filas = [];
      for (let k = 0; k < M.nP; k++) for (let c = 0; c < M.nC; c++) {
        const j = k * M.nC + c;
        if (M.pres[j] || M.gast[j]) filas.push({ p: p0 + k, cat: M.cats[c], pres: M.pres[j], gast: M.gast[j] });
      }
      return [filas, [
        ['Periodo', (f) => periodo(f.p)], ['Mes', (f) => mes(f.p)], ['Categoría', (f) => f.cat],
        ['Presupuesto', (f) => f.pres], ['Gastado', (f) => f.gast], ['Restante', (f) => f.pres - f.gast],
        ['% usado', (f) => (f.pres ? Math.round((f.gast / f.pres) * 1000) / 10 : '')],
      ]];
    } },
  };

  function tabla(clave, opc, posiciones = null) {
    const def = TABLAS[clave];
    const [filas, cols] = def.crear(opc, posiciones);
    const rango = clave === 'presupuesto' ? '' : clave === 'saldos' ? `_${opc.hasta}` : `_${opc.desde}_a_${opc.hasta}`;
    descargar(`porti-herrera_${def.nombre}${rango}.csv`, csv(filas, cols, opc.sep || ';'));
    return filas.length;
  }

  async function todo(opc) {
    for (const k of Object.keys(TABLAS)) {             // pausa corta: algunos navegadores bloquean descargas simultáneas
      tabla(k, opc);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  return { TABLAS, tabla, todo };
})();
