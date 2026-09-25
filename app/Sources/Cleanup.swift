import AppKit

// Faxina: regras duras (CLAUDE.md) —
//  1. nada sai sem o usuário ver a lista e confirmar;
//  2. tudo vai pra Lixeira (trashItem); apagar de vez só o que a Faxina mandou pra lá, ou
//     esvaziar a Lixeira pelo Finder, sempre com confirmação;
//  3. a interface só manda IDs de itens que o próprio Swift achou numa varredura; o caminho
//     nunca vem da interface;
//  4. antes de mexer, o Swift confere de novo: mesmo arquivo (fileResourceIdentifier), mesma
//     pasta permitida depois de resolver links simbólicos, dentro da pasta do usuário, sem
//     trocar de volume, sem link simbólico no próprio item;
//  5. sem sudo, sem nada fora da pasta do usuário.

struct CleanItem: Codable {
    var id: String
    var categoria: String
    var nome: String             // "Firefox", "DerivedData", "instalador.dmg"
    var caminho: String          // pra mostrar, com ~ no lugar da pasta do usuário
    var bytes: Int64             // espaço em disco de verdade (alocado)
    var arquivos: Int
    var modificado: Double?      // Unix (s)
    var usado: Double?           // último uso segundo o Spotlight, quando existe
    var selecionado: Bool        // já vem marcado
    var nota: String?
    var app: String?             // app dono (caches)
    var appAberto: Bool
    var icon: String?            // data URL do ícone do app dono
    var tipo: String?            // downloads/grandes: instalador | compactado | video | audio | imagem | documento | pasta | outro
    var grupo: String?           // duplicados
    var semAcesso: Bool          // o macOS não deixou ler (falta Acesso Total ao Disco)
}

struct CleanCategory: Codable {
    var id: String
    var titulo: String
    var descricao: String
    var bytes: Int64
    var bytesSelecionados: Int64
    var itens: [CleanItem]
    var semAcesso: Int
    var incompleto: Bool         // passou do tempo limite; os números são mínimos
    var ms: Int
}

struct CategoryInfo: Codable {
    var id: String
    var titulo: String
    var descricao: String
    var precisaPermissao: Bool   // o macOS vai perguntar antes (Downloads, Mesa, Documentos)
}

struct MovedItem: Codable {
    var id: String
    var nome: String
    var categoria: String
    var original: String         // caminho original completo
    var lixeira: String          // onde ficou na Lixeira
    var bytes: Int64
    var t: Double
    var fileID: String?          // identidade do item já na Lixeira (pra apagar de vez com segurança)
}

enum RunMode {
    case app, cli, snapshot
    static var current: RunMode = .app
}

// MARK: - ambiente (pasta do usuário de verdade ou caixa de areia dos testes)

enum CleanEnv {
    static let fm = FileManager.default

    /// Nos testes (build dev), KAMURAFY_FAXINA_HOME aponta pra uma pasta de mentira e a
    /// "Lixeira" vira uma pasta dentro dela: nada do usuário é tocado.
    static let sandbox: URL? = {
        #if KAMURAFY_DEV
        if let h = ProcessInfo.processInfo.environment["KAMURAFY_FAXINA_HOME"], !h.isEmpty {
            let u = URL(fileURLWithPath: h, isDirectory: true)
            try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
            return CleanGuard.real(u)
        }
        #endif
        return nil
    }()

    static var home: URL {
        sandbox ?? CleanGuard.real(fm.homeDirectoryForCurrentUser)
    }

    static var trashDir: URL {
        if let s = sandbox {
            let t = s.appendingPathComponent(".Lixeira-de-teste", isDirectory: true)
            try? fm.createDirectory(at: t, withIntermediateDirectories: true)
            return t
        }
        let t = (try? fm.url(for: .trashDirectory, in: .userDomainMask, appropriateFor: home, create: false))
            ?? home.appendingPathComponent(".Trash", isDirectory: true)
        return CleanGuard.real(t)
    }

    /// Mover/apagar só vale no app de verdade (usuário clicando) ou na caixa de areia.
    /// No terminal (--cmd) e no modo foto, só com KAMURAFY_FAXINA_HOME.
    static var destructiveAllowed: Bool {
        sandbox != nil || RunMode.current == .app
    }

    static func display(_ url: URL) -> String {
        let p = url.path, h = home.path
        if p == h { return "~" }
        if p.hasPrefix(h + "/") { return "~" + p.dropFirst(h.count) }
        return p
    }

    static func sub(_ rel: String) -> URL { home.appendingPathComponent(rel) }

