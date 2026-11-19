#include <node_api.h>
#include <stdexcept>
#include <string>
#include <third_party/weak-node-api/headers/napi.h>
#include <utility>
#ifdef _WIN32
#include <windows.h>
#include <wincrypt.h>
#else
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#endif

namespace {
std::string Text(const Napi::CallbackInfo &info, size_t index) {
  if (info.Length() <= index || !info[index].IsString())
    throw std::runtime_error("Expected string");
  return info[index].As<Napi::String>().Utf8Value();
}
#ifndef _WIN32
struct Query {
  CFMutableDictionaryRef value =
      CFDictionaryCreateMutable(nullptr, 0, &kCFTypeDictionaryKeyCallBacks,
                                &kCFTypeDictionaryValueCallBacks);
  Query(const std::string &service, const std::string &key) {
    CFDictionarySetValue(value, kSecClass, kSecClassGenericPassword);
    for (const auto &item : {std::make_pair(kSecAttrService, service),
                             std::make_pair(kSecAttrAccount, key)}) {
      auto text = CFStringCreateWithBytes(
          nullptr, reinterpret_cast<const UInt8 *>(item.second.data()),
          item.second.size(), kCFStringEncodingUTF8, false);
      if (!text)
        throw std::runtime_error("Invalid credential identity");
      CFDictionarySetValue(value, item.first, text);
      CFRelease(text);
    }
  }
  ~Query() { CFRelease(value); }
};
void Check(OSStatus status) {
  if (status != errSecSuccess)
    throw std::runtime_error("Keychain error " + std::to_string(status));
}
#endif
#ifndef _WIN32
enum class KeychainOperation { Read, Write, Remove };
class KeychainWorker final : public Napi::AsyncWorker {
public:
  KeychainWorker(Napi::Env env, KeychainOperation operation,
                 std::string service, std::string key, std::string value)
      : Napi::AsyncWorker(env, "SongloftKeychain"),
        deferred_(Napi::Promise::Deferred::New(env)), operation_(operation),
        service_(std::move(service)), key_(std::move(key)),
        value_(std::move(value)) {}

  Napi::Promise promise() const { return deferred_.Promise(); }

  void Execute() override {
    try {
      Query query(service_, key_);
      if (operation_ == KeychainOperation::Read) {
        CFDictionarySetValue(query.value, kSecReturnData, kCFBooleanTrue);
        CFTypeRef result = nullptr;
        const auto status = SecItemCopyMatching(query.value, &result);
        if (status == errSecItemNotFound) {
          found_ = false;
          return;
        }
        Check(status);
        const auto data = static_cast<CFDataRef>(result);
        value_.assign(reinterpret_cast<const char *>(CFDataGetBytePtr(data)),
                      static_cast<size_t>(CFDataGetLength(data)));
        CFRelease(result);
        found_ = true;
        return;
      }
      if (operation_ == KeychainOperation::Write) {
        auto data = CFDataCreate(nullptr,
                                 reinterpret_cast<const UInt8 *>(value_.data()),
                                 static_cast<CFIndex>(value_.size()));
        if (!data)
          throw std::runtime_error("Could not encode credential");
        const void *keys[] = {kSecValueData};
        const void *values[] = {data};
        auto updates = CFDictionaryCreate(nullptr, keys, values, 1,
                                          &kCFTypeDictionaryKeyCallBacks,
                                          &kCFTypeDictionaryValueCallBacks);
        auto status = SecItemUpdate(query.value, updates);
        if (status == errSecItemNotFound) {
          CFDictionarySetValue(query.value, kSecValueData, data);
          status = SecItemAdd(query.value, nullptr);
        }
        CFRelease(updates);
        CFRelease(data);
        Check(status);
        return;
      }
      const auto status = SecItemDelete(query.value);
      if (status != errSecItemNotFound)
        Check(status);
    } catch (const std::exception &error) {
      SetError(error.what());
    }
  }

  void OnOK() override {
    if (operation_ == KeychainOperation::Read) {
      if (found_)
        deferred_.Resolve(Napi::String::New(Env(), value_));
      else
        deferred_.Resolve(Env().Null());
      return;
    }
    deferred_.Resolve(Env().Undefined());
  }

