/**
 * SwipeHandler - Reusable swipe gesture handler for mobile UI elements
 *
 * Handles vertical and horizontal swipe gestures with:
 * - Follow-finger dragging animation
 * - Velocity-based swipe detection
 * - Rubber-banding at boundaries
 * - iOS Safari pull-to-refresh prevention
 * - Scroll conflict prevention
 * - State transitions (hidden ↔ compact ↔ expanded)
 *
 * @example
 * const handler = new SwipeHandler({
 *     element: document.getElementById('myElement'),
 *     states: [
 *         { name: 'hidden', height: 0 },
 *         { name: 'compact', height: '320px' },
 *         { name: 'expanded', height: '85vh' }
 *     ],
 *     scrollElement: document.getElementById('scrollableContent'),
 *     onStateChange: (newState) => console.log('State changed to:', newState)
 * });
 */
export class SwipeHandler {
    constructor(config) {
        // Required configuration
        this.element = config.element;
        if (!this.element) {
            throw new Error('SwipeHandler: element is required');
        }

        // State configuration
        this.states = config.states || [
            { name: 'hidden', height: 0 },
            { name: 'compact', height: 320 },
            { name: 'expanded', height: '85vh' }
        ];
        this.currentState = config.initialState || this.states[1].name; // Default to middle state

        // Optional configuration
        this.scrollElement = config.scrollElement || null;
        this.enableHorizontalSwipe = config.enableHorizontalSwipe !== false;
        this.onStateChange = config.onStateChange || (() => {});
        this.onHorizontalSwipe = config.onHorizontalSwipe || (() => {});

        // State management strategy
        this.useClasses = config.useClasses || false; // Use CSS classes instead of data-state
        this.dataStateAttribute = config.dataStateAttribute || 'data-state';

        // Scroll detection
        this.scrollThreshold = config.scrollThreshold || 3; // pixels from top
        this.autoScrollThreshold = config.autoScrollThreshold || 20; // auto-scroll when within this distance

        // Touch tracking variables
        this.startX = 0;
        this.startY = 0;
        this.currentY = 0;
        this.startTime = 0;
        this.isDragging = false;
        this.swipeDirection = null;
        this.initialHeight = 0;

        // Initialize
        this.setupEventListeners();
        console.log('SwipeHandler initialized for element:', this.element.id);
    }

    /**
     * Get state configuration by name
     */
    getState(stateName) {
        return this.states.find(s => s.name === stateName);
    }

    /**
     * Get current state index
     */
    getCurrentStateIndex() {
        return this.states.findIndex(s => s.name === this.currentState);
    }

    /**
     * Get height value for a state (handles both numbers and strings like '85vh')
     */
    getHeightValue(state) {
        if (typeof state.height === 'function') {
            return state.height();
        }
        if (typeof state.height === 'number') {
            return state.height;
        }
        // For string values like '85vh', calculate pixel value
        if (typeof state.height === 'string') {
            if (state.height.includes('vh')) {
                const vh = parseFloat(state.height);
                return window.innerHeight * (vh / 100);
            }
            if (state.height.includes('px')) {
                return parseFloat(state.height);
            }
            return parseFloat(state.height) || 0;
        }
        return 0;
    }

    /**
     * Check if content is scrolled to top
     */
    isScrolledToTop() {
        if (!this.scrollElement) return true;

        const currentStateIndex = this.getCurrentStateIndex();
        // Only check scroll in expanded state
        if (currentStateIndex === this.states.length - 1) {
            return this.scrollElement.scrollTop <= this.scrollThreshold;
        }

        return true; // Non-expanded states don't have scrolling
    }

    /**
     * Auto-scroll to top if near the top
     */
    autoScrollToTopIfNear() {
        if (!this.scrollElement) return false;

        const scrollTop = this.scrollElement.scrollTop;
        if (scrollTop > 0 && scrollTop <= this.autoScrollThreshold) {
            this.scrollElement.scrollTop = 0;
            return true;
        }
        return false;
    }

