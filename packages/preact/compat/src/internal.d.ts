import {
	Component as PreactComponent,
	VNode as PreactVNode,
	FunctionComponent as PreactFunctionComponent,
	PreactElement
} from '../../src/internal.d.ts';
import { SuspenseProps } from './suspense.js';

export { ComponentChildren } from '../..';

export { PreactElement };

export interface Component<P = {}, S = {}> extends PreactComponent<P, S> {
	isReactComponent?: object;
	isPureReactComponent?: true;
	_patchedLifecycles?: true;

	// Suspense internal properties
	__c?(error: Promise<void>, suspendingVNode: VNode): void;
	__a: (vnode: VNode) => (unsuspend: () => void) => void;
	__R?(): void;

	// Portal internal properties
	_temp: any;
	_container: PreactElement;
}

export interface FunctionComponent<P = {}> extends PreactFunctionComponent<P> {
	shouldComponentUpdate?(nextProps: Readonly<P>): boolean;
	__f?: boolean;
	_patchedLifecycles?: true;
}

export interface VNode<T = any> extends PreactVNode<T> {
	$$typeof?: symbol | string;
	preactCompatNormalized?: boolean;
}

export interface SuspenseState {
	__a?: null | VNode<any>;
}

export interface SuspenseComponent
	extends PreactComponent<SuspenseProps, SuspenseState> {
	__u: number;
	_suspenders: Component[];
	__b: null | VNode<any>;
}
