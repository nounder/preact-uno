import {
	EMPTY_OBJ,
	MATH_NAMESPACE,
	MODE_HYDRATE,
	MODE_SUSPENDED,
	NULL,
	RESET_MODE,
	SVG_NAMESPACE,
	UNDEFINED,
	XHTML_NAMESPACE
} from '../constants.js';
import { BaseComponent, getDomSibling } from '../component.js';
import { Fragment } from '../create-element.js';
import { diffChildren } from './children.js';
import { setProperty } from './props.js';
import { assign, isArray, removeNode, slice } from '../util.js';
import options from '../options.js';

/**
 * @typedef {import('../internal').ComponentChildren} ComponentChildren
 * @typedef {import('../internal').Component} Component
 * @typedef {import('../internal').PreactElement} PreactElement
 * @typedef {import('../internal').VNode} VNode
 */

/**
 * @template {any} T
 * @typedef {import('../internal').Ref<T>} Ref<T>
 */

/**
 * Diff two virtual nodes and apply proper changes to the DOM
 * @param {PreactElement} parentDom The parent of the DOM element
 * @param {VNode} newVNode The new virtual node
 * @param {VNode} oldVNode The old virtual node
 * @param {object} globalContext The current context object. Modified by
 * getChildContext
 * @param {string} namespace Current namespace of the DOM node (HTML, SVG, or MathML)
 * @param {Array<PreactElement>} excessDomChildren
 * @param {Array<Component>} commitQueue List of components which have callbacks
 * to invoke in commitRoot
 * @param {PreactElement} oldDom The current attached DOM element any new dom
 * elements should be placed around. Likely `null` on first render (except when
 * hydrating). Can be a sibling DOM element when diffing Fragments that have
 * siblings. In most cases, it starts out as `oldChildren[0]._dom`.
 * @param {boolean} isHydrating Whether or not we are in hydration
 * @param {any[]} refQueue an array of elements needed to invoke refs
 */
