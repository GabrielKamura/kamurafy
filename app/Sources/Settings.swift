import Foundation

/// Preferências do usuário (UserDefaults). Contrato: settings.get / settings.set.
struct AppSettings: Codable {
    var aviso80: Bool          // avisar quando a carga chegar no limite (padrão 80%)
    var limiteAviso: Int       // 50–100
    var avisoQuente: Bool      // avisar se a bateria passar de 45 °C
    var som: Bool              // sons da interface

    static let defaults = AppSettings(aviso80: true, limiteAviso: 80, avisoQuente: true, som: true)
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
        current = s
        return s
    }
}

enum SettingsModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("settings.get") { _ in Settings.current }
        r.register("settings.set") { args in Settings.apply(args) }
    }
}
