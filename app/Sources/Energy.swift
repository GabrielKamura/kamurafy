import AppKit
import Darwin

struct EnergyApp: Codable {
    var pid: Int
    var name: String
    var power: Double        // "impacto energético" do top (sem unidade; mesmo número do Monitor de Atividade)
    var isApp: Bool          // é um app com janela (tem ícone)
    var isSystem: Bool       // processo do próprio macOS (/System, /usr, /Library/Apple...)
    var isSelf: Bool         // é o próprio Kamurafy
    var icon: String?        // data:image/png;base64,... (32 px) quando é app
}

enum Energy {
    private static let lock = NSLock()
    private static var cache: (at: TimeInterval, apps: [EnergyApp])?

    /// Quem mais gasta energia agora. Usa a segunda amostra do `top` (a primeira vem
    /// zerada) e soma cada processo no app responsável por ele, como o Monitor de
    /// Atividade faz: abas do Safari contam pro Safari, helpers do Firefox pro Firefox.
    /// Os programas que o próprio Kamurafy roda pra medir (top, pmset) ficam de fora.
    static func topApps(limit: Int = 8) throws -> [EnergyApp] {
        let now = ProcessInfo.processInfo.systemUptime
        lock.lock()
        if let c = cache, now - c.at < 5 { lock.unlock(); return Array(c.apps.prefix(limit)) }
        lock.unlock()

        let text = try runTool("/usr/bin/top", ["-l", "2", "-s", "1", "-o", "power", "-n", "40", "-stats", "pid,power"], timeout: 15)
        guard let lastHeader = text.range(of: "PID", options: .backwards) else { return [] }
        let body = text[lastHeader.upperBound...]
        let me = getpid()

        var byKey: [String: EnergyApp] = [:]
        for line in body.split(separator: "\n").dropFirst() {
            let cols = line.split(separator: " ", omittingEmptySubsequences: true)
            guard cols.count >= 2, let rawPid = Int32(cols[0]), let power = Double(cols[1]), power > 0 else { continue }
            guard let info = procInfo(rawPid) else { continue }           // já terminou
            if info.ppid == me { continue }                               // top/pmset que o Kamurafy disparou
            var pid = rawPid
            if let resp = responsiblePid(rawPid), resp > 1, resp != rawPid { pid = resp }
            guard let o = owner(of: pid, fallbackComm: info.comm) else { continue }
            if var e = byKey[o.key] {
                e.power += power
                byKey[o.key] = e
            } else {
                byKey[o.key] = EnergyApp(pid: Int(pid), name: o.name, power: power, isApp: o.app != nil,
                                         isSystem: o.system, isSelf: pid == me, icon: o.app.flatMap { iconData($0) })
            }
        }
        let list = byKey.values
            .map { var e = $0; e.power = (e.power * 10).rounded() / 10; return e }
            .filter { $0.power >= 0.1 }
            .sorted { $0.power > $1.power }
        lock.lock(); cache = (now, list); lock.unlock()
        return Array(list.prefix(limit))
    }

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
        "com.apple.WebKit.WebContent": "Páginas da web (WebKit)", "com.apple.WebKit.GPU": "Páginas da web: vídeo (WebKit)",
        "com.apple.WebKit.Networking": "Páginas da web: rede (WebKit)", "tccd": "Privacidade (tccd)",
        "Finder": "Finder", "Dock": "Dock", "SystemUIServer": "Barra de menus (SystemUIServer)",
        "ContainerMetadataExtractor": "Arquivos: leitura de metadados",
    ]

    private static func isSystemPath(_ path: String) -> Bool {
        ["/System/", "/usr/", "/sbin/", "/bin/", "/Library/Apple/", "/private/var/"].contains { path.hasPrefix($0) }
    }

    private static func owner(of pid: pid_t, fallbackComm: String) -> (key: String, name: String, app: NSRunningApplication?, system: Bool)? {
        if let app = NSRunningApplication(processIdentifier: pid), app.activationPolicy != .prohibited {
            let path = app.bundleURL?.path ?? ""
            return (app.bundleIdentifier ?? "pid\(pid)", app.localizedName ?? "App", app, isSystemPath(path))
        }
        let path = processPath(pid)
        if let appRange = path.range(of: ".app/", options: .caseInsensitive) {
            let bundlePath = String(path[..<appRange.lowerBound]) + ".app"
            if let b = Bundle(path: bundlePath), let id = b.bundleIdentifier,
               let app = NSRunningApplication.runningApplications(withBundleIdentifier: id).first {
                return (id, app.localizedName ?? (bundlePath as NSString).lastPathComponent, app, isSystemPath(bundlePath))
            }
            let name = ((bundlePath as NSString).lastPathComponent as NSString).deletingPathExtension
            return ("app:" + bundlePath, friendly[name] ?? name, nil, isSystemPath(bundlePath))
        }
        guard !path.isEmpty else { return nil }
        var raw = (path as NSString).lastPathComponent
        // binário com nome de versão (ex.: ~/.local/share/claude/versions/2.1.282)
        if raw.allSatisfy({ $0.isNumber || $0 == "." }) {
            if !fallbackComm.isEmpty, !fallbackComm.allSatisfy({ $0.isNumber || $0 == "." }) {
                raw = fallbackComm
            } else {
                let parts = path.split(separator: "/").map(String.init)
                if let i = parts.lastIndex(of: "versions"), i > 0 { raw = parts[i - 1] }
            }
        }
        return ("proc:" + raw, friendly[raw] ?? raw, nil, isSystemPath(path) || friendly[raw] != nil)
    }

    // ===== funções da libproc/libsystem que o Swift não importa sozinho =====

    private typealias ProcPidPath = @convention(c) (Int32, UnsafeMutableRawPointer?, UInt32) -> Int32
    private typealias RespPid = @convention(c) (Int32) -> Int32
    private static let handle = UnsafeMutableRawPointer(bitPattern: -2)   // RTLD_DEFAULT

    private static let procPidPath: ProcPidPath? = {
        guard let sym = dlsym(handle, "proc_pidpath") else { return nil }
        return unsafeBitCast(sym, to: ProcPidPath.self)
    }()

    /// Processo "responsável" (o app que abriu o helper). API privada estável, sem root.
    private static let respPid: RespPid? = {
        guard let sym = dlsym(handle, "responsibility_get_pid_responsible_for_pid") else { return nil }
        return unsafeBitCast(sym, to: RespPid.self)
    }()

    private static func responsiblePid(_ pid: pid_t) -> pid_t? {
        guard let f = respPid else { return nil }
        let r = f(pid)
        return r > 0 ? r : nil
    }

    private static func processPath(_ pid: pid_t) -> String {
        guard let f = procPidPath else { return "" }
        var buf = [CChar](repeating: 0, count: 4096)
        let n = buf.withUnsafeMutableBytes { f(pid, $0.baseAddress, UInt32(4096)) }
        return n > 0 ? String(cString: buf) : ""
    }

    /// Pai e nome curto (p_comm) do processo, via sysctl.
    private static func procInfo(_ pid: pid_t) -> (ppid: pid_t, comm: String)? {
        var kinfo = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &kinfo, &size, nil, 0) == 0, size > 0 else { return nil }
        let comm = withUnsafeBytes(of: kinfo.kp_proc.p_comm) { raw -> String in
            let bytes = raw.prefix { $0 != 0 }
            return String(decoding: bytes, as: UTF8.self)
        }
        return (kinfo.kp_eproc.e_ppid, comm)
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
