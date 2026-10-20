import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DISPOSITIVOS, NOMBRE_SECTOR, type Dispositivo, type Pantalla, type Sector } from './pantallas';

export type Nivel = 'error' | 'aviso';

export interface Problema {
  nivel: Nivel;
  tipo: string;
  detalle: string;
  /** Dónde apareció: id de dispositivo, "noche", "carga" o "botones". */
  donde: string[];
}

export interface Desplazamiento {
  distancia: number;
  fps: number | null;
  pctLentos: number;
  peorMs: number;
}

export interface Velocidad {
  cargaMs: number;
  bloqueoMs: number;
  tareasLargas: number;
  saltos: number;
  nodos: number;
  memoriaMB: number | null;
  scroll: Desplazamiento | null;
}

export type EstadoBoton = 'ok' | 'sin-efecto' | 'error' | 'lento' | 'apagado' | 'omitido' | 'no-encontrado';

export interface PruebaBoton {
  nombre: string;
  estado: EstadoBoton;
  ms: number | null;
  /** La captura cambió antes de `ms`: respondió en ese tiempo o menos. */
  aprox?: boolean;
  detalle?: string;
}

export interface Captura {
  titulo: string;
  archivo: string;
  /** Toda la pantalla de punta a punta, no solo lo que entra en el celular. */
  completa?: boolean;
}

export interface ResultadoPantalla {
  sector: Sector;
  pantalla: Pantalla;
  velocidad: Velocidad | null;
  problemas: Problema[];
  capturas: Captura[];
  botones: PruebaBoton[] | null;
}

export interface Corrida {
  inicio: Date;
  duracionMs: number;
  dispositivos: readonly Dispositivo[];
  resultados: ResultadoPantalla[];
  bundleKB: number | null;
}

export const UMBRALES = {
  cargaMs: 4000,
  bloqueoMs: 600,
  saltos: 0.1,
  pctLentos: 10,
  botonMs: 500,
};

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const seg = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

const nombreDonde = (id: string) => DISPOSITIVOS.find((d) => d.id === id)?.nombre ?? id;

export function contar(resultados: readonly ResultadoPantalla[]) {
  const problemas = resultados.flatMap((r) => r.problemas);
  const botones = resultados.flatMap((r) => r.botones ?? []);
  return {
    pantallas: resultados.length,
    errores: problemas.filter((p) => p.nivel === 'error').length,
    avisos: problemas.filter((p) => p.nivel === 'aviso').length,
    botones: botones.filter((b) => !['apagado', 'omitido', 'no-encontrado'].includes(b.estado)).length,
    botonesMal: botones.filter((b) => b.estado === 'error' || b.estado === 'sin-efecto' || b.estado === 'lento').length,
  };
}

const ESTADO_BOTON: Record<EstadoBoton, string> = {
  ok: 'Responde',
  'sin-efecto': 'No hace nada visible',
  error: 'Tira un error',
  lento: 'Responde lento',
  apagado: 'Deshabilitado',
  omitido: 'No se toca',
  'no-encontrado': 'No se encontró',
};

function filaVelocidad(r: ResultadoPantalla): string {
  const v = r.velocidad;
  if (!v) return '';
  const marca = (malo: boolean) => (malo ? ' class="mal"' : '');
  const s = v.scroll;
  return `<tr>
    <td>${esc(NOMBRE_SECTOR[r.sector])}</td>
    <td><a href="#${r.sector}-${r.pantalla.id}">${esc(r.pantalla.nombre)}</a></td>
    <td${marca(v.cargaMs > UMBRALES.cargaMs)}>${seg(v.cargaMs)}</td>
    <td${marca(v.bloqueoMs > UMBRALES.bloqueoMs)}>${v.bloqueoMs} ms</td>
    <td${marca(!!s && s.pctLentos > UMBRALES.pctLentos)}>${s ? `${s.pctLentos}% lentos · peor ${s.peorMs} ms` : 'sin scroll'}</td>
    <td${marca(v.saltos > UMBRALES.saltos)}>${v.saltos}</td>
    <td>${v.nodos}</td>
    <td>${v.memoriaMB ?? '—'} MB</td>
  </tr>`;
}

