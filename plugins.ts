/**
 * @module
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import * as t from './mod.ts';
import { compile, helpers } from './compile.ts';

import type { Plugin as RolldownPlugin } from 'rolldown';
import type { ESTree } from 'rolldown/utils';
import type { Plugin as VitePlugin } from 'vite';

const CORE = new Set(['tschema', 'npm:tschema', '@lukeed/tschema', 'jsr:@lukeed/tschema']);
const VALIDATE = new Set([...CORE].map((name) => name + '/validate'));
const API = new Set(['validate', 'parse', 'assert']);
const BUILDERS = new Map<string, unknown>(Object.entries(t));

const PREFIX = 'tschema:';
const VIRTUAL = '\0' + PREFIX;

/**
 * @internal
 * The plugin context methods shared by Rolldown and Vite.
 */
type Context = {
	parse(input: string, options?: { lang?: 'js' | 'jsx' | 'ts' | 'tsx' }): ESTree.Program;
	resolve(
		source: string,
		importer?: string,
		options?: { skipSelf?: boolean },
	): Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | null>;
	addWatchFile(id: string): void;
};

type Binding =
	| { kind: 'const'; init: ESTree.Expression }
	| { kind: 'import'; source: string; name: string }
	| { kind: 'other' };

type Export =
	| { local: string }
	| { source: string; name: string };

/**
 * @internal
 * The top-level bindings of a parsed module.
 */
type Module = {
	id: string;
	ast: ESTree.Program;
	bindings: Map<string, Binding>;
	exports: Map<string, Export>;
	stars: string[];
	mutated: Set<string>;
	values: Map<string, Promise<unknown>>;
};

/**
 * @internal
 * The state shared by a single `transform` call.
 */
type Session = {
	ctx: Context;
	modules: Map<string, Promise<Module>>;
};

type Edit = [start: number, end: number, text: string];

/**
 * @internal
 * Thrown when an expression cannot be evaluated at build time.
 */
class Dynamic extends Error {}

function isNode(x: unknown): x is ESTree.Node {
	return typeof x === 'object' && x !== null && 'type' in x && typeof x.type === 'string';
}

