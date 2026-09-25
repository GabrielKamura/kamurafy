import AppKit
import CryptoKit
import CoreServices

/// Varreduras da Faxina. Só leem: nada aqui move ou apaga.
enum CleanScan {
    static let categories: [CategoryInfo] = [
        .init(id: "caches", titulo: "Caches de apps",
              descricao: "Arquivos temporários que os apps guardam pra abrir mais rápido. Eles recriam sozinhos quando precisam.",
              precisaPermissao: false),
        .init(id: "dev", titulo: "Caches de programação",
              descricao: "Downloads e compilações guardados por npm, pip, Xcode e companhia. Eles baixam de novo quando precisarem.",
              precisaPermissao: false),
        .init(id: "logs", titulo: "Registros (logs)",
              descricao: "Anotações que os apps fazem do que aconteceu, inclusive relatórios de travamento. Só servem pra quem investiga um erro.",
              precisaPermissao: false),
        .init(id: "sistema", titulo: "Caches do macOS",
              descricao: "Temporários dos apps da Apple. O macOS recria sozinho; algumas coisas podem ficar um pouco mais lentas na primeira vez.",
              precisaPermissao: false),
        .init(id: "downloads", titulo: "Downloads esquecidos",
              descricao: "Coisas na pasta Downloads que ninguém abre há mais de 3 meses. São arquivos seus: nada vem marcado.",
              precisaPermissao: true),
    ]

    // ---- o que nunca entra (mexer poderia atrapalhar iCloud, compras, carteira...) ----
    private static let neverPrefixes = [
        "com.apple.bird", "com.apple.nsurlsessiond", "com.apple.akd", "com.apple.icloud", "com.apple.iCloud",
        "com.apple.containermanagerd", "com.apple.HomeKit", "com.apple.homed", "com.apple.Safari",
        "com.apple.WebKit", "com.apple.passd", "com.apple.ap.", "com.apple.appstoreagent", "com.apple.installer",
        "com.apple.SoftwareUpdate", "com.apple.softwareupdate", "com.apple.mobileassetd", "com.apple.MobileAsset",
        "com.apple.Spotlight", "com.apple.metadata", "com.apple.nsservicescache", "com.apple.CloudPhotos",
        "com.apple.photoanalysisd", "com.apple.findmy", "com.apple.FindMy", "com.apple.icloudmailagent",
        "com.apple.keychain", "com.apple.security", "com.apple.trustd", "com.apple.accountsd",
    ]
    private static let neverNames: Set<String> = [
        "CloudKit", "PassKit", "GameKit", "familycircled", "FamilyCircle", "Metadata", "com.apple.bird",
        "storedownloadd", "SharedStorage", "Kamurafy", "com.kamurafy.mac",
    ]
    /// Pastas com nome "solto" que são do macOS (vão pra categoria sistema).
    private static let appleNames: Set<String> = [
        "GeoServices", "SharedImageCache", "Animoji", "mbuseragent", "ColorSync", "FamilySettings",
        "com.apple.python", "SiriTTS", "AppleSpell",
    ]
    /// Ferramentas de programação que guardam cache em ~/Library/Caches.
    private static let devNames: Set<String> = [
        "pip", "pip-tools", "pipenv", "poetry", "pypoetry", "node-gyp", "bun", "typescript", "yarn", "pnpm",
        "homebrew", "puccinialin", "go-build", "cocoapods", "jetbrains", "ms-playwright", "deno", "electron",
        "electron-builder", "org.carthage.carthagekit", "org.swift.swiftpm", "com.apple.dt.xcode",
        "mozilla-sccache", "sccache", "prisma", "turbo", "vscode-cpptools", "uv", "ruff", "black", "mypy",
        "pre-commit", "huggingface-transformers-cache",
    ]
    /// Caches de programação fora de ~/Library/Caches: (pai relativo à pasta do usuário, nome, marcado?, nota)
    private static let devPaths: [(String, String, Bool, String)] = [
        (".npm", "_cacache", true, "Pacotes baixados pelo npm. Ele baixa de novo quando precisar."),
        (".npm", "_logs", true, "Registros do npm."),
        ("Library/Developer/Xcode", "DerivedData", true, "Compilações do Xcode. Ele refaz na próxima vez que compilar."),
        ("Library/Developer/Xcode", "iOS DeviceSupport", false, "Arquivos de suporte de iPhones conectados. Voltam quando você conectar o aparelho de novo."),
        ("Library/Developer/CoreSimulator", "Caches", true, "Cache dos simuladores do Xcode."),
        (".gradle", "caches", true, "Dependências baixadas pelo Gradle."),
        (".cargo/registry", "cache", true, "Pacotes baixados pelo Cargo (Rust)."),
        (".cache", "pip", true, "Pacotes baixados pelo pip."),
        (".cache", "uv", true, "Pacotes baixados pelo uv (Python)."),
        (".cache", "yarn", true, "Pacotes baixados pelo Yarn."),
        (".cache", "pre-commit", true, "Ambientes do pre-commit."),
    ]
    /// Nome de pasta de cache → pedaço do bundle id do app (pra saber se está aberto e pegar o ícone).
    private static let ownerHints: [String: String] = [
        "firefox": "org.mozilla.firefox", "bravesoftware": "com.brave.Browser", "google": "com.google.Chrome",
        "microsoft edge": "com.microsoft.edgemac", "spotify": "com.spotify.client", "slack": "com.tinyspeck.slackmacgap",
        "discord": "com.hnc.Discord", "zoom.us": "us.zoom.xos", "telegram": "ru.keepcoder.Telegram",
        "whatsapp": "net.whatsapp.WhatsApp", "arc": "company.thebrowser.Browser", "opera": "com.operasoftware.Opera",
    ]

