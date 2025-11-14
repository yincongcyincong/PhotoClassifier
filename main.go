package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	
	"google.golang.org/genai"
)

var (
	config    Config
	cateRegex = regexp.MustCompile(`\{\s*"cate"\s*:\s*\[\s*"[^"]+"\s*(?:,\s*"[^"]+"\s*)*\]\s*\}`)
	classMap  = make(map[string]int)
)

// --- 1. 配置结构体 ---

// Config 存储所有必要的输入参数
type Config struct {
	ImageFolder     string `json:"image_folder"`
	ModelToken      string `json:"model_token"`      // API Key
	LLMType         string `json:"llm_type"`         // gemini / openai
	ModelCustomURL  string `json:"model_custom_url"` // 如果模型有自定义地址
	Dir             string `json:"dir"`              // 的目录
	TargetClasses   string `json:"target_classes"`   // 目标图片类别列表 (逗号分隔)
	ModelName       string `json:"model_name"`       // 模型名称
	ProxyURL        string `json:"proxy_url"`        // 代理地址 (可选)
	ClassIdx        string `json:"class_idx"`        // 分类索引 (可选)
	IntervalSeconds int    `json:"interval_seconds"` // 间隔时间 (秒)
}

// --- 2. GitHub API 结构体 ---

// GitHubContentRequest 是上传文件到 GitHub API 所需的请求体
type GitHubContentRequest struct {
	Message string `json:"message"`
	Content string `json:"content"` // base64 编码的图片内容
	Sha     string `json:"sha,omitempty"`
}

type CateInfo struct {
	Cate []string `json:"cate"`
}

// --- 3. 核心功能函数 ---

// ClassifyAndUpload 主函数：遍历文件夹，调用模型，上传图片
func ClassifyAndUpload(cfg Config) {
	// 确保关键参数不为空
	if cfg.ImageFolder == "" || cfg.ModelToken == "" || cfg.LLMType == "" {
		log.Fatal("错误：缺少必要的参数 (如文件夹、API Token 或 GitHub Token/RepoURL)。请使用 -h 查看用法。")
	}
	
	prompt := fmt.Sprintf(`
你是一个专业的图片内容识别和分类系统。你的任务是根据提供的图片，从限定的分类列表中选出最相关的标签。

---
### 任务要求：
1. **识别内容:** 仔细分析图片中的所有视觉元素，包括但不限于主体、场景、背景、光线和整体氛围。
2. **多标签选择:** 允许选择一个或多个最能描述图片内容的标签。
3. **严格遵守分类列表:** 只能从提供的 <允许的分类列表> 中进行选择，禁止使用列表外的任何词汇或自定义类别。

---
### 输出格式要求（**严格遵守**）：
* **唯一输出:** 你的全部回复必须且只能是一个 JSON 对象。
* **无额外文本:** 绝对禁止在 JSON 对象的**前后**添加任何解释性文字、Markdown 格式化符号 (如 json) 或注释。
* **JSON 结构:** 必须包含一个键名为 cate 的数组。

---
### 输入信息：
* **允许的分类列表:** %s

---
### 示例输出：
{"cate":["美食","生活"]}

如果你识别到图片内容只属于“风景”一个类别，则返回：
{"cate":["风景"]}
`, cfg.TargetClasses)
	
	// 初始化 Gemini 客户端
	ctx := context.Background()
	
	// 遍历文件夹
	files, err := ioutil.ReadDir(cfg.ImageFolder)
	if err != nil {
		log.Fatalf("无法读取文件夹 %s: %v", cfg.ImageFolder, err)
	}
	
	if len(files) == 0 {
		log.Printf("文件夹 %s 中没有找到文件，程序退出。\n", cfg.ImageFolder)
		return
	}
	
	for _, file := range files {
		if file.IsDir() {
			continue
		}
		
		filePath := filepath.Join(cfg.ImageFolder, file.Name())
		
		// 确保是图片文件 (简单检查)
		if !isImageFile(file.Name()) {
			log.Printf("跳过文件 %s: 不是图片文件\n", file.Name())
			continue
		}
		
		fmt.Printf("\n--- 正在处理图片: %s ---\n", file.Name())
		
		imgData, err := ioutil.ReadFile(filePath)
		if err != nil {
			log.Printf("无法读取文件 %s: %v", filePath, err)
			continue
		}
		
		// 1. 调用大模型进行识别和分类
		categories, token, err := classifyImageWithModel(ctx, imgData, prompt)
		if err != nil {
			log.Printf("分类图片 %s 失败: %v", file.Name(), err)
			continue
		}
		
		fmt.Printf("图片%s  -> 模型返回的分类标签: %s\n, 使用token: %d", filePath, categories, token)
		
		// 如果未识别到类别，跳过
		if len(categories) == 0 {
			fmt.Printf("  -> 模型未返回有效分类标签，跳过上传。\n")
			continue
		}
		
		// 2. 将图片上传到 GitHub
		for _, cat := range categories {
			// 清理类别名称以用于文件路径 (例如：移除空格、斜杠等)
			safeCat := sanitizeCategory(cat)
			fmt.Printf("  -> 识别类别: %s. 正在上传到 GitHub 目录: %s...\n", cat, safeCat)
			
			// 构建上传路径: GitHubDir / 类别 / 文件名
			fname := strconv.Itoa(classMap[cat]) + filepath.Ext(filePath)
			uploadPath := filepath.Join(config.Dir, safeCat, fname)
			
			err = saveFileLocally(filePath, uploadPath)
			if err != nil {
				log.Printf("  -> 上传图片 %s 到 GitHub/%s 失败: %v", file.Name(), safeCat, err)
			} else {
				classMap[cat]++
				fmt.Printf("  -> 上传成功: %s\n", uploadPath)
			}
		}
	}
	fmt.Println("\n--- 所有文件处理完毕 ---")
}

