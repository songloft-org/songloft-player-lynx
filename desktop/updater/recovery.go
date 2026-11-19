package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"time"
)

func previousAppPath(app string) string {
	if runtime.GOOS == "darwin" {
		return strings.TrimSuffix(app, ".app") + ".previous.app"
	}
	return app + ".previous"
}
func failedAppPath(app string) string {
	suffix := ".failed-" + time.Now().UTC().Format("20060102T150405.000000000")
	if runtime.GOOS == "darwin" {
		return strings.TrimSuffix(app, ".app") + suffix + ".app"
	}
	return app + suffix
}

// writeAtomic publishes a synced record through a same-directory rename. The
// temporary file shares the destination directory, so publication is atomic
// on each supported installer filesystem.
func writeAtomic(path string, data []byte, mode os.FileMode) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".songloft-update-*.tmp")
	if err != nil {
		return err
	}
	temporary := file.Name()
	closed := false
	defer func() {
		if !closed {
			_ = file.Close()
		}
		_ = os.Remove(temporary)
	}()
	if err := file.Chmod(mode); err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		closed = true
		return err
	}
	closed = true
	if err := os.Rename(temporary, path); err != nil {
		return err
	}
	if directory, err := os.Open(filepath.Dir(path)); err == nil {
		_ = directory.Sync()
		_ = directory.Close()
	}
	return nil
}

type databaseBackup struct {
	Schema     int    `json:"schema"`
	Database   string `json:"database"`
	Version    string `json:"version"`
	BackendSHA string `json:"backendSha"`
	Files      []struct {
		Name   string `json:"name"`
		SHA256 string `json:"sha256"`
	} `json:"files"`
}

func readBackup(metadata string, packaged applicationMetadata) (databaseBackup, error) {
	var backup databaseBackup
	if !filepath.IsAbs(metadata) {
		return backup, errors.New("backup path must be absolute")
	}
	file, err := os.Open(metadata)
	if err != nil {
		return backup, err
	}
	defer file.Close()
	const maximum = 64 << 10
	raw, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return backup, err
	}
	if len(raw) > maximum || json.Unmarshal(raw, &backup) != nil ||
		backup.Schema != 1 || !filepath.IsAbs(backup.Database) || filepath.Base(backup.Database) != "songloft.db" ||
		len(backup.Files) < 1 || len(backup.Files) > 3 {
		return backup, errors.New("invalid database backup")
	}
	if backup.Version == "" || backup.BackendSHA == "" ||
		backup.Version != packaged.Version || backup.BackendSHA != packaged.BackendSHA {
		return backup, errors.New("database backup identity does not match previous application")
	}
	return backup, nil
}

func verifyInstalledApplication(app string, signed manifest, version, clientSHA string) (applicationMetadata, error) {
	if err := verifyApplication(app); err != nil {
		return applicationMetadata{}, err
	}
	resources := filepath.Join(app, "resources", "songloft")
	if signed.OS == "darwin" {
		resources = filepath.Join(app, "Contents", "Resources", "songloft")
	}
	packaged, err := readApplicationMetadata(resources)
	if err != nil {
		return packaged, err
	}
	if !packaged.matchesApplication(signed, version, clientSHA) {
		return packaged, errors.New("previous application identity does not match update record")
	}
	return packaged, nil
}

func verifyBackupForApplication(app, metadata string, signed manifest, version, clientSHA string) (databaseBackup, error) {
	packaged, err := verifyInstalledApplication(app, signed, version, clientSHA)
	if err != nil {
		return databaseBackup{}, err
	}
	return readBackup(metadata, packaged)
}

var databaseMembers = [...]string{"songloft.db", "songloft.db-wal", "songloft.db-shm"}

type databaseRestore struct {
	directory string
	stage     string
	failed    string
	files     map[string]bool
	migrated  []string
	restored  []string
}

