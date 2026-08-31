// ===== DOM 元素引用（直接在模块内获取） =====
const modal = document.getElementById('modal');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const modalImage = document.getElementById('modalImage');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalDate = document.getElementById('modalDate');

// ===== 打开模态框 =====
export function openModal(photo) {
    const imgUrl = photo.src?.large || photo.src?.medium || '';
    modalImage.src = imgUrl;
    modalImage.alt = photo.alt || '照片';
    modalTitle.textContent = photo.photographer || '摄影作品';
    modalDesc.textContent = photo.alt || '来自 Pexels 的美丽风景';
    modalDate.textContent = `📅 ${photo.date || new Date().toLocaleDateString()}`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// ===== 关闭模态框 =====
export function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ===== 绑定关闭事件（只需绑定一次） =====
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});