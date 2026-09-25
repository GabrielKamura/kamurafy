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
        let env = ProcessInfo.processInfo.environment
        guard let path = env["KAMURAFY_SNAPSHOT"], !path.isEmpty else { return nil }
        var size = NSSize(width: 1180, height: 780)
        if let s = env["KAMURAFY_SIZE"]?.split(separator: "x"), s.count == 2, let w = Double(s[0]), let h = Double(s[1]) {
            size = NSSize(width: w, height: h)
        }
        return SnapshotConfig(path: path, route: env["KAMURAFY_ROUTE"] ?? "inicio", size: size,
                              waitMs: Int(env["KAMURAFY_WAIT"] ?? "") ?? 1500, action: env["KAMURAFY_ACTION"])
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

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        Commands.registerAll()
        NSApp.setActivationPolicy(snapshot == nil ? .regular : .accessory)
        buildMenu()
        buildWindow()

        if let snap = snapshot {
            DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
                fputs("modo foto: a interface não avisou app.ready em 25 s\n", stderr)
                _ = snap
                exit(2)
            }
        } else {
            Sampler.shared.start()
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { snapshot != nil }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showWindow() }
        return true
    }

    func showWindow() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
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
        window.backgroundColor = NSColor(calibratedRed: 1, green: 0.99, blue: 0.97, alpha: 1)
        window.delegate = self
        window.contentView = web
        web.load(URLRequest(url: WebUI.startURL(route: snapshot?.route)))
        if snapshot != nil {
            window.orderFrontRegardless()
        } else {
            window.makeKeyAndOrderFront(nil)
        }
    }

    // A interface só navega dentro de kamurafy://. Links externos abrem no navegador.
    nonisolated func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == UIScheme.scheme || url.scheme == "about" {
            decisionHandler(.allow)
        } else {
            if url.scheme == "https" || url.scheme == "http" { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    nonisolated func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        DispatchQueue.main.async { webView.reload() }
    }

    // MARK: ponte → janela

    func uiReady() {
        guard let snap = snapshot, !snapshotTaken else { return }
        snapshotTaken = true
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(snap.waitMs)) { [weak self] in
            guard let self else { return }
            if let js = snap.action, !js.isEmpty {
                self.web.evaluateJavaScript(js) { _, err in
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
        guard snapshot == nil, let ev = web.lastMouseDown else { return }
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
        appMenu.addItem(withTitle: "Sobre o Kamurafy", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Ocultar Kamurafy", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = appMenu.addItem(withTitle: "Ocultar outros", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Sair do Kamurafy", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Editar")
        edit.addItem(withTitle: "Desfazer", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Refazer", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Recortar", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copiar", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Colar", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Selecionar tudo", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let winItem = NSMenuItem()
        let win = NSMenu(title: "Janela")
        win.addItem(withTitle: "Minimizar", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Fechar", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        win.addItem(withTitle: "Recarregar interface", action: #selector(reloadUI), keyEquivalent: "r")
        winItem.submenu = win
        main.addItem(winItem)
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }

    @objc private func reloadUI() { web.reload() }
}

enum AppCommands {
    struct Version: Codable { var version: String; var build: String; var dev: Bool }

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
            return Version(version: info["CFBundleShortVersionString"] as? String ?? "dev",
                           build: info["CFBundleVersion"] as? String ?? "0",
                           dev: ProcessInfo.processInfo.environment["KAMURAFY_UI_DIR"] != nil)
        }
        r.register("window.drag") { _ in
            DispatchQueue.main.async { AppDelegate.shared?.dragWindow() }
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
