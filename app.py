import os
import json
from datetime import datetime
import pickle
from flask import Flask, render_template, jsonify, send_from_directory, request, redirect, url_for
from flask_babel import Babel, gettext as _
from collections import defaultdict, OrderedDict
from urllib.parse import unquote
from send2trash import send2trash
import re
from PIL import Image
import configparser
from translations import translations  # 导入translations
from cache_utils import load_cache, save_cache, get_cache, set_cache
from image_utils import get_all_images, get_image_info, check_for_changes, update_last_modified_times
import webbrowser
from threading import Thread
import argparse

app = Flask(__name__)
babel = Babel(app)

config_parser = configparser.ConfigParser()
CONFIG_FILE = 'config.ini'

def load_config():
    global IMAGES_DIRS, ALLOW_DELETE_IMAGE, SCAN_SUBDIRECTORIES, FILE_TYPES, EXCLUDE_DIRS
    if os.path.exists(CONFIG_FILE):
        config_parser.read(CONFIG_FILE)
        IMAGES_DIRS = [dir.strip() for dir in config_parser.get('settings', 'images_dirs', fallback='').split(',') if dir.strip()]
        ALLOW_DELETE_IMAGE = config_parser.getboolean('settings', 'allow_delete_image', fallback=False)
        SCAN_SUBDIRECTORIES = config_parser.getboolean('advanced', 'scan_subdirectories', fallback=True)
        FILE_TYPES = tuple(ext.strip().lower() for ext in config_parser.get('advanced', 'file_types', fallback='.png,.jpg,.jpeg,.gif,.webp').split(','))
        EXCLUDE_DIRS = set(dir.strip() for dir in config_parser.get('advanced', 'exclude_dirs', fallback='thumbnails,temp').split(','))
        return True
    return False

def get_locale():
    return request.accept_languages.best_match(['en', 'zh'])

babel.init_app(app, locale_selector=get_locale)

@app.route('/')
def index():
    if not load_config():
        return redirect(url_for('install'))
    locale = get_locale()
    return render_template('index.html', 
                           allow_delete_image=ALLOW_DELETE_IMAGE,
                           translations=translations[locale])

@app.route('/install', methods=['GET', 'POST'])
def install():
    if request.method == 'POST':
        config_parser['settings'] = {
            'images_dirs': request.form.get('imageDirs', ''),
            'allow_delete_image': 'True' if request.form.get('allowDelete') == 'on' else 'False'
        }
        
        config_parser['advanced'] = {
            'scan_subdirectories': 'True' if request.form.get('scanSubdirs') == 'on' else 'False',
            'file_types': request.form.get('fileTypes', '.png,.jpg,.jpeg,.gif,.webp'),
            'exclude_dirs': request.form.get('excludeDirs', 'thumbnails,temp')
        }
        
        with open(CONFIG_FILE, 'w') as configfile:
            config_parser.write(configfile)
        
        load_config()
        return jsonify({'success': True})
    
    locale = get_locale()
    return render_template('install.html', translations=translations[locale])

@app.route('/api/images')
def get_images():
    images = get_all_images(IMAGES_DIRS, SCAN_SUBDIRECTORIES, FILE_TYPES, EXCLUDE_DIRS)
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
    locale = get_locale()
    filename = unquote(filename)
    relative_path = filename.replace('images/', '', 1).replace('/', os.sep)
    
    for base_dir in IMAGES_DIRS:
        file_path = os.path.join(base_dir, relative_path)
        if os.path.exists(file_path):
            try:
                workflow_info = {}
                with Image.open(file_path) as img:
                    metadata = img.info
                
                if 'workflow' in metadata:
                    workflow_info = json.loads(metadata['workflow'])
                else:
                    with open(file_path, 'rb') as f:
                        content = f.read()
                        start = content.rfind(b'{')
                        end = content.rfind(b'}') + 1
                        if start != -1 and end != -1:
                            json_data = content[start:end].decode('utf-8', errors='ignore')
                            json_data = re.sub(r'[\x00-\x1F\x7F-\x9F]', '', json_data)
                            workflow_info = json.loads(json_data)
                
                if workflow_info:
                    return jsonify(workflow_info)
                else:
                    return jsonify({"error": translations[locale]['metadata_not_found']})
            except json.JSONDecodeError as e:
                return jsonify({"error": f"{translations[locale]['json_decode_error']}: {str(e)}", "raw_data": json_data})
            except Exception as e:
                return jsonify({"error": f"{translations[locale]['cannot_read_metadata']}: {str(e)}"})
    
    return jsonify({"error": f"{translations[locale]['file_not_found']}: {filename}"})

@app.route('/api/delete_image', methods=['POST'])
def delete_image():
    locale = get_locale()
    if not ALLOW_DELETE_IMAGE:
        return jsonify({"success": False, "error": translations[locale]['delete_disabled']}), 403

    data = request.json
    image_path = data.get('image_path')
    if not image_path:
        return jsonify({"success": False, "error": "未提供图片路径"}), 400

    for base_dir in IMAGES_DIRS:
        full_path = os.path.join(base_dir, os.path.relpath(image_path, '/images'))
        if os.path.exists(full_path):
            try:
                send2trash(full_path)
                
                # 从缓存中删除特定图片记录
                image_cache = get_cache()
                if image_cache is not None:
                    for date, images in image_cache.items():
                        image_cache[date] = [img for img in images if img['path'] != image_path]
                        if not image_cache[date]:
                            del image_cache[date]
                
                # 保存更新后的缓存
                set_cache(image_cache)
                save_cache()
                
                # 更新最后修改时间
                update_last_modified_times(IMAGES_DIRS)
                
                return jsonify({"success": True})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

    return jsonify({"success": False, "error": translations[locale]['file_not_found']}), 404

@app.route('/api/refresh')
def refresh_images():
    global IMAGES_DIRS
    config_parser.read(CONFIG_FILE)
    IMAGES_DIRS = [dir.strip() for dir in config_parser.get('settings', 'images_dirs').split(',')]
    
    try:
        # 直接重建缓存，不检查变化
        set_cache(None)
        images = get_all_images(IMAGES_DIRS, SCAN_SUBDIRECTORIES, FILE_TYPES, EXCLUDE_DIRS)
        update_last_modified_times(IMAGES_DIRS)
        return jsonify({"refreshed": True, "images": images})
    except Exception as e:
        app.logger.error(f"Error in refresh_images: {str(e)}")
        return jsonify({"error": str(e)}), 500

def open_browser(host, port):
    webbrowser.open(f'http://{host}:{port}')

# 移除 @app.before_first_request 装饰器
def start_browser():
    Thread(target=open_browser).start()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ComfyUI Moments Server')
    parser.add_argument('--listen', type=str, default='127.0.0.1', help='IP address to listen on')
    parser.add_argument('--port', type=int, default=5000, help='Port to listen on')
    args = parser.parse_args()

    load_cache()
    if load_config():
        update_last_modified_times(IMAGES_DIRS)
    
    # 在应用启动后立即启动浏览器，不再限制IP
    Thread(target=open_browser, args=(args.listen, args.port)).start()
    
    app.run(debug=False, host=args.listen, port=args.port)