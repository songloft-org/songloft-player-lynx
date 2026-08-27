# Lynx SDK HarmonyOS Libraries

This directory holds prebuilt Lynx SDK HAR modules required by the HarmonyOS host.

Lynx does not publish prebuilt HAR packages to any public ohpm registry.
They must be compiled from the [lynx-family/lynx](https://github.com/lynx-family/lynx) source tree.

## How to build

```bash
# Clone Lynx source
git clone https://github.com/lynx-family/lynx.git
cd lynx

# Setup build environment
source tools/envsetup.sh

# Build HarmonyOS platform modules
pushd platform/harmony && ohpm install && popd
python3 explorer/harmony/script/build.py --build_lynx_core
```

After building, copy the following module directories here:

```
harmony/libs/
├── lynx/                  ← from platform/harmony/lynx_harmony/
├── lynx_base/             ← from base/platform/harmony/
├── lynx_http_service/     ← from platform/harmony/lynx_services/lynx_http_service/
├── lynx_image_service/    ← from platform/harmony/lynx_services/lynx_image_service/
└── lynx_log_service/      ← from platform/harmony/lynx_services/lynx_log_service/
```

Each directory should contain `oh-package.json5`, `Index.ets`, `src/`, and compiled `.so` artifacts.

## CI

The GitHub Actions workflow (`dev-build-harmony.yml`) checks for `harmony/libs/lynx/`
before running `ohpm install`. Without these libs, the HAP build will fail.
