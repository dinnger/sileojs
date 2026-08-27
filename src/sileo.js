/**
 * Sileo (vanilla) - toast con morphing gooey y spring physics.
 *
 * Cero dependencias, funciona con cualquier framework JS.
 * El JS solo hace: estado, DOM, medicion (2 numeros) y timers.
 * Todo el movimiento esta en sileo.css.
 */

/* --------------------------------- Layout --------------------------------- */
const HEIGHT = 40;
const DEFAULT_ROUNDNESS = 16;
const PILL_PADDING = 10;
const BLUR_RATIO = 0.5;
const MIN_EXPAND_RATIO = 2.25; // espeja el max() de --_exp en el CSS

/* ---------------------------------- Stack --------------------------------- */
/* Valores de respaldo si el CSS no esta cargado; el CSS es la fuente real. */
const TAB_OVERLAP = 12;
const STACK_MAX = 3;
const MIN_STEP = 12; // lo mínimo que puede asomar una tab cuando no cabe la fila
const CHIP_OVERLAP = 8; // el contador solo se monta un poco: su texto debe leerse
const HOVER_LEAVE_MS = 140;

/* --------------------------------- Timing --------------------------------- */
const DURATION_MS = 600;
const DEFAULT_TOAST_DURATION = 6000;
const EXIT_DURATION = DEFAULT_TOAST_DURATION * 0.1; // 600ms
const AUTO_EXPAND_DELAY = DEFAULT_TOAST_DURATION * 0.025; // 150ms
const AUTO_COLLAPSE_DELAY = DEFAULT_TOAST_DURATION - 2000; // 4000ms
const SWAP_COLLAPSE_MS = 200;
const HEADER_EXIT_MS = DURATION_MS * 0.7;

/* --------------------------------- Swipe ---------------------------------- */
const SWIPE_DISMISS = 30;
const SWIPE_MAX = 20;

export const SILEO_POSITIONS = [
	"top-left",
	"top-center",
	"top-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
];

export const SILEO_STATES = [
	"success",
	"loading",
	"error",
	"warning",
	"info",
	"action",
];

/* ---------------------------------- Icons --------------------------------- */

const svg = (body, extra = "") =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

export const STATE_ICON = {
	success: svg('<path d="M20 6 9 17l-5-5"/>'),
	loading: svg('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>', ' data-sileo-icon="spin"'),
	error: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
	warning: svg(
		'<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
	),
	info: svg(
		'<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>',
	),
	action: svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
};

/* ------------------------------ Gooey filter ------------------------------ */
/*
 * Metaballs: blur -> umbral de alfa -> se tine con el color de relleno.
 *
 * El umbral (alfa x20 -10) convierte el blur en un borde duro, y ahi es donde
 * dos formas cercanas se funden. Pero el blur tambien ensucia el RGB: en sRGB
 * sin premultiplicar, lo transparente es negro, asi que el puente salia gris
 * oscuro. Por eso el color no se toma del blur: se inunda con --sileo-fill y se
 * recorta con el alfa del umbral. El SourceGraphic va encima para que las
 * formas conserven el borde nitido.
 *
 * Va un filtro por toast (no uno global) porque flood-color se resuelve con el
 * --sileo-fill de ese toast, que depende del tema.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
let gooSeq = 0;

function gooDefs(blur) {
	const id = `sileo-goo-${++gooSeq}`;
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("width", "0");
	svg.setAttribute("height", "0");
	svg.setAttribute("data-sileo-defs", "");
	svg.innerHTML =
		`<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">` +
		`<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="blur"/>` +
		`<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="goo"/>` +
		`<feFlood data-sileo-goo-flood result="flood"/>` +
		`<feComposite in="flood" in2="goo" operator="in" result="tint"/>` +
		`<feComposite in="SourceGraphic" in2="tint" operator="over"/>` +
		`</filter>`;
	return { svg, id, blur: svg.querySelector("feGaussianBlur") };
}

/* --------------------------------- Helpers -------------------------------- */

const el = (tag, attrs) => {
	const node = document.createElement(tag);
	for (const k in attrs) {
		if (attrs[k] != null) node.setAttribute(k, attrs[k]);
	}
	return node;
};

const pillAlign = (pos) =>
	pos.includes("right") ? "right" : pos.includes("center") ? "center" : "left";

const expandDir = (pos) => (pos.startsWith("top") ? "bottom" : "top");

/* -------------------------------- Puntero --------------------------------- */
/*
 * `pointerenter` solo se emite cuando el puntero SE MUEVE: si el toast nace
 * justo debajo del cursor, el navegador no dispara nada y el stack se queda
 * frio, asi que el autopilot lo colapsa y el auto-dismiss lo cierra aunque lo
 * estes senalando. Por eso se guarda la ultima posicion conocida del puntero:
 * al montar o recolocar, cada viewport comprueba si le cae encima.
 *
 * Solo cuenta el puntero fino (raton/lapiz). En tactil no hay hover que
 * mantener, y la posicion del ultimo toque no debe congelar nada.
 */
const pointer = { x: 0, y: 0, known: false };

let pointerBound = false;

function trackPointer() {
	if (pointerBound || typeof document === "undefined") return;
	pointerBound = true;

	const seen = (e) => {
		if (e.pointerType === "touch") {
			pointer.known = false;
			return;
		}
		pointer.x = e.clientX;
		pointer.y = e.clientY;
		pointer.known = true;
	};
	// En captura y pasivos: esto solo mira, nunca estorba al resto de la pagina.
	const opts = { passive: true, capture: true };
	document.addEventListener("pointermove", seen, opts);
	document.addEventListener("pointerdown", seen, opts);
	// El puntero se fue de la ventana (o la ventana perdio el foco): lo guardado
	// ya no dice donde esta, y dejarlo valido congelaria un stack para siempre.
	const lost = () => {
		pointer.known = false;
	};
	document.addEventListener("pointerleave", (e) => {
		if (!e.relatedTarget) lost();
	}, opts);
	window.addEventListener("blur", lost, { passive: true });
}

const finePointer = () =>
	typeof window === "undefined" ||
	!window.matchMedia ||
	window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Si el puntero esta ahora mismo dentro de este nodo. */
