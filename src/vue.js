/**
 * Adaptador Vue 3 para el core vanilla.
 *
 *   <SileoToaster position="top-right" theme="system" :styles="{ toast: 'top-90' }" />
 *
 *   import { sileo } from "sileo-js";
 *   sileo.success({ title: "Guardado", description: "Todo listo." });
 *
 * El componente no renderiza nada propio: solo monta/desmonta el toaster.
 * Para React/Svelte/Angular basta el mismo patron (createToaster en mount,
 * destroy en unmount) o `configure()` del core, que no sabe de frameworks.
 */

import {
	defineComponent,
	inject,
	onBeforeUnmount,
	onMounted,
	reactive,
	ref,
	watch,
} from "vue";
import { configure, createToaster, getConfig, getToaster, sileo } from "./sileo.js";

/* =========================================================================== */
/*                          Config reactiva compartida                         */
/* =========================================================================== */

/**
 * Un unico objeto reactivo para toda la app: el toaster tambien es unico.
 * Mutarlo reconfigura el toaster en caliente.
 *
 *   const cfg = useSileoConfig();
 *   cfg.theme = "dark";
 *   cfg.position = "bottom-center";
 *   cfg.styles.toast = "top-90";
 */
const config = reactive({
	position: "top-right",
	theme: undefined,
	offset: undefined,
	visibleToasts: undefined,
	/** Defaults de todos los toasts (roundness, duration, autopilot...). */
	options: {},
	/** Clases / CSS por parte: toast, header, badge, title, description... */
	styles: {},
});

let syncing = false;

/** Copia plana: al core le llegan objetos normales, no proxies anidados. */
const plain = (o) => (o && typeof o === "object" ? { ...o } : o);

const pushConfig = () => {
	configure({
		position: config.position,
		theme: config.theme,
		offset: plain(config.offset),
		visibleToasts: config.visibleToasts,
		options: { ...plain(config.options), styles: plain(config.styles) },
		// La config reactiva ya es el estado completo: sustituye, no mezcla, para
		// que borrar una clase en Vue tambien la borre en el DOM.
		replace: true,
	});
};

/** Arranca el puente config reactiva -> toaster (una sola vez). */
const startSync = () => {
	if (syncing) return;
	syncing = true;
	watch(config, pushConfig, { deep: true, flush: "post" });
};

/** Vuelca en la config reactiva lo que venga de fuera (plugin, props...). */
const seedConfig = (opts = {}) => {
	// Solo lo que venga definido: una prop sin poner no debe borrar lo que ya
	// hubiera configurado el plugin.
	if (opts.position != null) config.position = opts.position;
	if (opts.theme !== undefined) config.theme = opts.theme;
	if (opts.offset !== undefined) config.offset = opts.offset;
	if (opts.visibleToasts !== undefined) config.visibleToasts = opts.visibleToasts;
	if (opts.options) {
		const { styles, ...rest } = opts.options;
		Object.assign(config.options, rest);
		if (styles) Object.assign(config.styles, styles);
	}
	if (opts.styles) Object.assign(config.styles, opts.styles);
};

/**
 * Config reactiva del toaster. Cambiar cualquier campo (tema, posicion o
 * estilos) se aplica al vuelo sobre los toasts que ya estan en pantalla.
 */
export function useSileoConfig() {
	startSync();
	return inject("sileoConfig", config);
}

/* =========================================================================== */
/*                                 Componente                                  */
/* =========================================================================== */

export const SileoToaster = defineComponent({
	name: "SileoToaster",
	props: {
		position: { type: String, default: undefined },
		theme: { type: String, default: undefined }, // "light" | "dark" | "system"
		offset: { type: [Number, String, Object], default: undefined },
		visibleToasts: { type: Number, default: undefined },
		/** Defaults de todos los toasts; admite `styles` dentro. */
		options: { type: Object, default: undefined },
		/** Atajo de options.styles: { toast, header, badge, title, ... } */
		styles: { type: Object, default: undefined },
	},
	setup(props, { slots }) {
		const toaster = ref(null);
		// El toaster es unico para toda la pagina. Si ya lo habia montado otro
		// (el plugin, o un createToaster suelto), este componente no es su dueno
		// y no debe destruirlo al desmontarse.
		let owned = false;

		const sync = () => {
			seedConfig(props);
			startSync();
		};

		onMounted(() => {
			owned = !getToaster();
			seedConfig(props);
			toaster.value = createToaster({
				position: config.position,
				theme: config.theme,
				offset: config.offset,
				visibleToasts: config.visibleToasts,
				options: { ...plain(config.options), styles: plain(config.styles) },
			});
			startSync();
		});

		// Las props siguen mandando: cambiarlas actualiza la config compartida,
		// y el watch de la config reconfigura el toaster.
		watch(() => [props.position, props.theme, props.offset, props.visibleToasts], sync);
		watch(() => props.options, sync, { deep: true });
		watch(() => props.styles, sync, { deep: true });

		onBeforeUnmount(() => {
			if (owned) toaster.value?.destroy();
			toaster.value = null;
		});

		return () => (slots.default ? slots.default() : null);
	},
});

/** Azucar para composables: const toast = useSileo() */
export const useSileo = () => sileo;

/** app.use(SileoPlugin) -> <SileoToaster /> global + this.$sileo */
export const SileoPlugin = {
	install(app, options = {}) {
		app.component("SileoToaster", SileoToaster);
		app.config.globalProperties.$sileo = sileo;
		// Config reactiva: this.$sileoConfig.theme = "dark" desde cualquier sitio
		app.config.globalProperties.$sileoConfig = config;
		app.provide("sileo", sileo);
		app.provide("sileoConfig", config);

		seedConfig(options);
		if (options.mount !== false && typeof document !== "undefined") {
			createToaster({
				...options,
				position: config.position,
				theme: config.theme,
				offset: config.offset,
				visibleToasts: config.visibleToasts,
				options: { ...plain(config.options), styles: plain(config.styles) },
			});
		} else if (getToaster()) {
			// mount: false pero el toaster ya existe (otra app, el componente o un
			// createToaster suelto): la config del plugin se aplica igual.
			pushConfig();
		}
		startSync();
	},
};

export { sileo, createToaster, getToaster, configure, getConfig };
export default SileoPlugin;
