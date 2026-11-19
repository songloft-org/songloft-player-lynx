//go:build !darwin && !windows

package main

import (
	"errors"
	"time"
)

func waitForApplication(int, string, time.Duration) error {
	return errors.New("unsupported desktop platform")
}
func install(string, string, manifest) error { return errors.New("unsupported desktop platform") }
func verifyApplication(string, string) error { return errors.New("unsupported desktop platform") }
func restart(string, string) error           { return errors.New("unsupported desktop platform") }
