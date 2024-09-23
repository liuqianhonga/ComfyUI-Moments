// 全局变量声明
let allImages = {};
let dateList = [];
let currentPage = 0;
let scrollTimeout;
let imageCountByDate = {};
let flatpickrInstance;
let scale = 1;
let isDragging = false;
let startX, startY, translateX = 0, translateY = 0;

const ZOOM_SPEED = 0.1;
const MAX_SCALE = 3;
const MIN_SCALE = 0.5;

const trashBinIcon = `<i class="far fa-trash-alt"></i>`;

// 检查 translations 对象
if (typeof translations === 'undefined') {
    console.error('Translations object is not defined');
    translations = {
        refresh_success: 'Refresh successful',
        no_new_images: 'No new images found',
        error_loading: 'Error loading images'
    };
}

// 在文件顶部添加这个全局变量
let imageObserver;

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, fetching images');
    fetchImages();
    setupRefreshButton();
    setupCalendarButton();
    window.addEventListener('resize', debounce(setupLazyLoading, 200));
});

function fetchImages() {
    showLoading();

    fetch('/api/images')
        .then(response => response.json())
        .then(imagesByDate => {
            allImages = imagesByDate;
            updateImageCountByDate();
            dateList = Object.keys(allImages).sort().reverse();
            renderImages();
            setupInfiniteScroll();
            hideLoading();
        })
        .catch(error => {
            console.error('Error fetching images:', error);
            hideLoading();
            showError(translations.error_loading);
        });
}

// 修改 renderImages 函数
function renderImages() {
    const timeline = document.getElementById('timeline');
    if (!timeline) {
        console.error('Timeline element not found');
        return;
    }
    const fragment = document.createDocumentFragment();

    dateList.forEach(date => {
        const images = allImages[date];
        const dateContainer = document.createElement('div');
        dateContainer.className = 'date-container';
        dateContainer.id = `date-${date}`;
        dateContainer.innerHTML = `<h2>${formatChineseDate(date)}</h2>`;
        
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'images-container';
        
        // 计算应该显示的列数
        const containerWidth = timeline.clientWidth - 40; // 减去内边距
        const columnCount = Math.floor(containerWidth / 215); // 200px 宽度 + 15px 间隔
        
        // 确保至少显示一列
        const minImageCount = Math.max(columnCount, 1);
        
        // 如果图片数量少于最小数量，添加空的占位符
        const imagesToRender = images.length < minImageCount ? minImageCount : images.length;
        
        for (let i = 0; i < imagesToRender; i++) {
            const container = document.createElement('div');
            container.className = 'image-container';
            
            if (i < images.length) {
                const image = images[i];
                container.innerHTML = `
                    <div class="image-wrapper">
                        <div class="image-placeholder"></div>
                        <img data-src="${image.path}" alt="${image.path}" onclick="openModal('${image.path}')">
                    </div>
                    <div class="image-info">
                        <span>${new Date(image.creation_time * 1000).toLocaleTimeString()}</span>
                        ${allowDeleteImage ? `<div class="delete-icon" onclick="confirmDelete('${image.path}')">${trashBinIcon}</div>` : ''}
                    </div>
                `;
            } else {
                // 添加空的占位符
                container.innerHTML = `<div class="image-wrapper"><div class="image-placeholder"></div></div>`;
                container.style.visibility = 'hidden'; // 隐藏占位符，但保留其空间
            }
            
            imagesContainer.appendChild(container);
        }
        
        dateContainer.appendChild(imagesContainer);
        fragment.appendChild(dateContainer);
    });

    timeline.innerHTML = '';
    timeline.appendChild(fragment);
    setupLazyLoading();
    console.log('Images rendered, lazy loading setup');
}

