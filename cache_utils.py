import os
import pickle

CACHE_FILE = 'image_cache.pkl'
last_modified_times = {}
image_cache = None
last_config_mtime = 0

def load_cache():
    global image_cache
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'rb') as f:
            image_cache = pickle.load(f)
    else:
        image_cache = None

def save_cache():
    global image_cache
    with open(CACHE_FILE, 'wb') as f:
        pickle.dump(image_cache, f)

def get_cache():
    global image_cache
    return image_cache

def set_cache(cache):
    global image_cache
    image_cache = cache

def get_last_modified_times():
    global last_modified_times
    return last_modified_times

def set_last_modified_times(times):
    global last_modified_times
    last_modified_times = times

def get_last_config_mtime():
    global last_config_mtime
    return last_config_mtime

def set_last_config_mtime(mtime):
    global last_config_mtime
    last_config_mtime = mtime