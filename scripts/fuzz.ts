/**
 * Differential fuzzer for `tschema/plugins`.
 *
 * Each case is a random project: schema modules, an optional barrel, mutator modules, and a
 * `main.ts` that validates probe inputs. It is bundled with and without the plugin, and both
 * bundles must agree on every probe.
 *
 * Mutations stay inside the plugin's documented guarantee: they happen in `main.ts`, in a module
 * that defines or re-exports a schema, or in a module whose function `main.ts` calls.
 *
 * ```sh
 * bun scripts/fuzz.ts [runs=200] [seed=random]
 * ```
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown as bundle } from 'rolldown';

import { rolldown } from '../plugins';

/** The statements of each file, by file name. */
export type Project = Record<string, string[]>;

/** How a bundle ended: it failed to build, it threw on import, or it returned results. */
export type Outcome =
	| { kind: 'build'; error: string }
	| { kind: 'init'; error: string }
	| { kind: 'ok'; results: string };

/** The outcome of one case, with and without the plugin. */
export type Report = {
	seed: number;
	project: Project;
	runtime: Outcome;
	aot: Outcome;
	/** Whether the AOT bundle compiled at least one call. */
	compiled: boolean;
	failed: boolean;
};

const ROOT = join(import.meta.dir, '..');

const ALIAS = {
	'tschema/validate': join(ROOT, 'validate.ts'),
	'tschema/standard': join(ROOT, 'standard.ts'),
	tschema: join(ROOT, 'mod.ts'),
};

const HEAD = `import * as t from 'tschema';`;

const FIELDS: Record<string, (rng: Rng) => string> = {
	name: () => `t.string({ minLength: 1 })`,
	email: () => `t.string({ format: 'email' })`,
	age: (rng) => `t.integer({ minimum: ${rng.pick(['0', '0', '1e999', '-1e999'])} })`,
	tags: () => `t.array(t.string())`,
	role: () => `t.enum(['admin', 'member'])`,
};

const EFFECTS = [
	(x: string) => `(${x}.required ||= []).push('email');`,
	(x: string) => `${x}.additionalProperties = true;`,
	(x: string) => `${x}.additionalProperties = false;`,
	(x: string) => `${x}.properties.name = t.string({ minLength: 3 });`,
	(x: string) => `delete ${x}.properties.age;`,
	(x: string) => `Object.assign(${x}.properties, { age: t.string() });`,
	(x: string) => `${x}.minProperties = 2;`,
];

const BASES: unknown[] = [
	{},
	{ name: '' },
	{ name: 'a' },
	{ name: 'abc' },
	{ name: 'a', email: 'a@b.co' },
	{ name: 'a', email: 'x' },
	{ name: 'a', age: 1 },
	{ name: 'a', age: '1' },
	{ name: 'a', age: -1 },
	{ name: 'a', tags: ['x'] },
	{ name: 'a', role: 'admin' },
	{ name: 'a', role: 'x' },
	{ name: 'a', extra: 1 },
	{ name: 'a', password: '12345678' },
	{ name: 'abc', email: 'a@b.co', age: 1, tags: ['x'], role: 'admin' },
];

/** Each base value, alone and inside each holder shape the generator builds. */
const PROBES: unknown[] = BASES.flatMap((b) => [b, { title: 'x', author: b }, { inner: b }, [b]]);

type Rng = {
	int: (n: number) => number;
	chance: (p: number) => boolean;
	pick: <T>(list: T[]) => T;
};

/**
 * @internal
 * A seeded PRNG (mulberry32), so that each case replays from its seed.
 */
function random(seed: number): Rng {
	let state = seed >>> 0;
	let next = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let x = Math.imul(state ^ (state >>> 15), 1 | state);
		x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
	return {
		int: (n: number) => Math.floor(next() * n),
		chance: (p: number) => next() < p,
		pick: <T>(list: T[]): T => list[Math.floor(next() * list.length)],
	};
}

/**
 * @internal
 * A named object schema: the file that exports it, its export name, its local name there, and
 * the member to read when the export is a namespace.
 */
type Ref = {
	file: string;
	exported: string;
	local?: string;
	member?: string;
};

/**
 * Generate the project for a seed.
 *
 * ```ts
 * let project = generate(42);
 * //-> { 's0.ts': [...], 'main.ts': [...] }
 * ```
 */
