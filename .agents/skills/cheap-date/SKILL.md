---
name: cheap-date
description: Keep Replit agent credits as low as possible. Activate whenever the user mentions cost, credits, spend, "cheap date", burning money, expensive agent, or reducing Replit costs. Also activate proactively at the START of any non-trivial task by default — research first, batch everything, pick the cheapest mode that gets the job done.
---

# Cheap Date — Credit Minimization Protocol

Every action in Replit Agent costs compute. This skill encodes how to do more for less. Apply it before starting any task, not after.

## How Replit Agent Billing Actually Works (as of mid-2026)

- **Effort-based pricing**: A checkpoint costs less than $0.25 for simple changes, more for complex ones — but it's ONE charge per task, not per file edited.
- **Plan Mode**: ~$1.50 per planning session. The most expensive mode per response. Avoid it for exploration.
- **Fast Mode**: Free (or near-free). Best for single targeted edits — one file, one change, precise. Use it for anything small.
- **Agent Modes**: Lite → Economy → Power. Power costs the most. Use Lite/Economy unless the task genuinely needs Power.
- **Canvas edits**: $0.50+ per small visual tweak. Never use Canvas for minor text/style changes — do them in code directly.
- **The biggest cost driver**: Back-and-forth. Each clarification round, each "let me check" loop, each re-plan = another charge. Front-load all thinking.

## The Cheap Date Pre-Task Checklist

Before writing a single line of code or making any tool call on a new task:

### 1. Research Before Acting
- Ask: "Has someone already solved this exact problem?" — search web/forums/docs first.
- Check if a Replit-native feature covers it (integrations, built-in DB, existing workflows).
- If the answer exists in a library or config change, use that — don't hand-code it.
- For EAS/mobile builds: always check memory for existing patterns before starting. EAS builds must be project tasks (see memory).

### 2. Plan Outside Replit for Complex Features
- Use Claude.ai, ChatGPT, or Gemini (free tiers) for architecture questions, brainstorming, and codebase exploration questions.
- Paste relevant file contents there, think it through, then come to Replit with a concrete plan.
- One Replit Plan Mode session (~$1.50) = 10–15 free ChatGPT messages. Reserve Plan Mode for final validation only.

### 3. Batch Everything Into One Request
- Never make one small edit, ask "does this look right?", make another small edit. That's 3x the cost of doing it all at once.
- Group all related changes: if 5 files need updating for a feature, touch all 5 in one agent turn.
- If the user lists multiple things they want changed, do ALL of them in the same turn.

### 4. Pick the Right Mode
| Task type | Mode |
|---|---|
| Fix a typo, rename a variable, swap a color | **Fast Mode** (free) |
| Small bug fix, add one prop, tweak a style | **Lite/Economy** |
| New feature, multi-file refactor | **Economy** |
| Complex architecture, full feature from scratch | **Power** only if needed |
| Planning/exploration | Outside Replit (Claude.ai/ChatGPT) |

### 5. Read Only What's Needed
- Use `grep`/`find` to locate the exact file and line range before reading. Don't read whole files when you need 20 lines.
- Use explore subagents for broad "where is X" questions — they don't burn your main context.
- Parallel reads > sequential reads — batch independent file reads into one tool call.

### 6. Set a Spending Limit
- If the user hasn't set one: remind them to go to **Replit Account → Billing → Set monthly budget/limit**.
- Daily limits prevent runaway overnight costs from loops.

## During a Task

- **Stop before getting stuck in loops.** If something isn't working after 2 attempts, surface the blocker to the user rather than burning credits trying variations.
- **Prefer config/library fixes over hand-coding.** Installing a package that solves the problem costs one npm install, not 200 lines of custom code.
- **Don't re-read files you already have in context.** Check your own previous messages first.
- **Verify with `tsc --noEmit` or a targeted test**, not by building the full app every time.

## For This Project (Middlemain)

- **EAS builds**: Always use a project task — never attempt from main agent (git lock issue). Zero exceptions.
- **TypeScript checks**: Run `pnpm --filter @workspace/middlemain exec tsc --noEmit` — fast, free, catches 90% of issues before any build.
- **Dry Run tab**: Use the debug tab's Dry Run button before any EAS submission. Saves an entire build credit on every bad push.
- **Memory Machine changes**: Whiz/Vhiz drop changesets → I apply in one batch → one EAS build. Not: apply → build → fix → build again.
- **Parallel tool calls**: Always batch independent reads and edits. Never serialize what can run at the same time.

## What NOT to Do

- ❌ Don't open Plan Mode to explore the codebase — use grep/find/explore subagent
- ❌ Don't make the same edit in multiple turns — batch it
- ❌ Don't build the full app to check a TypeScript change — run tsc
- ❌ Don't ask the user to test things you can verify yourself with curl or tsc
- ❌ Don't read 15 files when grep could narrow it to 2
- ❌ Don't try 5 different approaches to a bug in sequence — surface it after 2

## Quick-Reference: Cheapest Path to Common Tasks

| Goal | Cheap path |
|---|---|
| Fix a bug | grep for the error → read 1-2 files → fix → tsc check |
| Add a UI feature | Read only the target component → edit in one pass |
| New screen/tab | Check existing similar screen → copy pattern → adapt |
| Debug a crash | Read logs → grep for the error string → targeted fix |
| Update dependencies | Check package.json → one `pnpm add` command |
| EAS APK build | Project task → `EAS_SKIP_AUTO_FINGERPRINT=1` |
| Plan a complex feature | ChatGPT/Claude.ai first → paste plan → one Replit pass |
