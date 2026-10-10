#!/usr/bin/env bash

# Songloft Lynx 客户端版本发布入口；参数与 pnpm run release 一致。
# 示例：./scripts/bump-version.sh patch --dry-run

set -euo pipefail

RELEASE_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$RELEASE_SCRIPT_DIR/bump-version.mjs" "$@"
