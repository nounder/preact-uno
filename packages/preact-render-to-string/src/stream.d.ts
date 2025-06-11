import { VNode } from '../../preact/src/index.js';

interface RenderStream extends ReadableStream<Uint8Array> {
	allReady: Promise<void>;
}

export function renderToReadableStream<P = {}>(
	vnode: VNode<P>,
	context?: any
): RenderStream;
