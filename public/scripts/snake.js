(() => {
    const GLOBAL_KEY = "__snakeOverlayCleanup__";

    if (window[GLOBAL_KEY]) {
        window[GLOBAL_KEY]();
        window[GLOBAL_KEY] = null;
    }

    const STEP_MS = 180;
    const INITIAL_LENGTH = 6;
    const DIRS = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
    ];

    let canvas = null;
    let ctx = null;
    let dpr = 1;
    let cell = 16;
    let origin = -8;
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;

    let snake = [];
    let target = null;
    let lastStep = performance.now();
    let animationId = 0;

    function keyOf(p) {
        return `${p.x},${p.y}`;
    }

    function same(a, b) {
        return a && b && a.x === b.x && a.y === b.y;
    }

    function inBounds(p) {
        return p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows;
    }

    function occupiedSet() {
        const set = new Set();
        for (const p of snake) set.add(keyOf(p));
        return set;
    }

    function isOccupied(p, ignoreTail = true) {
        const limit = ignoreTail ? Math.max(0, snake.length - 1) : snake.length;
        for (let i = 0; i < limit; i++) {
            if (same(snake[i], p)) return true;
        }
        return false;
    }

    function randomFreeCell() {
        const blocked = occupiedSet();

        for (let i = 0; i < 5000; i++) {
            const p = {
                x: 1 + Math.floor(Math.random() * (cols - 2)),
                y: 1 + Math.floor(Math.random() * (rows - 2)),
            };
            if (!blocked.has(keyOf(p))) return p;
        }

        return { x: 1, y: 1 };
    }

    function ensureTarget() {
        if (!target || !inBounds(target) || isOccupied(target, false)) {
            target = randomFreeCell();
        }
    }

    function heuristic(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    class MinHeap {
        constructor(compare) {
            this.data = [];
            this.compare = compare;
        }

        get size() {
            return this.data.length;
        }

        push(value) {
            this.data.push(value);
            this.bubbleUp(this.data.length - 1);
        }

        pop() {
            if (this.data.length === 0) return null;

            const top = this.data[0];
            const last = this.data.pop();

            if (this.data.length > 0 && last !== undefined) {
                this.data[0] = last;
                this.bubbleDown(0);
            }

            return top;
        }

        bubbleUp(index) {
            while (index > 0) {
                const parent = (index - 1) >> 1;
                if (this.compare(this.data[index], this.data[parent]) >= 0) break;
                [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
                index = parent;
            }
        }

        bubbleDown(index) {
            const len = this.data.length;

            while (true) {
                let smallest = index;
                const left = index * 2 + 1;
                const right = index * 2 + 2;

                if (left < len && this.compare(this.data[left], this.data[smallest]) < 0) {
                    smallest = left;
                }
                if (right < len && this.compare(this.data[right], this.data[smallest]) < 0) {
                    smallest = right;
                }

                if (smallest === index) break;
                [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
                index = smallest;
            }
        }
    }

    function reconstructPath(cameFrom, current) {
        const path = [current];

        while (cameFrom.has(keyOf(current))) {
            current = cameFrom.get(keyOf(current));
            path.push(current);
        }

        path.reverse();
        path.shift();
        return path;
    }

    function findPath(start, goal) {
        if (!inBounds(goal)) return [];

        const blocked = occupiedSet();
        blocked.delete(keyOf(start));
        blocked.delete(keyOf(snake[snake.length - 1]));

        const open = new MinHeap((a, b) => a.f - b.f);
        const cameFrom = new Map();
        const gScore = new Map();
        const closed = new Set();

        const startKey = keyOf(start);
        const goalKey = keyOf(goal);

        open.push({ p: start, f: heuristic(start, goal) });
        gScore.set(startKey, 0);

        while (open.size > 0) {
            const node = open.pop();
            if (!node) break;

            const current = node.p;
            const currentKey = keyOf(current);

            if (currentKey === goalKey) {
                return reconstructPath(cameFrom, current);
            }

            if (closed.has(currentKey)) continue;
            closed.add(currentKey);

            for (const dir of DIRS) {
                const next = { x: current.x + dir.x, y: current.y + dir.y };
                const nextKey = keyOf(next);

                if (!inBounds(next)) continue;
                if (blocked.has(nextKey) && nextKey !== goalKey) continue;

                const tentative = (gScore.get(currentKey) ?? Infinity) + 1;
                const known = gScore.get(nextKey) ?? Infinity;

                if (tentative < known) {
                    cameFrom.set(nextKey, current);
                    gScore.set(nextKey, tentative);
                    open.push({ p: next, f: tentative + heuristic(next, goal) });
                }
            }
        }

        return [];
    }

    function safeFallbackMove(head, goal) {
        const candidates = [];

        for (const dir of DIRS) {
            const next = { x: head.x + dir.x, y: head.y + dir.y };
            if (!inBounds(next)) continue;
            if (isOccupied(next, true)) continue;
            candidates.push(next);
        }

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => heuristic(a, goal) - heuristic(b, goal));
        return candidates[0];
    }

    function moveSnake() {
        ensureTarget();

        const head = snake[0];
        const path = findPath(head, target);
        const next = path.length > 0 ? path[0] : safeFallbackMove(head, target);

        if (!next) return;

        if (isOccupied(next, true) && !same(next, snake[snake.length - 1])) {
            return;
        }

        snake = [next, ...snake.slice(0, -1)];

        if (same(next, target)) {
            target = null;
            ensureTarget();
        }
    }

    function measure() {
        const root = document.documentElement;

        width = root.clientWidth;
        height = root.clientHeight;
        dpr = window.devicePixelRatio || 1;
        cell = parseFloat(getComputedStyle(root).fontSize) || 16;
        origin = -cell / 2;

        cols = Math.ceil((width - origin) / cell) + 2;
        rows = Math.ceil((height - origin) / cell) + 2;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
    }

    function resetSnake() {
        const startX = Math.floor(cols / 2);
        const startY = Math.floor(rows / 2);

        snake = [];
        for (let i = 0; i < INITIAL_LENGTH; i++) {
            snake.push({ x: startX - i, y: startY });
        }

        target = null;
        ensureTarget();
    }

    function clampSnakeToBoard() {
        snake = snake
            .map((p) => ({
                x: Math.max(0, Math.min(cols - 1, p.x)),
                y: Math.max(0, Math.min(rows - 1, p.y)),
            }))
            .filter((p, index, arr) => {
                if (index === 0) return true;
                return !same(p, arr[index - 1]);
            });

        if (snake.length < 2) resetSnake();
    }

    function handleResize() {
        measure();
        clampSnakeToBoard();

        if (target && !inBounds(target)) {
            target = null;
            ensureTarget();
        }
    }

    function gridToPx(p) {
        return {
            x: origin + p.x * cell,
            y: origin + p.y * cell,
        };
    }

    function drawCell(p, fill, stroke = null) {
        const px = gridToPx(p);

        ctx.fillStyle = fill;
        ctx.fillRect(px.x, px.y, cell, cell);

        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(px.x + 0.5, px.y + 0.5, cell - 1, cell - 1);
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        ensureTarget();

        if (target && inBounds(target)) {
            drawCell(target, "rgba(239, 68, 68, 0.15)", "rgba(239, 68, 68, 0.50)");
        }

        for (let i = snake.length - 1; i >= 0; i--) {
            const seg = snake[i];
            if (!inBounds(seg)) continue;
            const alpha = i === 0 ? 0.75 : Math.max(0.12, 0.35 - i * 0.05);
            drawCell(seg, `rgba(74, 222, 128, ${alpha})`, "rgba(34, 197, 94, 0.15)");
        }
    }

    function tick(now) {
        if (now - lastStep >= STEP_MS) {
            const steps = Math.floor((now - lastStep) / STEP_MS);
            for (let i = 0; i < steps; i++) moveSnake();
            lastStep = now;
        }

        draw();
        animationId = window.requestAnimationFrame(tick);
    }

    function mount() {
        if (canvas) return;

        canvas = document.createElement("canvas");
        canvas.id = "snake-overlay";
        canvas.setAttribute("aria-hidden", "true");

        Object.assign(canvas.style, {
            position: "fixed",
            left: "0",
            top: "0",
            width: "calc(100vw - 10px)",
            height: "100dvh",
            pointerEvents: "none",
            zIndex: "-999",
            display: "block",
            imageRendering: "pixelated",
        });

        document.body.appendChild(canvas);

        ctx = canvas.getContext("2d");
        if (!ctx) return;

        measure();
        resetSnake();

        window.addEventListener("resize", handleResize, { passive: true });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) lastStep = performance.now();
        });

        animationId = window.requestAnimationFrame(tick);

        window[GLOBAL_KEY] = () => {
            window.removeEventListener("resize", handleResize);
            window.cancelAnimationFrame(animationId);
            canvas?.remove();
            canvas = null;
            ctx = null;
        };
    }

    mount();
})();
