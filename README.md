# ComfyUI Moments

这是一个专门用于浏览和管理 ComfyUI 生成的图片文件，当然其他目录的图片也可以。它支持按日期查看图片，显示详细的图片工作流信息，并可以方便将图片移动到回收站。

## 功能特点

- 按日期浏览 ComfyUI 生成的图片
- 显示详细的图片元数据，包括 ComfyUI 工作流信息
- 支持将图片移动到系统回收站
- 响应式设计，适配桌面和移动设备
- 简洁直观的用户界面

## 安装

1. 确保您已安装 Python 3.7 或更高版本。

2. 克隆仓库：
``` bash
git clone https://github.com/liuqianhonga/ComfyUI-Moments.git
cd ComfyUI-Moments
```

3. 安装依赖：
``` bash
pip install -r requirements.txt
```

## 配置

1. 打开 `config.ini` 文件。
2. 在 `IMAGES_DIR` 设置中，指定您的 ComfyUI 输出目录路径：
3. 设置 `ALLOW_DELETE_IMAGE` 为 `True` 或 `False` 来启用或禁用删除图片功能：

``` ini
[settings]
IMAGES_DIR = E:\ComfyUI\output
ALLOW_DELETE_IMAGE = True
```

## 运行应用

在项目根目录下执行：

``` bash
python app.py
```

## 访问应用

在浏览器中访问 `http://127.0.0.1:5000`，即可看到图片浏览器界面。

## 使用说明

1. 主页面会按日期显示所有图片。
2. 点击图片可以查看大图和详细元数据。
3. 在图片详情页面，可以查看 ComfyUI 工作流信息。
4. 使用删除按钮可以将图片移动到系统回收站。

## 项目结构
.
├── app.py # Flask 应用主文件
├── config.ini # 配置文件
├── requirements.txt # Python 依赖列表
├── README.md # 项目说明文档
└── templates
└── index.html # 主页面模板

## 许可证

本项目采用 MIT 许可证。详情请见 [LICENSE](LICENSE) 文件。

## 致谢

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - 强大的 Stable Diffusion 图形界面
- [Flask](https://flask.palletsprojects.com/) - Python Web 框架
- [Pillow](https://python-pillow.org/) - Python 图像处理库
- [send2trash](https://github.com/hsoft/send2trash) - 跨平台的回收站操作库