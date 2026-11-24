import AppKit
import WebKit
import UniformTypeIdentifiers
import os

final class GameViewController: NSViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    let store: GameStore
    private(set) var webView: WKWebView!
    private let resourceRoot: URL
    private var assetHandler: AssetSchemeHandler!
    private let restoreToken = UUID().uuidString
    private var pendingNewGame = false
    private var recentReports: [String] = []
    private let logger = Logger(subsystem: "local.will.dieying", category: "Runtime")
    private struct DownloadDestination {
        let temporary: URL
        let final: URL
    }
    private var downloadDestinations: [ObjectIdentifier: DownloadDestination] = [:]

    var isSolitairePage: Bool {
        guard isViewLoaded, let url = webView?.url else { return false }
        return url.scheme == "mahjong" && url.host == "app" && url.path == "/solitaire.html"
    }

    init(store: GameStore) {
        self.store = store
        resourceRoot = Bundle.main.resourceURL!.appendingPathComponent("Web", isDirectory: true)
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.isElementFullscreenEnabled = true
        config.mediaTypesRequiringUserActionForPlayback = []
        assetHandler = AssetSchemeHandler(root: resourceRoot)
        config.setURLSchemeHandler(assetHandler, forURLScheme: "mahjong")
        let controller = WKUserContentController()
        controller.add(self, name: "gameStore")
        controller.add(self, name: "gameLog")
        refreshBridge(in: controller)
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.underPageBackgroundColor = NSColor(srgbRed: 0.063, green: 0.157, blue: 0.137, alpha: 1)
        let background = NSView()
        background.wantsLayer = true
        background.layer?.backgroundColor = NSColor(srgbRed: 0.063, green: 0.157, blue: 0.137, alpha: 1).cgColor
        webView.translatesAutoresizingMaskIntoConstraints = false
        background.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: background.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: background.trailingAnchor),
            webView.topAnchor.constraint(equalTo: background.topAnchor),
            webView.bottomAnchor.constraint(equalTo: background.bottomAnchor)
        ])
        view = background
        showSolitaire()
    }

    func showSolitaire() { load("/solitaire.html") }
    func showWorkshop() { pendingNewGame = false; load("/index.html") }
    func showGallery() { pendingNewGame = false; load("/tile-studio.html") }
    private func load(_ path: String) {
        refreshBridge()
        webView.load(URLRequest(url: URL(string: "mahjong://app" + path)!))
    }

    /// A new document gets the latest native recovery copy. The stable token
    /// lets NativeBridge distinguish first launch recovery from normal in-app
    /// navigation, so a launch snapshot cannot overwrite later moves.
    private func refreshBridge(in contentController: WKUserContentController? = nil) {
        let controller = contentController ?? webView.configuration.userContentController
        guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
              let source = try? String(contentsOf: bridgeURL, encoding: .utf8) else { return }
        let script = source.replacingOccurrences(of: "__INITIAL_STORAGE__", with: store.base64Snapshot)
            .replacingOccurrences(of: "__RESTORE_TOKEN__", with: restoreToken)
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    func click(_ id: String) {
        let literal = String(data: try! JSONSerialization.data(withJSONObject: id, options: .fragmentsAllowed), encoding: .utf8)!
        webView.evaluateJavaScript("document.getElementById(\(literal))?.click()", completionHandler: nil)
    }

    func newGame() {
        pendingNewGame = true
        if isSolitairePage {
            if !webView.isLoading { openPendingNewGame() }
        } else { showSolitaire() }
    }

    private func openPendingNewGame() {
        guard pendingNewGame, isSolitairePage else { return }
        pendingNewGame = false
        let script = """
        (function ready(n){
          if(location.pathname!='/solitaire.html')return;
          if(document.body.dataset.layout)document.getElementById('new-button')?.click();
          else if(n<200)setTimeout(()=>ready(n+1),50);
        })(0)
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        openPendingNewGame()
    }

    func immerse() {
        webView.evaluateJavaScript("document.querySelector('[data-global=immersive],#immersive-button')?.click()", completionHandler: nil)
    }

    func showDiagnostics() {
        let script = """
        JSON.stringify({url:location.href,protocol:location.protocol,host:location.hostname,
          nativeBridge:typeof window.__dieyingSaveSnapshot,nativeDiagnostics:window.__dieyingNativeDiagnostics,
          visibility:document.visibilityState,
          canvas:(()=>{const c=document.getElementById('solitaire-canvas');if(!c)return null;const r=c.getBoundingClientRect();return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height};})(),
          audio:(()=>{const a=document.getElementById('voice-audio'),s=document.getElementById('tile-sound-button');return {
            voice:a?{source:a.currentSrc,paused:a.paused,ended:a.ended,currentTime:a.currentTime,duration:a.duration,readyState:a.readyState,error:a.error?.message||null}:null,
            tileSound:s?{enabled:s.getAttribute('aria-pressed'),playing:s.dataset.playing,lastClip:s.dataset.clip,lastKind:s.dataset.kind,status:s.title}:null};})(),
          models:document.getElementById('render-status')?.textContent},null,2)
        """
        webView.evaluateJavaScript(script) { [weak self] result, error in
            // Capture native visibility before the diagnostic modal itself can
            // activate the app or change which window is considered key.
            let native = self?.nativeWindowDiagnostics() ?? "Native view unavailable"
            let alert = NSAlert()
            alert.messageText = "叠影运行状态"
            let reports = self?.recentReports.suffix(8).joined(separator: "\n") ?? ""
            let text = native + "\n\n" + (result as? String ?? error?.localizedDescription ?? "尚未载入") + "\n\n" + reports
            let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 650, height: 420))
            let content = NSTextView(frame: NSRect(x: 0, y: 0, width: 630, height: 420))
            content.isEditable = false
            content.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
            content.string = text
            content.isVerticallyResizable = true
            content.textContainer?.widthTracksTextView = true
            scroll.documentView = content
            scroll.hasVerticalScroller = true
            alert.accessoryView = scroll
            alert.addButton(withTitle: "关闭")
            alert.runModal()
        }
    }

    private func nativeWindowDiagnostics() -> String {
        func rect(_ value: NSRect) -> [String: Double] {
            ["x": Double(value.origin.x), "y": Double(value.origin.y),
             "width": Double(value.width), "height": Double(value.height)]
        }
        let window = webView.window
        var nativeWindow: [String: Any] = ["attached": window != nil]
        if let window {
            nativeWindow["visible"] = window.isVisible
            nativeWindow["miniaturized"] = window.isMiniaturized
            nativeWindow["occlusionVisible"] = window.occlusionState.contains(.visible)
            nativeWindow["key"] = window.isKeyWindow
            nativeWindow["main"] = window.isMainWindow
            nativeWindow["frame"] = rect(window.frame)
            nativeWindow["screen"] = window.screen?.localizedName ?? "(none)"
            if let screen = window.screen {
                nativeWindow["screenFrame"] = rect(screen.frame)
                nativeWindow["screenVisibleFrame"] = rect(screen.visibleFrame)
            }
        }
        let report: [String: Any] = [
            "nativeApp": ["active": NSApp.isActive, "hidden": NSApp.isHidden],
            "nativeWindow": nativeWindow,
            "nativeWebView": [
                "windowAttached": webView.window != nil,
                "hiddenOrHasHiddenAncestor": webView.isHiddenOrHasHiddenAncestor,
                "visibleRect": rect(webView.visibleRect), "frame": rect(webView.frame)
            ]
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return "Native diagnostics unavailable" }
        return text
    }

    func saveBeforeClosing(_ completion: @escaping () -> Void) {
        guard isViewLoaded else { store.flush(); completion(); return }
        let script = "window.dispatchEvent(new Event('pagehide')); JSON.stringify(window.__dieyingSaveSnapshot?.() || {})"
        webView.evaluateJavaScript(script) { [weak self] result, _ in
            if let text = result as? String, let data = text.data(using: .utf8),
               let values = try? JSONDecoder().decode([String: String].self, from: data), !values.isEmpty {
                self?.store.replace(with: values)
            }
            self?.store.flush()
            completion()
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        if message.name == "gameLog" {
            let text = String(describing: message.body)
            recentReports.append(text)
            if recentReports.count > 24 { recentReports.removeFirst(recentReports.count - 24) }
            logger.notice("\(text, privacy: .public)")
            return
        }
        guard message.frameInfo.request.url?.scheme == "mahjong", message.frameInfo.request.url?.host == "app" else { return }
        guard let body = message.body as? [String: Any] else { return }
        if let snapshot = body["snapshot"] as? [String: String] { store.replace(with: snapshot) }
        else if let key = body["key"] as? String { store.set(body["value"] as? String, for: key) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "mahjong", url.host == "app" {
            if navigationAction.targetFrame?.isMainFrame != false {
                if url.path != "/solitaire.html" { pendingNewGame = false }
                refreshBridge()
            }
            decisionHandler(.allow)
            return
        }
        if navigationAction.navigationType == .linkActivated, ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if url.scheme == "mahjong", url.host == "app" {
            refreshBridge()
            webView.load(navigationAction.request)
        }
        else if ["https", "http"].contains(url.scheme ?? ""), navigationAction.navigationType == .linkActivated { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.allowedContentTypes = [.json]
        if let window = view.window {
            panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
        } else { panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) } }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.canCreateDirectories = true
        if let type = UTType(filenameExtension: (suggestedFilename as NSString).pathExtension) { panel.allowedContentTypes = [type] }
        let selected: (NSApplication.ModalResponse) -> Void = { [weak self] result in
            guard result == .OK, let final = panel.url, let self else {
                completionHandler(nil)
                return
            }
            // WKDownload requires a destination which does not yet exist. The
            // save panel may have approved replacing an existing final file,
            // so finish into a sibling and replace only after download success.
            let temporary = final.deletingLastPathComponent()
                .appendingPathComponent(".dieying-\(UUID().uuidString).download")
            self.downloadDestinations[ObjectIdentifier(download)] = DownloadDestination(temporary: temporary, final: final)
            completionHandler(temporary)
        }
        if let window = view.window {
            panel.beginSheetModal(for: window, completionHandler: selected)
        } else { panel.begin(completionHandler: selected) }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let destination = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        do {
            let files = FileManager.default
            if files.fileExists(atPath: destination.final.path) {
                _ = try files.replaceItemAt(destination.final, withItemAt: destination.temporary)
            } else {
                try files.moveItem(at: destination.temporary, to: destination.final)
            }
        } catch {
            try? FileManager.default.removeItem(at: destination.temporary)
            presentError(error)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let destination = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: destination.temporary)
        }
        if (error as NSError).code != NSURLErrorCancelled { presentError(error) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showLoadError(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showLoadError(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        store.flush()
        refreshBridge()
        webView.reload()
    }
    private func showLoadError(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        let alert = NSAlert()
        alert.messageText = "牌桌暂时没有打开"
        alert.informativeText = "请重试。你的本机存档已保留。\n" + error.localizedDescription
        alert.addButton(withTitle: "重新打开")
        alert.addButton(withTitle: "关闭")
        if alert.runModal() == .alertFirstButtonReturn { showSolitaire() }
    }
}
