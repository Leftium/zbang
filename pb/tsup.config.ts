import { defineConfig } from 'tsup'
import { glob } from 'glob'
import slash from 'slash'

// To support globs with Windows path separators:
const files = glob.sync('src/entries/*.ts').map(slash)

export default defineConfig({
	format: ['cjs'],
	entry: files,
	outDir: '../deploy/pb_hooks',
	shims: true,
	skipNodeModulesBundle: true,
	clean: false,
	target: 'node20',
	platform: 'node',
	minify: false,
	sourcemap: 'inline',
	bundle: true,
	noExternal: [/^pocketbase-/],
	splitting: false,
})
