import { Component, createElement, options, Fragment } from '../../src/index.js';
import { MODE_HYDRATE } from '../../src/constants.js';
import { assign } from './util.js';

const oldCatchError = options.__e;
options.__e = function (error, newVNode, oldVNode, errorInfo) {
	if (error.then) {
		/** @type {import('./internal').Component} */
		let component;
		let vnode = newVNode;

		for (; (vnode = vnode.__); ) {
			if ((component = vnode.__c) && component.__c) {
				if (newVNode.__e == null) {
					newVNode.__e = oldVNode.__e;
					newVNode.__k = oldVNode.__k;
				}
				// Don't call oldCatchError if we found a Suspense
				return component.__c(error, newVNode);
			}
		}
	}
	oldCatchError(error, newVNode, oldVNode, errorInfo);
};

const oldUnmount = options.unmount;
options.unmount = function (vnode) {
	/** @type {import('./internal').Component} */
	const component = vnode.__c;
	if (component && component.__R) {
		component.__R();
	}

	// if the component is still hydrating
	// most likely it is because the component is suspended
	// we set the vnode.type as `null` so that it is not a typeof function
	// so the unmount will remove the vnode._dom
	if (component && vnode.__u & MODE_HYDRATE) {
		vnode.type = null;
	}

	if (oldUnmount) oldUnmount(vnode);
};

function detachedClone(vnode, detachedParent, parentDom) {
	if (vnode) {
		if (vnode.__c && vnode.__c.__H) {
			vnode.__c.__H.__.forEach(effect => {
				if (typeof effect.__c == 'function') effect.__c();
			});

			vnode.__c.__H = null;
		}

		vnode = assign({}, vnode);
		if (vnode.__c != null) {
			if (vnode.__c.__P === parentDom) {
				vnode.__c.__P = detachedParent;
			}

			vnode.__c.__e = true;

			vnode.__c = null;
		}

		vnode.__k =
			vnode.__k &&
			vnode.__k.map(child =>
				detachedClone(child, detachedParent, parentDom)
			);
	}

	return vnode;
}

function removeOriginal(vnode, detachedParent, originalParent) {
	if (vnode && originalParent) {
		vnode.__v = null;
		vnode.__k =
			vnode.__k &&
			vnode.__k.map(child =>
				removeOriginal(child, detachedParent, originalParent)
			);

		if (vnode.__c) {
			if (vnode.__c.__P === detachedParent) {
				if (vnode.__e) {
					originalParent.appendChild(vnode.__e);
				}
				vnode.__c.__e = true;
				vnode.__c.__P = originalParent;
			}
		}
	}

	return vnode;
}

// having custom inheritance instead of a class here saves a lot of bytes
export function Suspense() {
	// we do not call super here to golf some bytes...
	this.__u = 0;
	this._suspenders = null;
	this.__b = null;
}

// Things we do here to save some bytes but are not proper JS inheritance:
// - call `new Component()` as the prototype
// - do not set `Suspense.prototype.constructor` to `Suspense`
Suspense.prototype = new Component();

/**
 * @this {import('./internal').SuspenseComponent}
 * @param {Promise} promise The thrown promise
 * @param {import('./internal').VNode<any, any>} suspendingVNode The suspending component
 */
Suspense.prototype.__c = function (promise, suspendingVNode) {
	const suspendingComponent = suspendingVNode.__c;

	/** @type {import('./internal').SuspenseComponent} */
	const c = this;

	if (c._suspenders == null) {
		c._suspenders = [];
	}
	c._suspenders.push(suspendingComponent);

	const resolve = suspended(c.__v);

	let resolved = false;
	const onResolved = () => {
		if (resolved) return;

		resolved = true;
		suspendingComponent.__R = null;

		if (resolve) {
			resolve(onSuspensionComplete);
		} else {
			onSuspensionComplete();
		}
	};

	suspendingComponent.__R = onResolved;

	const onSuspensionComplete = () => {
		if (!--c.__u) {
			// If the suspension was during hydration we don't need to restore the
			// suspended children into the _children array
			if (c.state.__a) {
				const suspendedVNode = c.state.__a;
				c.__v.__k[0] = removeOriginal(
					suspendedVNode,
					suspendedVNode.__c.__P,
					suspendedVNode.__c.__O
				);
			}

			c.setState({ __a: (c.__b = null) });

			let suspended;
			while ((suspended = c._suspenders.pop())) {
				suspended.forceUpdate();
			}
		}
	};

	/**
	 * We do not set `suspended: true` during hydration because we want the actual markup
	 * to remain on screen and hydrate it when the suspense actually gets resolved.
	 * While in non-hydration cases the usual fallback -> component flow would occour.
	 */
	if (
		!c.__u++ &&
		!(suspendingVNode.__u & MODE_HYDRATE)
	) {
		c.setState({ __a: (c.__b = c.__v.__k[0]) });
	}
	promise.then(onResolved, onResolved);
};

Suspense.prototype.componentWillUnmount = function () {
	this._suspenders = [];
};

/**
 * @this {import('./internal').SuspenseComponent}
 * @param {import('./internal').SuspenseComponent["props"]} props
 * @param {import('./internal').SuspenseState} state
 */
Suspense.prototype.render = function (props, state) {
	if (this.__b) {
		// When the Suspense's _vnode was created by a call to createVNode
		// (i.e. due to a setState further up in the tree)
		// it's _children prop is null, in this case we "forget" about the parked vnodes to detach
		if (this.__v.__k) {
			const detachedParent = document.createElement('div');
			const detachedComponent = this.__v.__k[0].__c;
			this.__v.__k[0] = detachedClone(
				this.__b,
				detachedParent,
				(detachedComponent.__O = detachedComponent.__P)
			);
		}

		this.__b = null;
	}

	// Wrap fallback tree in a VNode that prevents itself from being marked as aborting mid-hydration:
	/** @type {import('./internal').VNode} */
	const fallback =
		state.__a && createElement(Fragment, null, props.fallback);
	if (fallback) fallback.__u &= ~MODE_HYDRATE;

	return [
		createElement(Fragment, null, state.__a ? null : props.children),
		fallback
	];
};

/**
 * Checks and calls the parent component's _suspended method, passing in the
 * suspended vnode. This is a way for a parent (e.g. SuspenseList) to get notified
 * that one of its children/descendants suspended.
 *
 * The parent MAY return a callback. The callback will get called when the
 * suspension resolves, notifying the parent of the fact.
 * Moreover, the callback gets function `unsuspend` as a parameter. The resolved
 * child descendant will not actually get unsuspended until `unsuspend` gets called.
 * This is a way for the parent to delay unsuspending.
 *
 * If the parent does not return a callback then the resolved vnode
 * gets unsuspended immediately when it resolves.
 *
 * @param {import('./internal').VNode} vnode
 * @returns {((unsuspend: () => void) => void)?}
 */
export function suspended(vnode) {
	/** @type {import('./internal').Component} */
	let component = vnode.__.__c;
	return component && component.__a && component.__a(vnode);
}

export function lazy(loader) {
	let prom;
	let component;
	let error;

	function Lazy(props) {
		if (!prom) {
			prom = loader();
			prom.then(
				exports => {
					component = exports.default || exports;
				},
				e => {
					error = e;
				}
			);
		}

		if (error) {
			throw error;
		}

		if (!component) {
			throw prom;
		}

		return createElement(component, props);
	}

	Lazy.displayName = 'Lazy';
	Lazy.__f = true;
	return Lazy;
}
