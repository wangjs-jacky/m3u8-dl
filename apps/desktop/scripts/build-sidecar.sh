#!/bin/bash

# 构建 m3u8-dl 并打包为 Sidecar
cd ../../../packages/m3u8-dl
npm run build

# 创建 sidecar 目录
mkdir -p ../apps/desktop/src-tauri/binaries

# 复制编译后的文件
cp -r dist ../apps/desktop/src-tauri/binaries/m3u8-server-dist

# 创建启动脚本
cat > ../apps/desktop/src-tauri/binaries/m3u8-server << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/m3u8-server-dist/server.js"
EOF

chmod +x ../apps/desktop/src-tauri/binaries/m3u8-server
