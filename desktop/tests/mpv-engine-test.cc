#include <cstdlib>
#include <cstring>
#include <deque>
#include <iostream>

#include "mpv_engine.h"

// A deterministic libmpv API double enforces the real render.h threading
// contract. It does not decode media or establish platform/audio acceptance.
struct mpv_handle {};
struct mpv_render_context {};
namespace {
mpv_handle player;
mpv_render_context renderer;
bool render_alive = false;
int pause_requests = 0;
int requested_pause = -1;
std::string loaded;
struct Event {
  mpv_event event{};
  mpv_event_property property{};
  double seconds = 0;
  int64_t integer = 0;
  int paused = 0;
  std::string text;
  char *text_pointer = nullptr;
};
std::deque<Event> events;
Event current;

void Require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}
void Property(uint64_t id, mpv_format format, double number) {
  Event event;
  event.event.event_id = MPV_EVENT_PROPERTY_CHANGE;
  event.event.reply_userdata = id;
  event.property.format = format;
  event.seconds = number;
  event.integer = static_cast<int64_t>(number);
  event.paused = static_cast<int>(number);
  events.push_back(event);
}
void AudioOutput(const std::string &name) {
  Event event;
  event.event.event_id = MPV_EVENT_PROPERTY_CHANGE;
  event.event.reply_userdata = 3;
  event.property.format = MPV_FORMAT_STRING;
  event.text = name;
  events.push_back(event);
}
} // namespace

extern "C" {
mpv_handle *mpv_create() { return &player; }
int mpv_set_option_string(mpv_handle *, const char *, const char *) {
  return 0;
}
int mpv_initialize(mpv_handle *) { return 0; }
char *mpv_get_property_string(mpv_handle *, const char *) {
  Require(!render_alive, "synchronous property read holds the render lock");
  auto *version = static_cast<char *>(std::malloc(11));
  std::memcpy(version, "mpv 0.41.0", 11);
  return version;
}
void mpv_free(void *memory) { std::free(memory); }
const char *mpv_error_string(int) { return "test mpv failure"; }
int mpv_observe_property(mpv_handle *, uint64_t id, const char *name,
                         mpv_format format) {
  Require((id == 1 && std::string(name) == "time-pos" &&
           format == MPV_FORMAT_DOUBLE) ||
              (id == 2 && std::string(name) == "pause" &&
               format == MPV_FORMAT_FLAG) ||
              (id == 3 && std::string(name) == "current-ao" &&
               format == MPV_FORMAT_STRING) ||
              (id == 4 && std::string(name) == "duration" &&
               format == MPV_FORMAT_DOUBLE) ||
              (id == 5 && std::string(name) == "demuxer-cache-duration" &&
               format == MPV_FORMAT_DOUBLE) ||
              (id == 6 && std::string(name) == "volume" &&
               format == MPV_FORMAT_DOUBLE) ||
              (id == 7 && std::string(name) == "dwidth" &&
               format == MPV_FORMAT_INT64) ||
              (id == 8 && std::string(name) == "dheight" &&
               format == MPV_FORMAT_INT64),
          "unexpected property observation");
  return 0;
}
int mpv_render_context_create(mpv_render_context **out, mpv_handle *,
                              mpv_render_param *) {
  Require(!render_alive, "second render context");
  render_alive = true;
  *out = &renderer;
  return 0;
}
void mpv_render_context_free(mpv_render_context *) { render_alive = false; }
void mpv_terminate_destroy(mpv_handle *) {
  Require(!render_alive, "player destroyed before its render context");
}
int mpv_command_async(mpv_handle *, uint64_t, const char **args) {
  Require(std::string(args[0]) == "loadfile", "unexpected command");
  loaded = args[1];
  return 0;
}
int mpv_command_node_async(mpv_handle *, uint64_t, mpv_node *command) {
  Require(command->format == MPV_FORMAT_NODE_ARRAY, "unexpected load command");
  Require(std::string(command->u.list->values[0].u.string) == "loadfile",
          "unexpected asynchronous command");
  return 0;
}
int mpv_get_property_async(mpv_handle *, uint64_t, const char *name,
                           mpv_format format) {
  Require(std::string(name) == "playlist/0/id" && format == MPV_FORMAT_INT64,
          "unexpected asynchronous property read");
  return 0;
}
int mpv_set_property_async(mpv_handle *, uint64_t, const char *name,
                           mpv_format format, void *data) {
  Require(std::string(name) == "pause" && format == MPV_FORMAT_FLAG,
          "unexpected asynchronous property write");
  ++pause_requests;
  requested_pause = *static_cast<int *>(data);
  return 0;
}
int mpv_set_property_string(mpv_handle *, const char *, const char *) {
  Require(!render_alive, "synchronous pause holds the render lock");
  return 0;
}
int mpv_get_property(mpv_handle *, const char *name, mpv_format format,
                     void *data) {
  Require(!render_alive, "synchronous status read holds the render lock");
  Require(std::string(name) == "decoder-list" && format == MPV_FORMAT_NODE,
          "unexpected capability read");
  *static_cast<mpv_node *>(data) = {};
  return 0;
}
void mpv_free_node_contents(mpv_node *) {}
mpv_event *mpv_wait_event(mpv_handle *, double timeout) {
  Require(timeout == 0, "event polling blocks the render lock");
  current = {};
  if (!events.empty()) {
    current = events.front();
    events.pop_front();
    if (current.event.event_id == MPV_EVENT_PROPERTY_CHANGE) {
      current.event.data = &current.property;
      current.text_pointer = current.text.data();
      current.property.data = current.property.format == MPV_FORMAT_DOUBLE
                                  ? static_cast<void *>(&current.seconds)
                              : current.property.format == MPV_FORMAT_INT64
                                  ? static_cast<void *>(&current.integer)
                              : current.property.format == MPV_FORMAT_FLAG
                                  ? static_cast<void *>(&current.paused)
                              : current.property.format == MPV_FORMAT_STRING
                                  ? static_cast<void *>(&current.text_pointer)
                                  : nullptr;
    }
  }
  return &current.event;
}
} // extern "C"