function lang(id: string): 'js' | 'jsx' | 'ts' | 'tsx' | undefined {
	let match = /[?&]lang\.([jt]sx?)$/.exec(id) ||
		/\.[cm]?([jt]sx?)$/.exec(id.replace(/[?#].*$/, ''));
	if (match) return match[1] === 'ts' || match[1] === 'tsx' || match[1] === 'jsx' ? match[1] : 'js';
}

function nameOf(node: ESTree.ModuleExportName): string {
	return node.type === 'Literal' ? node.value : node.name;
}

function declare(node: ESTree.Node | null | undefined, out: Set<string>) {
	if (!node) return;
	switch (node.type) {
		case 'Identifier':
			out.add(node.name);
			break;
		case 'ObjectPattern':
			for (let p of node.properties) declare(p.type === 'RestElement' ? p.argument : p.value, out);
			break;
		case 'ArrayPattern':
			for (let e of node.elements) declare(e, out);
			break;
		case 'AssignmentPattern':
			declare(node.left, out);
			break;
		case 'RestElement':
			declare(node.argument, out);
			break;
		case 'TSParameterProperty':
			declare(node.parameter, out);
			break;
	}
}

function lexical(body: ESTree.Node[], out: Set<string>) {
	for (let node of body) {
		if (node.type === 'VariableDeclaration' && node.kind !== 'var') {
			for (let d of node.declarations) declare(d.id, out);
		} else if (
			(node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id
		) {
			out.add(node.id.name);
		}
	}
}

function hoist(node: unknown, out: Set<string>) {
	if (!isNode(node)) return;
	if (node.type === 'VariableDeclaration' && node.kind === 'var') {
		for (let d of node.declarations) declare(d.id, out);
	}
	if (/Function/.test(node.type)) return;
	for (let value of Object.values(node)) {
		if (Array.isArray(value)) { for (let v of value) hoist(v, out); }
		else hoist(value, out);
	}
}

/**
 * @internal
 * The names declared by a scope-creating node, if any.
 */
function scope(node: ESTree.Node): Set<string> | undefined {
	let out = new Set<string>();
	switch (node.type) {
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			if (node.type === 'FunctionExpression' && node.id) out.add(node.id.name);
			for (let p of node.params) declare(p, out);
			if (node.body && node.body.type === 'BlockStatement') {
				lexical(node.body.body, out);
				hoist(node.body, out);
			}
			return out;
		case 'BlockStatement':
		case 'StaticBlock':
			lexical(node.body, out);
			return out;
		case 'ForStatement':
			if (node.init && node.init.type === 'VariableDeclaration') lexical([node.init], out);
			return out;
		case 'ForInStatement':
		case 'ForOfStatement':
			if (node.left.type === 'VariableDeclaration') lexical([node.left], out);
			return out;
		case 'CatchClause':
			declare(node.param, out);
			return out;
		case 'SwitchStatement':
			for (let c of node.cases) lexical(c.consequent, out);
			return out;
	}
}

function walk(
	node: unknown,
	stack: Set<string>[],
	visit: (node: ESTree.Node, stack: Set<string>[]) => void,
) {
	if (!isNode(node)) return;
	visit(node, stack);
	let names = scope(node);
	if (names && names.size) stack = [...stack, names];
	for (let value of Object.values(node)) {
		if (Array.isArray(value)) { for (let v of value) walk(v, stack, visit); }
		else walk(value, stack, visit);
	}
}

function shadowed(name: string, stack: Set<string>[]): boolean {
	return stack.some((names) => names.has(name));
}

function root(node: ESTree.Node): string | undefined {
	while (node.type === 'MemberExpression') node = node.object;
	return node.type === 'Identifier' ? node.name : undefined;
}

function analyze(id: string, ast: ESTree.Program): Module {
	let mod: Module = {
		id,
		ast,
		bindings: new Map(),
		exports: new Map(),
		stars: [],
		mutated: new Set(),
		values: new Map(),
	};

	for (let node of ast.body) {
		if (node.type === 'ImportDeclaration') {
			if (node.importKind === 'type') continue;
			for (let s of node.specifiers) {
				if (s.type === 'ImportSpecifier' && s.importKind === 'type') continue;
				mod.bindings.set(s.local.name, {
					kind: 'import',
					source: node.source.value,
					name: s.type === 'ImportSpecifier'
						? nameOf(s.imported)
						: s.type === 'ImportDefaultSpecifier'
						? 'default'
						: '*',
				});
			}
			continue;
		}

		if (node.type === 'ExportAllDeclaration') {
			if (node.exportKind !== 'type' && !node.exported) mod.stars.push(node.source.value);
			continue;
		}

		if (node.type === 'ExportDefaultDeclaration') {
			let d = node.declaration;
			if (d.type === 'Identifier') {
				mod.exports.set('default', { local: d.name });
			} else if (
				d.type !== 'FunctionDeclaration' && d.type !== 'ClassDeclaration' &&
				d.type !== 'TSInterfaceDeclaration'
			) {
				mod.bindings.set('*default*', { kind: 'const', init: d });
				mod.exports.set('default', { local: '*default*' });
			}
			continue;
		}

		if (node.type === 'ExportNamedDeclaration') {
			if (node.exportKind === 'type') continue;
			for (let s of node.specifiers) {
				if (s.exportKind === 'type') continue;
				mod.exports.set(
					nameOf(s.exported),
					node.source
						? { source: node.source.value, name: nameOf(s.local) }
						: { local: nameOf(s.local) },
				);
			}
			if (!node.declaration) continue;
			let names = new Set<string>();
			lexical([node.declaration], names);
			if (node.declaration.type === 'VariableDeclaration' && node.declaration.kind === 'var') {
				for (let d of node.declaration.declarations) declare(d.id, names);
			}
			for (let name of names) mod.exports.set(name, { local: name });
			node = node.declaration;
		}

		if (node.type === 'VariableDeclaration') {
			for (let d of node.declarations) {
				if (node.kind === 'const' && d.id.type === 'Identifier' && d.init) {
					mod.bindings.set(d.id.name, { kind: 'const', init: d.init });
				} else {
					let names = new Set<string>();
					declare(d.id, names);
					for (let name of names) mod.bindings.set(name, { kind: 'other' });
				}
			}
		} else if (
			(node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id
		) {
			mod.bindings.set(node.id.name, { kind: 'other' });
		}
	}

	walk(ast, [], (node) => {
		let target = node.type === 'AssignmentExpression'
			? node.left
			: node.type === 'UpdateExpression' ||
					(node.type === 'UnaryExpression' && node.operator === 'delete')
			? node.argument
			: undefined;
		let name = target && target.type === 'MemberExpression' && root(target);
		if (name) mod.mutated.add(name);
		if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
			for (let arg of node.arguments) {
				name = arg.type === 'Identifier' &&
					/^(assign|defineProperty|defineProperties|setPrototypeOf)$/.test(
						node.callee.property.type === 'Identifier' ? node.callee.property.name : '',
					) && arg.name;
				if (name) mod.mutated.add(name);
			}
		}
	});

	return mod;
}

function load(s: Session, id: string): Promise<Module> {
	let mod = s.modules.get(id);
	if (!mod) {
		s.modules.set(
			id,
			mod = readFile(id.replace(/[?#].*$/, ''), 'utf8').then((code) => {
				s.ctx.addWatchFile(id);
				return analyze(id, s.ctx.parse(code, { lang: lang(id) || 'js' }));
			}),
		);
	}
	return mod;
}

async function exported(s: Session, mod: Module, source: string, name: string): Promise<unknown> {
	if (CORE.has(source) || VALIDATE.has(source)) throw new Dynamic();
	let resolved = await s.ctx.resolve(source, mod.id);
	if (!resolved || resolved.external || resolved.id.startsWith('\0')) throw new Dynamic();
	let target = await load(s, resolved.id).catch(() => {
		throw new Dynamic();
	});
	let entry = target.exports.get(name);
	if (entry) {
		return 'local' in entry
			? binding(s, target, entry.local)
			: exported(s, target, entry.source, entry.name);
	}
	if (name !== 'default') {
		for (let star of target.stars) {
			try {
				return await exported(s, target, star, name);
			} catch (err) {
				if (!(err instanceof Dynamic)) throw err;
			}
		}
	}
	throw new Dynamic();
}

function binding(s: Session, mod: Module, name: string): Promise<unknown> {
	let value = mod.values.get(name);
	if (!value) {
		let b = mod.bindings.get(name);
		value = !b || b.kind === 'other' || mod.mutated.has(name)
			? Promise.reject(new Dynamic())
			: b.kind === 'const'
			? evaluate(s, mod, b.init, new Map(), [])
			: b.name === '*'
			? Promise.reject(new Dynamic())
			: exported(s, mod, b.source, b.name);
		mod.values.set(name, value);
	}
	return value;
}

/**
 * @internal
 * Find the `tschema` builder name for a call's `callee`, if any.
 */
function builder(mod: Module, callee: ESTree.Node, stack: Set<string>[]): string | undefined {
	let name = callee.type === 'Identifier' ? callee.name : root(callee);
	if (!name || shadowed(name, stack)) return;
	let b = mod.bindings.get(name);
	if (!b || b.kind !== 'import' || !CORE.has(b.source)) return;
	if (callee.type === 'Identifier') return b.name === '*' ? undefined : b.name;
	if (
		b.name === '*' && callee.type === 'MemberExpression' && !callee.computed &&
		callee.object.type === 'Identifier' && callee.property.type === 'Identifier'
	) {
		return callee.property.name;
	}
}

function key(node: ESTree.PropertyKey, computed: boolean): string {
	if (!computed && node.type === 'Identifier') return node.name;
	if (
		node.type === 'Literal' && (typeof node.value === 'string' || typeof node.value === 'number')
	) {
		return String(node.value);
	}
	throw new Dynamic();
}

/**
 * @internal
 * Evaluate a static `tschema` expression without executing any user code.
 */
async function evaluate(
	s: Session,
	mod: Module,
	node: ESTree.Node,
	env: Map<string, unknown>,
	stack: Set<string>[],
): Promise<unknown> {
	switch (node.type) {
		case 'ParenthesizedExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSNonNullExpression':
		case 'TSTypeAssertion':
			return evaluate(s, mod, node.expression, env, stack);

		case 'Literal':
			if (node.value === null || /^(string|number|boolean)$/.test(typeof node.value)) {
				return node.value;
			}
			throw new Dynamic();

		case 'TemplateLiteral':
			if (node.expressions.length) throw new Dynamic();
			return node.quasis[0].value.cooked;

		case 'UnaryExpression': {
			let value = await evaluate(s, mod, node.argument, env, stack);
			if (typeof value !== 'number') throw new Dynamic();
			if (node.operator === '-') return -value;
			if (node.operator === '+') return value;
			throw new Dynamic();
		}

		case 'ArrayExpression': {
			let out: unknown[] = [];
			for (let item of node.elements) {
				if (!item) throw new Dynamic();
				if (item.type === 'SpreadElement') {
					let value = await evaluate(s, mod, item.argument, env, stack);
					if (!Array.isArray(value)) throw new Dynamic();
					out.push(...value);
				} else {
					out.push(await evaluate(s, mod, item, env, stack));
				}
			}
			return out;
		}

		case 'ObjectExpression': {
			let out: Record<string, unknown> = {};
			for (let p of node.properties) {
				if (p.type === 'SpreadElement') {
					let value = await evaluate(s, mod, p.argument, env, stack);
					if (typeof value !== 'object' || value === null || Array.isArray(value)) {
						throw new Dynamic();
					}
					Object.assign(out, value);
				} else if (p.kind !== 'init' || p.method) {
					throw new Dynamic();
				} else {
					out[key(p.key, p.computed)] = await evaluate(s, mod, p.value, env, stack);
				}
			}
			return out;
		}

		case 'Identifier':
			if (env.has(node.name)) return env.get(node.name);
			if (shadowed(node.name, stack)) throw new Dynamic();
			if (node.name === 'undefined' && !mod.bindings.has(node.name)) return undefined;
			return binding(s, mod, node.name);

		case 'MemberExpression': {
			if (node.computed || node.optional || node.property.type !== 'Identifier') {
				throw new Dynamic();
			}
			let name = node.property.name;
			if (
				node.object.type === 'Identifier' && !env.has(node.object.name) &&
				!shadowed(node.object.name, stack)
			) {
				let b = mod.bindings.get(node.object.name);
				if (b && b.kind === 'import' && b.name === '*') return exported(s, mod, b.source, name);
			}
			let value = await evaluate(s, mod, node.object, env, stack);
			if (
				typeof value === 'object' && value !== null &&
				Object.prototype.hasOwnProperty.call(value, name)
			) {
				return Reflect.get(value, name);
			}
			throw new Dynamic();
		}

		case 'CallExpression': {
			let name = !node.optional && builder(mod, node.callee, stack);
			let fn = name && BUILDERS.get(name);
			if (typeof fn !== 'function') throw new Dynamic();

			if (name === 'recursive') {
				let [id, define] = node.arguments;
				let value = id && await evaluate(s, mod, id, env, stack);
				if (
					typeof value !== 'string' || !define || define.type !== 'ArrowFunctionExpression' ||
					define.params.length !== 1 || define.params[0].type !== 'Identifier'
				) {
					throw new Dynamic();
				}
				let body = define.body;
				if (body.type === 'BlockStatement') {
					let ret = body.body.length === 1 && body.body[0];
					if (!ret || ret.type !== 'ReturnStatement' || !ret.argument) throw new Dynamic();
					body = ret.argument;
				}
				let inner = new Map(env).set(define.params[0].name, { $ref: value });
				let schema = await evaluate(s, mod, body, inner, stack);
				return t.recursive(value, () => schema as t.Type);
			}

			let args: unknown[] = [];
			for (let arg of node.arguments) {
				if (arg.type === 'SpreadElement') {
					let value = await evaluate(s, mod, arg.argument, env, stack);
					if (!Array.isArray(value)) throw new Dynamic();
					args.push(...value);
				} else {
					args.push(await evaluate(s, mod, arg, env, stack));
				}
			}
			return Reflect.apply(fn, undefined, args);
		}
	}

	throw new Dynamic();
}

/**
 * @internal
 * Generate the ahead-of-time compiled module for a schema.
 */
function emit(schema: unknown, from: string): string {
	let { code, deps } = compile(schema);
	let out = `import { ValidationError } from ${JSON.stringify(from)};\n`;
	if (deps.length) {
		out += `import { ${deps.map((d) => '$' + d).join(', ')} } from "${PREFIX}helpers";\n`;
	}
	return out + code +
		`\nexport const schema = ${JSON.stringify(schema)};\nexport { validate, parse, assert };\n`;
}

/**
 * @internal
 * Generate the shared helpers module, in dependency order.
 */
function shared(): string {
	let out = '', done = new Set<string>();
	let add = (name: string) => {
		if (done.has(name)) return;
		let [factory, ...deps] = helpers[name];
		for (let d of deps) add(d);
		done.add(name);
		out += `export const $${name} = /* @__PURE__ */ (${factory})(${
			deps.map((d) => '$' + d).join(', ')
		});\n`;
	};
	for (let name in helpers) add(name);
	return out;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(n: number): string {
	let v = n < 0 ? (-n << 1) | 1 : n << 1, out = '';
	do {
		let digit = v & 31;
		v >>>= 5;
		out += BASE64[v ? digit | 32 : digit];
	} while (v);
	return out;
}

/**
 * @internal
 * Apply sorted, non-overlapping edits and build a line + column sourcemap.
 */
function apply(id: string, code: string, edits: Edit[]) {
	let out = '', lines: number[][][] = [[]];
	let gen = 0, line = 0, col = 0;

	let mark = () => lines[lines.length - 1].push([gen, line, col]);
	let write = (text: string, original: boolean) => {
		mark();
		for (let i = 0; i < text.length; i++) {
			out += text[i];
			if (text[i] === '\n') {
				lines.push([]);
				gen = 0;
				if (original) line++, col = 0;
				if (i + 1 < text.length) mark();
			} else {
				gen++;
				if (original) col++;
			}
		}
	};
	let skip = (text: string) => {
		for (let ch of text) {
			if (ch === '\n') line++, col = 0;
			else col += ch.length;
		}
	};

	let pos = 0;
	for (let [start, end, text] of edits) {
		write(code.slice(pos, start), true);
		write(text, false);
		skip(code.slice(start, end));
		pos = end;
	}
	write(code.slice(pos), true);

	let prev = [0, 0],
		mappings = lines.map((segments) => {
			let last = 0;
			return segments.map(([g, l, c]) => {
				let s = vlq(g - last) + 'A' + vlq(l - prev[0]) + vlq(c - prev[1]);
				last = g;
				prev = [l, c];
				return s;
			}).join(',');
		}).join(';');

	return {
		code: out,
		map: { version: 3, sources: [id], sourcesContent: [code], names: [], mappings },
	};
}

/**
 * @internal
 * The plugin hooks, shared by the {@link vite} and {@link rolldown} plugins.
 */
function plugin() {
	let compiled = new Map<string, { code: string; importer: string }>();

	return {
		resolveId(ctx: Context, source: string, importer: string | undefined) {
			if (source === PREFIX + 'helpers') return VIRTUAL + 'helpers';
			if (source.startsWith(PREFIX) && compiled.has(source.slice(PREFIX.length))) {
				return VIRTUAL + source.slice(PREFIX.length);
			}
			if (importer && importer.startsWith(VIRTUAL)) {
				let entry = compiled.get(importer.slice(VIRTUAL.length));
				if (entry) return ctx.resolve(source, entry.importer, { skipSelf: true });
			}
		},

		load(id: string) {
			if (id === VIRTUAL + 'helpers') return { code: shared(), moduleSideEffects: false };
			if (id.startsWith(VIRTUAL)) {
				let entry = compiled.get(id.slice(VIRTUAL.length));
				if (entry) return { code: entry.code, moduleSideEffects: false };
			}
		},

		async transform(ctx: Context, code: string, id: string) {
			if (id.startsWith('\0')) return;
			let type = lang(id);
			if (!type) return;

			try {
				var ast = ctx.parse(code, { lang: type });
			} catch {
				return;
			}

			let mod = analyze(id, ast);
			let session: Session = { ctx, modules: new Map([[id, Promise.resolve(mod)]]) };

			let calls: [ESTree.CallExpression, string, string, Set<string>[]][] = [];
			walk(ast, [], (node, stack) => {
				if (node.type !== 'CallExpression' || node.optional) return;
				let callee = node.callee;
				let name = callee.type === 'Identifier' ? callee.name : root(callee);
				let b = name && !shadowed(name, stack) && mod.bindings.get(name);
				if (!b || b.kind !== 'import' || !VALIDATE.has(b.source)) return;
				let api = callee.type === 'Identifier'
					? b.name
					: b.name === '*' && callee.type === 'MemberExpression' && !callee.computed &&
							callee.object.type === 'Identifier' && callee.property.type === 'Identifier'
					? callee.property.name
					: '';
				if (
					API.has(api) && node.arguments.length === 2 &&
					node.arguments.every((a) => a.type !== 'SpreadElement')
				) {
					calls.push([node, api, b.source, stack]);
				}
			});

			let edits: Edit[] = [];
			let imports = new Map<string, string>();

			for (let [node, api, from, stack] of calls) {
				let [arg, input] = node.arguments;
				try {
					var schema = await evaluate(session, mod, arg, new Map(), stack);
				} catch (err) {
					if (err instanceof Dynamic) continue;
					throw err;
				}

				if (typeof schema !== 'object' || schema === null) continue;

				let json = JSON.stringify(schema);
				let hash = createHash('sha256').update(from + json).digest('hex').slice(0, 8);
				let label = arg.type === 'Identifier' ? arg.name : 'schema';
				let entry = `${label}-${hash}`;

				if (!compiled.has(entry)) compiled.set(entry, { code: emit(schema, from), importer: id });

				let local = imports.get(entry);
				if (!local) {
					let n = imports.size;
					while (code.includes(local = `__tschema${n}`)) n++;
					imports.set(entry, local);
				}

				edits.push([node.start, input.start, `${local}.${api}(`]);
			}

			if (!edits.length) return;

			let text = '';
			for (let [entry, local] of imports) {
				text += `\nimport * as ${local} from ${JSON.stringify(PREFIX + entry)};`;
			}
			edits.push([code.length, code.length, text]);

			return apply(id, code, edits);
		},
	};
}

/**
 * Compile static `tschema/validate` calls ahead of time with Vite.
 *
 * The `validate`, `parse`, and `assert` calls are replaced when their schema is known at build time.
 * A schema is known when it is built from `tschema` calls and literal values only, including
 * `const` references and imports of such schemas. All other calls use the runtime compiler.
 *
 * > [!IMPORTANT]
 * > Requires Vite 8 or later.
 *
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { vite as tschema } from 'tschema/plugins';
 *
 * export default defineConfig({
 *   plugins: [tschema()],
 * });
 * ```
 */
export function vite(): VitePlugin {
	let hooks = plugin();
	return {
		name: 'tschema',
		enforce: 'pre',
		resolveId(source, importer) {
			return hooks.resolveId(this, source, importer);
		},
		load(id) {
			return hooks.load(id);
		},
		transform: {
			filter: { code: /tschema\/validate/ },
			handler(code, id) {
				return hooks.transform(this, code, id);
			},
		},
	};
}

/**
 * Compile static `tschema/validate` calls ahead of time with Rolldown.
 *
 * The `validate`, `parse`, and `assert` calls are replaced when their schema is known at build time.
 * A schema is known when it is built from `tschema` calls and literal values only, including
 * `const` references and imports of such schemas. All other calls use the runtime compiler.
 *
 * ```ts
 * // rolldown.config.ts
 * import { defineConfig } from 'rolldown';
 * import { rolldown as tschema } from 'tschema/plugins';
 *
 * export default defineConfig({
 *   input: 'src/index.ts',
 *   plugins: [tschema()],
 * });
 * ```
 */
export function rolldown(): RolldownPlugin {
	let hooks = plugin();
	return {
		name: 'tschema',
		resolveId(source, importer) {
			return hooks.resolveId(this, source, importer);
		},
		load(id) {
			return hooks.load(id);
		},
		transform: {
			filter: { code: /tschema\/validate/ },
			handler(code, id) {
				return hooks.transform(this, code, id);
			},
		},
	};
}
