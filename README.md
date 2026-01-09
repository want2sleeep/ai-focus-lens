# AI Focus Lens

AI Focus Lens 是一个基于 Manifest V3 的浏览器扩展，通过 OpenAI 兼容的 LLM 接口来检测网页元素是否符合 WCAG 2.4.7 Focus Visible 标准。该扩展严格遵循 W3C ACT 规则 oj04fd 的定义，为开发者和无障碍审计员提供自动化的焦点可见性检测工具。

## 功能特性

- 🔍 自动识别页面上所有可聚焦元素
- 🤖 使用 AI 智能分析焦点可见性
- 📊 详细的检测报告和修复建议
- 🎯 元素高亮和定位功能
- ⚙️ 灵活的配置选项
- 🔒 安全的 API 密钥存储

## 技术架构

- **Manifest V3**: 现代化的浏览器扩展架构
- **TypeScript**: 类型安全的开发体验
- **pnpm**: 高效的包管理器
- **Webpack**: 模块打包和构建
- **Jest + fast-check**: 单元测试和属性测试

## 开发环境设置

### 前置要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装依赖

\`\`\`bash
pnpm install
\`\`\`

### 开发命令

\`\`\`bash
# 开发模式构建（监听文件变化）
pnpm run dev

# 生产模式构建
pnpm run build

# 类型检查
pnpm run type-check

# 代码检查
pnpm run lint

# 运行测试
pnpm run test

# 打包扩展
pnpm run package
\`\`\`

## 项目结构

\`\`\`
ai-focus-lens/
├── src/
│   ├── types/           # TypeScript 类型定义
│   ├── service-worker.ts # 后台服务工作器
│   ├── content-script.ts # 内容脚本
│   ├── popup.ts         # 弹出界面脚本
│   ├── popup.html       # 弹出界面 HTML
│   ├── manifest.json    # 扩展清单文件
│   └── icons/           # 扩展图标
├── tests/               # 测试文件
├── dist/                # 构建输出目录
└── web-ext-artifacts/   # 打包输出目录
\`\`\`

## 使用方法

1. 构建扩展：`pnpm run build`
2. 在 Chrome 中加载扩展：
   - 打开 `chrome://extensions/`
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `dist` 目录
3. 配置 API 密钥和基础 URL
4. 在任意网页上点击扩展图标开始扫描

## 配置选项

- **API Key**: OpenAI 兼容的 API 密钥
- **Base URL**: API 服务的基础 URL
- **Model**: 使用的 LLM 模型（如 gpt-3.5-turbo）
- **Batch Size**: 批量处理的元素数量
- **Cache**: 是否启用结果缓存

## 开发指南

### 添加新功能

1. 在 `src/types/index.ts` 中定义相关类型
2. 在对应的组件文件中实现功能
3. 添加相应的测试用例
4. 更新文档

### 测试策略

项目采用双重测试方法：

- **单元测试**: 验证具体功能和边缘情况
- **属性测试**: 验证通用属性和随机输入

每个属性测试运行至少 100 次迭代以确保全面覆盖。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目。