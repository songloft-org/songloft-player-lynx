#!/bin/bash
# E2E smoke test: adb-driven key flow validation
# Prerequisites: device connected, app installed, backend running on host port 58091
# Usage: ./scripts/e2e-smoke.sh
set -euo pipefail

PACKAGE="org.songloft.lynx"
ACTIVITY=".MainActivity"
SCREENSHOT_DIR="/tmp/songloft-e2e"
PASS=0
FAIL=0

mkdir -p "$SCREENSHOT_DIR"

log() { echo "[$(date +%H:%M:%S)] $*"; }
screenshot() { adb exec-out screencap -p > "$SCREENSHOT_DIR/$1.png" && log "  📸 $1.png"; }
tap() { adb shell input tap "$1" "$2" && sleep 0.5; }
swipe() { adb shell input swipe "$1" "$2" "$3" "$4" "$5"; sleep 0.5; }
wait_for() { sleep "${1:-2}"; }

check_screen() {
  local name="$1"
  screenshot "$name"
  # Check the screenshot is non-empty (app didn't crash to black)
  local size
  size=$(wc -c < "$SCREENSHOT_DIR/$name.png")
  if [ "$size" -gt 1000 ]; then
    log "  ✅ $name: screen captured (${size}B)"
    PASS=$((PASS + 1))
  else
    log "  ❌ $name: empty/tiny screenshot"
    FAIL=$((FAIL + 1))
  fi
}

# ── Setup ──
log "=== E2E Smoke Test ==="
log "Ensuring port forward..."
adb reverse tcp:58091 tcp:58091 2>/dev/null || true

log "Launching app..."
adb shell am force-stop "$PACKAGE" 2>/dev/null || true
sleep 1
adb shell am start -n "$PACKAGE/$ACTIVITY"
wait_for 3

# ── Test 1: Login page renders ──
log "Test 1: Login page"
check_screen "01-login"

# ── Test 2: Login with admin/admin ──
log "Test 2: Performing login..."
# Tap username field (center of screen, ~40% height)
tap 540 700
sleep 0.3
adb shell input text "admin"
# Tap password field
tap 540 850
sleep 0.3
adb shell input text "admin"
# Hide keyboard
adb shell input keyevent 66  # Enter/Done
sleep 0.5
# Tap login button (bottom area)
tap 540 1100
wait_for 3
check_screen "02-after-login"

# ── Test 3: Home page ──
log "Test 3: Home page content"
check_screen "03-home"

# ── Test 4: Navigate to Library ──
log "Test 4: Library tab"
# Bottom nav: library is typically second tab
tap 270 2300
wait_for 2
check_screen "04-library"

# ── Test 5: Navigate to Settings ──
log "Test 5: Settings tab"
# Bottom nav: settings is typically last tab
tap 810 2300
wait_for 1
check_screen "05-settings"

# ── Test 6: Back to Home and tap a playlist ──
log "Test 6: Home → playlist"
tap 135 2300  # Home tab
wait_for 2
# Scroll down to playlists section and tap first
swipe 540 1500 540 800 300
wait_for 1
check_screen "06-home-scrolled"

# ── Test 7: Open player (if a song was playing from previous test) ──
log "Test 7: Mini player / full player"
# Tap mini player bar if visible (bottom area above nav)
tap 540 2200
wait_for 1
check_screen "07-player"

# ── Summary ──
log ""
log "=== Results ==="
log "  Passed: $PASS"
log "  Failed: $FAIL"
log "  Screenshots: $SCREENSHOT_DIR/"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
