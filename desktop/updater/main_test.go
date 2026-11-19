package main

import (
	"archive/zip"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestSignedManifestAndAsset(t *testing.T) {
	pub, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		t.Fatal(err)
	}
	key := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
	asset := []byte("signed installer fixture")
	digest := sha256.Sum256(asset)
	platform := runtime.GOOS
	if platform == "windows" {
		// The release signer takes the OS and architecture from win32-x64.
		platform = "win32"
	}
	value := manifest{Schema: 1, Version: "1.2.1", Channel: "dev", OS: platform, Arch: nodeArch(), ClientSHA: strings.Repeat("a", 40), BackendSHA: strings.Repeat("b", 40), PublishedAt: time.Now().UTC().Format(time.RFC3339)}
	value.Asset.Size = int64(len(asset))
	value.Asset.URL = "https://example.invalid/asset"
	value.Asset.SHA256 = hex.EncodeToString(digest[:])
	value.Asset.Kind = "nsis"
	if runtime.GOOS == "darwin" {
		value.Asset.Kind = "app-zip"
	}
	sign := func(value manifest) []byte {
		payload, _ := json.Marshal(value)
		raw, _ := json.Marshal(envelope{Payload: base64.StdEncoding.EncodeToString(payload), Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(private, payload))})
		return raw
	}
	verified, err := verifyEnvelope(sign(value), key, "dev", "1.2.0")
	if err != nil {
		t.Fatal(err)
	}
	currentIdentity := []string{strings.Repeat("c", 40), time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)}
	if _, err := verifyEnvelope(sign(value), key, "dev", "1.2.1", currentIdentity...); err != nil {
		t.Fatalf("same-version dev update rejected: %v", err)
	}
	if _, err := verifyEnvelope(sign(value), key, "dev", "1.3.0", currentIdentity...); err == nil {
		t.Fatal("newer publication time allowed a version downgrade")
	}
	path := filepath.Join(t.TempDir(), "asset")
	if err := os.WriteFile(path, asset, 0600); err != nil {
		t.Fatal(err)
	}
	file, err := openVerifiedAsset(path, verified)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	if file, err := openVerifiedAsset(path, verified); err == nil {
		_ = file.Close()
		t.Fatal("corrupt asset accepted")
	}
	if runtime.GOOS == "windows" {
		wrongPlatform := value
		wrongPlatform.OS = "windows"
		if _, err := verifyEnvelope(sign(wrongPlatform), key, "dev", "1.2.0"); err == nil {
			t.Fatal("Go platform name accepted in the published manifest")
		}
	}
	value.Arch = "wrong"
	if _, err := verifyEnvelope(sign(value), key, "dev", "1.2.0"); err == nil {
		t.Fatal("wrong architecture accepted")
	}
	if _, err := verifyEnvelope(sign(value), key, "stable", "1.2.0"); err == nil {
		t.Fatal("wrong channel accepted")
	}
	raw := sign(value)
	raw[len(raw)-8] ^= 1
	if _, err := verifyEnvelope(raw, key, "dev", "1.2.0"); err == nil {
		t.Fatal("corrupt signature accepted")
	}
}
func TestVersionOrdering(t *testing.T) {
	for _, pair := range [][2]string{{"1.3.0", "1.2.99"}, {"1.2.0", "1.2.0-dev.10"}, {"1.2.0-dev.11", "1.2.0-dev.9"}} {
		if !newerVersion(pair[0], pair[1]) {
			t.Fatal(pair)
		}
	}
	for _, pair := range [][2]string{{"1.2.0", "1.2.0"}, {"1.2.0+new", "1.2.0+old"}, {"1.2.0-dev", "1.2.0"}, {"1.1.99", "1.2.0"}, {"v1.2.1", "1.2.0"}} {
		if newerVersion(pair[0], pair[1]) {
			t.Fatal(pair)
		}
	}
}
func TestArchiveRejectsTraversalAndSymlinkParents(t *testing.T) {
	for _, path := range []string{"../outside", "/outside", "Songloft.app/../../outside", `Songloft.app\outside`} {
		root := t.TempDir()
		archive := filepath.Join(root, "asset.zip")
		file, _ := os.Create(archive)
		writer := zip.NewWriter(file)
		entry, _ := writer.Create(path)
		entry.Write([]byte("bad"))
		writer.Close()
		file.Close()
		if _, err := extractApp(archive, filepath.Join(root, "stage")); err == nil {
			t.Fatalf("accepted %s", path)
		}
	}
}
