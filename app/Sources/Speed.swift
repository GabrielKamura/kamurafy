import AppKit
import Darwin

// MARK: - "Por que meu Mac tá lento?"

/// Uma coisa que está deixando o Mac lento agora. O texto é montado pela interface a partir
/// destes campos (o Swift só mede). Contrato em docs/ponte.md (speed.*).
struct SpeedFinding: Codable {
    var id: String               // "memoria" · "calor" · "disco" · "economia" · "reiniciar" · "inicio" · "fundo:<detalhe>" · "app:<id>"
    var tipo: String             // memoria · processo · navegador · fundo · calor · economia · disco · reiniciar · inicio
    var peso: Int                // 1–60: quanto pesa agora (a lista vem do maior pro menor)
    var tom: String              // warn · serious · crit
    var nome: String? = nil      // app ou processo (texto de fora: só por textContent)
    var icon: String? = nil      // data:image/png (apps)
    var cpu: Double? = nil       // % de um núcleo (100 = um núcleo inteiro), média do último minuto
    var memBytes: UInt64? = nil
    var processos: Int? = nil
    var detalhe: String? = nil   // ver docs/ponte.md
    var valor: Double? = nil     // número principal do tipo (ver docs/ponte.md)
    var acao: String? = nil      // encerrar · faxina · ajustes-bateria · inicio · nil (passa sozinho ou é só dica)
    var alvo: String? = nil      // acao "encerrar": id pro optimize.quit
}

struct SpeedReport: Codable {
    var veredito: String         // voando · deboa · pesado · travando
    var nota: Int                // 0–100 (100 = nada pesando)
    var achados: [SpeedFinding]
    var cpu: Double              // uso total do processador agora, 0–100
    var pressao: String          // normal · atencao · critica
    var memUsadaBytes: UInt64
    var memTotalBytes: UInt64
    var swapBytes: UInt64
    var discoLivreBytes: UInt64  // livre + o que o macOS libera sozinho
    var discoTotalBytes: UInt64
    var uptimeSec: Double
    var termico: String          // normal · morno · quente · critico
    var limiteCPU: Int?          // Intel: CPU_Speed_Limit do pmset (100 = sem freio); nil no Apple Silicon
    var economia: Bool           // Modo de Pouca Energia ligado
    var ms: Int
    var readAt: Double
}

struct AppWeight: Codable {
    var cpu: Double              // % de um núcleo, média do último minuto (app + WebKit dele)
    var memBytes: UInt64
    var processos: Int
}

enum Speed {
    private static let GB = 1_000_000_000.0

    static let browsers: Set<String> = [
        "Google Chrome", "Google Chrome Canary", "Chromium", "Safari", "Safari Technology Preview", "Firefox",
        "Firefox Developer Edition", "Microsoft Edge", "Brave Browser", "Arc", "Opera", "Vivaldi", "Zen Browser", "Orion",
    ]

    /// Trabalhos do próprio macOS que pesam por um tempo e passam sozinhos.
    static let background: [(id: String, names: Set<String>)] = [
        ("spotlight", ["mds", "mds_stores", "mdworker", "mdworker_shared", "mdsync", "corespotlightd"]),
        ("timemachine", ["backupd", "backupd-helper"]),
        ("fotos", ["photoanalysisd", "mediaanalysisd", "photolibraryd"]),
        ("icloud", ["bird", "cloudd", "fileproviderd"]),
        ("atualizacao", ["softwareupdated", "com.apple.MobileSoftwareUpdate.UpdateBrainService"]),
    ]

    /// CPU somada por nome de executável, de todos os usuários. O `ps` dá a média do último
    /// minuto: um pico de um segundo não conta, o que está pesando há um tempo conta.
    static func cpuByName() throws -> [String: Double] {
        let text = try runTool("/bin/ps", ["-axo", "%cpu=,comm="], timeout: 10)
        var out: [String: Double] = [:]
        for line in text.split(separator: "\n") {
            let t = line.trimmingCharacters(in: .whitespaces)
            guard let sp = t.firstIndex(of: " "),
                  let cpu = Double(t[..<sp].replacingOccurrences(of: ",", with: ".")), cpu > 0 else { continue }
            let name = (t[sp...].trimmingCharacters(in: .whitespaces) as NSString).lastPathComponent
            out[name, default: 0] += cpu
        }
        return out
    }

    /// Intel: quanto o macOS está freando o processador por calor (100 = nada).
    static func cpuSpeedLimit() -> Int? {
        guard !Machine.isAppleSilicon, let text = try? runTool("/usr/bin/pmset", ["-g", "therm"], timeout: 5) else { return nil }
        for line in text.split(separator: "\n") where line.contains("CPU_Speed_Limit") {
            if let v = line.split(separator: "=").last.flatMap({ Int($0.trimmingCharacters(in: .whitespaces)) }) { return v }
        }
        return nil
    }

