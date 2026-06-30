/* ============================================
   Anuflix — Movie & TV App Logic
   ============================================ */
(() => {
    'use strict';

    // ========== CONFIG ==========
    const BASE_URL = 'https://api.themoviedb.org/3';
    const IMG_BASE = 'https://image.tmdb.org/t/p/';
    const POSTER_SM = 'w342';
    const POSTER_LG = 'w500';
    const BACKDROP = 'original';
    const PROFILE = 'w185';
    const STAR_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01z"/></svg>';
    const PLACEHOLDER_POSTER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='342' height='513' fill='%23161630'%3E%3Crect width='342' height='513'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%235a5a72' font-family='Inter,sans-serif' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E`;
    const PLACEHOLDER_PROFILE = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='185' height='185' fill='%23161630'%3E%3Crect width='185' height='185'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%235a5a72' font-family='Inter,sans-serif' font-size='12'%3ENo Photo%3C/text%3E%3C/svg%3E`;

    // ========== STATE ==========
    let API_KEY = localStorage.getItem('tmdb_api_key') || '32093cbdee95b7139c33a33f5c1604f5';
    let genresMap = {};
    let currentPage = '';
    let browseState = { page: 1, genre: '', results: [], type: 'movie' };
    let searchTimeout = null;

    // ========== DOM ==========
    const mainContent = document.getElementById('main-content');
    const sidebarNav = document.getElementById('sidebar-nav');
    const mobileNav = document.getElementById('mobile-nav');
    const apiModal = document.getElementById('api-key-modal');
    const apiInput = document.getElementById('api-key-input');
    const apiSubmit = document.getElementById('api-key-submit');

    // ========== UTILITIES ==========
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : s || '';
    const year = d => d ? d.split('-')[0] : '';
    const rating = v => v ? v.toFixed(1) : 'N/A';
    const posterUrl = p => p ? IMG_BASE + POSTER_SM + p : PLACEHOLDER_POSTER;
    const posterLg = p => p ? IMG_BASE + POSTER_LG + p : PLACEHOLDER_POSTER;
    const backdropUrl = b => b ? IMG_BASE + BACKDROP + b : '';
    const profileUrl = p => p ? IMG_BASE + PROFILE + p : PLACEHOLDER_PROFILE;
    const runtime = m => m ? `${Math.floor(m / 60)}h ${m % 60}m` : '';
    const mediaType = item => item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const itemTitle = item => item.title || item.name || 'Untitled';
    const itemDate = item => item.release_date || item.first_air_date || '';

    // ========== WATCHLIST ==========
    const getWatchlist = () => JSON.parse(localStorage.getItem('streamline_watchlist') || '[]');
    const saveWatchlist = list => localStorage.setItem('streamline_watchlist', JSON.stringify(list));
    const isInWatchlist = id => getWatchlist().some(i => i.id === id);

    function toggleWatchlist(item) {
        let list = getWatchlist();
        const idx = list.findIndex(i => i.id === item.id);
        if (idx > -1) list.splice(idx, 1);
        else list.push({ id: item.id, title: itemTitle(item), poster_path: item.poster_path, vote_average: item.vote_average, release_date: itemDate(item), media_type: mediaType(item) });
        saveWatchlist(list);
    }

    // ========== CONTINUE WATCHING ==========
    const getContinueWatching = () => JSON.parse(localStorage.getItem('anuflix_continue') || '[]');
    const saveContinueWatching = list => localStorage.setItem('anuflix_continue', JSON.stringify(list));

    function addToContinueWatching(item) {
        let list = getContinueWatching();
        // Remove if already exists (will re-add at front)
        list = list.filter(i => !(i.id === item.id && i.type === item.type));
        list.unshift({
            id: item.id,
            type: item.type,
            title: item.title,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path || '',
            vote_average: item.vote_average || 0,
            season: item.season || null,
            episode: item.episode || null,
            timestamp: Date.now()
        });
        // Keep max 20 items
        if (list.length > 20) list = list.slice(0, 20);
        saveContinueWatching(list);
    }

    function continueWatchingHTML() {
        const items = getContinueWatching();
        if (items.length === 0) return '';
        const cards = items.map(item => {
            const hash = item.type === 'tv' ? `#/show/${item.id}` : `#/movie/${item.id}`;
            const subtitle = item.season ? `S${item.season} · E${item.episode}` : '';
            return `
            <a href="${hash}" class="cw-card" data-id="${item.id}" data-type="${item.type}">
                <div class="cw-poster">
                    <img src="${posterUrl(item.poster_path)}" alt="${item.title}" loading="lazy">
                    <div class="cw-play-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                    <button class="cw-remove" data-cw-id="${item.id}" data-cw-type="${item.type}" title="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <div class="cw-progress"><div class="cw-progress-bar"></div></div>
                </div>
                <div class="cw-info">
                    <div class="cw-title">${item.title}</div>
                    ${subtitle ? `<div class="cw-subtitle">${subtitle}</div>` : ''}
                </div>
            </a>`;
        }).join('');
        return `
        <div class="section cw-section">
            <div class="section-header">
                <h2 class="section-title">Continue <span class="accent">Watching</span></h2>
                <button class="cw-clear-btn" id="cw-clear">Clear All</button>
            </div>
            <div class="carousel">
                <div class="carousel-track">${cards}</div>
            </div>
        </div>`;
    }

    // ========== API ==========
    async function api(endpoint, params = {}) {
        const url = new URL(BASE_URL + endpoint);
        url.searchParams.set('api_key', API_KEY);
        url.searchParams.set('language', 'en-US');
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    }

    const fetchTrending = (type = 'all', time = 'week') => api(`/trending/${type}/${time}`);
    const fetchPopular = (type = 'movie', page = 1) => api(`/${type}/popular`, { page });
    const fetchTopRated = (type = 'movie', page = 1) => api(`/${type}/top_rated`, { page });
    const fetchNowPlaying = () => api('/movie/now_playing');
    const fetchAiringToday = () => api('/tv/airing_today');
    const fetchDetails = (type, id) => api(`/${type}/${id}`, { append_to_response: 'credits,recommendations,videos' });
    const fetchSearch = (query, page = 1) => api('/search/multi', { query, page });
    const fetchDiscover = (type, page = 1, genre = '') => {
        const params = { page, sort_by: 'popularity.desc' };
        if (genre) params.with_genres = genre;
        return api(`/discover/${type}`, params);
    };
    const fetchGenres = type => api(`/genre/${type}/list`);

    async function loadGenres() {
        try {
            const [m, t] = await Promise.all([fetchGenres('movie'), fetchGenres('tv')]);
            [...m.genres, ...t.genres].forEach(g => { genresMap[g.id] = g.name; });
        } catch (e) { console.warn('Failed to load genres', e); }
    }

    // ========== ROUTER ==========
    function navigate(hash) {
        if (hash !== location.hash) location.hash = hash;
    }

    function router() {
        const hash = location.hash || '#/';
        const [path, id] = hash.replace('#/', '').split('/');

        // Update active nav
        document.querySelectorAll('.nav-link, .mob-link').forEach(el => {
            el.classList.toggle('active', el.dataset.page === (path || 'home'));
        });

        // Page transition: fade out
        mainContent.classList.remove('page-visible');
        mainContent.classList.add('page-transitioning');

        setTimeout(() => {
            mainContent.scrollTo?.(0, 0);
            window.scrollTo(0, 0);

            switch (path) {
                case '': case 'home': renderHome(); currentPage = 'home'; break;
                case 'movies': renderBrowse('movie'); currentPage = 'movies'; break;
                case 'tv': renderBrowse('tv'); currentPage = 'tv'; break;
                case 'movie': renderDetail('movie', id); currentPage = 'detail'; break;
                case 'show': renderDetail('tv', id); currentPage = 'detail'; break;
                case 'search': renderSearch(); currentPage = 'search'; break;
                case 'watchlist': renderWatchlist(); currentPage = 'watchlist'; break;
                default: renderHome(); currentPage = 'home';
            }

            // Page transition: fade in
            requestAnimationFrame(() => {
                mainContent.classList.remove('page-transitioning');
                mainContent.classList.add('page-visible');
            });
        }, 150);
    }

    // ========== LAZY IMAGE FADE-IN ==========
    function observeImages() {
        mainContent.querySelectorAll('img:not(.loaded)').forEach(img => {
            if (img.complete && img.naturalHeight > 0) {
                img.classList.add('loaded');
            } else {
                img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
                img.addEventListener('error', () => img.classList.add('loaded'), { once: true });
            }
        });
    }

    // Observe images whenever DOM changes inside main content
    const imgObserver = new MutationObserver(() => observeImages());
    imgObserver.observe(mainContent, { childList: true, subtree: true });

    // ========== COMPONENTS ==========
    function cardHTML(item, animate = false) {
        const type = mediaType(item);
        const hash = type === 'tv' ? `#/show/${item.id}` : `#/movie/${item.id}`;
        const title = itemTitle(item);
        const yr = year(itemDate(item));
        const r = item.vote_average;
        return `
        <a href="${hash}" class="card${animate ? ' animate-in' : ''}" data-id="${item.id}">
            <div class="card-poster">
                <img class="card-img" src="${posterUrl(item.poster_path)}" alt="${title}" loading="lazy">
                ${r ? `<div class="card-rating">${STAR_SVG} ${rating(r)}</div>` : ''}
                <div class="card-overlay">
                    <div class="card-overlay-title">${title}</div>
                    <div class="card-overlay-year">${yr}</div>
                </div>
            </div>
            <div class="card-info">
                <div class="card-title">${title}</div>
                <div class="card-year">${yr}</div>
            </div>
        </a>`;
    }

    function carouselHTML(items, id) {
        return `
        <div class="carousel" id="${id}">
            <button class="carousel-btn carousel-btn-left" aria-label="Scroll left">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="carousel-track">
                ${items.map(i => cardHTML(i)).join('')}
            </div>
            <button class="carousel-btn carousel-btn-right" aria-label="Scroll right">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>`;
    }

    function top10HTML(items) {
        return `
        <div class="carousel">
            <div class="top10-track">
                ${items.slice(0, 10).map((item, i) => {
                    const type = mediaType(item);
                    const hash = type === 'tv' ? `#/show/${item.id}` : `#/movie/${item.id}`;
                    return `
                    <a href="${hash}" class="top10-card">
                        <span class="top10-rank">${i + 1}</span>
                        <div class="top10-poster">
                            <img src="${posterUrl(item.poster_path)}" alt="${itemTitle(item)}" loading="lazy">
                        </div>
                    </a>`;
                }).join('')}
            </div>
        </div>`;
    }

    function heroHTML(item) {
        const type = mediaType(item);
        const hash = type === 'tv' ? `#/show/${item.id}` : `#/movie/${item.id}`;
        const genres = (item.genre_ids || []).slice(0, 3).map(id => genresMap[id]).filter(Boolean);
        const inList = isInWatchlist(item.id);
        return `
        <div class="hero">
            <div class="hero-backdrop" style="background-image:url('${backdropUrl(item.backdrop_path)}')"></div>
            <div class="hero-content">
                <div class="hero-tagline">Featured Today</div>
                <h1 class="hero-title">${itemTitle(item)}</h1>
                <div class="hero-meta">
                    ${item.vote_average ? `<span class="hero-rating">${STAR_SVG} ${rating(item.vote_average)}</span>` : ''}
                    <span class="hero-year">${year(itemDate(item))}</span>
                    ${genres.map(g => `<span class="hero-genre-tag">${g}</span>`).join('')}
                </div>
                <p class="hero-overview">${truncate(item.overview, 200)}</p>
                <div class="hero-buttons">
                    <a href="${hash}" class="btn-primary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        More Info
                    </a>
                    <button class="btn-secondary watchlist-toggle" data-item='${JSON.stringify({ id: item.id, title: itemTitle(item), poster_path: item.poster_path, vote_average: item.vote_average, release_date: itemDate(item), media_type: type })}'>
                        ${inList
                            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> In My List'
                            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add to List'}
                    </button>
                </div>
            </div>
        </div>`;
    }

    function skeletonCards(n = 6) {
        return `<div class="carousel-track">${Array(n).fill(`
            <div class="skeleton-card">
                <div class="skeleton skeleton-poster"></div>
                <div class="skeleton skeleton-text" style="width:80%"></div>
                <div class="skeleton skeleton-text short"></div>
            </div>`).join('')}</div>`;
    }

    function skeletonHero() {
        return '<div class="skeleton skeleton-hero"></div>';
    }

    function footerHTML() {
        return `<footer class="page-footer">&copy; ${new Date().getFullYear()} Anuflix. Data from <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>.</footer>`;
    }

    // ========== PAGE: HOME ==========
    async function renderHome() {
        mainContent.innerHTML = `
            ${skeletonHero()}
            <div class="section"><div class="section-header"><h2 class="section-title">Top 10 Today</h2></div>${skeletonCards(10)}</div>
            <div class="section"><div class="section-header"><h2 class="section-title">Trending This Week</h2></div>${skeletonCards()}</div>
            <div class="section"><div class="section-header"><h2 class="section-title">Now Playing</h2></div>${skeletonCards()}</div>
            <div class="section"><div class="section-header"><h2 class="section-title">Top Rated Movies</h2></div>${skeletonCards()}</div>
            <div class="section"><div class="section-header"><h2 class="section-title">Popular TV Shows</h2></div>${skeletonCards()}</div>
            <div class="section"><div class="section-header"><h2 class="section-title">Top Rated TV</h2></div>${skeletonCards()}</div>`;

        try {
            const [trending, trendDay, nowPlaying, topMovies, popTV, topTV] = await Promise.all([
                fetchTrending('all', 'week'),
                fetchTrending('all', 'day'),
                fetchNowPlaying(),
                fetchTopRated('movie'),
                fetchPopular('tv'),
                fetchTopRated('tv')
            ]);

            const hero = trending.results[0];
            const top10 = trendDay.results.slice(0, 10);

            mainContent.innerHTML = `
                ${heroHTML(hero)}
                ${continueWatchingHTML()}
                <div class="section">
                    <div class="section-header"><h2 class="section-title">Top 10 <span class="accent">Today</span></h2></div>
                    ${top10HTML(top10)}
                </div>
                <div class="section">
                    <div class="section-header">
                        <h2 class="section-title">Trending <span class="accent">This Week</span></h2>
                        <a href="#/movies" class="see-all">See All →</a>
                    </div>
                    ${carouselHTML(trending.results.slice(1, 21), 'c-trending')}
                </div>
                <div class="section">
                    <div class="section-header">
                        <h2 class="section-title">Now Playing</h2>
                        <a href="#/movies" class="see-all">See All →</a>
                    </div>
                    ${carouselHTML(nowPlaying.results, 'c-now')}
                </div>
                <div class="section">
                    <div class="section-header">
                        <h2 class="section-title">Top Rated <span class="accent">Movies</span></h2>
                        <a href="#/movies" class="see-all">See All →</a>
                    </div>
                    ${carouselHTML(topMovies.results, 'c-top-movies')}
                </div>
                <div class="section">
                    <div class="section-header">
                        <h2 class="section-title">Popular <span class="accent">TV Shows</span></h2>
                        <a href="#/tv" class="see-all">See All →</a>
                    </div>
                    ${carouselHTML(popTV.results, 'c-pop-tv')}
                </div>
                <div class="section">
                    <div class="section-header">
                        <h2 class="section-title">Top Rated <span class="accent">TV</span></h2>
                        <a href="#/tv" class="see-all">See All →</a>
                    </div>
                    ${carouselHTML(topTV.results, 'c-top-tv')}
                </div>
                ${footerHTML()}`;

            // Continue Watching clear button
            const cwClearBtn = document.getElementById('cw-clear');
            if (cwClearBtn) {
                cwClearBtn.addEventListener('click', () => {
                    saveContinueWatching([]);
                    const cwSection = document.querySelector('.cw-section');
                    if (cwSection) cwSection.remove();
                });
            }

            // Continue Watching individual remove buttons
            document.querySelectorAll('.cw-remove').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = parseInt(btn.dataset.cwId);
                    const type = btn.dataset.cwType;
                    let list = getContinueWatching();
                    list = list.filter(i => !(i.id === id && i.type === type));
                    saveContinueWatching(list);
                    // Remove the card with animation
                    const card = btn.closest('.cw-card');
                    if (card) {
                        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.8)';
                        setTimeout(() => {
                            card.remove();
                            // If no items left, remove the whole section
                            if (getContinueWatching().length === 0) {
                                const cwSection = document.querySelector('.cw-section');
                                if (cwSection) cwSection.remove();
                            }
                        }, 300);
                    }
                });
            });

            initCarousels();
        } catch (e) {
            mainContent.innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${e.message}</p></div>`;
        }
    }

    // ========== PAGE: BROWSE (Infinite Scroll) ==========
    let browseScrollHandler = null;
    let browseIsLoading = false;

    async function renderBrowse(type) {
        // Clean up previous scroll listener
        if (browseScrollHandler) {
            window.removeEventListener('scroll', browseScrollHandler);
            browseScrollHandler = null;
        }

        browseState = { page: 1, genre: '', results: [], type };
        browseIsLoading = false;
        const label = type === 'movie' ? 'Movies' : 'TV Shows';

        mainContent.innerHTML = `
            <div class="browse-page">
                <h1 class="browse-title">${label}</h1>
                <div class="genre-filter" id="genre-filter"></div>
                <div class="grid" id="browse-grid"></div>
                <div class="spinner-wrap" id="browse-spinner" style="display:none"><div class="spinner"></div></div>
                <button class="load-more-btn" id="load-more" style="display:none">Load More</button>
            </div>
            ${footerHTML()}`;

        // Load genres
        try {
            const gData = await fetchGenres(type);
            const filterEl = document.getElementById('genre-filter');
            filterEl.innerHTML = `<button class="genre-tag active" data-genre="">All</button>` +
                gData.genres.map(g => `<button class="genre-tag" data-genre="${g.id}">${g.name}</button>`).join('');

            filterEl.addEventListener('click', e => {
                const tag = e.target.closest('.genre-tag');
                if (!tag) return;
                filterEl.querySelectorAll('.genre-tag').forEach(t => t.classList.remove('active'));
                tag.classList.add('active');
                browseState.genre = tag.dataset.genre;
                browseState.page = 1;
                browseState.results = [];
                loadBrowsePage();
            });
        } catch (e) { /* ignore genre load error */ }

        // Infinite scroll
        browseScrollHandler = () => {
            if (browseIsLoading) return;
            const scrollBottom = window.innerHeight + window.scrollY;
            const docHeight = document.documentElement.scrollHeight;
            if (scrollBottom >= docHeight - 600) {
                browseState.page++;
                loadBrowsePage(true);
            }
        };
        window.addEventListener('scroll', browseScrollHandler);

        document.getElementById('load-more').addEventListener('click', () => {
            browseState.page++;
            loadBrowsePage(true);
        });

        loadBrowsePage();
    }

    async function loadBrowsePage(append = false) {
        const grid = document.getElementById('browse-grid');
        const spinner = document.getElementById('browse-spinner');
        const loadMore = document.getElementById('load-more');
        if (!grid || !spinner) return;
        if (!append) grid.innerHTML = '';
        browseIsLoading = true;
        spinner.style.display = 'flex';
        if (loadMore) loadMore.style.display = 'none';

        try {
            const data = await fetchDiscover(browseState.type, browseState.page, browseState.genre);
            spinner.style.display = 'none';
            const items = data.results.filter(i => i.poster_path);
            browseState.results.push(...items);
            grid.innerHTML += items.map(i => {
                i.media_type = browseState.type;
                return cardHTML(i, true);
            }).join('');
            browseIsLoading = false;
            
            // Show load more button if there are more pages
            if (data.page < data.total_pages) {
                if (loadMore) loadMore.style.display = 'block';
            } else if (browseScrollHandler) {
                // Remove scroll listener if no more pages
                window.removeEventListener('scroll', browseScrollHandler);
                browseScrollHandler = null;
            }
        } catch (e) {
            spinner.style.display = 'none';
            browseIsLoading = false;
            if (!append) grid.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
        }
    }

    // ========== PAGE: DETAIL ==========
    async function renderDetail(type, id) {
        mainContent.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;

        try {
            const data = await fetchDetails(type, id);
            const cast = (data.credits?.cast || []).slice(0, 15);
            const recs = (data.recommendations?.results || []).slice(0, 20);
            const genres = data.genres || [];
            const inList = isInWatchlist(data.id);
            const itemObj = { id: data.id, title: itemTitle(data), poster_path: data.poster_path, vote_average: data.vote_average, release_date: itemDate(data), media_type: type };

            const trailer = (data.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
            const trailerBtn = trailer ? `
                <button class="btn-secondary watch-trailer-btn" data-key="${trailer.key}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                    Trailer
                </button>` : '';

            mainContent.innerHTML = `
                <div class="detail-page">
                    <button class="back-btn" onclick="history.back()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                        Back
                    </button>
                    
                    <!-- Inline Video Player -->
                    <div id="inline-player-wrapper" class="inline-player-wrapper">
                        <div class="player-header">
                            <span class="now-playing-text" id="now-playing-text">NOW PLAYING</span>
                            <div class="autoplay-toggle">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="16" cy="12" r="3" fill="#000"/></svg>
                                Autoplay next
                            </div>
                        </div>
                        <div class="server-list" id="inline-server-selector">
                            <span class="server-label">SERVERS</span>
                            <!-- Servers injected here -->
                        </div>
                        <div class="video-container">
                            <iframe id="inline-video-iframe" src="" frameborder="0" allowfullscreen allow="autoplay; fullscreen"></iframe>
                        </div>
                        <div class="player-footer">
                            <div class="streaming-via">Streaming via <span id="current-server-name">VidLink</span>. If playback fails or shows ads, try a different server above.</div>
                            <div id="next-up-container" style="display:none;">
                                <div class="next-up-card" id="next-up-card">
                                    <div>
                                        <div class="next-up-label">NEXT UP</div>
                                        <div class="next-up-title" id="next-up-title">Loading...</div>
                                    </div>
                                    <svg class="next-up-arrow" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="detail-backdrop-wrap" class="detail-backdrop-wrap">
                        <div class="detail-backdrop" style="background-image:url('${backdropUrl(data.backdrop_path)}')"></div>
                        <div class="detail-hero">
                            <div class="detail-poster">
                                <img src="${posterLg(data.poster_path)}" alt="${itemTitle(data)}">
                            </div>
                            <div class="detail-info">
                                ${data.tagline ? `<p class="detail-tagline">"${data.tagline}"</p>` : ''}
                                <h1 class="detail-title">${itemTitle(data)}</h1>
                                <div class="detail-meta">
                                    ${data.vote_average ? `<span class="detail-rating">${STAR_SVG} ${rating(data.vote_average)}</span>` : ''}
                                    <span class="detail-year">${year(itemDate(data))}</span>
                                    ${data.runtime ? `<span class="detail-runtime">${runtime(data.runtime)}</span>` : ''}
                                    ${data.number_of_seasons ? `<span class="detail-runtime">${data.number_of_seasons} Season${data.number_of_seasons > 1 ? 's' : ''}</span>` : ''}
                                </div>
                                <div class="detail-genres">
                                    ${genres.map(g => `<span class="genre-pill">${g.name}</span>`).join('')}
                                </div>
                                <div class="detail-buttons">
                                    <button class="btn-primary play-video-btn" data-id="${data.id}" data-type="${type}" data-title="${itemTitle(data)}" data-poster="${data.poster_path || ''}" data-backdrop="${data.backdrop_path || ''}" data-rating="${data.vote_average || 0}">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                        Play
                                    </button>
                                    ${trailerBtn}
                                    <button class="btn-secondary watchlist-toggle${inList ? ' in-list' : ''}" data-item='${JSON.stringify(itemObj)}'>
                                        ${inList
                                            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> In My List'
                                            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add to List'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Episodes Section -->
                    <div id="episodes-section" class="episodes-section">
                        <div class="episodes-header">
                            <h3>Episodes</h3>
                            <div class="season-toggles" id="season-toggles"></div>
                        </div>
                        <div class="episodes-list" id="episodes-list"></div>
                    </div>

                    <div class="detail-body">
                        ${data.overview ? `
                        <div class="detail-section">
                            <h2 class="detail-section-title">Overview</h2>
                            <p class="detail-overview">${data.overview}</p>
                        </div>` : ''}

                        ${cast.length ? `
                        <div class="detail-section">
                            <h2 class="detail-section-title">Top Cast</h2>
                            <div class="cast-grid">
                                ${cast.map(c => `
                                <div class="cast-card">
                                    <div class="cast-img-wrap"><img src="${profileUrl(c.profile_path)}" alt="${c.name}" loading="lazy"></div>
                                    <div class="cast-name">${c.name}</div>
                                    <div class="cast-character">${c.character || c.roles?.[0]?.character || ''}</div>
                                </div>`).join('')}
                            </div>
                        </div>` : ''}

                        ${recs.length ? `
                        <div class="detail-section">
                            <h2 class="detail-section-title">More Like This</h2>
                            ${carouselHTML(recs.map(r => ({...r, media_type: r.media_type || type})), 'c-recs')}
                        </div>` : ''}
                    </div>
                </div>
                ${footerHTML()}`;

            // Initialize Video & TV logic if it's a TV show
            if (type === 'tv' && data.number_of_seasons) {
                initTvEpisodes(data.id, data.seasons);
            }

            initCarousels();
        } catch (e) {
            mainContent.innerHTML = `<div class="empty-state"><h3>Failed to load details</h3><p>${e.message}</p></div>`;
        }
    }

    // ========== PAGE: SEARCH ==========
    function renderSearch() {
        mainContent.innerHTML = `
            <div class="search-page">
                <h1 class="browse-title">Search</h1>
                <div class="search-bar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input class="search-input" id="search-input" type="text" placeholder="Search movies, TV shows, people…" autofocus>
                </div>
                <div id="search-results"></div>
            </div>
            ${footerHTML()}`;

        const input = document.getElementById('search-input');
        const results = document.getElementById('search-results');

        input.addEventListener('input', debounce(async () => {
            const q = input.value.trim();
            if (q.length < 2) { results.innerHTML = ''; return; }

            results.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;

            try {
                const data = await fetchSearch(q);
                const items = data.results.filter(i => (i.media_type === 'movie' || i.media_type === 'tv') && i.poster_path);
                if (!items.length) {
                    results.innerHTML = `<div class="empty-state"><h3>No results</h3><p>Try a different search term.</p></div>`;
                    return;
                }
                results.innerHTML = `<p class="search-results-title">${data.total_results} results for "${q}"</p><div class="grid">${items.map(i => cardHTML(i, true)).join('')}</div>`;
            } catch (e) {
                results.innerHTML = `<div class="empty-state"><h3>Search failed</h3><p>${e.message}</p></div>`;
            }
        }, 350));
    }

    // ========== PAGE: WATCHLIST ==========
    function renderWatchlist() {
        const list = getWatchlist();
        mainContent.innerHTML = `
            <div class="watchlist-page">
                <h1 class="watchlist-title">My List</h1>
                ${list.length
                    ? `<div class="grid">${list.map(i => cardHTML(i, true)).join('')}</div>`
                    : `<div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                        <h3>Your list is empty</h3>
                        <p>Add movies and TV shows to keep track of what you want to watch.</p>
                    </div>`}
            </div>
            ${footerHTML()}`;
    }

    // ========== CAROUSEL CONTROLS ==========
    function initCarousels() {
        document.querySelectorAll('.carousel').forEach(c => {
            const track = c.querySelector('.carousel-track, .top10-track');
            const left = c.querySelector('.carousel-btn-left');
            const right = c.querySelector('.carousel-btn-right');
            if (!track) return;
            const scrollAmt = track.clientWidth * 0.7;
            left?.addEventListener('click', () => track.scrollBy({ left: -scrollAmt, behavior: 'smooth' }));
            right?.addEventListener('click', () => track.scrollBy({ left: scrollAmt, behavior: 'smooth' }));
        });
    }

    // ========== WATCHLIST TOGGLE HANDLER ==========
    mainContent.addEventListener('click', e => {
        const btn = e.target.closest('.watchlist-toggle');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            const item = JSON.parse(btn.dataset.item);
            toggleWatchlist(item);
            const inList = isInWatchlist(item.id);
            btn.classList.toggle('in-list', inList);
            btn.innerHTML = inList
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> In My List'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add to List';
        } catch (err) { /* ignore */ }
    });

    // ========== API KEY MODAL ==========
    function showApiModal() {
        apiModal.classList.add('visible');
    }

    function hideApiModal() {
        apiModal.classList.remove('visible');
    }

    apiSubmit.addEventListener('click', async () => {
        const key = apiInput.value.trim();
        if (!key) return;

        apiSubmit.textContent = 'Verifying…';
        apiSubmit.disabled = true;

        try {
            // Verify key works
            const url = `${BASE_URL}/configuration?api_key=${key}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Invalid key');

            API_KEY = key;
            localStorage.setItem('tmdb_api_key', key);
            hideApiModal();
            await loadGenres();
            router();
        } catch (e) {
            // Show error
            let errEl = apiModal.querySelector('.modal-error');
            if (!errEl) {
                errEl = document.createElement('p');
                errEl.className = 'modal-error visible';
                apiInput.before(errEl);
            }
            errEl.textContent = 'Invalid API key. Please check and try again.';
            errEl.classList.add('visible');
        } finally {
            apiSubmit.textContent = 'Get Started';
            apiSubmit.disabled = false;
        }
    });

    apiInput.addEventListener('keydown', e => { if (e.key === 'Enter') apiSubmit.click(); });

    // ========== INLINE VIDEO & TV LOGIC ==========
    const SERVERS = [
        { name: 'VidLink', getMovie: id => `https://vidlink.pro/movie/${id}?primaryColor=38bdf8&autoplay=false`, getTv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=38bdf8&autoplay=false` },
        { name: 'VidSrc', getMovie: id => `https://vidsrc.net/embed/movie?tmdb=${id}`, getTv: (id, s, e) => `https://vidsrc.net/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
        { name: 'Videasy', getMovie: id => `https://player.videasy.net/movie/${id}`, getTv: (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}` },
        { name: 'VidFast', getMovie: id => `https://vidfast.pro/movie/${id}`, getTv: (id, s, e) => `https://vidfast.pro/tv/${id}/${s}/${e}` },
        { name: 'VidSrc FYI', getMovie: id => `https://vidsrc.cc/v2/embed/movie/${id}`, getTv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}` },
        { name: 'VidSrc.to', getMovie: id => `https://vidsrc.to/embed/movie/${id}`, getTv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
        { name: 'VidSrc XYZ', getMovie: id => `https://vidsrc.xyz/embed/movie/${id}`, getTv: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}` },
        { name: 'VidSrc CC', getMovie: id => `https://vidsrc.cc/v3/embed/movie/${id}`, getTv: (id, s, e) => `https://vidsrc.cc/v3/embed/tv/${id}/${s}/${e}` },
        { name: '2Embed', getMovie: id => `https://www.2embed.cc/embed/${id}`, getTv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
        { name: 'MultiEmbed', getMovie: id => `https://multiembed.mov/?video_id=${id}&tmdb=1`, getTv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
        { name: 'AutoEmbed', getMovie: id => `https://autoembed.to/movie/tmdb/${id}`, getTv: (id, s, e) => `https://autoembed.to/tv/tmdb/${id}-${s}-${e}` },
        { name: 'Anime (AniWave)', getMovie: id => `https://aniwave.live/embed/${id}`, getTv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=38bdf8&autoplay=false&fallback=true` }
    ];

    let currentVideoState = { id: null, type: null, serverIndex: 0, season: 1, episode: 1, episodesData: [] };

    function renderInlineServerButtons() {
        const selector = document.getElementById('inline-server-selector');
        if (!selector) return;
        selector.innerHTML = `<span class="server-label">SERVERS</span>` + 
            SERVERS.map((s, i) => `<button class="server-pill ${i === currentVideoState.serverIndex ? 'active' : ''}" data-index="${i}">${s.name}</button>`).join('');
        
        document.getElementById('current-server-name').textContent = SERVERS[currentVideoState.serverIndex].name;
    }

    mainContent.addEventListener('click', e => {
        // Server switching
        if (e.target.classList.contains('server-pill')) {
            currentVideoState.serverIndex = parseInt(e.target.dataset.index);
            renderInlineServerButtons();
            updateInlineVideoFrame();
            return;
        }

        // Play Main Button
        const playBtn = e.target.closest('.play-video-btn');
        if (playBtn) {
            currentVideoState.id = playBtn.dataset.id;
            currentVideoState.type = playBtn.dataset.type;
            currentVideoState.season = 1;
            currentVideoState.episode = 1;
            showInlinePlayer();
            updateInlineVideoFrame();
            // Track in Continue Watching
            addToContinueWatching({
                id: parseInt(playBtn.dataset.id),
                type: playBtn.dataset.type,
                title: playBtn.dataset.title || 'Untitled',
                poster_path: playBtn.dataset.poster || '',
                backdrop_path: playBtn.dataset.backdrop || '',
                vote_average: parseFloat(playBtn.dataset.rating) || 0,
                season: playBtn.dataset.type === 'tv' ? 1 : null,
                episode: playBtn.dataset.type === 'tv' ? 1 : null
            });
            return;
        }

        // Trailer Button
        const trailerBtn = e.target.closest('.watch-trailer-btn');
        if (trailerBtn) {
            const key = trailerBtn.dataset.key;
            window.open(`https://www.youtube.com/watch?v=${key}`, '_blank');
            return;
        }

        // Season Toggles
        if (e.target.classList.contains('season-pill')) {
            document.querySelectorAll('.season-pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            const sNum = parseInt(e.target.dataset.season);
            loadEpisodesUI(currentVideoState.id, sNum);
            return;
        }

        // Episode Card Click
        const epCard = e.target.closest('.episode-card');
        if (epCard) {
            document.querySelectorAll('.episode-card').forEach(c => c.classList.remove('active'));
            epCard.classList.add('active');
            
            currentVideoState.season = parseInt(epCard.dataset.season);
            currentVideoState.episode = parseInt(epCard.dataset.episode);
            
            showInlinePlayer();
            updateInlineVideoFrame();
            // Update Continue Watching with new episode
            const titleEl = document.querySelector('.detail-title');
            const posterEl = document.querySelector('.detail-poster img');
            addToContinueWatching({
                id: parseInt(currentVideoState.id),
                type: 'tv',
                title: titleEl ? titleEl.textContent : 'Untitled',
                poster_path: posterEl ? posterEl.src.split('/').pop() : '',
                season: currentVideoState.season,
                episode: currentVideoState.episode
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        
        // Next Up click
        const nextUpCard = e.target.closest('.next-up-card');
        if (nextUpCard) {
            currentVideoState.episode++;
            updateInlineVideoFrame();
            updateNextUp();
            // Also highlight the new active card
            const nextCard = document.querySelector(`.episode-card[data-episode="${currentVideoState.episode}"]`);
            if (nextCard) {
                document.querySelectorAll('.episode-card').forEach(c => c.classList.remove('active'));
                nextCard.classList.add('active');
            }
        }
    });

    function showInlinePlayer() {
        const wrap = document.getElementById('inline-player-wrapper');
        if (wrap) {
            wrap.style.display = 'flex';
            renderInlineServerButtons();
        }
    }

    function updateInlineVideoFrame() {
        const iframe = document.getElementById('inline-video-iframe');
        const text = document.getElementById('now-playing-text');
        if (!iframe) return;

        const server = SERVERS[currentVideoState.serverIndex];
        const { id, type, season, episode } = currentVideoState;
        
        if (type === 'tv') {
            iframe.src = server.getTv(id, season, episode);
            text.textContent = `NOW PLAYING — SEASON ${season} · EPISODE ${episode}`;
        } else {
            iframe.src = server.getMovie(id);
            text.textContent = `NOW PLAYING — MOVIE`;
        }
        
        updateNextUp();
    }

    function updateNextUp() {
        const container = document.getElementById('next-up-container');
        const titleEl = document.getElementById('next-up-title');
        
        if (currentVideoState.type === 'tv' && currentVideoState.episodesData.length > 0) {
            const nextEpIndex = currentVideoState.episodesData.findIndex(ep => ep.episode_number > currentVideoState.episode);
            if (nextEpIndex !== -1) {
                const nextEp = currentVideoState.episodesData[nextEpIndex];
                titleEl.textContent = `E${nextEp.episode_number} · ${nextEp.name}`;
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        } else {
            container.style.display = 'none';
        }
    }

    async function initTvEpisodes(id, seasons) {
        currentVideoState.id = id;
        currentVideoState.type = 'tv';
        
        const section = document.getElementById('episodes-section');
        const toggles = document.getElementById('season-toggles');
        if (!section || !toggles) return;
        
        section.style.display = 'block';
        
        const validSeasons = seasons ? seasons.filter(s => s.season_number > 0) : [{season_number: 1}];
        
        toggles.innerHTML = validSeasons.map((s, i) => 
            `<button class="season-pill ${i === 0 ? 'active' : ''}" data-season="${s.season_number}">Season ${s.season_number}</button>`
        ).join('');
        
        await loadEpisodesUI(id, validSeasons[0].season_number);
    }

    async function loadEpisodesUI(tvId, seasonNumber) {
        const list = document.getElementById('episodes-list');
        list.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
        
        try {
            const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`);
            const data = await res.json();
            currentVideoState.episodesData = data.episodes || [];
            
            list.innerHTML = currentVideoState.episodesData.map((ep, i) => {
                const thumb = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
                const date = ep.air_date || 'Unknown Date';
                const runtimeStr = ep.runtime ? `${ep.runtime}m` : '';
                const isActive = (currentVideoState.season === seasonNumber && currentVideoState.episode === ep.episode_number);
                
                return `
                <div class="episode-card ${isActive ? 'active' : ''}" data-season="${seasonNumber}" data-episode="${ep.episode_number}">
                    <img src="${thumb}" class="ep-thumbnail" loading="lazy" alt="E${ep.episode_number}">
                    <div class="ep-details">
                        <div class="ep-header">
                            <div class="ep-title"><span>E${ep.episode_number}</span> ${ep.name}</div>
                            <span class="ep-mark-watched">Mark Watched</span>
                        </div>
                        <div class="ep-overview">${ep.overview || 'No description available for this episode.'}</div>
                        <div class="ep-meta">${date} &nbsp;·&nbsp; ${runtimeStr}</div>
                    </div>
                </div>`;
            }).join('');
            
            updateNextUp();
        } catch (e) {
            console.error(e);
            list.innerHTML = `<p style="padding:20px;">Failed to load episodes.</p>`;
        }
    }

    // ========== KEYBOARD SHORTCUTS ==========
    document.addEventListener('keydown', e => {
        // Don't trigger if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch(e.key) {
            case 'f':
            case 'F': {
                const iframe = document.getElementById('inline-video-iframe');
                if (iframe) {
                    if (iframe.requestFullscreen) iframe.requestFullscreen();
                    else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
                }
                break;
            }
            case 'Escape': {
                if (currentPage === 'detail') history.back();
                break;
            }
            case 'ArrowRight': {
                if (currentVideoState.type === 'tv' && currentVideoState.episodesData.length > 0) {
                    const nextEp = currentVideoState.episodesData.find(ep => ep.episode_number > currentVideoState.episode);
                    if (nextEp) {
                        currentVideoState.episode = nextEp.episode_number;
                        updateInlineVideoFrame();
                        // Highlight episode card
                        const card = document.querySelector(`.episode-card[data-episode="${nextEp.episode_number}"]`);
                        if (card) {
                            document.querySelectorAll('.episode-card').forEach(c => c.classList.remove('active'));
                            card.classList.add('active');
                        }
                    }
                }
                break;
            }
            case 'ArrowLeft': {
                if (currentVideoState.type === 'tv' && currentVideoState.episode > 1) {
                    currentVideoState.episode--;
                    updateInlineVideoFrame();
                    const card = document.querySelector(`.episode-card[data-episode="${currentVideoState.episode}"]`);
                    if (card) {
                        document.querySelectorAll('.episode-card').forEach(c => c.classList.remove('active'));
                        card.classList.add('active');
                    }
                }
                break;
            }
        }
    });

    // ========== THEME MANAGEMENT ==========
    function applyTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
        localStorage.setItem('anuflix_theme', themeName);
        
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            if (themeName === 'light') {
                // Sun icon
                themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
            } else {
                // Moon icon
                themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
            }
        }
    }

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            applyTheme(currentTheme === 'light' ? 'default' : 'light');
        });
    }

    const savedTheme = localStorage.getItem('anuflix_theme') || 'default';
    applyTheme(savedTheme === 'light' ? 'light' : 'default');

    // ========== INIT ==========
    async function init() {
        if (!API_KEY) {
            showApiModal();
            return;
        }
        await loadGenres();
        router();
    }

    window.addEventListener('hashchange', () => {
        // Clean up browse scroll listener on page change
        if (browseScrollHandler) {
            window.removeEventListener('scroll', browseScrollHandler);
            browseScrollHandler = null;
        }
        if (API_KEY) router();
    });

    // Trailer Modal Close Handlers
    const closeTrailer = () => {
        const modal = document.getElementById('trailer-modal');
        const iframe = document.getElementById('trailer-iframe');
        if (modal && iframe) {
            modal.classList.remove('visible');
            setTimeout(() => {
                modal.style.display = 'none';
                iframe.src = '';
            }, 300);
        }
    };

    document.getElementById('close-trailer')?.addEventListener('click', closeTrailer);
    document.getElementById('trailer-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'trailer-modal') closeTrailer();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeTrailer();
    });

    init();
})();
