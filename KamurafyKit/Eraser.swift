//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

/// How an erase disposes of each file.
public enum EraseMode: Sendable {
    /// Destroyed immediately.
    case shred
    /// Moved to the vault, restorable until it expires.
    case vault(Vault, via: String)
}

/// The one and only place files get removed. Centralizing this means the
/// `SafeZone` check happens in exactly one spot — impossible to bypass.
public enum Eraser {

    /// Erase the selected items that pass the safety perimeter.
    /// - Parameters:
    ///   - items: candidates; only `selected` ones are considered.
    ///   - zones: the caller's declared safe zones (allowlist for `SafeZone`).
    ///   - mode: shred or vault.
    ///   - progress: 0...1, throttled to at most one call per whole percent.
    public static func erase(
        _ items: [JunkItem],
        zones: [URL],
        mode: EraseMode = .shred,
        progress: (@Sendable (Double) -> Void)? = nil
    ) -> EraseReport {
        var report = EraseReport()
        let fm = FileManager.default
        let queue = items.filter(\.selected)
        let count = max(queue.count, 1)
        var lastPct = -1

        for (i, item) in queue.enumerated() {
            defer {
                let pct = (i + 1) * 100 / count
                if pct != lastPct { lastPct = pct; progress?(Double(pct) / 100) }
            }

            guard SafeZone.allows(item.url, within: zones) else {
                report.refused.append(item.url); continue
            }
            do {
                switch mode {
                case .shred:
                    try fm.removeItem(at: item.url)
                case .vault(let vault, let via):
                    try vault.store(item.url, bytes: item.bytes, via: via)
                }
                report.removed += 1
                report.reclaimed += item.bytes
            } catch {
                report.errored.append(item.url)
            }
        }
        return report
    }
}