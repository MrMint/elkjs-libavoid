import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	copy: [
		{
			from: "node_modules/libavoid-js/dist/libavoid.wasm",
			to: "dist",
		},
	],
	dts: true,
	entry: ["src/index.ts"],
	format: ["es", "cjs"],
	sourcemap: true,
});
