// ===== Music Map =====

window._mapRefresh = async function() {
    if (!authToken) { alert('로그인이 필요합니다.'); return; }
    const refreshBtn = document.getElementById('mapRefreshBtn');
    if (refreshBtn) refreshBtn.classList.add('loading');
    lastMapData = null;
    mapPrefetchPromise = null;
    Object.keys(sessionStorage).filter(k => k.startsWith('mapCache_')).forEach(k => sessionStorage.removeItem(k));

    const loading = document.getElementById('mapLoading');
    const loadingMsg = document.getElementById('mapLoadingMsg');
    if (loading) { loading.classList.remove('hidden'); if (loadingMsg) loadingMsg.textContent = '취향 지도 생성 중...'; }

    try {
        const canvas = document.getElementById('mapCanvas');
        const data = await fetchMusicMapData(true);
        if (!data) return;
        lastMapData = window.lastMapData = data;
        const favKeys = new Set((lastFavorites || []).map(f => f.track_key));
        data.tracks.forEach(t => { t.is_favorite = favKeys.has(t.track_key); });
        if (canvas) renderMusicMap(canvas, data.tracks);
    } catch(e) {
        console.error('지도 새로고침 실패:', e);
    } finally {
        if (loading) loading.classList.add('hidden');
        if (refreshBtn) refreshBtn.classList.remove('loading');
    }
};

function mapCacheKey(trackKeys) {
    return 'mapCache_' + trackKeys.slice().sort().join(',');
}

function loadMapCache(trackKeys) {
    try {
        const key = mapCacheKey(trackKeys);
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch(e) { return null; }
}

function saveMapCache(trackKeys, data) {
    try {
        const key = mapCacheKey(trackKeys);
        sessionStorage.setItem(key, JSON.stringify(data));
    } catch(e) {}
}

async function fetchMusicMapData(forceRefresh = false) {
    let trackKeys = [];

    if (lastFavorites && lastFavorites.length > 0) {
        trackKeys = lastFavorites.slice(0, 40).map(f => f.track_key);
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/favorites`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                trackKeys = (data.favorites || []).slice(0, 40).map(f => f.track_key);
            }
        } catch(e) {}
    }

    if (trackKeys.length === 0) {
        try {
            const res = await fetch(`${API_BASE_URL}/top-tracks?limit=10`);
            if (res.ok) {
                const data = await res.json();
                trackKeys = (data.tracks || []).map(t => t.track_key);
            }
        } catch(e) {}
    }

    if (trackKeys.length === 0) return null;

    if (!forceRefresh) {
        const cached = loadMapCache(trackKeys);
        if (cached) { console.log('Map cache hit (session)'); return cached; }
    }

    if (!forceRefresh) {
        try {
            const dbRes = await fetch(`${API_BASE_URL}/user-maps/latest`, { headers: getAuthHeaders() });
            if (dbRes.ok) {
                const { map } = await dbRes.json();
                if (map && map.map_data?.length > 0) {
                    const savedKeys = [...new Set(map.map_data.map(t => t.track_key))];
                    const currentSet = new Set(trackKeys);
                    const isSame = trackKeys.every(k => savedKeys.includes(k)) && trackKeys.length === savedKeys.filter(k => currentSet.has(k)).length;
                    if (isSame) {
                        console.log('Map cache hit (DB)');
                        const data = { tracks: map.map_data, seed_count: trackKeys.length, fill_count: map.map_data.length - trackKeys.length, total: map.map_data.length };
                        saveMapCache(trackKeys, data);
                        return data;
                    }
                }
            }
        } catch(e) {}
    }

    const res = await fetch(`${API_BASE_URL}/music-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ track_keys: trackKeys, fill_per_seed: trackKeys.length > 20 ? 2 : trackKeys.length > 10 ? 3 : 5 })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    saveMapCache(trackKeys, data);
    _saveMapToDB(data).catch(() => {});
    return data;
}

