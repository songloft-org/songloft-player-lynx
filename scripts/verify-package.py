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
from html.parser import HTMLParser
from pathlib import Path


class WebReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []
        self.bases = []

    def handle_starttag(self, tag, attrs):
        if tag == "base":
            self.bases.extend(value for name, value in attrs if name == "href")
        else:
            self.assets.extend(value for name, value in attrs if name in ("src", "href") and value)


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
        references = WebReferences()
        references.feed(html)
        assert references.bases in ([[], ["/"]] if embedded else [[]]), "Wrong deployment base"
        for ref in references.assets:
            if re.match(r"^(?:https?:|data:|#)", ref):
                continue
            name = ref.split("?")[0].split("#")[0].lstrip("/").removeprefix("./")
            assert name in files, f"Missing HTML asset: {name}"
        packaged = json.loads(files["version.json"])
        assert packaged == metadata, "Web metadata mismatch"


def check_production_bundle(bundle):
    for marker in (b"TestBridge.eval", b"__E2E_PLAYER_STORE__", b"__E2E_AUTH_STORE__"):
        assert marker not in bundle, f"Production bundle contains {marker!r}"


def verify_native(kind, package, metadata, expected_host, backend_sha=None, variant='standard'):
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
            backend_files = [f'lib/{abi}/libgojni.so' for abi in ("arm64-v8a", "armeabi-v7a", "x86_64", "x86")]
            if variant == 'bundled':
                if not backend_sha:
                    raise AssertionError("Bundled Android package requires a backend SHA")
                assert re.search(r"^(?:sdkVersion|minSdkVersion):'23'$", badging, re.MULTILINE), "Bundle APK must declare Android API 23"
                for abi in ("arm64-v8a", "armeabi-v7a", "x86_64", "x86"):
                    backend = f"lib/{abi}/libgojni.so"
                    assert f"lib/{abi}/liblynx.so" in names, f"APK missing Lynx engine for {abi}"
                    assert backend in names, f"APK missing {backend}"
                    assert backend_sha.encode() in archive.read(backend), f"Wrong backend SHA in {backend}"
            else:
                assert re.search(r"^(?:sdkVersion|minSdkVersion):'21'$", badging, re.MULTILINE), "Standard APK must declare Android API 21"
                assert not any(name in names for name in backend_files), "Standard APK contains the Go backend"
        elif kind == "ios":
            info = plistlib.loads(archive.read("Payload/SongloftLynx.app/Info.plist"))
            assert info["CFBundleShortVersionString"] == metadata["native_version"], "IPA version mismatch"
            assert str(info["CFBundleVersion"]) == str(metadata["build_number"]), "IPA build number mismatch"
            if variant == 'bundled':
                if not backend_sha:
                    raise AssertionError("Bundled iOS package requires a backend SHA")
                executable = f"Payload/SongloftLynx.app/{info['CFBundleExecutable']}"
                assert backend_sha.encode() in archive.read(executable), "Wrong or missing statically linked backend"
            else:
                executable_name = info.get('CFBundleExecutable')
                if executable_name:
                    executable = f"Payload/SongloftLynx.app/{executable_name}"
                    assert not backend_sha or backend_sha.encode() not in archive.read(executable), "Standard IPA contains the Go backend"
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
    parser.add_argument("--backend-sha", help="Require this embedded Go backend on Android or iOS")
    parser.add_argument("--variant", choices=["standard", "bundled"])
    args = parser.parse_args()
    variant = args.variant or ('bundled' if args.backend_sha else 'standard')
    if args.backend_sha and (
        args.platform not in ("android", "ios") or not re.fullmatch(r"[0-9a-f]{40}", args.backend_sha)
    ):
        parser.error("--backend-sha requires an Android/iOS package and a full SHA")
    build = json.loads(args.metadata.read_text())
    if args.platform.startswith("web"):
        verify_web(args.package, build, args.platform == "web-embedded")
    else:
        expected_host = json.loads(args.metadata.with_name("native-host.json").read_text())
        verify_native(args.platform, args.package, build, expected_host, args.backend_sha, variant)
    print(f"Verified {args.package}: version, payload and package contents")
