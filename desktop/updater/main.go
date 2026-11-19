package main

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Public-only release configuration is embedded by the desktop resource build.
var publicKeyPEM, publicKeyBase64 string
var windowsExecutable = "Songloft.exe"

type manifest struct {
	Schema      int    `json:"schema"`
	Version     string `json:"version"`
	Channel     string `json:"channel"`
	OS          string `json:"os"`
	Arch        string `json:"arch"`
	ClientSHA   string `json:"clientSha"`
	BackendSHA  string `json:"backendSha"`
	PublishedAt string `json:"publishedAt"`
	Asset       struct {
		URL    string `json:"url"`
		Size   int64  `json:"size"`
		SHA256 string `json:"sha256"`
		Kind   string `json:"kind"`
	} `json:"asset"`
}
type envelope struct {
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
}

var sha40 = regexp.MustCompile(`^[a-f0-9]{40}$`)
var sha64 = regexp.MustCompile(`^[a-f0-9]{64}$`)
var versionPattern = regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$`)

func verifyEnvelope(raw []byte, keyPEM, channel, current string, currentIdentity ...string) (manifest, error) {
	var result manifest
	if len(raw) > 256*1024 {
		return result, errors.New("manifest too large")
	}
	var signed envelope
	if err := json.Unmarshal(raw, &signed); err != nil {
		return result, err
	}
	payload, err := base64.StdEncoding.DecodeString(signed.Payload)
	if err != nil {
		return result, err
	}
	signature, err := base64.StdEncoding.DecodeString(signed.Signature)
	if err != nil {
		return result, err
	}
	block, _ := pem.Decode([]byte(keyPEM))
	if block == nil {
		return result, errors.New("missing public key")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return result, err
	}
	key, ok := parsed.(ed25519.PublicKey)
	if !ok || !ed25519.Verify(key, payload, signature) {
		return result, errors.New("invalid signature")
	}
	if err := json.Unmarshal(payload, &result); err != nil {
		return result, err
	}
	published, err := time.Parse(time.RFC3339, result.PublishedAt)
	updated := newerVersion(result.Version, current)
	if !updated && channel == "dev" && !newerVersion(current, result.Version) &&
		len(currentIdentity) == 2 && sha40.MatchString(currentIdentity[0]) && currentIdentity[0] != result.ClientSHA {
		built, parseErr := time.Parse(time.RFC3339, currentIdentity[1])
		updated = updated || parseErr == nil && published.After(built)
	}
	if result.Schema != 1 || result.Channel != channel || (channel != "stable" && channel != "dev") ||
		result.OS != nodePlatform() || result.Arch != nodeArch() || !sha40.MatchString(result.ClientSHA) || !sha40.MatchString(result.BackendSHA) ||
		err != nil || published.After(time.Now().Add(5*time.Minute)) || !validVersion(result.Version) || !validVersion(current) || !updated {
		return result, errors.New("invalid update target")
	}
	kind := "nsis"
	if runtime.GOOS == "darwin" {
		kind = "app-zip"
	}
	if result.Asset.Kind != kind || result.Asset.Size < 1 || result.Asset.Size > 8<<30 || !sha64.MatchString(result.Asset.SHA256) || !strings.HasPrefix(result.Asset.URL, "https://") {
		return result, errors.New("invalid update asset")
	}
	return result, nil
}

func nodePlatform() string {
	if runtime.GOOS == "windows" {
		return "win32"
	}
	return runtime.GOOS
}

func nodeArch() string {
	if runtime.GOARCH == "amd64" {
		return "x64"
	}
	return runtime.GOARCH
}
func validVersion(value string) bool {
	parts := versionPattern.FindStringSubmatch(value)
	if parts == nil {
		return false
	}
	for i := 1; i <= 3; i++ {
		number, err := strconv.ParseUint(parts[i], 10, 64)
		if err != nil || number > 9007199254740991 {
			return false
		}
	}
	if parts[4] != "" {
		for _, id := range strings.Split(parts[4], ".") {
			if id == "" || numericIdentifier(id) && len(id) > 1 && id[0] == '0' {
				return false
			}
		}
	}
	if _, metadata, ok := strings.Cut(value, "+"); ok {
		for _, id := range strings.Split(metadata, ".") {
			if id == "" {
				return false
			}
		}
	}
	return true
}
func numericIdentifier(value string) bool {
	for _, c := range value {
		if c < '0' || c > '9' {
			return false
		}
	}
	return value != ""
}
func newerVersion(next, current string) bool {
	if !validVersion(next) || !validVersion(current) {
		return false
	}
	a, b := versionPattern.FindStringSubmatch(next), versionPattern.FindStringSubmatch(current)
	if a == nil || b == nil {
		return false
	}
	for i := 1; i <= 3; i++ {
		x, ex := strconv.ParseUint(a[i], 10, 64)
		y, ey := strconv.ParseUint(b[i], 10, 64)
		if ex != nil || ey != nil {
			return false
		}
		if x != y {
			return x > y
		}
	}
	if a[4] == b[4] {
		return false
	}
	if a[4] == "" {
		return true
	}
	if b[4] == "" {
		return false
	}
	x, y := strings.Split(a[4], "."), strings.Split(b[4], ".")
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] == y[i] {
			continue
		}
		xn, yn := numericIdentifier(x[i]), numericIdentifier(y[i])
		if xn && yn {
			if len(x[i]) != len(y[i]) {
				return len(x[i]) > len(y[i])
			}
			return x[i] > y[i]
		}
		if xn {
			return false
		}
		if yn {
			return true
		}
		return x[i] > y[i]
	}
	return len(x) > len(y)
}
func openVerifiedAsset(path string, signed manifest) (*os.File, error) {
	file, err := openUpdateAsset(path)
	if err != nil {
		return nil, err
	}
	if err := verifyAssetFile(file, signed); err != nil {
		_ = file.Close()
		return nil, err
	}
	return file, nil
}

func verifyAssetFile(file *os.File, signed manifest) error {
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != signed.Asset.Size {
		return errors.New("asset size mismatch")
	}
	hash := sha256.New()
	size, err := io.Copy(hash, io.LimitReader(file, signed.Asset.Size+1))
	if err != nil {
		return err
	}
	if size != signed.Asset.Size || hex.EncodeToString(hash.Sum(nil)) != signed.Asset.SHA256 {
		return errors.New("asset digest mismatch")
	}
	return nil
}
func beneath(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
func extractApp(archive, destination string) (string, error) {
	// macOS /tmp and /var commonly alias /private paths. Use one canonical
	// staging root before comparing resolved framework links against it.
	var err error
	destination, err = filepath.EvalSymlinks(destination)
	if err != nil {
		return "", err
	}
	destination, err = filepath.Abs(destination)
	if err != nil {
		return "", err
	}
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	if len(reader.File) > 250000 {
		return "", errors.New("archive has too many entries")
	}
	var total uint64
	roots := map[string]bool{}
	var links []*zip.File
	for _, file := range reader.File {
		if strings.Contains(file.Name, "\\") || strings.ContainsRune(file.Name, 0) || strings.HasPrefix(file.Name, "/") {
			return "", errors.New("invalid archive path")
		}
		path := filepath.Join(destination, filepath.FromSlash(file.Name))
		if !beneath(destination, path) {
			return "", errors.New("archive path escapes destination")
		}
		parts := strings.Split(file.Name, "/")
		total += file.UncompressedSize64
		if total > 16<<30 {
			return "", errors.New("archive expands beyond limit")
		}
		// ditto encodes resource forks/xattrs as AppleDouble sidecars. They
		// are metadata, not app files; materializing them breaks sealed resources.
		metadata := parts[0] == "__MACOSX"
		for _, part := range parts {
			metadata = metadata || strings.HasPrefix(part, "._")
		}
		if metadata {
			continue
		}
		if len(parts) == 0 || !strings.HasSuffix(parts[0], ".app") {
			return "", errors.New("archive must contain one app")
		}
		roots[parts[0]] = true
		if len(roots) != 1 {
			return "", errors.New("archive contains multiple apps")
		}
		if file.Mode()&os.ModeSymlink != 0 {
			links = append(links, file)
			continue
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(path, 0755); err != nil {
				return "", err
			}
			continue
		}
		if !file.Mode().IsRegular() {
			return "", errors.New("unsupported archive entry")
		}
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return "", err
		}
		input, err := file.Open()
		if err != nil {
			return "", err
		}
		output, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, file.Mode().Perm()&0755)
		if err != nil {
			input.Close()
			return "", err
		}
		_, copyErr := io.Copy(output, input)
		closeErr := output.Close()
		input.Close()
		if copyErr != nil {
			return "", copyErr
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	// Create symlinks only after every regular file. No write may follow an
	// archive-controlled link outside the staging directory.
	for _, file := range links {
		input, err := file.Open()
		if err != nil {
			return "", err
		}
		data, err := io.ReadAll(io.LimitReader(input, 8193))
		input.Close()
		if err != nil {
			return "", err
		}
		path := filepath.Join(destination, filepath.FromSlash(file.Name))
		target := string(data)
		if len(data) > 8192 || filepath.IsAbs(target) || !beneath(destination, filepath.Join(filepath.Dir(path), target)) {
			return "", errors.New("unsafe archive link")
		}
		for parent := filepath.Dir(path); parent != destination; parent = filepath.Dir(parent) {
			info, err := os.Lstat(parent)
			if err == nil && info.Mode()&os.ModeSymlink != 0 {
				return "", errors.New("archive link has symlink parent")
			}
			if err != nil && !os.IsNotExist(err) {
				return "", err
			}
		}
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return "", err
		}
		if err := os.Symlink(target, path); err != nil {
			return "", err
		}
	}
	for _, file := range links {
		path, err := filepath.EvalSymlinks(filepath.Join(destination, filepath.FromSlash(file.Name)))
		if err != nil {
			return "", fmt.Errorf("archive link %s does not resolve: %w", file.Name, err)
		}
		if !beneath(destination, path) {
			return "", errors.New("archive link resolves outside app")
		}
	}
	for root := range roots {
		return filepath.Join(destination, root), nil
	}
	return "", errors.New("empty archive")
}

const installFailureMarker = "last-install-failure"

func reportUpdateFailure(stateDirectory string, failure error) {
	log.Print(failure)
	if err := writeAtomic(filepath.Join(stateDirectory, installFailureMarker), []byte("1\n"), 0600); err != nil {
		log.Printf("could not persist installer failure notification: %v", err)
	}
}

// The installer has not launched the candidate, so the database still belongs
// to the previous app. Only relaunch if its platform checks and identity match.
func restartAfterInstallFailure(app string, signed manifest, version, clientSHA string) error {
	if _, err := os.Lstat(previousAppPath(app)); err == nil {
		return errors.New("previous application has not been restored to its launch path")
	} else if !os.IsNotExist(err) {
		return err
	}
	if _, err := verifyInstalledApplication(app, signed, version, clientSHA); err != nil {
		return err
	}
	return restart(app, signed.Channel)
}

func main() {
	manifestPath := flag.String("manifest", "", "signed manifest")
	asset := flag.String("asset", "", "downloaded asset")
	app := flag.String("app", "", "installed application")
	parent := flag.Int("parent", 0, "parent process")
	channel := flag.String("channel", "", "update channel")
	version := flag.String("version", "", "installed version")
	clientSHA := flag.String("client-sha", "", "installed client source")
	builtAt := flag.String("built-at", "", "installed build time")
	backup := flag.String("backup", "", "database backup metadata")
	rollback := flag.Bool("rollback", false, "restore previous application and matching database backup")
	flag.Parse()
	if !filepath.IsAbs(*manifestPath) || !filepath.IsAbs(*asset) || !filepath.IsAbs(*app) || *parent <= 0 {
		log.Fatal("invalid helper arguments")
	}
	stateDirectory := filepath.Dir(*manifestPath)
	logFile, err := os.OpenFile(filepath.Join(stateDirectory, "install.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		log.Fatal(err)
	}
	defer logFile.Close()
	log.SetOutput(logFile)
	fail := func(err error) {
		reportUpdateFailure(stateDirectory, err)
		os.Exit(1)
	}
	// The host may run from the installation directory. On Windows an inherited
	// working directory would prevent renaming that directory after it exits.
	if err := os.Chdir(stateDirectory); err != nil {
		fail(err)
	}
	raw, err := os.ReadFile(*manifestPath)
	if err != nil {
		fail(err)
	}
	if publicKeyBase64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(publicKeyBase64)
		if err != nil {
			fail(err)
		}
		publicKeyPEM = string(decoded)
	}
	signed, err := verifyEnvelope(raw, publicKeyPEM, *channel, *version, *clientSHA, *builtAt)
	if err != nil {
		fail(err)
	}
	if err := waitForApplication(*parent, *app, 90*time.Second); err != nil {
		fail(err)
	}
	failBeforeCandidateLaunch := func(failure error) {
		reportUpdateFailure(stateDirectory, failure)
		if err := restartAfterInstallFailure(*app, signed, *version, *clientSHA); err != nil {
			log.Printf("could not relaunch verified previous application: %v", err)
		}
		os.Exit(1)
	}
	assetFile, err := openVerifiedAsset(*asset, signed)
	if err != nil {
		if *rollback {
			fail(err)
		}
		failBeforeCandidateLaunch(err)
	}
	if *rollback {
		_ = assetFile.Close()
		if *backup == "" {
			fail(errors.New("database backup is required for recovery"))
		}
		if err := recoverApplication(*app, *backup, signed, *version, *clientSHA); err != nil {
			fail(err)
		}
		pending := filepath.Join(stateDirectory, "pending-startup.json")
		if err := os.Rename(pending, filepath.Join(stateDirectory, "last-recovery.json")); err != nil {
			fail(err)
		}
		if err := restart(*app, *channel); err != nil {
			fail(err)
		}
		log.Print("matching application and database restored; failed files retained")
		return
	}
	if *backup != "" {
		if _, err := verifyBackupForApplication(*app, *backup, signed, *version, *clientSHA); err != nil {
			failBeforeCandidateLaunch(err)
		}
	}
	digest := sha256.Sum256(raw)
	immutable := "installed-manifest-" + hex.EncodeToString(digest[:]) + ".json"
	immutablePath := filepath.Join(stateDirectory, immutable)
	if previous, err := os.ReadFile(immutablePath); err == nil {
		if !bytes.Equal(previous, raw) {
			failBeforeCandidateLaunch(errors.New("installed manifest digest collision"))
		}
	} else if !os.IsNotExist(err) {
		failBeforeCandidateLaunch(err)
	} else if err := writeAtomic(immutablePath, raw, 0600); err != nil {
		failBeforeCandidateLaunch(err)
	}
	installErr := install(*asset, *app, signed)
	_ = assetFile.Close()
	if installErr != nil {
		failBeforeCandidateLaunch(installErr)
	}
	record := map[string]any{"version": signed.Version, "clientSha": signed.ClientSHA, "backendSha": signed.BackendSHA, "backup": *backup, "installedAt": time.Now().UTC(), "manifest": immutable, "asset": filepath.Base(*asset), "previousVersion": *version, "previousClientSha": *clientSHA, "previousBuiltAt": *builtAt, "previousApp": previousAppPath(*app)}
	state, err := json.Marshal(record)
	if err != nil {
		fail(err)
	}
	if err := writeAtomic(filepath.Join(stateDirectory, "pending-startup.json"), state, 0600); err != nil {
		if rollbackErr := recoverApplication(*app, "", signed, *version, *clientSHA); rollbackErr != nil {
			fail(errors.Join(fmt.Errorf("persist startup record: %w", err), fmt.Errorf("restore previous application: %w", rollbackErr)))
		}
		failBeforeCandidateLaunch(fmt.Errorf("startup record could not be persisted; previous application restored: %w", err))
	}
	if err := os.Remove(filepath.Join(stateDirectory, installFailureMarker)); err != nil && !os.IsNotExist(err) {
		log.Printf("could not clear installer failure notification: %v", err)
	}
	if err := restart(*app, *channel); err != nil {
		fail(fmt.Errorf("installed; restart failed: %w", err))
	}
	log.Print("installation completed; previous application and database backup retained")
}
