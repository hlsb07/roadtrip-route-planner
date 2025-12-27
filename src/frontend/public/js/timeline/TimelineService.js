import { timelineCoordsToUTC, formatDayTime } from './timelineMapper.js';
import { ConflictUIManager } from './conflictUI.js';

/**
 * TimelineService - Handles timeline UI rendering and user interactions
 */
export class TimelineService {
    constructor(callbacks) {
        this.callbacks = {
            onStopSelected: callbacks.onStopSelected || (() => {}),
            onStopScheduleChanged: callbacks.onStopScheduleChanged || (() => {}),
            onNeedRecalculateLegs: callbacks.onNeedRecalculateLegs || (() => {}),
            onResolveConflictByReorder: callbacks.onResolveConflictByReorder || (() => {})
        };

        this.timelineStops = [];
        this.totalDays = 1;
        this.routeStartUtc = null;
        this.currentT = 0;

        this.barElsByIndex = new Map();
        this.rafId = null;
        this.isScrubbing = false;

        this.conflictUI = new ConflictUIManager();
        this.currentConflicts = null;

        this.initDOM();
    }

    initDOM() {
        this.ganttWrapper = document.querySelector('.gantt-wrapper');
        this.ganttBarsContainer = document.getElementById('ganttBars');
        this.dayLabelsContainer = document.getElementById('dayLabels');
        this.ganttGrid = document.getElementById('ganttGrid');
        this.cursor = document.getElementById('timelineCursor');
        this.cursorLabel = document.getElementById('timelineCursorLabel');
        this.slider = document.getElementById('timelineSlider');
        this.progress = document.getElementById('timelineProgress');
        this.timelineContent = document.getElementById('timelineContent');

        // Check if elements exist
        if (!this.ganttWrapper || !this.ganttBarsContainer) {
            console.warn('Timeline DOM elements not found');
            return;
        }

        this.attachSliderListeners();
        this.attachHorizontalScrollListener();
    }

    render(timelineStops, totalDays, routeStartUtc) {
        console.log(`Timeline render: ${timelineStops.length} stops, ${totalDays} days`);

        // Check if DOM elements are available
        if (!this.ganttWrapper || !this.ganttBarsContainer) {
            console.warn('Timeline DOM not ready, skipping render');
            return;
        }

        this.timelineStops = timelineStops;
        this.totalDays = totalDays;
        this.routeStartUtc = routeStartUtc;

        // Set explicit width based on total days
        const dayWidth = this.getDayWidth();
        const totalWidth = totalDays * dayWidth;
        this.ganttWrapper.style.minWidth = `${totalWidth}px`;

        // Set explicit widths for slider, track, and gantt-content to match timeline width
        const ganttContent = document.querySelector('.gantt-content');
        const timelineTrack = document.querySelector('.timeline-track');
        const timelineSlider = document.getElementById('timelineSlider');
        const dayLabels = document.querySelector('.day-labels');
        const ganttGrid = document.querySelector('.gantt-grid');

        if (ganttContent) {
            ganttContent.style.width = `${totalWidth}px`;
            ganttContent.style.minWidth = `${totalWidth}px`;
        }
        if (timelineTrack) {
            timelineTrack.style.width = `${totalWidth}px`;
        }
        if (timelineSlider) {
            timelineSlider.style.width = `${totalWidth}px`;
        }
        if (dayLabels) {
            dayLabels.style.width = `${totalWidth}px`;
        }
        if (ganttGrid) {
            ganttGrid.style.width = `${totalWidth}px`;
        }

        console.log(`Timeline grid: dayWidth=${dayWidth}px, totalDays=${totalDays}, totalWidth=${totalWidth}px`);

        this.renderDayLabels();
        this.renderDayGrid();
        this.renderBars();
        this.configureSlider();
        this.updateCursor(0);
    }

