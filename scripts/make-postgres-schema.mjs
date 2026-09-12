#!/usr/bin/env node
/**
 * Derive `prisma/schema.postgres.prisma` from the canonical `prisma/schema.prisma`.
 *
 * The repo keeps ONE schema as the source of truth. Postgres needs a different
 * `provider`, and a hand-maintained second schema would drift the moment someone
 * adds a model to only one of them — so the variant is generated instead, and
 * this script refuses to write anything unless it found the sqlite provider to
 * replace.
 *
 * Run `npm run db:pg:schema` after every change to prisma/schema.prisma.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "prisma/schema.prisma";
const TARGET = "prisma/schema.postgres.prisma";

const source = readFileSync(SOURCE, "utf8");

// Only the datasource block's provider may differ.
const derived = source.replace(
  /(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*)"sqlite"/,
  '$1"postgresql"',
);

if (derived === source) {
  console.error(
    `[make-postgres-schema] no \`provider = "sqlite"\` found in ${SOURCE}. ` +
      `Refusing to write a postgres schema that would silently stay sqlite.`,
  );
  process.exit(1);
}

writeFileSync(TARGET, derived, "utf8");

// Prove the generated file differs ONLY in the provider line.
const before = source.split("\n");
const after = derived.split("\n");
const changed = before
  .map((line, i) => (line === after[i] ? null : i))
  .filter((i) => i !== null);

if (changed.length !== 1) {
  console.error(
    `[make-postgres-schema] expected exactly 1 changed line, got ${changed.length}. ` +
      `The datasource block spans more than the provider line — review ${TARGET}.`,
  );
  process.exit(1);
}

console.log(
  `[make-postgres-schema] wrote ${TARGET} (${after.length} lines, ` +
    `1 line differs from source: provider sqlite → postgresql)`,
);
