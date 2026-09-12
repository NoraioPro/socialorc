# Verifying OrcBrain without a working `npm install`

`worktrees/integration` had a stalled dependency install (network), which blocks
`npm run test:unit`, `tsc` and `prisma migrate`. The brain core is deliberately
pure — no DB, no network, no clock — so it can still be verified against the real
source files. This is the recipe, and it is worth keeping for the next time the
installer is the bottleneck.

```bash
SCRATCH="$LOCALAPPDATA/Temp/orcbrain-verify"; SRC=C:/Users/ENG_H/SocialOrc/worktrees/integration
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH/brain" "$SCRATCH/tests"
cp "$SRC"/src/lib/brain/*.ts "$SCRATCH/brain/"
cp "$SRC"/tests/unit/brain-core.test.ts "$SRC"/tests/unit/brain-chat.test.ts "$SCRATCH/tests/"
cd "$SCRATCH"
# Node ESM needs explicit extensions. Only the specifiers change; the code text
# under test is byte-identical to the repository's.
sed -i -E 's|from "(\.[^"]*)"|from "\1.ts"|g; s|\.ts\.ts|.ts|g' brain/*.ts tests/*.ts
sed -i 's|../../src/lib/brain/|../brain/|g; s|\.ts\.ts|.ts|g' tests/*.ts
node --test tests/brain-core.test.ts tests/brain-chat.test.ts
```

`node --test` on Node 22.23 runs the TypeScript directly (type stripping). Two
constraints that cost time to discover:

- **Strip-only mode rejects TypeScript parameter properties.** Writing
  `constructor(message: string, readonly cause?: unknown)` fails with
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Declare the field and assign it in the
  body instead — clearer anyway, and it keeps modules runnable by plain tooling.
- **`node --test <directory>` did not pick up the files**; pass the file paths.

## What this recipe cannot verify

Anything that needs the Prisma client or the Next runtime: the migration SQL, the
API routes and the UI. Those need the install, and their status is tracked in the
report rather than assumed. Stating which half of a change is verified is part of
the deliverable — a green unit run is not a green migration.

## Traps found while writing this slice

- **Node decodes invalid base64 leniently.** A corrupted `embedding` column would
  silently become a garbage vector and inject noise into every retrieval. The
  codec now rejects non-canonical base64 and round-trip-verifies, so a bad value
  reads as "not embedded".
- **Node pools `Buffer` allocations**, so `buffer.buffer` is usually not 4-byte
  aligned and a `Float32Array` view over it throws. Copy into a fresh
  `ArrayBuffer` before viewing.
- **`sed -E 's|from "(\./[^"]*)"|...|'` must not exclude specifiers ending in
  `s`** — an early version silently skipped `./agents` and `./types`.
