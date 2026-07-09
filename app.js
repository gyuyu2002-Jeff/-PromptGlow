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

    const SEARCH_SYNONYMS = {
        '科技': ['科幻', '光效', '未來感', '未來科技', 'tech', 'sci-fi', 'neon', 'cyber', 'digital'],
        '科幻': ['科技', '光效', '未來感', '霓虹', 'tech', 'sci-fi', 'neon', 'cyber'],
        '光效': ['科技', '科幻', '霓虹', '螢光', 'neon', 'glow'],
        '未來感': ['科技', '科幻', '光效', '未來科技', 'future', 'futuristic', 'tech'],
        '商務': ['商業', '企業', '簡報', '提案', 'business', 'corporate'],
        '商業': ['商務', '企業', '提案', '簡報', 'business', 'corporate'],
        '資料': ['數據', '圖表', '資訊圖表', '報告', 'data', 'infographic', 'chart'],
        '數據': ['資料', '圖表', '資訊圖表', '報告', 'data', 'infographic', 'chart'],
        '極簡': ['簡約', '乾淨', '留白', '線條', 'minimal', 'clean'],
        '簡約': ['極簡', '乾淨', '留白', '線條', 'minimal', 'clean'],
        '手繪': ['塗鴉', '插畫', '麥克筆', '親切', 'doodle', 'marker', 'hand-drawn'],
        '立體': ['3d', '三維', '黏土', 'isometric', 'solid'],
        '復古': ['懷舊', '拼貼', '印藝', 'retro', 'vintage', 'collage']
    };

    function expandSearchTerms(query) {
        const normalizedQuery = query.toLowerCase().trim();
        const cleanQuery = normalizedQuery.startsWith('#') ? normalizedQuery.substring(1) : normalizedQuery;
        const terms = new Set([normalizedQuery, cleanQuery]);

        Object.entries(SEARCH_SYNONYMS).forEach(([keyword, synonyms]) => {
            const group = [keyword, ...synonyms].map(term => term.toLowerCase());
            if (group.some(term => term.includes(cleanQuery) || cleanQuery.includes(term))) {
                group.forEach(term => terms.add(term));
            }
        });

        return [...terms].filter(Boolean);
    }

    function getSearchScore(item, query, cleanQuery, searchTerms) {
        const advice = getStyleUsageAdvice(item);
        const directText = [
            item.name || '',
            item.id || '',
            item.category || '',
            item.category_zh || '',
            ...(item.tags || [])
        ].join(' ').toLowerCase();
        const fitText = advice.fit.toLowerCase();
        const paddedNum = item.number ? String(item.number).padStart(3, '0') : '';
        let score = 0;

        if (item.number && (String(item.number).includes(cleanQuery) || paddedNum.includes(cleanQuery))) score += 100;
        if (directText.includes(query)) score += 80;

        searchTerms.forEach(term => {
            if (directText.includes(term)) score += 40;
            if (fitText.includes(term)) score += 8;
        });

        return score;
    }

    function getStyleUsageAdvice(item) {
        const text = [
            item.name || '',
            item.category || '',
            item.category_zh || '',
            ...(item.tags || [])
        ].join(' ').toLowerCase();

        if (text.includes('tech') || text.includes('sci-fi') || text.includes('neon') || text.includes('科幻') || text.includes('光效') || text.includes('科技')) {
            return {
                fit: '科技產品、AI、數位轉型、創新提案',
                avoid: '溫馨人文、傳統產業、需要低調信任感的內容'
            };
        }
        if (text.includes('infographic') || text.includes('data') || text.includes('圖表') || text.includes('數據') || text.includes('資訊')) {
            return {
                fit: '數據報告、研究摘要、流程說明、成效回顧',
                avoid: '情緒故事、品牌形象片、需要大量留白的封面'
            };
        }
        if (text.includes('minimal') || text.includes('mono') || text.includes('極簡') || text.includes('線條') || text.includes('簡約')) {
            return {
                fit: '高階商務、策略簡報、顧問報告、產品介紹',
                avoid: '熱鬧促銷、兒童教育、需要強烈情緒的主題'
            };
        }
        if (text.includes('doodle') || text.includes('marker') || text.includes('hand') || text.includes('手繪') || text.includes('塗鴉') || text.includes('麥克筆')) {
            return {
                fit: '工作坊、教學說明、創意發想、團隊溝通',
                avoid: '正式財報、法遵文件、嚴肅政府標案'
            };
        }
        if (text.includes('3d') || text.includes('isometric') || text.includes('solid') || text.includes('立體') || text.includes('三維') || text.includes('等距')) {
            return {
                fit: '產品功能、平台架構、服務流程、科技概念',
                avoid: '文字密集報告、嚴肅政策說明、低成本草案'
            };
        }
        if (text.includes('retro') || text.includes('vintage') || text.includes('collage') || text.includes('復古') || text.includes('拼貼') || text.includes('印藝')) {
            return {
                fit: '品牌故事、文化企劃、活動主視覺、創意提案',
                avoid: '精準數據報告、金融法務、需要現代科技感的內容'
            };
        }
        if (text.includes('premium') || text.includes('luxury') || text.includes('高端') || text.includes('奢華')) {
            return {
                fit: '品牌定位、高單價產品、精品服務、募資簡報',
                avoid: '大量資訊教學、平價促銷、內部流程文件'
            };
        }
        if (text.includes('business') || text.includes('corporate') || text.includes('商務') || text.includes('商業') || text.includes('企業')) {
            return {
                fit: '公司簡介、商業計劃、提案簡報、年度報告',
                avoid: '實驗性藝術、輕鬆社群貼文、兒童向內容'
            };
        }
        if (text.includes('flat') || text.includes('vector') || text.includes('扁平') || text.includes('向量') || text.includes('插畫')) {
            return {
                fit: '產品介紹、教學懶人包、服務流程、行銷簡報',
                avoid: '高奢品牌、嚴肅財報、需要照片真實感的主題'
            };
        }
        return {
            fit: '視覺提案、主題封面、風格探索、一般簡報開場',
            avoid: '高度法務、精密數據、需要固定品牌規範的正式文件'
        };
    }

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
            const searchTerms = expandSearchTerms(query);
            displayList = displayList.filter(item => {
                item._searchScore = getSearchScore(item, query, cleanQuery, searchTerms);
                return item._searchScore > 0;
            });
        }

        // 4. 排序處理
        if (searchQuery) {
            displayList.sort((a, b) => (b._searchScore || 0) - (a._searchScore || 0) || (a.number || 0) - (b.number || 0));
        } else if (activeCategory !== 'business') {
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
            const advice = getStyleUsageAdvice(item);
            
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
                    <p class="card-advice"><strong>適合</strong>${advice.fit}</p>
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
        const usageAdvice = getStyleUsageAdvice(item);
        const modalUsageFit = document.getElementById('modalUsageFit');
        const modalUsageAvoid = document.getElementById('modalUsageAvoid');
        if (modalUsageFit) modalUsageFit.textContent = usageAdvice.fit;
        if (modalUsageAvoid) modalUsageAvoid.textContent = usageAdvice.avoid;
        
        // 重設圖片與預覽占位卡的顯示狀態
        modalImage.style.display = 'block';
        const modalPH = document.getElementById('modalImagePlaceholder');
        const modalPHFooter = document.getElementById('modalPlaceholderFooter');
        if (modalPH) modalPH.style.display = 'none';
        if (modalPHFooter) modalPHFooter.textContent = `[ ${item.name} | 繁中化中 ]`;
        
        const imgUrl = getFullImageUrl(item);
        modalImage.src = imgUrl;

        modalPromptCode.textContent = '提示詞 YAML 代碼加載中...';

        // 初始化自訂器與平台選取器狀態
        let activeFormat = 'general';
        const customTopicInput = document.getElementById('customTopicInput');
        if (customTopicInput) customTopicInput.value = '';

        // 綁定平台適配切換按鈕事件
        const formatBtns = document.querySelectorAll('.preset-format-btn');
        const formatHelpText = document.getElementById('formatHelpText');
        formatBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.format === activeFormat) {
                btn.classList.add('active');
            }
            btn.onclick = () => {
                formatBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFormat = btn.dataset.format;
                
                // 動態更新說明文字
                if (formatHelpText) {
                    if (activeFormat === 'general') {
                        formatHelpText.textContent = '使用方法：複製下方提示詞貼給 ChatGPT、Gemini 或 Claude，讓 AI 依據此視覺風格為您引導與編寫簡報文字。';
                    } else if (activeFormat === 'notebooklm') {
                        formatHelpText.textContent = '使用方法：將下方提示詞連同您「自備的簡報大綱」一起貼給 NotebookLM，AI 將會依大綱架構與此風格擴寫內容。';
                    } else if (activeFormat === 'gamma') {
                        formatHelpText.textContent = '使用方法：此代碼提供 Gamma、Tome、Beautiful.ai 等簡報工具自訂主題所需要的色碼 HEX 與版面設定，複製填入對應編輯器即可。';
                    } else if (activeFormat === 'midjourney') {
                        formatHelpText.textContent = '使用方法：複製下方 /imagine 指令到 Midjourney 中生成，即可獲得完美適配此風格的簡報背景或概念插圖。';
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

        // 動態提取色碼並生成色塊
        const swatchesEl = document.getElementById('modalColorSwatches');
        if (swatchesEl) {
            swatchesEl.innerHTML = '';
            if (details.yaml) {
                const hexColors = [...new Set(details.yaml.match(/#[0-9A-Fa-f]{6}/g) || [])];
                hexColors.forEach(color => {
                    const swatch = document.createElement('div');
                    swatch.className = 'color-swatch';
                    swatch.style.backgroundColor = color;
                    swatch.title = `點擊複製色碼: ${color}`;
                    swatch.onclick = (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(color).then(() => {
                            showToast(`已複製色碼: ${color}`);
                        });
                    };
                    swatchesEl.appendChild(swatch);
                });
            }
        }
        
        // 渲染與更新 YAML 提示詞
        function updateModalPromptDisplay() {
            let displayedYaml = details.yaml || '無提示詞數據';
            const topic = customTopicInput ? customTopicInput.value.trim() : '';
            const displayTopic = topic || '思緒卡關時的 5 種切換方法';
            const addInstructions = checkboxInput ? checkboxInput.checked : true;
            
            // 當前選取的 HEX 色碼列表
            const hexColors = [...new Set(displayedYaml.match(/#[0-9A-Fa-f]{6}/g) || [])];

            if (displayedYaml && displayedYaml !== '無提示詞數據') {
                if (activeFormat === 'general') {
                    // --- 通用/ChatGPT 模式 ---
                    let configBlock = `### 簡報自訂配置\n- 簡報主題: ${displayTopic}\n`;
                    configBlock += `- 生成類型: 簡報背景大圖 (Slide Background)\n- 構圖要求: 極簡構圖，畫面中心大面積留白，大量負空間以利文字排版，無任何占位文字，適合做PPT背景。\n`;
                    
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
                        prefix += `---\n# 提示詞模式：繁體中文呈現，字體運作流暢，無 any 亂碼\n`;
                        displayedYaml = prefix + displayedYaml;
                    } else {
                        displayedYaml = `# 提示詞模式：繁體中文呈現，字體運作流暢，無 any 亂碼\n\n` + displayedYaml;
                    }

                } else if (activeFormat === 'notebooklm') {
                    // --- NotebookLM 專用擴寫模式 (自備大綱) ---
                    let typeText = '簡報背景大圖 (Slide Background)';
                    let typeReq = '極簡構圖，畫面中心大面積留白，大量負空間以利文字排版';

                    displayedYaml = `# NotebookLM 簡報風格控制與內容擴寫指引
我已經準備好了我的「簡報大綱」（請見對話中我提供的內容）。
請依據我提供的簡報大綱，為我擴寫各頁投影片的詳細內容。在撰寫過程中，請嚴格遵守以下「視覺設計風格」與「頁面排版架構」規範：

---
## 一、 簡報視覺風格規約 (Visual Style Configuration)
本份簡報採用【${item.name}】視覺風格。請將以下風格色彩配對與設計元素特徵，融入簡報各頁內容的文字語調與配詞氛圍中：

${displayedYaml}

---
## 二、 頁面版面排版規則 (Pacing & Layout Templates)
擴寫時請依據我的大綱結構，套用簡報背景底圖排版型：
- **[背景大圖 (Slide Background)]**
   - **排版要求**：文字極度精簡，保留大面積的留白以突顯背景美感，適合做背景。

當前頁面任務目標：${displayTopic}
當前頁面版型目標：【${typeText}】
當前頁面構圖與留白要求：${typeReq}。

---
## 三、 簡報腳本輸出格式要求 (Slide-by-Slide Script)
請按以下格式輸出我大綱中每一頁投影片的草稿：
- **頁碼與大綱對應標題**：第 X 頁 - [大綱標題]
- **套用版型**：[背景大圖]
- **簡報內文**：[條列式重點文字，不超過3行，每行不超過20字]
- **AI 繪圖提示詞**：（請寫一段 50 字以內的英文 Midjourney 提示詞，包含主體與色調，並加上防跑板參數 \`--ar 16:9 --no text, font, labels\`）
`;
                } else if (activeFormat === 'gamma') {
                    // --- Gamma 佈局模式 ---
                    let layoutRule = '以極簡與大面積中心留白為特徵。文字排版置中。';

                    displayedYaml = `### Gamma / Tome / Beautiful.ai 簡報自訂主題配置 (Theme Style Tokens)
請在簡報軟體（如 Gamma、Tome 等）的自訂主題編輯器 (Theme Settings) 中，配置以下數值與佈局引導，以完美匹配【${item.name}】的視覺特徵：

#### 1. 色彩配對代碼 (Theme Color Roles)
- 主背景色 (Page Background): ${hexColors[0] || '#0A0E17'}
- 主標題文字色 (Primary Text): ${hexColors[1] || '#FFFFFF'}
- 正文與弱化文字色 (Secondary Text): ${hexColors[2] || '#94A3B8'}
- 品牌點綴與強烈高亮色 (Accent Color): ${hexColors[3] || hexColors[0] || '#FF5E3A'}
- 卡片容器背景/邊框色 (Card Bg/Border): ${hexColors[4] || '#1E293B'}

#### 2. 版面佈局與留白規則 (Layout Grid Setup)
- 簡報主題任務: ${displayTopic}
- 頁面留白 (Padding): Spacious (寬敞邊距，至少保留 8% 的左右安全空間)
- 容器圓角 (Border Radius): 8px (微圓角)
- 版型結構要求: ${layoutRule}

#### 3. 字體建議配對 (Google Fonts Pairings)
- 標題字體 (Header Font): Noto Sans TC / Outfit (Font-weight: 800)
- 內文字體 (Body Font): Noto Sans TC / Inter (Line-height: 1.6)
`;
                } else if (activeFormat === 'midjourney') {
                    // --- Midjourney 模式 ---
                    let styleAttr = '';
                    const lines = displayedYaml.split('\n');
                    for (let line of lines) {
                        if (line.includes('視覺風格:') || line.includes('風格標籤:') || line.includes('構圖要求:')) {
                            styleAttr += line.replace(/##|-|視覺風格:|風格標籤:|構圖要求:/g, '').trim() + ', ';
                        }
                    }
                    if (!styleAttr) styleAttr = `${item.name} style, vector illustration, clean background, negative space`;
                    
                    let imageType = 'A premium slide template background';

                    displayedYaml = `### Midjourney 簡報背景與插圖生成提示詞

/imagine prompt: ${imageType}, ${styleAttr} themed for ${displayTopic}, color palette inspired by ${hexColors.join(' ')}, flat design, minimalist composition, spacious negative space in center for text layout, clean edges, studio lighting, vector style, no human figure --ar 16:9 --style raw --v 6.0 --no text, font, characters, words, labels, letters, watermark, low quality, sketch`;
                }
            }
            
            // 控管左側模擬層的顯示與隱藏
            const mockupBg = document.getElementById('mockupBg');
            
            if (mockupBg) {
                mockupBg.style.display = 'flex';
                const mockTitleEl = mockupBg.querySelector('.mock-title');
                if (mockTitleEl) {
                    mockTitleEl.textContent = topic || '2026 商業計劃與策略';
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

        // 重複自訂器區塊已移至上方，保留 openDetailModal 正確結尾
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

    // --- API 金鑰與風格分析儀功能實作 ---
    let analyzerUploadedBase64 = null;
    let analyzerResultDetails = { yaml: '' };
    let analyzerActiveFormat = 'general';

    // 1. API 金鑰設定元件與事件
    const apiSettingsModal = document.getElementById('apiSettingsModal');
    const apiSettingsCloseBtn = document.getElementById('apiSettingsCloseBtn');
    const apiSettingsBtn = document.getElementById('apiSettingsBtn');
    const geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');

    // 初始載入 API Key 與呼吸燈檢查
    function checkApiKeyPulse() {
        if (!apiSettingsBtn) return;
        const key = localStorage.getItem('gemini_api_key');
        let dot = apiSettingsBtn.querySelector('.api-pulse-dot');
        if (!key) {
            // 沒有金鑰，顯示紅色呼吸燈
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'api-pulse-dot';
                dot.style.cssText = 'position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; background-color: var(--accent); border-radius: 50%; box-shadow: 0 0 0 0 rgba(229,80,57,0.7); animation: pulse 1.6s infinite;';
                apiSettingsBtn.style.position = 'relative';
                apiSettingsBtn.appendChild(dot);
            }
        } else {
            // 已有金鑰，移除呼吸燈
            if (dot) {
                dot.remove();
            }
        }
    }

    if (geminiApiKeyInput) {
        geminiApiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
    }
    checkApiKeyPulse();

    if (apiSettingsBtn && apiSettingsModal) {
        apiSettingsBtn.addEventListener('click', () => {
            geminiApiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
            apiSettingsModal.classList.add('active');
        });
    }

    if (apiSettingsCloseBtn && apiSettingsModal) {
        apiSettingsCloseBtn.addEventListener('click', () => {
            apiSettingsModal.classList.remove('active');
        });
    }

    if (saveApiKeyBtn && apiSettingsModal) {
        saveApiKeyBtn.addEventListener('click', () => {
            const key = geminiApiKeyInput.value.trim();
            if (key) {
                localStorage.setItem('gemini_api_key', key);
                showToast('Gemini API 金鑰已安全儲存！');
            } else {
                localStorage.removeItem('gemini_api_key');
                showToast('API 金鑰已清除！');
            }
            checkApiKeyPulse();
            apiSettingsModal.classList.remove('active');
        });
    }

    // 2. 圖片風格分析彈窗元件與事件
    const imageAnalyzerModal = document.getElementById('imageAnalyzerModal');
    const imageAnalyzerCloseBtn = document.getElementById('imageAnalyzerCloseBtn');
    const imageAnalyzerBtn = document.getElementById('imageAnalyzerBtn');
    const uploadDropzone = document.getElementById('uploadDropzone');
    const analyzerFileInput = document.getElementById('analyzerFileInput');
    const analyzerPreviewWrapper = document.getElementById('analyzerPreviewWrapper');
    const analyzerPreviewImg = document.getElementById('analyzerPreviewImg');
    const analyzerResetBtn = document.getElementById('analyzerResetBtn');
    const analyzerLoading = document.getElementById('analyzerLoading');
    const analyzerResultEmpty = document.getElementById('analyzerResultEmpty');
    const analyzerResultWrapper = document.getElementById('analyzerResultWrapper');
    const analyzerColorSwatches = document.getElementById('analyzerColorSwatches');
    const analyzerTopicInput = document.getElementById('analyzerTopicInput');
    const analyzerHelpText = document.getElementById('analyzerHelpText');
    const analyzerCopyBtn = document.getElementById('analyzerCopyBtn');
    const analyzerPromptCode = document.getElementById('analyzerPromptCode');

    // 格式按鈕切換
    const analyzerFormatBtns = document.querySelectorAll('#imageAnalyzerModal .preset-format-btn');
    analyzerFormatBtns.forEach(btn => {
        btn.onclick = () => {
            analyzerFormatBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            analyzerActiveFormat = btn.dataset.format;

            // 更新使用說明
            if (analyzerHelpText) {
                if (analyzerActiveFormat === 'general') {
                    analyzerHelpText.textContent = '使用方法：複製下方提示詞貼給 ChatGPT、Gemini 或 Claude，讓 AI 依據此視覺風格為您引導與編寫簡報文字。';
                } else if (analyzerActiveFormat === 'notebooklm') {
                    analyzerHelpText.textContent = '使用方法：將下方提示詞連同您「自備的簡報大綱」一起貼給 NotebookLM，AI 將會依大綱架構與此風格擴寫內容。';
                } else if (analyzerActiveFormat === 'gamma') {
                    analyzerHelpText.textContent = '使用方法：此代碼提供 Gamma、Tome、Beautiful.ai 等簡報工具自訂主題所需要的色碼 HEX 與版面設定，複製填入對應編輯器即可。';
                } else if (analyzerActiveFormat === 'midjourney') {
                    analyzerHelpText.textContent = '使用方法：複製下方 /imagine 指令到 Midjourney 中生成，即可獲得完美適配此風格的簡報背景或概念插圖。';
                }
            }
            updateAnalyzerPromptDisplay();
        };
    });

    if (imageAnalyzerBtn && imageAnalyzerModal) {
        imageAnalyzerBtn.addEventListener('click', () => {
            const key = localStorage.getItem('gemini_api_key');
            if (!key) {
                showToast('請先設定您的 Gemini API 金鑰！');
                if (apiSettingsModal) apiSettingsModal.classList.add('active');
                return;
            }
            // 重設分析器內部狀態
            resetAnalyzerUI();
            imageAnalyzerModal.classList.add('active');
        });
    }

    if (imageAnalyzerCloseBtn && imageAnalyzerModal) {
        imageAnalyzerCloseBtn.addEventListener('click', () => {
            imageAnalyzerModal.classList.remove('active');
        });
    }

    function resetAnalyzerUI() {
        analyzerUploadedBase64 = null;
        analyzerResultDetails = { yaml: '' };
        if (analyzerPreviewWrapper) analyzerPreviewWrapper.style.display = 'none';
        if (uploadDropzone) uploadDropzone.style.display = 'flex';
        if (analyzerLoading) analyzerLoading.style.display = 'none';
        if (analyzerResultEmpty) analyzerResultEmpty.style.display = 'flex';
        if (analyzerResultWrapper) analyzerResultWrapper.style.display = 'none';
        if (analyzerFileInput) analyzerFileInput.value = '';
        if (analyzerTopicInput) analyzerTopicInput.value = '';
    }

    // 拖曳上傳與檔案讀取
    if (uploadDropzone) {
        uploadDropzone.addEventListener('click', () => {
            if (analyzerFileInput) analyzerFileInput.click();
        });

        uploadDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadDropzone.classList.add('dragover');
        });

        uploadDropzone.addEventListener('dragleave', () => {
            uploadDropzone.classList.remove('dragover');
        });

        uploadDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadDropzone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                processAnalyzerFile(files[0]);
            }
        });
    }

    if (analyzerFileInput) {
        analyzerFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                processAnalyzerFile(e.target.files[0]);
            }
        });
    }

    if (analyzerResetBtn) {
        analyzerResetBtn.addEventListener('click', resetAnalyzerUI);
    }

    function processAnalyzerFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('請上傳正確的圖片格式檔案！');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            analyzerUploadedBase64 = e.target.result;
            if (analyzerPreviewImg) analyzerPreviewImg.src = analyzerUploadedBase64;
            if (uploadDropzone) uploadDropzone.style.display = 'none';
            if (analyzerPreviewWrapper) analyzerPreviewWrapper.style.display = 'block';
            
            // 開始向 Gemini API 發送風格逆向工程分析
            triggerImageAnalysis();
        };
        reader.readAsDataURL(file);
    }

    // 發送多模態 Gemini 風格逆向工程分析
    async function triggerImageAnalysis() {
        const apiKey = localStorage.getItem('gemini_api_key') ? localStorage.getItem('gemini_api_key').trim() : '';
        if (!apiKey) {
            showToast('未檢測到 API 金鑰，請先進行設定。');
            return;
        }

        if (analyzerLoading) {
            analyzerLoading.style.display = 'flex';
        }

        const systemPrompt = `你是一位簡報視覺設計專家與 Prompt 工程師。
請仔細分析這張簡報背景圖片的視覺特徵，逆向推導出其「風格配方」，並以 YAML 格式輸出。

請嚴格遵守以下輸出規範：
1. 僅輸出 YAML 程式碼區塊本身，不需要任何輔助 Markdown 標記（例如 \`\`\`yaml 或 \`\`\`）或前後引言。
2. 結構必須包含以下欄位：
   視覺風格: [簡述這張圖的風格，如扁平插畫、新微光、擬真 3D、極簡商務...]
   風格標籤: [以逗號分隔的 5-8 個標籤，如 Minimalist, Soft Colors, Modern...]
   配色分析: [簡述配色與配色理念，必須包含至少 4 個十六進位色碼，如 #FFFFFF, #E55039 等]
   字體推薦: [標題與內文的字體建議對應]
   排版特徵: [留白、圓角、間距特徵]
   構圖要求: [底圖負空間設計特點，確保適合做投影片背景使用]
`;

        try {
            const base64Data = analyzerUploadedBase64.split(',')[1];
            const mimeType = analyzerUploadedBase64.split(';')[0].split(':')[1];
            
            const payload = {
                contents: [{
                    parts: [
                        { text: systemPrompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }]
            };

            let response;
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (isLocalhost) {
                // 本地開發模式：使用 Python 伺服器代理繞過瀏覽器 CORS 限制
                response = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        apiKey: apiKey,
                        payload: payload
                    })
                });
            } else {
                // 線上部署模式（GitHub Pages）：直接發送給 Google
                response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (!response.ok) {
                let errorMsg = `API 請求錯誤: ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData && errData.error) {
                        const errMsg = typeof errData.error === 'object' ? (errData.error.message || JSON.stringify(errData.error)) : errData.error;
                        errorMsg += ` (${errMsg})`;
                    }
                } catch(e) {}
                throw new Error(errorMsg);
            }

            const data = await response.json();
            let rawYaml = data.candidates[0].content.parts[0].text;
            
            // 清理可能被模型多餘添加的 markdown block 標籤
            rawYaml = rawYaml.replace(/```yaml/g, '').replace(/```/g, '').trim();
            analyzerResultDetails.yaml = rawYaml;

            // 動態提取色碼並渲染色塊
            if (analyzerColorSwatches) {
                analyzerColorSwatches.innerHTML = '';
                const hexColors = [...new Set(rawYaml.match(/#[0-9A-Fa-f]{6}/g) || [])];
                hexColors.forEach(color => {
                    const swatch = document.createElement('div');
                    swatch.className = 'color-swatch';
                    swatch.style.backgroundColor = color;
                    swatch.title = `點擊複製色碼: ${color}`;
                    swatch.onclick = (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(color).then(() => {
                            showToast(`已複製色碼: ${color}`);
                        });
                    };
                    analyzerColorSwatches.appendChild(swatch);
                });
            }

            // 更新與呈現結果介面
            if (analyzerLoading) analyzerLoading.style.display = 'none';
            if (analyzerResultEmpty) analyzerResultEmpty.style.display = 'none';
            if (analyzerResultWrapper) analyzerResultWrapper.style.display = 'flex';

            updateAnalyzerPromptDisplay();
            showToast('圖片風格逆向分析完成！');

        } catch (error) {
            console.error('Gemini Analysis Failed:', error);
            if (analyzerLoading) analyzerLoading.style.display = 'none';
            
            let displayError = error.message;
            if (error.message.includes('Failed to fetch')) {
                displayError = '連線失敗：因 Google 官方跨域限制 (CORS)，在 GitHub Pages 等公開網頁中不支援前端直連。請在本地端執行 python prompt_server.py 啟動伺服器，並開啟 http://localhost:8080 來體驗代理分析！';
            }
            showToast(`分析失敗：${displayError}`, 'error');
            resetAnalyzerUI();
        }
    }

    // 渲染與更新風格分析儀的複製提示詞
    function updateAnalyzerPromptDisplay() {
        let displayedYaml = analyzerResultDetails.yaml || '無提示詞數據';
        const topic = analyzerTopicInput ? analyzerTopicInput.value.trim() : '';
        const displayTopic = topic || '自訂簡報專案主題';
        
        const hexColors = [...new Set(displayedYaml.match(/#[0-9A-Fa-f]{6}/g) || [])];

        if (displayedYaml && displayedYaml !== '無提示詞數據') {
            if (analyzerActiveFormat === 'general') {
                // 通用模式
                let configBlock = `### 簡報自訂配置\n- 簡報主題: ${displayTopic}\n`;
                configBlock += `- 生成類型: 簡報背景大圖 (Slide Background)\n- 構圖要求: 極簡構圖，畫面中心大面積留白，大量負空間以利文字排版，無任何占位文字，適合做PPT背景。\n`;
                
                const lines = displayedYaml.split('\n');
                let headerIndex = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('視覺風格:')) {
                        headerIndex = i;
                        break;
                    }
                }
                
                if (headerIndex !== -1) {
                    lines.splice(headerIndex, 0, configBlock, '');
                    displayedYaml = lines.join('\n');
                } else {
                    displayedYaml = configBlock + '\n' + displayedYaml;
                }
                
                displayedYaml = `你現在是一位專業的簡報設計專家。請依據以下 YAML 格式的視覺風格規範，為我規劃並撰寫簡報內容。請嚴格遵守規範中的配色、字體、版面與插圖風格。\n\n---\n# 提示詞模式：繁體中文呈現，字體運作流暢，無 any 亂碼\n` + displayedYaml;

            } else if (analyzerActiveFormat === 'notebooklm') {
                // NotebookLM
                displayedYaml = `# NotebookLM 簡報風格控制與內容擴寫指引
我已經準備好了我的「簡報大綱」（請見對話中我提供的內容）。
請依據我提供的簡報大綱，為我擴寫各頁投影片的詳細內容。在撰寫過程中，請嚴格遵守以下「視覺設計風格」與「頁面排版架構」規範：

---
## 一、 簡報視覺風格規約 (Visual Style Configuration)
本份簡報採用自定義視覺風格。請將以下風格色彩配對與設計元素特徵，融入簡報各頁內容的文字語調與配詞氛圍中：

${displayedYaml}

---
## 二、 頁面版面排版規則 (Pacing & Layout Templates)
擴寫時請依據我的大綱結構，套用簡報背景底圖排版型：
- **[背景大圖 (Slide Background)]**
   - **排版要求**：文字極度精簡，保留大面積的留白以突顯背景美感，適合做背景。

當前頁面任務目標：${displayTopic}
當前頁面版型目標：【簡報背景大圖 (Slide Background)】
當前頁面構圖與留白要求：極簡構圖，畫面中心大面積留白，大量負空間以利文字排版。

---
## 三、 簡報腳本輸出格式要求 (Slide-by-Slide Script)
請按以下格式輸出我大綱中每一頁投影片的草稿：
- **頁碼與大綱對應標題**：第 X 頁 - [大綱標題]
- **套用版型**：[背景大圖]
- **簡報內文**：[條列式重點文字，不超過3行，每行不超過20字]
- **AI 繪圖提示詞**：（請寫一段 50 字以內的英文 Midjourney 提示詞，包含主體與色調，並加上防跑板參數 \`--ar 16:9 --no text, font, labels\`）
`;
            } else if (analyzerActiveFormat === 'gamma') {
                // Gamma
                displayedYaml = `### Gamma / Tome / Beautiful.ai 簡報自訂主題配置 (Theme Style Tokens)
請在簡報軟體（如 Gamma、Tome 等）的自訂主題編輯器 (Theme Settings) 中，配置以下數值與佈局引導，以完美匹配此圖片所屬的視覺特徵：

#### 1. 色彩配對代碼 (Theme Color Roles)
- 主背景色 (Page Background): ${hexColors[0] || '#FFFFFF'}
- 主標題文字色 (Primary Text): ${hexColors[1] || '#111111'}
- 正文與弱化文字色 (Secondary Text): ${hexColors[2] || '#666666'}
- 品牌點綴與強烈高亮色 (Accent Color): ${hexColors[3] || hexColors[0] || '#E55039'}
- 卡片容器背景/邊框色 (Card Bg/Border): ${hexColors[4] || '#E2E8F0'}

#### 2. 版面佈局與留白規則 (Layout Grid Setup)
- 簡報主題任務: ${displayTopic}
- 頁面留白 (Padding): Spacious (寬敞邊距，至少保留 8% 的左右安全空間)
- 容器圓角 (Border Radius): 8px (微圓角)
- 版型結構要求: 以極簡與大面積中心留白為特徵。文字排版置中。

#### 3. 字體建議配對 (Google Fonts Pairings)
- 標題字體 (Header Font): Noto Sans TC / Outfit (Font-weight: 800)
- 內文字體 (Body Font): Noto Sans TC / Inter (Line-height: 1.6)
`;
            } else if (analyzerActiveFormat === 'midjourney') {
                // Midjourney
                let styleAttr = '';
                const lines = displayedYaml.split('\n');
                for (let line of lines) {
                    if (line.includes('視覺風格:') || line.includes('風格標籤:') || line.includes('構圖要求:')) {
                        styleAttr += line.replace(/##|-|視覺風格:|風格標籤:|構圖要求:/g, '').trim() + ', ';
                    }
                }
                if (!styleAttr) styleAttr = `vector illustration, clean background, negative space`;

                displayedYaml = `### Midjourney 簡報背景生成提示詞

/imagine prompt: A premium slide template background, ${styleAttr} themed for ${displayTopic}, color palette inspired by ${hexColors.join(' ')}, flat design, minimalist composition, spacious negative space in center for text layout, clean edges, studio lighting, vector style, no human figure --ar 16:9 --style raw --v 6.0 --no text, font, characters, words, labels, letters, watermark, low quality, sketch`;
            }
        }
        analyzerPromptCode.textContent = displayedYaml;
    }

    if (analyzerTopicInput) analyzerTopicInput.oninput = updateAnalyzerPromptDisplay;

    if (analyzerCopyBtn) {
        analyzerCopyBtn.onclick = async () => {
            const codeText = analyzerPromptCode.textContent;
            try {
                await navigator.clipboard.writeText(codeText);
                showToast('已複製 AI 提示詞到剪貼簿！');
                
                // 動態特效
                const copySpan = analyzerCopyBtn.querySelector('span');
                const copyIcon = analyzerCopyBtn.querySelector('i');
                if (copySpan) copySpan.textContent = '已複製！';
                if (copyIcon) copyIcon.setAttribute('data-lucide', 'check');
                lucide.createIcons();
                
                setTimeout(() => {
                    if (copySpan) copySpan.textContent = '複製 AI 提示詞';
                    if (copyIcon) copyIcon.setAttribute('data-lucide', 'copy');
                    lucide.createIcons();
                }, 2000);
            } catch (err) {
                showToast('複製失敗，請手動複製程式碼。');
            }
        };
    }

    // --- 初始化啟動 ---
    loadData();
});