export function diff(
	parentDom,
	newVNode,
	oldVNode,
	globalContext,
	namespace,
	excessDomChildren,
	commitQueue,
	oldDom,
	isHydrating,
	refQueue
) {
	/** @type {any} */
	let tmp,
		newType = newVNode.type;

	// When passing through createElement it assigns the object
	// constructor as undefined. This to prevent JSON-injection.
	if (newVNode.constructor != UNDEFINED) return NULL;

	// If the previous diff bailed out, resume creating/hydrating.
	if (oldVNode.__u & MODE_SUSPENDED) {
		isHydrating = !!(oldVNode.__u & MODE_HYDRATE);
		oldDom = newVNode.__e = oldVNode.__e;
		excessDomChildren = [oldDom];
	}

	if ((tmp = options.__b)) tmp(newVNode);

	outer: if (typeof newType == 'function') {
		try {
			let c, isNew, oldProps, oldState, snapshot, clearProcessingException;
			let newProps = newVNode.props;
			const isClassComponent =
				'prototype' in newType && newType.prototype.render;

			// Necessary for createContext api. Setting this property will pass
			// the context value as `this.context` just for this component.
			tmp = newType.contextType;
			let provider = tmp && globalContext[tmp.__c];
			let componentContext = tmp
				? provider
					? provider.props.value
					: tmp.__
				: globalContext;

			// Get component and set it to `c`
			if (oldVNode.__c) {
				c = newVNode.__c = oldVNode.__c;
				clearProcessingException = c.__ = c.__E;
			} else {
				// Instantiate the new component
				if (isClassComponent) {
					// @ts-expect-error The check above verifies that newType is suppose to be constructed
					newVNode.__c = c = new newType(newProps, componentContext); // eslint-disable-line new-cap
				} else {
					// @ts-expect-error Trust me, Component implements the interface we want
					newVNode.__c = c = new BaseComponent(
						newProps,
						componentContext
					);
					c.constructor = newType;
					c.render = doRender;
				}
				if (provider) provider.sub(c);

				c.props = newProps;
				if (!c.state) c.state = {};
				c.context = componentContext;
				c.__n = globalContext;
				isNew = c.__d = true;
				c.__h = [];
				c._sb = [];
			}

			// Invoke getDerivedStateFromProps
			if (isClassComponent && c.__s == NULL) {
				c.__s = c.state;
			}

			if (isClassComponent && newType.getDerivedStateFromProps != NULL) {
				if (c.__s == c.state) {
					c.__s = assign({}, c.__s);
				}

				assign(
					c.__s,
					newType.getDerivedStateFromProps(newProps, c.__s)
				);
			}

			oldProps = c.props;
			oldState = c.state;
			c.__v = newVNode;

			// Invoke pre-render lifecycle methods
			if (isNew) {
				if (
					isClassComponent &&
					newType.getDerivedStateFromProps == NULL &&
					c.componentWillMount != NULL
				) {
					c.componentWillMount();
				}

				if (isClassComponent && c.componentDidMount != NULL) {
					c.__h.push(c.componentDidMount);
				}
			} else {
				if (
					isClassComponent &&
					newType.getDerivedStateFromProps == NULL &&
					newProps !== oldProps &&
					c.componentWillReceiveProps != NULL
				) {
					c.componentWillReceiveProps(newProps, componentContext);
				}

				if (
					(!c.__e &&
						c.shouldComponentUpdate != NULL &&
						c.shouldComponentUpdate(
							newProps,
							c.__s,
							componentContext
						) === false) ||
					newVNode.__v == oldVNode.__v
				) {
					// More info about this here: https://gist.github.com/JoviDeCroock/bec5f2ce93544d2e6070ef8e0036e4e8
					if (newVNode.__v != oldVNode.__v) {
						// When we are dealing with a bail because of sCU we have to update
						// the props, state and dirty-state.
						// when we are dealing with strict-equality we don't as the child could still
						// be dirtied see #3883
						c.props = newProps;
						c.state = c.__s;
						c.__d = false;
					}

					newVNode.__e = oldVNode.__e;
					newVNode.__k = oldVNode.__k;
					newVNode.__k.some(vnode => {
						if (vnode) vnode.__ = newVNode;
					});

					for (let i = 0; i < c._sb.length; i++) {
						c.__h.push(c._sb[i]);
					}
					c._sb = [];

					if (c.__h.length) {
						commitQueue.push(c);
					}

					break outer;
				}

				if (c.componentWillUpdate != NULL) {
					c.componentWillUpdate(newProps, c.__s, componentContext);
				}

				if (isClassComponent && c.componentDidUpdate != NULL) {
					c.__h.push(() => {
						c.componentDidUpdate(oldProps, oldState, snapshot);
					});
				}
			}

			c.context = componentContext;
			c.props = newProps;
			c.__P = parentDom;
			c.__e = false;

			let renderHook = options.__r,
				count = 0;
			if (isClassComponent) {
				c.state = c.__s;
				c.__d = false;

				if (renderHook) renderHook(newVNode);

				tmp = c.render(c.props, c.state, c.context);

				for (let i = 0; i < c._sb.length; i++) {
					c.__h.push(c._sb[i]);
				}
				c._sb = [];
			} else {
				do {
					c.__d = false;
					if (renderHook) renderHook(newVNode);

					tmp = c.render(c.props, c.state, c.context);

					// Handle setState called in render, see #2553
					c.state = c.__s;
				} while (c.__d && ++count < 25);
			}

			// Handle setState called in render, see #2553
			c.state = c.__s;

			if (c.getChildContext != NULL) {
				globalContext = assign(assign({}, globalContext), c.getChildContext());
			}

			if (isClassComponent && !isNew && c.getSnapshotBeforeUpdate != NULL) {
				snapshot = c.getSnapshotBeforeUpdate(oldProps, oldState);
			}

			let isTopLevelFragment =
				tmp != NULL && tmp.type === Fragment && tmp.key == NULL;
			let renderResult = tmp;

			if (isTopLevelFragment) {
				renderResult = cloneNode(tmp.props.children);
			}

			oldDom = diffChildren(
				parentDom,
				isArray(renderResult) ? renderResult : [renderResult],
				newVNode,
				oldVNode,
				globalContext,
				namespace,
				excessDomChildren,
				commitQueue,
				oldDom,
				isHydrating,
				refQueue
			);

			c.base = newVNode.__e;

			// We successfully rendered this VNode, unset any stored hydration/bailout state:
			newVNode.__u &= RESET_MODE;

			if (c.__h.length) {
				commitQueue.push(c);
			}

			if (clearProcessingException) {
				c.__E = c.__ = NULL;
			}
		} catch (e) {
			newVNode.__v = NULL;
			// if hydrating or creating initial tree, bailout preserves DOM:
			if (isHydrating || excessDomChildren != NULL) {
				if (e.then) {
					newVNode.__u |= isHydrating
						? MODE_HYDRATE | MODE_SUSPENDED
						: MODE_SUSPENDED;

					while (oldDom && oldDom.nodeType == 8 && oldDom.nextSibling) {
						oldDom = oldDom.nextSibling;
					}

					excessDomChildren[excessDomChildren.indexOf(oldDom)] = NULL;
					newVNode.__e = oldDom;
				} else {
					for (let i = excessDomChildren.length; i--; ) {
						removeNode(excessDomChildren[i]);
					}
				}
			} else {
				newVNode.__e = oldVNode.__e;
				newVNode.__k = oldVNode.__k;
			}
			options.__e(e, newVNode, oldVNode);
		}
	} else if (
		excessDomChildren == NULL &&
		newVNode.__v == oldVNode.__v
	) {
		newVNode.__k = oldVNode.__k;
		newVNode.__e = oldVNode.__e;
	} else {
		oldDom = newVNode.__e = diffElementNodes(
			oldVNode.__e,
			newVNode,
			oldVNode,
			globalContext,
			namespace,
			excessDomChildren,
			commitQueue,
			isHydrating,
			refQueue
		);
	}

	if ((tmp = options.diffed)) tmp(newVNode);

	return newVNode.__u & MODE_SUSPENDED ? undefined : oldDom;
}

