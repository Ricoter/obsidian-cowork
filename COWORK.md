# Cowork changelog & policy notes

## v0.1.0 — Initial fork (2026-04-24)

Forked from [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) at v3.2.7.

### Features added

- **Claude subscription OAuth** (`claudeOAuthEnabled` + `claudeOAuthToken` settings)
  - `src/LLMProviders/claudeOAuthFetch.ts`: custom fetch wrapper that rewrites headers and prepends the Claude Code identity string
  - `src/settings/v2/components/ClaudeOAuthSection.tsx`: UI
  - Wired in `src/LLMProviders/chatModelManager.ts` (Anthropic provider branch)
- **Mobile-safe encryption** (`enc_idb_` prefix)
  - `src/utils/mobileEncryption.ts`: IndexedDB + non-extractable AES-GCM key + random IV
  - `src/encryptionService.ts`: routes mobile writes through the new module; preserves read-compat with upstream's `enc_web_` and `enc_` prefixes
- **Brevilabs disabled by default** (`disableBrevilabs: true`)
  - `src/LLMProviders/brevilabsClient.ts`: `makeRequest`, `makeFormDataRequest`, and `validateLicenseKey` all short-circuit when the setting is on. Zero network traffic to `api.brevilabs.com`.

### Renamed

- Plugin id `copilot` → `cowork`
- Plugin name `Copilot` → `Cowork`

## Policy / ToS notes for Claude OAuth

Anthropic's docs (as of April 2026) state OAuth tokens from Pro/Max subscriptions are intended for Claude Code and Claude.ai only, and that using them in "any other product, tool, or service" violates the Consumer Terms of Service.

However, Anthropic engineers have publicly clarified on X that **personal use and local experimentation are fine**:

> "personal use and local experimentation are fine. If you're building a business on the Agent SDK, use an API key." — Thariq Shihipar (Anthropic, Claude Code team)

> "Nothing changes around how customers have been using their account and Anthropic will not be canceling accounts." — Anthropic PR statement

This fork is intended for single-user personal use only. Do **not** redistribute it as a hosted service, sell it, or use it with commercial API traffic.

Anthropic enforces an undocumented rule that OAuth tokens only work when `system[0]` begins with `"You are Claude Code, Anthropic's official CLI for Claude."` The fetch wrapper handles this automatically: your custom system prompt is demoted to `system[1]`. This can subtly reduce instruction-following for heavy prompt-engineering — usually irrelevant for chat but worth knowing.

## Upstream sync strategy

This fork tries to stay close to upstream. All changes are scoped to:

- `manifest.json`, `package.json`, `versions.json`
- `src/settings/model.ts` (3 new fields)
- `src/constants.ts` (3 new defaults)
- `src/encryptionService.ts` (rewrite, keeps read-compat)
- `src/LLMProviders/chatModelManager.ts` (Anthropic provider branch only)
- `src/LLMProviders/brevilabsClient.ts` (short-circuit guards)
- `src/settings/v2/components/ApiKeyDialog.tsx` (one import + one element)
- New files: `src/LLMProviders/claudeOAuthFetch.ts`, `src/utils/mobileEncryption.ts`, `src/settings/v2/components/ClaudeOAuthSection.tsx`

When rebasing on upstream, conflicts are most likely in `chatModelManager.ts`, `encryptionService.ts`, and `brevilabsClient.ts`. Keep the Cowork changes, merge other upstream modifications in.

## License

AGPL-3.0 (inherited from upstream). All modifications remain AGPL-3.0.
