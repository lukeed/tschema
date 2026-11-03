import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown as bundle } from 'rolldown';
import { parseSync } from 'rolldown/utils';
import { build, createServer } from 'vite';
import { rolldown, vite } from './plugins';
import * as fuzz from './scripts/fuzz';
import * as suite from './scripts/suite';

import type { InputOptions } from 'rolldown';

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

async function compile(
	files: Record<string, string>,
	entry = 'main.ts',
	aot = true,
	options: Omit<InputOptions, 'input' | 'plugins'> = {},
): Promise<Output> {
	let dir = await project(files);
	let b = await bundle({
		input: join(dir, entry),
		plugins: aot ? [rolldown()] : [],
		resolve: { alias: ALIAS },
		logLevel: 'silent',
		...options,
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
		expect(out.code).not.toMatch(/tschema:\w+-[\da-f]{16}/);
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
		let entries = [...new Set(out.code.match(/tschema:\w+-[\da-f]{16}/g))];
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

describe('rolldown (mutations)', () => {
	const SHARED = `
		import * as t from 'tschema';

		export const User = t.object({
			name: t.string({ minLength: 1 }),
			email: t.optional(t.string({ format: 'email' })),
		});

		export const Post = t.object({ title: t.string(), author: User });
	`;

	const HEAD = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\n`;

	type Case = {
		input: unknown;
		main: string;
		files?: Record<string, string>;
		options?: Omit<InputOptions, 'input' | 'plugins'>;
	};

	async function check(c: Case) {
		let files = { 'schemas.ts': SHARED, ...c.files, 'main.ts': HEAD + c.main };
		let [runtime, aot] = await Promise.all([
			compile(files, 'main.ts', false, c.options),
			compile(files, 'main.ts', true, c.options),
		]);
		return {
			compiled: /tschema:[\w$]+-[\da-f]{16}/.test(aot.code),
			runtime: runtime.mod.check(c.input),
			aot: aot.mod.check(c.input),
		};
	}

	const COMPILED: Record<string, Case> = {
		'plain import': {
			input: { name: '' },
			main: `
				import { User } from './schemas';
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		composition: {
			input: { title: 'x', author: { name: '' } },
			main: `
				import { Post } from './schemas';
				export const check = (x: unknown) => parse(Post, x);
			`,
		},
		registry: {
			input: { name: '' },
			main: `
				import { Post, User } from './schemas';
				const Schemas = { User, Post };
				export const check = (x: unknown) => parse(Schemas.User, x);
			`,
		},
		'extend by spread': {
			input: { name: 'a', password: '12345678' },
			main: `
				import { User } from './schemas';
				const Signup = t.object({ ...User.properties, password: t.string({ minLength: 8 }) });
				export const check = (x: unknown) => parse(Signup, x);
			`,
		},
		'type queries': {
			input: { name: '' },
			main: `
				import { User } from './schemas';
				type Shape = t.Infer<typeof User>;
				const read = (x: unknown) => x as typeof User;
				export const check = (x: unknown): Shape | undefined => parse(User, x);
			`,
		},
		'read-only uses': {
			input: { name: '' },
			main: `
				import { User } from './schemas';
				const named = User === null ? 'none' : typeof User;
				const Lazy = () => User;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'recursive builder': {
			input: { user: { name: '' }, replies: [] },
			main: `
				import { User } from './schemas';
				const Thread = t.recursive('Thread', (self) => t.object({ user: User, replies: t.array(self) }));
				export const check = (x: unknown) => parse(Thread, x);
			`,
		},
	};

	COMPILED['infinite limits'] = {
		input: 5,
		main: `
			export const other = (x: unknown) => parse(t.number({ minimum: 1e999 }), x);
			export const check = (x: unknown) => parse(t.number({ minimum: -1e999 }), x);
		`,
	};

	COMPILED['import kept for side effects'] = {
		input: { name: 'a' },
		files: {
			'other.ts': `
				import * as t from 'tschema';
				export const Other = t.object({ name: t.string(), email: t.optional(t.string()) });
			`,
			'patch.ts': `
				import * as t from 'tschema';
				import { Other } from './other';
				export const User = t.object({ name: t.string() });
				Other.required!.push('email');
			`,
		},
		main: `
			import { User } from './patch';
			import { Other } from './other';
			let O: any = Other;
			export const check = (x: unknown) => [parse(User, x), parse(O, x)];
		`,
	};

	COMPILED['registry with a recursive schema'] = {
		input: { name: '' },
		main: `
			import { User } from './schemas';
			const Schemas = { User, Tree: t.recursive('Tree', (self) => t.array(self)) };
			export const check = (x: unknown) => parse(Schemas.User, x);
		`,
	};

	COMPILED['import require alias'] = {
		input: { name: '' },
		main: `
			import S = require('./schemas');
			export const check = (x: unknown) => parse(S.User, x);
		`,
	};

	COMPILED['import require kept for side effects'] = {
		input: { name: 'a' },
		files: {
			'other.ts': `
				import * as t from 'tschema';
				export const Other = t.object({ name: t.string(), email: t.optional(t.string()) });
			`,
			'patch.ts': `
				import * as t from 'tschema';
				import { Other } from './other';
				export const User = t.object({ name: t.string() });
				Other.required!.push('email');
			`,
		},
		main: `
			import P = require('./patch');
			import { Other } from './other';
			let O: any = Other;
			export const check = (x: unknown) => [parse(P.User, x), parse(O, x)];
		`,
	};

	COMPILED['lone surrogate key'] = {
		input: { '\ud800': 'a' },
		main: `
			export const check = (x: unknown) => parse(t.object({ '\\ud800': t.string() }), x);
		`,
	};

	COMPILED['decorator metadata'] = {
		input: { name: 'a' },
		options: { transform: { decorator: { legacy: true, emitDecoratorMetadata: true } } },
		files: {
			'users.ts': `
				import * as t from 'tschema';
				export class UsersService {}
				export const CreateUser = t.object({ name: t.string() });
			`,
		},
		main: `
			import { UsersService, CreateUser } from './users';
			const deps: string[] = [];
			(Reflect as any).metadata = (k: string, v: any) => () => { if (k === 'design:paramtypes') deps.push(...v.map((d: any) => d.name)); };
			const Injectable = (): ClassDecorator => () => {};
			@Injectable()
			class UsersController {
				constructor(private users: UsersService) {}
				create(body: unknown) { return parse(CreateUser, body); }
			}
			export const check = (x: unknown) => [deps, new UsersController(null as any).create(x)];
		`,
	};

	COMPILED['jsx factory import'] = {
		input: 'a',
		files: {
			'lib.ts': `
				import * as t from 'tschema';
				export function h(tag: string) { return { tag }; }
				export const S = t.string();
			`,
			'app.tsx': `
				/** @jsxRuntime classic */
				/** @jsx h */
				import { parse } from 'tschema/validate';
				import { h, S } from './lib';
				export const check = (x: unknown) => [parse(S, x), <div />];
			`,
		},
		main: `
			export * from './app';
		`,
	};

	COMPILED['export type of a schema import'] = {
		input: { name: 'a' },
		files: {
			'other.ts': `
				import * as t from 'tschema';
				export const Other = t.object({ name: t.string(), email: t.optional(t.string()) });
			`,
			'lib.ts': `
				import * as t from 'tschema';
				import { Other } from './other';
				Other.required!.push('email');
				export const S = t.object({ name: t.string() });
			`,
		},
		main: `
			import { S } from './lib';
			import { Other } from './other';
			export type { S };
			let O: any = Other;
			export const check = (x: unknown) => [parse(S, x), parse(O, x)];
		`,
	};

	COMPILED['star string export name'] = {
		input: 'ab',
		files: {
			'idx.ts': `
				import * as t from 'tschema';
				const Real = { Inner: t.string({ minLength: 5 }) };
				export { Real as "*" };
				export const Inner = t.string();
			`,
		},
		main: `
			import { "*" as R } from './idx';
			export const check = (x: unknown) => parse(R.Inner, x);
		`,
	};

	COMPILED['generated name in use'] = {
		input: 'a',
		main: `
			// __tschema0
			export const check = (x: unknown) => [parse(t.string(), x), parse(t.number(), x)];
		`,
	};

	COMPILED['shared subschemas'] = {
		input: 'a',
		main: [
			'const A0 = t.string({ minLength: 1 });',
			...Array.from({ length: 22 }, (_, i) => `const A${i + 1} = t.any(A${i}, A${i});`),
			'export const check = (x: unknown) => parse(A22, x);',
		].join('\n'),
	};

	COMPILED['large registry'] = {
		input: 'a',
		main: [
			'const S = t.string();',
			`const R = { ${Array.from({ length: 16000 }, (_, i) => `k${i}: S`).join(', ')} };`,
			'export const check = (x: unknown) => parse(R.k0, x);',
		].join('\n'),
	};

	const RUNTIME: Record<string, Case> = {
		'hash in a file name': {
			input: { name: 'a' },
			files: { 'idx#1.ts': `export { User } from './schemas';` },
			main: `
				import { User as U } from './idx#1';
				import { User } from './schemas';
				U.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'jsx in a js re-export': {
			input: { name: 'a' },
			options: { moduleTypes: { '.js': 'jsx' } },
			files: {
				'idx.js': `/** @jsxRuntime classic */\n/** @jsx h */\nexport { User } from './schemas';\nfunction h() { return null; }\nexport const el = <div />;\n`,
			},
			main: `
				import { User as U } from './idx.js';
				import { User } from './schemas';
				U.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'computed import in a dependency': {
			input: { u: { name: 'a' }, e: 'x' },
			files: {
				'e.ts': `import * as t from 'tschema';\nexport const Extra = t.string();`,
				'd.ts': `
					const name = 'schemas';
					const m: any = await import(\`./\${name}.ts\`);
					m.User.required.push('email');
					export { Extra } from './e';
				`,
			},
			main: `
				import { User } from './schemas';
				import { Extra } from './d';
				export const check = (x: unknown) => parse(t.object({ u: User, e: Extra }), x);
			`,
		},
		'computed member key': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const R = { s: User, toString: (0, function (this: any) { this.s.required.push('email'); return 'k'; }) };
				export const k = ({} as any)[R as any];
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'computed object key': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const R = { s: User, toString: (0, function (this: any) { this.s.required.push('email'); return 'k'; }) };
				export const K = { [R as any]: 1 };
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'conditional function value': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const c = false as boolean;
				const R = { s: User, toString: c ? 0 : function (this: any) { this.s.required.push('email'); return 'k'; } };
				export const k = ({} as any)[R as any];
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'namespace export shadows': {
			input: 'ab',
			main: `
				const User = t.string();
				namespace N {
					export const User = t.string({ minLength: 5 });
					export const check = (x: unknown) => parse(User, x);
				}
				export const check = N.check;
			`,
		},
		'enum member scope': {
			input: null,
			main: `
				const S = t.string();
				let result: unknown;
				enum E { S = 7, X = (() => { try { result = parse(S as any, 'ab'); } catch (e) { result = (e as Error).name; } return 1; })() }
				export const check = (_: unknown) => [result, E.X];
			`,
		},
		'namespace with only declarations': {
			input: { name: '' },
			main: `
				import { User } from './schemas';
				namespace N {
					namespace User { declare const x: number; }
					export const check = (x: unknown) => parse(User as any, x);
				}
				export const check = N.check;
			`,
		},
		'ambiguous star export': {
			input: 'ab',
			files: {
				'a.ts': `import * as t from 'tschema';\nexport const S = t.string({ minLength: 5 });`,
				'b.ts': `import * as t from 'tschema';\nexport const S = t.string();`,
				'idx.ts': `export * from './a';\nexport * from './b';`,
			},
			main: `
				import * as idx from './idx';
				export const check = (x: unknown) => {
					try { return parse(idx.S, x); } catch { return 'error'; }
				};
			`,
		},
		'async recursive': {
			input: { value: 'nope' },
			main: `
				const Node = t.recursive('Node', async (self: any) => t.object({ value: t.integer(), next: t.optional(self) }));
				export const check = (x: unknown) => parse(Node, x);
			`,
		},
		'recursive param shadows a builder': {
			input: 'ab',
			main: `
				export const check = (x: unknown) => {
					try { return parse(t.recursive('x', (t: any) => t.string({ minLength: 5 })), x); } catch { return 'error'; }
				};
			`,
		},
		'module var in a block': {
			input: [1],
			main: `
				{ var undefined: any = t.string(); }
				export const check = (x: unknown) => parse(t.array(undefined), x);
			`,
		},
		'builder throws': {
			input: 'ab',
			main: `
				export const check = (x: unknown) => {
					try { return parse(t.object({ a: null as any }), x); } catch { return 'error'; }
				};
			`,
		},
		'getter in a registry': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const R = { s: User, get x() { this.s.required!.push('email'); return 1; } };
				export const n = R.x;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'valueOf in a registry': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const R = { s: User, valueOf() { this.s.required!.push('email'); return 1; } };
				export const n = (R as any) + 1;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'iterator in a registry': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const R = { s: User, *[Symbol.iterator]() { this.s.required!.push('email'); } };
				export const all = [...R];
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'function value in a registry': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const R = { s: User, valueOf: function () { this.s.required!.push('email'); return 1; } };
				export const n = (R as any) + 1;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'getter in builder options': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const S = t.string({ s: User, get minLength() { (this as any).s.required.push('email'); return 1; } } as any);
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'parse returns the input': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				let Any = t.unknown();
				(parse(Any, User) as any).required.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'validate returns the input': {
			input: { name: 'a' },
			main: `
				import { validate } from 'tschema/validate';
				import { User } from './schemas';
				let Any = t.unknown();
				(validate(Any, User) as any).value.required.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'borrowed validate method': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				// @ts-ignore
				parse.call.call(Array.prototype.push, User.required, 'email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'export * as': {
			input: { name: 'a' },
			files: { 'index.ts': `export * as api from './schemas';` },
			main: `
				import { api } from './index';
				import { User } from './schemas';
				api.User.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'import require': {
			input: { name: 'a' },
			main: `
				import S = require('./schemas');
				import { User } from './schemas';
				S.User.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'require call': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				declare const require: any;
				require('./schemas').User.required.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'dynamic import': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const m = await import('./schemas');
				m.User.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'direct eval': {
			input: { name: 'a' },
			main: `
				const User = t.object({ name: t.string(), email: t.optional(t.string()) });
				eval("User.required.push('email')");
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'param default before body var': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const f = (s = User) => { var User; s.required!.push('email'); };
				f();
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'param default before body let': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				function f(s = User.required!.push('email')) { let User = 1; return User + s; }
				f();
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'var in a static block': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const f = () => { class C { static { var User; } } User.required!.push('email'); };
				f();
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'var in a nested namespace': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				namespace A { namespace B { var User = 1; } User.required!.push('email'); }
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'type-only namespace': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				namespace N { namespace User { export type T = 1; } User.required!.push('email'); }
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'switch discriminant': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				switch (User.required!.push('email')) { default: let User = 1; }
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'second-level module': {
			input: { author: { name: 'a' }, extra: 'x' },
			files: {
				'b.ts': `
					import * as t from 'tschema';
					import { User } from './schemas';
					User.required!.push('email');
					export const Extra = t.string();
				`,
			},
			main: `
				import { User } from './schemas';
				import { Extra } from './b';
				const Post = t.object({ author: User, extra: Extra });
				export const check = (x: unknown) => parse(Post, x);
			`,
		},
		'declare const': {
			input: 'ab',
			main: `
				(globalThis as any).MIN = 5;
				declare const MIN = 1;
				export const check = (x: unknown) => parse(t.string({ minLength: MIN }), x);
			`,
		},
		'invalid pattern': {
			input: 'x',
			main: `
				export const check = (x: unknown) => {
					try { return parse(t.string({ pattern: '(' }), x); } catch { return 'error'; }
				};
			`,
		},
		'named function value': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				function vo(this: any) { this.s.required.push('email'); return 1; }
				const R = { s: User, valueOf: vo };
				export const n = (R as any) + 1;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'shorthand function value': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				function valueOf(this: any) { this.s.required.push('email'); return 1; }
				const R = { s: User, valueOf };
				export const n = (R as any) + 1;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'cast function value': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const R = { s: User, valueOf: function (this: any) { this.s.required.push('email'); return 1; } as () => number };
				export const n = (R as any) + 1;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'borrowed function value': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				class M { valueOf(this: any) { this.s.required.push('email'); return 1; } }
				const R = { s: User, valueOf: M.prototype.valueOf };
				export const n = (R as any) + 1;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'inherited getter': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const P = { get x() { (this as any).s.required.push('email'); return 1; } };
				const R = { __proto__: P, s: User };
				export const n = (R as any).x;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'inherited getter run by validation': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				const P = { get name() { (this as any).s.required.push('email'); return 'x'; } };
				const R = { __proto__: P, s: User };
				let Named = t.object({ name: t.string() });
				parse(Named, R);
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'instanceof hook': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				class Hook { static [Symbol.hasInstance](v: any) { v.required.push('email'); return true; } }
				export const b = User instanceof Hook;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'enum initializer': {
			input: { name: 'a' },
			main: `
				import { User } from './schemas';
				// @ts-ignore
				enum E { A = User }
				(E.A as any).required.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'erased declare const': {
			input: { name: 'a' },
			main: `
				const User = t.object({ name: t.string(), email: t.optional(t.string()) });
				namespace N { declare const User: any; User.required.push('email'); }
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'erased declare class': {
			input: { name: 'a' },
			main: `
				const User = t.object({ name: t.string(), email: t.optional(t.string()) });
				namespace N { declare class User {} (User as any).required.push('email'); }
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'jsx tag': {
			input: { name: 'a' },
			files: {
				'app.tsx': `
					/** @jsxRuntime classic */
					/** @jsx h */
					import { parse } from 'tschema/validate';
					import { User } from './schemas';
					function h(tag: any) { tag.required.push('email'); return null; }
					export const el = <User />;
					export const check = (x: unknown) => parse(User, x);
				`,
			},
			main: `
				export * from './app';
			`,
		},
		'mutation in a re-export module': {
			input: { name: 'a' },
			files: {
				'index.ts': `
					import { User as U } from './schemas';
					U.required!.push('email');
					export { User } from './schemas';
				`,
			},
			main: `
				import { User } from './index';
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'mutation in a star re-export module': {
			input: { name: 'a' },
			files: {
				'index.ts': `
					import { User as U } from './schemas';
					U.required!.push('email');
					export * from './schemas';
				`,
			},
			main: `
				import { User } from './index';
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'dynamic import in a re-export module': {
			input: { name: 'a' },
			files: {
				'index.ts': `
					const m = await import('./schemas');
					m.User.required!.push('email');
					export { User } from './schemas';
				`,
			},
			main: `
				import { User } from './index';
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'function leak': {
			input: { name: 'a' },
			files: {
				'reg.ts': `
					import { User } from './schemas';
					export function get() { return User; }
				`,
			},
			main: `
				import { User } from './schemas';
				import { get } from './reg';
				get().required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'class leak': {
			input: { name: 'a' },
			files: {
				'reg.ts': `
					import { User } from './schemas';
					export class Reg { static User = User; }
				`,
			},
			main: `
				import { User } from './schemas';
				import { Reg } from './reg';
				Reg.User.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'eval in a re-export module': {
			input: { name: 'a' },
			files: {
				'index.ts': `
					export { User } from './schemas';
					eval('0');
				`,
			},
			main: `
				import { User as V } from './index';
				import { User } from './schemas';
				V.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'unresolved ref': {
			input: { a: 1 },
			main: `
				export const check = (x: unknown) => {
					try { return parse(t.object({ a: { $ref: '#/nope' } as never }), x); } catch { return 'error'; }
				};
			`,
		},
		'required.push': {
			input: { name: 'a' },
			main: `
				const User = t.object({ name: t.string(), email: t.optional(t.string()) });
				User.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'Object.assign on properties': {
			input: { name: 'a', role: 'admin' },
			main: `
				const User = t.object({ name: t.string() });
				Object.assign(User.properties!, { role: t.enum(['admin', 'member']) });
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'non-null assertion': {
			input: { port: 80 },
			main: `
				const Config = t.object({ port: t.integer() });
				Config.properties!.port.minimum = 1024;
				export const check = (x: unknown) => parse(Config, x);
			`,
		},
		'type assertion': {
			input: { port: 80 },
			main: `
				const Config = t.object({ port: t.integer() });
				(Config as { properties: { port: { minimum?: number } } }).properties.port.minimum = 1024;
				export const check = (x: unknown) => parse(Config, x);
			`,
		},
		alias: {
			input: { name: 'a', extra: 1 },
			main: `
				const User = t.object({ name: t.string() });
				const Loose: { additionalProperties?: unknown } = User;
				Loose.additionalProperties = true;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		destructuring: {
			input: { name: 'a', extra: 1 },
			main: `
				const User = t.object({ name: t.string() });
				const { properties } = User;
				Object.assign(properties!, { extra: t.integer() });
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'via parent': {
			input: { name: 'ab' },
			main: `
				const User = t.object({ name: t.string() });
				const Post = t.object({ author: User });
				Post.properties!.author.properties!.name.minLength = 3;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'via imported parent': {
			input: { name: 'a' },
			main: `
				import { Post, User } from './schemas';
				Post.properties!.author.properties!.name.minLength = 3;
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'via namespace': {
			input: { name: 'a' },
			main: `
				import * as schemas from './schemas';
				import { User } from './schemas';
				schemas.User.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'via re-export': {
			input: { name: 'a' },
			files: { 'index.ts': `export * from './schemas';` },
			main: `
				import { User as Base } from './schemas';
				import { User } from './index';
				Base.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'held by a parent': {
			input: { author: { name: 'a' } },
			main: `
				const User = t.object({ name: t.string(), email: t.optional(t.string()) });
				const Post = t.object({ author: User });
				User.required!.push('email');
				export const check = (x: unknown) => parse(Post, x);
			`,
		},
		'held by an imported parent': {
			input: { title: 'x', author: { name: 'a' } },
			main: `
				import { Post, User } from './schemas';
				User.required!.push('email');
				export const check = (x: unknown) => parse(Post, x);
			`,
		},
		'via namespace named re-export': {
			input: { name: 'a' },
			files: { 'index.ts': `export { User } from './schemas';` },
			main: `
				import * as api from './index';
				import { User } from './schemas';
				api.User.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'via namespace star re-export': {
			input: { name: 'a' },
			files: { 'index.ts': `export * from './schemas';` },
			main: `
				import * as api from './index';
				import { User } from './schemas';
				api.User.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'in the defining module': {
			input: { name: 'a' },
			files: {
				'user.ts': `
					import * as t from 'tschema';
					export const User = t.object({ name: t.string(), email: t.optional(t.string()) });
					User.required!.push('email');
				`,
			},
			main: `
				import { User } from './user';
				export const check = (x: unknown) => parse(User, x);
			`,
		},
		'own function': {
			input: { name: '' },
			main: `
				import { User } from './schemas';
				const routes: { path: string; schema: t.Type }[] = [];
				function route(path: string, schema: t.Type) {
					routes.push({ path, schema });
				}
				route('/users', User);
				export const check = (x: unknown) => parse(User, x);
			`,
		},
	};

	for (let [name, c] of Object.entries(COMPILED)) {
		it(`should compile: ${name}`, async () => {
			let out = await check(c);
			expect(out.compiled).toBe(true);
			expect(out.aot).toStrictEqual(out.runtime);
		});
	}

	for (let [name, c] of Object.entries(RUNTIME)) {
		it(`should use the runtime: ${name}`, async () => {
			let out = await check(c);
			expect(out.compiled).toBe(false);
			expect(out.aot).toStrictEqual(out.runtime);
		});
	}

	it('should finish on export cycles', async () => {
		let out = await check({
			input: 'x',
			files: {
				'a.ts': `export * from './b';\nexport * from './c';`,
				'b.ts': `export * from './a';`,
				'c.ts': `import * as t from 'tschema';\nexport const X = t.string();`,
			},
			main: `
				import { X } from './a';
				export const check = (x: unknown) => parse(X, x);
			`,
		});
		expect(out.compiled).toBe(true);
		expect(out.aot).toStrictEqual(out.runtime);
	}, 10_000);

	it('should finish on self references', async () => {
		let files = {
			'schemas.ts': SHARED,
			'a.ts': `import * as t from 'tschema';\nimport { B } from './b';\nexport const A = t.object({ b: B });`,
			'b.ts': `import * as t from 'tschema';\nimport { A } from './a';\nexport const B = t.object({ a: A });`,
			'main.ts': `${HEAD}
				import { A } from './a';
				const Self: t.Type = t.object({ self: Self });
				export const self = (x: unknown) => parse(Self, x);
				export const check = (x: unknown) => parse(A, x);
			`,
		};
		await expect(compile(files, 'main.ts', false)).rejects.toThrow(ReferenceError);
		await expect(compile(files)).rejects.toThrow(ReferenceError);
	}, 10_000);

	it('should fail like the runtime on ambiguous imports', async () => {
		let files = {
			'schemas.ts': SHARED,
			'a.ts': `import * as t from 'tschema';\nexport const S = t.string({ minLength: 5 });`,
			'b.ts': `import * as t from 'tschema';\nexport const S = t.string();`,
			'idx.ts': `export * from './a';\nexport * from './b';`,
			'main.ts': `${HEAD}
				import { S } from './idx';
				export const check = (x: unknown) => parse(S, x);
			`,
		};
		await expect(compile(files, 'main.ts', false)).rejects.toThrow();
		await expect(compile(files)).rejects.toThrow();
	});

	it('should not compile when an escape reaches a virtual module', async () => {
		let dir = await project({
			'schemas.ts': SHARED,
			'main.ts': `${HEAD}
				import { User as U } from 'virtual:reg';
				import { User } from './schemas';
				U.required!.push('email');
				export const check = (x: unknown) => parse(User, x);
			`,
		});
		let reg = {
			name: 'reg',
			resolveId: (id: string) => (id === 'virtual:reg' ? '\0virtual:reg' : null),
			load: (id: string) =>
				id === '\0virtual:reg'
					? `export { User } from ${JSON.stringify(join(dir, 'schemas.ts'))};`
					: null,
		};
		let run = async (aot: boolean) => {
			let out = join(dir, aot ? 'aot' : 'runtime');
			let b = await bundle({
				input: join(dir, 'main.ts'),
				plugins: aot ? [reg, rolldown()] : [reg],
				resolve: { alias: ALIAS },
				logLevel: 'silent',
			});
			let { output } = await b.write({ dir: out, format: 'esm' });
			await b.close();
			let mod = await import(pathToFileURL(join(out, output[0].fileName)).href);
			return { code: output[0].code, result: mod.check({ name: 'a' }) };
		};
		let runtime = await run(false);
		let aot = await run(true);
		expect(aot.code).not.toMatch(/tschema:User-/);
		expect(aot.result).toStrictEqual(runtime.result);
	});

	it('should keep each tschema copy apart', async () => {
		let dir = await mkdtemp(join(tmpdir(), 'tschema-'));
		for (let pkg of ['a', 'b']) {
			let lib = join(dir, pkg, 'node_modules', 'tschema');
			await mkdir(lib, { recursive: true });
			for (let file of ['mod.ts', 'validate.ts', 'compile.ts']) {
				await copyFile(join(ROOT, file), join(lib, file));
			}
			await writeFile(
				join(lib, 'package.json'),
				JSON.stringify({
					name: 'tschema',
					type: 'module',
					exports: { '.': './mod.ts', './validate': './validate.ts' },
				}),
			);
			await writeFile(
				join(dir, pkg, 'check.ts'),
				`import * as t from 'tschema';\nimport { assert, ValidationError } from 'tschema/validate';\nexport const check = (x: unknown) => {\n\ttry { assert(t.string(), x); return 'ok'; } catch (e) { return e instanceof ValidationError; }\n};\n`,
			);
		}
		await writeFile(
			join(dir, 'main.ts'),
			`export { check as a } from './a/check';\nexport { check as b } from './b/check';\n`,
		);
		let b = await bundle({
			input: join(dir, 'main.ts'),
			plugins: [rolldown()],
			logLevel: 'silent',
		});
		let { output } = await b.write({ dir: join(dir, 'dist'), format: 'esm' });
		await b.close();
		let mod = await import(pathToFileURL(join(dir, 'dist', output[0].fileName)).href);
		expect(output[0].code).not.toMatch(/new Function/);
		expect(mod.a(1)).toBe(true);
		expect(mod.b(1)).toBe(true);
	});

	it('should not see changes in other modules', async () => {
		let out = await check({
			input: { name: 'a' },
			files: {
				'patch.ts': `
					import { User } from './schemas';
					User.required!.push('email');
				`,
			},
			main: `
				import './patch';
				import { User } from './schemas';
				export const check = (x: unknown) => parse(User, x);
			`,
		});
		expect(out.compiled).toBe(true);
		expect(out.runtime).toBe(undefined);
		expect(out.aot).toStrictEqual({ name: 'a' });
	});
});

describe('transform', () => {
	let dir: string;
	let hook = rolldown().transform as { handler: Function };

	function context(resolve: (source: string) => Promise<{ id: string } | null>) {
		return {
			parse(code: string, options?: { lang?: 'js' | 'jsx' | 'ts' | 'tsx' }) {
				let lang = options?.lang || 'ts';
				let result = parseSync('x.' + lang, code, { lang });
				if (result.errors.length) throw new Error(result.errors[0].message);
				return result.program;
			},
			resolve,
			addWatchFile() {},
		};
	}

	beforeAll(async () => {
		dir = await project({
			'stars.ts': `export * from './missing';`,
			'bad.ts': `export const X = {};\n@@@`,
			'barrel.ts': `export * from 'virtual:fn';`,
		});
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

	it('should not compile namespace aliases', async () => {
		let ctx = context(async () => null);
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nnamespace N { export const S = t.string(); }\nimport S = N.S;\nparse(S, 1);`;
		expect(await hook.handler.call(ctx, code, '/x/main.ts')).toBe(undefined);
	});

	it('should not compile when a dependency cannot be parsed', async () => {
		let ctx = context(async (source) => (source === './bad' ? { id: join(dir, 'bad.ts') } : null));
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nimport { X } from './bad';\n(X as any).y = 1;\nparse(t.string(), 1);`;
		expect(await hook.handler.call(ctx, code, join(dir, 'main.ts'))).toBe(undefined);
		let plain = code.replace('(X as any).y = 1;', '');
		let out = await hook.handler.call(ctx, plain, join(dir, 'main.ts'));
		expect(out.code).toMatch(/__tschema0\.parse\(1\)/);
	});

	it('should not compile calls in enum initializers', async () => {
		let ctx = context(async () => null);
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nconst S = t.string();\nenum E { S = 7 }\nenum E { X = parse(S as any, 1) as any }`;
		expect(await hook.handler.call(ctx, code, '/x/main.ts')).toBe(undefined);
	});

	it('should only call into modules it cannot read', async () => {
		let ctx = context(async (source) => {
			if (source === 'virtual:fn') return { id: '\0virtual:fn' };
			if (source === './Comp.vue') return { id: join(dir, 'Comp.vue') };
			if (source === 'pkg/style.css') return { id: join(dir, 'node_modules/pkg/style.css') };
			if (source === './barrel') return { id: join(dir, 'barrel.ts') };
			return null;
		});
		let head = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nconst S = t.string();\nparse(S, 1);\n`;
		let compiled = async (body: string) => {
			let out = await hook.handler.call(ctx, head + body, join(dir, 'main.tsx'));
			return out !== undefined;
		};
		expect(await compiled(`import { register } from 'virtual:fn';\nregister();`)).toBe(true);
		expect(await compiled(`import { Worker } from 'virtual:fn';\nnew Worker();`)).toBe(true);
		expect(await compiled(`import Comp from './Comp.vue';\nexport const el = <Comp />;`)).toBe(
			true,
		);
		expect(await compiled(`import css from 'pkg/style.css';\nObject.assign(css, {});`)).toBe(true);
		expect(await compiled(`import { U } from 'virtual:fn';\nObject.assign(U, {});`)).toBe(false);
		expect(
			await compiled(`import { U } from 'virtual:fn';\nconst R = { U };\nObject.assign(R, {});`),
		).toBe(false);
		expect(await compiled(`import { V } from './barrel';\nObject.assign(V, {});`)).toBe(false);
	});

	it('should treat exported import aliases as namespace values', async () => {
		let ctx = context(async () => null);
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nconst S = t.string();\nnamespace M { export const Y = 1; }\nnamespace N { namespace S { export import X = M.Y; } export const run = (x: unknown) => parse(S as any, x); }`;
		expect(await hook.handler.call(ctx, code, '/x/main.ts')).toBe(undefined);
	});

	it('should handle deep expressions', async () => {
		let ctx = context(async () => null);
		let terms = Array.from({ length: 50_000 }, (_, i) => `'${i}'`).join(' + ');
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nconst big = ${terms};\nparse(t.string(), 1);`;
		let out = await hook.handler.call(ctx, code, '/x/main.ts');
		expect(out.code).toMatch(/__tschema0\.parse\(1\)/);
	});

	it('should treat enum members as names in enum initializers', async () => {
		let ctx = context(async () => null);
		let head = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nconst S = t.string();\n`;
		for (let member of ['S', `'S'`]) {
			let code = head + `enum E { ${member} = 1, X = delete (S as any).y ? 1 : 2 }\nparse(S, 1);`;
			let out = await hook.handler.call(ctx, code, '/x/main.ts');
			expect(out.code).toMatch(/__tschema0\.parse\(1\)/);
		}
		let code = head + `enum E { A = delete (S as any).y ? 1 : 2 }\nparse(S, 1);`;
		expect(await hook.handler.call(ctx, code, '/x/main.ts')).toBe(undefined);
	});

	it('should not compile regex literals the parser cannot build', async () => {
		let ctx = context(async () => null);
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nparse(t.constant(/a{99999999999999999999}/ as any), 1);`;
		expect(await hook.handler.call(ctx, code, '/x/main.ts')).toBe(undefined);
	});

	it('should not compile with computed imports', async () => {
		let ctx = context(async () => null);
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nconst S = t.string();\nlet path = './x';\nimport(path);\nparse(S, 1);`;
		expect(await hook.handler.call(ctx, code, '/x/main.ts')).toBe(undefined);
		let plain = code.replace('import(path);', '');
		let out = await hook.handler.call(ctx, plain, '/x/main.ts');
		expect(out.code).toMatch(/__tschema0\.parse\(1\)/);
	});

	it('should unwrap parenthesized references', async () => {
		let ctx = context(async () => null);
		let code = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nconst S = t.string();\nparse((S), 1);\n(S).minLength = 1;\nparse(S, 1);`;
		expect(await hook.handler.call(ctx, code, '/x/main.ts')).toBe(undefined);
		let safe = `import * as t from 'tschema';\nimport { parse } from 'tschema/validate';\nconst S = t.string();\nparse((S), 1);`;
		let out = await hook.handler.call(ctx, safe, '/x/main.ts');
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

describe('rolldown (fuzz)', () => {
	it('should match the runtime on generated projects', async () => {
		let failed: number[] = [];
		let compiled = 0;
		for (let seed = 1; seed <= 100; seed++) {
			let report = await fuzz.run(seed);
			if (report.failed) failed.push(seed);
			if (report.compiled) compiled++;
		}
		expect(failed).toStrictEqual([]);
		expect(compiled).toBeGreaterThan(90);
	}, 60_000);

	it('should shrink a failing project', async () => {
		let unused = `const c1 = (x: unknown) => JSON.stringify(parse(S1, x)) ?? 'undefined';`;
		let report = await fuzz.run(0, {
			's0.ts': [
				`import * as t from 'tschema';`,
				`export const S0 = t.object({ name: t.string() });`,
				`export const S1 = t.object({ age: t.integer() });`,
			],
			'patch.ts': [`import { S0 } from './s0';`, `S0.additionalProperties = true;`],
			'extra.ts': [`export const X = 1;`],
			'main.ts': [
				`import { parse } from 'tschema/validate';`,
				`import './patch';`,
				`import { S0, S1 } from './s0';`,
				`const c0 = (x: unknown) => JSON.stringify(parse(S0, x)) ?? 'undefined';`,
				unused,
			],
		});
		expect(report.failed).toBe(true);
		let small = await fuzz.shrink(report);
		expect(small.failed).toBe(true);
		expect(small.project['patch.ts']).toBeDefined();
		expect(small.project['extra.ts']).toBeUndefined();
		expect(small.project['main.ts']).not.toContain(unused);
	}, 60_000);
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

	it('should not read query imports as code', async () => {
		let root = await project({
			's.ts': `import * as t from 'tschema';\nexport default t.string();`,
			'main.ts': `
				import { parse } from 'tschema/validate';
				import S from './s.ts?raw';
				export const user = (x: unknown) => parse(S as any, x);
			`,
		});
		let result = await build({
			root,
			logLevel: 'silent',
			configFile: false,
			plugins: [vite()],
			resolve: { alias: ALIAS },
			build: {
				write: false,
				minify: false,
				lib: { entry: join(root, 'main.ts'), formats: ['es'] },
			},
		});
		let output = Array.isArray(result) ? result[0] : result;
		if (!('output' in output)) throw new Error('Expected build output');
		expect(output.output[0].code).not.toMatch(/tschema:S-/);
		await rm(root, { recursive: true });
	});

	it('should not compile files with import.meta.glob', async () => {
		let root = await project({
			'schemas.ts': SCHEMAS,
			'tree.ts': TREE,
			'main.ts': `
				import { parse } from 'tschema/validate';
				import { Person } from './schemas';
				const mods = import.meta.glob('./schemas.ts', { eager: true });
				(mods['./schemas.ts'] as any).Person.required.push('tags');
				export const user = (x: unknown) => parse(Person, x);
			`,
		});
		let result = await build({
			root,
			logLevel: 'silent',
			configFile: false,
			plugins: [vite()],
			resolve: { alias: ALIAS },
			build: {
				write: false,
				minify: false,
				lib: { entry: join(root, 'main.ts'), formats: ['es'] },
			},
		});
		let output = Array.isArray(result) ? result[0] : result;
		if (!('output' in output)) throw new Error('Expected build output');
		let code = output.output[0].code;
		expect(code).toMatch(/new Function/);
		expect(code).not.toMatch(/tschema:Person-/);
		await rm(root, { recursive: true });
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

	it('should recompile in dev mode after a schema file changes', async () => {
		let root = await realpath(
			await project({
				'schemas.ts': `import * as t from 'tschema';\nexport const User = t.string({ minLength: 2 });\n`,
				'main.ts': `import { parse } from 'tschema/validate';\nimport { User } from './schemas';\nexport const check = (x: unknown) => parse(User, x);\n`,
			}),
		);
		let server = await createServer({
			root,
			logLevel: 'silent',
			configFile: false,
			plugins: [vite()],
			resolve: { alias: ALIAS },
			server: { middlewareMode: true, ws: false, watch: null },
		});

		let entry = async () => {
			let out = await server.transformRequest('/main.ts');
			return /tschema:User-[\da-f]+/.exec(out?.code || '')?.[0];
		};

		try {
			let client = await entry();
			let mod = await server.ssrLoadModule('/main.ts');
			expect(client).toBeDefined();
			expect(mod.check('abc')).toStrictEqual('abc');
			let file = join(root, 'schemas.ts');
			await writeFile(
				file,
				`import * as t from 'tschema';\nexport const User = t.string({ minLength: 5 });\n`,
			);
			server.watcher.emit('change', file);
			for (let i = 0; i < 50 && (await entry()) === client; i++) await Bun.sleep(20);
			expect(await entry()).not.toStrictEqual(client);
			mod = await server.ssrLoadModule('/main.ts');
			expect(mod.check('abc')).toStrictEqual(undefined);
		} finally {
			await server.close();
			await rm(root, { recursive: true });
		}
	});
});
