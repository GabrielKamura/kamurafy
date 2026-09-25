import AppKit

// Otimizar: sem mágica. Mostra o que abre sozinho e o que está pesando, e deixa o
// usuário decidir. Nada aqui apaga arquivo: itens de início são ligados/desligados pelo
// launchctl (reversível), processos são encerrados com confirmação, e a manutenção que
// precisa de senha usa o pedido de senha do próprio macOS.

// MARK: - itens de início

struct StartupItem: Codable {
    var id: String
    var label: String            // com.spotify.client.startuphelper
    var nome: String             // nome amigável ("Spotify")
    var app: String?             // app dono, quando dá pra ter certeza
    var icon: String?
    var origem: String           // "ajudante" (item de início de app) | "agente" (~/Library/LaunchAgents) | "sistema" (do macOS ou /Library)
    var ligado: Bool             // vai abrir no próximo login
    var rodando: Bool            // carregado/rodando agora
    var editavel: Bool           // o Kamurafy consegue mudar sem senha
    var arquivo: String?         // plist (pra mostrar)
    var programa: String?
    var nota: String?
    var quando: String? = nil    // "ao-entrar" | "sempre" | "de-tempos-em-tempos"
    var donoConhecido: Bool = false
}

enum Startup {
    private static var uid: String { String(getuid()) }

    /// Itens do próprio macOS que não começam com com.apple.
    private static let systemLabelPrefixes = ["com.apple.", "com.openssh.", "org.cups.", "org.openbsd.", "org.ntp.", "org.postfix."]

