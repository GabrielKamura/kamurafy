import AppKit
import Darwin

struct EnergyApp: Codable {
    var pid: Int
    var name: String
    var power: Double        // "impacto energético" do top (sem unidade; mesmo número do Monitor de Atividade)
    var isApp: Bool          // é um app com janela (tem ícone), não um processo do sistema
    var icon: String?        // data:image/png;base64,... (32 px) quando é app
}

enum Energy {
    /// Quem mais gasta energia agora. Usa a segunda amostra do `top`
    /// (a primeira sempre vem zerada) e junta processos do mesmo app.
    static func topApps(limit: Int = 8) throws -> [EnergyApp] {
        let text = try runTool("/usr/bin/top", ["-l", "2", "-s", "1", "-o", "power", "-n", "25", "-stats", "pid,power"], timeout: 15)
        guard let lastHeader = text.range(of: "PID", options: .backwards) else { return [] }
        let body = text[lastHeader.upperBound...]
        let me = Int(getpid())

        var byKey: [String: EnergyApp] = [:]
        for line in body.split(separator: "\n").dropFirst() {
            let cols = line.split(separator: " ", omittingEmptySubsequences: true)
            guard cols.count >= 2, let pid = Int(cols[0]), let power = Double(cols[1]), power > 0 else { continue }
            if pid == me { continue }
            guard let (key, name, app) = owner(of: pid) else { continue }   // já terminou
            if name == "top" || key == "proc:top" { continue }
            if var e = byKey[key] {
                e.power += power
                byKey[key] = e
            } else {
                byKey[key] = EnergyApp(pid: Int(app?.processIdentifier ?? pid_t(pid)), name: name, power: power,
                                       isApp: app != nil, icon: app.flatMap { iconData($0) })
            }
        }
        return byKey.values
            .map { var e = $0; e.power = (e.power * 10).rounded() / 10; return e }
            .sorted { $0.power > $1.power }
            .prefix(limit)
            .map { $0 }
    }

    /// Descobre o app "dono" do processo: um helper do Firefox conta como Firefox.
    /// Nomes amigáveis pros processos do sistema que mais aparecem.
    private static let friendly: [String: String] = [
        "WindowServer": "Tela e janelas (WindowServer)",
        "kernel_task": "Núcleo do macOS (kernel_task)",
        "mds": "Spotlight (mds)", "mds_stores": "Spotlight (mds_stores)", "mdworker": "Spotlight (mdworker)",
        "mdworker_shared": "Spotlight (mdworker)", "coreaudiod": "Som do sistema (coreaudiod)",
        "deleted": "Limpeza automática do macOS (deleted)", "bluetoothd": "Bluetooth (bluetoothd)",
        "backupd": "Time Machine (backupd)", "photoanalysisd": "Fotos: análise (photoanalysisd)",
        "cloudd": "iCloud (cloudd)", "bird": "iCloud Drive (bird)", "softwareupdated": "Atualização do macOS",
        "launchd": "Sistema (launchd)", "hidd": "Teclado e trackpad (hidd)", "TouchBarServer": "Touch Bar",
        "coreduetd": "Sugestões do sistema (coreduetd)", "containermanagerd": "Apps em contêiner (containermanagerd)",
        "trustd": "Certificados (trustd)", "nsurlsessiond": "Downloads em segundo plano (nsurlsessiond)",
        "Spotlight": "Spotlight", "powerd": "Energia (powerd)", "corespotlightd": "Spotlight (corespotlightd)",
    ]

    private static func owner(of pid: Int) -> (key: String, name: String, app: NSRunningApplication?)? {
        if let app = NSRunningApplication(processIdentifier: pid_t(pid)), app.activationPolicy != .prohibited {
            return (app.bundleIdentifier ?? "pid\(pid)", app.localizedName ?? "App", app)
        }
        let path = processPath(pid)
        if let appRange = path.range(of: ".app/", options: .caseInsensitive) {
            let bundlePath = String(path[..<appRange.lowerBound]) + ".app"
            if let b = Bundle(path: bundlePath), let id = b.bundleIdentifier,
               let app = NSRunningApplication.runningApplications(withBundleIdentifier: id).first {
                return (id, app.localizedName ?? (bundlePath as NSString).lastPathComponent, app)
            }
            let name = ((bundlePath as NSString).lastPathComponent as NSString).deletingPathExtension
            return ("app:" + bundlePath, name, nil)
        }
        guard !path.isEmpty else { return nil }
        let raw = (path as NSString).lastPathComponent
        return ("proc:" + raw, friendly[raw] ?? raw, nil)
    }

    // proc_pidpath fica na libproc, que o Swift não importa sozinho.
    private typealias ProcPidPath = @convention(c) (Int32, UnsafeMutableRawPointer?, UInt32) -> Int32
    private static let procPidPath: ProcPidPath? = {
        guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "proc_pidpath") else { return nil }
        return unsafeBitCast(sym, to: ProcPidPath.self)
    }()

    private static func processPath(_ pid: Int) -> String {
        guard let f = procPidPath else { return "" }
        var buf = [CChar](repeating: 0, count: 4096)
        let n = buf.withUnsafeMutableBytes { f(Int32(pid), $0.baseAddress, UInt32(4096)) }
        return n > 0 ? String(cString: buf) : ""
    }

    private static func iconData(_ app: NSRunningApplication) -> String? {
        guard let icon = app.icon else { return nil }
        let size = NSSize(width: 32, height: 32)
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 64, pixelsHigh: 64, bitsPerSample: 8,
                                         samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                         colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        rep.size = size
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        icon.draw(in: NSRect(origin: .zero, size: size))
        NSGraphicsContext.restoreGraphicsState()
        guard let png = rep.representation(using: .png, properties: [:]) else { return nil }
        return "data:image/png;base64," + png.base64EncodedString()
    }
}

enum EnergyModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("battery.energyApps") { args in
            let limit = min(max(args.int("limite") ?? 8, 1), 20)
            return try await offMain { try Energy.topApps(limit: limit) }
        }
    }
}
