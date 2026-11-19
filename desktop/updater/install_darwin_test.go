package main

import (
	"os"
	"os/exec"
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
	if output, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", "--verbose=4", app).CombinedOutput(); err != nil {
		t.Fatalf("signature after extraction: %v: %s", err, output)
	}
}
