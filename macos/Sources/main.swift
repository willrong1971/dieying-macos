import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuItemValidation {
    private var window: NSWindow!
    private var game: GameViewController!
    private let store = GameStore()
    private var finishing = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        makeMenus()
        game = GameViewController(store: store)
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = NSSize(width: min(1280, screen.width - 60), height: min(880, screen.height - 60))
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "叠影 · 麻将对对碰"
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(srgbRed: 0.063, green: 0.157, blue: 0.137, alpha: 1)
        window.contentMinSize = NSSize(width: 760, height: 600)
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.fullScreenPrimary]
        window.delegate = self
        game.view.frame = NSRect(origin: .zero, size: size)
        window.contentViewController = game
        window.setContentSize(size)
        window.setFrameAutosaveName("DieYingMainWindow")
        if !window.setFrameUsingName("DieYingMainWindow") { window.center() }
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(game.webView)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func makeMenus() {
        let menu = NSMenu()
        let appMenu = NSMenu(title: "叠影")
        add("关于叠影", #selector(about), to: appMenu)
        appMenu.addItem(.separator())
        add("隐藏叠影", #selector(NSApplication.hide(_:)), key: "h", to: appMenu, target: NSApp)
        let hideOthers = add("隐藏其他", #selector(NSApplication.hideOtherApplications(_:)), key: "h", to: appMenu, target: NSApp)
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        add("显示全部", #selector(NSApplication.unhideAllApplications(_:)), to: appMenu, target: NSApp)
        appMenu.addItem(.separator())
        add("退出叠影", #selector(NSApplication.terminate(_:)), key: "q", to: appMenu, target: NSApp)
        attach(appMenu, to: menu)
        let play = NSMenu(title: "游戏")
        add("新牌局…", #selector(newGame), key: "n", to: play)
        add("暂停或继续", #selector(pauseGame), key: "p", to: play)
        add("提示一对", #selector(hint), key: "t", to: play)
        add("撤销一步", #selector(undoGame), key: "z", to: play)
        add("洗牌", #selector(shuffle), key: "r", to: play)
        add("重玩本局…", #selector(restart), to: play)
        attach(play, to: menu)
        let edit = NSMenu(title: "编辑")
        add("剪切", #selector(NSText.cut(_:)), key: "x", to: edit, target: nil)
        add("拷贝", #selector(NSText.copy(_:)), key: "c", to: edit, target: nil)
        add("粘贴", #selector(NSText.paste(_:)), key: "v", to: edit, target: nil)
        add("全选", #selector(NSText.selectAll(_:)), key: "a", to: edit, target: nil)
        attach(edit, to: menu)
        let view = NSMenu(title: "显示")
        add("沉浸牌桌", #selector(immerse), key: "i", to: view)
        add("视角复位", #selector(resetView), key: "0", to: view)
        view.addItem(.separator())
        add("麻将对对碰", #selector(showSolitaire), key: "1", to: view)
        add("数学教学工坊", #selector(showWorkshop), key: "2", to: view)
        let full = add("进入或退出全屏", #selector(toggleFullscreen), key: "f", to: view)
        full.keyEquivalentModifierMask = [.command, .control]
        attach(view, to: menu)
        let windows = NSMenu(title: "窗口")
        add("关闭窗口", #selector(NSWindow.performClose(_:)), key: "w", to: windows, target: nil)
        add("最小化", #selector(NSWindow.performMiniaturize(_:)), key: "m", to: windows, target: nil)
        add("缩放", #selector(NSWindow.performZoom(_:)), to: windows, target: nil)
        attach(windows, to: menu)
        NSApp.windowsMenu = windows
        let help = NSMenu(title: "帮助")
        add("运行状态…", #selector(diagnostics), to: help)
        attach(help, to: menu)
        NSApp.helpMenu = help
        NSApp.mainMenu = menu
    }
    @discardableResult private func add(_ title: String, _ action: Selector, key: String = "", to menu: NSMenu, target: AnyObject? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = target ?? (["cut:", "copy:", "paste:", "selectAll:", "performClose:", "performMiniaturize:", "performZoom:"].contains(NSStringFromSelector(action)) ? nil : self)
        menu.addItem(item)
        return item
    }
    private func attach(_ submenu: NSMenu, to menu: NSMenu) {
        let item = NSMenuItem(title: submenu.title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        menu.addItem(item)
    }
    @objc private func about() {
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "叠影 · 麻将对对碰", .applicationVersion: "1.0.0",
            .credits: NSAttributedString(string: "离线立体麻将对对碰与数学教学工坊\n三种材质 · 本机配音 · 自动存档")
        ])
    }
    @objc private func newGame() { game.newGame() }
    @objc private func pauseGame() { game.click("pause-button") }
    @objc private func hint() { game.click("hint-button") }
    @objc private func undoGame() { game.click("undo-button") }
    @objc private func shuffle() { game.click("shuffle-button") }
    @objc private func restart() { game.click("restart-button") }
    @objc private func immerse() { game.immerse() }
    @objc private func resetView() { game.click("reset-view") }
    @objc private func showSolitaire() { game.showSolitaire() }
    @objc private func showWorkshop() { game.showWorkshop() }
    @objc private func toggleFullscreen() { window.toggleFullScreen(nil) }
    @objc private func diagnostics() { game.showDiagnostics() }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        let solitaireActions: Set<Selector> = [#selector(pauseGame), #selector(hint), #selector(undoGame), #selector(shuffle), #selector(restart), #selector(resetView)]
        if let action = menuItem.action, solitaireActions.contains(action) { return game?.isSolitairePage == true }
        return game != nil || menuItem.action == #selector(about)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !finishing, game != nil else { return .terminateNow }
        finishing = true
        var replied = false
        let finish = {
            guard !replied else { return }
            replied = true
            self.store.flush()
            sender.reply(toApplicationShouldTerminate: true)
        }
        game.saveBeforeClosing(finish)
        // Each move is already atomically saved by the bridge. A suspended
        // WebContent process must not prevent the native application quitting.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: finish)
        return .terminateLater
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