    static func diagnose() throws -> SpeedReport {
        let t0 = Date()
        let mem = SystemInfo.memory()
        let cpu = SystemInfo.cpu()
        let disk = SystemInfo.disk()
        let uptime = SystemInfo.uptime()
        let thermal = Battery.thermalState()
        let limit = cpuSpeedLimit()
        let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        let apps = (try? Heavy.list(limit: 40)) ?? []
        let byName = (try? cpuByName()) ?? [:]
        let startup = Startup.list()
        let tight = mem.pressure != "normal"
        var out: [SpeedFinding] = []

        // memória: só a pressão diz se está faltando (memória "cheia" com pressão normal é o macOS usando bem)
        if mem.pressure == "critica" {
            out.append(SpeedFinding(id: "memoria", tipo: "memoria", peso: 55, tom: "crit", memBytes: mem.usedBytes,
                                    detalhe: "critica", valor: Double(mem.swapUsedBytes)))
        } else if mem.pressure == "atencao" {
            out.append(SpeedFinding(id: "memoria", tipo: "memoria", peso: 30, tom: "warn", memBytes: mem.usedBytes,
                                    detalhe: "atencao", valor: Double(mem.swapUsedBytes)))
        } else if Double(mem.swapUsedBytes) >= 4 * GB {
            out.append(SpeedFinding(id: "memoria", tipo: "memoria", peso: 6, tom: "warn", memBytes: mem.usedBytes,
                                    detalhe: "swap", valor: Double(mem.swapUsedBytes)))
        }

        // apps: processador no talo; com a memória apertada, também os que mais ocupam
        var appFindings: [SpeedFinding] = []
        for a in apps where !a.proprio {
            let tipo = browsers.contains(a.nome) ? "navegador" : "processo"
            let acao: String? = a.sistema ? nil : "encerrar"
            let alvo: String? = a.sistema ? nil : a.id
            if a.cpu >= 80 {
                if a.sistema && !a.app { continue }   // do macOS: entra como "fundo" ou "calor"
                appFindings.append(SpeedFinding(id: "app:" + a.id, tipo: tipo, peso: Int(min(40, 15 + (a.cpu - 80) / 4)),
                                                tom: a.cpu >= 150 ? "serious" : "warn", nome: a.nome, icon: a.icon, cpu: a.cpu,
                                                memBytes: a.memBytes, processos: a.processos, detalhe: "cpu", acao: acao, alvo: alvo))
            } else if tight, !a.sistema, mem.totalBytes > 0, Double(a.memBytes) >= 1.5 * GB,
                      Double(a.memBytes) >= Double(mem.totalBytes) * 0.08 {
                let share = Double(a.memBytes) / Double(mem.totalBytes)
                appFindings.append(SpeedFinding(id: "app:" + a.id, tipo: tipo, peso: Int(min(25, 6 + share * 60)),
                                                tom: share >= 0.25 ? "serious" : "warn", nome: a.nome, icon: a.icon, cpu: a.cpu,
                                                memBytes: a.memBytes, processos: a.processos, detalhe: "memoria", valor: share,
                                                acao: acao, alvo: alvo))
            }
        }
        out += appFindings.sorted { $0.peso > $1.peso }.prefix(5)

        // trabalhos do macOS em segundo plano
        for bg in background {
            let total = bg.names.reduce(0.0) { $0 + (byName[$1] ?? 0) }
            if total >= 25 {
                out.append(SpeedFinding(id: "fundo:" + bg.id, tipo: "fundo", peso: Int(min(20, 5 + total / 6)), tom: "warn",
                                        cpu: (total * 10).rounded() / 10, detalhe: bg.id))
            }
        }

        // calor: o macOS freia o processador pra não esquentar mais
        let kernel = byName["kernel_task"] ?? 0
        var heat = 0
        var heatTom = "warn"
        switch thermal {
        case "morno": heat = limit == 100 ? 0 : 5   // no Intel sem freio, morno não deixa nada lento
        case "quente": heat = 30; heatTom = "serious"
        case "critico": heat = 50; heatTom = "crit"
        default: break
        }
        if let l = limit, l < 100 {
            let p = Int(Double(100 - l) * 0.8)
            if p > heat { heat = p; heatTom = l < 70 ? "crit" : (l < 90 ? "serious" : "warn") }
        }
        if heat == 0, !Machine.isAppleSilicon, kernel >= 150 { heat = 15 }   // Intel: kernel_task alto costuma ser o macOS segurando o calor
        if heat > 0 {
            out.append(SpeedFinding(id: "calor", tipo: "calor", peso: heat, tom: heatTom, cpu: kernel >= 50 ? (kernel * 10).rounded() / 10 : nil,
                                    detalhe: thermal, valor: limit.map(Double.init)))
        }

        if lowPower {
            out.append(SpeedFinding(id: "economia", tipo: "economia", peso: 15, tom: "warn", acao: "ajustes-bateria"))
        }

        // disco quase cheio: o macOS precisa de espaço pra memória virtual e atualizações
        if disk.totalBytes > 0 {
            let free = Double(disk.availableBytes)
            let share = free / Double(disk.totalBytes)
            var p = 0
            var tom = "warn"
            if share < 0.05 || free < 5 * GB { p = 45; tom = "crit" }
            else if share < 0.10 || free < 10 * GB { p = 25; tom = "serious" }
            else if share < 0.15 || free < 20 * GB { p = 8 }
            if p > 0 { out.append(SpeedFinding(id: "disco", tipo: "disco", peso: p, tom: tom, valor: free, acao: "faxina")) }
        }

        // muitos dias sem reiniciar só pesa junto com memória apertada; sozinho é dica
        let days = uptime / 86400
        if days >= 14, tight || Double(mem.swapUsedBytes) >= 2 * GB {
            out.append(SpeedFinding(id: "reiniciar", tipo: "reiniciar", peso: 8, tom: "warn", valor: days.rounded(.down)))
        } else if days >= 30 {
            out.append(SpeedFinding(id: "reiniciar", tipo: "reiniciar", peso: 4, tom: "warn", valor: days.rounded(.down)))
        }

        let user = startup.filter { $0.origem != "sistema" && $0.ligado }
        if user.count >= 6 {
            out.append(SpeedFinding(id: "inicio", tipo: "inicio", peso: min(10, user.count), tom: "warn",
                                    processos: user.count, acao: "inicio"))
        }

        out.sort { $0.peso > $1.peso }
        let nota = max(0, 100 - out.reduce(0) { $0 + $1.peso })
        let veredito = nota >= 85 ? "voando" : (nota >= 65 ? "deboa" : (nota >= 40 ? "pesado" : "travando"))
        return SpeedReport(veredito: veredito, nota: nota, achados: out, cpu: cpu.usagePct, pressao: mem.pressure,
                           memUsadaBytes: mem.usedBytes, memTotalBytes: mem.totalBytes, swapBytes: mem.swapUsedBytes,
                           discoLivreBytes: disk.availableBytes, discoTotalBytes: disk.totalBytes, uptimeSec: uptime,
                           termico: thermal, limiteCPU: limit, economia: lowPower,
                           ms: Int(Date().timeIntervalSince(t0) * 1000), readAt: Date().timeIntervalSince1970)
    }