// 新增 setupLazyLoading 函数
function setupLazyLoading() {
    console.log('Setting up lazy loading');
    if (!('IntersectionObserver' in window)) {
        console.log('IntersectionObserver not supported, loading all images');
        document.querySelectorAll('img[data-src]').forEach(img => loadImage(img));
        return;
    }

    if (imageObserver) {
        console.log('Disconnecting existing observer');
        imageObserver.disconnect();
    }

    imageObserver = new IntersectionObserver((entries, observer) => {
        console.log('Intersection callback triggered');
        entries.forEach(entry => {
            console.log('Entry:', entry.target.dataset.src, 'Intersecting:', entry.isIntersecting);
            if (entry.isIntersecting) {
                console.log('Loading image:', entry.target.dataset.src);
                loadImage(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, {
        rootMargin: '0px',
        threshold: 0.1
    });

    const images = document.querySelectorAll('img[data-src]');
    console.log('Found', images.length, 'images to observe');
    images.forEach(img => {
        imageObserver.observe(img);
    });

    // 添加以下代码以确保所有图片都被正确观察
    const initialVisibleImages = document.querySelectorAll('img[data-src]:not([style*="display: none"])');
    console.log('Initial visible images:', initialVisibleImages.length);
    initialVisibleImages.forEach(img => {
        imageObserver.observe(img);
    });
}

// 新增 loadImage 函数
function loadImage(img) {
    console.log('Loading image:', img.dataset.src);
    img.onload = function() {
        console.log('Image loaded:', this.src);
        this.previousElementSibling.style.display = 'none'; // 隐藏占位符
        this.classList.add('loaded'); // 添加 'loaded' 类来触发 CSS 过渡
    }
    img.onerror = function() {
        console.error('Error loading image:', this.dataset.src);
    }
    if (!img.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
    }
}

// 修改 setupInfiniteScroll 函数
function setupInfiniteScroll() {
    const timeline = document.getElementById('timeline');
    const options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && currentPage * ITEMS_PER_PAGE < dateList.length) {
                currentPage++;
                renderImages(currentPage * ITEMS_PER_PAGE);
            }
        });
    }, options);

    if (timeline.lastElementChild) {
        observer.observe(timeline.lastElementChild);
    }
}

// 删除原来的 lazyLoadImages 和 isInViewport 函数，因为我们不再需要它们

function scrollToDate(date) {
    const element = document.getElementById(`date-${date}`);
    if (element) {
        const headerHeight = document.querySelector('.app-header').offsetHeight;
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset - headerHeight;

        window.scrollTo({
            top: elementPosition,
            behavior: 'smooth'
        });
    }
}

function updateActiveDate(dateStr) {
    if (!dateStr) {
        const dateContainers = document.querySelectorAll('.date-container');
        const headerHeight = document.querySelector('.app-header').offsetHeight;
        
        for (let container of dateContainers) {
            const rect = container.getBoundingClientRect();
            if (rect.top <= headerHeight && rect.bottom > headerHeight) {
                dateStr = container.id.replace('date-', '');
                break;
            }
        }
    }

    if (dateStr && flatpickrInstance) {
        flatpickrInstance.setDate(dateStr, false);
    }
}

// 使用节流的滚动事件监听器
window.addEventListener('scroll', throttle(handleScroll, 100));

