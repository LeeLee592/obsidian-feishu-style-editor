/**
 * Browser-side stand-in for the `obsidian` module, so the plugin's real
 * popup code can be rendered in a plain page for visual checks.
 *
 * Only what popup.ts and commands.ts actually touch is implemented: the DOM
 * helpers Obsidian adds to HTMLElement, and setIcon().
 */

const ICONS = globalThis.FSE_ICONS ?? {};

function installDomHelpers() {
	const proto = HTMLElement.prototype;

	proto.empty = function empty() {
		while (this.firstChild) {
			this.removeChild(this.firstChild);
		}
	};

	proto.setText = function setText(text) {
		this.textContent = text;
	};

	proto.toggleClass = function toggleClass(cls, value) {
		this.classList.toggle(cls, value === true);
	};

	proto.setAttr = function setAttr(name, value) {
		this.setAttribute(name, value);
	};

	proto.show = function show() {
		this.style.removeProperty('display');
	};

	proto.hide = function hide() {
		this.style.display = 'none';
	};

	proto.createEl = function createEl(tag, options = {}) {
		const el = this.ownerDocument.createElement(tag);
		if (options.cls) {
			el.className = options.cls;
		}
		if (options.text !== undefined) {
			el.textContent = options.text;
		}
		for (const [key, value] of Object.entries(options.attr ?? {})) {
			el.setAttribute(key, value);
		}
		this.appendChild(el);
		return el;
	};

	proto.createDiv = function createDiv(options) {
		return this.createEl('div', options);
	};

	proto.createSpan = function createSpan(options) {
		return this.createEl('span', options);
	};

	Object.defineProperty(proto, 'win', {
		get() {
			return this.ownerDocument.defaultView;
		},
	});
}

installDomHelpers();

export function getLanguage() {
	return globalThis.FSE_LANG ?? 'en';
}

export function setIcon(parent, iconId) {
	const raw = ICONS[iconId];
	if (!raw) {
		parent.textContent = '□';
		return;
	}
	const svg = new DOMParser()
		.parseFromString(raw, 'image/svg+xml')
		.documentElement;
	parent.appendChild(parent.ownerDocument.importNode(svg, true));
}
