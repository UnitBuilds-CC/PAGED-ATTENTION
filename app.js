/* ==========================================================================
   VRAM TETRIS - CORE GAME ENGINE & ML SIMULATOR
   ========================================================================== */

// --- Audio Synth Engine (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(freq, duration, type = "sine", volume = 0.1) {
    try {
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.error("Web Audio fail", e);
    }
}

// Sound presets
const SOUNDS = {
    move: () => playSound(300, 0.05, "sine", 0.05),
    rotate: () => playSound(450, 0.08, "triangle", 0.08),
    drop: () => playSound(180, 0.1, "sine", 0.15),
    land: () => playSound(120, 0.15, "triangle", 0.15),
    split: () => {
        // Cascading slide up
        playSound(400, 0.15, "sawtooth", 0.06);
        setTimeout(() => playSound(600, 0.15, "sawtooth", 0.06), 50);
        setTimeout(() => playSound(800, 0.2, "sawtooth", 0.06), 100);
    },
    clear: () => {
        // High chord
        playSound(523.25, 0.3, "sine", 0.1); // C5
        setTimeout(() => playSound(659.25, 0.3, "sine", 0.1), 100); // E5
        setTimeout(() => playSound(783.99, 0.4, "sine", 0.15), 200); // G5
    },
    warning: () => playSound(220, 0.3, "sawtooth", 0.2),
    oom: () => {
        // Descending crash
        playSound(150, 0.4, "sawtooth", 0.3);
        setTimeout(() => playSound(90, 0.6, "sawtooth", 0.4), 150);
    }
};

// --- Game Configurations & Constants ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 22; // 22px * 10 = 220px width; 22px * 20 = 440px height
const COLORS = {
    I: '#00f0ff', // Cyan
    O: '#ffff00', // Yellow
    T: '#bf00ff', // Purple
    S: '#39ff14', // Green
    Z: '#ff3333', // Red
    J: '#ff9900', // Orange
    L: '#ff007f'  // Magenta
};

// Tetromino Shapes
const SHAPES = {
    I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    O: [
        [1, 1],
        [1, 1]
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
    ]
};

const REQUEST_NAMES = {
    I: 'llama_7b_prompt',
    O: 'mixtral_moe_gate',
    T: 'gpt4_search_ref',
    S: 'claude_3_agent',
    Z: 'stable_diff_unet',
    J: 'gemini_flash_ctx',
    L: 'deepseek_coder_qa'
};

// --- Game State Variables ---
let canvas, ctx;
let holdCanvas, holdCtx;
let nextCanvas, nextCtx;

let grid = [];
let currentPiece = null;
let nextPiece = null;
let holdPiece = null;
let holdUsed = false;

let score = 0;
let linesCleared = 0;
let level = 1;
let tps = 0.0;
let fragPercent = 0;
let allocationMode = "contiguous"; // "contiguous" or "paged"
let abilityCharge = 100; // 0 to 100
let running = false;
let gameOver = false;
let victory = false;

let lastDropTime = 0;
let dropInterval = 1000; // ms
let deliveryTicks = [];

// --- System Logs Engine ---
function addSystemLog(text, type = "info") {
    const consoleLogs = document.getElementById('console-logs');
    if (!consoleLogs) return;

    const timeStr = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = 'console-log-line';
    logLine.innerHTML = `
        <div class="log-meta">
            <span class="timestamp">[${timeStr}]</span>
            <span class="log-tag ${type}">${type.toUpperCase()}</span>
        </div>
        <div class="log-text">${text}</div>
    `;

    consoleLogs.appendChild(logLine);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;

    // Limit log lines to 40
    while (consoleLogs.children.length > 40) {
        consoleLogs.removeChild(consoleLogs.firstChild);
    }
}

