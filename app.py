import os
import json
from datetime import datetime
from flask import Flask, render_template, jsonify, send_from_directory, request
from collections import defaultdict, OrderedDict
from urllib.parse import unquote
from send2trash import send2trash  # 新增这行
import re
from PIL import Image
import configparser

app = Flask(__name__)

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
    
    # 对每个日期内的图片按时间倒序排序
    for date in images:
        images[date] = sorted(images[date], key=lambda x: x["creation_time"], reverse=True)
    
    # 对日期进行倒序排序
    sorted_images = OrderedDict(sorted(images.items(), key=lambda x: x[0], reverse=True))
    
    # 将日期对象转换回字符串格式
    return OrderedDict((date.strftime("%Y-%m-%d"), imgs) for date, imgs in sorted_images.items())

@app.route('/')
def index():
    return render_template('index.html', allow_delete_image=ALLOW_DELETE_IMAGE)

@app.route('/api/images')
def get_images():
    return jsonify(get_all_images())

@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMAGES_DIR, filename)

@app.route('/api/image_info/<path:filename>')
def get_image_metadata(filename):
    # 解码文件名
    filename = unquote(filename)
    file_path = os.path.join(IMAGES_DIR, filename)
    
    # 检查文件是否存在
    if not os.path.exists(file_path):
        return jsonify({"error": f"File not found: {file_path}"})


    try:
        with Image.open(file_path) as img:
            metadata = img.info
            
        if 'prompt' in metadata:
            # ComfyUI 通常将元数据存储在 'parameters' 字段中
            params = metadata['prompt']
            # 使用正则表达式提取 JSON 部分
            match = re.search(r'{.*}', params)
            if match:
                json_str = match.group(0)
                workflow_info = json.loads(json_str)
                return jsonify(workflow_info)
            else:
                return jsonify({"prompt": params})
        else:
            # 如果没有 'parameters' 字段，尝试读取整个文件内容
            with open(file_path, 'rb') as f:
                content = f.read()
                start = content.rfind(b'{')
                end = content.rfind(b'}') + 1
                if start != -1 and end != -1:
                    json_data = content[start:end].decode('utf-8', errors='ignore')
                    # 使用正则表达式清理 JSON 字符串
                    json_data = re.sub(r'[\x00-\x1F\x7F-\x9F]', '', json_data)
                    workflow_info = json.loads(json_data)
                    return jsonify(workflow_info)
                
        return jsonify({"error": "No metadata found"})
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON decode error: {str(e)}", "raw_data": json_data})
    except Exception as e:
        print(f"Error reading image metadata: {e}")
        return jsonify({"error": f"Unable to read image metadata: {str(e)}"})
    
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