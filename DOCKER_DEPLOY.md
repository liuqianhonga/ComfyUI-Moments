# ComfyUI-Moments Docker 部署指南

ComfyUI-Moments 是一个专门用于浏览和管理 ComfyUI 生成的图片文件的工具。本文档详细说明如何使用 Docker 部署 ComfyUI-Moments 应用。

## 前置要求

- Docker Engine (版本 19.03.0+)
- Docker Compose (版本 1.27.0+)
- 至少 2GB 可用内存
- 至少 1GB 可用磁盘空间（取决于你的图片数量）

## 部署步骤

### 1. 准备工作

1. 克隆项目仓库：
```bash
git clone https://github.com/liuqianhonga/ComfyUI-Moments.git
cd ComfyUI-Moments
```

2. 准备图片目录：
   - 如果你使用 ComfyUI，这通常是 ComfyUI 的 output 目录
   - 或者创建一个新目录用于存储图片
   - 记录该目录的绝对路径，稍后需要使用

### 2. 配置文件说明

项目包含以下 Docker 相关的配置文件：
- `config.ini.docker`: Docker 环境的配置文件，包含图片目录设置
- `docker-compose.yml`: Docker 编排配置文件，定义服务和卷映射
- `Dockerfile`: Docker 镜像构建文件，定义运行环境

配置项说明：
1. `config.ini.docker` 中的主要设置：
   ```ini
   [settings]
   images_dirs = /app/images      # 容器内的图片目录路径
   allow_delete_image = True      # 是否允许删除图片

   [advanced]
   scan_subdirectories = True     # 是否扫描子目录
   file_types = .png,.jpg,.jpeg,.gif,.webp  # 支持的图片格式
   exclude_dirs = thumbnails,temp # 排除的目录
   ```

### 3. 构建和启动容器

#### 基本启动方式（使用默认图片目录）
```bash
# 创建默认图片目录
mkdir images
# 启动服务
docker-compose up -d
```

#### 使用自定义图片目录（推荐）

Windows CMD:
```cmd
# 设置环境变量并启动（CMD）
set IMAGES_DIR=D:\path\to\your\images
docker-compose up -d
```

Windows PowerShell:
```powershell
# 设置环境变量并启动（PowerShell）
$env:IMAGES_DIR = "D:\path\to\your\images"
docker-compose up -d
```

Linux/Unix 系统（包括群晖 NAS）
```bash
# 方法1：使用 sudo -E 保留环境变量
IMAGES_DIR=/volume2/ComfyUI/output sudo -E docker-compose up -d

# 方法2：先导出环境变量
export IMAGES_DIR=/volume2/ComfyUI/output
sudo docker-compose up -d
```

注意事项：
1. 在使用 sudo 时，需要特别注意环境变量的传递：
   - 使用 `sudo -E` 可以保留环境变量
   - 或者使用 `export` 先设置环境变量
2. 群晖 NAS 的路径说明：
   - 共享文件夹通常在 `/volume1`、`/volume2` 等目录下
   - 确保目录有正确的读写权限
3. 验证映射是否成功：
```bash
sudo docker-compose exec comfyui-moments ls -l /app/images
```

### 4. 验证部署

1. 等待几秒钟让服务完全启动
2. 访问 http://localhost:7860 
3. 首次访问时会自动进入配置页面，配置已经预设好，直接点击"完成安装"即可

## 常用操作命令

### 查看容器日志
```bash
# 查看实时日志
docker-compose logs -f
# 查看最近的100行日志
docker-compose logs --tail=100
```

### 停止服务
```bash
docker-compose down
```

### 重新构建并启动（代码更新后）
```bash
docker-compose up -d --build
```

### 查看容器状态
```bash
docker-compose ps
```

## 数据持久化

以下数据通过 Docker volumes 持久化保存：
- 图片文件：映射到容器的 `/app/images`
- 缓存文件：`image_cache.pkl` 和 `prompts_cache.pkl`
- 静态文件：`/app/static`
- 模板文件：`/app/templates`
- 配置文件：`config.ini`

## 注意事项

1. **权限设置**
   - 确保图片目录具有适当的读写权限（如果启用了删除功能）
   - Docker 进程需要有足够的权限访问映射的目录

2. **资源考虑**
   - 如果图片数量较多，建议增加容器的内存限制
   - 确保图片存储目录有足够的磁盘空间

3. **安全建议**
   - 在生产环境中，建议配置反向代理（如 Nginx）
   - 根据需要限制访问IP和端口
   - 定期备份重要数据和配置文件

4. **故障排除**
   - 如果服务无法启动，检查日志：`docker-compose logs`
   - 确认 7860 端口未被占用
   - 验证图片目录路径是否正确
   - 检查图片目录权限是否正确

## 升级流程

1. 拉取最新代码
```bash
git pull origin main
```

2. 重新构建并启动容器
```bash
docker-compose down
docker-compose up -d --build
```

## 常见问题

1. **Q: 容器启动后访问 localhost:7860 无响应？**
   A: 检查防火墙设置，确认端口未被占用，查看容器日志是否有错误信息。

2. **Q: 如何修改访问端口？**
   A: 在 `docker-compose.yml` 中修改 ports 映射，例如改为 "8080:7860"。

3. **Q: 图片无法显示或无法删除？**
   A: 检查图片目录的权限设置，确保容器内的用户有足够的权限访问和修改文件。

4. **Q: 如何备份数据？**
   A: 主要备份以下内容：
   - 图片目录
   - `config.ini` 文件
   - `*_cache.pkl` 缓存文件

## 支持与反馈

如果遇到问题或需要帮助，请：
1. 查看项目 [Issues](https://github.com/liuqianhonga/ComfyUI-Moments/issues)
2. 提交新的 Issue
3. 在 [GitHub](https://github.com/liuqianhonga/ComfyUI-Moments) 上给项目点星支持
