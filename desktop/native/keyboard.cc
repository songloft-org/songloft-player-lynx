#include "keyboard.h"
#include <cstring>
#include <map>
#include <mutex>
#include <node_api.h>
#include <third_party/weak-node-api/headers/napi.h>
#include <vector>

namespace {
struct Binding {
  std::string code;
  bool ctrl = false, meta = false, alt = false, shift = false, primary = false;
};
struct Event {
  std::string type, action;
  Binding binding;
  bool has_binding = false;
};
std::mutex mutex;
std::map<std::string, Binding> bindings;
std::vector<Event> events;
bool enabled = false, blocked = false, playable = false;
std::string recording;
bool Flag(Napi::Object object, const char *key) {
  auto value = object.Get(key);
  return value.IsBoolean() && value.As<Napi::Boolean>().Value();
}
std::string Text(Napi::Object object, const char *key) {
  auto value = object.Get(key);
  return value.IsString() ? value.As<Napi::String>().Utf8Value() : "";
}
Napi::Value Keyboard(const Napi::CallbackInfo &info) {
  try {
    auto env = info.Env();
    auto method = info[0].As<Napi::String>().Utf8Value();
    if (method == "initialize") {
      auto handle = info[1].As<Napi::Buffer<uint8_t>>();
      if (handle.Length() != sizeof(void *))
        throw std::runtime_error("Invalid window handle");
      void *window;
      memcpy(&window, handle.Data(), sizeof(window));
      StartDesktopKeyboard(window, info[2].IsBoolean() &&
                                       info[2].As<Napi::Boolean>().Value());
    } else if (method == "close")
      StopDesktopKeyboard();
    else if (method == "overlay") {
      std::lock_guard<std::mutex> lock(mutex);
      blocked = info[1].As<Napi::Boolean>().Value();
    } else if (method == "configure") {
      const auto data = info[1].As<Napi::Object>();
      std::lock_guard<std::mutex> lock(mutex);
      enabled = Flag(data, "enabled");
      blocked = Flag(data, "blocked");
      playable = Flag(data, "canPlay");
      recording = Text(data, "recording");
      auto values = data.Get("bindings");
      bindings.clear();
      if (values.IsObject())
        for (const char *action :
             {"toggle", "previous", "next", "seekBackward", "seekForward",
              "volumeUp", "volumeDown", "mute"}) {
          auto value = values.As<Napi::Object>().Get(action);
          if (!value.IsObject())
            continue;
          auto binding = value.As<Napi::Object>();
          bindings[action] = {Text(binding, "code"),  Flag(binding, "ctrl"),
                              Flag(binding, "meta"),  Flag(binding, "alt"),
                              Flag(binding, "shift"), Flag(binding, "primary")};
        }
    } else if (method == "drain") {
      std::lock_guard<std::mutex> lock(mutex);
      auto result = Napi::Array::New(env, events.size());
      for (uint32_t i = 0; i < events.size(); ++i) {
        const auto &event = events[i];
        auto value = Napi::Object::New(env);
        value.Set("type", Napi::String::New(env, event.type));
        value.Set("action", Napi::String::New(env, event.action));
        if (event.has_binding) {
          auto binding = Napi::Object::New(env);
          binding.Set("code", Napi::String::New(env, event.binding.code));
          binding.Set("ctrl", Napi::Boolean::New(env, event.binding.ctrl));
          binding.Set("meta", Napi::Boolean::New(env, event.binding.meta));
          binding.Set("alt", Napi::Boolean::New(env, event.binding.alt));
          binding.Set("shift", Napi::Boolean::New(env, event.binding.shift));
          value.Set("binding", binding);
        } else
          value.Set("binding", env.Null());
        result.Set(i, value);
      }
      events.clear();
      return result;
    } else
      throw std::runtime_error("Unknown keyboard method");
    return env.Null();
  } catch (const std::exception &error) {
    Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
}
} // namespace
void QueueDesktopWindowClose() {
  std::lock_guard<std::mutex> lock(mutex);
  events.push_back({"close", "", {}, false});
}
bool HandleDesktopKey(const std::string &code, bool ctrl, bool meta, bool alt,
                      bool shift, bool editing, bool repeat) {
  std::lock_guard<std::mutex> lock(mutex);
  if (code.empty() || events.size() >= 128)
    return false;
  if (code == "Escape" && blocked) {
    if (!repeat)
      events.push_back({"back", "", {}, false});
    return true;
  }
  if (!recording.empty()) {
    if (!repeat)
      events.push_back({"binding",
                        recording,
                        {code, ctrl, meta, alt, shift, false},
                        code != "Escape"});
    return true;
  }
  if (!enabled || blocked || !playable || editing)
    return false;
  for (const auto &entry : bindings) {
    const auto &binding = entry.second;
    if (binding.code == code && binding.alt == alt && binding.shift == shift &&
        (binding.primary ? ctrl || meta
                         : binding.ctrl == ctrl && binding.meta == meta)) {
      if (!repeat || (entry.first != "toggle" && entry.first != "next" &&
                      entry.first != "previous" && entry.first != "mute"))
        events.push_back({"action", entry.first, {}, false});
      return true;
    }
  }
  return false;
}
void RegisterKeyboard(napi_env env, napi_value exports) {
  Napi::Object(env, exports)
      .Set("keyboard", Napi::Function::New(env, Keyboard));
}
