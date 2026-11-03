import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown as bundle } from 'rolldown';
import { parseSync } from 'rolldown/utils';
import { build, createServer } from 'vite';
import { rolldown, vite } from './plugins';
import * as suite from './scripts/suite';

const ROOT = import.meta.dir;

const ALIAS = {
	'tschema/validate': join(ROOT, 'validate.ts'),
	tschema: join(ROOT, 'mod.ts'),
};

const SCHEMAS = `
import * as t from 'tschema';

export const Address = t.object({
	city: t.string(),
	zip: t.string({ pattern: '^\\\\d{5}$' }),
});

const User = t.object({
	name: t.string({ minLength: 2 }),
	email: t.string({ format: 'email' }),
	address: Address,
	tags: t.optional(t.array(t.string())),
});

export { User as Person };
export { Tree } from './tree';
`;

const TREE = `
import { recursive, object, integer, array } from 'tschema';

export const Tree = recursive('Tree', (self) =>
	object({
		value: integer(),
		children: array(self),
	}));
`;

async function project(files: Record<string, string>): Promise<string> {
	let dir = await mkdtemp(join(tmpdir(), 'tschema-'));
	for (let [name, code] of Object.entries(files)) {
		await writeFile(join(dir, name), code);
	}
	return dir;
}

type Output = {
	code: string;
	mod: Record<string, (input: unknown) => unknown>;
};

async function compile(files: Record<string, string>, entry = 'main.ts'): Promise<Output> {
	let dir = await project(files);
	let b = await bundle({
		input: join(dir, entry),
		plugins: [rolldown()],
		resolve: { alias: ALIAS },
		logLevel: 'silent',
	});
	let { output } = await b.write({ dir: join(dir, 'dist'), format: 'esm', sourcemap: true });
	await b.close();
	let file = join(dir, 'dist', output[0].fileName);
	return {
		code: output[0].code,
		mod: await import(pathToFileURL(file).href),
	};
}

