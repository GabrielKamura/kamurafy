import Foundation

/// Um ponto por dia da saúde da bateria.
struct HealthPoint: Codable {
    var dia: String          // "2026-09-24" (fuso local)
    var t: Double            // quando foi medido (Unix, s)
    var healthPct: Double
    var maxMah: Int
    var designMah: Int
    var cycles: Int
}

/// Uma amostra de carga. `fonte`: "kamurafy" (medido pelo app) ou "macos" (tirado do pmset -g log).
struct ChargePoint: Codable {
    var t: Double
    var pct: Int
    var plugged: Bool
    var charging: Bool?
    var watts: Double?
    var tempC: Double?
    var fonte: String
}

struct Projection: Codable {
    var method: String       // "historico" | "ciclos" | "sem-dados"
    var cyclesTo80: Int?
    var dateTo80: Double?    // Unix (s), quando dá pra estimar
    var wearPerCycle: Double?// pontos de saúde perdidos por ciclo
    var cyclesPerMonth: Double?
    var daysOfData: Int
}

struct BatteryHistory: Codable {
    var carga: [ChargePoint]
    var saude: [HealthPoint]
    var projection: Projection
}

enum Store {
    static var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent("Kamurafy", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    /// Lê um arquivo do histórico. Se ele não decodificar (arquivo corrompido ou de uma
    /// versão incompatível), guarda uma cópia ao lado em vez de deixar ser sobrescrito.
    /// Regra: campo novo em HealthPoint/ChargePoint é sempre opcional.
    static func load<T: Decodable>(_ name: String, as: T.Type) -> T? {
        let url = dir.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        do {
            return try JSON.decoder.decode(T.self, from: data)
        } catch {
            let copy = url.deletingPathExtension()
                .appendingPathExtension("quebrado-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.moveItem(at: url, to: copy)
            NSLog("Kamurafy: \(name) não decodificou, guardei em \(copy.lastPathComponent): \(error)")
            return nil
        }
    }

    static func save<T: Encodable>(_ name: String, _ value: T) {
        guard let data = try? JSON.encode(value) else { return }
        try? data.write(to: dir.appendingPathComponent(name), options: .atomic)
    }
}

enum History {
    private static let lock = NSLock()
    private static let pmsetQueue = DispatchQueue(label: "kamurafy.pmset")
    private static var pmsetCache: (at: Date, points: [ChargePoint])?
    private static var healthCache: [HealthPoint]?

    /// Saúde "de verdade": mediana dos últimos 7 pontos diários junto com a leitura de agora.
    /// A capacidade oscila 1–2 pontos a cada recalibração; a mediana segura isso.
    static func steadyHealth(current: Double?) -> Double? {
        lock.lock()
        if healthCache == nil { healthCache = health() }
        let recent = healthCache!.suffix(7).map { $0.healthPct }
        lock.unlock()
        var sample = recent
        if let c = current { sample.append(c) }
        guard !sample.isEmpty else { return nil }
        let sorted = sample.sorted()
        return sorted[sorted.count / 2]
    }

    static func dayString(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    static func health() -> [HealthPoint] {
        Store.load("saude.json", as: [HealthPoint].self) ?? []
    }

    static func charges() -> [ChargePoint] {
        Store.load("carga.json", as: [ChargePoint].self) ?? []
    }

    /// Guarda a leitura: um ponto de saúde por dia e uma amostra de carga
    /// (a cada 5 min, ou antes se a carga ou a tomada mudarem).
    static func record(_ b: BatteryNow) {
        guard b.present else { return }
        lock.lock(); defer { lock.unlock() }
        let now = Date(timeIntervalSince1970: b.readAt)

        if let h = b.healthPct, let m = b.maxMah, let d = b.designMah, let c = b.cycles {
            var list = healthCache ?? health()
            let p = HealthPoint(dia: dayString(now), t: b.readAt, healthPct: h, maxMah: m, designMah: d, cycles: c)
            var changed = true
            if let last = list.last, last.dia == p.dia {
                changed = last.healthPct != p.healthPct || last.cycles != p.cycles || last.maxMah != p.maxMah
                list[list.count - 1] = p
            } else {
                list.append(p)
            }
            healthCache = list
            if changed { Store.save("saude.json", list) }
        }

        var list = charges()
        let p = ChargePoint(t: b.readAt, pct: b.percent, plugged: b.pluggedIn, charging: b.isCharging,
                            watts: b.watts, tempC: b.temperatureC, fonte: "kamurafy")
        let due: Bool
        if let last = list.last {
            due = b.readAt - last.t >= 300 || last.pct != p.pct || last.plugged != p.plugged
        } else {
            due = true
        }
        if due {
            list.append(p)
            let cutoff = b.readAt - 30 * 86400
            list.removeAll { $0.t < cutoff }
            Store.save("carga.json", list)
        }
    }

    /// Lê as marcas de carga que o próprio macOS guarda no log de energia
    /// (linhas "Using AC (Charge:82%)"). Cobre mais ou menos a última semana.
    static func pmsetPoints() -> [ChargePoint] {
        // numa fila só: a segunda chamada espera a primeira e usa o cache (o pmset gasta ~4 s de CPU)
        pmsetQueue.sync {
            if let c = pmsetCache, Date().timeIntervalSince(c.at) < 600 { return c.points }
            guard let text = try? runTool("/usr/bin/pmset", ["-g", "log"], timeout: 30), !text.isEmpty else {
                return pmsetCache?.points ?? []     // falhou: não guarda vazio no cache
            }
            let fmt = DateFormatter()
            fmt.locale = Locale(identifier: "en_US_POSIX")
            fmt.dateFormat = "yyyy-MM-dd HH:mm:ss Z"
            let re = try! NSRegularExpression(pattern: #"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d{4}) .*?Using (AC|BATT|Batt) ?\(Charge: ?(\d{1,3})%?\)"#)
            var out: [ChargePoint] = []
            text.enumerateLines { line, _ in
                guard line.contains("Charge:") else { return }
                let ns = line as NSString
                guard let m = re.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)),
                      let date = fmt.date(from: ns.substring(with: m.range(at: 1))),
                      let pct = Int(ns.substring(with: m.range(at: 3))) else { return }
                let plugged = ns.substring(with: m.range(at: 2)) == "AC"
                out.append(ChargePoint(t: date.timeIntervalSince1970, pct: min(pct, 100), plugged: plugged,
                                       charging: nil, watts: nil, tempC: nil, fonte: "macos"))
            }
            out.sort { $0.t < $1.t }
            // um ponto por minuto basta
            var dedup: [ChargePoint] = []
            for p in out {
                if let last = dedup.last, Int(last.t / 60) == Int(p.t / 60) { dedup[dedup.count - 1] = p } else { dedup.append(p) }
            }
            pmsetCache = (Date(), dedup)
            return dedup
        }
    }

    static func series(days: Int) -> BatteryHistory {
        let b = Battery.read()
        let saude = health()
        guard b.present else {
            return BatteryHistory(carga: [], saude: saude, projection: Projection(method: "sem-dados", daysOfData: 0))
        }
        let now = Date().timeIntervalSince1970
        let from = now - Double(days) * 86400
        var own = charges().filter { $0.t >= from }
        let osPoints = pmsetPoints().filter { $0.t >= from }
        // pontos do macOS só onde o app não tem medida própria (±3 min); busca binária nos tempos
        let ownTimes = own.map { $0.t }.sorted()
        func hasOwn(near t: Double) -> Bool {
            var lo = 0, hi = ownTimes.count
            while lo < hi { let mid = (lo + hi) / 2; if ownTimes[mid] < t - 180 { lo = mid + 1 } else { hi = mid } }
            return lo < ownTimes.count && ownTimes[lo] <= t + 180
        }
        for p in osPoints where !hasOwn(near: p.t) { own.append(p) }
        // a leitura de agora fecha a série (o último ponto do log pode estar horas atrás)
        own.append(ChargePoint(t: b.readAt, pct: b.percent, plugged: b.pluggedIn, charging: b.isCharging,
                               watts: b.watts, tempC: b.temperatureC, fonte: "kamurafy"))
        own.sort { $0.t < $1.t }
        return BatteryHistory(carga: own, saude: saude, projection: projection(saude, b))
    }

    static func projection(_ saude: [HealthPoint], _ b: BatteryNow) -> Projection {
        let span = (saude.last?.t ?? 0) - (saude.first?.t ?? 0)
        let days = saude.count > 1 ? Int(span / 86400) : 0
        // saúde amortecida: mediana dos últimos 7 dias + agora (a leitura crua oscila ±2 pontos)
        var sample = saude.suffix(7).map { $0.healthPct }
        if let h = b.healthPct { sample.append(h) }
        guard let cycles = b.cycles, !sample.isEmpty else {
            return Projection(method: "sem-dados", daysOfData: days)
        }
        let sorted = sample.sorted()
        let health = sorted[sorted.count / 2]
        // bateria nova (poucos ciclos ou quase sem desgaste): qualquer conta aqui seria chute
        guard cycles >= 50, health <= 98 else {
            return Projection(method: "sem-dados", daysOfData: days)
        }

        // ciclos por mês só com uma variação que signifique algo
        var cpm: Double? = nil
        if days >= 14, let first = saude.first, let last = saude.last, last.cycles - first.cycles >= 5 {
            cpm = Double(last.cycles - first.cycles) / (span / 86400) * 30
        }

        // Com 30+ dias de histórico e queda real, a reta do histórico manda.
        if days >= 30, let first = saude.first, let last = saude.last, last.healthPct < first.healthPct - 0.5 {
            let n = Double(saude.count)
            let xs = saude.map { $0.t }, ys = saude.map { $0.healthPct }
            let mx = xs.reduce(0, +) / n, my = ys.reduce(0, +) / n
            var num = 0.0, den = 0.0
            for i in 0..<saude.count { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx) }
            let slope = den > 0 ? num / den : 0      // pontos por segundo
            if slope < 0 {
                let when = mx + (80 - my) / slope
                let dc = last.cycles - first.cycles
                let perCycle = dc >= 5 ? (first.healthPct - last.healthPct) / Double(dc) : nil
                let left = perCycle.flatMap { $0 > 0 ? max(0, Int(((health - 80) / $0).rounded())) : nil }
                return Projection(method: "historico", cyclesTo80: left,
                                  dateTo80: max(when, Date().timeIntervalSince1970),
                                  wearPerCycle: perCycle.map { ($0 * 10000).rounded() / 10000 },
                                  cyclesPerMonth: cpm, daysOfData: days)
            }
        }

        // Sem histórico suficiente: desgaste médio por ciclo até aqui.
        let wear = (100 - health) / Double(cycles)
        guard wear > 0 else { return Projection(method: "sem-dados", daysOfData: days) }
        let left = health > 80 ? Int(((health - 80) / wear).rounded()) : 0
        var date: Double? = nil
        if let c = cpm, c > 0 { date = Date().timeIntervalSince1970 + Double(left) / c * 30 * 86400 }
        return Projection(method: "ciclos", cyclesTo80: left, dateTo80: date,
                          wearPerCycle: (wear * 10000).rounded() / 10000, cyclesPerMonth: cpm, daysOfData: days)
    }
}

enum HistoryModule {
    @MainActor
    static func register(_ r: Router) {
        r.register("battery.history") { args in
            let days = min(max(args.int("dias") ?? 7, 1), 30)
            return try await offMain { History.series(days: days) }
        }
    }
}
