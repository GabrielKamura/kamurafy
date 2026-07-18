//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation

/// Filesystem measurement. Every size here is *allocated* size (blocks on disk),
/// so the totals match what freeing the file actually gives back.
public enum DiskScanner {

    private static let sizeKeys: [URLResourceKey] = [
        .totalFileAllocatedSizeKey, .fileAllocatedSizeKey, .fileSizeKey,
    ]

    /// Allocated size of one file, preferring the most accurate metric available.
    public static func fileSize(_ url: URL) -> Int64 {
        guard let v = try? url.resourceValues(forKeys: Set(sizeKeys)) else { return 0 }
        if let s = v.totalFileAllocatedSize { return Int64(s) }
        if let s = v.fileAllocatedSize { return Int64(s) }
        if let s = v.fileSize { return Int64(s) }
        return 0
    }

    /// Recursive allocated size of a file or directory tree.
    public static func treeSize(_ url: URL) -> Int64 {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: url.path, isDirectory: &isDir) else { return 0 }
        if !isDir.boolValue { return fileSize(url) }

        guard let walker = fm.enumerator(
            at: url,
            includingPropertiesForKeys: sizeKeys,
            options: [],
            errorHandler: { _, _ in true }   // unreadable child → skip, keep going
        ) else { return 0 }

        var total: Int64 = 0
        for case let child as URL in walker { total += fileSize(child) }
        return total
    }

    /// Immediate children of `dir`, each with its full tree size, biggest first.
    /// Sizes are computed across all cores — a folder of many heavy subfolders
    /// is the common case and it parallelizes cleanly.
    public static func entries(in dir: URL, includeHidden: Bool = true) -> [JunkItem] {
        let fm = FileManager.default
        let opts: FileManager.DirectoryEnumerationOptions = includeHidden ? [] : [.skipsHiddenFiles]
        guard let children = try? fm.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: [.isDirectoryKey], options: opts
        ) else { return [] }

        var sizes = [Int64](repeating: 0, count: children.count)
        sizes.withUnsafeMutableBufferPointer { buf in
            DispatchQueue.concurrentPerform(iterations: children.count) { i in
                buf[i] = treeSize(children[i])
            }
        }

        return zip(children, sizes)
            .filter { $0.1 > 0 }
            .map { JunkItem(url: $0.0, bytes: $0.1) }
            .sorted { $0.bytes > $1.bytes }
    }

    /// Regular files anywhere under `dir` at or above `minBytes`.
    /// Marked unselected: these are the user's own files to review.
    public static func files(under dir: URL, atLeast minBytes: Int64) -> [JunkItem] {
        let fm = FileManager.default
        guard let walker = fm.enumerator(
            at: dir,
            includingPropertiesForKeys: [.isRegularFileKey] + sizeKeys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants],
            errorHandler: { _, _ in true }
        ) else { return [] }

        var out: [JunkItem] = []
        for case let url as URL in walker {
            guard (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true
            else { continue }
            let size = fileSize(url)
            if size >= minBytes {
                out.append(JunkItem(url: url, bytes: size, selected: false))
            }
        }
        return out
    }
}