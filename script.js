document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const imageLoader = document.getElementById('imageLoader');
    const watermarkText = document.getElementById('watermarkText');
    const fontSizeSlider = document.getElementById('fontSize');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const opacitySlider = document.getElementById('opacity');
    const opacityValue = document.getElementById('opacityValue');
    const densitySlider = document.getElementById('density');
    const densityValue = document.getElementById('densityValue');
    const imageFilterRadios = document.querySelectorAll('input[name="imageFilter"]');
    const redactionTypeSelect = document.getElementById('redactionType');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const downloadBtn = document.getElementById('downloadBtn');
    const redactBtn = document.getElementById('redactBtn');
    const clearRedactionsBtn = document.getElementById('clearRedactionsBtn');
    const placeholder = document.getElementById('placeholder');
    const dropzone = document.getElementById('dropzone');

    // --- State ---
    let image = new Image();
    let redactions = [];
    let history = [];

    // Interaction state
    let isRedactionMode = false;
    let isDrawing = false;
    let isDragging = false;
    let isResizing = false;

    let selectedRedactionId = null;
    let resizeHandle = null;

    let startX, startY;
    let dragOffsetX, dragOffsetY;
    let tempRect = null;

    const HANDLE_SIZE = 8;


    // --- Event Listeners ---
    imageLoader.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadImageFile(file);
        }
    });
    watermarkText.addEventListener('input', redrawCanvas);

    fontSizeSlider.addEventListener('input', (e) => {
        fontSizeValue.textContent = e.target.value;
        redrawCanvas();
    });
    opacitySlider.addEventListener('input', (e) => {
        opacityValue.textContent = e.target.value;
        redrawCanvas();
    });
    densitySlider.addEventListener('input', (e) => {
        densityValue.textContent = e.target.value;
        redrawCanvas();
    });

    imageFilterRadios.forEach(radio => radio.addEventListener('change', redrawCanvas));
    redactionTypeSelect.addEventListener('change', () => {
        if (selectedRedactionId) {
            const redaction = getRedactionById(selectedRedactionId);
            if (redaction) {
                redaction.type = redactionTypeSelect.value;
                addHistoryState();
                redrawCanvas();
            }
        }
    });

    redactBtn.addEventListener('click', () => {
        isRedactionMode = !isRedactionMode;
        redactBtn.classList.toggle('active', isRedactionMode);
        canvas.classList.toggle('redact-mode', isRedactionMode);
        if (!isRedactionMode) { // Deselect when leaving mode
            selectedRedactionId = null;
            redrawCanvas();
        }
    });
    clearRedactionsBtn.addEventListener('click', () => {
        if (!isRedactionMode) return;
        redactions = [];
        addHistoryState();
        redrawCanvas();
    });

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);

    downloadBtn.addEventListener('click', downloadImage);

    document.addEventListener('keydown', (e) => {
        if (!isRedactionMode) return; // Only allow undo/delete in redact mode
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            if (history.length > 1) {
                history.pop();
                redactions = JSON.parse(JSON.stringify(history[history.length - 1]));
                selectedRedactionId = null;
                redrawCanvas();
            }
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedRedactionId) {
                e.preventDefault();
                redactions = redactions.filter(r => r.id !== selectedRedactionId);
                selectedRedactionId = null;
                addHistoryState();
                redrawCanvas();
            }
        }
    });

    // Drag and Drop Listeners
    dropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            loadImageFile(file);
        }
    });


    // --- Functions ---

    function getRedactionById(id) {
        return redactions.find(r => r.id === id);
    }

    function loadImageFile(file) {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                image.onload = () => {
                    canvas.width = image.width;
                    canvas.height = image.height;
                    canvas.style.display = 'block';
                    placeholder.style.display = 'none';
                    redactions = [];
                    history = [];
                    selectedRedactionId = null;
                    addHistoryState();
                    redrawCanvas();
                };
                image.src = event.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            alert('Please drop an image file.');
        }
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    function onMouseDown(e) {
        if (!isRedactionMode) return;
        const pos = getMousePos(e);
        startX = pos.x;
        startY = pos.y;

        if (selectedRedactionId) {
            const selectedRedaction = getRedactionById(selectedRedactionId);
            resizeHandle = getHandleAt(pos, selectedRedaction);
            if (resizeHandle) {
                isResizing = true;
                return;
            }
        }

        const clickedRedaction = getRedactionAt(pos);
        if (clickedRedaction) {
            selectedRedactionId = clickedRedaction.id;
            isDragging = true;
            dragOffsetX = startX - clickedRedaction.x;
            dragOffsetY = startY - clickedRedaction.y;
            redactionTypeSelect.value = clickedRedaction.type;
        } else {
            selectedRedactionId = null;
            isDrawing = true;
        }
        redrawCanvas();
    }

    function onMouseMove(e) {
        if (!isRedactionMode || (!isDrawing && !isResizing && !isDragging)) return;

        const pos = getMousePos(e);

        if (isResizing && selectedRedactionId) {
            const rect = getRedactionById(selectedRedactionId);
            const oldX = rect.x, oldY = rect.y, oldW = rect.width, oldH = rect.height;
            switch (resizeHandle) {
                case 'topLeft': rect.x = pos.x; rect.y = pos.y; rect.width = oldW + (oldX - pos.x); rect.height = oldH + (oldY - pos.y); break;
                case 'topRight': rect.y = pos.y; rect.width = pos.x - oldX; rect.height = oldH + (oldY - pos.y); break;
                case 'bottomLeft': rect.x = pos.x; rect.width = oldW + (oldX - pos.x); rect.height = pos.y - oldY; break;
                case 'bottomRight': rect.width = pos.x - oldX; rect.height = pos.y - oldY; break;
            }
        } else if (isDragging && selectedRedactionId) {
            const rect = getRedactionById(selectedRedactionId);
            rect.x = pos.x - dragOffsetX;
            rect.y = pos.y - dragOffsetY;
        } else if (isDrawing) {
            tempRect = { x: startX, y: startY, width: pos.x - startX, height: pos.y - startY };
        }

        redrawCanvas();
    }

    function onMouseUp(e) {
        if (!isRedactionMode) return;

        if (isDrawing) {
            if (tempRect && Math.abs(tempRect.width) > 5 && Math.abs(tempRect.height) > 5) {
                normalizeRect(tempRect);
                const newRect = { ...tempRect, id: Date.now(), type: redactionTypeSelect.value };
                redactions.push(newRect);
                selectedRedactionId = newRect.id;
                addHistoryState();
            }
        } else if (isResizing) {
            const rect = getRedactionById(selectedRedactionId);
            normalizeRect(rect);
            addHistoryState();
        } else if (isDragging) {
            addHistoryState();
        }

        isDrawing = false; isResizing = false; isDragging = false;
        resizeHandle = null; tempRect = null;
        redrawCanvas();
    }

    function normalizeRect(rect) {
        if (rect.width < 0) { rect.x += rect.width; rect.width *= -1; }
        if (rect.height < 0) { rect.y += rect.height; rect.height *= -1; }
    }

    function getRedactionAt(pos) {
        for (let i = redactions.length - 1; i >= 0; i--) {
            const rect = redactions[i];
            if (pos.x >= rect.x && pos.x <= rect.x + rect.width && pos.y >= rect.y && pos.y <= rect.y + rect.height) {
                return rect;
            }
        }
        return null;
    }

    function getHandles(rect) {
        if (!rect) return {};
        return {
            topLeft: { x: rect.x, y: rect.y }, topRight: { x: rect.x + rect.width, y: rect.y },
            bottomLeft: { x: rect.x, y: rect.y + rect.height }, bottomRight: { x: rect.x + rect.width, y: rect.y + rect.height },
        };
    }

    function getHandleAt(pos, rect) {
        if (!rect) return null;
        const handles = getHandles(rect);
        for (const handleName in handles) {
            const handle = handles[handleName];
            if (Math.abs(pos.x - handle.x) <= HANDLE_SIZE && Math.abs(pos.y - handle.y) <= HANDLE_SIZE) {
                return handleName;
            }
        }
        return null;
    }

    function redrawCanvas() {
        if (!image.src) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const selectedFilter = document.querySelector('input[name="imageFilter"]:checked').value;
        if (selectedFilter === 'grayscale') {
            applyGrayscaleFilter();
        }

        // Get the image data once after drawing the base image and applying filters
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Pass the original image data to the redaction function to avoid issues with overlapping redactions
        redactions.forEach(rect => drawRedaction(rect, imageData));

        if (isRedactionMode && selectedRedactionId) {
            const rect = getRedactionById(selectedRedactionId);
            if (rect) drawHandles(rect);
        }

        if (tempRect) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(tempRect.x, tempRect.y, tempRect.width, tempRect.height);
        }

        drawWatermark();
    }

    function drawRedaction(rect, imageData) {
        ctx.save();
        switch (rect.type) {
        case 'blur':
            ctx.imageSmoothingEnabled = false;
            ctx.filter = 'blur(6px)';

            // Draw the portion of the original image, blurred
            ctx.drawImage(
                image,
                rect.x, rect.y, rect.width, rect.height,
                rect.x, rect.y, rect.width, rect.height
            );

            // Reset filter and smoothing
            ctx.filter = 'none';
            ctx.imageSmoothingEnabled = true;
            break;
            ctx.imageSmoothingEnabled = true;
            break;
            case 'pixelate':
                let pixelSize = Math.min(rect.width, rect.height) / 8;
                pixelSize = Math.max(pixelSize, 10); // mínimo absoluto = 10px

                for (let y = 0; y < rect.height; y += pixelSize) {
                    for (let x = 0; x < rect.width; x += pixelSize) {
                        const sourceX = Math.floor(rect.x + x);
                        const sourceY = Math.floor(rect.y + y);
                        const i = (sourceY * imageData.width + sourceX) * 4;
                        const r = imageData.data[i];
                        const g = imageData.data[i + 1];
                        const b = imageData.data[i + 2];
                        const a = imageData.data[i + 3];

                        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
                        ctx.fillRect(rect.x + x, rect.y + y, pixelSize, pixelSize);
                    }
                }
                break;

            case 'solid':
            default:
                ctx.fillStyle = 'black';
                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                break;
        }
        ctx.restore();
    }


    function drawHandles(rect) {
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.setLineDash([]);
        const handles = getHandles(rect);
        ctx.fillStyle = '#007bff';
        for (const handleName in handles) {
            const handle = handles[handleName];
            ctx.fillRect(handle.x - HANDLE_SIZE / 2, handle.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        }
    }

    function applyGrayscaleFilter() {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            data[i] = gray; data[i + 1] = gray; data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function drawWatermark() {
        const text = watermarkText.value;
        if (!text) return;
        const fontSize = parseInt(fontSizeSlider.value);
        const opacity = parseFloat(opacitySlider.value);
        const density = parseFloat(densitySlider.value);

        ctx.save();
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Use the user's suggested gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, `rgba(120, 120, 120, ${opacity * 0.35})`);
        gradient.addColorStop(1, `rgba(200, 200, 200, ${opacity * 0.55})`);
        ctx.fillStyle = gradient;

        ctx.strokeStyle = `rgba(30, 30, 30, ${opacity * 0.6})`;
        ctx.lineWidth = 1.2;

        // Main canvas rotation for the diagonal effect
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 6); // -30 degrees
        ctx.translate(-canvas.width / 2, -canvas.height / 2);

        const textMetrics = ctx.measureText(text);
        const xSpacing = textMetrics.width * 1.8;
        const ySpacing = fontSize * density;

        let row = 0;
        for (let y = -ySpacing; y < canvas.height + ySpacing; y += ySpacing) {
            const fullText = (text + "  ").repeat(Math.ceil(canvas.width / ctx.measureText(text + "  ").width) + 2);
            const chars = fullText.split('');
            const offsetX = (row % 2 === 0) ? -xSpacing / 2 : 0;

            let currentX = offsetX - xSpacing;

            // Sine wave parameters for this row
            const amp = fontSize * 0.2;
            const freq = 0.05;

            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];
                const charWidth = ctx.measureText(char).width;

                const waveY = y + Math.sin(currentX * freq) * amp;

                const derivative = amp * freq * Math.cos(currentX * freq);
                const angle = Math.atan(derivative);

                ctx.save();
                ctx.translate(currentX, waveY);
                ctx.rotate(angle);

                const scale = 0.97 + Math.random() * 0.06;
                ctx.scale(scale, scale);
                ctx.globalAlpha = 0.8 + Math.random() * 0.15;

                ctx.strokeText(char, 0, 0);
                ctx.fillText(char, 0, 0);

                ctx.restore();

                currentX += charWidth;
                if (currentX > canvas.width + xSpacing) break;
            }
            row++;
        }

        ctx.restore();
    }

    function downloadImage() {
        if (!image.src) {
            alert('Please upload an image first.');
            return;
        }
        selectedRedactionId = null;
        isRedactionMode = false;
        redactBtn.classList.remove('active');
        canvas.classList.remove('redact-mode');
        redrawCanvas();
        const link = document.createElement('a');
        link.download = 'edited-document.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    function addHistoryState() {
        history.push(JSON.parse(JSON.stringify(redactions)));
    }
});