function tarjeta(r: ResultadoPantalla): string {
  const errores = r.problemas.filter((p) => p.nivel === 'error');
  const avisos = r.problemas.filter((p) => p.nivel === 'aviso');
  const orden = [...errores, ...avisos];
  const problemas = orden.length
    ? `<ul class="problemas">${orden
        .map(
          (p) => `<li class="${p.nivel}"><span class="nivel">${p.nivel === 'error' ? 'Error' : 'Aviso'}</span>
          <div><strong>${esc(p.tipo)}</strong> · ${esc(p.detalle)}
          <div class="donde">${p.donde.map((d) => `<span>${esc(nombreDonde(d))}</span>`).join('')}</div></div></li>`
        )
        .join('')}</ul>`
    : '<p class="limpio">Sin problemas.</p>';

  const capturas = r.capturas
    .map(
      (c) =>
        `<figure${c.completa ? ' class="completa"' : ''}><a href="${esc(c.archivo)}" target="_blank"><img loading="lazy" src="${esc(c.archivo)}" alt="${esc(c.titulo)}"></a><figcaption>${esc(c.titulo)}</figcaption></figure>`
    )
    .join('');

  const probados = r.botones?.filter((b) => b.estado !== 'omitido') ?? [];
  const botones = r.botones
    ? `<details${probados.some((b) => b.estado === 'error' || b.estado === 'sin-efecto') ? ' open' : ''}><summary>Botones (${probados.length})</summary>
      <table class="botones"><thead><tr><th>Botón</th><th>Resultado</th><th>Respuesta</th><th>Detalle</th></tr></thead><tbody>
      ${r.botones
        .map(
          (b) => `<tr class="b-${b.estado}"><td>${esc(b.nombre)}</td><td>${ESTADO_BOTON[b.estado]}</td><td>${b.ms === null ? '—' : `${b.aprox ? '≤ ' : ''}${b.ms} ms`}</td><td>${esc(b.detalle ?? '')}</td></tr>`
        )
        .join('')}
      </tbody></table></details>`
    : '';

  return `<section class="tarjeta" id="${r.sector}-${r.pantalla.id}">
    <header><h3>${esc(r.pantalla.nombre)}</h3><code>${esc(r.pantalla.ruta)}</code>
      <span class="chip ${errores.length ? 'rojo' : 'verde'}">${errores.length} errores</span>
      <span class="chip ${avisos.length ? 'ambar' : 'verde'}">${avisos.length} avisos</span></header>
    ${problemas}
    <div class="capturas">${capturas}</div>
    ${botones}
  </section>`;
}

