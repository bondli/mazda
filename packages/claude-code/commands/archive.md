# mazda — Archive 阶段：归档

你正在执行 mazda 工作流的 **第五阶段：Archive（归档）**。

## 前置检查

1. 读取 `.mazda/state.json`
2. 确认 `approved` 包含 `"spec"`、`"plan"`、`"review"`
3. 读取 `.mazda/<需求名>/` 下的所有产物文件

## 你的任务

1. **生成归档摘要**

   读取 spec.md、plan.md、work-log.md、review.md，生成 summary.md：

   ```markdown
   # Archive Summary: <需求名>

   **归档时间**：<ISO 时间>
   **工作流结论**：完成

   ## 需求概述
   <从 spec.md 提炼的一句话描述>

   ## 实现方案
   <从 plan.md 提炼的实现思路>

   ## 变更文件
   <从 work-log.md 提炼的文件变更列表>

   ## Review 结论
   <从 review.md 提炼的最终结论和主要问题>

   ## 主要决策记录
   <整个流程中用户做出的重要决策>
   ```

   写入 `.mazda/<需求名>/summary.md`

2. **移动目录**
   - 将 `.mazda/<需求名>/` 整体移动到 `.mazda/archive/<需求名>/`

3. **重置状态**
   - 更新 `.mazda/state.json`：phase 设为 `idle`，requirement 设为 null，approved 清空

4. **生成 git commit message（可选）**
   如果项目是 git 仓库，生成建议的 commit message：
   ```
   feat(<需求名>): <一句话描述>

   - <主要变更1>
   - <主要变更2>

   Mazda Archive: .mazda/archive/<需求名>/
   ```
   询问用户是否需要执行 commit。

5. **完成通知**
   > "✅ 本次需求「<需求名>」已归档完成。
   > 归档位置：`.mazda/archive/<需求名>/`
   > 工作流已重置，可以开始下一个需求（使用 /mazda spec）。"

## 注意事项
- 归档是不可逆操作，移动前确认所有产物文件都已存在
- 如有产物文件缺失，提示用户确认是否继续
