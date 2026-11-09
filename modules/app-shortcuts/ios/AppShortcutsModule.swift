import ExpoModulesCore
import UIKit

// Home screen quick actions (static UIApplicationShortcutItems, added by
// plugins/withAppShortcuts.js) carry their attend:// deep link in
// userInfo["url"]. UIKit hands the action to the scene delegate, which Expo
// forwards to app delegate subscribers — on a cold start before JS is running.
// So the URL is parked here until JS asks for it (consumePendingURL), and JS
// is told when one arrives while it is already running.

private let shortcutPerformed = Notification.Name("AttendAppShortcutPerformed")

final class PendingShortcut {
  static var url: URL?
}

public class AppShortcutsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard
      let value = shortcutItem.userInfo?["url"] as? String,
      let url = URL(string: value)
    else {
      completionHandler(false)
      return
    }
    PendingShortcut.url = url
    NotificationCenter.default.post(name: shortcutPerformed, object: nil)
    completionHandler(true)
  }
}

public class AppShortcutsModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AppShortcuts")

    Events("onShortcut")

    // Returns the deep link of a quick action not yet handled by JS, once.
    Function("consumePendingURL") { () -> String? in
      let url = PendingShortcut.url?.absoluteString
      PendingShortcut.url = nil
      return url
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: shortcutPerformed,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onShortcut", [:])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }
  }
}
