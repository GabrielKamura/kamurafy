import AppKit

@main
enum Entry {
    @MainActor
    static func main() {
        // Modo linha de comando: `Kamurafy --cmd battery.now '{"arg":1}'` roda um comando
        // da ponte, imprime o JSON e sai. Serve pra testar o lado Swift sem abrir janela.
        let argv = CommandLine.arguments
        #if KAMURAFY_DEV
        if let i = argv.firstIndex(of: "--seq"), i + 1 < argv.count { CLI.runSequence(argv[i + 1]) }
        #endif
        if let i = argv.firstIndex(of: "--cmd"), i + 1 < argv.count {
            CLI.run(command: argv[i + 1], argsJSON: i + 2 < argv.count ? argv[i + 2] : nil)
        }

        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