    /// Pasta permitida já resolvida (realpath); se não existir, fica o caminho literal.
    static func root(_ rel: String) -> URL { CleanGuard.real(sub(rel)) }
}

// MARK: - registro dos itens achados (a interface só conhece os IDs)

final class CleanRegistry {
    static let shared = CleanRegistry()

    struct Entry {
        var item: CleanItem
        var url: URL
        var root: URL            // pasta permitida (já resolvida) em que o item foi achado
        var directChild: Bool    // o item precisa ser filho direto de root
        var fileID: String?
        var device: Int?
        var groupMembers: [String]
    }

    private let lock = NSLock()
    private var entries: [String: Entry] = [:]
    private var createdAt: [String: Date] = [:]

    func add(_ e: Entry) {
        lock.lock(); defer { lock.unlock() }
        entries[e.item.id] = e
        createdAt[e.item.id] = Date()
        // itens de varreduras com mais de 1 h não valem mais (limpa de vez em quando)
        if entries.count % 256 == 0 {
            let old = Date().addingTimeInterval(-3600)
            for (k, d) in createdAt where d < old { entries[k] = nil; createdAt[k] = nil }
        }
    }

    func get(_ id: String) -> Entry? {
        lock.lock(); defer { lock.unlock() }
        return entries[id]
    }

    func remove(_ id: String) {
        lock.lock(); defer { lock.unlock() }
        entries[id] = nil
        createdAt[id] = nil
    }
}

// MARK: - conferências de segurança

enum CleanGuard {
    /// Caminho canônico de verdade (realpath): resolve links simbólicos sem o atalho do
    /// URL.resolvingSymlinksInPath, que troca /private/var por /var e bagunça as comparações.
    static func real(_ url: URL) -> URL {
        guard let p = realpath(url.path, nil) else { return url.standardizedFileURL }
        defer { free(p) }
        return URL(fileURLWithPath: String(cString: p), isDirectory: url.hasDirectoryPath)
    }

    static func fileID(_ url: URL) -> String? {
        guard let v = try? url.resourceValues(forKeys: [.fileResourceIdentifierKey]),
              let id = v.fileResourceIdentifier else { return nil }
        return String(describing: id)
    }

    static func device(_ url: URL) -> Int? {
        var st = stat()
        guard lstat(url.path, &st) == 0 else { return nil }
        return Int(st.st_dev)
    }

    static func isSymlink(_ url: URL) -> Bool {
        var st = stat()
        guard lstat(url.path, &st) == 0 else { return false }
        return (st.st_mode & S_IFMT) == S_IFLNK
    }

    static func exists(_ url: URL) -> Bool {
        var st = stat()
        return lstat(url.path, &st) == 0
    }

    /// `child` está dentro de `root` (os dois já resolvidos, comparando componentes).
    static func inside(_ child: URL, _ root: URL) -> Bool {
        let c = child.standardizedFileURL.pathComponents
        let r = root.standardizedFileURL.pathComponents
        return c.count > r.count && Array(c.prefix(r.count)) == r
    }

    /// Caminho do item com a pasta-mãe resolvida (links simbólicos do caminho) e o último
    /// componente intacto (o item em si nunca é seguido).
    static func resolvedPath(_ url: URL) -> URL {
        real(url.deletingLastPathComponent()).appendingPathComponent(url.lastPathComponent)
    }

    enum Failure: Error { case reason(String) }

    /// Tudo que precisa ser verdade pra mandar um item pra Lixeira.
    static func check(_ e: CleanRegistry.Entry) throws {
        let home = CleanEnv.home
        let real = resolvedPath(e.url)
        guard exists(e.url) else { throw Failure.reason("não existe mais") }
        guard !isSymlink(e.url) else { throw Failure.reason("virou um link simbólico") }
        guard inside(e.root, home) || e.root == home else { throw Failure.reason("pasta fora da pasta do usuário") }
        guard inside(real, e.root) else { throw Failure.reason("saiu da pasta permitida") }
        if e.directChild, real.deletingLastPathComponent().path != e.root.path {
            throw Failure.reason("mudou de lugar")
        }
        guard real.lastPathComponent == e.url.lastPathComponent else { throw Failure.reason("mudou de nome") }
        guard let now = fileID(e.url), now == e.fileID else { throw Failure.reason("mudou desde a varredura") }
        if let d = e.device, device(e.url) != d { throw Failure.reason("está em outro disco") }
        guard real.path != home.path else { throw Failure.reason("é a pasta do usuário") }
    }
}

// MARK: - ações

