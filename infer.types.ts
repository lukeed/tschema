import * as t from './mod.ts';

declare function assert<T>(value: T): void;

const NULL = null;
const NUMBER = 123;
const STRING = 'foobar';

// ---
// STRING / basic
// ---

let s1 = t.String({ format: 'email' });

assert<t.String<string>>(s1);
assert<t.String>(s1);

// @ts-expect-error; not an enum
assert<t.String<''>>(s1);

declare let S1: t.Infer<typeof s1>;
assert<string>(S1);

// @ts-expect-error; not constant
assert<''>(S1);

// ---
// STRING / enum values
// ---

t.String({
	// @ts-expect-error; string[]
	enum: STRING,
});

t.String({
	// @ts-expect-error; string[]
	enum: [NUMBER],
});

let s2 = t.String({
	enum: ['foo', 'bar'],
});

assert<t.String<'foo' | 'bar'>>(s2);
assert<t.String<string>>(s2);
assert<t.String>(s2);

// @ts-expect-error; incomplete enum
assert<t.String<'foo'>>(s2);

declare let S2: t.Infer<typeof s2>;

// @ts-expect-error; incomplete enum
assert<'foo'>(S2);

assert<'foo' | 'bar'>(S2);
assert<string>(S2);

// ---
// STRING / non-constant enum
// ---

declare let xyz: string[];
let s3 = t.String({ enum: xyz });

assert<t.String<string>>(s3);
assert<t.String>(s3);

declare let S3: t.Infer<typeof s3>;
assert<string>(S3);

// can be any string
assert<typeof S3>('foobar');

// ---
// NUMBER / basic
// ---

let n1 = t.Number();
assert<t.Number<number>>(n1);
assert<t.Number>(n1);

declare let N1: t.Infer<typeof n1>;
assert<number>(N1);

// @ts-expect-error; not constant/enum
assert<123>(N1);

// ---
// INTEGER / basic
// ---

let n2 = t.Integer();
assert<t.Integer<number>>(n2);
assert<t.Integer>(n2);

// @ts-expect-error; distinct types
assert<t.Number>(n2);

declare let N2: t.Infer<typeof n2>;
assert<number>(N2);

// @ts-expect-error; not constant
assert<123>(N2);

// ---
// NUMBER / enum
// ---

let n3 = t.Number({
	enum: [1.11, 2.22, 3.33],
});

assert<t.Number>(n3);
assert<t.Number<number>>(n3);
assert<t.Number<1.11 | 2.22 | 3.33>>(n3);

// @ts-expect-error; incomplete enum
assert<t.Number<1.11>>(n3);

declare let N3: t.Infer<typeof n3>;

assert<number>(N3);
assert<1.11 | 2.22 | 3.33>(N3);

// @ts-expect-error; incomplete enum
assert<1.11 | 2.22>(N3);

// @ts-expect-error; incomplete enum
assert<1.11>(N3);

// @ts-expect-error; not in enum
assert<0>(N3);

// ---
// INTEGER / enum
// ---

let n4 = t.Integer({
	enum: [1, 2, 3],
});

assert<t.Integer>(n4);
assert<t.Integer<number>>(n4);
assert<t.Integer<1 | 2 | 3>>(n4);

// @ts-expect-error; incomplete enum
assert<t.Integer<1>>(n4);

declare let N4: t.Infer<typeof n4>;

assert<number>(N4);
assert<1 | 2 | 3>(N4);

// @ts-expect-error; incomplete enum
assert<1 | 2>(N4);

// @ts-expect-error; incomplete enum
assert<1>(N4);

// @ts-expect-error; not in enum
assert<0>(N4);

// ---
// OBJECT / basic
// ---

let o1 = t.Object({
	name: t.String(),
	age: t.Number(),
});

assert<
	t.Object<{
		name: t.String<string>;
		age: t.Number<number>;
	}>
>(o1);

assert<
	t.Object<{
		name: t.Field;
		age: t.Field;
	}>
>(o1);

declare let O1: t.Infer<typeof o1>;

