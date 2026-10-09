#ifndef SONGLOFT_TAB_GLASS_MOTION_H
#define SONGLOFT_TAB_GLASS_MOTION_H

#include <math.h>
#include <stdbool.h>
#include <stddef.h>

// Shared JS optics rows are [position, scaleX, scaleY, engagement]. Keep the
// native sampler independent of UIKit so the real clock math can be verified.
static inline bool SongloftTabGlassFramesValid(const double *frames, size_t count) {
  if (!frames || count < 2 || count > 120) return false;
  for (size_t i = 0; i < count; i++) {
    const double *row = frames + i * 4;
    for (size_t j = 0; j < 4; j++) if (!isfinite(row[j])) return false;
    if (row[1] <= 0 || row[2] <= 0 || row[3] < 0 || row[3] > 1) return false;
  }
  return true;
}

typedef struct {
  double engagement;
  bool complete;
} SongloftTabGlassSample;

static inline SongloftTabGlassSample SongloftTabGlassSampleAt(
    const double *frames, size_t count, double duration, double startedAt, double now) {
  SongloftTabGlassSample sample = {0, true};
  if (!frames || count < 2 || count > 120 || !isfinite(duration) || duration <= 0 ||
      duration > 2000 || !isfinite(startedAt) || !isfinite(now)) return sample;
  const double elapsed = fmax(0, now - startedAt);
  if (elapsed >= duration) return sample;
  const double cursor = elapsed / duration * (count - 1);
  const size_t index = (size_t)fmin(floor(cursor), count - 2);
  const double fraction = cursor - index;
  const double value = frames[index * 4 + 3] * (1 - fraction) + frames[(index + 1) * 4 + 3] * fraction;
  if (!isfinite(value)) return sample;
  sample.engagement = fmax(0, fmin(1, value));
  sample.complete = false;
  return sample;
}

#endif
