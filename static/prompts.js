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

    const promptHashes = Object.keys(data.prompt_map);

    promptHashes.forEach(hash => {
        const promptText = data.prompt_text[hash];
        const images = data.prompt_map[hash];
        
        const promptGroup = document.createElement('div');
        promptGroup.className = 'prompt-group';
        
        // 创建提示词文本区域
        const promptTextDiv = document.createElement('div');
        promptTextDiv.className = 'prompt-text';
        promptTextDiv.innerHTML = `
            ${promptText}
            <a href="javascript:void(0)" class="translate-link" onclick="translatePrompt(this)">
                ${translations.translate || '翻译'}
            </a>
        `;
        
        // 创建图片网格
        const imagesDiv = document.createElement('div');
        imagesDiv.className = 'prompt-images';
        
        images.forEach(imagePath => {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'image-container';
            imageContainer.innerHTML = `
                <div class="image-wrapper">
                    <div class="image-placeholder"></div>
                    <img data-src="${imagePath}" alt="${promptText}" onclick="openModal('${imagePath}')">
                </div>
            `;
            imagesDiv.appendChild(imageContainer);
        });
        
        promptGroup.appendChild(promptTextDiv);
        promptGroup.appendChild(imagesDiv);
        container.appendChild(promptGroup);
    });

    // 重新设置懒加载
    setupLazyLoading();
}

async function translatePrompt(linkElement) {
    const promptTextDiv = linkElement.parentElement;
    const originalText = promptTextDiv.childNodes[0].textContent.trim();
    const originalLink = linkElement.textContent;
    
    try {
        linkElement.textContent = translations.translating || '翻译中...';
        linkElement.style.pointerEvents = 'none';
        
        const response = await fetch('https://api.mymemory.translated.net/get?' + new URLSearchParams({
            q: originalText,
            langpair: 'en|zh'
        }));
        
        const data = await response.json();
        if (data.responseStatus === 200) {
            const translatedDiv = document.createElement('div');
            translatedDiv.className = 'translated-text';
            translatedDiv.textContent = data.responseData.translatedText;
            
            // 如果已经有翻译，则替换它
            const existingTranslation = promptTextDiv.querySelector('.translated-text');
            if (existingTranslation) {
                promptTextDiv.replaceChild(translatedDiv, existingTranslation);
            } else {
                promptTextDiv.appendChild(translatedDiv);
            }
        }
    } catch (error) {
        console.error('Translation error:', error);
        showToast(translations.translate_error, 'error');
    } finally {
        linkElement.textContent = originalLink;
        linkElement.style.pointerEvents = 'auto';
    }
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