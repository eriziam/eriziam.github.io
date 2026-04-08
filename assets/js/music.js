const songs = [
    { file: "Beemka Metalik.mp3", title: "Beemka Metalik", eq: "metal" },
    { file: "Bermuda Triangle.mp3", title: "Bermuda Triangle", eq: "pop" },
    { file: "Don\u2019t Let Go.mp3", title: "Don't Let Go", eq: "pop" },
    { file: "Gumisiowy Sok.mp3", title: "Gumisiowy Sok", eq: "synthwave" },
    { file: "Heartbreak is mean.mp3", title: "Heartbreak is mean", eq: "lofi" },
    { file: "Kr\u00f3lowie bez ruch\u00f3w.mp3", title: "Królowie bez ruchów", eq: "pop" },
    { file: "London Rain.mp3", title: "London Rain", eq: "lofi" },
    { file: "Lodowaty Monster.mp3", title: "Lodowaty Monster", eq: "ambient" },
    { file: "Midnight Highway.mp3", title: "Midnight Highway", eq: "metal" },
    { file: "Ni Hao Neon.mp3", title: "Ni Hao Neon", eq: "synthwave" },
    { file: "Ohne Erwachen.mp3", title: "Ohne Erwachen", eq: "metal" },
    { file: "Paper Planes.mp3", title: "Paper Planes", eq: "pop" },
    { file: "Precious You\u2019re Safe.mp3", title: "Precious You're Safe", eq: "ambient" },
    { file: "Red Light Fugue.mp3", title: "Red Light Fugue", eq: "electronic" },
    { file: "Sunlight Reflection.mp3", title: "Sunlight Reflection", eq: "ambient" },
    { file: "Think about tomorrow.mp3", title: "Think about tomorrow", eq: "lofi" },
    { file: "Train No Destination.mp3", title: "Train No Destination", eq: "lofi" },
    { file: "Hoppity HOP Bounce.mp3", title: "Hoppity HOP Bounce", eq: "phonk" },
    { file: "Makka Pakka 37 Kilos.mp3", title: "Makka Pakka 37 Kilos", eq: "phonk" },
    { file: "Monster Chilled.mp3", title: "Monster Chilled", eq: "phonk" },
    { file: "Tires Screechin.mp3", title: "Tires Screechin", eq: "electronic" },
    { file: "Two A.M. Neckhold.mp3", title: "Two A.M. Neckhold", eq: "rock" }
];

const CORRECT_PASSWORD = "eriz2025";
const STORAGE_KEY = "music_vault_rankings";
const PASSWORD_KEY = "music_vault_auth";
const GENRES_KEY = "music_vault_genres";
const PLAYS_KEY = "music_vault_plays";
const FAVES_KEY = "music_vault_faves";
const QUEUE_KEY = "music_vault_queue";
const RECENT_KEY = "music_vault_recent";

let currentIndex = -1;
let isPlaying = false;
let isLooping = false;
let isShuffling = false;
let rankings = [];
let genres = {};
let playCounts = {};
let activeFilter = "all";
let sortBy = "default";
let queue = [];
let recentPlays = [];
let favorites = new Set();
let currentEq = "flat";

const audio = document.getElementById("audio");
const gate = document.getElementById("gate");
const app = document.getElementById("app");
const playlistEl = document.getElementById("playlist");
const rankingEl = document.getElementById("ranking-list");
const playBtn = document.getElementById("play-btn");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const loopBtn = document.getElementById("loop-btn");
const queueBtn = document.getElementById("queue-btn");
const currentTitle = document.getElementById("current-title");
const currentStatus = document.getElementById("current-status");
const currentTimeEl = document.getElementById("current-time");
const durationEl = document.getElementById("duration");
const progressFill = document.getElementById("progress-fill");
const progressBar = document.getElementById("progress-bar");
const volumeSlider = document.getElementById("volume");
const trackCount = document.getElementById("track-count");
const genreFilterEl = document.getElementById("genre-filter");

