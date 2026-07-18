//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import CryptoKit

/// Byte-identical files across Downloads, Desktop and Documents, found with a
/// three-stage funnel so it stays fast on full disks:
///   1. bucket by exact size (no reads)
///   2. hash the first 128 KB of same-size files
///   3. full SHA-256 only where the prefix still collides
/// The oldest copy in each group is kept; the rest are listed UNSELECTED.
public struct DuplicatesTarget: CleanTarget {
    public init() {}
    public let key = "dupes"
    public let name = "Duplicates"
    public let glyph = "doc.on.doc"
    public let blurb = "Identical files in Downloads, Desktop and Documents. The oldest copy is kept."

    public static let floor: Int64 = 1_000_000   // 1 MB

    public var zones: [URL] {
        let h = FileManager.default.homeDirectoryForCurrentUser
        return [h.appending(path: "Downloads"),
                h.appending(path: "Desktop"),
                h.appending(path: "Documents")]
    }

    public func inspect() async -> [JunkItem] {
        let all = zones.flatMap { DiskScanner.files(under: $0, atLeast: Self.floor) }

        var bySize: [Int64: [JunkItem]] = [:]
        for f in all { bySize[f.bytes, default: []].append(f) }

        var byPrefix: [String: [JunkItem]] = [:]
        for group in bySize.values where group.count > 1 {
            for f in group {
                guard let h = Self.digest(f.url, cap: 128 * 1024) else { continue }
                byPrefix["\(f.bytes):\(h)", default: []].append(f)
            }
        }

        var byFull: [String: [JunkItem]] = [:]
        for group in byPrefix.values where group.count > 1 {
            for f in group {
                guard let h = Self.digest(f.url, cap: nil) else { continue }
                byFull[h, default: []].append(f)
            }
        }

        var out: [JunkItem] = []
        for group in byFull.values where group.count > 1 {
            let ordered = group.sorted { Self.born($0.url) < Self.born($1.url) }
            let keep = ordered[0]
            for dupe in ordered.dropFirst() {
                out.append(JunkItem(
                    url: dupe.url,
                    label: "\(dupe.url.lastPathComponent)  ≡  \(keep.url.lastPathComponent)",
                    bytes: dupe.bytes, selected: false
                ))
            }
        }
        return out.sorted { $0.bytes > $1.bytes }
    }

    static func digest(_ url: URL, cap: Int?) -> String? {
        guard let fh = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? fh.close() }
        var sha = SHA256()
        var left = cap ?? Int.max
        while left > 0 {
            guard let chunk = try? fh.read(upToCount: Swift.min(1 << 20, left)),
                  !chunk.isEmpty else { break }
            sha.update(data: chunk)
            left -= chunk.count
        }
        return sha.finalize().map { String(format: "%02x", $0) }.joined()
    }

    static func born(_ url: URL) -> Date {
        (try? url.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast
    }
}