assert<{
	name: string;
	age: number;
}>(O1);

// ---
// Object / via properties
// ---

let p2 = {
	name: t.String(),
	age: t.Integer(),
};

let o2 = t.Object(p2, {
	additionalProperties: false,
});

assert<t.Object<typeof p2>>(o2);

type O2 = t.Infer<typeof o2>;
type P2 = t.Infer<typeof p2>;

declare let O2: O2;
declare let P2: P2;

// infer as same
assert<P2>(P2);
assert<O2>(P2);
assert<P2>(O2);

assert<{
	name: string;
	age: number;
}>(P2);

assert<{
	name: string;
	age: number;
}>(O2);

// ---
// Object / with enum property
// ---

let o3 = t.Object({
	name: t.String(),
	age: t.Integer({
		minimum: 18,
	}),
	status: t.String({
		enum: ['single', 'married', 'widowed', 'divorced', 'separated', 'partnership'],
	}),
});

declare let O3: t.Infer<typeof o3>;

assert<{
	name: string;
	age: number;
	status: 'single' | 'married' | 'widowed' | 'divorced' | 'separated' | 'partnership';
}>(O3);

assert<{
	name: string;
	age: number;
	status: string; // generic match ok
}>(O3);

assert<typeof O3>({
	name: STRING,
	age: NUMBER,
	status: 'single',
});

assert<{
	name: string;
	age: number;
	status: 'single' | 'married';
}>(
	// @ts-expect-error; incomplete enum
	O3,
);

// @ts-expect-error; missing properties
assert<typeof O3>({
	name: STRING,
});

assert<typeof O3>({
	name: STRING,
	age: NUMBER,
	// @ts-expect-error; enum
	status: STRING,
});

// ---
// OBJECT / `required` match keys
// ---

let _ = t.Object({
	name: t.String(),
	age: t.Integer(),
}, {
	required: [
		'name',
		// @ts-expect-error; not a key
		'foobar',
	],
});

// ---
// OBJECT / optional keys
// ---

let o5 = t.Object({
	uid: t.Optional(
		t.Integer(),
	),
	name: t.String(),
	age: t.Optional(
		t.Integer(),
	),
});

declare let O5: t.Infer<typeof o5>;

assert<{
	name: string;
	uid?: number;
	age?: number;
}>(O5);

assert<{
	name: string;
	uid: number; // <<
	age?: number;
}>(
	// @ts-expect-error; missing uid optional
	O5,
);

assert<typeof O5>({
	name: STRING,
});

assert<typeof O5>({
	name: STRING,
	age: NUMBER,
});

assert<typeof O5>({
	name: STRING,
	uid: NUMBER,
});

assert<typeof O5>({
	name: STRING,
	uid: NUMBER,
	// @ts-expect-error; not number
	age: STRING,
});

// ---
// OBJECT / readonly
// ---

let o6 = t.Readonly(
	t.Object({
		name: t.String(),
		age: t.Optional(
			t.Integer(),
		),
	}),
);

declare let O6: t.Infer<typeof o6>;

assert<{
	readonly name: string;
	readonly age?: number;
}>(O6);

// @ts-expect-error; readonly
O6.age = NUMBER;

// @ts-expect-error; readonly
O6.name = STRING;

// ---
// ENUM
// ---

// @ts-expect-error; must be array
t.Enum(STRING, NUMBER, NULL);

// can be mixed types
let e1 = t.Enum([STRING, NUMBER, NULL]);
assert<t.Enum<typeof STRING | typeof NUMBER | typeof NULL>>(e1);
assert<t.Enum<'foobar' | 123 | null>>(e1);

type E1 = t.Infer<typeof e1>;
assert<E1>(STRING);
assert<E1>(NUMBER);
assert<E1>(NULL);

// @ts-expect-error; not in enum
assert<E1>('howdy');

declare let E1: E1;
assert<typeof STRING | typeof NUMBER | typeof NULL>(E1);
assert<'foobar' | 123 | null>(E1);

