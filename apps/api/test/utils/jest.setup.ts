// Jest's built-in "node" test environment sandboxes the global object and
// does not forward newer Node globals (File, Blob, fetch) even on a Node
// version that natively supports them. testcontainers' HTTP wait-strategy
// (via a nested undici) references the global `File` at module-load time,
// so it must exist before any test file imports @testcontainers/*.
import { Blob, File } from 'node:buffer';

if (typeof (globalThis as Record<string, unknown>).File === 'undefined') {
  (globalThis as Record<string, unknown>).File = File;
}
if (typeof (globalThis as Record<string, unknown>).Blob === 'undefined') {
  (globalThis as Record<string, unknown>).Blob = Blob;
}
