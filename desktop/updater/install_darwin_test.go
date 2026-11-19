package main

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestRestartRetainsOnlyExplicitDevelopmentRoot(t *testing.T) {
	app := "/Applications/Songloft Dev.app"
	root := "/tmp/隔离 Profile=GUI"
	t.Setenv("SONGLOFT_DESKTOP_DATA_ROOT", root)
	base := []string{"/usr/bin/open", "-a", app}
	if got := restartCommand(app, "dev").Args; !slices.Equal(got, append(base, "--env", "SONGLOFT_DESKTOP_DATA_ROOT="+root)) {
		t.Fatalf("development restart lost its data root: %q", got)
	}
	if got := restartCommand(app, "stable").Args; !slices.Equal(got, base) {
		t.Fatalf("stable restart forwarded a development override: %q", got)
	}
	t.Setenv("SONGLOFT_DESKTOP_DATA_ROOT", "")
	if got := restartCommand(app, "dev").Args; !slices.Equal(got, base) {
		t.Fatalf("default development restart changed its data directory: %q", got)
	}
}

func TestSignedAppArchive(t *testing.T) {
	archive := os.Getenv("SONGLOFT_TEST_SIGNED_APP_ZIP")
	if archive == "" {
		t.Skip("set SONGLOFT_TEST_SIGNED_APP_ZIP to a locally signed fixture ZIP")
	}
	app, err := extractApp(archive, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := verifyApplication(app); err != nil {
		t.Fatalf("signature after extraction: %v", err)
	}
	info := filepath.Join(app, "Contents", "Info.plist")
	if err := os.WriteFile(info, []byte("tampered Info.plist"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := verifyApplication(app); err == nil {
		t.Fatal("app with a modified signature seal was accepted")
	}
}
