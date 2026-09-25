import Foundation
import UserNotifications

/// Mede a bateria a cada minuto enquanto o app está aberto (inclusive só na barra
/// de menus): grava o histórico e dispara os avisos de carga e de temperatura.
@MainActor
final class Sampler {
    static let shared = Sampler()

    private var timer: Timer?
    private var avisou80 = false
    private var lastPercent: Int?
    private var quenteSeguidas = 0
    private var avisouQuente = false
    private(set) var last: BatteryNow?
    var onReading: ((BatteryNow) -> Void)?

    func start() {
        guard timer == nil else { return }
        tick()
        // o log do pmset demora uns 4 s pra ler: deixa pronto em segundo plano
        DispatchQueue.global(qos: .utility).async { _ = History.pmsetPoints() }
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
            Task { @MainActor in Sampler.shared.tick() }
        }
    }

    func tick() {
        let b = Battery.read()
        last = b
        DispatchQueue.global(qos: .utility).async { History.record(b) }
        onReading?(b)
        checkAlerts(b)
    }

    private func checkAlerts(_ b: BatteryNow) {
        guard b.present else { return }
        let s = Settings.current

        // Aviso de carga: só quando cruza o limite carregando (abrir o app já acima
        // do limite não avisa), e uma vez por carga.
        let anterior = lastPercent ?? b.percent
        lastPercent = b.percent
        if !b.pluggedIn || b.percent < s.limiteAviso - 5 { avisou80 = false }
        if s.aviso80, b.pluggedIn, anterior < s.limiteAviso, b.percent >= s.limiteAviso, !avisou80 {
            avisou80 = true
            Notifier.send(id: "carga",
                          title: "Chegou em \(b.percent)%!",
                          body: "Pode tirar da tomada. Parar por volta de \(s.limiteAviso)% ajuda a bateria a durar mais.")
        }

        // Aviso de calor: duas leituras seguidas acima de 45 °C.
        if let t = b.temperatureC, t >= 45 { quenteSeguidas += 1 } else { quenteSeguidas = 0; avisouQuente = false }
        if s.avisoQuente, quenteSeguidas >= 2, !avisouQuente, let t = b.temperatureC {
            avisouQuente = true
            Notifier.send(id: "quente",
                          title: "Bateria quente: \(String(format: "%.0f", t)) °C",
                          body: "Tira o Mac de cima de almofada ou cobertor e fecha o que estiver pesado.")
        }
    }
}

enum Notifier {
    private static var asked = false

    static func requestPermission() {
        guard !asked, Bundle.main.bundleIdentifier != nil else { return }
        asked = true
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    static func send(id: String, title: String, body: String) {
        guard Bundle.main.bundleIdentifier != nil else { return }
        requestPermission()
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        let req = UNNotificationRequest(identifier: "kamurafy.\(id).\(Int(Date().timeIntervalSince1970))", content: c, trigger: nil)
        UNUserNotificationCenter.current().add(req) { _ in }
    }
}
