import Foundation
import Darwin

struct CPUInfo: Codable {
    var usagePct: Double     // 0–100, média de todos os núcleos
    var userPct: Double
    var systemPct: Double
    var cores: Int
    var chip: String
}

struct MemoryInfo: Codable {
    var totalBytes: UInt64
    var usedBytes: UInt64        // app + wired + compressed (o "Memória usada" do Monitor de Atividade)
    var appBytes: UInt64
    var wiredBytes: UInt64
    var compressedBytes: UInt64
    var cachedBytes: UInt64      // arquivos em cache: o macOS devolve quando precisa
    var freeBytes: UInt64
    var swapUsedBytes: UInt64
    var pressure: String         // "normal" | "atencao" | "critica"
}

struct DiskInfo: Codable {
    var name: String
    var totalBytes: UInt64
    var freeBytes: UInt64            // livre de verdade agora
    var availableBytes: UInt64       // livre + o que o macOS consegue liberar (purgeable)
    var usedBytes: UInt64
}

struct SystemNow: Codable {
    var cpu: CPUInfo
    var memory: MemoryInfo
    var disk: DiskInfo
    var uptimeSec: Double
    var model: String
    var modelId: String
    var macOS: String            // "13.7.8"
    var thermalState: String     // "normal" | "morno" | "quente" | "critico"
    var readAt: Double
}

enum SystemInfo {
    private static var lastTicks: (user: UInt64, sys: UInt64, idle: UInt64, nice: UInt64)?
    private static let lock = NSLock()

    private static func cpuTicks() -> (user: UInt64, sys: UInt64, idle: UInt64, nice: UInt64)? {
        var info = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.size / MemoryLayout<integer_t>.size)
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return nil }
        return (UInt64(info.cpu_ticks.0), UInt64(info.cpu_ticks.1), UInt64(info.cpu_ticks.2), UInt64(info.cpu_ticks.3))
    }

    static func cpu() -> CPUInfo {
        lock.lock(); defer { lock.unlock() }
        var prev = lastTicks
        if prev == nil {
            prev = cpuTicks()
            usleep(250_000)
        }
        let cur = cpuTicks()
        lastTicks = cur
        var user = 0.0, sys = 0.0
        if let p = prev, let c = cur {
            let du = Double(c.user &- p.user) + Double(c.nice &- p.nice)
            let ds = Double(c.sys &- p.sys)
            let di = Double(c.idle &- p.idle)
            let total = du + ds + di
            if total > 0 { user = du / total * 100; sys = ds / total * 100 }
        }
        func r(_ v: Double) -> Double { (v * 10).rounded() / 10 }
        return CPUInfo(usagePct: r(user + sys), userPct: r(user), systemPct: r(sys),
                       cores: ProcessInfo.processInfo.activeProcessorCount, chip: Machine.chip())
    }

    static func memory() -> MemoryInfo {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
        let kr = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        let total = ProcessInfo.processInfo.physicalMemory
        var swap = xsw_usage()
        var swapSize = MemoryLayout<xsw_usage>.size
        sysctlbyname("vm.swapusage", &swap, &swapSize, nil, 0)

        var level: Int32 = 1
        var levelSize = MemoryLayout<Int32>.size
        sysctlbyname("kern.memorystatus_vm_pressure_level", &level, &levelSize, nil, 0)
        let pressure = level >= 4 ? "critica" : (level >= 2 ? "atencao" : "normal")

        guard kr == KERN_SUCCESS else {
            return MemoryInfo(totalBytes: total, usedBytes: 0, appBytes: 0, wiredBytes: 0, compressedBytes: 0,
                              cachedBytes: 0, freeBytes: 0, swapUsedBytes: swap.xsu_used, pressure: pressure)
        }
        let page = UInt64(vm_kernel_page_size)
        let internalPages = UInt64(stats.internal_page_count)
        let purgeable = UInt64(stats.purgeable_count)
        let app = (internalPages > purgeable ? internalPages - purgeable : 0) * page
        let wired = UInt64(stats.wire_count) * page
        let compressed = UInt64(stats.compressor_page_count) * page
        let cached = (UInt64(stats.external_page_count) + purgeable) * page
        let used = app + wired + compressed
        let free = total > used + cached ? total - used - cached : 0
        return MemoryInfo(totalBytes: total, usedBytes: used, appBytes: app, wiredBytes: wired,
                          compressedBytes: compressed, cachedBytes: cached, freeBytes: free,
                          swapUsedBytes: swap.xsu_used, pressure: pressure)
    }

    static func disk() -> DiskInfo {
        let url = URL(fileURLWithPath: "/")
        let keys: Set<URLResourceKey> = [.volumeNameKey, .volumeTotalCapacityKey, .volumeAvailableCapacityKey,
                                         .volumeAvailableCapacityForImportantUsageKey]
        let v = try? url.resourceValues(forKeys: keys)
        let total = UInt64(v?.volumeTotalCapacity ?? 0)
        let free = UInt64(v?.volumeAvailableCapacity ?? 0)
        let important = UInt64(v?.volumeAvailableCapacityForImportantUsage ?? Int64(free))
        let available = max(free, important)
        return DiskInfo(name: v?.volumeName ?? "Macintosh HD", totalBytes: total, freeBytes: free,
                        availableBytes: available, usedBytes: total > available ? total - available : 0)
    }

    /// Tempo desde que o Mac foi ligado (conta o tempo dormindo, como o `uptime`).
    static func uptime() -> Double {
        var tv = timeval()
        var size = MemoryLayout<timeval>.size
        guard sysctlbyname("kern.boottime", &tv, &size, nil, 0) == 0, tv.tv_sec > 0 else {
            return ProcessInfo.processInfo.systemUptime
        }
        return Date().timeIntervalSince1970 - Double(tv.tv_sec)
    }

    static func now() -> SystemNow {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        let version = v.patchVersion > 0 ? "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)" : "\(v.majorVersion).\(v.minorVersion)"
        return SystemNow(cpu: cpu(), memory: memory(), disk: disk(),
                         uptimeSec: uptime(),
                         model: Machine.marketingName(), modelId: Machine.sysctlString("hw.model") ?? "Mac",
                         macOS: version, thermalState: Battery.thermalState(),
                         readAt: Date().timeIntervalSince1970)
    }
}

enum SystemModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("system.now") { _ in try await offMain { SystemInfo.now() } }
    }
}
