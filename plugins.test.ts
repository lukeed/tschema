import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown as bundle } from 'rolldown';
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
