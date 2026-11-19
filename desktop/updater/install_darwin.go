package main

import (
	"debug/macho"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func waitForApplication(parent int, app string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		alive := syscall.Kill(parent, 0) == nil
		output, err := exec.Command("/bin/ps", "-axo", "pid=,comm=").Output()
		if err != nil {
			return err
		}
		for _, line := range strings.Split(string(output), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			pid, _ := strconv.Atoi(fields[0])
			if pid == os.Getpid() {
				continue
			}
			path := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), fields[0]))
			if strings.HasPrefix(path, app+string(filepath.Separator)) {
				alive = true
			}
		}
		if !alive {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return errors.New("application processes did not exit")
}
func openUpdateAsset(path string) (*os.File, error) { return os.Open(path) }

func install(asset, app string, signed manifest) error {
	if !strings.HasSuffix(app, ".app") {
		return errors.New("invalid app path")
	}
	stage, err := os.MkdirTemp(filepath.Dir(app), ".songloft-update-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	next, err := extractApp(asset, stage)
	if err != nil {
		return err
	}
	if err := verifyApplication(next); err != nil {
		return err
	}
	if err := verifyDarwinCandidate(next, signed); err != nil {
		return err
	}
	previous := previousAppPath(app)
	if _, err := os.Lstat(previous); err == nil {
		return errors.New("previous application retained; resolve recovery before next update")
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(app, previous); err != nil {
		return err
	}
	if err := os.Rename(next, app); err != nil {
		if restore := os.Rename(previous, app); restore != nil {
			return fmt.Errorf("install failed: %v; restore failed: %w", err, restore)
		}
		return err
	}
	return nil
}

func verifyDarwinCandidate(app string, signed manifest) error {
	if err := verifyApplicationMetadata(filepath.Join(app, "Contents", "Resources", "songloft"), signed); err != nil {
		return err
	}
	contents := filepath.Join(app, "Contents")
	output, err := exec.Command("/usr/libexec/PlistBuddy", "-c", "Print CFBundleExecutable", filepath.Join(contents, "Info.plist")).Output()
	if err != nil {
		return fmt.Errorf("cannot read packaged executable name: %w", err)
	}
	executable := strings.TrimSpace(string(output))
	if executable == "" || filepath.Base(executable) != executable || executable == "." || executable == ".." {
		return errors.New("invalid packaged executable name")
	}
	path := filepath.Join(contents, "MacOS", executable)
	want := macho.CpuAmd64
	if signed.Arch == "arm64" {
		want = macho.CpuArm64
	}
	fat, err := macho.OpenFat(path)
	if err == nil {
		defer fat.Close()
		for _, arch := range fat.Arches {
			if arch.File.Cpu == want && arch.File.Type == macho.TypeExec {
				return nil
			}
		}
	} else if errors.Is(err, macho.ErrNotFat) {
		thin, err := macho.Open(path)
		if err != nil {
			return fmt.Errorf("cannot open packaged executable: %w", err)
		}
		defer thin.Close()
		if thin.Cpu == want && thin.Type == macho.TypeExec {
			return nil
		}
	} else {
		return fmt.Errorf("cannot inspect packaged executable architecture: %w", err)
	}
	return errors.New("packaged executable has the wrong architecture")
}

func verifyApplication(path string) error {
	if output, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", path).CombinedOutput(); err != nil {
		return fmt.Errorf("signature rejected: %w: %s", err, output)
	}
	return nil
}
func restartCommand(app, channel string) *exec.Cmd {
	args := []string{"-a", app}
	// Pass the path explicitly so Launch Services preserves non-ASCII characters.
	if root := os.Getenv("SONGLOFT_DESKTOP_DATA_ROOT"); channel == "dev" && filepath.IsAbs(root) {
		args = append(args, "--env", "SONGLOFT_DESKTOP_DATA_ROOT="+root)
	}
	return exec.Command("/usr/bin/open", args...)
}

func restart(app, channel string) error { return restartCommand(app, channel).Run() }
