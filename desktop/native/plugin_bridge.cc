#include "plugin_bridge.h"
#include <cstdint>
#include <initializer_list>
#include <lynx/registration.h>
#include <lynx_extension_module.h>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <utility>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#else
#include <dispatch/dispatch.h>
#endif

namespace {
class PluginBridge;
struct PluginEvent {
  const char *name;
  std::string args;
};
struct PluginRuntime {
  lynx_view_t *view;
  std::vector<PluginEvent> events;
};
std::mutex routing_mutex;
std::string root_token;
std::map<std::string, PluginBridge *> hosts, children;
std::set<lynx_view_t *> root_views;
std::map<lynx_view_t *, std::string> child_identity;
std::map<uintptr_t, PluginRuntime> runtimes;
uintptr_t next_runtime = 0;

void DeliverPluginEvents(uintptr_t id) {
  std::vector<PluginEvent> events;
  {
    std::lock_guard<std::mutex> lock(routing_mutex);
    const auto runtime = runtimes.find(id);
    if (runtime == runtimes.end())
      return;
    events.swap(runtime->second.events);
  }
  for (const auto &event : events) {
    lynx_view_t *view;
    {
      std::lock_guard<std::mutex> lock(routing_mutex);
      const auto runtime = runtimes.find(id);
      if (runtime == runtimes.end())
        return;
      view = runtime->second.view;
    }
    // Destruction and delivery both run on the UI thread. The SDK may call
    // back into the bridge during delivery, so release the routing lock first.
    lynx_view_send_global_event(view, event.name, event.args.c_str());
  }
}

#ifdef _WIN32
constexpr UINT kPluginEventMessage = WM_APP + 1;
HWND event_window;
unsigned view_count = 0;
LRESULT CALLBACK PluginEventWindowProc(HWND hwnd, UINT message, WPARAM data,
                                       LPARAM detail) {
  if (message == kPluginEventMessage) {
    DeliverPluginEvents(data);
    return 0;
  }
  return DefWindowProcW(hwnd, message, data, detail);
}
void OpenPluginEventWindow() {
  if (view_count++ != 0)
    return;
  const auto instance = GetModuleHandleW(nullptr);
  static constexpr wchar_t name[] = L"Songloft.Desktop.PluginEvents";
  WNDCLASSW window_class{};
  window_class.lpfnWndProc = PluginEventWindowProc;
  window_class.hInstance = instance;
  window_class.lpszClassName = name;
  if (RegisterClassW(&window_class) ||
      GetLastError() == ERROR_CLASS_ALREADY_EXISTS)
    event_window = CreateWindowExW(0, name, L"", 0, 0, 0, 0, 0, HWND_MESSAGE,
                                   nullptr, instance, nullptr);
}
bool PostPluginEvents(uintptr_t id) {
  return event_window && PostMessageW(event_window, kPluginEventMessage, id, 0);
}
#else
bool PostPluginEvents(uintptr_t id) {
  dispatch_async_f(dispatch_get_main_queue(), reinterpret_cast<void *>(id),
                   [](void *data) {
                     DeliverPluginEvents(reinterpret_cast<uintptr_t>(data));
                   });
  return true;
}
#endif

std::string
EventArgs(std::initializer_list<std::pair<const char *, std::string>> fields) {
  const char hex[] = "0123456789abcdef";
  std::string args = "[{";
  for (const auto &[key, value] : fields) {
    if (args.size() > 2)
      args += ',';
    args += '"';
    args += key;
    args += "\":\"";
    for (const unsigned char byte : value) {
      if (byte == '"' || byte == '\\')
        args += '\\';
      if (byte < 32) {
        args += "\\u00";
        args += hex[byte >> 4];
        args += hex[byte & 15];
      } else {
        args += static_cast<char>(byte);
      }
    }
    args += '"';
  }
  return args + "}]";
}

std::string Text(const Napi::Value &value) {
  if (!value.IsString())
    throw std::runtime_error("Expected bridge string");
  auto text = value.As<Napi::String>().Utf8Value();
  if (text.size() > 4 * 1024 * 1024)
    throw std::runtime_error("Bridge value too large");
  return text;
}
bool RootValue(Napi::Value lynx) {
  if (!lynx.IsObject())
    return false;
  auto props = lynx.As<Napi::Object>().Get("__globalProps");
  if (!props.IsObject())
    return false;
  auto config = props.As<Napi::Object>().Get("songloftDesktop");
  if (!config.IsObject())
    return false;
  auto token = config.As<Napi::Object>().Get("token");
  if (!token.IsString())
    return false;
  std::lock_guard<std::mutex> lock(routing_mutex);
  return !root_token.empty() &&
         token.As<Napi::String>().Utf8Value() == root_token;
}
bool Root(Napi::Env env) { return RootValue(env.Global().Get("lynx")); }
class PluginBridge : public lynx::pub::LynxExtensionModule {
  lynx_view_t *view_ = nullptr;
  uintptr_t runtime_ = 0;
  std::string frame_;
  bool root_ = false;

