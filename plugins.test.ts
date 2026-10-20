import { assert, assertEquals, assertMatch, assertNotMatch, assertThrows } from '@std/assert';
import { afterAll, beforeAll, describe, it } from '@std/testing/bdd';
import { join, toFileUrl } from '@std/path';
import { rolldown as bundle } from 'rolldown';
import { build, createServer } from 'vite';
import { rolldown, vite } from './plugins.ts';
import * as suite from './scripts/suite.ts';

const ROOT = import.meta.dirname!;

const ALIAS = {
	'tschema/validate': join(ROOT, 'validate.ts'),
	'tschema': join(ROOT, 'mod.ts'),
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
export { Tree } from './tree.ts';
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
	let dir = await Deno.makeTempDir({ prefix: 'tschema-' });
	for (let [name, code] of Object.entries(files)) {
		await Deno.writeTextFile(join(dir, name), code);
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
		mod: await import(toFileUrl(file).href),
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
				export * from './schemas.ts';
				export default t.string({ format: 'uuid' });
			`,
			'main.ts': `
				import Id, { Address as Addr } from './extra.ts';
				import * as t from 'tschema';
				import * as v from 'tschema/validate';
				import { assert, parse, validate } from 'tschema/validate';
				import { Person, Tree } from './schemas.ts';
				import * as schemas from './schemas.ts';

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
		assertNotMatch(out.code, /new Function/);
		assertNotMatch(out.code, /function compile\(/);
		assertMatch(out.code, /tschema:Person-/);
		assertMatch(out.code, /tschema:Tree-/);
		assertMatch(out.code, /tschema:Local-/);
		assertMatch(out.code, /tschema:Id-/);
		assertMatch(out.code, /tschema:Addr-/);
	});

	it('should resolve default and star exports', () => {
		assertEquals(
			out.mod.id('00000000-0000-0000-0000-000000000000'),
			'00000000-0000-0000-0000-000000000000',
		);
		assertEquals(out.mod.id('x'), undefined);
		assertEquals(out.mod.addr({ city: 'a', zip: '12345' }), { city: 'a', zip: '12345' });
		assertEquals(out.mod.addr({ city: 'a', zip: 'x' }), undefined);
	});

	it('should validate imported schemas', () => {
		assertEquals(out.mod.user({ name: 'x', email: 'bad', address: { city: 'a', zip: '123' } }), {
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
		assertEquals(out.mod.user(input), { ok: true, value: input });
	});

	it('should validate re-exported recursive schemas', () => {
		let input = { value: 1, children: [{ value: 2, children: [] }] };
		assertEquals(out.mod.tree(input), input);
		assertEquals(out.mod.tree({ value: 1, children: [{ value: 'x', children: [] }] }), undefined);
	});

	it('should validate local and namespace schemas', () => {
		assertEquals(out.mod.local({ id: 1 }), { ok: true, value: { id: 1 } });
		assertEquals(out.mod.local({ id: 0 }), {
			ok: false,
			errors: [{
				instanceLocation: '/id',
				keywordLocation: '/properties/id/minimum',
				error: 'must be >= 1',
			}],
		});
		assertEquals(out.mod.address({ city: 'a', zip: '12345' }), { city: 'a', zip: '12345' });
	});

	it('should throw ValidationError for inline schemas', () => {
		assertEquals(out.mod.inline([1, 2]), [1, 2]);
		let err = assertThrows(() => out.mod.inline([1, 2, 3]));
		assert(err instanceof Error);
		assertEquals(err.name, 'ValidationError');
		assertEquals(err.message, 'must NOT have more than 2 items');
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
			`,
		});
	});

	it('should keep the runtime compiler', () => {
		assertMatch(out.code, /new Function/);
		assertNotMatch(out.code, /tschema:\w+-[\da-f]{8}/);
	});

	it('should validate at runtime', () => {
		assertEquals(out.mod.mutable({ a: 'x' }), { a: 'x' });
		assertEquals(out.mod.mutated({ a: 'x', b: 1 }), { a: 'x', b: 1 });
		assertEquals(out.mod.factory(4), undefined);
		assertEquals(out.mod.factory(5), 5);
		assertEquals(out.mod.shadow('x'), 'x');
	});
});

describe('rolldown (suite)', () => {
	let out: Output;
	let groups: suite.Group[];

	beforeAll(async () => {
		groups = (await suite.load()).flatMap(([, list]) => list);
		let code = `import { validate } from 'tschema/validate';\nexport default [\n`;
		for (let g of groups) code += `\t(x) => validate(${JSON.stringify(g.schema)}, x),\n`;
		out = await compile({ 'main.js': code + '];\n' }, 'main.js');
	});

	it('should compile every schema', () => {
		assertNotMatch(out.code, /new Function/);
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
		assertEquals(failures, []);
	});
});

describe('vite', () => {
	let dir: string;

	const MAIN = `
		import { parse, validate } from 'tschema/validate';
		import { Person, Tree } from './schemas.ts';

		export const user = (x: unknown) => validate(Person, x);
		export const tree = (x: unknown) => parse(Tree, x);
	`;

	beforeAll(async () => {
		dir = await project({ 'schemas.ts': SCHEMAS, 'tree.ts': TREE, 'main.ts': MAIN });
	});

	afterAll(async () => {
		await Deno.remove(dir, { recursive: true });
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
		assert('output' in output);
		let code = output.output[0].code;
		assertNotMatch(code, /new Function/);
		assertMatch(code, /tschema:Person-/);
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
			assert(main);
			assertMatch(main.code, /tschema:Person-/);

			let mod = await server.ssrLoadModule('/main.ts');
			assertEquals(
				mod.user({ name: 'x', email: 'a@b.co', address: { city: 'a', zip: '12345' } }).ok,
				false,
			);
			assertEquals(mod.tree({ value: 1, children: [] }), { value: 1, children: [] });
		} finally {
			await server.close();
		}
	});
});
