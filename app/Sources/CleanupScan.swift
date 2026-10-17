import AppKit
import CryptoKit
import CoreServices

/// Varreduras da Faxina. Só leem: nada aqui move ou apaga.
///
/// Política (o que entra e o que vem marcado):
///  - só vem MARCADO o que tem dono conhecido, com o dono fechado e sem ninguém mexer há pouco;
///  - cache de dono desconhecido aparece, desmarcado, dizendo que não reconheci;
///  - ferramentas que guardam dado de verdade dentro de "Caches" (JetBrains, Android Studio,
///    Deno, Poetry) entram só pelas subpastas que voltam sozinhas;
///  - o que não volta sozinho (navegadores do Playwright, modelos de IA, programa do Cypress)
///    aparece desmarcado e com o custo dito na nota;
///  - arquivos pessoais (downloads, grandes, duplicados) nunca vêm marcados.
enum CleanScan {
    static var categories: [CategoryInfo] { [
        .init(id: "caches", titulo: L("Caches de apps"),
              descricao: L("Arquivos temporários que os apps guardam pra abrir mais rápido. Eles recriam sozinhos quando precisam. Só vem marcado o que eu sei de qual app é, com o app fechado."),
              precisaPermissao: false),
        .init(id: "dev", titulo: L("Caches de programação"),
              descricao: L("Downloads e compilações guardados por npm, pip, Xcode e companhia. A maioria volta sozinha na próxima vez que você usar a ferramenta; o que não volta vem desmarcado e avisado."),
              precisaPermissao: false),
        .init(id: "logs", titulo: L("Registros (logs)"),
              descricao: L("Anotações que os apps fazem do que aconteceu, inclusive relatórios de travamento. Só servem pra quem investiga um erro."),
              precisaPermissao: false),
        .init(id: "sistema", titulo: L("Caches do macOS"),
              descricao: L("Temporários dos apps da Apple. O macOS recria sozinho, mas pode ficar mais lento e gastar um pouco de bateria refazendo na primeira vez. Nada vem marcado."),
              precisaPermissao: false),
        .init(id: "downloads", titulo: L("Downloads esquecidos"),
              descricao: L("Coisas na pasta Downloads que o Mac não viu você abrir nem mudar há mais de 3 meses. São arquivos seus: nada vem marcado, confira antes."),
              precisaPermissao: true),
    ] }

    // MARK: listas

    /// Nunca entram (mexer atrapalharia iCloud, compras, carteira, família, sincronização...).
    /// Comparação em minúsculas, por prefixo.
    private static let neverPrefixes: [String] = [
        "com.apple.bird", "com.apple.nsurlsessiond", "com.apple.akd", "com.apple.icloud", "com.apple.containermanagerd",
        "com.apple.homekit", "com.apple.homed", "com.apple.safari", "com.apple.webkit", "com.apple.passd", "com.apple.ap.",
        "com.apple.appstoreagent", "com.apple.installer", "com.apple.softwareupdate", "com.apple.mobileassetd",
        "com.apple.mobileasset", "com.apple.spotlight", "com.apple.metadata", "com.apple.nsservicescache",
        "com.apple.cloudphotos", "com.apple.photoanalysisd", "com.apple.findmy", "com.apple.icloudmailagent",
        "com.apple.keychain", "com.apple.security", "com.apple.trustd", "com.apple.accountsd", "com.apple.amsaccountsd",
        "com.apple.amp.accounts", "com.apple.gamed", "com.apple.family", "com.apple.walletsettings", "com.apple.dataaccess",
        "com.apple.aospushrelay", "com.apple.cloudd", "com.apple.clouddocs", "com.apple.cloudphotod",
        "com.apple.photolibraryd", "com.apple.mediaanalysisd", "com.kamurafy",
    ]
    private static let neverNames: Set<String> = [
        "cloudkit", "passkit", "gamekit", "familycircled", "familycircle", "metadata", "storedownloadd", "sharedstorage",
        "kamurafy", "askpermissiond", "walletavailabilitychecktool",
    ]
    /// Pastas com nome "solto" que são do macOS (vão pra categoria sistema).
    private static let appleNames: Set<String> = [
        "geoservices", "sharedimagecache", "animoji", "mbuseragent", "colorsync", "familysettings", "siritts",
        "sirittsservice", "applespell", "amsdatamigratortool", "maps", "configuration",
    ]
    private static let applePrefixes = ["com.apple.", "aaprofilepicture_"]

    struct DevRule { var sel: Bool; var nota: String; var owners: [String] = [] }

