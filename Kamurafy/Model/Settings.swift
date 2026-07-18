//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Observation
import ServiceManagement
import KamurafyKit

/// Persisted user preferences.
@MainActor
@Observable
final class Settings {
    private let d = UserDefaults.standard

    /// Vault retention in days. 0 = no vault (shred immediately).
    var retentionDays: Int { didSet { d.set(retentionDays, forKey: "retentionDays") } }

    var autoSweep: Bool { didSet { d.set(autoSweep, forKey: "autoSweep") } }
    var sweepEveryDays: Int { didSet { d.set(sweepEveryDays, forKey: "sweepEveryDays") } }
    var lastAutoSweep: Date? { didSet { d.set(lastAutoSweep, forKey: "lastAutoSweep") } }

    var launchAtLogin: Bool {
        didSet {
            d.set(launchAtLogin, forKey: "launchAtLogin")
            try? launchAtLogin ? SMAppService.mainApp.register()
                               : SMAppService.mainApp.unregister()
        }
    }

    init() {
        retentionDays = d.object(forKey: "retentionDays") as? Int ?? 7
        autoSweep = d.bool(forKey: "autoSweep")
        sweepEveryDays = d.object(forKey: "sweepEveryDays") as? Int ?? 7
        lastAutoSweep = d.object(forKey: "lastAutoSweep") as? Date
        launchAtLogin = d.bool(forKey: "launchAtLogin")
    }

    /// The erase mode every flow should use right now.
    func eraseMode(via: String) -> EraseMode {
        retentionDays > 0 ? .vault(.shared, via: via) : .shred
    }
}