// Check and sync every backup file before moving any installed files.
func prepareDatabaseRestore(metadata string, backup databaseBackup) (*databaseRestore, error) {
	restore := &databaseRestore{
		directory: filepath.Dir(backup.Database),
		files:     make(map[string]bool, len(backup.Files)),
	}
	stage, err := os.MkdirTemp(restore.directory, ".songloft-restore-")
	if err != nil {
		return nil, err
	}
	restore.stage = stage
	prepared := false
	defer func() {
		if !prepared {
			_ = os.RemoveAll(stage)
		}
	}()
	for _, file := range backup.Files {
		if !slices.Contains(databaseMembers[:], file.Name) {
			return nil, errors.New("invalid backup filename")
		}
		if restore.files[file.Name] {
			return nil, errors.New("duplicate backup file")
		}
		path := filepath.Join(filepath.Dir(metadata), file.Name)
		info, err := os.Lstat(path)
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			return nil, errors.New("backup file is not regular")
		}
		source, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		handle, err := os.OpenFile(filepath.Join(stage, file.Name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			source.Close()
			return nil, err
		}
		digest := sha256.New()
		_, copyErr := io.Copy(io.MultiWriter(handle, digest), source)
		err = errors.Join(copyErr, source.Close(), handle.Sync(), handle.Close())
		if err != nil {
			return nil, err
		}
		if hex.EncodeToString(digest.Sum(nil)) != file.SHA256 {
			return nil, errors.New("database backup checksum rejected")
		}
		restore.files[file.Name] = true
	}
	if !restore.files["songloft.db"] {
		return nil, errors.New("database missing from backup")
	}
	prepared = true
	return restore, nil
}

func (restore *databaseRestore) apply() error {
	failed, err := os.MkdirTemp(restore.directory, "migration-failed-")
	if err != nil {
		return err
	}
	restore.failed = failed
	for _, name := range databaseMembers {
		err := os.Rename(filepath.Join(restore.directory, name), filepath.Join(failed, name))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		restore.migrated = append(restore.migrated, name)
	}
	for _, name := range databaseMembers {
		if !restore.files[name] {
			continue
		}
		if err := os.Rename(filepath.Join(restore.stage, name), filepath.Join(restore.directory, name)); err != nil {
			return err
		}
		restore.restored = append(restore.restored, name)
	}
	return nil
}

func (restore *databaseRestore) undo() error {
	for _, name := range restore.restored {
		if err := os.Rename(filepath.Join(restore.directory, name), filepath.Join(restore.stage, name)); err != nil {
			return err
		}
	}
	var result error
	for _, name := range restore.migrated {
		result = errors.Join(result, os.Rename(filepath.Join(restore.failed, name), filepath.Join(restore.directory, name)))
	}
	if result == nil && restore.failed != "" {
		_ = os.Remove(restore.failed)
	}
	return result
}

func recoverApplication(app, metadata string, signed manifest, version, clientSHA string) error {
	previous := previousAppPath(app)
	var restore *databaseRestore
	if metadata == "" {
		if _, err := verifyInstalledApplication(previous, signed, version, clientSHA); err != nil {
			return err
		}
	} else {
		backup, err := verifyBackupForApplication(previous, metadata, signed, version, clientSHA)
		if err != nil {
			return err
		}
		restore, err = prepareDatabaseRestore(metadata, backup)
		if err != nil {
			return err
		}
		defer os.RemoveAll(restore.stage)
	}
	return activatePreviousApplication(app, previous, restore)
}

// Keep the launch path vacant while changing database files. If undo itself
// fails, preserve both applications outside that path and report their location.
func activatePreviousApplication(app, previous string, restore *databaseRestore) error {
	failed := failedAppPath(app)
	if err := os.Rename(app, failed); err != nil {
		return err
	}
	var err error
	if restore != nil {
		err = restore.apply()
	}
	if err == nil {
		err = os.Rename(previous, app)
	}
	if err == nil {
		return nil
	}
	if restore != nil {
		if undoErr := restore.undo(); undoErr != nil {
			return errors.Join(err, fmt.Errorf("cannot restore current database from %s; current application retained in %s: %w", restore.failed, failed, undoErr))
		}
	}
	return errors.Join(err, os.Rename(failed, app))
}
