document.addEventListener('DOMContentLoaded', () => {
    const sliderContainer = document.querySelector('.before-after-slider');
    const topImage = document.querySelector('.slider-image-top');
    const handle = document.querySelector('.slider-handle');

    if (!sliderContainer || !topImage || !handle) {
        return;
    }

    let isDragging = false;

    // Function to update the slider position
    function updateSlider(xPosition) {
        const rect = sliderContainer.getBoundingClientRect();
        let position = (xPosition - rect.left) / rect.width;

        // Clamp position between 0 and 1
        position = Math.max(0, Math.min(1, position));

        const percentage = position * 100;

        // Update the clip-path of the top image
        topImage.style.clipPath = `polygon(0 0, ${percentage}% 0, ${percentage}% 100%, 0% 100%)`;
        // Update the position of the handle
        handle.style.left = `${percentage}%`;
    }

    // Start dragging
    handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isDragging = true;
    });

    // Stop dragging
    window.addEventListener('pointerup', () => {
        isDragging = false;
    });

    // Move slider on drag
    window.addEventListener('pointermove', (e) => {
        if (isDragging) {
            updateSlider(e.clientX);
        }
    });

    // Also allow clicking on the container to move the slider
    sliderContainer.addEventListener('pointerdown', (e) => {
        // Only trigger if the handle itself wasn't the target
        if (e.target !== handle) {
            isDragging = true;
            updateSlider(e.clientX);
        }
    });
});
