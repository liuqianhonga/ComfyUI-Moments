let allImages = {};
let dateList = [];
let currentPage = 0;
let scrollTimeout;

const trashBinIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 016.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
</svg>`;

document.addEventListener('DOMContentLoaded', function() {
    fetchImages();
    setupRefreshButton();
});

function fetchImages() {
    // 显示加载指示器
    showLoading();

    fetch('/api/images')
        .then(response => response.json())
        .then(imagesByDate => {
            allImages = imagesByDate;
            dateList = Object.keys(allImages).sort().reverse();
            renderDateNav();
            renderImages();
            setupInfiniteScroll();
            // 隐藏加载指示器
            hideLoading();
        })
        .catch(error => {
            console.error('Error fetching images:', error);
            // 隐藏加载指示器并显示错误消息
            hideLoading();
            showError('加载图片时出错，请稍后再试。');
        });
}

function renderDateNav() {
    const dateNav = document.getElementById('date-nav');
    dateNav.innerHTML = '';
    dateList.forEach(date => {
        const dateNavItem = document.createElement('div');
        dateNavItem.className = 'date-nav-item';
        dateNavItem.textContent = date;
        dateNavItem.onclick = () => scrollToDate(date);
        dateNav.appendChild(dateNavItem);
    });
}

function renderImages() {
    const timeline = document.getElementById('timeline');
    const fragment = document.createDocumentFragment();

    dateList.forEach(date => {
        const images = allImages[date];
        const dateContainer = document.createElement('div');
        dateContainer.className = 'date-container';
        dateContainer.id = `date-${date}`;
        dateContainer.innerHTML = `<h2>${date}</h2>`;
        
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
                        <img data-src="${image.path}" alt="Image" onclick="openModal(this)" style="display: none;">
                    </div>
                    <div class="image-info">
                        <span>${new Date(image.creation_time * 1000).toLocaleTimeString()}</span>
                        ${allowDeleteImage ? `<div class="delete-icon" onclick="confirmDelete('${image.path}')">${trashBinIcon}</div>` : ''}
                    </div>
                `;
            } else {
                // 添加空的占位符
                container.innerHTML = `<div class="image-wrapper"></div>`;
                container.style.visibility = 'hidden'; // 隐藏占位符，但保留其空间
            }
            
            imagesContainer.appendChild(container);
        }
        
        dateContainer.appendChild(imagesContainer);
        fragment.appendChild(dateContainer);
    });

    timeline.innerHTML = '';
    timeline.appendChild(fragment);
    lazyLoadImages();
}

function lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    images.forEach(img => {
        if (isInViewport(img)) {
            img.onload = function() {
                this.style.display = 'block';
                this.previousElementSibling.style.display = 'none';
            }
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        }
    });
}

function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

function setupInfiniteScroll() {
    updateInfiniteScrollObserver();
}

function updateInfiniteScrollObserver() {
    const timeline = document.getElementById('timeline');
    if (timeline.lastElementChild) {
        if (window.infiniteScrollObserver) {
            window.infiniteScrollObserver.disconnect();
        }
        window.infiniteScrollObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && currentPage * ITEMS_PER_PAGE < dateList.length) {
                currentPage++;
                renderImages(currentPage * ITEMS_PER_PAGE);
            }
        }, { threshold: 0.1 });
        window.infiniteScrollObserver.observe(timeline.lastElementChild);
    }
}

function scrollToDate(date) {
    const element = document.getElementById(`date-${date}`);
    if (!element) {
        const index = dateList.indexOf(date);
        if (index !== -1) {
            currentPage = Math.floor(index / ITEMS_PER_PAGE);
            renderImages(currentPage * ITEMS_PER_PAGE);
            setTimeout(() => scrollToDate(date), 100);
        }
        return;
    }

    const dateNav = document.getElementById('date-nav');
    const dateNavHeight = dateNav.offsetHeight;
    const elementPosition = element.getBoundingClientRect().top + window.pageYOffset - dateNavHeight;

    window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
    });
}

