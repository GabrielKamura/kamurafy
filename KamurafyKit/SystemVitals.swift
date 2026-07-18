//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Darwin

/// A point-in-time reading of memory and disk.
public struct Vitals: Sendable, Equatable {
    public let ramTotal: UInt64
    public let ramUsed: UInt64
    public let ramFree: UInt64
    /// 0...100, Activity-Monitor-style pressure.
    public let ramPressure: Double
    public let diskFree: Int64
    public let diskTotal: Int64

    public static let zero = Vitals(ramTotal: 0, ramUsed: 0, ramFree: 0, ramPressure: 0, diskFree: 0, diskTotal: 0)

    public var diskUsedFraction: Double {
        diskTotal > 0 ? 1 - Double(diskFree) / Double(diskTotal) : 0
    }
}

/// Honest system readings straight from Mach + the volume resource keys.
public enum SystemVitals {

    public static func read() -> Vitals {
        let (used, free, total, pressure) = ram()
        let (dFree, dTotal) = disk()
        return Vitals(
            ramTotal: total, ramUsed: used, ramFree: free,
            ramPressure: pressure, diskFree: dFree, diskTotal: dTotal
        )
    }

    private static func ram() -> (used: UInt64, free: UInt64, total: UInt64, pressure: Double) {
        let total = ProcessInfo.processInfo.physicalMemory
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(
            MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size
        )
        let host = mach_host_self()
        let kr = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(host, HOST_VM_INFO64, $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return (0, total, total, 0) }

        var page: vm_size_t = 0
        host_page_size(host, &page)
        let ps = UInt64(page)

        let free = UInt64(stats.free_count) * ps
        // "In use" mirrors Activity Monitor: active + wired + compressed.
        let used = (UInt64(stats.active_count) + UInt64(stats.wire_count)
                    + UInt64(stats.compressor_page_count)) * ps
        let pressure = total > 0 ? min(100, Double(used) / Double(total) * 100) : 0
        return (used, free, total, pressure)
    }

    private static func disk() -> (free: Int64, total: Int64) {
        let root = URL(fileURLWithPath: "/")
        let v = try? root.resourceValues(forKeys: [
            .volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey,
        ])
        return (Int64(v?.volumeAvailableCapacityForImportantUsage ?? 0),
                Int64(v?.volumeTotalCapacity ?? 0))
    }
}

/// Runs the system `purge` (needs admin). Frees inactive disk cache from RAM —
/// a genuine but short-lived effect; we present it honestly, not as a booster.
public enum MemoryPurge {
    public enum Failure: LocalizedError {
        case script, run(String)
        public var errorDescription: String? {
            switch self {
            case .script: return "Could not prepare the command."
            case .run(let m): return m
            }
        }
    }

    @MainActor
    public static func run() throws {
        let src = "do shell script \"/usr/sbin/purge\" with administrator privileges"
        guard let script = NSAppleScript(source: src) else { throw Failure.script }
        var err: NSDictionary?
        script.executeAndReturnError(&err)
        if let err { throw Failure.run(err[NSAppleScript.errorMessage] as? String ?? "purge failed") }
    }
}