    /**
     * Render timeline with conflict information
     * @param {Array} timelineStops - Array of timeline stop data
     * @param {number} totalDays - Total number of days
     * @param {string} routeStartUtc - Route start date/time in UTC
     * @param {Object} conflictInfo - Conflict information from backend
     */
    renderWithConflicts(timelineStops, totalDays, routeStartUtc, conflictInfo) {
        // Call existing render method
        this.render(timelineStops, totalDays, routeStartUtc);

        // Store conflict info
        this.currentConflicts = conflictInfo;

        // Show conflict indicators if present
        if (conflictInfo && conflictInfo.hasConflict) {
            this.conflictUI.markConflictingBars(
                conflictInfo.conflictingStops,
                this.barElsByIndex,
                this.timelineStops
            );

            this.conflictUI.showConflictBanner(
                conflictInfo,
                () => this.handleResolveConflicts(),
                () => this.conflictUI.hideConflictBanner()
            );
        } else {
            this.conflictUI.hideConflictBanner();
        }
    }

    /**
     * Handle user request to resolve conflicts
     */
    async handleResolveConflicts() {
        try {
            await this.callbacks.onResolveConflictByReorder();
            this.conflictUI.showResolutionSuccess();
            this.conflictUI.hideConflictBanner();
        } catch (error) {
            console.error('Failed to resolve conflicts:', error);
        }
    }

    getDayWidth() {
        // Return day width based on screen size
        if (window.innerWidth <= 768) {
            return 80; // Mobile
        }
        return 120; // Desktop
    }

    /**
     * Get calendar date for a day index (0-based)
     * @param {number} dayIndex - Day index (0 = first day, 1 = second day, etc.)
     * @returns {Date} Calendar date for that day
     */
    getCalendarDateForDay(dayIndex) {
        if (!this.routeStartUtc) {
            return new Date();
        }

        const routeStart = new Date(this.routeStartUtc);
        const MS_PER_DAY = 24 * 60 * 60 * 1000;

        // Get the calendar date of route start (at midnight UTC)
        const routeStartDate = new Date(Date.UTC(
            routeStart.getUTCFullYear(),
            routeStart.getUTCMonth(),
            routeStart.getUTCDate(),
            0, 0, 0, 0
        ));

        return new Date(routeStartDate.getTime() + dayIndex * MS_PER_DAY);
    }

    renderDayLabels() {
        if (!this.dayLabelsContainer) return;

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        this.dayLabelsContainer.innerHTML = '';
        for (let day = 1; day <= this.totalDays; day++) {
            const label = document.createElement('div');
            label.className = 'day-label';

            // Show calendar date instead of "Day N"
            if (this.routeStartUtc) {
                const calendarDate = this.getCalendarDateForDay(day - 1);
                const month = monthNames[calendarDate.getUTCMonth()];
                const dayNum = calendarDate.getUTCDate();
                label.textContent = `${month} ${dayNum}`;
            } else {
                label.textContent = `Day ${day}`;
            }

            label.dataset.day = day;
            this.dayLabelsContainer.appendChild(label);
        }
    }

    renderDayGrid() {
        if (!this.ganttGrid) return;

        this.ganttGrid.innerHTML = '';
        for (let day = 1; day <= this.totalDays; day++) {
            const col = document.createElement('div');
            col.className = 'day-column';
            col.dataset.day = day;
            this.ganttGrid.appendChild(col);
        }
    }

    renderBars() {
        if (!this.ganttBarsContainer) return;

        this.ganttBarsContainer.innerHTML = '';
        this.barElsByIndex.clear();

        this.timelineStops.forEach((stop, index) => {
            const bar = this.createBar(stop, index);
            this.ganttBarsContainer.appendChild(bar);
            this.barElsByIndex.set(index, bar);
        });

        this.relayoutRows();
    }

    createBar(stop, index) {
        const bar = document.createElement('div');
        bar.className = `gantt-bar ${stop.color || ''}`;
        bar.dataset.index = index;

        // Resize handles
        const handleLeft = document.createElement('div');
        handleLeft.className = 'resize-handle left';
        const handleRight = document.createElement('div');
        handleRight.className = 'resize-handle right';
        bar.appendChild(handleLeft);
        bar.appendChild(handleRight);

        // Label
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = stop.name;
        bar.appendChild(label);

        // Position bar
        this.updateBarPosition(bar, stop);

        // Event handlers
        this.attachBarDragResize(bar, stop, index);

        // Click to select
        bar.addEventListener('click', (e) => {
            if (bar.classList.contains('resizing') || bar.classList.contains('moving')) return;
            this.callbacks.onStopSelected(index, stop);
        });

        return bar;
    }