export function generate(seed: number): Project {
	let rng = random(seed);
	let project: Project = {};
	let refs: Ref[] = [];
	let n = 0;

	let from = (ref: Ref) => './' + ref.file.replace(/\.ts$/, '');

	/** Reach a schema from `file`: its import lines, setup statements, and expression. */
	let route = (file: string, ref: Ref, top: boolean): [string[], string[], string] => {
		let tail = ref.member ? '.' + ref.member : '';
		if (ref.file === file && ref.local) return [[], [], ref.local + tail];
		let id = n++;
		let kind = rng.int(top && file === 'main.ts' ? 6 : 4);
		let ns = `N${id}.${ref.exported}${tail}`;
		if (kind === 1) return [[`import * as N${id} from '${from(ref)}';`], [], ns];
		if (kind === 2) return [[`import N${id} = require('${from(ref)}');`], [], ns];
		if (kind === 4) return [[], [`const N${id} = await import('${from(ref)}');`], ns];
		if (kind === 5) {
			let path = '`./${' + JSON.stringify(ref.file.replace(/\.ts$/, '')) + '}.ts`';
			return [[], [`const N${id} = await import(${path});`], ns];
		}
		return [[`import { ${ref.exported} as I${id} } from '${from(ref)}';`], [], `I${id}${tail}`];
	};

	let object = () => {
		let props = Object.keys(FIELDS)
			.filter((k) => k === 'name' || rng.chance(0.5))
			.map((k) => {
				let field = FIELDS[k](rng);
				return `${k}: ${k !== 'name' && rng.chance(0.7) ? `t.optional(${field})` : field}`;
			});
		let options = rng.chance(0.2) ? `, { additionalProperties: true }` : '';
		return `t.object({ ${props.join(', ')} }${options})`;
	};

	for (let i = 0, files = 1 + rng.int(3); i < files; i++) {
		let file = `s${i}.ts`;
		let imports = [HEAD];
		let body: string[] = [];
		for (let j = 0, count = 1 + rng.int(3); j < count; j++) {
			let local = `S${n++}`;
			let init = object();
			if (refs.length && rng.chance(0.5)) {
				let [lines, setup, dep] = route(file, rng.pick(refs), false);
				imports.push(...lines);
				body.push(...setup);
				init = rng.pick([
					`t.object({ title: t.string(), author: ${dep} })`,
					`t.object({ ...${dep}.properties, password: t.optional(t.string({ minLength: 8 })) })`,
					`t.partial(${dep})`,
				]);
			}
			let style = rng.int(10);
			if (style === 0 && !body.some((s) => s.startsWith('export default'))) {
				body.push(`const ${local} = ${init};`, `export default ${local};`);
				refs.push({ file, exported: 'default', local });
			} else if (style === 1) {
				body.push(`const ${local} = ${init};`, `export { ${local} as E${n} };`);
				refs.push({ file, exported: `E${n++}`, local });
			} else {
				body.push(`export const ${local} = ${init};`);
				refs.push({ file, exported: local, local });
			}
		}
		project[file] = [...imports, ...body];
	}

	if (rng.chance(0.5)) {
		let ref = rng.pick(refs);
		let style = rng.int(4);
		if (style === 0 && ref.exported !== 'default') {
			project['barrel.ts'] = [`export * from '${from(ref)}';`];
			refs.push({ file: 'barrel.ts', exported: ref.exported });
		} else if (style === 1) {
			project['barrel.ts'] = [`export * as NS from '${from(ref)}';`];
			refs.push({ file: 'barrel.ts', exported: 'NS', member: ref.exported });
		} else if (style === 2) {
			project['barrel.ts'] = [`export { ${ref.exported} as B } from '${from(ref)}';`];
			refs.push({ file: 'barrel.ts', exported: 'B' });
		} else {
			project['barrel.ts'] = [
				HEAD,
				`import { ${ref.exported} as B } from '${from(ref)}';`,
				`export { B };`,
			];
			refs.push({ file: 'barrel.ts', exported: 'B', local: 'B' });
		}
	}

	let mutation = (file: string, ref: Ref, top: boolean): [string[], string[]] => {
		let place = top ? rng.int(3) : 1;
		let [imports, setup, target] = route(file, ref, place === 0);
		let effect = rng.pick(EFFECTS);
		let id = n++;
		let body = rng.pick([
			() => [effect(target)],
			() => [`const A${id} = ${target};`, effect(`A${id}`)],
			() => [`const R${id} = { s: ${target} };`, effect(`R${id}.s`)],
			() => [
				`const { properties: Q${id} } = ${target};`,
				`Object.assign(Q${id}, { age: t.string() });`,
			],
			() => [`function get${id}() { return ${target}; }`, effect(`get${id}()`)],
			() => [effect(`(${target} as typeof ${target})`)],
			() => [effect(`${target}!`)],
			() => [
				`const G${id} = { s: ${target}, get g() { ${effect('this.s')} return 1; } };`,
				`G${id}.g;`,
			],
			() => [
				`const V${id} = { s: ${target}, valueOf() { ${effect('this.s')} return 1; } };`,
				`+V${id};`,
			],
			() => [
				`const K${id} = { s: ${target}, toString: (0, function () { ${effect('this.s')} return 'k'; }) };`,
				`({})[K${id}];`,
			],
			() => [
				`class H${id} { static [Symbol.hasInstance](v) { ${effect('v')} return true; } }`,
				`${target} instanceof H${id};`,
			],
			() => [`enum En${id} { A = ${target} }`, effect(`En${id}.A`)],
			() => [`const P${id} = t.object({ inner: ${target} });`, effect(`P${id}.properties.inner`)],
		])();
		if (place === 1) body = [`function run${id}() { ${body.join(' ')} }`, `run${id}();`];
		if (place === 2) body = [`function idle${id}() { ${body.join(' ')} }`];
		return [imports, [...setup, ...body]];
	};

	let main = {
		imports: [HEAD, `import { assert, parse, validate } from 'tschema/validate';`],
		body: [] as string[],
	};

	for (let i = 0, count = rng.int(3); i < count; i++) {
		let ref = rng.pick(refs);
		let where = rng.int(4);
		let other = /^s\d/.test(ref.file)
			? Object.keys(project).filter((f) => /^s\d/.test(f) && f > ref.file)
			: [];
		if (where === 0) {
			let [imports, body] = mutation('main.ts', ref, true);
			main.imports.push(...imports);
			main.body.push(...body);
		} else if (where === 1 && ref.local) {
			let [imports, body] = mutation(ref.file, ref, true);
			project[ref.file] = [...imports, ...project[ref.file], ...body];
		} else if (where === 2 && other.length) {
			let file = rng.pick(other);
			let [imports, body] = mutation(file, ref, true);
			project[file] = [...imports, ...project[file], ...body];
		} else {
			let file = `p${i}.ts`;
			let [imports, body] = mutation(file, ref, false);
			project[file] = [HEAD, ...imports, `export function setup${i}() { ${body.join(' ')} }`];
			main.imports.push(`import { setup${i} } from './p${i}';`);
			main.body.push(`setup${i}();`);
		}
	}

	for (let i = 0, count = 1 + rng.int(4); i < count; i++) {
		let [imports, setup, name] = route('main.ts', rng.pick(refs), true);
		main.imports.push(...imports);
		main.body.push(...setup);
		if (rng.chance(0.2)) main.body.push(`const L${n++} = [typeof ${name}, ${name} === null];`);
		let schema = rng.pick([
			name,
			name,
			`t.object({ inner: ${name} })`,
			`t.array(${name})`,
			`t.any(${name}, t.object({ title: t.string(), author: ${name} }))`,
		]);
		let api = rng.pick(['parse', 'parse', 'validate', 'assert']);
		let call =
			api === 'assert'
				? `{ assert(${schema}, x); return 'ok'; }`
				: `JSON.stringify(${api}(${schema}, x)) ?? 'undefined'`;
		main.body.push(`const c${i} = (x: unknown) => ${call};`);
	}

	project['main.ts'] = [...main.imports, ...main.body];
	return project;
}

