// Corre dentro de la versión web de la app durante `pnpm qa:ui` y mide lo que ve el usuario.
// JavaScript plano a propósito: se inyecta en el navegador tal cual, sin pasar por TypeScript.
(() => {
  if (window.__qa) return;

  const SELECTOR = [
    '[role="button"]',
    '[role="link"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="slider"]',
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[tabindex="0"]',
  ].join(',');
  const CAMPOS = ['INPUT', 'TEXTAREA', 'SELECT'];
  const FUENTES_APP = /plusjakartasans|spacegrotesk|ionicons|material|fontawesome|feather|entypo|anticon/i;
  // En el celular la app suma 6 a 12 px invisibles alrededor de los botones chicos (hitSlop), que
  // la versión web no tiene: con 30 px a la vista el dedo ya llega a 44.
  const TOQUE_COMODO = 30;
  const TOQUE_MINIMO = 24;
  const LETRA_MINIMA = 10;

  const largas = [];
  let saltos = 0;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) largas.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) saltos += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}

  let ultimaMutacion = performance.now();
  new MutationObserver(() => {
    ultimaMutacion = performance.now();
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });

  const muestra = (t) => (t.length > 48 ? `${t.slice(0, 47)}…` : t);
  const limpio = (t) => (t || '').replace(/\s+/g, ' ').trim();

  const visible = (el) => {
    if (!el.isConnected || el.closest('[aria-hidden="true"]')) return false;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };

  const nombre = (el) => {
    const aria = limpio(el.getAttribute('aria-label'));
    if (aria) return aria;
    const ids = el.getAttribute('aria-labelledby');
    if (ids) {
      const t = limpio(ids.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? '').join(' '));
      if (t) return t;
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return limpio(el.placeholder || el.title);
    return limpio(el.innerText || el.title);
  };

  const deshabilitado = (el) => el.getAttribute('aria-disabled') === 'true' || el.disabled === true;

  const desborda = (v) => v === 'auto' || v === 'scroll' || v === 'overlay';

  /** El ancestro que scrollea en ese eje (null si el elemento no tiene cómo llegar a verse). */
  const scroller = (el, eje) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (eje === 'y' ? desborda(s.overflowY) && a.scrollHeight > a.clientHeight + 1 : desborda(s.overflowX) && a.scrollWidth > a.clientWidth + 1) return a;
    }
    return null;
  };

  /** Parte de la pantalla donde el elemento se puede ver, recortada por sus contenedores. */
  const ventana = (el) => {
    let x1 = 0;
    let y1 = 0;
    let x2 = innerWidth;
    let y2 = innerHeight;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const r = a.getBoundingClientRect();
      if (s.overflowX !== 'visible') {
        x1 = Math.max(x1, r.left);
        x2 = Math.min(x2, r.right);
      }
      if (s.overflowY !== 'visible') {
        y1 = Math.max(y1, r.top);
        y2 = Math.min(y2, r.bottom);
      }
    }
    return { x1, y1, x2, y2 };
  };

  /** Contenedor con overflow oculto (no scroll) que corta al elemento, hasta el primer scroll. */
  const contenedorQueCorta = (el, r) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (desborda(s.overflowX) || desborda(s.overflowY)) return null;
      const oculta = (v) => v === 'hidden' || v === 'clip';
      if (!oculta(s.overflowX) && !oculta(s.overflowY)) continue;
      const c = a.getBoundingClientRect();
      if (oculta(s.overflowX) && (r.right > c.right + 2 || r.left < c.left - 2)) return a;
      if (oculta(s.overflowY) && (r.bottom > c.bottom + 2 || r.top < c.top - 2)) return a;
    }
    return null;
  };

  const rgba = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const sobre = (arriba, abajo) => ({
    r: arriba.r * arriba.a + abajo.r * (1 - arriba.a),
    g: arriba.g * arriba.a + abajo.g * (1 - arriba.a),
    b: arriba.b * arriba.a + abajo.b * (1 - arriba.a),
    a: 1,
  });
  const fondo = (el) => {
    const capas = [];
    for (let a = el; a; a = a.parentElement) {
      const c = rgba(getComputedStyle(a).backgroundColor);
      if (c && c.a > 0) {
        capas.push(c);
        if (c.a >= 1) break;
      }
    }
    let res = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = capas.length - 1; i >= 0; i--) res = sobre(capas[i], res);
    return res;
  };
  const lineal = (v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const luz = (c) => 0.2126 * lineal(c.r) + 0.7152 * lineal(c.g) + 0.0722 * lineal(c.b);
  const contraste = (a, b) => {
    const x = luz(a);
    const y = luz(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const opacidad = (el) => {
    let o = 1;
    for (let a = el; a; a = a.parentElement) o *= Number(getComputedStyle(a).opacity);
    return o;
  };

  const textos = () => {
    const vistos = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (n.nodeValue.trim() && el && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) vistos.add(el);
    }
    return [...vistos].filter(visible);
  };

  const interactivos = () => [...document.querySelectorAll(SELECTOR)].filter(visible);

  const medir = () => {
    const problemas = new Map();
    const agregar = (nivel, tipo, detalle) => problemas.set(`${tipo}|${detalle}`, { nivel, tipo, detalle });
    const vw = innerWidth;
    const vh = innerHeight;

    const raiz = document.scrollingElement;
    if (raiz && raiz.scrollWidth > vw + 1) agregar('error', 'Scroll de costado', `La pantalla mide ${raiz.scrollWidth} px de ancho en ${vw} px`);

    const datos = interactivos().map((el) => {
      const r = el.getBoundingClientRect();
      const v = ventana(el);
      const vista = {
        left: Math.max(r.left, v.x1, 0),
        top: Math.max(r.top, v.y1, 0),
        right: Math.min(r.right, v.x2, vw),
        bottom: Math.min(r.bottom, v.y2, vh),
      };
      return { el, r, vista, n: nombre(el), apagado: deshabilitado(el) };
    });

    const chicos = [];
    const muyChicos = [];
    for (const d of datos) {
      const { el, r } = d;
      const etiqueta = d.n ? `"${muestra(d.n)}"` : `<${el.tagName.toLowerCase()}${el.getAttribute('role') ? ` role=${el.getAttribute('role')}` : ''}>`;
      if (!d.n) agregar('aviso', 'Botón sin nombre', `${etiqueta} en (${Math.round(r.left)}, ${Math.round(r.top)}): el lector de pantalla no lo anuncia`);
      const lado = Math.min(r.width, r.height);
      // El contenedor de un Stepper (role=slider) no se toca: se tocan sus botones − y +.
      if (!CAMPOS.includes(el.tagName) && el.getAttribute('role') !== 'slider' && !d.apagado && lado < TOQUE_COMODO) {
        (lado < TOQUE_MINIMO ? muyChicos : chicos).push(`${etiqueta} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      if ((r.right > vw + 1 || r.left < -1) && !scroller(el, 'x')) {
        agregar('error', 'Se sale de la pantalla', `${etiqueta} va de ${Math.round(r.left)} a ${Math.round(r.right)} px en ${vw} px`);
      }
      if (r.bottom > vh + 1 && !scroller(el, 'y')) {
        agregar('error', 'Fuera de alcance', `${etiqueta} queda abajo del borde (empieza en ${Math.round(r.top)} px de ${vh}) y no hay scroll`);
      }
      const ancho = d.vista.right - d.vista.left;
      const alto = d.vista.bottom - d.vista.top;
      if (ancho > 4 && alto > 4 && !d.apagado) {
        const arriba = document.elementFromPoint((d.vista.left + d.vista.right) / 2, (d.vista.top + d.vista.bottom) / 2);
        if (arriba && !el.contains(arriba) && !arriba.contains(el)) {
          const tapa = arriba.closest(SELECTOR);
          agregar('error', 'Botón tapado', `${etiqueta} queda debajo de ${tapa && nombre(tapa) ? `"${muestra(nombre(tapa))}"` : 'otro elemento'}`);
        }
      }
    }

    if (muyChicos.length) agregar('aviso', `Botones de menos de ${TOQUE_MINIMO} px`, muyChicos.join(' · '));
    if (chicos.length) agregar('aviso', `Botones de menos de ${TOQUE_COMODO} px`, chicos.join(' · '));

    const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

    for (let i = 0; i < datos.length; i++) {
      for (let j = i + 1; j < datos.length; j++) {
        const a = datos[i];
        const b = datos[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.vista.right, b.vista.right) - Math.max(a.vista.left, b.vista.left);
        const h = Math.min(a.vista.bottom, b.vista.bottom) - Math.max(a.vista.top, b.vista.top);
        if (w <= 2 || h <= 2) continue;
        const menor = Math.min((a.vista.right - a.vista.left) * (a.vista.bottom - a.vista.top), (b.vista.right - b.vista.left) * (b.vista.bottom - b.vista.top));
        if (w * h > menor * 0.2) agregar('error', 'Botones encimados', `"${muestra(a.n || '?')}" y "${muestra(b.n || '?')}" se pisan`);
      }
    }

    const letraChica = [];
    for (const el of textos()) {
      const s = getComputedStyle(el);
      const t = limpio(el.innerText);
      if (!t) continue;
      const tam = parseFloat(s.fontSize);
      if (tam < LETRA_MINIMA) letraChica.push(`"${muestra(t)}" ${tam}`);
      if (!FUENTES_APP.test(s.fontFamily)) agregar('aviso', 'Fuente del sistema', `"${muestra(t)}" usa ${s.fontFamily.split(',')[0]}`);

      if (opacidad(el) > 0.95 && !el.closest('[aria-disabled="true"]')) {
        const color = rgba(s.color);
        if (color) {
          const bg = fondo(el);
          const tinta = color.a < 1 ? sobre(color, bg) : color;
          const ratio = contraste(tinta, bg);
          const negrita = /(?<!semi)bold|black|_[789]00/i.test(s.fontFamily) || Number(s.fontWeight) >= 700;
          const minimo = tam >= 24 || (tam >= 18.66 && negrita) ? 3 : 4.5;
          if (ratio < minimo - 0.05) {
            agregar('aviso', 'Poco contraste', `"${muestra(t)}": ${ratio.toFixed(2)}:1, ${hex(tinta)} sobre ${hex(bg)} (mínimo ${minimo}:1)`);
          }
        }
      }

      const r = el.getBoundingClientRect();
      const elipsis = s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none');
      // Los títulos con letras juntas sobresalen un par de px de su caja sin que se corte nada:
      // cortado es cuando falta al menos media letra o media línea.
      const linea = parseFloat(s.lineHeight) || tam * 1.2;
      const cortado = el.scrollWidth - el.clientWidth > Math.max(2, tam * 0.3) || el.scrollHeight - el.clientHeight > linea * 0.5;
      if (elipsis && cortado) {
        agregar('aviso', 'Texto cortado', `"${muestra(t)}" no entra y termina en …`);
      } else if ((r.right > vw + 1 || r.left < -1) && !scroller(el, 'x')) {
        agregar('error', 'Texto fuera de pantalla', `"${muestra(t)}" se sale por el costado`);
      } else if (contenedorQueCorta(el, r)) {
        agregar('aviso', 'Texto recortado', `"${muestra(t)}" no entra en su caja`);
      }
    }

    if (letraChica.length) agregar('aviso', `Letra de menos de ${LETRA_MINIMA} px`, [...new Set(letraChica)].join(' · '));

    for (const campo of document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), textarea')) {
      if (visible(campo) && !FUENTES_APP.test(getComputedStyle(campo).fontFamily)) {
        agregar('aviso', 'Fuente del sistema', `Campo "${muestra(nombre(campo) || campo.type)}"`);
      }
    }

    for (const img of document.images) {
      if (img.complete && img.naturalWidth === 0 && img.src) agregar('error', 'Imagen rota', img.src.slice(0, 120));
    }

    return { problemas: [...problemas.values()], interactivos: datos.length };
  };

  const metricas = () => ({
    nodos: document.getElementsByTagName('*').length,
    memoriaMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    bloqueoMs: Math.round(largas.reduce((acc, d) => acc + Math.max(0, d - 50), 0)),
    tareasLargas: largas.length,
    saltos: Math.round(saltos * 1000) / 1000,
  });

  const listo = () => {
    if (!document.body) return false;
    const cargando = [...document.querySelectorAll('[role="progressbar"]')].some(visible);
    const fuentes = !document.fonts || document.fonts.status === 'loaded';
    const contenido = document.body.innerText.trim().length > 0 || !!document.querySelector('img');
    return !cargando && fuentes && contenido && performance.now() - ultimaMutacion > 350;
  };

  /** La lista que scrollea más grande de la pantalla (null si todo entra sin scroll). */
  const scrollPrincipal = (margen) => {
    const candidatos = [...document.querySelectorAll('*')].filter((a) => {
      const s = getComputedStyle(a);
      return desborda(s.overflowY) && a.scrollHeight > a.clientHeight + margen && visible(a);
    });
    return candidatos.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] ?? null;
  };

  /** Alto de ventana con el que entra toda la pantalla sin scroll, para la captura completa. */
  const altoCompleto = () => {
    const sc = scrollPrincipal(4);
    return sc ? innerHeight + sc.scrollHeight - sc.clientHeight : null;
  };

  /** Recorre la lista principal de punta a punta, cuadro por cuadro, y cuenta los cuadros lentos. */
  const desplazar = () =>
    new Promise((ok) => {
      const sc = scrollPrincipal(80);
      if (!sc) {
        ok(null);
        return;
      }
      const distancia = sc.scrollHeight - sc.clientHeight;
      const duracion = Math.min(2500, Math.max(800, distancia * 1.2));
      const cuadros = [];
      let inicio = null;
      let previo = null;
      const paso = (t) => {
        if (inicio === null) inicio = t;
        else cuadros.push(t - previo);
        previo = t;
        const k = Math.min(1, (t - inicio) / duracion);
        sc.scrollTop = distancia * k;
        if (k < 1) {
          requestAnimationFrame(paso);
          return;
        }
        sc.scrollTop = 0;
        const total = cuadros.reduce((a, b) => a + b, 0);
        const lentos = cuadros.filter((d) => d > 25).length;
        ok({
          distancia,
          fps: total ? Math.round((cuadros.length * 1000) / total) : null,
          pctLentos: cuadros.length ? Math.round((lentos / cuadros.length) * 100) : 0,
          peorMs: Math.round(Math.max(0, ...cuadros)),
        });
      };
      requestAnimationFrame(paso);
    });

  // ---- Prueba de botones: se toca cada uno y se mira si algo cambió en pantalla ----

  // Lo que un botón abre fuera de la página (menú de compartir, selector de fotos, otra pestaña) no
  // cambia nada en pantalla: se anota acá para que cuente como respuesta.
  const externos = [];
  const anotar = (que) => externos.push(que);
  try {
    const compartir = navigator.share ? navigator.share.bind(navigator) : null;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (datos) => {
        anotar('Abre el menú para compartir');
        return compartir ? compartir(datos).catch(() => undefined) : Promise.resolve();
      },
    });
  } catch {}
  const abrirVentana = window.open;
  window.open = (...args) => {
    anotar('Abre otra pestaña');
    return abrirVentana.apply(window, args);
  };
  const clickInput = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (...args) {
    if (this.type === 'file') {
      anotar('Abre el selector de archivos');
      return undefined;
    }
    return clickInput.apply(this, args);
  };
  // expo-image-picker no llama a click(): le manda un evento de click al input.
  const despachar = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (evento) {
    if (this instanceof HTMLInputElement && this.type === 'file' && evento && evento.type === 'click') {
      anotar('Abre el selector de archivos');
      return true;
    }
    return despachar.call(this, evento);
  };

  // El contenedor de un Stepper (role=slider) no se toca: se tocan sus botones − y +.
  const tocables = () => interactivos().filter((el) => !CAMPOS.includes(el.tagName) && el.getAttribute('role') !== 'slider');

  const enEstaPantalla = (el) => {
    if (el.tagName !== 'A' || !el.href) return false;
    try {
      return new URL(el.href).pathname === location.pathname;
    } catch {
      return false;
    }
  };

  const botones = () => {
    const vistos = new Map();
    return tocables().map((el) => {
      const n = nombre(el) || '(sin nombre)';
      const indice = vistos.get(n) ?? 0;
      vistos.set(n, indice + 1);
      return {
        nombre: n,
        indice,
        apagado: deshabilitado(el),
        enlace: el.tagName === 'A' || el.getAttribute('role') === 'tab',
        actual: enEstaPantalla(el),
        elegido: el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true',
      };
    });
  };

  const buscar = (n, indice) => {
    let i = 0;
    for (const el of tocables()) {
      if ((nombre(el) || '(sin nombre)') !== n) continue;
      if (i === indice) return el;
      i++;
    }
    return null;
  };

  const firma = () => {
    const estados = interactivos()
      .map((el) => ['aria-checked', 'aria-selected', 'aria-expanded', 'aria-pressed', 'aria-valuetext'].map((a) => el.getAttribute(a) ?? '').join(','))
      .join('|');
    // El toque mismo le da el foco al botón tocado: solo cuenta si el foco cae en un campo (un botón que abre un input).
    const activo = document.activeElement;
    const foco = activo && CAMPOS.includes(activo.tagName) ? `${activo.tagName}:${nombre(activo)}` : '';
    // Sin los relojes: el de la ronda cambia solo cada segundo y parecería que el botón hizo algo.
    const texto = document.body.innerText.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '#');
    return `${location.href}\n${texto}\n${estados}\n${foco}\n${document.querySelectorAll('[aria-modal="true"]').length}\n${externos.length}`;
  };

  let antes = '';
  let externosAntes = 0;
  let toque = null;
  document.addEventListener(
    'pointerdown',
    () => {
      if (toque === null) toque = performance.now();
    },
    true
  );

  const preparar = (n, indice) => {
    const el = buscar(n, indice);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    antes = firma();
    externosAntes = externos.length;
    toque = null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, url: location.href };
  };

  const esperarEfecto = (maxMs) =>
    new Promise((ok) => {
      const fin = performance.now() + maxMs;
      const mirar = () => {
        const cambio = firma() !== antes;
        if (cambio || performance.now() > fin) {
          ok({
            cambio,
            ms: cambio && toque !== null ? Math.round(performance.now() - toque) : null,
            url: location.href,
            externo: externos.length > externosAntes ? externos[externos.length - 1] : null,
          });
          return;
        }
        requestAnimationFrame(mirar);
      };
      mirar();
    });

  window.__qa = { medir, metricas, listo, desplazar, altoCompleto, botones, preparar, esperarEfecto };
})();
