(function() {
    'use strict';

    // ===== 扩展照片库（20+ 条，图文配套） =====
    const photoLibrary = [
        {
            seed: 'forest1',
            title: '晨光林间',
            description: '阳光穿透树冠，洒在苔藓覆盖的小径上，仿佛走入童话世界。',
            date: '2026-07-12'
        },
        {
            seed: 'forest2',
            title: '溪畔翠影',
            description: '清澈的溪流倒映着两岸的绿意，水声与鸟鸣交织成夏日的交响。',
            date: '2026-07-18'
        },
        {
            seed: 'forest3',
            title: '古树之冠',
            description: '一棵百年橡树撑开巨大的华盖，为生灵提供荫庇与栖息。',
            date: '2026-07-25'
        },
        {
            seed: 'forest4',
            title: '雾漫杉林',
            description: '薄雾萦绕在杉木之间，湿度与光线共同绘出静谧的画卷。',
            date: '2026-08-02'
        },
        {
            seed: 'forest5',
            title: '野花小径',
            description: '路边盛开的野花与蕨类植物，为森林增添了一抹斑斓色彩。',
            date: '2026-08-09'
        },
        {
            seed: 'forest6',
            title: '光斑舞者',
            description: '光影在密林深处跳跃，每一个光斑都像是森林的呼吸。',
            date: '2026-08-16'
        },
        {
            seed: 'forest7',
            title: '静谧湖畔',
            description: '森林深处的湖泊如镜面般倒映着云杉，时间仿佛在此凝固。',
            date: '2026-08-22'
        },
        {
            seed: 'forest8',
            title: '金色黄昏',
            description: '斜阳将森林染成琥珀色，一天的喧嚣在此刻归于宁静。',
            date: '2026-08-29'
        },
        {
            seed: 'forest9',
            title: '雨后新绿',
            description: '雨后的森林格外清新，叶片上挂着晶莹的水珠，折射出七彩光芒。',
            date: '2026-07-05'
        },
        {
            seed: 'forest10',
            title: '蕨类秘境',
            description: '高大的蕨类植物簇拥成一片绿色海洋，仿佛回到远古时代。',
            date: '2026-07-08'
        },
        {
            seed: 'forest11',
            title: '林中小屋',
            description: '一座木屋静静地藏在树林中，烟囱升起袅袅炊烟，温暖而宁静。',
            date: '2026-07-15'
        },
        {
            seed: 'forest12',
            title: '阳光洒落',
            description: '阳光从树梢缝隙中倾泻而下，在地面形成斑驳的光影画卷。',
            date: '2026-07-20'
        },
        {
            seed: 'forest13',
            title: '秋日私语',
            description: '虽然夏天已深，但有些树叶已悄然换上金黄，预告着秋的来临。',
            date: '2026-08-01'
        },
        {
            seed: 'forest14',
            title: '青苔石阶',
            description: '石阶上覆盖着厚厚的青苔，每一步都踏在柔软的绿毯上。',
            date: '2026-08-05'
        },
        {
            seed: 'forest15',
            title: '蝴蝶翩跹',
            description: '五彩斑斓的蝴蝶在花丛中飞舞，为森林增添了灵动的色彩。',
            date: '2026-08-10'
        },
        {
            seed: 'forest16',
            title: '树影婆娑',
            description: '微风吹过，树影随风摇曳，仿佛在诉说着古老的故事。',
            date: '2026-08-14'
        },
        {
            seed: 'forest17',
            title: '溪流潺潺',
            description: '清澈的溪水绕过石块，发出悦耳的叮咚声，令人心旷神怡。',
            date: '2026-08-18'
        },
        {
            seed: 'forest18',
            title: '林间空地',
            description: '一片被树木环绕的空地，阳光直射，野花遍地，是野餐的绝佳地点。',
            date: '2026-08-21'
        },
        {
            seed: 'forest19',
            title: '雾锁山巅',
            description: '从山顶俯瞰，云雾缭绕，森林若隐若现，宛如仙境。',
            date: '2026-08-25'
        },
        {
            seed: 'forest20',
            title: '星空下森林',
            description: '夜晚的森林在星空的映照下显得神秘而深邃，虫鸣此起彼伏。',
            date: '2026-08-28'
        }
    ];

    // ===== DOM 引用 =====
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
    let isAnimating = false; // 防连点锁

    // ===== 辅助函数：从库中随机取 N 张 =====
    function getRandomPhotos(count = 8) {
        const shuffled = [...photoLibrary].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    // ===== 实际渲染内容（不带动画） =====
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

            const imgUrl = `https://picsum.photos/seed/${photo.seed}/600/400`;

            card.innerHTML = `
                <div class="card-image-wrap">
                    <img src="${imgUrl}" alt="${photo.title}" loading="lazy" />
                </div>
                <div class="card-info">
                    <h3>${photo.title}</h3>
                    <p>${photo.description}</p>
                    <span class="card-date">📅 ${photo.date}</span>
                </div>
            `;

            card.addEventListener('click', () => openModal(photo));
            grid.appendChild(card);
        });

        // 恢复视图类
        if (isListView) {
            grid.classList.add('list-view');
        } else {
            grid.classList.remove('list-view');
        }
    }

    // ===== 带淡入淡出动画的渲染 =====
    function renderGallery(photoArray, animate = true) {
        // 如果正在动画，忽略本次调用（防连点）
        if (isAnimating) return;

        // 如果网格为空（初次加载），直接渲染
        if (grid.children.length === 0) {
            buildGridContent(photoArray);
            grid.style.opacity = '1';
            return;
        }

        // 否则执行淡出淡入动画
        isAnimating = true;
        grid.style.transition = 'opacity 0.4s ease';
        grid.style.opacity = '0';

        setTimeout(() => {
            // 更新内容
            buildGridContent(photoArray);
            // 淡入
            grid.style.opacity = '1';
            // 动画结束后解锁
            setTimeout(() => {
                isAnimating = false;
            }, 400);
        }, 400);
    }

    // ===== 模态框 =====
    function openModal(photo) {
        const imgUrl = `https://picsum.photos/seed/${photo.seed}/800/600`;
        modalImage.src = imgUrl;
        modalImage.alt = photo.title;
        modalTitle.textContent = photo.title;
        modalDesc.textContent = photo.description;
        modalDate.textContent = `📅 ${photo.date}`;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ===== 事件绑定 =====
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // 随机探索
    shuffleBtn.addEventListener('click', () => {
        if (isAnimating) return; // 动画中忽略
        const originalText = shuffleBtn.textContent;
        shuffleBtn.textContent = '🔄 加载中...';
        shuffleBtn.disabled = true;

        setTimeout(() => {
            const newPhotos = getRandomPhotos(8);
            currentPhotos = newPhotos;
            renderGallery(currentPhotos, true);
            shuffleBtn.textContent = originalText;
            shuffleBtn.disabled = false;
        }, 200);
    });

    // 切换视图
    viewToggle.addEventListener('click', () => {
        isListView = !isListView;
        viewToggle.textContent = isListView ? '⊞ 网格视图' : '⊞ 切换视图';
        // 视图切换无需动画，直接重建
        buildGridContent(currentPhotos);
        // 如果当前有淡出状态，重置透明度
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

    // ===== 初始化 =====
    currentPhotos = getRandomPhotos(8);
    renderGallery(currentPhotos, false); // 初次无动画
})();