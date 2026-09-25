import AppKit

// Faxina: regras duras —
//  1. nada sai sem o usuário ver a lista e confirmar;
//  2. tudo vai pra Lixeira (com desfazer); apagar de vez só o que a Faxina mandou pra lá, ou
//     esvaziar a Lixeira pelo Finder, sempre com confirmação;
//  3. a interface só manda IDs de itens que o próprio Swift achou numa varredura; o caminho
//     nunca vem da interface;
//  4. mover e apagar é feito por descritor (SafeFS): pasta aberta sem seguir links, item
//     conferido pelo inode antes e depois, pasta de passagem com nome sorteado;
//  5. pastas permitidas existem exatamente no lugar esperado, sem link nenhum no caminho;
//  6. uma operação que mexe em arquivo por vez (trava única);
//  7. sem sudo, sem nada fora da pasta do usuário (fora a pasta Aplicativos, no Desinstalar).

struct CleanItem: Codable {
    var id: String
    var categoria: String
    var nome: String             // "Firefox", "DerivedData", "instalador.dmg"
    var caminho: String          // pra mostrar, com ~ no lugar da pasta do usuário
    var bytes: Int64             // espaço em disco de verdade (alocado)
    var arquivos: Int
    var modificado: Double?      // Unix (s): a data mais recente lá dentro
    var usado: Double?           // último uso segundo o Spotlight, quando existe
    var selecionado: Bool        // já vem marcado
    var nota: String?
    var app: String?             // app dono (caches)
    var appAberto: Bool
    var icon: String?            // data URL do ícone do app dono
    var tipo: String?            // downloads/grandes: instalador | imagem-disco | app | compactado | video | audio | imagem | documento | pasta | outro
    var grupo: String?           // duplicados
    var semAcesso: Bool          // o macOS não deixou ler nada (falta Acesso Total ao Disco)
    var parcial: Bool? = nil     // leu só uma parte (o tamanho é mínimo)
    var vinculo: String? = nil   // duplicados: "clone" (divide o espaço) | "link" (mesmo arquivo com outro nome)
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
    var aviso: String? = nil     // ex.: a pasta não está onde devia (virou atalho) e ficou de fora
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
    var fileID: String?          // (versões antigas) identidade pelo Foundation
    var dev: Int32? = nil        // identidade de verdade (disco + inode) do item na Lixeira
    var ino: UInt64? = nil
    var root: String? = nil      // pasta permitida de onde saiu (o desfazer só volta pra dentro dela)
}

enum RunMode {
    case app, cli, snapshot
    static var current: RunMode = .app
}

// MARK: - ambiente (pasta do usuário de verdade ou caixa de areia dos testes)

enum CleanEnv {
    static let fm = FileManager.default

    /// Nos testes (build dev), KAMURAFY_FAXINA_HOME aponta pra uma pasta de mentira, dentro de
    /// uma pasta temporária, e a "Lixeira" vira uma pasta dentro dela: nada do usuário é tocado.
    static let sandbox: URL? = {
        #if KAMURAFY_DEV
        if let h = ProcessInfo.processInfo.environment["KAMURAFY_FAXINA_HOME"], !h.isEmpty {
            let u = URL(fileURLWithPath: h, isDirectory: true)
            try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
            let r = CleanGuard.real(u)
            guard r.path.hasPrefix("/private/tmp/") || r.path.hasPrefix("/private/var/folders/") else {
                fputs("KAMURAFY_FAXINA_HOME precisa ser uma pasta temporária (/private/tmp ou /private/var/folders)\n", stderr)
                exit(64)
            }
            return r
        }
        #endif
        return nil
    }()

    static var home: URL {
        sandbox ?? CleanGuard.real(fm.homeDirectoryForCurrentUser)
    }

    static var sandboxTrash: String? {
        guard let s = sandbox else { return nil }
        let t = s.appendingPathComponent(".Lixeira-de-teste", isDirectory: true)
        try? fm.createDirectory(at: t, withIntermediateDirectories: true)
        return CleanGuard.real(t).path
    }

