//go:build !darwin && !windows

package main

import (
	"errors"
	"os"
	"time"
)

func waitForApplication(int, string, time.Duration) error {
	return errors.New("unsupported desktop platform")
}
func install(string, string, manifest) error        { return errors.New("unsupported desktop platform") }
func openUpdateAsset(path string) (*os.File, error) { return os.Open(path) }
func verifyApplication(string) error                { return errors.New("unsupported desktop platform") }
func restart(string, string) error                  { return errors.New("unsupported desktop platform") }
