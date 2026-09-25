import AppKit
import WebKit

/// Web view da janela principal. Guarda o último clique pra permitir arrastar a
/// janela pelas áreas marcadas com `data-drag` na interface (ver window.drag).
final class KWebView: WKWebView {
    private(set) var lastMouseDown: NSEvent?

    override func mouseDown(with event: NSEvent) {
        lastMouseDown = event
        super.mouseDown(with: event)
    }

    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// Serve a interface em kamurafy://app/... a partir de Resources/ui
/// (ou de KAMURAFY_UI_DIR, pra editar a interface sem recompilar).
final class UIScheme: NSObject, WKURLSchemeHandler {
    static let scheme = "kamurafy"
    let root: URL

    init(root: URL) { self.root = root.resolvingSymlinksInPath().standardizedFileURL }

    static func defaultRoot() -> URL {
        #if KAMURAFY_DEV
        if let dev = ProcessInfo.processInfo.environment["KAMURAFY_UI_DIR"], !dev.isEmpty {
            return URL(fileURLWithPath: dev, isDirectory: true)
        }
        #endif
        return Bundle.main.resourceURL!.appendingPathComponent("ui", isDirectory: true)
    }

    private static let mime: [String: String] = [
        "html": "text/html; charset=utf-8", "css": "text/css; charset=utf-8",
        "js": "text/javascript; charset=utf-8", "json": "application/json; charset=utf-8",
        "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "webp": "image/webp",
        "woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf", "otf": "font/otf",
        "txt": "text/plain; charset=utf-8", "mp3": "audio/mpeg", "wav": "audio/wav",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        // resolve links simbólicos antes de conferir que continua dentro de ui/
        let file = root.appendingPathComponent(String(path.dropFirst())).resolvingSymlinksInPath().standardizedFileURL
        let inside = file.path.hasPrefix(root.path + "/")
        guard url.host == "app", inside, let data = try? Data(contentsOf: file) else {
            #if KAMURAFY_DEV
            fputs("[ui:404] \(url.absoluteString)\n", stderr)
            #endif
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!
            task.didReceive(resp)
            task.didReceive(Data())
            task.didFinish()
            return
        }
        let type = UIScheme.mime[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Type": type, "Content-Length": "\(data.count)",
                                                  "Cache-Control": "no-store"])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// Recebe os pedidos da interface: window.webkit.messageHandlers.kamurafy.postMessage({cmd, args})
/// e responde com o JSON do comando (a Promise do JS recebe uma string).
final class BridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == UIScheme.scheme,
              message.frameInfo.securityOrigin.host == "app" else {
            replyHandler(nil, "origem não permitida")
            return
        }
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else {
            replyHandler(nil, "pedido inválido")
            return
        }
        let args = body["args"] as? [String: Any] ?? [:]
        Task { @MainActor in
            do {
                let data = try await Router.shared.call(cmd, args)
                replyHandler(String(decoding: data, as: UTF8.self), nil)
            } catch {
                replyHandler(nil, error.localizedDescription)
            }
        }
    }
}

enum WebUI {
    /// Captura erros de JS e manda pro Swift (aparecem no terminal em modo foto/dev).
    static let errorHook = """
    (function(){
      function send(level, msg){ try { window.webkit.messageHandlers.kamurafy.postMessage({cmd:'app.log', args:{level:level, msg:String(msg).slice(0,4000)}}); } catch(e){} }
      window.addEventListener('error', function(e){
        var t = e.target;
        if (t && t !== window && (t.src || t.href)) { send('error', 'recurso não carregou: ' + (t.src || t.href)); return; }
        send('error', (e.message||'erro') + ' @ ' + (e.filename||'') + ':' + (e.lineno||'') + ':' + (e.colno||''));
      }, true);
      window.addEventListener('unhandledrejection', function(e){ var r=e.reason; send('error', 'promise: ' + (r && (r.stack || r.message) || r)); });
      var ce = console.error.bind(console), cw = console.warn.bind(console), cl = console.log.bind(console);
      console.error = function(){ send('error', Array.prototype.join.call(arguments,' ')); ce.apply(null, arguments); };
      console.warn = function(){ send('warn', Array.prototype.join.call(arguments,' ')); cw.apply(null, arguments); };
      console.log = function(){ send('log', Array.prototype.join.call(arguments,' ')); cl.apply(null, arguments); };
    })();
    """

    static func makeWebView(bridge: BridgeHandler, navigation: WKNavigationDelegate, snapshot: Bool) -> KWebView {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(UIScheme(root: UIScheme.defaultRoot()), forURLScheme: UIScheme.scheme)
        let ucc = WKUserContentController()
        ucc.addScriptMessageHandler(bridge, contentWorld: .page, name: "kamurafy")
        ucc.addUserScript(WKUserScript(source: errorHook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if snapshot {
            // modo foto: sem som e sem esperar animação de entrada
            ucc.addUserScript(WKUserScript(source: "document.documentElement.classList.add('snap');",
                                           injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        cfg.userContentController = ucc
        #if KAMURAFY_DEV
        if ProcessInfo.processInfo.environment["KAMURAFY_DEV"] == "1" {
            cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        }
        #endif
        cfg.suppressesIncrementalRendering = true

        let web = KWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = navigation
        web.setValue(false, forKey: "drawsBackground")
        web.allowsMagnification = false
        web.allowsBackForwardNavigationGestures = false
        #if KAMURAFY_DEV
        if #available(macOS 13.3, *) {
            web.isInspectable = ProcessInfo.processInfo.environment["KAMURAFY_DEV"] == "1"
        }
        #endif
        return web
    }

    static func startURL(route: String?) -> URL {
        let base = "\(UIScheme.scheme)://app/index.html"
        guard let r = route, !r.isEmpty,
              let frag = r.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed),
              let url = URL(string: base + "#/" + frag) else { return URL(string: base)! }
        return url
    }
}
