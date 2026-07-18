//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

/// A category of things to clean. Implementers declare the folders they own
/// (`zones`, the SafeZone allowlist) and how to `inspect` them.
///
/// The default `inspect` lists each zone's top-level entries by size — enough
/// for cache-style targets. Targets with special logic override it.
public protocol CleanTarget: Sendable {
    var key: String { get }
    var name: String { get }
    var glyph: String { get }              // SF Symbol
    var blurb: String { get }
    var zones: [URL] { get }
    func inspect() async -> [JunkItem]
}

public extension CleanTarget {
    func inspect() async -> [JunkItem] {
        zones.flatMap { DiskScanner.entries(in: $0) }
             .sorted { $0.bytes > $1.bytes }
    }
}

/// The catalog of every target the app ships with. Registering a target =
/// adding it here.
public enum Catalog {
    public static var targets: [any CleanTarget] {
        [
            CachesTarget(),
            DevTarget(),
            OrphansTarget(),
            HeavyFilesTarget(),
            DuplicatesTarget(),
            BinTarget(),
        ]
    }
}