// EQ presets
const eqPresets = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pop: [-1, 1, 3, 4, 3, 1, -1, -1, -1, -1],
    rock: [3, 2, 1, 0, -1, 0, 1, 2, 3, 3],
    lofi: [-2, -1, 0, 1, 2, 2, 1, 0, -1, -2],
    ambient: [-2, -2, -1, 0, 1, 2, 3, 3, 2, 1],
    metal: [4, 3, 1, 0, -2, -1, 0, 1, 2, 3],
    synthwave: [2, 3, 1, -1, -2, -1, 0, 2, 4, 3],
    electronic: [3, 2, 0, -1, -2, -1, 0, 2, 3, 3]
};

function checkAuth() {
    const savedAuth = localStorage.getItem(PASSWORD_KEY);
    if (savedAuth === CORRECT_PASSWORD) {
        gate.classList.add("hidden");
        app.classList.remove("hidden");
        initApp();
    }
}

checkAuth();

document.getElementById("gate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("password");
    const error = document.getElementById("gate-error");
    if (input.value === CORRECT_PASSWORD) {
        localStorage.setItem(PASSWORD_KEY, CORRECT_PASSWORD);
        error.classList.remove("visible");
        gate.classList.add("hidden");
        app.classList.remove("hidden");
        initApp();
    } else {
        error.classList.add("visible");
        input.value = "";
    }
});

function sanitizeKey(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
}

async function loadGenres() {
    const saved = localStorage.getItem(GENRES_KEY);
    if (saved) {
        genres = JSON.parse(saved);
    } else {
        try {
            const res = await fetch("music/genres.txt");
            const text = await res.text();
            genres = parseGenres(text);
            localStorage.setItem(GENRES_KEY, JSON.stringify(genres));
        } catch (e) {
            console.log("Could not load genres file");
            genres = {};
        }
    }
}

function parseGenres(text) {
    const result = {};
    const lines = text.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        let title = trimmed.substring(0, eqIdx).trim();
        const genreStr = trimmed.substring(eqIdx + 1).trim();
        const genreList = genreStr.split(",").map(g => g.trim()).filter(g => g);
        
        // Normalize title: remove .mp3, fix special chars to match song titles
        title = title.replace(/\.mp3$/i, "").replace(/'/g, "'").replace(/"/g, '"');
        
        // Also try adding the original title as-is for keys without special chars
        result[title] = genreList;
    }
    return result;
}

function getSongGenres(title) {
    return genres[title] || [];
}

function getAllGenres() {
    const genreSet = new Set();
    for (const title in genres) {
        genres[title].forEach(g => genreSet.add(g));
    }
    return Array.from(genreSet).sort();
}

function filterSongsByGenre(genre) {
    if (genre === "all") return songs;
    if (genre === "favorites") return songs.filter(s => favorites.has(s.title));
    if (genre === "recent") return recentPlays.map(t => songs.find(s => s.title === t)).filter(Boolean);
    return songs.filter(s => getSongGenres(s.title).includes(genre));
}

function sortSongs(songList) {
    if (sortBy === "plays") {
        return [...songList].sort((a, b) => (playCounts[b.title] || 0) - (playCounts[a.title] || 0));
    }
    if (sortBy === "title") {
        return [...songList].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortBy === "ranking") {
        const ranked = [...songList].sort((a, b) => {
            const aRank = rankings.find(r => r.title === a.title)?.rank || 999;
            const bRank = rankings.find(r => r.title === b.title)?.rank || 999;
            return aRank - bRank;
        });
        return ranked;
    }
    return songList;
}

function getFilteredSongs() {
    return sortSongs(filterSongsByGenre(activeFilter));
}

async function initApp() {
    await loadGenres();
    loadPlayCounts();
    loadUserData();
    renderGenreFilter();
    loadRankings();
    renderPlaylist();
    renderRanking();
    updateQueueDisplay();
    trackCount.textContent = `${getFilteredSongs().length} tracks`;
    setupViewNav();
    setupEqualizer();
    audio.volume = 0.7;
}

function loadUserData() {
    const savedFaves = localStorage.getItem(FAVES_KEY);
    if (savedFaves) favorites = new Set(JSON.parse(savedFaves));
    
    const savedQueue = localStorage.getItem(QUEUE_KEY);
    if (savedQueue) queue = JSON.parse(savedQueue);
    
    const savedRecent = localStorage.getItem(RECENT_KEY);
    if (savedRecent) recentPlays = JSON.parse(savedRecent);
}

