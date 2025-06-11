// Intentionally not using a relative path to take advantage of
// the TS version resolution mechanism
import * as preact from './index.js';

export enum HookType {
	useState = 1,
	useReducer = 2,
	useEffect = 3,
	useLayoutEffect = 4,
	useRef = 5,
	useImperativeHandle = 6,
	useMemo = 7,
	useCallback = 8,
	useContext = 9,
	useErrorBoundary = 10,
	// Not a real hook, but the devtools treat is as such
	useDebugvalue = 11
}

export interface DevSource {
	fileName: string;
	lineNumber: number;
}

export interface ErrorInfo {
	componentStack?: string;
}

export interface Options extends preact.Options {
	/** Attach a hook that is invoked before render, mainly to check the arguments. */
	__?(vnode: ComponentChild, parent: preact.ContainerNode): void;
	/** Attach a hook that is invoked before a vnode is diffed. */
	__b?(vnode: VNode): void;
	/** Attach a hook that is invoked after a tree was mounted or was updated. */
	__c?(vnode: VNode, commitQueue: Component[]): void;
	/** Attach a hook that is invoked before a vnode has rendered. */
	__r?(vnode: VNode): void;
	/** Attach a hook that is invoked before a hook's state is queried. */
	__h?(component: Component, index: number, type: HookType): void;
	/** Bypass effect execution. Currenty only used in devtools for hooks inspection */
	__s?: boolean;
	/** Attach a hook that is invoked after an error is caught in a component but before calling lifecycle hooks */
	__e(
		error: any,
		vnode: VNode,
		oldVNode?: VNode | undefined,
		errorInfo?: ErrorInfo | undefined
	): void;
	/** Attach a hook that fires when hydration can't find a proper DOM-node to match with */
	__m?(
		vnode: VNode,
		excessDomChildren: Array<PreactElement | null>
	): void;
}

export type ComponentChild =
	| VNode<any>
	| string
	| number
	| boolean
	| null
	| undefined;
export type ComponentChildren = ComponentChild[] | ComponentChild;

export interface FunctionComponent<P = {}>
	extends preact.FunctionComponent<P> {
	// Internally, createContext uses `contextType` on a Function component to
	// implement the Consumer component
	contextType?: PreactContext;

	// Internally, createContext stores a ref to the context object on the Provider
	// Function component to help devtools
	__l?: PreactContext;

	// Define these properties as undefined on FunctionComponent to get rid of
	// some errors in `diff()`
	getDerivedStateFromProps?: undefined;
	getDerivedStateFromError?: undefined;
}

export interface ComponentClass<P = {}> extends preact.ComponentClass<P> {
	__l?: any;

	// Override public contextType with internal PreactContext type
	contextType?: PreactContext;
}

// Redefine ComponentType using our new internal FunctionComponent interface above
export type ComponentType<P = {}> = ComponentClass<P> | FunctionComponent<P>;

export interface PreactElement extends preact.ContainerNode {
	// Namespace detection
	readonly namespaceURI?: string;
	// Property used to update Text nodes
	data?: CharacterData['data'];
	// Property to set __dangerouslySetInnerHTML
	innerHTML?: Element['innerHTML'];

	// Attribute reading and setting
	readonly attributes?: Element['attributes'];
	setAttribute?: Element['setAttribute'];
	removeAttribute?: Element['removeAttribute'];

	// Event listeners
	addEventListener?: Element['addEventListener'];
	removeEventListener?: Element['removeEventListener'];

	// Setting styles
	readonly style?: CSSStyleDeclaration;

	// nextSibling required for inserting nodes
	readonly nextSibling: PreactElement | null;

	// Used to match DOM nodes to VNodes during hydration. Note: doesn't exist
	// on Text nodes
	readonly localName?: string;

	// Input handling
	value?: HTMLInputElement['value'];
	checked?: HTMLInputElement['checked'];

	// Internal properties
	__k?: VNode<any> | null;
	/** Event listeners to support event delegation */
	l?: Record<string, (e: Event) => void>;
}

export interface PreactEvent extends Event {
	_dispatched?: number;
}

// We use the `current` property to differentiate between the two kinds of Refs so
// internally we'll define `current` on both to make TypeScript happy
type RefObject<T> = { current: T | null };
type RefCallback<T> = {
	(instance: T | null): void | (() => void);
	current: undefined;
};
export type Ref<T> = RefObject<T> | RefCallback<T>;

export interface VNode<P = {}> extends preact.VNode<P> {
	// Redefine type here using our internal ComponentType type, and specify
	// string has an undefined `defaultProps` property to make TS happy
	type: (string & { defaultProps: undefined }) | ComponentType<P>;
	props: P & { children: ComponentChildren };
	ref?: Ref<any> | null;
	__k: Array<VNode<any>> | null;
	__: VNode | null;
	__b: number | null;
	/**
	 * The [first (for Fragments)] DOM child of a VNode
	 */
	__e: PreactElement | null;
	__c: Component | null;
	constructor: undefined;
	__v: number;
	__i: number;
	__u: number;
}

export interface Component<P = {}, S = {}> extends Omit<preact.Component<P, S>, 'base'> {
	// When component is functional component, this is reset to functional component
	constructor: ComponentType<P>;
	state: S; // Override Component["state"] to not be readonly for internal use, specifically Hooks
	base?: PreactElement;

	__d: boolean;
	__e?: boolean;
	__h: Array<() => void>; // Only class components
	_sb: Array<() => void>; // Only class components
	__n?: any;
	__v?: VNode<P> | null;
	__s?: S | null; // Only class components
	/** Only used in the devtools to later dirty check if state has changed */
	__u?: S | null;
	/**
	 * Pointer to the parent dom node. This is only needed for top-level Fragment
	 * components or array returns.
	 */
	__P?: PreactElement | null;
	// Always read, set only when handling error
	__?: Component<any, any> | null;
	// Always read, set only when handling error. This is used to indicate at diffTime to set _processingException
	__E?: Component<any, any> | null;
}

export interface PreactContext extends preact.Context<any> {
	__c: string;
	__: any;
}
