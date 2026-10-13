---
name: Untrusted repository preflight
description: Why repository source checks must stay separate from project execution and native-build certification.
---

Do not turn the public repository preflight into a project runner or let uploaded tsconfig inheritance/plugins select filesystem paths or executable code.

**Why:** A legitimate TypeScript project resolver can follow absolute imports and reference paths into the server; plugins and package hooks can execute arbitrary code. A check requested before spending build credits is not consent to execute a private repository on the publisher's infrastructure.

**How to apply:** Keep source as data, restrict compiler reads, bound and terminate computation, and describe omitted dependencies/configuration/native checks as unverified rather than calling the result a build pass.

Worker verification must cover both the source loader and the actual API bundle.

**Why:** Development loaders may inject function-naming helpers into serialized function bodies; a worker can pass plain-transpiler tests but fail under the real loader/bundle.

**How to apply:** Verify through the running API after a build, not just through a copied unit-test module.
