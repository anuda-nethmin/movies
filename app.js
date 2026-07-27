/* ============================================
   Anuflix — Movie & TV App Logic
   ============================================ */
(() => {
    'use strict';

    // ========== COMPACT LIST ITEM UI (For Anime Columns) ==========
    function animeListItemHTML(item) {
        if (!item) return '';
        const title = item.title || item.name;
        const date = item.release_date || item.first_air_date || 'N/A';
        const year = date !== 'N/A' ? date.substring(0,4) : 'N/A';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'NR';
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : 'placeholder.jpg';
        const type = item.title ? 'movie' : 'tv';
        const hashType = type === 'tv' ? 'show' : 'movie';

        return `
        <div class="anime-list-item" onclick="window.location.hash='#/${hashType}/${item.id}'">
            <img class="anime-list-poster" src="${poster}" alt="${title}" loading="lazy">
            <div class="anime-list-info">
                <div class="anime-list-title" title="${title}">${title}</div>
                <div class="anime-list-meta">
                    <span class="rating"><svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ${rating}</span>
                    <span>•</span>
                    <span>${year}</span>
                </div>
            </div>
        </div>
        `;
    }

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

    // ========== WATCHED EPISODES ==========
    const getWatchedEpisodes = () => JSON.parse(localStorage.getItem('streamline_watched_episodes') || '{}');
    const saveWatchedEpisodes = data => localStorage.setItem('streamline_watched_episodes', JSON.stringify(data));
    const markWatched = (showId, season, episode) => {
        let watched = getWatchedEpisodes();
        if (!watched[showId]) watched[showId] = [];
        const epStr = `${season}-${episode}`;
        if (!watched[showId].includes(epStr)) {
            watched[showId].push(epStr);
            saveWatchedEpisodes(watched);
        }
    };
    const isWatched = (showId, season, episode) => {
        let watched = getWatchedEpisodes();
        return watched[showId] && watched[showId].includes(`${season}-${episode}`);
    };

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
    
    // Anime API Functions (Filtered by Crunchyroll Watch Provider ID 283)
    const animeBaseParams = { 
        with_genres: '16', 
        with_original_language: 'ja', 
        with_watch_providers: '283', 
        watch_region: 'US' 
    };
    const fetchAnimeTopAiring = () => api('/discover/tv', { ...animeBaseParams, sort_by: 'popularity.desc', 'air_date.lte': new Date().toISOString().split('T')[0] });
    const fetchAnimePopular = () => api('/discover/tv', { ...animeBaseParams, sort_by: 'popularity.desc' });
    const fetchAnimeFavorite = () => api('/discover/tv', { ...animeBaseParams, sort_by: 'vote_average.desc', 'vote_count.gte': 1000 });
    const fetchAnimeCompleted = () => api('/discover/tv', { ...animeBaseParams, sort_by: 'first_air_date.desc', 'vote_count.gte': 50, with_status: '3' });

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
                case 'watchlist': renderWatchlist(); currentPage = 'watchlist'; break;
                case 'f1': renderF1(); currentPage = 'f1'; break;
                case 'anime': renderAnime(); currentPage = 'anime'; break;
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
                <img class="card-img poster-img" src="${posterUrl(item.poster_path)}" alt="${title}" loading="lazy" onload="this.classList.add('loaded')">
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

    // ========== ANIME GENRE MAPPINGS ==========
    const ANIME_GENRES = [
        { name: 'Action', type: 'genre', id: '10759' },
        { name: 'Comedy', type: 'genre', id: '35' },
        { name: 'Sci-Fi', type: 'genre', id: '10765' },
        { name: 'Shounen', type: 'keyword', id: '209714' },
        { name: 'Isekai', type: 'keyword', id: '279090' },
        { name: 'Mecha', type: 'keyword', id: '278550' },
        { name: 'Magic', type: 'keyword', id: '2343' },
        { name: 'Supernatural', type: 'keyword', id: '6152' },
        { name: 'Romance', type: 'keyword', id: '9840' },
        { name: 'Slice of Life', type: 'keyword', id: '279058' },
        { name: 'Sports', type: 'keyword', id: '279095' },
        { name: 'Demons', type: 'keyword', id: '15001' },
        { name: 'School', type: 'keyword', id: '211910' }
    ];

    let animeFilterScrollHandler = null;
    let animeFilterState = { endpoint: '', params: {}, page: 1, loading: false };

    // ========== PAGE: ANIME ==========
    async function renderAnime() {
        if (animeFilterScrollHandler) {
            window.removeEventListener('scroll', animeFilterScrollHandler);
            animeFilterScrollHandler = null;
        }

        mainContent.innerHTML = `
            <div class="anime-filter-wrapper">
                <div class="anime-filter-top-row" id="anime-filter-top-row">
                    <div class="filter-search-container">
                        <div class="filter-group" style="margin: 0; background: rgba(0,0,0,0.2); width: 100%;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input type="text" class="filter-search-input" id="filter-search" placeholder="Search anime..." style="width: 100%;">
                        </div>
                        <div id="filter-search-suggestions" class="search-suggestions"></div>
                    </div>
                    <button class="filter-submit-btn" id="filter-search-btn" style="padding: 8px 16px; margin: 0;">Search</button>
                    <div class="anime-filter-toggle-btn" id="anime-filter-toggle-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                        Filters
                        <svg class="anime-filter-header-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                </div>
                
                <div class="anime-filter-content" id="anime-filter-content">
                    <div class="filter-row" style="margin-top:0;">
                        <div class="filter-group">
                            <span class="filter-group-label">Type</span>
                            <select class="filter-select" id="filter-type">
                                <option value="all">All</option>
                                <option value="tv">TV</option>
                                <option value="movie">Movie</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <span class="filter-group-label">Status</span>
                            <select class="filter-select" id="filter-status">
                                <option value="all">All</option>
                                <option value="0">Returning Series</option>
                                <option value="3">Ended</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <span class="filter-group-label">Score</span>
                            <select class="filter-select" id="filter-score">
                                <option value="all">All</option>
                                <option value="9">9+</option>
                                <option value="8">8+</option>
                                <option value="7">7+</option>
                                <option value="6">6+</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <span class="filter-group-label">Sort</span>
                            <select class="filter-select" id="filter-sort">
                                <option value="popularity.desc">Popularity</option>
                                <option value="vote_average.desc">Rating</option>
                                <option value="first_air_date.desc">Newest</option>
                            </select>
                        </div>
                        <button class="filter-submit-btn" id="filter-submit">Apply Filters</button>
                    </div>

                    <div class="filter-section-title">Genre</div>
                    <div class="genre-grid" id="anime-genre-grid">
                        ${ANIME_GENRES.map(g => `<button class="genre-pill" data-type="${g.type}" data-id="${g.id}">${g.name}</button>`).join('')}
                    </div>
                </div>
            </div>

            <div id="anime-filter-results-container"></div>

            <div id="anime-default-container" style="padding-top: 24px;">
                ${skeletonHero()}
                <div class="anime-columns-wrapper">
                    <div class="anime-column"><div class="anime-column-title">Top Airing</div>${skeletonCards().replace(/card/g, 'anime-list-item').replace(/skeleton-card/g, 'skeleton-list-item')}</div>
                    <div class="anime-column"><div class="anime-column-title">Most Popular</div>${skeletonCards().replace(/card/g, 'anime-list-item').replace(/skeleton-card/g, 'skeleton-list-item')}</div>
                    <div class="anime-column"><div class="anime-column-title">Most Favorite</div>${skeletonCards().replace(/card/g, 'anime-list-item').replace(/skeleton-card/g, 'skeleton-list-item')}</div>
                    <div class="anime-column"><div class="anime-column-title">Completed</div>${skeletonCards().replace(/card/g, 'anime-list-item').replace(/skeleton-card/g, 'skeleton-list-item')}</div>
                </div>
            </div>`;

        // Handle Filter Toggle
        const toggleBtn = document.getElementById('anime-filter-toggle-btn');
        const filterContent = document.getElementById('anime-filter-content');
        const topRow = document.getElementById('anime-filter-top-row');
        toggleBtn.addEventListener('click', () => {
            toggleBtn.classList.toggle('open');
            filterContent.classList.toggle('show');
            topRow.classList.toggle('has-border');
        });

        // Handle genre selection
        document.querySelectorAll('.genre-pill').forEach(btn => {
            btn.addEventListener('click', () => btn.classList.toggle('active'));
        });

        // Handle Search and Filter Submit logic
        let searchTimeout = null;
        
        const triggerSearch = async () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            const suggestionsBox = document.getElementById('filter-search-suggestions');
            if (suggestionsBox) suggestionsBox.style.display = 'none';

            const resultsContainer = document.getElementById('anime-filter-results-container');
            resultsContainer.innerHTML = `<div id="anime-grid-spinner" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; padding: 48px; width: 100%;">
                <div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>
            </div>`;
            
            const type = document.getElementById('filter-type').value;
            const status = document.getElementById('filter-status').value;
            const score = document.getElementById('filter-score').value;
            const sort = document.getElementById('filter-sort').value;
            const query = document.getElementById('filter-search').value.trim();
            
            let genres = ['16']; // Always include animation
            let keywords = [];

            document.querySelectorAll('.genre-pill.active').forEach(btn => {
                if(btn.dataset.type === 'genre') genres.push(btn.dataset.id);
                else keywords.push(btn.dataset.id);
            });

            const params = {
                with_genres: genres.join(','),
                with_original_language: 'ja',
                sort_by: sort,
                with_watch_providers: '283',
                watch_region: 'US'
            };
            if(keywords.length > 0) params.with_keywords = keywords.join(',');
            if(status !== 'all') params.with_status = status;
            if(score !== 'all') params['vote_average.gte'] = score;

            let endpoint = type === 'movie' ? '/discover/movie' : '/discover/tv';
            
            // If text query, use search API and drop unsupported discover filters
            if (query) {
                if (type === 'all') {
                    endpoint = '/search/multi';
                } else if (type === 'movie') {
                    endpoint = '/search/movie';
                } else {
                    endpoint = '/search/tv';
                }
                params.query = query;
                delete params.with_genres;
                delete params.with_original_language;
                delete params.sort_by;
                delete params.with_keywords;
                delete params.with_status;
            }
            
            // Set up infinite scroll state
            animeFilterState = { endpoint, params, page: 1, loading: true };
            
            if (animeFilterScrollHandler) {
                window.removeEventListener('scroll', animeFilterScrollHandler);
            }

            try {
                // Initial load: 2 pages
                const [page1, page2] = await Promise.all([
                    api(endpoint, { ...params, page: 1 }),
                    api(endpoint, { ...params, page: 2 })
                ]);
                animeFilterState.page = 2;
                
                let combined = [...page1.results, ...page2.results];
                
                // If using search API, we must locally filter for anime (ja language and animation genre if possible)
                if (query) {
                    combined = combined.filter(item => item.original_language === 'ja' || (item.genre_ids && item.genre_ids.includes(16)));
                }
                
                const uniqueResults = Array.from(new Map(combined.map(item => [item.id, item])).values());
                
                resultsContainer.innerHTML = `
                <div class="section" style="padding-top: 24px;">
                    <div class="section-header"><h2 class="section-title">Filter <span class="accent">Results</span></h2></div>
                    <div class="grid" id="anime-filter-grid">${uniqueResults.map(i => cardHTML(i, true)).join('')}</div>
                    <div id="anime-infinite-spinner" style="display:none; width: 100%; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; margin-top: 20px;">
                        <div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>
                    </div>
                </div>`;
                
                animeFilterState.loading = false;
                
                // Set up infinite scroll
                animeFilterScrollHandler = () => {
                    if (animeFilterState.loading) return;
                    const scrollBottom = window.innerHeight + window.scrollY;
                    const docHeight = document.documentElement.scrollHeight;
                    if (scrollBottom >= docHeight - 600) {
                        loadMoreAnimeFilterResults();
                    }
                };
                window.addEventListener('scroll', animeFilterScrollHandler);

            } catch (e) {
                animeFilterState.loading = false;
                resultsContainer.innerHTML = `<div class="empty-state"><h3>Filter failed</h3><p>${e.message}</p></div>`;
            }
        };

        document.getElementById('filter-submit').addEventListener('click', triggerSearch);
        document.getElementById('filter-search-btn').addEventListener('click', triggerSearch);
        
        // Handle Search Autocomplete
        const searchInput = document.getElementById('filter-search');
        const suggestionsBox = document.getElementById('filter-search-suggestions');

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (searchTimeout) clearTimeout(searchTimeout);
            
            if (query.length < 2) {
                suggestionsBox.style.display = 'none';
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const data = await api('/search/multi', { query, page: 1 });
                    // Filter for anime-likely results (Japanese original language)
                    const animeResults = data.results.filter(item => 
                        item.original_language === 'ja' && 
                        (item.media_type === 'tv' || item.media_type === 'movie')
                    ).slice(0, 6); // top 6 suggestions

                    if (animeResults.length > 0) {
                        suggestionsBox.innerHTML = animeResults.map(item => {
                            const title = item.title || item.name;
                            const date = item.release_date || item.first_air_date || '';
                            const year = date ? date.substring(0,4) : '';
                            const poster = item.poster_path ? `${IMG_BASE}w92${item.poster_path}` : 'placeholder.jpg';
                            const type = item.media_type || (item.title ? 'movie' : 'tv');
                            const hashType = type === 'tv' ? 'show' : 'movie';
                            
                            return `
                            <div class="search-suggestion-item" onclick="window.location.hash='#/${hashType}/${item.id}'">
                                <img src="${poster}" class="search-suggestion-poster" alt="${title}">
                                <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
                                    <div class="search-suggestion-title">${title}</div>
                                    <div class="search-suggestion-meta">${year} • ${type.toUpperCase()}</div>
                                </div>
                            </div>
                            `;
                        }).join('');
                        suggestionsBox.style.display = 'block';
                    } else {
                        suggestionsBox.style.display = 'none';
                    }
                } catch(e) {
                    suggestionsBox.style.display = 'none';
                }
            }, 300);
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                suggestionsBox.style.display = 'none';
            }
        });

        searchInput.addEventListener('focus', () => {
            if (suggestionsBox.innerHTML && searchInput.value.trim().length >= 2) {
                suggestionsBox.style.display = 'block';
            }
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                suggestionsBox.style.display = 'none';
                triggerSearch();
            }
        });

        async function loadMoreAnimeFilterResults() {
            animeFilterState.loading = true;
            animeFilterState.page++;
            const spinner = document.getElementById('anime-infinite-spinner');
            const grid = document.getElementById('anime-filter-grid');
            if (spinner) spinner.style.display = 'grid';

            try {
                const data = await api(animeFilterState.endpoint, { ...animeFilterState.params, page: animeFilterState.page });
                if (spinner) spinner.style.display = 'none';
                
                if (data.results && data.results.length > 0) {
                    let newResults = data.results;
                    if (animeFilterState.params.query) {
                        newResults = newResults.filter(item => item.original_language === 'ja' || (item.genre_ids && item.genre_ids.includes(16)));
                    }
                    grid.innerHTML += newResults.map(i => cardHTML(i, true)).join('');
                } else if (animeFilterScrollHandler) {
                    window.removeEventListener('scroll', animeFilterScrollHandler);
                    animeFilterScrollHandler = null;
                }
            } catch(e) {
                if (spinner) spinner.style.display = 'none';
            }
            animeFilterState.loading = false;
        }

        try {
            const [topAiring, mostPopular, mostFavorite, latestCompleted] = await Promise.all([
                fetchAnimeTopAiring(),
                fetchAnimePopular(),
                fetchAnimeFavorite(),
                fetchAnimeCompleted()
            ]);

            // Select a hero anime from top airing
            const hero = topAiring.results[0] || mostPopular.results[0];
            const defaultContainer = document.getElementById('anime-default-container');
            if (!defaultContainer) return;

            // Render columns with a max of 10 items per column for a clean look
            defaultContainer.innerHTML = `
                ${heroHTML(hero)}
                <div class="anime-columns-wrapper">
                    <div class="anime-column">
                        <span class="anime-column-title">Top Airing</span>
                        ${topAiring.results.slice(1, 11).map(i => animeListItemHTML(i)).join('')}
                    </div>
                    <div class="anime-column">
                        <span class="anime-column-title">Most Popular</span>
                        ${mostPopular.results.slice(0, 10).map(i => animeListItemHTML(i)).join('')}
                    </div>
                    <div class="anime-column">
                        <span class="anime-column-title">Most Favorite</span>
                        ${mostFavorite.results.slice(0, 10).map(i => animeListItemHTML(i)).join('')}
                    </div>
                    <div class="anime-column">
                        <span class="anime-column-title">Completed</span>
                        ${latestCompleted.results.slice(0, 10).map(i => animeListItemHTML(i)).join('')}
                    </div>
                </div>
                ${footerHTML()}`;
            
        } catch (e) {
            const defaultContainer = document.getElementById('anime-default-container');
            if (defaultContainer) defaultContainer.innerHTML = `<div class="empty-state"><h3>Failed to load Anime</h3><p>${e.message}</p></div>`;
        }
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
                <div id="browse-spinner" style="display:none; width: 100%; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; margin-top: 20px;">
                    <div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>
                </div>
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
        if (!grid) return;
        if (!append) grid.innerHTML = '';
        browseIsLoading = true;
        if (spinner) spinner.style.display = 'grid';
        if (loadMore) loadMore.style.display = 'none';

        try {
            const data = await fetchDiscover(browseState.type, browseState.page, browseState.genre);
            if (spinner) spinner.style.display = 'none';
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
            if (spinner) spinner.style.display = 'none';
            browseIsLoading = false;
            if (!append) grid.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
        }
    }

    // ========== PAGE: DETAIL ==========
    async function renderDetail(type, id) {
        mainContent.innerHTML = `<div style="padding: 40px; width: 100%;"><div class="skeleton-card" style="width: 100%; max-width: 800px; aspect-ratio: 16/9; margin: 0 auto;"></div></div>`;

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

                    <div id="top-content-wrapper" class="top-content-wrapper">
                        <!-- Episodes Section -->
                        <div id="episodes-section" class="episodes-section">
                            <div class="episodes-header">
                                <h3>Episodes</h3>
                                <div class="season-toggles" id="season-toggles"></div>
                            </div>
                            <div class="episodes-list" id="episodes-list"></div>
                        </div>

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
                                <iframe id="inline-video-iframe" src="" frameborder="0" allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowfullscreen="true"></iframe>
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
            } else if (type === 'movie') {
                currentVideoState.id = data.id;
                currentVideoState.type = 'movie';
                currentVideoState.season = 1;
                currentVideoState.episode = 1;
                showInlinePlayer();
                updateInlineVideoFrame();
            }

            initCarousels();
        } catch (e) {
            mainContent.innerHTML = `<div class="empty-state"><h3>Failed to load details</h3><p>${e.message}</p></div>`;
        }
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

    // ========== PAGE: F1 LIVE ==========
    const F1_FLAGS = {'Australia':'\u{1F1E6}\u{1F1FA}','China':'\u{1F1E8}\u{1F1F3}','Japan':'\u{1F1EF}\u{1F1F5}','Bahrain':'\u{1F1E7}\u{1F1ED}','Saudi Arabia':'\u{1F1F8}\u{1F1E6}','USA':'\u{1F1FA}\u{1F1F8}','United States':'\u{1F1FA}\u{1F1F8}','Italy':'\u{1F1EE}\u{1F1F9}','Monaco':'\u{1F1F2}\u{1F1E8}','Spain':'\u{1F1EA}\u{1F1F8}','Canada':'\u{1F1E8}\u{1F1E6}','Austria':'\u{1F1E6}\u{1F1F9}','UK':'\u{1F1EC}\u{1F1E7}','Hungary':'\u{1F1ED}\u{1F1FA}','Belgium':'\u{1F1E7}\u{1F1EA}','Netherlands':'\u{1F1F3}\u{1F1F1}','Singapore':'\u{1F1F8}\u{1F1EC}','Azerbaijan':'\u{1F1E6}\u{1F1FF}','Mexico':'\u{1F1F2}\u{1F1FD}','Brazil':'\u{1F1E7}\u{1F1F7}','Qatar':'\u{1F1F6}\u{1F1E6}','UAE':'\u{1F1E6}\u{1F1EA}'};
    function getFlag(c) { return F1_FLAGS[c] || '\u{1F3C1}'; }

    async function renderF1() {
        mainContent.innerHTML = `
            <div class="detail-page" style="position: relative; overflow: hidden; padding-top: 100px; min-height: 100vh;">
                <!-- Animated Track Background -->
                <div class="f1-animated-bg">
                    <div class="f1-track-line" style="top: 25%;"></div>
                    <div class="f1-track-line" style="top: 50%;"></div>
                    <div class="f1-track-line" style="top: 75%;"></div>
                    
                    ${[
                        { id: 1, flag: 'flag-italy' },    // Ferrari
                        { id: 2, flag: 'flag-germany' },  // Mercedes
                        { id: 3, flag: 'flag-uk' },       // McLaren
                        { id: 4, flag: 'flag-austria' }   // Red Bull
                    ].map(car => `
                    <div class="f1-car-anim f1-car-${car.id}">
                        <div class="f1-trailing-flag ${car.flag}"></div>
                        <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <!-- Tires -->
                            <rect x="20" y="10" width="30" height="12" rx="4" fill="#000" />
                            <rect x="135" y="6" width="35" height="16" rx="4" fill="#000" />
                            <rect x="20" y="78" width="30" height="12" rx="4" fill="#000" />
                            <rect x="135" y="78" width="35" height="16" rx="4" fill="#000" />
                            
                            <!-- Front Wing -->
                            <path d="M10,20 L10,80 Q10,85 15,85 L15,15 Q10,15 10,20 Z" />
                            <rect x="15" y="20" width="5" height="60" />
                            <path d="M15,15 L25,20 L25,80 L15,85 Z" opacity="0.8" />
                            
                            <!-- Nose -->
                            <path d="M25,46 L25,54 L70,58 L70,42 Z" />
                            
                            <!-- Suspension -->
                            <path d="M45,22 L50,42 M45,78 L50,58" stroke="currentColor" stroke-width="2" />
                            <path d="M150,22 L160,35 M150,78 L160,65" stroke="currentColor" stroke-width="2" />
                            
                            <!-- Body & Sidepods -->
                            <path d="M70,35 L70,65 L100,75 L135,75 L165,60 L165,40 L135,25 L100,25 Z" />
                            
                            <!-- Cockpit & Halo -->
                            <rect x="85" y="42" width="25" height="16" rx="8" fill="#111" />
                            <path d="M85,42 Q70,50 85,58" fill="none" stroke="currentColor" stroke-width="2" />
                            <line x1="85" y1="50" x2="72" y2="50" stroke="currentColor" stroke-width="2" />
                            
                            <!-- Engine Cover -->
                            <path d="M110,45 L110,55 L175,52 L175,48 Z" opacity="0.6"/>
                            
                            <!-- Rear Wing -->
                            <rect x="175" y="30" width="8" height="40" rx="2" />
                            <rect x="183" y="25" width="12" height="50" rx="2" />
                        </svg>
                    </div>
                    `).join('')}
                </div>
                
                <div style="padding: 0 48px; position: relative; z-index: 2;">
                    <h1 class="detail-title">Formula 1 Live Stream</h1>
                    <p class="hero-overview" style="margin-top: 10px; max-width: 800px; color: var(--text-secondary);">
                        Watch the latest Formula 1 Grand Prix live. The stream goes live 15 minutes before each session.
                    </p>
                </div>
                
                <div class="f1-3col-wrapper" style="position: relative; z-index: 2;">
                    <!-- Left Side: Schedule -->
                    <div class="f1-col-side">
                        <div class="f1-schedule-container">
                            <h2 class="detail-section-title" style="margin-top: 0; margin-bottom: 20px; font-size: 1.3rem;">\u{1F3CE}\u{FE0F} Race Calendar</h2>
                            <div id="f1-countdown-wrap"></div>
                            <div id="f1-calendar" class="f1-calendar">
                                <div class="skeleton-card"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Center: Player -->
                    <div class="f1-col-center inline-player-wrapper f1-player-box">
                        <div class="player-header">
                            <span class="now-playing-text">NOW PLAYING — F1 LIVE</span>
                        </div>
                        <div class="f1-stream-container" style="position: relative; width: 100%; padding-top: 56.25%; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                            <iframe src="https://westreamf1.com/westreamf1.php" loading="lazy" name="frame" scrolling="no" frameborder="no" allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowfullscreen="true" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"></iframe>
                        </div>
                        <div class="player-footer">
                            <div class="streaming-via">Streaming via WeStreamF1. If playback fails, the session may not be live yet.</div>
                        </div>
                    </div>

                    <!-- Right Side: Standings -->
                    <div class="f1-col-side">
                        <div class="f1-standings-container">
                            <h2 class="detail-section-title" style="margin-top: 0; margin-bottom: 20px; font-size: 1.3rem;">\u{1F3C6} Championship</h2>
                            <div id="f1-standings">
                                <div class="skeleton-card"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ${footerHTML()}`;

        try {
            const res = await fetch('https://api.jolpi.ca/ergast/f1/current.json');
            const data = await res.json();
            const races = data.MRData.RaceTable.Races;
            const now = new Date();
            let nextIdx = races.findIndex(r => new Date(r.date + 'T' + (r.time || '00:00:00Z')) > now);
            if (nextIdx === -1) nextIdx = races.length;

            const calEl = document.getElementById('f1-calendar');
            if (!calEl) return;

            const renderCard = (race, i, isPast, isNext) => {
                const rd = new Date(race.date + 'T' + (race.time || '00:00:00Z'));
                const flag = getFlag(race.Circuit.Location.country);
                const date = rd.toLocaleDateString('en-GB', {day:'numeric',month:'short'});
                const time = rd.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
                const sprint = race.Sprint ? '<span class="f1-sprint-badge">S</span>' : '';
                const status = isPast ? '<span class="f1-status-done">\u2713</span>' : isNext ? '<span class="f1-status-next">NEXT</span>' : '<span class="f1-status-upcoming">\u2014</span>';
                
                return '<div class="f1-race-card' + (isPast ? ' past' : '') + (isNext ? ' next' : '') + '">' +
                    '<div class="f1-race-round">R' + race.round + '</div>' +
                    '<div class="f1-race-flag" style="font-size:1.2rem;">' + flag + '</div>' +
                    '<div class="f1-race-details"><div class="f1-race-name">' + race.raceName + '</div><div class="f1-race-circuit">' + race.Circuit.circuitName + '</div></div>' +
                    '<div class="f1-race-date-block"><div class="f1-race-date">' + date + '</div><div class="f1-race-time">' + time + '</div>' + sprint + '</div>' +
                    '<div class="f1-race-status">' + status + '</div></div>';
            };

            const pastRaces = races.slice(0, nextIdx);
            const futureRaces = races.slice(nextIdx);

            calEl.innerHTML = `
                <div class="f1-calendar-split">
                    <div class="f1-calendar-col">
                        <h3 class="f1-col-title">Upcoming Races</h3>
                        <div class="f1-col-list">
                            ${futureRaces.map((r, i) => renderCard(r, i, false, i === 0)).join('')}
                        </div>
                    </div>
                    <div class="f1-calendar-col">
                        <h3 class="f1-col-title">Past Races</h3>
                        <div class="f1-col-list">
                            ${pastRaces.map((r, i) => renderCard(r, i, true, false)).join('')}
                        </div>
                    </div>
                </div>
            `;

            if (nextIdx < races.length) {
                const nr = races[nextIdx];
                const nd = new Date(nr.date + 'T' + (nr.time || '00:00:00Z'));
                const wrap = document.getElementById('f1-countdown-wrap');
                if (wrap) {
                    function tick() {
                        const diff = nd - new Date();
                        if (diff <= 0) { wrap.innerHTML = '<div class="f1-countdown"><span class="f1-countdown-live">\u{1F534} RACE IS LIVE NOW</span></div>'; return; }
                        const d = Math.floor(diff/864e5), h = Math.floor(diff%864e5/36e5), m = Math.floor(diff%36e5/6e4), s = Math.floor(diff%6e4/1e3);
                        wrap.innerHTML = '<div class="f1-countdown">' +
                            '<div class="f1-countdown-label">Next Race: ' + nr.raceName + ' ' + getFlag(nr.Circuit.Location.country) + '</div>' +
                            '<div class="f1-countdown-timer">' +
                            '<div class="f1-countdown-unit"><span>' + d + '</span>DAYS</div><div class="f1-countdown-sep">:</div>' +
                            '<div class="f1-countdown-unit"><span>' + h + '</span>HRS</div><div class="f1-countdown-sep">:</div>' +
                            '<div class="f1-countdown-unit"><span>' + String(m).padStart(2,'0') + '</span>MIN</div><div class="f1-countdown-sep">:</div>' +
                            '<div class="f1-countdown-unit"><span>' + String(s).padStart(2,'0') + '</span>SEC</div></div></div>';
                    }
                    tick();
                    setInterval(tick, 1000);
                }
            }

            // Fetch Standings
            try {
                const stdRes = await fetch('https://api.jolpi.ca/ergast/f1/current/driverStandings.json');
                const stdData = await stdRes.json();
                const drivers = stdData.MRData.StandingsTable.StandingsLists[0].DriverStandings.slice(0, 10);
                
                const conRes = await fetch('https://api.jolpi.ca/ergast/f1/current/constructorStandings.json');
                const conData = await conRes.json();
                const constructors = conData.MRData.StandingsTable.StandingsLists[0].ConstructorStandings.slice(0, 5);

                const stdEl = document.getElementById('f1-standings');
                if (stdEl) {
                    let html = '<h3 class="f1-col-title" style="margin-top:0;">Drivers (Top 10)</h3><div class="f1-col-list" style="max-height:350px;">';
                    drivers.forEach(d => {
                        html += `<div class="f1-standing-card">
                            <div class="f1-standing-pos">${d.position}</div>
                            <div class="f1-standing-details">
                                <div class="f1-standing-name">${d.Driver.givenName} ${d.Driver.familyName}</div>
                                <div class="f1-standing-team">${d.Constructors[0]?.name || ''}</div>
                            </div>
                            <div class="f1-standing-pts">${d.points} PTS</div>
                        </div>`;
                    });
                    html += '</div><h3 class="f1-col-title" style="margin-top:20px;">Constructors (Top 5)</h3><div class="f1-col-list" style="max-height:200px;">';
                    constructors.forEach(c => {
                        html += `<div class="f1-standing-card constructor">
                            <div class="f1-standing-pos">${c.position}</div>
                            <div class="f1-standing-details">
                                <div class="f1-standing-name">${c.Constructor.name}</div>
                            </div>
                            <div class="f1-standing-pts">${c.points} PTS</div>
                        </div>`;
                    });
                    html += '</div>';
                    stdEl.innerHTML = html;
                }
            } catch (e) {
                console.error('Standings error', e);
                const stdEl = document.getElementById('f1-standings');
                if (stdEl) stdEl.innerHTML = '<div style="color:var(--text-muted)">Failed to load standings.</div>';
            }

        } catch(e) {
            const c = document.getElementById('f1-calendar');
            if (c) c.innerHTML = '<p style="color:var(--text-muted);padding:20px;">Failed to load race calendar.</p>';
        }
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

        // Episode Square Click
        const epCard = e.target.closest('.episode-square');
        if (epCard) {
            document.querySelectorAll('.episode-square').forEach(c => c.classList.remove('active'));
            epCard.classList.add('active');
            epCard.classList.add('watched');
            
            currentVideoState.season = parseInt(epCard.dataset.season);
            currentVideoState.episode = parseInt(epCard.dataset.episode);
            
            markWatched(currentVideoState.id, currentVideoState.season, currentVideoState.episode);
            
            showInlinePlayer();
            updateInlineVideoFrame();
            // Update Continue Watching with new episode
            const titleEl = document.querySelector('.detail-title');
            const posterEl = document.querySelector('.detail-poster img');
            const posterSrc = posterEl ? posterEl.getAttribute('src') : '';
            const posterMatch = posterSrc.match(/\/([^/]+)$/);
            addToContinueWatching({
                id: parseInt(currentVideoState.id),
                type: 'tv',
                title: titleEl ? titleEl.textContent : 'Untitled',
                poster_path: posterMatch ? '/' + posterMatch[1] : '',
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
            markWatched(currentVideoState.id, currentVideoState.season, currentVideoState.episode);
            updateInlineVideoFrame();
            updateNextUp();
            // Also highlight the new active card
            const nextCard = document.querySelector(`.episode-square[data-episode="${currentVideoState.episode}"]`);
            if (nextCard) {
                document.querySelectorAll('.episode-square').forEach(c => c.classList.remove('active'));
                nextCard.classList.add('active');
                nextCard.classList.add('watched');
            }
        }
    });

    // Global tooltip for episode squares
    const epTooltip = document.createElement('div');
    epTooltip.className = 'global-episode-tooltip';
    document.body.appendChild(epTooltip);

    mainContent.addEventListener('mouseover', e => {
        const sq = e.target.closest('.episode-square');
        if (sq) {
            epTooltip.innerHTML = `
                <img src="${sq.dataset.thumb}" class="ep-tooltip-thumb" alt="">
                <div class="ep-tooltip-info">
                    <div class="ep-tooltip-title">${sq.dataset.title}</div>
                    <div class="ep-tooltip-meta">${sq.dataset.meta}</div>
                    <div class="ep-tooltip-overview">${sq.dataset.overview}</div>
                </div>
            `;
            const rect = sq.getBoundingClientRect();
            // Position tooltip to the right of the square
            epTooltip.style.top = `${rect.top + window.scrollY - 20}px`;
            epTooltip.style.left = `${rect.right + 15}px`;
            epTooltip.classList.add('visible');
        }
    });

    mainContent.addEventListener('mouseout', e => {
        const sq = e.target.closest('.episode-square');
        if (sq) {
            epTooltip.classList.remove('visible');
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
        
        // Find last watched from continue watching
        const continueList = getContinueWatching();
        const cwItem = continueList.find(i => i.id == id && i.type === 'tv');
        let targetSeason = validSeasons[0].season_number;
        let targetEpisode = 1;
        
        if (cwItem && cwItem.season && cwItem.episode) {
            targetSeason = parseInt(cwItem.season);
            targetEpisode = parseInt(cwItem.episode);
        }
        
        currentVideoState.season = targetSeason;
        currentVideoState.episode = targetEpisode;
        
        toggles.innerHTML = validSeasons.map((s, i) => 
            `<button class="season-pill ${s.season_number === targetSeason ? 'active' : ''}" data-season="${s.season_number}">Season ${s.season_number}</button>`
        ).join('');
        
        await loadEpisodesUI(id, targetSeason);
        
        showInlinePlayer();
        updateInlineVideoFrame();
    }

    async function loadEpisodesUI(tvId, seasonNumber) {
        const list = document.getElementById('episodes-list');
        list.innerHTML = `<div class="skeleton-card"></div>`;
        
        try {
            const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`);
            const data = await res.json();
            currentVideoState.episodesData = data.episodes || [];
            
            list.innerHTML = currentVideoState.episodesData.map((ep, i) => {
                const thumb = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
                const date = ep.air_date || 'Unknown Date';
                const runtimeStr = ep.runtime ? `${ep.runtime}m` : '';
                const isActive = (currentVideoState.season === seasonNumber && currentVideoState.episode === ep.episode_number);
                const isEpWatched = isWatched(currentVideoState.id, seasonNumber, ep.episode_number);
                const cleanOverview = (ep.overview || 'No description available for this episode.').replace(/"/g, '&quot;');
                const cleanTitle = `E${ep.episode_number}: ${ep.name.replace(/"/g, '&quot;')}`;
                
                return `
                <div class="episode-square ${isActive ? 'active' : ''} ${isEpWatched ? 'watched' : ''}" 
                     data-season="${seasonNumber}" 
                     data-episode="${ep.episode_number}"
                     data-thumb="${thumb}"
                     data-title="${cleanTitle}"
                     data-meta="${date} &nbsp;·&nbsp; ${runtimeStr}"
                     data-overview="${cleanOverview}">
                    ${ep.episode_number}
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
        if (animeFilterScrollHandler) {
            window.removeEventListener('scroll', animeFilterScrollHandler);
            animeFilterScrollHandler = null;
        }
        if (API_KEY) router();
    });

    // ========== GLOBAL SEARCH LOGIC ==========
    const globalSearchInput = document.getElementById('global-search-input');
    const globalSearchSuggestions = document.getElementById('global-search-suggestions');
    let globalSearchTimeout = null;

    if(globalSearchInput) {
        globalSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (globalSearchTimeout) clearTimeout(globalSearchTimeout);
            
            if (query.length < 2) {
                globalSearchSuggestions.style.display = 'none';
                globalSearchSuggestions.innerHTML = '';
                return;
            }

            globalSearchSuggestions.style.display = 'block';
            globalSearchSuggestions.innerHTML = `<div class="search-suggestion-item" style="justify-content: center; padding: 12px;"><div class="skeleton-card" style="width: 24px; height: 24px; border-radius: 50%; min-height: 24px;"></div></div>`;

            globalSearchTimeout = setTimeout(async () => {
                try {
                    const data = await api('/search/multi', { query, page: 1, include_adult: 'false' });
                    
                    const filteredResults = data.results.filter(item => 
                        (item.media_type === 'tv' || item.media_type === 'movie') && !item.adult
                    ).slice(0, 6);

                    if (filteredResults.length > 0) {
                        globalSearchSuggestions.innerHTML = filteredResults.map(item => {
                            const title = item.title || item.name;
                            const date = item.release_date || item.first_air_date || '';
                            const year = date ? date.substring(0,4) : '';
                            const poster = item.poster_path ? `${IMG_BASE}w92${item.poster_path}` : 'placeholder.jpg';
                            const type = item.media_type || (item.title ? 'movie' : 'tv');
                            const hashType = type === 'tv' ? 'show' : 'movie';
                            
                            return \`
                            <div class="search-suggestion-item" onclick="window.location.hash='#/\${hashType}/\${item.id}'; document.getElementById('global-search-suggestions').style.display='none'; document.getElementById('global-search-input').value='';">
                                <img src="\${poster}" class="search-suggestion-poster" alt="\${title}">
                                <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
                                    <div class="search-suggestion-title">\${title}</div>
                                    <div class="search-suggestion-meta">\${year} • \${type === 'movie' ? 'Movie' : 'TV Show'}</div>
                                </div>
                            </div>\`;
                        }).join('');
                    } else {
                        globalSearchSuggestions.innerHTML = \`<div class="search-suggestion-item" style="color: var(--text-muted); justify-content: center; padding: 12px;">No results found</div>\`;
                    }
                } catch (e) {
                    globalSearchSuggestions.innerHTML = \`<div class="search-suggestion-item" style="color: var(--text-muted); justify-content: center; padding: 12px;">Error loading results</div>\`;
                }
            }, 300);
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#global-search-container')) {
                globalSearchSuggestions.style.display = 'none';
            }
        });
        
        // Handle Enter key auto-click first suggestion
        globalSearchInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') {
                e.preventDefault();
                const firstResult = globalSearchSuggestions.querySelector('.search-suggestion-item');
                if(firstResult && !firstResult.textContent.includes('No results') && !firstResult.textContent.includes('Error')) {
                    firstResult.click();
                }
            }
        });
    }

    init();
    // ========== DYNAMIC MOUSE GLOW ==========
    document.addEventListener('mousemove', e => {
        document.querySelectorAll('.card:hover').forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

})();
