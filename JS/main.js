import { fetchPhotos } from './api.js';
import { renderGallery, buildGridContent } from './gallery.js';
import { closeModal } from './modal.js';

// ===== 状态变量 =====
let currentPhotos = [];
let isListView = false;
let isAnimating = false;

// ===== DOM 元素 =====
const shuffleBtn = document.getElementById('shuffleBtn');
const viewToggle = document.getElementById('viewToggle');
const exploreBtn = document.getElementById('exploreBtn');
const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav-links');

// ===== 辅助：更新动画状态 =====
function setIsAnimating(val) {
    isAnimating = val;
}

// ===== 事件绑定 =====
// 随机探索（翻页）
shuffleBtn.addEventListener('click', () => {
    if (isAnimating) return;
    const originalText = shuffleBtn.textContent;
    shuffleBtn.textContent = '🔄 加载中...';
    shuffleBtn.disabled = true;

    const randomPage = Math.floor(Math.random() * 5) + 1;
    fetchPhotos(randomPage)
        .then(photos => {
            currentPhotos = photos;
            renderGallery(currentPhotos, isListView, isAnimating, setIsAnimating, true);
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
    buildGridContent(currentPhotos, isListView);
    const grid = document.getElementById('galleryGrid');
    grid.style.opacity = '1';
    grid.style.transition = 'none';
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

// ===== 初始化：加载第一页 =====
fetchPhotos(1)
    .then(photos => {
        currentPhotos = photos;
        renderGallery(currentPhotos, isListView, isAnimating, setIsAnimating, false);
    })
    .catch(err => {
        console.error('初始化加载失败:', err);
        alert('无法加载图片，请检查网络或 API Key。');
    });