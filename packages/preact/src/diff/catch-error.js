import { NULL } from '../constants.js';

/**
 * Find the closest error boundary to a thrown error and call it
 * @param {object} error The thrown value
 * @param {import('../internal').VNode} vnode The vnode that threw the error that was caught (except
 * for unmounting when this parameter is the highest parent that was being
 * unmounted)
 * @param {import('../internal').VNode} [oldVNode]
 * @param {import('../internal').ErrorInfo} [errorInfo]
 */
export function _catchError(error, vnode, oldVNode, errorInfo) {
	/** @type {import('../internal').Component} */
	let component,
		/** @type {import('../internal').ComponentType} */
		ctor,
		/** @type {boolean} */
		handled;

	for (; (vnode = vnode.__); ) {
		if ((component = vnode.__c) && !component.__) {
			try {
				ctor = component.constructor;

				if (ctor && ctor.getDerivedStateFromError != NULL) {
					component.setState(ctor.getDerivedStateFromError(error));
					handled = component.__d;
				}

				if (component.componentDidCatch != NULL) {
					component.componentDidCatch(error, errorInfo || {});
					handled = component.__d;
				}

				// This is an error boundary. Mark it as having bailed out, and whether it was mid-hydration.
				if (handled) {
					return (component.__E = component);
				}
			} catch (e) {
				error = e;
			}
		}
	}

	throw error;
}
