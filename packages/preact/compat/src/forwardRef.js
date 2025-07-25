import { options } from '../../src/index.js';
import { assign } from './util.js';

let oldDiffHook = options.__b;
options.__b = vnode => {
	if (vnode.type && vnode.type.__f && vnode.ref) {
		vnode.props.ref = vnode.ref;
		vnode.ref = null;
	}
	if (oldDiffHook) oldDiffHook(vnode);
};

export const REACT_FORWARD_SYMBOL =
	(typeof Symbol != 'undefined' &&
		Symbol.for &&
		Symbol.for('react.forward_ref')) ||
	0xf47;

/**
 * Pass ref down to a child. This is mainly used in libraries with HOCs that
 * wrap components. Using `forwardRef` there is an easy way to get a reference
 * of the wrapped component instead of one of the wrapper itself.
 * @param {import('./index').ForwardFn} fn
 * @returns {import('./internal').FunctionComponent}
 */
export function forwardRef(fn) {
	function Forwarded(props) {
		let clone = assign({}, props);
		delete clone.ref;
		return fn(clone, props.ref || null);
	}

	// mobx-react checks for this being present
	Forwarded.$$typeof = REACT_FORWARD_SYMBOL;
	// mobx-react heavily relies on implementation details.
	// It expects an object here with a `render` property,
	// and prototype.render will fail. Without this
	// mobx-react throws.
	Forwarded.render = Forwarded;

	Forwarded.prototype.isReactComponent = Forwarded.__f = true;
	Forwarded.displayName = 'ForwardRef(' + (fn.displayName || fn.name) + ')';
	return Forwarded;
}