  void ClearRoutes() {
    runtimes.erase(runtime_);
    runtime_ = 0;
    root_views.erase(view_);
    for (auto *routes : {&hosts, &children})
      for (auto entry = routes->begin(); entry != routes->end();)
        if (entry->second == this)
          entry = routes->erase(entry);
        else
          ++entry;
  }
  void Enqueue(PluginEvent event) {
    const auto runtime = runtimes.find(runtime_);
    if (runtime == runtimes.end())
      return;
    auto &events = runtime->second.events;
    const bool pending = !events.empty();
    events.push_back(std::move(event));
    if (!pending && !PostPluginEvents(runtime_))
      events.clear();
  }

public:
  void OnLynxViewCreate(lynx_view_t *view) override {
    std::lock_guard<std::mutex> lock(routing_mutex);
    view_ = view;
#ifdef _WIN32
    OpenPluginEventWindow();
#endif
  }
  void OnRuntimeReady(Napi::Env, Napi::Value lynx, const char *) override {
    const bool root = RootValue(lynx);
    std::lock_guard<std::mutex> lock(routing_mutex);
    if (!view_)
      return;
    if (!runtime_) {
      runtime_ = ++next_runtime;
      runtimes.emplace(runtime_, PluginRuntime{view_, {}});
    }
    root_ = root;
    if (root_)
      root_views.insert(view_);
    else if (auto identity = child_identity.find(view_);
             identity != child_identity.end())
      frame_ = identity->second;
  }
  void OnRuntimeDetach() override {
    std::lock_guard<std::mutex> lock(routing_mutex);
    ClearRoutes();
  }
  void OnLynxViewDestroy() override {
    std::lock_guard<std::mutex> lock(routing_mutex);
    ClearRoutes();
    child_identity.erase(view_);
#ifdef _WIN32
    if (view_ && --view_count == 0) {
      if (event_window)
        DestroyWindow(event_window);
      event_window = nullptr;
    }
#endif
    view_ = nullptr;
  }
  Napi::Value Call(const std::string &method, const Napi::CallbackInfo &info) {
    auto env = info.Env();
    try {
      {
        std::lock_guard<std::mutex> lock(routing_mutex);
        if (!view_ || !runtime_)
          return env.Undefined();
      }
      if (!info.Length())
        throw std::runtime_error("Bridge unavailable");
      const auto frame = Text(info[0]);
      if (frame.empty() || frame.size() > 512)
        throw std::runtime_error("Invalid frame identity");
      if (method == "registerHost" || method == "unregisterHost" ||
          method == "hostReply" || method == "pushToChild") {
        if (!root_ && !Root(env))
          throw std::runtime_error("Root bridge required");
        std::lock_guard<std::mutex> lock(routing_mutex);
        if (!view_ || !runtime_)
          return env.Undefined();
        if (method == "registerHost") {
          root_views.insert(view_);
          hosts[frame] = this;
          return env.Undefined();
        }
        if (hosts.find(frame) == hosts.end() || hosts[frame] != this)
          return env.Undefined();
        if (method == "unregisterHost") {
          hosts.erase(frame);
          children.erase(frame);
          return env.Undefined();
        }
        const auto child = children.find(frame);
        if (child == children.end())
          return env.Undefined();
        if (method == "hostReply")
          child->second->Enqueue({"SongloftPluginBridge.hostReply",
                                  EventArgs({{"callId", Text(info[1])},
                                             {"result", Text(info[2])}})});
        else
          child->second->Enqueue(
              {"SongloftPluginBridge.push",
               EventArgs({{"event", Text(info[1])}, {"data", Text(info[2])}})});
      } else {
        std::lock_guard<std::mutex> lock(routing_mutex);
        if (!view_ || !runtime_)
          return env.Undefined();
        // Build() may make the child's runtime ready before its parent native
        // view binds the frame identity. Resolve lazily on the first bridge
        // call so callback ordering cannot strand the child with an empty id.
        if (frame_.empty()) {
          if (auto identity = child_identity.find(view_);
              identity != child_identity.end())
            frame_ = identity->second;
        }
        if (frame_ != frame || root_)
          throw std::runtime_error("Child frame mismatch");
        const auto host = hosts.find(frame);
        if (host == hosts.end())
          return env.Undefined();
        children[frame] = this;
        if (method == "registerChild")
          return env.Undefined();
        if (info.Length() != 5)
          throw std::runtime_error("Invalid host call");
        host->second->Enqueue({"SongloftPluginBridge.hostCall",
                               EventArgs({{"frameId", frame_},
                                          {"callId", Text(info[1])},
                                          {"ns", Text(info[2])},
                                          {"method", Text(info[3])},
                                          {"params", Text(info[4])}})});
      }
    } catch (const std::exception &error) {
      Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException();
    }
    return info.Env().Undefined();
  }
  static lynx_extension_module_t *Create(void *) {
    auto *module = new PluginBridge();
    auto *handle = lynx_extension_module_create_with_finalizer(
        module, [](lynx_extension_module_t *, void *data) {
          delete static_cast<PluginBridge *>(data);
        });
    module->SetCModule(handle);
    module->SetNapiModuleCreator([](Napi::Env env, Napi::Value exports,
                                    const char *, PluginBridge &self) {
      for (const char *name :
           {"registerHost", "unregisterHost", "registerChild", "hostCall",
            "hostReply", "pushToChild"}) {
        const std::string method(name);
        exports.As<Napi::Object>().Set(
            name, Napi::Function::New(
                      env, [&self, method](const Napi::CallbackInfo &info) {
                        return self.Call(method, info);
                      }));
      }
      return exports;
    });
    return handle;
  }
};
LYNX_REGISTRATION_CONSTRUCTOR(RegisterPluginBridge) {
  lynx_env_register_extension_module("SongloftPluginBridge",
                                     PluginBridge::Create, false, nullptr);
}
} // namespace
void SetDesktopBridgeToken(const std::string &token) {
  std::lock_guard<std::mutex> lock(routing_mutex);
  root_token = token;
}
bool IsDesktopRootEnvironment(Napi::Env env) { return Root(env); }
bool DesktopProbeEnabled() {
  std::lock_guard<std::mutex> lock(routing_mutex);
  return root_token.empty();
}
bool IsDesktopRootView(lynx_view_t *view) {
  std::lock_guard<std::mutex> lock(routing_mutex);
  return root_views.count(view) != 0;
}
bool BindDesktopChildFrame(lynx_view_t *parent, lynx_view_t *child,
                           const std::string &frame) {
  std::lock_guard<std::mutex> lock(routing_mutex);
  if (!root_views.count(parent) || frame.empty() || frame.size() > 512)
    return false;
  child_identity[child] = frame;
  return true;
}