int main() {
  try {
    {
      Engine engine;
      Require(engine.error.empty(), "engine initialization failed");
      Require(!engine.ReadStatus().position_seconds,
              "unobserved position is known");
      Require(!engine.ReadStatus().paused, "unobserved pause state is known");
      Require(!engine.ReadStatus().audio_output,
              "unobserved audio output is known");
      AudioOutput("coreaudio");
      Require(engine.ReadStatus().audio_output == "coreaudio",
              "audio device observation was not copied");
      Property(1, MPV_FORMAT_DOUBLE, 1);
      Require(engine.ReadStatus().audio_output == "coreaudio",
              "audio device points into expired event storage");
      Property(3, MPV_FORMAT_NONE, 0);
      Require(!engine.ReadStatus().audio_output,
              "unavailable audio device became known");
      AudioOutput("coreaudio");
      engine.Load("C:/音乐 directory/video.mp4");
      Require(loaded == "C:/音乐 directory/video.mp4", "media path changed");
      Require(engine.ReadStatus().audio_output == "coreaudio",
              "new load lost the unchanged audio device");
      engine.SetPaused(true);
      Require(pause_requests == 1 && requested_pause == 1,
              "pause was not queued");
      Require(!engine.ReadStatus().paused,
              "queued pause was reported as applied");
      Property(1, MPV_FORMAT_DOUBLE, 12.5);
      Property(2, MPV_FORMAT_FLAG, 1);
      auto status = engine.ReadStatus();
      Require(status.position_seconds == 12.5 && status.paused == true,
              "property notifications did not update playback status");
      engine.SetPaused(false);
      Require(requested_pause == 0, "resume was not queued");
      Property(2, MPV_FORMAT_FLAG, 0);
      Require(engine.ReadStatus().paused == false,
              "false pause state became unknown");
      Property(1, MPV_FORMAT_NONE, 0);
      Require(!engine.ReadStatus().position_seconds,
              "unavailable position became zero");
      Event failure;
      failure.event.event_id = MPV_EVENT_SET_PROPERTY_REPLY;
      failure.event.error = MPV_ERROR_PROPERTY_ERROR;
      events.push_back(failure);
      engine.ReadStatus();
      Require(engine.error == "test mpv failure",
              "asynchronous failure was lost");
      Property(1, MPV_FORMAT_DOUBLE, 8.5);
      engine.ReadStatus();
      engine.frames = 42;
      engine.Load("https://example.invalid/second.mp4");
      Require(engine.frames == 0 && engine.error.empty() &&
                  !engine.ReadStatus().position_seconds &&
                  engine.ReadStatus().paused == false,
              "new load retains stale diagnostic state");
      Property(2, MPV_FORMAT_FLAG, 1);
      engine.Load("https://example.invalid/paused.mp4");
      Require(engine.ReadStatus().paused == true,
              "new load discarded the unchanged player pause state");
      Property(4, MPV_FORMAT_DOUBLE, 42);
      Property(5, MPV_FORMAT_DOUBLE, 3);
      Property(7, MPV_FORMAT_INT64, 320);
      Property(8, MPV_FORMAT_INT64, 180);
      engine.LoadMedia("https://example.invalid/same-size.mkv", 1, {});
      status = engine.ReadStatus();
      Require(status.video_width == 320 && status.video_height == 180,
              "replacement lost unchanged video dimensions");
      Require(status.duration_seconds == 42 && status.buffered_seconds == 3,
              "replacement lost unchanged duration observations");
      Property(4, MPV_FORMAT_NONE, 0);
      Property(5, MPV_FORMAT_NONE, 0);
      Property(7, MPV_FORMAT_NONE, 0);
      Property(8, MPV_FORMAT_NONE, 0);
      status = engine.ReadStatus();
      Require(status.video_width == 0 && status.video_height == 0,
              "unavailable video dimensions remained stale");
      Require(status.duration_seconds == 0 && status.buffered_seconds == 0,
              "unavailable duration observations remained stale");
    }
    Require(!render_alive, "render context leaked");
    std::cout
        << "libmpv render-safe control and observed-status checks passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
