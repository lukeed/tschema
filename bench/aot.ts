import { parse, validate } from 'tschema/validate';
import { User } from './schema';

export { INVALID, User, VALID } from './schema';

export const aot = {
	validate: (input: unknown) => validate(User, input),
	parse: (input: unknown) => parse(User, input),
};
