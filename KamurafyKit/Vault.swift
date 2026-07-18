//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

/// A file resting in the vault: where it came from, what it's stored as, when.
public struct VaultEntry: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let origin: String
    public let stored: String
    public let bytes: Int64
    public let arrived: Date
    public let via: String

    public var name: String { (origin as NSString).lastPathComponent }
}

/// The reversible-delete vault. Erasing sends files here instead of destroying
/// them; they can be restored to their exact origin until the retention window
/// closes, at which point they're truly gone. Thread-safe via a serial queue.
public final class Vault: @unchecked Sendable {

    public static let shared = Vault()

    private let gate = DispatchQueue(label: "kamurafy.vault")
    private let home: URL
    private let payloads: URL
    private let ledgerURL: URL

    public init(base: URL? = nil) {
        let dir = base ?? FileManager.default
            .homeDirectoryForCurrentUser
            .appending(path: "Library/Application Support/Kamurafy/Vault")
        home = dir
        payloads = dir.appending(path: "payloads")
        ledgerURL = dir.appending(path: "ledger.json")
        try? FileManager.default.createDirectory(at: payloads, withIntermediateDirectories: true)
    }

    private func readLedger() -> [VaultEntry] {
        guard let d = try? Data(contentsOf: ledgerURL) else { return [] }
        return (try? JSONDecoder().decode([VaultEntry].self, from: d)) ?? []
    }

    private func writeLedger(_ entries: [VaultEntry]) {
        if let d = try? JSONEncoder().encode(entries) {
            try? d.write(to: ledgerURL, options: .atomic)
        }
    }

    public func entries() -> [VaultEntry] {
        gate.sync { readLedger().sorted { $0.arrived > $1.arrived } }
    }

    public func total() -> Int64 {
        gate.sync { readLedger().reduce(0) { $0 + $1.bytes } }
    }

    /// Move a file into the vault. Throws if the move fails.
    @discardableResult
    public func store(_ url: URL, bytes: Int64, via: String) throws -> VaultEntry {
        try gate.sync {
            let id = UUID()
            try FileManager.default.moveItem(at: url, to: payloads.appending(path: id.uuidString))
            let entry = VaultEntry(
                id: id, origin: url.standardizedFileURL.path,
                stored: id.uuidString, bytes: bytes, arrived: Date(), via: via
            )
            var all = readLedger(); all.append(entry); writeLedger(all)
            return entry
        }
    }

    /// Return a file to where it came from. If the origin is now occupied,
    /// restore alongside it with a "(restored)" suffix.
    public func restore(_ entry: VaultEntry) throws {
        try gate.sync {
            let fm = FileManager.default
            let src = payloads.appending(path: entry.stored)
            guard fm.fileExists(atPath: src.path) else {
                writeLedger(readLedger().filter { $0.id != entry.id }); return
            }
            var dst = URL(fileURLWithPath: entry.origin)
            try? fm.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
            if fm.fileExists(atPath: dst.path) {
                let stem = dst.deletingPathExtension().lastPathComponent
                let ext = dst.pathExtension
                let renamed = ext.isEmpty ? "\(stem) (restored)" : "\(stem) (restored).\(ext)"
                dst = dst.deletingLastPathComponent().appending(path: renamed)
            }
            try fm.moveItem(at: src, to: dst)
            writeLedger(readLedger().filter { $0.id != entry.id })
        }
    }

    public func drop(_ entry: VaultEntry) {
        gate.sync {
            try? FileManager.default.removeItem(at: payloads.appending(path: entry.stored))
            writeLedger(readLedger().filter { $0.id != entry.id })
        }
    }

    /// Truly delete everything older than `days`. No-op when `days <= 0`.
    public func evictOlderThan(days: Int) {
        guard days > 0 else { return }
        let cutoff = Date().addingTimeInterval(-Double(days) * 86_400)
        for e in entries() where e.arrived < cutoff { drop(e) }
    }

    public func empty() { for e in entries() { drop(e) } }
}