import * as t from './mod.ts';

declare function assert<T>(value: T): void;

const NULL = null;
const NUMBER = 123;
const STRING = 'foobar';

// ---
// STRING / basic
// ---

let s1 = t.string({ format: 'email' });

assert<t.string<string>>(s1);
assert<t.string>(s1);

// @ts-expect-error; not an enum
assert<t.string<''>>(s1);

declare let S1: t.Infer<typeof s1>;
assert<string>(S1);

// @ts-expect-error; not constant
assert<''>(S1);

// ---
// STRING / enum values
// ---

t.string({
	// @ts-expect-error; string[]
	enum: STRING,
});

t.string({
	// @ts-expect-error; string[]
	enum: [NUMBER],
});

let s2 = t.string({
	enum: ['foo', 'bar'],
});

assert<t.string<'foo' | 'bar'>>(s2);
assert<t.string<string>>(s2);
assert<t.string>(s2);

// @ts-expect-error; incomplete enum
assert<t.string<'foo'>>(s2);

declare let S2: t.Infer<typeof s2>;

// @ts-expect-error; incomplete enum
assert<'foo'>(S2);

assert<'foo' | 'bar'>(S2);
assert<string>(S2);

// ---
// STRING / non-constant enum
// ---

declare let xyz: string[];
let s3 = t.string({ enum: xyz });

assert<t.string<string>>(s3);
assert<t.string>(s3);

declare let S3: t.Infer<typeof s3>;
assert<string>(S3);

// can be any string
assert<typeof S3>('foobar');

// ---
// NUMBER / basic
// ---

let n1 = t.number();
assert<t.number<number>>(n1);
assert<t.number>(n1);

declare let N1: t.Infer<typeof n1>;
assert<number>(N1);

// @ts-expect-error; not constant/enum
assert<123>(N1);

// ---
// INTEGER / basic
// ---

let n2 = t.integer();
assert<t.integer<number>>(n2);
assert<t.integer>(n2);

// @ts-expect-error; distinct types
assert<t.number>(n2);

declare let N2: t.Infer<typeof n2>;
assert<number>(N2);

// @ts-expect-error; not constant
assert<123>(N2);

// ---
// NUMBER / enum
// ---

let n3 = t.number({
	enum: [1.11, 2.22, 3.33],
});

assert<t.number>(n3);
assert<t.number<number>>(n3);
assert<t.number<1.11 | 2.22 | 3.33>>(n3);

// @ts-expect-error; incomplete enum
assert<t.number<1.11>>(n3);

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

let n4 = t.integer({
	enum: [1, 2, 3],
});

assert<t.integer>(n4);
assert<t.integer<number>>(n4);
assert<t.integer<1 | 2 | 3>>(n4);

// @ts-expect-error; incomplete enum
assert<t.integer<1>>(n4);

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

let o1 = t.object({
	name: t.string(),
	age: t.number(),
});

assert<
	t.object<{
		name: t.string<string>;
		age: t.number<number>;
	}>
>(o1);

assert<
	t.object<{
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
	name: t.string(),
	age: t.integer(),
};

let o2 = t.object(p2, {
	additionalProperties: false,
});

assert<t.object<typeof p2>>(o2);

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

let o3 = t.object({
	name: t.string(),
	age: t.integer({
		minimum: 18,
	}),
	status: t.string({
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

let _ = t.object({
	name: t.string(),
	age: t.integer(),
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

let o5 = t.object({
	uid: t.optional(
		t.integer(),
	),
	name: t.string(),
	age: t.optional(
		t.integer(),
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

let o6 = t.readonly(
	t.object({
		name: t.string(),
		age: t.optional(
			t.integer(),
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
t.enum(STRING, NUMBER, NULL);

// can be mixed types
let e1 = t.enum([STRING, NUMBER, NULL]);
assert<t.enum<typeof STRING | typeof NUMBER | typeof NULL>>(e1);
assert<t.enum<'foobar' | 123 | null>>(e1);

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

let a1 = t.array(t.string());

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

let a2 = t.readonly(
	t.array(t.string()),
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

let a3 = t.array(
	t.object({
		name: t.string(),
		age: t.integer(),
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

let a4 = t.array(
	t.readonly(
		t.object({
			name: t.string(),
			age: t.integer(),
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

let a5 = t.readonly(
	t.array(
		t.object({
			name: t.string(),
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
t.tuple(t.nUMBER(), t.string());

let t1 = t.tuple([t.number(), t.string()]);
assert<t.tuple<[t.number<number>, t.string<string>]>>(t1);
assert<t.tuple<[t.number, t.string]>>(t1);

declare let T1: t.Infer<typeof t1>;
assert<[number, string]>(T1);

// ---
// TUPLE / with enum
// ---

let t2 = t.tuple([
	t.enum(['NW', 'NE', 'SW', 'SE'], {
		deprecated: true,
	}),
	t.boolean(),
]);

assert<t.tuple<[t.enum<'NW' | 'NE' | 'SW' | 'SE'>, t.boolean]>>(t2);
assert<t.tuple<[t.enum<string>, t.boolean]>>(t2);

declare let T2: t.Infer<typeof t2>;
assert<['NW' | 'NE' | 'SW' | 'SE', boolean]>(T2);
assert<[string, boolean]>(T2);

// @ts-expect-error; STRING is not in ENUM
assert<typeof T2>([STRING, true]);