// ---
// ARRAY / basic
// ---

let a1 = t.Array(t.String());

type A1 = t.Infer<typeof a1>;
declare let A1: A1;
assert<string[]>(A1);
assert<A1>([]);

assert<A1>([STRING]);

// @ts-expect-error; not string[]
assert<A1>([NUMBER]);

// @ts-expect-error; not string[]
assert<A1>([] as unknown[]);

// ---
// ARRAY / readonly
// ---

let a2 = t.Readonly(
	t.Array(t.String()),
);

type A2 = t.Infer<typeof a2>;
declare let A2: A2;

assert<readonly string[]>(A2);

// @ts-expect-error; missing `readonly`
assert<string[]>(A2);

// @ts-expect-error; cannot assign into readonly
A2[0] = STRING;

// ---
// ARRAY / with objects
// ---

let a3 = t.Array(
	t.Object({
		name: t.String(),
		age: t.Integer(),
	}),
);

type A3 = t.Infer<typeof a3>;
declare let A3: A3;

assert<{
	name: string;
	age: number;
}[]>(A3);

// @ts-expect-error; not array
assert<A3>(NUMBER);

assert<A3>([{
	name: STRING,
	age: NUMBER,
}]);

assert<A3>([{
	name: STRING,
	// @ts-expect-error; type
	age: STRING,
}]);

assert<A3>([
	// @ts-expect-error; missing key
	{ name: STRING },
	// @ts-expect-error; missing key
	{ age: NUMBER },
	// @ts-expect-error; missing keys
	{},
]);

// ---
// ARRAY / with readonly objects
// ---

let a4 = t.Array(
	t.Readonly(
		t.Object({
			name: t.String(),
			age: t.Integer(),
		}),
	),
);

type A4 = t.Infer<typeof a4>;
declare let A4: A4;

assert<{
	readonly name: string;
	readonly age: number;
}[]>(A4);

// @ts-expect-error; readonly object
A4[0].age = NUMBER;

// array itself is not readonly
A4[0] = { name: STRING, age: NUMBER };

assert<A4>([{
	name: STRING,
	age: NUMBER,
}]);

assert<A4>([{
	name: STRING,
	// @ts-expect-error; type
	age: STRING,
}]);

assert<A4>([
	// @ts-expect-error; missing key
	{ name: STRING },
	// @ts-expect-error; missing key
	{ age: NUMBER },
	// @ts-expect-error; missing keys
	{},
]);

// ---
// ARRAY / readonly w/ objects
// ---

let a5 = t.Readonly(
	t.Array(
		t.Object({
			name: t.String(),
		}),
	),
);

type A5 = t.Infer<typeof a5>;
declare let A5: A5;

assert<readonly { name: string }[]>(A5);

// @ts-expect-error; readonly
A5[0] = { name: STRING };

// items arent readonly
A5[0].name = STRING;

// ---
// TUPLE
// ---

// @ts-expect-error; must be array
t.Tuple(t.NUMBER(), t.String());

let t1 = t.Tuple([t.Number(), t.String()]);
assert<t.Tuple<[t.Number<number>, t.String<string>]>>(t1);
assert<t.Tuple<[t.Number, t.String]>>(t1);

declare let T1: t.Infer<typeof t1>;
assert<[number, string]>(T1);

// ---
// TUPLE / with enum
// ---

let t2 = t.Tuple([
	t.Enum(['NW', 'NE', 'SW', 'SE'], {
		deprecated: true,
	}),
	t.Boolean(),
]);

assert<t.Tuple<[t.Enum<'NW' | 'NE' | 'SW' | 'SE'>, t.Boolean]>>(t2);
assert<t.Tuple<[t.Enum<string>, t.Boolean]>>(t2);

declare let T2: t.Infer<typeof t2>;
assert<['NW' | 'NE' | 'SW' | 'SE', boolean]>(T2);
assert<[string, boolean]>(T2);

// @ts-expect-error; STRING is not in ENUM
assert<typeof T2>([STRING, true]);
