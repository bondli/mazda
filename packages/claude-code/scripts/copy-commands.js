// 构建后脚本：将 commands/ 目录复制到 dist/commands/
// 原因：tsc 只编译 .ts 文件，.md 命令文件需要手动复制才能随包发布

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../commands');
const dest = path.join(__dirname, '../dist/commands');

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(src)) {
  console.warn('警告：commands 目录不存在，跳过复制');
  process.exit(0);
}

copyDir(src, dest);
console.log('Commands copied to dist/commands');