function pointerInside(node) {
	if (!node) return false;
	// `:hover` es la respuesta del propio navegador: si ya la tiene, sobra mirar.
	if (node.matches?.(":hover")) return true;
	if (!pointer.known || !finePointer()) return false;
	// elementFromPoint y no el rect: hace el mismo hit-test que el navegador, asi
	// que respeta pointer-events y lo que haya por encima. Si algo tapa el
	// viewport, el puntero no esta "dentro" y no hay que calentar nada (no
	// llegaria despues ningun pointerleave que lo enfriara).
	const hit = document.elementFromPoint(pointer.x, pointer.y);
	return Boolean(hit) && (hit === node || node.contains(hit));
}

/* ------------------------------ Estilos de usuario ------------------------ */

/**
 * Partes estilables. El nombre es el mismo en `styles` (por toast) y en
 * `options.styles` (globales), y no depende de ningun framework: lo que llegue
 * son clases y/o propiedades CSS sueltas.
 */
export const STYLE_PARTS = [
	"viewport",
	"toast",
	"canvas",
	"pill",
	"body",
	"header",
	"badge",
	"title",
	"content",
	"description",
	"button",
	"count",
];

/** Lo ultimo aplicado a cada nodo, para poder retirarlo cuando cambia. */
const STYLE_STATE = new WeakMap();

const cssProp = (k) =>
	k.startsWith("--") ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * Aplica un estilo de usuario a un nodo. Acepta las tres formas:
 *
 *   "top-90 rounded-xl"                 -> clases
 *   { color: "red", fontSize: "12px" }  -> propiedades CSS
 *   { class: "...", style: {...} }      -> las dos
 *
 * Es idempotente: retira lo que hubiera puesto antes, asi que cambiar los
 * estilos en caliente no deja restos.
 */
function styleNode(node, value) {
	if (!node) return;
	const prev = STYLE_STATE.get(node);
	if (prev) {
		for (const c of prev.classes) node.classList.remove(c);
		for (const p of prev.props) node.style.removeProperty(p);
	}
	if (value == null || value === false || value === "") {
		STYLE_STATE.delete(node);
		return;
	}

	let cls = "";
	let css;
	if (typeof value === "string") {
		cls = value;
	} else if (typeof value === "object") {
		if ("class" in value || "className" in value || "style" in value) {
			cls = value.class ?? value.className ?? "";
			css = value.style;
		} else {
			css = value;
		}
	}

	const classes = String(cls || "").split(/\s+/).filter(Boolean);
	for (const c of classes) node.classList.add(c);

	const props = [];
	const set = (k, v) => {
		if (v == null || v === false) return;
		const prop = cssProp(String(k).trim());
		if (!prop) return;
		node.style.setProperty(prop, String(v).trim());
		props.push(prop);
	};
	if (typeof css === "string") {
		for (const decl of css.split(";")) {
			const i = decl.indexOf(":");
			if (i > 0) set(decl.slice(0, i), decl.slice(i + 1));
		}
	} else if (css && typeof css === "object") {
		for (const k in css) set(k, css[k]);
	}

	STYLE_STATE.set(node, { classes, props });
}

/** Mezcla los estilos globales con los del toast (gana el toast). */
const mergeStyles = (base, extra) =>
	base || extra ? { ...base, ...extra } : undefined;

/** Acepta string, Node o {html}. */
function fill(node, value) {
	node.textContent = "";
	if (value == null || value === false) return;
	if (value instanceof Node) node.appendChild(value);
	else if (typeof value === "object" && typeof value.html === "string")
		node.insertAdjacentHTML("afterbegin", value.html);
	else node.appendChild(document.createTextNode(String(value)));
}

/* =========================================================================== */
/*                                    Toast                                    */
/* =========================================================================== */

class SileoToast {
	constructor(item, host) {
		this.host = host;
		this.id = item.id;
		this.pos = item.position;
		this.align = pillAlign(item.position);
		this.edge = expandDir(item.position);
		this.view = null;
		this.ready = false;
		this.expanded = false;
		this.exiting = false;
		this.allowExpand = true;
		this.pad = 0;
		this.pillW = 0;
		this.contentH = 0;
		this.pending = null;
		this.timers = {};

		/* ------------------------------- Estructura ------------------------------ */
		const root = el("button", {
			type: "button",
			"data-sileo-toast": "",
			"data-edge": this.edge,
			"aria-atomic": "true",
		});

		const canvas = el("div", {
			"data-sileo-canvas": "",
			"data-edge": this.edge,
		});
		this.goo = gooDefs(DEFAULT_ROUNDNESS * BLUR_RATIO);
		canvas.appendChild(this.goo.svg);
		const pill = el("div", { "data-sileo-pill": "", "data-align": this.align });
		const body = el("div", { "data-sileo-body": "" });
		canvas.appendChild(pill);
		canvas.appendChild(body);

		const header = el("div", {
			"data-sileo-header": "",
			"data-edge": this.edge,
			"data-align": this.align,
		});
		const stack = el("div", { "data-sileo-header-stack": "" });
		header.appendChild(stack);

		const content = el("div", {
			"data-sileo-content": "",
			"data-edge": this.edge,
		});
		const desc = el("div", { "data-sileo-description": "" });
		content.appendChild(desc);

		root.append(canvas, header, content);

		this.root = root;
		this.canvas = canvas;
		this.pill = pill;
		this.body = body;
		this.header = header;
		this.stack = stack;
		this.content = content;
		this.desc = desc;

		/* ------------------------------- Interaccion ----------------------------- */
		/* La raiz de todas las tabs ocupa la franja completa, asi que el puntero
		   lo capturan la cabecera (la tab en si) y el panel. El pointerleave lo
		   escucha el viewport, no cada tab, para que moverse de una tab a otra no
		   colapse el stack. */
		for (const target of [header, content]) {
			target.addEventListener("pointerenter", () => {
				this.host._focus(this.pos, this.id);
			});
			target.addEventListener("pointerdown", (e) => this._down(e));
		}
		root.addEventListener("focusin", () => {
			this.host._setHot(this.pos, true);
			this.host._focus(this.pos, this.id);
		});

		/* -------------------------------- Medicion ------------------------------- */
		this.ro = new ResizeObserver(() => {
			cancelAnimationFrame(this.raf);
			this.raf = requestAnimationFrame(() => this._measure());
		});
		this.ro.observe(desc);

		this.apply(item);

		// Primer frame sin transiciones -> luego se habilitan (entrada CSS).
		requestAnimationFrame(() => {
			this.ready = true;
			root.setAttribute("data-ready", "true");
		});
	}

