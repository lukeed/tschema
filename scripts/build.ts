import { join, resolve } from '@std/path';
import oxc from 'oxc-transform';

const bytes = 500;

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

let config = JSON.parse(await Deno.readTextFile('deno.json'));

// build "/jsr.json" file
// @see https://jsr.io/schema/config-file.v1.json
let jsr = {
	name: '@lukeed/tschema',
	version: version,
	exports: {
		'.': './mod.ts',
		'./validate': './validate.ts',
		'./plugins': './plugins.ts',
	},
	imports: {
		'rolldown': config.imports['rolldown'],
		'rolldown/': config.imports['rolldown/'],
		'vite': config.imports['vite'],
	},
	publish: {
		include: [
			'*.ts',
			'license',
			'readme.md',
		],
		exclude: [
			'*.test.ts',
			'*.types.ts',
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

// source file -> output name
const ENTRIES: Record<string, string> = {
	'mod.ts': 'index',
	'validate.ts': 'validate',
	'compile.ts': 'compile',
	'plugins.ts': 'plugins',
};

function relink(code: string): string {
	return code.replace(/(from\s+['"])\.\/([\w-]+\.ts)(['"])/g, (_, a, file, b) => {
		if (!ENTRIES[file]) bail('relink', [`Unknown import: ${file}`]);
		return a + './' + ENTRIES[file] + '.mjs' + b;
	});
}

for (let [file, name] of Object.entries(ENTRIES)) {
	let entry = resolve(file);
	let source = await Deno.readTextFile(entry);

	let esm = oxc.transform(entry, source);
	if (esm.errors.length > 0) bail('transform', esm.errors);

	outfile = join(outdir, name + '.mjs');
	console.log('> writing "%s.mjs" file', name);
	await Deno.writeTextFile(outfile, relink(esm.sourceText));

	let dts = oxc.isolatedDeclaration(entry, source);
	if (dts.errors.length > 0) bail('dts', dts.errors);

	outfile = join(outdir, name + '.d.mts');
	console.log('> writing "%s.d.mts" file', name);
	await Deno.writeTextFile(outfile, relink(dts.sourceText));
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
	peerDependencies: {
		rolldown: config.imports['rolldown'].replace('npm:rolldown@', ''),
		vite: config.imports['vite'].replace('npm:vite@', ''),
	},
	peerDependenciesMeta: {
		rolldown: { optional: true },
		vite: { optional: true },
	},
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

outfile = join(outdir, 'package.json');
console.log('> writing "package.json" file');
await Deno.writeTextFile(outfile, JSON.stringify(pkg, null, 2));

await copy('readme.md');
await copy('license');