/**
 * @internal
 * Join each file's statements, and add the `check` export to `main.ts`.
 */
function render(project: Project): Record<string, string> {
	let files: Record<string, string> = {};
	for (let [file, body] of Object.entries(project)) {
		let code = body.join('\n') + '\n';
		if (file === 'main.ts') {
			let calls = body.flatMap((s) => /^const (c\d+) =/.exec(s)?.[1] || []);
			let each = calls.map(
				(c) =>
					`(() => { try { return ${c}(x); } catch (e) { return 'throw:' + e.name + ':' + e.message; } })()`,
			);
			code += `export const check = (x: unknown) => [${each.join(', ')}];\n`;
		}
		files[file] = code;
	}
	return files;
}

/**
 * @internal
 * Bundle `main.ts`, import it, and run `check` on every probe.
 */
async function build(dir: string, aot: boolean): Promise<[Outcome, code: string]> {
	let out = join(dir, aot ? 'aot' : 'runtime');
	try {
		var b = await bundle({
			input: join(dir, 'main.ts'),
			plugins: aot ? [rolldown()] : [],
			resolve: { alias: ALIAS },
			logLevel: 'silent',
		});
		var { output } = await b.write({ dir: out, format: 'esm' });
		await b.close();
	} catch (err) {
		return [{ kind: 'build', error: (err as Error).name }, ''];
	}
	let code = output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('\n');
	try {
		var mod = await import(pathToFileURL(join(out, output[0].fileName)).href);
	} catch (err) {
		return [{ kind: 'init', error: (err as Error).name }, code];
	}
	return [{ kind: 'ok', results: JSON.stringify(PROBES.map((x) => mod.check(x))) }, code];
}

