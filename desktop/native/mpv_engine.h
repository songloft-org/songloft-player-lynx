#pragma once

#include <mpv/client.h>
#include <mpv/render.h>

#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

struct PlaybackSnapshot {
  std::optional<double> position_seconds;
  std::optional<bool> paused;
  std::optional<std::string> audio_output;
  double duration_seconds = 0;
  double buffered_seconds = 0;
  double volume = 100;
  int64_t video_width = 0, video_height = 0;
};

// Live operations under mutex must use only render-safe client APIs: the
// render thread cannot wait on a synchronous request to the playback core.
class Engine {
public:
  std::mutex mutex;
  mpv_handle *player = nullptr;
  mpv_render_context *render = nullptr;
  std::string error;
  uint64_t frames = 0;
  int video_views = 0;
  bool window_visible = true;
  PlaybackSnapshot snapshot;
  std::set<std::string> codecs;
  uint64_t generation = 0;
  int64_t active_entry = -1, expected_entry = -1;
  bool loaded = false, restarted = false, completed = false;
  bool Ready() const {
    return loaded && restarted && active_entry == expected_entry &&
           expected_entry >= 0;
  }

  Engine() {
    try {
      player = mpv_create();
      if (!player)
        throw std::runtime_error("mpv_create failed");
      Check(mpv_set_option_string(player, "config", "no"));
      Check(mpv_set_option_string(player, "load-scripts", "no"));
      Check(mpv_set_option_string(player, "vo", "libmpv"));
      Check(mpv_set_option_string(player, "terminal", "no"));
      Check(mpv_set_option_string(player, "idle", "yes"));
      Check(mpv_initialize(player));
      char *version = mpv_get_property_string(player, "mpv-version");
      const std::string actual = version ? version : "unknown";
      mpv_free(version);
      if (actual != "mpv 0.41.0" && actual != "mpv v0.41.0") {
        throw std::runtime_error("Expected mpv 0.41.0; loaded " + actual);
      }
      Check(mpv_observe_property(player, 1, "time-pos", MPV_FORMAT_DOUBLE));
      Check(mpv_observe_property(player, 2, "pause", MPV_FORMAT_FLAG));
      Check(mpv_observe_property(player, 3, "current-ao", MPV_FORMAT_STRING));
      Check(mpv_observe_property(player, 4, "duration", MPV_FORMAT_DOUBLE));
      Check(mpv_observe_property(player, 5, "demuxer-cache-duration",
                                 MPV_FORMAT_DOUBLE));
      Check(mpv_observe_property(player, 6, "volume", MPV_FORMAT_DOUBLE));
      Check(mpv_observe_property(player, 7, "dwidth", MPV_FORMAT_INT64));
      Check(mpv_observe_property(player, 8, "dheight", MPV_FORMAT_INT64));
      // This immutable capability query precedes creation of the render
      // context; live operations never synchronously wait on the mpv core.
      mpv_node decoders{};
      Check(
          mpv_get_property(player, "decoder-list", MPV_FORMAT_NODE, &decoders));
      if (decoders.format == MPV_FORMAT_NODE_ARRAY)
        for (int i = 0; i < decoders.u.list->num; ++i) {
          const auto &entry = decoders.u.list->values[i];
          if (entry.format != MPV_FORMAT_NODE_MAP)
            continue;
          for (int j = 0; j < entry.u.list->num; ++j)
            if (std::string(entry.u.list->keys[j]) == "codec" &&
                entry.u.list->values[j].format == MPV_FORMAT_STRING)
              codecs.insert(entry.u.list->values[j].u.string);
        }
      mpv_free_node_contents(&decoders);
      mpv_render_param params[] = {{MPV_RENDER_PARAM_API_TYPE,
                                    const_cast<char *>(MPV_RENDER_API_TYPE_SW)},
                                   {MPV_RENDER_PARAM_INVALID, nullptr}};
      Check(mpv_render_context_create(&render, player, params));
    } catch (const std::exception &exception) {
      error = exception.what();
      Close();
    }
  }
  ~Engine() { Close(); }
  Engine(const Engine &) = delete;
  Engine &operator=(const Engine &) = delete;
  void Load(const std::string &source) {
    DrainEvents();
    error.clear();
    frames = 0;
    // Pause and device belong to the player, not the source. mpv does not
    // emit another observation when loadfile leaves their values unchanged.
    snapshot.position_seconds.reset();
    const char *args[] = {"loadfile", source.c_str(), "replace", nullptr};
    Check(mpv_command_async(player, 0, args));
  }
  void SetPaused(bool paused) {
    int flag = paused ? 1 : 0;
    Check(mpv_set_property_async(player, 0, "pause", MPV_FORMAT_FLAG, &flag));
  }
  void SkipVideoFrame() {
    if (!render)
      return;
    mpv_render_context_update(render);
    int skip = 1;
    mpv_render_param params[] = {{MPV_RENDER_PARAM_SKIP_RENDERING, &skip},
                                 {MPV_RENDER_PARAM_INVALID, nullptr}};
    Check(mpv_render_context_render(render, params));
  }
  void LoadMedia(const std::string &source, uint64_t id,
                 std::vector<std::pair<std::string, std::string>> options) {
    DrainEvents();
    generation = id;
    loaded = restarted = completed = false;
    expected_entry = -1;
    error.clear();
    snapshot.position_seconds.reset();
    // mpv may leave unchanged dimensions and duration observations untouched
    // across replacements. Unavailable observations clear them below.
    frames = 0;
    std::vector<mpv_node> values(options.size());
    std::vector<char *> keys(options.size());
    for (size_t i = 0; i < options.size(); ++i) {
      keys[i] = options[i].first.data();
      values[i].format = MPV_FORMAT_STRING;
      values[i].u.string = options[i].second.data();
    }
    mpv_node_list map{static_cast<int>(values.size()), values.data(),
                      keys.data()};
    mpv_node args[5]{};
    args[0].format = args[1].format = args[2].format = MPV_FORMAT_STRING;
    args[0].u.string = const_cast<char *>("loadfile");
    args[1].u.string = const_cast<char *>(source.c_str());
    args[2].u.string = const_cast<char *>("replace");
    args[3].format = MPV_FORMAT_INT64;
    args[3].u.int64 = -1;
    args[4].format = MPV_FORMAT_NODE_MAP;
    args[4].u.list = &map;
    mpv_node_list list{5, args, nullptr};
    mpv_node command{};
    command.format = MPV_FORMAT_NODE_ARRAY;
    command.u.list = &list;
    Check(mpv_command_node_async(player, id, &command));
    // Commands and requests on this client are ordered. Fetch the newly
    // allocated playlist ID and match START_FILE/END_FILE to it, even when
    // multiple replacements occur before the previous source finishes.
    Check(mpv_get_property_async(player, 1000000 + id, "playlist/0/id",
                                 MPV_FORMAT_INT64));
  }
  void Command(const std::vector<std::string> &args) {
    std::vector<const char *> raw;
    for (const auto &arg : args)
      raw.push_back(arg.c_str());
    raw.push_back(nullptr);
    Check(mpv_command_async(player, generation, raw.data()));
  }
  void Set(const std::string &property, const std::string &value) {
    const char *text = value.c_str();
    Check(mpv_set_property_async(player, generation, property.c_str(),
                                 MPV_FORMAT_STRING, &text));
  }
  PlaybackSnapshot ReadStatus() {
    DrainEvents();
    return snapshot;
  }
  static void Check(int result) {
    if (result < 0)
      throw std::runtime_error(mpv_error_string(result));
  }
  void Close() {
    if (render)
      mpv_render_context_free(render);
    render = nullptr;
    if (player)
      mpv_terminate_destroy(player);
    player = nullptr;
  }
  void DrainEvents() {
    if (!player)
      return;
    while (auto *event = mpv_wait_event(player, 0)) {
      if (event->event_id == MPV_EVENT_NONE)
        break;
      if (event->error < 0 && event->reply_userdata == generation)
        error = mpv_error_string(event->error);
      if (event->event_id == MPV_EVENT_START_FILE && event->data) {
        active_entry =
            static_cast<mpv_event_start_file *>(event->data)->playlist_entry_id;
        loaded = restarted = completed = false;
        snapshot.position_seconds.reset();
      }
      if (event->event_id == MPV_EVENT_GET_PROPERTY_REPLY &&
          event->reply_userdata == 1000000 + generation && event->data) {
        auto *prop = static_cast<mpv_event_property *>(event->data);
        if (event->error >= 0 && prop->format == MPV_FORMAT_INT64 && prop->data)
          expected_entry = *static_cast<int64_t *>(prop->data);
      }
      if (event->event_id == MPV_EVENT_FILE_LOADED)
        loaded = true;
      if (event->event_id == MPV_EVENT_PLAYBACK_RESTART)
        restarted = true;
      if (event->event_id == MPV_EVENT_PROPERTY_CHANGE && event->data) {
        auto *property = static_cast<mpv_event_property *>(event->data);
        if (event->reply_userdata == 1) {
          snapshot.position_seconds.reset();
          if (property->format == MPV_FORMAT_DOUBLE && property->data)
            snapshot.position_seconds = *static_cast<double *>(property->data);
        } else if (event->reply_userdata == 2) {
          snapshot.paused.reset();
          if (property->format == MPV_FORMAT_FLAG && property->data)
            snapshot.paused = *static_cast<int *>(property->data) != 0;
        } else if (event->reply_userdata == 3) {
          snapshot.audio_output.reset();
          if (property->format == MPV_FORMAT_STRING && property->data) {
            const auto *value = *static_cast<char **>(property->data);
            if (value)
              snapshot.audio_output = value;
          }
        } else if (event->reply_userdata == 7 || event->reply_userdata == 8) {
          const int64_t value =
              property->format == MPV_FORMAT_INT64 && property->data
                  ? *static_cast<int64_t *>(property->data)
                  : 0;
          if (event->reply_userdata == 7)
            snapshot.video_width = value;
          else
            snapshot.video_height = value;
        } else if (event->reply_userdata == 4 || event->reply_userdata == 5) {
          const double value =
              property->format == MPV_FORMAT_DOUBLE && property->data
                  ? *static_cast<double *>(property->data)
                  : 0;
          if (event->reply_userdata == 4)
            snapshot.duration_seconds = value;
          else
            snapshot.buffered_seconds = value;
        } else if (event->reply_userdata == 6 &&
                   property->format == MPV_FORMAT_DOUBLE && property->data) {
          snapshot.volume = *static_cast<double *>(property->data);
        }
      }
      if (event->event_id == MPV_EVENT_END_FILE) {
        auto *end = static_cast<mpv_event_end_file *>(event->data);
        if (end && end->playlist_entry_id == expected_entry) {
          if (end->reason == MPV_END_FILE_REASON_ERROR)
            error = mpv_error_string(end->error);
          if (end->reason == MPV_END_FILE_REASON_EOF)
            completed = true;
        }
      }
    }
  }
};

std::shared_ptr<Engine> DesktopEngine();
void ReleaseDesktopEngine();