struct CleanResult: Codable {
    struct Done: Codable { var id: String; var nome: String; var bytes: Int64; var lixeiraId: String }
    struct Fail: Codable { var id: String; var nome: String; var motivo: String }
    var movidos: [Done]
    var falhas: [Fail]
    var bytes: Int64
    var caixaDeAreia: Bool
}

enum Cleanup {
    private static let movedLock = NSLock()

    // --- lista do que a Faxina mandou pra Lixeira (pra desfazer ou apagar de vez) ---

    static func movedList() -> [MovedItem] {
        Store.load("faxina-lixeira.json", as: [MovedItem].self) ?? []
    }

    private static func saveMoved(_ list: [MovedItem]) {
        Store.save("faxina-lixeira.json", Array(list.suffix(5000)))
    }

    static func clean(ids: [String]) throws -> CleanResult {
        guard CleanEnv.destructiveAllowed else {
            throw BridgeError.failed("A limpeza só roda no app aberto (ou na caixa de areia dos testes).")
        }
        var movidos: [CleanResult.Done] = []
        var falhas: [CleanResult.Fail] = []
        var total: Int64 = 0
        let requested = Set(ids)
        var newMoved: [MovedItem] = []
        let running = NSWorkspace.shared.runningApplications

        for id in ids {
            guard let e = CleanRegistry.shared.get(id) else {
                falhas.append(.init(id: id, nome: "?", motivo: "não está mais na lista: escaneie de novo"))
                continue
            }
            do {
                try CleanGuard.check(e)
                // cache de app aberto: o app pode se perder
                if e.item.categoria == "caches" || e.item.categoria == "sistema" || e.item.categoria == "dev",
                   let owner = CleanScan.runningOwner(named: e.item.nome, in: running) {
                    throw CleanGuard.Failure.reason("\(owner) está aberto: feche antes")
                }
                // duplicados: sempre sobra pelo menos uma cópia
                if let g = e.item.grupo {
                    let others = e.groupMembers.filter { $0 != id }
                    let survivors = others.filter { !requested.contains($0) && CleanRegistry.shared.get($0).map { CleanGuard.exists($0.url) } == true }
                    if survivors.isEmpty { throw CleanGuard.Failure.reason("sobraria nenhuma cópia (grupo \(g))") }
                }
                let dest = try moveToTrash(e.url)
                let lid = UUID().uuidString
                newMoved.append(MovedItem(id: lid, nome: e.item.nome, categoria: e.item.categoria,
                                          original: e.url.path, lixeira: dest.path, bytes: e.item.bytes,
                                          t: Date().timeIntervalSince1970, fileID: CleanGuard.fileID(dest)))
                movidos.append(.init(id: id, nome: e.item.nome, bytes: e.item.bytes, lixeiraId: lid))
                total += e.item.bytes
                CleanRegistry.shared.remove(id)
            } catch CleanGuard.Failure.reason(let r) {
                falhas.append(.init(id: id, nome: e.item.nome, motivo: r))
            } catch {
                falhas.append(.init(id: id, nome: e.item.nome, motivo: friendly(error)))
            }
        }
        if !newMoved.isEmpty {
            movedLock.lock()
            saveMoved(movedList() + newMoved)
            movedLock.unlock()
        }
        return CleanResult(movidos: movidos, falhas: falhas, bytes: total, caixaDeAreia: CleanEnv.sandbox != nil)
    }

    /// Lixeira de verdade pelo trashItem; na caixa de areia, uma pasta de mentira.
    private static func moveToTrash(_ url: URL) throws -> URL {
        if CleanEnv.sandbox != nil {
            let dest = CleanEnv.trashDir.appendingPathComponent(UUID().uuidString.prefix(8) + "-" + url.lastPathComponent)
            try CleanEnv.fm.moveItem(at: url, to: dest)
            return dest
        }
        var out: NSURL?
        try CleanEnv.fm.trashItem(at: url, resultingItemURL: &out)
        return (out as URL?) ?? CleanEnv.trashDir.appendingPathComponent(url.lastPathComponent)
    }

    static func friendly(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == NSCocoaErrorDomain {
            switch ns.code {
            case NSFileWriteNoPermissionError, NSFileReadNoPermissionError: return "o macOS não deixou (permissão)"
            case NSFileNoSuchFileError, NSFileReadNoSuchFileError: return "não existe mais"
            case NSFileWriteFileExistsError: return "já existe outro com esse nome"
            case NSFileWriteVolumeReadOnlyError: return "disco só de leitura"
            default: break
            }
        }
        if ns.domain == NSPOSIXErrorDomain && (ns.code == Int(EPERM) || ns.code == Int(EACCES)) {
            return "o macOS não deixou (permissão)"
        }
        return ns.localizedDescription
    }

