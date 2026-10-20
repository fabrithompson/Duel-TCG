// `pnpm qa:ui`: prueba la app entera como la usaría cada rol, en un navegador sin ventana.
// Levanta los emuladores de Firebase con datos de prueba, arma la versión web apuntando a ellos
// y recorre cada pantalla en varios tamaños de celular y tablet, de día y de noche: mide
// botones, diseño, velocidad y fluidez, y deja un reporte con capturas en qa-reporte/index.html.
//
// Opciones:
//   --rapido               3 tamaños (el más chico, el común y la tablet) y sin tocar botones
//   --sin-botones          no toca los botones
//   --sin-build            reusa la versión web del último qa:ui
//   --sector admin,juez    solo esos sectores (sin-sesion, admin, juez, mozo, jugador)
//   --pantalla hoy,stock   solo esas pantallas
//   --dispositivos se1,iphone
//   --no-abrir             no abre el reporte al terminar

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { delimiter, extname, join, resolve, sep } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { ROLE_LABEL, type Role } from '../../constants/roles';
import { sembrarQA } from './datos';
import { CLAVE_QA, CUENTAS_QA, PROYECTO_QA, PUERTOS_QA, PUERTO_WEB_QA } from './entorno';
import { DISPOSITIVOS, NOMBRE_SECTOR, PANTALLAS, PRINCIPAL, RAPIDOS, type Dispositivo, type Pantalla, type Sector } from './pantallas';
import {
  UMBRALES,
  contar,
  escribirReporte,
  type Captura,
  type Desplazamiento,
  type Nivel,
  type Problema,
  type PruebaBoton,
  type ResultadoPantalla,
  type Velocidad,
} from './reporte';

const RAIZ = resolve(__dirname, '..', '..');
const DIR_WEB = join(RAIZ, '.qa', 'web');
const DIR_REPORTE = join(RAIZ, 'qa-reporte');
const BASE = `http://127.0.0.1:${PUERTO_WEB_QA}`;
const SCRIPT_NAVEGADOR = readFileSync(join(__dirname, 'navegador.js'), 'utf8');
const esWindows = process.platform === 'win32';

// Botones que no se tocan: sacarían de la sesión y el resto de las pantallas quedaría sin probar.
const NO_TOCAR = /cerrar sesi[oó]n|^salir$/i;

const SECTORES: readonly Sector[] = ['sin-sesion', 'admin', 'juez', 'mozo', 'jugador'];

interface Opciones {
  sectores: Sector[];
  pantallas: string[] | null;
  dispositivos: Dispositivo[];
  botones: boolean;
  build: boolean;
  abrir: boolean;
}

function leerOpciones(argv: readonly string[]): Opciones {
  const valor = (nombre: string) => {
    const i = argv.indexOf(nombre);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1].split(',').map((s) => s.trim()) : null;
  };
  const rapido = argv.includes('--rapido');
  const sectores = (valor('--sector') ?? valor('--rol') ?? SECTORES) as Sector[];
  const desconocido = sectores.find((s) => !SECTORES.includes(s));
  if (desconocido) throw new Error(`Sector desconocido: ${desconocido}. Usá ${SECTORES.join(', ')}.`);
  const ids = valor('--dispositivos') ?? (rapido ? RAPIDOS : DISPOSITIVOS.map((d) => d.id));
  const dispositivos = ids.map((id) => {
    const d = DISPOSITIVOS.find((x) => x.id === id);
    if (!d) throw new Error(`Dispositivo desconocido: ${id}. Usá ${DISPOSITIVOS.map((x) => x.id).join(', ')}.`);
    return d;
  });
  return {
    sectores,
    pantallas: valor('--pantalla'),
    dispositivos,
    botones: !rapido && !argv.includes('--sin-botones'),
    build: !argv.includes('--sin-build'),
    abrir: !argv.includes('--no-abrir') && !process.env.CI,
  };
}

// ---------------------------------------------------------------------------
// Procesos: emuladores, build web y servidor
// ---------------------------------------------------------------------------

const hijos: ChildProcess[] = [];