	/* ------------------------------ Vista / datos ----------------------------- */

	apply(item) {
		const state = item.state || "success";
		const title = item.title != null ? item.title : state;
		const hasDesc = Boolean(item.description) || Boolean(item.button);
		const roundness = Math.max(
			0,
			item.roundness != null ? item.roundness : DEFAULT_ROUNDNESS,
		);

		this.item = item;
		this.state = state;
		this.hasDesc = hasDesc;
		this.isLoading = state === "loading";

		const root = this.root;
		root.setAttribute("data-state", state);
		root.setAttribute("data-has-desc", String(hasDesc));
		root.setAttribute("aria-label", title);
		this._own("--sileo-roundness", `${roundness}px`);
		this.goo.blur.setAttribute("stdDeviation", String(roundness * BLUR_RATIO));
		this._own("--sileo-goo", `url(#${this.goo.id})`);
		this.setFill(item.fill);

		// Una llamada repetida no cambia el texto, pero tiene que notarse: la
		// cabecera vuelve a hacer su entrada (fade + blur) aunque diga lo mismo.
		const again = this.repeat;
		this.repeat = false;
		this._header(state, title, item, again);
		this._content(item, state);
		this.applyStyles(item.styles, item.className);

		if (this.isLoading) this.close();
		this._measure();
		this._autopilot();
	}

	/** Header con crossfade+blur entre estados (dos capas, animacion CSS). */
	_header(state, title, item, force) {
		const key = `${state}-${title}`;
		if (!force && this.headerKey === key) {
			// mismo estado/titulo: solo refrescar icono si cambio
			this.headerKey = key;
			return;
		}

		const prev = this.stack.querySelector('[data-sileo-header-inner][data-layer="current"]');
		if (prev) {
			prev.setAttribute("data-layer", "prev");
			clearTimeout(this.timers.headerExit);
			this.timers.headerExit = setTimeout(() => prev.remove(), HEADER_EXIT_MS);
		}

		const inner = el("div", {
			"data-sileo-header-inner": "",
			"data-layer": "current",
		});
		const badge = el("div", { "data-sileo-badge": "", "data-state": state });
		if (item.icon != null) fill(badge, item.icon);
		else badge.insertAdjacentHTML("afterbegin", STATE_ICON[state] || STATE_ICON.success);

		const label = el("span", { "data-sileo-title": "", "data-state": state });
		label.textContent = title;

		inner.append(badge, label);
		this.badge = badge;
		this.label = label;
		this.stack.appendChild(inner);

		if (this.inner) this.ro.unobserve(this.inner);
		this.inner = inner;
		this.ro.observe(inner);
		this.headerKey = key;
	}