    /**
     * Set element state
     * @param {string} stateName - The state to set
     * @param {boolean} clearStyles - Whether to clear inline styles (default: false)
     */
    setState(stateName, clearStyles = false) {
        const oldState = this.currentState;
        this.currentState = stateName;

        // Only clear inline styles if explicitly requested
        if (clearStyles) {
            this.element.style.maxHeight = '';
            this.element.style.transform = '';
            this.element.style.opacity = '';
            this.element.style.transition = '';
        }

        if (this.useClasses) {
            // Remove all state classes
            this.states.forEach(state => {
                this.element.classList.remove(state.name);
            });
            // Add new state class (including 'hidden')
            this.element.classList.add(stateName);
        } else {
            // Use data-state attribute
            this.element.setAttribute(this.dataStateAttribute, stateName);
        }

        // Callback
        if (oldState !== stateName) {
            this.onStateChange(stateName, oldState);
        }
    }

    /**
     * Setup touch event listeners
     */
    setupEventListeners() {
        this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.element.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
        this.currentY = this.startY;
        this.startTime = Date.now();
        this.isDragging = false;
        this.swipeDirection = null;

        // Get current height
        const currentStateIndex = this.getCurrentStateIndex();
        const currentState = this.states[currentStateIndex];
        this.initialHeight = this.getHeightValue(currentState);

        console.log('Touch start:', this.startX, this.startY, 'Initial height:', this.initialHeight);
    }

    /**
     * Handle touch move
     */
    handleTouchMove(e) {
        if (!this.isDragging && !this.swipeDirection) {
            // Determine swipe direction on first move
            const diffX = Math.abs(e.touches[0].clientX - this.startX);
            const diffY = Math.abs(e.touches[0].clientY - this.startY);

            if (diffX > 10 || diffY > 10) {
                this.swipeDirection = diffX > diffY ? 'horizontal' : 'vertical';

                // Auto-scroll to top if swiping down in expanded state
                if (this.swipeDirection === 'vertical') {
                    const deltaY = this.currentY - this.startY;
                    const isSwipingDown = deltaY > 0;

                    if (this.getCurrentStateIndex() === this.states.length - 1 && isSwipingDown) {
                        this.autoScrollToTopIfNear();
                    }
                }
            }
        }

        this.currentY = e.touches[0].clientY;
        const deltaY = this.currentY - this.startY;

        // Handle vertical swipes
        if (this.swipeDirection === 'vertical') {
            const currentStateIndex = this.getCurrentStateIndex();

            // Determine if we can drag
            let canDrag = false;
            if (currentStateIndex === 0) {
                // Hidden state - only allow swipe up
                canDrag = deltaY < 0;
            } else if (currentStateIndex === this.states.length - 1) {
                // Expanded state - only allow swipe down when at top
                const isAtTop = this.isScrolledToTop();
                const isSwipingDown = deltaY > 0;
                canDrag = isAtTop && isSwipingDown;
            } else {
                // Middle states - allow both directions
                canDrag = true;
            }

            if (canDrag) {
                this.isDragging = true;

                // Prevent iOS Safari pull-to-refresh
                e.preventDefault();

                // Calculate new height (inverted: dragging down = smaller, dragging up = taller)
                let newHeight = this.initialHeight - deltaY;

                // Get boundary heights
                const minHeight = this.getHeightValue(this.states[0]);
                const maxHeight = this.getHeightValue(this.states[this.states.length - 1]);
                const currentHeight = this.getHeightValue(this.states[currentStateIndex]);

                // Special handling for swiping down from lowest non-hidden state (to hide)
                if (currentStateIndex === 1 && newHeight < currentHeight) {
                    // Slide down animation to hide
                    const slideDistance = currentHeight - newHeight;
                    this.element.style.maxHeight = `${currentHeight}px`;
                    this.element.style.transform = `translateY(${slideDistance}px)`;
                    this.element.style.transition = 'none';

                    const fadeProgress = Math.min(slideDistance / 150, 1);
                    this.element.style.opacity = 1 - (fadeProgress * 0.5);
                } else {
                    // Normal expand/collapse with rubber-banding
                    if (newHeight < minHeight) {
                        const overflow = minHeight - newHeight;
                        newHeight = minHeight - (overflow * 0.3);
                    } else if (newHeight > maxHeight) {
                        const overflow = newHeight - maxHeight;
                        newHeight = maxHeight + (overflow * 0.3);
                    }

                    // Clamp
                    newHeight = Math.max(minHeight * 0.7, Math.min(maxHeight * 1.1, newHeight));

                    // Update height
                    this.element.style.maxHeight = `${newHeight}px`;
                    this.element.style.transform = '';
                    this.element.style.opacity = '';
                    this.element.style.transition = 'none';

                    // Update swipe handle opacity
                    const swipeHandle = this.element.querySelector('.mobile-popup-swipe-handle, .mobile-panel-header::before');
                    if (swipeHandle) {
                        const progress = (newHeight - currentHeight) / (maxHeight - currentHeight);
                        swipeHandle.style.opacity = 0.3 + (progress * 0.4);
                    }
                }
            }
        } else if (this.swipeDirection === 'horizontal' && this.enableHorizontalSwipe) {
            // Prevent default for horizontal swipes
            e.preventDefault();
        }
    }

