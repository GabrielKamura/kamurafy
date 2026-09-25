import Foundation
import IOKit
import IOKit.ps

struct AdapterInfo: Codable {
    var watts: Int?
    var voltageV: Double?
    var currentA: Double?
    var name: String?
    var isWireless: Bool?
}

/// Leitura instantânea da bateria. Contrato em docs/ponte.md (battery.now).
struct BatteryNow: Codable {
    var present: Bool
    var percent: Int                 // carga como o macOS mostra (0–100)
    var currentMah: Int?
    var maxMah: Int?                 // capacidade total hoje
    var designMah: Int?              // capacidade de fábrica
    var healthPct: Double?           // saúde como o macOS mostra (pode passar de 100 em bateria nova)
    var healthPctRaw: Double?        // capacidade bruta do medidor / fábrica
    var cycles: Int?
    var designCycles: Int            // ciclos de vida projetados (1000 nos Macs atuais)
    var temperatureC: Double?
    var voltageV: Double?
    var amperageMa: Int?             // + entrando na bateria, − saindo
    var watts: Double?               // voltageV × amperage; + carregando, − gastando
    var systemWatts: Double?         // quanto o Mac inteiro está puxando agora (quando o medidor informa)
    var isCharging: Bool
    var pluggedIn: Bool
    var fullyCharged: Bool
    var finishingCharge: Bool
    var optimizedChargingEngaged: Bool
    var minutesToFull: Int?
    var minutesToEmpty: Int?
    var adapter: AdapterInfo?
    var cellsMv: [Int]
    var cellSpreadMv: Int?
    var appleCondition: String       // "normal" | "revisao" | "falha" | "desconhecida"
    var permanentFailure: Bool
    var lowPowerMode: Bool
    var thermalState: String         // "normal" | "morno" | "quente" | "critico"
    var status: String               // "saudavel" | "de-olho" | "gasta" | "trocar" | "desconhecida" | "sem-bateria"
    var readAt: Double
}

struct BatteryInfo: Codable {
    var model: String                // "MacBook Pro (16-inch, 2019)"
    var modelId: String              // "MacBookPro16,1"
    var chip: String                 // "Intel Core i7-9750H" / "Apple M2"
    var isAppleSilicon: Bool
    var deviceName: String?          // chip medidor da bateria
    var manufacturer: String?
    var designCycles: Int
    var designMah: Int?
}

enum Battery {
    static func registry() -> [String: Any]? {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSmartBattery"))
        guard service != 0 else { return nil }
        defer { IOObjectRelease(service) }
        var props: Unmanaged<CFMutableDictionary>?
        guard IORegistryEntryCreateCFProperties(service, &props, kCFAllocatorDefault, 0) == KERN_SUCCESS,
              let dict = props?.takeRetainedValue() as? [String: Any] else { return nil }
        return dict
    }

    /// Descrição da bateria interna pela API oficial (a mesma que o ícone do macOS usa).
    static func powerSource() -> [String: Any]? {
        guard let blob = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(blob)?.takeRetainedValue() as? [CFTypeRef] else { return nil }
        for ps in list {
            if let d = IOPSGetPowerSourceDescription(blob, ps)?.takeUnretainedValue() as? [String: Any],
               d.string("Type") == "InternalBattery" {
                return d
            }
        }
        return nil
    }

    static func adapter(_ reg: [String: Any]?) -> AdapterInfo? {
        var d = IOPSCopyExternalPowerAdapterDetails()?.takeRetainedValue() as? [String: Any]
        if d == nil || d?.int("Watts") == nil { d = reg?.dict("AdapterDetails") }
        guard let a = d, let w = a.int("Watts"), w > 0 else { return nil }
        return AdapterInfo(
            watts: w,
            voltageV: a.double("AdapterVoltage").map { $0 / 1000 },
            currentA: a.double("Current").map { $0 / 1000 },
            name: a.string("Name"),
            isWireless: a.bool("IsWireless")
        )
    }

    /// Valor dentro da faixa plausível, senão nil (65535 e afins = medidor sem leitura).
    static func sane(_ v: Int?, _ range: ClosedRange<Int>) -> Int? {
        guard let v, range.contains(v), v != 65535 else { return nil }
        return v
    }

    /// Quanto o Mac inteiro está puxando agora, em watts. No Intel vem em BatteryData
    /// como float de 32 bits guardado num inteiro; no Apple Silicon, em PowerTelemetryData (mW).
    static func systemPower(_ r: [String: Any]) -> Double? {
        var w: Double? = nil
        if let t = r.dict("PowerTelemetryData"), let mw = t.double("SystemPowerIn"), mw > 0 {
            w = mw / 1000
        } else if let bits = r.dict("BatteryData")?.int("SystemPower") {
            let f = Double(Float(bitPattern: UInt32(truncatingIfNeeded: bits)))
            if f.isFinite { w = f }
        }
        guard let v = w, v > 0.5, v < 400 else { return nil }
        return (v * 10).rounded() / 10
    }

