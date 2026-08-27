/**
 * Guion de la documentación. Lo comparten index.html (es) y en.html (en): lo
 * único que cambia entre idiomas son los textos de los ejemplos vivos, que
 * salen de la tabla de abajo según el `lang` del documento.
 */

import { sileo, createToaster } from "../src/sileo.js";

const LANG = document.documentElement.lang === "en" ? "en" : "es";

const T = {
	es: {
		copiar: "copiar",
		copiado: "copiado",
		fallo: "no se pudo",
		nombres: ["Uno", "Dos", "Tres", "Cuatro", "Cinco"],
		mensajeDe: (n) => `Mensaje de la notificación ${n.toLowerCase()}.`,
		guardado: "Guardado",
		sincronizado: "Tus cambios se sincronizaron.",
		sincronizadoLargo: "Tus cambios se sincronizaron con el servidor.",
		sinId: "Con id propio",
		reemplaza: "Reemplaza al anterior",
		gracias: "Gracias",
		iconoPropio: "Icono propio pasado como { html }.",
		subiendo: "Subiendo",
		enviando: "Enviando archivo…",
		subido: "Subido",
		fallo2: "Falló",
		guardando: "Guardando",
		unMomento: "Un momento…",
		error: "Error",
		aqui: "Aquí.",
		capsulaOscura: "Cápsula oscura.",
		estilos: "Estilos",
		estilosOn: "Título en versalitas y descripción azul, desde options.styles.",
		estilosOff: "Los estilos globales se han quitado.",
		capsulaClara: "Cápsula clara.",
		sigueSistema: "Sigue al sistema.",
		archivo: "reporte.pdf",
		sinConexion: "sin conexión",
	},
	en: {
		copiar: "copy",
		copiado: "copied",
		fallo: "failed",
		nombres: ["One", "Two", "Three", "Four", "Five"],
		mensajeDe: (n) => `Message from notification ${n.toLowerCase()}.`,
		guardado: "Saved",
		sincronizado: "Your changes were synced.",
		sincronizadoLargo: "Your changes were synced with the server.",
		sinId: "With its own id",
		reemplaza: "Replaces the previous one",
		gracias: "Thanks",
		iconoPropio: "Custom icon passed as { html }.",
		subiendo: "Uploading",
		enviando: "Sending file…",
		subido: "Uploaded",
		fallo2: "Failed",
		guardando: "Saving",
		unMomento: "One moment…",
		error: "Error",
		aqui: "Here.",
		capsulaOscura: "Dark capsule.",
		estilos: "Styles",
		estilosOn: "Uppercase title and blue description, straight from options.styles.",
		estilosOff: "The global styles are gone.",
		capsulaClara: "Light capsule.",
		sigueSistema: "Follows the system.",
		archivo: "report.pdf",
		sinConexion: "no connection",
	},
}[LANG];

const toaster = createToaster({ position: "top-right", theme: "system" });

/* ------------------------------ Ejemplos vivos ---------------------------- */

const wait = (ms, ok = true) =>
	new Promise((res, rej) =>
		setTimeout(ok ? res : rej, ms, ok ? { nombre: T.archivo } : new Error(T.sinConexion)),
	);

const corazon =
	'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';

const apilar = (n) => {
	const kinds = [sileo.success, sileo.info, sileo.warning, sileo.error, sileo.action];
	for (let i = 0; i < n; i++) {
		setTimeout(
			() =>
				kinds[i]({
					id: `demo-${i}`,
					title: T.nombres[i],
					description: T.mensajeDe(T.nombres[i]),
				}),
			i * 280,
		);
	}
};