function openModal(img) {
    const modal = document.getElementById('modal');
    const modalImg = document.getElementById('modal-img');
    const modalInfo = document.getElementById('modal-info');
    const modalContent = document.querySelector('.modal-content');
    
    modal.style.display = "block";
    modalImg.src = img.src;
    
    // 重置缩放和位置
    scale = 1;
    translateX = 0;
    translateY = 0;
    modalImg.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
    
    // 设置缩放和拖动功能
    setupImageZoom();
    setupImageDrag();
    
    // 清空之前的信息
    modalInfo.innerHTML = '加载中...';
    
    // 获取图片元数据
    fetch(`/api/image_info/${encodeURIComponent(img.src.split('/').pop())}`)
        .then(response => response.json())
        .then(data => {
            // 格式化并显示工作流信息
            let infoHtml = '<h3>工作流信息:</h3>';
            for (let key in data) {
                infoHtml += `<p><strong>${key}:</strong> ${JSON.stringify(data[key], null, 2)}</p>`;
            }
            modalInfo.innerHTML = infoHtml;
        })
        .catch(error => {
            console.error('Error:', error);
            modalInfo.innerHTML = '无法加载图片信息';
        });

    // 添加点击事件监听器到模态框
    modal.onclick = function(event) {
        if (event.target === modal) {
            closeModal();
        }
    };

    // 阻止点击模态框内容时关闭模态框
    modalContent.onclick = function(event) {
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

window.addEventListener('scroll', function() {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(function() {
        lazyLoadImages();
        updateActiveDate();
    }, 100);
});

function updateActiveDate() {
    const dateContainers = document.querySelectorAll('.date-container');
    const dateNavItems = document.querySelectorAll('.date-nav-item');
    const dateNav = document.getElementById('date-nav');
    const dateNavHeight = dateNav.offsetHeight;
    
    let activeIndex = -1;
    dateContainers.forEach((container, index) => {
        const rect = container.getBoundingClientRect();
        const headerHeight = container.querySelector('h2').offsetHeight;
        if (rect.top <= dateNavHeight && rect.top + headerHeight > dateNavHeight) {
            activeIndex = index;
        }
    });

    if (activeIndex !== -1) {
        dateNavItems.forEach(item => item.classList.remove('active'));
        dateNavItems[activeIndex].classList.add('active');
        ensureDateNavItemVisible(dateNavItems[activeIndex]);
    }
}

function ensureDateNavItemVisible(item) {
    const container = document.getElementById('date-nav');
    const itemRect = item.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    if (itemRect.bottom > containerRect.bottom) {
        container.scrollTop += itemRect.bottom - containerRect.bottom;
    } else if (itemRect.top < containerRect.top) {
        container.scrollTop += itemRect.top - containerRect.top;
    }
}

// 添加确认删除函数
function confirmDelete(imagePath) {
    if (!allowDeleteImage) {
        console.warn('删除功能已被禁用');
        return;
    }
    showConfirmDialog(
        '您确定要删除这张图片吗？',
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
            alert('删除图片失败: ' + data.error);
        }
    })
    .catch(error => {
        console.error('错误:', error);
        alert('删除图片时发生错误');
    });
}

function showConfirmDialog(message, onConfirm, onCancel) {
    const dialog = document.getElementById('confirmDialog');
    const content = dialog.querySelector('p');
    const yesButton = document.getElementById('confirmYes');
    const noButton = document.getElementById('confirmNo');

    content.textContent = message;
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
    lazyLoadImages();
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

// 使用节流的滚动事件监听器
window.addEventListener('scroll', throttle(handleScroll, 100));

// 添加图片缩放功能
let scale = 1;
const ZOOM_SPEED = 0.1;
const MAX_SCALE = 3;
const MIN_SCALE = 0.5;

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

let isDragging = false;
let startX, startY, translateX = 0, translateY = 0;

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

// 在文件末尾添加这段代码
window.addEventListener('resize', debounce(function() {
    renderImages();
}, 250));

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

// 在文件开头添加这个函数
function setupRefreshButton() {
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.addEventListener('click', function() {
        fetchImages();
    });
}

// 添加这些新函数
function showLoading() {
    // 这里可以添加显示加载指示器的代码
    // 例如，可以添加一个加载动画或者改变刷新按钮的文本
    document.getElementById('refreshButton').disabled = true;
    document.getElementById('refreshButton').querySelector('i').classList.add('fa-spin');
}

function hideLoading() {
    // 这里可以添加隐藏加载指示器的代码
    document.getElementById('refreshButton').disabled = false;
    document.getElementById('refreshButton').querySelector('i').classList.remove('fa-spin');
}

function showError(message) {
    // 这里可以添加显示错误消息的代码
    alert(message);
}