    // MARK: medir

    struct Measure { var bytes: Int64 = 0; var files = 0; var denied = false; var newest: Date?; var truncated = false }

    /// Espaço em disco de uma pasta ou arquivo, sem seguir links simbólicos e sem trocar de disco.
    static func measure(_ url: URL, deadline: Date) -> Measure {
        var m = Measure()
        let keys: [URLResourceKey] = [.isSymbolicLinkKey, .isRegularFileKey, .isDirectoryKey,
                                      .totalFileAllocatedSizeKey, .fileAllocatedSizeKey, .contentModificationDateKey]
        guard let top = try? url.resourceValues(forKeys: Set(keys)) else { m.denied = true; return m }
        if top.isSymbolicLink == true { return m }
        m.newest = top.contentModificationDate
        if top.isDirectory != true {
            m.bytes = Int64(top.totalFileAllocatedSize ?? top.fileAllocatedSize ?? 0)
            m.files = 1
            return m
        }
        let dev = CleanGuard.device(url)
        guard let en = FileManager.default.enumerator(at: url, includingPropertiesForKeys: keys, options: [],
                                                      errorHandler: { _, _ in m.denied = true; return true }) else {
            m.denied = true
            return m
        }
        var n = 0
        for case let f as URL in en {
            n += 1
            if n % 512 == 0, Date() > deadline { m.truncated = true; break }
            guard let v = try? f.resourceValues(forKeys: Set(keys)) else { continue }
            if v.isSymbolicLink == true { continue }
            if v.isDirectory == true {
                if let d = dev, CleanGuard.device(f) != d { en.skipDescendants() }   // outro disco montado aqui
                continue
            }
            m.bytes += Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            m.files += 1
            if let d = v.contentModificationDate, d > (m.newest ?? .distantPast) { m.newest = d }
        }
        return m
    }

    // MARK: dono do cache

    static func runningOwner(named name: String, in running: [NSRunningApplication]) -> String? {
        let key = name.lowercased()
        let hint = ownerHints[key]?.lowercased()
        for app in running where app.activationPolicy == .regular {
            let bid = (app.bundleIdentifier ?? "").lowercased()
            if bid.isEmpty { continue }
            if bid == key || (hint != nil && bid == hint) { return app.localizedName ?? name }
            // "com.brave.Browser.helper" etc.: prefixo do bundle id do cache
            if key.contains("."), key.count > 6, bid.hasPrefix(key) { return app.localizedName ?? name }
        }
        return nil
    }