describe('rolldown', () => {
	let out: Output;

	beforeAll(async () => {
		out = await compile({
			'schemas.ts': SCHEMAS,
			'tree.ts': TREE,
			'extra.ts': `
				import * as t from 'tschema';
				export * from './schemas';
				export default t.string({ format: 'uuid' });
			`,
			'main.ts': `
				import Id, { Address as Addr } from './extra';
				import * as t from 'tschema';
				import * as v from 'tschema/validate';
				import { assert, parse, validate } from 'tschema/validate';
				import { Person, Tree } from './schemas';
				import * as schemas from './schemas';

				const Local = t.object({ id: t.integer({ minimum: 1 }) });

				export const user = (x: unknown) => validate(Person, x);
				export const tree = (x: unknown) => parse(Tree, x);
				export const local = (x: unknown) => v.validate(Local, x);
				export const address = (x: unknown) => parse(schemas.Address, x);
				export const id = (x: unknown) => parse(Id, x);
				export const addr = (x: unknown) => parse(Addr, x);
				export const inline = (x: unknown) => {
					assert(t.array(t.integer(), { maxItems: 2 }), x);
					return x;
				};
			`,
		});
	});

	it('should compile every static call', () => {
		expect(out.code).not.toMatch(/new Function/);
		expect(out.code).not.toMatch(/function compile\(/);
		expect(out.code).toMatch(/tschema:Person-/);
		expect(out.code).toMatch(/tschema:Tree-/);
		expect(out.code).toMatch(/tschema:Local-/);
		expect(out.code).toMatch(/tschema:Id-/);
		expect(out.code).toMatch(/tschema:Addr-/);
	});

	it('should resolve default and star exports', () => {
		expect(out.mod.id('00000000-0000-0000-0000-000000000000')).toStrictEqual(
			'00000000-0000-0000-0000-000000000000',
		);
		expect(out.mod.id('x')).toStrictEqual(undefined);
		expect(out.mod.addr({ city: 'a', zip: '12345' })).toStrictEqual({ city: 'a', zip: '12345' });
		expect(out.mod.addr({ city: 'a', zip: 'x' })).toStrictEqual(undefined);
	});

	it('should validate imported schemas', () => {
		expect(
			out.mod.user({ name: 'x', email: 'bad', address: { city: 'a', zip: '123' } }),
		).toStrictEqual({
			ok: false,
			errors: [
				{
					instanceLocation: '/name',
					keywordLocation: '/properties/name/minLength',
					error: 'must NOT have fewer than 2 characters',
				},
				{
					instanceLocation: '/email',
					keywordLocation: '/properties/email/format',
					error: 'must match format "email"',
				},
				{
					instanceLocation: '/address/zip',
					keywordLocation: '/properties/address/properties/zip/pattern',
					error: 'must match pattern "^\\d{5}$"',
				},
			],
		});

		let input = { name: 'xy', email: 'a@b.co', address: { city: 'a', zip: '12345' } };
		expect(out.mod.user(input)).toStrictEqual({ ok: true, value: input });
	});

	it('should validate re-exported recursive schemas', () => {
		let input = { value: 1, children: [{ value: 2, children: [] }] };
		expect(out.mod.tree(input)).toStrictEqual(input);
		expect(out.mod.tree({ value: 1, children: [{ value: 'x', children: [] }] })).toStrictEqual(
			undefined,
		);
	});

	it('should validate local and namespace schemas', () => {
		expect(out.mod.local({ id: 1 })).toStrictEqual({ ok: true, value: { id: 1 } });
		expect(out.mod.local({ id: 0 })).toStrictEqual({
			ok: false,
			errors: [
				{
					instanceLocation: '/id',
					keywordLocation: '/properties/id/minimum',
					error: 'must be >= 1',
				},
			],
		});
		expect(out.mod.address({ city: 'a', zip: '12345' })).toStrictEqual({ city: 'a', zip: '12345' });
	});

	it('should throw ValidationError for inline schemas', () => {
		expect(out.mod.inline([1, 2])).toStrictEqual([1, 2]);
		expect(() => out.mod.inline([1, 2, 3])).toThrow(
			expect.objectContaining({
				name: 'ValidationError',
				message: 'must NOT have more than 2 items',
			}),
		);
	});
});

describe('rolldown (dynamic)', () => {
	let out: Output;

	beforeAll(async () => {
		out = await compile({
			'main.ts': `
				import * as t from 'tschema';
				import { parse, validate } from 'tschema/validate';

				let Mutable = t.object({ a: t.string() });
				const Mutated = t.object({ a: t.string() });
				Mutated.additionalProperties = true;

				function make(min: number) {
					return t.integer({ minimum: min });
				}

				export const mutable = (x: unknown) => parse(Mutable, x);
				export const mutated = (x: unknown) => parse(Mutated, x);
				export const factory = (x: unknown) => parse(make(5), x);
				export const shadow = (x: unknown) => {
					let t = { integer: () => ({ type: 'string' }) };
					return parse(t.integer(), x);
				};
				export const local = (validate: (a: unknown, b: unknown) => unknown, x: unknown) => validate(Mutable, x);
				export const proto = (x: unknown) => parse({ __proto__: { type: 'string' } } as t.Type, x);
			`,
		});
	});

	it('should keep the runtime compiler', () => {
		expect(out.code).toMatch(/new Function/);
		expect(out.code).not.toMatch(/tschema:\w+-[\da-f]{8}/);
	});

	it('should validate at runtime', () => {
		expect(out.mod.mutable({ a: 'x' })).toStrictEqual({ a: 'x' });
		expect(out.mod.mutated({ a: 'x', b: 1 })).toStrictEqual({ a: 'x', b: 1 });
		expect(out.mod.factory(4)).toStrictEqual(undefined);
		expect(out.mod.factory(5)).toStrictEqual(5);
		expect(out.mod.shadow('x')).toStrictEqual('x');
		expect(out.mod.proto('x')).toStrictEqual('x');
		expect(out.mod.proto(1)).toStrictEqual(undefined);
	});
});

describe('rolldown (scopes)', () => {
	let out: Output;

	beforeAll(async () => {
		out = await compile({
			'main.ts': `
				import * as t from 'tschema';
				import { parse } from 'tschema/validate';

				const S = t.string();

				export const control = (x: unknown) => parse(S, x);
				export const param = (x: unknown) => ((S: t.Type) => parse(S, x))(t.integer());
				export const pattern = (x: unknown) => (({ a: [S] }: { a: t.Type[] }) => parse(S, x))({ a: [t.integer()] });
				export const initial = (x: unknown) => ((S: t.Type = t.integer()) => parse(S, x))();
				export const rest = (x: unknown) => ((...[S]: t.Type[]) => parse(S, x))(t.integer());
				export const loop = (x: unknown) => {
					for (let S = t.integer(); ; ) return parse(S, x);
				};
				export const keys = (x: unknown) => {
					for (let S in { a: 1 }) return parse(S as never, x);
				};
				export const values = (x: unknown) => {
					for (const S of [t.integer()]) return parse(S, x);
				};
				export const caught = (x: unknown) => {
					try { throw t.integer(); } catch (S) { return parse(S as t.Type, x); }
				};
				export const caughtPattern = (x: unknown) => {
					try { throw { S: t.integer() }; } catch ({ S }) { return parse(S as t.Type, x); }
				};
				export const cases = (x: unknown) => {
					switch (typeof x) { default: let S = t.integer(); return parse(S, x); }
				};
				export const block = (x: unknown) => {
					{ let S = t.integer(); return parse(S, x); }
				};
				export const hoisted = (x: unknown) => {
					if (x !== S) { var S = t.integer(); }
					return parse(S, x);
				};
				export const statics = (x: unknown) => {
					class C { static run: (y: unknown) => unknown; static { let S = t.integer(); C.run = (y) => parse(S, y); } }
					return C.run(x);
				};
				export const property = (x: unknown) => {
					class C { out: unknown; constructor(private S: t.Type) { this.out = parse(S, x); } }
					return new C(t.integer()).out;
				};
				export const named = (x: unknown) => (function S() { return parse(S as never, x); })();
				export const klass = (x: unknown) => (class S { static run = () => parse(S as never, x); }).run();
				export const enumerated = (x: unknown) => {
					enum S { type = 'integer' }
					return parse(S as never, x);
				};
				export namespace N {
					const S = t.integer();
					export const run = (x: unknown) => parse(S, x);
				}
				export namespace M {
					namespace S { export const type = 'integer'; }
					export const run = (x: unknown) => parse(S as never, x);
				}
			`,
		});
	});

	it('should compile the unshadowed call', () => {
		expect(out.code).toMatch(/tschema:S-/);
		expect(out.mod.control('x')).toStrictEqual('x');
		expect(out.mod.control(1)).toStrictEqual(undefined);
	});

	it('should validate shadowed schemas at runtime', () => {
		let names = [
			'param',
			'pattern',
			'initial',
			'rest',
			'loop',
			'values',
			'caught',
			'caughtPattern',
			'cases',
			'block',
			'hoisted',
			'statics',
			'property',
			'enumerated',
		];
		for (let name of names) {
			expect([name, out.mod[name](1)]).toStrictEqual([name, 1]);
		}
		let ns = out.mod as unknown as Record<string, Record<string, (x: unknown) => unknown>>;
		expect(ns.N.run(1)).toStrictEqual(1);
		expect(ns.N.run('x')).toStrictEqual(undefined);
		expect(ns.M.run(1)).toStrictEqual(1);
		expect(ns.M.run('x')).toStrictEqual(undefined);
	});

	it('should not compile shadowing non-schemas', () => {
		expect(() => out.mod.keys(1)).toThrow('Invalid schema');
		expect(() => out.mod.named(1)).toThrow('Invalid schema');
		expect(() => out.mod.klass(1)).toThrow('Invalid schema');
	});
});

describe('rolldown (expressions)', () => {
	let out: Output;

	beforeAll(async () => {
		out = await compile({
			'shared.ts': `
				import * as t from 'tschema';
				const D = t.integer();
				export default D;
				export var V = t.string();
				export const Schemas = { A: t.string() };
				export const BASE = ['a', 'b'];
				export const LIST = [t.string(), t.integer()];
				export const PROPS = { a: t.string() };
			`,
			'a.ts': `export const Other = 1;`,
			'b.ts': `import * as t from 'tschema';\nexport const Found = t.boolean();`,
			'stars.ts': `export * from './a';\nexport * from './b';`,
			'data.json': `{ "type": "string" }`,
			'main.ts': `
				import * as t from 'tschema';
				import * as v from 'tschema/validate';
				import { parse } from 'tschema/validate';
				import D, { V, Schemas, BASE, LIST, PROPS } from './shared';
				import * as shared from './shared';
				import * as stars from './stars';
				import data from './data.json';

				const KEY = 'k';
				const Counter = t.integer({ minimum: 0 });
				Counter.minimum++;
				const Assigned = t.object({ a: t.string() });
				Object.assign(Assigned, { additionalProperties: true });

				export const fallback = (x: unknown) => parse(D, x);
				export const paren = (x: unknown) => parse((t.string()), x);
				export const template = (x: unknown) => parse(t.string({ pattern: \`^a$\` }), x);
				export const unary = (x: unknown) => parse(t.integer({ minimum: +1 }), x);
				export const arraySpread = (x: unknown) => parse(t.enum([...BASE, 'c']), x);
				export const objectSpread = (x: unknown) => parse(t.object({ ...PROPS, b: t.optional(t.integer()) }), x);
				export const optionalSpread = (x: unknown) => parse(t.object({ a: { ...t.optional(t.string()), description: 'x' } }), x);
				export const member = (x: unknown) => parse(Schemas.A, x);
				export const block = (x: unknown) => parse(t.recursive('B', (self) => { return t.object({ next: t.optional(self) }); }), x);
				export const callSpread = (x: unknown) => parse(t.any(...LIST), x);
				export const found = (x: unknown) => parse(stars.Found, x);
				export const multiline = (x: unknown) => parse(
					D,
					x,
				);

				export const exportVar = (x: unknown) => parse(V, x);
				export const templateExpr = (x: unknown) => parse(t.string({ pattern: \`^\${'a'}$\` }), x);
				export const unaryNot = (x: unknown) => parse(t.integer({ minimum: ~1 }), x);
				export const arraySpreadBad = (x: unknown) => parse(t.enum([...'ab']), x);
				export const objectSpreadBad = (x: unknown) => parse(t.object({ ...[t.string()] }), x);
				export const computedKey = (x: unknown) => parse(t.object({ [KEY]: t.string() }), x);
				export const regex = (x: unknown) => parse(t.string({ pattern: /^a$/ as never }), x);
				export const computedMember = (x: unknown) => parse(Schemas['A'], x);
				export const missingMember = (x: unknown) => parse((Schemas as Record<string, t.Type>).B, x);
				export const recursiveFn = (x: unknown) => parse(t.recursive('C', function (self) { return t.array(self); }), x);
				export const recursiveBlock = (x: unknown) => parse(t.recursive('E', (self) => { const s = t.array(self); return s; }), x);
				export const callSpreadBad = (x: unknown) => parse(t.any(...[t.string()].values()), x);
				export const conditional = (x: unknown) => parse(x ? D : V, x);
				export const json = (x: unknown) => parse(data as t.Type, x);
				export const namespace = (x: unknown) => parse(shared as never, x);
				export const missingStar = (x: unknown) => parse((stars as Record<string, t.Type>).Nope, x);
				export const counter = (x: unknown) => parse(Counter, x);
				export const assigned = (x: unknown) => parse(Assigned, x);
				export const computedApi = (x: unknown) => v['parse'](D, x);
			`,
		});
	});

	it('should compile static expressions', () => {
		let mod = out.mod;
		expect(mod.fallback(1)).toStrictEqual(1);
		expect(mod.fallback('x')).toStrictEqual(undefined);
		expect(mod.paren('x')).toStrictEqual('x');
		expect(mod.template('a')).toStrictEqual('a');
		expect(mod.template('b')).toStrictEqual(undefined);
		expect(mod.unary(1)).toStrictEqual(1);
		expect(mod.unary(0)).toStrictEqual(undefined);
		expect(mod.arraySpread('c')).toStrictEqual('c');
		expect(mod.arraySpread('d')).toStrictEqual(undefined);
		expect(mod.objectSpread({ a: 'x' })).toStrictEqual({ a: 'x' });
		expect(mod.objectSpread({ a: 'x', b: 'y' })).toStrictEqual(undefined);
		expect(mod.optionalSpread({})).toStrictEqual({});
		expect(mod.member('x')).toStrictEqual('x');
		expect(mod.block({ next: {} })).toStrictEqual({ next: {} });
		expect(mod.block({ next: { next: 1 } })).toStrictEqual(undefined);
		expect(mod.callSpread(1)).toStrictEqual(1);
		expect(mod.callSpread(true)).toStrictEqual(undefined);
		expect(mod.found(true)).toStrictEqual(true);
		expect(mod.multiline(1)).toStrictEqual(1);
	});

	it('should compile each distinct static schema once', () => {
		let entries = [...new Set(out.code.match(/tschema:\w+-[\da-f]{8}/g))];
		expect(entries.filter((x) => !x.startsWith('tschema:schema-'))).toStrictEqual([
			expect.stringMatching(/^tschema:D-/),
		]);
		expect(entries.length).toStrictEqual(10);
		expect(out.code).toMatch(/new Function/);
	});

	it('should validate dynamic expressions at runtime', () => {
		let mod = out.mod;
		expect(mod.exportVar('x')).toStrictEqual('x');
		expect(mod.templateExpr('a')).toStrictEqual('a');
		expect(mod.templateExpr('b')).toStrictEqual(undefined);
		expect(mod.unaryNot(-2)).toStrictEqual(-2);
		expect(mod.unaryNot(-3)).toStrictEqual(undefined);
		expect(mod.arraySpreadBad('b')).toStrictEqual('b');
		expect(mod.objectSpreadBad({ 0: 1 })).toStrictEqual(undefined);
		expect(mod.computedKey({ k: 1 })).toStrictEqual(undefined);
		expect(mod.regex('x')).toStrictEqual('x');
		expect(mod.computedMember('x')).toStrictEqual('x');
		expect(() => mod.missingMember('x')).toThrow('Invalid schema');
		expect(mod.recursiveFn([[]])).toStrictEqual([[]]);
		expect(mod.recursiveBlock([[1]])).toStrictEqual(undefined);
		expect(mod.callSpreadBad('x')).toStrictEqual('x');
		expect(mod.conditional(0)).toStrictEqual(undefined);
		expect(mod.json('x')).toStrictEqual('x');
		expect(mod.json(1)).toStrictEqual(undefined);
		expect(mod.namespace('x')).toStrictEqual('x');
		expect(() => mod.missingStar('x')).toThrow('Invalid schema');
		expect(mod.counter(0)).toStrictEqual(undefined);
		expect(mod.counter(1)).toStrictEqual(1);
		expect(mod.assigned({ a: 'x', b: 1 })).toStrictEqual({ a: 'x', b: 1 });
		expect(mod.computedApi(1)).toStrictEqual(1);
	});
});

describe('transform', () => {
	let dir: string;
	let hook = rolldown().transform as { handler: Function };

	function context(resolve: (source: string) => Promise<{ id: string } | null>) {
		return {
			parse(code: string) {
				let result = parseSync('x.ts', code, { lang: 'ts' });
				if (result.errors.length) throw new Error(result.errors[0].message);
				return result.program;
			},
			resolve,
			addWatchFile() {},
		};
	}

	beforeAll(async () => {
		dir = await project({ 'stars.ts': `export * from './missing';` });
	});

	afterAll(async () => {
		await rm(dir, { recursive: true });
	});

	it('should skip invalid code', async () => {
		let ctx = context(async () => null);
		let code = `import { parse } from 'tschema/validate';\nparse(,`;
		expect(await hook.handler.call(ctx, code, '/x/main.ts')).toBe(undefined);
	});

	it('should unwrap parenthesized schemas', async () => {
		let ctx = context(async () => null);
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nparse((t.string()), 1);`;
		let out = await hook.handler.call(ctx, code, '/x/main.ts');
		expect(out.code).toMatch(/__tschema0\.parse\(1\)/);
	});

	it('should throw unknown resolve errors', async () => {
		let ctx = context(async () => {
			throw new Error('boom');
		});
		let code = `import { parse } from 'tschema/validate';\nimport { S } from './s';\nparse(S, 1);`;
		await expect(hook.handler.call(ctx, code, '/x/main.ts')).rejects.toThrow('boom');
	});

	it('should throw unknown star export errors', async () => {
		let ctx = context(async (source) => {
			if (source === './stars') return { id: join(dir, 'stars.ts') };
			throw new Error('boom');
		});
		let code = `import { parse } from 'tschema/validate';\nimport { S } from './stars';\nparse(S, 1);`;
		await expect(hook.handler.call(ctx, code, join(dir, 'main.ts'))).rejects.toThrow('boom');
	});
});

describe('rolldown (suite)', () => {
	let out: Output;
	let groups: suite.Group[];

	beforeAll(async () => {
		groups = (await suite.load()).flatMap(([, list]) => list);
		let code = `import { validate } from 'tschema/validate';\nexport default [\n`;
		for (let g of groups) {
			let schema = JSON.stringify(g.schema).replaceAll('"__proto__":', '["__proto__"]:');
			code += `\t(x) => validate(${schema}, x),\n`;
		}
		out = await compile({ 'main.js': code + '];\n' }, 'main.js');
	});

	it('should compile every schema', () => {
		expect(out.code).not.toMatch(/new Function/);
	});

	it('should pass the JSON-Schema-Test-Suite', () => {
		let fns = out.mod.default as unknown as ((x: unknown) => { ok: boolean })[];
		let failures: string[] = [];
		groups.forEach((g, i) => {
			for (let test of g.tests) {
				if (fns[i](test.data).ok !== test.valid) {
					failures.push(`${g.description} :: ${test.description}`);
				}
			}
		});
		expect(failures).toStrictEqual([]);
	});
});

describe('vite', () => {
	let dir: string;

	const MAIN = `
		import { parse, validate } from 'tschema/validate';
		import { Person, Tree } from './schemas';

		export const user = (x: unknown) => validate(Person, x);
		export const tree = (x: unknown) => parse(Tree, x);
	`;

	beforeAll(async () => {
		dir = await project({ 'schemas.ts': SCHEMAS, 'tree.ts': TREE, 'main.ts': MAIN });
	});

	afterAll(async () => {
		await rm(dir, { recursive: true });
	});

	it('should compile in build mode', async () => {
		let result = await build({
			root: dir,
			logLevel: 'silent',
			configFile: false,
			plugins: [vite()],
			resolve: { alias: ALIAS },
			build: {
				write: false,
				minify: false,
				lib: { entry: join(dir, 'main.ts'), formats: ['es'] },
			},
		});
		let output = Array.isArray(result) ? result[0] : result;
		if (!('output' in output)) throw new Error('Expected build output');
		let code = output.output[0].code;
		expect(code).not.toMatch(/new Function/);
		expect(code).toMatch(/tschema:Person-/);
	});

	it('should compile in dev mode', async () => {
		let server = await createServer({
			root: dir,
			logLevel: 'silent',
			configFile: false,
			plugins: [vite()],
			resolve: { alias: ALIAS },
			server: { middlewareMode: true, ws: false },
		});

		try {
			let main = await server.transformRequest('/main.ts', { ssr: true });
			expect(main?.code).toMatch(/tschema:Person-/);

			let mod = await server.ssrLoadModule('/main.ts');
			expect(
				mod.user({ name: 'x', email: 'a@b.co', address: { city: 'a', zip: '12345' } }).ok,
			).toStrictEqual(false);
			expect(mod.tree({ value: 1, children: [] })).toStrictEqual({ value: 1, children: [] });
		} finally {
			await server.close();
		}
	});
});
