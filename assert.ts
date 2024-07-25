import * as t from './index.ts';

declare function assert<T>(value: T): void;

const NULL = null;
const NUMBER = 123;
const STRING = 'foobar';

let s1 = t.String({ format: 'email' });

assert<t.String>(s1);
type S1 = t.Infer<typeof s1>;
// @ts-expect-error; string
assert<S1>(NUMBER);
assert<S1>(STRING);

// @ts-expect-error; string[]
t.String({ enum: STRING });

// @ts-expect-error; string[]
t.String({ enum: [NUMBER] });

let s2 = t.String({
	enum: ['foo', 'bar'],
});

type S2 = t.Infer<typeof s2>;

// @ts-expect-error; type
assert<S2>(NUMBER);
// @ts-expect-error; not in enum
assert<S2>(STRING);
assert<S2>('foo');
assert<S2>('bar');

declare let a5: string[];
let s3 = t.String({ enum: a5 });
type S3 = t.Infer<typeof s3>;

// @ts-expect-error; type
assert<S3>(NUMBER);
assert<S3>(STRING);
assert<S3>('foo');

let n1 = t.Number();
assert<t.Number>(n1);
type N1 = t.Infer<typeof n1>;
// @ts-expect-error; number
assert<N1>(STRING);
assert<N1>(NUMBER);

let n2 = t.Integer();
assert<t.Integer>(n2);
// @ts-expect-error; distinct types
assert<t.Number>(n2);
type N2 = t.Infer<typeof n2>;
// @ts-expect-error; number
assert<N2>(STRING);
assert<N2>(NUMBER);

let n3 = t.Number({
	enum: [1.11, 2.22, 3.33],
});

assert<t.Number>(n3);
assert<t.Number<1.11 | 2.22 | 3.33>>(n3);
type N3 = t.Infer<typeof n3>;
// @ts-expect-error; number
assert<N3>(STRING);
// @ts-expect-error; not enum
assert<N3>(NUMBER);
assert<N3>(1.11);

let n4 = t.Integer({
	enum: [1, 2, 3],
});

assert<t.Integer>(n4);
assert<t.Integer<1 | 2 | 3>>(n4);
type N4 = t.Infer<typeof n4>;
// @ts-expect-error; number
assert<N4>(STRING);
// @ts-expect-error; not enum
assert<N4>(NUMBER);
assert<N4>(1);

let o1 = t.Object({
	name: t.String(),
	age: t.Number(),
});

type O1 = t.Infer<typeof o1>;

// checking properties below
assert<t.Object<unknown>>(o1);

assert<O1>({
	name: STRING,
	age: NUMBER,
});

assert<O1>({
	name: STRING,
	// @ts-expect-error; should be NUMBER
	age: STRING,
});

// @ts-expect-error; missing key
assert<O1>({
	name: STRING,
});

let p1 = {
	name: t.String(),
	age: t.Integer(),
};

let o2 = t.Object(p1, {
	additionalProperties: false,
});

assert<t.Object<typeof p1>>(o2);

type P1 = t.Infer<typeof p1>;
type O2 = t.Infer<typeof o2>;

declare let p2: P1;

assert<P1>(p2);
assert<O2>(p2);

assert<O2>({
	name: STRING,
	age: NUMBER,
});

assert<O2>({
	name: STRING,
	// @ts-expect-error; should be NUMBER
	age: STRING,
});

// @ts-expect-error; missing key
assert<O2>({
	name: STRING,
});

assert<P1>({
	name: STRING,
	age: NUMBER,
});

assert<P1>({
	name: STRING,
	// @ts-expect-error; should be NUMBER
	age: STRING,
});

// @ts-expect-error; missing key
assert<P1>({
	name: STRING,
});

let o3 = t.Object({
	name: t.String(),
	age: t.Integer({
		minimum: 18,
	}),
	martial: t.String({
		enum: ['single', 'married', 'widowed', 'divorced', 'separated', 'partnership'],
	}),
});

type O3 = t.Infer<typeof o3>;

assert<O3>({
	name: STRING,
	age: NUMBER,
	martial: 'single',
});

assert<O3>({
	name: STRING,
	age: NUMBER,
	// @ts-expect-error; type
	martial: ['single'],
});

// @ts-expect-error; missing properties
assert<O3>({
	name: STRING,
});

assert<O3>({
	name: STRING,
	age: NUMBER,
	// @ts-expect-error; enum
	martial: STRING,
});

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

let a1 = t.Array(
	t.Object({
		name: t.String(),
		age: t.Integer(),
	}),
);

type A1 = t.Infer<typeof a1>;

// @ts-expect-error; not array
assert<A1>(NUMBER);

assert<A1>([{
	name: STRING,
	age: NUMBER,
}]);

assert<A1>([{
	name: STRING,
	// @ts-expect-error; type
	age: STRING,
}]);

assert<A1>([
	// @ts-expect-error; missing key
	{ name: STRING },
	// @ts-expect-error; missing key
	{ age: NUMBER },
	// @ts-expect-error; missing keys
	{},
]);

let a2 = t.Array(
	t.Readonly(
		t.Object({
			name: t.String(),
			age: t.Integer(),
		}),
	),
);

type A2 = t.Infer<typeof a2>;

// @ts-expect-error; not array
assert<A2>(NUMBER);

assert<A2>([{
	name: STRING,
	age: NUMBER,
}]);

assert<A2>([{
	name: STRING,
	// @ts-expect-error; type
	age: STRING,
}]);

assert<A2>([
	// @ts-expect-error; missing key
	{ name: STRING },
	// @ts-expect-error; missing key
	{ age: NUMBER },
	// @ts-expect-error; missing keys
	{},
]);

// @ts-expect-error; must be array
t.Tuple(t.NUMBER(), t.String());

let t1 = t.Tuple([
	t.Number(),
	t.String(),
]);

type T1 = t.Infer<typeof t1>;

// @ts-expect-error; not array
assert<T1>(NUMBER);
// @ts-expect-error; not array
assert<T1>(NUMBER, STRING);
// @ts-expect-error; not match
assert<T1>([STRING, NUMBER]);

assert<T1>([NUMBER, STRING]);

let t2 = t.Tuple([
	t.Enum(['NW', 'NE', 'SW', 'SE'], {
		deprecated: true,
	}),
	t.Boolean(),
]);

type T2 = t.Infer<typeof t2>;

// @ts-expect-error; not array
assert<T2>(NUMBER);
// @ts-expect-error; not match
assert<T2>([STRING, NUMBER]);
// @ts-expect-error; not match
assert<T2>([STRING, true]);
assert<T2>(['NW', true]);
