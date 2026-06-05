# Codex 桌面版原生菜单本地化尝试记录

## 背景

Codex 桌面版（Windows MSIX 安装）的顶部菜单栏：

- 菜单标题显示中文（文件、编辑、查看、窗口、帮助）
- 子菜单项显示英文（Undo、Cut、Copy、Settings 等）

用户希望在未完全汉化的子菜单项旁有中文对照。

---

## 技术分析

### Codex 架构

Codex 是一个 Electron 应用，以 MSIX 包形式分发，安装在 C:\Program Files\WindowsApps\ 下。

应用核心文件：

| 文件 | 说明 |
|------|------|
| pp.asar | Electron 应用打包文件（约 159MB） |
| pp/locales/zh-CN.pak | Chromium 区域设置包 |
| pp/resources/app.asar | 应用代码归档 |

pp.asar 内主要 JS 文件：

| 路径 | 大小 | 说明 |
|------|------|------|
| .vite/build/main-DoPqcYPN.js | 1.26 MB | Electron 主进程代码，包含原生菜单构建 |
| .vite/build/app-session-DpDFpgD2.js | 4.45 MB | 渲染进程/会话代码 |

### 菜单构建机制

菜单由 main-DoPqcYPN.js 中的 RW 函数构建（从源码提取）：

`
function RW({buildFlavor, isMacOS, ...}) {
    // y() 函数：根据 commandId 通过 formatMessage 获取菜单标签
    y = (e, n) => {
        let r = t.Dn({commandId: e});
        return {
            label: t.F().formatMessage({
                messageId: r.menuTitleIntlId,
                defaultMessage: r.menuTitle    // ← 英文回退
            }),
            accelerator: t.Sn({commandId: e, isMacOS: i})...
        }
    };
    
    // 菜单位项通过 y() 或直接 label 创建
    b = { ...y(\settings\), click: ... };         // "设置"
    x = { ...y(\
ewThread\), click: ... };         // "新建对话"
    Ke = { label: \File\, ... };                   // "文件"（菜单标题）
    Je = { label: \View\, ... };                   // "查看"
    _e = { label: \Log Out\, ... };               // "退出登录"
    // ... 约 50+ 个菜单位项
}
`

### 为什么子菜单是英文

1. 菜单标题（文件、编辑、查看、窗口、帮助）中，**编辑/窗口/帮助**通过 Electron 内置 ole 自动翻译，**文件/查看**通过代码中的 label: \File\` 硬编码英文
2. 子菜单项使用 ormatMessage({defaultMessage: r.menuTitle})，当 localeOverride = "zh-CN" 但没有对应中文翻译时，回退到英文 defaultMessage
3. 用户 config.toml 中的 localeOverride = "zh-CN" 仅影响 Computer Use 配置，不影响原生菜单区域设置

---

## 尝试方案

### 方案一：--lang=zh-CN 启动参数（失败）

尝试以 Electron 参数启动 Codex，强制使用中文区域设置。

`powershell
start shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App --lang=zh-CN
`

**结果**：MSIX 应用启动参数传递机制不兼容，--lang 参数未生效。

### 方案二：asar 代码补丁（开始成功，最终失败）

将 pp.asar 解压 → 修改主进程 JS → 重新打包 → 替换原文件。

#### 成功部分

从 main-DoPqcYPN.js 的 RW 函数中识别出 50+ 个英文菜单标签，全部替换为中文：

| 原标签 | 替换为 |
|--------|--------|
| File | 文件 |
| View | 查看 |
| Settings | 设置 |
| New Chat | 新建对话 |
| Log Out | 退出登录 |
| Zoom In | 放大 |
| … | … |

替换方式：对 y(commandId) 调用点添加 label: '中文' 覆盖属性；对硬编码 label: 直接替换字符串。

补丁工具链：

`
npm install @electron/asar
asar.extractFile(asar, path)  // 提取单文件
asar.createPackage(dir, asar)  // 从目录创建 asar
`

#### 踩坑记录

| # | 错误 | 原因 | 教训 |
|---|------|------|------|
| 1 | extractFile 找不到文件 | 路径分隔符问题：/ vs \\，@electron/asar 在 Windows 上用 path.sep 即 \\ | Windows 下必须用反斜杠路径 |
| 2 | listPackage 返回带前导 \\ 的路径 | path.join('/', '.vite') 在 Windows 生成了 \\.vite | 使用前需 .substring(1) 去除前导反斜杠 |
| 3 | createPackage 异步未 await | createPackage 是 sync function，不 await 直接返回 Promise | 检查 API 同步/异步，wait 或 .then() |
| 4 | s.rmSync(path, { force: true }) 仍抛出 ENOENT | Node v24 上 orce 选项对 ENOENT 处理不一致 | 改用 if (existsSync(path)) rmSync(path) |
| 5 | EPERM: operation not permitted, copyfile 写入 WindowsApps | WindowsApps 目录有特殊 ACL，管理员也无法直接写入 | 永远不要假设管理员能写入 C:\Program Files\WindowsApps |
| 6 | 删除原 asar 后写入失败 → asar 丢失 | 先 mSync 删除了原文件，然后 copyFileSync 写入失败 | 写入前不应删除原文件，应写入临时位置再 rename |
| 7 | 备份恢复也失败 | 同样因为 WindowsApps ACL 限制 | 恢复也需要管理员权限和额外步骤（takeown / icacls） |

---

## 最终结论

**WindowsApps 目录的写保护比预期严格**。即使以管理员身份运行，copyFileSync 写入 pp.asar 也会被 EPERM 拒绝删除后重建。

可行路径应该改走：
- **Electron 应用层**：若能注入 preload 脚本，可在运行时修改 Menu.setApplicationMenu 的行为
- **插件机制**：Codex 的插件系统（运行在渲染进程）能否通过 IPC 修改主进程菜单
- **区域设置覆盖**：寻找 Electron pp.setLocale() 的注入点
- **行为性方案**：不修改文件，直接提供翻译对照表供用户查阅

---

## 快速恢复

用户已重新安装 Codex 以恢复至初始状态。

清理残留补丁文件：

`powershell
Remove-Item _extracted -Recurse -Force
Remove-Item _tmp_asar -Recurse -Force
Remove-Item app.asar.bak, patch-menu-zhCN.js, restore-cn.bat -Force
`

