import Foundation

/// `Kamurafy --cmd <comando> ['{"arg":1}']`: roda um comando da ponte e imprime o JSON.
/// `--cmd list` lista os comandos. Comandos de janela não fazem nada aqui.
enum CLI {
    #if KAMURAFY_DEV
    /// `Kamurafy --seq '[["cleanup.scan",{"categoria":"caches"}],["cleanup.clean",{"ids":"$sel:0"}]]'`
    /// roda vários comandos no mesmo processo (a Faxina guarda os IDs da varredura na memória).
    /// Nos args, "$ids:N" vira todos os IDs de itens da resposta N e "$sel:N" só os marcados.
    /// Só na build dev. Pra limpar de verdade, use KAMURAFY_FAXINA_HOME (caixa de areia).
    static func runSequence(_ json: String) -> Never {
        RunMode.current = .cli
        guard let data = json.data(using: .utf8),
              let steps = try? JSONSerialization.jsonObject(with: data) as? [[Any]] else {
            fputs("--seq precisa de uma lista [[comando, {args}], ...]\n", stderr)
            exit(64)
        }
        Task { @MainActor in
            Commands.registerAll()
            var results: [Any] = []
            for (i, step) in steps.enumerated() {
                guard let cmd = step.first as? String else { exit(64) }
                var args = (step.count > 1 ? step[1] as? [String: Any] : nil) ?? [String: Any]()
                for (k, v) in args {
                    guard let ref = v as? String, ref.hasPrefix("$ids:") || ref.hasPrefix("$sel:"),
                          let n = Int(ref.dropFirst(5)), n < results.count else { continue }
                    args[k] = CLI.collectIDs(results[n], onlySelected: ref.hasPrefix("$sel:"))
                }
                do {
                    let out = try await Router.shared.call(cmd, args)
                    let obj = (try? JSONSerialization.jsonObject(with: out)) ?? [String: Any]()
                    results.append(obj)
                    print("## \(i) \(cmd)\n" + String(decoding: out, as: UTF8.self))
                } catch {
                    results.append([String: Any]())
                    print("## \(i) \(cmd)")
                    print("ERRO: \(error.localizedDescription)")
                }
            }
            fflush(stdout)
            exit(0)
        }
        RunLoop.main.run()
        exit(0)
    }

    static func collectIDs(_ obj: Any, onlySelected: Bool) -> [String] {
        var out: [String] = []
        func walk(_ o: Any) {
            if let d = o as? [String: Any] {
                if let id = d["id"] as? String, d["categoria"] != nil, !onlySelected || (d["selecionado"] as? Bool) == true {
                    out.append(id)
                }
                for v in d.values { walk(v) }
            } else if let a = o as? [Any] {
                for v in a { walk(v) }
            }
        }
        walk(obj)
        return out
    }
    #endif

    static func run(command: String, argsJSON: String?) -> Never {
        RunMode.current = .cli
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
