import { options } from '../../src/index.js';
import { initDevTools } from './devtools.js';

initDevTools();

/**
 * Display a custom label for a custom hook for the devtools panel
 * @type {<T>(value: T, name: string) => T}
 */
export function addHookName(value, name) {
	if (options.__a) {
		options.__a(name);
	}
	return value;
}
