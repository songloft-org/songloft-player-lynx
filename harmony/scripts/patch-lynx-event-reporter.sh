#!/bin/bash
# Patch @lynx/lynx LynxEventReporter to guard against undefined native module.
# The SDK's static singleton initializer crashes when liblynx.so isn't ready.
# This adds a null-check so the app doesn't crash (event reporting degrades gracefully).

set -e

HARMONY_DIR="${1:-.}"
TARGET=$(find "$HARMONY_DIR" -path "*/@lynx/lynx/*/tasm/eventreport/LynxEventReporter*" -type f 2>/dev/null | head -1)

if [ -z "$TARGET" ]; then
  echo "⚠️  LynxEventReporter not found in oh_modules — skipping patch"
  exit 0
fi

echo "Patching: $TARGET"

# Replace the unsafe constructor body with a guarded version.
# Original:  lynx.EventReporter.registerJSMethods(this, ...)
# Patched:   lynx?.EventReporter?.registerJSMethods(this, ...)
sed -i 's/lynx\.EventReporter\.registerJSMethods/lynx?.EventReporter?.registerJSMethods/g' "$TARGET"

echo "✅ LynxEventReporter patched successfully"
