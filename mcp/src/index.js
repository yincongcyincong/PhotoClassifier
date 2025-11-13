#!/usr/bin/env node
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

// --- 配置常量 (请通过环境变量或直接修改来设置您的 GitHub 仓库信息) ---
// GitHub 仓库拥有者
const GITHUB_OWNER = process.env.GITHUB_OWNER || "example-owner";
// GitHub 仓库名称
const GITHUB_REPO = process.env.GITHUB_REPO || "example-repo";
// 仓库中图片所在的根目录路径 (例如: 'assets/images')
const GITHUB_PATH = process.env.GITHUB_PATH || "images";
// GitHub Personal Access Token (可选，用于提高 API 速率限制，或访问私有仓库)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

// GitHub API 基础 URL
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

/**
 * In-memory 存储图片链接，按类别（上级目录名）分类。
 * 结构示例:
 * {
 * "category_name": [
 * { id: 1, url: "raw_image_url_1" },
 * { id: 2, url: "raw_image_url_2" }
 * ],
 * "another_category": [ ... ]
 * }
 */
const imageStore = {};
let isStoreInitialized = false;

// 常见图片文件扩展名
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

/**
 * 递归地从 GitHub API 获取目录内容，并填充 imageStore。
 * @param {string} path 当前要扫描的路径
 */
async function fetchGitHubImages(path) {
    const url = `${GITHUB_API_BASE}/${path}`;
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MCP-GitHub-Image-Server'
    };
    if (GITHUB_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    try {
        const response = await fetch(url, {headers});
        if (!response.ok) {
            throw new Error(`GitHub API returned status ${response.status}: ${await response.text()}`);
        }
        const contents = await response.json();

        if (!Array.isArray(contents)) {
            console.error(`Error: Expected an array for path ${path}, but got: ${JSON.stringify(contents)}`);
            return;
        }

        for (const item of contents) {
            if (item.type === 'dir') {
                // 递归处理子目录
                await fetchGitHubImages(item.path);
            } else if (item.type === 'file') {
                const isImage = IMAGE_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext));
                if (isImage && item.download_url) {
                    // 获取图片的上一级目录名作为类别
                    const pathSegments = item.path.split('/');
                    // pathSegments 示例: ['images', 'fruits', 'apple.png']
                    // categoryName 应该是 'fruits'
                    const categoryName = pathSegments[pathSegments.length - 2];

                    if (categoryName && categoryName !== GITHUB_PATH) {
                        if (!imageStore[categoryName]) {
                            imageStore[categoryName] = [];
                        }

                        // 存储图片链接，ID 为当前类别中的 1-based 索引
                        imageStore[categoryName].push({
                            id: imageStore[categoryName].length + 1,
                            url: item.download_url
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Failed to fetch GitHub content for path ${path}: ${error.message}`);
    }
}

// --- MCP 工具定义 ---

const IMAGE_LOOKUP_TOOL = {
    name: "get_image_link",
    description: "Retrieves a public raw image URL by category (parent directory name) and ID (index within the category list).",
    inputSchema: {
        type: "object",
        properties: {
            category: {
                type: "string",
                description: "The name of the category, which is the immediate parent directory name of the image.",
            },
            id: {
                type: "integer",
                description: "The 1-based index (ID) of the image within the specified category.",
            }
        },
        required: ["category", "id"],
    }
};

const TOOLS = [IMAGE_LOOKUP_TOOL];

/**
 * 实际执行图片链接查找逻辑的函数。
 * @param {string} category 图片类别（上级目录名）
 * @param {number} id 图片在类别中的 1-based ID
 */
async function getImageLink(category, id) {
    if (!isStoreInitialized) {
        return {
            content: [{
                type: "text",
                text: "Error: Image store is not yet initialized. Please wait for the server to load images."
            }],
            isError: true
        };
    }

    const categoryData = imageStore[category];
    if (!categoryData) {
        return {
            content: [{
                type: "text",
                text: `Error: Category '${category}' not found. Available categories: ${Object.keys(imageStore).join(', ')}`
            }],
            isError: true
        };
    }

    // 将 1-based ID 转换为 0-based 索引
    const imageIndex = id - 1;
    const imageEntry = categoryData[imageIndex];

    if (!imageEntry) {
        return {
            content: [{
                type: "text",
                text: `Error: Image ID ${id} not found in category '${category}'. IDs are 1-based. Max ID is ${categoryData.length}.`
            }],
            isError: true
        };
    }

    return {
        content: [{
            type: "text",
            text: imageEntry.url
        }],
        isError: false
    };
}


// --- MCP 服务器设置与运行 ---

const server = new Server({
    name: "mcp-server/github-image-lookup",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});

// 设置工具列表请求处理
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
}));

// 设置工具调用请求处理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        switch (request.params.name) {
            case "get_image_link": {
                const {category, id} = request.params.arguments;
                // 确保 ID 是一个数字
                const numericId = parseInt(id);
                if (isNaN(numericId) || numericId < 1) {
                    return {
                        content: [{type: "text", text: "Error: ID must be a positive integer."}],
                        isError: true
                    };
                }
                return await getImageLink(category, numericId);
            }
            default:
                return {
                    content: [{
                        type: "text",
                        text: `Unknown tool: ${request.params.name}`
                    }],
                    isError: true
                };
        }
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
        };
    }
});

async function runServer() {
    console.error(`Starting image retrieval from GitHub... Path: ${GITHUB_PATH}`);

    // 1. 初始化图片仓库数据
    await fetchGitHubImages(GITHUB_PATH);

    // 2. 标记初始化完成并打印统计信息
    isStoreInitialized = true;
    const totalCategories = Object.keys(imageStore).length;
    const totalImages = Object.values(imageStore).reduce((sum, arr) => sum + arr.length, 0);

    console.error(`GitHub Image Store Initialized.`);
    console.error(`Total Categories Loaded: ${totalCategories}`);
    console.error(`Total Images Loaded: ${totalImages}`);

    if (totalCategories > 0) {
        console.error(`Example Categories: ${Object.keys(imageStore).slice(0, 5).join(', ')}`);
    } else {
        console.error("Warning: No images were loaded. Check your GITHUB_OWNER, GITHUB_REPO, GITHUB_PATH, and GITHUB_TOKEN configuration, and ensure the directory contains subdirectories with image files.");
    }


    // 3. 连接 MCP 传输层
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("GitHub Image Lookup MCP Server running on stdio");
}

runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});