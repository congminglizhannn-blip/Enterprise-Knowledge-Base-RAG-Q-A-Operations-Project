import { API_KEY, SEARCH_QUERY, COLOR, ORIENTATION, LOCALE, PER_PAGE } from './config.js';
import { getFallbackPhotos } from './fallback.js';

// ===== 从 Pexels API 获取图片（按搜索词） =====
export function fetchPhotos(page = 1) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(SEARCH_QUERY)}&color=${COLOR}&orientation=${ORIENTATION}&locale=${LOCALE}&page=${page}&per_page=${PER_PAGE}`;
    console.log('请求 Pexels API:', url);

    return fetch(url, {
        headers: { 'Authorization': D0N5vGFjPdZBfoGWz3jKfZzkW7YG8TxPTKQwEM1B1xlpvpZOkOdL10FK }
    })
    .then(res => {
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        return res.json();
    })
    .then(data => {
        console.log('API 响应数据:', data);
        if (data.photos && data.photos.length > 0) {
            return data.photos;
        } else {
            throw new Error('未找到匹配的照片，请尝试更换搜索词。');
        }
    })
    .catch(err => {
        console.warn('Pexels API 请求失败，使用备用图库:', err.message);
        return getFallbackPhotos();
    });
}