/**
 * [Cowork fork] Claude subscription OAuth settings section.
 *
 * User flow:
 * 1. On desktop, run `claude setup-token` in a terminal to get a 1-year
 *    `sk-ant-oat01-…` token.
 * 2. Toggle the OAuth option on and paste the token.
 * 3. Anthropic chat models now bill against the Claude Pro/Max subscription
 *    instead of requiring a separate API key (via claudeOAuthFetch.ts
 *    intercepting headers + system prompt).
 */

import { PasswordInput } from "@/components/ui/password-input";
import { SettingSwitch } from "@/components/ui/setting-switch";
import { updateSetting, useSettingsValue } from "@/settings/model";
import React from "react";

export function ClaudeOAuthSection() {
  const settings = useSettingsValue();

  return (
    <div className="tw-rounded-md tw-border tw-border-border tw-p-3">
      <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between tw-gap-2">
        <div>
          <div className="tw-font-medium">Claude subscription OAuth</div>
          <div className="tw-text-xs tw-text-muted">
            Use your Claude Pro/Max plan instead of an API key. Generate a token with{" "}
            <code>claude setup-token</code> on desktop.
          </div>
        </div>
        <SettingSwitch
          checked={settings.claudeOAuthEnabled}
          onCheckedChange={(v) => updateSetting("claudeOAuthEnabled", v)}
        />
      </div>

      {settings.claudeOAuthEnabled && (
        <div className="tw-mt-2 tw-flex tw-flex-col tw-gap-1">
          <label className="tw-text-xs tw-text-muted">OAuth token (sk-ant-oat01-…)</label>
          <PasswordInput
            className="tw-max-w-full"
            value={settings.claudeOAuthToken}
            onChange={(v) => updateSetting("claudeOAuthToken", v)}
            placeholder="sk-ant-oat01-..."
          />
          <div className="tw-mt-1 tw-text-[10px] tw-text-muted">
            Caveat: ToS-grey area. Anthropic engineers have stated personal use is fine; see
            COWORK.md.
          </div>
        </div>
      )}
    </div>
  );
}