    static func thermalState() -> String {
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: return "normal"
        case .fair: return "morno"
        case .serious: return "quente"
        case .critical: return "critico"
        @unknown default: return "normal"
        }
    }

    static func read() -> BatteryNow {
        let reg = registry()
        let ps = powerSource()
        let now = Date().timeIntervalSince1970
        let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled

        guard let r = reg, ps?.bool("Is Present") ?? (r.bool("BatteryInstalled") ?? false) else {
            return BatteryNow(present: false, percent: 0, designCycles: 1000, isCharging: false,
                              pluggedIn: true, fullyCharged: false, finishingCharge: false,
                              optimizedChargingEngaged: false, adapter: adapter(reg), cellsMv: [],
                              appleCondition: "desconhecida", permanentFailure: false, lowPowerMode: lowPower,
                              thermalState: thermalState(), status: "sem-bateria", readAt: now)
        }

        // No Intel, MaxCapacity/CurrentCapacity vêm em mAh; no Apple Silicon vêm em %.
        // AppleRaw* é sempre mAh nos dois. No Apple Silicon, a "Capacidade máxima" dos
        // Ajustes segue NominalChargeCapacity (ou MaximumCapacityPercent, quando existe).
        let rawMax = r.int("AppleRawMaxCapacity") ?? r.int("MaxCapacity")
        let silicon = Machine.isAppleSilicon
        let maxMah = sane(silicon ? (r.int("NominalChargeCapacity") ?? rawMax) : rawMax, 100...30000)
        let curMah = sane(r.int("AppleRawCurrentCapacity") ?? r.int("CurrentCapacity"), 0...30000)
        let design = sane(r.int("DesignCapacity"), 100...30000)
        var health: Double? = nil
        var healthRaw: Double? = nil
        if let d = design {
            if let m = maxMah { health = (Double(m) / Double(d) * 1000).rounded() / 10 }
            if let m = sane(rawMax, 100...30000) { healthRaw = (Double(m) / Double(d) * 1000).rounded() / 10 }
        }
        if silicon, let applePct = sane(r.dict("BatteryData")?.int("MaximumCapacityPercent"), 1...150) {
            health = Double(applePct)
        }

        var percent = ps?.int("Current Capacity") ?? 0
        if ps == nil, let c = curMah, let m = maxMah, m > 0 { percent = Int((Double(c) / Double(m) * 100).rounded()) }

        let designCycles = sane(r.int("DesignCycleCount9C") ?? ps?.int("DesignCycleCount"), 100...10000) ?? 1000
        let cycles = sane(r.int("CycleCount"), 0...20000)
        // 65535 (0xFFFF) e valores fora de faixa = o medidor não sabe
        let tempC = sane(r.int("Temperature"), -2000...9000).map { (Double($0) / 10).rounded() / 10 }
        let voltage = sane(r.int("Voltage") ?? r.dict("BatteryData")?.int("Voltage"), 1000...30000).map { Double($0) / 1000 }
        let amps = sane(r.int("InstantAmperage") ?? r.int("Amperage"), -20000...20000)
        var watts: Double? = nil
        if let v = voltage, let a = amps { watts = (v * Double(a) / 1000 * 10).rounded() / 10 }

        let plugged = ps?.string("Power Source State") == "AC Power" || (r.bool("ExternalConnected") ?? false)
        let charging = ps?.bool("Is Charging") ?? (r.bool("IsCharging") ?? false)
        let full = ps?.bool("Is Charged") ?? (r.bool("FullyCharged") ?? false)

        func minutes(_ v: Int?) -> Int? {
            guard let m = v, m > 0, m < 65535 else { return nil }
            return m
        }
        let toFull = charging ? (minutes(ps?.int("Time to Full Charge")) ?? minutes(r.int("AvgTimeToFull"))) : nil
        let toEmpty = plugged ? nil : (minutes(ps?.int("Time to Empty")) ?? minutes(r.int("AvgTimeToEmpty")))

        let cells = (r.dict("BatteryData")?["CellVoltage"] as? [NSNumber])?.map { $0.intValue }.filter { $0 > 1000 && $0 < 5000 } ?? []
        let spread = cells.count > 1 ? (cells.max()! - cells.min()!) : nil

        let failure = (r.int("PermanentFailureStatus") ?? 0) != 0
        let healthWord = ps?.string("BatteryHealth") ?? ""
        let conditionWord = ps?.string("BatteryHealthCondition") ?? ""
        var condition = "desconhecida"
        if failure || conditionWord.localizedCaseInsensitiveContains("Permanent") {
            condition = "falha"
        } else if !conditionWord.isEmpty || healthWord == "Poor" || healthWord == "Fair" {
            condition = "revisao"
        } else if healthWord == "Good" || healthWord.isEmpty {
            condition = "normal"
        }

        // O status usa a saúde amortecida (mediana dos últimos dias + agora), pra não
        // ficar trocando entre "saudável" e "de olho" a cada recalibração.
        let steady = History.steadyHealth(current: health)
        var status = "saudavel"
        if condition == "falha" || condition == "revisao" {
            status = "trocar"
        } else if steady == nil {
            status = "desconhecida"
        } else if let h = steady, h < 80 {
            status = "gasta"
        } else if let h = steady, h < 85 {
            status = "de-olho"
        } else if let c = cycles, Double(c) >= Double(designCycles) * 0.8 {
            status = "de-olho"
        }

        return BatteryNow(
            present: true, percent: percent, currentMah: curMah, maxMah: maxMah, designMah: design,
            healthPct: health, healthPctRaw: healthRaw, cycles: cycles, designCycles: designCycles, temperatureC: tempC,
            voltageV: voltage.map { ($0 * 1000).rounded() / 1000 }, amperageMa: amps, watts: watts,
            systemWatts: systemPower(r),
            isCharging: charging, pluggedIn: plugged, fullyCharged: full,
            finishingCharge: ps?.bool("Is Finishing Charge") ?? false,
            optimizedChargingEngaged: ps?.bool("Optimized Battery Charging Engaged") ?? false,
            minutesToFull: toFull, minutesToEmpty: toEmpty, adapter: plugged ? adapter(r) : nil,
            cellsMv: cells, cellSpreadMv: spread, appleCondition: condition, permanentFailure: failure,
            lowPowerMode: lowPower, thermalState: thermalState(), status: status, readAt: now
        )
    }

    static func info() -> BatteryInfo {
        let reg = registry()
        return BatteryInfo(
            model: Machine.marketingName(),
            modelId: Machine.sysctlString("hw.model") ?? "Mac",
            chip: Machine.chip(),
            isAppleSilicon: Machine.isAppleSilicon,
            deviceName: reg?.string("DeviceName"),
            manufacturer: reg?.string("Manufacturer"),
            designCycles: reg?.int("DesignCycleCount9C") ?? 1000,
            designMah: reg?.int("DesignCapacity")
        )
    }
}

