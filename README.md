# NEBULA Player

深空黑科技风 AI 本地音乐播放器（Electron + React + TypeScript）。

核心能力：本地曲库扫描与播放（MP3/WAV/FLAC/AAC/APE/OGG）、四维分类与全局搜索、歌单与收藏、
系统托盘与进度记忆，以及通过 OpenAI 兼容大模型 API 实现的 **自然语言播放指令** 与 **音乐主题对话**。

## 功能一览

- **曲库**：批量扫描文件夹/拖拽导入；自动读取标签（标题/歌手/专辑/时长/曲风/年份/内嵌封面）；
  按歌曲、歌手、专辑、本地文件夹四维浏览；模糊搜索（歌名/歌手/专辑/曲风）
- **播放**：播放/暂停/上一曲/下一曲、渐变流光进度条与拖拽跳转、音量平滑无爆音、
  列表循环/单曲循环/随机播放、进度记忆（重启继续上次位置）、错误自动跳过
- **APE/AAC 支持**：内置 ffmpeg，APE 自动转码为 WAV（带缓存）、AAC(ADTS) 无损重封装为 M4A
- **歌单**：创建/重命名/删除、添加到歌单、收藏标记、所见即所得
- **桌面**：无边框深空黑玻璃拟态 UI、粒子背景、实时频谱、系统托盘（播放控制）、关闭最小化到托盘、窗口置顶、媒体键（可开关）
- **AI**：常驻聊天框（可收起/展开），大模型函数调用直达播放器：
  「播放本地的《xxx》」「暂停播放」「音量调到 50%」「切换成随机播放」「创建一个叫 x 的歌单」等；
  支持音乐知识问答与闲聊；聊天记录本地持久化；API Key 经系统安全存储（DPAPI/Keychain）加密保存。
  API 仅 AI 功能联网，本地播放完全离线。

## 快速开始

```bash
npm install
npm run dev
```

> 中国大陆网络下安装若遇 GitHub 下载缓慢/失败，先设置镜像再安装：
>
> ```powershell
> $env:ELECTRON_MIRROR="https://cdn.npmmirror.com/binaries/electron/"
> npm install
> node node_modules\electron\install.js
> ```

首次使用：点击「添加音乐」选择本地文件夹 → 双击歌曲播放 → 打开「设置 → AI 配置」填入
接口地址（OpenAI 兼容 Chat Completions，如 `https://api.deepseek.com/v1`）、API Key、模型名称 → 测试连接。

## 打包

```bash
npm run icons     # 从 build/icon.svg 生成图标（可选）
npm run build:win # Windows NSIS 安装包 → dist/nebula-player-1.0.0-setup.exe
npm run build:mac # macOS dmg（需在 macOS 上构建）
```

中国大陆打包镜像（构建期同样被 GitHub 阻断时）：

```powershell
$env:ELECTRON_MIRROR="https://cdn.npmmirror.com/binaries/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://registry.npmmirror.com/-/binary/electron-builder-binaries/"
npm run build:win
```

## 技术要点

- `media://` 自定义协议 + 手动 Range 支持（`src/main/protocol.ts`）→ 任意本地音频可拖拽跳转
- Web Audio 图谱：`<audio>` → AnalyserNode（频谱）→ GainNode（音量平滑）→ 输出
- 主进程持有 LLM 请求与密钥解密；渲染进程仅通过 IPC 桥（`window.api`）交互
- 数据全部落在 userData：`library.json` / `playlists.json` / `chat.json` / `settings.json`（密钥加密）
- 零原生依赖（ffmpeg 为独立二进制），`npmRebuild: false`
- 音频健壮性：Web Audio 图谱仅在实际播放时创建；若环境使图谱静默（音频线程受限/设备不可用），
  检测到后自动切换为直连播放（`audioEngine` 的 fallback），保证出声音优先、频谱次之

## 测试

```bash
npm run typecheck  # TS 严格检查
npm test           # vitest 单元测试
node scripts/e2e.mjs scan|play|playlists|chat|ai|clean  # 需先 npm run dev（CDP 9222 端口）
```

## 目录结构

```
src/main/       主进程：扫描/元数据/转码/LLM 客户端/托盘/协议/IPC
src/preload/    桥接层 window.api
src/renderer/   React UI：stores(zustand) + components + styles
src/shared/     主进程与渲染进程共享类型
scripts/        图标生成、E2E 驱动、Mock LLM 服务器
```

## 已知边界

- 曲库按 ≤2 万首设计（JSON 持久化 + 内存索引）；更大规模可迁移 SQLite
- macOS 包需在 macOS 上构建（配置已就绪）
- 仅适配系统默认音频输出设备
