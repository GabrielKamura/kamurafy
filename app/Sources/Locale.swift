import AppKit

/// Tema da janela: o WKWebView segue a aparência do app, e o CSS usa prefers-color-scheme.
enum Theme {
    @MainActor
    static func apply() {
        var t = Settings.current.tema
        #if KAMURAFY_DEV
        if let e = ProcessInfo.processInfo.environment["KAMURAFY_TEMA"], !e.isEmpty { t = e }
        #endif
        switch t {
        case "claro": NSApp.appearance = NSAppearance(named: .aqua)
        case "escuro": NSApp.appearance = NSAppearance(named: .darkAqua)
        default: NSApp.appearance = nil
        }
    }

    /// Fundo da janela atrás da interface (aparece no redimensionar): papel claro ou escuro.
    static let windowBackground = NSColor(name: nil) { ap in
        ap.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? NSColor(calibratedRed: 0.11, green: 0.098, blue: 0.082, alpha: 1)
            : NSColor(calibratedRed: 1, green: 0.99, blue: 0.97, alpha: 1)
    }
}

/// Idioma da interface: o escolhido nos Ajustes ou o primeiro do sistema que o Kamurafy fala
/// (português do Brasil, inglês, espanhol); fora disso, inglês.
enum Lang {
    static let supported = ["pt-BR", "en", "es"]

    static var current: String {
        var pref = Settings.current.idioma
        #if KAMURAFY_DEV
        if let e = ProcessInfo.processInfo.environment["KAMURAFY_IDIOMA"], !e.isEmpty { pref = e }
        #endif
        if supported.contains(pref) { return pref }
        for l in Locale.preferredLanguages {
            let low = l.lowercased()
            if low.hasPrefix("pt") { return "pt-BR" }
            if low.hasPrefix("es") { return "es" }
            if low.hasPrefix("en") { return "en" }
        }
        return "en"
    }
}

/// Textos do Swift que a pessoa vê (avisos, menus, erros). A chave é o texto em português;
/// a tradução vem do mesmo catálogo da interface (ui/i18n/<idioma>.json). `{0}`, `{1}`… são
/// trocados pelos argumentos.
enum L10n {
    private static let lock = NSLock()
    private static var cache: (lang: String, dict: [String: String])?

    static func t(_ key: String, _ args: [Any]) -> String {
        let lang = Lang.current
        var s = key
        if lang != "pt-BR" {
            lock.lock()
            if cache?.lang != lang { cache = (lang, load(lang)) }
            s = cache?.dict[key] ?? key
            lock.unlock()
        }
        for (i, a) in args.enumerated() { s = s.replacingOccurrences(of: "{\(i)}", with: "\(a)") }
        return s
    }

    private static func catalogData(_ lang: String) -> Data? {
        var base = Bundle.main.resourceURL?.appendingPathComponent("ui")
        #if KAMURAFY_DEV
        if let dev = ProcessInfo.processInfo.environment["KAMURAFY_UI_DIR"], !dev.isEmpty { base = URL(fileURLWithPath: dev) }
        #endif
        guard let url = base?.appendingPathComponent("i18n/\(lang).json") else { return nil }
        return try? Data(contentsOf: url)
    }

    private static func load(_ lang: String) -> [String: String] {
        guard let data = catalogData(lang),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return [:] }
        return dict
    }

    /// `window.KAMURAFY_LANG` e `window.KAMURAFY_I18N` pra interface (o catálogo só se for JSON válido).
    static func pageScript() -> String {
        let lang = Lang.current
        var cat = "null"
        if lang != "pt-BR", let data = catalogData(lang), (try? JSONSerialization.jsonObject(with: data)) is [String: String] {
            cat = String(decoding: data, as: UTF8.self)
        }
        let langLit = String(decoding: (try? JSONSerialization.data(withJSONObject: [lang])) ?? Data("[\"en\"]".utf8), as: UTF8.self)
        return "window.KAMURAFY_LANG=\(langLit)[0];window.KAMURAFY_I18N=\(cat);"
    }
}

func L(_ key: String, _ args: Any...) -> String { L10n.t(key, args) }

enum LocaleModule {
    struct Info: Codable { var idioma: String; var sistema: [String] }

    @MainActor
    static func register(_ r: Router) {
        r.register("app.locale") { _ in Info(idioma: Lang.current, sistema: Array(Locale.preferredLanguages.prefix(5))) }
    }
}
