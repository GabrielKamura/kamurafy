//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Observation
import KamurafyKit

/// The user's personal protection list: paths Kamurafy must never touch, on top
/// of the built-in `SafeZone.forbidden`. Persisted, and pushed into the core so
/// every erase respects it.
@MainActor
@Observable
final class Exclusions {
    private let d = UserDefaults.standard
    private(set) var paths: [String]

    init() {
        paths = d.stringArray(forKey: "excludedPaths") ?? []
        sync()
    }

    func add(_ url: URL) {
        let p = url.standardizedFileURL.path
        guard !paths.contains(p) else { return }
        paths.append(p)
        persist()
    }

    func remove(_ path: String) {
        paths.removeAll { $0 == path }
        persist()
    }

    private func persist() {
        d.set(paths, forKey: "excludedPaths")
        sync()
    }

    /// Mirror the list into the core's safety perimeter.
    private func sync() {
        SafeZone.userGuarded = paths.map { URL(fileURLWithPath: $0) }
    }
}