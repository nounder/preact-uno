import {
	Options as PreactOptions,
	Component as PreactComponent,
	VNode as PreactVNode,
	PreactContext,
	HookType,
	ErrorInfo,
} from '../../src/internal.d.ts';
import { Reducer, StateUpdater } from './index.js';

export { PreactContext };

export interface Options extends PreactOptions {
	/** Attach a hook that is invoked before a vnode is diffed. */
	__b?(vnode: VNode): void;
	diffed?(vnode: VNode): void;
	/** Attach a hook that is invoked before a vnode has rendered. */
	__r?(vnode: VNode): void;
	/** Attach a hook that is invoked after a tree was mounted or was updated. */
	__c?(vnode: VNode, commitQueue: Component[]): void;
	__u?(vnode: VNode): void;
	/** Attach a hook that is invoked before a hook's state is queried. */
	__h?(component: Component, index: number, type: HookType): void;
}

// Hook tracking

export interface ComponentHooks {
	/** The list of hooks a component uses */
	__: HookState[];
	/** List of Effects to be invoked after the next frame is rendered */
	__h: EffectHookState[];
}

export interface Component extends Omit<PreactComponent<any, any>, '_renderCallbacks'> {
	__H?: ComponentHooks;
	// Extend to include HookStates
	__h?: Array<HookState | (() => void)>;
	__f?: boolean;
}

export interface VNode extends Omit<PreactVNode, '_component'> {
	__m?: [number, number];
	__c?: Component; // Override with our specific Component type
}

export type HookState =
	| EffectHookState
	| MemoHookState
	| ReducerHookState
	| ContextHookState
	| ErrorBoundaryHookState
	| IdHookState;

interface BaseHookState {
	__?: unknown;
	__N?: unknown;
	_pendingValue?: unknown;
	__H?: unknown;
	_pendingArgs?: unknown;
	__c?: unknown;
	__c?: unknown;
}

export type Effect = () => void | Cleanup;
export type Cleanup = () => void;

export interface EffectHookState extends BaseHookState {
	__?: Effect;
	__H?: unknown[];
	_pendingArgs?: unknown[];
	__c?: Cleanup | void;
}

export interface MemoHookState<T = unknown> extends BaseHookState {
	__?: T;
	_pendingValue?: T;
	__H?: unknown[];
	_pendingArgs?: unknown[];
	__h?: () => T;
}

export interface ReducerHookState<S = unknown, A = unknown>
	extends BaseHookState {
	__N?: [S, StateUpdater<S>];
	__?: [S, StateUpdater<S>];
	__c?: Component;
	_reducer?: Reducer<S, A>;
}

export interface ContextHookState extends BaseHookState {
	/** Whether this hooks as subscribed to updates yet */
	__?: boolean;
	c?: PreactContext;
}

export interface ErrorBoundaryHookState extends BaseHookState {
	__?: (error: unknown, errorInfo: ErrorInfo) => void;
}

export interface IdHookState extends BaseHookState {
	__?: string;
}
