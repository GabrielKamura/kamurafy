import Foundation

typealias Args = [String: Any]

enum BridgeError: LocalizedError {
    case unknown(String)
    case badArgs(String)
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .unknown(let c): return "comando desconhecido: \(c)"
        case .badArgs(let m): return "argumento inválido: \(m)"
        case .failed(let m): return m
        }
    }
}

struct Ok: Codable { var ok = true }

enum JSON {
    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .secondsSince1970
        return e
    }()
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .secondsSince1970
        return d
    }()

    static func encode<T: Encodable>(_ value: T) throws -> Data { try encoder.encode(value) }
}

/// Tabela de comandos que a interface pode chamar. Cada módulo registra os seus
/// em `Commands.registerAll()`. O contrato de cada comando está em docs/ponte.md.
@MainActor
final class Router {
    static let shared = Router()

    private var handlers: [String: (Args) async throws -> Data] = [:]

    func register<T: Encodable>(_ name: String, _ fn: @escaping (Args) async throws -> T) {
        precondition(handlers[name] == nil, "comando registrado duas vezes: \(name)")
        handlers[name] = { args in try JSON.encode(try await fn(args)) }
    }

    func call(_ name: String, _ args: Args) async throws -> Data {
        guard let h = handlers[name] else { throw BridgeError.unknown(name) }
        return try await h(args)
    }

    var names: [String] { handlers.keys.sorted() }
}

enum Commands {
    private static var done = false

    @MainActor
    static func registerAll() {
        guard !done else { return }
        done = true
        let r = Router.shared
        AppCommands.register(r)
        SettingsModule.register(r)
        BatteryModule.register(r)
        HistoryModule.register(r)
        EnergyModule.register(r)
        SystemModule.register(r)
        NotifyModule.register(r)
    }
}

/// Roda um trabalho bloqueante (Process, varredura de disco...) fora da main thread.
func offMain<T>(_ work: @escaping () throws -> T) async throws -> T {
    try await Task.detached(priority: .userInitiated) { try work() }.value
}

extension Dictionary where Key == String, Value == Any {
    func int(_ k: String) -> Int? { (self[k] as? NSNumber)?.intValue }
    func double(_ k: String) -> Double? { (self[k] as? NSNumber)?.doubleValue }
    func bool(_ k: String) -> Bool? {
        if let b = self[k] as? Bool { return b }
        return (self[k] as? NSNumber)?.boolValue
    }
    func string(_ k: String) -> String? { self[k] as? String }
    func dict(_ k: String) -> [String: Any]? { self[k] as? [String: Any] }
}

/// Roda um executável do sistema e devolve a saída padrão como texto.
func runTool(_ path: String, _ arguments: [String], timeout: TimeInterval = 20) throws -> String {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: path)
    p.arguments = arguments
    let out = Pipe()
    p.standardOutput = out
    p.standardError = FileHandle.nullDevice
    try p.run()
    let deadline = DispatchTime.now() + timeout
    DispatchQueue.global().asyncAfter(deadline: deadline) {
        guard p.isRunning else { return }
        p.terminate()
        let pid = p.processIdentifier
        DispatchQueue.global().asyncAfter(deadline: .now() + 2) { if p.isRunning { kill(pid, SIGKILL) } }
    }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    return String(decoding: data, as: UTF8.self)
}
