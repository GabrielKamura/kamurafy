//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Observation
import KamurafyKit

/// The one-tap flow. First tap inspects EVERY target in parallel; second tap
/// erases everything safe (and optionally runs purge). Personal/heuristic finds
/// are surfaced as "to review" and never swept automatically.
@MainActor
@Observable
final class SweepEngine {

    enum Stage: Equatable { case rest, inspecting, primed, sweeping, settled }

    var stage: Stage = .rest
    var inspected = 0
    var targetCount = 0

    private(set) var safe: [String: [JunkItem]] = [:]   // target key → items
    var safeBytes: Int64 = 0
    var safeCount = 0
    var reviewBytes: Int64 = 0
    var reviewCount = 0
    /// Total bytes found per target key (safe + review) — powers the breakdown bar.
    var perTarget: [String: Int64] = [:]

    var progress: Double = 0
    var reclaimed: Int64 = 0
    var removed = 0
    var purgeNote: String?

    private(set) var lastVaulted: [VaultEntry] = []
    var canUndo: Bool { !lastVaulted.isEmpty }

    func reset() {
        stage = .rest; inspected = 0; targetCount = 0
        safe = [:]; safeBytes = 0; safeCount = 0; reviewBytes = 0; reviewCount = 0
        perTarget = [:]
        progress = 0; reclaimed = 0; removed = 0; purgeNote = nil
    }

    // MARK: Tap 1 — inspect

    func inspectAll(_ targets: [any CleanTarget]) async {
        reset()
        stage = .inspecting
        targetCount = targets.count

        var found: [String: [JunkItem]] = [:]
        await withTaskGroup(of: (String, [JunkItem]).self) { group in
            for t in targets {
                group.addTask { (t.key, await t.inspect()) }
            }
            for await (key, items) in group {
                found[key] = items
                inspected += 1
            }
        }

        var seen = Set<String>()
        for t in targets {
            var safeItems: [JunkItem] = []
            var targetBytes: Int64 = 0
            for item in found[t.key] ?? [] {
                guard seen.insert(item.path).inserted else { continue }
                targetBytes += item.bytes
                if item.selected {
                    safeItems.append(item); safeBytes += item.bytes; safeCount += 1
                } else {
                    reviewBytes += item.bytes; reviewCount += 1
                }
            }
            if targetBytes > 0 { perTarget[t.key] = targetBytes }
            if !safeItems.isEmpty { safe[t.key] = safeItems }
        }
        stage = .primed
    }

    // MARK: Undo

    func undo() async {
        let batch = lastVaulted
        lastVaulted = []
        await Task.detached(priority: .userInitiated) {
            for e in batch { try? Vault.shared.restore(e) }
        }.value
        reset()
    }

    // MARK: Tap 2 — sweep

    @discardableResult
    func sweepAll(_ targets: [any CleanTarget], mode: EraseMode = .shred, purge: Bool = true) async -> Set<String> {
        guard stage == .primed, safeCount > 0 else { return [] }
        stage = .sweeping
        progress = 0
        lastVaulted = []
        let started = Date()

        var swept = Set<String>()
        var done = 0
        let grand = max(safeCount, 1)

        for t in targets {
            guard let items = safe[t.key], !items.isEmpty else { continue }
            let zones = t.zones
            let base = done
            let n = items.count
            let report = await Task.detached(priority: .userInitiated) {
                Eraser.erase(items, zones: zones, mode: mode, progress: { p in
                    Task { @MainActor [weak self] in
                        self?.progress = (Double(base) + p * Double(n)) / Double(grand)
                    }
                })
            }.value
            done += n
            reclaimed += report.reclaimed
            removed += report.removed
            let survivors = Set((report.refused + report.errored).map { $0.standardizedFileURL.path })
            for item in items where !survivors.contains(item.path) { swept.insert(item.path) }
        }
        progress = 1

        if case .vault(let vault, _) = mode {
            lastVaulted = vault.entries().filter { $0.arrived >= started }
        }

        if purge {
            do { try MemoryPurge.run(); purgeNote = NSLocalizedString("Memory optimized.", comment: "") }
            catch { purgeNote = NSLocalizedString("Swept — purge skipped.", comment: "") }
        }

        stage = .settled
        return swept
    }
}