	_content(item, state) {
		fill(this.desc, item.description);
		this.btn = null;

		if (item.button) {
			// <a> y no <button>: el toast ya es un <button>
			const btn = el("a", {
				href: "#",
				role: "button",
				"data-sileo-button": "",
				"data-state": state,
			});
			btn.textContent = item.button.title;
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				item.button.onClick?.();
			});
			this.desc.appendChild(btn);
			this.btn = btn;
		}
	}

	/**
	 * Estilos de usuario sobre cada parte. Se puede llamar en caliente (cambiar
	 * `options.styles` con el toast ya montado) porque styleNode retira lo
	 * anterior antes de poner lo nuevo.
	 */
	applyStyles(styles, className) {
		const s = styles || {};
		this.ownProps ||= {};
		if (this.item) this.item.styles = styles;
		styleNode(this.root, s.toast ?? className);
		styleNode(this.canvas, s.canvas);
		styleNode(this.pill, s.pill);
		styleNode(this.body, s.body);
		styleNode(this.header, s.header);
		styleNode(this.badge, s.badge);
		styleNode(this.label, s.title);
		styleNode(this.content, s.content);
		styleNode(this.desc, s.description);
		styleNode(this.btn, s.button);

		// Si el usuario deja de escribir una variable que tambien maneja Sileo,
		// styleNode la retira: aqui se repone la nuestra.
		for (const prop in this.ownProps) {
			if (!this.root.style.getPropertyValue(prop)) {
				this.root.style.setProperty(prop, this.ownProps[prop]);
			}
		}
	}

	/** Variable inline que gestiona Sileo (y que el usuario puede pisar). */
	_own(prop, value) {
		this.ownProps ||= {};
		this.ownProps[prop] = value;
		this.root.style.setProperty(prop, value);
	}

	/**
	 * Actualiza un toast vivo. Si esta abierto, colapsa primero y cambia el
	 * contenido a mitad de camino (evita el salto de altura).
	 */
	update(item) {
		clearTimeout(this.timers.swap);
		this.repeat = true;
		if (this.expanded) {
			this.pending = item;
			this.close();
			this.timers.swap = setTimeout(() => {
				const p = this.pending;
				this.pending = null;
				if (p) this.apply(p);
			}, SWAP_COLLAPSE_MS);
		} else {
			this.apply(item);
		}
	}

	/* -------------------------------- Medicion -------------------------------- */

	_measure() {
		if (!this.pad && this.header.isConnected) {
			const cs = getComputedStyle(this.header);
			this.pad =
				parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
		}
		let dirty = false;
		if (this.inner) {
			const w = this.inner.scrollWidth + this.pad + PILL_PADDING;
			if (w > PILL_PADDING && w !== this.pillW) {
				this.pillW = w;
				this.root.style.setProperty("--_pw", `${w}px`);
				dirty = true; // el ancho de la tab enfocada corre a las de atras
			}
		}
		const h = this.hasDesc ? this.desc.scrollHeight : 0;
		if (h !== this.contentH) {
			this.contentH = h;
			this.root.style.setProperty("--_ch", `${h}px`);
			dirty = true; // el alto del panel cambia el alto del stack
		}
		if (dirty) this.host._layout(this.pos);
	}

	/** Color del panel. Puede cambiar sin rehacer el toast (cambio de tema). */
	setFill(fill) {
		if (!fill || fill === this.fill) return;
		this.fill = fill;
		this._own("--sileo-fill", fill);
	}

	/* ---------------------------------- Slot ---------------------------------- */

	/** Alto que ocupa esta tab en el stack. Espeja --_exp del CSS. */
	slotHeight(h) {
		if (!this.expanded) return h;
		return Math.max(h * MIN_EXPAND_RATIO, h + this.contentH);
	}

	/** Puesto en la fila: i = profundidad en z, tx = corrimiento horizontal. */
	setSlot({ i, tx, focused, hidden }) {
		const style = this.root.style;
		style.setProperty("--_i", String(i));
		style.setProperty("--_tx", `${Math.round(tx)}px`);
		this.root.setAttribute("data-focused", String(focused));
		if (hidden) this.root.setAttribute("data-hidden", "true");
		else this.root.removeAttribute("data-hidden");
	}

	/* ------------------------------ Expand / close ---------------------------- */

	open() {
		if (!this.hasDesc || this.isLoading || this.exiting || !this.allowExpand) return;
		if (this.expanded) return;
		this.expanded = true;
		this.root.setAttribute("data-expanded", "true");
		this.host._layout(this.pos);
	}

	close() {
		if (!this.expanded) return;
		this.expanded = false;
		this.root.setAttribute("data-expanded", "false");
		this.host._layout(this.pos);
	}

	setAllowExpand(value) {
		this.allowExpand = value;
		if (!value) this.close();
	}

	/** Con el cursor encima manda el cursor: el autopilot deja de contar. */
	cancelAutopilot() {
		clearTimeout(this.timers.expand);
		clearTimeout(this.timers.collapse);
	}

	_autopilot() {
		this.cancelAutopilot();
		if (!this.hasDesc || this.exiting || !this.allowExpand) return;

		const { autoExpandDelayMs: a, autoCollapseDelayMs: b } = this.item;
		if (a == null && b == null) return;

		if (a > 0) this.timers.expand = setTimeout(() => this.open(), a);
		else this.open();
		if (b > 0) this.timers.collapse = setTimeout(() => this.close(), b);
	}

	/* --------------------------------- Swipe ---------------------------------- */

	_down(e) {
		if (this.exiting) return;
		if (e.target.closest?.("[data-sileo-button]")) return;

		// El arrastre mueve la raiz, pero captura y escucha en el elemento que
		// recibio el pointerdown: la raiz tiene pointer-events: none.
		const root = this.root;
		const grip = e.currentTarget;
		const start = e.clientY;
		grip.setPointerCapture?.(e.pointerId);

		const move = (ev) => {
			const dy = ev.clientY - start;
			if (!this.swiping && Math.abs(dy) < 2) return;
			this.swiping = true;
			root.setAttribute("data-swiping", "true");
			const clamped = Math.min(Math.abs(dy), SWIPE_MAX) * (dy > 0 ? 1 : -1);
			root.style.setProperty("--_sy", `${clamped}px`);
		};

		const up = (ev) => {
			grip.removeEventListener("pointermove", move);
			grip.removeEventListener("pointerup", up);
			grip.removeEventListener("pointercancel", up);
			const dy = ev.clientY - start;
			this.swiping = false;
			root.removeAttribute("data-swiping");
			root.style.removeProperty("--_sy");
			if (Math.abs(dy) > SWIPE_DISMISS) dismissToast(this.id);
		};

		grip.addEventListener("pointermove", move, { passive: true });
		grip.addEventListener("pointerup", up, { passive: true });
		grip.addEventListener("pointercancel", up, { passive: true });
	}

	/* --------------------------------- Ciclo ---------------------------------- */

	exit() {
		if (this.exiting) return;
		this.exiting = true;
		this.close();
		this.root.setAttribute("data-exiting", "true");
	}

	destroy() {
		for (const k in this.timers) clearTimeout(this.timers[k]);
		cancelAnimationFrame(this.raf);
		this.ro.disconnect();
		this.root.remove();
	}
}

/* =========================================================================== */
/*                                    Store                                    */
/* =========================================================================== */

const store = {
	toasts: [],
	listeners: new Set(),
	position: "top-right",
	options: undefined,
	emit() {
		for (const fn of this.listeners) fn(this.toasts);
	},
	update(fn) {
		this.toasts = fn(this.toasts);
		this.emit();
	},
};