function setupViewNav() {
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            item.classList.add("active");
            document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
            document.getElementById(`${view}-view`).classList.remove("hidden");
        });
    });
}

function setupEqualizer() {
    const eqBtns = document.querySelectorAll(".eq-btn");
    if (eqBtns.length === 0) {
        const nowPlayingSection = document.querySelector(".now-playing-section");
        if (nowPlayingSection) {
            const eqHtml = `
                <div class="eq-controls">
                    <button class="eq-btn active" data-eq="flat">Flat</button>
                    <button class="eq-btn" data-eq="pop">Pop</button>
                    <button class="eq-btn" data-eq="rock">Rock</button>
                    <button class="eq-btn" data-eq="lofi">Lo-Fi</button>
                    <button class="eq-btn" data-eq="ambient">Ambient</button>
                    <button class="eq-btn" data-eq="metal">Metal</button>
                </div>
            `;
            nowPlayingSection.insertAdjacentHTML("beforeend", eqHtml);
            
            document.querySelectorAll(".eq-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    currentEq = btn.dataset.eq;
                    document.querySelectorAll(".eq-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                });
            });
        }
    }
}

function renderGenreFilter() {
    const allGenres = getAllGenres();
    let html = `
        <button class="genre-btn active" data-genre="all">All</button>
        <button class="genre-btn" data-genre="favorites">Favorites</button>
        <button class="genre-btn" data-genre="recent">Recent</button>
        <button class="genre-btn" data-genre="plays">Top Played</button>
    `;
    for (const g of allGenres) {
        html += `<button class="genre-btn" data-genre="${g}">${g}</button>`;
    }
    html += `
        <div class="sort-controls">
            <label>Sort:</label>
            <select id="sort-select">
                <option value="default">Default</option>
                <option value="title">Title</option>
                <option value="plays">Most Plays</option>
                <option value="ranking">Your Rank</option>
            </select>
        </div>
    `;
    genreFilterEl.innerHTML = html;
    
    genreFilterEl.querySelectorAll(".genre-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            activeFilter = btn.dataset.genre;
            genreFilterEl.querySelectorAll(".genre-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderPlaylist();
            trackCount.textContent = `${getFilteredSongs().length} tracks`;
        });
    });
    
    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.addEventListener("change", () => {
            sortBy = sortSelect.value;
            renderPlaylist();
        });
    }
}

function renderPlaylist() {
    const filtered = getFilteredSongs();
    playlistEl.innerHTML = filtered.map((song, i) => {
        const songGenres = getSongGenres(song.title);
        const genreTags = songGenres.map(g => `<span class="genre-tag">${g}</span>`).join("");
        const playCount = playCounts[song.title] || 0;
        const isFav = favorites.has(song.title);
        const inQueue = queue.includes(song.title);
        return `
        <li data-index="${songs.indexOf(song)}" class="${songs.indexOf(song) === currentIndex ? 'active' : ''}" ondblclick="playTrack(${songs.indexOf(song)})">
            <span class="track-num">${i + 1}</span>
            <div class="track-info">
                <span class="track-title">${song.title}</span>
                <span class="track-genres">${genreTags}</span>
            </div>
            <span class="play-count">${playCount}</span>
            <button class="fav-btn ${isFav ? 'active' : ''}" data-title="${song.title}" title="Favorite">
                <i class="fas fa-heart"></i>
            </button>
            <button class="queue-btn ${inQueue ? 'active' : ''}" data-title="${song.title}" title="Add to Queue">
                <i class="fas fa-list"></i>
            </button>
            <button class="play-track" data-index="${songs.indexOf(song)}"><i class="fas fa-play"></i></button>
        </li>
    `;
    }).join("");

    playlistEl.querySelectorAll(".play-track").forEach(btn => {
        btn.addEventListener("click", () => playTrack(parseInt(btn.dataset.index)));
    });
    
    playlistEl.querySelectorAll(".fav-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(btn.dataset.title);
        });
    });
    
    playlistEl.querySelectorAll(".queue-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            addToQueue(btn.dataset.title);
        });
    });
}

