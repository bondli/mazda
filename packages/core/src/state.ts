import * as fs from 'fs';
import * as path from 'path';
import type { MazdaState, Phase, ApprovedPhase, PhaseRecord } from './types';

// state.json 的默认初始值，每次归档后重置到这个状态
const DEFAULT_STATE: MazdaState = {
  phase: 'idle',
  requirement: null,
  approved: [],
};

// 需求名会直接映射到 .mazda/<需求名>/ 目录，必须在 core 层统一校验，不能只依赖 prompt 约束。
const REQUIREMENT_NAME_PATTERN = /^[a-zA-Z0-9-]+$/;

export function validateRequirementName(requirement: string): boolean {
  return REQUIREMENT_NAME_PATTERN.test(requirement);
}

export function assertSafeRequirementName(requirement: string): void {
  if (!validateRequirementName(requirement)) {
    throw new Error(
      `非法需求名：${requirement}。需求名只允许字母、数字和连字符，例如 user-login。`
    );
  }
}

// 找到 .mazda 目录（统一约定在项目根目录下，不做向上查找以避免跨项目污染）
export function getMazdaDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.mazda');
}

// state.json 的完整路径
export function getStatePath(cwd: string = process.cwd()): string {
  return path.join(getMazdaDir(cwd), 'state.json');
}

// 读取 state.json，文件不存在时返回默认值而不是抛出异常
// 这样 AI 在任何状态下都能安全读取状态
export function readState(cwd: string = process.cwd()): MazdaState {
  const statePath = getStatePath(cwd);
  if (!fs.existsSync(statePath)) {
    return { ...DEFAULT_STATE };
  }
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as MazdaState;
  } catch (err) {
    // state.json 存在但损坏时显式报错，避免静默回退到 idle 后掩盖可审计状态问题。
    throw new Error(`无法解析 ${statePath}：${(err as Error).message}`);
  }
}

// 写入 state.json，自动创建 .mazda 目录
export function writeState(state: MazdaState, cwd: string = process.cwd()): void {
  const mazdaDir = getMazdaDir(cwd);
  if (!fs.existsSync(mazdaDir)) {
    fs.mkdirSync(mazdaDir, { recursive: true });
  }
  fs.writeFileSync(getStatePath(cwd), JSON.stringify(state, null, 2), 'utf-8');
}

// 初始化 state.json（若已存在则跳过，避免覆盖进行中的需求）
export function initState(cwd: string = process.cwd()): void {
  const statePath = getStatePath(cwd);
  if (!fs.existsSync(statePath)) {
    writeState({ ...DEFAULT_STATE }, cwd);
  }
}

// 推进到指定阶段，仅更新 phase 字段，保留其他状态不变
export function advancePhase(phase: Phase, cwd: string = process.cwd()): void {
  const state = readState(cwd);
  state.phase = phase;
  writeState(state, cwd);
}

// 记录某阶段已确认，同时写入确认时间戳
export function approvePhase(phase: ApprovedPhase, cwd: string = process.cwd()): void {
  const state = readState(cwd);
  if (!state.approved.includes(phase)) {
    state.approved.push(phase);
  }
  const record: PhaseRecord = { approved_at: new Date().toISOString() };
  state[phase] = record;
  writeState(state, cwd);
}

// 开始新需求：重置所有历史状态，设置需求名，进入 spec 阶段
// 必须完全重置而不是增量更新，以免旧需求的数据污染新需求
export function startRequirement(requirement: string, cwd: string = process.cwd()): void {
  assertSafeRequirementName(requirement);
  writeState({
    phase: 'spec',
    requirement,
    approved: [],
  }, cwd);
}

// 归档完成后重置到 idle，清除所有需求相关数据
export function resetToIdle(cwd: string = process.cwd()): void {
  writeState({ ...DEFAULT_STATE }, cwd);
}

// 重置到指定阶段（保留需求名和已确认的前置阶段）
// 用于需求中途回退的场景，比如 plan 审查后发现 spec 有问题
export function resetToPhase(phase: Phase, cwd: string = process.cwd()): void {
  const state = readState(cwd);
  const phaseOrder: Phase[] = ['idle', 'spec', 'plan', 'work', 'review', 'archive'];
  const targetIndex = phaseOrder.indexOf(phase);

  // 只保留目标阶段之前已确认的阶段
  const approvedPhases: ApprovedPhase[] = ['spec', 'plan', 'work', 'review'];
  state.approved = state.approved.filter((p) => {
    const idx = phaseOrder.indexOf(p);
    return idx < targetIndex;
  });

  // 清除目标阶段及之后的阶段记录，避免时间戳数据误导
  approvedPhases.forEach((p) => {
    if (phaseOrder.indexOf(p) >= targetIndex) {
      delete state[p];
    }
  });

  state.phase = phase;
  writeState(state, cwd);
}
