import { join, resolve } from 'jsr:@std/path';
import oxc from 'npm:oxc-transform';

const version = Deno.args[0];
console.log('? version:', version);

async function exists(path: string) {
	try {
		await Deno.lstat(path);
		return true;
	} catch {
		return false;
	}
}

async function copy(file: string) {
	if (await exists(file)) {
		console.log('> writing "%s" file', file);
		return Deno.copyFile(file, join(outdir, file));
	}
}

function bail(label: string, errors: string[]): never {
	console.error('[%s] error(s)', label, errors);
	Deno.exit(1);
}

let outdir = resolve('npm');

if (await exists(outdir)) {
	console.log('! removing "npm" directory');
	await Deno.remove(outdir, { recursive: true });
}

await Deno.mkdir(outdir);

let entry = resolve('mod.ts');
let source = await Deno.readTextFile(entry);

let esm = oxc.transform(entry, source);
if (esm.errors.length > 0) bail('transform', esm.errors);

let outfile = join(outdir, 'index.mjs');
console.log('> writing "index.mjs" file');
await Deno.writeTextFile(outfile, esm.sourceText);

let dts = oxc.isolatedDeclaration(entry, source);
if (dts.errors.length > 0) bail('dts', dts.errors);

outfile = join(outdir, 'index.d.ts');
console.log('> writing "index.d.ts" file');
await Deno.writeTextFile(outfile, dts.sourceText);

let pkg = {
	name: 'tschema',
	version: version,
	repository: 'lukeed/tschema',
	description: 'TODO', // TODO
	module: 'index.mjs',
	types: 'index.d.ts',
	type: 'module',
	license: 'MIT',
	exports: {
		'.': {
			import: {
				types: './index.d.ts',
				default: './index.mjs',
			},
		},
		'./package.json': './package.json',
	},
	author: {
		name: 'Luke Edwards',
		email: 'luke.edwards05@gmail.com',
		url: 'https://lukeed.com',
	},
	engines: {
		node: '>=12',
	},
	keywords: [
		'json schema',
		'object schema',
		'typed schema',
		'typecheck',
		'validate',
	],
};

outfile = join(outdir, 'package.json');
console.log('> writing "package.json" file');
await Deno.writeTextFile(outfile, JSON.stringify(pkg, null, 2));

await copy('readme.md');
await copy('license');
