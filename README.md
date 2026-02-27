# 时光印记 Pro

AI 驱动的老照片批量修复工具。上传老照片实拍图，AI 自动识别边缘、裁剪背景，完成高质量修复与上色。

## 功能特性

- 🖼️ 拖拽 / 点击批量上传照片
- 🔧 标准修复：智能裁剪、去损伤、增强色彩
- ✨ 2K 超高清修复：AI 超分辨率重建，面部与纹理细节还原
- 🎛️ 修复后可调节亮度、对比度、饱和度、锐化
- 💾 一键下载修复结果

## 快速开始

### 前置条件

- Node.js >= 18
- [Gemini API Key](https://aistudio.google.com/apikey)

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/big-year/old-photo-restore.git
cd old-photo-restore

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入你的 Gemini API Key

# 启动开发服务器
npm run dev
```

浏览器访问 `http://localhost:3000` 即可使用。

## 环境变量

| 变量名 | 说明 | 必填 |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API 密钥 | 是 |
| `API_KEY` | 备用 API 密钥（优先级更高） | 否 |

## 技术栈

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4
- Framer Motion
- Google Gemini API（`gemini-2.5-flash-image` / `gemini-3-pro-image-preview`）

## 项目结构

```
├── src/
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx             # 入口文件
│   ├── index.css            # 全局样式
│   └── services/
│       └── gemini.ts        # Gemini API 调用封装
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

## 开源协议

[Apache-2.0](./LICENSE)