    updateBarPosition(barEl, stop) {
        // Use pixel-based positioning for accurate alignment with day grid
        const dayWidth = this.getDayWidth();
        const leftPx = stop.startT * dayWidth;
        const widthPx = (stop.endT - stop.startT) * dayWidth;

        barEl.style.left = `${leftPx}px`;
        barEl.style.width = `${widthPx}px`;

        barEl.dataset.startT = stop.startT;
        barEl.dataset.endT = stop.endT;

        console.log(`Bar position for ${stop.name}: dayWidth=${dayWidth}px, startT=${stop.startT.toFixed(2)}, endT=${stop.endT.toFixed(2)}, leftPx=${leftPx.toFixed(1)}px, widthPx=${widthPx.toFixed(1)}px`);
    }

    attachBarDragResize(barEl, stop, index) {
        const MIN_DUR = 0.05; // ~1.2 hours
        let mode = null;
        let startX = 0;
        let startStartT = 0;
        let startEndT = 0;
        let hasMoved = false; // Track if user actually moved the bar

        const pxToT = (deltaPx) => {
            const rect = this.ganttWrapper.getBoundingClientRect();
            return (deltaPx / rect.width) * this.totalDays;
        };

        const onPointerMove = (e) => {
            const dx = e.clientX - startX;
            const dt = pxToT(dx);

            // Mark as moved if there's any significant movement
            if (Math.abs(dx) > 2) {
                hasMoved = true;
            }

            if (mode === 'resizeL') {
                stop.startT = Math.max(0, Math.min(startStartT + dt, startEndT - MIN_DUR));
            } else if (mode === 'resizeR') {
                stop.endT = Math.max(startStartT + MIN_DUR, Math.min(startEndT + dt, this.totalDays));
            } else if (mode === 'move') {
                const dur = startEndT - startStartT;
                const newStart = Math.max(0, Math.min(startStartT + dt, this.totalDays - dur));
                stop.startT = newStart;
                stop.endT = newStart + dur;
            }

            this.updateBarPosition(barEl, stop);
        };

        const onPointerUp = async () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);

            barEl.classList.remove('resizing', 'moving');

            // Only save if the user actually moved the bar
            if (hasMoved) {
                console.log(`Saving schedule for stop: ${stop.name}`);
                await this.saveStopSchedule(stop);

                // Optionally recalculate legs
                // this.callbacks.onNeedRecalculateLegs();

                this.relayoutRows();
            }

