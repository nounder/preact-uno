import { h, options } from '../../preact/src/index.js';
import { useState, useRef } from '../../preact/hooks/src/index.js';

const oldDiff = options.__b;
options.__b = (vnode) => {
	if (vnode.type && vnode.type._forwarded && vnode.ref) {
		vnode.props.ref = vnode.ref;
		vnode.ref = null;
	}
	if (oldDiff) oldDiff(vnode);
};

export default function lazy(load) {
	let p, c;

	const loadModule = () =>
		load().then(m => (c = (m && m.default) || m));

	const LazyComponent = props => {
		const [, update] = useState(0);
		const r = useRef(c);
		if (!p) p = loadModule();
		if (c !== undefined) return h(c, props);
		if (!r.current) r.current = p.then(() => update(1));
		throw p;
	};

	LazyComponent.preload = () => {
		if (!p) p = loadModule();
		return p;
	}

	LazyComponent._forwarded = true;
	return LazyComponent;
}

// See https://github.com/preactjs/preact/blob/88680e91ec0d5fc29d38554a3e122b10824636b6/compat/src/suspense.js#L5
const oldCatchError = options.__e;
options.__e = (err, newVNode, oldVNode) => {
	if (err && err.then) {
		let v = newVNode;
		while ((v = v.__)) {
			if (v.__c && v.__c.__c) {
				if (newVNode.__e == null) {
					newVNode.__c.__z = [oldVNode.__e];
					newVNode.__e = oldVNode.__e; // ._dom
					newVNode.__k = oldVNode.__k; // ._children
				}
				if (!newVNode.__k) newVNode.__k = [];
				return v.__c.__c(err, newVNode);
			}
		}
	}
	if (oldCatchError) oldCatchError(err, newVNode, oldVNode);
};

export function ErrorBoundary(props) {
	this.__c = childDidSuspend;
	this.componentDidCatch = props.onError;
	return props.children;
}

function childDidSuspend(err) {
	err.then(() => this.forceUpdate());
}
