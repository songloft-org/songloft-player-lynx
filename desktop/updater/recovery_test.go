package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeRecoveryFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}

func assertRecoveryFile(t *testing.T, path, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil || string(got) != want {
		t.Fatalf("%s: got %q, want %q, error %v", path, got, want, err)
	}
}

func recoveryBackup(t *testing.T, directory, version, backendSHA string) string {
	t.Helper()
	backup := t.TempDir()
	var files []map[string]string
	for _, name := range databaseMembers[:2] {
		content := "old " + name
		digest := sha256.Sum256([]byte(content))
		files = append(files, map[string]string{"name": name, "sha256": hex.EncodeToString(digest[:])})
		writeRecoveryFile(t, filepath.Join(backup, name), content)
	}
	raw, err := json.Marshal(map[string]any{
		"schema": 1, "database": filepath.Join(directory, "songloft.db"),
		"version": version, "backendSha": backendSHA, "files": files,
	})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(backup, "backup.json")
	writeRecoveryFile(t, path, string(raw))
	return path
}

func TestBackupRejectsWrongApplicationIdentity(t *testing.T) {
	directory := t.TempDir()
	packaged := applicationMetadata{Version: "2.13.12", BackendSHA: strings.Repeat("b", 40)}
	for _, test := range []struct {
		name    string
		version string
		backend string
	}{
		{"missing backend", packaged.Version, ""},
		{"missing version", "", packaged.BackendSHA},
		{"same version, different backend", packaged.Version, strings.Repeat("a", 40)},
		{"different version, same backend", "2.13.13", packaged.BackendSHA},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := recoveryBackup(t, directory, test.version, test.backend)
			if _, err := readBackup(path, packaged); err == nil || !strings.Contains(err.Error(), "backup identity") {
				t.Fatalf("expected backup identity rejection, got %v", err)
			}
		})
	}
}

func TestRecoveryKeepsApplicationAndDatabasePaired(t *testing.T) {
	for _, scenario := range []string{"corrupt backup", "partial database restore", "missing previous application", "success"} {
		t.Run(scenario, func(t *testing.T) {
			directory := t.TempDir()
			packaged := applicationMetadata{Version: "2.13.12", BackendSHA: strings.Repeat("b", 40)}
			metadata := recoveryBackup(t, directory, packaged.Version, packaged.BackendSHA)
			app := filepath.Join(directory, "Songloft.app")
			previous := previousAppPath(app)
			writeRecoveryFile(t, app, "current app")
			if scenario != "missing previous application" {
				writeRecoveryFile(t, previous, "previous app")
			}
			for _, name := range databaseMembers {
				writeRecoveryFile(t, filepath.Join(directory, name), "migrated "+name)
			}
			backup, err := readBackup(metadata, packaged)
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "corrupt backup" {
				writeRecoveryFile(t, filepath.Join(filepath.Dir(metadata), "songloft.db-wal"), "corrupt WAL")
			}
			restore, err := prepareDatabaseRestore(metadata, backup)
			if scenario == "corrupt backup" {
				if err == nil || !strings.Contains(err.Error(), "checksum") {
					t.Fatalf("expected backup checksum rejection, got %v", err)
				}
			} else {
				if err != nil {
					t.Fatal(err)
				}
				if scenario == "partial database restore" {
					// Simulate a staging file going missing after verification.
					if err := os.Remove(filepath.Join(restore.stage, "songloft.db-wal")); err != nil {
						t.Fatal(err)
					}
				}
				err = activatePreviousApplication(app, previous, restore)
				if (scenario == "success") != (err == nil) {
					t.Fatalf("unexpected activation result: %v", err)
				}
			}
			failures, err := filepath.Glob(filepath.Join(directory, "migration-failed-*"))
			if err != nil {
				t.Fatal(err)
			}
			if scenario != "success" {
				assertRecoveryFile(t, app, "current app")
				for _, name := range databaseMembers {
					assertRecoveryFile(t, filepath.Join(directory, name), "migrated "+name)
				}
				if len(failures) != 0 {
					t.Fatal(failures)
				}
				return
			}
			assertRecoveryFile(t, app, "previous app")
			for _, name := range databaseMembers[:2] {
				assertRecoveryFile(t, filepath.Join(directory, name), "old "+name)
			}
			if _, err := os.Stat(filepath.Join(directory, "songloft.db-shm")); !os.IsNotExist(err) {
				t.Fatalf("migrated SHM beside restored database: %v", err)
			}
			if len(failures) != 1 {
				t.Fatal(failures)
			}
			for _, name := range databaseMembers {
				assertRecoveryFile(t, filepath.Join(failures[0], name), "migrated "+name)
			}
		})
	}
}
