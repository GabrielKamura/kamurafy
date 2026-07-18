//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import UserNotifications
import KamurafyKit

/// Opt-in background sweeps. Checks hourly; runs on the user's cadence; only
/// touches safe items; never runs purge (that needs a password).
@MainActor
final class Scheduler {
    private let settings: Settings
    private let targets: [any CleanTarget]
    private let engine = SweepEngine()
    private var timer: Timer?

    init(settings: Settings, targets: [any CleanTarget]) {
        self.settings = settings
        self.targets = targets
    }

    func begin() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.tick() }
        }
        Task { try? await Task.sleep(for: .seconds(20)); await tick() }
    }

    func tick() async {
        guard settings.autoSweep else { return }
        let due = Double(settings.sweepEveryDays) * 86_400
        let last = settings.lastAutoSweep ?? .distantPast
        guard Date().timeIntervalSince(last) >= due else { return }

        await engine.inspectAll(targets)
        guard engine.safeCount > 0 else { settings.lastAutoSweep = Date(); return }
        let target = engine.safeBytes
        await engine.sweepAll(targets, mode: settings.eraseMode(via: "Auto sweep"), purge: false)
        settings.lastAutoSweep = Date()
        notify(target)
    }

    private func notify(_ freed: Int64) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge]) { ok, _ in
            guard ok else { return }
            let c = UNMutableNotificationContent()
            c.title = "Kamurafy"
            c.body = String(format: NSLocalizedString("Auto sweep freed %@.", comment: ""),
                            ByteCountFormatter().string(fromByteCount: freed))
            center.add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
        }
    }
}