    static var trashDir: URL {
        if let t = sandboxTrash { return URL(fileURLWithPath: t, isDirectory: true) }
        let t = (try? fm.url(for: .trashDirectory, in: .userDomainMask, appropriateFor: home, create: false))
            ?? home.appendingPathComponent(".Trash", isDirectory: true)
        return CleanGuard.real(t)
    }

    /// Mover/apagar só vale no app de verdade (usuário clicando) ou na caixa de areia.
    /// No terminal (--cmd/--seq) e no modo foto, só com KAMURAFY_FAXINA_HOME.
    static var destructiveAllowed: Bool {
        sandbox != nil || RunMode.current == .app
    }

    static func display(_ url: URL) -> String { display(url.path) }

    static func display(_ p: String) -> String {
        let h = home.path
        if p == h { return "~" }
        if p.hasPrefix(h + "/") { return "~" + p.dropFirst(h.count) }
        return p
    }

    static func sub(_ rel: String) -> URL { home.appendingPathComponent(rel) }

    /// Pasta permitida: tem que existir exatamente em home/rel, sem nenhum link no caminho e
    /// no mesmo disco da pasta do usuário. Se alguém trocou ~/Library/Caches por um atalho, a
    /// categoria fica de fora (nil) em vez de varrer o destino do atalho.
    static func root(_ rel: String) -> URL? {
        let lit = home.path + "/" + rel
        guard SafeFS.isLiteralDir(lit),
              let d = SafeFS.lstatInfo(lit)?.ident.dev, d == SafeFS.lstatInfo(home.path)?.ident.dev else { return nil }
        return URL(fileURLWithPath: lit, isDirectory: true)
    }
}

// MARK: - registro dos itens achados (a interface só conhece os IDs)

final class CleanRegistry {
    static let shared = CleanRegistry()
    static let lifetime: TimeInterval = 3600

    struct Entry {
        var item: CleanItem
        var parent: String           // pasta onde o item está (caminho real)
        var name: String
        var root: String             // pasta permitida em que foi achado
        var ident: SafeFS.Ident
        var size: Int64              // tamanho lógico (arquivos) na varredura
        var mtimeNs: Int64
        var groupMembers: [String] = []
        var hash: String? = nil      // duplicados: SHA-256 do conteúdo na varredura
        var owners: [String] = []    // prefixos de bundle id dos apps donos (pra checar "aberto")
        var url: URL { URL(fileURLWithPath: parent).appendingPathComponent(name) }
    }

    private let lock = NSLock()
    private var entries: [String: Entry] = [:]
    private var createdAt: [String: Date] = [:]

    func add(_ e: Entry) {
        lock.lock(); defer { lock.unlock() }
        entries[e.item.id] = e
        createdAt[e.item.id] = Date()
        if entries.count % 256 == 0 { prune() }
    }

    /// Vale por 1 hora; depois disso a lista da tela está velha demais pra confiar.
    func get(_ id: String) -> Entry? {
        lock.lock(); defer { lock.unlock() }
        guard let d = createdAt[id], Date().timeIntervalSince(d) < CleanRegistry.lifetime else {
            entries[id] = nil; createdAt[id] = nil
            return nil
        }
        return entries[id]
    }

    func remove(_ id: String) {
        lock.lock(); defer { lock.unlock() }
        entries[id] = nil
        createdAt[id] = nil
    }

    private func prune() {
        let old = Date().addingTimeInterval(-CleanRegistry.lifetime)
        for (k, d) in createdAt where d < old { entries[k] = nil; createdAt[k] = nil }
    }
}

// MARK: - conferências

enum CleanGuard {
    /// Caminho canônico (realpath). URL.resolvingSymlinksInPath troca /private/var por /var e
    /// standardizedFileURL depende de o arquivo existir: nenhum dos dois serve pra comparar.
    static func real(_ url: URL) -> URL {
        guard let p = realpath(url.path, nil) else { return URL(fileURLWithPath: url.path) }
        defer { free(p) }
        return URL(fileURLWithPath: String(cString: p), isDirectory: url.hasDirectoryPath)
    }

