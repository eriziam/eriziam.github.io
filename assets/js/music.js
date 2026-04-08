const songs = [
    { file: "Beemka Metalik.mp3", title: "Beemka Metalik" },
    { file: "Bermuda Triangle.mp3", title: "Bermuda Triangle" },
    { file: "Don\u2019t Let Go.mp3", title: "Don\u2019t Let Go" },
    { file: "Gumisiowy Sok.mp3", title: "Gumisiowy Sok" },
    { file: "Heartbreak is mean.mp3", title: "Heartbreak is mean" },
    { file: "Kr\u00f3lowie bez ruch\u00f3w.mp3", title: "Kr\u00f3lowie bez ruch\u00f3w" },
    { file: "London Rain.mp3", title: "London Rain" },
    { file: "Lodowaty Monster.mp3", title: "Lodowaty Monster" },
    { file: "Midnight Highway.mp3", title: "Midnight Highway" },
    { file: "Ni Hao Neon.mp3", title: "Ni Hao Neon" },
    { file: "Ohne Erwachen.mp3", title: "Ohne Erwachen" },
    { file: "Paper Planes.mp3", title: "Paper Planes" },
    { file: "Precious You\u2019re Safe.mp3", title: "Precious You\u2019re Safe" },
    { file: "Red Light Fugue.mp3", title: "Red Light Fugue" },
    { file: "Sunlight Reflection.mp3", title: "Sunlight Reflection" },
    { file: "Think about tomorrow.mp3", title: "Think about tomorrow" },
    { file: "Train No Destination.mp3", title: "Train No Destination" }
];

const CORRECT_PASSWORD = "eriz2025";
const STORAGE_KEY = "music_vault_rankings";
const PASSWORD_KEY = "music_vault_auth";
const GENRES_KEY = "music_vault_genres";

let currentIndex = -1;
let isPlaying = false;
let rankings = [];
let genres = {};
let activeFilter = "all";

const audio = document.getElementById("audio");
const gate = document.getElementById("gate");
const app = document.getElementById("app");
const playlistEl = document.getElementById("playlist");
const rankingEl = document.getElementById("ranking-list");
const playBtns = document.querySelectorAll("#play-btn, #play-btn2");
const prevBtns = document.querySelectorAll("#prev-btn, #prev-btn2, #next-btn, #next-btn2");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const nextBtns = document.querySelectorAll("#next-btn, #next-btn2");
const shuffleBtn = document.getElementById("shuffle-btn");
const currentTitle = document.getElementById("current-title");
const currentStatus = document.getElementById("current-status");
const currentTimeEl = document.getElementById("current-time");
const durationEl = document.getElementById("duration");
const progressFill = document.getElementById("progress-fill");
const volumeSlider = document.getElementById("volume");
const trackCount = document.getElementById("track-count");
const genreFilterEl = document.getElementById("genre-filter");

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
        const title = trimmed.substring(0, eqIdx).trim();
        const genreStr = trimmed.substring(eqIdx + 1).trim();
        const genreList = genreStr.split(",").map(g => g.trim()).filter(g => g);
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
    return songs.filter(s => getSongGenres(s.title).includes(genre));
}

async function initApp() {
    await loadRankings();
    await loadGenres();
    renderGenreFilter();
    loadRankings();
    renderPlaylist();
    renderRanking();
    trackCount.textContent = `(${getFilteredSongs().length} tracks)`;
    audio.volume = 0.7;
}

function getFilteredSongs() {
    return filterSongsByGenre(activeFilter);
}

function renderGenreFilter() {
    const allGenres = getAllGenres();
    let html = `<button class="genre-btn active" data-genre="all">All</button>`;
    for (const g of allGenres) {
        html += `<button class="genre-btn" data-genre="${g}">${g}</button>`;
    }
    genreFilterEl.innerHTML = html;
    
    genreFilterEl.querySelectorAll(".genre-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            activeFilter = btn.dataset.genre;
            genreFilterEl.querySelectorAll(".genre-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderPlaylist();
            trackCount.textContent = `(${getFilteredSongs().length} tracks)`;
        });
    });
}

function renderPlaylist() {
    const filtered = getFilteredSongs();
    playlistEl.innerHTML = filtered.map((song, i) => {
        const songGenres = getSongGenres(song.title);
        const genreTags = songGenres.map(g => `<span class="genre-tag">${g}</span>`).join("");
        return `
        <li data-index="${songs.indexOf(song)}" class="${songs.indexOf(song) === currentIndex ? 'active' : ''}">
            <span class="track-num">${i + 1}</span>
            <div class="track-info">
                <span class="track-title">${song.title}</span>
                <span class="track-genres">${genreTags}</span>
            </div>
            <button class="play-track" data-index="${songs.indexOf(song)}"><i class="fas fa-play"></i></button>
        </li>
    `;
    }).join("");

    playlistEl.querySelectorAll(".play-track").forEach(btn => {
        btn.addEventListener("click", () => playTrack(parseInt(btn.dataset.index)));
    });
}

function playTrack(index) {
    currentIndex = index;
    audio.src = encodeURI(`music/${songs[index].file}`);
    currentTitle.textContent = songs[index].title;
    document.getElementById("player-title").textContent = songs[index].title;
    document.getElementById("player-status").textContent = "Now playing";
    currentStatus.textContent = "Now playing";
    renderPlaylist();
    togglePlay(true);
    audio.play();
}

function togglePlay(play) {
    isPlaying = play;
    playBtns.forEach(btn => btn.querySelector("i").className = play ? "fas fa-pause" : "fas fa-play");
    if (play && audio.src) audio.play();
    else if (!play && audio.src) audio.pause();
}

playBtns.forEach(btn => btn.addEventListener("click", () => {
    if (currentIndex === -1) playTrack(0);
    else togglePlay(!isPlaying);
}));

prevBtns.forEach(btn => btn.addEventListener("click", () => {
    currentIndex = currentIndex > 0 ? currentIndex - 1 : songs.length - 1;
    playTrack(currentIndex);
}));

nextBtns.forEach(btn => btn.addEventListener("click", () => {
    currentIndex = currentIndex < songs.length - 1 ? currentIndex + 1 : 0;
    playTrack(currentIndex);
}));

shuffleBtn.addEventListener("click", () => {
    const idx = Math.floor(Math.random() * songs.length);
    playTrack(idx);
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
    currentIndex = currentIndex < songs.length - 1 ? currentIndex + 1 : 0;
    playTrack(currentIndex);
});

document.querySelector(".progress").addEventListener("click", (e) => {
    if (audio.duration) {
        const rect = e.target.getBoundingClientRect();
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
        item.addEventListener("dragstart", () => {
            item.classList.add("dragging");
        });
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
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
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

document.getElementById("save-rankings").addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rankings));
    const btn = document.getElementById("save-rankings");
    btn.textContent = "Saved!";
    setTimeout(() => btn.textContent = "Save Rankings", 1500);
});

document.addEventListener("keydown", (e) => {
    if (app.classList.contains("hidden")) return;
    if (e.code === "Space") {
        e.preventDefault();
        togglePlay(!isPlaying);
    } else if (e.code === "ArrowRight") {
        currentIndex = currentIndex < songs.length - 1 ? currentIndex + 1 : 0;
        playTrack(currentIndex);
    } else if (e.code === "ArrowLeft") {
        currentIndex = currentIndex > 0 ? currentIndex - 1 : songs.length - 1;
        playTrack(currentIndex);
    }
});