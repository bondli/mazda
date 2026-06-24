import * as fs from 'fs';
import * as path from 'path';

// 将 mazda 的 Claude Code 命令文件安装到目标项目的 .claude/commands/mazda/
// 选择子目录 mazda/ 而非直接放在 commands/ 下，是为了避免与用户已有命令冲突
export function installClaudeCodeCommands(projectRoot: string): void {
  // 命令文件来源：本包 dist/commands/ 目录（构建时从 commands/ 复制过来）
  const commandsSrc = path.join(__dirname, 'commands');
  // 目标：项目 .claude/commands/mazda/
  const commandsDest = path.join(projectRoot, '.claude', 'commands', 'mazda');

  if (!fs.existsSync(commandsSrc)) {
    throw new Error(`命令模板目录不存在：${commandsSrc}\n请先运行 pnpm build 构建项目`);
  }

  fs.mkdirSync(commandsDest, { recursive: true });

  // 逐个复制 .md 文件，跳过其他类型的文件
  const files = fs.readdirSync(commandsSrc).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    throw new Error(`命令模板目录中没有找到 .md 文件：${commandsSrc}`);
  }

  for (const file of files) {
    fs.copyFileSync(path.join(commandsSrc, file), path.join(commandsDest, file));
    console.log(`  ✓ 已写入 .claude/commands/mazda/${file}`);
  }
}

// 卸载：删除 .claude/commands/mazda/ 目录
// 保留 .claude/commands/ 本身，避免删除用户的其他命令
export function uninstallClaudeCodeCommands(projectRoot: string): void {
  const commandsDest = path.join(projectRoot, '.claude', 'commands', 'mazda');
  if (fs.existsSync(commandsDest)) {
    fs.rmSync(commandsDest, { recursive: true });
    console.log('  ✓ 已删除 .claude/commands/mazda/');
  } else {
    console.log('  ℹ .claude/commands/mazda/ 不存在，跳过');
  }
}
