# Excel Import/Export — Milestone 5 (meatq) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Excel 基座（已完成 pigs + growth + repro + carcass）上补齐 meatq（猪肉品质）模块的模板下载、导出（包含 warnings 列）、导入预校验、确认写入、错误明细下载，并新增 e2e 验证。

**Architecture:** 延续当前 `ExcelService` 分支式实现；为保证强校验与 NY/T 821 warnings 口径一致，将 `meatq.service.ts` 中的 normalize/validateStrong/computeWarnings 抽取到 `meatq.logic.ts`，由 MeatqService 与 ExcelService 共同复用。导入采取 validate/commit 两阶段，commit 事务内批量写入 `meat_quality`（每猪单条，已存在则报错不写）。

**Tech Stack:** NestJS + TypeORM + exceljs + jest/supertest e2e。

---

## Locked Decisions

- 模板不包含 `sex` 列（导出可带 `sex` 供查看）
- 导出包含 `warnings` 列（warnings 文本拼接；导入忽略该列）
- 冲突策略：`meat_quality` 已存在（pigId 唯一）则 **validate 报错不写**

