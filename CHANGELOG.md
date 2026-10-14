# Changelog

All notable changes to SocialOrc. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Entries are grouped by date because the project has no tagged releases yet (`package.json` is still
`0.1.0`); once releases are cut, use semantic version headings.

## 2026-10-15

### Added

- Workspace tenancy is enforced on every API route and page. Each request resolves the caller's
  workspace and re-reads their role. Invitations join the inviter's workspace.
- Brand Brain knowledge: add text or a public https URL as a source. Relevant excerpts are injected
  into create, AI Studio and cascade prompts. Embeddings use your own AI key (`AI_EMBED_MODEL`,
  default `text-embedding-3-small`); without a key, sources are searched by keyword and labelled so.
- Inbox shows comments and replies on your 5 newest published posts per account, with read and
  replied state. Direct messages and mentions are not included yet.
- Facebook and Instagram: pick which Page or Instagram account to connect when a login manages
  several. Page tokens do not expire.
- Instagram: Reels, and carousels of up to 10 JPEGs.
- X (Twitter): images (up to 4), or one video or GIF. Video is capped at 32 MB. Accounts connected
  before this release must reconnect to attach media.
- LinkedIn: single MP4 video posts.
- YouTube: video uploads stream in chunks.
- TikTok: publishing follows the post until TikTok reports it complete, without re-uploading.
- Telegram: connecting requires posting a one-time code in the chat (group admin required).

### Changed

- Telegram accounts are identified by bot and chat. Existing accounts were migrated; re-verify them
  through the new connect flow.
- Mock AI output is labelled in Create, AI Studio and cascade, and saved drafts from mock output are
  flagged.
- Approval: any member with approval permission can approve any post in the workspace. Previously only
  the author could.
- `TELEGRAM_CHAT_ID` is only a suggestion in the connect form. It is never used as a fallback
  destination.

### Fixed

- Publish-now on Telegram sends the chat id; it previously failed every time.
- Retry and reschedule clear pending-publish state.
- Edits made while a media upload is in flight can no longer publish stale media.
- The publishing worker re-checks a post's scheduled time when it claims the job.
- An account must be on the same platform as the post it publishes.
- If a send succeeds but its record cannot be written, the post is closed as "outcome unknown" so it is
  not silently re-sent.
- Deleting a post cannot race the publishing worker.
- Malformed dates and request bodies return 400 instead of failing deeper in the stack.
- Facebook photo posts are recorded under the post id.
- Four route bugs found by the new route contract tests.

### Security

- OAuth state cookies are signed (`OAUTH_STATE_SECRET`, falling back to `NEXTAUTH_SECRET`) and bound to
  their purpose and workspace.
- Brand Brain URL fetching refuses private and internal addresses and limits redirects, time and size.
- The AI base URL is pinned when a credential is saved, and redirects are refused.
- Publishing adapters download media only from this deployment's own Blob store.
- Upload tokens require a workspace.
- Provider error text is no longer returned to clients.

### Removed

- Mock-only intelligence features: competitor analysis, trend agent, localization, network discovery,
  global map, campaign readiness, cultural intelligence and experiments. None had a real data source.

### Database

- `20261014120000_enforce_workspace_tenancy`: adds `workspaceId` to brain and invitation records and
  backfills workspaces. Columns stay nullable for now. Back up the database and check the user list
  before running it (see `docs/STATE-REPORT-2026-10-15.md` §5).
- `20261014130000_pending_publish_and_telegram_replies`
- `20261015120000_inbox_item_state`
- `20261015130000_telegram_chat_accounts`
- `20261015140000_in_flight_content_fingerprint`

### Testing and CI

- 748 unit tests, route contract tests (168), workspace isolation (50), publish (28), engagement (15),
  inbox (24) and brand knowledge (19) end-to-end checks, and 26 durability checks on Postgres.
- CI workflow with a SQLite job (typecheck, lint, unit, end-to-end) and a Postgres job (migrations and
  durability). The workflow has not yet run on GitHub.