func classifyImageWithModel(ctx context.Context, imageContent []byte, content string) ([]string, int, error) {
	client, err := GetGeminiClient(ctx)
	if err != nil {
		log.Println("create client fail", "err", err)
		return nil, 0, err
	}
	
	contentPrompt := content
	parts := []*genai.Part{
		genai.NewPartFromBytes(imageContent, "image/"+DetectImageFormat(imageContent)),
		genai.NewPartFromText(contentPrompt),
	}
	
	contents := []*genai.Content{
		genai.NewContentFromParts(parts, genai.RoleUser),
	}
	
	result, err := client.Models.GenerateContent(
		ctx,
		config.ModelName,
		contents,
		nil,
	)
	
	if err != nil || result == nil {
		log.Println("generate text fail", "err", err)
		return nil, 0, err
	}
	
	time.Sleep(time.Duration(config.IntervalSeconds) * time.Second)
	if result.Text() != "" {
		matches := cateRegex.FindAllString(result.Text(), -1)
		cateRes := new(CateInfo)
		for _, match := range matches {
			err := json.Unmarshal([]byte(match), cateRes)
			if err != nil {
				log.Println("json umarshal fail", "err", err)
			}
		}
		return cateRes.Cate, int(result.UsageMetadata.TotalTokenCount), nil
	}
	
	return nil, int(result.UsageMetadata.TotalTokenCount), nil
	
}

