// bun scripts/build.ts [version]

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isolatedDeclarationSync, transformSync } from 'oxc-transform';

const bytes = 500;

const config = JSON.parse(await readFile('package.json', 'utf8'));
const version: string = process.argv[2] || config.version;
console.log('? version:', version);

// source file -> output name
const ENTRIES: Record<string, string> = {
	'mod.ts': 'index',
	'validate.ts': 'validate',
	'compile.ts': 'compile',
	'plugins.ts': 'plugins',
};

const PEERS = ['rolldown', 'vite'];

function bail(label: string, errors: unknown[]): never {
	console.error('[%s] error(s)', label, errors);
	process.exit(1);
}

function relink(code: string, ext: (file: string) => string): string {
	return code.replace(/(from\s+['"])\.\/([\w-]+)(['"])/g, (_, a, file, b) => {
		if (!ENTRIES[file + '.ts']) bail('relink', [`Unknown import: ${file}`]);
		return a + './' + ext(file) + b;
	});
}

async function write(dir: string, file: string, content: string) {
	console.log('> writing "%s/%s" file', dir, file);
	await writeFile(join(dir, file), content);
}

async function copy(dir: string, file: string) {
	console.log('> writing "%s/%s" file', dir, file);
	await copyFile(file, join(dir, file));
}

async function reset(dir: string) {
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir);
}

// build "/jsr" package
// @see https://jsr.io/schema/config-file.v1.json
// ---

let jsrdir = resolve('jsr');
await reset(jsrdir);

let jsr = {
	name: '@lukeed/tschema',
	version: version,
	exports: {
		'.': './mod.ts',
		'./validate': './validate.ts',
		'./plugins': './plugins.ts',
	},
	imports: {
		rolldown: 'npm:rolldown@' + config.devDependencies.rolldown,
		'rolldown/': 'npm:/rolldown@' + config.devDependencies.rolldown + '/',
		vite: 'npm:vite@' + config.devDependencies.vite,
	},
	publish: {
		include: ['*.ts', 'license', 'readme.md'],
		exclude: ['!**'],
	},
};

await write(jsrdir, 'jsr.json', JSON.stringify(jsr, null, 2));

for (let file in ENTRIES) {
	let source = await readFile(file, 'utf8');
	await write(
		jsrdir,
		file,
		relink(source, (name) => name + '.ts'),
	);
}

await copy(jsrdir, 'readme.md');
await copy(jsrdir, 'license');

// build "/npm" package
// ---

let outdir = resolve('npm');
await reset(outdir);

for (let [file, name] of Object.entries(ENTRIES)) {
	let source = await readFile(file, 'utf8');
	let ext = (dep: string) => ENTRIES[dep + '.ts'] + '.mjs';

	let esm = transformSync(file, source);
	if (esm.errors.length > 0) bail('transform', esm.errors);
	await write(outdir, name + '.mjs', relink(esm.code, ext));

	let dts = isolatedDeclarationSync(file, source);
	if (dts.errors.length > 0) bail('dts', dts.errors);
	await write(outdir, name + '.d.mts', relink(dts.code, ext));
}

let pkg = {
	name: 'tschema',
	version: version,
	repository: 'lukeed/tschema',
	description: `A tiny (${bytes}b) utility to build and validate JSON schema types.`,
	module: 'index.mjs',
	types: 'index.d.mts',
	type: 'module',
	license: 'MIT',
	sideEffects: false,
	exports: {
		'.': {
			import: {
				types: './index.d.mts',
				default: './index.mjs',
			},
		},
		'./validate': {
			import: {
				types: './validate.d.mts',
				default: './validate.mjs',
			},
		},
		'./plugins': {
			import: {
				types: './plugins.d.mts',
				default: './plugins.mjs',
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
	peerDependencies: Object.fromEntries(PEERS.map((name) => [name, config.devDependencies[name]])),
	peerDependenciesMeta: Object.fromEntries(PEERS.map((name) => [name, { optional: true }])),
	keywords: [
		'infer json schema',
		'json schema builder',
		'json schema validator',
		'object schema',
		'typed schema',
		'typecheck',
		'validate',
		'ajv',
	],
};

await write(outdir, 'package.json', JSON.stringify(pkg, null, 2));

await copy(outdir, 'readme.md');
await copy(outdir, 'license');