function toggleFavorite(title) {
    if (favorites.has(title)) {
        favorites.delete(title);
    } else {
        favorites.add(title);
    }
    localStorage.setItem(FAVES_KEY, JSON.stringify([...favorites]));
    renderPlaylist();
}

function addToQueue(title) {
    if (!queue.includes(title)) {
        queue.push(title);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        updateQueueDisplay();
        renderPlaylist();
    }
}

function removeFromQueue(index) {
    queue.splice(index, 1);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    updateQueueDisplay();
    renderPlaylist();
}

function updateQueueDisplay() {
    const queueSection = document.getElementById("queue-view");
    if (queueSection) {
        queueSection.innerHTML = queue.length ? `
            <div class="section-header">
                <h2>Queue (${queue.length})</h2>
                <button class="clear-queue-btn" id="clear-queue">Clear All</button>
            </div>
            <ul class="track-list">
                ${queue.map((title, i) => `
                    <li>
                        <span class="track-num">${i + 1}</span>
                        <span class="track-title">${title}</span>
                        <button class="remove-queue" data-index="${i}"><i class="fas fa-times"></i></button>
                    </li>
                `).join("")}
            </ul>
        ` : '<p class="empty-queue">Queue is empty</p>';
        
        document.getElementById("clear-queue")?.addEventListener("click", () => {
            queue = [];
            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
            updateQueueDisplay();
        });
        
        queueSection.querySelectorAll(".remove-queue").forEach(btn => {
            btn.addEventListener("click", () => removeFromQueue(parseInt(btn.dataset.index)));
        });
    }
}

async function playTrack(index) {
    currentIndex = index;
    audio.src = encodeURI(`music/${songs[index].file}`);
    currentTitle.textContent = songs[index].title;
    document.getElementById("player-title").textContent = songs[index].title;
    document.getElementById("player-status").textContent = "Now playing";
    currentStatus.textContent = "Now playing";
    currentEq = songs[index].eq || "flat";
    
    const npCard = document.querySelector(".now-playing-card");
    let npWaveform = npCard.querySelector(".np-waveform");
    if (!npWaveform) {
        npWaveform = document.createElement("div");
        npWaveform.className = "np-waveform";
        npCard.appendChild(npWaveform);
    }
    const barCount = 40;
    npWaveform.innerHTML = Array.from({length: barCount}, (_, i) => 
        `<div class="wave-bar" style="height: ${Math.random() * 60 + 20}%"></div>`
    ).join("");
    
    addToRecent(songs[index].title);
    await incrementPlayCount(songs[index].title);
    renderPlaylist();
    togglePlay(true);
    audio.play();
    
    if (isPlaying) animateWaveform(npWaveform);
}

function animateWaveform(container) {
    if (!container || !isPlaying) return;
    const bars = container.querySelectorAll(".wave-bar");
    bars.forEach(bar => {
        bar.style.height = `${Math.random() * 80 + 20}%`;
    });
    setTimeout(() => animateWaveform(container), 150);
}

function addToRecent(title) {
    recentPlays = recentPlays.filter(t => t !== title);
    recentPlays.unshift(title);
    recentPlays = recentPlays.slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentPlays));
}

function togglePlay(play) {
    isPlaying = play;
    playBtn.querySelector("i").className = play ? "fas fa-pause" : "fas fa-play";
    if (play && audio.src) audio.play();
    else if (!play && audio.src) audio.pause();
    const npWaveform = document.querySelector(".np-waveform");
    if (npWaveform) {
        if (play) animateWaveform(npWaveform);
        else {
            npWaveform.querySelectorAll(".wave-bar").forEach(bar => bar.style.height = "20%");
        }
    }
}

playBtn.addEventListener("click", () => {
    if (currentIndex === -1) playTrack(0);
    else togglePlay(!isPlaying);
});

prevBtn.addEventListener("click", () => {
    const filtered = getFilteredSongs();
    const currFilteredIndex = filtered.findIndex(s => songs.indexOf(s) === currentIndex);
    const prevFilteredIndex = currFilteredIndex > 0 ? currFilteredIndex - 1 : filtered.length - 1;
    playTrack(songs.indexOf(filtered[prevFilteredIndex]));
});

