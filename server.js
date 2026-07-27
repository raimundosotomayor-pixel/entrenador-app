// Servidor local del formulario de entrenamiento.
// Sin dependencias externas: solo módulos nativos de Node.
// Escribe las notas de sesión directo en el vault de Obsidian, con el mismo
// frontmatter que ya usan Dataview/Tracker en Dashboard/Progreso.md.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const storage = require('./storage');

const PORT = process.env.PORT || 8787;

const PUBLIC_DIR = path.join(__dirname, 'public');

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diaDeFecha(fechaISO) {
  const [y, m, d] = String(fechaISO).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

// El plan (semana tipo, ejercicios de gimnasio, fases de sesión, ciclo)
// vive en Plan/plan-app.json dentro del vault — no está hardcodeado acá.
// Ver Plan/Formato Plan App.md para el schema.
function planFallback() {
  return { ciclo: { inicioLunes: todayISO(), semanasCarga: 3, semanasDescarga: 1 }, dias: {} };
}

async function obtenerPlan() {
  try {
    const raw = await storage.readPlan();
    if (!raw) return planFallback();
    return JSON.parse(raw);
  } catch {
    return planFallback();
  }
}

async function obtenerPlantilla(tipo, fechaISO) {
  const plan = await obtenerPlan();
  const dia = diaDeFecha(fechaISO || todayISO());
  const bloques = (plan.dias && plan.dias[String(dia)]) || [];
  const bloque = bloques.find((b) => b.tipo === tipo);
  if (!bloque) return { ejercicios: [], fases: [], hint: null };
  return {
    ejercicios: bloque.ejercicios || [],
    fases: bloque.fases || [],
    hint: bloque.hint || null,
  };
}

async function obtenerPlanHoy(dia) {
  const plan = await obtenerPlan();
  const bloques = (plan.dias && plan.dias[String(dia)]) || [];
  const am = bloques.find((b) => b.momento === 'am');
  const pm = bloques.find((b) => b.momento === 'pm');
  return { am: am ? am.descripcion : null, pm: pm ? pm.descripcion : null };
}

// Calcula fase (carga/descarga) y semana dentro de la fase, a partir de la
// fecha de inicio del ciclo definida en Plan/plan-app.json — nunca a mano.
async function calcularFaseCiclo(fechaISO) {
  const plan = await obtenerPlan();
  const cfg = plan.ciclo || planFallback().ciclo;
  const [y0, m0, d0] = cfg.inicioLunes.split('-').map(Number);
  const inicio = Date.UTC(y0, m0 - 1, d0);
  const [y, m, d] = String(fechaISO).split('-').map(Number);
  const fecha = Date.UTC(y, m - 1, d);

  const semanasCarga = cfg.semanasCarga || 3;
  const semanasDescarga = cfg.semanasDescarga || 1;
  const semanasCiclo = semanasCarga + semanasDescarga;
  const diasCiclo = semanasCiclo * 7;

  const diasDesdeInicio = Math.round((fecha - inicio) / 86400000);
  const diaEnCiclo = ((diasDesdeInicio % diasCiclo) + diasCiclo) % diasCiclo;
  const semanaEnCiclo = Math.floor(diaEnCiclo / 7); // 0-indexed

  if (semanaEnCiclo < semanasCarga) {
    return { fase: 'carga', semana: semanaEnCiclo + 1, semanaTotal: semanasCarga };
  }
  return { fase: 'descarga', semana: semanaEnCiclo - semanasCarga + 1, semanaTotal: semanasDescarga };
}

// --- Lectura de sesiones existentes (para historial + flag de fatiga) ---

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^"(.*)"$/, '$1');
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value !== '' && !isNaN(Number(value))) value = Number(value);
    data[key] = value;
  }
  return data;
}

async function readSessions() {
  const files = await storage.listSesiones();
  const sessions = [];
  for (const { filename, content } of files) {
    const fm = parseFrontmatter(content);
    if (fm) sessions.push({ archivo: filename, ...fm });
  }
  sessions.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
  return sessions;
}

function calcularAlertaDescarga(sessions) {
  let streak = 0;
  for (const s of sessions) {
    if (typeof s.fatiga === 'number' && s.fatiga >= 4) streak++;
    else streak = 0;
  }
  return streak >= 3 ? streak : 0;
}