// --- Telemetry Calculations ---
function updateTelemetry() {
    // VRAM Fill
    let filledBlocks = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) filledBlocks++;
        }
    }
    const totalCells = ROWS * COLS;
    const vramPct = Math.round((filledBlocks / totalCells) * 100);
    document.getElementById('vram-bar').style.width = vramPct + "%";
    document.getElementById('vram-val').innerText = vramPct + "%";

    // External Memory Fragmentation %
    // Defined as the % of cells that are empty but have a filled cell above them in the same column
    let fragmentedGaps = 0;
    for (let c = 0; c < COLS; c++) {
        let foundFilled = false;
        for (let r = 0; r < ROWS; r++) {
            if (grid[r][c]) {
                foundFilled = true;
            } else if (foundFilled && !grid[r][c]) {
                fragmentedGaps++;
            }
        }
    }
    fragPercent = Math.round((fragmentedGaps / totalCells) * 100);
    document.getElementById('frag-bar').style.width = fragPercent + "%";
    document.getElementById('frag-val').innerText = fragPercent + "%";

    if (fragPercent > 35) {
        document.getElementById('frag-val').classList.add('pulse');
    } else {
        document.getElementById('frag-val').classList.remove('pulse');
    }

    // TPS Calculation (Rolling throughput over last 5 seconds)
    const now = performance.now();
    while (deliveryTicks.length > 0 && deliveryTicks[0] < now - 5000) {
        deliveryTicks.shift();
    }
    tps = deliveryTicks.length / 5;
    document.getElementById('tps-val').innerText = tps.toFixed(1) + " TPS";

    // Paging Efficiency
    let pagingEff = 100;
    if (allocationMode === "contiguous" && fragPercent > 0) {
        pagingEff = Math.max(10, 100 - fragPercent * 2);
    } else if (allocationMode === "paged") {
        pagingEff = 100; // Perfect alignment
    }
    document.getElementById('paging-val').innerText = pagingEff + "%";
    
    // Ability Fill display
    document.getElementById('ability-fill').style.width = abilityCharge + "%";
    const abilityCard = document.getElementById('ability-paged-card');
    const chargeLabel = document.getElementById('ability-charge-label');
    if (abilityCharge >= 100) {
        abilityCard.classList.add('charged');
        chargeLabel.innerText = "PAGE SPLIT READY (SHIFT/P)";
        chargeLabel.style.color = "var(--magenta)";
    } else {
        abilityCard.classList.remove('charged');
        chargeLabel.innerText = `CHARGING: ${Math.round(abilityCharge)}%`;
        chargeLabel.style.color = "var(--text-muted)";
    }
}

// --- Piece Class & Operations ---
class Piece {
    constructor(shapeType) {
        this.type = shapeType;
        this.shape = SHAPES[shapeType];
        this.color = COLORS[shapeType];
        this.name = REQUEST_NAMES[shapeType];
        // Centered start coordinates
        this.x = Math.floor((COLS - this.shape[0].length) / 2);
        this.y = 0;
    }

    // Rotate matrix 90 deg clockwise
    rotate() {
        const size = this.shape.length;
        const rotated = Array.from({ length: size }, () => Array(size).fill(0));
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                rotated[c][size - 1 - r] = this.shape[r][c];
            }
        }
        return rotated;
    }
}

// Initialize components
function initGrid() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function spawnPiece() {
    if (!nextPiece) {
        nextPiece = getRandomPiece();
    }
    currentPiece = nextPiece;
    nextPiece = getRandomPiece();
    holdUsed = false;

    // Check OOM collision right at spawn
    if (checkCollision(currentPiece.x, currentPiece.y, currentPiece.shape)) {
        triggerOomCrash();
    }

    addSystemLog(`Scheduled task stream execution: ${currentPiece.name}`, "info");
    drawPreviewCanvas(nextCanvas, nextCtx, nextPiece);
}

function getRandomPiece() {
    const keys = Object.keys(SHAPES);
    const randKey = keys[Math.floor(Math.random() * keys.length)];
    return new Piece(randKey);
}

