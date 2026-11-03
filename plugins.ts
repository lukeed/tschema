/**
 * @module
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import * as t from './mod';
import { compile, helpers } from './compile';

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

type Export = { local: string } | { source: string; name: string };

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
	/** The bindings whose values may change, or `*` for all of them. */
	escaped: Set<string>;
	/** The bindings held by each top-level `const` value. */
	deps: Map<string, Set<string>>;
	/** The sources of `import()` and `require()` calls. */
	dynamic: string[];
	tainted?: true;
	settled?: Promise<void>;
	/** The bindings being evaluated, to stop at a cycle. */
	pending: Set<string>;
	values: Map<string, Promise<unknown>>;
};

/**
 * @internal
 * The state shared by a single `transform` call.
 */
type Session = {
	ctx: Context;
	modules: Map<string, Promise<Module>>;
	loaded: Module[];
	/** The number of bindings marked as escaped by other modules. */
	changes: number;
};

type Edit = [start: number, end: number, text: string];

/**
 * @internal
 * Thrown when an expression cannot be evaluated at build time.
 */
class Dynamic extends Error {}

/**
 * @internal
 * The `TS*` nodes that hold runtime code. All other `TS*` nodes are types.
 */
const VALUES = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
	'TSInstantiationExpression',
	'TSEnumDeclaration',
	'TSEnumBody',
	'TSEnumMember',
	'TSModuleDeclaration',
	'TSModuleBlock',
	'TSExportAssignment',
	'TSImportEqualsDeclaration',
	'TSExternalModuleReference',
	'TSQualifiedName',
	'TSParameterProperty',
]);

function isNode(x: unknown): x is ESTree.Node {
	return typeof x === 'object' && x !== null && 'type' in x && typeof x.type === 'string';
}