async function readCheckins() {
  const files = await storage.listCheckins();
  const checkins = [];
  for (const { filename, content } of files) {
    const fm = parseFrontmatter(content);
    if (fm) checkins.push({ archivo: filename, ...fm });
  }
  checkins.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
  return checkins;
}

// --- Resumen semanal para pegar en el Claude Project "Entrenador" ---

function ultimosNDias(n, hastaISO) {
  const [y, m, d] = hastaISO.split('-').map(Number);
  const fin = new Date(y, m - 1, d);
  const fechas = [];
  for (let i = n - 1; i >= 0; i--) {
    const f = new Date(fin);
    f.setDate(f.getDate() - i);
    fechas.push(todayISO(f));
  }
  return fechas;
}

async function buildResumenSemanal() {
  const hoy = todayISO();
  const dias = ultimosNDias(7, hoy);
  const desde = dias[0];

  const sesiones = (await readSessions()).filter((s) => s.date >= desde && s.date <= hoy);
  const checkins = (await readCheckins()).filter((c) => c.date >= desde && c.date <= hoy);
  const ciclo = await calcularFaseCiclo(hoy);
  const alerta = calcularAlertaDescarga(await readSessions());

  let texto = `RESUMEN SEMANAL — ${desde} a ${hoy}\n`;
  texto += `Fase actual: ${ciclo.fase}${ciclo.fase === 'carga' ? ` (semana ${ciclo.semana}/${ciclo.semanaTotal})` : ''}\n`;
  if (alerta) texto += `⚠️ Fatiga alta sostenida: ${alerta} sesiones seguidas con fatiga >=4.\n`;
  texto += `\n--- Check-ins matutinos ---\n`;
  if (!checkins.length) texto += `(sin check-ins registrados esta semana)\n`;
  for (const c of checkins) {
    texto += `${c.date}: sueño ${yamlVal(c.sueno_score)} (score) / ${yamlVal(c.sueno_horas)}h, sensación al despertar ${yamlVal(c.sensacion_despertar)}/5${c.notas_despertar ? ` — "${c.notas_despertar}"` : ''}\n`;
  }

  texto += `\n--- Sesiones ---\n`;
  if (!sesiones.length) texto += `(sin sesiones registradas esta semana)\n`;
  for (const s of sesiones) {
    const partes = [`${s.date}: ${s.tipo}`];
    if (s.grado_max) partes.push(`grado(s) ${s.grado_max}`);
    if (s.puntuacion_sesion !== '' && s.puntuacion_sesion !== undefined) partes.push(`puntuación ${s.puntuacion_sesion}/10`);
    if (s.fatiga !== '' && s.fatiga !== undefined) partes.push(`fatiga ${s.fatiga}/5`);
    if (s.dolor !== '' && s.dolor !== undefined) partes.push(`dolor ${s.dolor}/5`);
    if (s.fases_total) partes.push(`fases ${s.fases_completadas}/${s.fases_total}`);
    if (s.notas) partes.push(`notas: "${s.notas}"`);
    texto += partes.join(' | ') + '\n';
  }

  texto += `\nPregunta para el entrenador: según estos datos y las reglas de ajuste del plan, ¿hay que modificar algo para la próxima semana?`;
  return texto;
}

// --- Escritura de una sesión nueva ---

function yamlVal(v) {
  if (v === undefined || v === null || v === '') return '';
  return String(v);
}

