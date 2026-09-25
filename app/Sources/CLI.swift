import Foundation

/// `Kamurafy --cmd <comando> ['{"arg":1}']`: roda um comando da ponte e imprime o JSON.
/// `--cmd list` lista os comandos. Comandos de janela não fazem nada aqui.
enum CLI {
    static func run(command: String, argsJSON: String?) -> Never {
        var args: Args = [:]
        if let s = argsJSON, !s.isEmpty {
            guard let data = s.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                fputs("argumentos precisam ser um objeto JSON\n", stderr)
                exit(64)
            }
            args = obj
        }
        let finalArgs = args
        Task { @MainActor in
            Commands.registerAll()
            if command == "list" {
                print(Router.shared.names.joined(separator: "\n"))
                exit(0)
            }
            do {
                let data = try await Router.shared.call(command, finalArgs)
                FileHandle.standardOutput.write(data)
                print("")
                exit(0)
            } catch {
                fputs("erro: \(error.localizedDescription)\n", stderr)
                exit(1)
            }
        }
        RunLoop.main.run()
        exit(0)
    }
}
