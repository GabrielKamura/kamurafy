//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

/// An installed application, candidate for full removal.
public struct Application: Identifiable, Hashable, Sendable {
    public var id: String { url.path }
    public let name: String
    public let bundleID: String
    public let url: URL
    public var bytes: Int64

    public init(name: String, bundleID: String, url: URL, bytes: Int64 = 0) {
        self.name = name; self.bundleID = bundleID; self.url = url; self.bytes = bytes
    }
}

/// Complete uninstall: the .app plus every trace it spread through Library, found
/// by EXACT bundle-id match (no heuristics), so the plan is safe to act on.
public enum AppRemover {

    public static func installed() -> [Application] {
        let fm = FileManager.default
        let dirs = [
            URL(fileURLWithPath: "/Applications"),
            fm.homeDirectoryForCurrentUser.appending(path: "Applications"),
        ]
        var apps: [Application] = []
        for dir in dirs {
            guard let entries = try? fm.contentsOfDirectory(
                at: dir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
            ) else { continue }
            for url in entries where url.pathExtension == "app" {
                guard let b = Bundle(url: url), let id = b.bundleIdentifier else { continue }
                if id.hasPrefix("com.apple.") || id == Bundle.main.bundleIdentifier { continue }
                let name = (b.infoDictionary?["CFBundleDisplayName"] as? String)
                    ?? (b.infoDictionary?["CFBundleName"] as? String)
                    ?? url.deletingPathExtension().lastPathComponent
                apps.append(Application(name: name, bundleID: id, url: url))
            }
        }
        return apps.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    static func traceLocations(_ bundleID: String, home: URL) -> [URL] {
        let lib = home.appending(path: "Library")
        return [
            lib.appending(path: "Preferences/\(bundleID).plist"),
            lib.appending(path: "Caches/\(bundleID)"),
            lib.appending(path: "Logs/\(bundleID)"),
            lib.appending(path: "Saved Application State/\(bundleID).savedState"),
            lib.appending(path: "Containers/\(bundleID)"),
            lib.appending(path: "Application Support/\(bundleID)"),
            lib.appending(path: "HTTPStorages/\(bundleID)"),
            lib.appending(path: "WebKit/\(bundleID)"),
            lib.appending(path: "Application Scripts/\(bundleID)"),
        ]
    }

    /// Every trace of `app` present on disk (the bundle first), each sized.
    public static func plan(_ app: Application) -> [JunkItem] {
        let fm = FileManager.default
        var items = [JunkItem(
            url: app.url, label: "\(app.name).app",
            bytes: app.bytes > 0 ? app.bytes : DiskScanner.treeSize(app.url)
        )]
        for url in traceLocations(app.bundleID, home: fm.homeDirectoryForCurrentUser)
        where fm.fileExists(atPath: url.path) {
            items.append(JunkItem(url: url, bytes: DiskScanner.treeSize(url)))
        }
        return items
    }

    /// SafeZone allowlist for removing `app` — the app's folder and the Library dirs.
    public static func zones(_ app: Application) -> [URL] {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let lib = home.appending(path: "Library")
        return [
            app.url.deletingLastPathComponent(),
            lib.appending(path: "Preferences"),
            lib.appending(path: "Caches"),
            lib.appending(path: "Logs"),
            lib.appending(path: "Saved Application State"),
            lib.appending(path: "Containers"),
            lib.appending(path: "Application Support"),
            lib.appending(path: "HTTPStorages"),
            lib.appending(path: "WebKit"),
            lib.appending(path: "Application Scripts"),
        ]
    }
}