    /// label → desligado? (o que o launchd guarda em "disabled services")
    static func disabledMap() -> [String: Bool] {
        let text = (try? runTool("/bin/launchctl", ["print-disabled", "gui/\(uid)"], timeout: 10)) ?? ""
        var out: [String: Bool] = [:]
        let re = try! NSRegularExpression(pattern: #""([^"]+)"\s*=>\s*(enabled|disabled|true|false)"#)
        for line in text.split(separator: "\n") {
            let s = String(line)
            let ns = s as NSString
            guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { continue }
            let v = ns.substring(with: m.range(at: 2))
            out[ns.substring(with: m.range(at: 1))] = (v == "disabled" || v == "true")
        }
        return out
    }

    /// labels carregados agora no domínio do usuário (e se têm PID)
    static func loadedMap() -> [String: Bool] {
        let text = (try? runTool("/bin/launchctl", ["list"], timeout: 10)) ?? ""
        var out: [String: Bool] = [:]
        for line in text.split(separator: "\n").dropFirst() {
            let cols = line.split(separator: "\t")
            guard cols.count >= 3 else { continue }
            out[String(cols[2])] = cols[0] != "-"
        }
        return out
    }

    /// Onde o launchd diz que está o plist e o programa de um serviço carregado.
    private static func launchdInfo(_ label: String) -> (path: String?, program: String?) {
        guard label.range(of: #"^[A-Za-z0-9._-]+$"#, options: .regularExpression) != nil,
              let text = try? runTool("/bin/launchctl", ["print", "gui/\(uid)/\(label)"], timeout: 5) else { return (nil, nil) }
        var path: String? = nil, program: String? = nil
        for line in text.split(separator: "\n") {
            let t = line.trimmingCharacters(in: .whitespaces)
            if t.hasPrefix("path = ") { path = String(t.dropFirst(7)) }
            if t.hasPrefix("program = ") { program = String(t.dropFirst(10)) }
        }
        return (path, program)
    }

    /// Dono só quando dá pra ter certeza: o programa mora dentro do .app, ou o label é o
    /// próprio identificador de um ajudante registrado dentro de outro app. Nada de adivinhar
    /// pelo começo do label (qualquer um pode se chamar "com.brave.Browser.qualquercoisa").
    private static func appFor(label: String, program: String?) -> (name: String, icon: String?)? {
        func outerApp(_ path: String) -> String? {
            guard let r = path.range(of: ".app/", options: .caseInsensitive) ?? (path.hasSuffix(".app") ? path.range(of: ".app", options: .backwards) : nil) else { return nil }
            return String(path[..<r.lowerBound]) + ".app"
        }
        var bundle: String? = nil
        if let p = program { bundle = outerApp(p) }
        if bundle == nil, let found = NSWorkspace.shared.urlForApplication(withBundleIdentifier: label) {
            // ajudante registrado (ex.: …/Spotify.app/Contents/Library/LoginItems/StartUpHelper.app)
            bundle = outerApp(found.path)
        }
        guard let b = bundle, CleanGuard.exists(URL(fileURLWithPath: b)) else { return nil }
        let name = (FileManager.default.displayName(atPath: b) as NSString).deletingPathExtension
        return (CleanScan.sanitize(name), CleanScan.iconData(NSWorkspace.shared.icon(forFile: b)))
    }

    private static func plistInfo(_ url: URL) -> (label: String, program: String?, quando: String?)? {
        guard let d = NSDictionary(contentsOf: url) as? [String: Any], let label = d["Label"] as? String else { return nil }
        let prog = (d["Program"] as? String) ?? (d["ProgramArguments"] as? [String])?.first
        var quando: String? = nil
        if d["KeepAlive"] != nil && (d["KeepAlive"] as? Bool) != false { quando = "sempre" }
        else if (d["RunAtLoad"] as? Bool) == true { quando = "ao-entrar" }
        else if d["StartInterval"] != nil || d["StartCalendarInterval"] != nil || d["WatchPaths"] != nil { quando = "de-tempos-em-tempos" }
        return (label, prog, quando)
    }

    private static func isSystemLabel(_ label: String) -> Bool {
        let l = label.lowercased()
        return systemLabelPrefixes.contains { l.hasPrefix($0) }
    }

    static func list() -> [StartupItem] {
        let disabled = disabledMap()
        let loaded = loadedMap()
        var out: [StartupItem] = []
        var seen = Set<String>()

        // 1) agentes do usuário (arquivos em ~/Library/LaunchAgents)
        let userDir = CleanGuard.real(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents"))
        for u in (try? FileManager.default.contentsOfDirectory(at: userDir, includingPropertiesForKeys: nil)) ?? []
        where u.pathExtension == "plist" && !CleanGuard.isSymlink(u) {
            guard let info = plistInfo(u) else { continue }
            seen.insert(info.label)
            let owner = appFor(label: info.label, program: info.program)
            let system = isSystemLabel(info.label)
            let item = StartupItem(id: UUID().uuidString, label: info.label, nome: owner?.name ?? CleanScan.sanitize(info.label),
                                   app: owner?.name, icon: owner?.icon, origem: system ? "sistema" : "agente",
                                   ligado: !(disabled[info.label] ?? false), rodando: loaded[info.label] ?? false,
                                   editavel: !system, arquivo: "~/Library/LaunchAgents/" + CleanScan.sanitize(u.lastPathComponent),
                                   programa: info.program.map(CleanScan.sanitize),
                                   nota: owner == nil && !system ? "Não sei de qual app é: confira o programa antes de deixar ligado." : nil,
                                   quando: info.quando, donoConhecido: owner != nil)
            StartupRegistry.shared.add(item, plist: u, label: info.label, program: info.program)
            out.append(item)
        }

        // 2) ajudantes de início de apps (SMLoginItem/SMAppService): aparecem só no launchd
        for (label, isDisabled) in disabled.sorted(by: { $0.key < $1.key }) where !seen.contains(label) {
            seen.insert(label)
            if label.lowercased().hasPrefix("com.apple.") { continue }
            let li = launchdInfo(label)
            // plist do próprio macOS (em /System) ou label de componente do sistema: só mostra
            let system = isSystemLabel(label) || (li.path?.hasPrefix("/System/") ?? false)
            let owner = appFor(label: label, program: li.program)
            let item = StartupItem(id: UUID().uuidString, label: label, nome: owner?.name ?? CleanScan.sanitize(label),
                                   app: owner?.name, icon: owner?.icon, origem: system ? "sistema" : "ajudante",
                                   ligado: !isDisabled, rodando: loaded[label] ?? false, editavel: !system,
                                   arquivo: li.path.map(CleanScan.sanitize), programa: li.program.map(CleanScan.sanitize),
                                   nota: system ? "Faz parte do macOS." : (owner == nil ? "Não sei de qual app é (ele pode já ter sido apagado)." : nil),
                                   donoConhecido: owner != nil)
            StartupRegistry.shared.add(item, plist: nil, label: label, program: li.program)
            out.append(item)
        }

        // 3) do sistema todo (/Library): só pra mostrar; mexer pede senha → Ajustes
        for dir in ["/Library/LaunchAgents", "/Library/LaunchDaemons"] {
            for u in (try? FileManager.default.contentsOfDirectory(at: URL(fileURLWithPath: dir), includingPropertiesForKeys: nil)) ?? []
            where u.pathExtension == "plist" {
                guard let info = plistInfo(u), !seen.contains(info.label), !info.label.hasPrefix("com.apple.") else { continue }
                let owner = appFor(label: info.label, program: info.program)
                out.append(StartupItem(id: UUID().uuidString, label: info.label, nome: owner?.name ?? CleanScan.sanitize(info.label),
                                       app: owner?.name, icon: owner?.icon, origem: "sistema",
                                       ligado: true, rodando: loaded[info.label] ?? false, editavel: false,
                                       arquivo: u.path, programa: info.program.map(CleanScan.sanitize),
                                       nota: dir.hasSuffix("Daemons") ? "Serviço do sistema: mexer pede senha de administrador (Ajustes › Itens de Início)." : "Vale pra todos os usuários: mexer pede senha de administrador (Ajustes › Itens de Início).",
                                       quando: info.quando, donoConhecido: owner != nil))
            }
        }
        return out.sorted { ($0.origem == "sistema" ? 1 : 0, $0.nome.lowercased()) < ($1.origem == "sistema" ? 1 : 0, $1.nome.lowercased()) }
    }

    struct ToggleResult: Codable { var id: String; var ligado: Bool; var rodando: Bool }

    /// Liga/desliga pelo launchctl (enable/disable guarda a escolha; bootstrap/bootout
    /// aplica agora). Nenhum arquivo é apagado; dá pra voltar atrás a qualquer hora.
    static func toggle(id: String, on: Bool) throws -> ToggleResult {
        guard let e = StartupRegistry.shared.get(id), e.item.editavel else {
            throw BridgeError.failed("Esse item não está mais na lista: abra a tela de novo.")
        }
        let label = e.label
        guard label.range(of: #"^[A-Za-z0-9._-]+$"#, options: .regularExpression) != nil, !isSystemLabel(label) else {
            throw BridgeError.failed("Esse item é do macOS: eu não mexo.")
        }
        let target = "gui/\(uid)/\(label)"
        if let plist = e.plist {
            // o arquivo tem que ser o mesmo que a varredura viu, com o mesmo Label e o mesmo programa
            let dir = CleanGuard.real(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents"))
            guard !CleanGuard.isSymlink(plist), CleanGuard.resolvedPath(plist).deletingLastPathComponent().path == dir.path,
                  SafeFS.lstatInfo(plist.path)?.ident == e.ident,
                  let now = plistInfo(plist), now.label == e.label, now.program == e.program else {
                throw BridgeError.failed("O arquivo mudou: abra a tela de novo.")
            }
        } else {
            // ajudante: o programa que o launchd conhece não pode ter mudado desde a lista
            let li = launchdInfo(label)
            if let p = e.program, let now = li.program, p != now { throw BridgeError.failed("O item mudou: abra a tela de novo.") }
            if li.path?.hasPrefix("/System/") == true { throw BridgeError.failed("Esse item é do macOS: eu não mexo.") }
        }
        if on {
            _ = try? runTool("/bin/launchctl", ["enable", target])
            if let plist = e.plist { _ = try? runTool("/bin/launchctl", ["bootstrap", "gui/\(uid)", plist.path]) }
        } else {
            _ = try? runTool("/bin/launchctl", ["disable", target])
            _ = try? runTool("/bin/launchctl", ["bootout", target])
        }
        let now = disabledMap()[label].map { !$0 } ?? on
        return ToggleResult(id: id, ligado: now, rodando: loadedMap()[label] ?? false)
    }
}

final class StartupRegistry {
    static let shared = StartupRegistry()
    struct Entry { var item: StartupItem; var plist: URL?; var ident: SafeFS.Ident?; var label: String; var program: String? }
    private let lock = NSLock()
    private var entries: [String: Entry] = [:]
    func add(_ item: StartupItem, plist: URL?, label: String, program: String?) {
        lock.lock(); defer { lock.unlock() }
        entries[item.id] = Entry(item: item, plist: plist, ident: plist.flatMap { SafeFS.lstatInfo($0.path)?.ident },
                                 label: label, program: program)
    }
    func get(_ id: String) -> Entry? { lock.lock(); defer { lock.unlock() }; return entries[id] }
}

// MARK: - processos pesados

struct HeavyApp: Codable {
    var id: String               // estável: pid + hora de início (pid reaproveitado vira outro id)
    var nome: String
    var pid: Int
    var cpu: Double              // % de um núcleo (100 = um núcleo inteiro), somando os processos do app
    var memBytes: UInt64
    var processos: Int
    var app: Bool                // app com janela
    var sistema: Bool            // do macOS: não dá pra encerrar pelo Kamurafy
    var proprio: Bool            // é o próprio Kamurafy
    var icon: String?
    var respondendo: Bool
}

enum Heavy {
    private struct Proc { var pid: pid_t; var uid: uid_t; var cpu: Double; var rss: UInt64 }
    private struct Target { var pid: pid_t; var start: UInt64; var bundleID: String?; var isApp: Bool; var system: Bool }
    private static let lock = NSLock()
    private static var targets: [String: Target] = [:]

    static let protectedNames: Set<String> = [
        "launchd", "kernel_task", "WindowServer", "loginwindow", "Dock", "Finder", "SystemUIServer",
        "ControlCenter", "coreaudiod", "hidd", "powerd", "logd", "cfprefsd", "mds", "mds_stores", "Kamurafy",
    ]

    /// Caminho de executável do macOS (o de verdade, pelo kernel; o argv[0] do ps mente).
    static func isSystemBinary(_ path: String) -> Bool {
        if path.isEmpty { return true }   // não deu pra saber: trata como do sistema
        if path.hasPrefix("/usr/local/") { return false }
        return ["/System/", "/usr/", "/bin/", "/sbin/", "/Library/Apple/", "/System/Volumes/Preboot/Cryptexes/", "/private/var/db/"]
            .contains { path.hasPrefix($0) }
    }

    private static func startTime(_ pid: pid_t) -> UInt64? {
        var kinfo = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &kinfo, &size, nil, 0) == 0, size > 0 else { return nil }
        let tv = kinfo.kp_proc.p_un.__p_starttime
        return UInt64(tv.tv_sec) * 1_000_000 + UInt64(tv.tv_usec)
    }

    private static func appOwning(_ path: String, running: [NSRunningApplication]) -> NSRunningApplication? {
        guard path.contains(".app/") else { return nil }
        return running.first { app in
            guard app.activationPolicy == .regular, let b = app.bundleURL?.path else { return false }
            return path.hasPrefix(b + "/")
        }
    }

    static func list(limit: Int) throws -> [HeavyApp] {
        let text = try runTool("/bin/ps", ["-axo", "pid=,uid=,%cpu=,rss="], timeout: 10)
        var procs: [Proc] = []
        for line in text.split(separator: "\n") {
            let cols = line.split(separator: " ", omittingEmptySubsequences: true)
            guard cols.count == 4, let pid = pid_t(cols[0]), let uid = uid_t(cols[1]),
                  let cpu = Double(cols[2].replacingOccurrences(of: ",", with: ".")), let rss = UInt64(cols[3]) else { continue }
            procs.append(Proc(pid: pid, uid: uid, cpu: cpu, rss: rss * 1024))
        }
        let me = getpid()
        let running = NSWorkspace.shared.runningApplications
        var byKey: [String: (HeavyApp, Target)] = [:]
        for p in procs {
            let realPath = Energy.processPath(p.pid)
            // soma no app responsável: pelo "responsável" do kernel ou pelo .app onde o executável mora
            var owner = p.pid
            if let r = Energy.responsible(p.pid), r > 1 { owner = r }
            var app = running.first { $0.processIdentifier == owner && $0.activationPolicy == .regular }
            if app == nil, let a = appOwning(realPath, running: running) { app = a; owner = a.processIdentifier }
            let key = app?.bundleIdentifier ?? "proc:\(owner)"
            if var cur = byKey[key] {
                cur.0.cpu += p.cpu
                cur.0.memBytes += p.rss
                cur.0.processos += 1
                byKey[key] = cur
                continue
            }
            let ownerPath = app?.bundleURL?.path ?? (owner == p.pid ? realPath : Energy.processPath(owner))
            let raw = app?.localizedName ?? (ownerPath as NSString).lastPathComponent
            let name = app != nil ? raw : (Energy.friendly[raw] ?? raw)
            // app com janela pode ser fechado (Música, Safari...), menos os que seguram o macOS;
            // processo solto só se for do usuário e o executável de verdade estiver fora do sistema
            let ownerUID = procs.first { $0.pid == owner }?.uid ?? p.uid
            let system = protectedNames.contains(raw) || (app == nil && (isSystemBinary(ownerPath) || ownerUID != getuid()))
            let start = startTime(owner) ?? 0
            let item = HeavyApp(id: "\(owner)-\(start)", nome: CleanScan.sanitize(name.isEmpty ? "Processo \(owner)" : name),
                                pid: Int(owner), cpu: p.cpu, memBytes: p.rss, processos: 1, app: app != nil, sistema: system,
                                proprio: owner == me, icon: app.flatMap { $0.icon }.flatMap { CleanScan.iconData($0) },
                                respondendo: true)
            byKey[key] = (item, Target(pid: owner, start: start, bundleID: app?.bundleIdentifier, isApp: app != nil, system: system))
        }
        let top = byKey.values.sorted { ($0.0.cpu * 4 + Double($0.0.memBytes) / 1e8) > ($1.0.cpu * 4 + Double($1.0.memBytes) / 1e8) }
            .prefix(limit)
        lock.lock()
        for (item, t) in top { targets[item.id] = t }   // ids estáveis: os de leituras anteriores continuam valendo
        if targets.count > 400 { targets = Dictionary(uniqueKeysWithValues: top.map { ($0.0.id, $0.1) }) }
        lock.unlock()
        return top.map { var i = $0.0; i.cpu = (i.cpu * 10).rounded() / 10; return i }
    }

    struct QuitResult: Codable { var ok: Bool; var mensagem: String }

    /// Encerra um app/processo da lista. App: pede pra fechar (ele pode perguntar se quer
    /// salvar); forçar só se o usuário escolher. Processo solto: só do próprio usuário e fora
    /// do sistema, conferido de novo agora pelo executável de verdade.
    @MainActor
    static func quit(id: String, force: Bool) throws -> QuitResult {
        lock.lock(); let t = targets[id]; lock.unlock()
        guard let t else { throw BridgeError.failed("Não está mais na lista: atualize.") }
        guard !t.system else { throw BridgeError.failed("É do macOS: o Kamurafy não encerra.") }
        guard t.pid != getpid() else { throw BridgeError.failed("Esse sou eu 🙂") }
        guard startTime(t.pid) == t.start else { return QuitResult(ok: true, mensagem: "Já tinha fechado.") }
        if t.isApp, let app = NSRunningApplication(processIdentifier: t.pid), app.bundleIdentifier == t.bundleID {
            if protectedNames.contains(app.localizedName ?? "") { throw BridgeError.failed("É do macOS: o Kamurafy não encerra.") }
            let ok = force ? app.forceTerminate() : app.terminate()
            return QuitResult(ok: ok, mensagem: ok ? (force ? "Encerrado à força." : "Pedi pra fechar.") : "O app não quis fechar.")
        }
        var st = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, t.pid]
        guard sysctl(&mib, 4, &st, &size, nil, 0) == 0, size > 0, st.kp_eproc.e_ucred.cr_uid == getuid(),
              !isSystemBinary(Energy.processPath(t.pid)) else {
            throw BridgeError.failed("É do macOS: o Kamurafy não encerra.")
        }
        guard kill(t.pid, force ? SIGKILL : SIGTERM) == 0 else { throw BridgeError.failed("O macOS não deixou encerrar.") }
        return QuitResult(ok: true, mensagem: force ? "Encerrado à força." : "Pedi pra fechar.")
    }
}

// MARK: - manutenção

struct MaintTask: Codable {
    var id: String
    var titulo: String
    var descricao: String
    var quando: String           // quando vale a pena
    var precisaSenha: Bool
    var demora: String
}

enum Maintenance {
    static let tasks: [MaintTask] = [
        .init(id: "dns", titulo: "Limpar o cache de DNS",
              descricao: "Esquece os endereços de sites guardados. Resolve site que não abre depois de mudar de rede ou de DNS.",
              quando: "Quando um site abre em outro aparelho e não abre no Mac.", precisaSenha: true, demora: "instantâneo"),
        .init(id: "abrircom", titulo: "Arrumar o menu \"Abrir com\"",
              descricao: "Refaz a lista de apps que o macOS usa pra abrir cada tipo de arquivo.",
              quando: "Quando aparecem apps repetidos ou que já foram apagados no \"Abrir com\".", precisaSenha: false, demora: "uns segundos"),
        .init(id: "spotlight", titulo: "Refazer o índice do Spotlight",
              descricao: "Apaga e refaz o índice de busca. O Mac fica mais ocupado por algumas horas enquanto refaz.",
              quando: "Quando a busca não acha arquivos que você sabe que existem.", precisaSenha: true, demora: "algumas horas em segundo plano"),
        .init(id: "dock", titulo: "Reiniciar o Dock",
              descricao: "Fecha e abre o Dock de novo (sem fechar nenhum app).",
              quando: "Quando o Dock, o Mission Control ou o Launchpad travam.", precisaSenha: false, demora: "instantâneo"),
        .init(id: "finder", titulo: "Reiniciar o Finder",
              descricao: "Fecha e abre o Finder de novo. Janelas do Finder abertas se fecham.",
              quando: "Quando o Finder trava ou não mostra arquivos novos.", precisaSenha: false, demora: "instantâneo"),
    ]

    struct RunResult: Codable { var ok: Bool; var mensagem: String }

    @MainActor
    static func run(id: String, confirmed: Bool) throws -> RunResult {
        guard confirmed else { throw BridgeError.badArgs("precisa de confirmado: true") }
        guard RunMode.current == .app else { throw BridgeError.failed("Só no app aberto.") }
        switch id {
        case "dns":
            return try admin("/usr/bin/dscacheutil -flushcache; /usr/bin/killall -HUP mDNSResponder", done: "Cache de DNS limpo.")
        case "spotlight":
            return try admin("/usr/bin/mdutil -E /", done: "Pronto: o Spotlight está refazendo o índice.")
        case "abrircom":
            let ls = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
            _ = try runTool(ls, ["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"], timeout: 900)
            return RunResult(ok: true, mensagem: "Lista do \"Abrir com\" refeita.")
        case "dock":
            _ = try runTool("/usr/bin/killall", ["Dock"])
            return RunResult(ok: true, mensagem: "Dock reiniciado.")
        case "finder":
            _ = try runTool("/usr/bin/killall", ["Finder"])
            return RunResult(ok: true, mensagem: "Finder reiniciado.")
        default:
            throw BridgeError.badArgs("tarefa desconhecida")
        }
    }

    /// Comando fixo (nunca vem da interface) com o pedido de senha do próprio macOS.
    @MainActor
    private static func admin(_ command: String, done: String) throws -> RunResult {
        let src = "do shell script \"\(command)\" with administrator privileges"
        var err: NSDictionary?
        NSAppleScript(source: src)?.executeAndReturnError(&err)
        if let err {
            let code = (err[NSAppleScript.errorNumber] as? Int) ?? 0
            if code == -128 { return RunResult(ok: false, mensagem: "Cancelado.") }
            throw BridgeError.failed("Não deu certo (\(code)).")
        }
        return RunResult(ok: true, mensagem: done)
    }
}

enum OptimizeModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("optimize.startup") { _ in try await offMain { Startup.list() } }
        r.register("optimize.startupToggle") { args in
            guard let id = args.string("id"), let on = args.bool("ligar") else { throw BridgeError.badArgs("id, ligar") }
            guard RunMode.current == .app else { throw BridgeError.failed("Só no app aberto.") }
            return try await offMain { try Startup.toggle(id: id, on: on) }
        }
        r.register("optimize.heavy") { args in
            let n = min(max(args.int("limite") ?? 12, 1), 40)
            return try await offMain { try Heavy.list(limit: n) }
        }
        r.register("optimize.quit") { args in
            guard let id = args.string("id") else { throw BridgeError.badArgs("id") }
            guard RunMode.current == .app else { throw BridgeError.failed("Só no app aberto.") }
            return try Heavy.quit(id: id, force: args.bool("forcar") ?? false)
        }
        r.register("optimize.tasks") { _ in Maintenance.tasks }
        r.register("optimize.run") { args in
            guard let id = args.string("id") else { throw BridgeError.badArgs("id") }
            return try Maintenance.run(id: id, confirmed: args.bool("confirmado") ?? false)
        }
    }
}
