import { assign } from './util.js';
import { diff, commitRoot } from './diff/index.js';
import options from './options.js';
import { Fragment } from './create-element.js';
import { MODE_HYDRATE, NULL } from './constants.js';

/**
 * Base Component class. Provides `setState()` and `forceUpdate()`, which
 * trigger rendering
 * @param {object} props The initial component props
 * @param {object} context The initial context from parent components'
 * getChildContext
 */
export function BaseComponent(props, context) {
	this.props = props;
	this.context = context;
}

/**
 * Update component state and schedule a re-render.
 * @this {import('./internal').Component}
 * @param {object | ((s: object, p: object) => object)} update A hash of state
 * properties to update with new values or a function that given the current
 * state and props returns a new partial state
 * @param {() => void} [callback] A function to be called once component state is
 * updated
 */
BaseComponent.prototype.setState = function (update, callback) {
	// only clone state when copying to nextState the first time.
	let s;
	if (this.__s != NULL && this.__s != this.state) {
		s = this.__s;
	} else {
		s = this.__s = assign({}, this.state);
	}

	if (typeof update == 'function') {
		// Some libraries like `immer` mark the current state as readonly,
		// preventing us from mutating it, so we need to clone it. See #2716
		update = update(assign({}, s), this.props);
	}

	if (update) {
		assign(s, update);
	}

	// Skip update if updater function returned null
	if (update == NULL) return;

	if (this.__v) {
		if (callback) {
			this._sb.push(callback);
		}
		enqueueRender(this);
	}
};

/**
 * Immediately perform a synchronous re-render of the component
 * @this {import('./internal').Component}
 * @param {() => void} [callback] A function to be called after component is
 * re-rendered
 */
BaseComponent.prototype.forceUpdate = function (callback) {
	if (this.__v) {
		// Set render mode so that we can differentiate where the render request
		// is coming from. We need this because forceUpdate should never call
		// shouldComponentUpdate
		this.__e = true;
		if (callback) this.__h.push(callback);
		enqueueRender(this);
	}
};

/**
 * Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
 * Virtual DOM is generally constructed via [JSX](https://jasonformat.com/wtf-is-jsx).
 * @param {object} props Props (eg: JSX attributes) received from parent
 * element/component
 * @param {object} state The component's current state
 * @param {object} context Context object, as returned by the nearest
 * ancestor's `getChildContext()`
 * @returns {ComponentChildren | void}
 */
BaseComponent.prototype.render = Fragment;

/**
 * @param {import('./internal').VNode} vnode
 * @param {number | null} [childIndex]
 */
export function getDomSibling(vnode, childIndex) {
	if (childIndex == NULL) {
		// Use childIndex==null as a signal to resume the search from the vnode's sibling
		return vnode.__
			? getDomSibling(vnode.__, vnode.__i + 1)
			: NULL;
	}

	let sibling;
	for (; childIndex < vnode.__k.length; childIndex++) {
		sibling = vnode.__k[childIndex];

		if (sibling != NULL && sibling.__e != NULL) {
			// Since updateParentDomPointers keeps _dom pointer correct,
			// we can rely on _dom to tell us if this subtree contains a
			// rendered DOM node, and what the first rendered DOM node is
			return sibling.__e;
		}
	}

	// If we get here, we have not found a DOM node in this vnode's children.
	// We must resume from this vnode's sibling (in it's parent _children array)
	// Only climb up and search the parent if we aren't searching through a DOM
	// VNode (meaning we reached the DOM parent of the original vnode that began
	// the search)
	return typeof vnode.type == 'function' ? getDomSibling(vnode) : NULL;
}

/**
 * Trigger in-place re-rendering of a component.
 * @param {import('./internal').Component} component The component to rerender
 */
function renderComponent(component) {
	let oldVNode = component.__v,
		oldDom = oldVNode.__e,
		commitQueue = [],
		refQueue = [];

	if (component.__P) {
		const newVNode = assign({}, oldVNode);
		newVNode.__v = oldVNode.__v + 1;
		if (options.vnode) options.vnode(newVNode);

		diff(
			component.__P,
			newVNode,
			oldVNode,
			component.__n,
			component.__P.namespaceURI,
			oldVNode.__u & MODE_HYDRATE ? [oldDom] : NULL,
			commitQueue,
			oldDom == NULL ? getDomSibling(oldVNode) : oldDom,
			!!(oldVNode.__u & MODE_HYDRATE),
			refQueue
		);

		newVNode.__v = oldVNode.__v;
		newVNode.__.__k[newVNode.__i] = newVNode;
		commitRoot(commitQueue, newVNode, refQueue);

		if (newVNode.__e != oldDom) {
			updateParentDomPointers(newVNode);
		}
	}
}

/**
 * @param {import('./internal').VNode} vnode
 */
function updateParentDomPointers(vnode) {
	if ((vnode = vnode.__) != NULL && vnode.__c != NULL) {
		vnode.__e = vnode.__c.base = NULL;
		for (let i = 0; i < vnode.__k.length; i++) {
			let child = vnode.__k[i];
			if (child != NULL && child.__e != NULL) {
				vnode.__e = vnode.__c.base = child.__e;
				break;
			}
		}

		return updateParentDomPointers(vnode);
	}
}

/**
 * The render queue
 * @type {Array<import('./internal').Component>}
 */
let rerenderQueue = [];

/*
 * The value of `Component.debounce` must asynchronously invoke the passed in callback. It is
 * important that contributors to Preact can consistently reason about what calls to `setState`, etc.
 * do, and when their effects will be applied. See the links below for some further reading on designing
 * asynchronous APIs.
 * * [Designing APIs for Asynchrony](https://blog.izs.me/2013/08/designing-apis-for-asynchrony)
 * * [Callbacks synchronous and asynchronous](https://blog.ometer.com/2011/07/24/callbacks-synchronous-and-asynchronous/)
 */

let prevDebounce;

const defer =
	typeof Promise == 'function'
		? Promise.prototype.then.bind(Promise.resolve())
		: setTimeout;

/**
 * Enqueue a rerender of a component
 * @param {import('./internal').Component} c The component to rerender
 */
export function enqueueRender(c) {
	if (
		(!c.__d &&
			(c.__d = true) &&
			rerenderQueue.push(c) &&
			!process.__r++) ||
		prevDebounce != options.debounceRendering
	) {
		prevDebounce = options.debounceRendering;
		(prevDebounce || defer)(process);
	}
}

/**
 * @param {import('./internal').Component} a
 * @param {import('./internal').Component} b
 */
const depthSort = (a, b) => a.__v.__b - b.__v.__b;

/** Flush the render queue by rerendering all queued components */
function process() {
	let c,
		l = 1;

	// Don't update `renderCount` yet. Keep its value non-zero to prevent unnecessary
	// process() calls from getting scheduled while `queue` is still being consumed.
	while (rerenderQueue.length) {
		// Keep the rerender queue sorted by (depth, insertion order). The queue
		// will initially be sorted on the first iteration only if it has more than 1 item.
		//
		// New items can be added to the queue e.g. when rerendering a provider, so we want to
		// keep the order from top to bottom with those new items so we can handle them in a
		// single pass
		if (rerenderQueue.length > l) {
			rerenderQueue.sort(depthSort);
		}

		c = rerenderQueue.shift();
		l = rerenderQueue.length;

		if (c.__d) {
			renderComponent(c);
		}
	}
	process.__r = 0;
}

process.__r = 0;
