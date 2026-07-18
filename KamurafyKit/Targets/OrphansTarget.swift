//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

/// Support files stranded by apps you've already removed. Heuristic: it reads
/// the bundle identifiers of every installed app, then flags reverse-DNS-named
/// items in the usual Library folders that match no installed app. Apple items
/// are skipped, and everything arrives UNSELECTED — you confirm each one.
public struct OrphansTarget: CleanTarget {
    public init() {}
    public let key = "orphans"
    public let name = "App Leftovers"
    public let glyph = "questionmark.folder"
    public let blurb = "Preferences and support files from apps you no longer have. Review before removing."

    private struct Spot { let dir: URL; let strip: String }

    private var spots: [Spot] {
        let lib = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Library")
        return [
            Spot(dir: lib.appending(path: "Preferences"), strip: ".plist"),
            Spot(dir: lib.appending(path: "Saved Application State"), strip: ".savedState"),
            Spot(dir: lib.appending(path: "Containers"), strip: ""),
            Spot(dir: lib.appending(path: "Application Support"), strip: ""),
            Spot(dir: lib.appending(path: "HTTPStorages"), strip: ""),
        ]
    }

    public var zones: [URL] { spots.map(\.dir) }

    public func inspect() async -> [JunkItem] {
        let live = Self.installedBundleIDs()
        var out: [JunkItem] = []
        let fm = FileManager.default

        for spot in spots {
            guard let entries = try? fm.contentsOfDirectory(
                at: spot.dir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
            ) else { continue }

            for url in entries {
                var name = url.lastPathComponent
                if !spot.strip.isEmpty {
                    guard name.hasSuffix(spot.strip) else { continue }
                    name = String(name.dropLast(spot.strip.count))
                }
                guard Self.isOrphan(name, live: live) else { continue }
                let size = DiskScanner.treeSize(url)
                guard size > 0 else { continue }
                out.append(JunkItem(url: url, label: name, bytes: size, selected: false))
            }
        }
        return out.sorted { $0.bytes > $1.bytes }
    }

    // MARK: Heuristic (internal for tests)

    static func installedBundleIDs() -> Set<String> {
        let fm = FileManager.default
        let dirs = [
            URL(fileURLWithPath: "/Applications"),
            URL(fileURLWithPath: "/System/Applications"),
            fm.homeDirectoryForCurrentUser.appending(path: "Applications"),
        ]
        var ids = Set<String>()
        for dir in dirs {
            guard let walk = fm.enumerator(
                at: dir, includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles, .skipsPackageDescendants],
                errorHandler: { _, _ in true }
            ) else { continue }
            for case let url as URL in walk where url.pathExtension == "app" {
                if let id = Bundle(url: url)?.bundleIdentifier { ids.insert(id) }
            }
        }
        return ids
    }

    static func looksLikeBundleID(_ s: String) -> Bool {
        if s.contains(" ") || s.contains("/") { return false }
        return s.split(separator: ".").count >= 3
    }

    static func isOrphan(_ name: String, live: Set<String>) -> Bool {
        guard looksLikeBundleID(name) else { return false }
        if name.hasPrefix("com.apple.") { return false }
        return !live.contains(name)
    }
}