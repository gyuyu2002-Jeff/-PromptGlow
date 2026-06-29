/* ==========================================================================
   應用核心邏輯: AI 提示詞風格字典
   實現數據加載、搜尋過濾、詳情 Modal、雷達圖渲染、解鎖徽章與本地持久化
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- 常量定義 ---
    const BASE_IMAGE_URL = 'https://furoku.github.io/bananaX/projects/infographic-evaluation/';
    
    // --- 應用狀態 (State) ---
    let liteData = [];       /* 基礎風格數據列表 */
    let detailData = null;   /* 詳細風格數據列表 (延遲加載) */
    let businessData = [];   /* 商業特定風格列表 */
    let rankingData = null;  /* 流行度排行數據 */
    
    let activeCategory = 'all';
    let activeSubtag = null;
    let searchQuery = '';
    let viewMode = 'grid';
    
    let favorites = JSON.parse(localStorage.getItem('bx_favorites') || '[]');
    let historyList = JSON.parse(localStorage.getItem('bx_history') || '[]');
    let actionStats = JSON.parse(localStorage.getItem('bx_action_stats') || '{"copy":0,"fav_add":0,"modal_open":0,"scroll_explore":0,"badges_earned":[]}');
    
    let radarChartInstance = null;

    // --- 徽章定義 ---
    const BADGES = {
        first_copy: {
            id: 'first_copy',
            icon: 'clipboard-check',
            color: '#4CAF50',
            glow: 'rgba(76, 175, 80, 0.15)',
            threshold: 1,
            action: 'copy',
            name: '初試身手',
            desc: '首次複製風格提示詞！'
        },
        copy_master: {
            id: 'copy_master',
            icon: 'copy',
            color: '#FFB300',
            glow: 'rgba(255, 179, 0, 0.15)',
            threshold: 10,
            action: 'copy',
            name: '複製達人',
            desc: '累計複製風格提示詞達 10 次！'
        },
        collector: {
            id: 'collector',
            icon: 'heart',
            color: '#E55039',
            glow: 'rgba(229, 80, 57, 0.15)',
            threshold: 5,
            action: 'fav_add',
            name: '美學收藏家',
            desc: '收藏了 5 個風格提示詞！'
        },
        super_collector: {
            id: 'super_collector',
            icon: 'trophy',
            color: '#9C27B0',
            glow: 'rgba(156, 39, 176, 0.15)',
            threshold: 15,
            action: 'fav_add',
            name: '傳奇收藏大師',
            desc: '收藏了 15 個風格提示詞！'
        },
        explorer: {
            id: 'explorer',
            icon: 'compass',
            color: '#2196F3',
            glow: 'rgba(33, 150, 243, 0.15)',
            threshold: 10,
            action: 'modal_open',
            name: '風格探索者',
            desc: '詳細閱讀了 10 個風格的視覺評語！'
        },
        deep_diver: {
            id: 'deep_diver',
            icon: 'anchor',
            color: '#00BCD4',
            glow: 'rgba(0, 188, 212, 0.15)',
            threshold: 3,
            action: 'scroll_explore',
            name: '深潛者',
            desc: '滾動瀏覽頁面，沉浸於提示詞的海洋中！'
        }
    };

    // --- DOM 元素引用 ---
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const gridModeBtn = document.getElementById('gridModeBtn');
    const listModeBtn = document.getElementById('listModeBtn');
    const badgeTriggerBtn = document.getElementById('badgeTriggerBtn');
    const badgeCountDot = document.getElementById('badgeCountDot');
    
    const tabArea = document.getElementById('tabArea');
    const subtagsArea = document.getElementById('subtagsArea');
    const scrollLeftBtn = document.getElementById('scrollLeftBtn');
    const scrollRightBtn = document.getElementById('scrollRightBtn');
    
    const skeletonGrid = document.getElementById('skeletonGrid');
    const cardsGrid = document.getElementById('cardsGrid');
    const emptyState = document.getElementById('emptyState');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    
    // Modal
    const detailModal = document.getElementById('detailModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalImage = document.getElementById('modalImage');
    const modalNumber = document.getElementById('modalNumber');
    const modalCategory = document.getElementById('modalCategory');
    const modalTitle = document.getElementById('modalTitle');
    const modalComments = document.getElementById('modalComments');
    const modalPromptCode = document.getElementById('modalPromptCode');
    const copyPromptBtn = document.getElementById('copyPromptBtn');
    const scoreGrid = document.getElementById('scoreGrid');
    
    // Lightbox & Drawer
    const imageLightbox = document.getElementById('imageLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const badgesDrawerOverlay = document.getElementById('badgesDrawerOverlay');
    const badgesDrawer = document.getElementById('badgesDrawer');
    const drawerCloseBtn = document.getElementById('drawerCloseBtn');
    const badgesListGrid = document.getElementById('badgesListGrid');
    const badgeProgressText = document.getElementById('badgeProgressText');
    const badgeProgressBar = document.getElementById('badgeProgressBar');
    
    const toastContainer = document.getElementById('toastContainer');

    // --- 輔助函數 (Helpers) ---

    // 格式化圖片 URL，優先讀取本地批量生成的繁體中文參考圖
    function getFullImageUrl(item) {
        if (!item || !item.img) return '';
        
        // 商業專區仍使用原有邏輯 (因為商業專區包含多樣的圖表結構)
        if (item.isBusiness) {
            let path = item.img;
            path = path.replace('business-v2/', 'business-v2-thumb/');
            path = path.replace(/\.png(\?.*)?$/i, '.webp$1');
            if (path.startsWith('../')) {
                path = path.substring(3);
            } else if (path.startsWith('./')) {
                path = path.substring(2);
            }
            return BASE_IMAGE_URL + path;
        }
        
        // 一般風格，直接讀取我們本地批量下載的繁體中文範例圖片！
        return `assets/images/${item.id}.png`;
    }

    // 顯示 Toast 彈窗
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type === 'badge' ? 'badge-unlock' : ''}`;
        
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', type === 'badge' ? 'award' : 'check-circle');
        icon.style.width = '16px';
        icon.style.height = '16px';
        
        const text = document.createElement('span');
        text.textContent = message;
        
        toast.appendChild(icon);
        toast.appendChild(text);
        toastContainer.appendChild(toast);
        
        lucide.createIcons({
            attrs: {
                class: 'lucide-icon'
            }
        });
        
        // 微調觸發進場動畫
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    // --- 徽章系統邏輯 ---
    
    // 更新解鎖數目與進度條
    function updateBadgeUI() {
        const unlockedCount = actionStats.badges_earned.length;
        const totalCount = Object.keys(BADGES).length;
        
        if (badgeCountDot) {
            badgeCountDot.textContent = unlockedCount;
            badgeCountDot.style.display = unlockedCount > 0 ? 'flex' : 'none';
        }
        
        if (badgeProgressText) {
            badgeProgressText.textContent = `${unlockedCount} / ${totalCount}`;
        }
        
        if (badgeProgressBar) {
            badgeProgressBar.style.width = `${(unlockedCount / totalCount) * 100}%`;
        }
    }

    // 增長某項行為的統計值，並判斷是否解鎖徽章
    function recordAction(actionType) {
        if (!actionStats[actionType] && actionStats[actionType] !== 0) {
            actionStats[actionType] = 0;
        }
        actionStats[actionType]++;
        
        // 檢查是否有尚未解鎖的徽章達到條件
        Object.values(BADGES).forEach(badge => {
            if (badge.action === actionType && !actionStats.badges_earned.includes(badge.id)) {
                if (actionStats[actionType] >= badge.threshold) {
                    // 解鎖徽章
                    actionStats.badges_earned.push(badge.id);
                    localStorage.setItem('bx_action_stats', JSON.stringify(actionStats));
                    
                    // 彈出慶祝 Toast
                    showToast(`🏆 解鎖成就: 【${badge.name}】!`, 'badge');
                    
                    updateBadgeUI();
                    renderBadgesList();
                }
            }
        });
        
        localStorage.setItem('bx_action_stats', JSON.stringify(actionStats));
    }

    // 渲染徽章看板列表
    function renderBadgesList() {
        if (!badgesListGrid) return;
        badgesListGrid.innerHTML = '';
        
        Object.values(BADGES).forEach(badge => {
            const isUnlocked = actionStats.badges_earned.includes(badge.id);
            const item = document.createElement('div');
            item.className = `badge-drawer-item ${isUnlocked ? 'unlocked' : 'locked'}`;
            
            if (isUnlocked) {
                item.style.setProperty('--badge-color', badge.color);
                item.style.setProperty('--badge-color-glow', badge.glow);
            }
            
            item.innerHTML = `
                <div class="badge-drawer-icon">
                    <i data-lucide="${badge.icon}"></i>
                </div>
                <div class="badge-drawer-info">
                    <span class="badge-drawer-name">${badge.name}</span>
                    <span class="badge-drawer-desc">${badge.desc}</span>
                </div>
            `;
            
            // 點擊卡片彈出氣泡或微反饋
            item.addEventListener('click', () => {
                if (isUnlocked) {
                    showToast(`⭐ 您已獲得「${badge.name}」成就！`);
                } else {
                    let progress = actionStats[badge.action] || 0;
                    showToast(`🔒 未解鎖。當前進度: ${progress} / ${badge.threshold} (${badge.desc})`);
                }
            });
            
            badgesListGrid.appendChild(item);
        });
        
        lucide.createIcons();
    }
        
    function getBusinessDesignCategory(id) {
        if (!id) return '向量與扁平';
        const lid = id.toLowerCase();
        if (lid.includes('consulting') || lid.includes('government') || lid.includes('creative') || 
            lid.includes('education') || lid.includes('retail') || lid.includes('analysis') || 
            lid.includes('newbiz') || lid.includes('product') || lid.includes('promo') || 
            lid.includes('innovation') || lid.includes('flat-gradient') || lid.includes('geometric') || 
            lid.includes('infographic')) {
            return '向量與扁平';
        }
        if (lid.includes('datadriven') || lid.includes('mono-accent')) {
            return '極簡與線條';
        }
        if (lid.includes('empathy') || lid.includes('storytelling') || lid.includes('yuru-doodle') || lid.includes('yuru-marker')) {
            return '手繪塗鴉';
        }
        if (lid.includes('japanese') || lid.includes('duotone')) {
            return '復古與印藝';
        }
        if (lid.includes('premium') || lid.includes('speed') || lid.includes('aerial') || 
            lid.includes('bokeh') || lid.includes('collage') || lid.includes('teal-orange')) {
            return '藝術與排版';
        }
        if (lid.includes('tech')) {
            return '科幻與光效';
        }
        if (lid.includes('isometric') || lid.includes('solid-3d')) {
            return '立體與3D';
        }
        return '向量與扁平';
    }
    
    function getBusinessStyleNumber(id) {
        const mapping = {
            'biz_business-consulting': 58,
            'biz_business-government': 58,
            'biz_industry-creative': 1,
            'biz_industry-education': 58,
            'biz_industry-retail': 58,
            'biz_scene-analysis': 58,
            'biz_scene-newbiz': 58,
            'biz_scene-product': 58,
            'biz_scene-promo': 58,
            'biz_style-datadriven': 83,
            'biz_style-empathy': 44,
            'biz_style-innovation': 1,
            'biz_style-japanese': 18,
            'biz_style-premium': 10,
            'biz_style-speed': 94,
            'biz_style-storytelling': 47,
            'biz_style-tech': 86,
            'biz_taste-aerial': 6,
            'biz_taste-bokeh': 2,
            'biz_taste-collage': 101,
            'biz_taste-duotone': 3,
            'biz_taste-flat-gradient': 91,
            'biz_taste-geometric': 12,
            'biz_taste-infographic': 76,
            'biz_taste-isometric': 71,
            'biz_taste-mono-accent': 3,
            'biz_taste-solid-3d': 72,
            'biz_taste-teal-orange': 28,
            'biz_taste-yuru-doodle': 43,
            'biz_taste-yuru-marker': 44
        };
        return mapping[id] || 1;
    }

    function sanitizeGarbledText(text) {
        if (!text) return '';
        const trimText = text.trim();
        // 修正特定混淆或不精確的分類標語，使其簡單易懂
        if (trimText === 'Vq' || trimText.includes('擦拭') || trimText.includes('向量')) {
            return '向量與扁平';
        }
        if (trimText.includes('備註') || trimText.includes('科幻')) {
            return '科幻與光效';
        }
        if (trimText === '壁畫圖') {
            return '扁平插畫';
        }
        if (trimText === '風味') {
            return '視覺調性';
        }
        return trimText;
    }

    // --- 數據庫加載 ---
    async function loadData() {
        try {
            const cacheBust = '?v=' + Date.now();
            // 同步加載排行榜、精簡數據與商業專區數據
            const [rankingRes, liteRes, businessRes] = await Promise.all([
                fetch('data/style-ranking.json' + cacheBust).then(res => res.ok ? res.json() : null).catch(() => null),
                fetch('data/evaluation_lite.json' + cacheBust).then(res => res.json()),
                fetch('data/business_prompts.json' + cacheBust).then(res => res.ok ? res.json() : [])
            ]);
            
            rankingData = rankingRes;
            businessData = businessRes.map((item, index) => {
                item.number = getBusinessStyleNumber(item.id);
                item.isBusiness = true;
                return item;
            });
            
            // 轉換精簡數據的格式與多語言名稱，並生成默認 tag 標籤
            liteData = liteRes.map(item => {
                // 優先使用中文化名稱與標籤
                item.name_original = item.name;
                if (item.name_zh) {
                    item.name = item.name_zh;
                }
                
                let rawTags = [];
                if (item.tags_zh && item.tags_zh.length) {
                    rawTags = item.tags_zh;
                } else if (item.tags && item.tags.length) {
                    rawTags = item.tags;
                } else {
                    rawTags = item.name ? item.name.split(' / ').map(t => t.trim()) : [];
                }
                
                // 淨化可能存在的亂碼與不精確字詞
                item.name = sanitizeGarbledText(item.name);
                item.tags = rawTags.map(t => sanitizeGarbledText(t));
                return item;
            });

            // 提取主分類與次級標籤
            generateCategoriesAndTags();
            
            // 渲染類別 Tabs
            renderCategoryTabs();
            
            // 隱藏骨架屏，顯示卡片網格
            if (skeletonGrid) skeletonGrid.style.display = 'none';
            if (cardsGrid) cardsGrid.style.display = 'grid';
            
            // 初始化渲染卡片流
            filterAndRenderCards();
            
            // 初始化徽章
            updateBadgeUI();
            renderBadgesList();
            
        } catch (error) {
            console.error('加載數據庫失敗:', error);
            showToast('加載字典數據失敗，請刷新重試！', 'error');
        }
    }

    // --- 分類與標籤提取 ---
    let categories = new Set();
    let tagMap = {}; // category -> set of tags

    function generateCategoriesAndTags() {
        categories.add('featured');
        categories.add('business');
        
        liteData.forEach(item => {
            if (item.tags && item.tags.length > 0) {
                const mainCat = item.tags[0]; // 第一個標籤作為主分類
                categories.add(mainCat);
                
                if (!tagMap[mainCat]) {
                    tagMap[mainCat] = new Set();
                }
                
                // 將後面的標籤作為該大類下的次級篩選標籤
                item.tags.slice(1).forEach(tag => {
                    tagMap[mainCat].add(tag);
                });
            }
        });
    }

    // --- 類別與次標籤渲染 ---
    function renderCategoryTabs() {
        // 先保留前三個固定 Tab (全部, 流行, 商業)
        tabArea.innerHTML = `
            <button class="tab-btn active" data-category="all">全部風格</button>
            <button class="tab-btn" data-category="featured">🔥 流行推薦</button>
            <button class="tab-btn" data-category="business">💼 商業專區</button>
        `;
        
        // 渲染動態大類
        categories.forEach(cat => {
            if (cat !== 'featured' && cat !== 'business') {
                const btn = document.createElement('button');
                btn.className = 'tab-btn';
                btn.dataset.category = cat;
                btn.textContent = cat;
                tabArea.appendChild(btn);
            }
        });
        
        // 添加 Tab 按鈕點擊監聽
        const tabBtns = tabArea.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                activeCategory = btn.dataset.category;
                activeSubtag = null; // 切換大類時清空小類篩選
                
                renderSubtags();
                filterAndRenderCards();
                scrollToSelectedTab(btn);
                
                // 切換分類時，頁面平滑滾動回頂端
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        checkScrollIndicator();
    }

    function renderSubtags() {
        subtagsArea.innerHTML = '';
        
        let tagsToRender = new Set();
        
        if (activeCategory === 'all') {
            // "全部" 類別下，提取所有次級標籤的前 15 個熱門標籤
            const allTagsCount = {};
            liteData.forEach(item => {
                if (item.tags) {
                    item.tags.slice(1).forEach(tag => {
                        allTagsCount[tag] = (allTagsCount[tag] || 0) + 1;
                    });
                }
            });
            // 排序並取前 15 個
            const sortedTags = Object.keys(allTagsCount).sort((a,b) => allTagsCount[b] - allTagsCount[a]);
            sortedTags.slice(0, 15).forEach(t => tagsToRender.add(t));
            
        } else if (activeCategory === 'featured') {
            // 推薦類別下展示熱門的前 8 個
            tagsToRender.add('Flat');
            tagsToRender.add('Doodle');
            tagsToRender.add('Isometric');
            tagsToRender.add('Clay');
            tagsToRender.add('Minimal');
            
        } else if (activeCategory === 'business') {
            // 商業大類下，展示行業細分
            const bizCats = new Set();
            businessData.forEach(item => {
                if (item.category_zh) bizCats.add(item.category_zh);
            });
            bizCats.forEach(c => tagsToRender.add(c));
            
        } else if (tagMap[activeCategory]) {
            // 對應主分類下的次標籤
            tagMap[activeCategory].forEach(t => tagsToRender.add(t));
        }
        
        if (tagsToRender.size > 0) {
            tagsToRender.forEach(tag => {
                const btn = document.createElement('button');
                btn.className = `subtag-btn ${activeSubtag === tag ? 'active' : ''}`;
                btn.textContent = tag;
                
                btn.addEventListener('click', () => {
                    if (activeSubtag === tag) {
                        activeSubtag = null;
                        btn.classList.remove('active');
                    } else {
                        subtagsArea.querySelectorAll('.subtag-btn').forEach(b => b.classList.remove('active'));
                        activeSubtag = tag;
                        btn.classList.add('active');
                    }
                    filterAndRenderCards();
                    
                    // 切換小分類時，頁面平滑滾動回頂端
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                
                subtagsArea.appendChild(btn);
            });
        }
    }

    // 點擊分類 Tab 後，平滑滾動使其居中
    function scrollToSelectedTab(btn) {
        const tabAreaRect = tabArea.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        
        const scrollLeft = tabArea.scrollLeft + (btnRect.left - tabAreaRect.left) - (tabAreaRect.width / 2) + (btnRect.width / 2);
        tabArea.scrollTo({
            left: scrollLeft,
            behavior: 'smooth'
        });
    }

    // Tab 左右滾動按鈕顯示檢測
    function checkScrollIndicator() {
        const showLeft = tabArea.scrollLeft > 5;
        const showRight = tabArea.scrollWidth - tabArea.clientWidth - tabArea.scrollLeft > 5;
        
        scrollLeftBtn.classList.toggle('visible', showLeft);
        scrollRightBtn.classList.toggle('visible', showRight);
    }

    tabArea.addEventListener('scroll', checkScrollIndicator);
    window.addEventListener('resize', checkScrollIndicator);

    scrollLeftBtn.addEventListener('click', () => {
        tabArea.scrollBy({ left: -200, behavior: 'smooth' });
    });
    scrollRightBtn.addEventListener('click', () => {
        tabArea.scrollBy({ left: 200, behavior: 'smooth' });
    });

    // --- 搜尋與卡片過濾 ---
    function filterAndRenderCards() {
        let displayList = [];
        
        // 1. 基於大類篩選
        if (activeCategory === 'all') {
            displayList = liteData.map(item => ({ ...item, isBusiness: false }));
        } else if (activeCategory === 'featured') {
            // 根據流行榜排序提取前 30 名，如果沒有流行數據，提取前 30 個項目
            if (rankingData && rankingData.order) {
                const popIds = rankingData.order;
                const map = new Map(liteData.map(item => [item.id, item]));
                popIds.forEach(id => {
                    const item = map.get(id);
                    if (item) displayList.push(item);
                });
                // 補齊剩餘卡片直到 displayList 滿 40 個，防止空白
                liteData.forEach(item => {
                    if (!displayList.includes(item) && displayList.length < 40) {
                        displayList.push(item);
                    }
                });
            } else {
                displayList = liteData.slice(0, 30);
            }
        } else if (activeCategory === 'business') {
            // 商業大類使用獨立數據庫
            displayList = businessData.map(item => {
                const nameParts = [item.category_zh || '商業', item.name_zh || item.name, item.name_en || ''];
                const fullName = nameParts.filter(Boolean).join(' / ');
                return {
                    id: item.id,
                    name: fullName,
                    tags: [getBusinessDesignCategory(item.id), item.category_zh || '商業', item.name_zh || item.name, item.name_en || ''],
                    img: item.img,
                    isBusiness: true,
                    yaml: item.yaml,
                    number: item.number
                };
            });
        } else {
            // 標準大類過濾
            displayList = liteData.filter(item => item.tags && item.tags[0] === activeCategory).map(item => ({ ...item, isBusiness: false }));
        }

        // 2. 基於細分標籤篩選
        if (activeSubtag) {
            if (activeCategory === 'business') {
                displayList = displayList.filter(item => item.tags && item.tags[0] === activeSubtag);
            } else {
                displayList = displayList.filter(item => item.tags && item.tags.slice(1).includes(activeSubtag));
            }
        }

        // 3. 基於關鍵字搜尋過濾 (ID, 名稱, 標籤)
        if (searchQuery) {
            const query = searchQuery.toLowerCase().trim();
            const cleanQuery = query.startsWith('#') ? query.substring(1) : query;
            displayList = displayList.filter(item => {
                const nameMatch = item.name && item.name.toLowerCase().includes(query);
                const idMatch = item.id && item.id.toLowerCase().includes(query);
                const paddedNum = item.number ? String(item.number).padStart(3, '0') : '';
                const numberMatch = item.number && (String(item.number).includes(cleanQuery) || paddedNum.includes(cleanQuery));
                const tagMatch = item.tags && item.tags.some(t => t.toLowerCase().includes(query));
                return nameMatch || idMatch || numberMatch || tagMatch;
            });
        }

        // 4. 排序處理 (流行榜優先)
        if (activeCategory !== 'featured' && activeCategory !== 'business') {
            displayList.sort((a, b) => (a.number || 0) - (b.number || 0));
        }

        // 渲染頁面
        renderCards(displayList);
    }

    // 渲染卡片 UI 列表
    function renderCards(list) {
        cardsGrid.innerHTML = '';
        
        if (list.length === 0) {
            cardsGrid.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        cardsGrid.style.display = viewMode === 'grid' ? 'grid' : 'block';
        if (viewMode === 'list') {
            cardsGrid.classList.remove('grid-mode');
            cardsGrid.classList.add('list-mode');
        } else {
            cardsGrid.classList.remove('list-mode');
            cardsGrid.classList.add('grid-mode');
        }

        const fragment = document.createDocumentFragment();
        
        list.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = `style-card ${item.isBusiness ? 'biz-style' : ''}`;
            card.dataset.id = item.id;
            
            const isFav = favorites.includes(item.id);
            const displayId = `#${String(item.number).padStart(3, '0')}`;
            const category = item.tags && item.tags[0] ? item.tags[0] : '視覺風格';
            const imgUrl = getFullImageUrl(item);
            
            card.innerHTML = `
                <div class="card-image-box">
                    <img src="${imgUrl}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="card-image-placeholder-tc" style="display: none;">
                        <div class="placeholder-content">
                            <div class="placeholder-title">思緒卡關時的 5 種切換方法</div>
                            <div class="placeholder-list">
                                <div>1. 走路能增加靈感</div>
                                <div>2. 調整呼吸沉澱思緒</div>
                                <div>3. 變換場所重置注意力</div>
                                <div>4. 寫下來整理腦袋</div>
                                <div>5. 短暫休息恢復專注力</div>
                            </div>
                            <div class="placeholder-footer">[ ${item.name} | 繁中化中 ]</div>
                        </div>
                    </div>
                    <div class="card-image-overlay"></div>
                    <button class="card-fav-btn ${isFav ? 'active' : ''}" title="加入收藏">
                        <i data-lucide="heart"></i>
                    </button>
                </div>
                <div class="card-info">
                    <div class="card-meta-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <span class="card-meta" style="margin-bottom: 0;">${category}</span>
                        <span class="card-badge">${displayId}</span>
                    </div>
                    <h3 class="card-title" title="${item.name}">${item.name}</h3>
                    <div class="card-tags">
                        ${item.tags ? item.tags.slice(1, 4).map(t => `<span class="card-tag">${t}</span>`).join('') : ''}
                    </div>
                    <div class="card-action-group">
                        <button class="card-btn btn-copy" title="複製 YAML 提示詞">
                            <i data-lucide="copy"></i> 複製
                        </button>
                        <button class="card-btn btn-detail" title="查看視覺詳情">
                            詳細資訊
                        </button>
                    </div>
                </div>
            `;
            
            // --- 註冊卡片內部交互事件 ---
            
            // 收藏按鈕點擊
            const favBtn = card.querySelector('.card-fav-btn');
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(item.id, favBtn);
            });
            
            // 複制按鈕點擊
            const copyBtn = card.querySelector('.btn-copy');
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await copyPromptContent(item, copyBtn);
            });
            
            // 卡片主體與詳情按鈕點擊打開詳情 Modal
            const openDetails = () => {
                openDetailModal(item);
            };
            
            card.addEventListener('click', openDetails);
            card.querySelector('.btn-detail').addEventListener('click', (e) => {
                e.stopPropagation();
                openDetails();
            });
            
            fragment.appendChild(card);
        });
        
        cardsGrid.appendChild(fragment);
        lucide.createIcons();
        
        // GSAP 卡片入場淡入動畫
        gsap.fromTo('.style-card', 
            { opacity: 0, y: 15 },
            { opacity: 1, y: 0, duration: 0.45, stagger: 0.03, ease: 'power2.out' }
        );
    }

    // --- 複製與收藏邏輯 ---
    
    // 收藏 / 取消收藏
    function toggleFavorite(id, btnElement) {
        const index = favorites.indexOf(id);
        if (index === -1) {
            favorites.push(id);
            btnElement.classList.add('active');
            showToast('已加入收藏夾！');
            recordAction('fav_add');
        } else {
            favorites.splice(index, 1);
            btnElement.classList.remove('active');
            showToast('已從收藏夾移除');
        }
        localStorage.setItem('bx_favorites', JSON.stringify(favorites));
    }

    // 複製 YAML 提示詞
    async function copyPromptContent(item, btnElement) {
        let yamlContent = '';
        
        if (item.isBusiness && item.yaml) {
            yamlContent = item.yaml;
        } else {
            // 一般風格，需要延遲加載完整數據
            const fullDetails = await loadFullDetailData(item.id);
            if (fullDetails && fullDetails.yaml) {
                yamlContent = fullDetails.yaml;
            } else {
                showToast('無法讀取提示詞，請重試！', 'error');
                return;
            }
        }
        
        navigator.clipboard.writeText(yamlContent).then(() => {
            const btnText = btnElement.querySelector('span') || btnElement;
            const originalText = btnText.innerHTML;
            
            btnElement.classList.add('copied');
            btnText.innerHTML = btnElement.querySelector('span') ? '<i data-lucide="check"></i> 已複製' : '已複製';
            if (btnElement.querySelector('span')) lucide.createIcons();
            
            showToast('YAML 提示詞複製成功，快去 AI 工具試試吧！');
            recordAction('copy');
            
            setTimeout(() => {
                btnElement.classList.remove('copied');
                btnText.innerHTML = originalText;
                lucide.createIcons();
            }, 2000);
        }).catch(err => {
            console.error('複製失敗:', err);
            showToast('複製失敗，瀏覽器拒絕了剪貼簿訪問！', 'error');
        });
    }

    // 異步延遲加載完整數據庫
    async function loadFullDetailData(id) {
        if (!detailData) {
            try {
                detailData = await fetch('data/evaluation_data.json?v=' + Date.now()).then(res => res.json());
            } catch (e) {
                console.error('加載詳細數據失敗:', e);
                return null;
            }
        }
        return detailData.find(x => x.id === id);
    }

    // --- 詳情彈窗控制與圖表渲染 ---
    async function openDetailModal(item) {
        // 先顯示模態窗口並填入 Lite 數據
        detailModal.classList.add('active');
        document.body.style.overflow = 'hidden'; // 禁止底層滾動
        
        // 動態控制圖片排版對照組的顯示與隱藏 (所有一般風格都顯示，商業風格隱藏)
        const translationCard = document.getElementById('imageTranslationCard');
        if (translationCard) {
            if (item.isBusiness) {
                translationCard.style.display = 'none';
            } else {
                translationCard.style.display = 'block';
            }
        }
        
        modalNumber.textContent = `#${String(item.number).padStart(3, '0')}`;
        modalCategory.textContent = item.tags && item.tags[0] ? item.tags[0] : '分類';
        modalTitle.textContent = item.name;
        // 重設圖片與預覽占位卡的顯示狀態
        modalImage.style.display = 'block';
        const modalPH = document.getElementById('modalImagePlaceholder');
        const modalZO = document.getElementById('modalImageZoomOverlay');
        const modalPHFooter = document.getElementById('modalPlaceholderFooter');
        if (modalPH) modalPH.style.display = 'none';
        if (modalZO) modalZO.style.display = 'flex';
        if (modalPHFooter) modalPHFooter.textContent = `[ ${item.name} | 繁中化中 ]`;
        
        modalImage.src = getFullImageUrl(item);
        
        // 骨架屏載入提示
        modalComments.innerHTML = '<div class="comment-item"><span class="comment-text">專家評語加載中...</span></div>';
        modalPromptCode.textContent = '提示詞 YAML 代碼加載中...';
        scoreGrid.innerHTML = '';
        
        // 清理舊雷達圖
        if (radarChartInstance) {
            radarChartInstance.destroy();
            radarChartInstance = null;
        }

        // 記錄歷史記錄
        if (!historyList.includes(item.id)) {
            historyList.unshift(item.id);
            if (historyList.length > 20) historyList.pop();
            localStorage.setItem('bx_history', JSON.stringify(historyList));
        }
        recordAction('modal_open');

        // 加載完整數據
        let details = null;
        if (item.isBusiness) {
            details = item;
        } else {
            details = await loadFullDetailData(item.id);
        }
        
        if (!details) {
            modalComments.innerHTML = '<div class="comment-item"><span class="comment-text" style="color:var(--accent);">加載詳細評估數據失敗，請檢查網絡。</span></div>';
            return;
        }
        
        // 渲染 YAML 提示詞
        modalPromptCode.textContent = details.yaml || '無提示詞數據';
        
        // 渲染雷達圖與五維度評分
        // 默認五維度評估
        let scores = details.scores || {
            'Legibility': 6,
            'Hierarchy': 6,
            'Consistency': 6,
            'Atmosphere': 6,
            'Theme Fit': 6
        };
        
        // 如果是商業提示詞，虛擬一組中規中矩的評分，或者展示基本評分
        if (item.isBusiness) {
            scores = { 'Legibility': 8, 'Hierarchy': 8, 'Consistency': 8, 'Atmosphere': 7, 'Theme Fit': 9 };
        }
        
        renderRadarChart(scores);
        renderScoreBars(scores);
        
        // 渲染專家點評 (Comments)
        modalComments.innerHTML = '';
        
        const keyMap = {
            'Legibility': '🔍 可讀性 (Legibility)',
            'Hierarchy': '📐 視覺層級 (Hierarchy)',
            'Consistency': '🎨 風格一致性 (Consistency)',
            'Atmosphere': '✨ 畫面氛圍 (Atmosphere)',
            'Theme Fit': '🎯 主題契合度 (Theme Fit)'
        };
        
        if (details.comments) {
            Object.entries(details.comments).forEach(([dimension, text]) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'comment-item';
                itemDiv.innerHTML = `
                    <span class="comment-label">${keyMap[dimension] || dimension}</span>
                    <span class="comment-text">${text}</span>
                `;
                modalComments.appendChild(itemDiv);
            });
        } else {
            // 商業專區沒有標準 comments，提供默認點評
            const itemDiv = document.createElement('div');
            itemDiv.className = 'comment-item';
            itemDiv.innerHTML = `
                <span class="comment-label">💼 商業專區評估</span>
                <span class="comment-text">此風格特別針對商業簡報、圖表、諮詢行銷場景進行了最佳化。具備極高的訊息清晰度與版面結構感，非常適合高階簡報與企業視覺化展示。</span>
            `;
            modalComments.appendChild(itemDiv);
        }
        
        // 綁定彈窗內複製按鈕點擊
        copyPromptBtn.onclick = async () => {
            await copyPromptContent(details, copyPromptBtn);
        };
    }

    // 關閉 Modal
    function closeDetailModal() {
        detailModal.classList.remove('active');
        document.body.style.overflow = '';
        if (radarChartInstance) {
            radarChartInstance.destroy();
            radarChartInstance = null;
        }
    }
    
    modalCloseBtn.addEventListener('click', closeDetailModal);
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) closeDetailModal();
    });

    // 渲染雷達圖
    function renderRadarChart(scores) {
        const ctx = document.getElementById('radarChart').getContext('2d');
        
        // 雷達圖維度漢化
        const labels = ['可讀性', '視覺層級', '風格一致性', '畫面氛圍', '主題契合'];
        const values = [
            scores.Legibility || scores['Legibility'] || 0,
            scores.Hierarchy || scores['Hierarchy'] || 0,
            scores.Consistency || scores['Consistency'] || 0,
            scores.Atmosphere || scores['Atmosphere'] || 0,
            scores.ThemeFit || scores['Theme Fit'] || 0
        ];
        
        radarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: '設計評分',
                    data: values,
                    backgroundColor: 'rgba(229, 80, 57, 0.2)',
                    borderColor: '#E55039',
                    borderWidth: 2,
                    pointBackgroundColor: '#E55039',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#E55039',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    r: {
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.08)'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.08)'
                        },
                        pointLabels: {
                            font: {
                                family: "'Outfit', 'Noto Sans TC'",
                                size: 11,
                                weight: '600'
                            },
                            color: '#2C2C2C'
                        },
                        ticks: {
                            stepSize: 2,
                            display: false // 隱藏多餘刻度數字
                        },
                        min: 0,
                        max: 10
                    }
                }
            }
        });
    }

    // 渲染彈窗左側下方的五維度評分進度條
    function renderScoreBars(scores) {
        scoreGrid.innerHTML = '';
        
        const keyMap = {
            'Legibility': '可讀性',
            'Hierarchy': '視覺層級',
            'Consistency': '一致性',
            'Atmosphere': '畫面氛圍',
            'Theme Fit': '主題契合'
        };
        
        Object.entries(scores).forEach(([key, val]) => {
            const barItem = document.createElement('div');
            barItem.className = 'score-bar-item';
            
            barItem.innerHTML = `
                <span class="score-label">${keyMap[key] || key}</span>
                <div class="score-bar-bg">
                    <div class="score-bar-fill" style="width: 0%;"></div>
                </div>
                <span class="score-value">${val}/10</span>
            `;
            
            scoreGrid.appendChild(barItem);
            
            // 延時觸發寬度過渡動畫，形成微交互體驗
            setTimeout(() => {
                const fill = barItem.querySelector('.score-bar-fill');
                if (fill) fill.style.width = `${val * 10}%`;
            }, 100);
        });
    }

    // --- Lightbox 圖片放大 ---
    const modalImageWrapper = document.querySelector('.modal-image-wrapper');
    if (modalImageWrapper) {
        modalImageWrapper.addEventListener('click', () => {
            lightboxImg.src = modalImage.src;
            imageLightbox.classList.add('active');
        });
    }

    imageLightbox.addEventListener('click', () => {
        imageLightbox.classList.remove('active');
    });

    // --- 成就徽章 Drawer 控制 ---
    if (badgeTriggerBtn) {
        badgeTriggerBtn.addEventListener('click', () => {
            renderBadgesList();
            if (badgesDrawerOverlay) badgesDrawerOverlay.classList.add('active');
        });
    }

    if (drawerCloseBtn) {
        drawerCloseBtn.addEventListener('click', () => {
            if (badgesDrawerOverlay) badgesDrawerOverlay.classList.remove('active');
        });
    }

    if (badgesDrawerOverlay) {
        badgesDrawerOverlay.addEventListener('click', (e) => {
            if (e.target === badgesDrawerOverlay) {
                badgesDrawerOverlay.classList.remove('active');
            }
        });
    }

    // --- 搜尋事件監聽 ---
    let searchTimeout = null;
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
        
        // 搜尋防抖 (Debounce) 以提升渲染性能
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterAndRenderCards();
        }, 150);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        filterAndRenderCards();
        searchInput.focus();
    });

    // --- 視圖切換監聽 ---
    gridModeBtn.addEventListener('click', () => {
        if (viewMode === 'grid') return;
        viewMode = 'grid';
        gridModeBtn.classList.add('active');
        listModeBtn.classList.remove('active');
        filterAndRenderCards();
    });

    listModeBtn.addEventListener('click', () => {
        if (viewMode === 'list') return;
        viewMode = 'list';
        listModeBtn.classList.add('active');
        gridModeBtn.classList.remove('active');
        filterAndRenderCards();
    });

    // --- 重置篩選監聽 ---
    resetFiltersBtn.addEventListener('click', resetAllFilters);
    
    function resetAllFilters() {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        
        // 恢復全部 Tab
        tabArea.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const allTab = tabArea.querySelector('[data-category="all"]');
        if (allTab) allTab.classList.add('active');
        
        activeCategory = 'all';
        activeSubtag = null;
        
        renderSubtags();
        filterAndRenderCards();
    }

    // --- 深度滾動監測 (深潛者徽章) ---
    let scrollLogged = false;
    window.addEventListener('scroll', () => {
        if (scrollLogged) return;
        
        const threshold = document.documentElement.scrollHeight - window.innerHeight - 300;
        if (window.scrollY >= threshold) {
            scrollLogged = true;
            recordAction('scroll_explore');
            
            // 延遲一段時間重置狀態，允許重複滾動統計
            setTimeout(() => {
                scrollLogged = false;
            }, 60000);
        }
    }, { passive: true });

    // --- 初始化啟動 ---
    loadData();
});
