# CodeStack Problem Catalog — Licensing & Provenance

All problems in this catalog (`problems.ts`) are **original works authored for CodeStack**.
Statements, function signatures, test data, and reference solutions were written from scratch for
this repository. They are **not** copied, paraphrased, or adapted from LeetCode, HackerRank,
Codeforces, or any other proprietary problem set.

## License

Unless a problem's entry states otherwise, catalog content is released under
**Creative Commons CC0 1.0 (public domain dedication)** so it can be freely used, modified, and
redistributed by anyone deploying CodeStack.

## Company tags

The `companies` field is an editorial *topic-style facet* ("this pattern is common in interviews at
X"). It does **not** reproduce any company's actual interview questions and implies no affiliation
with or endorsement by the named companies. Treat it as a study-theme label, not sourced data.

## Authoring standard (every problem must meet this)

- Conforms to `schema.ts` (validated by `seed-catalog.ts` before insert).
- Judge-ready by synthesis: a machine-checkable `ioSpec` + `functionName`, so drivers and testcase
  I/O are generated deterministically (`code-execution/driver-synth`) — no hand-written harness.
- Ships a **reference solution** in the required core languages (Python + JavaScript) that passes
  every sample and hidden test case. The `seed-catalog.ts --validate` gate proves this against the
  real judge (Piston) before the catalog is trusted.
- Return types are restricted to scalars (int/long/string/bool) in this starter set to guarantee
  byte-identical output across languages without relying on output normalization.

## Status

This is a **starter set** establishing the schema, tooling, and authoring pattern. It is intended to
grow toward the full ~250-problem catalog (issue #14); additional problems should be appended to
`problems.ts` following the same standard and re-validated with `--validate`.