function openModal(imagePath) {
    const modal = document.getElementById('modal');
    const modalImg = document.getElementById('modal-img');
    const modalInfo = document.getElementById('modal-info');
    const modalContent = document.querySelector('.modal-content');
    
    modal.style.display = "block";
    modalImg.src = imagePath;
    
    // 重置缩放和位置
    scale = 1;
    translateX = 0;
    translateY = 0;
    modalImg.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
    
    // 设置缩放和拖动功能
    setupImageZoom();
    setupImageDrag();
    
    // 清空之前的信息
    modalInfo.innerHTML = translations.loading;
    
    // 获取图片元数据
    getImageInfo(imagePath);

    modalImg.onclick = function(event) {
        event.stopPropagation();
    };

    modalContent.onclick = function(event) {
        closeModal();
        event.stopPropagation();
    };

    // 允许在工作流信息区域进行选择，但阻止事件冒泡
    modalInfo.onclick = function(event) {
        event.stopPropagation();
    };

    // 阻止双击事件冒泡
    modalInfo.ondblclick = function(event) {
        event.stopPropagation();
        event.preventDefault();
    };
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.style.display = "none";
    // 重置缩放和位置
    scale = 1;
    translateX = 0;
    translateY = 0;
    document.getElementById('modal-img').style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
    
    // 移除点击事件监听器
    modal.onclick = null;
    document.querySelector('.modal-content').onclick = null;
    document.getElementById('modal-info').onclick = null;
    document.getElementById('modal-info').ondblclick = null;

    // 移除拖动和缩放事件监听器
    const modalImg = document.getElementById('modal-img');
    modalImg.removeEventListener('mousedown', startDrag);
    modalImg.removeEventListener('touchstart', startDrag);
    window.removeEventListener('mousemove', drag);
    window.removeEventListener('touchmove', drag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchend', endDrag);
}

// 当用户点击 <span> (x), 关闭模态框
document.querySelector('.close').onclick = function(event) {
    event.stopPropagation();  // 防止事件冒泡到模态框
    closeModal();
};

// 添加确认删除函数
function confirmDelete(imagePath) {
    if (!allowDeleteImage) {
        console.warn(translations.delete_disabled);
        return;
    }
    showConfirmDialog(
        translations.delete_confirm,
        () => deleteImage(imagePath)
    );
}

// 添加删除图片函数
function deleteImage(imagePath) {
    fetch('/api/delete_image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_path: imagePath }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const imageElement = document.querySelector(`img[src="${imagePath}"]`) || document.querySelector(`img[data-src="${imagePath}"]`);
            if (imageElement) {
                const imageContainer = imageElement.closest('.image-container');
                const imagesContainer = imageContainer.parentElement;
                const dateContainer = imagesContainer.parentElement;

                // 添加删除动画
                imageContainer.style.transform = 'scale(0)';
                imageContainer.style.opacity = '0';

                // 等待动画完成后移除元素
                setTimeout(() => {
                    imageContainer.remove();

                    // 如果这是日期组中的最后一张图片，移除整个日期组
                    if (imagesContainer.children.length === 0) {
                        dateContainer.remove();
                    } else {
                        // 触发重排以应用过渡效果
                        imagesContainer.style.display = 'none';
                        imagesContainer.offsetHeight; // 强制重排
                        imagesContainer.style.display = '';
                    }

                    // 从 allImages 对象中移除图片
                    for (let date in allImages) {
                        allImages[date] = allImages[date].filter(img => img.path !== imagePath);
                        if (allImages[date].length === 0) {
                            delete allImages[date];
                        }
                    }

                    // 更新日期导航
                    renderDateNav();
                }, 300);
            }
        } else {
            alert(translations.delete_error + ': ' + data.error);
        }
    })
    .catch(error => {
        console.error('错误:', error);
        alert(translations.delete_error);
    });
}

function showConfirmDialog(message, onConfirm, onCancel) {
    const dialog = document.getElementById('confirmDialog');
    const content = dialog.querySelector('p');
    const yesButton = document.getElementById('confirmYes');
    const noButton = document.getElementById('confirmNo');

    content.textContent = message;
    yesButton.textContent = translations.yes;
    noButton.textContent = translations.no;
    dialog.style.display = 'flex';

    yesButton.onclick = () => {
        dialog.style.display = 'none';
        onConfirm();
    };

    noButton.onclick = () => {
        dialog.style.display = 'none';
        if (onCancel) onCancel();
    };
}

// 添加这个新函数来处理滚动事件
function handleScroll() {
    updateActiveDate();
}

// 使用节流函数来限制滚动事件的触发频率
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// 添加图片缩放功能
function setupImageZoom() {
    const modalImg = document.getElementById('modal-img');
    modalImg.addEventListener('wheel', function(e) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -1 : 1;
        scale += delta * ZOOM_SPEED;
        scale = Math.min(Math.max(MIN_SCALE, scale), MAX_SCALE);
        
        modalImg.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
    });
}

