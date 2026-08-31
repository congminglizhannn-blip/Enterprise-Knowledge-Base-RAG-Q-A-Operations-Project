// js/api.js
import { CONFIG, FALLBACK_PHOTOS } from './config.js';

// 从 Pexels 获取图片
export async function fetchPhotos(page = 1) {
    if (CONFIG.USE_FALLBACK_ONLY) {
        console.warn('强制使用备用图库');
        return getFallbackPhotos();
    }

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(CONFIG.SEARCH_QUERY)}&color=${CONFIG.COLOR}&orientation=${CONFIG.ORIENTATION}&locale=${CONFIG.LOCALE}&page=${page}&per_page=${CONFIG.PER_PAGE}`;
    console.log('请求 Pexels API:', url);

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': CONFIG.API_KEY }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log('API 响应:', data);
        if (data.photos && data.photos.length > 0) {
            return data.photos;
        } else {
            throw new Error('未找到匹配的照片');
        }
    } catch (err) {
        console.warn('API 请求失败，使用备用图库:', err.message);
        return getFallbackPhotos();
    }
}

// 获取备用图库（随机打乱）
export function getFallbackPhotos() {
    const shuffled = [...FALLBACK_PHOTOS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, CONFIG.PER_PAGE);
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