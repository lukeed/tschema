// bun bench/build.ts
// Bundle `bench/aot.ts` with and without the compiler plugin.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import { rolldown as tschema } from '../npm/plugins.mjs';

const root = join(import.meta.dir, '..');

async function bundle(file: string, aot: boolean) {
	let b = await rolldown({
		input: join(import.meta.dir, 'aot.ts'),
		plugins: aot ? [tschema()] : [],
		resolve: {
			alias: {
				'tschema/validate': join(root, 'npm/validate.mjs'),
				tschema: join(root, 'npm/index.mjs'),
			},
		},
	});
	let { output } = await b.write({
		file: join(import.meta.dir, 'dist', file),
		format: 'esm',
		minify: true,
	});
	await b.close();

	let code = output[0].code;
	if (aot && code.includes('new Function')) throw new Error('Expected no runtime compiler');
	console.log('> %s: %d b (gzip)', file, gzipSync(code).length);
}

await bundle('aot.mjs', true);
await bundle('runtime.mjs', false);
await writeFile(join(import.meta.dir, 'dist/aot.d.mts'), "export * from '../aot';\n");