    private static let recria = "Cache de ferramenta de programação: ela baixa ou refaz sozinha quando precisar."
    /// Ferramentas de programação que guardam cache em ~/Library/Caches (nome em minúsculas).
    private static let devRules: [String: DevRule] = [
        "pip": .init(sel: true, nota: "Pacotes baixados pelo pip. Ele baixa de novo quando precisar."),
        "pip-tools": .init(sel: true, nota: recria), "pipenv": .init(sel: true, nota: recria),
        "node-gyp": .init(sel: true, nota: "Cabeçalhos do Node pra compilar módulos. Volta sozinho."),
        "bun": .init(sel: true, nota: "Pacotes baixados pelo Bun."), "typescript": .init(sel: true, nota: recria),
        "yarn": .init(sel: true, nota: "Pacotes baixados pelo Yarn."), "pnpm": .init(sel: true, nota: "Pacotes baixados pelo pnpm."),
        "homebrew": .init(sel: true, nota: "Downloads do Homebrew. Ele baixa de novo quando precisar."),
        "puccinialin": .init(sel: true, nota: recria), "go-build": .init(sel: true, nota: "Compilações do Go. Ele refaz sozinho."),
        "cocoapods": .init(sel: true, nota: recria), "org.carthage.carthagekit": .init(sel: true, nota: recria),
        "org.swift.swiftpm": .init(sel: true, nota: "Pacotes baixados pelo Swift Package Manager."),
        "mozilla-sccache": .init(sel: true, nota: recria), "sccache": .init(sel: true, nota: recria),
        "prisma": .init(sel: true, nota: recria), "turbo": .init(sel: true, nota: recria), "uv": .init(sel: true, nota: "Pacotes baixados pelo uv (Python)."),
        "ruff": .init(sel: true, nota: recria), "black": .init(sel: true, nota: recria), "mypy": .init(sel: true, nota: recria),
        "pre-commit": .init(sel: true, nota: recria), "electron": .init(sel: true, nota: recria),
        "electron-builder": .init(sel: true, nota: recria), "vscode-cpptools": .init(sel: true, nota: recria, owners: ["com.microsoft.vscode"]),
        "ms-playwright": .init(sel: false, nota: "Navegadores de teste do Playwright. Não voltam sozinhos: precisa rodar npx playwright install."),
        "huggingface-transformers-cache": .init(sel: false, nota: "Modelos de IA baixados. Voltam, mas baixando tudo de novo (podem ser vários GB)."),
        "llama.cpp": .init(sel: false, nota: "Modelos de IA baixados pelo llama.cpp. Somem e precisam ser baixados de novo."),
        "cypress": .init(sel: false, nota: "Programa do Cypress. Não volta sozinho: precisa rodar npx cypress install."),
    ]

    /// Subpastas que voltam sozinhas, dentro de ferramentas que também guardam dado de verdade.
    private static let deno: [(String, Bool, String)] = [
        ("deps", true, "Código baixado pelo Deno."), ("npm", true, "Pacotes npm baixados pelo Deno."),
        ("gen", true, "Código compilado pelo Deno."), ("remote", true, "Código baixado pelo Deno."),
        ("registries", true, "Índices de pacotes do Deno."),
    ]
    private static let poetry: [(String, Bool, String)] = [
        ("cache", true, "Pacotes baixados pelo Poetry."), ("artifacts", true, "Pacotes baixados pelo Poetry."),
        ("virtualenvs", false, "Ambientes virtuais dos seus projetos Poetry. Some tudo que está instalado neles, e cada projeto vai precisar de \"poetry install\" de novo."),
    ]
    /// Dentro de cada IDE JetBrains / Android Studio (o Local History fica de fora: é a única
    /// cópia das versões antigas dos seus arquivos que não foram pro git).
    private static let ideSafe: [(String, String)] = [
        ("caches", "Índices e caches da IDE. Ela refaz ao abrir o projeto."), ("index", "Índice de código da IDE. Ela refaz ao abrir o projeto."),
        ("tmp", "Temporários da IDE."), ("jcef_cache", "Cache do navegador embutido da IDE."),
        ("compile-server", "Compilações da IDE. Ela refaz."), ("frameworks", "Cache de detecção de frameworks."),
        ("external_build_system", "Cache do sistema de build (Gradle/Maven) da IDE."), ("log", "Registros da IDE."),
    ]

    /// Caches de programação fora de ~/Library/Caches: (pai relativo, nome, marcado?, nota, donos)
    private static let devPaths: [(String, String, Bool, String, [String])] = [
        (".npm", "_cacache", true, "Pacotes baixados pelo npm. Ele baixa de novo quando precisar.", []),
        (".npm", "_logs", true, "Registros do npm.", []),
        ("Library/Developer/Xcode", "DerivedData", true, "Compilações do Xcode. Ele refaz na próxima vez que compilar.", ["com.apple.dt.xcode"]),
        ("Library/Developer/Xcode", "iOS DeviceSupport", false, "Arquivos de suporte de iPhones conectados. Voltam quando você conectar o aparelho de novo (copiando dele).", ["com.apple.dt.xcode"]),
        ("Library/Developer/CoreSimulator", "Caches", true, "Cache dos simuladores do Xcode.", ["com.apple.iphonesimulator", "com.apple.dt.xcode"]),
        (".gradle", "caches", true, "Dependências baixadas pelo Gradle.", ["com.google.android.studio", "com.jetbrains."]),
        (".cargo/registry", "cache", true, "Pacotes baixados pelo Cargo (Rust).", []),
        (".cache", "pip", true, "Pacotes baixados pelo pip.", []),
        (".cache", "uv", true, "Pacotes baixados pelo uv (Python).", []),
        (".cache", "yarn", true, "Pacotes baixados pelo Yarn.", []),
        (".cache", "pre-commit", true, "Ambientes do pre-commit. Ele refaz sozinho.", []),
        (".cache/huggingface", "hub", false, "Modelos de IA baixados do Hugging Face. Somem e precisam ser baixados de novo (podem ser vários GB). Seu login continua guardado.", []),
        (".cache/huggingface", "datasets", false, "Conjuntos de dados baixados do Hugging Face. Precisam ser baixados de novo.", []),
        (".cache", "torch", false, "Modelos baixados pelo PyTorch. Precisam ser baixados de novo.", []),
        (".cache", "whisper", false, "Modelos do Whisper. Precisam ser baixados de novo.", []),
    ]
    /// Em ~/.cache, estes nunca entram: guardam login, configuração, histórico ou conversas.
    private static let xdgNever: Set<String> = ["huggingface", "lm-studio", "zsh", "vim", "nvim", "fish", "bash", "kamurafy", "torch", "whisper"]

