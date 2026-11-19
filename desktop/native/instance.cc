#include <node_api.h>
#include <stdexcept>
#include <string>
#include <third_party/weak-node-api/headers/napi.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

namespace {
#ifdef _WIN32
HANDLE lock_handle = nullptr;
#else
int lock_fd = -1;
#endif
Napi::Value Acquire(const Napi::CallbackInfo &info) {
  try {
    if (info.Length() != 1 || !info[0].IsString())
      throw std::runtime_error("Expected instance lock path");
    auto name = info[0].As<Napi::String>().Utf8Value();
#ifdef _WIN32
    if (lock_handle)
      throw std::runtime_error("Instance already acquired");
    lock_handle =
        CreateMutexA(nullptr, TRUE, ("Local\\Songloft-" + name).c_str());
    if (!lock_handle)
      throw std::runtime_error("Instance mutex failed");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
      CloseHandle(lock_handle);
      lock_handle = nullptr;
      return Napi::Boolean::New(info.Env(), false);
    }
#else
    if (lock_fd >= 0)
      throw std::runtime_error("Instance already acquired");
    int fd =
        open(name.c_str(), O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0600);
    if (fd < 0)
      throw std::runtime_error("Instance lock failed");
    if (flock(fd, LOCK_EX | LOCK_NB) != 0) {
      close(fd);
      return Napi::Boolean::New(info.Env(), false);
    }
    lock_fd = fd;
#endif
    return Napi::Boolean::New(info.Env(), true);
  } catch (const std::exception &e) {
    Napi::Error::New(info.Env(), e.what()).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
}
} // namespace
void RegisterInstance(napi_env env, napi_value exports) {
  Napi::Object(env, exports)
      .Set("acquireInstance", Napi::Function::New(env, Acquire));
}
