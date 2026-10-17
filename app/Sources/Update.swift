import AppKit

/// Aviso de versão nova: só se a pessoa ligar nos Ajustes (o Kamurafy não fala com a internet
/// por conta própria). Consulta a última versão no GitHub uma vez por dia e manda um aviso
/// uma vez por versão; clicar abre a página da versão no navegador. Nada é baixado sozinho.
struct UpdateInfo: Codable {
    var atual: String
    var nova: String?            // presente só se for mais nova que a atual
    var url: String?             // página da versão no GitHub
    var checadoEm: Double
}

enum Updater {
    static let api = URL(string: "https://api.github.com/repos/GabrielKamura/kamurafy/releases/latest")!
    static let pagina = "https://github.com/GabrielKamura/kamurafy/releases/"
    private static let checkedKey = "kamurafy.update.checked"
    private static let notifiedKey = "kamurafy.update.notified"

    static var current: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0" }

    static func check() async throws -> UpdateInfo {
        var req = URLRequest(url: api, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        req.setValue("Kamurafy/\(current)", forHTTPHeaderField: "User-Agent")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tag = obj["tag_name"] as? String else {
            throw BridgeError.failed("Não consegui ver se tem versão nova agora.")
        }
        let v = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        // só abre página do próprio repositório
        let link = (obj["html_url"] as? String).flatMap { $0.hasPrefix(pagina) ? $0 : nil } ?? pagina + "latest"
        let now = Date().timeIntervalSince1970
        UserDefaults.standard.set(now, forKey: checkedKey)
        let newer = isNewer(v, than: current)
        return UpdateInfo(atual: current, nova: newer ? v : nil, url: newer ? link : nil, checadoEm: now)
    }

    static func isNewer(_ a: String, than b: String) -> Bool {
        let pa = a.split(separator: ".").map { Int($0) ?? 0 }
        let pb = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : 0
            let y = i < pb.count ? pb[i] : 0
            if x != y { return x > y }
        }
        return false
    }

    /// Chamado a cada minuto pelo Sampler: com o aviso ligado, consulta uma vez por dia.
    @MainActor
    static func tick() {
        guard Settings.current.atualizacoes, RunMode.current == .app else { return }
        let last = UserDefaults.standard.double(forKey: checkedKey)
        guard Date().timeIntervalSince1970 - last > 86_400 else { return }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: checkedKey)   // não repete se falhar
        Task {
            guard let info = try? await check(), let nova = info.nova else { return }
            guard UserDefaults.standard.string(forKey: notifiedKey) != nova else { return }
            UserDefaults.standard.set(nova, forKey: notifiedKey)
            Notifier.shared.send(id: "versao", title: L("Kamurafy {0} chegou", nova),
                                 body: L("Clique pra ver o que mudou e baixar."),
                                 info: ["url": info.url ?? pagina + "latest"])
        }
    }
}

enum UpdateModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("update.check") { _ in try await Updater.check() }
    }
}
