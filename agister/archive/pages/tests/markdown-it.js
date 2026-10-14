// Loads markdown-it.min.js as the page does, as a classic script that
// sets globalThis.markdownit; imported as a module, its UMD wrapper would
// export it instead.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const url = new URL('../markdown-it.min.js', import.meta.url);
vm.runInThisContext(readFileSync(url, 'utf8'), { filename: fileURLToPath(url) });
