import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workerSrc = resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
const outFile = resolve(root, 'public/pdf.worker.min.mjs')

if (!existsSync(workerSrc)) {
  console.error(`[build-pdf-worker] pdfjs-dist worker not found at ${workerSrc}`)
  process.exit(1)
}

const polyfill = `// Injected by scripts/build-pdf-worker.mjs — see lib/uint8-polyfill.ts
(function () {
  if (typeof Map !== 'undefined') {
    var mapProto = Map.prototype;
    if (typeof mapProto.getOrInsert !== 'function') {
      Object.defineProperty(mapProto, 'getOrInsert', {
        value: function (key, defaultValue) {
          if (!this.has(key)) this.set(key, defaultValue);
          return this.get(key);
        },
        writable: true, configurable: true,
      });
    }
    if (typeof mapProto.getOrInsertComputed !== 'function') {
      Object.defineProperty(mapProto, 'getOrInsertComputed', {
        value: function (key, callbackFn) {
          if (!this.has(key)) this.set(key, callbackFn(key));
          return this.get(key);
        },
        writable: true, configurable: true,
      });
    }
  }
  if (typeof Uint8Array === 'undefined') return;
  var proto = Uint8Array.prototype;
  var ctor = Uint8Array;
  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(proto, 'toHex', {
      value: function () {
        var out = '';
        for (var i = 0; i < this.length; i++) out += this[i].toString(16).padStart(2, '0');
        return out;
      },
      writable: true, configurable: true,
    });
  }
  if (typeof ctor.fromHex !== 'function') {
    Object.defineProperty(ctor, 'fromHex', {
      value: function (hex) {
        var clean = hex.length % 2 === 0 ? hex : hex.slice(0, -1);
        var out = new Uint8Array(clean.length / 2);
        for (var i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        return out;
      },
      writable: true, configurable: true,
    });
  }
  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(proto, 'toBase64', {
      value: function () {
        var binary = '';
        for (var i = 0; i < this.length; i++) binary += String.fromCharCode(this[i]);
        return btoa(binary);
      },
      writable: true, configurable: true,
    });
  }
  if (typeof ctor.fromBase64 !== 'function') {
    Object.defineProperty(ctor, 'fromBase64', {
      value: function (str) {
        var binary = atob(str);
        var out = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
      },
      writable: true, configurable: true,
    });
  }
})();
`

const worker = readFileSync(workerSrc, 'utf8')
writeFileSync(outFile, polyfill + '\n' + worker)
console.log(`[build-pdf-worker] wrote ${outFile} (${(polyfill.length + worker.length)} bytes)`)
