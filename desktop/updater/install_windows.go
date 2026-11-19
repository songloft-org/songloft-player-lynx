package main

import (
	"debug/pe"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var kernel = syscall.NewLazyDLL("kernel32.dll")
var openProcess = kernel.NewProc("OpenProcess")
var queryImage = kernel.NewProc("QueryFullProcessImageNameW")
var closeHandle = kernel.NewProc("CloseHandle")
var snapshotProcess = kernel.NewProc("CreateToolhelp32Snapshot")
var processFirst = kernel.NewProc("Process32FirstW")
var processNext = kernel.NewProc("Process32NextW")
var waitObject = kernel.NewProc("WaitForSingleObject")

type processEntry struct {
	Size, Usage, PID        uint32
	Heap                    uintptr
	Module, Threads, Parent uint32
	Priority                int32
	Flags                   uint32
	Name                    [260]uint16
}

func applicationAlive(app string) (bool, error) {
	snapshot, _, err := snapshotProcess.Call(2, 0)
	if snapshot == ^uintptr(0) {
		return false, err
	}
	defer closeHandle.Call(snapshot)
	entry := processEntry{}
	entry.Size = uint32(unsafe.Sizeof(entry))
	ok, _, _ := processFirst.Call(snapshot, uintptr(unsafe.Pointer(&entry)))
	for ok != 0 {
		if entry.PID != uint32(os.Getpid()) {
			handle, _, _ := openProcess.Call(0x1000, 0, uintptr(entry.PID))
			if handle != 0 {
				buffer := make([]uint16, 32768)
				size := uint32(len(buffer))
				success, _, _ := queryImage.Call(handle, 0, uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(&size)))
				closeHandle.Call(handle)
				if success != 0 && strings.HasPrefix(strings.ToLower(syscall.UTF16ToString(buffer[:size])), strings.ToLower(filepath.Clean(app))+`\`) {
					return true, nil
				}
			}
		}
		ok, _, _ = processNext.Call(snapshot, uintptr(unsafe.Pointer(&entry)))
	}
	return false, nil
}
func waitForApplication(parent int, app string, timeout time.Duration) error {
	handle, _, err := openProcess.Call(0x100000, 0, uintptr(parent))
	if handle == 0 && err != syscall.Errno(87) {
		return err
	}
	if handle != 0 {
		defer closeHandle.Call(handle)
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		alive := false
		if handle != 0 {
			state, _, _ := waitObject.Call(handle, 0)
			alive = state != 0
		}
		others, err := applicationAlive(app)
		if err != nil {
			return err
		}
		if !alive && !others {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return errors.New("application processes did not exit")
}

// Keep the authenticated NSIS bytes readable by CreateProcess while denying
// writes and rename/delete through other handles until installation completes.
func openUpdateAsset(path string) (*os.File, error) {
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	handle, err := syscall.CreateFile(name, syscall.GENERIC_READ, syscall.FILE_SHARE_READ, nil, syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, &os.PathError{Op: "open", Path: path, Err: err}
	}
	return os.NewFile(uintptr(handle), path), nil
}

func install(asset, app string, signed manifest) error {
	if strings.ContainsAny(app, "\"\r\n") {
		return errors.New("invalid installation path")
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
	command := exec.Command(asset)
	// NSIS requires /D last and unquoted even when its path contains spaces.
	// CreateProcess receives this directly; no command shell interprets it.
	command.SysProcAttr = &syscall.SysProcAttr{CmdLine: syscall.EscapeArg(asset) + " /S /D=" + filepath.Clean(app)}
	err := command.Run()
	if err == nil {
		err = verifyWindowsCandidate(app, signed)
	}
	if err != nil {
		if move := os.Rename(app, failedAppPath(app)); move != nil && !os.IsNotExist(move) {
			return errors.Join(err, move)
		}
		return errors.Join(err, os.Rename(previous, app))
	}
	return nil
}

func verifyWindowsCandidate(app string, signed manifest) error {
	if err := verifyApplicationMetadata(filepath.Join(app, "resources", "songloft"), signed); err != nil {
		return err
	}
	return verifyApplication(app)
}

func verifyApplication(app string) error {
	path := filepath.Join(app, windowsExecutable)
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("packaged executable is not a regular file")
	}
	executable, err := pe.Open(path)
	if err != nil {
		return fmt.Errorf("cannot inspect installed executable: %w", err)
	}
	defer executable.Close()
	if executable.Machine != pe.IMAGE_FILE_MACHINE_AMD64 {
		return errors.New("packaged executable has the wrong architecture")
	}
	if executable.Characteristics&pe.IMAGE_FILE_EXECUTABLE_IMAGE == 0 ||
		executable.Characteristics&pe.IMAGE_FILE_DLL != 0 {
		return errors.New("packaged file is not a Windows executable")
	}
	return nil
}

func restart(app, _ string) error { return exec.Command(filepath.Join(app, windowsExecutable)).Start() }