const ejemplos = {
	success: () => sileo.success({ id: "d1", title: T.guardado, description: T.sincronizado }),
	quick: () =>
		sileo.success({ id: "quick", title: T.guardado, description: T.sincronizadoLargo }),
	"mismo-id": () =>
		sileo.info({
			id: "mismo",
			title: T.sinId,
			description: `${T.reemplaza} · ${new Date().toLocaleTimeString()}`,
		}),
	"sin-id": () =>
		sileo.success({
			title: T.guardado,
			description: `${T.sincronizado} · ${new Date().toLocaleTimeString()}`,
		}),
	ids: () => apilar(3),
	stack: () => apilar(3),
	stack5: () => apilar(5),
	clear: () => sileo.clear(),
	icono: () =>
		sileo.info({
			id: "icono",
			title: T.gracias,
			icon: { html: corazon },
			description: T.iconoPropio,
		}),
	promise: () =>
		sileo
			.promise(() => wait(1600), {
				loading: { id: "pr", title: T.subiendo, description: T.enviando },
				success: (data) => ({ title: T.subido, description: data.nombre }),
				error: () => ({ title: T.fallo2 }),
			})
			.catch(() => {}),
	"promise-fail": () =>
		sileo
			.promise(() => wait(1400, false), {
				loading: { id: "pf", title: T.guardando, description: T.unMomento },
				success: () => ({ title: T.guardado }),
				error: (err) => ({ title: T.error, description: String(err.message) }),
			})
			.catch(() => {}),
	"pos-tl": () =>
		sileo.success({ id: "p1", title: "top-left", position: "top-left", description: T.aqui }),
	"pos-tc": () =>
		sileo.info({ id: "p2", title: "top-center", position: "top-center", description: T.aqui }),
	"pos-br": () =>
		sileo.warning({ id: "p3", title: "bottom-right", position: "bottom-right", description: T.aqui }),
	"reset-pos": () => {
		sileo.clear();
		toaster.set({ position: "top-right" });
	},
	"tema-claro": () => {
		toaster.set({ theme: "light" });
		sileo.success({ id: "t", title: "theme: light", description: T.capsulaOscura });
	},
	"tema-oscuro": () => {
		toaster.set({ theme: "dark" });
		sileo.success({ id: "t", title: "theme: dark", description: T.capsulaClara });
	},
	"estilos-on": () => {
		toaster.set({
			styles: {
				title: { textTransform: "uppercase", letterSpacing: "0.08em" },
				description: { color: "#38bdf8" },
			},
		});
		sileo.info({ id: "st", title: T.estilos, description: T.estilosOn });
	},
	"estilos-off": () => {
		toaster.set({ styles: null });
		sileo.info({ id: "st", title: T.estilos, description: T.estilosOff });
	},
	"tema-sistema": () => {
		toaster.set({ theme: "system" });
		sileo.success({ id: "t", title: "theme: system", description: T.sigueSistema });
	},
};

for (const btn of document.querySelectorAll("[data-run]")) {
	btn.addEventListener("click", () => ejemplos[btn.dataset.run]?.());
}

/* --------------------------------- Idioma --------------------------------- */
/* El enlace guarda la elección para que la próxima visita entre directa, y
   arrastra el ancla para no perder la sección en la que estabas. */

for (const a of document.querySelectorAll("[data-lang]")) {
	a.addEventListener("click", () => {
		try {
			localStorage.setItem("sileo-docs-lang", a.dataset.lang);
		} catch {}
		if (location.hash) a.href = a.getAttribute("href").split("#")[0] + location.hash;
	});
}

/* ------------------------------ Botón copiar ------------------------------ */

for (const bloque of document.querySelectorAll(".codigo")) {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "copiar";
	btn.textContent = T.copiar;
	btn.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(bloque.querySelector("code").textContent);
			btn.textContent = T.copiado;
		} catch {
			btn.textContent = T.fallo;
		}
		setTimeout(() => (btn.textContent = T.copiar), 1400);
	});
	bloque.appendChild(btn);
}

/* --------------------------- Menú en pantallas pequeñas ------------------- */

const menu = document.getElementById("menu");
const estrecho = window.matchMedia("(max-width: 900px)");
const sincronizarMenu = () => (menu.open = !estrecho.matches);
estrecho.addEventListener("change", sincronizarMenu);
sincronizarMenu();
menu.addEventListener("click", (e) => {
	if (estrecho.matches && e.target.closest("nav a")) menu.open = false;
});

/* ------------------------- Resaltar sección actual ------------------------ */

const enlaces = new Map(
	[...document.querySelectorAll(".lateral nav a")].map((a) => [a.getAttribute("href").slice(1), a]),
);
let actual = null;
const marcar = (id) => {
	if (id === actual) return;
	actual = id;
	for (const [key, a] of enlaces) a.classList.toggle("activo", key === id);
};

const observador = new IntersectionObserver(
	(entries) => {
		// la sección visible más alta gana
		const visibles = entries
			.filter((e) => e.isIntersecting)
			.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
		if (visibles[0]) marcar(visibles[0].target.id);
	},
	{ rootMargin: "0px 0px -70% 0px", threshold: 0 },
);
for (const s of document.querySelectorAll("main section[id]")) observador.observe(s);
