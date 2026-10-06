"""Inspect the actual package, its embedded version, and production JS payload."""

import argparse
import glob
import json
import os
import plistlib
import re
import subprocess
import tarfile
import zipfile
from pathlib import Path


def verify_web(package, metadata, embedded):
    with tarfile.open(package, "r:gz") as archive:
        files = {}
        for member in archive.getmembers():
            name = member.name.removeprefix("./")
            assert not member.issym() and not member.islnk(), "Unexpected archive link"
            assert not name.startswith("/") and ".." not in Path(name).parts, "Unsafe archive path"
            if member.isfile():
                files[name] = archive.extractfile(member).read()
        assert files.get("main.lynx.bundle"), "Missing web bundle"
        check_production_bundle(files["main.lynx.bundle"])
        html = files["index.html"].decode()
        assert ('global-props=\'{"deployMode":"standalone"}\'' in html) != embedded, "Wrong deployment mode"
        for ref in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', html):
            if re.match(r"^(?:https?:|data:|#)", ref):
                continue
            name = ref.split("?")[0].split("#")[0].lstrip("/")
            assert name in files, f"Missing HTML asset: {name}"
        packaged = json.loads(files["version.json"])
        assert packaged == metadata, "Web metadata mismatch"


def check_production_bundle(bundle):
    for marker in (b"TestBridge.eval", b"__E2E_PLAYER_STORE__", b"__E2E_AUTH_STORE__"):
        assert marker not in bundle, f"Production bundle contains {marker!r}"


def verify_native(kind, package, metadata, expected_host):
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        hosts = [name for name in names if name.endswith("/native-host.json")]
        assert len(hosts) == 1, "Expected one immutable native host resource"
        host = json.loads(archive.read(hosts[0]))
        assert host == expected_host, "Packaged native host/trusted keys mismatch"
        assert all(host.get(key) == value for key, value in metadata.items()), "Native host build identity mismatch"
        bundles = [name for name in names if name.endswith("main.lynx.bundle")]
        assert len(bundles) == 1, "Expected one embedded Lynx bundle"
        check_production_bundle(archive.read(bundles[0]))
        if kind == "android":
            sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
            candidates = glob.glob(f"{sdk}/build-tools/*/aapt2")
            assert candidates, "aapt2 required for APK version inspection"
            aapt = max(candidates, key=lambda path: tuple(map(int, Path(path).parent.name.split("."))))
            badging = subprocess.check_output([aapt, "dump", "badging", str(package)], text=True)
            assert f"versionCode='{metadata['build_number']}'" in badging, "APK build number mismatch"
            assert f"versionName='{metadata['version']}'" in badging, "APK version mismatch"
            assert "application-debuggable" not in badging, "Published APK is debuggable"
            assert any(name.endswith("/liblynx.so") for name in names), "APK missing Lynx engine"
        elif kind == "ios":
            info = plistlib.loads(archive.read("Payload/SongloftLynx.app/Info.plist"))
            assert info["CFBundleShortVersionString"] == metadata["native_version"], "IPA version mismatch"
            assert str(info["CFBundleVersion"]) == str(metadata["build_number"]), "IPA build number mismatch"
        elif kind == "harmony":
            documents = [json.loads(archive.read(name)) for name in names if name in ("module.json", "pack.info")]
            def matches_version(value):
                if isinstance(value, dict):
                    if value.get("versionCode") == metadata["build_number"]:
                        expected = f"{metadata['native_version']}-dev" if metadata["version"] == "dev" else metadata["version"]
                        return value.get("versionName") == expected
                    return any(matches_version(child) for child in value.values())
                if isinstance(value, list):
                    return any(matches_version(child) for child in value)
                return False
            assert any(matches_version(document) for document in documents), "HAP version mismatch"
            assert any(name.endswith("/liblynx.so") for name in names), "HAP missing Lynx engine"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("platform", choices=["android", "ios", "harmony", "web", "web-embedded"])
    parser.add_argument("package", type=Path)
    parser.add_argument("metadata", type=Path)
    args = parser.parse_args()
    build = json.loads(args.metadata.read_text())
    if args.platform.startswith("web"):
        verify_web(args.package, build, args.platform == "web-embedded")
    else:
        expected_host = json.loads(args.metadata.with_name("native-host.json").read_text())
        verify_native(args.platform, args.package, build, expected_host)
    print(f"Verified {args.package}: version, payload and package contents")
