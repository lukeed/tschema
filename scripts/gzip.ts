import { resolve } from 'jsr:@std/path';
import { minify } from 'npm:terser@~5';

// NOTE: run after "build" task
let input = resolve('npm/index.mjs');
let text = await Deno.readTextFile(input);

let m = await minify(text, {
	ecma: 2020,
	mangle: true,
	compress: true,
	module: true,
});

if (m.code) {
	console.log('\nMinified\n----------');
	console.log(m.code + '\n');
} else {
	throw new Error('Error w/ Terser');
}

let bytes = {
	raw: text.length,
	min: m.code.length,
	gzip: 0,
};

let stream = new ReadableStream({
	start(ctrl) {
		ctrl.enqueue(
			new TextEncoder().encode(m.code),
		);
		ctrl.close();
	},
}).pipeThrough(
	new CompressionStream('gzip'),
);

let reader = stream.getReader();

while (true) {
	let tmp = await reader.read();
	if (tmp.done) break;
	bytes.gzip += tmp.value.length;
}

let raw = bytes.raw.toLocaleString();
let gzip = bytes.gzip.toLocaleString();
let min = bytes.min.toLocaleString();
let max = Math.max(raw.length, gzip.length);

console.log('bytes (raw): ', raw.padStart(max, ' '), 'b');
console.log('bytes (min): ', min.padStart(max, ' '), 'b');
console.log('bytes (gzip):', gzip.padStart(max, ' '), 'b');
