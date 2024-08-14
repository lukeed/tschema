import { join, resolve } from 'jsr:@std/path@^1.0';
import oxc from 'npm:oxc-transform@^0.23';

const bytes = 490;

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

// build "/jsr.json" file
// @see https://jsr.io/schema/config-file.v1.json
let jsr = {
	name: '@lukeed/tschema',
	version: version,
	exports: {
		'.': './mod.ts',
	},
	publish: {
		include: [
			'*.ts',
			'license',
			'readme.md',
		],
		exclude: [
			'*.test.ts',
		],
	},
};

let outfile = resolve('jsr.json');
console.log('> writing "jsr.json" file');
await Deno.writeTextFile(outfile, JSON.stringify(jsr, null, 2));

// build "/npm" package
// ---

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

outfile = join(outdir, 'index.mjs');
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
	description: `A tiny (${bytes}b) utility to build JSON schema types.`,
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
		node: '>=14',
	},
	keywords: [
		'infer json schema',
		'json schema builder',
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
