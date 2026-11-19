#include "surface.h"

#include <chrono>
#include <cstring>
#include <thread>

#ifdef _WIN32
#include <d3d11_1.h>
#include <wrl/client.h>
using Microsoft::WRL::ComPtr;
struct SurfaceWriter::Impl {
  ComPtr<ID3D11Device> device;
  ComPtr<ID3D11Device1> device1;
  ComPtr<ID3D11DeviceContext> context;
  ComPtr<ID3D11Query> completed;

  bool Upload(ID3D11Texture2D *texture, const uint8_t *bgra, int width,
              std::string &error) {
    context->UpdateSubresource(texture, 0, nullptr, bgra, width * 4, 0);
    context->End(completed.Get());
    context->Flush();
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(250);
    HRESULT ready;
    while ((ready = context->GetData(completed.Get(), nullptr, 0, 0)) ==
           S_FALSE) {
      if (std::chrono::steady_clock::now() >= deadline) {
        error = "D3D11 frame upload timed out";
        return false;
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    if (FAILED(ready)) {
      error = "D3D11 frame upload failed";
      return false;
    }
    if (FAILED(device->GetDeviceRemovedReason())) {
      error = "D3D11 device lost";
      return false;
    }
    return true;
  }
};
#else
#include <IOSurface/IOSurface.h>
struct SurfaceWriter::Impl {};

void SurfaceWriter::ReleaseSurface::operator()(void *surface) const {
  CFRelease(static_cast<IOSurfaceRef>(surface));
}

SurfaceWriter::OwnedSurface SurfaceWriter::Create(int width, int height) {
  const int64_t stride =
      IOSurfaceAlignProperty(kIOSurfaceBytesPerRow, size_t(width) * 4);
  const int64_t size =
      IOSurfaceAlignProperty(kIOSurfaceAllocSize, stride * height);
  const void *keys[] = {kIOSurfaceWidth,       kIOSurfaceHeight,
                        kIOSurfacePixelFormat, kIOSurfaceBytesPerElement,
                        kIOSurfaceBytesPerRow, kIOSurfaceAllocSize};
  const int64_t properties[] = {width, height, 0x42475241, 4, stride, size};
  auto dictionary =
      CFDictionaryCreateMutable(nullptr, 0, &kCFTypeDictionaryKeyCallBacks,
                                &kCFTypeDictionaryValueCallBacks);
  for (size_t index = 0; index < sizeof(keys) / sizeof(keys[0]); ++index) {
    auto number =
        CFNumberCreate(nullptr, kCFNumberSInt64Type, &properties[index]);
    CFDictionarySetValue(dictionary, keys[index], number);
    CFRelease(number);
  }
  OwnedSurface surface(IOSurfaceCreate(dictionary));
  CFRelease(dictionary);
  return surface;
}
#endif

SurfaceWriter::SurfaceWriter() : impl_(std::make_unique<Impl>()) {}
SurfaceWriter::~SurfaceWriter() = default;

bool SurfaceWriter::Write(void *handle, int width, int height,
                          const uint8_t *bgra, std::string &error) {
#ifdef _WIN32
  if (!impl_->device) {
    const auto result = D3D11CreateDevice(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION,
        &impl_->device, nullptr, &impl_->context);
    if (FAILED(result)) {
      error = "D3D11CreateDevice failed: " + std::to_string(result);
      return false;
    }
    D3D11_QUERY_DESC query{};
    query.Query = D3D11_QUERY_EVENT;
    if (FAILED(impl_->device->CreateQuery(&query, &impl_->completed))) {
      impl_->context.Reset();
      impl_->device.Reset();
      error = "D3D11 frame completion query failed";
      return false;
    }
    impl_->device.As(&impl_->device1);
  }
  ComPtr<ID3D11Texture2D> texture;
  // Clay creates NT handles for D3D11 surfaces. Its D3D9 fallback can
  // supply a legacy handle, which uses the older import call.
  const auto nt_result =
      impl_->device1 ? impl_->device1->OpenSharedResource1(handle,
                                                         IID_PPV_ARGS(&texture))
                     : E_NOINTERFACE;
  if (FAILED(nt_result)) {
    const auto legacy_result =
        impl_->device->OpenSharedResource(handle, IID_PPV_ARGS(&texture));
    if (FAILED(legacy_result)) {
      error = "Lynx shared surface import failed (NT " +
              std::to_string(nt_result) + ", legacy " +
              std::to_string(legacy_result) + ")";
      return false;
    }
  }
  D3D11_TEXTURE2D_DESC desc{};
  texture->GetDesc(&desc);
  if (desc.Width != static_cast<UINT>(width) ||
      desc.Height != static_cast<UINT>(height) ||
      desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM) {
    error = "Unexpected Lynx shared surface size/format";
    return false;
  }
  if (!(desc.MiscFlags & D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX))
    return impl_->Upload(texture.Get(), bgra, width, error);
  ComPtr<IDXGIKeyedMutex> keyed_mutex;
  if (FAILED(texture.As(&keyed_mutex))) {
    error = "Lynx shared texture has no keyed mutex";
    return false;
  }
  // Clay takes and releases the same key. If it still owns the texture,
  // leave this frame unpublished so the UI thread can retry.
  const auto lock = keyed_mutex->AcquireSync(0, 0);
  if (lock == WAIT_TIMEOUT)
    return false;
  if (lock != S_OK) {
    error = "Lynx shared texture lock failed: " + std::to_string(lock);
    return false;
  }
  const bool uploaded = impl_->Upload(texture.Get(), bgra, width, error);
  if (FAILED(keyed_mutex->ReleaseSync(0))) {
    error = "Lynx shared texture unlock failed";
    return false;
  }
  return uploaded;
#else
  auto surface = static_cast<IOSurfaceRef>(handle);
  if (IOSurfaceGetWidth(surface) != static_cast<size_t>(width) ||
      IOSurfaceGetHeight(surface) != static_cast<size_t>(height) ||
      IOSurfaceGetBytesPerElement(surface) != 4 ||
      IOSurfaceGetPixelFormat(surface) != 0x42475241) {
    error = "Unexpected Lynx IOSurface size/format";
    return false;
  }
  if (IOSurfaceLock(surface, 0, nullptr) != kIOReturnSuccess) {
    error = "IOSurfaceLock failed";
    return false;
  }
  auto *destination = static_cast<uint8_t *>(IOSurfaceGetBaseAddress(surface));
  const size_t stride = IOSurfaceGetBytesPerRow(surface);
  if (!destination || stride < static_cast<size_t>(width) * 4) {
    IOSurfaceUnlock(surface, 0, nullptr);
    error = "Invalid IOSurface pixel buffer";
    return false;
  }
  for (int row = 0; row < height; ++row) {
    std::memcpy(destination + row * stride, bgra + row * width * 4, width * 4);
  }
  if (IOSurfaceUnlock(surface, 0, nullptr) != kIOReturnSuccess) {
    error = "IOSurfaceUnlock failed";
    return false;
  }
  return true;
#endif
}