    /// Quanto o próprio Kamurafy pesa: o app e os processos do WebKit que ele abriu.
    /// Os programas que ele roda pra medir (ps, top, pmset) ficam de fora.
    static func weight() throws -> AppWeight {
        let text = try runTool("/bin/ps", ["-axo", "pid=,ppid=,%cpu=,rss="], timeout: 10)
        let me = getpid()
        var cpu = 0.0
        var mem: UInt64 = 0
        var n = 0
        for line in text.split(separator: "\n") {
            let c = line.split(separator: " ", omittingEmptySubsequences: true)
            guard c.count == 4, let pid = pid_t(c[0]), let ppid = pid_t(c[1]),
                  let p = Double(c[2].replacingOccurrences(of: ",", with: ".")), let rss = UInt64(c[3]) else { continue }
            guard pid == me || (ppid != me && Energy.responsible(pid) == me) else { continue }
            cpu += p
            mem += rss * 1024
            n += 1
        }
        return AppWeight(cpu: (cpu * 10).rounded() / 10, memBytes: mem, processos: n)
    }
}

// MARK: - vigia: avisa de app travado no talo e de memória no limite

/// Leitura da vigia, fora da main thread.
enum VigiaLeitura {
    static let limiteCPU = 90.0

    /// Processos do usuário usando 90% ou mais de um núcleo (média do último minuto).
    static func read() -> [(pid: pid_t, cpu: Double)] {
        guard let text = try? runTool("/bin/ps", ["-axo", "pid=,uid=,%cpu="], timeout: 10) else { return [] }
        let uid = getuid()
        var out: [(pid: pid_t, cpu: Double)] = []
        for line in text.split(separator: "\n") {
            let c = line.split(separator: " ", omittingEmptySubsequences: true)
            guard c.count == 3, let pid = pid_t(c[0]), uid_t(c[1]) == uid,
                  let cpu = Double(c[2].replacingOccurrences(of: ",", with: ".")), cpu >= limiteCPU else { continue }
            out.append((pid, cpu))
        }
        return out
    }
}

