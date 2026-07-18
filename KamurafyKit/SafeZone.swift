//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

/// Path containment: is `inner` strictly below `outer`?
func isInside(_ inner: URL, _ outer: URL) -> Bool {
    let a = inner.standardizedFileURL.pathComponents
    let b = outer.standardizedFileURL.pathComponents
    guard a.count > b.count else { return false }
    return Array(a.prefix(b.count)) == b
}

/// The safety perimeter. Two independent checks decide whether a path may be
/// erased, and BOTH must pass — one allowlist, one denylist. This is the single
/// authority; nothing else in the app decides deletability.
public enum SafeZone {

    /// Paths that are off-limits no matter what a target requests — the last
    /// backstop against a bug pointing somewhere catastrophic.
    public static let forbidden: [URL] = {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return [
            URL(fileURLWithPath: "/System"),
            URL(fileURLWithPath: "/Library/Keychains"),
            URL(fileURLWithPath: "/bin"),
            URL(fileURLWithPath: "/sbin"),
            URL(fileURLWithPath: "/usr"),
            URL(fileURLWithPath: "/private/var/db"),
            home.appending(path: "Library/Keychains"),
            home.appending(path: "Library/Application Support/com.apple.TCC"),
            home.appending(path: ".ssh"),
            home.appending(path: ".gnupg"),
        ]
    }()

    /// The user's personal protection list, set by the app from its preferences.
    /// Treated exactly like `forbidden` — off-limits for any erase.
    public static var userGuarded: [URL] = []

    public static func isForbidden(_ url: URL) -> Bool {
        let t = url.standardizedFileURL
        if forbidden.contains(where: { t == $0.standardizedFileURL || isInside(t, $0) }) { return true }
        return userGuarded.contains { t == $0.standardizedFileURL || isInside(t, $0) }
    }

    /// May `url` be erased, given the target's declared `zones`?
    /// Rules (both required):
    ///   1. it lives strictly inside one declared zone (a zone root itself is never removable), and
    ///   2. it is not forbidden.
    public static func allows(_ url: URL, within zones: [URL]) -> Bool {
        let t = url.standardizedFileURL
        guard zones.contains(where: { isInside(t, $0) }) else { return false }
        return !isForbidden(t)
    }
}