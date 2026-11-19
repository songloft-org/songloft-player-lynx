#include "resources.h"
#include <atomic>
#include <map>
#include <mutex>
#include <node_api.h>
#include <third_party/weak-node-api/headers/napi.h>

namespace {
std::mutex resource_mutex;
std::map<uint64_t, DesktopResourceReply> requests;
std::atomic<uint64_t> sequence{0};
Napi::ThreadSafeFunction handler;
bool configured = false;
struct Notification {
  uint64_t id;
  std::string url;
  bool cancel;
};
bool Notify(Notification *request) {
  std::lock_guard<std::mutex> lock(resource_mutex);
  if (!configured) {
    delete request;
    return false;
  }
  const auto status = handler.NonBlockingCall(
      request,
      [](Napi::Env env, Napi::Function callback, Notification *request) {
        std::unique_ptr<Notification> owner(request);
        if (env && callback)
          callback.Call({Napi::Number::New(env, request->id),
                         Napi::String::New(env, request->url),
                         Napi::Boolean::New(env, request->cancel)});
      });
  if (status != napi_ok) {
    delete request;
    return false;
  }
  return true;
}
Napi::Value Resource(const Napi::CallbackInfo &info) {
  try {
    auto env = info.Env();
    const auto method = info[0].As<Napi::String>().Utf8Value();
    if (method == "configure") {
      std::lock_guard<std::mutex> lock(resource_mutex);
      if (configured)
        throw std::runtime_error("Resource handler already configured");
      handler =
          Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(),
                                        "Songloft resource loader", 256, 1);
      handler.Unref(env);
      configured = true;
    } else if (method == "reply") {
      const uint64_t id = info[1].As<Napi::Number>().Int64Value();
      DesktopResourceReply done;
      {
        std::lock_guard<std::mutex> lock(resource_mutex);
        auto found = requests.find(id);
        if (found == requests.end())
          return env.Null();
        done = std::move(found->second);
        requests.erase(found);
      }
      std::vector<uint8_t> bytes;
      std::string error;
      if (info[2].IsBuffer()) {
        auto buffer = info[2].As<Napi::Buffer<uint8_t>>();
        bytes.assign(buffer.Data(), buffer.Data() + buffer.Length());
      }
      if (info.Length() > 3 && info[3].IsString())
        error = info[3].As<Napi::String>().Utf8Value();
      done(std::move(bytes), std::move(error));
    } else if (method == "close") {
      std::map<uint64_t, DesktopResourceReply> pending;
      {
        std::lock_guard<std::mutex> lock(resource_mutex);
        pending.swap(requests);
        if (configured)
          handler.Abort();
        configured = false;
      }
      for (auto &entry : pending)
        entry.second({}, "resource loader closed");
    } else
      throw std::runtime_error("Unknown resource method");
    return env.Null();
  } catch (const std::exception &error) {
    Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
}
} // namespace
uint64_t RequestDesktopResource(const std::string &url,
                                DesktopResourceReply done) {
  const uint64_t id = ++sequence;
  {
    std::lock_guard<std::mutex> lock(resource_mutex);
    requests.emplace(id, std::move(done));
  }
  if (!Notify(new Notification{id, url, false}))
    CancelDesktopResource(id);
  return id;
}
void CancelDesktopResource(uint64_t id) {
  DesktopResourceReply done;
  {
    std::lock_guard<std::mutex> lock(resource_mutex);
    auto found = requests.find(id);
    if (found == requests.end())
      return;
    done = std::move(found->second);
    requests.erase(found);
  }
  done({}, "resource request cancelled");
  Notify(new Notification{id, "", true});
}
void RegisterResources(napi_env env, napi_value exports) {
  Napi::Object(env, exports)
      .Set("resource", Napi::Function::New(env, Resource));
}