    /// Pastas que parecem cache mas são dado de verdade: nenhuma regra pode cair nelas.
    static let devNever: [String] = [
        "Library/Developer/CoreSimulator/Devices", "Library/Developer/Xcode/Archives", ".m2/repository", ".android/avd",
        "go/pkg/mod", ".ollama", ".lmstudio", ".nvm", ".pyenv", ".rustup", ".conda", ".local/share/virtualenvs",
        ".docker", ".lima", ".colima", ".tart", ".yarn/berry/cache", ".cache/huggingface/token",
    ]

    /// Nome de pasta (minúsculas) → prefixos de bundle id dos apps donos.
    private static let ownerHints: [String: [String]] = [
        "firefox": ["org.mozilla."], "mozilla": ["org.mozilla."], "bravesoftware": ["com.brave.browser"],
        "google": ["com.google.chrome", "com.google.android.studio"], "jetbrains": ["com.jetbrains.", "com.google.android.studio"],
        "microsoft edge": ["com.microsoft.edgemac"], "spotify": ["com.spotify.client"], "slack": ["com.tinyspeck.slackmacgap"],
        "discord": ["com.hnc.discord"], "zoom.us": ["us.zoom.xos"], "telegram": ["ru.keepcoder.telegram"],
        "whatsapp": ["net.whatsapp.whatsapp"], "arc": ["company.thebrowser.browser"], "opera": ["com.operasoftware.opera"],
        "adobe": ["com.adobe."], "code": ["com.microsoft.vscode"],
    ]
    /// Nome de pasta (minúsculas) → bundle id exato do app (pra mostrar nome e ícone).
    private static let ownerApps: [String: String] = [
        "firefox": "org.mozilla.firefox", "mozilla": "org.mozilla.firefox", "bravesoftware": "com.brave.Browser",
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
        guard let top = SafeFS.lstatInfo(url.path) else { m.denied = true; return m }
        if top.isLink { return m }
        m.newest = Date(timeIntervalSince1970: Double(top.mtimeNs) / 1e9)
        if !top.isDir {
            var u = url; u.removeAllCachedResourceValues()
            let v = try? u.resourceValues(forKeys: Set(keys))
            m.bytes = Int64(v?.totalFileAllocatedSize ?? v?.fileAllocatedSize ?? Int(top.size))
            m.files = 1
            return m
        }
        let dev = top.ident.dev
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
                if SafeFS.lstatInfo(f.path)?.ident.dev != dev { en.skipDescendants() }   // outro disco montado aqui
                continue
            }
            m.bytes += Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            m.files += 1
            if let d = v.contentModificationDate, d > (m.newest ?? .distantPast) { m.newest = d }
        }
        return m
    }

    // MARK: dono

    private static func stripSuffixes(_ k: String) -> String {
        var key = k
        for s in [".shipit", ".installer", ".helper"] where key.hasSuffix(s) { key = String(key.dropLast(s.count)) }
        return key
    }

    /// Nome do app aberto que usa esta pasta, se houver (conta apps de barra de menus também).
    static func runningOwner(name: String, prefixes: [String], in running: [NSRunningApplication]) -> String? {
        let key = stripSuffixes(name.lowercased())
        let hints = prefixes.map { $0.lowercased() } + (ownerHints[key] ?? [])
        for app in running where app.activationPolicy != .prohibited {
            guard let bidRaw = app.bundleIdentifier, !bidRaw.isEmpty else { continue }
            let bid = bidRaw.lowercased()
            if hints.contains(where: { bid.hasPrefix($0) }) { return app.localizedName ?? name }
            if key.contains("."), key.count > 6, bid == key || bid.hasPrefix(key + ".") || key.hasPrefix(bid + ".") {
                return app.localizedName ?? name
            }
        }
        return nil
    }

    static func ownerApp(for name: String) -> (name: String, icon: String?)? {
        let key = stripSuffixes(name.lowercased())
        let bid = ownerApps[key] ?? (key.contains(".") ? stripSuffixes(name) : nil)
        guard let b = bid, let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: b) else { return nil }
        let appName = (FileManager.default.displayName(atPath: url.path) as NSString).deletingPathExtension
        return (appName, iconData(NSWorkspace.shared.icon(forFile: url.path)))
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

    // MARK: texto seguro

    /// Caracteres invisíveis de direção (U+202E etc.) disfarçam nomes ("gpj.exe" → "exe.jpg").
    static func sanitize(_ s: String) -> String {
        let bad: Set<UInt32> = [0x200E, 0x200F, 0x061C, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069]
        return String(String.UnicodeScalarView(s.unicodeScalars.map { bad.contains($0.value) ? "\u{FFFD}" : $0 }))
    }

    // MARK: montar e registrar item

    static func register(_ url: URL, root: URL, categoria: String, selecionado: Bool, nota: String?,
                                 measure m: Measure, app: String? = nil, aberto: Bool = false, icon: String? = nil,
                                 tipo: String? = nil, usado: Date? = nil, grupo: String? = nil, id: String? = nil,
                                 members: [String] = [], hash: String? = nil, owners: [String] = [],
                                 vinculo: String? = nil, nome: String? = nil) -> CleanItem? {
        guard let st = SafeFS.lstatInfo(url.path), !st.isLink else { return nil }
        let nota = nota.map { L($0) }
        let item = CleanItem(id: id ?? UUID().uuidString, categoria: categoria, nome: sanitize(nome ?? url.lastPathComponent),
                             caminho: sanitize(CleanEnv.display(url)), bytes: m.bytes, arquivos: m.files,
                             modificado: m.newest?.timeIntervalSince1970, usado: usado?.timeIntervalSince1970,
                             selecionado: selecionado && !aberto && !m.denied && m.bytes > 0, nota: nota, app: app,
                             appAberto: aberto, icon: icon, tipo: tipo, grupo: grupo,
                             semAcesso: m.denied && m.bytes == 0, parcial: (m.denied && m.bytes > 0) || m.truncated ? true : nil,
                             vinculo: vinculo)
        CleanRegistry.shared.add(.init(item: item, parent: url.deletingLastPathComponent().path, name: url.lastPathComponent,
                                       root: root.path, ident: st.ident, size: st.size, mtimeNs: st.mtimeNs,
                                       groupMembers: members, hash: hash, owners: owners))
        return item
    }

    private static func children(_ dir: URL) -> [URL]? {
        try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: [])
    }

    private static func isNever(_ name: String) -> Bool {
        let l = name.lowercased()
        return name.hasPrefix(".") || neverNames.contains(l) || neverPrefixes.contains { l.hasPrefix($0) }
    }

    private static func isApple(_ name: String) -> Bool {
        let l = name.lowercased()
        return appleNames.contains(l) || applePrefixes.contains { l.hasPrefix($0) }
    }

    // MARK: categorias

    static func scan(category: String) -> CleanCategory {
        let t0 = Date()
        let deadline = t0.addingTimeInterval(25)
        let info = categories.first { $0.id == category }!
        var itens: [CleanItem] = []
        var semAcesso = 0
        var incompleto = false
        var aviso: String? = nil
        let running = NSWorkspace.shared.runningApplications
        let agora = Date()

        /// Mede e registra um item filho direto de `root`.
        func add(_ url: URL, root: URL, sel: Bool, nota: String?, owners: [String] = [], recentWindow: TimeInterval = 3600,
                 app: String? = nil, icon: String? = nil, tipo: String? = nil, usado: Date? = nil, nome: String? = nil,
                 measured: Measure? = nil) {
            guard let st = SafeFS.lstatInfo(url.path), !st.isLink,
                  st.ident.dev == SafeFS.lstatInfo(root.path)?.ident.dev else { return }   // outro disco: fica de fora
            let m = measured ?? measure(url, deadline: deadline)
            if m.truncated { incompleto = true }
            if m.denied && m.bytes == 0 { semAcesso += 1 }
            guard m.bytes > 0 || m.denied else { return }
            let aberto = runningOwner(name: url.lastPathComponent, prefixes: owners, in: running)
            let recente = (m.newest ?? .distantPast) > agora.addingTimeInterval(-recentWindow)
            var n = nota
            if let a = aberto { n = "\(a) está aberto: feche antes de limpar." }
            else if sel && recente { n = (nota.map { $0 + " " } ?? "") + "Alguém mexeu aqui há pouco: pode estar em uso, por isso não veio marcado." }
            if let it = register(url, root: root, categoria: category, selecionado: sel && !recente, nota: n, measure: m,
                                 app: app ?? aberto, aberto: aberto != nil, icon: icon, tipo: tipo, usado: usado,
                                 owners: owners, nome: nome) {
                itens.append(it)
            }
        }

        /// Subpastas seguras de uma pasta de ferramenta (Deno, Poetry, IDEs).
        func addSubs(_ dir: URL, _ subs: [(String, Bool, String)], owners: [String], label: String) {
            guard SafeFS.isLiteralDir(dir.path) else { return }
            for (name, sel, nota) in subs {
                let u = dir.appendingPathComponent(name)
                guard CleanGuard.exists(u) else { continue }
                add(u, root: dir, sel: sel, nota: nota, owners: owners, recentWindow: 900, nome: "\(label) › \(name)")
            }
        }

        switch category {
        case "caches", "sistema", "dev":
            guard let root = CleanEnv.root("Library/Caches") else {
                aviso = "A pasta ~/Library/Caches não está no lugar de sempre (virou atalho?). Por segurança, ficou de fora."
                break
            }
            for u in children(root) ?? [] where !CleanGuard.isSymlink(u) {
                let name = u.lastPathComponent
                let l = name.lowercased()
                if isNever(name) { continue }
                switch l {
                case "jetbrains":
                    guard category == "dev" else { continue }
                    for ide in children(u) ?? [] where !CleanGuard.isSymlink(ide) && !ide.lastPathComponent.hasPrefix(".") {
                        addSubs(ide, ideSafe.map { ($0.0, true, $0.1) }, owners: ["com.jetbrains.", "com.google.android.studio"],
                                label: ide.lastPathComponent)
                    }
                    continue
                case "google":
                    for g in children(u) ?? [] where !CleanGuard.isSymlink(g) && !g.lastPathComponent.hasPrefix(".") {
                        let gl = g.lastPathComponent.lowercased()
                        if gl.hasPrefix("androidstudio") {
                            if category == "dev" { addSubs(g, ideSafe.map { ($0.0, true, $0.1) }, owners: ["com.google.android.studio"], label: g.lastPathComponent) }
                        } else if gl.hasPrefix("chrome") {
                            if category == "caches" {
                                let owner = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome")
                                add(g, root: u, sel: owner != nil, nota: "Cache do Google Chrome. Ele recria sozinho.",
                                    owners: ["com.google.chrome"], app: owner != nil ? "Google Chrome" : nil,
                                    icon: owner.flatMap { iconData(NSWorkspace.shared.icon(forFile: $0.path)) }, nome: "Google › \(g.lastPathComponent)")
                            }
                        } else if category == "caches" {
                            add(g, root: u, sel: false, nota: "Não reconheci de qual app do Google é. Parece cache, mas por isso não vem marcado.",
                                owners: ["com.google."], nome: "Google › \(g.lastPathComponent)")
                        }
                    }
                    continue
                case "deno":
                    if category == "dev" { addSubs(u, deno, owners: [], label: "Deno") }
                    continue
                case "pypoetry", "poetry":
                    if category == "dev" { addSubs(u, poetry, owners: [], label: "Poetry") }
                    continue
                default:
                    break
                }
                if let rule = devRules[l] {
                    guard category == "dev" else { continue }
                    add(u, root: root, sel: rule.sel, nota: rule.nota, owners: rule.owners, recentWindow: 900)
                    continue
                }
                if isApple(name) {
                    guard category == "sistema" else { continue }
                    let owner = ownerApp(for: name)
                    add(u, root: root, sel: false, nota: "Cache do macOS: ele recria sozinho.", app: owner?.name, icon: owner?.icon)
                    continue
                }
                guard category == "caches" else { continue }
                let owner = ownerApp(for: name)
                let known = owner != nil || ownerHints[stripSuffixes(l)] != nil
                add(u, root: root, sel: known,
                    nota: known ? "O app recria sozinho quando precisar." : "Não reconheci de qual app é. Parece cache, mas por isso não vem marcado.",
                    app: owner?.name, icon: owner?.icon)
            }
            if category == "dev" {
                var seen = Set<String>()
                for (parent, name, sel, nota, owners) in devPaths {
                    guard let r = CleanEnv.root(parent) else { continue }
                    let u = r.appendingPathComponent(name)
                    let rel = parent + "/" + name
                    precondition(!devNever.contains { rel == $0 || rel.hasPrefix($0 + "/") || $0.hasPrefix(rel + "/") }, "regra de programação caiu numa pasta proibida: \(rel)")
                    guard CleanGuard.exists(u), !CleanGuard.isSymlink(u) else { continue }
                    seen.insert(u.path)
                    add(u, root: r, sel: sel, nota: nota, owners: owners, recentWindow: 900)
                }
                // o resto de ~/.cache: aparece desmarcado, sem prometer nada
                if let xdg = CleanEnv.root(".cache") {
                    for u in children(xdg) ?? [] where !CleanGuard.isSymlink(u) && !seen.contains(u.path) {
                        let n = u.lastPathComponent
                        if n.hasPrefix(".") || isNever(n) || xdgNever.contains(n.lowercased()) { continue }
                        add(u, root: xdg, sel: false, nota: "Não sei de qual ferramenta é. Pode ter configuração ou login dentro: só marque se você souber o que é.")
                    }
                }
                // item grande de programação nunca vem marcado sem aviso
                for i in itens.indices where itens[i].selecionado && itens[i].bytes > 2_000_000_000 {
                    itens[i].selecionado = false
                    itens[i].nota = (itens[i].nota ?? "") + " É grande (\(ByteCountFormatter.string(fromByteCount: itens[i].bytes, countStyle: .file))): confira antes de marcar."
                }
            }
        case "logs":
            guard let root = CleanEnv.root("Library/Logs") else {
                aviso = "A pasta ~/Library/Logs não está no lugar de sempre (virou atalho?). Por segurança, ficou de fora."
                break
            }
            for u in children(root) ?? [] where !CleanGuard.isSymlink(u) && !u.lastPathComponent.hasPrefix(".") {
                let name = u.lastPathComponent
                if isNever(name) { continue }
                if name == "DiagnosticReports" {
                    // a pasta é do sistema (grupo _analyticsusers): entram só os relatórios
                    guard SafeFS.isLiteralDir(u.path) else { continue }
                    for f in children(u) ?? [] where !CleanGuard.isSymlink(f) {
                        let ext = f.pathExtension.lowercased()
                        guard ["ips", "crash", "diag", "spin", "hang", "panic"].contains(ext) else { continue }
                        add(f, root: u, sel: true, nota: "Relatório de travamento.", recentWindow: 0)
                    }
                    continue
                }
                add(u, root: root, sel: true, nota: "Registros de \(sanitize(name)).", recentWindow: 0)
            }
        case "downloads":
            guard let root = CleanEnv.root("Downloads") else {
                aviso = "A pasta Downloads não está no lugar de sempre (virou atalho?). Por segurança, ficou de fora."
                break
            }
            guard let kids = children(root) else { semAcesso = 1; break }
            let cutoff = agora.addingTimeInterval(-90 * 86400)
            let mounted = mountedImages()
            for u in kids where !CleanGuard.isSymlink(u) && !u.lastPathComponent.hasPrefix(".") {
                if mounted.contains(u.path) { continue }                 // imagem de disco aberta agora
                if isProject(u) { continue }                             // pasta de projeto: não é esquecida
                let m = measure(u, deadline: deadline)
                let usedRaw = lastUsed(u)
                let added = (try? u.resourceValues(forKeys: [.addedToDirectoryDateKey]))?.addedToDirectoryDate
                let recent = [usedRaw, added, m.newest].compactMap { $0 }.max() ?? .distantPast
                guard recent < cutoff else { continue }
                let used = (usedRaw != nil && added != nil && abs(usedRaw!.timeIntervalSince(added!)) < 1) ? nil : usedRaw
                let tipo = fileKind(u)
                add(u, root: root, sel: false, nota: noteFor(tipo), recentWindow: 0, tipo: tipo, usado: used, measured: m)
            }
        default:
            break
        }

        itens.sort { $0.bytes > $1.bytes }
        let total = itens.reduce(Int64(0)) { $0 + $1.bytes }
        let sel = itens.filter { $0.selecionado }.reduce(Int64(0)) { $0 + $1.bytes }
        return CleanCategory(id: category, titulo: info.titulo, descricao: info.descricao, bytes: total,
                             bytesSelecionados: sel, itens: itens, semAcesso: semAcesso, incompleto: incompleto,
                             ms: Int(Date().timeIntervalSince(t0) * 1000), aviso: aviso)
    }

    private static let projectMarkers = [".git", "package.json", "Package.swift", "pyproject.toml", "Cargo.toml", "go.mod",
                                         "pom.xml", "build.gradle", "Gemfile", "composer.json", "requirements.txt"]

    private static func isProject(_ u: URL) -> Bool {
        guard SafeFS.lstatInfo(u.path)?.isDir == true else { return false }
        if projectMarkers.contains(where: { CleanGuard.exists(u.appendingPathComponent($0)) }) { return true }
        let kids = (try? FileManager.default.contentsOfDirectory(atPath: u.path)) ?? []
        return kids.contains { $0.hasSuffix(".xcodeproj") || $0.hasSuffix(".xcworkspace") }
    }

    /// Imagens de disco montadas agora (não são "esquecidas": estão em uso).
    private static func mountedImages() -> Set<String> {
        guard let text = try? runTool("/usr/bin/hdiutil", ["info", "-plist"], timeout: 10),
              let data = text.data(using: .utf8),
              let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let images = plist["images"] as? [[String: Any]] else { return [] }
        return Set(images.compactMap { $0["image-path"] as? String }.map { CleanGuard.real(URL(fileURLWithPath: $0)).path })
    }

    private static func noteFor(_ tipo: String) -> String? {
        switch tipo {
        case "instalador": return "Parece instalador: se o app já está instalado, não precisa mais."
        case "imagem-disco": return "Imagem de disco: pode ter arquivos seus dentro. Confira antes."
        case "imagem-protegida": return "Imagem de disco protegida por senha: pode ter arquivos seus dentro."
        case "app": return "É o próprio app, não um instalador. Se você usa, mova pra Aplicativos."
        default: return nil
        }
    }

    static func lastUsed(_ url: URL) -> Date? {
        guard let item = MDItemCreate(kCFAllocatorDefault, url.path as CFString) else { return nil }
        return MDItemCopyAttribute(item, kMDItemLastUsedDate) as? Date
    }

    static func fileKind(_ url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        if ext == "app" { return "app" }
        if ext == "sparseimage" || ext == "sparsebundle" { return "imagem-disco" }
        if SafeFS.lstatInfo(url.path)?.isDir == true {
            return (try? url.resourceValues(forKeys: [.isPackageKey]))?.isPackage == true ? "outro" : "pasta"
        }
        switch ext {
        case "dmg":
            if let h = try? FileHandle(forReadingFrom: url) {
                defer { try? h.close() }
                let head = (try? h.read(upToCount: 8)) ?? Data()
                if head == Data("encrcdsa".utf8) { return "imagem-protegida" }
                if let end = try? h.seekToEnd(), end > 8 {
                    try? h.seek(toOffset: end - 8)
                    if (try? h.read(upToCount: 8)) == Data("cdsaencr".utf8) { return "imagem-protegida" }
                }
            }
            return "instalador"
        case "pkg", "mpkg", "iso": return "instalador"
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
        ["Downloads", "Desktop", "Documents", "Movies", "Music", "Pictures"].compactMap { CleanEnv.root($0) }
    }

    private struct FileHit { var url: URL; var root: URL; var bytes: Int64; var size: Int64; var mod: Date?; var ident: SafeFS.Ident; var links: Int; var clone: Int64? }

    private static let devDirs: Set<String> = ["node_modules", ".venv", "venv", "pods", "vendor", "build", "deriveddata", ".git", "target", "dist"]

    private static func walkPersonal(minBytes: Int64, deadline: Date, maxFiles: Int, skipDevDirs: Bool,
                                     semAcesso: inout Int, truncated: inout Bool) -> [FileHit] {
        var out: [FileHit] = []
        let keys: [URLResourceKey] = [.isSymbolicLinkKey, .isRegularFileKey, .isDirectoryKey, .totalFileAllocatedSizeKey,
                                      .fileAllocatedSizeKey, .contentModificationDateKey, .fileContentIdentifierKey]
        var visited = 0
        for root in personalRoots {
            var denied = false
            guard let rootDev = SafeFS.lstatInfo(root.path)?.ident.dev,
                  let en = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys,
                                                          options: [.skipsHiddenFiles, .skipsPackageDescendants],
                                                          errorHandler: { _, _ in denied = true; return true }) else {
                semAcesso += 1
                continue
            }
            for case let f as URL in en {
                visited += 1
                if visited % 512 == 0, Date() > deadline { truncated = true; break }
                guard let v = try? f.resourceValues(forKeys: Set(keys)) else { continue }
                if v.isSymbolicLink == true { continue }
                if v.isDirectory == true {
                    if skipDevDirs && devDirs.contains(f.lastPathComponent.lowercased()) { en.skipDescendants(); continue }
                    if SafeFS.lstatInfo(f.path)?.ident.dev != rootDev { en.skipDescendants() }
                    continue
                }
                guard v.isRegularFile == true else { continue }
                let b = Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)   // arquivo só no iCloud ocupa ~0
                guard b >= minBytes, let st = SafeFS.lstatInfo(f.path), !st.isLink, st.ident.dev == rootDev else { continue }
                out.append(FileHit(url: f, root: root, bytes: b, size: st.size, mod: v.contentModificationDate, ident: st.ident,
                                   links: st.links, clone: v.fileContentIdentifier))
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
        let hits = walkPersonal(minBytes: minBytes, deadline: t0.addingTimeInterval(40), maxFiles: 20000, skipDevDirs: false,
                                semAcesso: &semAcesso, truncated: &truncated)
        var itens: [CleanItem] = []
        for h in hits.sorted(by: { $0.bytes > $1.bytes }).prefix(300) {
            var m = Measure(); m.bytes = h.bytes; m.files = 1; m.newest = h.mod
            let tipo = fileKind(h.url)
            if let it = register(h.url, root: h.root, categoria: "grandes", selecionado: false, nota: noteFor(tipo),
                                 measure: m, tipo: tipo, usado: lastUsed(h.url),
                                 vinculo: h.links > 1 ? "link" : nil) {
                itens.append(it)
            }
        }
        return LargeResult(itens: itens, bytes: itens.reduce(0) { $0 + $1.bytes }, incompleto: truncated,
                           semAcesso: semAcesso, ms: Int(Date().timeIntervalSince(t0) * 1000))
    }

    // MARK: duplicados

    struct DupGroup: Codable { var id: String; var bytesCada: Int64; var desperdicio: Int64; var itens: [CleanItem]; var nota: String }
    struct DupResult: Codable { var grupos: [DupGroup]; var desperdicio: Int64; var incompleto: Bool; var semAcesso: Int; var ms: Int }

    private static func partialHash(_ url: URL) -> String? {
        guard let h = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? h.close() }
        var sha = SHA256()
        do {
            sha.update(data: try h.read(upToCount: 65536) ?? Data())
            let end = try h.seekToEnd()
            if end > 131072 {
                try h.seek(toOffset: end - 65536)
                sha.update(data: try h.read(upToCount: 65536) ?? Data())
            }
        } catch { return nil }
        return sha.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// SHA-256 do arquivo inteiro. Qualquer erro de leitura, ou tamanho diferente do esperado,
    /// devolve nil (nunca um hash de pedaço).
    static func fullHash(_ url: URL, size: Int64) -> String? {
        guard let h = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? h.close() }
        var sha = SHA256()
        var total: Int64 = 0
        while true {
            // read devolve nil no fim do arquivo; erro de verdade vem como exceção
            let chunk: Data?
            do { chunk = try h.read(upToCount: 1 << 20) } catch { return nil }
            guard let c = chunk, !c.isEmpty else { break }
            total += Int64(c.count)
            sha.update(data: c)
        }
        guard total == size else { return nil }
        return sha.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// Qual cópia fica: fora de Downloads e da Mesa, depois a mais antiga, depois nome sem "cópia".
    private static func keepScore(_ h: FileHit) -> (Int, Double, Int) {
        let p = h.url.path.lowercased()
        let loose = p.contains("/downloads/") || p.contains("/desktop/") ? 1 : 0
        let n = h.url.deletingPathExtension().lastPathComponent.lowercased()
        let copyish = (n.contains("cópia") || n.contains("copia") || n.contains("copy") || n.range(of: #"\(\d+\)$"#, options: .regularExpression) != nil) ? 1 : 0
        return (loose, h.mod?.timeIntervalSince1970 ?? .greatestFiniteMagnitude, copyish)
    }

    static func duplicates(minBytes: Int64) -> DupResult {
        let t0 = Date()
        let deadline = t0.addingTimeInterval(60)
        var semAcesso = 0, truncated = false
        let hits = walkPersonal(minBytes: minBytes, deadline: t0.addingTimeInterval(30), maxFiles: 60000, skipDevDirs: true,
                                semAcesso: &semAcesso, truncated: &truncated)
        // mesmo inode (link físico) é o mesmo arquivo: entra uma vez só
        var byIdent: [SafeFS.Ident: FileHit] = [:]
        for h in hits {
            if let cur = byIdent[h.ident], keepScore(cur) <= keepScore(h) { continue }
            byIdent[h.ident] = h
        }
        var bySize: [Int64: [FileHit]] = [:]
        for h in byIdent.values { bySize[h.size, default: []].append(h) }

        var groups: [([FileHit], String)] = []
        for (_, list) in bySize.sorted(by: { $0.key > $1.key }) where list.count > 1 {
            if Date() > deadline { truncated = true; break }
            var byPartial: [String: [FileHit]] = [:]
            for h in list { if let k = partialHash(h.url) { byPartial[k, default: []].append(h) } }
            for (_, p) in byPartial where p.count > 1 {
                var byFull: [String: [FileHit]] = [:]
                for h in p {
                    if Date() > deadline { truncated = true; break }
                    if let k = fullHash(h.url, size: h.size) { byFull[k, default: []].append(h) }
                }
                for (hash, g) in byFull where g.count > 1 { groups.append((g, hash)) }
            }
        }

        var out: [DupGroup] = []
        for (g, hash) in groups {
            let gid = UUID().uuidString
            let ordered = g.sorted { keepScore($0) < keepScore($1) }
            let ids = ordered.map { _ in UUID().uuidString }
            var itens: [CleanItem] = []
            var seenClones = Set<Int64>()
            var waste: Int64 = 0
            for (i, h) in ordered.enumerated() {
                var m = Measure(); m.bytes = h.bytes; m.files = 1; m.newest = h.mod
                // clone do APFS divide os blocos com outra cópia: apagar libera quase nada
                var vinculo: String? = nil
                if let c = h.clone { if seenClones.contains(c) { vinculo = "clone" } else { seenClones.insert(c) } }
                if h.links > 1 { vinculo = "link" }
                if i > 0 && vinculo == nil { waste += h.bytes }
                if let it = register(h.url, root: h.root, categoria: "duplicados", selecionado: false, nota: nil, measure: m,
                                     tipo: fileKind(h.url), grupo: gid, id: ids[i], members: ids, hash: hash, vinculo: vinculo) {
                    itens.append(it)
                }
            }
            guard itens.count > 1 else { continue }
            out.append(DupGroup(id: gid, bytesCada: ordered.first?.bytes ?? 0, desperdicio: waste, itens: itens,
                                nota: "Se algum programa usa esse arquivo pelo caminho (Lightroom, Premiere, Música), ele perde o link."))
        }
        out.sort { $0.desperdicio > $1.desperdicio }
        return DupResult(grupos: Array(out.prefix(500)), desperdicio: out.reduce(0) { $0 + $1.desperdicio },
                         incompleto: truncated, semAcesso: semAcesso, ms: Int(Date().timeIntervalSince(t0) * 1000))
    }
}
