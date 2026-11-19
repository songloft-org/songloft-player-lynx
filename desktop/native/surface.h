#pragma once

#include <cstdint>
#include <memory>
#include <string>

class SurfaceWriter {
public:
  SurfaceWriter();
  ~SurfaceWriter();
#ifdef __APPLE__
  struct ReleaseSurface {
    void operator()(void *surface) const;
  };
  using OwnedSurface = std::unique_ptr<void, ReleaseSurface>;
  OwnedSurface Create(int width, int height);
#endif
  bool Write(void *handle, int width, int height, const uint8_t *bgra,
             std::string &error);

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
