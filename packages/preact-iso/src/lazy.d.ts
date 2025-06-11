import { ComponentChildren, VNode } from '../../preact/src/index.js';

export default function lazy<T>(load: () => Promise<{ default: T } | T>): T & {
	preload: () => Promise<T>;
};

export function ErrorBoundary(props: { children?: ComponentChildren; onError?: (error: Error) => void }): VNode;
