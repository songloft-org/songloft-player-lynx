#import <UIKit/UIKit.h>
#import <Lynx/LynxUI.h>

NS_ASSUME_NONNULL_BEGIN

@interface SongloftTabGlassUI : LynxUI<UIVisualEffectView *>
+ (void)registerComponent;
+ (BOOL)supportsSystemGlass;
+ (BOOL)isRegistered;
@end

NS_ASSUME_NONNULL_END
