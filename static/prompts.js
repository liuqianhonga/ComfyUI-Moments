document.addEventListener('DOMContentLoaded', function() {
    fetchPrompts();
    setupRefreshButton();
    setupLazyLoading();
    setupBackToTop();
});

function fetchPrompts() {
    showLoading();
    fetch('/api/prompts')
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Unknown error');
                });
            }
            return response.json();
        })
        .then(data => {
            renderPrompts(data);
            hideLoading();
        })
        .catch(error => {
            console.error('Error fetching prompts:', error);
            hideLoading();
            showToast(error.message || translations.error_loading, 'error');
            
            // 显示错误状态
            const container = document.getElementById('prompts-container');
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <h2>${error.message || translations.error_loading}</h2>
                </div>
            `;
        });
}

function renderPrompts(data) {
    const container = document.getElementById('prompts-container');
    container.innerHTML = '';

    // 使用数组形式的提示词数据
    data.prompts.forEach(prompt => {
        const promptGroup = document.createElement('div');
        promptGroup.className = 'prompt-group';
        
        // 创建提示词文本区域
        const promptTextDiv = document.createElement('div');
        promptTextDiv.className = 'prompt-text';
        promptTextDiv.innerHTML = `
            <div class="prompt-text-content">
                <div class="original-text">${prompt.text}</div>
            </div>
            <div class="prompt-actions">
                <a href="javascript:void(0)" class="action-link" onclick="translatePrompt(this)">
                    <i class="fas fa-language"></i> ${translations.translate || '翻译'}
                </a>
                <a href="javascript:void(0)" class="action-link" onclick="copyPrompt(this)">
                    <i class="fas fa-copy"></i> ${translations.copy || '复制'}
                </a>
            </div>
        `;
        
        // 创建图片网格
        const imagesDiv = document.createElement('div');
        imagesDiv.className = 'prompt-images';
        
        // 使用提示词的图片数组
        prompt.images.forEach(imagePath => {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'image-container';
            imageContainer.innerHTML = `
                <div class="image-wrapper">
                    <div class="image-placeholder"></div>
                    <img data-src="${imagePath}" alt="${prompt.text}" onclick="openModal('${imagePath}')">
                </div>
            `;
            imagesDiv.appendChild(imageContainer);
        });
        
        promptGroup.appendChild(promptTextDiv);
        promptGroup.appendChild(imagesDiv);
        container.appendChild(promptGroup);
    });

    // 设置懒加载
    setupLazyLoading();
}

async function translatePrompt(linkElement) {
    const promptTextDiv = linkElement.closest('.prompt-text');
    const originalText = promptTextDiv.querySelector('.original-text').textContent.trim();
    const originalLink = linkElement.innerHTML;
    
    try {
        linkElement.innerHTML = `<i class="fas fa-language"></i> ${translations.translating || '翻译中...'}`;
        linkElement.style.pointerEvents = 'none';
        
        // 将长文本分段，每段不超过 450 字符
        const segments = splitTextIntoSegments(originalText, 450);
        let translatedSegments = [];
        
        // 翻译每个段落
        for (const segment of segments) {
            const response = await fetch('https://api.mymemory.translated.net/get?' + new URLSearchParams({
                q: segment,
                langpair: 'en|zh'
            }).toString());
            
            const data = await response.json();
            if (data.responseStatus === 200 && data.responseData) {
                translatedSegments.push(data.responseData.translatedText);
            } else {
                throw new Error(data.responseDetails || 'Translation failed');
            }
            
            // 添加延迟以避免 API 限制
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 合并翻译结果
        const translatedText = translatedSegments.join(' ');
        
        // 更新提示词显示
        const promptTextContent = promptTextDiv.querySelector('.prompt-text-content');
        promptTextContent.innerHTML = `
            <div class="original-text">${originalText}</div>
            <div class="translated-text">${translatedText}</div>
        `;
        
    } catch (error) {
        console.error('Translation error:', error);
        showToast(translations.translate_error, 'error');
    } finally {
        linkElement.innerHTML = originalLink;
        linkElement.style.pointerEvents = 'auto';
    }
}

// 添加文本分段函数
function splitTextIntoSegments(text, maxLength) {
    const segments = [];
    let currentSegment = '';
    
    // 按句子分割文本
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    for (const sentence of sentences) {
        if (currentSegment.length + sentence.length <= maxLength) {
            currentSegment += sentence;
        } else {
            if (currentSegment) {
                segments.push(currentSegment.trim());
            }
            currentSegment = sentence;
        }
    }
    
    if (currentSegment) {
        segments.push(currentSegment.trim());
    }
    
    return segments;
}

function setupRefreshButton() {
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            fetchPrompts();
        });
    }
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

// 添加懒加载设置
function setupLazyLoading() {
    if (!('IntersectionObserver' in window)) {
        document.querySelectorAll('img[data-src]').forEach(img => loadImage(img));
        return;
    }

    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadImage(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, {
        rootMargin: '50px 0px',
        threshold: 0.1
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

function loadImage(img) {
    if (!img.src) {
        img.onload = function() {
            this.previousElementSibling.style.display = 'none';
            this.classList.add('loaded');
        }
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
    }
}

// 添加回到顶部功能
function setupBackToTop() {
    const backToTopButton = document.getElementById("backToTop");
    if (backToTopButton) {
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
    }
}

// 添加复制提示词功能
async function copyPrompt(linkElement) {
    const promptTextDiv = linkElement.closest('.prompt-text');
    const originalText = promptTextDiv.querySelector('.original-text').textContent.trim();
    const originalLink = linkElement.innerHTML;
    
    try {
        linkElement.innerHTML = `<i class="fas fa-copy"></i> ${translations.copying || '复制中...'}`;
        linkElement.style.pointerEvents = 'none';
        
        await navigator.clipboard.writeText(originalText);
        showToast(translations.prompt_copied || '提示词已复制', 'success');
    } catch (error) {
        console.error('Copy error:', error);
        showToast(translations.copy_failed || '复制失败', 'error');
    } finally {
        linkElement.innerHTML = originalLink;
        linkElement.style.pointerEvents = 'auto';
    }
} 