function setupImageDrag() {
    const modalImg = document.getElementById('modal-img');
    const modalContent = document.querySelector('.modal-content');
    const modalInfo = document.getElementById('modal-info');

    modalImg.addEventListener('mousedown', startDrag);
    modalImg.addEventListener('touchstart', startDrag, { passive: false });

    window.addEventListener('mousemove', drag);
    window.addEventListener('touchmove', drag, { passive: false });

    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);

    // 阻止工作信息区域的事件冒泡
    modalInfo.addEventListener('mousedown', (e) => e.stopPropagation());
    modalInfo.addEventListener('touchstart', (e) => e.stopPropagation());

    // 允许在模态框内滚动
    modalContent.addEventListener('wheel', (e) => {
        e.stopPropagation();
    });
}

function startDrag(e) {
    e.preventDefault();
    isDragging = true;
    startX = (e.clientX || e.touches[0].clientX) - translateX;
    startY = (e.clientY || e.touches[0].clientY) - translateY;
}

function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    if (clientX === undefined || clientY === undefined) return;

    const x = clientX - startX;
    const y = clientY - startY;
    translateX = x;
    translateY = y;
    document.getElementById('modal-img').style.transform = `scale(${scale}) translate(${x}px, ${y}px)`;
}

function endDrag() {
    isDragging = false;
}

// 添加一个防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function setupRefreshButton() {
    const refreshButton = document.getElementById('refreshButton');
    if (!refreshButton) {
        console.error('Refresh button not found');
        return;
    }
    refreshButton.addEventListener('click', function() {
        console.log('Refresh button clicked');
        showLoading();
        fetch('/api/refresh')
            .then(response => response.json())
            .then(data => {
                if (data.refreshed) {
                    allImages = data.images;
                    renderImages();
                    showToast(translations.refresh_success);
                } else {
                    showToast(translations.no_new_images);
                }
                hideLoading();
            })
            .catch(error => {
                console.error('Error refreshing images:', error);
                hideLoading();
                showToast(translations.error_loading);
            });
    });
}

function showToast(message, type = 'info') {
    console.log('Showing toast:', message);
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;
    
    const closeButton = document.createElement('span');
    closeButton.className = 'toast-close';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => removeToast(toast);
    
    toast.appendChild(messageSpan);
    toast.appendChild(closeButton);
    
    document.body.appendChild(toast);
    
    // 触发重排以应用过渡效果
    toast.offsetHeight;
    
    // 显示 toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // 3秒后自动隐藏
    setTimeout(() => {
        removeToast(toast);
    }, 3000);
}

function removeToast(toast) {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
        toast.remove();
    }, { once: true });
}

function showLoading() {
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.querySelector('i').classList.add('fa-spin');
    }
}

function hideLoading() {
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.querySelector('i').classList.remove('fa-spin');
    }
}

function showError(message) {
    alert(message);
}

function getImageInfo(imagePath) {
    fetch(`/api/image_info`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: imagePath })
    })
    .then(response => response.json())
    .then(data => {
        const modalInfo = document.getElementById('modal-info');
        modalInfo.innerHTML = '';
        
        if (data.error) {
            modalInfo.textContent = `错误: ${data.error}`;
            return;
        }

        // 显示完整的工作流信息
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(data, null, 2);
        modalInfo.appendChild(pre);
    })
    .catch(error => {
        console.error('获取图片信息时出错:', error);
        const modalInfo = document.getElementById('modal-info');
        modalInfo.textContent = '获取图片信息时出错';
    });
}

