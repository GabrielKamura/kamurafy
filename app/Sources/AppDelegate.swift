import AppKit
import WebKit

/// Modo foto (usado pelos testes): abre a interface fora da tela, espera ela avisar
/// que desenhou (app.ready), tira uma foto da web view e sai.
///   KAMURAFY_SNAPSHOT=/caminho/foto.png  KAMURAFY_ROUTE=bateria  KAMURAFY_SIZE=1180x2000
///   KAMURAFY_WAIT=1500 (ms depois do ready)  KAMURAFY_ACTION='K.scan()' (JS antes da foto)
struct SnapshotConfig {
    var path: String
    var route: String
    var size: NSSize
    var waitMs: Int
    var action: String?

    static func fromEnvironment() -> SnapshotConfig? {
        #if !KAMURAFY_DEV
        return nil      // modo foto só existe na build de desenvolvimento
        #else
        let env = ProcessInfo.processInfo.environment
        guard let path = env["KAMURAFY_SNAPSHOT"], !path.isEmpty else { return nil }
        var size = NSSize(width: 1180, height: 780)
        if let s = env["KAMURAFY_SIZE"]?.split(separator: "x"), s.count == 2, let w = Double(s[0]), let h = Double(s[1]) {
            size = NSSize(width: w, height: h)
        }
        return SnapshotConfig(path: path, route: env["KAMURAFY_ROUTE"] ?? "inicio", size: size,
                              waitMs: Int(env["KAMURAFY_WAIT"] ?? "") ?? 1500, action: env["KAMURAFY_ACTION"])
        #endif
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    static weak var shared: AppDelegate?

    var window: NSWindow!
    var web: KWebView!
    let bridge = BridgeHandler()
    let snapshot = SnapshotConfig.fromEnvironment()
    private var snapshotTaken = false
    private var watchdog: DispatchWorkItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        if snapshot != nil { RunMode.current = .snapshot }
        Commands.registerAll()
        NSApp.setActivationPolicy(snapshot == nil ? .regular : .accessory)
        Theme.apply()
        buildMenu()
        buildWindow()

        if snapshot != nil {
            let w = DispatchWorkItem {
                fputs("modo foto: a interface não avisou app.ready em 25 s\n", stderr)
                exit(2)
            }
            watchdog = w
            DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: w)
        } else {
            Notifier.shared.setup()
            Sampler.shared.onReading = { b in MenuBar.shared.update(b) }
            Sampler.shared.start()
            Vigia.shared.start()
            if Settings.current.iconeNaBarra { MenuBar.shared.install() }
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { snapshot != nil }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showWindow() }
        return true
    }

    func showWindow(route: String? = nil) {
        if NSApp.activationPolicy() != .regular { NSApp.setActivationPolicy(.regular) }
        if let r = route, r.range(of: #"^[a-z0-9-]+(\?[a-z0-9=&-]*)?$"#, options: .regularExpression) != nil {
            web.evaluateJavaScript("location.hash = '#/\(r)'; void 0")
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Idioma novo: a janela e o balão recarregam com o catálogo dele (depois de responder ao JS).
    func reloadLanguage() {
        DispatchQueue.main.async {
            WebUI.reloadLanguage(self.web, snapshot: self.snapshot != nil)
            self.buildMenu()
            MenuBar.shared.reloadLanguage()
        }
    }

    func windowWillClose(_ notification: Notification) {
        // "só na barra": sem janela, o Kamurafy some do Dock e fica no ícone da bateria
        let s = Settings.current
        if snapshot == nil, s.soNaBarra, s.iconeNaBarra { NSApp.setActivationPolicy(.accessory) }
    }

    // MARK: janela

    private func buildWindow() {
        web = WebUI.makeWebView(bridge: bridge, navigation: self, snapshot: snapshot != nil)

        if let snap = snapshot {
            window = NSWindow(contentRect: NSRect(origin: NSPoint(x: -30000, y: -30000), size: snap.size),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        } else {
            window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                              backing: .buffered, defer: false)
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.minSize = NSSize(width: 1000, height: 660)
            window.center()
            window.setFrameAutosaveName("KamurafyJanela")
        }
        window.title = "Kamurafy"
        window.isReleasedWhenClosed = false
        window.backgroundColor = Theme.windowBackground
        window.delegate = self
        window.contentView = web
        web.load(URLRequest(url: WebUI.startURL(route: snapshot?.route)))
        if snapshot != nil {
            window.orderFrontRegardless()
        } else {
            window.makeKeyAndOrderFront(nil)
        }
    }

    // A interface só navega dentro de kamurafy://app. Link https clicado pelo usuário abre
    // no navegador; qualquer outra navegação (automática, http, outro host) é barrada.
    nonisolated func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if (url.scheme == UIScheme.scheme && url.host == "app") || url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }
        if url.scheme == "https", action.navigationType == .linkActivated, action.targetFrame?.isMainFrame ?? true {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    nonisolated func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        DispatchQueue.main.async { webView.reload() }
    }

    // MARK: ponte → janela

    func uiReady() {
        guard let snap = snapshot, !snapshotTaken else { return }
        snapshotTaken = true
        watchdog?.cancel()
        let limite = Double(snap.waitMs * 2) / 1000 + 20
        DispatchQueue.main.asyncAfter(deadline: .now() + limite) {
            fputs("modo foto: a foto não saiu em \(Int(limite)) s\n", stderr)
            exit(5)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(snap.waitMs)) { [weak self] in
            guard let self else { return }
            if let js = snap.action, !js.isEmpty {
                // embrulha pra o retorno (Promise, nó do DOM) não virar falso erro
                self.web.evaluateJavaScript("(function(){\n" + js + "\n})(); void 0") { _, err in
                    if let err { fputs("KAMURAFY_ACTION falhou: \(err.localizedDescription)\n", stderr) }
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(snap.waitMs)) { self.capture(snap) }
            } else {
                self.capture(snap)
            }
        }
    }

    private func capture(_ snap: SnapshotConfig) {
        let cfg = WKSnapshotConfiguration()
        cfg.afterScreenUpdates = true
        web.takeSnapshot(with: cfg) { image, error in
            guard let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                  let png = rep.representation(using: .png, properties: [:]) else {
                fputs("foto falhou: \(error?.localizedDescription ?? "sem imagem")\n", stderr)
                exit(3)
            }
            do {
                try png.write(to: URL(fileURLWithPath: snap.path))
                print(snap.path)
                exit(0)
            } catch {
                fputs("não consegui gravar \(snap.path): \(error.localizedDescription)\n", stderr)
                exit(4)
            }
        }
    }

    func dragWindow() {
        // só se o botão ainda está apertado e o clique é recente (senão a janela grudaria no cursor)
        guard snapshot == nil, let ev = web.lastMouseDown,
              NSEvent.pressedMouseButtons & 1 == 1,
              ProcessInfo.processInfo.systemUptime - ev.timestamp < 0.6 else { return }
        window.performDrag(with: ev)
    }

    func zoomWindow() {
        guard snapshot == nil else { return }
        window.zoom(nil)
    }

    // MARK: menu

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: L("Sobre o Kamurafy"), action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: L("Ocultar Kamurafy"), action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = appMenu.addItem(withTitle: L("Ocultar outros"), action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: L("Sair do Kamurafy"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: L("Editar"))
        edit.addItem(withTitle: L("Desfazer"), action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: L("Refazer"), action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: L("Recortar"), action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: L("Copiar"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: L("Colar"), action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: L("Selecionar tudo"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let winItem = NSMenuItem()
        let win = NSMenu(title: L("Janela"))
        win.addItem(withTitle: L("Minimizar"), action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: L("Fechar"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        win.addItem(withTitle: L("Recarregar interface"), action: #selector(reloadUI), keyEquivalent: "r")
        winItem.submenu = win
        main.addItem(winItem)
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }

    @objc private func reloadUI() { web.reload() }
}

enum AppCommands {
    struct Version: Codable { var version: String; var build: String; var dev: Bool; var publico: Bool }

    /// Painéis dos Ajustes do Sistema que a interface pode abrir.
    static let settingsPanes: [String: String] = [
        "bateria": "x-apple.systempreferences:com.apple.Battery-Settings.extension",
        "notificacoes": "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
        "armazenamento": "x-apple.systempreferences:com.apple.settings.Storage",
        "itens-login": "x-apple.systempreferences:com.apple.LoginItems-Settings.extension",
        "privacidade-disco": "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
    ]

    @MainActor
    static func register(_ r: Router) {
        r.register("app.ready") { _ in
            AppDelegate.shared?.uiReady()
            return Ok()
        }
        r.register("app.log") { args in
            let level = args.string("level") ?? "log"
            if AppDelegate.shared?.snapshot != nil || ProcessInfo.processInfo.environment["KAMURAFY_DEV"] == "1" {
                fputs("[js:\(level)] \(args.string("msg") ?? "")\n", stderr)
            }
            return Ok()
        }
        r.register("app.version") { _ in
            let info = Bundle.main.infoDictionary ?? [:]
            #if KAMURAFY_DEV
            let publico = false
            #else
            let publico = true
            #endif
            return Version(version: info["CFBundleShortVersionString"] as? String ?? "dev",
                           build: info["CFBundleVersion"] as? String ?? "0",
                           dev: ProcessInfo.processInfo.environment["KAMURAFY_UI_DIR"] != nil,
                           publico: publico)
        }
        r.register("window.drag") { _ in
            AppDelegate.shared?.dragWindow()
            return Ok()
        }
        r.register("open.settings") { args in
            guard let pane = args.string("painel"), let s = settingsPanes[pane], let url = URL(string: s) else {
                throw BridgeError.badArgs("painel desconhecido (use: \(settingsPanes.keys.sorted().joined(separator: ", ")))")
            }
            NSWorkspace.shared.open(url)
            return Ok()
        }
        r.register("window.zoom") { _ in
            AppDelegate.shared?.zoomWindow()
            return Ok()
        }
        r.register("open.url") { args in
            guard let s = args.string("url"), let url = URL(string: s), url.scheme == "https" else {
                throw BridgeError.badArgs("url precisa ser https")
            }
            NSWorkspace.shared.open(url)
            return Ok()
        }
    }
}
