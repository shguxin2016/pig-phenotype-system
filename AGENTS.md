# 上海市地方品种猪保种场表型测定记录管理系统 — AI Agent 协作规范

## 分支策略

- 每个 AI agent（或每次独立修改）从 main 创建独立分支：
  ```
  codex/{简短描述}
  ```
  例如 codex/fix-growth-validation、codex/add-carcass-export

- 分支只包含该次任务的变更，不混入无关修改

## 工作流程

1. **拉取最新**：开始前先 pull 最新的 main
   git checkout main && git pull

2. **创建分支**：从 main 创建特性分支
   git checkout -b codex/{描述}

3. **修改代码**：遵循现有代码风格，不引入无关变更

4. **验证**：修改完成后运行相关检查
   - 后端：npm --prefix apps/api run build 和 npm --prefix apps/api test -- --runInBand
   - 前端：npm --prefix apps/web run build

5. **提交并推送**
   git add -A
   git commit -m "{简洁的描述}"
   git push -u origin $(git branch --show-current)

6. **提 PR**：在 GitHub 上提 Draft Pull Request，等待合并回 main

## 冲突预防

- 不要多个 agent 同时修改同一文件的同一函数/区域
- 共享类型优先放在 packages/shared/src/ 中复用
- 实体变更（apps/api/src/db/entities/）属于高风险区域，避免并发修改
- package.json 依赖变更应单独提交，避免与代码逻辑变更混在一起

## 代码规范

- 后端：NestJS + TypeORM，保持现有模块结构
- 前端：Next.js App Router + Tailwind CSS
- 导入路径使用 @/ 或相对路径，按现有约定
- 错误信息使用中文
