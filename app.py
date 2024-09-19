import os
import json
from datetime import datetime
from flask import Flask, render_template, jsonify, send_from_directory, request
from flask_babel import Babel
from collections import defaultdict, OrderedDict
from urllib.parse import unquote
from send2trash import send2trash
import re
from PIL import Image
import configparser

app = Flask(__name__)
babel = Babel(app)

config = configparser.ConfigParser()
config.read('config.ini')

IMAGES_DIR = config.get('settings', 'IMAGES_DIR')
ALLOW_DELETE_IMAGE = config.getboolean('settings', 'ALLOW_DELETE_IMAGE')

def get_image_info(file_path):
    modification_time = os.path.getmtime(file_path)
    relative_path = os.path.relpath(file_path, IMAGES_DIR)
    return {
        "path": f"/images/{relative_path.replace(os.sep, '/')}",
        "creation_time": modification_time
    }

def get_all_images():
    images = defaultdict(list)
    for root, _, files in os.walk(IMAGES_DIR):
        for file in files:
            if file.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                file_path = os.path.join(root, file)
                image_info = get_image_info(file_path)
                date = datetime.fromtimestamp(image_info["creation_time"]).date()
                images[date].append(image_info)
    
    for date in images:
        images[date] = sorted(images[date], key=lambda x: x["creation_time"], reverse=True)
    
    sorted_images = OrderedDict(sorted(images.items(), key=lambda x: x[0], reverse=True))
    
    return OrderedDict((date.strftime("%Y-%m-%d"), imgs) for date, imgs in sorted_images.items())

def get_locale():
    return request.accept_languages.best_match(['en', 'zh'])

# 将 get_locale 函数定义移到这里
babel.init_app(app, locale_selector=get_locale)

translations = {
    'en': {
        'delete_confirm': 'Are you sure you want to delete this image?',
        'yes': 'Yes',
        'no': 'No',
        'refresh': 'Refresh',
        'loading': 'Loading...',
        'error_loading': 'Error loading images. Please try again later.',
        'delete_error': 'Error deleting image',
        'delete_disabled': 'Delete function is disabled'
    },
    'zh': {
        'delete_confirm': '您确定要删除这张图片吗？',
        'yes': '是',
        'no': '否',
        'refresh': '刷新',
        'loading': '加载中...',
        'error_loading': '加载图片时出错，请稍后再试。',
        'delete_error': '删除图片失败',
        'delete_disabled': '删除功能已被禁用'
    }
}

@app.route('/')
def index():
    locale = get_locale()
    return render_template('index.html', 
                           allow_delete_image=ALLOW_DELETE_IMAGE,
                           translations=translations[locale])

@app.route('/api/images')
def get_images():
    return jsonify(get_all_images())

@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMAGES_DIR, filename)

@app.route('/api/image_info/<path:filename>')
def get_image_metadata(filename):
    # 解码 URL 编码的文件名
    filename = unquote(filename)
    # 移除开头的 'images/' 并将剩余路径转换为操作系统路径
    relative_path = filename.replace('images/', '', 1).replace('/', os.sep)
    # 构建完整的文件路径
    file_path = os.path.join(IMAGES_DIR, relative_path)
    
    if not os.path.exists(file_path):
        return jsonify({"error": f"文件未找到: {file_path}"})

    try:
        with Image.open(file_path) as img:
            metadata = img.info
        
        # 剩余的代码保持不变
        if 'prompt' in metadata:
            params = metadata['prompt']
            match = re.search(r'{.*}', params)
            if match:
                json_str = match.group(0)
                workflow_info = json.loads(json_str)
                return jsonify(workflow_info)
            else:
                return jsonify({"prompt": params})
        else:
            with open(file_path, 'rb') as f:
                content = f.read()
                start = content.rfind(b'{')
                end = content.rfind(b'}') + 1
                if start != -1 and end != -1:
                    json_data = content[start:end].decode('utf-8', errors='ignore')
                    json_data = re.sub(r'[\x00-\x1F\x7F-\x9F]', '', json_data)
                    workflow_info = json.loads(json_data)
                    return jsonify(workflow_info)
                
        return jsonify({"error": "未找到元数据"})
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON 解码错误: {str(e)}", "raw_data": json_data})
    except Exception as e:
        print(f"读取图片元数据时出错: {e}")
        return jsonify({"error": f"无法读取图片元数据: {str(e)}"})
    
@app.route('/api/delete_image', methods=['POST'])
def delete_image():
    if not ALLOW_DELETE_IMAGE:
        return jsonify({"success": False, "error": "删除图片功能已被禁用"}), 403

    data = request.json
    image_path = data.get('image_path')
    if not image_path:
        return jsonify({"success": False, "error": "未提供图片路径"}), 400

    full_path = os.path.join(IMAGES_DIR, os.path.relpath(image_path, '/images'))
    if not os.path.exists(full_path):
        return jsonify({"success": False, "error": "图片未找到"}), 404

    try:
        send2trash(full_path)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)