@MainActor
final class Vigia {
    static let shared = Vigia()
    static let minutos = 10

    private struct Track { var start: UInt64; var minutos: Int; var avisou: Bool }
    private var timer: Timer?
    private var tracks: [pid_t: Track] = [:]
    private var apertoSeguidas = 0
    private var avisouAperto: Date?
    private var lendo = false

    func start() {
        guard timer == nil else { return }
        let t = Timer(timeInterval: 60, repeats: true) { _ in
            Task { @MainActor in Vigia.shared.tick() }
        }
        t.tolerance = 15
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func tick() {
        let s = Settings.current
        guard s.vigia else { tracks = [:]; apertoSeguidas = 0; return }
        guard !lendo else { return }
        lendo = true
        Task {
            let r = try? await offMain { (VigiaLeitura.read(), SystemInfo.memory().pressure) }
            self.lendo = false
            if let r { self.apply(r.0, pressao: r.1) }
        }
    }

    /// "Não avisar mais desse": o nome entra na lista de ignorados dos Ajustes.
    func ignore(_ nome: String) {
        var s = Settings.current
        guard !s.vigiaIgnorar.contains(where: { $0.caseInsensitiveCompare(nome) == .orderedSame }) else { return }
        s.vigiaIgnorar.append(nome)
        Settings.current = s
    }

    private func apply(_ procs: [(pid: pid_t, cpu: Double)], pressao: String) {
        let ignorar = Set(Settings.current.vigiaIgnorar.map { $0.lowercased() })
        var novo: [pid_t: Track] = [:]
        for p in procs where p.pid != getpid() {
            guard let start = Heavy.startTime(p.pid) else { continue }
            var t = tracks[p.pid].flatMap { $0.start == start ? $0 : nil } ?? Track(start: start, minutos: 0, avisou: false)
            t.minutos += 1
            if t.minutos >= Self.minutos, !t.avisou, avisar(pid: p.pid, ignorar: ignorar) { t.avisou = true }
            novo[p.pid] = t
        }
        tracks = novo

        // memória no limite por 3 leituras seguidas; no máximo um aviso por hora
        if pressao == "critica" { apertoSeguidas += 1 } else if pressao == "normal" { apertoSeguidas = 0 }
        if apertoSeguidas >= 3, avisouAperto.map({ Date().timeIntervalSince($0) > 3600 }) ?? true {
            avisouAperto = Date()
            Notifier.shared.send(id: "memoria", title: "A memória do Mac está no limite",
                                 body: "É isso que deixa tudo lento. Fechar abas e apps parados é o que mais ajuda: eu mostro quem está ocupando mais.",
                                 info: ["rota": "otimizar?aba=lento"])
        }
    }

    /// Avisa de um processo no talo. Devolve false quando ainda não é hora (app na frente)
    /// pra tentar de novo na próxima leitura; true quando avisou ou nunca vai avisar.
    private func avisar(pid: pid_t, ignorar: Set<String>) -> Bool {
        let path = Energy.processPath(pid)
        var owner = pid
        let resp = Energy.responsible(pid) ?? pid
        // app na frente trabalhando pesado (jogo, exportação, build no Terminal) costuma ser de propósito
        if NSWorkspace.shared.frontmostApplication?.processIdentifier == resp { return false }
        if resp > 1, resp != pid, !Energy.runsInsideHost(path: path, responsible: resp) { owner = resp }
        let app = NSRunningApplication(processIdentifier: owner)
        let isApp = app?.activationPolicy == .regular
        if !isApp && Heavy.isSystemBinary(path) { return true }   // do macOS: o Kamurafy não encerra
        let ownerPath = app?.bundleURL?.path ?? Energy.processPath(owner)
        var nome = app?.localizedName ?? Energy.exeName(ownerPath)
        if nome.isEmpty { nome = Energy.exeName(path) }
        nome = CleanScan.sanitize(nome)
        if nome.isEmpty || Heavy.protectedNames.contains(nome) || ignorar.contains(nome.lowercased()) { return true }
        let quem = owner != pid ? "Um processo dele usa" : "Ele usa"
        Notifier.shared.send(id: "vigia", title: "\(nome) está no talo há \(Self.minutos) min",
                             body: "\(quem) um núcleo inteiro do processador sem parar. Se não era pra estar trabalhando, dá pra fechar pelo Kamurafy.",
                             categoria: "vigia", info: ["rota": "otimizar?aba=lento", "nome": nome])
        return true
    }
}

enum SpeedModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("speed.diagnose") { _ in try await offMain { try Speed.diagnose() } }
        r.register("app.weight") { _ in try await offMain { try Speed.weight() } }
    }
}
