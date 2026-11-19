package main

import (
	"crypto/sha256"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestVerifiedWindowsAssetRemainsExecutableAndLocked(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(executable)
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	path := filepath.Join(directory, windowsExecutable)
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err := verifyApplication(directory); err != nil {
		t.Fatalf("unsigned x64 application rejected: %v", err)
	}
	var signed manifest
	signed.Asset.Size = int64(len(data))
	signed.Asset.SHA256 = fmt.Sprintf("%x", sha256.Sum256(data))
	file, err := openVerifiedAsset(path, signed)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = file.Close() })

	if writer, err := os.OpenFile(path, os.O_WRONLY, 0); err == nil {
		_ = writer.Close()
		t.Fatal("verified asset can still be opened for writing")
	}
	moved := filepath.Join(directory, "moved.exe")
	if err := os.Rename(path, moved); err == nil {
		t.Fatal("verified asset can still be renamed")
	}
	if output, err := exec.Command(path, "-test.run=^$").CombinedOutput(); err != nil {
		t.Fatalf("verified asset could not run while locked: %v: %s", err, output)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(path, moved); err != nil {
		t.Fatalf("verified asset could not be moved after close: %v", err)
	}
}
