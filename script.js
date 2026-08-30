(function() {
    'use strict';

    // ========== 配置 ==========
    const API_KEY = 'D0N5vGFjPdZBfoGWz3jKfZzkW7YG8TxPTKQwEM1B1xlpvpZOkOdL10FK'; // ⚠️ 请替换为您的真实 Pexels API Key
    const SEARCH_QUERY = '森林';            // 搜索关键词
    const COLOR = 'green';                  // 筛选绿色
    const ORIENTATION = 'landscape';        // 横屏
    const LOCALE = 'zh-CN';                 // 中文结果
    const PER_PAGE = 12;                    // 每页数量

    // ========== 内置备用图库（当 API 失败时使用） ==========
    const FALLBACK_PHOTOS = [
        { id: 10, title: '翠绿林海', description: '广袤的森林在阳光下泛起层层绿浪，生机盎然。', date: '2026-07-01' },
        { id: 11, title: '古木参天', description: '百年的橡树与松树交织成天然穹顶，清凉幽静。', date: '2026-07-03' },
        { id: 15, title: '落叶小径', description: '金色的落叶铺满蜿蜒的小路，脚踏上去沙沙作响。', date: '2026-07-11' },
        { id: 18, title: '野花山坡', description: '山坡上开满绚烂的野花，蝴蝶在花间翩翩起舞。', date: '2026-07-17' },
        { id: 20, title: '岩壁青苔', description: '陡峭的岩壁上覆盖着厚厚的苔藓，翠绿欲滴。', date: '2026-07-21' },
        { id: 24, title: '山谷远眺', description: '站在山脊远眺，层层叠叠的绿意延伸至天际。', date: '2026-07-29' },
        { id: 30, title: '林间小木屋', description: '一座古朴的木屋藏在森林中，屋顶爬满青藤。', date: '2026-08-10' },
        { id: 33, title: '冰川融水', description: '冰川融水汇成清澈的溪流，两岸是顽强的苔原植被。', date: '2026-08-16' },
        { id: 37, title: '森林沼泽', description: '宁静的沼泽中倒映着树影，水草丰美，鸟兽栖息。', date: '2026-08-24' },
        { id: 39, title: '挺拔云杉', description: '高耸入云的云杉树直指苍穹，树下是厚厚的苔藓。', date: '2026-08-28' },
        { id: 42, title: '河岸林带', description: '河流两岸是茂密的林带，倒影在水中形成双重世界。', date: '2026-07-06' },
        { id: 44, title: '秋色浸染', description: '森林被秋色浸染，金黄、橙红与深绿交织。', date: '2026-07-10' },
    ];

    // ========== DOM 引用 ==========
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

    let currentPhotos = [];
    let isListView = false;
    let isAnimating = false;

    // ========== 从 Pexels API 获取图片 ==========
    function fetchPhotos(page = 1) {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(SEARCH_QUERY)}&color=${COLOR}&orientation=${ORIENTATION}&locale=${LOCALE}&page=${page}&per_page=${PER_PAGE}`;
        console.log('请求 Pexels API:', url); // 调试信息

        return fetch(url, {
            headers: { 'Authorization': API_KEY }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }
            return res.json();
        })
        .then(data => {
            console.log('API 响应数据:', data); // 调试信息
            if (data.photos && data.photos.length > 0) {
                return data.photos;
            } else {
                throw new Error('未找到匹配的照片，请尝试更换搜索词。');
            }
        })
        .catch(err => {
            console.warn('Pexels API 请求失败，使用备用图库:', err.message);
            // 返回内置备用图片（转换为统一格式）
            return getFallbackPhotos();
        });
    }

    // 备用图库转换函数
    function getFallbackPhotos() {
        // 随机打乱并取 PER_PAGE 张
        const shuffled = [...FALLBACK_PHOTOS].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, PER_PAGE);
        return selected.map(item => ({
            id: item.id,
            src: {
                medium: `https://picsum.photos/id/${item.id}/600/400`,
                large: `https://picsum.photos/id/${item.id}/800/600`
            },
            photographer: item.title,
            alt: item.description,
            date: item.date
        }));
    }

    // ========== 渲染画廊 ==========
    function renderGallery(photoArray, animate = true) {
        if (isAnimating) return;

        if (grid.children.length === 0) {
            buildGridContent(photoArray);
            grid.style.opacity = '1';
            return;
        }

        isAnimating = true;
        grid.style.transition = 'opacity 0.4s ease';
        grid.style.opacity = '0';
        setTimeout(() => {
            buildGridContent(photoArray);
            grid.style.opacity = '1';
            setTimeout(() => {
                isAnimating = false;
            }, 400);
        }, 400);
    }

    function buildGridContent(photoArray) {
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

            // 图片地址（优先使用 medium，如果没有则用备用）
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

        if (isListView) {
            grid.classList.add('list-view');
        } else {
            grid.classList.remove('list-view');
        }
    }

    // ========== 模态框 ==========
    function openModal(photo) {
        const imgUrl = photo.src?.large || photo.src?.medium || '';
        modalImage.src = imgUrl;
        modalImage.alt = photo.alt || '照片';
        modalTitle.textContent = photo.photographer || '摄影作品';
        modalDesc.textContent = photo.alt || '来自 Pexels 的美丽风景';
        modalDate.textContent = `📅 ${photo.date || new Date().toLocaleDateString()}`;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ========== 事件绑定 ==========
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // 随机探索（翻页）
    shuffleBtn.addEventListener('click', () => {
        if (isAnimating) return;
        const originalText = shuffleBtn.textContent;
        shuffleBtn.textContent = '🔄 加载中...';
        shuffleBtn.disabled = true;

        // 随机 1~5 页
        const randomPage = Math.floor(Math.random() * 5) + 1;
        fetchPhotos(randomPage)
            .then(photos => {
                currentPhotos = photos;
                renderGallery(currentPhotos, true);
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
        buildGridContent(currentPhotos);
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

    // ========== 初始化：加载第一页 ==========
    fetchPhotos(1)
        .then(photos => {
            currentPhotos = photos;
            renderGallery(currentPhotos, false);
        })
        .catch(err => {
            console.error('初始化加载失败:', err);
            alert('无法加载图片，请检查网络或 API Key。');
        });
})();