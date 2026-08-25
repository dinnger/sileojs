# Sileo (vanilla JS)

[![npm](https://img.shields.io/npm/v/sileojs?color=%230b7285&label=npm)](https://www.npmjs.com/package/sileojs)
[![licencia](https://img.shields.io/npm/l/sileojs?color=%23555)](LICENSE)
[![sin dependencias](https://img.shields.io/badge/dependencias-0-brightgreen)](https://www.npmjs.com/package/sileojs?activeTab=dependencies)

![til](./intro.gif)

**[Documentación](https://dinnger.github.io/sileojs/docs/)** · **[Docs in English](https://dinnger.github.io/sileojs/docs/en.html)** · **[Demo](https://dinnger.github.io/sileojs/demo/)** · **[npm](https://www.npmjs.com/package/sileojs)** · **[GitHub](https://github.com/dinnger/sileojs)**

Réplica de [sileo.aaryan.design](https://sileo.aaryan.design/) — toast con morphing
gooey y spring physics — reescrita como **core vanilla, cero dependencias**, que
funciona con cualquier framework JS. Incluye adaptador Vue 3.

El original es React + [`motion`](https://motion.dev). Aquí **toda la animación vive
en CSS**: el spring es una `linear()` easing nativa y la geometría se resuelve con
`calc()` / `max()` sobre custom properties. JS solo hace estado, DOM, medir dos cosas
(ancho del pill y alto del panel), colocar las tabs del stack y llevar los timers.

```
src/sileo.css   motor de animación (spring, morph, gooey, temas)
src/sileo.js    core vanilla — store + renderer + API
src/vue.js      adaptador Vue 3 (componente, plugin, composable)
docs/index.html documentación completa (panel lateral, ejemplos vivos)
docs/en.html    la misma, en inglés — la página elige idioma según el navegador
docs/docs.css   hoja y guion compartidos por los dos idiomas
docs/docs.js
demo/index.html playground sin build
```

**[Documentación completa →](https://dinnger.github.io/sileojs/docs/)** — instalación, uso en cada
framework, referencia de la API, variables CSS y accesibilidad, con ejemplos que
se pueden probar en la página.

## Instalación

```bash
npm i sileojs
```

```js
import { sileo, createToaster } from "sileojs";
import "sileojs/styles.css";

createToaster({ position: "top-right", theme: "system" });

sileo.success({ title: "Guardado", description: "Tus cambios se sincronizaron." });
```

`createToaster()` es opcional: el primer `sileo.*()` monta un toaster con los
valores por defecto.

## Vue 3

```vue
<script setup>
import { SileoToaster } from "sileojs/vue";
import { sileo } from "sileojs";
import "sileojs/styles.css";
</script>

<template>
  <SileoToaster position="top-right" theme="system" />
  <button @click="sileo.success({ title: 'Listo' })">Guardar</button>
</template>
```

### Sin componente (plugin + `$sileo` global)

El plugin monta el toaster al arrancar y deja `$sileo` disponible en todas las
plantillas, así que no hace falta poner `<SileoToaster />` en ningún sitio ni
importar nada en cada componente:

```js
// main.js
import { createApp } from "vue";
import { SileoPlugin } from "sileojs/vue";
import "sileojs/styles.css";
import App from "./App.vue";

createApp(App)
  .use(SileoPlugin, { position: "top-right", theme: "system" })
  .mount("#app");
```

```vue
<template>
  <button @click="$sileo.success({ title: 'Guardado' })">Guardar</button>
</template>
```

`$sileo` solo existe en la plantilla (es una `globalProperty`). Dentro de
`<script setup>` usa `import { sileo } from "sileojs"` o `inject("sileo")`.

Pasa `{ mount: false }` si prefieres montar el toaster tú (o usar el
componente).

## Otros frameworks

El core no sabe nada de frameworks. El patrón es siempre el mismo:

```js
// React
useEffect(() => {
  const toaster = createToaster({ position: "top-right" });
  return () => toaster.destroy();
}, []);

// Svelte
onMount(() => {
  const toaster = createToaster({ position: "top-right" });
  return () => toaster.destroy();
});

// Angular / vanilla
ngOnInit()   { this.toaster = createToaster(); }
ngOnDestroy(){ this.toaster.destroy(); }
```

`destroy` usa `this`, así que hay que llamarlo sobre el toaster
(`() => toaster.destroy()`), no pasarlo suelto como callback.

La demo (`demo/index.html`) trae el mismo ejemplo para cada framework en
pestañas.

## API

### `sileo`

| Método | Descripción |
| --- | --- |
| `sileo.show(opts)` | Usa `opts.type` como estado |
| `sileo.success/error/warning/info/action/loading(opts)` | Atajos por estado |
| `sileo.promise(promise \| () => promise, opts)` | `loading` → `success` / `error` / `action` |
| `sileo.update(id, opts)` | Muta un toast vivo (colapsa, cambia, reabre) |
| `sileo.dismiss(id)` | Salida animada |
| `sileo.clear(position?)` | Limpia todo o una posición |

Devuelven el `id` del toast (por defecto `"sileo-default"`, así que llamadas
repetidas **reemplazan** el mismo toast; pasa un `id` propio para apilar).

### Opciones del toast

| Opción | Tipo | Default |
| --- | --- | --- |
| `title` | `string` | el estado |
| `description` | `string \| Node \| { html }` | — |
| `type` / `state` | `success \| loading \| error \| warning \| info \| action` | `success` |
| `position` | una de las 6 posiciones | la del toaster |
| `duration` | `number \| null` (`null` = persistente) | `6000` |
| `icon` | `string \| Node \| { html }` | icono del estado |
| `styles` | `{ title, description, badge, button }` (clases CSS) | — |
| `fill` | color del panel | según tema |
| `roundness` | `number` (escala el blur del gooey) | `16` |
| `autopilot` | `false \| { expand, collapse }` (ms) | expande a 150ms, colapsa a 4000ms |
| `button` | `{ title, onClick }` | — |
| `id` | `string` | `"sileo-default"` |

### Opciones del toaster

`position`, `theme` (`light \| dark \| system`), `offset` (número/string o
`{ top, right, bottom, left }`), `options` (defaults para todos los toasts),
`visibleToasts` (tabs visibles del stack), `container` (default `document.body`).

El toaster es único para toda la página: `createToaster()` devuelve el que ya
hubiera (aplicándole las opciones nuevas). `getToaster()` devuelve el montado o
`null`, y el componente de Vue lo usa para destruir solo el que creó él.

## Interacción

- **Hover / focus** → expande el panel y **pausa** el auto-dismiss.
- **Arrastrar** vertical > 30px → descarta.
- `prefers-reduced-motion` desactiva todo el movimiento.

## Fila de tabs solapadas

Cuando hay varios toasts en la misma posición no se apilan como lista: forman una
**fila de pestañas solapadas a la altura del título**. La tab enfocada muestra su
icono, su título y su mensaje; las demás se encogen a un círculo con solo el
icono y se montan sobre la vecina. Nada baja: solo el panel de la enfocada.

- En reposo las tabs de atrás quedan montadas unas sobre otras, como una baraja,
  enseñando solo su icono. El enfoque es la tab del borde de la pantalla (el
  toast más nuevo), y un toast nuevo se lleva el enfoque.
- El icono se arrima al borde por el que asoma la tab, que depende de la
  posición: en las de la derecha la fila crece hacia dentro y asoma el lado
  izquierdo; en las de la izquierda y el centro, el derecho.
- Al entrar el cursor la baraja se abre: aparecen **todas** las notificaciones
  (el corte de tres es solo para el reposo) y la tab del frente abre su panel.
- **Solo la tab enfocada se ensancha**; las demás se quedan en su icono. Pero se
  ensancha siempre al **mismo** ancho, el de la más ancha del stack: así lo que
  crece compensa lo que se corre y la tab que señalas no se escapa del puntero.
  Si midiera lo suyo, al enfocar una de título corto el foco saltaría a la vecina.
- La enfocada conserva su `z-index` natural: va por debajo de las que tiene
  delante y por encima de las de atrás, como una pestaña. Si se pusiera encima de
  todo, al enfocar una del medio se comería a las que quedan entre ella y el
  borde de la pantalla. Su contenido arranca pasado el trozo que le tapa la de
  delante, para que el icono y el título se vean enteros.
- Si la fila no cabe en el ancho del toaster, se recorta primero el ancho de la
  enfocada y luego lo que asoma de cada icono, antes que desbordar: una tab fuera
  del viewport quedaría fuera de la zona de hover y sería inalcanzable.
- Al mover el cursor a otro círculo, el enfoque salta a esa tab: se ensancha en su
  sitio para mostrar su título, abre su mensaje, corre las de atrás y la anterior
  vuelve a ser un círculo.
- Mientras el cursor está dentro, el `autopilot` deja de contar: no cierra el
  panel que estás señalando.
- Al salir el cursor, el enfoque vuelve al frente y todo se cierra.
- En reposo se ven 3 tabs (`--sileo-stack-max` / opción `visibleToasts`) y, si
  hay más, aparece un **`+`** al final del mazo: solo avisa de que quedan otras,
  el número exacto se ve al abrir la fila. La enfocada nunca se oculta, aunque
  lleguen toasts nuevos.
- El icono de cada tab se arrima al borde por el que asoma, que depende de la
  posición: en las de la derecha la fila crece hacia dentro y asoma el lado
  izquierdo; en las de la izquierda y el centro, el derecho.

Las posiciones son una sola recurrencia, del borde de la pantalla hacia dentro:

```
x[0]   = 0
x[i+1] = x[i] + ancho(i) - tab-overlap
ancho(i) = (i enfocada ? ancho de su pill : alto del toast)
```

El JS publica `--_tx` (corrimiento en la fila), `--_i` (profundidad en z) y
`--_sh` (alto del stack); CSS deriva el `translate`, el `z-index` y el ancho de
cada tab (`--_rw`, que es `--_pw` en la enfocada y `--sileo-height` en las
demás). El corrimiento va sobre la pill y la cabecera, no sobre la raíz, para que
el panel quede siempre pegado al borde. El viewport mide exactamente el stack y
hace de zona de hover, así que moverse entre tabs no lo cierra.

## Cómo funciona el CSS

El truco visual del original son dos rectángulos y un filtro SVG:

1. **pill** (la cápsula del header) y **body** (el panel) son dos `div` con
   `border-radius`, dentro de una capa con `filter: url(#sileo-goo-N)`.
2. El filtro es `feGaussianBlur` → `feColorMatrix` (alfa ×20 −10): convierte el
   blur en un borde duro, y ahí es donde dos formas cercanas se **funden**
   (metaballs).
3. El color del puente **no** sale del blur: en sRGB sin premultiplicar lo
   transparente es negro, así que el puente salía gris oscuro. Se inunda con
   `feFlood` (cuyo `flood-color` es `var(--sileo-fill)`, heredado del toast) y se
   recorta con el alfa del umbral; el `SourceGraphic` va encima para que las
   formas conserven el borde nítido. Por eso el filtro va uno por toast.
4. Al expandir, el pill crece `blur × 3` hacia abajo para provocar ese solape.
5. El borde superior (`top-*`) reusa la misma geometría con `scaleY(-1)`.
6. La sombra va **después** en la cadena de filtros del canvas
   (`filter: var(--sileo-goo) var(--sileo-shadow)`), así cae sobre la silueta ya
   fundida. Dentro del filtro no serviría: el umbral de alfa se la comería.

JS solo publica dos medidas vía `ResizeObserver`:

```
--_pw   ancho del pill  = scrollWidth del header + padding + 10
--_ch   alto del contenido = scrollHeight del panel
```

y el resto lo deriva CSS:

```css
--_exp: max(calc(var(--sileo-height) * 2.25),
            calc(var(--sileo-height) + var(--_ch)));
```

El spring (`bounce: 0.25`) es la función `linear()` de
`--sileo-spring-easing`; al colapsar se cambia a `--sileo-ease-flat` (sin
overshoot), replicando el `bounce: 0` del original.

## Personalización

Todo son custom properties:

```css
:root {
  --sileo-width: 380px;
  --sileo-height: 44px;
  --sileo-roundness: 20px;
  --sileo-duration: 500ms;
  --sileo-state-success: oklch(0.72 0.19 150);

  /* fila de tabs */
  --sileo-tab-overlap: 18px;     /* solape en reposo (baraja) */
  --sileo-tab-overlap-hot: 12px; /* solape con el cursor dentro */
  --sileo-stack-max: 3;          /* tabs visibles */
  --sileo-gap: 12px;             /* separación del borde de la pantalla */
  --sileo-shadow: drop-shadow(0 2px 8px rgb(0 0 0 / 0.18));
}
```

La sombra depende del relleno, no del gusto: es lo que separa una tab de la que
tiene detrás. Con cápsulas claras basta una sombra oscura; con `theme: "light"`
la cápsula es oscura y una sombra negra sobre otra cápsula oscura no separa nada,
así que ahí se le suma un filo claro. Si cambias `--sileo-fill` a mano, ajusta
también `--sileo-shadow`.

`--sileo-height`, `--sileo-tab-overlap` y `--sileo-stack-max` están declaradas con
`@property`, así que el JS las lee ya resueltas a px y puedes escribirlas en
cualquier unidad.

## Pruebas

Dos suites de aserciones que corren en el navegador, sin dependencias:

- `demo/spec.html` — el core: orden del stack, corrimientos, foco, `z-index`,
  timers, autopilot frente al cursor, arrastre y `promise`.
- `demo/spec-vue.html` — el adaptador de Vue 3 (plugin con `$sileo` global,
  componente con `useSileo()`, y que desmontar un componente no se lleve por
  delante el toaster que montó otro). Carga Vue desde CDN con un import map.

Ábrelas en el navegador: cada una imprime PASS/FAIL y un `TODO OK` al final.

## Demo

Los módulos ES necesitan un servidor con MIME correcto (`python -m http.server`
sirve `.js` como `text/plain` en Windows y Chrome lo rechaza):

```bash
npx serve .
# abre http://localhost:3000/demo/
```

## Compatibilidad

Chrome/Edge 113+, Safari 16.4+, Firefox 128+ (`linear()`, `oklch()`,
`color-mix()`, `@property`, propiedades `translate`/`scale`). Sin build step, sin
dependencias.

Diseño original: [Aaryan Kapoor](https://github.com/hiaaryan/sileo) · MIT.