function lanzar(comando: string, args: string[], env: NodeJS.ProcessEnv = process.env): ChildProcess {
  // En Windows pnpm es un .cmd y necesita la consola: se arma la línea entera (los argumentos no llevan espacios).
  const opciones = { cwd: RAIZ, env, detached: !esWindows, stdio: ['ignore', 'pipe', 'pipe'] as ('ignore' | 'pipe')[] };
  const hijo = esWindows ? spawn([comando, ...args].join(' '), { ...opciones, shell: true }) : spawn(comando, args, opciones);
  hijos.push(hijo);
  return hijo;
}

function terminar(hijo: ChildProcess): void {
  if (hijo.pid === undefined || hijo.exitCode !== null) return;
  if (esWindows) spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-hijo.pid, 'SIGTERM');
    } catch {}
  }
}

function ultimasLineas(hijo: ChildProcess, max = 40): () => string {
  const lineas: string[] = [];
  const guardar = (chunk: Buffer) => {
    lineas.push(...chunk.toString().split(/\r?\n/).filter(Boolean));
    lineas.splice(0, Math.max(0, lineas.length - max));
  };
  hijo.stdout?.on('data', guardar);
  hijo.stderr?.on('data', guardar);
  return () => lineas.join('\n');
}

const funciona = (java: string) => spawnSync(java, ['-version'], { stdio: 'ignore' }).status === 0;

// Carpeta bin de un Java que funcione: "" si ya está en el PATH, null si no hay.
function buscarJava(): string | null {
  if (funciona('java')) return '';
  const carpetas: string[] = [];
  if (process.env.JAVA_HOME) carpetas.push(join(process.env.JAVA_HOME, 'bin'));
  const programas = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((p): p is string => !!p);
  for (const base of programas.flatMap((p) => ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'Amazon Corretto'].map((v) => join(p, v)))) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base).sort().reverse()) carpetas.push(join(base, d, 'bin'));
  }
  return carpetas.find((bin) => funciona(join(bin, esWindows ? 'java.exe' : 'java'))) ?? null;
}

function buscarNavegador(): string | null {
  const programas = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter((p): p is string => !!p);
  const candidatos = [
    process.env.QA_NAVEGADOR,
    ...programas.flatMap((p) => [join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  return candidatos.find((c): c is string => !!c && existsSync(c)) ?? null;
}

function puertoAbierto(puerto: number): Promise<boolean> {
  return new Promise((ok) => {
    const s = connect({ host: '127.0.0.1', port: puerto });
    s.once('connect', () => {
      s.destroy();
      ok(true);
    });
    s.once('error', () => ok(false));
  });
}

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function esperarPuertos(puertos: readonly number[], limiteMs: number): Promise<boolean> {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if ((await Promise.all(puertos.map(puertoAbierto))).every(Boolean)) return true;
    await pausa(1000);
  }
  return false;
}

function terminado(hijo: ChildProcess): Promise<number> {
  return new Promise((ok) => hijo.on('exit', (codigo) => ok(codigo ?? 1)));
}

async function construirWeb(): Promise<void> {
  rmSync(DIR_WEB, { recursive: true, force: true });
  const build = lanzar('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', '.qa/web', '--clear'], {
    ...process.env,
    DUEL_QA: '1',
    CI: '1',
  });
  const log = ultimasLineas(build);
  if ((await terminado(build)) !== 0) throw new Error(`No se pudo armar la versión web:\n${log()}`);
}

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function servir(dir: string, puerto: number): Promise<Server> {
  const servidor = createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url ?? '/', BASE).pathname);
    let archivo = resolve(join(dir, ruta));
    if (!archivo.startsWith(dir + sep) && archivo !== dir) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(archivo) || statSync(archivo).isDirectory()) {
      const html = `${archivo}.html`;
      archivo = existsSync(html) ? html : join(dir, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(archivo).pipe(res);
  });
  return new Promise((ok, mal) => {
    servidor.once('error', mal);
    servidor.listen(puerto, '127.0.0.1', () => ok(servidor));
  });
}

