from pathlib import Path
p=Path('outputs/musickit-probe/DailyRecommendation.swift')
s=p.read_text()
s=s.replace('@Published var status = "选择范围后读取。资料库内容只会在你粘贴并发送给 ChatGPT 后传出。"','@Published var status = "首次使用请在账户连接中完成授权；之后点击一键推荐。"\n    @Published var workflow = false\n    @Published var fullPage = false\n    @Published var cardReady = false\n    @Published var connectionPanel = false\n    @Published var libraryAuthorized = MusicAuthorization.currentStatus == .authorized\n    private var generationTask: Task<Void, Never>?')
s=s.replace('此页面不会申请新权限。','请在账户连接中点击授权。')
s=s.replace('资料库内容只会在你粘贴并发送给 ChatGPT 后传出。','点击一键推荐会将所选歌曲发送给 ChatGPT。')
spot='    func reset() { songs = []; prompt = ""; scope = "" }'
methods='''    func authorizeLibrary() async {
        guard !workflow else { return }
        libraryAuthorized = await MusicAuthorization.request() == .authorized
        status = libraryAuthorized ? "音乐资料库已授权。" : "音乐资料库未授权；可在系统设置中检查本 App 的媒体与 Apple Music 权限，或导入已有 JSON。"
    }
    func openConnections() {
        connectionPanel = true
        showWeb = true
        fullPage = true
        browser.open()
        Task { try? await browser.action("restore") }
    }
    func showFullPage() {
        fullPage = true
        showWeb = true
        browser.open()
        Task { try? await browser.action("restore") }
    }
    func startRecommendation(usePrepared: Bool = false) {
        guard !workflow && !busy else { return }
        workflow = true; cardReady = false; fullPage = false; showWeb = true
        connectionPanel = false
        generationTask = Task {
            defer { workflow = false; generationTask = nil }
            if !usePrepared { await read() }
            guard !Task.isCancelled else { return }
            guard !prompt.isEmpty else { fullPage = true; return }
            browser.open()
            do {
                status = "正在准备 ChatGPT…"
                var ready = false
                for _ in 0..<45 {
                    try Task.checkCancellation()
                    if browser.web.url?.host == "chatgpt.com", !browser.web.isLoading,
                       let state = try? await browser.action("status"), (state["editorCount"] as? Int) == 1 {
                        ready = true; break
                    }
                    try await Task.sleep(for: .seconds(1))
                }
                guard ready else { status = "需要完成 ChatGPT 登录或处理页面验证。请在完整网页操作后重试。"; fullPage = true; return }
                let marker = "每日推荐请求编号：" + UUID().uuidString
                let prepared = try await browser.action("prepare", text: prompt + "\\n" + marker, marker: marker)
                guard prepared["state"] as? String == "prepared" else {
                    status = "未发送：\\(browser.explain(prepared["state"] as? String ?? "unknown"))"
                    fullPage = true; return
                }
                var clicked = false
                for _ in 0..<20 {
                    try Task.checkCancellation()
                    let result = try await browser.action("submit")
                    let state = result["state"] as? String
                    if state == "clicked" { clicked = true; break }
                    if state != "send-unavailable" { break }
                    try await Task.sleep(for: .milliseconds(300))
                }
                guard clicked else { status = "无法确认发送按钮可用，已保留请求草稿，请在网页检查。不会自动重试发送。"; fullPage = true; return }
                status = "已点击发送，等待 ChatGPT 确认并生成 Apple Music 卡片…"
                var stable = 0
                for _ in 0..<150 {
                    try await Task.sleep(for: .seconds(2))
                    try Task.checkCancellation()
                    let state = try await browser.action("result")
                    let acknowledged = state["acknowledged"] as? Bool == true
                    if acknowledged { status = "ChatGPT 已收到请求，正在等待 Apple Music 卡片…" }
                    if acknowledged && state["generating"] as? Bool == false && state["cards"] as? Int == 1 { stable += 1 } else { stable = 0 }
                    if stable >= 2 {
                        let result = try await browser.action("focusCard")
                        if result["state"] as? String == "card-focused" {
                            cardReady = true; fullPage = false
                            status = "已展示本次 Apple Music 卡片。可在卡片中试听并使用其保存入口。"
                            return
                        }
                    }
                }
                status = "尚未识别到本次完整卡片。可能需要连接 Apple Music、处理确认或手动打开卡片；请查看完整网页。不会重新发送请求。"
                fullPage = true
            } catch is CancellationError {
                status = "已停止本地等待。若请求已发送，ChatGPT 可能仍在生成；可显示完整网页查看。"
                fullPage = true
            } catch {
                status = "网页操作未完成，发送结果可能未知；请在完整网页核对，避免重复发送。"
                fullPage = true
            }
        }
    }
    func stopWaiting() { generationTask?.cancel() }
    func focusCard() async {
        do {
            let result = try await browser.action("focusCard")
            if result["state"] as? String == "card-focused" { fullPage = false; cardReady = true; status = "已切换为卡片视图。" }
            else { status = "没有识别到唯一的本次 Apple Music 卡片；请在完整网页打开卡片后再试。" }
        } catch { status = "切换失败，请保留完整网页查看。" }
    }
'''
s=s.replace(spot,methods+spot)
s=s.replace('status = "请求已复制。请在 ChatGPT 输入框按 ⌘V，选择 Apple Music 应用后发送。"','status = "请求已复制。请在 ChatGPT 输入框按 ⌘V，选择 Apple Music 应用后发送。"')
# Browser adapter API (DOM-only, main frame, ChatGPT host).
spot='    func open() { if web.url == nil { web.load(URLRequest(url: URL(string: "https://chatgpt.com/")!)) } }'
methods='''
    @discardableResult
    func action(_ name: String, text: String = "", marker: String = "") async throws -> [String: Any] {
        guard web.url?.host == "chatgpt.com", let resource = Bundle.main.url(forResource: "chat-adapter", withExtension: "js") else {
            throw NSError(domain: "DailyMusic.WebNotReady", code: 1)
        }
        let script = try String(contentsOf: resource, encoding: .utf8)
        _ = try await web.evaluateJavaScript(script)
        let result = try await web.callAsyncJavaScript(
            "return window.__dailyMusicDOMAdapter[action](text, marker);",
            arguments: ["action": name, "text": text, "marker": marker], in: nil, contentWorld: .page)
        return result as? [String: Any] ?? [:]
    }
    func explain(_ state: String) -> String {
        switch state {
        case "draft-exists": return "输入框已有草稿，未覆盖；请先处理原草稿。"
        case "generating": return "ChatGPT 正在生成其他回复，请等待完成。"
        case "fill-unconfirmed": return "无法确认请求完整填入，请手动检查输入框。"
        default: return "未找到可安全操作的输入框，请检查登录与页面状态。"
        }
    }
'''
s=s.replace(spot,spot+methods)
# Replace UI only; persistent web always mounted during a run, overlaid while waiting.
s=s[:s.index('struct DailyRecommendationView: View {')]+'''struct DailyRecommendationView: View {
    @StateObject private var model = DailyRecommendation()
    @State private var advanced = false
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading) {
                    Text("每日音乐发现").font(.largeTitle.bold())
                    Text("最近的收藏，下一首喜欢的歌。").foregroundStyle(.secondary)
                }
                Spacer()
                Button("账户连接与授权") { model.openConnections() }.disabled(model.workflow)
                Menu("更多") {
                    Button("查看请求与导入") { advanced.toggle() }
                    Button("显示完整网页") { model.showFullPage() }
                    Button("仅显示 Apple Music 卡片") { Task { await model.focusCard() } }
                    Button("在系统浏览器打开") { NSWorkspace.shared.open(model.browser.web.url ?? URL(string: "https://chatgpt.com/")!) }
                }
            }
            if model.connectionPanel {
                GroupBox("账户连接") {
                    HStack(alignment: .top, spacing: 24) {
                        VStack(alignment: .leading) {
                            Text("1. 音乐资料库").bold()
                            Text(model.libraryAuthorized ? "已授权本机读取" : "尚未授权").font(.caption)
                            Button(model.libraryAuthorized ? "检查资料库授权" : "授权音乐资料库") { Task { await model.authorizeLibrary() } }
                        }
                        VStack(alignment: .leading) {
                            Text("2. ChatGPT 与 Apple Music").bold()
                            Text("在下方网页登录 ChatGPT，并连接 Apple Music 应用。网页中的登录及授权由你完成。").font(.caption)
                            Button("完成连接，返回推荐") { model.connectionPanel = false; model.fullPage = false }
                        }
                        Spacer()
                    }.padding(8)
                }
            }
            HStack {
                Toggle("按添加日期筛选", isOn: $model.byDate)
                if model.byDate {
                    DatePicker("从", selection: $model.start, displayedComponents: .date)
                    DatePicker("至", selection: $model.end, displayedComponents: .date)
                }
                Stepper("最近最多 \\(model.count) 首", value: $model.count, in: 10...500, step: 10)
                Spacer()
                Button("一键推荐") { model.startRecommendation() }.buttonStyle(.borderedProminent)
            }.disabled(model.busy || model.workflow)
            HStack {
                Text(model.status).textSelection(.enabled).font(.callout)
                Spacer()
                if model.workflow { Button("停止等待") { model.stopWaiting() } }
            }
            if advanced {
                GroupBox("请求与手动备用入口") {
                    VStack(alignment: .leading) {
                        HStack {
                            Button("只读取预览") { Task { await model.read() } }
                            Button("导入已有 JSON") { model.importJSON() }
                            Button("发送当前预览") { model.startRecommendation(usePrepared: true) }.disabled(model.prompt.isEmpty)
                            Button("复制请求") { model.copy() }.disabled(model.prompt.isEmpty)
                            Button("保存请求") { model.save() }.disabled(model.prompt.isEmpty)
                        }.disabled(model.busy || model.workflow)
                        ScrollView { Text(model.prompt.isEmpty ? "尚未生成请求" : model.prompt).font(.caption).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }.frame(height: 120)
                    }.padding(6)
                }
            }
            ZStack {
                // Keep the same WKWebView alive and laid out; no hiding or reparenting of the iframe.
                ChatWebView(browser: model.browser)
                if !model.fullPage && !model.cardReady {
                    Color(nsColor: .windowBackgroundColor)
                    VStack(spacing: 16) {
                        if model.workflow { ProgressView(); Text("正在为你挑选 10 首歌…") }
                        else { Image(systemName: "music.note.list").font(.system(size: 48)).foregroundStyle(.secondary); Text("完成账户连接后，点击一键推荐") }
                        Text(model.workflow ? "完成后自动显示 Apple Music 卡片" : "歌曲卡片将显示在这里").foregroundStyle(.secondary)
                        if model.workflow { Button("显示网页处理登录或确认") { model.showFullPage() } }
                    }
                }
            }.frame(minHeight: 360)
            Text("点击一键推荐，会读取所选范围并将歌曲信息发送给 ChatGPT。试听、添加和创建歌单仍由你在 Apple Music 卡片中操作。")
                .font(.caption).foregroundStyle(.secondary)
        }.padding(20).frame(minWidth: 1100, minHeight: 760)
    }
}
'''
p.write_text(s)
# Main app becomes one focused flow; preserve probe source separately for diagnostics.
p=Path('outputs/musickit-probe/Probe.swift');s=p.read_text();s=s[:s.index('@main')]+'''@main
struct MusicKitProbeApp: App {
    var body: some Scene {
        WindowGroup("每日音乐发现") { DailyRecommendationView() }
    }
}
''';p.write_text(s)
