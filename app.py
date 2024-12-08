import os
import json
from datetime import datetime
import pickle
from flask import Flask, render_template, jsonify, send_from_directory, request, redirect, url_for, send_file, abort
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
import subprocess
from functools import lru_cache
import logging
import platform
from prompt_utils import get_all_prompts

app = Flask(__name__)
babel = Babel(app)

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

config_parser = configparser.ConfigParser()
CONFIG_FILE = 'config.ini'
EXAMPLE_CONFIG_FILE = 'config.ini.example'

# 全局变量
IMAGES_DIRS = []
ALLOW_DELETE_IMAGE = False
ALLOW_OPEN_DIRECTORY = False
ALLOW_INSTALL_PAGE = True
SCAN_SUBDIRECTORIES = True
FILE_TYPES = ()
EXCLUDE_DIRS = set()

def load_config():
    global IMAGES_DIRS, ALLOW_DELETE_IMAGE, ALLOW_OPEN_DIRECTORY, ALLOW_INSTALL_PAGE, SCAN_SUBDIRECTORIES, FILE_TYPES, EXCLUDE_DIRS
    if os.path.exists(CONFIG_FILE):
        config_parser.read(CONFIG_FILE)
        IMAGES_DIRS = [dir.strip() for dir in config_parser.get('settings', 'images_dirs', fallback='').split(',') if dir.strip()]
        ALLOW_DELETE_IMAGE = config_parser.getboolean('settings', 'allow_delete_image', fallback=False)
        ALLOW_OPEN_DIRECTORY = config_parser.getboolean('settings', 'allow_open_directory', fallback=True)
        ALLOW_INSTALL_PAGE = config_parser.getboolean('settings', 'allow_install_page', fallback=True)
        SCAN_SUBDIRECTORIES = config_parser.getboolean('advanced', 'scan_subdirectories', fallback=True)
        FILE_TYPES = tuple(ext.strip().lower() for ext in config_parser.get('advanced', 'file_types', fallback='.png,.jpg,.jpeg,.gif,.webp').split(','))
        EXCLUDE_DIRS = set(dir.strip() for dir in config_parser.get('advanced', 'exclude_dirs', fallback='thumbnails,temp').split(','))
        return True
    return False

# 使用 LRU 缓存来存储文件路径
@lru_cache(maxsize=1000)
def find_image_path(filename):
    for base_dir in IMAGES_DIRS:
        file_path = os.path.join(base_dir, filename)
        if os.path.exists(file_path):
            return file_path
    return None

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
                           allow_open_directory=ALLOW_OPEN_DIRECTORY,
                           translations=translations[locale])

@app.route('/install', methods=['GET', 'POST'])
def install():
    if not ALLOW_INSTALL_PAGE:
        abort(403, description="Install page is disabled")
        
    if request.method == 'POST':
        config_parser['settings'] = {
            'images_dirs': request.form.get('images_dirs', ''),
            'allow_delete_image': 'True' if request.form.get('allow_delete_image') == 'on' else 'False',
            'allow_open_directory': 'True' if request.form.get('allow_open_directory') == 'on' else 'False',
            'allow_install_page': 'True' if request.form.get('allow_install_page') == 'on' else 'False'
        }
        
        config_parser['advanced'] = {
            'scan_subdirectories': 'True' if request.form.get('scan_subdirectories') == 'on' else 'False',
            'file_types': request.form.get('file_types', '.png,.jpg,.jpeg,.gif,.webp'),
            'exclude_dirs': request.form.get('exclude_dirs', 'thumbnails,temp')
        }
        
        with open(CONFIG_FILE, 'w') as configfile:
            config_parser.write(configfile)
        
        load_config()
        return jsonify({'success': True})
    
    locale = get_locale()
    config_content = load_config_content()
    return render_template('install.html', translations=translations[locale], config_content=config_content)

def load_config_content():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as file:
            return file.read()
    else:
        with open(EXAMPLE_CONFIG_FILE, 'r') as file:
            return file.read()

@app.route('/api/images')
def get_images():
    images = get_all_images(IMAGES_DIRS, SCAN_SUBDIRECTORIES, FILE_TYPES, EXCLUDE_DIRS)
    return jsonify(images)

@app.route('/images/<path:filename>')
def serve_image(filename):
    try:
        file_path = find_image_path(filename)
        if file_path:
            return send_file(file_path, conditional=True)
        else:
            logger.warning(f"Image not found: {filename}")
            abort(404)
    except Exception as e:
        logger.error(f"Error serving image {filename}: {str(e)}")
        abort(500)