            mode = null;
            hasMoved = false;
        };

        barEl.addEventListener('pointerdown', (e) => {
            const isLeft = e.target.classList.contains('left');
            const isRight = e.target.classList.contains('right');

            // Allow drag on resize handles or on the bar itself (not on label)
            if (!isLeft && !isRight) {
                // If clicking on the label, don't start drag mode
                if (e.target.classList.contains('bar-label')) {
                    return;
                }
            }

            e.preventDefault();
            e.stopPropagation(); // Prevent click event

            mode = isLeft ? 'resizeL' : isRight ? 'resizeR' : 'move';
            startX = e.clientX;
            startStartT = stop.startT;
            startEndT = stop.endT;
            hasMoved = false; // Reset movement flag

            barEl.classList.add(mode === 'move' ? 'moving' : 'resizing');
            barEl.setPointerCapture(e.pointerId);

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        });
    }

    async saveStopSchedule(stop) {
        const { startUtc, endUtc } = timelineCoordsToUTC(
            stop.startT,
            stop.endT,
            this.routeStartUtc
        );

        try {
            const response = await this.callbacks.onStopScheduleChanged(stop.routePlaceId, {
                stopType: stop.stopType,
                timeZoneId: null, // Use route default
                plannedStart: startUtc,
                plannedEnd: endUtc,
                stayNights: null, // Let backend recalculate
                stayDurationMinutes: null,
                isStartLocked: true, // Lock after manual edit
                isEndLocked: true
            });

            // Check if response contains conflict information
            if (response && response.conflict && response.conflict.wouldCreateConflict) {
                const userWantsReorder = await this.conflictUI.showScheduleChangeConflictPrompt(
                    response.conflict
                );

                if (userWantsReorder) {
                    await this.callbacks.onResolveConflictByReorder();
                    this.conflictUI.showResolutionSuccess();
                }
            }

            console.log(`Successfully saved schedule for ${stop.name}`);
        } catch (error) {
            console.error(`Failed to save schedule for ${stop.name}:`, error);
            // TODO: Show user notification
        }
    }

    relayoutRows() {
        // Use day-based overlap detection for row assignment
        const dayOccupancy = {};
        let maxRow = 0;

        this.timelineStops.forEach((stop, index) => {
            const startDay = Math.floor(stop.startT) + 1;
            const endDay = Math.max(startDay, Math.ceil(stop.endT));

            // Find free row
            let row = 0;
            while (true) {
                let ok = true;
                for (let d = startDay; d <= endDay; d++) {
                    if (dayOccupancy[d] && dayOccupancy[d][row]) {
                        ok = false;
                        break;
                    }
                }
                if (ok) break;
                row++;
            }

            // Mark occupied
            for (let d = startDay; d <= endDay; d++) {
                if (!dayOccupancy[d]) dayOccupancy[d] = {};
                dayOccupancy[d][row] = true;
            }

            maxRow = Math.max(maxRow, row);

            const barEl = this.barElsByIndex.get(index);
            if (barEl) {
                barEl.style.top = (row * 45) + 'px';
            }
        });

        this.ganttBarsContainer.style.height = ((maxRow + 1) * 45 + 10) + 'px';
    }

    configureSlider() {
        if (!this.slider) return;

        this.slider.min = 0;
        this.slider.max = this.totalDays;
        this.slider.step = 0.01;
        this.slider.value = 0;
    }

    attachSliderListeners() {
        if (!this.slider) return;

        this.slider.addEventListener('input', () => {
            const t = Number(this.slider.value);
            if (this.rafId) return;
            this.rafId = requestAnimationFrame(() => {
                this.rafId = null;
                this.updateCursor(t);
            });
        });

        this.slider.addEventListener('pointerdown', () => {
            this.isScrubbing = true;
            this.setCursorTransition(false);
        });

        this.slider.addEventListener('pointerup', () => {
            this.isScrubbing = false;
            this.setCursorTransition(true);
        });
    }

    attachHorizontalScrollListener() {
        if (!this.timelineContent) return;

        // Convert vertical mouse wheel to horizontal scroll
        this.timelineContent.addEventListener('wheel', (e) => {
            // Only convert to horizontal scroll if we have horizontal scrollable content
            const hasHorizontalScroll = this.timelineContent.scrollWidth > this.timelineContent.clientWidth;

            if (hasHorizontalScroll) {
                // Prevent default vertical scroll
                e.preventDefault();

                // Apply horizontal scroll based on vertical wheel delta
                // deltaY is positive when scrolling down, negative when scrolling up
                this.timelineContent.scrollLeft += e.deltaY;
            }
        }, { passive: false }); // passive: false allows preventDefault()
    }

    updateCursor(t) {
        this.currentT = t;
        const dayWidth = this.getDayWidth();
        const leftPx = t * dayWidth;
        const totalWidthPx = this.totalDays * dayWidth;

        if (this.cursor) {
            this.cursor.style.left = `${Math.max(0, Math.min(totalWidthPx, leftPx))}px`;
        }

        if (this.progress) {
            this.progress.style.width = `${Math.max(0, Math.min(totalWidthPx, leftPx))}px`;
        }

        // Update label with absolute clock time
        const dayInt = Math.floor(t) + 1;

        if (this.cursorLabel) {
            const formattedTime = formatDayTime(t, this.totalDays, this.routeStartUtc);
            this.cursorLabel.textContent = formattedTime;
        }

        // Update current day label with calendar date
        const currentDayLabel = document.getElementById('currentDayLabel');
        if (currentDayLabel && this.routeStartUtc) {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const calendarDate = this.getCalendarDateForDay(Math.floor(t));
            const month = monthNames[calendarDate.getUTCMonth()];
            const dayNum = calendarDate.getUTCDate();
            currentDayLabel.textContent = `${month} ${dayNum}`;
        } else if (currentDayLabel) {
            currentDayLabel.textContent = `Day ${dayInt} of ${this.totalDays}`;
        }

        // Update current places
        this.updateCurrentPlaces(dayInt);
    }

    updateCurrentPlaces(dayInt) {
        const placesOnDay = this.timelineStops.filter(stop => {
            const startDay = Math.floor(stop.startT) + 1;
            const endDay = Math.ceil(stop.endT);
            return dayInt >= startDay && dayInt <= endDay;
        });

        const container = document.getElementById('currentPlaces');
        if (!container) return;

        container.innerHTML = placesOnDay.map((stop, i) => `
            <div class="place-tag ${i === 0 ? 'active' : ''}">
                <div class="place-dot" style="background: var(--${stop.color});"></div>
                ${stop.name}
            </div>
        `).join('');
    }

    setActiveStop(index) {
        // Remove active class from all bars
        this.barElsByIndex.forEach(bar => bar.classList.remove('active'));

        // Add active class to selected bar
        const bar = this.barElsByIndex.get(index);
        if (bar) {
            bar.classList.add('active');

            // Update selected place time display
            this.updateSelectedPlaceTime(index);

            // Center the timeline on this bar
            this.centerOnStop(index);
        }
    }

    updateSelectedPlaceTime(index) {
        const stop = this.timelineStops[index];
        if (!stop) {
            this.hideSelectedPlaceTime();
            return;
        }

        const selectedPlaceTime = document.getElementById('selectedPlaceTime');
        const selectedPlaceName = document.getElementById('selectedPlaceName');
        const selectedPlaceTimeRange = document.getElementById('selectedPlaceTimeRange');

        if (!selectedPlaceTime || !selectedPlaceName || !selectedPlaceTimeRange) {
            return;
        }

        // Format the time range with absolute clock time
        const startTime = formatDayTime(stop.startT, this.totalDays, this.routeStartUtc);
        const endTime = formatDayTime(stop.endT, this.totalDays, this.routeStartUtc);

        selectedPlaceName.textContent = stop.name;
        selectedPlaceTimeRange.textContent = `${startTime} - ${endTime}`;
        selectedPlaceTime.style.display = 'flex';
    }

    hideSelectedPlaceTime() {
        const selectedPlaceTime = document.getElementById('selectedPlaceTime');
        if (selectedPlaceTime) {
            selectedPlaceTime.style.display = 'none';
        }
    }
    

    centerOnStop(index) {
        if (!this.timelineContent || !this.timelineStops[index]) {
            return;
        }

        const stop = this.timelineStops[index];
        const bar = this.barElsByIndex.get(index);

        if (!bar) return;

        // Calculate the center position of the stop in the timeline
        const dayWidth = this.getDayWidth();
        const stopCenterT = (stop.startT + stop.endT) / 2; // Middle of the stop
        const stopCenterPx = stopCenterT * dayWidth;

        // Calculate the scroll position to center the stop in the viewport
        const containerWidth = this.timelineContent.clientWidth;
        const scrollLeft = stopCenterPx - (containerWidth / 2);

        // Smooth scroll to the calculated position
        this.timelineContent.scrollTo({
            left: Math.max(0, scrollLeft),
            behavior: 'smooth'
        });

        // Update the timeline slider and cursor to the stop's center position
        if (this.slider) {
            this.slider.value = stopCenterT;
            this.updateCursor(stopCenterT);
        }
    }

    setCursorTransition(enabled) {
        if (this.cursor) {
            this.cursor.style.transition = enabled ? 'left 0.1s ease' : 'none';
        }
    }
}

// Global toggle function for timeline panel
window.toggleTimeline = function() {
    const panel = document.getElementById('timelinePanel');
    if (panel) {
        panel.classList.toggle('collapsed');
    }
};
