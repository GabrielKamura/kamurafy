//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Observation

/// Lifetime cleaning stats, persisted across launches.
@MainActor
@Observable
final class Stats {
    private let d = UserDefaults.standard

    private(set) var lifetimeFreed: Int64
    private(set) var cleanCount: Int

    init() {
        lifetimeFreed = Int64(d.integer(forKey: "lifetimeFreed"))
        cleanCount = d.integer(forKey: "cleanCount")
    }

    /// Records one completed clean.
    func record(freed: Int64) {
        guard freed > 0 else { return }
        lifetimeFreed += freed
        cleanCount += 1
        d.set(lifetimeFreed, forKey: "lifetimeFreed")
        d.set(cleanCount, forKey: "cleanCount")
    }
}