function pesoJS(dir: string): number | null {
  const js = join(dir, '_expo', 'static', 'js');
  if (!existsSync(js)) return null;
  let bytes = 0;
  const recorrer = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (p.endsWith('.js')) bytes += statSync(p).size;
    }
  };
  recorrer(js);
  return bytes / 1024;
}

// ---------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------

interface Eventos {
  errores: string[];
  red: string[];
  dialogos: string[];
}

const vista = (d: Dispositivo) => ({ width: d.ancho, height: d.alto, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

const principal = DISPOSITIVOS.find((d) => d.id === PRINCIPAL)!;

async function esperarListo(page: Page, limiteMs: number): Promise<boolean> {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (await page.evaluate('window.__qa ? window.__qa.listo() : false').catch(() => false)) return true;
    await pausa(120);
  }
  return false;
}

async function nuevaPagina(browser: Browser, sector: Sector): Promise<{ page: Page; eventos: Eventos; cerrar: () => Promise<void> }> {
  const contexto = await browser.createBrowserContext();
  const page = await contexto.newPage();
  const eventos: Eventos = { errores: [], red: [], dialogos: [] };
  await page.evaluateOnNewDocument(SCRIPT_NAVEGADOR);
  // El login arranca con el perfil elegido, como en un teléfono que ya entró antes.
  if (sector !== 'sin-sesion') await page.evaluateOnNewDocument(`try { localStorage.setItem('duel.ultimoPerfil', ${JSON.stringify(sector)}); } catch (e) {}`);
  page.on('console', (m) => {
    if (m.type() === 'error') eventos.errores.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => eventos.errores.push(`La pantalla se rompió: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300)));
  page.on('requestfailed', (r) => {
    const motivo = r.failure()?.errorText ?? '';
    if (!motivo.includes('ERR_ABORTED')) eventos.red.push(`${motivo} ${r.url().slice(0, 120)}`);
  });
  page.on('dialog', (d) => {
    eventos.dialogos.push(d.message().split('\n')[0].slice(0, 120));
    void d.dismiss().catch(() => undefined);
  });
  await page.setViewport(vista(principal));
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  return { page, eventos, cerrar: () => contexto.close() };
}

async function entrar(page: Page, role: Role): Promise<void> {
  const cuenta = CUENTAS_QA.find((c) => c.role === role);
  if (!cuenta) throw new Error(`No hay cuenta de prueba para ${role}`);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await esperarListo(page, 20_000);
  await page.type('input[aria-label="Email"]', cuenta.email);
  await page.type('input[aria-label="Contraseña"]', CLAVE_QA);
  await page.click(`[aria-label="Entrar como ${ROLE_LABEL[role]}"]`);
  const destino = role === 'jugador' ? '/duelo' : '/hoy';
  await page.waitForFunction((d: string) => location.pathname === d, { timeout: 20_000 }, destino).catch(() => {
    throw new Error(`${cuenta.email} no pudo entrar (quedó en ${page.url()})`);
  });
  await esperarListo(page, 20_000);
}

// ---------------------------------------------------------------------------
// Prueba de una pantalla
// ---------------------------------------------------------------------------

class Problemas {
  private readonly lista = new Map<string, Problema>();

  sumar(nivel: Nivel, tipo: string, detalle: string, donde: string): void {
    const clave = `${tipo}|${detalle}`;
    const p = this.lista.get(clave);
    if (!p) this.lista.set(clave, { nivel, tipo, detalle, donde: [donde] });
    else if (!p.donde.includes(donde)) p.donde.push(donde);
  }

  todos(): Problema[] {
    return [...this.lista.values()];
  }
}

function rutaDe(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

async function medirVelocidad(page: Page, url: string, problemas: Problemas): Promise<Velocidad> {
  await page.setViewport(vista(principal));
  await page.emulateCPUThrottling(4);
  const inicio = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const cargo = await esperarListo(page, 25_000);
  // listo() espera 350 ms sin cambios: ese margen no es parte de la carga.
  const cargaMs = Math.max(0, Date.now() - inicio - 350);
  if (!cargo) problemas.sumar('error', 'No termina de cargar', 'Sigue con el indicador de carga o cambiando después de 25 s', 'carga');
  const pedida = new URL(url).pathname;
  const final = new URL(page.url()).pathname;
  if (final !== pedida) problemas.sumar('error', 'Lleva a otra pantalla', `Se abrió ${pedida} y terminó en ${final}`, 'carga');
  const m = (await page.evaluate('window.__qa.metricas()')) as Omit<Velocidad, 'cargaMs' | 'scroll'>;
  const scroll = (await page.evaluate('window.__qa.desplazar()')) as Desplazamiento | null;
  await page.emulateCPUThrottling(1);

  if (cargaMs > UMBRALES.cargaMs) problemas.sumar('aviso', 'Carga lenta', `Tarda ${(cargaMs / 1000).toFixed(1)} s en un celular de gama media`, 'carga');
  if (m.bloqueoMs > UMBRALES.bloqueoMs) problemas.sumar('aviso', 'Se traba al cargar', `${m.bloqueoMs} ms sin poder responder a un toque`, 'carga');
  if (m.saltos > UMBRALES.saltos) problemas.sumar('aviso', 'Saltos de diseño', `Lo que ya estaba en pantalla se mueve mientras carga (${m.saltos})`, 'carga');
  if (scroll && scroll.pctLentos > UMBRALES.pctLentos) {
    problemas.sumar('aviso', 'Scroll trabado', `${scroll.pctLentos}% de cuadros lentos (el peor, ${scroll.peorMs} ms)`, 'carga');
  }
  return { ...m, cargaMs, scroll };
}

async function medirDiseno(page: Page, sector: Sector, pantalla: Pantalla, dispositivos: readonly Dispositivo[], problemas: Problemas): Promise<Captura[]> {
  const capturas: Captura[] = [];
  const carpeta = join(DIR_REPORTE, 'capturas', sector, pantalla.id);
  mkdirSync(carpeta, { recursive: true });

  const sacar = async (d: Dispositivo, modo: 'dia' | 'noche') => {
    await page.setViewport(vista(d));
    await pausa(200);
    await esperarListo(page, 6000);
    const r = (await page.evaluate('window.__qa.medir()')) as { problemas: { nivel: Nivel; tipo: string; detalle: string }[] };
    for (const p of r.problemas) problemas.sumar(p.nivel, p.tipo, p.detalle, modo === 'noche' ? 'noche' : d.id);
    const archivo = `capturas/${sector}/${pantalla.id}/${d.id}${modo === 'noche' ? '-noche' : ''}.jpg`;
    await page.screenshot({ path: join(DIR_REPORTE, archivo), type: 'jpeg', quality: 72 });
    capturas.push({ titulo: `${d.nombre} · ${d.ancho}×${d.alto}${modo === 'noche' ? ' · noche' : ''}`, archivo });
  };

  for (const d of dispositivos) await sacar(d, 'dia');

  // Captura de punta a punta: la ventana se estira hasta que la lista principal entra entera.
  await page.setViewport(vista(principal));
  await pausa(200);
  await esperarListo(page, 6000);
  const alto = (await page.evaluate('window.__qa.altoCompleto()')) as number | null;
  if (alto && alto > principal.alto + 20) {
    await page.setViewport({ ...vista(principal), height: Math.min(alto, 8000) });
    await pausa(300);
    await esperarListo(page, 6000);
    const archivo = `capturas/${sector}/${pantalla.id}/${principal.id}-completa.jpg`;
    await page.screenshot({ path: join(DIR_REPORTE, archivo), type: 'jpeg', quality: 72 });
    capturas.unshift({ titulo: `Completa · ${principal.nombre}`, archivo, completa: true });
    await page.setViewport(vista(principal));
  }

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await sacar(principal, 'noche');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  return capturas;
}

interface BotonEnPantalla {
  nombre: string;
  indice: number;
  apagado: boolean;
  enlace: boolean;
  /** Pestaña o link a la pantalla en la que ya está: tocarlo no tiene por qué cambiar nada. */
  actual: boolean;
  /** Chip o opción ya elegida: si tocarla no cambia nada, está bien. */
  elegido: boolean;
}

interface Efecto {
  cambio: boolean;
  ms: number | null;
  url: string;
  externo: string | null;
}

// TouchableOpacity tarda unos 250 ms en volver a su opacidad después del toque: antes de eso
// la captura cambia aunque el botón no haga nada.
const ESPERA_CAPTURA_MS = 350;

const capturar = (page: Page) => page.screenshot({ type: 'jpeg', quality: 60 }) as Promise<Uint8Array>;

const igual = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

async function probarBotones(page: Page, url: string, eventos: Eventos, yaProbados: Set<string>, problemas: Problemas): Promise<PruebaBoton[]> {
  await page.setViewport(vista(principal));
  const abrir = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await esperarListo(page, 15_000);
  };
  await abrir();
  const lista = (await page.evaluate('window.__qa.botones()')) as BotonEnPantalla[];
  const resultados: PruebaBoton[] = [];

  for (const b of lista) {
    if (b.enlace && yaProbados.has(b.nombre)) continue;
    if (b.actual) {
      resultados.push({ nombre: b.nombre, estado: 'omitido', ms: null, detalle: 'Ya está en esta pantalla' });
      continue;
    }
    if (b.apagado) {
      resultados.push({ nombre: b.nombre, estado: 'apagado', ms: null });
      continue;
    }
    if (NO_TOCAR.test(b.nombre)) {
      resultados.push({ nombre: b.nombre, estado: 'omitido', ms: null, detalle: 'Cerraría la sesión' });
      continue;
    }
    const llamada = `window.__qa.preparar(${JSON.stringify(b.nombre)}, ${b.indice})`;
    let punto = (await page.evaluate(llamada).catch(() => null)) as { x: number; y: number; url: string } | null;
    if (!punto) {
      await abrir();
      punto = (await page.evaluate(llamada).catch(() => null)) as typeof punto;
    }
    if (!punto) {
      resultados.push({ nombre: b.nombre, estado: 'no-encontrado', ms: null, detalle: 'Desapareció después de tocar otro botón' });
      continue;
    }

    const errores = eventos.errores.length;
    const dialogos = eventos.dialogos.length;
    // El mouse se apoya antes de la captura: el resaltado por pasar por encima no cuenta como respuesta.
    await page.mouse.move(punto.x, punto.y);
    await pausa(60);
    const fotoAntes = await capturar(page);
    await page.mouse.click(punto.x, punto.y);
    // Si el toque recarga la página, el contexto se pierde: eso ya es un efecto.
    const esperando = page.evaluate('window.__qa.esperarEfecto(1500)').catch(() => null) as Promise<Efecto | null>;
    await pausa(ESPERA_CAPTURA_MS);
    // Color, scroll o reloj que cambian sin tocar el texto: la captura los ve.
    const visualRapido = !igual(fotoAntes, await capturar(page).catch(() => fotoAntes));
    const efecto = (await esperando) ?? { cambio: true, ms: null, url: page.url(), externo: null };
    await pausa(120);

    const nuevos = eventos.errores.slice(errores);
    const dialogo = eventos.dialogos.length > dialogos ? eventos.dialogos[eventos.dialogos.length - 1] : null;
    const navego = rutaDe(page.url()) !== rutaDe(punto.url);
    const visualTarde = !visualRapido && !efecto.cambio && !dialogo && !navego && !igual(fotoAntes, await capturar(page).catch(() => fotoAntes));
    const respondio = efecto.cambio || visualRapido || visualTarde || !!dialogo || navego || !!efecto.externo;
    let estado: PruebaBoton['estado'] = nuevos.length ? 'error' : respondio ? 'ok' : b.elegido ? 'omitido' : 'sin-efecto';
    // Una confirmación aparece al instante; si la pantalla cambió antes de la captura, respondió a tiempo.
    const aprox = !dialogo && visualRapido && (efecto.ms === null || efecto.ms > ESPERA_CAPTURA_MS);
    const ms = dialogo ? null : aprox ? ESPERA_CAPTURA_MS : efecto.ms;
    if (estado === 'ok' && !navego && !aprox && ms !== null && ms > UMBRALES.botonMs) estado = 'lento';
    const detalle =
      nuevos[0] ??
      (navego
        ? `Abre ${rutaDe(page.url())}`
        : dialogo
          ? `Pregunta: "${dialogo}"`
          : (efecto.externo ?? (visualTarde ? 'Cambia algo en pantalla después de 1,5 s' : estado === 'omitido' ? 'Ya estaba elegido' : undefined)));
    resultados.push({ nombre: b.nombre, estado, ms, aprox, detalle });
    if (b.enlace) yaProbados.add(b.nombre);

    if (estado === 'error') problemas.sumar('error', 'Botón que falla', `"${b.nombre}": ${nuevos[0]}`, 'botones');
    if (estado === 'sin-efecto') problemas.sumar('aviso', 'Botón sin efecto', `"${b.nombre}" no cambia nada en pantalla`, 'botones');
    if (estado === 'lento') problemas.sumar('aviso', 'Botón lento', `"${b.nombre}" tarda ${ms} ms en responder`, 'botones');

    const modal = (await page.evaluate(`document.querySelectorAll('[aria-modal="true"]').length > 0`).catch(() => true)) as boolean;
    if (navego || modal) await abrir();
  }
  return resultados;
}

async function probarPantalla(
  page: Page,
  eventos: Eventos,
  sector: Sector,
  pantalla: Pantalla,
  opciones: Opciones,
  yaProbados: Set<string>
): Promise<ResultadoPantalla> {
  const problemas = new Problemas();
  eventos.errores.length = 0;
  eventos.red.length = 0;
  const url = BASE + pantalla.ruta;

  const velocidad = await medirVelocidad(page, url, problemas);
  const capturas = await medirDiseno(page, sector, pantalla, opciones.dispositivos, problemas);
  for (const e of eventos.errores) problemas.sumar('error', 'Error en la consola', e, 'carga');
  for (const r of eventos.red) problemas.sumar('aviso', 'Pedido de red fallido', r, 'carga');

  let botones: PruebaBoton[] | null = null;
  if (opciones.botones) {
    const antes = eventos.errores.length;
    botones = await probarBotones(page, url, eventos, yaProbados, problemas);
    for (const e of eventos.errores.slice(antes)) problemas.sumar('error', 'Error en la consola', e, 'botones');
  }
  return { sector, pantalla, velocidad, problemas: problemas.todos(), capturas, botones };
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

function linea(r: ResultadoPantalla): string {
  const errores = r.problemas.filter((p) => p.nivel === 'error').length;
  const avisos = r.problemas.length - errores;
  const probados = r.botones?.filter((b) => !['apagado', 'omitido', 'no-encontrado'].includes(b.estado)) ?? [];
  const malos = probados.filter((b) => b.estado !== 'ok').length;
  const carga = r.velocidad ? `${(r.velocidad.cargaMs / 1000).toFixed(1)} s` : '—';
  const botones = r.botones ? ` · botones ${probados.length - malos}/${probados.length}` : '';
  return `  ${errores ? '✗' : '✓'} ${`${NOMBRE_SECTOR[r.sector]} · ${r.pantalla.nombre}`.padEnd(30, ' ')} ${carga.padStart(6)} · ${errores} errores · ${avisos} avisos${botones}`;
}

async function main(): Promise<void> {
  const opciones = leerOpciones(process.argv.slice(2));
  const inicio = new Date();

  const navegadorExe = buscarNavegador();
  if (!navegadorExe) {
    console.error('No encontré Edge ni Chrome. Instalá uno o pasá su ruta en QA_NAVEGADOR.');
    process.exit(1);
  }
  const binJava = buscarJava();
  if (binJava === null) {
    console.error('Los emuladores de Firebase necesitan Java 21 o superior. En Windows:');
    console.error('  winget install --id EclipseAdoptium.Temurin.21.JRE -e');
    process.exit(1);
  }
  const puertos = [...Object.values(PUERTOS_QA), PUERTO_WEB_QA];
  if ((await Promise.all(puertos.map(puertoAbierto))).some(Boolean)) {
    console.error(`Hay algo usando los puertos ${puertos.join(', ')}: ¿quedó otro "pnpm qa:ui" abierto?`);
    process.exit(1);
  }

  let cerrando = false;
  const cerrarTodo = () => {
    cerrando = true;
    hijos.forEach(terminar);
  };
  process.on('SIGINT', () => {
    cerrarTodo();
    process.exit(130);
  });

  console.log('Levantando los emuladores de Firebase…');
  const emuladores = lanzar(
    'pnpm',
    ['dlx', 'firebase-tools@15', 'emulators:start', '--config', 'firebase.qa.json', '--only', 'auth,firestore,storage', '--project', PROYECTO_QA],
    binJava ? { ...process.env, PATH: `${binJava}${delimiter}${process.env.PATH ?? ''}` } : process.env
  );
  const logEmuladores = ultimasLineas(emuladores);
  emuladores.on('exit', (codigo) => {
    if (cerrando) return;
    console.error(`\nLos emuladores se cerraron (código ${codigo}):\n${logEmuladores()}`);
    cerrarTodo();
    process.exit(1);
  });

  let servidor: Server | null = null;
  let browser: Browser | null = null;
  try {
    const build = opciones.build || !existsSync(join(DIR_WEB, 'index.html'));
    if (build) console.log('Armando la versión web de prueba (un par de minutos)…');
    const [, listos] = await Promise.all([build ? construirWeb() : Promise.resolve(), esperarPuertos(Object.values(PUERTOS_QA), 180_000)]);
    if (!listos) throw new Error(`Los emuladores no arrancaron a tiempo:\n${logEmuladores()}`);

    servidor = await servir(DIR_WEB, PUERTO_WEB_QA);
    rmSync(DIR_REPORTE, { recursive: true, force: true });
    mkdirSync(DIR_REPORTE, { recursive: true });
    browser = await puppeteer.launch({
      executablePath: navegadorExe,
      headless: true,
      args: ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-extensions', '--no-first-run', '--lang=es-AR'],
    });

    const resultados: ResultadoPantalla[] = [];
    for (const sector of opciones.sectores) {
      const pantallas = PANTALLAS[sector].filter((p) => !opciones.pantallas || opciones.pantallas.includes(p.id));
      if (pantallas.length === 0) continue;
      // Cada sector arranca con los mismos datos: los botones que tocó el anterior no cuentan.
      await sembrarQA();
      console.log(`\n${NOMBRE_SECTOR[sector]}`);
      const { page, eventos, cerrar } = await nuevaPagina(browser, sector);
      try {
        if (sector !== 'sin-sesion') await entrar(page, sector);
        const yaProbados = new Set<string>();
        for (const pantalla of pantallas) {
          const r = await probarPantalla(page, eventos, sector, pantalla, opciones, yaProbados);
          resultados.push(r);
          console.log(linea(r));
        }
      } finally {
        await cerrar();
      }
    }

    const archivo = escribirReporte(DIR_REPORTE, {
      inicio,
      duracionMs: Date.now() - inicio.getTime(),
      dispositivos: opciones.dispositivos,
      resultados,
      bundleKB: pesoJS(DIR_WEB),
    });
    const t = contar(resultados);
    console.log(`\n${t.pantallas} pantallas · ${t.errores} errores · ${t.avisos} avisos · ${t.botones} botones tocados (${t.botonesMal} con problemas)`);
    console.log(`Reporte: ${archivo}`);
    if (opciones.abrir) {
      if (esWindows) spawn('cmd', ['/c', 'start', '""', archivo], { detached: true, stdio: 'ignore' }).unref();
      else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [archivo], { detached: true, stdio: 'ignore' }).unref();
    }
    process.exitCode = t.errores > 0 ? 1 : 0;
  } finally {
    await browser?.close().catch(() => undefined);
    servidor?.close();
    cerrarTodo();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  hijos.forEach(terminar);
  process.exit(1);
});