function lang(id: string): 'js' | 'jsx' | 'ts' | 'tsx' | undefined {
	let match =
		/[?&]lang\.([jt]sx?)$/.exec(id) || /\.[cm]?([jt]sx?)$/.exec(id.replace(/[?#].*$/, ''));
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
		if ('declare' in node && node.declare) continue;
		if (node.type === 'VariableDeclaration' && node.kind !== 'var') {
			for (let d of node.declarations) declare(d.id, out);
		} else if (
			(node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
			node.id
		) {
			out.add(node.id.name);
		} else if (node.type === 'TSEnumDeclaration' || node.type === 'TSImportEqualsDeclaration') {
			out.add(node.id.name);
		} else if (node.type === 'TSModuleDeclaration' && instantiated(node)) {
			let id: ESTree.TSModuleDeclaration['id'] | ESTree.TSTypeName = node.id;
			while (id.type === 'TSQualifiedName') id = id.left;
			if (id.type === 'Identifier') out.add(id.name);
		}
	}
}

/**
 * @internal
 * Whether a TS namespace declares a runtime value, since type-only namespaces are erased.
 */
function instantiated(node: ESTree.TSModuleDeclaration | ESTree.TSGlobalDeclaration): boolean {
	if (node.global || node.declare || !node.body) return false;
	return node.body.body.some((stmt) => {
		let d = stmt.type === 'ExportNamedDeclaration' && stmt.declaration ? stmt.declaration : stmt;
		if (d.type === 'TSModuleDeclaration') return instantiated(d);
		return (
			d.type !== 'TSInterfaceDeclaration' &&
			d.type !== 'TSTypeAliasDeclaration' &&
			!(d.type === 'ExportNamedDeclaration' && d.exportKind === 'type') &&
			!(d.type === 'ImportDeclaration' && d.importKind === 'type') &&
			!('declare' in d && d.declare)
		);
	});
}

function hoist(node: unknown, out: Set<string>) {
	if (!isNode(node)) return;
	if (node.type === 'VariableDeclaration' && node.kind === 'var' && !node.declare) {
		for (let d of node.declarations) declare(d.id, out);
	}
	if (/Function|StaticBlock|TSModuleDeclaration/.test(node.type)) return;
	for (let value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (let v of value) hoist(v, out);
		} else hoist(value, out);
	}
}

/**
 * @internal
 * The names declared by a scope-creating node, if any.
 */
function scope(node: ESTree.Node, parent: ESTree.Node | undefined): Set<string> | undefined {
	let out = new Set<string>();
	switch (node.type) {
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			if (node.type === 'FunctionExpression' && node.id) out.add(node.id.name);
			for (let p of node.params) declare(p, out);
			return out;
		case 'ClassExpression':
			if (node.id) out.add(node.id.name);
			return out;
		case 'TSModuleBlock':
			lexical(node.body, out);
			hoist(node, out);
			return out;
		case 'BlockStatement':
			lexical(node.body, out);
			if (parent && /Function/.test(parent.type)) hoist(node, out);
			return out;
		case 'StaticBlock':
			lexical(node.body, out);
			for (let stmt of node.body) hoist(stmt, out);
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
	visit: (node: ESTree.Node, stack: Set<string>[], path: ESTree.Node[]) => void,
	path: ESTree.Node[] = [],
) {
	if (!isNode(node) || (node.type.startsWith('TS') && !VALUES.has(node.type))) return;
	visit(node, stack, path);
	let names = scope(node, path[path.length - 1]);
	let inner = names && names.size ? [...stack, names] : stack;
	path.push(node);
	if (node.type === 'SwitchStatement') {
		walk(node.discriminant, stack, visit, path);
		for (let c of node.cases) walk(c, inner, visit, path);
	} else {
		for (let value of Object.values(node)) {
			if (Array.isArray(value)) {
				for (let v of value) walk(v, inner, visit, path);
			} else walk(value, inner, visit, path);
		}
	}
	path.pop();
}

function shadowed(name: string, stack: Set<string>[]): boolean {
	return stack.some((names) => names.has(name));
}

function root(node: ESTree.Node): string | undefined {
	while (node.type === 'MemberExpression') node = node.object;
	return node.type === 'Identifier' ? node.name : undefined;
}

/**
 * @internal
 * Whether an `Identifier` reads a binding, rather than declaring or naming something.
 */
function reference(node: ESTree.Node, parent: ESTree.Node | undefined): boolean {
	if (!parent) return true;
	switch (parent.type) {
		case 'MemberExpression':
			return parent.object === node || parent.computed;
		case 'Property':
		case 'MethodDefinition':
		case 'PropertyDefinition':
		case 'AccessorProperty':
			return parent.value === node || parent.computed;
		case 'VariableDeclarator':
			return parent.init === node;
		case 'ExportSpecifier':
			return parent.local === node;
		case 'TSEnumMember':
			return parent.initializer === node;
		case 'ImportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
		case 'LabeledStatement':
		case 'BreakStatement':
		case 'ContinueStatement':
		case 'MetaProperty':
		case 'TSModuleDeclaration':
			return false;
	}
	return true;
}

/**
 * @internal
 * Classify how a reference uses its value, walking up from `node` through its `path`.
 *
 * Returns `false` for a read, the name of the top-level `const` whose value holds it,
 * or `true` when the value escapes and may change.
 */
function usage(
	mod: Module,
	node: ESTree.Node,
	path: ESTree.Node[],
	stack: Set<string>[],
): boolean | string {
	let child = node;
	for (let i = path.length - 1; ; i--) {
		let p = path[i];
		switch (p.type) {
			case 'ParenthesizedExpression':
			case 'TSAsExpression':
			case 'TSSatisfiesExpression':
			case 'TSNonNullExpression':
			case 'TSTypeAssertion':
			case 'ArrayExpression':
			case 'SpreadElement':
			case 'LogicalExpression':
			case 'ReturnStatement':
			case 'BlockStatement':
				break;
			case 'ObjectExpression':
				for (let prop of p.properties) {
					if (prop.type === 'SpreadElement') continue;
					let value = prop.value;
					while (
						value.type === 'ParenthesizedExpression' ||
						value.type === 'TSAsExpression' ||
						value.type === 'TSSatisfiesExpression' ||
						value.type === 'TSNonNullExpression' ||
						value.type === 'TSTypeAssertion'
					) {
						value = value.expression;
					}
					let k = prop.key;
					if (
						prop.kind !== 'init' ||
						prop.method ||
						(prop.computed && k.type !== 'Literal') ||
						(!prop.computed &&
							!prop.shorthand &&
							((k.type === 'Identifier' && k.name === '__proto__') ||
								(k.type === 'Literal' && k.value === '__proto__'))) ||
						/Function|Class/.test(value.type)
					) {
						return true;
					}
				}
				break;
			case 'Property':
				if (p.value !== child) return false;
				break;
			case 'MemberExpression':
				if (p.object !== child) return false;
				break;
			case 'ConditionalExpression':
				if (p.test === child) return false;
				break;
			case 'ArrowFunctionExpression':
				if (p.body !== child) return true;
				break;
			case 'ExportSpecifier':
			case 'ExpressionStatement':
				return false;
			case 'BinaryExpression':
				return !(
					p.operator === '===' ||
					p.operator === '!==' ||
					(p.operator === 'in' && p.right === child)
				);
			case 'UnaryExpression':
				return !(p.operator === 'typeof' || p.operator === '!' || p.operator === 'void');
			case 'CallExpression': {
				if (p.callee === child) return true;
				let id = p.callee.type === 'MemberExpression' ? p.callee.object : p.callee;
				let b = id.type === 'Identifier' && !shadowed(id.name, stack) && mod.bindings.get(id.name);
				if (b && b.kind === 'import' && VALIDATE.has(b.source)) {
					if ((id === p.callee) === (b.name === '*')) return true;
					// validate and parse return their input
					if (p.arguments[0] === child && child.type !== 'SpreadElement') return false;
					break;
				}
				if (!builder(mod, p.callee, stack)) return true;
				break;
			}
			case 'VariableDeclarator': {
				let decl = path[i - 1];
				let top = path[i - 2];
				let global =
					top.type === 'Program' ||
					(top.type === 'ExportNamedDeclaration' && path[i - 3].type === 'Program');
				return global &&
					decl.type === 'VariableDeclaration' &&
					decl.kind === 'const' &&
					p.id.type === 'Identifier' &&
					p.init === child
					? p.id.name
					: true;
			}
			case 'ExportDefaultDeclaration':
				return child.type === 'Identifier' ? false : '*default*';
			default:
				return true;
		}
		child = p;
	}
}

/**
 * @internal
 * Find the `tschema/validate` function name and import source for a call's `callee`, if any.
 */
function api(
	mod: Module,
	callee: ESTree.Node,
	stack: Set<string>[],
): [name: string, source: string] | undefined {
	let local = callee.type === 'Identifier' ? callee.name : root(callee);
	let b = local && !shadowed(local, stack) && mod.bindings.get(local);
	if (!b || b.kind !== 'import' || !VALIDATE.has(b.source)) return;
	let name =
		callee.type === 'Identifier'
			? b.name
			: b.name === '*' &&
				  callee.type === 'MemberExpression' &&
				  !callee.computed &&
				  callee.object.type === 'Identifier' &&
				  callee.property.type === 'Identifier'
				? callee.property.name
				: '';
	if (API.has(name)) return [name, b.source];
}

/**
 * @internal
 * Mark a binding, and each binding that its value holds, as escaped.
 * Returns the newly escaped names.
 */
function escape(mod: Module, name: string): string[] {
	let added: string[] = [];
	let queue = [name];
	for (let next of queue) {
		if (mod.escaped.has(next)) continue;
		mod.escaped.add(next);
		added.push(next);
		let deps = mod.deps.get(next);
		if (deps) queue.push(...deps);
	}
	return added;
}

function analyze(id: string, ast: ESTree.Program): Module {
	let mod: Module = {
		id,
		ast,
		bindings: new Map(),
		exports: new Map(),
		stars: [],
		escaped: new Set(),
		deps: new Map(),
		dynamic: [],
		pending: new Set(),
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
					name:
						s.type === 'ImportSpecifier'
							? nameOf(s.imported)
							: s.type === 'ImportDefaultSpecifier'
								? 'default'
								: '*',
				});
			}
			continue;
		}

		if (node.type === 'ExportAllDeclaration') {
			if (node.exportKind === 'type') continue;
			if (node.exported) {
				mod.exports.set(nameOf(node.exported), { source: node.source.value, name: '*' });
			} else {
				mod.stars.push(node.source.value);
			}
			continue;
		}

		if (node.type === 'ExportDefaultDeclaration') {
			let d = node.declaration;
			if (d.type === 'Identifier') {
				mod.exports.set('default', { local: d.name });
			} else if (
				d.type !== 'FunctionDeclaration' &&
				d.type !== 'ClassDeclaration' &&
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

		if (node.type === 'TSImportEqualsDeclaration') {
			if (node.importKind === 'type') continue;
			let ref = node.moduleReference;
			mod.bindings.set(
				node.id.name,
				ref.type === 'TSExternalModuleReference'
					? { kind: 'import', source: ref.expression.value, name: '*' }
					: { kind: 'other' },
			);
		} else if (node.type === 'VariableDeclaration' && !node.declare) {
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
			(node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
			node.id
		) {
			mod.bindings.set(node.id.name, { kind: 'other' });
		}
	}

	let roots: string[] = [];
	walk(ast, [], (node, stack, path) => {
		let callee =
			node.type === 'CallExpression' &&
			node.callee.type === 'Identifier' &&
			!shadowed(node.callee.name, stack) &&
			!mod.bindings.has(node.callee.name)
				? node.callee.name
				: '';
		if (callee === 'eval') mod.escaped.add('*');
		if (
			node.type === 'CallExpression' &&
			node.callee.type === 'MemberExpression' &&
			node.callee.object.type === 'MetaProperty' &&
			node.callee.property.type === 'Identifier' &&
			node.callee.property.name === 'glob'
		) {
			mod.escaped.add('*');
		}
		let source =
			node.type === 'ImportExpression'
				? node.source
				: callee === 'require' && node.type === 'CallExpression'
					? node.arguments[0]
					: undefined;
		if (source && source.type === 'Literal' && typeof source.value === 'string') {
			mod.dynamic.push(source.value);
		} else if (source) {
			mod.escaped.add('*');
		}
		if (node.type === 'JSXIdentifier') {
			if (!shadowed(node.name, stack) && mod.bindings.has(node.name)) roots.push(node.name);
			return;
		}
		if (node.type !== 'Identifier' || shadowed(node.name, stack)) return;
		let b = mod.bindings.get(node.name);
		if (!b || b.kind === 'other' || !reference(node, path[path.length - 1])) return;
		let use = usage(mod, node, path, stack);
		if (use === true) {
			roots.push(node.name);
		} else if (use) {
			let deps = mod.deps.get(use);
			if (!deps) mod.deps.set(use, (deps = new Set()));
			deps.add(node.name);
		}
	});

	if (mod.escaped.has('*')) roots.push(...mod.bindings.keys());
	for (let name of roots) escape(mod, name);

	return mod;
}

function load(s: Session, id: string): Promise<Module> {
	let mod = s.modules.get(id);
	if (!mod) {
		s.modules.set(
			id,
			(mod = readFile(id.replace(/[?#].*$/, ''), 'utf8').then((code) => {
				s.ctx.addWatchFile(id);
				let m = analyze(id, s.ctx.parse(code, { lang: lang(id) || 'js' }));
				s.loaded.push(m);
				return m;
			})),
		);
	}
	return mod;
}

async function attempt(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (err) {
		if (!(err instanceof Dynamic)) throw err;
	}
}

async function target(s: Session, mod: Module, source: string): Promise<Module> {
	if (CORE.has(source) || VALIDATE.has(source)) throw new Dynamic();
	let resolved = await s.ctx.resolve(source, mod.id);
	if (!resolved || resolved.external || resolved.id.startsWith('\0')) throw new Dynamic();
	return load(s, resolved.id).catch(() => {
		throw new Dynamic();
	});
}

/**
 * @internal
 * Find the module and local binding that define an export, through any re-exports.
 */
async function locate(
	s: Session,
	mod: Module,
	source: string,
	name: string,
	seen = new Set<string>(),
): Promise<[Module, string]> {
	let m = await target(s, mod, source);
	if (name === '*') return [m, '*'];
	let key = m.id + '\0' + name;
	if (seen.has(key)) throw new Dynamic();
	seen.add(key);
	let entry = m.exports.get(name);
	if (entry) {
		return 'local' in entry ? [m, entry.local] : locate(s, m, entry.source, entry.name, seen);
	}
	if (name !== 'default') {
		for (let star of m.stars) {
			try {
				return await locate(s, m, star, name, seen);
			} catch (err) {
				if (!(err instanceof Dynamic)) throw err;
			}
		}
	}
	throw new Dynamic();
}

async function exported(s: Session, mod: Module, source: string, name: string): Promise<unknown> {
	let [m, local] = await locate(s, mod, source, name);
	return binding(s, m, local);
}

/**
 * @internal
 * Mark a binding as escaped, or every binding for `*`, and push the change to its sources.
 */
async function mark(s: Session, mod: Module, name: string) {
	if (name === '*') return taint(s, mod);
	let added = escape(mod, name);
	s.changes += added.length;
	await settle(s, mod, added);
}

/**
 * @internal
 * Mark the escaped imports among `names` as escaped in the modules that define them.
 */
async function settle(s: Session, mod: Module, names: Iterable<string>) {
	for (let name of names) {
		let b = mod.bindings.get(name);
		if (!b || b.kind !== 'import') continue;
		let { source } = b;
		await attempt(async () => mark(s, ...(await locate(s, mod, source, b.name))));
	}
}

/**
 * @internal
 * Mark every binding and export of a module as escaped, for a namespace that escapes.
 */
async function taint(s: Session, mod: Module) {
	if (mod.tainted) return;
	mod.tainted = true;
	mod.escaped.add('*');
	s.changes++;
	for (let entry of mod.exports.values()) {
		await attempt(async () => {
			if ('local' in entry) return mark(s, mod, entry.local);
			await mark(s, ...(await locate(s, mod, entry.source, entry.name)));
		});
	}
	for (let star of mod.stars) {
		await attempt(async () => taint(s, await target(s, mod, star)));
	}
}

function ready(s: Session, mod: Module): Promise<void> {
	return (mod.settled ||= (async () => {
		await settle(s, mod, [...mod.escaped]);
		for (let source of mod.dynamic) {
			await attempt(async () => taint(s, await target(s, mod, source)));
		}
	})());
}

function binding(s: Session, mod: Module, name: string): Promise<unknown> {
	let value = mod.values.get(name);
	if (value) return mod.pending.has(name) ? Promise.reject(new Dynamic()) : value;
	mod.pending.add(name);
	value = ready(s, mod)
		.then(() => {
			let b = mod.bindings.get(name);
			if (!b || b.kind === 'other' || mod.escaped.has(name) || mod.escaped.has('*')) {
				throw new Dynamic();
			}
			if (b.kind === 'const') return evaluate(s, mod, b.init, new Map(), []);
			if (b.name === '*') throw new Dynamic();
			return exported(s, mod, b.source, b.name);
		})
		.finally(() => mod.pending.delete(name));
	mod.values.set(name, value);
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
		b.name === '*' &&
		callee.type === 'MemberExpression' &&
		!callee.computed &&
		callee.object.type === 'Identifier' &&
		callee.property.type === 'Identifier'
	) {
		return callee.property.name;
	}
}

function define(target: Record<PropertyKey, unknown>, key: PropertyKey, value: unknown) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	});
}

