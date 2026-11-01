# Type-driven design: tested findings

This extends the [initial research](type-driven-design-research.md) with a runnable [research harness](../research/type-driven-design/README.md). No production Dotdog source was changed.

The later [technical thesis](dotdog-type-driven-design-thesis.md) adds real-life use cases, a deeper traceability/tooling review, and fourteen synthetic graph-evidence cases. Its combined 61-check record is preserved separately from the original experiment below.

## Decision after testing

Keep this as a separable research module inside the Specdog project for now. Prioritize checked boundary values and selected-symbol type context. Do not market it as a universal type-design tool, full semantic indexer, or type-safe coding agent.

The tests establish narrow engineering feasibility and expose production and prototype gaps. They do not establish user demand, better agent output, or token savings.

## What the deeper literature changes

1. **The new compiler API is available to test.** Microsoft's [TypeScript 7.1 beta announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/) documents separate synchronous/asynchronous APIs and disposable programs/snapshots. The earlier research's future-tense API warning is outdated. A real 7.1 beta snapshot test now detects TS2322, verifies a repaired snapshot, and confirms the old snapshot still contains its error. This does not make the 5/6 extractor compatible with 7.1.
2. **The agent-context evidence is narrower than an integration claim.** [ChatLSP's TypeScript methodology and threats to validity](https://arxiv.org/html/2409.00921v1) say relevant-header retrieval was manually simulated in that implementation. The paper also acknowledges idealized baselines, a closely translated benchmark, and cases where irrelevant headers hurt results. Therefore, selecting useful context still needs a separate measured experiment; extracting types does not establish that advantage.
3. **Test the contracts themselves.** The [TypeScript 3.9 documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#ts-expect-error-comments) describes expected-error comments, but such a comment does not identify the intended diagnostic. This harness checks diagnostic code and file after establishing valid baseline usage. Its deliberately weakened contracts exercise a principle related to [mutation testing](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/); Stryker itself was not run.
4. **Configuration is part of the guarantee.** [Project-reference documentation](https://www.typescriptlang.org/docs/handbook/project-references) explains why a reference build is not equivalent to compiling one file set. The prototype rejects reference-based projects rather than reporting a misleading pass. Null checks and exact optional-property rules are tested separately.

## Executed checks

Environment: Node 26.8.1; TypeScript 5.9.3, 6.0.3, and 7.1.0-beta; Zod 4.6.7; fast-check 4.10.2. Versions are pinned in the research package lockfile.

The local suite passed **47 tests, zero failures, zero skips**. A clean installation from the lockfile was tested separately; machine-readable counts and timings are in [the test results](../research/type-driven-design/results/tests.json). CI results are separate from local results and remain whatever the linked PR actually reports.

| Area | What ran | What it establishes |
| --- | --- | --- |
| Type context | Both older compilers; alias/re-export resolution, overloads, recursive/generic types, computed brand keys, inherited config, and path aliases | Selected declarations can be recovered without dumping function bodies |
| Contract weakening | Wrong-ID, wrong-state, required-field, and exhaustive-handler mutations on both compilers | Each original check rejects its intended misuse, and deliberately weakening its contract removes that rejection |
| Configuration and bypasses | Disabled null checks; `unknown` versus `any` and assertions; strict optional-property mismatch | A compiler pass is conditional on configuration and can be bypassed |
| Runtime boundary | 1,000 arbitrary JSON values and 1,000 nested-manifest mutations, with fixed seeds | The parser prototype returned structured results without crashes for these cases |
| Positive runtime control | 500 generated valid manifests, plus explicit examples | The parser is not merely rejecting every input |
| Real source corpora | Four selected symbols in each of Dotdog and Type-Fest, on two compilers | Targeted extraction and incomplete-context reporting work on these selections |
| New native API | 7.1 beta diagnostic and immutable-snapshot repair | The installed new API works for this narrow workflow |

The generated-input trials are not 2,500 independent tests, exhaustive fuzzing, or a security evaluation. Their seeds and generators are retained in the harness.

## Real-code results

Dotdog revision: `773dc265ecc30f1ec3cb417d1eb051719ea78ba9`. Type-Fest revision: `c3e825ffc1e687dd13a0003b771802d95964aaf9`.

Both targeted programs produced zero diagnostics on both compilers after their research configurations were corrected. These configurations are not substitutes for either repository's full build/test suite. Dotdog uses an explicitly selected Bundler-resolution research configuration because this checkout has no application `tsconfig`; Type-Fest uses NodeNext resolution and its required exact optional-property behavior.

All 16 selected target/compiler combinations resolved. Six contexts were `checked`; ten were `partial`. The per-target results below were identical in status, declaration count, and byte size on 5.9 and 6.0:

| Target | Declarations | Context bytes | Status |
| --- | ---: | ---: | --- |
| Dotdog `selectionFromOptions` | 2 | 360 | checked |
| Dotdog `WorkspaceConfig` | 6 | 907 | checked |
| Dotdog `RepositoryWorldModel` | 8 | 1,783 | partial: external utility type |
| Dotdog `auditDesign` | 4 | 646 | checked |
| Type-Fest `Simplify` | 3 | 664 | partial: external utility type |
| Type-Fest `Merge` | 24 | 5,724 | partial: budget and external definitions |
| Type-Fest `Jsonify` | 24 | 7,523 | partial: budget and external definitions |
| Type-Fest `Tagged` | 3 | 348 | partial: external definitions, including the brand symbol |

The 16 KB output cap was respected. These are UTF-8 bytes, not model tokens or demonstrated savings. Program setup/checking cost hundreds of milliseconds in these local runs; extracting already-loaded selected symbols was much cheaper. See [the measured corpus results](../research/type-driven-design/results/corpora.json) for timings; these single-run timings are not a performance benchmark.

## Concrete defects and limits found

### Production boundary defects reproduced, not fixed

Dotdog's current `validateWorkspaceConfig(unknown)` throws a `TypeError` for `repos: [null]` and for a non-array `groups` value. It also reports an incomplete group with no `repos` array as valid. The research tests reproduce those behaviors against the actual checkout.

The parser prototype performs shape parsing before calling the existing semantic validator. It returns a discriminated success/error result with typed data and retains duplicate-alias and unknown-edge checks. It is not deployed, and it is not a complete production fix.

### Prototype compatibility gap retained

Under ordinary strict checking, success-result data is assignable to Dotdog's real `WorkspaceConfig` without an assertion; error results do not expose `data`. With `exactOptionalPropertyTypes: true`, the assignment fails with TS2379 because Zod optional properties can include explicit `undefined` whereas the existing interfaces distinguish omission from that value. Two tests intentionally reproduce this incompatibility. Normalization or a reviewed optional-value policy is required before adoption.

### Context extraction is not yet a general semantic closure

- Inferred signatures, classes, and project-reference builds are not fully supported. The prototype labels these cases partial or unsupported.
- Budgeted traversal of Type-Fest's complex utilities omits definitions. Built-in utility types and dependencies outside the configured source root are explicitly reported rather than expanded.
- Computed unique-symbol keys initially lost their marker declaration; a regression now exercises marker retrieval.
- The adapter requires a selected file/export. It does not find the right operation from a natural-language task or rank all potentially useful headers.
- Source/config fingerprints attach evidence to inputs; they do not prove that a declared rule is the correct rule.

## Failures during the experiment

The first context-only run passed 14 of 16 tests: it incorrectly emitted generic parameter binders as independent declarations. That was corrected and tested. A later ESM fixture initially produced unrelated module-format diagnostics; the fixture was corrected instead of accepting those diagnostics as a negative-contract success.

The initial Dotdog corpus experiment also produced TS2835 under inappropriate NodeNext resolution and TS2375 with a stricter optional-property policy. Those results are retained in [the experiment notes](../research/type-driven-design/results/experiment-notes.json). The final targeted configuration is explicit about those changes; no production source was altered to make the research pass.

## What remains before a product claim

1. Resolve the optional-field policy and port the selected-symbol adapter to the native API before promising broad configuration/version support.
2. Add actual rule-to-symbol/test links, with reviewed intent and evidence provenance; names alone do not prove enforcement.
3. Run a controlled coding-task comparison with ordinary repository context, spec/graph context, and added type context. Measure behavioral success, repair iterations, actual tokens, time, and failures under the same conditions.
4. Validate whether users want this workflow independently of Dotdog before splitting it into a standalone tool.

No coding-agent A/B study, model-weight training, whole-repository verification, or production rollout was performed in this experiment.
