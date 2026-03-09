import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			exclude: ["src/**/*.test.ts"],
			include: ["src/**/*.ts"],
			provider: "v8",
		},
		environment: "node",
		globals: true,
		include: ["src/**/*.test.ts"],
	},
});