function key(node: ESTree.PropertyKey, computed: boolean): string {
	if (!computed && node.type === 'Identifier') return node.name;
	if (
		node.type === 'Literal' &&
		(typeof node.value === 'string' || typeof node.value === 'number')
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
			let out: Record<PropertyKey, unknown> = {};
			for (let p of node.properties) {
				if (p.type === 'SpreadElement') {
					let value = await evaluate(s, mod, p.argument, env, stack);
					if (typeof value !== 'object' || value === null || Array.isArray(value)) {
						throw new Dynamic();
					}
					for (let k of Reflect.ownKeys(value)) {
						if (!Object.prototype.propertyIsEnumerable.call(value, k)) continue;
						define(out, k, Reflect.get(value, k));
					}
				} else if (
					p.kind !== 'init' ||
					p.method ||
					(!p.computed && !p.shorthand && key(p.key, false) === '__proto__')
				) {
					throw new Dynamic();
				} else {
					define(out, key(p.key, p.computed), await evaluate(s, mod, p.value, env, stack));
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
				node.object.type === 'Identifier' &&
				!env.has(node.object.name) &&
				!shadowed(node.object.name, stack)
			) {
				let b = mod.bindings.get(node.object.name);
				if (b && b.kind === 'import' && b.name === '*') return exported(s, mod, b.source, name);
			}
			let value = await evaluate(s, mod, node.object, env, stack);
			if (
				typeof value === 'object' &&
				value !== null &&
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
				let value = id && (await evaluate(s, mod, id, env, stack));
				if (
					typeof value !== 'string' ||
					!define ||
					define.type !== 'ArrowFunctionExpression' ||
					define.params.length !== 1 ||
					define.params[0].type !== 'Identifier'
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
				return Reflect.apply(fn, undefined, [value, () => schema]);
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
	let { code, deps } = compile(schema, ['validate', 'parse', 'assert']);
	let out = `import { ValidationError } from ${JSON.stringify(from)};\n`;
	if (deps.length) {
		out += `import { ${deps.map((d) => '$' + d).join(', ')} } from "${PREFIX}helpers";\n`;
	}
	return (
		out +
		code +
		`\nexport const schema = ${JSON.stringify(schema)};\nexport { validate, parse, assert };\n`
	);
}

/**
 * @internal
 * Generate the shared helpers module, in dependency order.
 */
function shared(): string {
	let out = '',
		done = new Set<string>();
	let add = (name: string) => {
		if (done.has(name)) return;
		let [factory, ...deps] = helpers[name];
		for (let d of deps) add(d);
		done.add(name);
		out += `export const $${name} = /* @__PURE__ */ (${factory})(${deps
			.map((d) => '$' + d)
			.join(', ')});\n`;
	};
	for (let name in helpers) add(name);
	return out;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(n: number): string {
	let v = n < 0 ? (-n << 1) | 1 : n << 1,
		out = '';
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
	let out = '',
		lines: number[][][] = [[]];
	let gen = 0,
		line = 0,
		col = 0;

	let mark = () => lines[lines.length - 1].push([gen, line, col]);
	let write = (text: string, original: boolean) => {
		mark();
		for (let i = 0; i < text.length; i++) {
			out += text[i];
			if (text[i] === '\n') {
				lines.push([]);
				gen = 0;
				if (original) {
					line++;
					col = 0;
				}
				if (i + 1 < text.length) mark();
			} else {
				gen++;
				if (original) col++;
			}
		}
	};
	let skip = (text: string) => {
		for (let ch of text) {
			if (ch === '\n') {
				line++;
				col = 0;
			} else {
				col += ch.length;
			}
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
		mappings = lines
			.map((segments) => {
				let last = 0;
				return segments
					.map(([g, l, c]) => {
						let s = vlq(g - last) + 'A' + vlq(l - prev[0]) + vlq(c - prev[1]);
						last = g;
						prev = [l, c];
						return s;
					})
					.join(',');
			})
			.join(';');

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
			let session: Session = {
				ctx,
				modules: new Map([[id, Promise.resolve(mod)]]),
				loaded: [mod],
				changes: 0,
			};

			let calls: [ESTree.CallExpression, string, string, Set<string>[]][] = [];
			walk(ast, [], (node, stack) => {
				if (node.type !== 'CallExpression' || node.optional) return;
				let found = api(mod, node.callee, stack);
				if (
					found &&
					node.arguments.length === 2 &&
					node.arguments.every((a) => a.type !== 'SpreadElement')
				) {
					calls.push([node, ...found, stack]);
				}
			});

			if (!calls.length) return;
			await ready(session, mod);

			let schemas: unknown[];
			let before: number;
			do {
				before = session.changes;
				for (let m of session.loaded) m.values.clear();
				schemas = [];
				for (let [node, , , stack] of calls) {
					try {
						schemas.push(await evaluate(session, mod, node.arguments[0], new Map(), stack));
					} catch (err) {
						if (!(err instanceof Dynamic)) throw err;
						schemas.push(undefined);
					}
				}
				for (let i = 0; i < session.loaded.length; i++) await ready(session, session.loaded[i]);
			} while (session.changes !== before);

			let edits: Edit[] = [];
			let imports = new Map<string, string>();

			for (let i = 0; i < calls.length; i++) {
				let [node, api, from] = calls[i];
				let [arg, input] = node.arguments;
				let schema = schemas[i];
				if (typeof schema !== 'object' || schema === null) continue;

				try {
					var out = emit(schema, from);
				} catch {
					// the runtime compiler throws the same error when the call runs
					continue;
				}

				let resolved = await ctx.resolve(from, id);
				let hash = createHash('sha256')
					.update(out + '\0' + (resolved ? resolved.id : from))
					.digest('hex')
					.slice(0, 8);
				let label = arg.type === 'Identifier' ? arg.name : 'schema';
				let entry = `${label}-${hash}`;

				if (!compiled.has(entry)) compiled.set(entry, { code: out, importer: id });

				let local = imports.get(entry);
				if (!local) {
					let n = imports.size;
					while (code.includes((local = `__tschema${n}`))) n++;
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
 * A schema that may change after it is created also uses the runtime compiler. Only the calling
 * module and the modules it loads to find its schemas are checked for changes.
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
 * A schema that may change after it is created also uses the runtime compiler. Only the calling
 * module and the modules it loads to find its schemas are checked for changes.
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
