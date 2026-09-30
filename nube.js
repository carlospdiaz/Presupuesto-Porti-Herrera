/* ============================================================
   BLOQUE 7 · NUBE — sincronización con Google Drive (Drive API v3)
   - Inicio de sesión con cuenta Google (OAuth 2.0 para apps web, sin servidor).
   - Dueño: usa /Porti-Herrera/porti-herrera-datos.json en SU Drive (lo crea si no existe).
   - Invitada/o: pega el enlace de la carpeta que el dueño le compartió.
   - Cada cambio local se sube a los ~1,5 s; cada 45 s se revisa si el otro
     cambió algo (campo `version` del archivo). Si ambos editaron a la vez,
     se combinan registro por registro (Datos.fusionar). Como cada copia
     conserva lo suyo hasta subirlo, una escritura simultánea se corrige sola
     en la siguiente sincronización.
   - Sin internet la app sigue funcionando; sube lo pendiente al volver.
   ============================================================ */
const Nube = (() => {
  const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPES = 'https://www.googleapis.com/auth/drive';
  const CLAVE = 'porti-herrera.nube';
  const TODAS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

  let cfg = leerCfg();
  let estado = { fase: 'local', txt: '' };
  let ocupado = false, pendiente = false, temporizador = null;

  function leerCfg() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; } }
  function guardarCfg() { try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch {} }

  const esSeguro = () => location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  const disponible = () => !!CONFIG.clientId && esSeguro();
  const conectado = () => !!(cfg.fileId && cfg.modo);
  const tokenVigente = () => !!(cfg.tok && Date.now() < cfg.tok.exp);
  const redirectUri = () => location.origin + location.pathname;

  /* ---------- 7.1 Estado visible en la barra ---------- */
  const FASES = {
    local: '◌ Solo en este dispositivo', ok: '☁ Sincronizado', sync: '↻ Sincronizando…',
    offline: '⚠ Sin conexión · se subirá luego', error: '⚠ Error de sincronización', login: '⚠ Toca para reconectar Drive',
  };
  function fijarEstado(fase, txt = '') {
    estado = { fase, txt };
    const el = document.getElementById('nube');
    if (!el) return;
    const hora = cfg.ultima ? new Date(cfg.ultima).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '';
    el.textContent = FASES[fase] + (fase === 'ok' && hora ? ` ${hora}` : '');
    el.title = txt || FASES[fase];
    el.dataset.fase = fase;
  }

  /* ---------- 7.2 Inicio de sesión (redirección a Google) ---------- */
  function iniciarSesion({ modo = cfg.modo, enlace = cfg.enlace, silencioso = false } = {}) {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const hash = location.hash.startsWith('#access_token') ? '#inicio' : location.hash;
    sessionStorage.setItem('porti-herrera.oauth', JSON.stringify({ state, modo, enlace, hash }));
    const q = new URLSearchParams({
      client_id: CONFIG.clientId, redirect_uri: redirectUri(), response_type: 'token',
      scope: SCOPES, include_granted_scopes: 'true', state,
      prompt: silencioso ? 'none' : 'consent select_account',
    });
    if (cfg.usuario?.correo) q.set('login_hint', cfg.usuario.correo);
    location.assign(`${AUTH}?${q}`);
  }

  /* Al volver de Google con #access_token=… (o #error=…) */
  async function completarLogin() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has('access_token') && !(h.has('error') && h.has('state'))) return false;
    const p = JSON.parse(sessionStorage.getItem('porti-herrera.oauth') || 'null');
    sessionStorage.removeItem('porti-herrera.oauth');
    history.replaceState(null, '', redirectUri() + (p?.hash || '#ajustes'));
    if (!p || p.state !== h.get('state')) { UI.aviso('Respuesta de inicio de sesión inválida'); return true; }
    if (h.get('error')) {
      if (!['interaction_required', 'login_required', 'consent_required'].includes(h.get('error'))) UI.aviso('Google: ' + h.get('error'));
      return true;
    }
    cfg.tok = { access: h.get('access_token'), exp: Date.now() + (+h.get('expires_in') - 120) * 1000 };
    const cambioArchivo = p.modo !== cfg.modo || (p.enlace || '') !== (cfg.enlace || '') || !cfg.fileId;
    cfg.modo = p.modo; cfg.enlace = p.enlace || '';
    guardarCfg();
    await perfil();
    if (cambioArchivo) await ubicarArchivo();
    UI.aviso(`Conectado a Google Drive como ${cfg.usuario?.nombre || ''}`);
    return true;
  }

  function token() {
    if (tokenVigente()) return cfg.tok.access;
    throw Object.assign(new Error('La sesión de Google venció'), { sesion: true });
  }

  async function api(url, opc = {}) {
    const r = await fetch(url, { ...opc, headers: { Authorization: 'Bearer ' + token(), ...(opc.headers || {}) } });
    if (r.status === 401) { cfg.tok = null; guardarCfg(); throw Object.assign(new Error('La sesión de Google venció'), { sesion: true }); }
    return r;
  }
  async function error(r) {
    try { const j = await r.json(); return `${r.status} ${j.error?.message || ''}`; } catch { return String(r.status); }
  }
  async function json(r) { if (!r.ok) throw new Error(await error(r)); return r.json(); }

  async function perfil() {
    const j = await json(await api(`${API}/about?fields=user(displayName,emailAddress)`));
    cfg.usuario = { nombre: (j.user.displayName || '').split(' ')[0], completo: j.user.displayName, correo: j.user.emailAddress };
    guardarCfg();
    Datos.fijarAutor(cfg.usuario.nombre);
  }

  /* ---------- 7.3 Ubicar (o crear) el archivo compartido ---------- */
  const buscar = async (q) => (await json(await api(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,version)&${TODAS}`))).files;
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  async function crear(nombre, padre, contenido) {
    const meta = { name: nombre, parents: padre ? [padre] : undefined,
      mimeType: contenido === undefined ? 'application/vnd.google-apps.folder' : 'application/json' };
    if (contenido === undefined) {
      return json(await api(`${API}/files?fields=id&${TODAS}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) }));
    }
    const limite = 'porti' + Date.now();
    const cuerpo = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
      + `--${limite}\r\nContent-Type: application/json\r\n\r\n${contenido}\r\n--${limite}--`;
    return json(await api(`${UPLOAD}/files?uploadType=multipart&fields=id,version&${TODAS}`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: cuerpo,
    }));
  }

  function idDeEnlace(enlace) {
    const m = enlace.match(/\/folders\/([\w-]+)/) || enlace.match(/\/d\/([\w-]+)/) || enlace.match(/[?&]id=([\w-]+)/);
    return m ? m[1] : enlace.trim();
  }

  async function ubicarArchivo() {
    let archivo;
    if (cfg.modo === 'dueno') {
      const carpetas = await buscar(`name='${esc(CONFIG.carpeta)}' and mimeType='application/vnd.google-apps.folder' and 'me' in owners and trashed=false`);
      const carpeta = carpetas[0] || await crear(CONFIG.carpeta);
      [archivo] = await buscar(`name='${esc(CONFIG.archivo)}' and '${carpeta.id}' in parents and trashed=false`);
      if (!archivo) archivo = await crear(CONFIG.archivo, carpeta.id, Datos.exportar());   // primera vez: con los datos locales
    } else {
      const id = idDeEnlace(cfg.enlace);
      const it = await json(await api(`${API}/files/${id}?fields=id,name,mimeType&${TODAS}`));
      if (it.mimeType === 'application/vnd.google-apps.folder') {
        [archivo] = await buscar(`name='${esc(CONFIG.archivo)}' and '${it.id}' in parents and trashed=false`);
        if (!archivo) throw new Error(`La carpeta compartida no tiene ${CONFIG.archivo}. El dueño debe conectarse primero.`);
      } else archivo = it;
    }
    cfg.fileId = archivo.id; cfg.version = null; cfg.ruta = `${CONFIG.carpeta}/${CONFIG.archivo}`;
    guardarCfg();
  }

  /* ---------- 7.4 Bajar / subir / sincronizar ---------- */
  async function metadatos() {
    const r = await api(`${API}/files/${cfg.fileId}?fields=id,version,trashed&${TODAS}`);
    if (r.status === 404) throw new Error('El archivo compartido ya no existe o no tienes acceso');
    return json(r);
  }
  async function bajar() {
    const r = await api(`${API}/files/${cfg.fileId}?alt=media&${TODAS}`);
    if (!r.ok) throw new Error('No se pudo descargar: ' + await error(r));
    const txt = await r.text();
    return txt.trim() ? JSON.parse(txt) : null;
  }
  async function subir() {
    const j = await json(await api(`${UPLOAD}/files/${cfg.fileId}?uploadType=media&fields=id,version&${TODAS}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: Datos.exportar(),
    }));
    cfg.version = j.version;
  }

  async function sincronizar() {
    if (!conectado()) return;
    if (!navigator.onLine) { fijarEstado('offline'); return; }
    if (!tokenVigente()) { fijarEstado('login'); return; }
    if (ocupado) { pendiente = true; return; }
    ocupado = true;
    fijarEstado('sync');
    try {
      const it = await metadatos();
      let faltaRemoto = cfg.sucio;
      if (it.version !== cfg.version) {                 // el otro cambió algo desde la última vez
        const remoto = await bajar();
        if (remoto) {
          const r = Datos.fusionar(remoto);
          if (r.cambioLocal) App.render();
          faltaRemoto = r.faltaRemoto;
        } else faltaRemoto = true;
        cfg.version = it.version;
      }
      if (faltaRemoto) await subir();
      cfg.sucio = false; cfg.ultima = Date.now(); guardarCfg();
      fijarEstado('ok');
    } catch (e) {
      console.warn('Sincronización:', e);
      if (e.sesion) fijarEstado('login', e.message);
      else if (e instanceof TypeError || !navigator.onLine) fijarEstado('offline', e.message);
      else fijarEstado('error', e.message);
    } finally {
      ocupado = false;
      if (pendiente) { pendiente = false; sincronizar(); }
    }
  }

  function alCambioLocal() {
    if (!conectado()) return;
    cfg.sucio = true; guardarCfg();
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizar, 1500);
  }

  /* Token vencido (dura ~1 h): se renueva con una redirección silenciosa,
     solo si no hay un formulario abierto (los datos ya están guardados localmente). */
  function renovarSiSePuede() {
    if (!conectado() || tokenVigente() || !navigator.onLine) return false;
    if (document.getElementById('modal').open) return false;
    iniciarSesion({ silencioso: true });
    return true;
  }

  /* ---------- 7.5 Arranque ---------- */
  async function iniciar() {
    Datos.alCambiar(alCambioLocal);
    if (cfg.usuario) Datos.fijarAutor(cfg.usuario.nombre);
    fijarEstado(conectado() ? 'sync' : 'local');
    if (!disponible()) return;
    let volvioDeGoogle = false;
    try { volvioDeGoogle = await completarLogin(); }
    catch (e) { UI.aviso('No se pudo conectar: ' + e.message); fijarEstado('error', e.message); }
    if (!conectado()) { fijarEstado('local'); return; }
    if (!tokenVigente()) {
      // Evita bucles: solo un intento silencioso por apertura
      if (!volvioDeGoogle && renovarSiSePuede()) return;
      fijarEstado('login');
    } else await sincronizar();
    setInterval(() => { if (!document.hidden) sincronizar(); }, CONFIG.cadaSegundos * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (!renovarSiSePuede()) sincronizar();
    });
    window.addEventListener('online', sincronizar);
  }

  function desconectar() {
    cfg = {}; guardarCfg();
    Datos.fijarAutor('');
    fijarEstado('local');
  }

  const info = () => ({
    disponible: disponible(), esSeguro: esSeguro(), hayClientId: !!CONFIG.clientId, conectado: conectado(),
    modo: cfg.modo, usuario: cfg.usuario, ruta: cfg.ruta, ultima: cfg.ultima, fase: estado.fase, txt: estado.txt,
  });

  return { iniciar, iniciarSesion, sincronizar, desconectar, info, renovarSiSePuede };
})();