function checkCollision(px, py, shape) {
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                const nextX = px + c;
                const nextY = py + r;

                // Border limits check
                if (nextX < 0 || nextX >= COLS || nextY >= ROWS) {
                    return true;
                }

                // Grid collision check
                if (nextY >= 0 && grid[nextY][nextX]) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Place piece on grid
function lockPiece() {
    SOUNDS.land();
    for (let r = 0; r < currentPiece.shape.length; r++) {
        for (let c = 0; c < currentPiece.shape[r].length; c++) {
            if (currentPiece.shape[r][c]) {
                const px = currentPiece.x + c;
                const py = currentPiece.y + r;
                if (py >= 0) {
                    grid[py][px] = currentPiece.color;
                }
            }
        }
    }
    
    // Clear lines
    clearMemoryLines();
    spawnPiece();
}

function clearMemoryLines() {
    let clearedCount = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
        const isFull = grid[r].every(cell => cell !== 0);
        if (isFull) {
            clearedCount++;
            // Shift rows down
            grid.splice(r, 1);
            grid.unshift(Array(COLS).fill(0));
            r++; // Check same row index again after splice
        }
    }

    if (clearedCount > 0) {
        SOUNDS.clear();
        linesCleared += clearedCount;
        score += [0, 100, 300, 500, 800][clearedCount] * level;
        
        // Spawn token telemetry deliveries (200 tokens per line)
        const timestamp = performance.now();
        for (let t = 0; t < clearedCount * 200; t++) {
            // Space deliveries out slightly in milliseconds
            deliveryTicks.push(timestamp + Math.random() * 50);
        }

        // Charge ability meter by 25% per line
        abilityCharge = Math.min(100, abilityCharge + clearedCount * 25);

        addSystemLog(`Line clear: Garbage collected ${clearedCount} VRAM rows. Dispatched ${clearedCount * 200} tokens.`, "info");
        
        // Target Level Scaling
        level = Math.floor(linesCleared / 10) + 1;
        dropInterval = Math.max(100, 1000 - (level - 1) * 100);

        document.getElementById('lines-val').innerText = linesCleared;
        document.getElementById('score-val').innerText = String(score).padStart(6, '0');
    }
}

// --- Special Mechanic: Paged Memory Split ---
function executePageSplit() {
    if (abilityCharge < 100) {
        addSystemLog("PagedAttention Split not fully charged yet!", "warning");
        SOUNDS.warning();
        return;
    }

    SOUNDS.split();
    addSystemLog(`Executing PagedAttention: Splitting ${currentPiece.name} into virtual pages...`, "info");

    // Get all filled cells of the falling piece
    const pages = [];
    for (let r = 0; r < currentPiece.shape.length; r++) {
        for (let c = 0; c < currentPiece.shape[r].length; c++) {
            if (currentPiece.shape[r][c]) {
                pages.push({
                    x: currentPiece.x + c,
                    y: currentPiece.y + r,
                    color: currentPiece.color
                });
            }
        }
    }

    // Drop each page individually down its column to the lowest free cell
    pages.forEach(page => {
        let lowestY = page.y;
        while (lowestY + 1 < ROWS && !grid[lowestY + 1][page.x]) {
            lowestY++;
        }
        if (lowestY >= 0) {
            grid[lowestY][page.x] = page.color;
        }
    });

    abilityCharge = 0; // Consume charge
    clearMemoryLines();
    spawnPiece();
}

// --- Hold Action ---
function executeHold() {
    if (holdUsed) return;
    SOUNDS.move();

    const temp = holdPiece;
    holdPiece = new Piece(currentPiece.type);
    
    if (temp) {
        currentPiece = temp;
        // Reset position
        currentPiece.x = Math.floor((COLS - currentPiece.shape[0].length) / 2);
        currentPiece.y = 0;
    } else {
        spawnPiece();
    }
    
    holdUsed = true;
    drawPreviewCanvas(holdCanvas, holdCtx, holdPiece);
    addSystemLog(`Swapped active sequence to Hold Cache.`, "info");
}

// --- Gameloop & Render Logic ---
function gameStep(timestamp) {
    if (!running || gameOver || victory) return;

    if (!lastDropTime) lastDropTime = timestamp;
    const elapsed = timestamp - lastDropTime;

    if (elapsed > dropInterval) {
        moveDown();
        lastDropTime = timestamp;
    }

    // Charge ability slowly over time in Paged Mode (1% per second)
    if (allocationMode === "paged") {
        abilityCharge = Math.min(100, abilityCharge + (elapsed / 1000) * 1.5);
    }

    updateTelemetry();
    renderGrid();
    requestAnimationFrame(gameStep);
}

