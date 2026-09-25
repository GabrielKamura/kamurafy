import AppKit
import Security

// Desinstalar: o app vai pra Lixeira junto com as sobras que ele espalhou em ~/Library.
// Mesmas regras da Faxina: a interface só manda IDs; o Swift confere tudo de novo antes;
// nada é apagado de vez (dá pra devolver pela Lixeira do Kamurafy). Apps da Apple que vêm
// com o macOS (/System/Applications) nem aparecem; o próprio Kamurafy também não.
//
// O identificador do app (CFBundleIdentifier) vem do próprio app e não é confiável: só é
// usado pra achar sobras se tiver o formato certo, e "com.apple.*" só vale com a assinatura
// da Apple. Sobras só com nome exato, direto na pasta, e nunca pastas de fornecedor.

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
    var apple: Bool              // app da Apple de verdade (assinado): pode desinstalar, mas avisamos
    var aberto: Bool
    var local: String            // "Aplicativos" | "Meus aplicativos"
    var doAdministrador: Bool = false  // o dono é o administrador: vai pela Lixeira do Finder (pede senha) e volta por lá
    var outrasCopias: Int = 0          // outras cópias do mesmo app no Mac (as sobras delas ficam)
}

final class AppRegistry {
    static let shared = AppRegistry()
    struct Entry {
        var app: InstalledApp
        var url: URL
        var parent: URL              // pasta onde o app está
        var allowedRoot: URL         // Aplicativos ou Meus aplicativos (o parent é ela ou uma subpasta dela)
        var ident: SafeFS.Ident
        var bundleID: String?
        var leftoverIDs: Set<String> = []
    }
    private let lock = NSLock()
    private var entries: [String: Entry] = [:]
    func add(_ e: Entry) { lock.lock(); entries[e.app.id] = e; lock.unlock() }
    func get(_ id: String) -> Entry? { lock.lock(); defer { lock.unlock() }; return entries[id] }
    func all() -> [Entry] { lock.lock(); defer { lock.unlock() }; return Array(entries.values) }
    func remove(_ id: String) { lock.lock(); entries[id] = nil; lock.unlock() }
    func setLeftovers(_ id: String, _ ids: Set<String>) { lock.lock(); entries[id]?.leftoverIDs = ids; lock.unlock() }
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

