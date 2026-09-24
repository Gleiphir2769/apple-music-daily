import SwiftUI
import WebKit
import MusicKit

@MainActor
final class WebExecutor: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let web: WKWebView
    @Published var hidden = false
    @Published var busy = false
    @Published var log = "验证器 v2：收起网页使用遮罩，保留网页布局；不等同于后台运行。请在下方 Apple Music 网页登录，再搜索并打开《想自由》— 林宥嘉。\n"
    private var popupWindows: [NSWindow] = []
    private var baseline: Set<String>?
    private var baselineDate: Date?
    private var addSubmitted = false
    private let title = "想自由"
    private let artist = "林宥嘉"

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame: .zero, configuration: config)
        super.init()
        web.navigationDelegate = self
        web.uiDelegate = self
        web.load(URLRequest(url: URL(string: "https://music.apple.com/cn/home")!))
    }
    func note(_ message: String) {
        log += "[\(Date().formatted(date: .omitted, time: .standard))] \(message)\n"
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        note("网页加载失败：\((error as NSError).domain) / \((error as NSError).code)")
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        note("网页进程退出，请重新载入并登录。")
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.absoluteString == "about:blank" { decisionHandler(.allow); return }
        let host = url.host?.lowercased() ?? ""
        let allowed = url.scheme == "https" && (host == "apple.com" || host.hasSuffix(".apple.com"))
        if !allowed { note("已阻止离开 Apple HTTPS 网页；本测试不跳转外部 App。") }
        decisionHandler(allowed ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let child = WKWebView(frame: NSRect(x: 0, y: 0, width: 600, height: 720), configuration: configuration)
        child.navigationDelegate = self
        child.uiDelegate = self
        let window = NSWindow(contentRect: child.frame, styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "Apple 登录"
        window.isReleasedWhenClosed = false
        window.contentView = child
        popupWindows.append(window)
        window.center()
        window.makeKeyAndOrderFront(nil)
        return child
    }
    func webViewDidClose(_ webView: WKWebView) {
        popupWindows.filter { $0.contentView === webView }.forEach { $0.close() }
        popupWindows.removeAll { $0.contentView === webView }
    }
    private func js(_ body: String) async throws -> String {
        guard web.url?.host == "music.apple.com" else { return "请先完成 Apple Music 登录。" }
        let script = """
        (() => {
          const label = e => (e.getAttribute('aria-label') ||
            (e.getAttribute('aria-labelledby') || '').split(/\\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
            e.innerText || e.textContent || e.getAttribute('title') || '').trim();
          const rendered = e => !e.closest('[hidden],[aria-hidden="true"]') && e.getClientRects().length > 0 &&
            getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
          const enabled = e => !e.disabled && e.getAttribute('aria-disabled') !== 'true';
          const available = e => rendered(e) && enabled(e);
          const allButtons = root => [...root.querySelectorAll('button,[role="button"],[role="menuitem"]')];
          const buttons = root => allButtons(root).filter(available);
          const rows = [...document.querySelectorAll('[role="row"]')].filter(r =>
            r.getAttribute('aria-label') === '想自由' || [...r.querySelectorAll('a')].some(a => a.textContent.trim() === '想自由'));
          const target = rows.filter(r => buttons(r).some(b => label(b).includes('林宥嘉') && label(b).includes('想自由')));
          \(body)
        })()
        """
        return (try await web.evaluateJavaScript(script)) as? String ?? "没有返回状态"
    }
    func control(_ action: String) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let result: String
            if action == "song" {
                result = try await js("""
                if(target.length !== 1) return '没有唯一匹配的《想自由》— 林宥嘉歌曲行，请先在网页搜索并打开专辑。';
                const b = buttons(target[0]).filter(b => label(b).includes('播放') && label(b).includes('林宥嘉') && label(b).includes('想自由'));
                if(b.length !== 1) return '没有可用的歌曲播放按钮。';
                b[0].click(); return '已发送歌曲播放点击；请检查状态和是否播放完整歌曲。';
                """)
            } else {
                let labels = action == "next" ? "['下一首','Next']" : "['暂停','播放','Pause','Play']"
                result = try await js("""
                const matches = allButtons(document).filter(b => \(labels).includes(label(b)));
                const b = matches.filter(available);
                if(b.length !== 1) return '播放器按钮不可操作：' + JSON.stringify(matches.map(e => ({label:label(e),enabled:enabled(e),rendered:rendered(e)}))) + '；可用匹配数=' + b.length + '。试听可能没有下一首队列；请展开网页核对。';
                const name = label(b[0]); b[0].click(); return '已点击：' + name + '；请检查媒体状态。';
                """)
            }
            note(result)
            try await Task.sleep(for: .milliseconds(400))
            await inspect()
        } catch { note("网页控制失败：\((error as NSError).domain) / \((error as NSError).code)") }
    }
    func inspect() async {
        do {
            let result = try await js("""
            const media = [...document.querySelectorAll('audio,video')].map(m => ({paused:m.paused, time:Math.round(m.currentTime*10)/10, duration:Number.isFinite(m.duration)?Math.round(m.duration):null, ready:m.readyState, error:m.error?.code ?? null}));
            const controls = allButtons(document).filter(e => /播放|暂停|下一|play|pause|next|登录|sign in|我的账户|my account/i.test(label(e))).map(e => ({label:label(e),enabled:enabled(e),rendered:rendered(e)})).slice(0,40);
            const menus = [...document.querySelectorAll('[role="menu"]')].map(e => ({rendered:rendered(e),items:allButtons(e).map(label).slice(0,20)}));
            return JSON.stringify({visibility:document.visibilityState, media, controls, menus, targetRows:target.length});
            """)
            note("网页遮罩=\(hidden)，媒体状态：\(result)")
        } catch { note("状态读取失败；请显示网页检查。") }
    }
    private func matches() async throws -> [Song] {
        var request = MusicLibraryRequest<Song>()
        request.filter(matching: \.title, equalTo: title)
        request.limit = 100
        let response = try await request.response()
        return response.items.filter { $0.title == title && $0.artistName == artist }
    }
    func captureBaseline() async {
        busy = true
        defer { busy = false }
        guard MusicAuthorization.currentStatus == .authorized else { note("没有现成的资料库读取授权，本验证页不会请求新权限。"); return }
        do {
            let songs = try await matches()
            baseline = Set(songs.map { $0.id.rawValue })
            baselineDate = Date()
            note("添加前基线：同名同艺人歌曲 \(songs.count) 首。\(songs.isEmpty ? "可以进行添加测试。" : "已有此曲，本次不执行添加。")")
        } catch { baseline = nil; note("基线读取失败：\((error as NSError).domain) / \((error as NSError).code)") }
    }
    func add() async {
        guard !busy else { return }
        guard !addSubmitted else { note("本次已提交过添加。请只读回验证，不重复写入。"); return }
        guard let baseline, baseline.isEmpty else { note("请先读取基线；只有资料库尚无此曲时才测试添加。"); return }
        busy = true
        defer { busy = false }
        do {
            let opened = try await js("""
            if([...document.querySelectorAll('[role="menu"]')].some(rendered)) return '请先在网页关闭已有菜单。';
            if(target.length !== 1) return '歌曲行不唯一或未找到，请打开《想自由》— 林宥嘉的专辑页。';
            const b = buttons(target[0]).filter(b => ['更多','More'].includes(label(b)));
            if(b.length !== 1) return '未找到歌曲的更多按钮。';
            b[0].click(); return 'opened';
            """)
            guard opened == "opened" else { note(opened); return }
            // Only inspect the menu opened for the exact target row; never retry a write.
            for _ in 0..<25 {
                try await Task.sleep(for: .milliseconds(200))
                let result = try await js("""
                const menus = [...document.querySelectorAll('[role="menu"]')].filter(rendered);
                if(menus.length !== 1) return 'waiting';
                const b = buttons(menus[0]).filter(b => ['添加到资料库','加入资料库','Add to Library'].includes(label(b)));
                if(b.length !== 1) return '该歌曲菜单没有唯一可用的添加入口，未执行添加。菜单项目：' + JSON.stringify(allButtons(menus[0]).map(e => ({label:label(e),enabled:enabled(e)})));
                b[0].click(); return '已点击添加到资料库。尚未确认成功，请点“读回验证”。';
                """)
                if result != "waiting" {
                    if result.hasPrefix("已点击添加") { addSubmitted = true }
                    note(result)
                    await inspect()
                    return
                }
            }
            note("等待 5 秒仍未出现可识别菜单，未点击添加；请展开网页核对。")
            await inspect()
        } catch { addSubmitted = true; note("操作中断，结果未知；先读回验证，勿重复添加。") }
    }
    func verify() async {
        busy = true
        defer { busy = false }
        guard let baseline, let baselineDate else { note("请先读取添加前基线。"); return }
        do {
            let songs = try await matches()
            let newSongs = songs.filter { !baseline.contains($0.id.rawValue) && ($0.libraryAddedDate ?? .distantPast) >= baselineDate.addingTimeInterval(-2) }
            note(newSongs.isEmpty ? "未读到新增记录，不能判定成功。云端同步可能有延迟；稍后可再次只读验证。" : "已读回新增的《想自由》— 林宥嘉，共 \(newSongs.count) 首（按标题、艺人、新资料库 ID 及添加时间确认；未核对 catalog ID）。")
        } catch { note("资料库读回失败：\((error as NSError).domain) / \((error as NSError).code)") }
    }
    func save() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "web-executor-test.txt"
        if panel.runModal() == .OK, let url = panel.url {
            do { try log.write(to: url, atomically: true, encoding: .utf8) }
            catch { note("无法保存报告。") }
        }
    }
}

