# Type-driven design research harness

Experimental code, not a shipped Dotdog command. Tested with Node 26.8.1.

## Run

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

Set `DOTDOG_RESEARCH_ROOT` and `TYPE_FEST_RESEARCH_ROOT` to existing checkouts. The Type-Fest checkout needs its production dependency installed:

```sh
npm --prefix "$TYPE_FEST_RESEARCH_ROOT" install --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false
npm test
node evaluate-repositories.mjs
```

The [CI workflow](../../.github/workflows/type-design-research.yml) checks out pinned revisions and runs these checks on Linux. The repository tests inspect their source inputs without editing them. The Type-Fest dependency-install step writes only the temporary checkout's ignored dependency directory.

| Corpus | Revision |
| --- | --- |
| Dotdog | `773dc265ecc30f1ec3cb417d1eb051719ea78ba9` |
| Type-Fest | `c3e825ffc1e687dd13a0003b771802d95964aaf9` |

## What is tested

- TypeScript 5.9.3 and 6.0.3 context extraction, re-exports, overloads, generic bounds, recursive types, computed brand symbols, inherited configuration, path aliases, and bounded output.
- Four deliberate contract weakenings per compiler, null-check configuration changes, and assertions/`any` that bypass checks.
- A parser prototype around Dotdog's real workspace validator, including 2,000 seeded malformed-input trials and 500 generated valid manifests.
- Selected symbols in two real codebases, with missing dependencies and bounded context reported explicitly.
- A separate TypeScript 7.1 beta native-API snapshot/repair smoke test. The context adapter does not implement the 7.1 API.
- Fourteen synthetic graph-evidence cases distinguish current records from missing, stale, partial, unreviewed, ambiguous, or incorrectly classified evidence. These test bookkeeping, not semantic satisfaction of real requirements.

## Reading the results

`checked` means that the targeted program has no compiler diagnostics and this extractor reported no omitted references. It is not proof of domain correctness. `partial` and `unverified` must not be promoted to success by a caller. A passing negative test means that the intended diagnostic appeared; an unrelated build failure is not accepted as evidence.

Some passing tests reproduce known defects or compatibility limits. In particular, the production validator still crashes for malformed nested values, and the parser prototype's optional-field inference is incompatible with the existing domain interfaces under `exactOptionalPropertyTypes: true`. The prototype strips unknown object fields through Zod's default object behavior. It is not a drop-in production replacement.

[Research and measured findings](../../docs/type-driven-design-tested-findings.md) distinguish these checks from unperformed agent-performance experiments.

## Thesis

The [technical thesis source](../../docs/dotdog-type-driven-design-thesis.md) develops the real-life Dotdog use cases and the proposed evidence model. The [combined test record](results/thesis-tests.json) retains the 61-check local and clean-replay results; the earlier 47-check experiment remains separately preserved.

Render the PDF from this directory:

```sh
python3 -m venv .pdf-venv
.pdf-venv/bin/python -m pip install -r requirements-pdf.txt
.pdf-venv/bin/python render-thesis.py
```

PDF dependencies are for document production only. The renderer uses system Arial/Times fonts when available and base PDF fonts otherwise.