/**
 * @param {Array<Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {VNode} root
 */
export function commitRoot(commitQueue, root, refQueue) {
	for (let i = 0; i < refQueue.length; i++) {
		applyRef(refQueue[i], refQueue[++i], refQueue[++i]);
	}

	if (options.__c) options.__c(root, commitQueue);

	commitQueue.some(c => {
		try {
			// @ts-expect-error Reuse the commitQueue variable here so the type changes
			commitQueue = c.__h;
			c.__h = [];
			commitQueue.some(cb => {
				// @ts-expect-error See above comment on commitQueue
				cb.call(c);
			});
		} catch (e) {
			options.__e(e, c.__v);
		}
	});
}

function cloneNode(node) {
	if (
		typeof node != 'object' ||
		node == NULL ||
		(node.__b && node.__b > 0)
	) {
		return node;
	}

	if (isArray(node)) {
		return node.map(cloneNode);
	}

	return assign({}, node);
}

/**
 * Diff two virtual nodes representing DOM element
 * @param {PreactElement} dom The DOM element representing the virtual nodes
 * being diffed
 * @param {VNode} newVNode The new virtual node
 * @param {VNode} oldVNode The old virtual node
 * @param {object} globalContext The current context object
 * @param {string} namespace Current namespace of the DOM node (HTML, SVG, or MathML)
 * @param {Array<PreactElement>} excessDomChildren
 * @param {Array<Component>} commitQueue List of components which have callbacks
 * to invoke in commitRoot
 * @param {boolean} isHydrating Whether or not we are in hydration
 * @param {any[]} refQueue an array of elements needed to invoke refs
 * @returns {PreactElement}
 */
