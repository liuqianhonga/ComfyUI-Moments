import os
import configparser
from prompt_utils import scan_images_for_prompts
from cache_utils import get_last_modified_times, set_last_modified_times, set_last_config_mtime

def load_config():
    config_parser = configparser.ConfigParser()
    CONFIG_FILE = 'config.ini'
    
    if os.path.exists(CONFIG_FILE):
        config_parser.read(CONFIG_FILE)
        IMAGES_DIRS = [dir.strip() for dir in config_parser.get('settings', 'images_dirs', fallback='').split(',') if dir.strip()]
        FILE_TYPES = tuple(ext.strip().lower() for ext in config_parser.get('advanced', 'file_types', fallback='.png,.jpg,.jpeg,.gif,.webp').split(','))
        return IMAGES_DIRS, FILE_TYPES
    return None, None

def main():
    print("开始提取提示词...")
    
    # 加载配置
    IMAGES_DIRS, FILE_TYPES = load_config()
    if not IMAGES_DIRS:
        print("错误：找不到配置文件或图片目录未配置")
        return
    
    # 提取提示词
    print(f"正在从以下目录提取提示词：")
    for dir in IMAGES_DIRS:
        print(f"- {dir}")
    
    prompts_data = scan_images_for_prompts(IMAGES_DIRS, FILE_TYPES)
    
    # 更新最后修改时间
    last_modified_times = {}
    for dir in IMAGES_DIRS:
        last_modified_times[dir] = os.path.getmtime(dir)
    set_last_modified_times(last_modified_times)
    
    print("\n提取完成！")
    print(f"处理统计：")
    print(f"- 成功处理: {prompts_data['stats']['processed']} 个文件")
    print(f"- 处理失败: {prompts_data['stats']['failed']} 个文件")
    print(f"- 空提示词: {prompts_data['stats']['empty']} 个文件")
    print(f"- 不同提示词数量: {len(prompts_data['prompt_text'])} 个")

if __name__ == '__main__':
    main() 