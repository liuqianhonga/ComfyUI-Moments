import os
import json
import hashlib
import pickle
from PIL import Image
from collections import defaultdict
from datetime import datetime

PROMPTS_CACHE_FILE = 'prompts_cache.pkl'

def extract_prompts_from_workflow(workflow):
    """从工作流中提取提示词"""
    prompts = []
    try:
        if workflow.get('nodes'):
            for node in workflow['nodes']:
                if (node.get('type') == "CLIPTextEncode" and 
                    node.get('outputs') and 
                    node['outputs'] and 
                    node['outputs'][0].get('links') and 
                    node['outputs'][0]['links'] and 
                    node.get('widgets_values') and 
                    node['widgets_values']):
                    # 过滤掉空提示词
                    prompt = node['widgets_values'][0].strip()
                    if prompt:  # 只添加非空提示词
                        prompts.append(prompt)
    except Exception as e:
        print(f"提取提示词时出错: {str(e)}")
        return None  # 返回 None 表示提取失败
    return prompts if prompts else None  # 如果没有找到有效提示词也返回 None

def get_workflow_from_image(image_path):
    """从图片中提取工作流信息"""
    try:
        with Image.open(image_path) as img:
            metadata = img.info
            if 'workflow' in metadata:
                return json.loads(metadata['workflow'])
            else:
                # 尝试从文件末尾读取 JSON 数据
                with open(image_path, 'rb') as f:
                    content = f.read()
                    start = content.rfind(b'{')
                    end = content.rfind(b'}') + 1
                    if start != -1 and end != -1:
                        json_data = content[start:end].decode('utf-8', errors='ignore')
                        json_data = json_data.strip('\x00')
                        return json.loads(json_data)
    except Exception as e:
        print(f"读取图片 {image_path} 的工作流时出错: {str(e)}")
    return None

def get_prompt_hash(prompt):
    """计算提示词的 MD5 哈希值"""
    return hashlib.md5(prompt.encode('utf-8')).hexdigest()

def get_image_creation_time(file_path):
    """获取图片的创建时间，优先使用文件的修改时间"""
    try:
        # 在 Windows 上，getctime 返回创建时间
        # 在 Unix 上，getctime 返回最后一次元数据更改的时间
        # 所以我们优先使用修改时间
        return os.path.getmtime(file_path)
    except Exception as e:
        print(f"获取图片时间出错 {file_path}: {str(e)}")
        return 0

def scan_images_for_prompts(image_dirs, file_types):
    """扫描所有图片目录，提取提示词和图片的关联关系"""
    prompt_map = defaultdict(list)  # 提示词哈希 -> [(图片路径, 修改时间)]
    prompt_text = {}  # 提示词哈希 -> 提示词文本
    prompt_latest_time = {}  # 提示词哈希 -> 最新图片时间
    processed_count = 0
    failed_count = 0
    empty_count = 0

    # 首先收集所有图片及其时间信息
    all_images = []
    for base_dir in image_dirs:
        for root, _, files in os.walk(base_dir):
            for file in files:
                if file.lower().endswith(file_types):
                    file_path = os.path.join(root, file)
                    creation_time = get_image_creation_time(file_path)
                    relative_path = os.path.relpath(file_path, base_dir)
                    image_path = f"/images/{relative_path.replace(os.sep, '/')}"
                    all_images.append((file_path, image_path, creation_time))

    # 按时间倒序排序所有图片
    all_images.sort(key=lambda x: x[2], reverse=True)
    print(f"\n总共找到 {len(all_images)} 个图片")

    # 处理排序后的图片
    for file_path, image_path, creation_time in all_images:
        workflow = get_workflow_from_image(file_path)
        if workflow:
            prompts = extract_prompts_from_workflow(workflow)
            if prompts:
                has_valid_prompt = False
                for prompt in prompts:
                    if prompt.strip():
                        prompt_hash = get_prompt_hash(prompt)
                        prompt_map[prompt_hash].append({
                            'path': image_path,
                            'time': creation_time
                        })
                        prompt_text[prompt_hash] = prompt
                        # 更新提示词的最新时间
                        if prompt_hash not in prompt_latest_time or creation_time > prompt_latest_time[prompt_hash]:
                            prompt_latest_time[prompt_hash] = creation_time
                        has_valid_prompt = True
                
                if has_valid_prompt:
                    processed_count += 1
                else:
                    empty_count += 1
            else:
                empty_count += 1
        else:
            failed_count += 1

    print("\n提示词最新时间:")
    for prompt_hash, latest_time in prompt_latest_time.items():
        print(f"提示词: {prompt_text[prompt_hash][:30]}...")
        print(f"最新时间: {datetime.fromtimestamp(latest_time)}")
        print(f"图片数量: {len(prompt_map[prompt_hash])}")
        print("---")

    # 对提示词进行排序
    sorted_hashes = sorted(
        prompt_latest_time.keys(),
        key=lambda x: (prompt_latest_time[x], len(prompt_map[x])),  # 首先按时间排序，时间相同的按图片数量排序
        reverse=True
    )

    # 创建最终的排序结果
    sorted_prompts = {}
    for prompt_hash in sorted_hashes:
        # 确保每个提示词的图片也是按时间倒序排序的
        images = prompt_map[prompt_hash]
        sorted_images = [img['path'] for img in sorted(images, key=lambda x: x['time'], reverse=True)]
        sorted_prompts[prompt_hash] = sorted_images

    print("\n排序后的提示词顺序:")
    for prompt_hash in sorted_prompts:
        print(f"提示词: {prompt_text[prompt_hash][:30]}...")
        print(f"时间: {datetime.fromtimestamp(prompt_latest_time[prompt_hash])}")
        print("---")

    print(f"\n处理完成: 成功 {processed_count} 个文件, 失败 {failed_count} 个文件, 空提示词 {empty_count} 个文件")
    return {
        'prompt_map': sorted_prompts,
        'prompt_text': prompt_text,
        'stats': {
            'processed': processed_count,
            'failed': failed_count,
            'empty': empty_count
        }
    }

def save_prompts_cache(cache_data):
    """保存提示词缓存"""
    with open(PROMPTS_CACHE_FILE, 'wb') as f:
        pickle.dump(cache_data, f)

def load_prompts_cache():
    """加载提示词缓存"""
    if os.path.exists(PROMPTS_CACHE_FILE):
        with open(PROMPTS_CACHE_FILE, 'rb') as f:
            return pickle.load(f)
    return None

def check_prompts_cache_valid(image_dirs, last_modified_times):
    """检查提示词缓存是否有效"""
    if not os.path.exists(PROMPTS_CACHE_FILE):
        return False
    
    cache_mtime = os.path.getmtime(PROMPTS_CACHE_FILE)
    
    for dir in image_dirs:
        dir_mtime = last_modified_times.get(dir, 0)
        if dir_mtime > cache_mtime:
            return False
    
    return True

def get_all_prompts(image_dirs, file_types, last_modified_times):
    """获取所有提示词信息，如果缓存有效则使用缓存"""
    if check_prompts_cache_valid(image_dirs, last_modified_times):
        cache_data = load_prompts_cache()
        if cache_data:
            return cache_data
    
    cache_data = scan_images_for_prompts(image_dirs, file_types)
    save_prompts_cache(cache_data)
    return cache_data 