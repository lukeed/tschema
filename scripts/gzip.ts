import { resolve } from 'jsr:@std/path';

// NOTE: run after "build" task
let input = resolve('npm/index.mjs');
let content = await Deno.readFile(input);

let bytes = {
	raw: content.length,
	gzip: 0,
};

let stream = new ReadableStream({
	start(ctrl) {
		ctrl.enqueue(content);
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
let max = Math.max(raw.length, gzip.length);

console.log('bytes (raw): ', raw.padStart(max, ' '), 'b');
console.log('bytes (gzip):', gzip.padStart(max, ' '), 'b');
