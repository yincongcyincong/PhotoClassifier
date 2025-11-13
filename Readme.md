# 📸 PhotoClassifier：智能图片分类与 GitHub 归档工具

## 🚀 项目简介

**PhotoClassifier** 是一个利用**大型多模态模型 (LLM)** 实现自动化图片识别、分类和归档的工具。它能够根据用户定义的分类列表，调用
AI 服务为图片打上多重标签，并自动将图片上传到指定的 GitHub 仓库目录中，实现高效的图片管理和数据分类。

本项目基于 Go 语言开发，支持灵活配置，旨在成为处理大量图片数据、进行自动化内容管理的得力助手。

## ✨ 主要特性

* **多模型支持：** 通过 `llm_type` 配置项，轻松切换不同的 LLM 服务（如 Gemini、OpenAI）。
* **高精度分类：** 利用先进的多模态 AI 模型的视觉理解能力，实现高精度的多标签分类。
* **自动化归档：** 自动将分类后的图片上传到 GitHub 仓库，并根据识别的类别创建子目录。
* **灵活配置：** 支持通过配置文件 (`config.json`) 或命令行参数进行配置。
* **网络代理支持：** 通过 `proxy_url` 字段轻松配置网络代理，适应不同网络环境。

## 🛠️ 配置说明 (`Config` 结构体解析)

本项目通过以下结构体进行配置：

| 字段 (`json` 键)      | 类型       | 描述                                     | 示例值                           |
|:-------------------|:---------|:---------------------------------------|:------------------------------|
| `image_folder`     | `string` | **待处理图片所在的本地文件夹路径。**                   | `./input_images`              |
| `model_token`      | `string` | **大模型的 API Key。**                      | `sk-proj-xxxxxxxx`            |
| `llm_type`         | `string` | **指定使用的大模型类型。** (`gemini`, `openai` 等) | `gemini`                      |
| `model_custom_url` | `string` | 大模型的自定义 API 地址 (如自建服务，通常留空)。           | `https://api.example.com/v1/` |
| `model_name`       | `string` | **实际使用的模型名称。**                         | `gemini-2.5-flash` / `gpt-4o` |
| `target_classes`   | `string` | **目标图片类别列表，用逗号分隔。** AI 将被限制从这些类别中选择。   | `风景,美食,人物,建筑,文档`              |
| `dir`              | `string` | 本地目录。                                  | `photos`                      |
| `proxy_url`        | `string` | **可选**。用于访问大模型 API 的 HTTP/SOCKS5 代理地址。 | `http://127.0.0.1:7890`       |
| `class_idx`        | `string` | **可选**。每个类型的开始索引位置                     |                               |

## ⚙️ 使用指南

### 步骤一：准备环境

1. **Go 环境：** 确保您已安装 Go 1.24 或更高版本。
2. **API Key：** 准备好您选择的大模型（如 Gemini 或 OpenAI）的 API Key。

### 步骤二：创建配置文件

在项目根目录创建 `config.json` 文件：

```json
{
  "image_folder": "./input_images",
  "model_token": "YOUR_GEMINI_OR_OPENAI_KEY",
  "llm_type": "gemini",
  "model_custom_url": "",
  "dir": "photos",
  "target_classes": "风景,美食,人物,宠物",
  "model_name": "gemini-2.5-flash",
  "proxy_url": "",
  "class_idx": ""
}
```

### 步骤三：编译与运行

1. **编译程序：**

   ```bash
   go build main.go
   ```
   
### 步骤四：上传文件到github
```
git clone https://github.com/yourusername/your-repo.git
git pull
git add .
git commit -m "update"
git push
```

## ⚠️ 注意事项

1. **Token 安全：** 强烈建议不要将 Token 硬编码在代码中。如果使用命令行，请确保您的终端历史记录安全。
2. **JSON 返回：** **PhotoClassifier** 依赖 LLM 返回精确的 JSON 格式（`{"cate": ["tag1", "tag2"]}`），如果模型返回格式错误，分类步骤将失败。

## 后序
我的图片来自推的爬虫：https://github.com/caolvchong-top/twitter_download   感谢大佬