@app.route('/api/image_info', methods=['POST'])
def get_image_metadata():
    locale = get_locale()
    data = request.json
    filename = data.get('filename')
    if not filename:
        return jsonify({"error": "未提供文件名"}), 400

    for base_dir in IMAGES_DIRS:
        file_path = os.path.join(base_dir, filename.replace('/images/', '', 1))
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
        # 检查是否有变化
        if check_for_changes(CONFIG_FILE, IMAGES_DIRS):
            # 重新构建缓存
            set_cache(None)
            images = get_all_images(IMAGES_DIRS, SCAN_SUBDIRECTORIES, FILE_TYPES, EXCLUDE_DIRS)
            update_last_modified_times(IMAGES_DIRS)
            return jsonify({"refreshed": True, "images": images})
        else:
            # 使用现有缓存
            images = get_cache()
            return jsonify({"refreshed": False, "images": images})
    except Exception as e:
        app.logger.error(f"Error in refresh_images: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/open_file_location', methods=['POST'])
def open_file_location():
    if not ALLOW_OPEN_DIRECTORY:
        return jsonify({
            'success': False, 
            'message': 'Open directory is not allowed in current configuration.'
        }), 403

    try:
        data = request.get_json()
        filename = data.get('filename')
        if not filename:
            return jsonify({"success": False, "message": "Filename is required"}), 400

        for base_dir in IMAGES_DIRS:
            full_path = os.path.join(base_dir, os.path.relpath(filename, '/images'))
            print(full_path)
            if os.path.exists(full_path):
                if os.name == 'nt':  # Windows
                    # 使用子进程打开资源管理器并选择文件
                    subprocess.Popen(['explorer', '/select,', full_path])
                    import time
                    import win32gui
                    import win32con

                    # 等待资源管理器窗口打开
                    time.sleep(0.5)

                    def set_window_topmost(hwnd, lParam):
                        if win32gui.IsWindowVisible(hwnd) and full_path.lower() in win32gui.GetWindowText(hwnd).lower():
                            win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, 0, 0, 0, 0,
                                                    win32con.SWP_NOMOVE | win32con.SWP_NOSIZE)

                    # 枚举所有窗口并将资源管理器窗口置顶
                    win32gui.EnumWindows(set_window_topmost, None)

                elif os.name == 'posix':  # macOS 和 Linux
                    if platform.system() == 'Darwin':  # macOS
                        # 使用 open 命令揭示文件
                        subprocess.run(['open', '-R', full_path])
                        # 使用 AppleScript 将 Finder 窗口置顶
                        applescript = f'''
                        tell application "Finder"
                            activate
                            reveal POSIX file "{full_path}"
                        end tell
                        '''
                        subprocess.run(['osascript', '-e', applescript])
                    else:  # Linux
                        # 使用 xdg-open 打开文件所在目录
                        subprocess.run(['xdg-open', os.path.dirname(full_path)])
                        # 使用 wmctrl 将文件管理器窗口置顶
                        subprocess.run(['wmctrl', '-r', ':ACTIVE:', '-b', 'add,above'])
        return jsonify({"success": False, "message": "File not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

def open_browser(host, port):
    webbrowser.open(f'http://{host}:{port}')

# 移除 @app.before_first_request
def start_browser():
    Thread(target=open_browser).start()

@app.route('/prompts')
def prompts():
    if not load_config():
        return redirect(url_for('install'))
    locale = get_locale()
    return render_template('prompts.html', 
                         allow_delete_image=ALLOW_DELETE_IMAGE,
                         allow_open_directory=ALLOW_OPEN_DIRECTORY,
                         translations=translations[locale])

@app.route('/api/prompts')
def get_prompts():
    if not load_config():
        return jsonify({"error": "Configuration not found"}), 404
    
    from cache_utils import get_last_modified_times
    from prompt_utils import load_prompts_cache, check_prompts_cache_valid
    
    # 检查缓存是否有效
    if not check_prompts_cache_valid(IMAGES_DIRS, get_last_modified_times()):
        return jsonify({
            "error": "Cache is outdated. Please run extract_prompts.py to update the cache."
        }), 409
    
    # 直接从缓存文件读取
    prompts_data = load_prompts_cache()
    if not prompts_data:
        return jsonify({
            "error": "No prompts cache found. Please run extract_prompts.py first."
        }), 404
    
    # 将有序字典转换为数组
    prompts_array = [
        {
            'hash': prompt_hash,
            'text': prompts_data['prompt_text'][prompt_hash],
            'images': images
        }
        for prompt_hash, images in prompts_data['prompt_map'].items()
    ]
    
    response_data = {
        'prompts': prompts_array,
        'stats': prompts_data['stats']
    }
    
    return jsonify(response_data)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ComfyUI Moments Server')
    parser.add_argument('--listen', type=str, default='127.0.0.1', help='IP address to listen on')
    parser.add_argument('--port', type=int, default=5000, help='Port to listen on')
    args = parser.parse_args()

    load_cache()
    if load_config():
        # 更新图片缓存
        get_all_images(IMAGES_DIRS, SCAN_SUBDIRECTORIES, FILE_TYPES, EXCLUDE_DIRS)
    
    # 在应用启动后立即启动浏览器，不再限制IP
    Thread(target=open_browser, args=(args.listen, args.port)).start()
    
    app.run(debug=False, host=args.listen, port=args.port)

# 在应用启动时预热缓存
@app.before_first_request
def warm_up_cache():
    logger.info("Warming up image path cache...")
    for base_dir in IMAGES_DIRS:
        for root, _, files in os.walk(base_dir):
            for file in files:
                if file.lower().endswith(FILE_TYPES):
                    relative_path = os.path.relpath(os.path.join(root, file), base_dir)
                    find_image_path(relative_path)
    logger.info("Image path cache warm-up complete.")