function buildMarkdown(s) {
  const tieneEjercicios = Array.isArray(s.ejercicios) && s.ejercicios.length > 0;
  const tieneBloques = Array.isArray(s.bloques) && s.bloques.length > 0;
  const esSesionSimple = s.puntuacion_sesion !== undefined && s.puntuacion_sesion !== '' && s.puntuacion_sesion !== null;

  let gradoMax = s.grado_max || '';
  let completado = s.completado || false;
  if (tieneBloques) {
    gradoMax = s.bloques.map((b) => `${b.grado || '?'}${b.estado === 'enviado' ? ' (enviado)' : ' (intentado)'}`).join(', ');
    completado = s.bloques.some((b) => b.estado === 'enviado');
  }

  let gymTable = '';
  if (tieneEjercicios) {
    gymTable = '\n## Cargas de gimnasio\n\n| Ejercicio | Series | Reps | Peso |\n|---|---|---|---|\n';
    for (const e of s.ejercicios) {
      gymTable += `| ${e.ejercicio || ''} | ${e.series || ''} | ${e.reps || ''} | ${e.peso || ''} |\n`;
    }
  }

  let fasesSection = '';
  let fasesCompletadas = '';
  let fasesTotal = '';
  if (Array.isArray(s.fases) && s.fases.length) {
    fasesSection = '\n## Fases de la sesión\n\n' + s.fases.map((f) => `- [${f.hecho ? 'x' : ' '}] ${f.nombre}`).join('\n') + '\n';
    fasesCompletadas = s.fases.filter((f) => f.hecho).length;
    fasesTotal = s.fases.length;
  }

  let bloquesTable = '';
  if (tieneBloques) {
    bloquesTable = '\n## Bloques / vías\n\n| Grado | Estado | Intentos |\n|---|---|---|\n';
    for (const b of s.bloques) {
      bloquesTable += `| ${b.grado || ''} | ${b.estado || ''} | ${b.intentos || ''} |\n`;
    }
  }

  let notasTecnicasSection = '';
  if (s.notas_tecnicas) {
    notasTecnicasSection = `\n## Notas técnicas\n- ${yamlVal(s.notas_tecnicas)}\n`;
  }

  let sesionSimpleSection = '';
  let sensacionesSection = '';
  if (esSesionSimple) {
    sesionSimpleSection = `\n## Sesión\n- Puntuación (1-10): ${yamlVal(s.puntuacion_sesion)}\n- Cómo me siento después: ${yamlVal(s.como_te_sientes)}\n`;
  } else {
    sensacionesSection = `\n## Sensaciones\n- Fatiga (1-5): ${yamlVal(s.fatiga)}\n- Dolor (0-5, 0 = ninguno): ${yamlVal(s.dolor)}\n`;
  }

  return `---
tipo_nota: sesion
date: ${s.date}
tipo: ${yamlVal(s.tipo)}
fase_ciclo: ${yamlVal(s.fase_ciclo)}
completado: ${yamlVal(completado)}
grado_max: ${yamlVal(gradoMax)}
fatiga: ${yamlVal(s.fatiga)}
dolor: ${yamlVal(s.dolor)}
puntuacion_sesion: ${yamlVal(s.puntuacion_sesion)}
fases_completadas: ${yamlVal(fasesCompletadas)}
fases_total: ${yamlVal(fasesTotal)}
hidratacion: "${yamlVal(s.hidratacion)}"
comidas: "${yamlVal(s.comidas)}"
notas: "${yamlVal(s.notas)}"
como_te_sientes: "${yamlVal(s.como_te_sientes)}"
origen: app-formulario
---

# Sesión ${s.date}
${fasesSection}${gymTable}${bloquesTable}${notasTecnicasSection}${sesionSimpleSection}${sensacionesSection}
## Recuperación
- Hidratación: ${yamlVal(s.hidratacion)}
- Comidas clave: ${yamlVal(s.comidas)}

## Notas libres
- ${yamlVal(s.notas)}
`;
}

async function guardarSesion(s) {
  // La fase del ciclo nunca se elige a mano: siempre se calcula por fecha.
  s.fase_ciclo = (await calcularFaseCiclo(s.date)).fase;

  const existentes = (await storage.listSesiones()).map((f) => f.filename);
  let filename = `${s.date}.md`;
  let i = 2;
  while (existentes.includes(filename)) {
    filename = `${s.date}-${i}.md`;
    i++;
  }
  await storage.writeSesion(filename, buildMarkdown(s));
  return filename;
}

// --- Check-in matutino (sueño + sensación al despertar) ---

function buildCheckinMarkdown(c) {
  return `---
tipo_nota: checkin
date: ${c.date}
sueno_score: ${yamlVal(c.sueno_score)}
sueno_horas: ${yamlVal(c.sueno_horas)}
sensacion_despertar: ${yamlVal(c.sensacion_despertar)}
notas_despertar: "${yamlVal(c.notas_despertar)}"
origen: app-formulario
---

# Check-in ${c.date}

- Sueño (score Garmin): ${yamlVal(c.sueno_score)}
- Horas de sueño: ${yamlVal(c.sueno_horas)}
- Sensación al despertar (1-5): ${yamlVal(c.sensacion_despertar)}
- Notas: ${yamlVal(c.notas_despertar)}
`;
}