/**
 * Bundle a project with and without the plugin, and compare the outcomes.
 *
 * ```ts
 * let report = await run(42);
 * if (report.failed) console.log(report.runtime, report.aot);
 * ```
 */
export async function run(seed: number, project = generate(seed)): Promise<Report> {
	let dir = await mkdtemp(join(tmpdir(), 'tschema-fuzz-'));
	try {
		for (let [file, code] of Object.entries(render(project))) {
			await writeFile(join(dir, file), code);
		}
		let [runtime] = await build(dir, false);
		let [aot, code] = await build(dir, true);
		let failed = JSON.stringify(runtime) !== JSON.stringify(aot);
		return { seed, project, runtime, aot, compiled: /tschema:/.test(code), failed };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/**
 * Remove files, then statements, from a failing project while it fails the same way.
 *
 * ```ts
 * let report = await run(42);
 * if (report.failed) report = await shrink(report);
 * ```
 */
export async function shrink(report: Report): Promise<Report> {
	let best = report;
	let changed = true;
	let same = (next: Report) =>
		next.failed && next.runtime.kind === report.runtime.kind && next.aot.kind === report.aot.kind;
	while (changed) {
		changed = false;
		for (let file of Object.keys(best.project)) {
			if (file === 'main.ts') continue;
			let project = { ...best.project };
			delete project[file];
			let next = await run(best.seed, project);
			if (same(next)) {
				best = next;
				changed = true;
			}
		}
		for (let file of Object.keys(best.project)) {
			for (let i = best.project[file].length - 1; i >= 0; i--) {
				let body = best.project[file].filter((_, j) => j !== i);
				let next = await run(best.seed, { ...best.project, [file]: body });
				if (same(next)) {
					best = next;
					changed = true;
				}
			}
		}
	}
	return best;
}

/**
 * @internal
 * Describe how two outcomes differ: the first probe with different results, or both outcomes.
 */
function diff(a: Outcome, b: Outcome): string {
	let show = (o: Outcome) => (o.kind === 'ok' ? 'ok' : `${o.kind} error: ${o.error}`);
	if (a.kind !== 'ok' || b.kind !== 'ok') return `runtime ${show(a)}\n  aot     ${show(b)}`;
	let x: unknown[] = JSON.parse(a.results);
	let y: unknown[] = JSON.parse(b.results);
	let i = x.findIndex((v, j) => JSON.stringify(v) !== JSON.stringify(y[j]));
	return `input   ${JSON.stringify(PROBES[i])}\n  runtime ${JSON.stringify(x[i])}\n  aot     ${JSON.stringify(y[i])}`;
}

async function save(report: Report, name: string): Promise<string> {
	let dir = join(tmpdir(), 'tschema-fuzz', String(report.seed), name);
	await mkdir(dir, { recursive: true });
	for (let [file, code] of Object.entries(render(report.project))) {
		await writeFile(join(dir, file), code);
	}
	return dir;
}

if (import.meta.main) {
	let runs = Number(process.argv[2] || 200);
	let base = Number(process.argv[3] || Date.now() % 1e9);
	if (!Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(base) || base < 0) {
		console.error('Usage: bun scripts/fuzz.ts [runs >= 1] [seed >= 0]');
		process.exit(2);
	}
	let compiled = 0;
	console.log('> seeds %d..%d', base, base + runs - 1);
	for (let i = 0; i < runs; i++) {
		let report = await run(base + i);
		if (report.compiled) compiled++;
		if (!report.failed) continue;
		console.log('\n! seed %d failed (replay: bun run fuzz 1 %d)', report.seed, report.seed);
		console.log('  original %s', await save(report, 'original'));
		let small = await shrink(report);
		console.log('  shrunk   %s', await save(small, 'shrunk'));
		console.log('  %s\n', diff(small.runtime, small.aot));
		for (let [file, code] of Object.entries(render(small.project))) {
			console.log('--- %s\n%s', file, code);
		}
		process.exit(1);
	}
	console.log('> %d runs passed, %d compiled at least one call', runs, compiled);
}
