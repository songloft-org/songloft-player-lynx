#include <chrono>
#include <cmath>
#include <iostream>
#include <set>
#include <thread>
#include <vector>

#include "mpv_engine.h"

// Decoder supplement, without a Lynx surface or compositor. Linux uses a
// linker-local null output; macOS/Windows retain production audio defaults.
#if defined(__linux__)
extern "C" mpv_handle *__real_mpv_create();
extern "C" mpv_handle *__wrap_mpv_create() {
  auto *player = __real_mpv_create();
  if (player && mpv_set_option_string(player, "ao", "null") < 0) {
    mpv_terminate_destroy(player);
    return nullptr;
  }
  return player;
}
#endif

namespace {
using Clock = std::chrono::steady_clock;
void Require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}
} // namespace

int main(int argc, char **argv) {
  try {
    Require(argc == 2, "Expected a generated video fixture path");
    Engine engine;
    Require(engine.error.empty(), engine.error.c_str());
    engine.Load(argv[1]);
    std::vector<uint8_t> pixels(320 * 180 * 4);
    std::set<uint64_t> hashes;
    PlaybackSnapshot snapshot;
    int frames = 0;
    auto step = [&] {
      {
        std::lock_guard<std::mutex> lock(engine.mutex);
        if (mpv_render_context_update(engine.render) &
            MPV_RENDER_UPDATE_FRAME) {
          int size[] = {320, 180};
          size_t stride = 320 * 4;
          mpv_render_param params[] = {
              {MPV_RENDER_PARAM_SW_SIZE, size},
              {MPV_RENDER_PARAM_SW_FORMAT, const_cast<char *>("bgra")},
              {MPV_RENDER_PARAM_SW_STRIDE, &stride},
              {MPV_RENDER_PARAM_SW_POINTER, pixels.data()},
              {MPV_RENDER_PARAM_INVALID, nullptr}};
          Engine::Check(mpv_render_context_render(engine.render, params));
          uint64_t hash = 1469598103934665603ULL;
          for (size_t index = 0; index < pixels.size(); index += 128)
            hash = (hash ^ pixels[index]) * 1099511628211ULL;
          hashes.insert(hash);
          ++frames;
        }
        snapshot = engine.ReadStatus();
        Require(engine.error.empty(), engine.error.c_str());
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
    };
    auto wait = [&](auto condition) {
      const auto deadline = Clock::now() + std::chrono::seconds(6);
      while (!condition()) {
        Require(Clock::now() < deadline, "Timed out awaiting actual mpv state");
        step();
      }
    };
    wait([&] {
      return snapshot.position_seconds.value_or(0) > 0.5 && frames >= 8 &&
             hashes.size() >= 4 && snapshot.audio_output.has_value();
    });
#if defined(__linux__)
    Require(snapshot.audio_output == "null", "Expected isolated null audio");
#else
    Require(snapshot.audio_output != "null" && snapshot.audio_output != "pcm" &&
                !snapshot.audio_output->empty(),
            "Expected a real system audio output");
#endif
    const auto audio_output = *snapshot.audio_output;
    engine.SetPaused(true);
    wait([&] { return snapshot.paused == true; });
    const auto paused_at = snapshot.position_seconds.value();
    const auto pause_end = Clock::now() + std::chrono::milliseconds(600);
    while (Clock::now() < pause_end)
      step();
    Require(std::abs(snapshot.position_seconds.value() - paused_at) < 0.08,
            "Actual mpv position advanced while paused");
    const int paused_frames = frames;
    engine.SetPaused(false);
    wait([&] {
      return snapshot.paused == false &&
             snapshot.position_seconds.value_or(0) > paused_at + 0.35 &&
             frames > paused_frames + 4;
    });
    std::cout << "{\"realDecoder\":true,\"audioOutput\":\"" << audio_output
              << "\","
              << "\"renderedFrames\":" << frames
              << ",\"distinctFrameHashes\":" << hashes.size()
              << ",\"pausedPosition\":" << paused_at
              << ",\"resumedPosition\":" << *snapshot.position_seconds << "}\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