  void OnError(const Napi::Error &error) override {
    deferred_.Reject(Napi::Error::New(Env(), error.Message()).Value());
  }

private:
  Napi::Promise::Deferred deferred_;
  KeychainOperation operation_;
  std::string service_;
  std::string key_;
  std::string value_;
  bool found_ = false;
};
Napi::Value QueueKeychain(const Napi::CallbackInfo &info,
                          KeychainOperation operation) {
  try {
    auto service = Text(info, 0);
    auto key = Text(info, 1);
    auto value = operation == KeychainOperation::Write ? Text(info, 2) : "";
    auto *worker = new KeychainWorker(info.Env(), operation, std::move(service),
                                      std::move(key), std::move(value));
    auto promise = worker->promise();
    worker->Queue();
    return promise;
  } catch (const std::exception &error) {
    Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
}
#endif
Napi::Value Read(const Napi::CallbackInfo &info) {
#ifndef _WIN32
  return QueueKeychain(info, KeychainOperation::Read);
#else
  Napi::Error::New(info.Env(), "Use DPAPI storage on Windows")
      .ThrowAsJavaScriptException();
  return info.Env().Undefined();
#endif
}
Napi::Value Write(const Napi::CallbackInfo &info) {
#ifndef _WIN32
  return QueueKeychain(info, KeychainOperation::Write);
#else
  Napi::Error::New(info.Env(), "Use DPAPI storage on Windows")
      .ThrowAsJavaScriptException();
  return info.Env().Undefined();
#endif
}
Napi::Value Remove(const Napi::CallbackInfo &info) {
#ifndef _WIN32
  return QueueKeychain(info, KeychainOperation::Remove);
#else
  Napi::Error::New(info.Env(), "Use DPAPI storage on Windows")
      .ThrowAsJavaScriptException();
  return info.Env().Undefined();
#endif
}
template <bool Encrypt> Napi::Value Protect(const Napi::CallbackInfo &info) {
  try {
#ifdef _WIN32
    const auto identity = Text(info, 0);
    if (info.Length() != 2 || !info[1].IsBuffer())
      throw std::runtime_error("Expected credential buffer");
    auto buffer = info[1].As<Napi::Buffer<uint8_t>>();
    if (buffer.Length() > 16 * 1024 * 1024 || identity.size() > 65536)
      throw std::runtime_error("Credential buffer too large");
    DATA_BLOB input{static_cast<DWORD>(buffer.Length()), buffer.Data()},
        entropy{static_cast<DWORD>(identity.size()),
                reinterpret_cast<BYTE *>(const_cast<char *>(identity.data()))},
        output{};
    BOOL ok =
        Encrypt
            ? CryptProtectData(&input, nullptr, &entropy, nullptr, nullptr,
                               CRYPTPROTECT_UI_FORBIDDEN, &output)
            : CryptUnprotectData(&input, nullptr, &entropy, nullptr, nullptr,
                                 CRYPTPROTECT_UI_FORBIDDEN, &output);
    if (!ok)
      throw std::runtime_error("DPAPI error " + std::to_string(GetLastError()));
    auto result =
        Napi::Buffer<uint8_t>::Copy(info.Env(), output.pbData, output.cbData);
    SecureZeroMemory(output.pbData, output.cbData);
    LocalFree(output.pbData);
    return result;
#else
    throw std::runtime_error("DPAPI is only available on Windows");
#endif
  } catch (const std::exception &e) {
    Napi::Error::New(info.Env(), e.what()).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
}
} // namespace
void RegisterCredentials(napi_env env, napi_value exports) {
  auto object = Napi::Object(env, exports);
  object.Set("secureGet", Napi::Function::New(env, Read));
  object.Set("secureSet", Napi::Function::New(env, Write));
  object.Set("secureRemove", Napi::Function::New(env, Remove));
  object.Set("protectSecret", Napi::Function::New(env, Protect<true>));
  object.Set("unprotectSecret", Napi::Function::New(env, Protect<false>));
}
