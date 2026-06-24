import * as fs from 'fs';
import * as path from 'path';

// mazda 注入块的边界标记，用于幂等更新（找到标记就替换，找不到就追加）
const BEGIN_MARKER = '<!-- mazda:begin -->';
const END_MARKER = '<!-- mazda:end -->';

// 生成注入到 AGENTS.md 的 mazda 工作流指令块
// 使用标记包裹便于后续更新和卸载，且对不了解 mazda 的读者透明
function generateMazdaBlock(): string {
  return `${BEGIN_MARKER}
<!-- 此块由 mazda 自动管理，请勿手动编辑 -->

## mazda 工作流

本项目使用 mazda AI Coding 工作流，每次开发任务请遵循以下五个阶段：

**Spec → Plan → Work → Review → Archive**

### 工作流状态
每次对话开始时，读取 \`.mazda/state.json\` 了解当前所处阶段。

### 阶段说明

**1. Spec（需求澄清）**
- 触发：用户描述新需求，或要求开始 spec 阶段
- 行为：询问需求名 → 澄清需求 → 生成 \`.mazda/<需求名>/spec.md\` → 等待用户确认
- 确认关键词：approve、确认、没问题、ok、继续、go ahead、执行下一步

**2. Plan（制定计划）**
- 触发：spec 确认后自动进入，或用户要求开始 plan 阶段
- 行为：读取 spec.md → 分析代码 → 生成 \`.mazda/<需求名>/plan.md\` → 等待用户确认
- 确认前可以修改（支持带条件确认）

**3. Work（执行开发）**
- 触发：plan 确认后自动进入，或用户要求开始 work 阶段
- 行为：严格按照 plan.md 逐 Task 执行 → 生成 \`.mazda/<需求名>/work-log.md\` → 进入 Review
- 范围约束：只做 plan 中批准的事，范围外需要用户确认

**4. Review（代码审查）**
- 触发：work 完成后自动进入，或用户要求 review
- 行为：AI 审查 diff（完整性/范围/质量/安全）→ 生成 \`.mazda/<需求名>/review.md\` → 辅助 Human Review → 等待确认

**5. Archive（归档）**
- 触发：review 确认后自动进入，或用户要求 archive
- 行为：生成 summary.md → 移动 \`.mazda/<需求名>/\` 到 \`.mazda/archive/<需求名>/\` → 重置 state.json 为 idle

### 确认机制
每个阶段完成后等待用户明确确认才推进。识别以下表达为确认意图：
- 英文：approve, ok, yes, go ahead, lgtm, confirmed, proceed, continue
- 中文：确认、没问题、可以、好的、继续、执行、通过

支持带条件确认，如"把第3步改成xxx，然后确认"，先处理修改再推进。

### 状态文件格式
\`\`\`json
{
  "phase": "idle | spec | plan | work | review | archive",
  "requirement": "需求名 或 null",
  "approved": ["spec", "plan"],
  "spec": { "approved_at": "ISO时间" },
  "plan": { "approved_at": "ISO时间" }
}
\`\`\`
${END_MARKER}`;
}

// 将 mazda 工作流指令注入到 AGENTS.md（追加或更新标记块）
// 幂等操作：多次调用结果相同，可以安全用于升级场景
export function installCodexAgent(projectRoot: string): void {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const mazdaBlock = generateMazdaBlock();

  if (!fs.existsSync(agentsPath)) {
    // 文件不存在，直接创建，让 Codex 用户无需手动建文件
    fs.writeFileSync(agentsPath, mazdaBlock + '\n', 'utf-8');
    console.log('  ✓ 已创建 AGENTS.md 并注入 mazda 工作流指令');
    return;
  }

  let content = fs.readFileSync(agentsPath, 'utf-8');
  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if ((beginIdx === -1) !== (endIdx === -1)) {
    // marker 残缺时停止自动写入，避免追加第二个 mazda 块并留下不可卸载内容。
    throw new Error('AGENTS.md 中的 mazda 标记块不完整，请手动修复 <!-- mazda:begin --> 和 <!-- mazda:end --> 后重试');
  }

  if (beginIdx !== -1 && endIdx !== -1) {
    // 已存在标记块，替换更新（升级场景）
    content = content.slice(0, beginIdx) + mazdaBlock + content.slice(endIdx + END_MARKER.length);
    console.log('  ✓ 已更新 AGENTS.md 中的 mazda 工作流指令块');
  } else {
    // 追加到文件末尾，保留用户已有的内容
    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    content = content + separator + mazdaBlock + '\n';
    console.log('  ✓ 已向 AGENTS.md 末尾追加 mazda 工作流指令块');
  }

  fs.writeFileSync(agentsPath, content, 'utf-8');
}

// 从 AGENTS.md 中移除 mazda 标记块
// 保留文件中用户自己写的其他内容
export function uninstallCodexAgent(projectRoot: string): void {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) return;

  let content = fs.readFileSync(agentsPath, 'utf-8');
  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if ((beginIdx === -1) !== (endIdx === -1)) {
    throw new Error('AGENTS.md 中的 mazda 标记块不完整，请手动修复后再卸载');
  }

  if (beginIdx === -1 && endIdx === -1) {
    console.log('  ℹ AGENTS.md 中未找到 mazda 指令块，跳过');
    return;
  }

  // 删除标记块及前后多余的空行，保持文件整洁
  content = content.slice(0, beginIdx).trimEnd() + '\n' + content.slice(endIdx + END_MARKER.length).trimStart();
  fs.writeFileSync(agentsPath, content.trim() + '\n', 'utf-8');
  console.log('  ✓ 已从 AGENTS.md 中移除 mazda 工作流指令块');
}