function diffElementNodes(
	dom,
	newVNode,
	oldVNode,
	globalContext,
	namespace,
	excessDomChildren,
	commitQueue,
	isHydrating,
	refQueue
) {
	let oldProps = oldVNode.props;
	let newProps = newVNode.props;
	let nodeType = /** @type {string} */ (newVNode.type);
	/** @type {any} */
	let i;
	/** @type {{ __html?: string }} */
	let newHtml;
	/** @type {{ __html?: string }} */
	let oldHtml;
	/** @type {ComponentChildren} */
	let newChildren;
	let value;
	let inputValue;
	let checked;

	// Tracks entering and exiting namespaces when descending through the tree.
	if (nodeType == 'svg') namespace = SVG_NAMESPACE;
	else if (nodeType == 'math') namespace = MATH_NAMESPACE;
	else if (!namespace) namespace = XHTML_NAMESPACE;

	if (excessDomChildren != NULL) {
		for (i = 0; i < excessDomChildren.length; i++) {
			value = excessDomChildren[i];

			// if newVNode matches an element in excessDomChildren or the `dom`
			// argument matches an element in excessDomChildren, remove it from
			// excessDomChildren so it isn't later removed in diffChildren
			if (
				value &&
				'setAttribute' in value == !!nodeType &&
				(nodeType ? value.localName == nodeType : value.nodeType == 3)
			) {
				dom = value;
				excessDomChildren[i] = NULL;
				break;
			}
		}
	}

	if (dom == NULL) {
		if (nodeType == NULL) {
			return document.createTextNode(newProps);
		}

		dom = document.createElementNS(
			namespace,
			nodeType,
			newProps.is && newProps
		);

		// we are creating a new node, so we can assume this is a new subtree (in
		// case we are hydrating), this deopts the hydrate
		if (isHydrating) {
			if (options.__m)
				options.__m(newVNode, excessDomChildren);
			isHydrating = false;
		}
		// we created a new parent, so none of the previously attached children can be reused:
		excessDomChildren = NULL;
	}

	if (nodeType == NULL) {
		// During hydration, we still have to split merged text from SSR'd HTML.
		if (oldProps !== newProps && (!isHydrating || dom.data != newProps)) {
			dom.data = newProps;
		}
	} else {
		// If excessDomChildren was not null, repopulate it with the current element's children:
		excessDomChildren = excessDomChildren && slice.call(dom.childNodes);

		oldProps = oldVNode.props || EMPTY_OBJ;

		// If we are in a situation where we are not hydrating but are using
		// existing DOM (e.g. replaceNode) we should read the existing DOM
		// attributes to diff them
		if (!isHydrating && excessDomChildren != NULL) {
			oldProps = {};
			for (i = 0; i < dom.attributes.length; i++) {
				value = dom.attributes[i];
				oldProps[value.name] = value.value;
			}
		}

		for (i in oldProps) {
			value = oldProps[i];
			if (i == 'children') {
			} else if (i == 'dangerouslySetInnerHTML') {
				oldHtml = value;
			} else if (!(i in newProps)) {
				if (
					(i == 'value' && 'defaultValue' in newProps) ||
					(i == 'checked' && 'defaultChecked' in newProps)
				) {
					continue;
				}
				setProperty(dom, i, NULL, value, namespace);
			}
		}

		// During hydration, props are not diffed at all (including dangerouslySetInnerHTML)
		// @TODO we should warn in debug mode when props don't match here.
		for (i in newProps) {
			value = newProps[i];
			if (i == 'children') {
				newChildren = value;
			} else if (i == 'dangerouslySetInnerHTML') {
				newHtml = value;
			} else if (i == 'value') {
				inputValue = value;
			} else if (i == 'checked') {
				checked = value;
			} else if (
				(!isHydrating || typeof value == 'function') &&
				oldProps[i] !== value
			) {
				setProperty(dom, i, value, oldProps[i], namespace);
			}
		}

		// If the new vnode didn't have dangerouslySetInnerHTML, diff its children
		if (newHtml) {
			// Avoid re-applying the same '__html' if it did not changed between re-render
			if (
				!isHydrating &&
				(!oldHtml ||
					(newHtml.__html != oldHtml.__html && newHtml.__html != dom.innerHTML))
			) {
				dom.innerHTML = newHtml.__html;
			}

			newVNode.__k = [];
		} else {
			if (oldHtml) dom.innerHTML = '';

			diffChildren(
				// @ts-expect-error
				newVNode.type == 'template' ? dom.content : dom,
				isArray(newChildren) ? newChildren : [newChildren],
				newVNode,
				oldVNode,
				globalContext,
				nodeType == 'foreignObject' ? XHTML_NAMESPACE : namespace,
				excessDomChildren,
				commitQueue,
				excessDomChildren
					? excessDomChildren[0]
					: oldVNode.__k && getDomSibling(oldVNode, 0),
				isHydrating,
				refQueue
			);

			// Remove children that are not part of any vnode.
			if (excessDomChildren != NULL) {
				for (i = excessDomChildren.length; i--; ) {
					removeNode(excessDomChildren[i]);
				}
			}
		}

		// As above, don't diff props during hydration
		if (!isHydrating) {
			i = 'value';
			if (nodeType == 'progress' && inputValue == NULL) {
				dom.removeAttribute('value');
			} else if (
				inputValue != UNDEFINED &&
				// #2756 For the <progress>-element the initial value is 0,
				// despite the attribute not being present. When the attribute
				// is missing the progress bar is treated as indeterminate.
				// To fix that we'll always update it when it is 0 for progress elements
				(inputValue !== dom[i] ||
					(nodeType == 'progress' && !inputValue) ||
					// This is only for IE 11 to fix <select> value not being updated.
					// To avoid a stale select value we need to set the option.value
					// again, which triggers IE11 to re-evaluate the select value
					(nodeType == 'option' && inputValue != oldProps[i]))
			) {
				setProperty(dom, i, inputValue, oldProps[i], namespace);
			}

			i = 'checked';
			if (checked != UNDEFINED && checked != dom[i]) {
				setProperty(dom, i, checked, oldProps[i], namespace);
			}
		}
	}

	return dom;
}

