/**
 * Load the JSON-Schema-Test-Suite groups that `tschema/validate` supports.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Type } from '../mod';

export type Case = {
	description: string;
	data: unknown;
	valid: boolean;
};

export type Group = {
	description: string;
	schema: Type;
	tests: Case[];
};

const DIR = join(import.meta.dir, '../suite/tests/draft2020-12');

const FILES = [
	'additionalProperties',
	'allOf',
	'anchor',
	'anyOf',
	'boolean_schema',
	'const',
	'contains',
	'enum',
	'exclusiveMaximum',
	'exclusiveMinimum',
	'infinite-loop-detection',
	'items',
	'maxContains',
	'maximum',
	'maxItems',
	'maxLength',
	'maxProperties',
	'minContains',
	'minimum',
	'minItems',
	'minLength',
	'minProperties',
	'multipleOf',
	'not',
	'oneOf',
	'pattern',
	'patternProperties',
	'prefixItems',
	'properties',
	'propertyNames',
	'ref',
	'required',
	'type',
	'uniqueItems',
	'optional/bignum',
	'optional/ecmascript-regex',
	'optional/float-overflow',
	'optional/non-bmp-regex',
	...[
		'date',
		'date-time',
		'duration',
		'email',
		'hostname',
		'idn-email',
		'idn-hostname',
		'ipv4',
		'ipv6',
		'iri',
		'iri-reference',
		'json-pointer',
		'regex',
		'relative-json-pointer',
		'time',
		'uri',
		'uri-reference',
		'uri-template',
		'uuid',
	].map((name) => `optional/format/${name}`),
];

const UNSUPPORTED = new Set([
	'$dynamicRef',
	'$dynamicAnchor',
	'$recursiveRef',
	'$vocabulary',
	'dependentRequired',
	'dependentSchemas',
	'if',
	'then',
	'else',
	'unevaluatedItems',
	'unevaluatedProperties',
]);

function unsupported(schema: unknown): boolean {
	if (typeof schema !== 'object' || schema === null) return false;
	for (let [k, v] of Object.entries(schema)) {
		if (UNSUPPORTED.has(k)) return true;
		if (
			k === '$ref' &&
			typeof v === 'string' &&
			/^https?:\/\/(localhost|json-schema\.org)\b/.test(v)
		)
			return true;
		if (k !== 'const' && k !== 'enum' && k !== 'default' && unsupported(v)) return true;
	}
	return false;
}

export async function load(): Promise<[file: string, groups: Group[]][]> {
	let out: [string, Group[]][] = [];
	for (let file of FILES) {
		let groups: Group[] = JSON.parse(await readFile(join(DIR, file + '.json'), 'utf8'));
		out.push([file, groups.filter((g) => typeof g.schema !== 'boolean' && !unsupported(g.schema))]);
	}
	return out;
}
