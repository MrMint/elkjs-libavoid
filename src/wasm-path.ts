import { createRequire } from "node:module";

/**
 * Get the absolute file path to the libavoid WASM binary.
 *
 * This is useful for configuring bundlers or copying the WASM file
 * to your app's public directory during build.
 *
 * Only works in Node.js environments.
 *
 * @example
 * ```ts
 * import { getWasmPath } from "@mr_mint/elkjs-libavoid";
 * console.log(getWasmPath());
 * // "/path/to/node_modules/libavoid-js/dist/libavoid.wasm"
 * ```
 */
export function getWasmPath(): string {
	const require = createRequire(import.meta.url);
	return require.resolve("libavoid-js/dist/libavoid.wasm");
}
