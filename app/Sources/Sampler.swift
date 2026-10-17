import Foundation
import IOKit.ps
import UserNotifications

/// Mede a bateria enquanto o app está aberto: grava o histórico e dispara os avisos
/// de carga e de temperatura. Acorda a cada mudança de carga/tomada (aviso do próprio
/// macOS, que funciona mesmo com o app em segundo plano) e, de reserva, a cada minuto.
@MainActor
final class Sampler {
    static let shared = Sampler()

    private var timer: Timer?
    private var powerSource: CFRunLoopSource?
    private var avisou80 = false
    private var lastPercent: Int?
    private var quenteSeguidas = 0
    private var avisouQuente = false
    private(set) var last: BatteryNow?
    var onReading: ((BatteryNow) -> Void)?

    func start() {
        guard timer == nil else { return }
        tick()
        let t = Timer(timeInterval: 60, repeats: true) { _ in
            Task { @MainActor in Sampler.shared.tick() }
        }
        t.tolerance = 10
        RunLoop.main.add(t, forMode: .common)
        timer = t

        // O macOS avisa a cada mudança de carga ou de fonte de energia.
        if let src = IOPSNotificationCreateRunLoopSource({ _ in
            DispatchQueue.main.async { Sampler.shared.tick() }
        }, nil)?.takeRetainedValue() {
            CFRunLoopAddSource(CFRunLoopGetMain(), src, .commonModes)
            powerSource = src
        }

        // o log do pmset demora uns 4 s pra ler: deixa pronto em segundo plano
        DispatchQueue.global(qos: .utility).async { _ = History.pmsetPoints() }
    }

    /// Chamado quando o usuário muda o limite do aviso: vale de novo a partir de agora.
    func rearm() {
        avisou80 = false
        lastPercent = nil
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

        // Aviso de carga: só quando cruza o limite carregando (abrir o app já acima do
        // limite não avisa), uma vez por carga. Com o Carregamento Otimizado segurando a
        // carga, o próprio macOS já cuida disso: não manda tirar da tomada.
        let anterior = lastPercent ?? b.percent
        lastPercent = b.percent
        if !b.pluggedIn || b.percent < s.limiteAviso - 5 { avisou80 = false }
        if s.aviso80, b.pluggedIn, !b.optimizedChargingEngaged,
           anterior < s.limiteAviso, b.percent >= s.limiteAviso, !avisou80 {
            avisou80 = true
            Notifier.shared.send(id: "carga",
                                 title: "Chegou em \(b.percent)%!",
                                 body: "Pode tirar da tomada. Parar por volta de \(s.limiteAviso)% ajuda a bateria a durar mais.",
                                 info: ["rota": "bateria"])
        }

        // Aviso de calor: duas leituras seguidas a 45 °C ou mais; só rearma abaixo de 42 °C.
        if let t = b.temperatureC, t >= 45 { quenteSeguidas += 1 } else { quenteSeguidas = 0 }
        if let t = b.temperatureC, t < 42 { avisouQuente = false }
        if s.avisoQuente, quenteSeguidas >= 2, !avisouQuente, let t = b.temperatureC {
            avisouQuente = true
            Notifier.shared.send(id: "quente",
                                 title: "Bateria quente: \(String(format: "%.0f", t)) °C",
                                 body: "Tira o Mac de cima de almofada ou cobertor e fecha o que estiver pesado.",
                                 info: ["rota": "bateria"])
        }
    }
}

/// Notificações do sistema. Pede permissão ao abrir o app (não na hora do primeiro aviso,
/// que senão se perderia) e mostra o banner mesmo com o Kamurafy na frente.
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notifier()

    struct Status: Codable {
        var permitido: Bool
        var estado: String       // "permitido" | "negado" | "nao-pedido" | "provisorio" | "indisponivel"
    }

    private var available: Bool { Bundle.main.bundleIdentifier != nil }

    func setup() {
        guard available else { return }
        let c = UNUserNotificationCenter.current()
        c.delegate = self
        // aviso da vigia: "Não avisar mais desse" sem precisar abrir o app
        let ignorar = UNNotificationAction(identifier: "ignorar", title: "Não avisar mais desse", options: [])
        c.setNotificationCategories([UNNotificationCategory(identifier: "vigia", actions: [ignorar], intentIdentifiers: [], options: [])])
        c.requestAuthorization(options: [.alert, .sound]) { _, err in
            if let err { NSLog("Kamurafy: permissão de notificação: \(err.localizedDescription)") }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    /// Clique no aviso abre o Kamurafy na tela certa; "Não avisar mais desse" ignora o app na vigia.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let rota = info["rota"] as? String
        let nome = info["nome"] as? String
        let acao = response.actionIdentifier
        DispatchQueue.main.async {
            if acao == "ignorar", let nome { Vigia.shared.ignore(nome) }
            else if acao == UNNotificationDefaultActionIdentifier { AppDelegate.shared?.showWindow(route: rota) }
            completionHandler()
        }
    }

    func status() async -> Status {
        guard available else { return Status(permitido: false, estado: "indisponivel") }
        let s = await UNUserNotificationCenter.current().notificationSettings()
        switch s.authorizationStatus {
        case .authorized: return Status(permitido: true, estado: "permitido")
        case .provisional: return Status(permitido: true, estado: "provisorio")
        case .denied: return Status(permitido: false, estado: "negado")
        case .notDetermined: return Status(permitido: false, estado: "nao-pedido")
        @unknown default: return Status(permitido: false, estado: "indisponivel")
        }
    }

    func send(id: String, title: String, body: String, categoria: String? = nil, info: [String: String] = [:]) {
        guard available else { return }
        let c = UNUserNotificationCenter.current()
        c.getNotificationSettings { s in
            guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else {
                NSLog("Kamurafy: aviso \(id) não enviado (notificações desligadas)")
                return
            }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            if let categoria { content.categoryIdentifier = categoria }
            content.userInfo = info
            let req = UNNotificationRequest(identifier: "kamurafy.\(id).\(Int(Date().timeIntervalSince1970))",
                                            content: content, trigger: nil)
            c.add(req) { err in if let err { NSLog("Kamurafy: aviso \(id): \(err.localizedDescription)") } }
        }
    }
}

enum NotifyModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("notify.status") { _ in await Notifier.shared.status() }
        r.register("notify.test") { _ in
            let st = await Notifier.shared.status()
            if st.permitido {
                Notifier.shared.send(id: "teste", title: "Oi! Sou eu, o Kamurafy 👋",
                                     body: "É assim que eu te aviso quando a carga chegar no limite ou a bateria esquentar.")
            }
            return st
        }
    }
}