function moveLeft() {
    if (!checkCollision(currentPiece.x - 1, currentPiece.y, currentPiece.shape)) {
        currentPiece.x--;
        SOUNDS.move();
    }
}

function moveRight() {
    if (!checkCollision(currentPiece.x + 1, currentPiece.y, currentPiece.shape)) {
        currentPiece.x++;
        SOUNDS.move();
    }
}

function moveDown() {
    if (!checkCollision(currentPiece.x, currentPiece.y + 1, currentPiece.shape)) {
        currentPiece.y++;
    } else {
        lockPiece();
    }
}

function hardDrop() {
    SOUNDS.drop();
    while (!checkCollision(currentPiece.x, currentPiece.y + 1, currentPiece.shape)) {
        currentPiece.y++;
    }
    lockPiece();
}

function rotatePiece() {
    const rotated = currentPiece.rotate();
    // Wall kick simple resolution
    let originalX = currentPiece.x;
    let offset = 0;
    
    if (checkCollision(currentPiece.x, currentPiece.y, rotated)) {
        // Try offset right
        currentPiece.x++;
        if (checkCollision(currentPiece.x, currentPiece.y, rotated)) {
            // Try offset left
            currentPiece.x = originalX - 1;
            if (checkCollision(currentPiece.x, currentPiece.y, rotated)) {
                // Restore and skip rotation
                currentPiece.x = originalX;
                return;
            }
        }
    }
    currentPiece.shape = rotated;
    SOUNDS.rotate();
}

// --- Render Canvas Functions ---
function renderGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let c = 0; c < COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * BLOCK_SIZE, 0);
        ctx.lineTo(c * BLOCK_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let r = 0; r < ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * BLOCK_SIZE);
        ctx.lineTo(canvas.width, r * BLOCK_SIZE);
        ctx.stroke();
    }

    // Draw settled blocks
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c]) {
                drawBlock(ctx, c, r, grid[r][c]);
            }
        }
    }

    // Draw falling piece
    if (currentPiece) {
        // Draw ghost piece (projection helper)
        let ghostY = currentPiece.y;
        while (!checkCollision(currentPiece.x, ghostY + 1, currentPiece.shape)) {
            ghostY++;
        }
        ctx.save();
        ctx.globalAlpha = 0.15;
        for (let r = 0; r < currentPiece.shape.length; r++) {
            for (let c = 0; c < currentPiece.shape[r].length; c++) {
                if (currentPiece.shape[r][c]) {
                    drawBlock(ctx, currentPiece.x + c, ghostY + r, currentPiece.color, true);
                }
            }
        }
        ctx.restore();

        // Draw solid active piece
        for (let r = 0; r < currentPiece.shape.length; r++) {
            for (let c = 0; c < currentPiece.shape[r].length; c++) {
                if (currentPiece.shape[r][c]) {
                    drawBlock(ctx, currentPiece.x + c, currentPiece.y + r, currentPiece.color);
                }
            }
        }
    }
}

function drawBlock(cContext, x, y, color, isGhost = false) {
    const px = x * BLOCK_SIZE;
    const py = y * BLOCK_SIZE;
    const padding = 2;

    cContext.fillStyle = color;
    if (isGhost) {
        cContext.strokeStyle = color;
        cContext.lineWidth = 2;
        cContext.strokeRect(px + padding, py + padding, BLOCK_SIZE - padding * 2, BLOCK_SIZE - padding * 2);
    } else {
        // High fidelity block style: Rounded neon boxes with highlights
        cContext.fillRect(px + padding, py + padding, BLOCK_SIZE - padding * 2, BLOCK_SIZE - padding * 2);
        
        // Add subtle internal glowing core
        cContext.fillStyle = '#ffffff';
        cContext.globalAlpha = 0.2;
        cContext.fillRect(px + padding + 3, py + padding + 3, BLOCK_SIZE - padding * 2 - 6, BLOCK_SIZE - padding * 2 - 6);
        cContext.globalAlpha = 1.0;
    }
}

