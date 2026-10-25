// `pnpm desplegar`: sube reglas e índices al proyecto de Firebase del .env (el mismo que usa la app).
// Sin argumentos despliega reglas, índices y Storage; `pnpm desplegar firestore:rules` despliega solo eso.
// `pnpm desplegar hosting` arma la versión web (dist/) y la publica en <proyecto>.web.app.
// Antes, una vez: `pnpm firebase login`.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');

function proyectoDelEnv(): string {
  let texto: string;
  try {
    texto = readFileSync(resolve(RAIZ, '.env'), 'utf8');
  } catch {
    throw new Error('No encontré el .env en la raíz del proyecto.');
  }
  const linea = texto.split(/\r?\n/).find((l) => l.startsWith('EXPO_PUBLIC_FIREBASE_PROJECT_ID='));
  const id = linea?.slice(linea.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  if (!id) throw new Error('Falta EXPO_PUBLIC_FIREBASE_PROJECT_ID en el .env.');
  return id;
}

// En Windows pnpm es un .cmd y necesita la consola (los argumentos no llevan espacios).
function pnpm(args: string[], env: NodeJS.ProcessEnv = process.env): number {
  const r =
    process.platform === 'win32'
      ? spawnSync(['pnpm', ...args].join(' '), { cwd: RAIZ, stdio: 'inherit', shell: true, env })
      : spawnSync('pnpm', args, { cwd: RAIZ, stdio: 'inherit', env });
  return r.status ?? 1;
}

try {
  const solo = process.argv.slice(2).join(',') || 'firestore:rules,firestore:indexes,storage';
  const proyecto = proyectoDelEnv();
  if (solo.split(',').includes('hosting')) {
    // La página de baja (Google Play) no puede salir sin un email al que escribir.
    if (readFileSync(resolve(RAIZ, 'public', 'baja.html'), 'utf8').includes('CONTACTO_DUEL')) {
      throw new Error('Falta el email de contacto en public/baja.html: reemplazá CONTACTO_DUEL (aparece dos veces).');
    }
    console.log('Armando la versión web en dist/…');
    const build = pnpm(['exec', 'expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'], { ...process.env, CI: '1' });
    if (build !== 0) process.exit(build);
  }
  process.exit(pnpm(['dlx', 'firebase-tools@15', 'deploy', '--only', solo, '--project', proyecto]));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
