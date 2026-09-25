import Foundation

/// Preferências do usuário (UserDefaults). Contrato: settings.get / settings.set.
struct AppSettings: Codable {
    var aviso80: Bool          // avisar quando a carga chegar no limite (padrão 80%)
    var limiteAviso: Int       // 50–100
    var avisoQuente: Bool      // avisar se a bateria passar de 45 °C
    var som: Bool              // sons da interface
    var iconeNaBarra: Bool     // ícone da bateria na barra de menus
    var porcentagemNaBarra: Bool
    var soNaBarra: Bool        // janela fechada = some do Dock, fica só na barra

    static let defaults = AppSettings(aviso80: true, limiteAviso: 80, avisoQuente: true, som: true,
                                      iconeNaBarra: true, porcentagemNaBarra: true, soNaBarra: false)

    init(aviso80: Bool, limiteAviso: Int, avisoQuente: Bool, som: Bool,
         iconeNaBarra: Bool, porcentagemNaBarra: Bool, soNaBarra: Bool) {
        self.aviso80 = aviso80; self.limiteAviso = limiteAviso; self.avisoQuente = avisoQuente; self.som = som
        self.iconeNaBarra = iconeNaBarra; self.porcentagemNaBarra = porcentagemNaBarra; self.soNaBarra = soNaBarra
    }

    // campo novo nunca derruba a configuração antiga: o que faltar vem do padrão
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = AppSettings.defaults
        aviso80 = try c.decodeIfPresent(Bool.self, forKey: .aviso80) ?? d.aviso80
        limiteAviso = try c.decodeIfPresent(Int.self, forKey: .limiteAviso) ?? d.limiteAviso
        avisoQuente = try c.decodeIfPresent(Bool.self, forKey: .avisoQuente) ?? d.avisoQuente
        som = try c.decodeIfPresent(Bool.self, forKey: .som) ?? d.som
        iconeNaBarra = try c.decodeIfPresent(Bool.self, forKey: .iconeNaBarra) ?? d.iconeNaBarra
        porcentagemNaBarra = try c.decodeIfPresent(Bool.self, forKey: .porcentagemNaBarra) ?? d.porcentagemNaBarra
        soNaBarra = try c.decodeIfPresent(Bool.self, forKey: .soNaBarra) ?? d.soNaBarra
    }
}

enum Settings {
    private static let key = "kamurafy.settings"

    static var current: AppSettings {
        get {
            guard let data = UserDefaults.standard.data(forKey: key),
                  let s = try? JSON.decoder.decode(AppSettings.self, from: data) else { return .defaults }
            return s
        }
        set {
            if let data = try? JSON.encode(newValue) { UserDefaults.standard.set(data, forKey: key) }
        }
    }

    static func apply(_ args: Args) -> AppSettings {
        var s = current
        if let v = args.bool("aviso80") { s.aviso80 = v }
        if let v = args.int("limiteAviso") { s.limiteAviso = min(max(v, 50), 100) }
        if let v = args.bool("avisoQuente") { s.avisoQuente = v }
        if let v = args.bool("som") { s.som = v }
        if let v = args.bool("iconeNaBarra") { s.iconeNaBarra = v }
        if let v = args.bool("porcentagemNaBarra") { s.porcentagemNaBarra = v }
        if let v = args.bool("soNaBarra") { s.soNaBarra = v }
        current = s
        return s
    }
}

enum SettingsModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("settings.get") { _ in Settings.current }
        r.register("settings.set") { args in
            let before = Settings.current.limiteAviso
            let s = Settings.apply(args)
            if s.limiteAviso != before { Sampler.shared.rearm() }
            if RunMode.current == .app {
                if s.iconeNaBarra { MenuBar.shared.install(); if let b = Sampler.shared.last { MenuBar.shared.update(b) } }
                else { MenuBar.shared.remove() }
            }
            return s
        }
    }
}
