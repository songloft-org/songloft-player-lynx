#import "SongloftTabGlassUI.h"
#import "SongloftTabGlassMotion.h"
#import <Lynx/LynxComponentRegistry.h>
#import <Lynx/LynxPropsProcessor.h>
#import <Lynx/LynxUIMethodProcessor.h>
#import <QuartzCore/QuartzCore.h>

#if defined(__IPHONE_OS_VERSION_MAX_ALLOWED) && defined(__IPHONE_26_0) && \
    (__IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_26_0)
#import <UIKit/UIGlassEffect.h>
#define SONGLOFT_GLASS_AVAILABLE 1
#else
#define SONGLOFT_GLASS_AVAILABLE 0
#endif

@class SongloftTabGlassView;

// CADisplayLink retains its target. The proxy never retains the view, so a
// removed page cannot be kept alive by its optical animation.
@interface SongloftGlassTick : NSObject
@property(nonatomic, weak) SongloftTabGlassView *view;
- (void)tick:(CADisplayLink *)link;
@end

@interface SongloftTabGlassView : UIVisualEffectView
- (BOOL)animateFrames:(NSData *)frames duration:(double)duration startedAt:(double)startedAt;
- (void)tick;
- (void)cancelGlass;
@end

@implementation SongloftGlassTick
- (void)tick:(CADisplayLink *)link {
  if (self.view) [self.view tick];
  else [link invalidate];
}
@end

@implementation SongloftTabGlassView {
  UIViewPropertyAnimator *_material;
  CADisplayLink *_displayLink;
  NSData *_frames;
  double _duration;
  double _startedAt;
}

- (instancetype)init {
  self = [super initWithEffect:nil];
  if (self) {
    self.userInteractionEnabled = NO;
    self.isAccessibilityElement = NO;
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(backgrounded:)
        name:UIApplicationDidEnterBackgroundNotification object:nil];
    for (NSNotificationName name in @[UIAccessibilityReduceMotionStatusDidChangeNotification,
        UIAccessibilityReduceTransparencyStatusDidChangeNotification,
        UIAccessibilityDarkerSystemColorsStatusDidChangeNotification]) {
      [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(accessibilityChanged:)
          name:name object:nil];
    }
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  self.layer.cornerRadius = MIN(self.bounds.size.width, self.bounds.size.height) / 2;
  self.clipsToBounds = YES;
}

- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (!self.window) [self cancelGlass];
}

- (void)backgrounded:(NSNotification *)notification { [self cancelGlass]; }

- (void)accessibilityChanged:(NSNotification *)notification {
  if (UIAccessibilityIsReduceMotionEnabled() || UIAccessibilityIsReduceTransparencyEnabled() ||
      UIAccessibilityDarkerSystemColorsEnabled()) [self cancelGlass];
}

