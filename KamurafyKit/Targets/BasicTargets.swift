//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

private func home() -> URL { FileManager.default.homeDirectoryForCurrentUser }

/// App & browser caches plus user logs — the safest, highest-yield category.
public struct CachesTarget: CleanTarget {
    public init() {}
    public let key = "caches"
    public let name = "Caches & Logs"
    public let glyph = "shippingbox"
    public let blurb = "App caches, browser caches and logs that pile up in your Library."
    public var zones: [URL] {
        [home().appending(path: "Library/Caches"),
         home().appending(path: "Library/Logs")]
    }
}

/// Regenerable developer caches. Everything here is rebuilt on demand, so it's
/// safe to sweep. Intentionally excludes node_modules and Docker images.
public struct DevTarget: CleanTarget {
    public init() {}
    public let key = "dev"
    public let name = "Developer Junk"
    public let glyph = "wrench.and.screwdriver"
    public let blurb = "Rebuildable caches from Xcode, Homebrew, npm, pip and Gradle."
    public var zones: [URL] {
        let h = home()
        return [
            h.appending(path: "Library/Developer/Xcode/DerivedData"),
            h.appending(path: "Library/Developer/Xcode/Archives"),
            h.appending(path: "Library/Developer/Xcode/iOS DeviceSupport"),
            h.appending(path: "Library/Developer/CoreSimulator/Caches"),
            h.appending(path: "Library/Caches/Homebrew"),
            h.appending(path: ".npm/_cacache"),
            h.appending(path: ".cache"),
            h.appending(path: ".gradle/caches"),
        ]
    }
}

/// The system Trash.
public struct BinTarget: CleanTarget {
    public init() {}
    public let key = "bin"
    public let name = "Trash"
    public let glyph = "trash"
    public let blurb = "Empties the Trash for good."
    public var zones: [URL] { [home().appending(path: ".Trash")] }
}

/// Largest personal files in the usual dumping grounds. Unselected — you decide.
public struct HeavyFilesTarget: CleanTarget {
    public init() {}
    public let key = "heavy"
    public let name = "Large Files"
    public let glyph = "doc.viewfinder"
    public let blurb = "Your biggest files in Downloads, Desktop and Documents. Review before removing."

    public static let floor: Int64 = 100 * 1_000_000   // 100 MB
    public static let cap = 200

    public var zones: [URL] {
        let h = home()
        return [h.appending(path: "Downloads"),
                h.appending(path: "Desktop"),
                h.appending(path: "Documents")]
    }

    public func inspect() async -> [JunkItem] {
        let found = zones.flatMap { DiskScanner.files(under: $0, atLeast: Self.floor) }
        return Array(found.sorted { $0.bytes > $1.bytes }.prefix(Self.cap))
    }
}