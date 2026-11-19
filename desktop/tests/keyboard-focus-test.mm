#include "../native/keyboard_mac.mm"
#include <cassert>

@interface FixtureTextClient : NSView {
  BOOL _textInputActive;
}
- (void)setTextInputActive:(BOOL)value;
@end
@implementation FixtureTextClient
- (void)setTextInputActive:(BOOL)value {
  _textInputActive = value;
}
@end

bool HandleDesktopKey(const std::string &, bool, bool, bool, bool, bool, bool) {
  return false;
}
int main() {
  @autoreleasepool {
    class_addProtocol([FixtureTextClient class], @protocol(NSTextInputClient));
    auto *view = [[FixtureTextClient alloc] init];
    [view setTextInputActive:NO];
    assert(!IsEditing(view));
    [view setTextInputActive:YES];
    assert(IsEditing(view));
    assert(!IsEditing([[NSView alloc] init]));
  }
  return 0;
}