    // --- o que está na Lixeira por causa da Faxina ---

    struct MovedView: Codable {
        struct Row: Codable { var id: String; var nome: String; var categoria: String; var original: String; var bytes: Int64; var t: Double; var naLixeira: Bool }
        var itens: [Row]
        var bytes: Int64            // soma do que ainda está na Lixeira
        var caixaDeAreia: Bool
    }

    static func movedView() -> MovedView {
        let rows = movedList().reversed().map { m -> MovedView.Row in
            let still = trashEntryValid(m)
            return .init(id: m.id, nome: m.nome, categoria: m.categoria, original: CleanEnv.display(URL(fileURLWithPath: m.original)),
                         bytes: m.bytes, t: m.t, naLixeira: still)
        }
        return MovedView(itens: Array(rows), bytes: rows.filter { $0.naLixeira }.reduce(0) { $0 + $1.bytes },
                         caixaDeAreia: CleanEnv.sandbox != nil)
    }

    /// O item ainda está na Lixeira, é o mesmo que a Faxina colocou lá, e o caminho não escapa dela.
    private static func trashEntryValid(_ m: MovedItem) -> Bool {
        let url = URL(fileURLWithPath: m.lixeira)
        guard CleanGuard.exists(url), !CleanGuard.isSymlink(url) else { return false }
        guard CleanGuard.inside(CleanGuard.resolvedPath(url), CleanEnv.trashDir) else { return false }
        if let id = m.fileID { return CleanGuard.fileID(url) == id }
        return false
    }

    struct SimpleResult: Codable { var ok: Int; var bytes: Int64; var falhas: [CleanResult.Fail] }

    /// Devolve do jeito que estava.
    static func restore(ids: [String]) throws -> SimpleResult {
        guard CleanEnv.destructiveAllowed else { throw BridgeError.failed("Só no app aberto.") }
        movedLock.lock(); defer { movedLock.unlock() }
        var list = movedList()
        var ok = 0, bytes: Int64 = 0
        var falhas: [CleanResult.Fail] = []
        for id in ids {
            guard let i = list.firstIndex(where: { $0.id == id }) else { continue }
            let m = list[i]
            let from = URL(fileURLWithPath: m.lixeira), to = URL(fileURLWithPath: m.original)
            guard trashEntryValid(m) else { falhas.append(.init(id: id, nome: m.nome, motivo: "não está mais na Lixeira")); continue }
            guard CleanGuard.inside(CleanGuard.resolvedPath(to), CleanEnv.home) else { falhas.append(.init(id: id, nome: m.nome, motivo: "lugar original fora da pasta do usuário")); continue }
            guard !CleanGuard.exists(to) else { falhas.append(.init(id: id, nome: m.nome, motivo: "já existe outro no lugar original")); continue }
            do {
                try CleanEnv.fm.createDirectory(at: to.deletingLastPathComponent(), withIntermediateDirectories: true)
                try CleanEnv.fm.moveItem(at: from, to: to)
                list.remove(at: i)
                ok += 1
                bytes += m.bytes
            } catch {
                falhas.append(.init(id: id, nome: m.nome, motivo: friendly(error)))
            }
        }
        saveMoved(list)
        return SimpleResult(ok: ok, bytes: bytes, falhas: falhas)
    }

    /// Apaga de vez só o que a Faxina mandou pra Lixeira (e que continua lá, igualzinho).
    static func purge(ids: [String]?, confirmed: Bool) throws -> SimpleResult {
        guard confirmed else { throw BridgeError.badArgs("precisa de confirmado: true") }
        guard CleanEnv.destructiveAllowed else { throw BridgeError.failed("Só no app aberto.") }
        movedLock.lock(); defer { movedLock.unlock() }
        var list = movedList()
        let wanted = ids.map(Set.init)
        var ok = 0, bytes: Int64 = 0
        var falhas: [CleanResult.Fail] = []
        var keep: [MovedItem] = []
        for m in list {
            guard wanted == nil || wanted!.contains(m.id) else { keep.append(m); continue }
            guard trashEntryValid(m) else { continue }   // já saiu da Lixeira: só esquece
            do {
                try CleanEnv.fm.removeItem(at: URL(fileURLWithPath: m.lixeira))
                ok += 1
                bytes += m.bytes
            } catch {
                falhas.append(.init(id: m.id, nome: m.nome, motivo: friendly(error)))
                keep.append(m)
            }
        }
        list = keep
        saveMoved(list)
        return SimpleResult(ok: ok, bytes: bytes, falhas: falhas)
    }

