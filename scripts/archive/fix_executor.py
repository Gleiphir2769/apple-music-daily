from pathlib import Path
p=Path('src/WebExecutor.swift')
s=p.read_text().replace('尚未验证。请在下方','验证器 v2：收起网页使用遮罩，保留网页布局；不等同于后台运行。请在下方')
s=s.replace('private var baselineDate: Date?', 'private var baselineDate: Date?\n    private var addSubmitted = false')
s=s.replace("const label = e => (e.getAttribute('aria-label') || e.innerText || '').trim();\n          const available = e => !e.disabled && e.getAttribute('aria-hidden') !== 'true' && e.getClientRects().length > 0;\n          const buttons = root => [...root.querySelectorAll('button,[role=\"button\"]')].filter(available);", """const label = e => (e.getAttribute('aria-label') ||
            (e.getAttribute('aria-labelledby') || '').split(/\\\\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
            e.innerText || e.textContent || e.getAttribute('title') || '').trim();
          const rendered = e => !e.closest('[hidden],[aria-hidden="true"]') && e.getClientRects().length > 0 &&
            getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
          const enabled = e => !e.disabled && e.getAttribute('aria-disabled') !== 'true';
          const available = e => rendered(e) && enabled(e);
          const allButtons = root => [...root.querySelectorAll('button,[role="button"],[role="menuitem"]')];
          const buttons = root => allButtons(root).filter(available);""")
s=s.replace('busy = true\n        defer { busy = false }\n        do {\n            let result: String', 'guard !busy else { return }\n        busy = true\n        defer { busy = false }\n        do {\n            let result: String',1)
s=s.replace("const b = buttons(document).filter(b => \\(labels).includes(label(b)));\n                if(b.length !== 1) return '未找到唯一且可用的播放器按钮；请显示网页检查。';", """const matches = allButtons(document).filter(b => \\(labels).includes(label(b)));
                const b = matches.filter(available);
                if(b.length !== 1) return '播放器按钮不可操作：' + JSON.stringify(matches.map(e => ({label:label(e),enabled:enabled(e),rendered:rendered(e)}))) + '；可用匹配数=' + b.length + '。试听可能没有下一首队列；请展开网页核对。';""")
s=s.replace('note(result)\n        } catch { note("网页控制失败', 'note(result)\n            try await Task.sleep(for: .milliseconds(400))\n            await inspect()\n        } catch { note("网页控制失败',1)
s=s.replace("const controls = buttons(document).map(label).filter(s => ['播放','暂停','下一首','Play','Pause','Next','登录','Sign In'].includes(s));", """const controls = allButtons(document).filter(e => ['播放','暂停','下一首','Play','Pause','Next','登录','Sign In','我的账户','My Account'].includes(label(e))).map(e => ({label:label(e),enabled:enabled(e),rendered:rendered(e)}));
            const menus = [...document.querySelectorAll('[role="menu"]')].map(e => ({rendered:rendered(e),items:allButtons(e).map(label).slice(0,20)}));""")
s=s.replace('media, controls, targetRows:target.length','media, controls, menus, targetRows:target.length')
s=s.replace('网页隐藏=\\(hidden)', '网页遮罩=\\(hidden)')
s=s.replace('guard await MusicAuthorization.request() == .authorized else { note("没有资料库读取授权。"); return }', 'guard MusicAuthorization.currentStatus == .authorized else { note("没有现成的资料库读取授权，本验证页不会请求新权限。"); return }')
s=s.replace('baselineDate = Date()','baselineDate = Date()')
s=s.replace('func add() async {\n        guard let baseline', 'func add() async {\n        guard !busy else { return }\n        guard !addSubmitted else { note("本次已提交过添加。请只读回验证，不重复写入。"); return }\n        guard let baseline')
s=s.replace("if(document.querySelector('[role=\"menu\"]'))", "if([...document.querySelectorAll('[role=\"menu\"]')].some(rendered))")
s=s.replace('for _ in 0..<10', 'for _ in 0..<25')
s=s.replace("const menus = [...document.querySelectorAll('[role=\"menu\"]')].filter(available);", "const menus = [...document.querySelectorAll('[role=\"menu\"]')].filter(rendered);")
s=s.replace("if(b.length !== 1) return '该歌曲菜单没有添加入口；可能涉及账户订阅、地区或页面状态。未执行添加。';", "if(b.length !== 1) return '该歌曲菜单没有唯一可用的添加入口，未执行添加。菜单项目：' + JSON.stringify(allButtons(menus[0]).map(e => ({label:label(e),enabled:enabled(e)}))); ")
s=s.replace('if result != "waiting" { note(result); return }', 'if result != "waiting" {\n                    if result.hasPrefix("已点击添加") { addSubmitted = true }\n                    note(result)\n                    await inspect()\n                    return\n                }')
s=s.replace('note("未出现可识别菜单，停止；请显示网页检查。")', 'note("等待 5 秒仍未出现可识别菜单，未点击添加；请展开网页核对。")\n            await inspect()')
s=s.replace('} catch { note("操作中断，结果未知；先读回验证，勿重复添加。") }', '} catch { addSubmitted = true; note("操作中断，结果未知；先读回验证，勿重复添加。") }')
s=s.replace('view.isHidden = model.hidden', 'view.isHidden = false')
s=s.replace('网页执行器 · 独立验证', '网页执行器 · 独立验证 v2')
s=s.replace('先在网页播放完整歌曲，再隐藏网页测试控制。', '先确认网页播放完整歌曲（不是 30 秒试听），再收起网页测试。')
s=s.replace('Toggle("隐藏网页"', 'Toggle("收起网页（遮罩）"')
s=s.replace('Button("下一首")', 'Button("网页下一首")')
s=s.replace('''                Text("网页已隐藏，实例仍保留。间隔数秒读取两次状态，检查播放时间是否增长。")
                ExecutorWebView(model: model)''', '''                ExecutorWebView(model: model)
                if model.hidden {
                    Color(nsColor: .windowBackgroundColor)
                    Text("网页已收起，布局仍保留。可以测试原生按钮；这不代表最小化或后台播放已通过。")
                        .padding()
                }''')
p.write_text(s)