    /**
     * Handle touch end
     */
    handleTouchEnd(e) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const endTime = Date.now();

        const diffX = this.startX - endX;
        const diffY = this.startY - endY;
        const deltaTime = endTime - this.startTime;
        const velocity = Math.abs(diffY) / deltaTime;

        console.log('Touch end - diffX:', diffX, 'diffY:', diffY, 'velocity:', velocity);

        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        // Reset swipe handle
        const swipeHandle = this.element.querySelector('.mobile-popup-swipe-handle, .mobile-panel-header::before');
        if (swipeHandle) {
            swipeHandle.style.opacity = '';
        }

        // Handle horizontal swipe
        if (this.swipeDirection === 'horizontal' && absX > 50 && this.enableHorizontalSwipe) {
            console.log('Horizontal swipe detected:', diffX > 0 ? 'left' : 'right');
            this.element.style.transition = '';
            this.onHorizontalSwipe(diffX > 0 ? 'left' : 'right');
        }
        // Handle vertical swipe with dragging
        else if (this.swipeDirection === 'vertical' && this.isDragging) {
            const currentStateIndex = this.getCurrentStateIndex();
            const currentHeight = parseInt(this.element.style.maxHeight) || this.initialHeight;

            // Check if trying to hide
            const transformMatch = this.element.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
            const slideDistance = transformMatch ? parseFloat(transformMatch[1]) : 0;

            if (currentStateIndex === 1 && slideDistance > 0) {
                // Swiping down from compact - decide hide or snap back
                const shouldHide = velocity > 1.0 || slideDistance > 80;

                if (shouldHide) {
                    // Hide with animation
                    const compactHeight = this.getHeightValue(this.states[1]);
                    console.log('Hiding element - slide distance:', slideDistance);
                    this.element.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
                    this.element.style.transform = `translateY(${compactHeight + 50}px)`;
                    this.element.style.opacity = '0';

                    setTimeout(() => {
                        // Set state WITHOUT clearing styles (to prevent pop)
                        const oldState = this.currentState;
                        this.currentState = 'hidden';

                        // Apply class/attribute change
                        if (this.useClasses) {
                            this.states.forEach(state => this.element.classList.remove(state.name));
                            this.element.classList.add('hidden');
                        } else {
                            this.element.setAttribute(this.dataStateAttribute, 'hidden');
                        }

                        // Clear animation styles AFTER class is applied (next frame)
                        requestAnimationFrame(() => {
                            this.element.style.transform = '';
                            this.element.style.opacity = '';
                            this.element.style.maxHeight = '';
                            this.element.style.transition = '';
                        });

                        // Callback
                        if (oldState !== 'hidden') {
                            this.onStateChange('hidden', oldState);
                        }
                    }, 300);
                } else {
                    // Snap back
                    this.element.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
                    this.element.style.transform = '';
                    this.element.style.opacity = '';
                    this.element.style.maxHeight = '';
                }
            } else {
                // Normal expand/collapse decision
                const targetIndex = this.determineTargetState(currentHeight, velocity, diffY);

                // Clear inline styles
                this.element.style.maxHeight = '';
                this.element.style.transform = '';
                this.element.style.opacity = '';


                // Use requestAnimationFrame for smooth transition
                requestAnimationFrame(() => {
                    this.element.style.transition = '';
                    this.setState(this.states[targetIndex].name);

                    // Scroll content to top if collapsing
                    if (targetIndex < currentStateIndex && this.scrollElement) {
                        this.scrollElement.scrollTop = 0;
                    }

                });
            }
        }
        // Simple vertical swipe without dragging (fallback)
        else if (this.swipeDirection === 'vertical' && absY > 50) {
            this.element.style.transform = '';
            this.element.style.opacity = '';
            this.element.style.maxHeight = '';
            this.element.style.transition = '';

            const currentStateIndex = this.getCurrentStateIndex();

            if (diffY > 0 && currentStateIndex < this.states.length - 1) {
                // Swipe up - expand
                console.log('Swipe up detected - expanding');
                this.setState(this.states[currentStateIndex + 1].name);
            } else if (diffY < 0 && currentStateIndex > 0) {
                // Swipe down - collapse or hide
                if (currentStateIndex === this.states.length - 1 && !this.isScrolledToTop()) {
                    // In expanded state but not at top - don't collapse
                    return;
                }
                console.log('Swipe down detected - collapsing');
                this.setState(this.states[currentStateIndex - 1].name);
            }
        } else {
            // No action - clean up
            this.element.style.transform = '';
            this.element.style.opacity = '';
            this.element.style.maxHeight = '';
            this.element.style.transition = '';
        }