async function _saveMapToDB(data) {
    if (!authToken || !data?.tracks?.length) return;
    await fetch(`${API_BASE_URL}/user-maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
            name: '내 취향지도',
            map_data: data.tracks.map(t => ({
                track_key: t.track_key,
                title: t.title || t.track_name || '',
                track_name: t.title || t.track_name || '',
                artist: t.artist || '',
                cover_image_url: t.cover_image_url || null,
                apple_music_id: t.apple_music_id || null,
                x: t.x ?? t.grid_col ?? 0,
                y: t.y ?? t.grid_row ?? 0,
                is_favorite: t.is_favorite || false,
            }))
        })
    });
    console.log('Map saved to DB');
}

function prefetchMusicMap() {
    if (!authToken) return;
    mapPrefetchPromise = fetchMusicMapData().then(data => {
        if (!data) return null;
        lastMapData = window.lastMapData = data;
        const searchHome = document.getElementById('searchHome');
        if (searchHome && searchHome.style.display !== 'none') {
            searchHome.querySelector('.search-home-grid')?.remove();
            if (typeof _renderSearchHomeGrid === 'function') _renderSearchHomeGrid();
        }
        return data;
    }).catch(e => {
        console.warn('Map prefetch failed:', e);
        return null;
    });
}

async function showMusicMap() {
    const canvas = document.getElementById('mapCanvas');
    const wrap = document.getElementById('mapCanvasWrap');
    const loading = document.getElementById('mapLoading');
    const empty = document.getElementById('mapEmpty');

    if (lastMapData) {
        const favKeys = new Set((lastFavorites || []).map(f => f.track_key));
        lastMapData.tracks.forEach(t => { t.is_favorite = favKeys.has(t.track_key); });
        wrap.classList.remove('hidden');
        loading.classList.add('hidden');
        empty.classList.add('hidden');
        renderMusicMap(canvas, lastMapData.tracks);
        return;
    }

    wrap.classList.add('hidden');
    loading.classList.remove('hidden');
    empty.classList.add('hidden');

    try {
        const prefetched = mapPrefetchPromise ? await mapPrefetchPromise : null;
        const data = prefetched || await fetchMusicMapData();
        if (!data || !data.tracks || data.tracks.length === 0) {
            loading.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }
        lastMapData = window.lastMapData = data;
        const favKeys = new Set((lastFavorites || []).map(f => f.track_key));
        data.tracks.forEach(t => { t.is_favorite = favKeys.has(t.track_key); });
        loading.classList.add('hidden');
        wrap.classList.remove('hidden');
        renderMusicMap(canvas, data.tracks);
        const searchHome = document.getElementById('searchHome');
        if (searchHome && searchHome.style.display !== 'none') {
            searchHome.querySelector('.search-home-grid')?.remove();
            if (typeof _renderSearchHomeGrid === 'function') _renderSearchHomeGrid();
        }
        if (playerCurrentTrack) _prefetchNextTracks(playerCurrentTrack.track_key);
    } catch(e) {
        console.error('Map load error:', e);
        loading.classList.add('hidden');
        empty.classList.remove('hidden');
    }
}

function renderMusicMap(canvas, tracks) {
    if (_mapLoopDestroy) { _mapLoopDestroy(); _mapLoopDestroy = null; }

    const COVER = 140, GAP = 50, LABEL_H = 42, STEP = COVER + GAP;
    const VSTEP = COVER + LABEL_H + GAP;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const lw = () => window.innerWidth;
    const lh = () => window.innerHeight;

    const maxCol = Math.max(...tracks.map(t => t.grid_col ?? t.x ?? 0));
    const maxRow = Math.max(...tracks.map(t => t.grid_row ?? t.y ?? 0));

    const grid = tracks.map(track => {
        const col = track.grid_col ?? track.x ?? 0;
        const row = track.grid_row ?? track.y ?? 0;
        const px = col * STEP - maxCol * STEP / 2;
        const py = row * VSTEP - maxRow * VSTEP / 2;
        const spread = 2.5;
        return { track, px, py, apx: px * spread, apy: py * spread, animT: 0 };
    });

    const images = {};
    const TARGET_SCALE = window.innerWidth <= 768 ? 0.42 : 0.6;
    const MIN_SCALE = 0.15, MAX_SCALE = 2.0;
    let cam = { x: lw()/2, y: lh()/2, scale: TARGET_SCALE, tx: lw()/2, ty: lh()/2 };
    let destroyed = false;

    const PAD = COVER * 2;
    const gxMin = Math.min(...grid.map(g=>g.px)) - PAD;
    const gxMax = Math.max(...grid.map(g=>g.px)) + PAD;
    const gyMin = Math.min(...grid.map(g=>g.py)) - PAD;
    const gyMax = Math.max(...grid.map(g=>g.py)) + PAD;

    function clampCam() {
        const s = cam.scale, w = lw(), h = lh();
        cam.tx = Math.max(-gxMax * s, Math.min(w - gxMin * s, cam.tx));
        cam.ty = Math.max(-gyMax * s, Math.min(h - gyMin * s, cam.ty));
    }
    let hoveredItem = null;
    let selectedItem = null;
    const hoverScales = new Map();
    let isDragging = false, dragStart = {x:0,y:0}, camStart = {x:0,y:0};

    const truncCache = new Map();
    let lastTruncScale = -1;
    function truncCached(ctx, text, maxW, key) {
        if (lastTruncScale !== cam.scale) { truncCache.clear(); lastTruncScale = cam.scale; }
        const ckey = key + '|' + maxW.toFixed(1);
        if (truncCache.has(ckey)) return truncCache.get(ckey);
        const result = truncate(ctx, text, maxW);
        truncCache.set(ckey, result);
        return result;
    }

    let drawOrder = [...grid];
    let lastHoveredItem = null;

    Promise.all(tracks.map(t => {
        if (!t.cover_image_url) return Promise.resolve();
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { images[t.track_key] = img; resolve(); };
            img.onerror = () => { images[t.track_key] = null; resolve(); };
            img.src = t.cover_image_url;
        });
    })).then(() => {
        for (const item of grid) item.animT = 0;
        _mapLoopDestroy = () => {
            destroyed = true;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('resize', onResize);
            onMapDestroy();
        };
        requestAnimationFrame(loop);
    });

    function toScreen(px, py) {
        return { sx: px * cam.scale + cam.x, sy: py * cam.scale + cam.y };
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
        ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
        ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
        ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
        ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
    }

    function truncate(ctx, text, maxW) {
        if (!text) return '';
        if (ctx.measureText(text).width <= maxW) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t+'…').width > maxW) t = t.slice(0,-1);
        return t+'…';
    }

    let mousePos = { x: -1, y: -1 };
    let velocity = { x: 0, y: 0 };
    let lastDragPos = { x: 0, y: 0 };

    function loop() {
        if (destroyed) return;
        requestAnimationFrame(loop);
        if (document.getElementById('mapView').classList.contains('hidden')) return;

        if (!isDragging && mousePos.x >= 0) {
            const EDGE = 0.1;
            const SPEED = 16;
            const rect = canvas.getBoundingClientRect();
            const cx = mousePos.x - rect.left, cy = mousePos.y - rect.top;
            const w = rect.width, h = rect.height;
            const nx = cx / w, ny = cy / h;
            if (nx < EDGE)        cam.tx += SPEED * (EDGE - nx) / EDGE;
            else if (nx > 1-EDGE) cam.tx -= SPEED * (nx - (1-EDGE)) / EDGE;
            if (ny < EDGE)        cam.ty += SPEED * (EDGE - ny) / EDGE;
            else if (ny > 1-EDGE) cam.ty -= SPEED * (ny - (1-EDGE)) / EDGE;
        }

        if (!isDragging) {
            cam.tx += velocity.x;
            cam.ty += velocity.y;
            velocity.x *= 0.88;
            velocity.y *= 0.88;
            if (Math.abs(velocity.x) < 0.1) velocity.x = 0;
            if (Math.abs(velocity.y) < 0.1) velocity.y = 0;
        }

        if (window.mapCamTarget) {
            const t = window.mapCamTarget;
            cam.tx = lw() / 2 - t.px * cam.scale;
            cam.ty = lh() / 2 - t.py * cam.scale;
            window.mapCamTarget = null;
        }

        clampCam();
        cam.x += (cam.tx - cam.x) * 0.22;
        cam.y += (cam.ty - cam.y) * 0.22;

        for (const item of grid) {
            if (item.animT < 1) item.animT = Math.min(1, item.animT + 0.022);
        }

        ctx.clearRect(0, 0, lw(), lh());

        const cx = lw() / 2, cy = lh() / 2;

        if (hoveredItem !== lastHoveredItem) {
            lastHoveredItem = hoveredItem;
            drawOrder = [...grid].sort((a,b) => {
                const r = t => hoveredItem===t?2:t.track.is_seed?1:0;
                return r(a)-r(b);
            });
        }

        if (hoveredItem) {
            const k = hoveredItem.track.track_key;
            const cur = hoverScales.get(k) || 1;
            hoverScales.set(k, cur + (1.3 - cur) * 0.13);
        }
        for (const [k, v] of hoverScales) {
            if (hoveredItem && k === hoveredItem.track.track_key) continue;
            if (Math.abs(v - 1) < 0.001) { hoverScales.set(k, 1); continue; }
            hoverScales.set(k, v + (1 - v) * 0.13);
        }

        for (const item of drawOrder) {
            const { track, px, py, apx, apy, animT } = item;
            const e = 1 - Math.pow(1 - animT, 3);
            const curPx = apx + (px - apx) * e;
            const curPy = apy + (py - apy) * e;
            const { sx, sy } = toScreen(curPx, curPy);
            const hs = hoverScales.get(track.track_key) || 1;

            const ndx = (sx - cx) / (lw() * 0.48);
            const ndy = (sy - cy) / (lh() * 0.48);
            const pf = Math.max(0.3, 1 - Math.sqrt(ndx*ndx+ndy*ndy) * 0.58);
            const isPlaying = playerIsPlaying && playerCurrentTrack && playerCurrentTrack.track_key === track.track_key;
            const pulse = isPlaying ? (1 + 0.07 * Math.sin(Date.now() / 280)) : 1;
            const size = COVER * cam.scale * hs * pf * pulse;
            const half = size / 2;

            item.screenX = sx; item.screenY = sy; item.screenHalf = half;

            if (sx+half < 0 || sx-half > lw() || sy+half < 0 || sy-half > lh()) continue;

            const r = size * 0.12;
            const img = images[track.track_key];
            const isHov = hoveredItem === item;
            const isSeed = track.is_seed;
            const isFav = track.is_favorite;
            const isBridge = track.is_bridge;

            ctx.save();
            ctx.translate(sx, sy);
            if (isHov) { ctx.shadowColor='rgba(0,0,0,.8)'; ctx.shadowBlur=size*.4; ctx.shadowOffsetY=size*.06; }
            ctx.beginPath(); roundRect(ctx,-half,-half,size,size,r); ctx.clip();
            ctx.shadowBlur=0; ctx.shadowOffsetY=0;
            if (img) { ctx.drawImage(img,-half,-half,size,size); }
            else { ctx.fillStyle='#1a1a24'; ctx.fill(); }
            if (!isSeed && !isFav && !isHov) { ctx.fillStyle='rgba(0,0,0,.28)'; ctx.fillRect(-half,-half,size,size); }
            ctx.restore();

            const txtAlpha = Math.min(1, Math.max(0, (animT - 0.7) / 0.3));
            if (txtAlpha > 0) {
                const lblSz = Math.max(11, size * 0.14);
                const lblY = sy + half + 5;
                ctx.save();
                ctx.globalAlpha = txtAlpha;
                ctx.textAlign='center'; ctx.textBaseline='top';
                ctx.font=`600 ${lblSz}px -apple-system,sans-serif`;
                ctx.fillStyle=isHov?'#fff':'rgba(255,255,255,.82)';
                ctx.fillText(truncCached(ctx, track.title || track.track_name, size*1.1, track.track_key+'t'), sx, lblY);
                ctx.font=`${lblSz*.85}px -apple-system,sans-serif`;
                ctx.fillStyle=isHov?'rgba(255,255,255,.8)':'rgba(255,255,255,.45)';
                ctx.fillText(truncCached(ctx, track.artist, size*1.1, track.track_key+'a'), sx, lblY+lblSz+4);
                ctx.restore();
            }

            if (isPlaying) {
                ctx.save(); ctx.translate(sx, sy);
                ctx.beginPath(); roundRect(ctx, -half, -half, size, size, r); ctx.clip();
                ctx.fillStyle = 'rgba(0,0,0,0.42)';
                ctx.fillRect(-half, -half, size, size);
                const bw = size * 0.1;
                const bh = size * 0.35;
                const bx = size * 0.055;
                const br = bw * 0.45;
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                roundRect(ctx, -bx - bw, -bh/2, bw, bh, br); ctx.fill();
                roundRect(ctx,  bx,      -bh/2, bw, bh, br); ctx.fill();
                ctx.restore();
            }

            if (isPlaying || isFav || isHov) {
                ctx.save(); ctx.translate(sx,sy);
                ctx.beginPath(); roundRect(ctx,-half,-half,size,size,r);
                if (isPlaying) { ctx.strokeStyle='#4fc3f7'; ctx.lineWidth=Math.max(3,size*.07); ctx.shadowColor='#4fc3f7'; ctx.shadowBlur=size*(0.5 + 0.3 * Math.sin(Date.now() / 280)); }
                else if (isFav) { ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=Math.max(3,size*.065); ctx.shadowColor='rgba(255,255,255,.4)'; ctx.shadowBlur=isHov?size*.4:size*.2; }
                else if (isBridge) { ctx.strokeStyle='#4a9eff'; ctx.lineWidth=Math.max(2,size*.04); ctx.shadowColor='#4a9eff'; ctx.shadowBlur=isHov?size*.45:size*.2; }
                else { ctx.strokeStyle='rgba(255,255,255,.8)'; ctx.lineWidth=Math.max(1.5,size*.03); ctx.shadowColor='rgba(255,255,255,.35)'; ctx.shadowBlur=size*.25; }
                ctx.stroke(); ctx.restore();
            }
        }
    }

    const oldWrap = canvas.parentElement;
    const newWrap = oldWrap.cloneNode(false);
    newWrap.appendChild(canvas);
    oldWrap.parentElement.replaceChild(newWrap, oldWrap);

    function hitTest(mx, my) {
        const rect = canvas.getBoundingClientRect();
        const cx = mx - rect.left;
        const cy = my - rect.top;
        for (let i=grid.length-1; i>=0; i--) {
            const item = grid[i];
            const { screenX: sx, screenY: sy, screenHalf: half } = item;
            if (sx===undefined) continue;
            if (cx>=sx-half&&cx<=sx+half&&cy>=sy-half&&cy<=sy+half) return item;
        }
        return null;
    }

    const mapTooltip = document.getElementById('mapTooltip');

    // 뮤직맵 hover용 ··· 버튼 오버레이
    const mapDotsBtn = document.createElement('button');
    mapDotsBtn.className = 'track-dots-btn map-dots-btn';
    mapDotsBtn.innerHTML = '<span></span><span></span><span></span>';
    mapDotsBtn.style.display = 'none';
    document.body.appendChild(mapDotsBtn);
    let mapDotsTarget = null;

    function updateMapDotsBtn(item) {
        if (!item) {
            mapDotsBtn.style.display = 'none';
            mapDotsTarget = null;
            return;
        }
        const { screenX: sx, screenY: sy, screenHalf: half } = item;
        if (sx === undefined || half === undefined) { mapDotsBtn.style.display = 'none'; return; }
        const rect = canvas.getBoundingClientRect();
        mapDotsTarget = item.track;
        mapDotsBtn.style.display = 'flex';
        mapDotsBtn.style.left = Math.round(rect.left + sx + half - 26) + 'px';
        mapDotsBtn.style.top  = Math.round(rect.top  + sy - half + 4) + 'px';
    }

    mapDotsBtn.onclick = (e) => {
        e.stopPropagation();
        if (mapDotsTarget) openMapTrackMenu(mapDotsTarget, mapDotsBtn.getBoundingClientRect().left + 14, mapDotsBtn.getBoundingClientRect().top);
    };

    const onMapDestroy = () => { mapDotsBtn.remove(); };

    const onMouseMove = e => {
        if (!isDragging) return;
        velocity={x:e.clientX-lastDragPos.x, y:e.clientY-lastDragPos.y};
        lastDragPos={x:e.clientX,y:e.clientY};
        cam.tx=camStart.x+(e.clientX-dragStart.x);
        cam.ty=camStart.y+(e.clientY-dragStart.y);
    };
    const onResize = () => {
        const d = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * d;
        canvas.height = window.innerHeight * d;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.scale(d, d);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    new MutationObserver(() => {
        if (!document.contains(newWrap)) {
            destroyed = true;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('resize', onResize);
            onMapDestroy();
        }
    }).observe(document.getElementById('mapView'), { childList: true, subtree: true });

    newWrap.addEventListener('mousemove', e => {
        mousePos = { x: e.clientX, y: e.clientY };
        if (isDragging) { hoveredItem=null; newWrap.style.cursor='grabbing'; if (mapTooltip) mapTooltip.style.display='none'; updateMapDotsBtn(null); return; }
        const item=hitTest(e.clientX,e.clientY);
        hoveredItem=item;
        updateMapDotsBtn(item);
        newWrap.style.cursor=item?'pointer':'grab';
        if (mapTooltip) {
            if (item && !item.track.is_seed) {
                const t = item.track;
                let html = '';
                if (t.is_bridge && t.bridge_seed_a && t.bridge_seed_b) {
                    const a = t.bridge_seed_a, b = t.bridge_seed_b;
                    html = `<span style="color:#4a9eff;font-size:10px;letter-spacing:.05em">◆ 브릿지</span><br>`
                         + `<b>${a.title || a.key}</b> <span style="color:rgba(255,255,255,.45);font-size:10px">${a.artist || ''}</span> <span style="color:#4a9eff;font-size:10px">${(a.sim*100).toFixed(0)}%</span><br>`
                         + `<b>${b.title || b.key}</b> <span style="color:rgba(255,255,255,.45);font-size:10px">${b.artist || ''}</span> <span style="color:#4a9eff;font-size:10px">${(b.sim*100).toFixed(0)}%</span>`;
                }
                if (html) { mapTooltip.innerHTML=html; mapTooltip.style.left=(e.clientX+14)+'px'; mapTooltip.style.top=(e.clientY-10)+'px'; mapTooltip.style.display='block'; }
                else mapTooltip.style.display='none';
            } else mapTooltip.style.display='none';
        }
    });
    newWrap.addEventListener('mouseleave', () => { mousePos={x:-1,y:-1}; if (mapTooltip) mapTooltip.style.display='none'; updateMapDotsBtn(null); });
    newWrap.addEventListener('mousedown', e => {
        isDragging=true; dragStart={x:e.clientX,y:e.clientY}; camStart={x:cam.tx,y:cam.ty};
        lastDragPos={x:e.clientX,y:e.clientY}; velocity={x:0,y:0};
        newWrap.style.cursor='grabbing';
        selectedItem=null;
    });
    window.addEventListener('mouseup', e => {
        if (!isDragging) return;
        const moved=Math.abs(e.clientX-dragStart.x)>4||Math.abs(e.clientY-dragStart.y)>4;
        isDragging=false; newWrap.style.cursor='grab';
        if (!moved) {
            velocity={x:0,y:0};
            const item=hitTest(e.clientX,e.clientY);
            if (item) {
                if (playerCurrentTrack && playerCurrentTrack.track_key === item.track.track_key) {
                    playerTogglePlayPause();
                } else {
                    cam.tx = lw()/2 - item.px*cam.scale;
                    cam.ty = lh()/2 - item.py*cam.scale;
                }
            }
            selectedItem = null;
            if (window._closeMapSearchIfOpen) window._closeMapSearchIfOpen();
        }
    });
    newWrap.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100);
        const f = 1 - delta * 0.0008;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * f));
        const sf = newScale / cam.scale;
        cam.tx=e.clientX-(e.clientX-cam.tx)*sf; cam.ty=e.clientY-(e.clientY-cam.ty)*sf;
        cam.x=e.clientX-(e.clientX-cam.x)*sf; cam.y=e.clientY-(e.clientY-cam.y)*sf;
        cam.scale=newScale;
        clampCam();
    },{passive:false});
    newWrap.addEventListener('dblclick', e => {
        const item=hitTest(e.clientX,e.clientY);
        if (!item) return;
        const flash = document.createElement('div');
        flash.style.cssText = `position:fixed;left:${item.screenX}px;top:${item.screenY}px;transform:translate(-50%,-50%) scale(0.6);width:56px;height:56px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:999;transition:transform .18s ease,opacity .3s ease;`;
        flash.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" fill="white"><polygon points="6,3 19,11 6,19"/></svg>';
        document.body.appendChild(flash);
        requestAnimationFrame(() => {
            flash.style.transform = 'translate(-50%,-50%) scale(1)';
            flash.style.opacity = '1';
        });
        setTimeout(() => {
            flash.style.opacity = '0';
            flash.style.transform = 'translate(-50%,-50%) scale(1.3)';
            setTimeout(() => flash.remove(), 300);
        }, 350);
        openTrackOnYouTube(item.track);
    });

    // 터치 이벤트
    let touchStartX = 0, touchStartY = 0, touchCamX = 0, touchCamY = 0;
    let lastTouchDist = 0, pinching = false;
    let touchMoved = false;

    newWrap.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchCamX = cam.tx; touchCamY = cam.ty;
            touchMoved = false;
            velocity = { x: 0, y: 0 };
            pinching = false;
        } else if (e.touches.length === 2) {
            pinching = true;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDist = Math.sqrt(dx*dx + dy*dy);
        }
    }, { passive: true });

    newWrap.addEventListener('touchmove', e => {
        e.preventDefault();
        if (e.touches.length === 1 && !pinching) {
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) touchMoved = true;
            velocity = { x: e.touches[0].clientX - (touchStartX + (cam.tx - touchCamX)), y: e.touches[0].clientY - (touchStartY + (cam.ty - touchCamY)) };
            cam.tx = touchCamX + dx;
            cam.ty = touchCamY + dy;
            clampCam();
        } else if (e.touches.length === 2 && pinching) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const scale = dist / lastTouchDist;
            const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * scale));
            const sf = newScale / cam.scale;
            cam.tx = mx - (mx - cam.tx) * sf;
            cam.ty = my - (my - cam.ty) * sf;
            cam.x = mx - (mx - cam.x) * sf;
            cam.y = my - (my - cam.y) * sf;
            cam.scale = newScale;
            lastTouchDist = dist;
            clampCam();
        }
    }, { passive: false });

    newWrap.addEventListener('touchend', e => {
        if (!touchMoved && !pinching && e.changedTouches.length === 1) {
            velocity = { x: 0, y: 0 };
            const item = hitTest(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            if (item) {
                if (playerCurrentTrack && playerCurrentTrack.track_key === item.track.track_key) {
                    playerTogglePlayPause();
                } else {
                    openTrackOnYouTube(item.track);
                }
            }
            if (window._closeMapSearchIfOpen) window._closeMapSearchIfOpen();
        }
        pinching = false;
    }, { passive: true });
}

function playerMoveCamToTrack(trackKey) {
    if (!lastMapData) return;
    const tracks = lastMapData.tracks;
    const target = tracks.find(t => t.track_key === trackKey);
    if (!target) return;

    const COVER = 140, GAP = 50, LABEL_H = 42;
    const STEP = COVER + GAP;
    const VSTEP = COVER + LABEL_H + GAP;

    const maxCol = Math.max(...tracks.map(t => t.grid_col ?? t.x ?? 0));
    const maxRow = Math.max(...tracks.map(t => t.grid_row ?? t.y ?? 0));

    const col = target.grid_col ?? target.x ?? 0;
    const row = target.grid_row ?? target.y ?? 0;
    const px = col * STEP - maxCol * STEP / 2;
    const py = row * VSTEP - maxRow * VSTEP / 2;

    window.mapCamTarget = { px, py, trackKey };
}

// ===== Map Rebuild Animation =====
function showMapRebuildAnimation(coverUrls) {
    const overlay = document.createElement('div');
    overlay.className = 'map-rebuild-overlay';

    const msg = document.createElement('div');
    msg.className = 'map-rebuild-msg';
    msg.textContent = '취향 지도를 다시 그리는 중...';
    overlay.appendChild(msg);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('visible');
        setTimeout(() => { msg.style.opacity = '1'; }, 300);
    });

    const W = window.innerWidth, H = window.innerHeight;
    const PADDING = 40;
    const urls = coverUrls.length > 0 ? coverUrls : [];
    if (urls.length === 0) {
        return {
            finish() {
                msg.style.opacity = '0';
                overlay.classList.remove('visible');
                setTimeout(() => overlay.remove(), 400);
            }
        };
    }

    const count = Math.min(urls.length * 3, 80);
    const cols = Math.ceil(Math.sqrt(count * (W / H)));
    const rows = Math.ceil(count / cols);
    const cellW = (W - PADDING * 2) / cols;
    const cellH = (H - PADDING * 2) / rows;
    const SIZE = Math.floor(Math.min(cellW, cellH) * 0.82);
    const GAP_X = (W - PADDING * 2 - cols * SIZE) / Math.max(cols - 1, 1);
    const GAP_Y = (H - PADDING * 2 - rows * SIZE) / Math.max(rows - 1, 1);

    const imgs = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = (r * cols + c) % urls.length;
            const img = document.createElement('img');
            img.className = 'map-rebuild-cover';
            img.style.width = SIZE + 'px';
            img.style.height = SIZE + 'px';
            img.style.left = (PADDING + c * (SIZE + GAP_X)) + 'px';
            img.style.top  = (PADDING + r * (SIZE + GAP_Y)) + 'px';
            img.src = urls[idx];
            overlay.appendChild(img);
            imgs.push({ el: img, row: r, col: c });
        }
    }

    imgs.forEach(({ el, row, col }) => {
        const delay = (row + col) * 60;
        setTimeout(() => { el.classList.add('visible'); }, 300 + delay);
    });

    return {
        finish() {
            msg.style.opacity = '0';
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 400);
        }
    };
}

// ===== Map Intro =====
function showMapIntro() {
    const overlay = document.getElementById('mapIntroOverlay');
    const scroller = document.getElementById('mapIntroScrollOuter');
    const canvas = document.getElementById('mapIntroCanvas');
    if (!overlay || !canvas) { mapIntroShown = true; showMusicMap(); return; }

    overlay.style.display = 'block';
    overlay.scrollTop = 0;

    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const BASE = 'https://yxihvsnrszafmluyjqke.supabase.co/storage/v1/object/public/new_cover_image/';

    const CLUSTERS = [
        {
            cx: 0.18, cy: 0.28,
            tracks: [
                {seed:true,  url:'0sf12qNH5qcw8qpgymFOqD', title:'Blinding Lights',   artist:'The Weeknd',    dx:0,    dy:0},
                {seed:false, url:'1A6OTy97kk0mMdm78rHsm8', title:'Sunflower',          artist:'Post Malone',   dx:-72,  dy:60},
                {seed:false, url:'1niP7DB1WHgskkr8LrRjXS', title:'Mood',               artist:'24kGoldn',      dx:68,   dy:52},
                {seed:false, url:'2Pner0zYKaSPQ3YeYYXdup', title:'INDUSTRY BABY',      artist:'Lil Nas X',     dx:-58,  dy:-58},
                {seed:false, url:'1rgnBhdG2JDFTbYkYRZAku', title:'Dance Monkey',       artist:'Tones And I',   dx:62,   dy:-50},
                {seed:false, url:'463CkQjx2Zk1yXoBuierM9', title:'Levitating',         artist:'Dua Lipa',      dx:10,   dy:-72},
            ]
        },
        {
            cx: 0.78, cy: 0.22,
            tracks: [
                {seed:true,  url:'2QfznFotJNZmnIEYFdzE5T', title:'Heartbreak Anniversary', artist:'GIVĒON',     dx:0,    dy:0},
                {seed:false, url:'0tziUvXJBqjdmV8gWxOjfV', title:'Love Songs',         artist:'Kaash Paige',   dx:-70,  dy:55},
                {seed:false, url:'3fX3N9yUo3hNatc2BbJDLs', title:'Who Hurt You?',      artist:'Daniel Caesar', dx:65,   dy:48},
                {seed:false, url:'6N3qHjcwly8ZuhE4bPYJAX', title:'Get You',            artist:'Daniel Caesar', dx:-60,  dy:-55},
                {seed:false, url:'3f3cliOygeuUpGRwdohy12', title:'Comfortable',        artist:'H.E.R.',        dx:58,   dy:-60},
                {seed:false, url:'47isJpIIO8m7BJEhiFhnaf', title:'double take',         artist:'Dhruv',         dx:5,    dy:72},
            ]
        },
        {
            cx: 0.50, cy: 0.60,
            tracks: [
                {seed:true,  url:'1Qrg8KqiBpW07V7PNxwwwL', title:'Kill Bill',          artist:'SZA',           dx:0,    dy:0},
                {seed:false, url:'6dOtVTDdiauQNBQEDOtlAB', title:'BIRDS OF A FEATHER', artist:'Billie Eilish', dx:-72,  dy:50},
                {seed:false, url:'4pryE6cN2gFL1FVF5fYINl', title:'Leave The Door Open',artist:'Bruno Mars',    dx:68,   dy:45},
                {seed:false, url:'09mC49exdvPmL1y7tusWhd', title:'like JENNIE',        artist:'jen',           dx:0,    dy:-70},
                {seed:false, url:'3xVZYkcuWalGudeKl861wb', title:'Smokin Out The Window',artist:'Bruno Mars',  dx:-65,  dy:-52},
                {seed:false, url:'7ne4VBA60CxGM75vw0EYad', title:"That's So True",     artist:'Gracie Abrams', dx:60,   dy:-58},
            ]
        },
        {
            cx: 0.20, cy: 0.76,
            tracks: [
                {seed:true,  url:'4BSluGpjdLQihMmKgHXMxp', title:'홀로',               artist:'이하이',        dx:0,    dy:0},
                {seed:false, url:'6FZAc2XaVYc8G8jaDnBshv', title:'비도 오고 그래서',    artist:'헤이즈',        dx:-70,  dy:52},
                {seed:false, url:'1Zv6zo71iDXH07Lin7hxMg', title:'널 너무 모르고',      artist:'헤이즈',        dx:65,   dy:48},
                {seed:false, url:'5i6gHFXg4aLK5xvc2jJJC5', title:'너였다면',           artist:'정승환',        dx:-55,  dy:-58},
                {seed:false, url:'3P3UA61WRQqwCXaoFOTENd', title:'밤편지',             artist:'아이유',        dx:60,   dy:-55},
                {seed:false, url:'3uFDwY5EPKxnVhfjKHhnCP', title:'밤이 되니까',         artist:'펀치',          dx:5,    dy:-75},
            ]
        },
        {
            cx: 0.80, cy: 0.78,
            tracks: [
                {seed:true,  url:'7saJl9V0kRYGWuyeURHYNU', title:'양화대교',           artist:'Zion.T',        dx:0,    dy:0},
                {seed:false, url:'0THW04vlFAkfflASMFam0t', title:'잊어버리지마',        artist:'Crush',         dx:-72,  dy:50},
                {seed:false, url:'3yUNSNlU0h7ag5DTABjr2a', title:'가끔',               artist:'Crush',         dx:65,   dy:52},
                {seed:false, url:'09Nhl3YQnChjlq8WmJz7FS', title:'꺼내 먹어요',        artist:'Zion.T',        dx:-58,  dy:-55},
                {seed:false, url:'2TfsNTyC4uuamXBZJnU0ga', title:'Nerdy Love',         artist:'pH-1',          dx:62,   dy:-58},
                {seed:false, url:'06ZjtFrSVuESKVe9bnZrNp', title:'바라봐줘요',         artist:'죠지',          dx:5,    dy:72},
            ]
        },
    ];

    const nodes = [];
    const imgCache = {};

    CLUSTERS.forEach((cl, ci) => {
        const cx = cl.cx * W, cy = cl.cy * H;
        cl.tracks.forEach(t => {
            nodes.push({
                x: cx + t.dx - W / 2,
                y: cy + t.dy - H / 2,
                size: t.seed ? 76 : 60,
                isSeed: t.seed,
                cluster: ci,
                coverUrl: BASE + t.url + '.webp',
                title: t.title,
                artist: t.artist,
            });
        });
    });

    nodes.forEach(n => {
        if (!n.coverUrl || imgCache[n.coverUrl] !== undefined) return;
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => { imgCache[n.coverUrl] = im; };
        im.onerror = () => { imgCache[n.coverUrl] = null; };
        im.src = n.coverUrl;
        imgCache[n.coverUrl] = im;
    });

    let focusIdx = 0;
    let pulseT = 0;
    let camX = 0, camY = 0, camScale = 1;
    let camTX = 0, camTY = 0, camTScale = 1;
    let introStep = 0;
    let jumpT = 0;
    let jumpTo = null;
    let destroyed = false;

    function focusOn(nodeIdx, scale) {
        const n = nodes[nodeIdx];
        camTX = -n.x * scale;
        camTY = -n.y * scale;
        camTScale = scale;
    }

    const centerSeedIdx = nodes.reduce((best, n, i) => {
        if (!n.isSeed) return best;
        const d = Math.sqrt(n.x * n.x + n.y * n.y);
        return d < (best.d ?? Infinity) ? { i, d } : best;
    }, {}).i ?? 0;

    camX = camTX = 0; camY = camTY = 0; camScale = camTScale = 1.0;

    function introRoundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
        ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
        ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
        ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
        ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
    }

    function drawIntro() {
        if (destroyed) return;
        requestAnimationFrame(drawIntro);
        if (overlay.style.display === 'none') return;

        camX += (camTX - camX) * 0.07;
        camY += (camTY - camY) * 0.07;
        camScale += (camTScale - camScale) * 0.07;
        pulseT += 0.04;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(camX + W/2, camY + H/2);
        ctx.scale(camScale, camScale);

        nodes.forEach((n, i) => {
            const isFocus = (i === focusIdx);
            const isJumpDest = (jumpTo && n === jumpTo);
            const pulse = (isFocus && introStep === 1) ? (1 + 0.07 * Math.sin(pulseT * 2)) : 1;
            const sz = n.size * pulse;
            const sx = n.x, sy = n.y;

            const ndx = sx / (W * 0.5), ndy = sy / (H * 0.5);
            const pf = Math.max(0.4, 1 - Math.sqrt(ndx*ndx + ndy*ndy) * 0.35);
            const finalSz = sz * pf;
            const fhalf = finalSz / 2;
            const fr = finalSz * 0.12;

            ctx.save();
            ctx.translate(sx, sy);

            if (isFocus || n.isSeed) {
                ctx.shadowColor = 'rgba(255,255,255,.5)';
                ctx.shadowBlur = isFocus ? finalSz * 0.8 : finalSz * 0.3;
            }
            if (isJumpDest && jumpT > 0.5) {
                ctx.shadowColor = 'rgba(255,255,255,.5)';
                ctx.shadowBlur = finalSz * 1.0 * (jumpT - 0.5) * 2;
            }

            ctx.beginPath(); introRoundRect(-fhalf, -fhalf, finalSz, finalSz, fr); ctx.clip();
            ctx.shadowBlur = 0;
            const im = n.coverUrl ? imgCache[n.coverUrl] : null;
            if (im && im.complete && im.naturalWidth > 0) {
                ctx.drawImage(im, -fhalf, -fhalf, finalSz, finalSz);
            } else {
                ctx.fillStyle = '#1a1a24'; ctx.fill();
            }
            if (!n.isSeed && !isFocus) {
                ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-fhalf, -fhalf, finalSz, finalSz);
            }
            ctx.restore();

            if (isFocus && n.title) {
                const lblSz = Math.max(11, finalSz * 0.14);
                ctx.save();
                ctx.translate(sx, sy);
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.font = `600 ${lblSz}px -apple-system,sans-serif`;
                ctx.fillStyle = '#fff';
                ctx.fillText(n.title, 0, fhalf + 6);
                ctx.font = `${lblSz * 0.85}px -apple-system,sans-serif`;
                ctx.fillStyle = 'rgba(255,255,255,.55)';
                ctx.fillText(n.artist || '', 0, fhalf + 6 + lblSz + 3);
                ctx.restore();
            }

            if (n.isSeed || isFocus) {
                ctx.save(); ctx.translate(sx, sy);
                ctx.beginPath(); introRoundRect(-fhalf, -fhalf, finalSz, finalSz, fr);
                ctx.strokeStyle = 'rgba(255,255,255,.9)';
                ctx.lineWidth = isFocus ? Math.max(3, finalSz * 0.065) : Math.max(2, finalSz * 0.045);
                ctx.shadowColor = 'rgba(255,255,255,.4)';
                ctx.shadowBlur = isFocus ? finalSz * 0.55 : finalSz * 0.25;
                ctx.stroke(); ctx.restore();
            }

            if (isFocus && introStep === 1) {
                ctx.save(); ctx.translate(sx, sy);
                ctx.fillStyle = 'rgba(255,255,255,.9)';
                const ps = finalSz * 0.22;
                ctx.beginPath();
                ctx.moveTo(-ps*0.4, -ps*0.6); ctx.lineTo(ps*0.8, 0); ctx.lineTo(-ps*0.4, ps*0.6);
                ctx.closePath(); ctx.fill(); ctx.restore();
            }
        });

        ctx.restore();
    }
    requestAnimationFrame(drawIntro);

    const panels = [0,1,2,3,4].map(i => document.getElementById('mapIntroPanel' + i));

    function showPanel(idx) {
        panels.forEach((p, i) => {
            if (!p) return;
            if (i === idx) { p.classList.remove('hidden'); }
            else { p.classList.add('hidden'); }
        });
        introStep = idx;
    }
    showPanel(0);

    const STEPS = 5;
    let lastStep = -1;

    function onIntroScroll() {
        const max = scroller.scrollHeight - H;
        const progress = max > 0 ? overlay.scrollTop / max : 0;
        const step = Math.min(STEPS - 1, Math.floor(progress * STEPS));

        if (step === lastStep) return;
        lastStep = step;
        showPanel(step);

        if (step === 0) {
            camTX = 0; camTY = 0; camTScale = 1.0;
            focusIdx = -1;
        } else if (step === 1) {
            focusIdx = centerSeedIdx;
            focusOn(centerSeedIdx, 1.6);
        } else if (step === 2) {
            const base = nodes[centerSeedIdx];
            let bestIdx = -1, bestDist = Infinity;
            nodes.forEach((n, i) => {
                if (i === centerSeedIdx) return;
                const dx = n.x - base.x, dy = n.y - base.y;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            });
            focusIdx = bestIdx >= 0 ? bestIdx : centerSeedIdx;
            focusOn(focusIdx, 1.6);
        } else if (step === 3) {
            const base = nodes[centerSeedIdx];
            let bestIdx = -1, bestDist = 0;
            nodes.forEach((n, i) => {
                const dx = n.x - base.x, dy = n.y - base.y;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d > bestDist) { bestDist = d; bestIdx = i; }
            });
            jumpTo = nodes[bestIdx];
            jumpT = 0;
            camTX = -(nodes[centerSeedIdx].x + (jumpTo.x - nodes[centerSeedIdx].x) * 0.5) * 0.55;
            camTY = -(nodes[centerSeedIdx].y + (jumpTo.y - nodes[centerSeedIdx].y) * 0.5) * 0.55;
            camTScale = 0.55;
            setTimeout(() => {
                focusIdx = bestIdx;
                focusOn(bestIdx, 1.6);
                jumpT = 1;
            }, 800);
        } else if (step === 4) {
            focusIdx = -1;
            camTX = 0; camTY = 0; camTScale = 1.0;
        }
    }

    overlay.addEventListener('scroll', onIntroScroll, { passive: true });

    const closeIntro = () => {
        destroyed = true;
        overlay.removeEventListener('scroll', onIntroScroll);
        overlay.style.display = 'none';
        mapIntroShown = true;
        showMusicMap();
    };

    const startBtn = document.getElementById('mapIntroStartBtn');
    if (startBtn) startBtn.onclick = closeIntro;

    const closeBtn = document.getElementById('mapIntroCloseBtn');
    if (closeBtn) closeBtn.onclick = closeIntro;
}

// ===== Map Search Overlay =====
(function initMapSearch() {
    const API = 'https://api.caromusic.kr';
    let debounce = null;
    let selectedKey = null;
    let history = [];
    let favKeys = new Set();

    function syncFavKeys() {
        if (typeof lastFavorites !== 'undefined') {
            favKeys = new Set(lastFavorites.map(f => f.track_key));
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('mapSearchInput');
        const results = document.getElementById('mapSearchResults');
        const status = document.getElementById('mapSearchStatus');

        if (!input) return;

        input.addEventListener('input', () => {
            clearTimeout(debounce);
            const q = input.value.trim();
            if (!q) { results.innerHTML = ''; status.textContent = ''; selectedKey = null; history = []; return; }
            debounce = setTimeout(() => mapSearch(q), 280);
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { clearTimeout(debounce); const q = input.value.trim(); if (q) mapSearch(q); }
            if (e.key === 'Escape') closeMapSearch();
        });

        window._closeMapSearchIfOpen = () => {
            if (results.children.length > 0) closeMapSearch();
        };

        function closeMapSearch() {
            input.value = '';
            results.innerHTML = '';
            if (status) status.textContent = '';
            selectedKey = null; history = [];
            input.blur();
        }
    });

    async function mapSearch(q) {
        const results = document.getElementById('mapSearchResults');
        const status = document.getElementById('mapSearchStatus');
        status.textContent = '검색 중...';
        results.innerHTML = '';
        selectedKey = null; history = [];
        try {
            const res = await fetch(`${API}/search-songs`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q })
            });
            const data = await res.json();
            if (!data.results?.length) { status.textContent = '결과 없음'; return; }
            status.textContent = '';
            syncFavKeys();
            data.results.slice(0, 5).forEach(track => results.appendChild(createItem(track)));
        } catch(e) { status.textContent = '검색 실패'; }
    }

    function renderResults(tracks, seedTrack) {
        const results = document.getElementById('mapSearchResults');
        results.innerHTML = '';

        const seedEl = createItem(seedTrack);
        seedEl.classList.add('seed');
        results.appendChild(seedEl);

        const div = document.createElement('div');
        div.className = 'map-result-divider';
        div.textContent = '이 곡과 비슷한 음악';
        results.appendChild(div);

        tracks.forEach(track => results.appendChild(createItem(track)));
    }

    function createItem(track) {
        const item = document.createElement('div');
        item.className = 'map-result-item' + (track.track_key === selectedKey ? ' selected' : '');

        const cover = document.createElement('div');
        cover.className = 'map-result-cover';
        if (track.cover_image_url) {
            const img = document.createElement('img');
            img.src = track.cover_image_url;
            img.alt = '';
            cover.appendChild(img);
        } else { cover.textContent = '♪'; }

        const info = document.createElement('div');
        info.className = 'map-result-info';
        info.innerHTML = `<div class="map-result-title">${track.title || track.track || ''}</div><div class="map-result-artist">${track.artist || ''}</div>`;

        const actions = document.createElement('div');
        actions.className = 'map-result-actions';

        const heart = document.createElement('button');
        heart.className = 'map-result-heart' + (favKeys.has(track.track_key) ? ' active' : '');
        heart.textContent = favKeys.has(track.track_key) ? '♥' : '♡';
        heart.onclick = async e => {
            e.stopPropagation();
            const token = authToken;
            if (!token) { alert('로그인이 필요합니다.'); return; }
            const isFav = favKeys.has(track.track_key);
            try {
                await fetch(`${API}/favorites`, {
                    method: isFav ? 'DELETE' : 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ track_key: track.track_key })
                });
                if (isFav) { favKeys.delete(track.track_key); heart.className = 'map-result-heart'; heart.textContent = '♡'; }
                else { favKeys.add(track.track_key); heart.className = 'map-result-heart active'; heart.textContent = '♥'; }
                if (typeof lastFavorites !== 'undefined') {
                    if (isFav) lastFavorites = lastFavorites.filter(f => f.track_key !== track.track_key);
                    else lastFavorites.push({ track_key: track.track_key, title: track.title || track.track, artist: track.artist });
                }
            } catch(e) { alert('찜 처리 실패'); }
        };

        const play = document.createElement('button');
        play.className = 'map-result-play';
        play.textContent = '▶';
        play.title = 'YouTube';
        play.onclick = e => {
            e.stopPropagation();
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent((track.title || track.track) + ' ' + track.artist)}`, '_blank');
        };

        actions.appendChild(heart);
        actions.appendChild(play);
        item.appendChild(cover);
        item.appendChild(info);
        item.appendChild(actions);

        item.onclick = () => onItemClick(track, item);
        return item;
    }

    async function onItemClick(track, itemEl) {
        document.querySelectorAll('.map-result-item').forEach(el => el.classList.remove('selected'));
        itemEl.classList.add('selected');
        selectedKey = track.track_key;
        history.push(track.track_key);

        const status = document.getElementById('mapSearchStatus');
        status.textContent = '추천 로드 중...';
        try {
            const res = await fetch(`${API}/recommend`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ track_keys: history.slice(-10), num_recommendations: 42, exclude_track_keys: history })
            });
            const data = await res.json();
            if (!data.recommendations?.length) throw new Error('empty');
            status.textContent = '';
            syncFavKeys();
            renderResults(data.recommendations, track);
        } catch(e) {
            try {
                const res2 = await fetch(`${API}/find-similar-tracks`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ track_key: track.track_key, num_recommendations: 42 })
                });
                const data2 = await res2.json();
                if (data2.recommendations?.length) {
                    status.textContent = '';
                    syncFavKeys();
                    renderResults(data2.recommendations, track);
                } else { status.textContent = '추천 결과 없음'; }
            } catch(e2) { status.textContent = '추천 실패'; }
        }
    }
})();
