import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { bench, group, run, summary } from 'mitata';
import * as v from '../npm/validate.mjs';
import { aot, INVALID, User, VALID } from './dist/aot.mjs';

const ajv = new Ajv2020({ allErrors: true });
const ajvFirst = new Ajv2020();
addFormats(ajv);
addFormats(ajvFirst);

const all = ajv.compile(User);
const first = ajvFirst.compile(User);

for (let i = 0; i < 1e5; i++) {
	for (let input of [VALID, INVALID]) {
		v.validate(User, input);
		v.parse(User, input);
		aot.validate(input);
		aot.parse(input);
		all(input);
		first(input);
	}
}

for (let [label, input] of [
	['valid', VALID],
	['invalid', INVALID],
] as const) {
	group(`all errors (${label})`, () => {
		summary(() => {
			bench('tschema/validate', () => v.validate(User, input)).baseline();
			bench('tschema/validate (aot)', () => aot.validate(input));
			bench('ajv (allErrors)', () => all(input));
		});
	});

	group(`first error (${label})`, () => {
		summary(() => {
			bench('tschema/parse', () => v.parse(User, input)).baseline();
			bench('tschema/parse (aot)', () => aot.parse(input));
			bench('ajv', () => first(input));
		});
	});
}

group('compile', () => {
	summary(() => {
		bench('tschema/validate', () => v.validate({ ...User }, VALID)).baseline();
		bench('ajv', () =>
			new Ajv2020().compile({
				...User,
				properties: { ...User.properties, email: { type: 'string' }, avatar: { type: 'string' } },
			}));
	});
});

await run();