enum Machine {
    static func sysctlString(_ name: String) -> String? {
        var size = 0
        guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 0 else { return nil }
        var buf = [CChar](repeating: 0, count: size)
        guard sysctlbyname(name, &buf, &size, nil, 0) == 0 else { return nil }
        return String(cString: buf)
    }

    static func sysctlInt(_ name: String) -> Int? {
        var v: Int64 = 0
        var size = MemoryLayout<Int64>.size
        guard sysctlbyname(name, &v, &size, nil, 0) == 0 else { return nil }
        return Int(v)
    }

    static var isAppleSilicon: Bool {
        (sysctlInt("hw.optional.arm64") ?? 0) == 1
    }

    /// Nome comercial ("MacBook Pro (16-inch, 2019)"), que o próprio macOS guarda em cache.
    static func marketingName() -> String {
        let plist = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Preferences/com.apple.SystemProfiler.plist")
        if let d = NSDictionary(contentsOf: plist) as? [String: Any],
           let names = d["CPU Names"] as? [String: String], !names.isEmpty {
            // chaves tipo "MD6M-en-BR_BR": prefere a do idioma atual
            let lang = Locale.current.identifier
            if let hit = names.first(where: { $0.key.hasSuffix(lang) }) { return hit.value }
            return names.sorted { $0.key < $1.key }.first!.value
        }
        // Apple Silicon: o nome comercial está na árvore de dispositivos
        let product = IORegistryEntryFromPath(kIOMainPortDefault, "IODeviceTree:/product")
        if product != 0 {
            defer { IOObjectRelease(product) }
            if let cf = IORegistryEntryCreateCFProperty(product, "product-name" as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue(),
               let data = cf as? Data {
                let name = String(decoding: data, as: UTF8.self).trimmingCharacters(in: CharacterSet(charactersIn: "\0").union(.whitespaces))
                if !name.isEmpty { return name }
            }
        }
        let id = sysctlString("hw.model") ?? "Mac"
        if id.hasPrefix("MacBookPro") { return "MacBook Pro" }
        if id.hasPrefix("MacBookAir") { return "MacBook Air" }
        if id.hasPrefix("MacBook") { return "MacBook" }
        return id
    }

    static func chip() -> String {
        let raw = sysctlString("machdep.cpu.brand_string") ?? "Processador"
        // "Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz" → "Intel Core i7-9750H"
        var s = raw.replacingOccurrences(of: "(R)", with: "").replacingOccurrences(of: "(TM)", with: "")
        if let at = s.range(of: " CPU @") { s = String(s[..<at.lowerBound]) }
        return s.split(separator: " ").joined(separator: " ")
    }
}

enum BatteryModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("battery.now") { _ in Battery.read() }
        r.register("battery.info") { _ in Battery.info() }
    }
}
