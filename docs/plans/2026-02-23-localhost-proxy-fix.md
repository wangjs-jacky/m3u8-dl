# 本地通信代理问题修复方案

> 创建时间: 2026-02-23
> 状态: ✅ 已完成
> 影响范围: Tauri Sidecar、后端服务器、断点续传

## 一、问题描述

### 1.1 现象
1. **服务器卡死** - 后端服务突然无响应，无法通过 API 获取状态
2. **暂停后恢复失败** - 点击恢复按钮没有反应，断点续传不工作
3. **元数据不同步** - 暂停后元数据与实际下载文件数量不一致

### 1.2 根本原因

#### 原因 A: 系统代理干扰
用户系统配置了代理 (`socks5h://127.0.0.1:10888`)，导致：
- Sidecar 脚本中 `curl http://localhost:15151` 请求被代理转发
- 代理无法处理 localhost 请求，导致检测失败
- Sidecar 无法正确判断服务器是否已运行

#### 原因 B: pause() 方法未保存元数据
```typescript
// 原代码 - 暂停时不保存元数据
pause(): void {
  this.paused = true;
  this.pausePromise = new Promise(resolve => {
    this.pauseResolve = resolve;
  });
  // 缺少 this.saveMeta() 调用
}
```

## 二、解决方案

### 2.1 方案对比

| 方案 | 描述 | 优点 | 缺点 | 推荐度 |
|------|------|------|------|--------|
| curl --noproxy | 每次请求加参数 | 简单直接 | 需要修改多处 | ⭐⭐ |
| NO_PROXY 环境变量 | 在脚本中设置 | 统一生效 | 需要在每个脚本中添加 | ⭐⭐⭐ |
| **Rust 端设置环境变量** | 启动 Sidecar 时设置 | 集中管理、自动继承 | 需要修改 Rust 代码 | ⭐⭐⭐⭐⭐ |
| Unix Domain Socket | 使用 UDS 通信 | 不走网络栈、无代理问题 | 跨平台复杂、需重构 | ⭐⭐⭐ |

### 2.2 最终方案：Rust 端设置环境变量

**修改文件**: `apps/desktop/src-tauri/src/main.rs`

```rust
.use(tauri_plugin_shell::ShellExt;

// 在 setup 中
let mut sidecar_command = shell
    .sidecar("m3u8-server")
    .expect("failed to create sidecar command");

// 设置环境变量，禁用 localhost 请求的代理
sidecar_command = sidecar_command.env("NO_PROXY", "localhost,127.0.0.1");

let (mut rx, _child) = sidecar_command
    .spawn()
    .expect("Failed to spawn sidecar");

// 监听 Sidecar 输出（调试用）
tauri::async_runtime::spawn(async move {
    use tauri_plugin_shell::process::CommandEvent::*;
    while let Some(event) = rx.recv().await {
        match event {
            Stdout(line) => println!("[Sidecar stdout] {}", String::from_utf8_lossy(&line)),
            Stderr(line) => eprintln!("[Sidecar stderr] {}", String::from_utf8_lossy(&line)),
            Error(err) => eprintln!("[Sidecar error] {}", err),
            Terminated(payload) => {
                println!("[Sidecar] terminated with code: {:?}", payload.code);
                break;
            }
            _ => {}
        }
    }
});
```

### 2.3 修复 pause() 方法

**修改文件**: `packages/m3u8-dl/src/downloader.ts`

```typescript
pause(): void {
  if (this.paused) {
    return; // 防止重复暂停
  }
  this.paused = true;
  this.pausePromise = new Promise(resolve => {
    this.pauseResolve = resolve;
  });
  // 暂停时保存元数据，确保断点续传数据一致
  this.saveMeta();
  console.log(`[${this.id}] 已暂停，元数据已保存`);
}
```

## 三、修改清单

### 3.1 核心修改

