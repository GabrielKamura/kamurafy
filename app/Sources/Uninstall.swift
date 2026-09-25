import AppKit

// Desinstalar: o app vai pra Lixeira junto com as sobras que ele espalhou em ~/Library.
// Mesmas regras da Faxina: a interface só manda IDs; o Swift confere tudo de novo antes;
// nada é apagado de vez (dá pra devolver pela Lixeira do Kamurafy). Apps da Apple que vêm
// com o macOS (/System/Applications) nem aparecem; o próprio Kamurafy também não.

struct InstalledApp: Codable {
    var id: String
    var nome: String
    var bundleId: String?
    var versao: String?
    var caminho: String          // pra mostrar
    var bytes: Int64
    var usado: Double?           // último uso (Spotlight)
    var icon: String?
    var appStore: Bool
    var apple: Bool              // app da Apple (Pages, Xcode...): pode desinstalar, mas avisamos
    var aberto: Bool
    var local: String            // "Aplicativos" | "Meus aplicativos"
}

final class AppRegistry {
    static let shared = AppRegistry()
    struct Entry { var app: InstalledApp; var url: URL; var root: URL; var ident: SafeFS.Ident; var bundleID: String? }
    private let lock = NSLock()
    private var entries: [String: Entry] = [:]
    func add(_ e: Entry) { lock.lock(); entries[e.app.id] = e; lock.unlock() }
    func get(_ id: String) -> Entry? { lock.lock(); defer { lock.unlock() }; return entries[id] }
    func remove(_ id: String) { lock.lock(); entries[id] = nil; lock.unlock() }
}

enum Uninstall {
    static var roots: [(URL, String)] {
        if let s = CleanEnv.sandbox {
            let a = s.appendingPathComponent("Applications")
            return SafeFS.isLiteralDir(a.path) ? [(a, "Aplicativos (teste)")] : []
        }
        var r: [(URL, String)] = []
        if SafeFS.isLiteralDir("/Applications") { r.append((URL(fileURLWithPath: "/Applications", isDirectory: true), "Aplicativos")) }
        if let mine = CleanEnv.root("Applications") { r.append((mine, "Meus aplicativos")) }
        return r
    }

