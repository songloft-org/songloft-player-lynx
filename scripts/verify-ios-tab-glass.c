#include "../ios/SongloftLynx/SongloftTabGlassMotion.h"
#include <assert.h>
#include <stdio.h>

int main(void) {
  const double frames[] = {0, 1, 1, 0, 1, .9, 1.1, 1, 1, 1, 1, 0};
  assert(SongloftTabGlassFramesValid(frames, 3));
  // Before the start, at peak, during release, and after settling.
  SongloftTabGlassSample sample = SongloftTabGlassSampleAt(frames, 3, 560, 1000, 900);
  assert(!sample.complete && sample.engagement == 0);
  sample = SongloftTabGlassSampleAt(frames, 3, 560, 1000, 1280);
  assert(!sample.complete && sample.engagement == 1);
  sample = SongloftTabGlassSampleAt(frames, 3, 560, 1000, 1420);
  assert(!sample.complete && sample.engagement == .5);
  sample = SongloftTabGlassSampleAt(frames, 3, 560, 1000, 1560);
  assert(sample.complete && sample.engagement == 0);
  sample = SongloftTabGlassSampleAt(frames, 3, 560, 1000, 5000);
  assert(sample.complete && sample.engagement == 0);

  // Interrupted transitions inherit engagement rather than rematerializing.
  const double retarget[] = {1.2, .9, 1.1, .625, 0, 1, 1, 0};
  sample = SongloftTabGlassSampleAt(retarget, 2, 560, 1100, 1100);
  assert(!sample.complete && sample.engagement == .625);

  assert(!SongloftTabGlassFramesValid(NULL, 3));
  assert(!SongloftTabGlassFramesValid(frames, 1));
  assert(!SongloftTabGlassFramesValid(frames, 121));
  const double invalidScale[] = {0, 0, 1, 0, 1, 1, 1, 0};
  const double invalidNumber[] = {0, 1, 1, NAN, 1, 1, 1, 0};
  const double invalidEngagement[] = {0, 1, 1, 1.2, 1, 1, 1, 0};
  assert(!SongloftTabGlassFramesValid(invalidScale, 2));
  assert(!SongloftTabGlassFramesValid(invalidNumber, 2));
  assert(!SongloftTabGlassFramesValid(invalidEngagement, 2));
  assert(SongloftTabGlassSampleAt(frames, 3, 0, 1000, 1100).complete);
  assert(SongloftTabGlassSampleAt(frames, 3, INFINITY, 1000, 1100).complete);
  assert(SongloftTabGlassSampleAt(frames, 3, 560, NAN, 1100).complete);
  assert(SongloftTabGlassSampleAt(frames, 3, 560, 1000, INFINITY).complete);
  puts("iOS glass: native engagement clock, retarget continuity, settling and invalid-input checks passed (UIKit rendering not exercised)");
  return 0;
}
