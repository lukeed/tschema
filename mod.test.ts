import * as assert from 'jsr:@std/assert';
import { describe, it } from 'jsr:@std/testing/bdd';
import * as t from './mod.ts';

describe('Null', () => {
	it('should be a function', () => {
		assert.assert(typeof t.Null === 'function');
	});
});
