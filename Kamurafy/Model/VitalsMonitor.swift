//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Observation
import KamurafyKit

/// Polls system vitals a couple times a second for the live gauges.
@MainActor
@Observable
final class VitalsMonitor {
    var vitals: Vitals = .zero
    @ObservationIgnored private var timer: Timer?

    func begin() {
        refresh()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func end() { timer?.invalidate(); timer = nil }

    func refresh() { vitals = SystemVitals.read() }
}