nextBtn.addEventListener("click", () => {
    if (queue.length > 0) {
        const nextTitle = queue.shift();
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        const nextIndex = songs.findIndex(s => s.title === nextTitle);
        updateQueueDisplay();
        playTrack(nextIndex);
    } else {
        const filtered = getFilteredSongs();
        const currFilteredIndex = filtered.findIndex(s => songs.indexOf(s) === currentIndex);
        const nextFilteredIndex = currFilteredIndex < filtered.length - 1 ? currFilteredIndex + 1 : 0;
        playTrack(songs.indexOf(filtered[nextFilteredIndex]));
    }
});

shuffleBtn.addEventListener("click", () => {
    isShuffling = !isShuffling;
    shuffleBtn.style.color = isShuffling ? "#1db954" : "";
    const filtered = getFilteredSongs();
    const idx = Math.floor(Math.random() * filtered.length);
    playTrack(songs.indexOf(filtered[idx]));
});

loopBtn.addEventListener("click", () => {
    isLooping = !isLooping;
    loopBtn.style.color = isLooping ? "#1db954" : "";
    audio.loop = isLooping;
});

audio.addEventListener("timeupdate", () => {
    if (audio.duration) {
        const pct = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = `${pct}%`;
        currentTimeEl.textContent = formatTime(audio.currentTime);
    }
});

audio.addEventListener("loadedmetadata", () => {
    durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener("ended", () => {
    if (queue.length > 0) {
        nextBtn.click();
    } else if (!isLooping) {
        const filtered = getFilteredSongs();
        const currFilteredIndex = filtered.findIndex(s => songs.indexOf(s) === currentIndex);
        const nextFilteredIndex = currFilteredIndex < filtered.length - 1 ? currFilteredIndex + 1 : 0;
        playTrack(songs.indexOf(filtered[nextFilteredIndex]));
    }
});

progressBar.addEventListener("click", (e) => {
    if (audio.duration) {
        const rect = progressBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * audio.duration;
    }
});

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

volumeSlider.addEventListener("input", () => {
    audio.volume = volumeSlider.value;
});

async function loadPlayCounts() {
    playCounts = {};
    
    if (!window.firebaseDb) {
        console.log("Firebase not configured - using local counts");
        const localSaved = localStorage.getItem(PLAYS_KEY);
        const savedCounts = localSaved ? JSON.parse(localSaved) : {};
        for (const song of songs) {
            playCounts[song.title] = savedCounts[song.title] || 0;
        }
        return;
    }
    
    for (const song of songs) {
        const safeKey = sanitizeKey(song.title);
        const songRef = window.firebaseRef(window.firebaseDb, `plays/${safeKey}`);
        window.firebaseOnValue(songRef, (snapshot) => {
            playCounts[song.title] = snapshot.val() || 0;
            renderPlaylist();
        });
    }
}

async function incrementPlayCount(title) {
    const song = songs.find(s => s.title === title);
    if (!song) return;
    
    if (!window.firebaseDb) {
        playCounts[title] = (playCounts[title] || 0) + 1;
        const localSaved = JSON.parse(localStorage.getItem(PLAYS_KEY) || '{}');
        localSaved[title] = playCounts[title];
        localStorage.setItem(PLAYS_KEY, JSON.stringify(localSaved));
        renderPlaylist();
        return;
    }
    
    const safeKey = sanitizeKey(song.title);
    const songRef = window.firebaseRef(window.firebaseDb, `plays/${safeKey}`);
    await window.firebaseTransaction(songRef, (currentCount) => {
        return (currentCount || 0) + 1;
    });
}

function loadRankings() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        rankings = JSON.parse(saved);
        if (rankings.length !== songs.length) {
            resetRankings();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(rankings));
        }
    } else {
        resetRankings();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rankings));
    }
}

function resetRankings() {
    const defaultOrder = [
        "Precious You're Safe", "Don't Let Go", "Królowie bez ruchów", "Gumisiowy Sok",
        "Sunlight Reflection", "Heartbreak is mean", "Bermuda Triangle", "Beemka Metalik",
        "London Rain", "Lodowaty Monster", "Think about tomorrow", "Midnight Highway",
        "Ohne Erwachen", "Paper Planes", "Red Light Fugue", "Train No Destination",
        "Ni Hao Neon"
    ];
    rankings = songs.map((s, i) => ({ ...s, rank: defaultOrder.indexOf(s.title) + 1 }));
    rankings.sort((a, b) => a.rank - b.rank);
}