function drawPreviewCanvas(pCanvas, pCtx, piece) {
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    if (!piece) return;

    const shape = piece.shape;
    const size = shape.length;
    const scale = 14; // smaller blocks for previews
    const offsetX = (pCanvas.width - size * scale) / 2;
    const offsetY = (pCanvas.height - size * scale) / 2;

    pCtx.fillStyle = piece.color;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                pCtx.fillRect(offsetX + c * scale + 1, offsetY + r * scale + 1, scale - 2, scale - 2);
            }
        }
    }
}

// --- Life Cycle Controls ---
function startSimulation() {
    initGrid();
    score = 0;
    linesCleared = 0;
    level = 1;
    dropInterval = 1000;
    abilityCharge = 100;
    gameOver = false;
    victory = false;
    running = true;
    holdPiece = null;
    holdUsed = false;
    deliveryTicks = [];
    
    addSystemLog("Starting GPU Core Virtual Allocation main loop...", "info");
    
    document.getElementById('crash-overlay').classList.add('hidden');
    document.getElementById('victory-overlay').classList.add('hidden');
    document.getElementById('engine-status').innerText = "ONLINE";
    document.getElementById('engine-status').className = "status-val green";

    spawnPiece();
    requestAnimationFrame(gameStep);
}

function triggerOomCrash() {
    running = false;
    gameOver = true;
    SOUNDS.oom();
    addSystemLog("CUDA FATAL EXCEPTION: Out of memory block space.", "error");

    document.getElementById('engine-status').innerText = "OOM CRASH";
    document.getElementById('engine-status').className = "status-val red";
    document.getElementById('crash-overlay').classList.remove('hidden');

    // Populate log dump list
    const logDump = document.getElementById('crash-log-dump');
    logDump.innerHTML = `
        <span>[0.000] CUDA Core initialized</span>
        <span>[1.240] VRAM dynamic layout size: 5120MB</span>
        <span>[2.990] Memory fragmentation: ${fragPercent}%</span>
        <span>[4.102] Target memory block allocation fault</span>
        <span>[5.000] Out of Memory: Terminating pipeline kernel</span>
    `;
}

// --- DOM Event Wiring ---
window.addEventListener('load', () => {
    canvas = document.getElementById('game-canvas');
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;
    ctx = canvas.getContext('2d');

    holdCanvas = document.getElementById('hold-canvas');
    holdCtx = holdCanvas.getContext('2d');

    nextCanvas = document.getElementById('next-canvas');
    nextCtx = nextCanvas.getContext('2d');

    // Controls listeners
    document.getElementById('btn-mode-contiguous').onclick = () => {
        allocationMode = "contiguous";
        document.getElementById('btn-mode-contiguous').classList.add('active');
        document.getElementById('btn-mode-paged').classList.remove('active');
        document.getElementById('mode-desc').innerText = 
            "Standard contiguous allocator. Pieces remain solid. Gaps create unusable external memory fragmentation.";
        addSystemLog("Engine switched: Contiguous hardware buffer mode.", "warning");
        SOUNDS.move();
    };

    document.getElementById('btn-mode-paged').onclick = () => {
        allocationMode = "paged";
        document.getElementById('btn-mode-paged').classList.add('active');
        document.getElementById('btn-mode-contiguous').classList.remove('active');
        document.getElementById('mode-desc').innerText = 
            "PagedAttention virtualization. Shift/P breaks active prompt sequences into memory pages to fill arbitrary gaps.";
        addSystemLog("Engine switched: Virtual PagedAttention memory mode.", "info");
        SOUNDS.move();
    };

    // Keyboard Wiring
    window.addEventListener('keydown', (e) => {
        if (!running || gameOver) return;

        switch (e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                moveLeft();
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                moveRight();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                moveDown();
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
                rotatePiece();
                break;
            case ' ':
                hardDrop();
                break;
            case 'c':
            case 'C':
                executeHold();
                break;
            case 'Shift':
            case 'p':
            case 'P':
                if (allocationMode === "paged") {
                    executePageSplit();
                } else {
                    addSystemLog("Paging is offline in contiguous mode!", "warning");
                    SOUNDS.warning();
                }
                break;
        }
    });

    document.getElementById('btn-restart-crash').onclick = startSimulation;
    document.getElementById('btn-restart-victory').onclick = startSimulation;

    // Start on load
    startSimulation();
});
