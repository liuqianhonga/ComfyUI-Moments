import os
import json
from datetime import datetime
import pickle
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

# 修改这里以支持多个目录
IMAGES_DIRS = [dir.strip() for dir in config.get('settings', 'IMAGES_DIRS').split(',')]
ALLOW_DELETE_IMAGE = config.getboolean('settings', 'ALLOW_DELETE_IMAGE')

# 添加新的配置项
SCAN_SUBDIRECTORIES = config.getboolean('advanced', 'SCAN_SUBDIRECTORIES', fallback=True)
FILE_TYPES = tuple(ext.strip().lower() for ext in config.get('advanced', 'FILE_TYPES', fallback='.png,.jpg,.jpeg,.gif,.webp').split(','))
EXCLUDE_DIRS = set(dir.strip() for dir in config.get('advanced', 'EXCLUDE_DIRS', fallback='thumbnails,temp').split(','))

# 添加缓存相关的全局变量
CACHE_FILE = 'image_cache.pkl'
last_modified_times = {}
image_cache = None
last_config_mtime = 0

def get_dir_last_modified_time(directory):
    try:
        return max(os.path.getmtime(os.path.join(root, file))
                   for root, _, files in os.walk(directory)
                   for file in files)
    except ValueError:  # 目录为空
        return 0

def check_for_changes():
    global last_modified_times, last_config_mtime
    
    # 检查 config.ini 是否有变化
    current_config_mtime = os.path.getmtime('config.ini')
    if current_config_mtime > last_config_mtime:
        return True
    
    for dir in IMAGES_DIRS:
        current_time = get_dir_last_modified_time(dir)
        if dir not in last_modified_times or current_time > last_modified_times[dir]:
            return True
    return False

def update_last_modified_times():
    global last_modified_times, last_config_mtime
    for dir in IMAGES_DIRS:
        last_modified_times[dir] = get_dir_last_modified_time(dir)
    last_config_mtime = os.path.getmtime('config.ini')

def load_cache():
    global image_cache
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'rb') as f:
            image_cache = pickle.load(f)
    else:
        image_cache = None

def save_cache():
    with open(CACHE_FILE, 'wb') as f:
        pickle.dump(image_cache, f)

def get_image_info(file_path):
    modification_time = os.path.getmtime(file_path)
    for base_dir in IMAGES_DIRS:
        if file_path.startswith(base_dir):
            relative_path = os.path.relpath(file_path, base_dir)
            return {
                "path": f"/images/{relative_path.replace(os.sep, '/')}",
                "creation_time": modification_time
            }
    return None

def get_all_images():
    global image_cache
    if image_cache is None or check_for_changes():
        images = defaultdict(list)
        for base_dir in IMAGES_DIRS:
            for root, dirs, files in os.walk(base_dir):
                if not SCAN_SUBDIRECTORIES and root != base_dir:
                    continue
                if os.path.basename(root) in EXCLUDE_DIRS:
                    continue
                for file in files:
                    if file.lower().endswith(FILE_TYPES):
                        file_path = os.path.join(root, file)
                        image_info = get_image_info(file_path)
                        if image_info:
                            date = datetime.fromtimestamp(image_info["creation_time"]).date()
                            images[date].append(image_info)
        
        for date in images:
            images[date] = sorted(images[date], key=lambda x: x["creation_time"], reverse=True)
        
        sorted_images = OrderedDict(sorted(images.items(), key=lambda x: x[0], reverse=True))
        
        image_cache = OrderedDict((date.strftime("%Y-%m-%d"), imgs) for date, imgs in sorted_images.items())
        save_cache()
        update_last_modified_times()
    
    return image_cache

def get_locale():
    return request.accept_languages.best_match(['en', 'zh'])

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
        'delete_disabled': 'Delete function is disabled',
        'refresh_success': 'Refresh successful',
        'no_new_images': 'No new images found'
    },
    'zh': {
        'delete_confirm': '您确定要删除这张图片吗？',
        'yes': '是',
        'no': '否',
        'refresh': '刷新',
        'loading': '加载中...',
        'error_loading': '加载图片时出错，请稍后再试。',
        'delete_error': '删除图片失败',
        'delete_disabled': '删除功能已被禁用',
        'refresh_success': '刷新成功',
        'no_new_images': '没有发现新图片'
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
    images = get_all_images()
    return jsonify(images)

@app.route('/images/<path:filename>')
def serve_image(filename):
    for base_dir in IMAGES_DIRS:
        file_path = os.path.join(base_dir, filename)
        if os.path.exists(file_path):
            return send_from_directory(base_dir, filename)
    return "Image not found", 404

@app.route('/api/image_info/<path:filename>')
def get_image_metadata(filename):
    filename = unquote(filename)
    relative_path = filename.replace('images/', '', 1).replace('/', os.sep)
    
    for base_dir in IMAGES_DIRS:
        file_path = os.path.join(base_dir, relative_path)
        if os.path.exists(file_path):
            try:
                with Image.open(file_path) as img:
                    metadata = img.info
        
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
    
    return jsonify({"error": f"文件未找到: {filename}"})

@app.route('/api/delete_image', methods=['POST'])
def delete_image():
    if not ALLOW_DELETE_IMAGE:
        return jsonify({"success": False, "error": "删除图片功能已被禁用"}), 403

    data = request.json
    image_path = data.get('image_path')
    if not image_path:
        return jsonify({"success": False, "error": "未提供图片路径"}), 400

    for base_dir in IMAGES_DIRS:
        full_path = os.path.join(base_dir, os.path.relpath(image_path, '/images'))
        if os.path.exists(full_path):
            try:
                send2trash(full_path)
                return jsonify({"success": True})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

    return jsonify({"success": False, "error": "图片未找到"}), 404

@app.route('/api/refresh')
def refresh_images():
    global image_cache, IMAGES_DIRS
    config.read('config.ini')
    IMAGES_DIRS = [dir.strip() for dir in config.get('settings', 'IMAGES_DIRS').split(',')]
    
    try:
        if check_for_changes():
            image_cache = None
            images = get_all_images()
            update_last_modified_times()
            return jsonify({"refreshed": True, "images": images})
        return jsonify({"refreshed": False})
    except Exception as e:
        app.logger.error(f"Error in refresh_images: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    load_cache()
    update_last_modified_times()
    app.run(debug=True)