/**
 * Invoke or update a ref, depending on whether it is a function or object ref.
 * @param {Ref<any> & { _unmount?: unknown }} ref
 * @param {any} value
 * @param {VNode} vnode
 */
export function applyRef(ref, value, vnode) {
	try {
		if (typeof ref == 'function') {
			let hasRefUnmount = typeof ref.__u == 'function';
			if (hasRefUnmount) {
				// @ts-ignore TS doesn't like moving narrowing checks into variables
				ref.__u();
			}

			if (!hasRefUnmount || value != NULL) {
				// Store the cleanup function on the function
				// instance object itself to avoid shape
				// transitioning vnode
				ref.__u = ref(value);
			}
		} else ref.current = value;
	} catch (e) {
		options.__e(e, vnode);
	}
}

/**
 * Unmount a virtual node from the tree and apply DOM changes
 * @param {VNode} vnode The virtual node to unmount
 * @param {VNode} parentVNode The parent of the VNode that initiated the unmount
 * @param {boolean} [skipRemove] Flag that indicates that a parent node of the
 * current element is already detached from the DOM.
 */
export function unmount(vnode, parentVNode, skipRemove) {
	let r;
	if (options.unmount) options.unmount(vnode);

	if ((r = vnode.ref)) {
		if (!r.current || r.current == vnode.__e) {
			applyRef(r, NULL, parentVNode);
		}
	}

	if ((r = vnode.__c) != NULL) {
		if (r.componentWillUnmount) {
			try {
				r.componentWillUnmount();
			} catch (e) {
				options.__e(e, parentVNode);
			}
		}

		r.base = r.__P = NULL;
	}

	if ((r = vnode.__k)) {
		for (let i = 0; i < r.length; i++) {
			if (r[i]) {
				unmount(
					r[i],
					parentVNode,
					skipRemove || typeof vnode.type != 'function'
				);
			}
		}
	}

	if (!skipRemove) {
		removeNode(vnode.__e);
	}

	vnode.__c = vnode.__ = vnode.__e = UNDEFINED;
}

/** The `.render()` method for a PFC backing instance. */
function doRender(props, state, context) {
	return this.constructor(props, context);
}
