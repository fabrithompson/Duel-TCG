// `pnpm desplegar`: sube reglas e índices al proyecto de Firebase del .env (el mismo que usa la app).
// Sin argumentos despliega todo; `pnpm desplegar firestore:rules` despliega solo eso.
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

try {
  const solo = process.argv.slice(2).join(',') || 'firestore:rules,firestore:indexes,storage';
  const args = ['dlx', 'firebase-tools@15', 'deploy', '--only', solo, '--project', proyectoDelEnv()];
  // En Windows pnpm es un .cmd y necesita la consola (los argumentos no llevan espacios).
  const r =
    process.platform === 'win32'
      ? spawnSync(['pnpm', ...args].join(' '), { cwd: RAIZ, stdio: 'inherit', shell: true })
      : spawnSync('pnpm', args, { cwd: RAIZ, stdio: 'inherit' });
  process.exit(r.status ?? 1);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