- (BOOL)animateFrames:(NSData *)frames duration:(double)duration startedAt:(double)startedAt {
  [_displayLink invalidate];
  _displayLink = nil;
  if (!self.window || UIAccessibilityIsReduceMotionEnabled() ||
      UIAccessibilityIsReduceTransparencyEnabled() || UIAccessibilityDarkerSystemColorsEnabled()) {
    [self cancelGlass];
    return NO;
  }
#if SONGLOFT_GLASS_AVAILABLE
  if (@available(iOS 26.0, *)) {
    if (!_material) {
      UIGlassEffect *glass = [UIGlassEffect effectWithStyle:UIGlassEffectStyleClear];
      glass.interactive = NO;
      __weak SongloftTabGlassView *weakSelf = self;
      _material = [[UIViewPropertyAnimator alloc] initWithDuration:1 curve:UIViewAnimationCurveLinear
          animations:^{ weakSelf.effect = glass; }];
      _material.scrubsLinearly = YES;
      _material.pausesOnCompletion = YES;
      [_material startAnimation];
      [_material pauseAnimation];
      _material.fractionComplete = 0;
    }
    // Reuse the paused material animator on retarget. The first shared sample
    // carries current engagement; do not reset the visible glass to zero.
    _frames = [frames copy];
    _duration = duration;
    _startedAt = startedAt;
    [self tick];
    if (!_frames) return YES;
    SongloftGlassTick *target = [SongloftGlassTick new];
    target.view = self;
    _displayLink = [CADisplayLink displayLinkWithTarget:target selector:@selector(tick:)];
    [_displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
    return YES;
  }
#endif
  [self cancelGlass];
  return NO;
}

- (void)tick {
  if (!_frames) return;
  SongloftTabGlassSample sample = SongloftTabGlassSampleAt(_frames.bytes,
      _frames.length / (4 * sizeof(double)), _duration, _startedAt,
      NSDate.date.timeIntervalSince1970 * 1000);
  if (sample.complete) { [self cancelGlass]; return; }
  // Apple requires effect interpolation, not alpha on the effect or its
  // ancestors. Geometry is owned by the actual Lynx capsule parent.
  _material.fractionComplete = sample.engagement;
}

- (void)cancelGlass {
  [_displayLink invalidate];
  _displayLink = nil;
  _frames = nil;
  if (_material.state == UIViewAnimatingStateActive) [_material stopAnimation:YES];
  _material = nil;
  [UIView performWithoutAnimation:^{ self.effect = nil; }];
}

- (void)dealloc {
  [_displayLink invalidate];
  if (_material.state == UIViewAnimatingStateActive) [_material stopAnimation:YES];
  [NSNotificationCenter.defaultCenter removeObserver:self];
}
@end

@implementation SongloftTabGlassUI

+ (void)registerComponent {
  [LynxComponentRegistry registerUI:self withName:@"songloft-tab-glass"];
}

+ (BOOL)supportsSystemGlass {
#if SONGLOFT_GLASS_AVAILABLE
  if (@available(iOS 26.0, *)) return YES;
#endif
  return NO;
}

+ (BOOL)isRegistered {
  if (![self supportsSystemGlass]) return NO;
  BOOL legal = NO;
  return [LynxComponentRegistry uiClassWithName:@"songloft-tab-glass" accessible:&legal] == self && legal;
}

- (UIVisualEffectView *)createView { return [SongloftTabGlassView new]; }

LYNX_PROP_SETTER("ios-user-interface-style", setUserInterfaceStyle, NSString *) {
  self.view.overrideUserInterfaceStyle = !requestReset && [value isEqualToString:@"dark"]
      ? UIUserInterfaceStyleDark : (!requestReset && [value isEqualToString:@"light"]
      ? UIUserInterfaceStyleLight : UIUserInterfaceStyleUnspecified);
}

LYNX_UI_METHOD(animateTabLens) {
  if (!NSThread.isMainThread) {
    __weak SongloftTabGlassUI *weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{
      SongloftTabGlassUI *ui = weakSelf;
      if (ui) [ui animateTabLens:params withResult:callback];
      else callback(kUIMethodInvalidStateError, @{});
    });
    return;
  }
  SongloftTabGlassView *view = (SongloftTabGlassView *)self.view;
  NSNumber *duration = params[@"duration"], *count = params[@"count"], *start = params[@"startedAt"];
  if ([duration isKindOfClass:NSNumber.class] && duration.doubleValue == 0) {
    [view cancelGlass];
    callback(kUIMethodSuccess, @{});
    return;
  }
  NSArray *rows = params[@"frames"];
  const double startedAt = start ? ([start isKindOfClass:NSNumber.class] ? start.doubleValue : NAN)
      : NSDate.date.timeIntervalSince1970 * 1000;
  if (![duration isKindOfClass:NSNumber.class] || !isfinite(duration.doubleValue) ||
      duration.doubleValue <= 0 || duration.doubleValue > 2000 ||
      ![count isKindOfClass:NSNumber.class] || !isfinite(count.doubleValue) ||
      count.doubleValue < 1 || count.doubleValue > 10 || floor(count.doubleValue) != count.doubleValue ||
      !isfinite(startedAt) || ![rows isKindOfClass:NSArray.class] || rows.count < 2 || rows.count > 120) {
    [view cancelGlass];
    callback(kUIMethodParamInvalid, @{});
    return;
  }
  double values[120 * 4];
  for (NSUInteger i = 0; i < rows.count; i++) {
    NSArray *row = rows[i];
    if (![row isKindOfClass:NSArray.class] || row.count != 4) {
      [view cancelGlass]; callback(kUIMethodParamInvalid, @{}); return;
    }
    for (NSUInteger j = 0; j < 4; j++) {
      if (![row[j] isKindOfClass:NSNumber.class]) {
        [view cancelGlass]; callback(kUIMethodParamInvalid, @{}); return;
      }
      values[i * 4 + j] = [row[j] doubleValue];
    }
  }
  if (!SongloftTabGlassFramesValid(values, rows.count)) {
    [view cancelGlass]; callback(kUIMethodParamInvalid, @{}); return;
  }
  NSData *frames = [NSData dataWithBytes:values length:rows.count * 4 * sizeof(double)];
  BOOL started = [view animateFrames:frames duration:duration.doubleValue startedAt:startedAt];
  callback(started ? kUIMethodSuccess : kUIMethodInvalidStateError, @{});
}

- (void)detachView {
  [(SongloftTabGlassView *)self.view cancelGlass];
  [super detachView];
}
@end