    static func exists(_ url: URL) -> Bool { SafeFS.lstatInfo(url.path) != nil }
    static func isSymlink(_ url: URL) -> Bool { SafeFS.lstatInfo(url.path)?.isLink ?? false }
    static func device(_ url: URL) -> Int? { SafeFS.lstatInfo(url.path).map { Int($0.ident.dev) } }

    /// `child` está dentro de `root`, comparando só o texto dos caminhos (já resolvidos).
    static func inside(_ child: String, _ root: String) -> Bool {
        let c = (child as NSString).pathComponents, r = (root as NSString).pathComponents
        return c.count > r.count && Array(c.prefix(r.count)) == r
    }

    static func inside(_ child: URL, _ root: URL) -> Bool { inside(child.path, root.path) }

    /// Pasta-mãe resolvida + o último componente intacto (o item em si nunca é seguido).
    static func resolvedPath(_ url: URL) -> URL {
        real(url.deletingLastPathComponent()).appendingPathComponent(url.lastPathComponent)
    }

    /// Identidade atual lida na hora (lstat), sem cache nenhum.
    static func sameAsScan(_ e: CleanRegistry.Entry) -> Bool {
        guard let now = SafeFS.lstatInfo(e.url.path), !now.isLink else { return false }
        if now.ident != e.ident { return false }
        if !now.isDir && (now.size != e.size || now.mtimeNs != e.mtimeNs) { return false }
        return true
    }

    enum Failure: Error { case reason(String) }