struct ExecutorWebView: NSViewRepresentable {
    @ObservedObject var model: WebExecutor
    func makeNSView(context: Context) -> WKWebView { model.web }
    func updateNSView(_ view: WKWebView, context: Context) { view.isHidden = false }
}

struct WebExecutorView: View {
    @StateObject private var model = WebExecutor()
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("网页执行器 · 独立验证 v2").font(.title2)
            Text("在下方登录 Apple Music，搜索并打开《想自由》— 林宥嘉。先确认网页播放完整歌曲（不是 30 秒试听），再收起网页测试。登录状态独立于其他浏览器。")
            HStack {
                Toggle("收起网页（遮罩）", isOn: $model.hidden).toggleStyle(.switch)
                Button("播放测试歌曲") { Task { await model.control("song") } }
                Button("播放 / 暂停") { Task { await model.control("toggle") } }
                Button("网页下一首") { Task { await model.control("next") } }
                Button("读取媒体状态") { Task { await model.inspect() } }
                Button("重新载入") { model.web.reload() }
            }.disabled(model.busy)
            HStack {
                Button("① 读取添加前基线") { Task { await model.captureBaseline() } }
                Button("② ＋添加测试歌曲") { Task { await model.add() } }
                Button("③ 读回验证") { Task { await model.verify() } }
                Button("保存报告") { model.save() }
            }.disabled(model.busy)
            ScrollView { Text(model.log).font(.system(size: 11, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }.frame(height: 115)
            ZStack {
                ExecutorWebView(model: model)
                if model.hidden {
                    Color(nsColor: .windowBackgroundColor)
                    Text("网页已收起，布局仍保留。可以测试原生按钮；这不代表最小化或后台播放已通过。")
                        .padding()
                }
            }.frame(minHeight: 400)
        }.padding(16).frame(minWidth: 1020, minHeight: 730)
    }
}
