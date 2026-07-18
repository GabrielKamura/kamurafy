//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

/// A single thing a target found: a file or folder that can be removed.
///
/// `selected` carries the target's recommendation — safe junk arrives selected,
/// personal or heuristic finds arrive unselected so the one-tap sweep never
/// touches them.
public struct JunkItem: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let url: URL
    public let label: String
    public let bytes: Int64
    public var selected: Bool

    public init(url: URL, label: String? = nil, bytes: Int64, selected: Bool = true) {
        self.id = UUID()
        self.url = url
        self.label = label ?? url.lastPathComponent
        self.bytes = bytes
        self.selected = selected
    }

    /// Normalized filesystem path — the canonical key for dedup and safety checks.
    public var path: String { url.standardizedFileURL.path }
}

/// Outcome of an erase pass.
public struct EraseReport: Sendable {
    public var removed: Int = 0
    public var reclaimed: Int64 = 0
    /// Paths the SafeZone refused (never touched).
    public var refused: [URL] = []
    /// Paths that errored mid-remove (e.g. in use, permission).
    public var errored: [URL] = []
    public init() {}
}