    /// Conferência de antes (a definitiva acontece no SafeFS, por descritor).
    static func check(_ e: CleanRegistry.Entry) throws {
        let home = CleanEnv.home.path
        guard inside(e.root, home) || e.root == home else { throw Failure.reason("pasta fora da pasta do usuário") }
        guard e.parent == e.root || inside(e.parent, e.root) else { throw Failure.reason("saiu da pasta permitida") }
        guard SafeFS.isLiteralDir(e.root) else { throw Failure.reason("a pasta mudou (virou atalho ou sumiu)") }
        guard let now = SafeFS.lstatInfo(e.url.path) else { throw Failure.reason("não existe mais") }
        guard !now.isLink else { throw Failure.reason("virou um link simbólico") }
        guard now.ident == e.ident else { throw Failure.reason("mudou desde a varredura") }
        guard let rootDev = SafeFS.lstatInfo(e.root)?.ident.dev, rootDev == now.ident.dev else {
            throw Failure.reason("está em outro disco")
        }
        guard e.url.path != home else { throw Failure.reason("é a pasta do usuário") }
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
    /// Uma operação que mexe em arquivo por vez (limpar, desfazer, apagar, esvaziar, desinstalar).
    static let opLock = NSLock()
    private static let movedLock = NSLock()

    // --- lista do que a Faxina mandou pra Lixeira (pra desfazer ou apagar de vez) ---

    static func movedList() -> [MovedItem] {
        Store.load("faxina-lixeira.json", as: [MovedItem].self) ?? []
    }

    private static func saveMoved(_ list: [MovedItem]) {
        Store.save("faxina-lixeira.json", Array(list.suffix(5000)))
    }

    /// Anota algo que foi pra Lixeira por outro caminho (ex.: app desinstalado).
    static func recordMoved(_ m: MovedItem) {
        movedLock.lock(); defer { movedLock.unlock() }
        saveMoved(movedList() + [m])
    }

    static func clean(ids: [String]) throws -> CleanResult {
        guard CleanEnv.destructiveAllowed else {
            throw BridgeError.failed("A limpeza só roda no app aberto (ou na caixa de areia dos testes).")
        }
        opLock.lock(); defer { opLock.unlock() }
        var movidos: [CleanResult.Done] = []
        var falhas: [CleanResult.Fail] = []
        var total: Int64 = 0
        let requested = Set(ids)
        var newMoved: [MovedItem] = []
        let running = NSWorkspace.shared.runningApplications

        for id in ids {
            guard let e = CleanRegistry.shared.get(id) else {
                falhas.append(.init(id: id, nome: "?", motivo: "a lista venceu: procure de novo"))
                continue
            }
            do {
                try CleanGuard.check(e)
                // cache de app aberto: o app pode se perder
                if let owner = CleanScan.runningOwner(name: e.name, prefixes: e.owners, in: running) {
                    throw CleanGuard.Failure.reason("\(owner) está aberto: feche antes")
                }
                // duplicados: o item e pelo menos uma cópia igual continuam idênticos à varredura
                if e.item.grupo != nil {
                    guard CleanGuard.sameAsScan(e), let h = e.hash, CleanScan.fullHash(e.url, size: e.size) == h else {
                        throw CleanGuard.Failure.reason("mudou desde a varredura: procure de novo")
                    }
                    let keeper = e.groupMembers.lazy
                        .filter { $0 != id && !requested.contains($0) }
                        .compactMap { CleanRegistry.shared.get($0) }
                        .first { CleanGuard.sameAsScan($0) && $0.ident != e.ident && CleanScan.fullHash($0.url, size: $0.size) == h }
                    guard keeper != nil else { throw CleanGuard.Failure.reason("não sobraria nenhuma cópia igual: procure de novo") }
                }
                let t = try SafeFS.moveToTrash(parent: e.parent, name: e.name, expected: e.ident,
                                               sandboxTrash: CleanEnv.sandboxTrash)
                let lid = UUID().uuidString
                if let dest = t.url {
                    newMoved.append(MovedItem(id: lid, nome: e.item.nome, categoria: e.item.categoria,
                                              original: e.url.path, lixeira: dest.path, bytes: e.item.bytes,
                                              t: Date().timeIntervalSince1970, fileID: nil,
                                              dev: t.ident?.dev, ino: t.ident?.ino, root: e.root))
                }
                movidos.append(.init(id: id, nome: e.item.nome, bytes: e.item.bytes, lixeiraId: t.url == nil ? "" : lid))
                total += e.item.bytes
                CleanRegistry.shared.remove(id)
            } catch CleanGuard.Failure.reason(let r) {
                falhas.append(.init(id: id, nome: e.item.nome, motivo: r))
            } catch SafeFS.Failure.reason(let r) {
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

    static func friendly(_ error: Error) -> String {
        if case SafeFS.Failure.reason(let r) = error { return r }
        if case CleanGuard.Failure.reason(let r) = error { return r }
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
            .init(id: m.id, nome: m.nome, categoria: m.categoria, original: CleanEnv.display(m.original),
                  bytes: m.bytes, t: m.t, naLixeira: trashIdent(m) != nil)
        }
        return MovedView(itens: Array(rows), bytes: rows.filter { $0.naLixeira }.reduce(0) { $0 + $1.bytes },
                         caixaDeAreia: CleanEnv.sandbox != nil)
    }

    /// O item ainda está na Lixeira, direto nela, e é o mesmo que a Faxina colocou lá.
    private static func trashIdent(_ m: MovedItem) -> SafeFS.Ident? {
        guard let dev = m.dev, let ino = m.ino else { return nil }
        let url = URL(fileURLWithPath: m.lixeira)
        guard url.deletingLastPathComponent().path == CleanEnv.trashDir.path else { return nil }
        guard let now = SafeFS.lstatInfo(url.path), !now.isLink, now.ident == SafeFS.Ident(dev: dev, ino: ino) else { return nil }
        return now.ident
    }

    struct SimpleResult: Codable { var ok: Int; var bytes: Int64; var falhas: [CleanResult.Fail] }

    /// Devolve do jeito que estava: rename atômico da Lixeira pra pasta original, que tem que
    /// existir, sem atalho no caminho e dentro da pasta permitida de onde o item saiu.
    static func restore(ids: [String]) throws -> SimpleResult {
        guard CleanEnv.destructiveAllowed else { throw BridgeError.failed("Só no app aberto.") }
        opLock.lock(); defer { opLock.unlock() }
        movedLock.lock(); defer { movedLock.unlock() }
        var list = movedList()
        var ok = 0, bytes: Int64 = 0
        var falhas: [CleanResult.Fail] = []
        for id in ids {
            guard let i = list.firstIndex(where: { $0.id == id }) else { continue }
            let m = list[i]
            guard let ident = trashIdent(m) else { falhas.append(.init(id: id, nome: m.nome, motivo: "não está mais na Lixeira")); continue }
            let to = URL(fileURLWithPath: m.original)
            let parent = to.deletingLastPathComponent().path
            let allowed: Bool
            if m.categoria == "app" {
                allowed = to.pathExtension == "app" && Uninstall.roots.contains { parent == $0.0.path || CleanGuard.inside(parent, $0.0.path) }
            } else if let root = m.root {
                allowed = (parent == root || CleanGuard.inside(parent, root)) && CleanGuard.inside(root, CleanEnv.home.path)
            } else {
                allowed = false
            }
            guard allowed else { falhas.append(.init(id: id, nome: m.nome, motivo: "lugar original não confere: devolva pelo Finder")); continue }
            do {
                try SafeFS.moveBack(fromDir: CleanEnv.trashDir.path, fromName: (m.lixeira as NSString).lastPathComponent,
                                    expected: ident, toDir: parent, toName: to.lastPathComponent)
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
        opLock.lock(); defer { opLock.unlock() }
        movedLock.lock(); defer { movedLock.unlock() }
        let wanted = ids.map(Set.init)
        var ok = 0, bytes: Int64 = 0
        var falhas: [CleanResult.Fail] = []
        var keep: [MovedItem] = []
        let trash = CleanEnv.trashDir.path
        for m in movedList() {
            guard wanted == nil || wanted!.contains(m.id) else { keep.append(m); continue }
            guard let ident = trashIdent(m) else { continue }   // já saiu da Lixeira: só esquece
            do {
                try SafeFS.removeForever(dir: trash, name: (m.lixeira as NSString).lastPathComponent, expected: ident)
                ok += 1
                bytes += m.bytes
            } catch {
                var motivo = friendly(error)
                if motivo.contains("permissão") { motivo += ": use \"Esvaziar a Lixeira toda\" (pelo Finder)" }
                falhas.append(.init(id: m.id, nome: m.nome, motivo: motivo))
                keep.append(m)
            }
        }
        saveMoved(keep)
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
        if let kids = try? CleanEnv.fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
            legivel = true
            let visible = kids.filter { $0.lastPathComponent != ".DS_Store" }
            itens = visible.count
            let deadline = Date().addingTimeInterval(10)
            bytes = visible.reduce(Int64(0)) { $0 + CleanScan.measure($1, deadline: deadline).bytes }
        }
        return TrashInfo(legivel: legivel, bytes: bytes, itens: itens, daFaxina: movedView().bytes,
                         caixaDeAreia: CleanEnv.sandbox != nil)
    }

    /// Esvazia a Lixeira inteira. De verdade, pelo Finder (que tem permissão pra isso).
    @MainActor
    static func emptyTrash(confirmed: Bool) throws -> Ok {
        guard confirmed else { throw BridgeError.badArgs("precisa de confirmado: true") }
        guard CleanEnv.destructiveAllowed else { throw BridgeError.failed("Só no app aberto.") }
        opLock.lock(); defer { opLock.unlock() }
        if let t = CleanEnv.sandboxTrash {
            guard let dfd = SafeFS.openDirNoFollow(t) else { throw BridgeError.failed("Lixeira de teste sumiu.") }
            defer { close(dfd) }
            let dev = SafeFS.lstatInfo(t)?.ident.dev ?? 0
            for k in (try? CleanEnv.fm.contentsOfDirectory(atPath: t)) ?? [] { _ = SafeFS.removeTree(dfd, k, device: dev) }
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
        if let m = movedList().first(where: { $0.id == id }), trashIdent(m) != nil {
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
