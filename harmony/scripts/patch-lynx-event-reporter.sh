#!/bin/bash
# Patch @lynx/lynx LynxEventReporter to guard against undefined native module.
# The SDK's static singleton initializer crashes when liblynx.so isn't ready.
# This adds a null-check so the app doesn't crash (event reporting degrades gracefully).

set -e

HARMONY_DIR="${1:-.}"

# Prune build dirs and match only .ets: once the project has been built,
# entry/build/ holds transpiled copies (LynxEventReporter.ts / .protoBin) of this
# very file, and a bare `find ... | head -1` picks the *cached copy* over the SDK
# source in oh_modules — patching a build artifact that the next compile discards.
# CI never hit this (clean checkout has no build dir); local rebuilds always do.
TARGET=$(find "$HARMONY_DIR" \
  \( -type d \( -name build -o -name .hvigor -o -name .preview \) -prune \) -o \
  \( -type f -path "*/@lynx/lynx/*/tasm/eventreport/LynxEventReporter.ets" -print \) \
  2>/dev/null | head -1)

if [ -z "$TARGET" ]; then
  echo "⚠️  LynxEventReporter not found in oh_modules — skipping patch"
  exit 0
fi

UNPATCHED='lynx.EventReporter.registerJSMethods'
PATCHED='lynx?.EventReporter?.registerJSMethods'

# Idempotent: `ohpm install` restores the pristine SDK and this script replays the
# patch, but re-running it without a fresh install must not fail.
if grep -qF "$PATCHED" "$TARGET"; then
  echo "✅ LynxEventReporter already patched — nothing to do"
  exit 0
fi

# Neither form present means the SDK moved the call — patching silently does
# nothing and the app crashes at runtime instead. Fail loudly here.
if ! grep -qF "$UNPATCHED" "$TARGET"; then
  echo "❌ Neither patched nor unpatched form found in:" >&2
  echo "   $TARGET" >&2
  echo "   The Lynx SDK changed shape — this patch needs revisiting." >&2
  exit 1
fi

echo "Patching: $TARGET"

# Replace the unsafe constructor body with a guarded version.
# Original:  lynx.EventReporter.registerJSMethods(this, ...)
# Patched:   lynx?.EventReporter?.registerJSMethods(this, ...)
#
# perl, not `sed -i`: BSD sed (macOS) requires an argument to -i and dies with
# "extra characters at the end of h command" on the GNU form, so `sed -i 's/../'`
# only ever ran on CI's GNU sed — locally it failed and left the SDK unpatched.
perl -pi -e 's/\Qlynx.EventReporter.registerJSMethods\E/lynx?.EventReporter?.registerJSMethods/g' "$TARGET"

# The sed version printed "successfully" even when the substitution matched
# nothing. Verify the file actually changed.
if ! grep -qF "$PATCHED" "$TARGET"; then
  echo "❌ Patch did not apply to $TARGET" >&2
  exit 1
fi

echo "✅ LynxEventReporter patched successfully"
