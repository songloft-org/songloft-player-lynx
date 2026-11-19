package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type applicationMetadata struct {
	Schema     int    `json:"schema"`
	AppID      string `json:"appId"`
	Version    string `json:"version"`
	Channel    string `json:"channel"`
	Target     string `json:"target"`
	ClientSHA  string `json:"clientSha"`
	BackendSHA string `json:"backendSha"`
}

func readApplicationMetadata(resources string) (applicationMetadata, error) {
	var packaged applicationMetadata
	file, err := os.Open(filepath.Join(resources, "build-info.json"))
	if err != nil {
		return packaged, fmt.Errorf("cannot read packaged application metadata: %w", err)
	}
	defer file.Close()
	const maximum = 64 << 10
	raw, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return packaged, err
	}
	if len(raw) > maximum || json.Unmarshal(raw, &packaged) != nil {
		return packaged, errors.New("invalid packaged application metadata")
	}
	return packaged, nil
}

func (packaged applicationMetadata) matchesApplication(signed manifest, version, clientSHA string) bool {
	appID := "org.songloft.lynx.desktop"
	if signed.Channel == "dev" {
		appID += ".dev"
	}
	return packaged.Schema == 1 && packaged.AppID == appID &&
		packaged.Version == version && packaged.Channel == signed.Channel &&
		packaged.Target == signed.OS+"-"+signed.Arch && packaged.ClientSHA == clientSHA
}

// The release manifest binds the bytes of the installer. Check the embedded
// identity too so an accidentally paired asset never becomes the next launch.
func verifyApplicationMetadata(resources string, signed manifest) error {
	packaged, err := readApplicationMetadata(resources)
	if err != nil {
		return err
	}
	if !packaged.matchesApplication(signed, signed.Version, signed.ClientSHA) || packaged.BackendSHA != signed.BackendSHA {
		return errors.New("packaged application identity does not match signed manifest")
	}
	return nil
}