function setupCalendarButton() {
    const calendarButton = document.getElementById('calendarButton');
    const calendarContainer = document.getElementById('calendarContainer');

    if (calendarButton && calendarContainer) {
        calendarButton.addEventListener('mouseover', () => {
            calendarContainer.classList.add('show');
            if (!flatpickrInstance) {
                initializeFlatpickr();
            } else {
                updateCalendarDate();
            }
        });

        calendarContainer.addEventListener('mouseleave', () => {
            calendarContainer.classList.remove('show');
        });
    } else {
        console.warn('Calendar button or container not found');
    }
}

function initializeFlatpickr() {
    const calendarElem = document.getElementById('calendar');
    
    // 添加中文本地化配置
    const Mandarin = {
        weekdays: {
            shorthand: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
            longhand: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]
        },
        months: {
            shorthand: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
            longhand: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]
        },
        rangeSeparator: " 至 ",
        weekAbbreviation: "周",
        scrollTitle: "滚动切换",
        toggleTitle: "点击切换 12/24 小时时制"
    };

    flatpickrInstance = flatpickr(calendarElem, {
        inline: true,
        mode: "single",
        dateFormat: "Y-m-d",
        defaultDate: getCurrentVisibleDate(),
        locale: Mandarin,  // 使用中文本地化配置
        onDayCreate: function(dObj, dStr, fp, dayElem) {
            const date = dayElem.dateObj;
            const dateStr = formatDate(date);
            if (allImages[dateStr]) {
                const imageCount = allImages[dateStr].length;
                const badge = document.createElement('span');
                badge.className = 'image-count-badge';
                badge.textContent = imageCount;
                dayElem.appendChild(badge);
            }
        },
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length > 0) {
                scrollToDate(dateStr);
            }
        }
    });

    // 初始化时设置当前日期
    updateCalendarDate();
}

function getCurrentVisibleDate() {
    const dateContainers = document.querySelectorAll('.date-container');
    const headerHeight = document.querySelector('.app-header').offsetHeight;
    
    for (let container of dateContainers) {
        const rect = container.getBoundingClientRect();
        if (rect.top <= headerHeight && rect.bottom > headerHeight) {
            return container.id.replace('date-', '');
        }
    }
    return new Date(); // 如果没有找到可见的日期，返回今天的日期
}

function updateCalendarDate() {
    const currentDate = getCurrentVisibleDate();
    if (flatpickrInstance) {
        flatpickrInstance.setDate(currentDate, false);
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateImageCountByDate() {
    imageCountByDate = {};
    for (const [dateStr, images] of Object.entries(allImages)) {
        const [year, month, day] = dateStr.split('-');
        if (!imageCountByDate[year]) imageCountByDate[year] = {};
        if (!imageCountByDate[year][month]) imageCountByDate[year][month] = {};
        imageCountByDate[year][month][day] = images.length;
    }
}

function formatChineseDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
}

window.onload = function() {
    var backToTopButton = document.getElementById("backToTop");

    window.onscroll = function() {
        if (document.body.scrollTop > window.innerHeight || document.documentElement.scrollTop > window.innerHeight) {
            backToTopButton.style.display = "block";
        } else {
            backToTopButton.style.display = "none";
        }
    };

    backToTopButton.onclick = function() {
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    };
};

// 辅助函数用于转义 HTML 特殊字符
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// 复制工作流按钮事件监听器
document.getElementById('copyWorkflow').addEventListener('click', function(event) {
    // 阻止事件冒泡
    event.stopPropagation();
    
    const workflowText = document.getElementById('modal-info').textContent;
    navigator.clipboard.writeText(workflowText).then(function() {
        showToast(translations['workflow_copied'], 'success');
    }, function(err) {
        console.error('无法复制工作流:', err);
        showToast(translations['copy_failed'], 'error');
    });
});

// 确保模态框的点击事件不会关闭模态框
document.querySelector('.modal-content').addEventListener('click', function(event) {
    event.stopPropagation();
});

// 模态框关闭逻辑
document.getElementById('modal').addEventListener('click', closeModal);
document.querySelector('.close').addEventListener('click', closeModal);

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}