// 获取 DOM 元素（在 main.js 中传入或直接获取）
let modalElements = {};

export function initModal(elements) {
    modalElements = elements;
    // 绑定事件
    elements.close.addEventListener('click', closeModal);
    elements.overlay.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

export function openModal(photo) {
    const imgUrl = photo.src?.large || photo.src?.medium || '';
    modalElements.image.src = imgUrl;
    modalElements.image.alt = photo.alt || '照片';
    modalElements.title.textContent = photo.photographer || '摄影作品';
    modalElements.desc.textContent = photo.alt || '来自 Pexels 的美丽风景';
    modalElements.date.textContent = `📅 ${photo.date || new Date().toLocaleDateString()}`;
    modalElements.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

export function closeModal() {
    modalElements.modal.classList.remove('active');
    document.body.style.overflow = '';
}