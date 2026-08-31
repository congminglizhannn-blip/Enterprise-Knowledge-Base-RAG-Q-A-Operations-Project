// 配置模块
export const CONFIG = {
    // Pexels API 配置
    API_KEY: 'D0N5vGFjPdZBfoGWz3jKfZzkW7YG8TxPTKQwEM1B1xlpvpZOkOdL10FK', // 请替换为您自己的 Key
    SEARCH_QUERY: '森林',       // 搜索关键词（可改为您的摄影师名字）
    COLOR: 'green',
    ORIENTATION: 'landscape',
    LOCALE: 'zh-CN',
    PER_PAGE: 12,

    // 是否强制使用备用图库（设为 true 可跳过 API）
    USE_FALLBACK_ONLY: false,
};

// 备用图库数据（保证始终有图片显示）
export const FALLBACK_PHOTOS = [
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