// `pnpm demo`: levanta los emuladores de Firebase en esta PC, carga los datos de prueba
// y arranca Expo con la app apuntando a ellos. El celular tiene que estar en la misma red Wi-Fi.
// Todo queda en la PC: no se toca el proyecto de Firebase del .env. Ctrl+C corta todo.
// Argumentos extra van a `expo start` (por ejemplo `pnpm demo --web`).

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { CLAVE_DEMO, CUENTAS_DEMO, PROYECTO_DEMO, PUERTOS_DEMO } from '../../lib/demo';
import { CODIGO_DEMO, sembrarDemo } from './datos';

const RAIZ = resolve(__dirname, '..', '..');
const esWindows = process.platform === 'win32';
const hijos: ChildProcess[] = [];
let cerrando = false;

// Placas virtuales (WSL, Hyper-V, VPN, Docker) tienen IPs que el celular no alcanza.
const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|docker|loopback|tailscale|zerotier|vpn/i;

function ipLocal(): string {
  if (process.env.DEMO_HOST) return process.env.DEMO_HOST;
  const candidatas = Object.entries(networkInterfaces())
    .filter(([nombre]) => !VIRTUAL.test(nombre))
    .flatMap(([, direcciones]) => direcciones ?? [])
    .filter((d) => d.family === 'IPv4' && !d.internal)
    .map((d) => d.address);
  const privada = (ip: string) => /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const ip = candidatas.find(privada) ?? candidatas[0];
  if (!ip) throw new Error('No encontré la IP de esta PC en la red. Conectate al Wi-Fi o pasá DEMO_HOST=<ip>.');
  return ip;
}

const funciona = (java: string) => spawnSync(java, ['-version'], { stdio: 'ignore' }).status === 0;

// Carpeta bin de un Java que funcione: "" si ya está en el PATH, null si no hay.
// Se buscan las instalaciones habituales porque la terminal de VS Code no ve el PATH nuevo
// hasta reiniciarlo, y así `pnpm demo` anda apenas se instala Java.
function buscarJava(): string | null {
  if (funciona('java')) return '';
  const carpetas: string[] = [];
  if (process.env.JAVA_HOME) carpetas.push(join(process.env.JAVA_HOME, 'bin'));
  const programas = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((p): p is string => !!p);
  for (const base of programas.flatMap((p) => ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'Amazon Corretto'].map((v) => join(p, v)))) {
    if (!existsSync(base)) continue;
    // La versión más nueva primero.
    for (const d of readdirSync(base).sort().reverse()) carpetas.push(join(base, d, 'bin'));
  }
  return carpetas.find((bin) => funciona(join(bin, esWindows ? 'java.exe' : 'java'))) ?? null;
}

// En Windows pnpm es un .cmd y necesita la consola: se arma la línea entera (los argumentos no llevan espacios).
function lanzar(comando: string, args: string[], opciones: Parameters<typeof spawn>[2]): ChildProcess {
  const base = { cwd: RAIZ, detached: !esWindows, ...opciones };
  const hijo = esWindows ? spawn([comando, ...args].join(' '), { ...base, shell: true }) : spawn(comando, args, base);
  hijos.push(hijo);
  return hijo;
}

function terminar(hijo: ChildProcess): void {
  if (hijo.pid === undefined || hijo.exitCode !== null) return;
  // En Windows el proceso es un cmd.exe: taskkill /T corta también Java y Node que cuelgan de él.
  if (esWindows) spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-hijo.pid, 'SIGTERM');
    } catch {}
  }
}

function cerrar(codigo: number): never {
  cerrando = true;
  hijos.forEach(terminar);
  process.exit(codigo);
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

async function esperarEmuladores(limiteMs: number): Promise<boolean> {
  const puertos = Object.values(PUERTOS_DEMO);
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    const abiertos = await Promise.all(puertos.map(puertoAbierto));
    if (abiertos.every(Boolean)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main(): Promise<void> {
  const binJava = buscarJava();
  if (binJava === null) {
    console.error('Los emuladores de Firebase necesitan Java 21 o superior. En Windows:');
    console.error('  winget install --id EclipseAdoptium.Temurin.21.JRE -e');
    console.error('O descargalo de https://adoptium.net/es/temurin/releases/ y volvé a correr pnpm demo.');
    process.exit(1);
  }
  const ip = ipLocal();
  const ocupados = (await Promise.all(Object.values(PUERTOS_DEMO).map(puertoAbierto))).some(Boolean);
  if (ocupados) {
    console.error(`Hay algo usando los puertos ${Object.values(PUERTOS_DEMO).join(', ')}: ¿quedó otro "pnpm demo" abierto?`);
    process.exit(1);
  }

  console.log('Levantando los emuladores de Firebase…');
  const ultimas: string[] = [];
  const emuladores = lanzar(
    'pnpm',
    ['dlx', 'firebase-tools@15', 'emulators:start', '--config', 'firebase.demo.json', '--only', 'auth,firestore,storage', '--project', PROYECTO_DEMO],
    { stdio: ['ignore', 'pipe', 'pipe'], env: binJava ? { ...process.env, PATH: `${binJava}${delimiter}${process.env.PATH ?? ''}` } : process.env }
  );
  const guardar = (chunk: Buffer) => {
    ultimas.push(...chunk.toString().split(/\r?\n/).filter(Boolean));
    ultimas.splice(0, Math.max(0, ultimas.length - 40));
  };
  emuladores.stdout?.on('data', guardar);
  emuladores.stderr?.on('data', guardar);
  emuladores.on('exit', (codigo) => {
    if (cerrando) return;
    console.error(`\nLos emuladores se cerraron (código ${codigo}). Últimas líneas:\n${ultimas.join('\n')}`);
    cerrar(1);
  });

  if (!(await esperarEmuladores(180_000))) {
    console.error(`Los emuladores no arrancaron a tiempo. Últimas líneas:\n${ultimas.join('\n')}`);
    cerrar(1);
  }

  const docs = await sembrarDemo();
  const ancho = Math.max(...CUENTAS_DEMO.map((c) => c.email.length));
  console.log(`\nModo demo listo: ${docs} documentos de prueba en los emuladores.`);
  console.log(`\nCuentas (contraseña para todas: ${CLAVE_DEMO})`);
  for (const c of CUENTAS_DEMO) {
    const nota = c.role === 'admin' ? 'tocá "Entrar con cuenta de administración"' : `elegí el perfil ${c.role}`;
    console.log(`  ${c.email.padEnd(ancho)}  ${c.nombre} · ${nota}`);
  }
  console.log(`\nCódigo de invitación para registrar mozos o jueces: ${CODIGO_DEMO}`);
  console.log(`El celular tiene que estar en el mismo Wi-Fi que esta PC (${ip}).\n`);

  const expo = lanzar('pnpm', ['exec', 'expo', 'start', '--clear', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_DEMO_HOST: ip, REACT_NATIVE_PACKAGER_HOSTNAME: ip },
  });
  expo.on('exit', (codigo) => cerrar(codigo ?? 0));
}

process.on('SIGINT', () => cerrar(0));
process.on('SIGTERM', () => cerrar(0));
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  cerrar(1);
});