    /// Identificador com cara de identificador: 3+ partes, só letras, números e hífen.
    static func validBundleID(_ s: String?) -> String? {
        guard let s, s.range(of: #"^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){2,}$"#, options: .regularExpression) != nil else { return nil }
        return s
    }

    /// O app é assinado pela Apple (não basta dizer "com.apple." no Info.plist).
    static func appleSigned(_ u: URL) -> Bool {
        var code: SecStaticCode?
        guard SecStaticCodeCreateWithPath(u as CFURL, [], &code) == errSecSuccess, let c = code else { return false }
        var req: SecRequirement?
        guard SecRequirementCreateWithString("anchor apple" as CFString, [], &req) == errSecSuccess, let r = req else { return false }
        return SecStaticCodeCheckValidity(c, [], r) == errSecSuccess
    }

    /// Pastas de fornecedor (divididas entre vários apps): nunca são sobra de um app só.
    private static let vendorNames: Set<String> = [
        "google", "adobe", "microsoft", "jetbrains", "mozilla", "apple", "oracle", "autodesk", "corel", "nvidia", "amd",
        "intel", "logitech", "zoom", "dropbox", "valve", "steam", "epic", "unity", "electron", "chromium", "brave", "opera",
    ]

    private static func appsIn(_ dir: URL) -> [URL] {
        var out: [URL] = []
        for u in (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? [] {
            if CleanGuard.isSymlink(u) { continue }
            if u.pathExtension == "app" { out.append(u); continue }
            // uma subpasta (ex.: /Applications/Utilities, "Adobe XYZ/"): um nível só, e sem atalho
            if SafeFS.lstatInfo(u.path)?.isDir == true, SafeFS.isLiteralDir(u.path) {
                for v in (try? FileManager.default.contentsOfDirectory(at: u, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? []
                where v.pathExtension == "app" && !CleanGuard.isSymlink(v) { out.append(v) }
            }
        }
        return out.filter { SafeFS.lstatInfo($0.path)?.isDir == true }
    }

    /// Algum processo rodando de dentro desse .app (o app ou um ajudante dele).
    static func isRunning(_ u: URL, bundleID: String?) -> Bool {
        let p = u.path
        return NSWorkspace.shared.runningApplications.contains {
            guard let b = $0.bundleURL?.path else { return false }
            return b == p || b.hasPrefix(p + "/") || (bundleID != nil && $0.bundleIdentifier == bundleID)
        }
    }

    static func list() -> [InstalledApp] {
        let myBundle = Bundle.main.bundleIdentifier
        var found: [(URL, URL, String, Bundle, SafeFS.Info)] = []
        for (root, local) in roots {
            for u in appsIn(root) {
                guard let b = Bundle(url: u), let st = SafeFS.lstatInfo(u.path), !st.isLink else { continue }
                if let bid = b.bundleIdentifier, bid == myBundle { continue }
                found.append((u, root, local, b, st))
            }
        }
        // quantas cópias de cada identificador existem (sobras são divididas entre elas)
        var copies: [String: Int] = [:]
        for f in found { if let bid = f.3.bundleIdentifier { copies[bid, default: 0] += 1 } }

        let deadline = Date().addingTimeInterval(40)
        var out: [InstalledApp] = []
        for (u, root, local, b, st) in found {
            let bid = b.bundleIdentifier
            // o nome que o Finder mostra ("Visual Studio Code", não "Code")
            let name = CleanScan.sanitize((FileManager.default.displayName(atPath: u.path) as NSString).deletingPathExtension)
            let m = CleanScan.measure(u, deadline: deadline)
            var others = (bid.map { copies[$0] ?? 1 } ?? 1) - 1
            if others == 0, let bid, let urls = Optional(NSWorkspace.shared.urlsForApplications(withBundleIdentifier: bid)) {
                others = urls.filter { $0.path != u.path && !$0.path.hasPrefix("/Volumes/") }.count
            }
            let isApple = bid?.hasPrefix("com.apple.") == true && appleSigned(u)
            let app = InstalledApp(
                id: UUID().uuidString, nome: name, bundleId: bid,
                versao: b.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
                caminho: u.path.hasPrefix("/Applications/") ? u.path : CleanEnv.display(u), bytes: m.bytes,
                usado: CleanScan.lastUsed(u)?.timeIntervalSince1970,
                icon: CleanScan.iconData(NSWorkspace.shared.icon(forFile: u.path)),
                appStore: CleanGuard.exists(u.appendingPathComponent("Contents/_MASReceipt")),
                apple: isApple, aberto: isRunning(u, bundleID: bid), local: local,
                doAdministrador: fileOwner(u) != getuid(), outrasCopias: max(0, others))
            AppRegistry.shared.add(.init(app: app, url: u, parent: u.deletingLastPathComponent(), allowedRoot: root,
                                         ident: st.ident, bundleID: bid))
            out.append(app)
        }
        return out.sorted { $0.bytes > $1.bytes }
    }

    private static func fileOwner(_ u: URL) -> uid_t {
        var s = stat()
        return lstat(u.path, &s) == 0 ? s.st_uid : 0
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
        ("Library/LaunchAgents", true, false, [".plist"], "Item que abria junto com o Mac. Ele para de vez no próximo login."),
    ]

    /// Nome aceitável pra procurar sobras: nada de barra, dois-pontos, ponto no começo ou fornecedor.
    private static func validName(_ s: String) -> String? {
        guard s.count >= 3, !s.contains("/"), !s.contains(":"), !s.hasPrefix("."), s != "..",
              !vendorNames.contains(s.lowercased()) else { return nil }
        return s
    }

    /// Sobras do app: só nomes exatos (bundle id válido ou nome do arquivo do app). Nada de "parecido".
    static func leftovers(id: String) throws -> CleanCategory {
        guard let e = AppRegistry.shared.get(id) else { throw BridgeError.failed("Esse app não está mais na lista: atualize.") }
        let t0 = Date()
        let deadline = t0.addingTimeInterval(20)
        var itens: [CleanItem] = []
        var semAcesso = 0
        var avisos: [String] = []

        var bid = validBundleID(e.bundleID)
        if e.bundleID != nil && bid == nil { avisos.append("O identificador desse app é estranho, então não procurei sobras por ele.") }
        var idTrusted = bid != nil
        if let b = bid, b.lowercased().hasPrefix("com.apple."), !appleSigned(e.url) {
            idTrusted = false
            avisos.append("Esse app diz ser da Apple, mas não tem a assinatura da Apple: nada vem marcado.")
        }
        if let b = bid, vendorNames.contains(b.lowercased()) { bid = nil }
        let shared = e.app.outrasCopias > 0
        if shared { avisos.append("Tem outra cópia desse app no Mac, que usa os mesmos dados: nada vem marcado.") }
        let name = validName(e.url.deletingPathExtension().lastPathComponent)

        func add(_ u: URL, root: URL, nota: String, sel: Bool) {
            guard u.deletingLastPathComponent().path == root.path, CleanGuard.exists(u), !CleanGuard.isSymlink(u) else { return }
            let m = CleanScan.measure(u, deadline: deadline)
            if m.denied && m.bytes == 0 { semAcesso += 1 }
            var n = nota
            if shared { n += " (a outra cópia do app também usa)" }
            if let it = CleanScan.register(u, root: root, categoria: "restos", selecionado: sel && !shared, nota: n, measure: m) {
                itens.append(it)
            }
        }

        var seen = Set<String>()
        for d in leftoverDirs {
            guard let root = CleanEnv.root(d.rel) else { continue }
            var candidates: [(String, Bool)] = []      // (nome, achado pelo id?)
            if d.byID, let b = bid { candidates += d.suffixes.map { (b + $0, true) } }
            if d.byName, let n = name { candidates += d.suffixes.map { (n + $0, false) } }
            for (n, byID) in candidates where !seen.contains(root.path + "/" + n) {
                seen.insert(root.path + "/" + n)
                let u = root.appendingPathComponent(n)
                add(u, root: root, nota: byID ? d.nota : d.nota + " (achado pelo nome: confira)", sel: byID && idTrusted)
            }
            // ByHost: preferências por máquina, só no formato exato <id>.<UUID ou 12 hex>.plist
            if d.rel == "Library/Preferences", let b = bid, let byHost = CleanEnv.root("Library/Preferences/ByHost") {
                let pat = "^" + NSRegularExpression.escapedPattern(for: b)
                    + #"\.([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}|[0-9A-Fa-f]{12})\.plist$"#
                for u in (try? FileManager.default.contentsOfDirectory(at: byHost, includingPropertiesForKeys: nil)) ?? []
                where u.lastPathComponent.range(of: pat, options: .regularExpression) != nil {
                    add(u, root: byHost, nota: "Preferências do app neste Mac.", sel: idTrusted)
                }
            }
        }
        itens = itens.filter { $0.bytes > 0 || $0.semAcesso }.sorted { $0.bytes > $1.bytes }
        AppRegistry.shared.setLeftovers(id, Set(itens.map { $0.id }))
        let total = itens.reduce(Int64(0)) { $0 + $1.bytes }
        return CleanCategory(id: "restos", titulo: "Sobras de \(e.app.nome)", descricao: "O que o app deixou espalhado na sua pasta.",
                             bytes: total, bytesSelecionados: itens.filter { $0.selecionado }.reduce(0) { $0 + $1.bytes },
                             itens: itens, semAcesso: semAcesso, incompleto: Date() > deadline,
                             ms: Int(Date().timeIntervalSince(t0) * 1000), aviso: avisos.isEmpty ? nil : avisos.joined(separator: " "))
    }

    struct Result: Codable {
        var app: Bool                // o app foi pra Lixeira
        var appLixeiraId: String?
        var restos: CleanResult?
        var mensagem: String
        var peloFinder: Bool = false // foi pela Lixeira do Finder (volta por lá: Colocar de volta)
    }

    /// Manda o app pra Lixeira (se ele estiver fechado) e depois as sobras escolhidas.
    @MainActor
    static func run(id: String, leftoverIDs: [String], confirmed: Bool) async throws -> Result {
        guard confirmed else { throw BridgeError.badArgs("precisa de confirmado: true") }
        guard CleanEnv.destructiveAllowed else { throw BridgeError.failed("Só no app aberto (ou na caixa de areia).") }
        guard let e = AppRegistry.shared.get(id) else { throw BridgeError.failed("Esse app não está mais na lista: atualize.") }
        // a interface só pode mandar sobras que o Swift achou pra este app
        let extra = Set(leftoverIDs).subtracting(e.leftoverIDs)
        guard extra.isEmpty else { throw BridgeError.failed("Tem item na lista que não é sobra desse app: abra as sobras de novo.") }
        let u = e.url
        // conferências: mesmo app, no mesmo lugar (Aplicativos ou uma subpasta dela), fechado
        let parentOK = e.parent.path == e.allowedRoot.path
            || (e.parent.deletingLastPathComponent().path == e.allowedRoot.path && SafeFS.isLiteralDir(e.parent.path))
        guard let st = SafeFS.lstatInfo(u.path), !st.isLink, st.ident == e.ident, u.pathExtension == "app", parentOK,
              roots.contains(where: { $0.0.path == e.allowedRoot.path }), SafeFS.isLiteralDir(e.allowedRoot.path),
              Bundle(url: u)?.bundleIdentifier == e.bundleID else {
            throw BridgeError.failed("O app mudou desde a lista: atualize.")
        }
        if isRunning(u, bundleID: e.bundleID) { throw BridgeError.failed("\(e.app.nome) está aberto: feche antes.") }

        var (dest, destIdent, viaFinder) = try trashApp(e)
        if viaFinder {
            let d = try await recycleViaFinder(u)
            dest = d
            destIdent = SafeFS.lstatInfo(d.path).flatMap { $0.ident == e.ident ? $0.ident : nil }
        }
        let lid = UUID().uuidString
        if let d = dest {
            Cleanup.recordMoved(MovedItem(id: lid, nome: e.app.nome, categoria: "app", original: u.path, lixeira: d.path,
                                          bytes: e.app.bytes, t: Date().timeIntervalSince1970, fileID: nil,
                                          dev: destIdent?.dev, ino: destIdent?.ino, root: e.parent.path,
                                          peloFinder: viaFinder ? true : nil))
        }
        AppRegistry.shared.remove(id)
        var restos: CleanResult? = nil
        if !leftoverIDs.isEmpty {
            do {
                restos = try await offMain { try Cleanup.clean(ids: leftoverIDs) }
            } catch {
                // o app já foi: não diga que nada foi mexido
                restos = CleanResult(movidos: [], falhas: leftoverIDs.map { .init(id: $0, nome: "?", motivo: Cleanup.friendly(error)) },
                                     bytes: 0, caixaDeAreia: CleanEnv.sandbox != nil)
            }
        }
        return Result(app: true, appLixeiraId: dest == nil ? nil : lid, restos: restos,
                      mensagem: "\(e.app.nome) foi pra Lixeira.", peloFinder: viaFinder)
    }

    /// Parte síncrona (com a trava única): tenta mandar pela SafeFS; se o app for do
    /// administrador (sem permissão), avisa que precisa do Finder.
    private static func trashApp(_ e: AppRegistry.Entry) throws -> (URL?, SafeFS.Ident?, Bool) {
        Cleanup.opLock.lock(); defer { Cleanup.opLock.unlock() }
        do {
            let t = try SafeFS.moveToTrash(parent: e.parent.path, name: e.url.lastPathComponent, expected: e.ident,
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
                if let error {
                    let ns = error as NSError
                    let msg = ns.code == NSUserCancelledError ? "O pedido de senha foi cancelado: o app ficou onde estava." : Cleanup.friendly(error)
                    cont.resume(throwing: BridgeError.failed(msg))
                    return
                }
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
