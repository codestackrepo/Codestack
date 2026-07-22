/* eslint-disable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-function-type */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>;

let cached: ReturnType<typeof dynamicImport> | null = null;

/**
 * pdfjs-dist v6's Node ("legacy") build ships ESM-only (`.mjs`); this project
 * compiles to CommonJS, and TypeScript downlevels a literal `import()` under
 * `module: commonjs` into `require()`, which cannot load an ESM-only file
 * (`ERR_REQUIRE_ESM`). Constructing the import via `new Function` hides it
 * from that downleveling, so this performs a genuine native dynamic import,
 * which Node's CJS runtime supports directly.
 *
 * Requires Node ≥ 20 — verified the same import throws
 * `DOMMatrix is not defined` under Node 18 (18.12.1 and 18.20.6 both), but
 * works cleanly on 20 and 22; see `engines.node` in package.json.
 */
export function loadPdfJs() {
  if (!cached) {
    cached = dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return cached;
}
