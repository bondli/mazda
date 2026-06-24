#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';

const packageJson = require('../package.json') as { version: string };

import {
  readState,
  initState,
  resetToPhase,
  resetToIdle,
  archiveRequirement,
  listArchivedRequirements,
  listCurrentArtifacts,
  getMazdaDir,
} from '@bondli/mazda-core';
import type { InstallTarget, Phase } from '@bondli/mazda-core';
import { installClaudeCodeCommands, uninstallClaudeCodeCommands } from '@bondli/mazda-claude-code';
import { installCodexAgent, uninstallCodexAgent } from '@bondli/mazda-codex';

const program = new Command();

program
  .name('mazda')
  .description('mazda — AI Coding 工作流引擎 (Spec → Plan → Work → Review → Archive)')
  .version(packageJson.version);

// ─── init 命令 ────────────────────────────────────────────────────────────────
// 在项目中初始化 mazda，安装命令文件和/或 AGENTS.md 指令
program
  .command('init')
  .description('在当前项目中初始化 mazda 工作流')
  .option(
    '-t, --target <target>',
    '安装目标：claude-code | codex | both',
    'both'
  )
  .action((options: { target: string }) => {
    const target = options.target as InstallTarget;
    const projectRoot = process.cwd();

    // 验证 target 参数合法性，提前报错避免部分安装
    if (!['claude-code', 'codex', 'both'].includes(target)) {
      console.error(chalk.red(`错误：target 必须是 claude-code、codex 或 both，当前值：${target}`));
      process.exit(1);
    }

    console.log(chalk.bold('\n🚗 mazda init\n'));

    try {
      // 第一步：初始化 .mazda/state.json（若已存在则跳过，保留进行中的需求）
      initState(projectRoot);
      console.log(chalk.green('  ✓ .mazda/state.json 已就绪'));

      // 第二步：根据 target 安装对应的 AI 平台适配
      if (target === 'claude-code' || target === 'both') {
        installClaudeCodeCommands(projectRoot);
      }

      if (target === 'codex' || target === 'both') {
        installCodexAgent(projectRoot);
      }

      // 提示用户下一步操作
      console.log(chalk.bold('\n✅ 初始化完成！\n'));
      console.log('使用方式：');
      if (target === 'claude-code' || target === 'both') {
        console.log(chalk.cyan('  Claude Code: /mazda spec  —  开始新需求'));
      }
      if (target === 'codex' || target === 'both') {
        console.log(chalk.cyan('  Codex: 告诉 AI "我要开始 spec 阶段"  —  开始新需求'));
      }
      console.log(chalk.gray('\n  mazda status  —  查看当前状态'));
      console.log();
    } catch (err) {
      console.error(chalk.red(`\n错误：${(err as Error).message}`));
      process.exit(1);
    }
  });

// ─── status 命令 ──────────────────────────────────────────────────────────────
// 展示当前工作流状态，包括进行中的需求和历史归档
program
  .command('status')
  .description('查看当前工作流状态')
  .action(() => {
    const projectRoot = process.cwd();

    console.log(chalk.bold('\n🚗 mazda status\n'));

    try {
      const state = readState(projectRoot);

      // 用颜色区分不同阶段，提升可读性
      const phaseColors: Record<string, chalk.Chalk> = {
        idle: chalk.gray,
        spec: chalk.blue,
        plan: chalk.yellow,
        work: chalk.magenta,
        review: chalk.cyan,
        archive: chalk.green,
      };
      const colorFn = phaseColors[state.phase] ?? chalk.white;

      console.log(`当前阶段：${colorFn(state.phase.toUpperCase())}`);

      if (state.requirement) {
        console.log(`当前需求：${chalk.bold(state.requirement)}`);
      } else {
        console.log(`当前需求：${chalk.gray('无（idle 状态）')}`);
      }

      // 展示已确认的阶段列表
      if (state.approved.length > 0) {
        console.log(`已确认：${state.approved.map((p: string) => chalk.green(p)).join(' → ')}`);
      } else {
        console.log(`已确认：${chalk.gray('无')}`);
      }

      // 展示当前需求目录下的产物文件
      if (state.requirement) {
        const artifacts = listCurrentArtifacts(projectRoot);
        if (artifacts.length > 0) {
          console.log('\n当前产物：');
          artifacts.forEach((f: string) => console.log(`  ${chalk.cyan(f)}`));
        } else {
          console.log(`\n当前产物：${chalk.gray('无')}`);
        }
      }

      // 展示历史归档列表
      const archived = listArchivedRequirements(projectRoot);
      if (archived.length > 0) {
        console.log('\n已归档需求：');
        archived.forEach((name: string) => console.log(`  ${chalk.gray('✓')} ${name}`));
      } else {
        console.log(`\n已归档需求：${chalk.gray('无')}`);
      }

      console.log();
    } catch (err) {
      console.error(chalk.red(`\n错误：${(err as Error).message}`));
      process.exit(1);
    }
  });

