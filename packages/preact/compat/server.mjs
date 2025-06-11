import { renderToString } from '../../preact-render-to-string/src/index.js';
import { renderToPipeableStream } from '../../preact-render-to-string/src/stream-node.js';
import { renderToReadableStream } from '../../preact-render-to-string/src/stream.js';

export {
	renderToString,
	renderToString as renderToStaticMarkup
} from '../../preact-render-to-string/src/index.js';

export { renderToPipeableStream } from '../../preact-render-to-string/src/stream-node.js';
export { renderToReadableStream } from '../../preact-render-to-string/src/stream.js';
export default {
	renderToString,
	renderToStaticMarkup: renderToString,
	renderToPipeableStream,
	renderToReadableStream
};
