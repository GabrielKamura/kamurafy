//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Observation
import KamurafyKit

/// Which pane the sidebar is showing.
enum Pane: Hashable {
    case home
    case target(String)   // target key
    case remover
    case vault
}

/// The app's single source of truth.
@MainActor
@Observable
final class AppModel {
    let targets: [any CleanTarget]
    let vitals = VitalsMonitor()
    let sweep = SweepEngine()
    let settings = Settings()
    let updates = UpdateChecker()
    let localizer = Localizer()
    let stats = Stats()
    let exclusions = Exclusions()

    var pane: Pane? = .home
    /// Per-target inspection state, keyed by target key (lazily populated).
    var panes: [String: TargetPane]

    private var scheduler: Scheduler?

    init() {
        let t = Catalog.targets
        targets = t
        panes = Dictionary(uniqueKeysWithValues: t.map { ($0.key, TargetPane(target: $0)) })

        let retention = settings.retentionDays
        Task.detached(priority: .utility) { Vault.shared.evictOlderThan(days: retention) }

        scheduler = Scheduler(settings: settings, targets: t)
        scheduler?.begin()

        // Vitals run continuously so the menu-bar icon can show them live.
        vitals.begin()
    }

    func target(_ key: String) -> (any CleanTarget)? { targets.first { $0.key == key } }
    func targetPane(_ key: String) -> TargetPane? { panes[key] }
}

/// State for one target's screen: inspect → select → erase.
@MainActor
@Observable
final class TargetPane: Identifiable {
    let target: any CleanTarget
    nonisolated var id: String { target.key }

    var items: [JunkItem] = []
    var inspecting = false
    var inspected = false
    var erasing = false
    var progress: Double = 0
    var lastReclaimed: Int64?

    init(target: any CleanTarget) { self.target = target }

    var chosen: [JunkItem] { items.filter(\.selected) }
    var chosenCount: Int { chosen.count }
    var chosenBytes: Int64 { chosen.reduce(0) { $0 + $1.bytes } }
    var allChosen: Bool { !items.isEmpty && items.allSatisfy(\.selected) }

    func inspect() async {
        inspecting = true
        defer { inspecting = false; inspected = true }
        items = await target.inspect()
    }

    func toggle(_ item: JunkItem) {
        guard let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[i].selected.toggle()
    }

    func setAll(_ on: Bool) { for i in items.indices { items[i].selected = on } }

    func erase(mode: EraseMode) async {
        erasing = true; progress = 0
        defer { erasing = false }
        let picked = chosen
        let zones = target.zones
        let report = await Task.detached(priority: .userInitiated) {
            Eraser.erase(picked, zones: zones, mode: mode, progress: { p in
                Task { @MainActor [weak self] in self?.progress = p }
            })
        }.value
        let survivors = Set((report.refused + report.errored).map { $0.standardizedFileURL.path })
        items.removeAll { $0.selected && !survivors.contains($0.path) }
        lastReclaimed = report.reclaimed
    }
}