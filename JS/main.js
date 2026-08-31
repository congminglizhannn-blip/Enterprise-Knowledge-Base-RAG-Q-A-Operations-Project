import { CONFIG } from './config.js';
import { fetchPhotos } from './api.js';
import { renderGallery } from './gallery.js';
import { initModal, openModal } from './modal.js';

// ---- DOM 引用 ----
const grid = document.getElementById('galleryGrid');
const modal = document.getElementById('modal');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const modalImage = document.getElementById('modalImage');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalDate = document.getElementById('modalDate');
const shuffleBtn = document.getElementById('shuffleBtn');
const viewToggle = document.getElementById('viewToggle');
const exploreBtn = document.getElementById('exploreBtn');
const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav-links');

// ---- 状态 ----
let currentPhotos = [];
let isListView = false;
let isAnimating = false;

// ---- 初始化模态框 ----
initModal({
    modal,
    overlay: modalOverlay,
    close: modalClose,
    image: modalImage,
    title: modalTitle,
    desc: modalDesc,
    date: modalDate,
});

// ---- 渲染函数（带 Anime.js 动画） ----
function renderGalleryWithAnimation(photoArray, animate = true) {
    if (isAnimating) return;

    // 如果是第一次加载或不需要动画，直接渲染
    if (grid.children.length === 0 || !animate) {
        renderGallery(photoArray, grid, isListView);
        grid.style.opacity = '1';
        return;
    }

    // 使用 Anime.js 执行淡出 → 更新 → 淡入
    isAnimating = true;
    anime({
        targets: grid,
        opacity: 0,
        duration: 400,
        easing: 'easeOutQuad',
        complete: () => {
            renderGallery(photoArray, grid, isListView);
            anime({
                targets: grid,
                opacity: 1,
                duration: 400,
                easing: 'easeInQuad',
                complete: () => {
                    isAnimating = false;
                }
            });
        }
    });
}

// ---- 事件绑定 ----
// 随机探索
shuffleBtn.addEventListener('click', () => {
    if (isAnimating) return;
    const originalText = shuffleBtn.textContent;
    shuffleBtn.textContent = '🔄 加载中...';
    shuffleBtn.disabled = true;

    const randomPage = Math.floor(Math.random() * 5) + 1;
    fetchPhotos(randomPage)
        .then(photos => {
            currentPhotos = photos;
            renderGalleryWithAnimation(currentPhotos, true);
        })
        .catch(err => {
            console.error('随机探索失败:', err);
            alert('获取图片失败，请检查网络或 API Key。');
        })
        .finally(() => {
            shuffleBtn.textContent = originalText;
            shuffleBtn.disabled = false;
        });
});

// 切换视图
viewToggle.addEventListener('click', () => {
    isListView = !isListView;
    viewToggle.textContent = isListView ? '⊞ 网格视图' : '⊞ 切换视图';
    // 视图切换无需动画，直接重新渲染
    renderGallery(currentPhotos, grid, isListView);
    grid.style.opacity = '1';
});

// 探索按钮滚动
exploreBtn.addEventListener('click', () => {
    document.getElementById('gallery').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// 移动端导航
navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
});
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('open');
    });
});

// 导航高亮
const sections = ['hero', 'gallery', 'footer'];
const navLinksAll = document.querySelectorAll('.nav-link');
window.addEventListener('scroll', () => {
    let current = 'hero';
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top <= 120) current = id;
        }
    });
    navLinksAll.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// ---- 应用启动 ----
fetchPhotos(1)
    .then(photos => {
        currentPhotos = photos;
        renderGalleryWithAnimation(currentPhotos, false);
    })
    .catch(err => {
        console.error('初始化加载失败:', err);
        alert('无法加载图片，请检查网络或 API Key。');
    });