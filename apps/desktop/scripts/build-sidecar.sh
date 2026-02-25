#!/bin/bash

# 构建 m3u8-dl 并打包为 Sidecar
# 获取脚本所在目录的真实路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# 从 apps/desktop/scripts 获取到项目根目录 (需要向上三级)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 再次向上到真正的项目根目录
PROJECT_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"

# m3u8-dl 目录
M3U8_DL_DIR="$PROJECT_ROOT/packages/m3u8-dl"
# desktop 应用目录
DESKTOP_DIR="$PROJECT_ROOT/apps/desktop"

echo "[build-sidecar] 项目根目录: $PROJECT_ROOT"
echo "[build-sidecar] desktop 目录: $DESKTOP_DIR"
echo "[build-sidecar] m3u8-dl 目录: $M3U8_DL_DIR"

cd "$M3U8_DL_DIR"
echo "[build-sidecar] 正在编译 m3u8-dl..."
npm run build

# 创建 sidecar 目录
mkdir -p "$DESKTOP_DIR/src-tauri/binaries"

# 复制编译后的文件
echo "[build-sidecar] 复制 dist 文件..."
cp -r dist "$DESKTOP_DIR/src-tauri/binaries/m3u8-server-dist"

# 创建启动脚本（使用 npm link 方式，调用全局安装的版本）
echo "[build-sidecar] 创建 Sidecar 启动脚本..."
cat > "$DESKTOP_DIR/src-tauri/binaries/m3u8-server" << 'EOF'
#!/bin/bash
# Sidecar wrapper for m3u8-server
# 使用 npm link 的全局版本，开发时修改会自动同步

echo "[M3U8-SERVER] Sidecar script started"
echo "[M3U8-SERVER] NODE_PATH: $NODE_PATH"
echo "[M3U8-SERVER] PATH: $PATH"

# 检查 node 命令
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  echo "[M3U8-SERVER] Node found: $NODE_VERSION"
else
  echo "[M3U8-SERVER] ERROR: node command not found!"
  exit 1
fi

# 获取全局包路径
GLOBAL_PKG_DIR=$(npm root -g)
echo "[M3U8-SERVER] Global package dir: $GLOBAL_PKG_DIR"

M3U8_DL_SERVER="$GLOBAL_PKG_DIR/@wangjs-jacky/m3u8-dl/dist/server.js"
echo "[M3U8-SERVER] Server path: $M3U8_DL_SERVER"

# Check if the backend server is already running
echo "[M3U8-SERVER] Checking if server is already running..."
if curl -s http://localhost:15151/api/downloads > /dev/null 2>&1; then
  echo "[M3U8-SERVER] Backend server already running on port 15151"
  # Keep the process alive
  tail -f /dev/null
else
  echo "[M3U8-SERVER] Starting backend server..."

  if [ -f "$M3U8_DL_SERVER" ]; then
    echo "[M3U8-SERVER] Server file exists, starting..."
    node "$M3U8_DL_SERVER"
  else
    echo "[M3U8-SERVER] ERROR: Cannot find m3u8-dl server!"
    echo "[M3U8-SERVER] Looked for: $M3U8_DL_SERVER"
    echo "[M3U8-SERVER] Please run npm link in packages/m3u8-dl"
    exit 1
  fi
fi
EOF

chmod +x "$DESKTOP_DIR/src-tauri/binaries/m3u8-server"

echo "[build-sidecar] 完成!"
echo "[build-sidecar] Sidecar 脚本: $DESKTOP_DIR/src-tauri/binaries/m3u8-server"