        // Reset state
        this.isDragging = false;
        this.swipeDirection = null;
    }

    /**
     * Determine target state based on height, velocity, and direction
     */
    determineTargetState(currentHeight, velocity, swipeDistance) {
        const currentStateIndex = this.getCurrentStateIndex();

        // Fast swipe - use direction
        if (velocity > 1.5) {
            if (swipeDistance > 0) {
                // Swipe up - expand
                return Math.min(currentStateIndex + 1, this.states.length - 1);
            } else {
                // Swipe down - collapse
                return Math.max(currentStateIndex - 1, 0);
            }
        }

        // Slow swipe - use position threshold
        // Find which state threshold we're closest to
        const heights = this.states.map(s => this.getHeightValue(s));

        // Find closest state
        let closestIndex = 0;
        let minDiff = Math.abs(currentHeight - heights[0]);

        for (let i = 1; i < heights.length; i++) {
            const diff = Math.abs(currentHeight - heights[i]);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        return closestIndex;
    }

    /**
     * Programmatically change state
     */
    changeState(stateName) {
        const state = this.getState(stateName);
        if (!state) {
            console.warn('SwipeHandler: Invalid state name:', stateName);
            return;
        }

        // Clear any inline styles
        this.element.style.maxHeight = '';
        this.element.style.transform = '';
        this.element.style.opacity = '';

        this.setState(stateName);
    }

    /**
     * Destroy handler and remove event listeners
     */
    destroy() {
        this.element.removeEventListener('touchstart', this.handleTouchStart);
        this.element.removeEventListener('touchmove', this.handleTouchMove);
        this.element.removeEventListener('touchend', this.handleTouchEnd);
        console.log('SwipeHandler destroyed for element:', this.element.id);
    }
}
