# tranSSlater · Android

本目录是独立 Android 工程，使用 Tauri 2、Rust、SQLite 和 TypeScript。桌面工程在上一级目录。

## 保留的功能

- Google、有道词典、有道翻译三个引擎，以及词典、例句、音频、翻译缓存。
- 无上限本地历史库：保存完整翻译结果，不按日期或条数自动清理。分页、搜索、历史回填、单条删除和主动清空保留。
- CSV、Markdown、Anki、完整 JSON 全量导出；导出不受当前搜索条件或已加载分页影响。
- 简约与远点两个皮肤、四档字号、设置和单词礼炮。
- 自动中英互译：中文译为英文，英文及其它语言译为中文；手动语言对优先。
- 有道两个入口自动分流：单词查词典，句段直接翻译；缓存使用实际引擎和方向，两个入口可复用缓存。
- 拼写纠正与模糊查词：`translateor` 显示 `translator`、`translation` 及简释，点选后查询完整词条。保留原输入，候选本身不记入历史，也不自动朗读。
- 有道的数字/字符串错误码及空译文校验；失败不写入缓存和历史。结果标签显示实际方向，互换按实际目标语言执行。
- Android 系统选词翻译、分享文本、从文件管理器打开或分享文本文件；已打开应用和冷启动均接收一次并立即翻译。

Windows 鼠标钩子、悬浮图标与资源管理器右键菜单在 Android 上分别由选词菜单、系统分享和文本文件打开入口替代。窗口尺寸预设、最大化及 Windows PDF/UI Automation 修复属于桌面系统能力；Android 保留触屏、安全区和键盘适配，不调用桌面窗口 API。旧窗口设置字段仅用于兼容数据。

本次已同步桌面提交 `7ba48f2` 的全部共享翻译和界面更新；礼炮与词典板块渲染也与桌面一致，Android 的文档导出和历史持久化测试保留。同步前源码备份位于 `test-results/before-desktop-sync.zip`。

## 外部选词与文件

在支持系统选词操作的应用中长按选中文字，在扩展菜单选择 **tranSSlater**；若阅读器未提供该菜单，可用“分享 → tranSSlater”。PDF 先在阅读器选出文字再分享。应用只读取收到的文字，不回写源选区，也不会在本应用内选中或删除文本时自动抢焦点。

文本文件支持 Android 授权的 `content://` 文档，最多 512 KB，编码兼容 UTF-8、UTF-8 BOM、UTF-16 LE/BE BOM 与 GBK，最多取 5000 个 Unicode 字符，不截断代理对。读取失败会保留原输入并显示原因。无需申请悬浮窗、无障碍或广泛存储权限。

入口实现位于 `src-tauri/gen/android/app/src/main/java/com/transslater/app/ExternalInputPlugin.kt` 和 Android Manifest；重新生成整个 Android 工程时需保留这些定制源文件。

## 构建

首次安装依赖、复制本机工具配置：

```powershell
npm ci
Copy-Item tools.example.json tools.local.json
# 在 tools.local.json 中配置 SDK、JDK、Rust、Node、MSVC 和缓存位置
```

构建 arm64 Release 安装包：

```powershell
npm run android:build
```

主入口 `scripts/android.ps1` 兼容 Windows PowerShell 5.1，并初始化宿主 MSVC 与目标 NDK 环境。使用本机已安装的 Android Rust 标准库，无需 rustup。

Gradle 不会自动采用 Windows 系统代理。需要代理访问依赖仓库时，在 `tools.local.json` 设置 `gradleProxyHost` 和 `gradleProxyPort`；它们仅用于构建。项目使用本机缓存的 Gradle 9.7.0。

Windows 未开放符号链接时，脚本只在原生编译成功、明确遇到符号链接权限错误后复制生成的 `.so`，再用 Gradle 组装 arm64 APK。编译错误不会被这个分支忽略。默认构建 arm64；其他 ABI 需安装对应工具链并允许 Tauri 所需的符号链接。

安装包输出：`artifacts/tranSSlater-arm64.apk`。要求 Android 7.0 / API 24 及以上，arm64-v8a。

脚本使用本地发布证书签名并调用 `apksigner verify`。`signing/` 中的密钥和密码不纳入版本控制；请保留并备份，后续使用同一证书才能覆盖升级并保留应用数据。

```powershell
adb install -r artifacts/tranSSlater-arm64.apk
```

## 历史与导出

SQLite `history.db` 和 `settings.json` 位于 Android 应用私有目录，实际位置可从「说明 → 数据位置」查看。覆盖升级保留数据。主动清空、系统清除应用数据或卸载会移除历史。

点击「历史 → 导出」，通过 Android 系统文件选择器选择保存位置。Rust 使用 Android `content://` 文档描述符流式写入全部记录，无需读取整个数据库到内存，也无需广泛存储权限。取消文件选择不会写入导出文件。JSON 保存完整词典与翻译结果，适合备份。

桌面端重命名保持原应用标识，因此既有 Windows 设置和历史仍使用原数据目录。两个平台的数据库各自独立。

## 图标与界面

`app-icon.png` 是 1024px 母版：深底、A／文字形与蓝、橄榄、金、橙四段彩虹条。Android 启动器使用安全区内的前景、纯色背景及圆形资源，生成 Gradle 工程后脚本自动同步图标。

`src/mobile.css` 提供安全区、动态视口、44px 触控区域、窄屏菜单、历史抽屉和设置布局。设计及验证记录见 `design/index.html`。

## 验证

```powershell
npm run build
npm run test:rust
npm run test:native
# 先运行 npm run dev -- --port 1426，再在另一终端执行：
npm run test:ui
# 真实有道接口检查：
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 -Action smoke -TestFilter live_youdao_spelling_suggestions
```

本工程 `scripts/test-ui.mjs` 使用 Edge Chromium 触屏模拟与本地 IPC 测试数据，覆盖 320px、390px、横屏与平板视口，以及最大字号、候选词点选、冷/热启动外部输入、重复信号、失败保留输入、历史分页与全量导出。它验证布局和前端交互，不替代实际 Android 设备验证。原生 JVM 测试覆盖文本编码、大小限制、二进制拒绝和 Unicode 截断；Rust 历史测试验证 1,205 条记录在关闭并重开数据库后完整保留，并可全量遍历导出。

Google 在大陆通常需要代理，有道引擎支持直连。引擎仍使用原项目的公开接口。
