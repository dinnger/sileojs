/**
 * Adaptador Vue 3 para el core vanilla.
 *
 *   <SileoToaster position="top-right" theme="system" />
 *
 *   import { sileo } from "sileo-js";
 *   sileo.success({ title: "Guardado", description: "Todo listo." });
 *
 * El componente no renderiza nada propio: solo monta/desmonta el toaster.
 * Para React/Svelte/Angular basta el mismo patron (createToaster en mount,
 * destroy en unmount).
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createToaster, getToaster, sileo } from "./sileo.js";

export const SileoToaster = defineComponent({
	name: "SileoToaster",
	props: {
		position: { type: String, default: "top-right" },
		theme: { type: String, default: undefined }, // "light" | "dark" | "system"
		offset: { type: [Number, String, Object], default: undefined },
		options: { type: Object, default: undefined },
	},
	setup(props, { slots }) {
		const toaster = ref(null);
		// El toaster es unico para toda la pagina. Si ya lo habia montado otro
		// (el plugin, o un createToaster suelto), este componente no es su dueno
		// y no debe destruirlo al desmontarse.
		let owned = false;

		onMounted(() => {
			owned = !getToaster();
			toaster.value = createToaster({
				position: props.position,
				theme: props.theme,
				offset: props.offset,
				options: props.options,
			});
		});

		watch(
			() => [props.position, props.theme, props.offset, props.options],
			() => {
				toaster.value?.set({
					position: props.position,
					theme: props.theme,
					offset: props.offset,
					options: props.options,
				});
			},
			{ deep: true },
		);

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
		app.provide("sileo", sileo);
		if (options.mount !== false && typeof document !== "undefined") {
			createToaster(options);
		}
	},
};

export { sileo, createToaster, getToaster };
export default SileoPlugin;