    private static func appsIn(_ dir: URL) -> [URL] {
        var out: [URL] = []
        for u in (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? [] {
            if CleanGuard.isSymlink(u) { continue }
            if u.pathExtension == "app" { out.append(u); continue }
            // uma subpasta (ex.: /Applications/Utilities, "Adobe XYZ/"): um nível só
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: u.path, isDirectory: &isDir), isDir.boolValue {
                for v in (try? FileManager.default.contentsOfDirectory(at: u, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? []
                where v.pathExtension == "app" && !CleanGuard.isSymlink(v) { out.append(v) }
            }
        }
        return out
    }

    static func list() -> [InstalledApp] {
        let running = NSWorkspace.shared.runningApplications
        let myBundle = Bundle.main.bundleIdentifier
        var out: [InstalledApp] = []
        let deadline = Date().addingTimeInterval(40)
        for (root, local) in roots {
            for u in appsIn(root) {
                guard let b = Bundle(url: u) else { continue }
                let bid = b.bundleIdentifier
                if bid != nil && bid == myBundle { continue }
                let name = (b.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
                    ?? (b.object(forInfoDictionaryKey: "CFBundleName") as? String)
                    ?? u.deletingPathExtension().lastPathComponent
                let m = CleanScan.measure(u, deadline: deadline)
                let isOpen = running.contains { $0.bundleURL?.standardizedFileURL == u.standardizedFileURL || ($0.bundleIdentifier != nil && $0.bundleIdentifier == bid) }
                let app = InstalledApp(
                    id: UUID().uuidString, nome: name, bundleId: bid,
                    versao: b.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
                    caminho: u.path.hasPrefix("/Applications/") ? u.path : CleanEnv.display(u), bytes: m.bytes,
                    usado: CleanScan.lastUsed(u)?.timeIntervalSince1970,
                    icon: CleanScan.iconData(NSWorkspace.shared.icon(forFile: u.path)),
                    appStore: CleanGuard.exists(u.appendingPathComponent("Contents/_MASReceipt")),
                    apple: bid?.hasPrefix("com.apple.") ?? false, aberto: isOpen, local: local)
                guard let st = SafeFS.lstatInfo(u.path), !st.isLink else { continue }
                AppRegistry.shared.add(.init(app: app, url: u, root: CleanGuard.real(u.deletingLastPathComponent()),
                                             ident: st.ident, bundleID: bid))
                out.append(app)
            }
        }
        return out.sorted { $0.bytes > $1.bytes }
    }

    /// Onde os apps costumam deixar sobras, por bundle id (exato) ou pelo nome do app (exato).
    private static let leftoverDirs: [(rel: String, byID: Bool, byName: Bool, suffixes: [String], nota: String)] = [
        ("Library/Application Support", true, true, [""], "Dados e configurações do app."),
        ("Library/Caches", true, true, [""], "Cache do app."),
        ("Library/Preferences", true, false, [".plist"], "Preferências do app."),
        ("Library/Saved Application State", true, false, [".savedState"], "Janelas que o app lembra de reabrir."),
        ("Library/Logs", true, true, [""], "Registros do app."),
        ("Library/HTTPStorages", true, false, ["", ".binarycookies"], "Cookies e dados de internet do app."),
        ("Library/WebKit", true, false, [""], "Dados de páginas web do app."),
        ("Library/Containers", true, false, [""], "Caixa de dados do app (tudo que ele guardou)."),
        ("Library/Application Scripts", true, false, [""], "Scripts do app."),
        ("Library/Cookies", true, false, [".binarycookies"], "Cookies do app."),
        ("Library/LaunchAgents", true, false, [".plist"], "Item que abria junto com o Mac."),
    ]

    /// Sobras do app: só nomes exatos (bundle id ou nome do app). Nada de "parecido".
    static func leftovers(id: String) throws -> CleanCategory {
        guard let e = AppRegistry.shared.get(id) else { throw BridgeError.failed("Esse app não está mais na lista: atualize.") }
        let t0 = Date()
        let deadline = t0.addingTimeInterval(20)
        var itens: [CleanItem] = []
        var semAcesso = 0
        let bid = e.bundleID
        let name = e.app.nome
        for d in leftoverDirs {
            guard let root = CleanEnv.root(d.rel) else { continue }
            var names: [String] = []
            if d.byID, let b = bid { names += d.suffixes.map { b + $0 } }
            if d.byName, name.count >= 3 { names += d.suffixes.map { name + $0 } }
            // ByHost: preferências por máquina
            if d.rel == "Library/Preferences", let b = bid, let byHost = CleanEnv.root("Library/Preferences/ByHost") {
                for u in (try? FileManager.default.contentsOfDirectory(at: byHost, includingPropertiesForKeys: nil)) ?? []
                where u.lastPathComponent.hasPrefix(b + ".") && u.pathExtension == "plist" && !CleanGuard.isSymlink(u) {
                    if let it = leftover(u, root: byHost, nota: "Preferências do app neste Mac.", sel: true, deadline: deadline, semAcesso: &semAcesso) { itens.append(it) }
                }
            }
            for n in Set(names) {
                let u = root.appendingPathComponent(n)
                guard CleanGuard.exists(u), !CleanGuard.isSymlink(u) else { continue }
                // pelo nome (não pelo id) vem desmarcado: pode ser de outro app com o mesmo nome
                let exactID = bid != nil && n.hasPrefix(bid!)
                if let it = leftover(u, root: root, nota: exactID ? d.nota : d.nota + " (achado pelo nome: confira)",
                                     sel: exactID, deadline: deadline, semAcesso: &semAcesso) { itens.append(it) }
            }
        }
        itens = itens.filter { $0.bytes > 0 || $0.semAcesso }.sorted { $0.bytes > $1.bytes }
        let total = itens.reduce(Int64(0)) { $0 + $1.bytes }
        return CleanCategory(id: "restos", titulo: "Sobras de \(name)", descricao: "O que o app deixou espalhado na sua pasta.",
                             bytes: total, bytesSelecionados: itens.filter { $0.selecionado }.reduce(0) { $0 + $1.bytes },
                             itens: itens, semAcesso: semAcesso, incompleto: Date() > deadline,
                             ms: Int(Date().timeIntervalSince(t0) * 1000))
    }

    private static func leftover(_ u: URL, root: URL, nota: String, sel: Bool, deadline: Date, semAcesso: inout Int) -> CleanItem? {
        let m = CleanScan.measure(u, deadline: deadline)
        if m.denied && m.bytes == 0 { semAcesso += 1 }
        return CleanScan.register(u, root: root, categoria: "restos", selecionado: sel, nota: nota, measure: m)
    }

    struct Result: Codable {
        var app: Bool                // o app foi pra Lixeira
        var appLixeiraId: String?
        var restos: CleanResult?
        var mensagem: String
    }

    /// Manda o app pra Lixeira (se ele estiver fechado) e depois as sobras escolhidas.
    @MainActor
    static func run(id: String, leftoverIDs: [String], confirmed: Bool) async throws -> Result {
        guard confirmed else { throw BridgeError.badArgs("precisa de confirmado: true") }
        guard CleanEnv.destructiveAllowed else { throw BridgeError.failed("Só no app aberto (ou na caixa de areia).") }
        guard let e = AppRegistry.shared.get(id) else { throw BridgeError.failed("Esse app não está mais na lista: atualize.") }
        let u = e.url
        // conferências: mesmo app, no mesmo lugar, fechado
        guard let st = SafeFS.lstatInfo(u.path), !st.isLink, st.ident == e.ident, u.pathExtension == "app",
              roots.contains(where: { $0.0.path == e.root.path }), SafeFS.isLiteralDir(e.root.path),
              Bundle(url: u)?.bundleIdentifier == e.bundleID else {
            throw BridgeError.failed("O app mudou desde a lista: atualize.")
        }
        if NSWorkspace.shared.runningApplications.contains(where: { $0.bundleURL?.path == u.path || ($0.bundleIdentifier != nil && $0.bundleIdentifier == e.bundleID) }) {
            throw BridgeError.failed("\(e.app.nome) está aberto: feche antes.")
        }
        var (dest, destIdent, fallback) = try trashApp(e)
        if fallback {
            let d = try await recycleViaFinder(u)
            dest = d
            destIdent = SafeFS.lstatInfo(d.path).flatMap { $0.ident == e.ident ? $0.ident : nil }
        }
        let lid = UUID().uuidString
        if let d = dest {
            Cleanup.recordMoved(MovedItem(id: lid, nome: e.app.nome, categoria: "app", original: u.path, lixeira: d.path,
                                          bytes: e.app.bytes, t: Date().timeIntervalSince1970, fileID: nil,
                                          dev: destIdent?.dev, ino: destIdent?.ino, root: e.root.path))
        }
        AppRegistry.shared.remove(id)
        var restos: CleanResult? = nil
        if !leftoverIDs.isEmpty {
            restos = try await offMain { try Cleanup.clean(ids: leftoverIDs) }
        }
        return Result(app: true, appLixeiraId: dest == nil ? nil : lid, restos: restos, mensagem: "\(e.app.nome) foi pra Lixeira.")
    }

    /// Parte síncrona (com a trava única): tenta mandar pela SafeFS; se o app for do
    /// administrador (sem permissão), avisa que precisa do Finder.
    private static func trashApp(_ e: AppRegistry.Entry) throws -> (URL?, SafeFS.Ident?, Bool) {
        Cleanup.opLock.lock(); defer { Cleanup.opLock.unlock() }
        do {
            let t = try SafeFS.moveToTrash(parent: e.root.path, name: e.url.lastPathComponent, expected: e.ident,
                                           sandboxTrash: CleanEnv.sandboxTrash)
            return (t.url, t.ident, false)
        } catch SafeFS.Failure.reason(let r) where r.contains("permissão") && CleanEnv.sandbox == nil {
            return (nil, nil, true)
        } catch {
            throw BridgeError.failed(Cleanup.friendly(error))
        }
    }

    @MainActor
    private static func recycleViaFinder(_ u: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { cont in
            NSWorkspace.shared.recycle([u]) { moved, error in
                if let error { cont.resume(throwing: BridgeError.failed(Cleanup.friendly(error))); return }
                guard let d = moved[u] else { cont.resume(throwing: BridgeError.failed("O Finder não mandou pra Lixeira.")); return }
                cont.resume(returning: d)
            }
        }
    }
}

enum UninstallModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("uninstall.apps") { _ in try await offMain { Uninstall.list() } }
        r.register("uninstall.leftovers") { args in
            guard let id = args.string("id") else { throw BridgeError.badArgs("id") }
            return try await offMain { try Uninstall.leftovers(id: id) }
        }
        r.register("uninstall.run") { args in
            guard let id = args.string("id") else { throw BridgeError.badArgs("id") }
            let restos = (args["restos"] as? [String]) ?? []
            return try await Uninstall.run(id: id, leftoverIDs: restos, confirmed: args.bool("confirmado") ?? false)
        }
    }
}