async function guardarCheckin(c) {
  await storage.writeCheckin(`${c.date}.md`, buildCheckinMarkdown(c));
}

async function leerCheckin(fecha) {
  const content = await storage.readCheckin(`${fecha}.md`);
  return content ? parseFrontmatter(content) : null;
}

// --- Servidor HTTP ---

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serveStatic(req, res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('No encontrado');
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function pinValido(req) {
  if (!process.env.APP_PIN) return true; // sin PIN configurado (uso local) = sin restricción
  return req.headers['x-app-pin'] === process.env.APP_PIN;
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  if (pathname.startsWith('/api/') && !pinValido(req)) {
    sendJSON(res, 401, { ok: false, error: 'PIN incorrecto o faltante.' });
    return;
  }

  try {
    if (pathname === '/api/plantilla' && req.method === 'GET') {
      const plantilla = await obtenerPlantilla(query.tipo, query.fecha);
      sendJSON(res, 200, plantilla);
      return;
    }

    if (pathname === '/api/resumen-semanal' && req.method === 'GET') {
      const texto = await buildResumenSemanal();
      sendJSON(res, 200, { texto });
      return;
    }

    if (pathname === '/api/checkin' && req.method === 'GET') {
      const fecha = query.fecha || todayISO();
      sendJSON(res, 200, (await leerCheckin(fecha)) || {});
      return;
    }

    if (pathname === '/api/checkin' && req.method === 'POST') {
      const data = await leerBody(req);
      if (!data.date) {
        sendJSON(res, 400, { ok: false, error: 'Falta la fecha.' });
        return;
      }
      await guardarCheckin(data);
      sendJSON(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/hoy' && req.method === 'GET') {
      const fecha = query.fecha || todayISO();
      const dayIdx = diaDeFecha(fecha);
      const plan = await obtenerPlanHoy(dayIdx);
      const sessions = await readSessions();
      const alerta = calcularAlertaDescarga(sessions);
      const ciclo = await calcularFaseCiclo(fecha);
      sendJSON(res, 200, {
        fecha,
        hoyReal: todayISO(),
        dia: DIAS[dayIdx],
        plan_am: plan.am,
        plan_pm: plan.pm,
        fase_actual: ciclo.fase,
        semana_fase: ciclo.semana,
        semana_fase_total: ciclo.semanaTotal,
        alerta_descarga: alerta,
      });
      return;
    }

    if (pathname === '/api/historial' && req.method === 'GET') {
      const sessions = (await readSessions()).slice(-14).reverse();
      sendJSON(res, 200, sessions);
      return;
    }

    if (pathname === '/api/sesion' && req.method === 'POST') {
      const data = await leerBody(req);
      if (!data.date || !data.tipo) {
        sendJSON(res, 400, { ok: false, error: 'Faltan campos obligatorios (fecha, tipo).' });
        return;
      }
      const esSesionSimple = data.tipo === 'yoga' || data.tipo === 'trote';
      if (esSesionSimple) {
        if (data.puntuacion_sesion === undefined || data.puntuacion_sesion === '') {
          sendJSON(res, 400, { ok: false, error: 'Falta la puntuación de la sesión.' });
          return;
        }
      } else if (data.fatiga === undefined || data.fatiga === '' || data.dolor === undefined || data.dolor === '') {
        sendJSON(res, 400, { ok: false, error: 'Faltan fatiga y dolor.' });
        return;
      }
      const filename = await guardarSesion(data);
      sendJSON(res, 200, { ok: true, archivo: filename });
      return;
    }

    if (req.method === 'GET') {
      serveStatic(req, res, pathname);
      return;
    }

    res.writeHead(404);
    res.end('No encontrado');
  } catch (err) {
    sendJSON(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, () => {
  const modo = process.env.GITHUB_REPO_URL ? 'nube (git)' : 'local (disco)';
  console.log(`Entrenador app en http://localhost:${PORT} — almacenamiento: ${modo}`);
  if (!process.env.GITHUB_REPO_URL) {
    console.log('Para usarla desde el celular, busca la IP local de este PC (ipconfig) y entra a http://<esa-IP>:' + PORT);
  }
  if (process.env.APP_PIN) console.log('PIN requerido para /api/*.');
});
