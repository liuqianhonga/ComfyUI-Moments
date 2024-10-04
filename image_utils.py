import os
from datetime import datetime
from collections import defaultdict, OrderedDict
from cache_utils import get_last_modified_times, set_last_modified_times, get_last_config_mtime, set_last_config_mtime, get_cache, set_cache, save_cache

CONFIG_FILE = 'config.ini'  # 改回 'config.ini'

def get_dir_last_modified_time(directory):
    try:
        return max(os.path.getmtime(os.path.join(root, file))
                   for root, _, files in os.walk(directory)
                   for file in files)
    except ValueError:  # 目录为空
        return 0

def check_for_changes(config_file, image_dirs):  # 恢复 config_file 参数
    last_modified_times = get_last_modified_times()
    last_config_mtime = get_last_config_mtime()
    
    # 检查 config.ini 是否有变化
    current_config_mtime = os.path.getmtime(config_file)
    if current_config_mtime > last_config_mtime:
        return True
    
    for dir in image_dirs:
        current_time = get_dir_last_modified_time(dir)
        if dir not in last_modified_times or current_time > last_modified_times[dir]:
            return True
    
    print("No changes detected")    
    return False

def update_last_modified_times(image_dirs):
    last_modified_times = {}
    for dir in image_dirs:
        last_modified_times[dir] = get_dir_last_modified_time(dir)
    set_last_modified_times(last_modified_times)
    set_last_config_mtime(os.path.getmtime(CONFIG_FILE))

def get_image_info(file_path, base_dirs):
    modification_time = os.path.getmtime(file_path)
    for base_dir in base_dirs:
        if file_path.startswith(base_dir):
            relative_path = os.path.relpath(file_path, base_dir)
            return {
                "path": f"/images/{relative_path.replace(os.sep, '/')}",
                "creation_time": modification_time
            }
    return None

def get_all_images(image_dirs, scan_subdirectories, file_types, exclude_dirs):
    image_cache = get_cache()
    if image_cache is None or check_for_changes(CONFIG_FILE, image_dirs):
        images = defaultdict(list)
        for base_dir in image_dirs:
            for root, dirs, files in os.walk(base_dir):
                if not scan_subdirectories and root != base_dir:
                    continue
                if os.path.basename(root) in exclude_dirs:
                    continue
                for file in files:
                    if file.lower().endswith(file_types):
                        file_path = os.path.join(root, file)
                        image_info = get_image_info(file_path, image_dirs)
                        if image_info:
                            date = datetime.fromtimestamp(image_info["creation_time"]).date()
                            images[date].append(image_info)
        
        for date in images:
            images[date] = sorted(images[date], key=lambda x: x["creation_time"], reverse=True)
        
        sorted_images = OrderedDict(sorted(images.items(), key=lambda x: x[0], reverse=True))
        
        image_cache = OrderedDict((date.strftime("%Y-%m-%d"), imgs) for date, imgs in sorted_images.items())
        set_cache(image_cache)
        save_cache()
        update_last_modified_times(image_dirs)
    
    return image_cache