# Cowork — Privacy-focused Obsidian Copilot fork

**Personal, unsupported fork** of [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) (AGPL-3.0). Not affiliated with the upstream author or Brevilabs.

Built for one person's use-case. If it's useful to you too, great. No issues, no support, no guarantees.

## What this fork changes

1. **Claude subscription OAuth** — use a `sk-ant-oat01-…` token from `claude setup-token` so Anthropic chats bill against a Claude Pro/Max subscription instead of needing a separate API key. See [COWORK.md](./COWORK.md) for the ToS-grey caveat.
2. **Mobile-safe encryption** — API keys stored in `data.json` are now encrypted with a per-install random AES-256 key stored non-extractable in IndexedDB (mobile) or OS keyring (desktop). Upstream stored keys on mobile with a hardcoded "key" that's readable from the plugin source.
3. **Brevilabs disabled by default** — no network traffic to `api.brevilabs.com`. Plus features and license validation are short-circuited without making any HTTP request. Toggle in settings if you do have a Plus license.

Everything else is identical to upstream Copilot v3.2.7.

## Install via BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian.
2. Add beta plugin: `Ricoter/obsidian-cowork`
3. Enable "Cowork" in your plugin list.

Works on desktop and mobile (iOS / Android).

## Use Claude subscription OAuth

On desktop:

```bash
claude setup-token
```

Follow the browser flow, copy the `sk-ant-oat01-…` token. In Obsidian → Cowork settings → API Keys → Claude subscription OAuth, toggle on and paste the token. It's valid for one year.

Your Anthropic chats now consume your Pro/Max Extra Usage credit instead of requiring a separate Console API key.

## Security notes

- **Desktop:** your keys are stored in Electron's `safeStorage`, which is backed by the OS keyring (macOS Keychain / Windows DPAPI / Linux libsecret). Strong.
- **Mobile:** your keys are encrypted with a random AES-256 key inside Obsidian's IndexedDB sandbox (per-app on iOS / Android, not included in iCloud or Google vault backups). Decent — much better than upstream, but not a substitute for a hardware security module. If the device is rooted or Obsidian itself is compromised, the key is readable.
- If you reinstall the plugin on mobile or wipe Obsidian's app data, you'll need to re-enter your API keys (IndexedDB is cleared).

## Upstream credit

This fork is derivative work of [Copilot for Obsidian](https://github.com/logancyang/obsidian-copilot) by Logan Yang, licensed under [AGPL-3.0](./LICENSE). All credit for the plugin itself goes upstream. Cowork adds ~300 lines of patches; everything else is upstream Copilot v3.2.7.

The AGPL means this fork must stay open-source under the same license. Modifications are welcome — fork the fork, or send suggestions, but understand that this repo is not actively accepting community contributions.

## Copyright

- Upstream Copilot: Copyright © Logan Yang (logancyang)
- Cowork patches: Copyright © 2026 Ricoter

Both released under AGPL-3.0 (see [LICENSE](./LICENSE)).
