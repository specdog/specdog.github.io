# Type-driven design: research and Dotdog direction

Research date: 2026-10-31. This is a proposal, not a shipped capability or a market-validation result.

## Recommendation

Start with a distinct type-first design workflow in Dotdog. Prototype a small, read-only TypeScript adapter that supplies relevant type context and collects compiler evidence. Do not build a new type system, universal code generator, or token-level decoder.

Keep the adapter independent of `.dog` parsing so it can eventually be reused without Dotdog. A separate product is justified only after testing whether users want that independent workflow. The sources below establish technical feasibility, not demand or competitive uniqueness.

## Three different practices

| Practice | Primary job | Does not establish |
| --- | --- | --- |
| Spec-driven design | State intended behavior and constraints | That application code enforces the rules |
| Type-driven design | Shape representations and operations using types, then refine implementation with type feedback | That every business rule is encoded or every external input is trustworthy |
| Graph mapping | Record relationships and expose relevant artifacts | Type safety or behavioral correctness |

Type-driven design is not merely annotating existing code or generating interfaces from schemas. The type-first loop is: understand a domain rule, choose representations and operation signatures, use compiler feedback to refine them, implement, and test what types cannot express. [Idris interactive editing](https://idris2.readthedocs.io/en/latest/tutorial/interactive.html) demonstrates types guiding construction through hole inspection and case splitting. [Scott Wlaschin](https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/) demonstrates changing representations to exclude invalid domain combinations.

## Existing tools: integrate, do not duplicate

| Layer | Existing capability | Implication for Dotdog |
| --- | --- | --- |
| Semantic type information | [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) exposes symbols, types, and diagnostics; [ts-morph](https://ts-morph.com/) wraps the API | Use semantic resolution, not regex matching of type names. An additional wrapper is optional, not required. |
| Boundary parsing | [Zod](https://zod.dev/api) supports schemas and branded types; [Effect Schema](https://effect.website/docs/v3/schema/introduction) models decoded values, encoded values, and requirements | Reuse a project's existing parser. Do not introduce a second schema authority. |
| Type regression checks | [tsd](https://github.com/tsdjs/tsd) checks declaration contracts; [Vitest](https://vitest.dev/guide/testing-types) delegates type tests to a compiler | Record and run existing checks; ordinary runtime tests do not substitute for them. |
| Ownership-sensitive state transitions | [Rust typestate](https://doc.rust-lang.org/embedded-book/static-guarantees/typestate-programming.html) changes state types and can consume the old value; [trybuild](https://docs.rs/trybuild/latest/trybuild/) tests forbidden API usage | Language adapters must preserve differences in guarantees. A TypeScript union is not Rust ownership. |
| Executable state machines | [XState TypeScript support](https://stately.ai/docs/typescript) types machine-related data and operations | Import explicit machine definitions if the project already has them; do not infer full transition enforcement from a state enum. |
| Runtime properties | [fast-check](https://fast-check.dev/docs/introduction/) generates inputs and shrinks counterexamples | Useful for parser and transition invariants left to runtime. Generated cases are not a proof. |

[Alexis King's parsing principle](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) concerns preserving information established by validation in stronger returned values. It does not mean eliminating runtime input checks.

[Zod's JSON Schema documentation](https://zod.dev/json-schema) identifies representations that cannot be exported faithfully, including transforms and custom schemas. Therefore a graph or JSON Schema export must not be treated as a lossless replacement for the source type/parser system.

The TypeScript Compiler API documentation currently warns that its examples target 6.0 and earlier and that 7.1 will use a different API. Support and test explicit compiler versions; report unsupported versions instead of silently falling back to syntactic guesses.

## Research on type-guided AI coding

| Work | Evidence | Limit for this decision |
| --- | --- | --- |
| [Statically Contextualizing Large Language Models with Typed Holes, OOPSLA 2024](https://arxiv.org/abs/2409.00921) | Uses type and binding context through language-server integration; evaluates Hazel and a TypeScript port of MVUBench. Type definitions are particularly useful context. | Supports a type-context prototype, not a claim that Dotdog already reduces tokens or improves coding success. ChatLSP is a proposed extension, not assumed standard support. |
| [Type-Constrained Code Generation with Language Models, PLDI 2025](https://arxiv.org/abs/2504.09246) and its [implementation](https://github.com/eth-sri/type-constrained-code-generation) | Uses an incremental completion engine to constrain generation; evaluates TypeScript versions of HumanEval and MBPP. | Models a TypeScript subset, not the full compiler. Its reported evaluation also accepts already-compiling unconstrained samples and otherwise uses constrained resampling. A normal compiler feedback loop is not this decoding algorithm. |
| [TypePilot, 2025](https://arxiv.org/html/2510.11151v1) | Studies Scala code generation with a separate vulnerability-analysis and type-focused revision stage. Reports improvements on input and injection tasks. | Small examples and manual evaluations do not establish whole-repository effectiveness. Its Stainless experiments did not consistently produce compiling verification code. Figure 5 exposes a `ValidAge` case-class constructor; given [Scala's construction behavior](https://docs.scala-lang.org/tour/case-classes.html), the displayed smart constructor alone does not establish an unbypassable invariant. This is source analysis, not a local Scala execution. |
| [ChopChop, POPL 2026](https://arxiv.org/abs/2509.00360) | Studies semantic constrained decoding for type safety and equivalence to a reference program. | A research alternative, not evidence that Dotdog should own model inference or that ordinary type checking proves equivalence. |

Inference: type-aware context plus an ordinary compiler-feedback loop is the most practical initial experiment. Token-level constrained decoding is a separate research track and would require access to generation controls; it cannot be promised for an arbitrary hosted coding assistant.

## What the current Dotdog checkout provides

Inspected commit: `773dc265ecc30f1ec3cb417d1eb051719ea78ba9`. These are source observations, not verification of the latest published release.

- [`design/audit.ts`](https://github.com/specdog/dotdog/blob/773dc265ecc30f1ec3cb417d1eb051719ea78ba9/packages/dotdog/src/design/audit.ts) examines compiled entities for identifiers, lifecycle states, ownership, access patterns, sensitivity, and connectivity. It does not invoke an application type checker.
- [`map/repoMapper.ts`](https://github.com/specdog/dotdog/blob/773dc265ecc30f1ec3cb417d1eb051719ea78ba9/packages/dotdog/src/map/repoMapper.ts) uses file/path conventions and manifest facts. Its inspected implementation does not resolve TypeScript symbols or callable signatures.
- [`dag/schema.ts`](https://github.com/specdog/dotdog/blob/773dc265ecc30f1ec3cb417d1eb051719ea78ba9/packages/dotdog/src/dag/schema.ts) already has symbol, spec, test, and command nodes, plus `defines`, `implements`, `tests`, and `depends_on` edges. Reuse those before expanding the graph vocabulary.

The gap is semantic type context and evidence-backed links to domain rules, not another generic graph format.

## Local feasibility probes

These deliberately small probes test mechanics and limits. They are not a benchmark of coding agents, a security evaluation, or an integration test of Dotdog.

### TypeScript 6.0.3

Used the installed compiler API with `strict`, `noEmit`, no ambient type packages, `skipLibCheck`, and ES2022. Each case was compiled separately using a draft/paid/shipped union and a `ship(Paid, string): Shipped` function.

| Probe | Compiler result | Meaning |
| --- | --- | --- |
| Paid to shipped | Accepted | Valid typed usage works |
| Draft passed to shipping | Rejected, TS2322 | Input-state mismatch detected |
| Shipped value missing tracking | Rejected, TS2741 | State-specific required field enforced |
| Exhaustiveness check missing shipped branch | Rejected, TS2322 | Explicit `never` check detects omission |
| Two plain string ID aliases mixed | Accepted | Different alias names do not make nominal types |
| Two distinctly branded string IDs mixed | Rejected, TS2322 | Brands distinguish these statically typed values |
| Empty object asserted as paid | Accepted | Assertion bypass remains possible |
| Same paid value shipped twice | Accepted | This representation does not enforce consumption |
| Empty tracking string | Accepted | `string` does not encode nonempty data |

### Rust 1.96.0, edition 2024

Used `rustc --emit=metadata` on four separate programs. A non-`Copy`, non-`Clone` paid-state value exposed `ship(self)`.

| Probe | Compiler result |
| --- | --- |
| Paid value shipped | Accepted |
| Shipping method called on draft | Rejected, E0599 |
| Same paid value consumed twice | Rejected, E0382 |
| Two independently constructed paid values shipped | Accepted |

Ownership prevents reuse of this value, not duplicate business records or repeated external side effects. Idempotency, transactions, and authoritative state checks remain runtime concerns.

### Semantic context extraction

A three-file TypeScript probe imported `dispatch` through a re-export of `ship`. The compiler resolved it to `domain.ts:3`, recovered `(order: Paid, tracking: string): Shipped`, and identified parameter and return types. All source files type-checked. This verifies a narrow extraction path, not complete support for generics, overloads, project references, or monorepos.

Machine-readable results are in [type-driven-design-evidence.json](type-driven-design-evidence.json).

## Proposed first product slice

1. **Design before implementation.** Capture domain values, invalid combinations, allowed transitions, expected failures, and boundary assumptions. Let the user revise types as understanding changes; do not freeze a generated interface as the design.
2. **Read actual type context.** For a selected operation, resolve its symbol, input/output types, relevant variant definitions, and source locations using the project's supported compiler configuration. Keep raw type declarations in the language, not copied into a competing DSL.
3. **Connect explicit intent.** Link reviewed domain-rule IDs to actual symbols and checks. File references or matching names alone are not proof of enforcement. Record inferred links as inferred.
4. **Collect separate evidence.** Run configured type checks, expected compile failures, and runtime tests. Include compiler/configuration version, source revision, diagnostics, and check status. Missing dependencies, unsupported syntax, and skipped checks must remain unverified.
5. **Deliver bounded agent context.** Supply the selected operation, necessary reachable types, constraints, and unresolved questions. Avoid dumping the entire type graph into every prompt. Generated context is an export, not a new authority.

No new command names are committed by this proposal. Keep type-design output visibly separate from the current data-model completeness audit. Do not claim that a clean audit proves domain correctness.

## Evaluation before expanding scope

- Compare the same tasks with three conditions: ordinary repository context, spec/graph context, and spec/graph plus semantic type context. Hold model, task, budget, and checks constant; retain failures and use repeated trials where generation varies.
- Include wrong IDs/units, omitted variants, wrong-state operations, malformed external inputs, duplicate transitions, and a requirement change introducing a new state.
- Measure behavioral test success, intended compile-failure diagnostics, false positives, unresolved cases, repair iterations, actual prompt tokens, and wall-clock time. Do not optimize token count alone.
- Introduce deliberate weakening mutations: replace a branded ID with `string`, make a required field optional, widen a state union, or remove an exhaustiveness guard. The relevant verification should fail for the intended reason.
- Check valid use before negative use. An unrelated import error must not count as proof that a prohibited transition is rejected.
- Exercise imported aliases, re-exports, generics, overloads, project references, configuration changes, and unsupported compiler versions before describing the adapter as repository-wide.
- Review whether the types encode the correct rule. A compiler can faithfully enforce the wrong design.

## Add-on versus separate tool

Current recommendation: a separable adapter inside Dotdog, paired with a type-first workflow. Promote it to a standalone tool only if independent users get value from type-context extraction or contract verification without adopting `.dog` or `.dag`, and measured results justify the extra installation and maintenance surface.

Open questions: which language users need first; whether authoring assistance or existing-code analysis saves more work; acceptable configuration burden; and whether the selected real tasks improve with type context. This research does not settle those product questions.