func saveFileLocally(filePath, localTargetPath string) error {
	// 1. 确保目标路径的目录存在
	targetDir := filepath.Dir(localTargetPath)
	if _, err := os.Stat(targetDir); os.IsNotExist(err) {
		// 递归创建所有必要的目录
		err := os.MkdirAll(targetDir, 0755) // 0755 是常用的目录权限
		if err != nil {
			return fmt.Errorf("创建目标目录失败: %s, 错误: %w", targetDir, err)
		}
	} else if err != nil {
		return fmt.Errorf("检查目标目录状态失败: %s, 错误: %w", targetDir, err)
	}
	
	// 2. 打开源文件
	sourceFile, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("打开源文件失败: %w", err)
	}
	defer sourceFile.Close() // 确保文件句柄在使用完毕后关闭
	
	// 3. 创建或截断目标文件
	// os.Create 会创建一个新文件。如果文件已存在，它会截断（清空）它。
	destinationFile, err := os.Create(localTargetPath)
	if err != nil {
		return fmt.Errorf("创建目标文件失败: %w", err)
	}
	defer destinationFile.Close() // 确保文件句柄在使用完毕后关闭
	
	// 4. 复制文件内容
	// io.Copy 会高效地将源文件的内容复制到目标文件
	bytesCopied, err := io.Copy(destinationFile, sourceFile)
	if err != nil {
		return fmt.Errorf("复制文件内容失败: %w", err)
	}
	
	// 可选：打印日志确认
	fmt.Printf("成功将文件 '%s' 复制到 '%s' (%d bytes)\n", filepath.Base(filePath), localTargetPath, bytesCopied)
	
	return nil
}

// isImageFile 简单的图片文件后缀检查
func isImageFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return ext == ".jpg" || ext == ".jpeg" || ext == ".png"
}

// sanitizeCategory 清理类别名称，使其适用于文件路径
func sanitizeCategory(cat string) string {
	// 替换所有非字母、数字、中文、空格的字符为下划线
	// 然后将空格替换为下划线，最后移除开头和结尾的下划线
	sanitized := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' || (r >= 0x4e00 && r <= 0x9fa5) {
			return r
		}
		return '_'
	}, cat)
	
	sanitized = strings.ReplaceAll(sanitized, " ", "_")
	return strings.Trim(sanitized, "_")
}

// --- 4. Main 入口 (使用 flag 进行参数传递) ---

func main() {
	confData, err := ioutil.ReadFile("./conf.json")
	if err != nil {
		log.Fatalf("读取配置文件失败: %v", err)
	}
	
	err = json.Unmarshal(confData, &config)
	if err != nil {
		log.Fatalf("解析配置文件失败: %v", err)
	}
	
	classes := strings.Split(config.TargetClasses, ",")
	idx := strings.Split(config.ClassIdx, ",")
	for i, class := range classes {
		if len(idx) > i {
			iInt, _ := strconv.Atoi(idx[i])
			classMap[class] = iInt
		} else {
			classMap[class] = 0
		}
	}
	
	ClassifyAndUpload(config)
}

func GetGeminiClient(ctx context.Context) (*genai.Client, error) {
	httpClient := GetLLMProxyClient()
	httpOption := genai.HTTPOptions{}
	if config.ModelCustomURL != "" {
		httpOption.BaseURL = config.ModelCustomURL
		httpOption.Headers = http.Header{
			"Authorization": []string{"Bearer " + config.ModelToken},
		}
	}
	return genai.NewClient(ctx, &genai.ClientConfig{
		HTTPClient:  httpClient,
		APIKey:      config.ModelToken,
		HTTPOptions: httpOption,
	})
}

func GetLLMProxyClient() *http.Client {
	transport := &http.Transport{}
	
	if config.ProxyURL != "" {
		proxy, err := url.Parse(config.ProxyURL)
		if err != nil {
			log.Println("parse proxy url fail", "err", err)
		}
		transport.Proxy = http.ProxyURL(proxy)
	}
	
	return &http.Client{
		Transport: transport,
		Timeout:   5 * time.Minute, // 设置超时
	}
}

func DetectImageFormat(data []byte) string {
	if len(data) < 12 {
		return "unknown"
	}
	
	switch {
	case bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}):
		return "jpeg"
	case bytes.HasPrefix(data, []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}):
		return "png"
	case bytes.HasPrefix(data, []byte("GIF87a")) || bytes.HasPrefix(data, []byte("GIF89a")):
		return "gif"
	case bytes.HasPrefix(data, []byte{0x42, 0x4D}):
		return "bmp"
	case bytes.HasPrefix(data, []byte("RIFF")) && bytes.HasPrefix(data[8:], []byte("WEBP")):
		return "webp"
	default:
		return "unknown"
	}
}
