# Vendored: conn-manager memory layer

Source of truth: https://github.com/livhappierapps/conn-manager `src/memory/`
Vendored from commit `e5c2562e583890192083943cf384bf8dc23a3de3` (branch `feature/memory-context-injection`).

Do not edit these files here. Change them in conn-manager, then re-copy:

```sh
git -C ../conn-manager checkout <sha> && cp ../conn-manager/src/memory/*.ts artifacts/api-server/src/lib/memory/
```

Why vendored instead of a git dependency: middlemain-api's Render build runs
`pnpm install --frozen-lockfile` on every push to main, so it must not depend
on an unmerged branch of another repo. Once conn-manager main has a tag, this
can switch to `"@livhappierapps/conn-manager": "github:livhappierapps/conn-manager#<tag>"`.
