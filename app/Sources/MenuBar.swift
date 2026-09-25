import AppKit
import ServiceManagement
import WebKit

/// Ícone na barra de menus: bateria desenhada na hora (com a carga e o raio quando
/// carrega) + a porcentagem. Clique abre um balão com a interface em miniatura
/// (ui/menubar.html), que usa a mesma ponte do app.
@MainActor
final class MenuBar: NSObject, NSPopoverDelegate {
    static let shared = MenuBar()

    private var item: NSStatusItem?
    private var popover: NSPopover?
    private var web: KWebView?

    func install() {
        guard item == nil else { return }
        let it = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        it.button?.target = self
        it.button?.action = #selector(toggle(_:))
        it.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        it.button?.imagePosition = .imageLeading
        it.button?.toolTip = "Kamurafy"
        item = it
        if let b = Sampler.shared.last { update(b) }
    }

    func remove() {
        if let it = item { NSStatusBar.system.removeStatusItem(it) }
        item = nil
        popover?.close()
    }

    func update(_ b: BatteryNow) {
        guard let button = item?.button else { return }
        let s = Settings.current
        button.image = MenuBar.icon(percent: b.present ? b.percent : nil, charging: b.isCharging, plugged: b.pluggedIn)
        button.title = (s.porcentagemNaBarra && b.present) ? " \(b.percent)%" : ""
        var tip = "Kamurafy"
        if b.present {
            tip += " · \(b.percent)%"
            if let h = b.healthPct { tip += " · saúde \(String(format: "%.1f", h).replacingOccurrences(of: ".", with: ","))%" }
        }
        button.toolTip = tip
    }

    @objc private func toggle(_ sender: Any?) {
        if NSApp.currentEvent?.type == .rightMouseUp {
            showMenu()
            return
        }
        if let p = popover, p.isShown { p.performClose(nil); return }
        guard let button = item?.button else { return }
        let p = popover ?? makePopover()
        popover = p
        p.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        p.contentViewController?.view.window?.makeKey()
        web?.evaluateJavaScript("window.K && K.menubar && K.menubar.refresh && K.menubar.refresh(); void 0")
    }

    private func showMenu() {
        let m = NSMenu()
        m.addItem(withTitle: "Abrir o Kamurafy", action: #selector(openMain), keyEquivalent: "").target = self
        m.addItem(.separator())
        m.addItem(withTitle: "Sair do Kamurafy", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item?.menu = m
        item?.button?.performClick(nil)
        item?.menu = nil
    }

    @objc private func openMain() { AppDelegate.shared?.showWindow(route: nil) }

    private func makePopover() -> NSPopover {
        let p = NSPopover()
        p.appearance = NSAppearance(named: .aqua)   // a seta e a borda na cor do papel, mesmo no modo escuro
        p.behavior = .transient
        p.animates = true
        p.delegate = self
        let bridge = AppDelegate.shared?.bridge ?? BridgeHandler()
        let w = WebUI.makeWebView(bridge: bridge, navigation: AppDelegate.shared!, snapshot: false)
        w.load(URLRequest(url: URL(string: "\(UIScheme.scheme)://app/menubar.html")!))
        let vc = NSViewController()
        vc.view = w
        vc.preferredContentSize = NSSize(width: 340, height: 460)
        p.contentViewController = vc
        p.contentSize = NSSize(width: 340, height: 460)
        web = w
        return p
    }

    func closePopover() { popover?.performClose(nil) }

    func resize(height: Double) {
        let h = min(max(height, 200), 700)
        popover?.contentSize = NSSize(width: 340, height: h)
    }

    // MARK: ícone

    /// Bateria em traço (imagem "template": o macOS pinta de preto ou branco conforme o tema).
    static func icon(percent: Int?, charging: Bool, plugged: Bool) -> NSImage {
        let size = NSSize(width: 26, height: 14)
        let img = NSImage(size: size, flipped: false) { rect in
            NSColor.black.setStroke()
            NSColor.black.setFill()
            let body = NSRect(x: 1, y: 1.5, width: 21, height: 11)
            let outline = NSBezierPath(roundedRect: body, xRadius: 3.2, yRadius: 3.2)
            outline.lineWidth = 1.6
            outline.stroke()
            let nub = NSBezierPath(roundedRect: NSRect(x: 23, y: 5, width: 2, height: 4), xRadius: 1, yRadius: 1)
            nub.fill()
            if let p = percent {
                let w = max(1.5, (body.width - 4) * CGFloat(min(max(p, 0), 100)) / 100)
                let fill = NSBezierPath(roundedRect: NSRect(x: body.minX + 2, y: body.minY + 2, width: w, height: body.height - 4),
                                        xRadius: 1.6, yRadius: 1.6)
                fill.fill()
            }
            if charging || plugged {
                // raio vazado por cima do preenchimento
                let bolt = NSBezierPath()
                bolt.move(to: NSPoint(x: 13, y: 12))
                bolt.line(to: NSPoint(x: 8.5, y: 6.5))
                bolt.line(to: NSPoint(x: 11.5, y: 6.5))
                bolt.line(to: NSPoint(x: 10, y: 2))
                bolt.line(to: NSPoint(x: 14.5, y: 7.5))
                bolt.line(to: NSPoint(x: 11.5, y: 7.5))
                bolt.close()
                NSGraphicsContext.current?.compositingOperation = .destinationOut
                let halo = bolt.copy() as! NSBezierPath
                halo.lineWidth = 2.2
                halo.stroke()
                NSGraphicsContext.current?.compositingOperation = .sourceOver
                if !charging { NSColor.black.setFill() }
                bolt.fill()
            }
            return true
        }
        img.isTemplate = true
        return img
    }
}

/// Abrir junto com o Mac (macOS 13+: SMAppService).
enum LoginItem {
    static var enabled: Bool {
        SMAppService.mainApp.status == .enabled
    }

    static func set(_ on: Bool) throws {
        if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
    }

    static var statusText: String {
        switch SMAppService.mainApp.status {
        case .enabled: return "ligado"
        case .requiresApproval: return "precisa-aprovar"
        case .notRegistered: return "desligado"
        case .notFound: return "indisponivel"
        @unknown default: return "indisponivel"
        }
    }
}

enum MenuBarModule {
    struct Status: Codable { var abrirNoLogin: String; var barra: Bool; var porcentagem: Bool; var soNaBarra: Bool }

    @MainActor
    static func register(_ r: Router) {
        r.register("menubar.status") { _ in
            let s = Settings.current
            return Status(abrirNoLogin: LoginItem.statusText, barra: s.iconeNaBarra, porcentagem: s.porcentagemNaBarra, soNaBarra: s.soNaBarra)
        }
        r.register("menubar.loginItem") { args in
            guard let on = args.bool("ligar") else { throw BridgeError.badArgs("ligar") }
            guard RunMode.current == .app else { throw BridgeError.failed("Só no app aberto.") }
            do { try LoginItem.set(on) } catch { throw BridgeError.failed("O macOS não deixou: \(error.localizedDescription)") }
            let s = Settings.current
            return Status(abrirNoLogin: LoginItem.statusText, barra: s.iconeNaBarra, porcentagem: s.porcentagemNaBarra, soNaBarra: s.soNaBarra)
        }
        r.register("app.show") { args in
            AppDelegate.shared?.showWindow(route: args.string("rota"))
            MenuBar.shared.closePopover()
            return Ok()
        }
        r.register("menubar.resize") { args in
            if let h = args.double("altura") { MenuBar.shared.resize(height: h) }
            return Ok()
        }
    }
}
