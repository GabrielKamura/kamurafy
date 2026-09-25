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
    var app: String?             // app dono, quando dá pra saber
    var icon: String?
    var origem: String           // "ajudante" (item de início de app) | "agente" (~/Library/LaunchAgents) | "sistema" (/Library/...)
    var ligado: Bool             // vai abrir no próximo login
    var rodando: Bool            // carregado/rodando agora
    var editavel: Bool           // o Kamurafy consegue mudar sem senha
    var arquivo: String?         // plist (pra mostrar)
    var programa: String?
    var nota: String?
}

enum Startup {
    private static var uid: String { String(getuid()) }

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

    private static func appFor(label: String, program: String?) -> (name: String, icon: String?)? {
        if let p = program, let r = p.range(of: ".app/", options: .caseInsensitive) {
            let bundle = String(p[..<r.lowerBound]) + ".app"
            // helpers ficam dentro do app (…/Spotify.app/Contents/Library/LoginItems/…): pega o app de fora
            let outer = bundle.components(separatedBy: ".app/").first.map { $0 + ".app" } ?? bundle
            let name = ((outer as NSString).lastPathComponent as NSString).deletingPathExtension
            return (name, CleanScan.iconData(NSWorkspace.shared.icon(forFile: outer)))
        }
        // label com cara de bundle id: tenta o app pelo prefixo (com.spotify.client.startuphelper → com.spotify.client)
        var parts = label.split(separator: ".").map(String.init)
        while parts.count >= 2 {
            let bid = parts.joined(separator: ".")
            if let found = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bid) {
                // ajudante dentro de outro app (…/Spotify.app/Contents/Library/LoginItems/…): mostra o app de fora
                let p = found.path
                let outer = p.components(separatedBy: ".app/").count > 1 ? p.components(separatedBy: ".app/")[0] + ".app" : p
                let name = (FileManager.default.displayName(atPath: outer) as NSString).deletingPathExtension
                return (name, CleanScan.iconData(NSWorkspace.shared.icon(forFile: outer)))
            }
            parts.removeLast()
        }
        return nil
    }

    private static func plistInfo(_ url: URL) -> (label: String, program: String?)? {
        guard let d = NSDictionary(contentsOf: url) as? [String: Any], let label = d["Label"] as? String else { return nil }
        let prog = (d["Program"] as? String) ?? (d["ProgramArguments"] as? [String])?.first
        return (label, prog)
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
            let item = StartupItem(id: UUID().uuidString, label: info.label, nome: owner?.name ?? info.label,
                                   app: owner?.name, icon: owner?.icon, origem: "agente",
                                   ligado: !(disabled[info.label] ?? false), rodando: loaded[info.label] ?? false,
                                   editavel: true, arquivo: "~/Library/LaunchAgents/" + u.lastPathComponent,
                                   programa: info.program, nota: nil)
            StartupRegistry.shared.add(item, plist: u)
            out.append(item)
        }

        // 2) ajudantes de início de apps (SMLoginItem/SMAppService): aparecem só no launchd
        for (label, isDisabled) in disabled.sorted(by: { $0.key < $1.key }) where !seen.contains(label) {
            if label.hasPrefix("com.apple.") { continue }
            let owner = appFor(label: label, program: nil)
            let item = StartupItem(id: UUID().uuidString, label: label, nome: owner?.name ?? label,
                                   app: owner?.name, icon: owner?.icon, origem: "ajudante",
                                   ligado: !isDisabled, rodando: loaded[label] ?? false, editavel: true,
                                   arquivo: nil, programa: nil,
                                   nota: owner == nil ? "O app que colocou isso pode já ter sido apagado." : nil)
            StartupRegistry.shared.add(item, plist: nil)
            out.append(item)
            seen.insert(label)
        }

        // 3) do sistema todo (/Library): só pra mostrar; mexer pede senha → Ajustes
        for dir in ["/Library/LaunchAgents", "/Library/LaunchDaemons"] {
            for u in (try? FileManager.default.contentsOfDirectory(at: URL(fileURLWithPath: dir), includingPropertiesForKeys: nil)) ?? []
            where u.pathExtension == "plist" {
                guard let info = plistInfo(u), !seen.contains(info.label), !info.label.hasPrefix("com.apple.") else { continue }
                let owner = appFor(label: info.label, program: info.program)
                out.append(StartupItem(id: UUID().uuidString, label: info.label, nome: owner?.name ?? info.label,
                                       app: owner?.name, icon: owner?.icon, origem: "sistema",
                                       ligado: true, rodando: loaded[info.label] ?? false, editavel: false,
                                       arquivo: u.path, programa: info.program,
                                       nota: dir.hasSuffix("Daemons") ? "Serviço do sistema: mexer pede senha de administrador (Ajustes › Itens de Início)." : "Vale pra todos os usuários: mexer pede senha de administrador (Ajustes › Itens de Início)."))
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
        let label = e.item.label
        guard label.range(of: #"^[A-Za-z0-9._-]+$"#, options: .regularExpression) != nil, !label.hasPrefix("com.apple.") else {
            throw BridgeError.failed("Esse item eu não mexo.")
        }
        let target = "gui/\(uid)/\(label)"
        if let plist = e.plist {
            // o arquivo tem que ser o mesmo que a varredura viu, ainda em ~/Library/LaunchAgents
            let dir = CleanGuard.real(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents"))
            guard !CleanGuard.isSymlink(plist), CleanGuard.resolvedPath(plist).deletingLastPathComponent().path == dir.path,
                  SafeFS.lstatInfo(plist.path)?.ident == e.ident else { throw BridgeError.failed("O arquivo mudou: abra a tela de novo.") }
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
    struct Entry { var item: StartupItem; var plist: URL?; var ident: SafeFS.Ident? }
    private let lock = NSLock()
    private var entries: [String: Entry] = [:]
    func add(_ item: StartupItem, plist: URL?) {
        lock.lock(); defer { lock.unlock() }
        entries[item.id] = Entry(item: item, plist: plist, ident: plist.flatMap { SafeFS.lstatInfo($0.path)?.ident })
    }
    func get(_ id: String) -> Entry? { lock.lock(); defer { lock.unlock() }; return entries[id] }
}

// MARK: - processos pesados

struct HeavyApp: Codable {
    var id: String
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
    private struct Proc { var pid: pid_t; var uid: uid_t; var cpu: Double; var rss: UInt64; var path: String }
    private struct Target { var pid: pid_t; var start: UInt64; var bundleID: String?; var isApp: Bool; var system: Bool }
    private static let lock = NSLock()
    private static var targets: [String: Target] = [:]

    private static let protectedNames: Set<String> = [
        "launchd", "kernel_task", "WindowServer", "loginwindow", "Dock", "Finder", "SystemUIServer",
        "ControlCenter", "coreaudiod", "hidd", "powerd", "logd", "cfprefsd", "mds", "mds_stores",
    ]

    private static func startTime(_ pid: pid_t) -> UInt64? {
        var kinfo = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &kinfo, &size, nil, 0) == 0, size > 0 else { return nil }
        let tv = kinfo.kp_proc.p_un.__p_starttime
        return UInt64(tv.tv_sec) * 1_000_000 + UInt64(tv.tv_usec)
    }

    static func list(limit: Int) throws -> [HeavyApp] {
        let text = try runTool("/bin/ps", ["-axo", "pid=,uid=,%cpu=,rss=,comm="], timeout: 10)
        var procs: [Proc] = []
        for line in text.split(separator: "\n") {
            let cols = line.split(separator: " ", maxSplits: 4, omittingEmptySubsequences: true)
            guard cols.count == 5, let pid = pid_t(cols[0]), let uid = uid_t(cols[1]),
                  let cpu = Double(cols[2].replacingOccurrences(of: ",", with: ".")), let rss = UInt64(cols[3]) else { continue }
            procs.append(Proc(pid: pid, uid: uid, cpu: cpu, rss: rss * 1024, path: String(cols[4])))
        }
        let me = getpid()
        let running = NSWorkspace.shared.runningApplications
        var byKey: [String: (HeavyApp, Target)] = [:]
        for p in procs {
            // soma no app responsável (abas e helpers contam pro app)
            var owner = p.pid
            if let r = Energy.responsible(p.pid), r > 1 { owner = r }
            let app = running.first { $0.processIdentifier == owner && $0.activationPolicy == .regular }
            let key = app?.bundleIdentifier ?? "proc:\(owner)"
            if var cur = byKey[key] {
                cur.0.cpu += p.cpu
                cur.0.memBytes += p.rss
                cur.0.processos += 1
                byKey[key] = cur
                continue
            }
            let path = app?.bundleURL?.path ?? (owner == p.pid ? p.path : "")
            let name = app?.localizedName ?? (path as NSString).lastPathComponent
            // app com janela pode ser fechado (Música, Safari...), menos os que seguram o macOS;
            // processo solto só se for do usuário e fora das pastas do sistema
            let systemPath = path.hasPrefix("/System/") || path.hasPrefix("/usr/") || path.hasPrefix("/sbin/") || path.hasPrefix("/Library/Apple/")
            let system = protectedNames.contains(name) || (app == nil && (systemPath || p.uid != getuid()))
            let item = HeavyApp(id: UUID().uuidString, nome: name.isEmpty ? "Processo \(owner)" : name, pid: Int(owner),
                                cpu: p.cpu, memBytes: p.rss, processos: 1, app: app != nil, sistema: system,
                                proprio: owner == me, icon: app.flatMap { $0.icon }.flatMap { CleanScan.iconData($0) },
                                respondendo: true)
            byKey[key] = (item, Target(pid: owner, start: startTime(owner) ?? 0, bundleID: app?.bundleIdentifier,
                                       isApp: app != nil, system: system))
        }
        let top = byKey.values.sorted { ($0.0.cpu * 4 + Double($0.0.memBytes) / 1e8) > ($1.0.cpu * 4 + Double($1.0.memBytes) / 1e8) }
            .prefix(limit)
        lock.lock()
        targets = [:]
        for (item, t) in top { targets[item.id] = t }
        lock.unlock()
        return top.map { var i = $0.0; i.cpu = (i.cpu * 10).rounded() / 10; return i }
    }

    struct QuitResult: Codable { var ok: Bool; var mensagem: String }

    /// Encerra um app/processo da lista. App: pede pra fechar (ele pode perguntar se quer
    /// salvar); forçar só se o usuário escolher. Processo solto: só do próprio usuário.
    @MainActor
    static func quit(id: String, force: Bool) throws -> QuitResult {
        lock.lock(); let t = targets[id]; lock.unlock()
        guard let t else { throw BridgeError.failed("Não está mais na lista: atualize.") }
        guard !t.system else { throw BridgeError.failed("É do macOS: o Kamurafy não encerra.") }
        guard t.pid != getpid() else { throw BridgeError.failed("Esse sou eu 🙂") }
        guard startTime(t.pid) == t.start else { return QuitResult(ok: true, mensagem: "Já tinha fechado.") }
        if t.isApp, let app = NSRunningApplication(processIdentifier: t.pid), app.bundleIdentifier == t.bundleID {
            let ok = force ? app.forceTerminate() : app.terminate()
            return QuitResult(ok: ok, mensagem: ok ? (force ? "Encerrado à força." : "Pedi pra fechar.") : "O app não quis fechar.")
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
            return try admin("dscacheutil -flushcache; killall -HUP mDNSResponder", done: "Cache de DNS limpo.")
        case "spotlight":
            return try admin("mdutil -E /", done: "Pronto: o Spotlight está refazendo o índice.")
        case "abrircom":
            let ls = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
            _ = try runTool(ls, ["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"], timeout: 120)
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