export function escribirReporte(dir: string, corrida: Corrida): string {
  const t = contar(corrida.resultados);
  const sectores = [...new Set(corrida.resultados.map((r) => r.sector))];
  const fecha = corrida.inicio.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Duel · QA de interfaz</title>
<style>
  :root { --bg:#FBF6EF; --sf:#FFFFFF; --ink:#241A13; --dim:#7A6352; --line:#E8DCCE; --rojo:#B3412C; --ambar:#9A6A1F; --verde:#4B7545; --br:#C2703A; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14100D; --sf:#1D1714; --ink:#F4ECE2; --dim:#A89584; --line:#332821; --rojo:#E07B66; --ambar:#D8A85A; --verde:#8FA97B; --br:#E08A4C; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:1200px; margin:0 auto; padding:24px 16px 64px; }
  h1 { font-size:26px; margin:0 0 4px; letter-spacing:-0.5px; }
  h2 { font-size:19px; margin:36px 0 12px; }
  h3 { font-size:16px; margin:0; }
  .sub { color:var(--dim); margin:0 0 20px; }
  .resumen { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
  .dato { background:var(--sf); border:1px solid var(--line); border-radius:14px; padding:12px 14px; }
  .dato b { display:block; font-size:24px; }
  .dato span { color:var(--dim); font-size:12px; }
  .dato.rojo b { color:var(--rojo); } .dato.ambar b { color:var(--ambar); } .dato.verde b { color:var(--verde); }
  nav { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 0; }
  nav a { color:var(--br); text-decoration:none; font-weight:600; border:1px solid var(--line); border-radius:999px; padding:4px 12px; background:var(--sf); }
  .tabla { overflow-x:auto; background:var(--sf); border:1px solid var(--line); border-radius:14px; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th { color:var(--dim); font-weight:600; font-size:12px; }
  td.mal { color:var(--rojo); font-weight:700; }
  td a { color:inherit; }
  .tarjeta { background:var(--sf); border:1px solid var(--line); border-radius:16px; padding:16px; margin:12px 0; }
  .tarjeta header { display:flex; flex-wrap:wrap; align-items:center; gap:8px 10px; margin-bottom:10px; }
  code { color:var(--dim); font-size:12px; }
  .chip { font-size:12px; font-weight:700; border-radius:999px; padding:1px 9px; border:1px solid currentColor; }
  .chip.rojo { color:var(--rojo); } .chip.ambar { color:var(--ambar); } .chip.verde { color:var(--verde); }
  .problemas { list-style:none; padding:0; margin:0 0 12px; display:grid; gap:6px; }
  .problemas li { display:flex; gap:10px; align-items:flex-start; }
  .nivel { flex:none; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-radius:6px; padding:1px 6px; color:#fff; margin-top:2px; }
  .error .nivel { background:var(--rojo); } .aviso .nivel { background:var(--ambar); }
  .donde { display:flex; flex-wrap:wrap; gap:4px; margin-top:3px; }
  .donde span { font-size:11px; color:var(--dim); border:1px solid var(--line); border-radius:6px; padding:0 6px; }
  .limpio { color:var(--verde); margin:0 0 12px; }
  .capturas { display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; }
  figure { margin:0; flex:none; }
  figure img { height:260px; width:auto; border:1px solid var(--line); border-radius:10px; display:block; background:#fff; }
  figcaption { font-size:11px; color:var(--dim); margin-top:3px; max-width:160px; }
  figure.completa a { display:block; width:150px; max-height:520px; overflow-y:auto; border:1px solid var(--line); border-radius:10px; }
  figure.completa img { width:100%; height:auto; border:0; border-radius:0; }
  details { margin-top:10px; }
  summary { cursor:pointer; font-weight:600; color:var(--br); }
  .botones td { white-space:normal; }
  .b-error td:nth-child(2) { color:var(--rojo); font-weight:700; }
  .b-sin-efecto td:nth-child(2), .b-lento td:nth-child(2) { color:var(--ambar); font-weight:700; }
  .b-apagado td, .b-omitido td, .b-no-encontrado td { color:var(--dim); }
  .leyenda { background:var(--sf); border:1px solid var(--line); border-radius:14px; padding:4px 18px; }
  .leyenda dt { font-weight:700; margin-top:10px; } .leyenda dd { margin:0 0 6px; color:var(--dim); }
</style>
</head>
<body>
<main>
  <h1>QA de interfaz</h1>
  <p class="sub">${esc(fecha)} · ${seg(corrida.duracionMs)} · ${corrida.dispositivos.length} tamaños de pantalla · día y noche${corrida.bundleKB ? ` · app web de ${Math.round(corrida.bundleKB)} KB de JavaScript` : ''}</p>
  <div class="resumen">
    <div class="dato"><b>${t.pantallas}</b><span>pantallas</span></div>
    <div class="dato ${t.errores ? 'rojo' : 'verde'}"><b>${t.errores}</b><span>errores</span></div>
    <div class="dato ${t.avisos ? 'ambar' : 'verde'}"><b>${t.avisos}</b><span>avisos</span></div>
    <div class="dato"><b>${t.botones}</b><span>botones tocados</span></div>
    <div class="dato ${t.botonesMal ? 'ambar' : 'verde'}"><b>${t.botonesMal}</b><span>botones que fallan, no hacen nada o tardan</span></div>
  </div>
  <nav>${sectores.map((s) => `<a href="#sector-${s}">${esc(NOMBRE_SECTOR[s])}</a>`).join('')}<a href="#velocidad">Velocidad</a><a href="#leyenda">Qué se mide</a></nav>

  ${sectores
    .map(
      (s) => `<h2 id="sector-${s}">${esc(NOMBRE_SECTOR[s])}</h2>${corrida.resultados
        .filter((r) => r.sector === s)
        .map(tarjeta)
        .join('')}`
    )
    .join('')}

  <h2 id="velocidad">Velocidad (procesador frenado 4 veces, como un celular de gama media)</h2>
  <div class="tabla"><table>
    <thead><tr><th>Sector</th><th>Pantalla</th><th>Carga</th><th>Bloqueo</th><th>Scroll</th><th>Saltos</th><th>Nodos</th><th>Memoria</th></tr></thead>
    <tbody>${corrida.resultados.map(filaVelocidad).join('')}</tbody>
  </table></div>

  <h2 id="leyenda">Qué se mide</h2>
  <dl class="leyenda">
    <dt>Tamaños de pantalla</dt><dd>${corrida.dispositivos.map((d) => `${esc(d.nombre)} (${d.ancho}×${d.alto})`).join(' · ')}. Modo noche y velocidad, en ${esc(nombreDonde('iphone'))}.</dd>
    <dt>Errores</dt><dd>La pantalla se rompe o escribe errores; un botón se sale de la pantalla, queda tapado, se pisa con otro o no se alcanza con scroll; la pantalla scrollea de costado; una imagen no carga; la ruta lleva a otra pantalla; un botón tira un error al tocarlo.</dd>
    <dt>Avisos</dt><dd>Botones de menos de 30 px a la vista (en el celular la app les suma área invisible hasta llegar a unos 44 px); botones sin nombre para el lector de pantalla; letra de menos de ${10} px; contraste menor a 4,5:1 (3:1 en títulos grandes); textos cortados con …; fuentes que no son las de Duel; carga de más de ${seg(UMBRALES.cargaMs)}; más de ${UMBRALES.bloqueoMs} ms de bloqueo; más de ${UMBRALES.pctLentos}% de cuadros lentos al scrollear; saltos de diseño mayores a ${UMBRALES.saltos}; botones que no hacen nada visible o tardan más de ${UMBRALES.botonMs} ms en responder.</dd>
    <dt>Velocidad</dt><dd>Carga: desde que se abre la pantalla hasta que deja de cambiar. Bloqueo: tiempo en que la app no podría responder a un toque. Scroll: se recorre la lista principal de punta a punta y se cuentan los cuadros de más de 25 ms. Saltos: cuánto se mueve lo que ya estaba en pantalla mientras carga.</dd>
    <dt>Botones</dt><dd>Se toca cada botón en ${esc(nombreDonde('iphone'))} y se mira si cambió algo en pantalla. Las confirmaciones se cancelan, así que nada se borra ni se cobra. "Cerrar sesión" no se toca. Los datos son de prueba y se vuelven a cargar en cada sector.</dd>
  </dl>
</main>
</body>
</html>`;
  const archivo = join(dir, 'index.html');
  writeFileSync(archivo, html, 'utf8');
  writeFileSync(join(dir, 'resultado.json'), JSON.stringify(corrida, null, 2), 'utf8');
  return archivo;
}
