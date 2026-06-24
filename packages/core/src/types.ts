// 工作流阶段定义
// idle 表示无进行中需求，archive 是终态（归档后立即重置为 idle）
export type Phase = 'idle' | 'spec' | 'plan' | 'work' | 'review' | 'archive';

// 可以被"确认"的阶段（archive 不需要单独确认，它是自动完成的终态）
export type ApprovedPhase = 'spec' | 'plan' | 'work' | 'review';

// 单个阶段的元数据，记录确认时间以便审计
export interface PhaseRecord {
  approved_at: string; // ISO 时间
}

// state.json 的完整结构，是整个工作流的唯一真实来源
export interface MazdaState {
  phase: Phase;
  requirement: string | null;   // 当前需求名，idle 时为 null
  approved: ApprovedPhase[];
  spec?: PhaseRecord;
  plan?: PhaseRecord;
  work?: PhaseRecord;
  review?: PhaseRecord;
}

// init 命令支持的目标平台
// 不同平台的注入方式不同：claude-code 用命令文件，codex 用 AGENTS.md
export type InstallTarget = 'claude-code' | 'codex' | 'both';
