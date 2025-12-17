import { timelineCoordsToUTC } from './timelineMapper.js';

/**
 * TimelineService - Handles timeline UI rendering and user interactions
 */
export class TimelineService {
    constructor(callbacks) {
        this.callbacks = {
            onStopSelected: callbacks.onStopSelected || (() => {}),
            onStopScheduleChanged: callbacks.onStopScheduleChanged || (() => {}),
            onNeedRecalculateLegs: callbacks.onNeedRecalculateLegs || (() => {})
        };

        this.timelineStops = [];
        this.totalDays = 1;
        this.routeStartUtc = null;
        this.currentT = 0;

        this.barElsByIndex = new Map();
        this.rafId = null;
        this.isScrubbing = false;

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

        // Check if elements exist
        if (!this.ganttWrapper || !this.ganttBarsContainer) {
            console.warn('Timeline DOM elements not found');
            return;
        }

        this.attachSliderListeners();
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

        this.renderDayLabels();
        this.renderDayGrid();
        this.renderBars();
        this.configureSlider();
        this.updateCursor(0);
    }

    renderDayLabels() {
        if (!this.dayLabelsContainer) return;

        this.dayLabelsContainer.innerHTML = '';
        for (let day = 1; day <= this.totalDays; day++) {
            const label = document.createElement('div');
            label.className = 'day-label';
            label.textContent = `Day ${day}`;
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
        const leftPercent = (stop.startT / this.totalDays) * 100;
        const widthPercent = ((stop.endT - stop.startT) / this.totalDays) * 100;

        barEl.style.left = `${leftPercent}%`;
        barEl.style.width = `${widthPercent}%`;

        barEl.dataset.startT = stop.startT;
        barEl.dataset.endT = stop.endT;
    }

    attachBarDragResize(barEl, stop, index) {
        const MIN_DUR = 0.05; // ~1.2 hours
        let mode = null;
        let startX = 0;
        let startStartT = 0;
        let startEndT = 0;

        const pxToT = (deltaPx) => {
            const rect = this.ganttWrapper.getBoundingClientRect();
            return (deltaPx / rect.width) * this.totalDays;
        };

        const onPointerMove = (e) => {
            const dx = e.clientX - startX;
            const dt = pxToT(dx);

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
            mode = null;

            // Save to backend
            console.log(`Saving schedule for stop: ${stop.name}`);
            await this.saveStopSchedule(stop);

            // Optionally recalculate legs
            // this.callbacks.onNeedRecalculateLegs();

            this.relayoutRows();
        };

        barEl.addEventListener('pointerdown', (e) => {
            const isLeft = e.target.classList.contains('left');
            const isRight = e.target.classList.contains('right');

            if (!isLeft && !isRight && !e.currentTarget.classList.contains('gantt-bar')) return;

            e.preventDefault();
            e.stopPropagation(); // Prevent click event

            mode = isLeft ? 'resizeL' : isRight ? 'resizeR' : 'move';
            startX = e.clientX;
            startStartT = stop.startT;
            startEndT = stop.endT;

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
                timeZoneId: null, // Use route default
                plannedStart: startUtc,
                plannedEnd: endUtc,
                stayNights: null, // Let backend recalculate
                stayDurationMinutes: null,
                isStartLocked: true, // Lock after manual edit
                isEndLocked: true
            });
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

    updateCursor(t) {
        this.currentT = t;
        const pct = (t / this.totalDays) * 100;

        if (this.cursor) {
            this.cursor.style.left = `${Math.max(0, Math.min(100, pct))}%`;
        }

        if (this.progress) {
            this.progress.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        }

        // Update label
        const dayInt = Math.floor(t) + 1;
        const minutes = Math.round((t - Math.floor(t)) * 24 * 60);
        const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
        const mm = String(minutes % 60).padStart(2, '0');

        if (this.cursorLabel) {
            this.cursorLabel.textContent = `Day ${dayInt} · ${hh}:${mm}`;
        }

        // Update current day label
        const currentDayLabel = document.getElementById('currentDayLabel');
        if (currentDayLabel) {
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