function renderRanking() {
    rankingEl.innerHTML = rankings.map((song, i) => `
        <li draggable="true" data-index="${i}" data-rank="${song.rank}">
            <span class="rank-num">#${i + 1}</span>
            <span class="rank-title">${song.title}</span>
            <i class="fas fa-grip-lines drag-handle"></i>
        </li>
    `).join("");
    setupDragDrop();
}

function setupDragDrop() {
    const items = rankingEl.querySelectorAll("li");
    items.forEach(item => {
        item.addEventListener("dragstart", () => item.classList.add("dragging"));
        item.addEventListener("dragend", () => {
            item.classList.remove("dragging");
            updateRankings();
        });
        item.addEventListener("dragover", (e) => {
            e.preventDefault();
            const after = getDragAfterElement(rankingEl, e.clientY);
            if (after) rankingEl.insertBefore(item, after);
            else rankingEl.appendChild(item);
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll("li:not(.dragging)")];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateRankings() {
    const items = rankingEl.querySelectorAll("li");
    items.forEach((item, i) => {
        const idx = parseInt(item.dataset.index);
        rankings[idx].rank = i + 1;
    });
    rankings.sort((a, b) => a.rank - b.rank);
    renderRanking();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rankings));
}

document.getElementById("save-rankings")?.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rankings));
    const btn = document.getElementById("save-rankings");
    btn.textContent = "Saved!";
    setTimeout(() => btn.textContent = "Save", 1500);
});

document.addEventListener("keydown", (e) => {
    if (app.classList.contains("hidden")) return;
    if (e.code === "Space") {
        e.preventDefault();
        togglePlay(!isPlaying);
    } else if (e.code === "ArrowRight") {
        nextBtn.click();
    } else if (e.code === "ArrowLeft") {
        prevBtn.click();
    }
});

// Right-click Context Menu
let contextMenuTarget = null;

function showContextMenu(e, songTitle) {
    e.preventDefault();
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const isFav = favorites.has(songTitle);
    const isInQueue = queue.includes(songTitle);

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML = `
        <div class="context-menu-item play-now" data-title="${songTitle}">
            <i class="fas fa-play"></i> Play Now
        </div>
        <div class="context-menu-item queue-menu ${isInQueue ? 'active' : ''}" data-title="${songTitle}">
            <i class="fas fa-list"></i> ${isInQueue ? 'Remove from Queue' : 'Add to Queue'}
        </div>
        <div class="context-menu-item fav-menu ${isFav ? 'active' : ''}" data-title="${songTitle}">
            <i class="fas fa-heart"></i> ${isFav ? 'Remove from Favorites' : 'Add to Favorites'}
        </div>
    `;

    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - 150)}px`;
    document.body.appendChild(menu);

    contextMenuTarget = songTitle;

    menu.querySelector(".play-now").addEventListener("click", () => {
        const idx = songs.findIndex(s => s.title === songTitle);
        if (idx !== -1) playTrack(idx);
        menu.remove();
    });

    menu.querySelector(".queue-menu").addEventListener("click", () => {
        const idx = songs.findIndex(s => s.title === songTitle);
        if (idx !== -1) addToQueue(idx);
        menu.remove();
    });

    menu.querySelector(".fav-menu").addEventListener("click", () => {
        if (favorites.has(songTitle)) {
            favorites.delete(songTitle);
        } else {
            favorites.add(songTitle);
        }
        localStorage.setItem(FAVES_KEY, JSON.stringify([...favorites]));
        renderPlaylist();
        menu.remove();
    });
}

document.addEventListener("click", (e) => {
    const existing = document.querySelector(".context-menu");
    if (existing && !e.target.closest(".context-menu")) existing.remove();
});

document.addEventListener("contextmenu", (e) => {
    const trackRow = e.target.closest(".track-list li");
    if (trackRow) {
        const title = trackRow.querySelector(".track-title")?.textContent;
        if (title) showContextMenu(e, title);
    }
});