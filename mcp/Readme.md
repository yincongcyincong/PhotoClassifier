# github获取某个库图片的MCP

## 🛠️ 如何使用

### 1. 前提条件

您需要确保系统上安装了以下工具：

* **Node.js 和 npm/npx:** 用于运行脚本和执行命令行工具。
* **Git:** 如果您需要克隆或与 GitHub 仓库进行更复杂的交互。

### 2. 获取 GitHub 个人访问令牌（Personal Access Token, PAT）

为了让脚本能够访问您的私有仓库或避免公共仓库的速率限制，您需要一个 GitHub 令牌。

1. 访问您的 GitHub **Settings**。
2. 导航到 **Developer settings** -\> **Personal access tokens** -\> **Tokens (classic)**。
3. 点击 **Generate new token**。
4. 确保您的令牌具有访问目标仓库所需的权限（例如，如果仓库是私有的，您至少需要 `repo` 权限）。
5. **请妥善保管好生成的令牌，它只会显示一次！**

### 3. 命令参数说明

| 环境变量/参数        | 示例值               | 说明                              |
|:---------------|:------------------|:--------------------------------|
| `GITHUB_OWNER` | `yincongcyincong` | **必填。** GitHub 仓库的所有者（用户名或组织名）。 |
| `GITHUB_REPO`  | `PhotoClassifier` | **必填。** 目标 GitHub 仓库的名称。        |
| `GITHUB_PATH`  | `photos`          | **必填。** 目标仓库中要处理的文件夹或文件路径。      |
| `GITHUB_TOKEN` | `xxx`             | **必填。** 您的 GitHub 个人访问令牌 (PAT)。 |

### 4. 核心逻辑 (node src/index.js)

脚本 **`src/index.js`** 将会：

1. 读取传入的环境变量，获取 **`GITHUB_OWNER`**, **`GITHUB_REPO`**, **`GITHUB_PATH`**, 和 **`GITHUB_TOKEN`**。
2. 使用 `GITHUB_TOKEN` 认证，连接到 `yincongcyincong/PhotoClassifier` 仓库。
3. 对仓库中的图片链接加载到内存中，配合脚本使用

### 测试

```
npx @modelcontextprotocol/inspector \
-e GITHUB_OWNER="yincongcyincong" \
-e GITHUB_REPO="PhotoClassifier" \
-e GITHUB_PATH="photos" \
-e GITHUB_TOKEN="xxx" \
node src/index.js

```

使用 http://localhost:6274?MCP_PROXY_FULL_ADDRESS=http://localhost:6277/api/v1/inspector/github/

## 🔑 GitHub Token 获取

请参阅 [GitHub 官方文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
创建 PAT。**在权限 (Scopes) 中，必须勾选 `repo` 权限，以确保程序有权限向您的仓库写入文件。**

## 上传npx
```
npm init

修改package.json的bin

npm login
npm publish

npm cache clean --force
npx photoclassifier@latest
```