    struct TrashInfo: Codable {
        var legivel: Bool           // o macOS deixou ver o tamanho da Lixeira toda
        var bytes: Int64?
        var itens: Int?
        var daFaxina: Int64         // quanto do que está lá foi a Faxina que mandou
        var caixaDeAreia: Bool
    }

    static func trashInfo() -> TrashInfo {
        let dir = CleanEnv.trashDir
        var legivel = false
        var bytes: Int64? = nil
        var itens: Int? = nil
        if let kids = try? CleanEnv.fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: []) {
            legivel = true
            itens = kids.count
            let m = CleanScan.measure(dir, deadline: Date().addingTimeInterval(10))
            bytes = m.bytes
        }
        return TrashInfo(legivel: legivel, bytes: bytes, itens: itens, daFaxina: movedView().bytes,
                         caixaDeAreia: CleanEnv.sandbox != nil)
    }

    /// Esvazia a Lixeira inteira. De verdade, pelo Finder (que tem permissão pra isso).
    @MainActor
    static func emptyTrash(confirmed: Bool) throws -> Ok {
        guard confirmed else { throw BridgeError.badArgs("precisa de confirmado: true") }
        guard CleanEnv.destructiveAllowed else { throw BridgeError.failed("Só no app aberto.") }
        if CleanEnv.sandbox != nil {
            let dir = CleanEnv.trashDir
            for k in (try? CleanEnv.fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [] {
                try CleanEnv.fm.removeItem(at: k)
            }
            return Ok()
        }
        var err: NSDictionary?
        let script = NSAppleScript(source: "tell application \"Finder\" to empty trash")
        script?.executeAndReturnError(&err)
        if let err {
            let code = (err[NSAppleScript.errorNumber] as? Int) ?? 0
            if code == -1743 { throw BridgeError.failed("O macOS não deixou o Kamurafy pedir isso ao Finder. Libere em Ajustes do Sistema › Privacidade e Segurança › Automação.") }
            throw BridgeError.failed("O Finder não esvaziou a Lixeira (\(code)).")
        }
        return Ok()
    }

    @MainActor
    static func reveal(id: String) throws -> Ok {
        if let e = CleanRegistry.shared.get(id), CleanGuard.exists(e.url) {
            NSWorkspace.shared.activateFileViewerSelecting([e.url])
            return Ok()
        }
        if let m = movedList().first(where: { $0.id == id }), trashEntryValid(m) {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: m.lixeira)])
            return Ok()
        }
        throw BridgeError.failed("Não achei esse item.")
    }
}

enum CleanupModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("cleanup.categories") { _ in CleanScan.categories }
        r.register("cleanup.scan") { args in
            guard let c = args.string("categoria"), CleanScan.categories.contains(where: { $0.id == c }) else {
                throw BridgeError.badArgs("categoria: " + CleanScan.categories.map { $0.id }.joined(separator: " | "))
            }
            return try await offMain { CleanScan.scan(category: c) }
        }
        r.register("cleanup.large") { args in
            let mb = min(max(args.int("minMB") ?? 100, 10), 100_000)
            return try await offMain { CleanScan.large(minBytes: Int64(mb) * 1_000_000) }
        }
        r.register("cleanup.duplicates") { args in
            let mb = min(max(args.int("minMB") ?? 1, 1), 100_000)
            return try await offMain { CleanScan.duplicates(minBytes: Int64(mb) * 1_000_000) }
        }
        r.register("cleanup.clean") { args in
            guard let ids = args["ids"] as? [String], !ids.isEmpty, ids.count <= 20000 else {
                throw BridgeError.badArgs("ids: lista de IDs da varredura")
            }
            return try await offMain { try Cleanup.clean(ids: ids) }
        }
        r.register("cleanup.moved") { _ in try await offMain { Cleanup.movedView() } }
        r.register("cleanup.restore") { args in
            guard let ids = args["ids"] as? [String], !ids.isEmpty else { throw BridgeError.badArgs("ids") }
            return try await offMain { try Cleanup.restore(ids: ids) }
        }
        r.register("cleanup.purge") { args in
            let ids = args["ids"] as? [String]
            let ok = args.bool("confirmado") ?? false
            return try await offMain { try Cleanup.purge(ids: ids, confirmed: ok) }
        }
        r.register("cleanup.trashInfo") { _ in try await offMain { Cleanup.trashInfo() } }
        r.register("cleanup.emptyTrash") { args in try Cleanup.emptyTrash(confirmed: args.bool("confirmado") ?? false) }
        r.register("cleanup.reveal") { args in
            guard let id = args.string("id") else { throw BridgeError.badArgs("id") }
            return try Cleanup.reveal(id: id)
        }
    }
}
