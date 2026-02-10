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
            onLegScheduleChanged: callbacks.onLegScheduleChanged || (() => {}),
            onNeedRecalculateLegs: callbacks.onNeedRecalculateLegs || (() => {}),
            onResolveConflictByReorder: callbacks.onResolveConflictByReorder || (() => {}),
            onLegClicked: callbacks.onLegClicked || (() => {})
        };

        this.timelineStops = [];
        this.timelineLegs = [];
        this.totalDays = 1;
        this.routeStartUtc = null;
        this.currentT = 0;

        this.barElsByIndex = new Map();
        this.legBarElsByIndex = new Map();
        this.rafId = null;
        this.isScrubbing = false;

        this.conflictUI = new ConflictUIManager();
        this.currentConflicts = null;

        // Zoom level: 1.0 = 100%, 0.5 = 50%, 2.0 = 200%
        this.zoomLevel = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 3.0;
        this.zoomStep = 0.25;

        this.initDOM();
        this.initZoomControls();
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

    initZoomControls() {
        const zoomInBtn = document.getElementById('timelineZoomIn');
        const zoomOutBtn = document.getElementById('timelineZoomOut');
        const zoomLabel = document.getElementById('timelineZoomLabel');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }

        this.zoomLabel = zoomLabel;
        this.updateZoomLabel();
    }

    zoomIn() {
        if (this.zoomLevel < this.maxZoom) {
            this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel + this.zoomStep);
            this.rerender();
            this.updateZoomLabel();
        }
    }

    zoomOut() {
        if (this.zoomLevel > this.minZoom) {
            this.zoomLevel = Math.max(this.minZoom, this.zoomLevel - this.zoomStep);
            this.rerender();
            this.updateZoomLabel();
        }
    }

    updateZoomLabel() {
        if (this.zoomLabel) {
            this.zoomLabel.textContent = `${Math.round(this.zoomLevel * 100)}%`;
        }
    }

    rerender() {
        // Re-render without fetching new data
        if (this.timelineStops.length > 0 || this.timelineLegs.length > 0) {
            this.render(this.timelineStops, this.totalDays, this.routeStartUtc, this.timelineLegs);
        }
    }

    render(timelineStops, totalDays, routeStartUtc, timelineLegs = []) {
        console.log(`Timeline render: ${timelineStops.length} stops, ${timelineLegs.length} legs, ${totalDays} days`);

        // Check if DOM elements are available
        if (!this.ganttWrapper || !this.ganttBarsContainer) {
            console.warn('Timeline DOM not ready, skipping render');
            return;
        }

        this.timelineStops = timelineStops;
        this.timelineLegs = timelineLegs;
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
        this.renderLegBars();
        this.configureSlider();
        this.updateCursor(0);
    }

    /**
     * Render timeline with conflict information
     * @param {Array} timelineStops - Array of timeline stop data
     * @param {number} totalDays - Total number of days
     * @param {string} routeStartUtc - Route start date/time in UTC
     * @param {Object} conflictInfo - Conflict information from backend
     * @param {Array} timelineLegs - Array of timeline leg data (optional)
     */
    renderWithConflicts(timelineStops, totalDays, routeStartUtc, conflictInfo, timelineLegs = []) {
        // Call existing render method
        this.render(timelineStops, totalDays, routeStartUtc, timelineLegs);

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
        // Return day width based on screen size, multiplied by zoom level
        const baseWidth = window.innerWidth <= 768 ? 80 : 120;
        return baseWidth * this.zoomLevel;
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
        const dayWidth = this.getDayWidth();

        this.dayLabelsContainer.innerHTML = '';
        for (let day = 1; day <= this.totalDays; day++) {
            const label = document.createElement('div');
            label.className = 'day-label';
            label.style.width = `${dayWidth}px`;
            label.style.minWidth = `${dayWidth}px`;

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

        const dayWidth = this.getDayWidth();

        this.ganttGrid.innerHTML = '';
        for (let day = 1; day <= this.totalDays; day++) {
            const col = document.createElement('div');
            col.className = 'day-column';
            col.style.width = `${dayWidth}px`;
            col.style.minWidth = `${dayWidth}px`;
            col.dataset.day = day;
            this.ganttGrid.appendChild(col);
        }
    }

    renderBars() {
        if (!this.ganttBarsContainer) return;

        this.ganttBarsContainer.innerHTML = '';
        this.barElsByIndex.clear();
        this.legBarElsByIndex.clear();

        this.timelineStops.forEach((stop, index) => {
            const bar = this.createBar(stop, index);
            this.ganttBarsContainer.appendChild(bar);
            this.barElsByIndex.set(index, bar);
        });

        // Note: relayoutRows is called after renderLegBars
    }

    renderLegBars() {
        if (!this.ganttBarsContainer || !this.timelineLegs.length) return;

        console.log(`Rendering ${this.timelineLegs.length} leg bars`);

        this.timelineLegs.forEach((leg, index) => {
            const bar = this.createLegBar(leg, index);
            this.ganttBarsContainer.appendChild(bar);
            this.legBarElsByIndex.set(index, bar);
        });

        this.relayoutRows();
    }

    createLegBar(leg, index) {
        const bar = document.createElement('div');
        bar.className = 'gantt-bar gantt-leg-bar';
        bar.dataset.index = index;
        bar.dataset.isLeg = 'true';

        // Tooltip with route details
        const distanceKm = (leg.distanceMeters / 1000).toFixed(1);
        bar.dataset.tooltip = `${leg.fromPlaceName} → ${leg.toPlaceName} (${distanceKm} km)`;

        // Label with car icon and duration
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.innerHTML = `<i class="fas fa-car"></i> ${this.formatDuration(leg.durationSeconds)}`;
        bar.appendChild(label);

        // Position bar
        this.updateBarPosition(bar, leg);

        // Leg bars are display-only in chain mode (position determined by adjacent places)
        bar.style.cursor = 'default';

        // Click to show segment popup on map
        bar.addEventListener('click', () => {
            if (bar.classList.contains('moving')) return;
            this.callbacks.onLegClicked(index, leg);
        });

        return bar;
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    attachLegDragHandler(barEl, leg, index) {
        let startX = 0;
        let startStartT = 0;
        let startEndT = 0;
        let hasMoved = false;

        // Store original place positions for restoring on cancel
        let originalFromStopEndT = null;
        let originalToStopStartT = null;

        const pxToT = (deltaPx) => {
            const rect = this.ganttWrapper.getBoundingClientRect();
            return (deltaPx / rect.width) * this.totalDays;
        };

        const onPointerMove = (e) => {
            const dx = e.clientX - startX;
            const dt = pxToT(dx);

            if (Math.abs(dx) > 2) {
                hasMoved = true;
            }

            // Leg duration stays constant - only shifts in time
            const duration = startEndT - startStartT;
            let newStart = startStartT + dt;

            // Find connected places
            const fromStop = this.timelineStops.find(s => s.routePlaceId === leg.fromRoutePlaceId);
            const toStop = this.timelineStops.find(s => s.routePlaceId === leg.toRoutePlaceId);

            // Clamp leg to valid range
            // Leg can't start before fromPlace starts (minimum the beginning of fromPlace)
            const minStart = fromStop ? fromStop.startT + 0.01 : 0;
            // Leg can't end after toPlace ends (maximum the end of toPlace)
            const maxEnd = toStop ? toStop.endT - 0.01 : this.totalDays;

            newStart = Math.max(minStart, Math.min(newStart, maxEnd - duration));
            const newEnd = newStart + duration;

            leg.startT = newStart;
            leg.endT = newEnd;

            // NO-GAPS ENFORCEMENT: Update connected places in real-time
            if (fromStop) {
                fromStop.endT = leg.startT; // fromPlace ends when leg starts
                const fromBarIndex = this.timelineStops.findIndex(s => s === fromStop);
                const fromBar = this.barElsByIndex.get(fromBarIndex);
                if (fromBar) this.updateBarPosition(fromBar, fromStop);
            }

            if (toStop) {
                toStop.startT = leg.endT; // toPlace starts when leg ends
                const toBarIndex = this.timelineStops.findIndex(s => s === toStop);
                const toBar = this.barElsByIndex.get(toBarIndex);
                if (toBar) this.updateBarPosition(toBar, toStop);
            }

            this.updateBarPosition(barEl, leg);
        };

        const onPointerUp = async () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);

            barEl.classList.remove('moving');

            if (hasMoved) {
                console.log(`Saving leg and connected places`);
                await this.saveLegAndConnectedPlaces(leg);
                this.relayoutRows();
            }

            hasMoved = false;
        };

        barEl.addEventListener('pointerdown', (e) => {
            // Don't start drag on label click
            if (e.target.classList.contains('bar-label')) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            startX = e.clientX;
            startStartT = leg.startT;
            startEndT = leg.endT;
            hasMoved = false;

            // Store original positions for connected places
            const fromStop = this.timelineStops.find(s => s.routePlaceId === leg.fromRoutePlaceId);
            const toStop = this.timelineStops.find(s => s.routePlaceId === leg.toRoutePlaceId);
            originalFromStopEndT = fromStop ? fromStop.endT : null;
            originalToStopStartT = toStop ? toStop.startT : null;

            barEl.classList.add('moving');
            barEl.setPointerCapture(e.pointerId);

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        });
    }

    async saveLegAndConnectedPlaces(leg) {
        const fromStop = this.timelineStops.find(s => s.routePlaceId === leg.fromRoutePlaceId);
        const toStop = this.timelineStops.find(s => s.routePlaceId === leg.toRoutePlaceId);

        try {
            // Save connected places first (they have the no-gaps times)
            if (fromStop) {
                await this.saveStopSchedule(fromStop);
            }
            if (toStop) {
                await this.saveStopSchedule(toStop);
            }

            // Then save leg schedule
            const { startUtc, endUtc } = timelineCoordsToUTC(
                leg.startT,
                leg.endT,
                this.routeStartUtc
            );

            await this.callbacks.onLegScheduleChanged(leg.legId, {
                plannedStart: startUtc,
                plannedEnd: endUtc
            });

            console.log(`Successfully saved leg and connected places`);
        } catch (error) {
            console.error('Failed to save leg schedule:', error);
        }
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
    }

    /**
     * Cascade chain forward from a given stop index.
     * Updates all subsequent legs and stops to maintain the continuous chain (no gaps).
     * @param {number} fromIndex - Index of the stop whose endT is the starting point
     */
    cascadeFromStop(fromIndex) {
        let currentTime = this.timelineStops[fromIndex].endT;

        for (let i = fromIndex; i < this.timelineStops.length - 1; i++) {
            // Update leg between stop[i] and stop[i+1]
            const leg = this.timelineLegs[i];
            if (leg) {
                const legDuration = leg.durationSeconds / (24 * 60 * 60);
                leg.startT = currentTime;
                leg.endT = currentTime + legDuration;
                currentTime = leg.endT;
            }

            // Update next stop (preserve its duration)
            const nextStop = this.timelineStops[i + 1];
            const nextDuration = nextStop.endT - nextStop.startT;
            nextStop.startT = currentTime;
            nextStop.endT = currentTime + nextDuration;
            currentTime = nextStop.endT;
        }
    }

    /**
     * Cascade chain backward from a given stop index.
     * Adjusts the preceding place's endT based on the current stop's startT.
     * @param {number} stopIndex - Index of the stop whose startT changed
     */
    cascadeBackward(stopIndex) {
        if (stopIndex <= 0) return;

        const MIN_DUR = 0.05;
        const stop = this.timelineStops[stopIndex];
        const prevLeg = this.timelineLegs[stopIndex - 1];
        const prevStop = this.timelineStops[stopIndex - 1];

        if (prevLeg && prevStop) {
            const legDuration = prevLeg.durationSeconds / (24 * 60 * 60);
            // Leg must end at stop.startT
            prevLeg.endT = stop.startT;
            prevLeg.startT = stop.startT - legDuration;

            // Previous stop must end when leg starts
            prevStop.endT = Math.max(prevStop.startT + MIN_DUR, prevLeg.startT);
        }
    }

    /**
     * Update DOM positions of all bars (stops and legs)
     */
    updateAllBarPositions() {
        this.timelineStops.forEach((stop, idx) => {
            const bar = this.barElsByIndex.get(idx);
            if (bar) this.updateBarPosition(bar, stop);
        });

        this.timelineLegs.forEach((leg, idx) => {
            const bar = this.legBarElsByIndex.get(idx);
            if (bar) this.updateBarPosition(bar, leg);
        });
    }

    attachBarDragResize(barEl, stop, index) {
        const MIN_DUR = 0.05; // ~1.2 hours
        let mode = null;
        let startX = 0;
        let startStartT = 0;
        let startEndT = 0;
        let hasMoved = false;

        const pxToT = (deltaPx) => {
            const rect = this.ganttWrapper.getBoundingClientRect();
            return (deltaPx / rect.width) * this.totalDays;
        };

        const onPointerMove = (e) => {
            const dx = e.clientX - startX;
            const dt = pxToT(dx);

            if (Math.abs(dx) > 2) {
                hasMoved = true;
            }

            if (mode === 'resizeL') {
                // Left resize: change start time, adjust preceding place
                const newStart = Math.max(0, Math.min(startStartT + dt, stop.endT - MIN_DUR));
                stop.startT = newStart;
                // Cascade backward: adjust preceding place's end time through the preceding leg
                this.cascadeBackward(index);
            } else if (mode === 'resizeR') {
                // Right resize: change end time, cascade everything forward
                stop.endT = Math.max(stop.startT + MIN_DUR, startEndT + dt);
                this.cascadeFromStop(index);
            } else if (mode === 'move') {
                // Move: shift this stop, adjust preceding place, cascade forward
                const dur = startEndT - startStartT;
                const newStart = Math.max(0, startStartT + dt);
                stop.startT = newStart;
                stop.endT = newStart + dur;
                // Cascade backward (adjust preceding place)
                this.cascadeBackward(index);
                // Cascade forward (adjust all following items)
                this.cascadeFromStop(index);
            }

            // Update ALL bar positions (chain cascade affects multiple bars)
            this.updateAllBarPositions();
        };

        const onPointerUp = async () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);

            barEl.classList.remove('resizing', 'moving');

            if (hasMoved) {
                console.log(`Saving schedule for stop: ${stop.name}`);
                // Save the edited stop - backend will cascade to all following items
                await this.saveStopSchedule(stop);

                // If we cascaded backward, also save the preceding place
                if ((mode === 'resizeL' || mode === 'move') && index > 0) {
                    const prevStop = this.timelineStops[index - 1];
                    if (prevStop) {
                        await this.saveStopSchedule(prevStop);
                    }
                }

                this.relayoutRows();
            }

            mode = null;
            hasMoved = false;
        };

        barEl.addEventListener('pointerdown', (e) => {
            const isLeft = e.target.classList.contains('left');
            const isRight = e.target.classList.contains('right');

            if (!isLeft && !isRight) {
                if (e.target.classList.contains('bar-label')) {
                    return;
                }
            }

            e.preventDefault();
            e.stopPropagation();

            mode = isLeft ? 'resizeL' : isRight ? 'resizeR' : 'move';
            startX = e.clientX;
            startStartT = stop.startT;
            startEndT = stop.endT;
            hasMoved = false;

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
            await this.callbacks.onStopScheduleChanged(stop.routePlaceId, {
                stopType: stop.stopType,
                timeZoneId: null,
                plannedStart: startUtc,
                plannedEnd: endUtc,
                stayNights: null,
                stayDurationMinutes: null,
                isStartLocked: true,
                isEndLocked: true
            });

            console.log(`Successfully saved schedule for ${stop.name}`);
        } catch (error) {
            console.error(`Failed to save schedule for ${stop.name}:`, error);
        }
    }

    relayoutRows() {
        // Chain mode: all items are on a single row (no overlaps in a continuous chain)
        const PLACE_HEIGHT = 36;
        const LEG_HEIGHT = 24;
        const ROW_HEIGHT = 45;

        // Place bars at top of the single row
        this.timelineStops.forEach((stop, index) => {
            const barEl = this.barElsByIndex.get(index);
            if (barEl) {
                barEl.style.top = '0px';
                barEl.style.height = `${PLACE_HEIGHT}px`;
            }
        });

        // Leg bars vertically centered within the same row
        const legTop = (PLACE_HEIGHT - LEG_HEIGHT) / 2;
        this.timelineLegs.forEach((leg, index) => {
            const barEl = this.legBarElsByIndex.get(index);
            if (barEl) {
                barEl.style.top = `${legTop}px`;
                barEl.style.height = `${LEG_HEIGHT}px`;
            }
        });

        // Set container height for the single row
        this.ganttBarsContainer.style.height = `${ROW_HEIGHT + 10}px`;
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
        const leftPx = ((t) * dayWidth*0.9973)+(dayWidth*0.063);
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