let idCounter = 0;
const generateId = () =>
	`${++idCounter}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const dismissToast = (id) => {
	const item = store.toasts.find((t) => t.id === id && !t.exiting);
	if (!item) return;
	const inst = item.instanceId;
	store.update((prev) =>
		prev.map((t) => (t.instanceId === inst ? { ...t, exiting: true } : t)),
	);
	// Se retira por instancia, no por id: si mientras salia se volvio a lanzar
	// ese mismo id, lo que hay ahora es otra notificacion y no se la puede
	// llevar por delante.
	setTimeout(
		() => store.update((prev) => prev.filter((t) => t.instanceId !== inst)),
		EXIT_DURATION,
	);
};

const resolveAutopilot = (opts, duration) => {
	if (opts.autopilot === false || !duration || duration <= 0) return {};
	const cfg = typeof opts.autopilot === "object" ? opts.autopilot : undefined;
	const clamp = (v) => Math.min(duration, Math.max(0, v));
	return {
		autoExpandDelayMs: clamp(cfg?.expand ?? AUTO_EXPAND_DELAY),
		autoCollapseDelayMs: clamp(cfg?.collapse ?? AUTO_COLLAPSE_DELAY),
	};
};

/**
 * Defaults globales + opciones de la llamada. Los `styles` NO se mezclan aqui:
 * el item se queda solo con los suyos y la mezcla con los globales se hace en
 * cada render, para que cambiar `options.styles` en caliente alcance tambien a
 * los toasts que ya estan en pantalla.
 */
const mergeOptions = (options) => {
	const merged = { ...store.options, ...options };
	if (options.styles) merged.styles = options.styles;
	else delete merged.styles;
	return merged;
};

const buildItem = (merged, id, prev) => {
	const duration = merged.duration ?? DEFAULT_TOAST_DURATION;
	return {
		...merged,
		...resolveAutopilot(merged, duration),
		id,
		instanceId: generateId(),
		position: merged.position ?? prev?.position ?? store.position,
		// Si el toast no pidio posicion, sigue a la del toaster y se mueve con
		// ella cuando cambia en caliente.
		positionExplicit: merged.position != null || Boolean(prev?.positionExplicit),
	};
};

/*
 * Cada llamada tiene que verse. Con el mismo id se reemplaza el toast (eso no
 * cambia), pero el item se lleva al final de la lista, que es el frente de la
 * fila: si estaba enterrado bajo el corte del stack, o saliendo, vuelve a
 * asomar. Y aunque el texto sea identico, la cabecera repite su entrada para
 * que se vea que ha vuelto a pasar algo.
 */
const createToast = (options) => {
	const merged = mergeOptions(options);
	const id = merged.id ?? "sileo-default";
	const prev = store.toasts.filter((t) => !t.exiting).find((t) => t.id === id);
	const item = buildItem(merged, id, prev);

	// Fuera cualquier rastro de ese id (incluido el que estuviera saliendo) y el
	// nuevo al final: el mas nuevo manda.
	store.update((p) => [...p.filter((t) => t.id !== id), item]);
	return { id, duration: merged.duration ?? DEFAULT_TOAST_DURATION };
};

const updateToast = (id, options) => {
	const existing = store.toasts.find((t) => t.id === id);
	if (!existing) return;
	const item = buildItem(mergeOptions(options), id, existing);
	store.update((prev) => prev.map((t) => (t.id === id ? item : t)));
};

/* -------------------------------- API publica ----------------------------- */

const emit = (state) => (opts = {}) => {
	ensureToaster();
	return createToast({ ...opts, state }).id;
};

export const sileo = {
	show: (opts = {}) => {
		ensureToaster();
		return createToast({ ...opts, state: opts.type ?? opts.state ?? "success" }).id;
	},
	success: emit("success"),
	error: emit("error"),
	warning: emit("warning"),
	info: emit("info"),
	action: emit("action"),
	loading: emit("loading"),

	promise(promise, opts) {
		ensureToaster();
		const { id } = createToast({
			...opts.loading,
			state: "loading",
			duration: null,
			position: opts.position,
		});
		const p = typeof promise === "function" ? promise() : promise;

		p.then((data) => {
			if (opts.action) {
				const a = typeof opts.action === "function" ? opts.action(data) : opts.action;
				updateToast(id, { ...a, state: "action", id });
			} else {
				const s = typeof opts.success === "function" ? opts.success(data) : opts.success;
				updateToast(id, { ...s, state: "success", id });
			}
		}).catch((err) => {
			const e = typeof opts.error === "function" ? opts.error(err) : opts.error;
			updateToast(id, { ...e, state: "error", id });
		});

		return p;
	},

	/* --- configuracion en caliente, sirva el framework que sirva --- */
	configure: (opts) => configure(opts),
	setTheme: (theme) => configure({ theme }),
	setPosition: (position) => configure({ position }),
	setStyles: (styles) => configure({ styles }),
	getConfig: () => getConfig(),

	update: updateToast,
	dismiss: dismissToast,
	clear: (position) =>
		store.update((prev) => (position ? prev.filter((t) => t.position !== position) : [])),
};

/* =========================================================================== */
/*                                   Toaster                                   */
/* =========================================================================== */

const THEME_FILLS = { light: "#1a1a1a", dark: "#f2f2f2" };

class Toaster {
	constructor(opts = {}) {
		this.position = opts.position ?? "top-right";
		this.offset = opts.offset;
		this.theme = opts.theme;
		this.container = opts.container ?? document.body;

		store.position = this.position;
		store.options = opts.options;
		// `styles` tambien se acepta suelto: createToaster({ styles: {...} })
		if (opts.styles) {
			store.options = {
				...store.options,
				styles: mergeStyles(store.options?.styles, opts.styles),
			};
		}

		this.visibleToasts = opts.visibleToasts;

		this.viewports = new Map(); // position -> section
		this.toasts = new Map(); // id -> SileoToast
		this.timers = new Map(); // instanceKey -> timeout
		// position -> estado del stack de tabs
		this.stacks = new Map(); // { el, hot, focusedId, order, metrics, laying }

		this._watchTheme();
		trackPointer();

		this.listener = (list) => this._render(list);
		store.listeners.add(this.listener);
		this._render(store.toasts);
	}

	/**
	 * "system" (o sin tema) sigue al SO. Se resuscribe cada vez que cambia el
	 * tema, para que pasar a "system" en caliente vuelva a escuchar.
	 */
	_watchTheme() {
		const wants = this.theme === "system" || this.theme == null;
		if (wants === Boolean(this.mq)) return;
		if (wants) {
			this.mq = window.matchMedia("(prefers-color-scheme: dark)");
			this.onMq = () => this._render(store.toasts);
			this.mq.addEventListener("change", this.onMq);
		} else {
			this.mq.removeEventListener("change", this.onMq);
			this.mq = null;
		}
	}

	/** Los `styles` globales del toaster (los del toast se mezclan encima). */
	get styles() {
		return store.options?.styles;
	}

	get resolvedTheme() {
		if (this.theme === "light" || this.theme === "dark") return this.theme;
		return this.mq?.matches ? "dark" : "light";
	}

	/* -------------------------------- Viewports ------------------------------- */

	_viewport(pos) {
		let vp = this.viewports.get(pos);
		if (!vp) {
			vp = el("section", {
				"data-sileo-viewport": "",
				"data-position": pos,
				"aria-live": "polite",
				role: "status",
			});
			if (this.theme) vp.setAttribute("data-theme", this.resolvedTheme);
			this._applyOffset(vp, pos);
			this.container.appendChild(vp);
			this.viewports.set(pos, vp);
			// El "+N" de las que no caben en reposo. Vive en el viewport, no es un
			// toast: no se anuncia ni se puede enfocar.
			const chip = el("div", { "data-sileo-count": "", "aria-hidden": "true" });
			vp.appendChild(chip);
			vp._sileoChip = chip;

			this.stacks.set(pos, {
				el: vp,
				chip,
				hot: false,
				focusedId: undefined,
				order: [],
				metrics: null,
				laying: false,
			});
			// El viewport envuelve al stack, asi que hace de zona de hover: pasar
			// de una lenguesta a otra no lo enfria.
			vp.addEventListener("pointerenter", () => this._setHot(pos, true));
			vp.addEventListener("pointerleave", () => this._setHot(pos, false));
			vp.addEventListener("focusout", (e) => {
				if (!vp.contains(e.relatedTarget)) this._setHot(pos, false);
			});
		} else if (this.theme) {
			vp.setAttribute("data-theme", this.resolvedTheme);
		}
		return vp;
	}

	_applyOffset(vp, pos) {
		const offset = this.offset;
		// Se limpia siempre: el offset puede cambiar en caliente y lo anterior
		// no debe quedarse pegado.
		for (const side of ["top", "right", "bottom", "left"]) {
			vp.style.removeProperty(side);
		}
		if (offset == null) return;
		const o =
			typeof offset === "object"
				? offset
				: { top: offset, right: offset, bottom: offset, left: offset };
		const px = (v) => (typeof v === "number" ? `${v}px` : v);
		if (pos.startsWith("top") && o.top) vp.style.top = px(o.top);
		if (pos.startsWith("bottom") && o.bottom) vp.style.bottom = px(o.bottom);
		if (pos.endsWith("left") && o.left) vp.style.left = px(o.left);
		if (pos.endsWith("right") && o.right) vp.style.right = px(o.right);
	}

	/* --------------------------------- Render --------------------------------- */

	_render(list) {
		const seen = new Set();

		for (const item of list) {
			seen.add(item.id);
			const pos = item.position ?? this.position;
			const resolved = {
				...item,
				position: pos,
				styles: mergeStyles(this.styles, item.styles),
				fill: item.fill ?? (this.theme ? THEME_FILLS[this.resolvedTheme] : undefined),
			};

			let toast = this.toasts.get(item.id);
			// Se volvio a lanzar un id que estaba saliendo: ese toast ya esta
			// desvaneciendose y no puede quedarse con la llamada nueva, asi que se
			// rehace desde cero y entra como lo que es, una notificacion nueva.
			if (toast && toast.exiting && !item.exiting) {
				toast.destroy();
				this.toasts.delete(item.id);
				toast = undefined;
			}
			// La posicion cambio (del toast o del toaster): se rehace en el
			// viewport nuevo, que es quien manda la geometria y la direccion.
			if (toast && toast.pos !== pos) {
				toast.destroy();
				this.toasts.delete(item.id);
				toast = undefined;
			}
			if (!toast) {
				toast = new SileoToast(resolved, this);
				this.toasts.set(item.id, toast);
				this._viewport(pos).appendChild(toast.root);
			} else if (toast.instanceId !== item.instanceId) {
				toast.update(resolved);
			} else {
				// el tema o los estilos pueden cambiar sin que el toast se rehaga
				toast.setFill(resolved.fill);
				toast.applyStyles(resolved.styles, resolved.className);
			}
			toast.instanceId = item.instanceId;

			if (item.exiting) toast.exit();
		}

		// Quitar los que ya no estan
		for (const [id, toast] of this.toasts) {
			if (!seen.has(id)) {
				toast.destroy();
				this.toasts.delete(id);
			}
		}

		// El tema puede cambiar sin que se cree ningun viewport: _viewport() solo
		// corre al insertar un toast, asi que aqui se refresca en los que ya hay.
		const styles = this.styles;
		for (const [pos, vp] of this.viewports) {
			if (this.theme) vp.setAttribute("data-theme", this.resolvedTheme);
			else vp.removeAttribute("data-theme");
			styleNode(vp, styles?.viewport);
			styleNode(vp._sileoChip, styles?.count);
			// despues de styleNode: el offset manda sobre el estilo de usuario
			this._applyOffset(vp, pos);
		}

		this._order(list);
		this._syncTimers(list);
		this._gcViewports();
		this._checkPointer();
	}

	/**
	 * Un toast que nace (o crece) debajo del cursor no recibe `pointerenter`,
	 * asi que el stack se calienta aqui: mientras el puntero este dentro, el
	 * panel se queda abierto y el auto-dismiss en pausa, igual que si hubiera
	 * entrado. Al salir sale el `pointerleave` de siempre y el tiempo sigue.
	 */
	_checkPointer() {
		cancelAnimationFrame(this.pointerRaf);
		if (typeof requestAnimationFrame !== "function") return;
		// Un frame despues: el viewport necesita su alto nuevo (--_sh) para que el
		// rect que se mide sea el que el usuario tiene delante.
		this.pointerRaf = requestAnimationFrame(() => {
			for (const [pos, vp] of this.viewports) {
				if (this.stacks.get(pos)?.hot) continue;
				if (pointerInside(vp)) this._setHot(pos, true);
			}
		});
	}

	/* ---------------------------------- Stack --------------------------------- */

	/** Rearma el orden de cada stack: no salientes, del mas nuevo al mas viejo. */
	_order(list) {
		for (const st of this.stacks.values()) st.order = [];

		for (const item of list) {
			if (item.exiting) continue;
			const st = this.stacks.get(item.position ?? this.position);
			if (st) st.order.unshift(item.id); // el mas nuevo queda al frente
		}

		for (const [pos, st] of this.stacks) {
			// Con el cursor fuera, el foco siempre es el frente: un toast nuevo se
			// lleva la atencion. Con el cursor dentro no se le roba el foco a la
			// tab que esta senalando, salvo que desaparezca.
			if (!st.hot || !st.order.includes(st.focusedId)) st.focusedId = st.order[0];
			this._applyFocus(pos);
		}
	}

	/**
	 * Medidas del stack. El CSS es la fuente de verdad: las custom properties
	 * estan registradas con @property, asi que getComputedStyle las devuelve ya
	 * resueltas a px y aqui basta con parsearlas.
	 */
	_metrics(pos) {
		const st = this.stacks.get(pos);
		if (st.metrics) return st.metrics;
		const cs = getComputedStyle(st.el);
		const num = (name, fallback) => {
			const v = parseFloat(cs.getPropertyValue(name));
			return Number.isFinite(v) ? v : fallback;
		};
		st.metrics = {
			h: num("--sileo-height", HEIGHT),
			overlap: num("--sileo-tab-overlap", TAB_OVERLAP),
			max: Math.max(
				1,
				Math.round(this.visibleToasts ?? num("--sileo-stack-max", STACK_MAX)),
			),
		};
		return st.metrics;
	}

	/**
	 * Coloca la fila de tabs, todas a la altura del titulo:
	 *   x[0]   = 0
	 *   x[i+1] = x[i] + ancho(i) - solape
	 * ancho(i) es el de la pill: el titulo completo si la tab esta enfocada, un
	 * circulo con el icono si no. La fila corre del borde de pantalla hacia
	 * dentro. Publica --_sh (alto del stack = alto de la enfocada, porque solo
	 * ella puede abrir su panel). No lee layout del DOM.
	 */
	_layout(pos) {
		const st = this.stacks.get(pos);
		if (!st || st.laying) return;
		const m = this._metrics(pos);
		const align = pillAlign(pos);
		// unica lectura de layout, antes de escribir nada
		const disponible = st.el.clientWidth || 0;

		// Con el cursor dentro se ven todas; en reposo solo --sileo-stack-max y el
		// resto se resume en el contador. La enfocada nunca se oculta.
		const fila = [];
		let ocultas = 0;
		st.order.forEach((id, i) => {
			const toast = this.toasts.get(id);
			if (!toast) return;
			const focused = id === st.focusedId;
			if (!st.hot && i >= m.max && !focused) {
				toast.setSlot({ i, tx: 0, focused, hidden: true });
				ocultas++;
				return;
			}
			fila.push({ toast, i, focused });
		});

		// Solo la enfocada se ensancha; las demas se quedan en su icono. Pero se
		// ensancha siempre al MISMO ancho, el de la mas ancha: asi lo que crece
		// compensa lo que se corre y su borde de entrada no se mueve al enfocarla.
		// Si midiera lo suyo, una tab de titulo corto se escaparia del puntero.
		let ancho = m.h;
		for (const slot of fila) ancho = Math.max(ancho, slot.toast.pillW || m.h);

		// La fila tiene que caber en el viewport: lo que se sale queda fuera de la
		// zona de hover, y esa tab seria inalcanzable. Se recorta primero el ancho
		// de la enfocada y luego lo que asoma de cada icono.
		const huecos = fila.length - 1;
		let pasoIcono = m.h - m.overlap;
		if (huecos > 0 && disponible > 0) {
			ancho = Math.max(m.h, Math.min(ancho, disponible - huecos * MIN_STEP));
			pasoIcono = Math.min(pasoIcono, (disponible - ancho) / huecos);
		}
		st.el.style.setProperty("--_tw", `${Math.round(ancho)}px`);

		let x = 0;
		let height = m.h;
		for (const slot of fila) {
			slot.x = x;
			slot.w = slot.focused ? ancho : m.h;
			if (slot.focused) height = Math.max(height, slot.toast.slotHeight(m.h));
			x += slot.focused ? slot.w - m.overlap : pasoIcono;
		}

		// El ancho de la fila solo hace falta para centrarla en las posiciones
		// *-center; en las demas basta el signo del corrimiento.
		const ultima = fila[fila.length - 1];
		const finFila = ultima ? ultima.x + ultima.w : 0;
		// El contador se monta solo CHIP_OVERLAP sobre la ultima: si se montara
		// como una tab mas, el numero quedaria debajo y solo se leeria el "+".
		const chipX = Math.max(0, finFila - CHIP_OVERLAP);
		const anchoFila = ocultas > 0 ? chipX + m.h : finFila;
		const corrimiento = (posX, w) =>
			align === "right" ? -posX : align === "left" ? posX : posX + w / 2 - anchoFila / 2;

		for (const slot of fila) {
			slot.toast.setSlot({
				i: slot.i,
				tx: corrimiento(slot.x, slot.w),
				focused: slot.focused,
				hidden: false,
			});
		}

		// El indicador va al final de la fila, como una carta mas del mazo. Solo
		// dice que hay mas, sin cuantas: el numero exacto se ve al abrirla.
		st.chip.textContent = "+";
		st.chip.style.setProperty("--_cx", `${Math.round(corrimiento(chipX, m.h))}px`);
		st.chip.style.setProperty("--_ci", String(fila.length));
		if (ocultas > 0) st.chip.setAttribute("data-visible", "true");
		else st.chip.removeAttribute("data-visible");

		st.el.style.setProperty("--_sh", `${height}px`);
		if (!st.hot) this._checkPointer();
	}

	/** Solo la tab enfocada puede expandirse; si el stack esta caliente, se abre. */
	_applyFocus(pos) {
		const st = this.stacks.get(pos);
		if (!st) return;
		st.laying = true; // silencia los _layout que disparen open/close
		for (const id of st.order) {
			const toast = this.toasts.get(id);
			if (!toast) continue;
			const focused = id === st.focusedId;
			toast.setAllowExpand(focused);
			if (focused && st.hot) toast.open();
		}
		st.laying = false;
		this._layout(pos);
	}

	_focus(pos, id) {
		const st = this.stacks.get(pos);
		if (!st || st.focusedId === id || !st.order.includes(id)) return;
		st.focusedId = id;
		this._applyFocus(pos);
	}

	_setHot(pos, hot) {
		const st = this.stacks.get(pos);
		if (!st) return;
		clearTimeout(st.leaveTimer);
		if (!hot) {
			// Red de seguridad: un reflow puede sacar una tab de debajo del cursor
			// y disparar un leave espurio justo antes del enter de la vecina.
			st.leaveTimer = setTimeout(() => this._cool(pos), HOVER_LEAVE_MS);
			return;
		}
		if (st.hot) return;
		st.hot = true;
		st.el.setAttribute("data-hot", "true");
		st.metrics = null; // el solape se relaja al entrar el cursor
		// El autopilot no debe cerrar el panel que el cursor esta senalando.
		for (const id of st.order) this.toasts.get(id)?.cancelAutopilot();
		this._clearTimers(); // pausa el auto-dismiss
		st.focusedId = st.order[0]; // al entrar, el foco arranca en el frente
		this._applyFocus(pos);
	}

	_cool(pos) {
		const st = this.stacks.get(pos);
		if (!st || !st.hot) return;
		st.hot = false;
		st.el.removeAttribute("data-hot");
		st.metrics = null; // vuelve el solape de reposo
		st.focusedId = st.order[0];
		// Reposo: cerrado. _applyFocus solo cierra las no enfocadas, asi que la
		// del frente se quedaria abierta si fue la ultima senalada.
		st.laying = true;
		for (const id of st.order) this.toasts.get(id)?.close();
		st.laying = false;
		this._applyFocus(pos);
		this._syncTimers(store.toasts);
	}

	get _anyHot() {
		for (const st of this.stacks.values()) if (st.hot) return true;
		return false;
	}

	_gcViewports() {
		for (const [pos, vp] of this.viewports) {
			// el contador es hijo fijo del viewport: lo que cuenta son los toasts
			if (!vp.querySelector("[data-sileo-toast]")) {
				clearTimeout(this.stacks.get(pos)?.leaveTimer);
				vp.remove();
				this.viewports.delete(pos);
				this.stacks.delete(pos);
			}
		}
	}

	/* --------------------------------- Timers --------------------------------- */

	_syncTimers(list) {
		const keys = new Set(list.map((t) => `${t.id}:${t.instanceId}`));
		for (const [key, timer] of this.timers) {
			if (!keys.has(key)) {
				clearTimeout(timer);
				this.timers.delete(key);
			}
		}
		if (this._anyHot) return;
		for (const item of list) {
			if (item.exiting || item.duration === null) continue;
			const key = `${item.id}:${item.instanceId}`;
			if (this.timers.has(key)) continue;
			const dur = item.duration ?? DEFAULT_TOAST_DURATION;
			if (dur <= 0) continue;
			this.timers.set(key, setTimeout(() => dismissToast(item.id), dur));
		}
	}

	_clearTimers() {
		for (const t of this.timers.values()) clearTimeout(t);
		this.timers.clear();
	}

	/* --------------------------------- Config --------------------------------- */

	/**
	 * Reconfigura el toaster en caliente: posicion, tema, offset, estilos...
	 * Todo lo que ya esta en pantalla se reajusta (los toasts que no pidieron
	 * posicion propia se mudan al viewport nuevo).
	 *
	 *   toaster.set({ theme: "dark" });
	 *   toaster.set({ position: "bottom-center" });
	 *   toaster.set({ styles: { toast: "top-90" } });   // mezcla
	 *   toaster.set({ options: null });                 // reset de los defaults
	 *
	 * Por defecto `options` y `styles` se mezclan con lo que ya hubiera. Pasa
	 * `replace: true` para que sustituyan (lo que usan los adaptadores
	 * reactivos, que ya mandan el estado completo).
	 */
	set(opts = {}) {
		const prevPosition = this.position;
		const replace = opts.replace === true;

		if (opts.position) {
			this.position = opts.position;
			store.position = opts.position;
		}
		if ("options" in opts) {
			store.options =
				opts.options == null
					? undefined
					: replace
						? { ...opts.options }
						: {
								...store.options,
								...opts.options,
								styles: mergeStyles(store.options?.styles, opts.options.styles),
							};
		}
		// Atajo: set({ styles }) toca solo los estilos, sin pisar el resto de
		// defaults. `null` los borra.
		if ("styles" in opts) {
			store.options = {
				...store.options,
				styles:
					opts.styles == null
						? undefined
						: replace
							? { ...opts.styles }
							: mergeStyles(store.options?.styles, opts.styles),
			};
		}
		if ("theme" in opts) {
			this.theme = opts.theme;
			this._watchTheme();
		}
		if ("offset" in opts) this.offset = opts.offset;
		if ("visibleToasts" in opts) this.visibleToasts = opts.visibleToasts;
		for (const st of this.stacks.values()) st.metrics = null;

		if (this.position !== prevPosition) {
			// Los toasts vivos que seguian a la posicion del toaster se mudan.
			store.update((prev) =>
				prev.map((t) =>
					t.positionExplicit || t.position !== prevPosition
						? t
						: { ...t, position: this.position },
				),
			);
			this._cleanupViewports();
		} else {
			this._render(store.toasts);
		}
	}

	/** Quita los viewports que se quedaron sin toasts (p.ej. tras mover todo). */
	_cleanupViewports() {
		const used = new Set();
		for (const toast of this.toasts.values()) used.add(toast.pos);
		for (const [pos, vp] of this.viewports) {
			if (used.has(pos) || pos === this.position) continue;
			clearTimeout(this.stacks.get(pos)?.leaveTimer);
			vp.remove();
			this.viewports.delete(pos);
			this.stacks.delete(pos);
		}
	}

	/** Config actual (util para pintar controles de tema/posicion). */
	get config() {
		return {
			position: this.position,
			theme: this.theme,
			resolvedTheme: this.resolvedTheme,
			offset: this.offset,
			visibleToasts: this.visibleToasts,
			options: store.options,
			styles: store.options?.styles,
		};
	}

	destroy() {
		store.listeners.delete(this.listener);
		cancelAnimationFrame(this.pointerRaf);
		this.mq?.removeEventListener("change", this.onMq);
		this._clearTimers();
		for (const toast of this.toasts.values()) toast.destroy();
		this.toasts.clear();
		for (const st of this.stacks.values()) clearTimeout(st.leaveTimer);
		this.stacks.clear();
		for (const vp of this.viewports.values()) vp.remove();
		this.viewports.clear();
		if (defaultToaster === this) defaultToaster = null;
	}
}

let defaultToaster = null;

/** Monta un toaster. Llamalo una vez (o deja que se auto-monte). */
export function createToaster(opts = {}) {
	if (defaultToaster) defaultToaster.set(opts);
	else defaultToaster = new Toaster(opts);
	return defaultToaster;
}

/**
 * Reconfigura el toaster en caliente desde cualquier sitio (sin framework):
 *
 *   configure({ theme: "dark" });
 *   configure({ position: "bottom-center" });
 *   configure({ styles: { toast: "top-90", badge: "ring-2" } });
 *
 * Si aun no hay toaster, lo monta.
 */
export function configure(opts = {}) {
	const toaster = ensureToaster();
	toaster?.set(opts);
	return toaster;
}

/** La config actual del toaster (o null si no hay). */
export function getConfig() {
	return defaultToaster ? defaultToaster.config : null;
}

/** El toaster montado, o null. Sirve para saber si ya lo creo alguien mas. */
export function getToaster() {
	return defaultToaster;
}

/** Auto-montaje perezoso: sileo.success(...) funciona sin setup. */
function ensureToaster() {
	if (!defaultToaster && typeof document !== "undefined") {
		defaultToaster = new Toaster({});
	}
	return defaultToaster;
}

export { Toaster, dismissToast, styleNode };
export default sileo;