// ─── reset 命令 ───────────────────────────────────────────────────────────────
// 将工作流回退到指定阶段，用于需求中途发现问题需要重新来过的场景
program
  .command('reset')
  .description('重置工作流到指定阶段（保留需求名）')
  .option(
    '-p, --phase <phase>',
    '目标阶段：spec | plan | work | review',
    'spec'
  )
  .action((options: { phase: string }) => {
    const phase = options.phase as Phase;
    const projectRoot = process.cwd();

    const validPhases = ['spec', 'plan', 'work', 'review'];
    if (!validPhases.includes(phase)) {
      console.error(chalk.red(`错误：phase 必须是 spec、plan、work 或 review，当前值：${phase}`));
      process.exit(1);
    }

    console.log(chalk.bold('\n🚗 mazda reset\n'));

    try {
      const state = readState(projectRoot);

      if (state.phase === 'idle') {
        console.log(chalk.yellow('当前没有进行中的需求，无需重置。'));
        return;
      }

      // 清理目标阶段之后的产物文件，保持目录与状态一致
      const artifactsToRemove: Record<string, string[]> = {
        spec: ['plan.md', 'work-log.md', 'review.md', 'summary.md'],
        plan: ['work-log.md', 'review.md', 'summary.md'],
        work: ['review.md', 'summary.md'],
        review: ['summary.md'],
      };

      const toRemove = artifactsToRemove[phase] ?? [];
      if (state.requirement && toRemove.length > 0) {
        const mazdaDir = getMazdaDir(projectRoot);
        const reqDir = path.join(mazdaDir, state.requirement);
        toRemove.forEach((filename) => {
          const filePath = path.join(reqDir, filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(chalk.gray(`  已删除 ${filename}`));
          }
        });
      }

      resetToPhase(phase, projectRoot);
      console.log(chalk.green(`\n✅ 已重置到 ${phase} 阶段`));
      if (state.requirement) {
        console.log(chalk.gray(`需求：${state.requirement}`));
      }
      console.log();
    } catch (err) {
      console.error(chalk.red(`\n错误：${(err as Error).message}`));
      process.exit(1);
    }
  });

// ─── archive 命令 ─────────────────────────────────────────────────────────────
// 手动触发归档，通常由 AI 在 Archive 阶段调用，也可人工触发
program
  .command('archive')
  .description('归档当前需求并重置工作流到 idle')
  .action(() => {
    const projectRoot = process.cwd();

    console.log(chalk.bold('\n🚗 mazda archive\n'));

    try {
      const state = readState(projectRoot);

      if (state.phase === 'idle' || !state.requirement) {
        console.log(chalk.yellow('当前没有进行中的需求，无需归档。'));
        return;
      }

      // 检查前置条件，review 必须已确认才能归档
      if (!state.approved.includes('review')) {
        console.log(chalk.yellow('⚠ 警告：Review 阶段尚未确认，建议完成 Review 后再归档。'));
        console.log(chalk.yellow('  如需强制归档，请直接操作文件系统。'));
        process.exit(1);
      }

      const requirementName = state.requirement;
      const archiveDir = archiveRequirement(projectRoot);
      resetToIdle(projectRoot);

      console.log(chalk.green(`✅ 需求「${requirementName}」已归档`));
      console.log(chalk.gray(`归档位置：${archiveDir}`));
      console.log(chalk.gray('工作流已重置，可以开始下一个需求（mazda init 或 /mazda spec）'));
      console.log();
    } catch (err) {
      console.error(chalk.red(`\n错误：${(err as Error).message}`));
      process.exit(1);
    }
  });

// ─── uninstall 命令 ───────────────────────────────────────────────────────────
// 从项目中移除 mazda 安装的文件，保留 .mazda/ 数据目录
program
  .command('uninstall')
  .description('从项目中移除 mazda 工作流文件')
  .option(
    '-t, --target <target>',
    '卸载目标：claude-code | codex | both',
    'both'
  )
  .action((options: { target: string }) => {
    const target = options.target as InstallTarget;
    const projectRoot = process.cwd();

    if (!['claude-code', 'codex', 'both'].includes(target)) {
      console.error(chalk.red(`错误：target 必须是 claude-code、codex 或 both，当前值：${target}`));
      process.exit(1);
    }

    console.log(chalk.bold('\n🚗 mazda uninstall\n'));

    try {
      if (target === 'claude-code' || target === 'both') {
        uninstallClaudeCodeCommands(projectRoot);
      }

      if (target === 'codex' || target === 'both') {
        uninstallCodexAgent(projectRoot);
      }

      console.log(chalk.green('\n✅ 卸载完成'));
      console.log(chalk.gray('注意：.mazda/ 数据目录已保留，如需清除请手动删除。'));
      console.log();
    } catch (err) {
      console.error(chalk.red(`\n错误：${(err as Error).message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