    private static func ownerApp(for name: String) -> (name: String, icon: String?)? {
        let bid = ownerHints[name.lowercased()] ?? (name.contains(".") ? name : nil)
        guard let b = bid, let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: b) else { return nil }
        let appName = (FileManager.default.displayName(atPath: url.path) as NSString).deletingPathExtension
        let img = NSWorkspace.shared.icon(forFile: url.path)
        return (appName, iconData(img))
    }

    static func iconData(_ icon: NSImage) -> String? {
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

    // MARK: montar item

    private static func makeItem(_ url: URL, root: URL, categoria: String, directChild: Bool = true,
                                 selecionado: Bool, nota: String?, measure m: Measure,
                                 app: String? = nil, appAberto: Bool = false, icon: String? = nil,
                                 tipo: String? = nil, usado: Date? = nil, grupo: String? = nil,
                                 nome: String? = nil) -> CleanItem {
        let item = CleanItem(id: UUID().uuidString, categoria: categoria, nome: nome ?? url.lastPathComponent,
                             caminho: CleanEnv.display(url), bytes: m.bytes, arquivos: m.files,
                             modificado: m.newest?.timeIntervalSince1970, usado: usado?.timeIntervalSince1970,
                             selecionado: selecionado && !m.denied && m.bytes > 0, nota: nota, app: app,
                             appAberto: appAberto, icon: icon, tipo: tipo, grupo: grupo, semAcesso: m.denied && m.bytes == 0)
        return item
    }

    private static func register(_ item: CleanItem, url: URL, root: URL, directChild: Bool, members: [String] = []) {
        CleanRegistry.shared.add(.init(item: item, url: url, root: root, directChild: directChild,
                                       fileID: CleanGuard.fileID(url), device: CleanGuard.device(url),
                                       groupMembers: members))
    }

    private static func children(_ dir: URL) -> [URL]? {
        try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isSymbolicLinkKey], options: [])
    }

    private static func classify(_ name: String) -> String? {
        if neverNames.contains(name) || neverPrefixes.contains(where: { name.hasPrefix($0) }) { return nil }
        if name.hasPrefix(".") { return nil }
        let low = name.lowercased()
        if devNames.contains(low) { return "dev" }
        if name.hasPrefix("com.apple.") || appleNames.contains(name) { return "sistema" }
        return "caches"
    }

    // MARK: categorias

    static func scan(category: String) -> CleanCategory {
        let t0 = Date()
        let deadline = t0.addingTimeInterval(25)
        let info = categories.first { $0.id == category }!
        var itens: [CleanItem] = []
        var semAcesso = 0
        var incompleto = false
        let running = NSWorkspace.shared.runningApplications

        func add(_ url: URL, root: URL, selecionado: Bool, nota: String?, app: String? = nil, aberto: Bool = false,
                 icon: String? = nil, tipo: String? = nil, usado: Date? = nil, nome: String? = nil) {
            let m = measure(url, deadline: deadline)
            if m.truncated { incompleto = true }
            if m.denied && m.bytes == 0 { semAcesso += 1 }
            guard m.bytes > 0 || m.denied else { return }
            let it = makeItem(url, root: root, categoria: category, selecionado: selecionado && !aberto, nota: nota,
                              measure: m, app: app, appAberto: aberto, icon: icon, tipo: tipo, usado: usado, nome: nome)
            register(it, url: url, root: root, directChild: true)
            itens.append(it)
        }

        switch category {
        case "caches", "sistema":
            let root = CleanEnv.root("Library/Caches")
            for u in children(root) ?? [] where !CleanGuard.isSymlink(u) {
                let name = u.lastPathComponent
                guard classify(name) == category else { continue }
                let owner = ownerApp(for: name)
                let aberto = runningOwner(named: name, in: running)
                var nota: String
                if let a = aberto { nota = "\(a) está aberto: feche antes de limpar." }
                else if category == "sistema" { nota = "Cache do macOS: ele recria sozinho." }
                else { nota = "O app recria sozinho quando precisar." }
                if owner == nil && category == "caches" && aberto == nil { nota = "Não sei de qual app é, mas é cache: pode ir." }
                add(u, root: root, selecionado: category == "caches", nota: nota, app: owner?.name ?? aberto,
                    aberto: aberto != nil, icon: owner?.icon)
            }
        case "dev":
            let caches = CleanEnv.root("Library/Caches")
            for u in children(caches) ?? [] where !CleanGuard.isSymlink(u) {
                guard classify(u.lastPathComponent) == "dev" else { continue }
                add(u, root: caches, selecionado: true, nota: "Cache de ferramenta de programação: baixa de novo quando precisar.")
            }
            var seen = Set<String>()
            for (parent, name, sel, nota) in devPaths {
                let root = CleanEnv.root(parent)
                let u = root.appendingPathComponent(name)
                guard CleanGuard.exists(u), !CleanGuard.isSymlink(u), CleanGuard.inside(root, CleanEnv.home) else { continue }
                seen.insert(u.path)
                add(u, root: root, selecionado: sel, nota: nota)
            }
            // o resto de ~/.cache (padrão das ferramentas de terminal): aparece, mas não vem marcado
            let xdg = CleanEnv.root(".cache")
            for u in children(xdg) ?? [] where !CleanGuard.isSymlink(u) && !seen.contains(u.path) && !u.lastPathComponent.hasPrefix(".") {
                add(u, root: xdg, selecionado: false, nota: "Cache de ferramenta de terminal. Pode limpar se ela não estiver rodando agora.")
            }
        case "logs":
            let root = CleanEnv.root("Library/Logs")
            for u in children(root) ?? [] where !CleanGuard.isSymlink(u) && !u.lastPathComponent.hasPrefix(".") {
                let name = u.lastPathComponent
                let nota = name == "DiagnosticReports" ? "Relatórios de travamento dos apps." : "Registros de \(name)."
                add(u, root: root, selecionado: true, nota: nota)
            }
        case "downloads":
            let root = CleanEnv.root("Downloads")
            guard let kids = children(root) else { semAcesso = 1; break }
            let cutoff = Date().addingTimeInterval(-90 * 86400)
            for u in kids where !CleanGuard.isSymlink(u) && !u.lastPathComponent.hasPrefix(".") {
                let used = lastUsed(u)
                let added = (try? u.resourceValues(forKeys: [.addedToDirectoryDateKey]))?.addedToDirectoryDate
                let mod = (try? u.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
                let recent = [used, added, mod].compactMap { $0 }.max() ?? .distantPast
                guard recent < cutoff else { continue }
                let tipo = fileKind(u)
                add(u, root: root, selecionado: false,
                    nota: tipo == "instalador" ? "Instalador: se o app já está instalado, não precisa mais." : nil,
                    tipo: tipo, usado: used)
            }
        default:
            break
        }

        itens.sort { $0.bytes > $1.bytes }
        let total = itens.reduce(Int64(0)) { $0 + $1.bytes }
        let sel = itens.filter { $0.selecionado }.reduce(Int64(0)) { $0 + $1.bytes }
        return CleanCategory(id: category, titulo: info.titulo, descricao: info.descricao, bytes: total,
                             bytesSelecionados: sel, itens: itens, semAcesso: semAcesso, incompleto: incompleto,
                             ms: Int(Date().timeIntervalSince(t0) * 1000))
    }

    static func lastUsed(_ url: URL) -> Date? {
        guard let item = MDItemCreate(kCFAllocatorDefault, url.path as CFString) else { return nil }
        return MDItemCopyAttribute(item, kMDItemLastUsedDate) as? Date
    }

    static func fileKind(_ url: URL) -> String {
        if (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true,
           (try? url.resourceValues(forKeys: [.isPackageKey]))?.isPackage != true { return "pasta" }
        switch url.pathExtension.lowercased() {
        case "dmg", "pkg", "mpkg", "iso", "app": return "instalador"
        case "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz": return "compactado"
        case "mp4", "mov", "mkv", "avi", "m4v", "webm": return "video"
        case "mp3", "wav", "m4a", "aac", "flac", "aiff": return "audio"
        case "jpg", "jpeg", "png", "gif", "heic", "webp", "tiff", "psd", "raw": return "imagem"
        case "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "key", "pages", "numbers", "txt", "csv": return "documento"
        default: return "outro"
        }
    }

    // MARK: arquivos grandes

    struct LargeResult: Codable { var itens: [CleanItem]; var bytes: Int64; var incompleto: Bool; var semAcesso: Int; var ms: Int }

    /// Pastas de arquivos pessoais (o macOS pede permissão pra Mesa, Documentos e Downloads).
    static var personalRoots: [URL] {
        ["Downloads", "Desktop", "Documents", "Movies", "Music", "Pictures"].map { CleanEnv.root($0) }
            .filter { CleanGuard.exists($0) }
    }

    private struct FileHit { var url: URL; var root: URL; var bytes: Int64; var mod: Date?; var id: String? }

    private static func walkPersonal(minBytes: Int64, deadline: Date, maxFiles: Int, semAcesso: inout Int, truncated: inout Bool) -> [FileHit] {
        var out: [FileHit] = []
        let keys: [URLResourceKey] = [.isSymbolicLinkKey, .isRegularFileKey, .isDirectoryKey, .totalFileAllocatedSizeKey,
                                      .fileAllocatedSizeKey, .contentModificationDateKey, .fileResourceIdentifierKey]
        var visited = 0
        for root in personalRoots {
            var denied = false
            guard let en = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys,
                                                          options: [.skipsHiddenFiles, .skipsPackageDescendants],
                                                          errorHandler: { _, _ in denied = true; return true }) else {
                semAcesso += 1
                continue
            }
            let dev = CleanGuard.device(root)
            for case let f as URL in en {
                visited += 1
                if visited % 512 == 0, Date() > deadline { truncated = true; break }
                guard let v = try? f.resourceValues(forKeys: Set(keys)) else { continue }
                if v.isSymbolicLink == true { continue }
                if v.isDirectory == true {
                    if let d = dev, CleanGuard.device(f) != d { en.skipDescendants() }
                    continue
                }
                guard v.isRegularFile == true else { continue }
                let b = Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)   // arquivo só no iCloud ocupa ~0
                guard b >= minBytes else { continue }
                out.append(FileHit(url: f, root: root, bytes: b, mod: v.contentModificationDate,
                                   id: v.fileResourceIdentifier.map { String(describing: $0) }))
                if out.count >= maxFiles { truncated = true; break }
            }
            if denied { semAcesso += 1 }
            if truncated && Date() > deadline { break }
        }
        return out
    }

    static func large(minBytes: Int64) -> LargeResult {
        let t0 = Date()
        var semAcesso = 0, truncated = false
        let hits = walkPersonal(minBytes: minBytes, deadline: t0.addingTimeInterval(40), maxFiles: 20000,
                                semAcesso: &semAcesso, truncated: &truncated)
        var itens: [CleanItem] = []
        for h in hits.sorted(by: { $0.bytes > $1.bytes }).prefix(300) {
            var m = Measure(); m.bytes = h.bytes; m.files = 1; m.newest = h.mod
            let it = makeItem(h.url, root: h.root, categoria: "grandes", directChild: false, selecionado: false,
                              nota: nil, measure: m, tipo: fileKind(h.url), usado: lastUsed(h.url))
            register(it, url: h.url, root: h.root, directChild: false)
            itens.append(it)
        }
        return LargeResult(itens: itens, bytes: itens.reduce(0) { $0 + $1.bytes }, incompleto: truncated,
                           semAcesso: semAcesso, ms: Int(Date().timeIntervalSince(t0) * 1000))
    }

    // MARK: duplicados

    struct DupGroup: Codable { var id: String; var bytesCada: Int64; var desperdicio: Int64; var itens: [CleanItem] }
    struct DupResult: Codable { var grupos: [DupGroup]; var desperdicio: Int64; var incompleto: Bool; var semAcesso: Int; var ms: Int }

    private static func hash(_ url: URL, partial: Bool) -> String? {
        guard let h = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? h.close() }
        var sha = SHA256()
        if partial {
            let head = (try? h.read(upToCount: 65536)) ?? Data()
            sha.update(data: head)
            if let end = try? h.seekToEnd(), end > 131072 {
                try? h.seek(toOffset: end - 65536)
                sha.update(data: (try? h.read(upToCount: 65536)) ?? Data())
            }
        } else {
            while let chunk = try? h.read(upToCount: 1 << 20), !chunk.isEmpty { sha.update(data: chunk) }
        }
        return sha.finalize().map { String(format: "%02x", $0) }.joined()
    }

    static func duplicates(minBytes: Int64) -> DupResult {
        let t0 = Date()
        let deadline = t0.addingTimeInterval(60)
        var semAcesso = 0, truncated = false
        let hits = walkPersonal(minBytes: minBytes, deadline: t0.addingTimeInterval(30), maxFiles: 60000,
                                semAcesso: &semAcesso, truncated: &truncated)
        // mesmo tamanho → candidatos; mesmo arquivo (hard link) não é duplicado
        var bySize: [Int64: [FileHit]] = [:]
        var seenIDs = Set<String>()
        for h in hits {
            if let id = h.id { if seenIDs.contains(id) { continue }; seenIDs.insert(id) }
            let logical = (try? h.url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize.map { Int64($0) } ?? h.bytes
            bySize[logical, default: []].append(h)
        }
        var groups: [[FileHit]] = []
        for (_, list) in bySize.sorted(by: { $0.key > $1.key }) where list.count > 1 {
            if Date() > deadline { truncated = true; break }
            var byPartial: [String: [FileHit]] = [:]
            for h in list { if let k = hash(h.url, partial: true) { byPartial[k, default: []].append(h) } }
            for (_, p) in byPartial where p.count > 1 {
                var byFull: [String: [FileHit]] = [:]
                for h in p {
                    if Date() > deadline { truncated = true; break }
                    if let k = hash(h.url, partial: false) { byFull[k, default: []].append(h) }
                }
                groups += byFull.values.filter { $0.count > 1 }
            }
        }
        var out: [DupGroup] = []
        for g in groups {
            let gid = UUID().uuidString
            let ids = g.map { _ in UUID().uuidString }
            var itens: [CleanItem] = []
            // o mais antigo primeiro (costuma ser o "original")
            let ordered = zip(ids, g).sorted { ($0.1.mod ?? .distantPast) < ($1.1.mod ?? .distantPast) }
            for (id, h) in ordered {
                var m = Measure(); m.bytes = h.bytes; m.files = 1; m.newest = h.mod
                var it = makeItem(h.url, root: h.root, categoria: "duplicados", directChild: false, selecionado: false,
                                  nota: nil, measure: m, tipo: fileKind(h.url), grupo: gid)
                it.id = id
                register(it, url: h.url, root: h.root, directChild: false, members: ids)
                itens.append(it)
            }
            let each = g.first?.bytes ?? 0
            out.append(DupGroup(id: gid, bytesCada: each, desperdicio: each * Int64(g.count - 1), itens: itens))
        }
        out.sort { $0.desperdicio > $1.desperdicio }
        return DupResult(grupos: Array(out.prefix(500)), desperdicio: out.reduce(0) { $0 + $1.desperdicio },
                         incompleto: truncated, semAcesso: semAcesso, ms: Int(Date().timeIntervalSince(t0) * 1000))
    }
}