| 文件 | 修改内容 | 状态 |
|------|----------|------|
| `apps/desktop/src-tauri/src/main.rs` | 添加 NO_PROXY 环境变量 + Sidecar 日志监听 | ✅ |
| `packages/m3u8-dl/src/downloader.ts` | pause() 方法添加 saveMeta() 调用 | ✅ |
| `packages/m3u8-dl/dist/*` | 重新编译后的产物 | ✅ |

### 3.2 Sidecar 脚本简化

| 文件 | 修改内容 | 状态 |
|------|----------|------|
| `binaries/m3u8-server-aarch64-apple-darwin` | 移除手动代理处理，使用相对路径 | ✅ |
| `binaries/m3u8-server-x86_64-apple-darwin` | 移除手动代理处理，使用相对路径 | ✅ |

## 四、架构说明

### 4.1 当前通信架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Tauri Desktop App                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     HTTP      ┌─────────────────────────┐  │
│  │   前端      │ ──────────────▶│  Node.js Server         │  │
│  │  (React)    │ ◀──────────────│  (localhost:15151)      │  │
│  └─────────────┘                └─────────────────────────┘  │
│        │                                ▲                     │
│        │ Tauri IPC                      │ spawn + env         │
│        ▼                                │                     │
│  ┌─────────────┐                        │                     │
│  │ Rust 后端   │────────────────────────┘                     │
│  │ (main.rs)   │  NO_PROXY=localhost,127.0.0.1               │
│  └─────────────┘                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 环境变量继承链

```
Tauri App (Rust)
    │
    │ .env("NO_PROXY", "localhost,127.0.0.1")
    ▼
Sidecar Script (bash)
    │
    │ 自动继承
    ▼
Node.js Server (ts-node)
    │
    │ 自动继承
    ▼
所有 HTTP 请求 (curl, fetch, axios)
```

## 五、验证步骤

### 5.1 功能验证

```bash
# 1. 启动应用
cd apps/desktop
npm run tauri:dev

# 2. 检查 Sidecar 日志（应在终端看到）
# [Sidecar stdout] Backend server already running on port 15151
# 或
# [Sidecar stdout] Starting backend server...

# 3. 测试 API（即使系统有代理）
curl http://localhost:15151/api/downloads

# 4. 测试暂停/恢复
# - 启动下载
# - 点击暂停
# - 检查元数据文件是否更新
# - 点击恢复
# - 确认下载继续
```

### 5.2 断点续传验证

```bash
# 检查元数据与实际文件是否同步
python3 << 'EOF'
import json, os
temp_dir = "/Users/jiashengwang/Downloads/videos/.temp_segments_dl_5"
meta = json.load(open(f"{temp_dir}/task_meta.json"))
actual = len([f for f in os.listdir(f"{temp_dir}/chunks") if f.endswith('.ts')])
recorded = len(meta['downloadedSegments'])
print(f"元数据记录: {recorded}")
print(f"实际文件: {actual}")
print(f"差异: {actual - recorded}")
EOF
```

## 六、后续优化建议

### 6.1 短期（可选）
- [ ] 添加健康检查 API，前端定期检测后端状态
- [ ] 前端添加连接失败提示

### 6.2 中期（建议）
- [ ] 使用 Unix Domain Socket 替代 HTTP（macOS/Linux）
- [ ] Windows 使用 Named Pipe
- [ ] 统一通信层抽象

### 6.3 长期（架构重构）
- [ ] 将核心下载逻辑迁移到 Rust
- [ ] 前端通过 Tauri IPC 与 Rust 通信
- [ ] Node.js 仅作为可选的独立服务器

## 七、相关文档

- [Tauri Shell Plugin](https://tauri.app/v2/api/shell/)
- [NO_PROXY 环境变量规范](https://www.gnu.org/software/wget/manual/html_node/Proxies.html)
- [Unix Domain Socket](https://man7.org/linux/man-pages/man7/unix.7.html)

## 八、变更历史

| 日期 | 版本 | 描述 |
|------|------|------|
| 2026-02-23 | 1.0 | 初始方案，修复代理问题和断点续传 |
