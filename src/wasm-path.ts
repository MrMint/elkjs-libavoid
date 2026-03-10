import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

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
 * import { getWasmPath } from "@mr_mint/elkjs-libavoid/node";
 * console.log(getWasmPath());
 * // "/path/to/node_modules/libavoid-js/dist/libavoid.wasm"
 * ```
 */
export function getWasmPath(): string {
	let entryPath: string;
	try {
		const require = createRequire(import.meta.url);
		entryPath = require.resolve("libavoid-js");
	} catch {
		throw new Error(
			"Could not resolve libavoid-js. Ensure it is installed as a dependency.",
		);
	}

	const wasmPath = join(dirname(entryPath), "libavoid.wasm");
	if (!existsSync(wasmPath)) {
		throw new Error(
			`Could not find libavoid.wasm at ${wasmPath}. Ensure libavoid-js is properly installed.`,
		);
	}
	return wasmPath;
}
