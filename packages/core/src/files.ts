import * as fs from 'fs';
import * as path from 'path';
import { assertSafeRequirementName, getMazdaDir, readState } from './state';

// 获取当前需求的工作目录（.mazda/<需求名>/）
// 依赖 state.json 中的 requirement 字段，要求在工作流进行中才能调用
export function getRequirementDir(cwd: string = process.cwd()): string {
  const state = readState(cwd);
  if (!state.requirement) {
    throw new Error('当前没有进行中的需求，请先运行 /mazda spec 开始一个新需求');
  }
  assertSafeRequirementName(state.requirement);
  return path.join(getMazdaDir(cwd), state.requirement);
}

// 获取归档目录（.mazda/archive/<需求名>/）
export function getArchiveDir(requirementName: string, cwd: string = process.cwd()): string {
  assertSafeRequirementName(requirementName);
  return path.join(getMazdaDir(cwd), 'archive', requirementName);
}

// 确保需求目录存在，在 spec 阶段开始时调用
export function ensureRequirementDir(requirementName: string, cwd: string = process.cwd()): string {
  assertSafeRequirementName(requirementName);
  const dir = path.join(getMazdaDir(cwd), requirementName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 读取指定产物文件，不存在返回 null 而非抛出异常
// 产物文件在工作流进行中逐步生成，前期阶段读后期产物是正常情况
export function readArtifact(filename: string, cwd: string = process.cwd()): string | null {
  try {
    const reqDir = getRequirementDir(cwd);
    const filePath = path.join(reqDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// 写入产物文件，自动创建需求目录
export function writeArtifact(filename: string, content: string, cwd: string = process.cwd()): void {
  const reqDir = getRequirementDir(cwd);
  fs.mkdirSync(reqDir, { recursive: true });
  fs.writeFileSync(path.join(reqDir, filename), content, 'utf-8');
}

// 将当前需求目录整体移动到 archive/<需求名>/
// 使用 rename 而非 copy+delete，保证原子性（同一文件系统内）
export function archiveRequirement(cwd: string = process.cwd()): string {
  const state = readState(cwd);
  if (!state.requirement) {
    throw new Error('当前没有进行中的需求');
  }
  assertSafeRequirementName(state.requirement);
  const reqDir = path.join(getMazdaDir(cwd), state.requirement);
  const archiveDir = getArchiveDir(state.requirement, cwd);

  // 先确认当前需求目录有效，再处理归档目录冲突，避免 rename 失败前误删已有历史归档。
  if (!fs.existsSync(reqDir) || !fs.statSync(reqDir).isDirectory()) {
    throw new Error(`当前需求目录不存在或不是目录：${reqDir}`);
  }

  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });

  if (fs.existsSync(archiveDir)) {
    throw new Error(`归档目录已存在：${archiveDir}。请先备份或移除该目录后再归档。`);
  }

  fs.renameSync(reqDir, archiveDir);
  return archiveDir;
}

// 列出所有已归档的需求名，用于 status 命令展示历史
export function listArchivedRequirements(cwd: string = process.cwd()): string[] {
  const archiveBaseDir = path.join(getMazdaDir(cwd), 'archive');
  if (!fs.existsSync(archiveBaseDir)) return [];
  return fs.readdirSync(archiveBaseDir).filter((name) => {
    return fs.statSync(path.join(archiveBaseDir, name)).isDirectory();
  });
}

// 读取已归档的某需求的指定文件
export function readArchivedArtifact(
  requirementName: string,
  filename: string,
  cwd: string = process.cwd()
): string | null {
  assertSafeRequirementName(requirementName);
  const filePath = path.join(getArchiveDir(requirementName, cwd), filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

// 列出当前需求目录下存在的产物文件，用于 status 命令展示进度
export function listCurrentArtifacts(cwd: string = process.cwd()): string[] {
  try {
    const reqDir = getRequirementDir(cwd);
    if (!fs.existsSync(reqDir)) return [];
    return fs.readdirSync(reqDir).filter((f) =>
      fs.statSync(path.join(reqDir, f)).isFile()
    );
  } catch {
    return [];
  }
}
