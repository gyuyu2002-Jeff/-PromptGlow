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
    let activeComponent = 'background';
    
    let favorites = JSON.parse(localStorage.getItem('bx_favorites') || '[]');
    let historyList = JSON.parse(localStorage.getItem('bx_history') || '[]');
    let actionStats = JSON.parse(localStorage.getItem('bx_action_stats') || '{"copy":0,"fav_add":0,"modal_open":0,"scroll_explore":0}');


    // --- DOM 元素引用 ---
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const gridModeBtn = document.getElementById('gridModeBtn');
    const listModeBtn = document.getElementById('listModeBtn');
    
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
    const modalPromptCode = document.getElementById('modalPromptCode');
    const copyPromptBtn = document.getElementById('copyPromptBtn');
    
    // Lightbox & Drawer
    const imageLightbox = document.getElementById('imageLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const drawerCloseBtn = document.getElementById('drawerCloseBtn');
    
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
        toast.className = 'toast';
        
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'check-circle');
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

    // --- 行為統計邏輯 ---
    function recordAction(actionType) {
        if (!actionStats[actionType] && actionStats[actionType] !== 0) {
            actionStats[actionType] = 0;
        }
        actionStats[actionType]++;
        localStorage.setItem('bx_action_stats', JSON.stringify(actionStats));
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

    function getBusinessNameZh3(id) {
        const mapping = {
            'biz_business-consulting': '專業諮詢',
            'biz_business-government': '政務企劃',
            'biz_industry-creative': '創意設計',
            'biz_industry-education': '教育培訓',
            'biz_industry-retail': '零售商務',
            'biz_scene-analysis': '分析報告',
            'biz_scene-newbiz': '創業提案',
            'biz_scene-product': '產品發佈',
            'biz_scene-promo': '宣傳推廣',
            'biz_style-datadriven': '數據導向',
            'biz_style-empathy': '情感共鳴',
            'biz_style-innovation': '科技創新',
            'biz_style-japanese': '日系現代',
            'biz_style-premium': '高端奢華',
            'biz_style-speed': '動感效率',
            'biz_style-storytelling': '情境敘事',
            'biz_style-tech': '未來科技',
            'biz_taste-aerial': '鳥瞰視角',
            'biz_taste-bokeh': '背景虛化',
            'biz_taste-collage': '剪貼拼貼',
            'biz_taste-duotone': '雙色搭配',
            'biz_taste-flat-gradient': '扁平漸變',
            'biz_taste-geometric': '幾何構成',
            'biz_taste-infographic': '資訊圖卡',
            'biz_taste-isometric': '等距透視',
            'biz_taste-mono-accent': '單色點綴',
            'biz_taste-solid-3d': '立體三維',
            'biz_taste-teal-orange': '青橙調色',
            'biz_taste-yuru-doodle': '手繪塗鴉',
            'biz_taste-yuru-marker': '麥克筆手感'
        };
        return mapping[id] || '';
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
            
        } catch (error) {
            console.error('加載數據庫失敗:', error);
            showToast('加載字典數據失敗，請刷新重試！', 'error');
        }
    }

    // --- 分類與標籤提取 ---
    let categories = new Set();
    let tagMap = {}; // category -> set of tags

    function generateCategoriesAndTags() {
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
        // 先計算各分類的數量
        const allCount = liteData.length;
        const businessCount = businessData.length;
        
        // 先保留固定 Tab (全部, 商業)
        tabArea.innerHTML = `
            <button class="tab-btn active" data-category="all">全部風格 (${allCount})</button>
            <button class="tab-btn" data-category="business">商業專區 (${businessCount})</button>
        `;
        
        // 渲染動態大類
        categories.forEach(cat => {
            if (cat !== 'business') {
                const count = liteData.filter(item => item.tags && item.tags[0] === cat).length;
                const btn = document.createElement('button');
                btn.className = 'tab-btn';
                btn.dataset.category = cat;
                btn.textContent = `${cat} (${count})`;
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
        subtagsArea.style.display = 'none';
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
    function matchesSubtag(item, subtag) {
        if (!item.tags) return false;
        
        const itemTagsStr = [
            ...(item.tags || []),
            item.name || '',
            item.category || '',
            item.category_zh || ''
        ].join(' ').toLowerCase();
        
        if (subtag === '扁平插畫') {
            return itemTagsStr.includes('flat') || itemTagsStr.includes('vector') || itemTagsStr.includes('扁平') || itemTagsStr.includes('插畫') || itemTagsStr.includes('向量');
        }
        if (subtag === '極簡線條') {
            return itemTagsStr.includes('minimal') || itemTagsStr.includes('極簡') || itemTagsStr.includes('線條') || itemTagsStr.includes('mono');
        }
        if (subtag === '手繪塗鴉') {
            return itemTagsStr.includes('doodle') || itemTagsStr.includes('marker') || itemTagsStr.includes('手繪') || itemTagsStr.includes('塗鴉') || itemTagsStr.includes('麥克筆');
        }
        if (subtag === '立體3D') {
            return itemTagsStr.includes('3d') || itemTagsStr.includes('clay') || itemTagsStr.includes('solid') || itemTagsStr.includes('立體') || itemTagsStr.includes('黏土') || itemTagsStr.includes('三維');
        }
        if (subtag === '資訊圖表') {
            return itemTagsStr.includes('infographic') || itemTagsStr.includes('data') || itemTagsStr.includes('圖表') || itemTagsStr.includes('數據') || itemTagsStr.includes('表格');
        }
        if (subtag === '復古印藝') {
            return itemTagsStr.includes('retro') || itemTagsStr.includes('collage') || itemTagsStr.includes('vintage') || itemTagsStr.includes('復古') || itemTagsStr.includes('印藝') || itemTagsStr.includes('拼貼');
        }
        if (subtag === '科幻光效') {
            return itemTagsStr.includes('sci-fi') || itemTagsStr.includes('neon') || itemTagsStr.includes('科幻') || itemTagsStr.includes('光效') || itemTagsStr.includes('螢光');
        }
        if (subtag === '幾何構成') {
            return itemTagsStr.includes('geometric') || itemTagsStr.includes('isometric') || itemTagsStr.includes('幾何') || itemTagsStr.includes('等距') || itemTagsStr.includes('透視');
        }
        
        return false;
    }

    function filterAndRenderCards() {
        let displayList = [];
        
        // 1. 基於大類篩選
        if (activeCategory === 'all') {
            displayList = liteData.map(item => ({ ...item, isBusiness: false }));
        } else if (activeCategory === 'business') {
            // 商業大類使用獨立數據庫
            displayList = businessData.map(item => {
                const nameParts = [item.category_zh || '商業', item.name_zh || item.name, getBusinessNameZh3(item.id)];
                const fullName = nameParts.filter(Boolean).join(' / ');
                return {
                    id: item.id,
                    name: fullName,
                    tags: [getBusinessDesignCategory(item.id), item.category_zh || '商業', item.name_zh || item.name, getBusinessNameZh3(item.id)],
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
            displayList = displayList.filter(item => matchesSubtag(item, activeSubtag));
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

        // 4. 排序處理
        if (activeCategory !== 'business') {
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
        
        if (btnElement && btnElement.id === 'copyPromptBtn') {
            yamlContent = modalPromptCode.textContent;
        } else {
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
            yamlContent = `# 提示詞模式：繁體中文呈現，字體運作流暢，無任何亂碼\n\n` + yamlContent;
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
        
        modalPromptCode.textContent = '提示詞 YAML 代碼加載中...';

        // 記錄歷史記錄
        if (!historyList.includes(item.id)) {
            historyList.unshift(item.id);
            if (historyList.length > 20) historyList.pop();
            localStorage.setItem('bx_history', JSON.stringify(historyList));
        }
        recordAction('modal_open');

        // 初始化自訂器元件與狀態
        activeComponent = 'background';
        const customTopicInput = document.getElementById('customTopicInput');
        if (customTopicInput) customTopicInput.value = '';
        
        const compDescription = document.getElementById('compDescription');
        if (compDescription) {
            compDescription.textContent = '適合做投影片底圖：低視覺干擾、中心留白，利於文字排版。';
        }
        
        const compTabs = document.querySelectorAll('.comp-tab');
        compTabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.type === activeComponent) {
                tab.classList.add('active');
            }
            
            tab.onclick = () => {
                compTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeComponent = tab.dataset.type;
                
                // 更新組件簡述
                if (compDescription) {
                    if (activeComponent === 'background') {
                        compDescription.textContent = '適合做投影片底圖：低視覺干擾、中心留白，利於文字排版。';
                    } else if (activeComponent === 'illustration') {
                        compDescription.textContent = '適合做投影片插圖：主題突出、畫面豐富，用以傳遞核心概念。';
                    } else if (activeComponent === 'icons') {
                        compDescription.textContent = '適合做投影片 Icon：一組 4 個同風格、去背扁平化的向量符號素材。';
                    }
                }
                
                updateModalPromptDisplay();
            };
        });

        const checkboxInput = document.getElementById('modalInstructionCheckbox');
        if (checkboxInput) checkboxInput.checked = true;

        // 加載完整數據
        let details = null;
        if (item.isBusiness) {
            details = item;
        } else {
            details = await loadFullDetailData(item.id);
        }
        
        if (!details) {
            modalPromptCode.textContent = '加載詳細提示詞數據失敗，請刷新或重試。';
            return;
        }
        
        // 渲染與更新 YAML 提示詞
        function updateModalPromptDisplay() {
            let displayedYaml = details.yaml || '無提示詞數據';
            if (displayedYaml && displayedYaml !== '無提示詞數據') {
                const topic = customTopicInput ? customTopicInput.value.trim() : '';
                const addInstructions = checkboxInput ? checkboxInput.checked : true;
                
                // 構建自訂配置區塊
                const displayTopic = topic || '思緒卡關時的 5 種切換方法';
                let configBlock = `### 簡報自訂配置\n- 簡報主題: ${displayTopic}\n`;
                
                if (activeComponent === 'background') {
                    configBlock += `- 生成類型: 簡報背景大圖 (Slide Background)\n- 構圖要求: 極簡構圖，畫面中心大面積留白，大量負空間以利文字排版，無任何占位文字，適合做PPT背景。\n`;
                } else if (activeComponent === 'illustration') {
                    configBlock += `- 生成類型: 簡報主題配圖 (Slide Illustration)\n- 構圖要求: 主題中心化構圖，高視覺衝擊力，生動展現核心概念，適合作為投影片插圖。\n`;
                } else if (activeComponent === 'icons') {
                    configBlock += `- 生成類型: 簡報套系圖標 (Slide Icons)\n- 構圖要求: 一組 4 個同風格的扁平向量圖標，均勻排版在乾淨單色背景上，高品質UI圖示素材。\n`;
                }
                
                // 注入配置區塊到第一行（"## 視覺風格:"）的後方
                const lines = displayedYaml.split('\n');
                let headerIndex = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('## 視覺風格:')) {
                        headerIndex = i;
                        break;
                    }
                }
                
                if (headerIndex !== -1) {
                    lines.splice(headerIndex + 1, 0, '', configBlock);
                    displayedYaml = lines.join('\n');
                } else {
                    displayedYaml = configBlock + '\n' + displayedYaml;
                }
                
                // 附加導引指令
                if (addInstructions) {
                    let prefix = `你現在是一位專業的簡報設計專家。請依據以下 YAML 格式的視覺風格規範，為我規劃並撰寫簡報內容。請嚴格遵守規範中的配色、字體、版面與插圖風格。\n\n`;
                    prefix += `---\n# 提示詞模式：繁體中文呈現，字體運作流暢，無任何亂碼\n`;
                    displayedYaml = prefix + displayedYaml;
                } else {
                    displayedYaml = `# 提示詞模式：繁體中文呈現，字體運作流暢，無任何亂碼\n\n` + displayedYaml;
                }
            }
            modalPromptCode.textContent = displayedYaml;
        }

        if (customTopicInput) customTopicInput.oninput = updateModalPromptDisplay;
        if (checkboxInput) checkboxInput.onchange = updateModalPromptDisplay;
        updateModalPromptDisplay();
        
        // 綁定彈窗內複製按鈕點擊
        copyPromptBtn.onclick = async () => {
            await copyPromptContent(details, copyPromptBtn);
        };
    }

    // 關閉 Modal
    function closeDetailModal() {
        detailModal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    modalCloseBtn.addEventListener('click', closeDetailModal);
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) closeDetailModal();
    });

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

    // --- Logo 點擊回到首頁功能 ---
    const logoArea = document.querySelector('.logo-area');
    if (logoArea) {
        logoArea.addEventListener('click', () => {
            // 1. 重設大類為 'all'，小類清空
            activeCategory = 'all';
            activeSubtag = null;
            
            // 2. 清空搜尋內容
            searchInput.value = '';
            searchQuery = '';
            clearSearchBtn.style.display = 'none';
            
            // 3. 恢復大類 Tab 按鈕的選中狀態為 'all'
            const tabBtns = tabArea.querySelectorAll('.tab-btn');
            tabBtns.forEach(btn => {
                if (btn.dataset.category === 'all') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            // 4. 重建次標籤與卡片清單
            renderSubtags();
            filterAndRenderCards();
            
            // 5. 滾動回到頂端
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
