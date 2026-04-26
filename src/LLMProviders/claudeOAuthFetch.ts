/**
 * Claude subscription OAuth fetch wrapper.
 *
 * Transforms outbound requests to api.anthropic.com so they authenticate with a
 * Claude Code OAuth token (`sk-ant-oat01-…`, obtained via `claude setup-token`)
 * instead of a regular API key:
 *
 * 1. Drops the `x-api-key` header LangChain's ChatAnthropic always sets
 * 2. Adds `Authorization: Bearer <token>` plus the `anthropic-beta` flags
 *    Anthropic's backend requires for OAuth tokens
 * 3. Prepends the Claude Code system-prompt identity string as `system[0]`
 *    (Anthropic silently 400s non-Haiku requests without it); the caller's
 *    original system prompt becomes `system[1]`
 *
 * This is invoked by the Anthropic provider in chatModelManager.ts when
 * settings.claudeOAuthEnabled is true.
 *
 * Anthropic employees have publicly stated personal use of subscription OAuth
 * is fine (Thariq Shihipar, Anthropic Claude Code team, March 2026). See
 * COWORK.md for the ToS-grey caveat.
 */

import { getDecryptedKey } from "@/encryptionService";
import { logError } from "@/logger";
import { getSettings } from "@/settings/model";

const CLAUDE_CODE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";

const OAUTH_HEADERS = {
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
} as const;

type SystemEntry = { type: "text"; text: string; [key: string]: unknown } | string;

/**
 * Rewrite the request body to prepend the Claude Code identity string as the
 * first system entry. Accepts both the array-of-blocks and string forms.
 */
function injectClaudeCodeSystem(bodyText: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return bodyText;
  }

  const identityBlock: SystemEntry = { type: "text", text: CLAUDE_CODE_SYSTEM_PROMPT };
  const existingSystem = parsed.system;

  if (Array.isArray(existingSystem)) {
    parsed.system = [identityBlock, ...existingSystem];
  } else if (typeof existingSystem === "string" && existingSystem.length > 0) {
    parsed.system = [identityBlock, { type: "text", text: existingSystem } satisfies SystemEntry];
  } else {
    parsed.system = [identityBlock];
  }

  return JSON.stringify(parsed);
}

/**
 * Build a fetch wrapper bound to the current OAuth token. Returns a function
 * that has the standard `fetch` signature so it can be passed as
 * `clientOptions.fetch` to LangChain's ChatAnthropic.
 *
 * @param innerFetch Optional underlying fetch (e.g. obsidian's `safeFetch` for
 * CORS bypass). Falls back to the global fetch.
 */
export function createClaudeOAuthFetch(
  innerFetch?: typeof fetch
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async function claudeOAuthFetch(input, init) {
    const token = await getDecryptedKey(getSettings().claudeOAuthToken);
    if (!token) {
      throw new Error(
        "Claude OAuth enabled but no token set. Run `claude setup-token` on desktop."
      );
    }

    const headers = new Headers(init?.headers);
    headers.delete("x-api-key");
    // The browser-access opt-in is an enterprise feature; including it on
    // consumer OAuth requests triggers a CORS-policy 401. Strip it.
    headers.delete("anthropic-dangerous-direct-browser-access");
    headers.set("Authorization", `Bearer ${token}`);
    for (const [k, v] of Object.entries(OAUTH_HEADERS)) {
      headers.set(k, v);
    }

    let body = init?.body;
    if (typeof body === "string") {
      try {
        body = injectClaudeCodeSystem(body);
      } catch (err) {
        logError("claudeOAuthFetch: failed to inject system prompt", err);
      }
    }

    const nextInit: RequestInit = { ...init, headers, body };
    const doFetch = innerFetch ?? fetch;
    return doFetch(input, nextInit);
  };
}
