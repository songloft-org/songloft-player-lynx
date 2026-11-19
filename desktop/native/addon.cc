#include <node_api.h>
#ifdef _WIN32
#include <cstring>

void RepaintDesktopCefWindows(void *parent);

namespace {
napi_value RepaintCef(napi_env env, napi_callback_info info) {
  size_t argc = 1, size = 0;
  napi_value arg{};
  void *data = nullptr;
  void *window = nullptr;
  if (napi_get_cb_info(env, info, &argc, &arg, nullptr, nullptr) == napi_ok &&
      argc == 1 && napi_get_buffer_info(env, arg, &data, &size) == napi_ok &&
      size == sizeof(window)) {
    std::memcpy(&window, data, size);
    if (window)
      RepaintDesktopCefWindows(window);
  }
  napi_value result{};
  napi_get_undefined(env, &result);
  return result;
}
} // namespace
#endif

// Host-only system credentials use ordinary Node N-API. Lynx playback modules
// live in probe.cc with the separate weak N-API ABI.
void RegisterCredentials(napi_env env, napi_value exports);
void RegisterPlayer(napi_env env, napi_value exports);
void RegisterSystem(napi_env env, napi_value exports);
void RegisterResources(napi_env env, napi_value exports);
void RegisterKeyboard(napi_env env, napi_value exports);
void RegisterInstance(napi_env env, napi_value exports);
NAPI_MODULE_INIT() {
  RegisterCredentials(env, exports);
  RegisterPlayer(env, exports);
  RegisterSystem(env, exports);
  RegisterResources(env, exports);
  RegisterKeyboard(env, exports);
  RegisterInstance(env, exports);
#ifdef _WIN32
  napi_value repaint;
  if (napi_create_function(env, "repaintCef", NAPI_AUTO_LENGTH, RepaintCef,
                           nullptr, &repaint) == napi_ok)
    napi_set_named_property(env, exports, "repaintCef", repaint);
#endif
  return exports;
}
