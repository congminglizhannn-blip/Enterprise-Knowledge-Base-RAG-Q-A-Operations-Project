import { openModal } from './modal.js';

// ===== 构建网格内容（卡片） =====
export function buildGridContent(photoArray, isListView) {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';

    photoArray.forEach((photo, index) => {
        const card = document.createElement('div');
        card.className = 'photo-card';
        card.setAttribute('data-index', index);

        // 3D 倾斜效果
        card.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            this.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) scale(1.02)`;
        });
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
        });

        const imgUrl = photo.src?.medium || '';
        const title = photo.photographer || '摄影作品';
        const desc = photo.alt || '来自 Pexels 的美丽风景';
        const date = photo.date || new Date().toLocaleDateString();

        card.innerHTML = `
            <div class="card-image-wrap">
                <img src="${imgUrl}" alt="${title}" loading="lazy" />
            </div>
            <div class="card-info">
                <h3>${title}</h3>
                <p>${desc}</p>
                <span class="card-date">📅 ${date}</span>
            </div>
        `;

        card.addEventListener('click', () => openModal(photo));
        grid.appendChild(card);
    });

    // 应用列表视图类
    if (isListView) {
        grid.classList.add('list-view');
    } else {
        grid.classList.remove('list-view');
    }
}

// ===== 带淡入淡出动画的渲染 =====
export function renderGallery(photoArray, isListView, isAnimating, setIsAnimating, animate = true) {
    const grid = document.getElementById('galleryGrid');
    if (isAnimating) return;

    if (grid.children.length === 0) {
        buildGridContent(photoArray, isListView);
        grid.style.opacity = '1';
        return;
    }

    setIsAnimating(true);
    grid.style.transition = 'opacity 0.4s ease';
    grid.style.opacity = '0';

    setTimeout(() => {
        buildGridContent(photoArray, isListView);
        grid.style.opacity = '1';
        setTimeout(() => {
            setIsAnimating(false);
        }, 400);
    }, 400);
}