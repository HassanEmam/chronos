/*
 * Gantt Chart Manager
 * Based on Vega hierarchical Gantt chart concepts
 */

export class GanttChart {
    constructor(app) {
        this.app = app;
        this.config = {
            rowHeight: 30,
            columnWidth: 60,
            leftPanelWidth: 520, // Increased to accommodate new date columns
            dateGranularity: 'day', // 'day', 'week', 'month'
            showProgress: true,
            showDependencies: false,
            colors: {
                taskBar: '#4A90E2',
                progressBar: '#7ED321',
                wbsBar: '#4CAF50',
                wbsProgress: '#2E7D32',
                milestone: '#F5A623',
                dependency: '#9013FE',
                criticalPath: '#D0021B',
                background: '#F8F9FA',
                gridLines: '#E1E4E8',
                text: '#24292E'
            }
        };
        
        this.ganttData = null;
        this.expandedItems = new Set();
        this.selectedTask = null;
        this.scrollPosition = { x: 0, y: 0 };
        this.dateRange = { start: null, end: null };
        this.timeScale = null;
        this.columnWidths = {
            index: 40,
            name: 180,
            start: 80,
            finish: 80,
            duration: 60,
            progress: 70
        };
        this.isResizing = false;
        this.resizeStartX = 0;
        this.resizeColumn = null;
        this.zoomLevel = 60; // Default zoom level (column width in pixels)
        
        // Performance optimization properties
        this.renderingScheduled = false;
        this.lastVisibleItems = null;
        this.cachedElements = new Map();
        this.virtualScrolling = {
            enabled: false, // Start disabled, enable automatically for large datasets
            threshold: 100, // Enable when more than 100 items
            buffer: 10,     // Render 10 extra items above/below viewport
            viewportHeight: 600,
            itemHeight: 30
        };
    }

    initializeGantt() {
        console.log('🎯 Initializing Gantt chart...');
        
        if (!this.app.currentReader) {
            console.error('❌ No currentReader available');
            this.app.uiManager.showError('No project data available for Gantt chart.');
            return;
        }
        
        if (!this.app.allActivities || !this.app.allActivities.length) {
            console.error('❌ No activities available:', this.app.allActivities);
            this.app.uiManager.showError('No activities available for Gantt chart.');
            return;
        }
        
        console.log('✅ Data validation passed:', {
            reader: !!this.app.currentReader,
            activities: this.app.allActivities.length,
            wbs: this.app.currentReader.wbs ? this.app.currentReader.wbs.length : 0
        });

        this.app.uiManager.showLoading(true, 'Preparing Gantt chart...');
        
        setTimeout(() => {
            try {
                console.log('📊 Preparing Gantt data...');
                this.prepareGanttData();
                
                console.log('🏗️ Creating Gantt HTML...');
                this.createGanttHTML();
                
                console.log('🎨 Rendering Gantt chart...');
                this.renderGanttChart();
                
                console.log('🎧 Setting up event listeners...');
                this.setupEventListeners();
                
                console.log('✅ Gantt chart initialized successfully');
            } catch (error) {
                console.error('❌ Gantt chart error:', error);
                this.app.uiManager.showError(`Error creating Gantt chart: ${error.message}`);
            } finally {
                this.app.uiManager.showLoading(false);
            }
        }, 100);
    }

    prepareGanttData() {
        const activities = this.app.allActivities;
        const relationships = this.app.currentReader.relationships || [];
        
        console.log('📊 Preparing Gantt data with:', {
            activities: activities.length,
            relationships: relationships.length,
            wbs: this.app.currentReader.wbs ? this.app.currentReader.wbs.length : 0
        });
        
        // Build hierarchical structure
        this.ganttData = this.buildHierarchy(activities, relationships);
        
        console.log('🏗️ Built hierarchy:', {
            rootItems: this.ganttData.length,
            totalVisible: this.getFullVisibleItems().length
        });
        
        // Calculate date range
        this.calculateDateRange();
        
        // Create time scale
        this.createTimeScale();
        
        // Process dependencies
        this.processDependencies(relationships);
    }

    buildHierarchy(activities, relationships) {
        const hierarchy = new Map();
        const rootItems = [];
        const wbsItems = new Map();

        // Defensive: get WBS data from app.currentReader, fallback to []
        let wbsData = [];
        if (this.app && this.app.currentReader && Array.isArray(this.app.currentReader.wbs)) {
            wbsData = this.app.currentReader.wbs;
        }

        // First, create WBS items
        wbsData.forEach(wbs => {
            const wbsItem = {
                id: wbs.wbs_id,
                code: wbs.wbs_id,
                name: wbs.wbs_name,
                startDate: null, // Will be calculated from children
                endDate: null,   // Will be calculated from children
                duration: 0,     // Will be calculated from children
                progress: 0,     // Will be calculated from children
                isMilestone: false,
                isCritical: false,
                status: 'WBS',
                level: 0, // Will be calculated based on hierarchy depth
                children: [],
                parent: null,
                dependencies: [],
                isExpanded: true,
                isVisible: true,
                isWBS: true
            };
            wbsItems.set(wbs.wbs_id, wbsItem);
            hierarchy.set(wbs.wbs_id, wbsItem);
        });

        // Build WBS parent-child relationships
        wbsData.forEach(wbs => {
            const wbsItem = wbsItems.get(wbs.wbs_id);
            if (wbs.parent_wbs_id && wbsItems.has(wbs.parent_wbs_id)) {
                const parent = wbsItems.get(wbs.parent_wbs_id);
                parent.children.push(wbsItem);
                wbsItem.parent = parent;
                wbsItem.level = parent.level + 1;
            } else {
                rootItems.push(wbsItem);
            }
        });

        // Add activities to their corresponding WBS
        let activitiesWithWBS = 0;
        let activitiesWithoutWBS = 0;
        
        activities.forEach(activity => {
            // Safe date parsing with fallbacks
            const startDateValue = activity.early_start_date || activity.act_start_date;
            const endDateValue = activity.early_end_date || activity.act_end_date;
            
            let startDate = null;
            let endDate = null;
            
            if (startDateValue) {
                try {
                    startDate = new Date(startDateValue);
                    if (isNaN(startDate.getTime())) startDate = null;
                } catch (e) {
                    startDate = null;
                }
            }
            
            if (endDateValue) {
                try {
                    endDate = new Date(endDateValue);
                    if (isNaN(endDate.getTime())) endDate = null;
                } catch (e) {
                    endDate = null;
                }
            }
            
            const item = {
                id: activity.task_id,
                code: activity.task_code,
                name: activity.task_name,
                startDate: startDate,
                endDate: endDate,
                duration: parseFloat(activity.target_drtn_hr_cnt || 0),
                progress: parseFloat(activity.phys_complete_pct || 0) / 100,
                isMilestone: (activity.target_drtn_hr_cnt || 0) === 0,
                isCritical: parseFloat(activity.total_float_hr_cnt || 0) === 0,
                status: activity.status_code,
                level: 0, // Will be set based on WBS parent
                children: [],
                parent: null,
                dependencies: [],
                isExpanded: true,
                isVisible: true,
                isWBS: false
            };
            
            // Link activity to its WBS
            if (activity.wbs_id && wbsItems.has(activity.wbs_id)) {
                const wbsParent = wbsItems.get(activity.wbs_id);
                wbsParent.children.push(item);
                item.parent = wbsParent;
                item.level = wbsParent.level + 1;
                activitiesWithWBS++;
            } else {
                // If no WBS link, add to root
                rootItems.push(item);
                activitiesWithoutWBS++;
                console.warn('Activity without WBS:', activity.task_code, activity.wbs_id);
            }
            hierarchy.set(activity.task_id, item);
        });
        
        console.log('📋 Activity distribution:', {
            withWBS: activitiesWithWBS,
            withoutWBS: activitiesWithoutWBS,
            totalActivities: activities.length
        });

        // Calculate aggregated dates and progress for WBS items
        this.calculateWBSAggregates(wbsItems);

        // Filter out empty WBS items (WBS with no children)
        this.filterEmptyWBS(rootItems, wbsItems);

        // Sort hierarchy
        this.sortHierarchy(rootItems);

        return rootItems;
    }

    calculateWBSAggregates(wbsItems) {
        // Calculate aggregated values for WBS items bottom-up
        const calculateForWBS = (wbsItem) => {
            if (wbsItem.children.length === 0) {
                // Leaf WBS with no children - set to null dates
                wbsItem.startDate = null;
                wbsItem.endDate = null;
                wbsItem.duration = 0;
                wbsItem.progress = 0;
                return;
            }
            
            // First, recursively calculate for child WBS items
            const wbsChildren = wbsItem.children.filter(child => child.isWBS);
            wbsChildren.forEach(child => calculateForWBS(child));
            
            // Get all leaf activities (non-WBS children)
            const activities = wbsItem.children.filter(child => !child.isWBS);
            
            // Get all child items with valid dates (activities + child WBS with dates)
            const itemsWithDates = wbsItem.children.filter(child => 
                child.startDate && child.endDate
            );
            
            if (itemsWithDates.length > 0) {
                // Calculate start date (earliest)
                wbsItem.startDate = new Date(Math.min(
                    ...itemsWithDates.map(child => child.startDate.getTime())
                ));
                
                // Calculate end date (latest)
                wbsItem.endDate = new Date(Math.max(
                    ...itemsWithDates.map(child => child.endDate.getTime())
                ));
                
                // Calculate total duration
                wbsItem.duration = itemsWithDates.reduce((sum, child) => 
                    sum + (child.duration || 0), 0
                );
                
                // Calculate weighted progress
                const totalDuration = wbsItem.duration;
                if (totalDuration > 0) {
                    wbsItem.progress = itemsWithDates.reduce((sum, child) => 
                        sum + ((child.duration || 0) * (child.progress || 0)), 0
                    ) / totalDuration;
                } else {
                    wbsItem.progress = 0;
                }
            } else {
                // No children with dates
                wbsItem.startDate = null;
                wbsItem.endDate = null;
                wbsItem.duration = 0;
                wbsItem.progress = 0;
            }
        };
        
        // Start calculation from root WBS items
        wbsItems.forEach(wbsItem => {
            if (!wbsItem.parent) {
                calculateForWBS(wbsItem);
            }
        });
    }

    filterEmptyWBS(rootItems, wbsItems) {
        // Recursively filter out WBS items that have no children
        const filterWBSRecursive = (items) => {
            return items.filter(item => {
                if (item.isWBS) {
                    // First, recursively filter children
                    item.children = filterWBSRecursive(item.children);
                    
                    // Keep WBS only if it has children after filtering
                    if (item.children.length === 0) {
                        // Remove from wbsItems map as well
                        wbsItems.delete(item.id);
                        return false;
                    }
                }
                return true;
            });
        };

        // Filter root items and update the array in place
        const filteredItems = filterWBSRecursive(rootItems);
        rootItems.length = 0; // Clear original array
        rootItems.push(...filteredItems); // Add filtered items back
    }

    calculateWBSLevel(taskCode) {
        if (!taskCode) return 0;
        return (taskCode.match(/\./g) || []).length;
    }

    getParentWBS(taskCode) {
        if (!taskCode || !taskCode.includes('.')) return null;
        return taskCode.substring(0, taskCode.lastIndexOf('.'));
    }

    sortHierarchy(items) {
        items.sort((a, b) => {
            // Sort WBS items first, then activities
            if (a.isWBS && !b.isWBS) return -1;
            if (!a.isWBS && b.isWBS) return 1;
            
            // Within same type, sort by code if available, otherwise by name
            if (a.code && b.code) {
                return a.code.localeCompare(b.code, undefined, { numeric: true });
            }
            return a.name.localeCompare(b.name);
        });
        
        items.forEach(item => {
            if (item.children.length > 0) {
                this.sortHierarchy(item.children);
            }
        });
    }

    calculateDateRange() {
        let minDate = new Date();
        let maxDate = new Date();
        
        const allItems = this.flattenHierarchy(this.ganttData);
        const itemsWithValidDates = allItems.filter(item => 
            item.startDate && item.endDate && 
            !isNaN(item.startDate.getTime()) && !isNaN(item.endDate.getTime())
        );
        
        if (itemsWithValidDates.length > 0) {
            minDate = new Date(Math.min(...itemsWithValidDates.map(item => item.startDate.getTime())));
            maxDate = new Date(Math.max(...itemsWithValidDates.map(item => item.endDate.getTime())));
            
            // Add padding
            const padding = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
            minDate = new Date(minDate.getTime() - padding);
            maxDate = new Date(maxDate.getTime() + padding);
        } else {
            // Fallback to current date range if no valid dates
            const today = new Date();
            minDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
        }
        
        this.dateRange = { start: minDate, end: maxDate };
    }

    flattenHierarchy(items, result = []) {
        items.forEach(item => {
            result.push(item);
            if (item.children.length > 0) {
                this.flattenHierarchy(item.children, result);
            }
        });
        return result;
    }

    createTimeScale() {
        const totalDays = Math.ceil((this.dateRange.end - this.dateRange.start) / (24 * 60 * 60 * 1000));
        const chartWidth = Math.max(totalDays * this.config.columnWidth, 800);
        
        this.timeScale = {
            totalDays,
            chartWidth,
            pixelsPerDay: chartWidth / totalDays,
            getX: (date) => {
                const dayOffset = (date - this.dateRange.start) / (24 * 60 * 60 * 1000);
                return dayOffset * this.timeScale.pixelsPerDay;
            }
        };
    }

    processDependencies(relationships) {
        relationships.forEach(rel => {
            const predecessorId = rel.pred_task_id;
            const successorId = rel.task_id;
            
            const allItems = this.flattenHierarchy(this.ganttData);
            const successor = allItems.find(item => item.id === successorId);
            
            if (successor) {
                successor.dependencies.push({
                    predecessorId,
                    type: rel.pred_type || 'FS',
                    lag: parseFloat(rel.lag_hr_cnt || 0)
                });
            }
        });
    }

    createGanttHTML() {
        const container = document.getElementById('ganttResults');
        
        container.innerHTML = `
            <div class="gantt-container">
                <div class="gantt-toolbar">
                    <div class="gantt-controls">
                        <button id="ganttExpandAll" class="gantt-btn">
                            <span>📂</span> Expand All
                        </button>
                        <button id="ganttCollapseAll" class="gantt-btn">
                            <span>📁</span> Collapse All
                        </button>
                        <select id="ganttTimeScale" class="gantt-select">
                            <option value="day">Daily</option>
                            <option value="week">Weekly</option>
                            <option value="month">Monthly</option>
                        </select>
                        <button id="ganttFitToScreen" class="gantt-btn">
                            <span>🔍</span> Fit to Screen
                        </button>
                        <label class="gantt-checkbox">
                            <input type="checkbox" id="ganttShowProgress" checked>
                            Show Progress
                        </label>
                        <label class="gantt-checkbox">
                            <input type="checkbox" id="ganttShowDependencies" >
                            Show Dependencies
                        </label>
                        <div class="gantt-zoom-control">
                            <label for="ganttZoomSlider">Zoom:</label>
                            <input type="range" id="ganttZoomSlider" min="1" max="120" value="60" step="1" class="gantt-zoom-slider">
                            <span id="ganttZoomValue">60px</span>
                        </div>
                    </div>
                    <div class="gantt-info">
                        <span id="ganttItemCount">0 tasks</span>
                    </div>
                </div>
                
                <div class="gantt-main">
                    <div class="gantt-left-panel" id="ganttLeftPanel">
                        <div class="gantt-header" id="ganttHeader">
                            <div class="gantt-header-cell" style="width: 40px;" data-column="index">
                                #
                                <div class="resize-handle" data-column="index"></div>
                            </div>
                            <div class="gantt-header-cell" style="width: 180px;" data-column="name">
                                Task Name
                                <div class="resize-handle" data-column="name"></div>
                            </div>
                            <div class="gantt-header-cell" style="width: 80px;" data-column="start">
                                Start Date
                                <div class="resize-handle" data-column="start"></div>
                            </div>
                            <div class="gantt-header-cell" style="width: 80px;" data-column="finish">
                                Finish Date
                                <div class="resize-handle" data-column="finish"></div>
                            </div>
                            <div class="gantt-header-cell" style="width: 60px;" data-column="duration">
                                Duration
                                <div class="resize-handle" data-column="duration"></div>
                            </div>
                            <div class="gantt-header-cell" style="width: 70px;" data-column="progress">
                                Progress
                            </div>
                        </div>
                        <div class="gantt-tasks" id="ganttTasks"></div>
                    </div>
                    
                    <div class="gantt-right-panel" id="ganttRightPanel">
                        <div class="gantt-timeline-header" id="ganttTimelineHeader"></div>
                        <div class="gantt-chart-area" id="ganttChartArea">
                            <div class="gantt-grid" id="ganttGrid"></div>
                            <div class="gantt-bars" id="ganttBars"></div>
                            <div class="gantt-dependencies" id="ganttDependencies"></div>
                            <div class="gantt-today-line" id="ganttTodayLine"></div>
                        </div>
                    </div>
                </div>
                
                <div class="gantt-legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background: ${this.config.colors.taskBar};"></div>
                        <span>Task</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color milestone"></div>
                        <span>Milestone</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: ${this.config.colors.criticalPath};"></div>
                        <span>Critical Path</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: ${this.config.colors.progressBar};"></div>
                        <span>Progress</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderGanttChart() {
        // Safety check: Don't render if no data is available
        if (!this.ganttData || !Array.isArray(this.ganttData) || this.ganttData.length === 0) {
            console.warn('No Gantt data available for rendering');
            return;
        }
        
        // Debounced rendering to prevent excessive updates
        if (this.renderingScheduled) return;
        
        // Performance optimization: Check if virtual scrolling should be enabled
        this.checkDataSize();
        
        this.renderingScheduled = true;
        requestAnimationFrame(() => {
            this.renderLeftPanel();
            this.renderTimelineHeader();
            this.renderGrid();
            this.renderBars();
            if (this.config.showDependencies) {
                this.renderDependencies();
            }
            this.renderTodayLine();
            this.updateItemCount();
            this.renderingScheduled = false;
        });
    }

    renderLeftPanel() {
        const tasksContainer = document.getElementById('ganttTasks');
        const visibleItems = this.getVisibleItems();
        
        // Check if we need to re-render (performance optimization)
        if (this.lastVisibleItems && 
            JSON.stringify(visibleItems.map(i => i.id)) === JSON.stringify(this.lastVisibleItems.map(i => i.id))) {
            return; // No changes in visible items
        }
        
        this.lastVisibleItems = visibleItems;
        
        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        let html = '';
        visibleItems.forEach((item, index) => {
            const indent = item.level * 20;
            const hasChildren = item.children.length > 0;
            const isExpanded = this.expandedItems.has(item.id) || item.isExpanded;
            const expandIcon = hasChildren ? (isExpanded ? '▼' : '▶') : '';
            
            // Different styling for WBS vs Activities
            const rowClass = item.isWBS ? 'gantt-wbs-row' : 'gantt-task-row';
            const criticalClass = item.isCritical ? 'critical' : '';
            
            html += `
                <div class="${rowClass} ${criticalClass}" 
                     data-task-id="${item.id}" 
                     style="height: ${this.config.rowHeight}px;">
                    <div class="gantt-task-cell" style="width: ${this.columnWidths.index}px;">
                        ${index + 1}
                    </div>
                    <div class="gantt-task-cell" style="width: ${this.columnWidths.name}px; padding-left: ${indent}px;">
                        <span class="expand-icon ${hasChildren ? 'has-children' : ''}" 
                              data-task-id="${item.id}">
                            ${expandIcon}
                        </span>
                        <span class="task-name ${item.isWBS ? 'wbs-name' : ''}" title="${item.name}">
                            ${item.isWBS ? item.name : `${item.code} - ${item.name}`}
                        </span>
                    </div>
                    <div class="gantt-task-cell" style="width: ${this.columnWidths.start}px;">
                        ${item.startDate ? this.formatDate(item.startDate) : 'N/A'}
                    </div>
                    <div class="gantt-task-cell" style="width: ${this.columnWidths.finish}px;">
                        ${item.endDate ? this.formatDate(item.endDate) : 'N/A'}
                    </div>
                    <div class="gantt-task-cell" style="width: ${this.columnWidths.duration}px;">
                        ${item.startDate && item.endDate ? this.formatDuration(item.duration) : 'N/A'}
                    </div>
                    <div class="gantt-task-cell" style="width: ${this.columnWidths.progress}px;">
                        <div class="progress-indicator">
                            <div class="progress-bar" style="width: ${item.progress * 100}%"></div>
                            <span class="progress-text">${Math.round(item.progress * 100)}%</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Batch DOM update
        tempDiv.innerHTML = html;
        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }
        
        tasksContainer.innerHTML = '';
        tasksContainer.appendChild(fragment);
    }

    renderTimelineHeader() {
        const header = document.getElementById('ganttTimelineHeader');
        const { start, end } = this.dateRange;
        
        let html = '';
        const currentDate = new Date(start);
        
        while (currentDate <= end) {
            const x = this.timeScale.getX(currentDate);
            const width = this.getHeaderCellWidth();
            
            html += `
                <div class="timeline-header-cell" 
                     style="left: ${x}px; width: ${width}px;">
                    ${this.formatHeaderDate(currentDate)}
                </div>
            `;
            
            this.incrementDate(currentDate);
        }
        
        header.innerHTML = html;
        header.style.width = this.timeScale.chartWidth + 'px';
        header.style.height = '48px';
        header.style.position = 'relative';
        header.style.transform = 'translateX(0px)'; // Reset transform to ensure proper baseline
    }

    renderGrid() {
        const grid = document.getElementById('ganttGrid');
        const visibleItems = this.getVisibleItems();
        const { start, end } = this.dateRange;
        
        let html = '';
        
        // Vertical lines (dates)
        const currentDate = new Date(start);
        while (currentDate <= end) {
            const x = this.timeScale.getX(currentDate);
            html += `<div class="grid-line vertical" style="left: ${x}px;"></div>`;
            this.incrementDate(currentDate);
        }
        
        // Horizontal lines (tasks)
        visibleItems.forEach((item, index) => {
            const y = index * this.config.rowHeight;
            html += `<div class="grid-line horizontal" style="top: ${y}px;"></div>`;
        });
        
        grid.innerHTML = html;
        grid.style.width = this.timeScale.chartWidth + 'px';
        grid.style.height = (visibleItems.length * this.config.rowHeight) + 'px';
        grid.style.transform = 'translateX(0px)'; // Reset transform to ensure proper baseline
    }

    renderBars() {
        const barsContainer = document.getElementById('ganttBars');
        const visibleItems = this.getVisibleItems();
        
        // Performance optimization: Calculate visible viewport
        const scrollLeft = barsContainer.scrollLeft || 0;
        const containerWidth = barsContainer.offsetWidth;
        const viewportStart = scrollLeft - 100; // Buffer for smooth scrolling
        const viewportEnd = scrollLeft + containerWidth + 100;
        
        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        let html = '';
        visibleItems.forEach((item, index) => {
            // Skip items without valid dates
            if (!item.startDate || !item.endDate || 
                isNaN(item.startDate.getTime()) || isNaN(item.endDate.getTime())) {
                return;
            }
            
            const y = index * this.config.rowHeight + 5;
            const x = this.timeScale.getX(item.startDate);
            const width = this.timeScale.getX(item.endDate) - x;
            const height = this.config.rowHeight - 10;
            
            // Performance optimization: Only render bars in viewport
            if (x + width < viewportStart || x > viewportEnd) {
                return; // Skip bars outside viewport
            }
            
            if (item.isMilestone) {
                // Render milestone as diamond
                html += `
                    <div class="gantt-milestone" 
                         style="left: ${x - 8}px; top: ${y + height/2 - 8}px;"
                         data-task-id="${item.id}"
                         title="${item.name}">
                        ♦
                    </div>
                `;
            } else {
                // Different styling for WBS vs Activities
                let color;
                if (item.isWBS) {
                    color = this.config.colors.wbsBar || '#4CAF50';
                } else {
                    color = item.isCritical ? this.config.colors.criticalPath : this.config.colors.taskBar;
                }
                
                const barClass = item.isWBS ? 'gantt-wbs-bar' : 'gantt-bar';
                
                html += `
                    <div class="${barClass}" 
                         style="left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px; background: ${color};"
                         data-task-id="${item.id}"
                         title="${item.name} (${Math.round(item.progress * 100)}%)">
                `;
                
                if (this.config.showProgress && item.progress > 0) {
                    const progressWidth = width * item.progress;
                    const progressColor = item.isWBS ? 
                        (this.config.colors.wbsProgress || '#2E7D32') : 
                        this.config.colors.progressBar;
                    
                    html += `
                        <div class="gantt-progress" 
                             style="width: ${progressWidth}px; height: ${height}px; background: ${progressColor};">
                        </div>
                    `;
                }
                
                html += '</div>';
            }
        });
        
        // Batch DOM update for better performance
        tempDiv.innerHTML = html;
        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }
        
        barsContainer.innerHTML = '';
        barsContainer.appendChild(fragment);
        barsContainer.style.width = this.timeScale.chartWidth + 'px';
        barsContainer.style.height = (visibleItems.length * this.config.rowHeight) + 'px';
        barsContainer.style.transform = 'translateX(0px)'; // Reset transform to ensure proper baseline
    }

    renderDependencies() {
        const dependenciesContainer = document.getElementById('ganttDependencies');
        const visibleItems = this.getVisibleItems();
        
        let html = '';
        
        visibleItems.forEach((item, index) => {
            item.dependencies.forEach(dep => {
                const predecessorIndex = visibleItems.findIndex(i => i.id === dep.predecessorId);
                if (predecessorIndex >= 0) {
                    const predecessor = visibleItems[predecessorIndex];
                    
                    const startX = this.timeScale.getX(predecessor.endDate);
                    const startY = predecessorIndex * this.config.rowHeight + this.config.rowHeight / 2;
                    const endX = this.timeScale.getX(item.startDate);
                    const endY = index * this.config.rowHeight + this.config.rowHeight / 2;
                    
                    html += this.createDependencyPath(startX, startY, endX, endY);
                }
            });
        });
        
        dependenciesContainer.innerHTML = html;
    }

    createDependencyPath(startX, startY, endX, endY) {
        const midX = startX + (endX - startX) / 2;
        
        return `
            <svg class="dependency-line" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none;">
                <path d="M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}" 
                      stroke="${this.config.colors.dependency}" 
                      stroke-width="2" 
                      fill="none" 
                      marker-end="url(#arrowhead)"/>
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                            refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="${this.config.colors.dependency}"/>
                    </marker>
                </defs>
            </svg>
        `;
    }

    renderTodayLine() {
        const todayLine = document.getElementById('ganttTodayLine');
        const today = new Date();
        
        if (today >= this.dateRange.start && today <= this.dateRange.end) {
            const x = this.timeScale.getX(today);
            todayLine.style.left = x + 'px';
            todayLine.style.display = 'block';
        } else {
            todayLine.style.display = 'none';
        }
    }

    getVisibleItems() {
        // Performance optimization: Use virtual scrolling if enabled
        if (this.virtualScrolling.enabled) {
            console.log('🔍 Using virtual scrolling');
            const container = document.getElementById('ganttTasks');
            if (!container) return this.getFullVisibleItems();
            
            const scrollTop = container.scrollTop;
            const containerHeight = container.offsetHeight;
            const rowHeight = this.config.rowHeight;
            
            // Get all visible items first
            const fullItems = this.getFullVisibleItems();
            
            // Calculate which items are actually visible in viewport
            const startIndex = Math.floor(scrollTop / rowHeight);
            const endIndex = Math.min(
                fullItems.length - 1,
                Math.ceil((scrollTop + containerHeight) / rowHeight) + this.virtualScrolling.buffer
            );
            
            console.log('📱 Virtual scrolling viewport:', {
                scrollTop,
                containerHeight,
                startIndex,
                endIndex,
                totalItems: fullItems.length
            });
            
            // Return only items in viewport plus buffer
            return fullItems.slice(
                Math.max(0, startIndex - this.virtualScrolling.buffer),
                endIndex + 1
            );
        }
        
        const allVisible = this.getFullVisibleItems();
        console.log('👁️ Getting all visible items (no virtual scrolling):', allVisible.length);
        return allVisible;
    }
    
    // Get all visible items (expanded hierarchy)
    getFullVisibleItems() {
        // Safety check for ganttData
        if (!this.ganttData || !Array.isArray(this.ganttData)) {
            console.warn('Gantt data not available yet');
            return [];
        }
        
        const result = [];
        
        const traverse = (items) => {
            items.forEach(item => {
                if (item.isVisible) {
                    result.push(item);
                    if (item.children && item.children.length > 0 && (this.expandedItems.has(item.id) || item.isExpanded)) {
                        traverse(item.children);
                    }
                }
            });
        };
        
        traverse(this.ganttData);
        return result;
    }
    
    // Performance optimization: Clear cached elements when data changes
    clearCache() {
        this.cachedElements.clear();
        this.lastVisibleItems = null;
        console.log('Gantt cache cleared');
    }
    
    // Performance optimization: Batch DOM updates
    batchUpdateDOM(updateFn) {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                updateFn();
                resolve();
            });
        });
    }
    
    // Performance optimization: Setup throttled scroll optimization
    setupScrollOptimization() {
        let scrollTimeout;
        const scrollHandler = () => {
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            
            scrollTimeout = setTimeout(() => {
                if (this.virtualScrolling.enabled) {
                    this.renderGanttChart();
                }
            }, 16); // ~60fps throttling
        };
        
        const tasksContainer = document.getElementById('ganttTasks');
        const barsContainer = document.getElementById('ganttBars');
        
        if (tasksContainer) {
            tasksContainer.addEventListener('scroll', scrollHandler, { passive: true });
        }
        if (barsContainer) {
            barsContainer.addEventListener('scroll', scrollHandler, { passive: true });
        }
    }

    // Performance optimization: Auto-enable virtual scrolling for large datasets
    checkDataSize() {
        const itemCount = this.getFullVisibleItems().length;
        const threshold = this.virtualScrolling.threshold;
        
        console.log('📊 Checking data size:', { itemCount, threshold, enabled: this.virtualScrolling.enabled });
        
        // Temporarily disable auto-enabling virtual scrolling to debug activity display issues
        if (itemCount > threshold && !this.virtualScrolling.enabled && false) { // Disabled for debugging
            console.log(`Enabling virtual scrolling for ${itemCount} items (threshold: ${threshold})`);
            this.virtualScrolling.enabled = true;
            this.setupScrollOptimization();
        } else if (itemCount <= threshold && this.virtualScrolling.enabled) {
            console.log(`Disabling virtual scrolling for ${itemCount} items`);
            this.virtualScrolling.enabled = false;
        }
    }
    
    // Performance optimization: Memory cleanup
    cleanup() {
        this.clearCache();
        
        // Remove event listeners
        const tasksContainer = document.getElementById('ganttTasks');
        const barsContainer = document.getElementById('ganttBars');
        
        if (tasksContainer) {
            tasksContainer.removeEventListener('scroll', this.scrollHandler);
        }
        if (barsContainer) {
            barsContainer.removeEventListener('scroll', this.scrollHandler);
        }
        
        console.log('Gantt chart memory cleaned up');
    }
    
    formatDuration(hours) {
        if (hours === 0) return 'Milestone';
        const days = Math.round(hours / 8);
        return days === 1 ? '1 day' : `${days} days`;
    }

    formatDate(date) {
        if (!date || isNaN(date.getTime())) return 'N/A';
        
        const day = date.getDate().toString().padStart(2, '0');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear().toString().slice(-2); // Get last 2 digits of year
        
        return `${day}-${month}-${year}`;
    }

    formatHeaderDate(date) {
        switch (this.config.dateGranularity) {
            case 'day':
                return date.getDate().toString();
            case 'week':
                return `W${this.getWeekNumber(date)}`;
            case 'month':
                return date.toLocaleDateString('en-US', { month: 'short' });
            default:
                return date.getDate().toString();
        }
    }

    getHeaderCellWidth() {
        switch (this.config.dateGranularity) {
            case 'day':
                return this.config.columnWidth;
            case 'week':
                return this.config.columnWidth * 7;
            case 'month':
                return this.config.columnWidth * 30;
            default:
                return this.config.columnWidth;
        }
    }

    incrementDate(date) {
        switch (this.config.dateGranularity) {
            case 'day':
                date.setDate(date.getDate() + 1);
                break;
            case 'week':
                date.setDate(date.getDate() + 7);
                break;
            case 'month':
                date.setMonth(date.getMonth() + 1);
                break;
        }
    }

    getWeekNumber(date) {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const dayOfYear = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
        return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
    }

    updateItemCount() {
        const visibleItems = this.getVisibleItems();
        document.getElementById('ganttItemCount').textContent = 
            `${visibleItems.length} tasks (${this.flattenHierarchy(this.ganttData).length} total)`;
    }

    setupEventListeners() {
        // Expand/Collapse controls
        document.getElementById('ganttExpandAll').addEventListener('click', () => {
            this.expandAll();
        });

        document.getElementById('ganttCollapseAll').addEventListener('click', () => {
            this.collapseAll();
        });

        // Time scale change
        document.getElementById('ganttTimeScale').addEventListener('change', (e) => {
            this.config.dateGranularity = e.target.value;
            this.createTimeScale();
            this.renderGanttChart();
        });

        // Fit to screen
        document.getElementById('ganttFitToScreen').addEventListener('click', () => {
            this.fitToScreen();
        });

        // Show/hide options
        document.getElementById('ganttShowProgress').addEventListener('change', (e) => {
            this.config.showProgress = e.target.checked;
            this.renderBars();
        });

        document.getElementById('ganttShowDependencies').addEventListener('change', (e) => {
            this.config.showDependencies = e.target.checked;
            if (this.config.showDependencies) {
                this.renderDependencies();
            } else {
                document.getElementById('ganttDependencies').innerHTML = '';
            }
        });

        // Zoom control
        document.getElementById('ganttZoomSlider').addEventListener('input', (e) => {
            this.handleZoomChange(e.target.value);
        });

        // Task expand/collapse
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('expand-icon') && e.target.classList.contains('has-children')) {
                const taskId = e.target.dataset.taskId;
                this.toggleExpand(taskId);
            }
        });

        // Synchronize scrolling between left and right panels
        const leftPanel = document.getElementById('ganttLeftPanel');
        const rightPanel = document.getElementById('ganttRightPanel');
        const tasksContainer = document.getElementById('ganttTasks');
        const chartArea = document.getElementById('ganttChartArea');
        const timelineHeader = document.getElementById('ganttTimelineHeader');

        // Add debug logging for scroll synchronization
        console.log('🎧 Setting up scroll synchronization for elements:', {
            leftPanel: !!leftPanel,
            rightPanel: !!rightPanel,
            tasksContainer: !!tasksContainer,
            chartArea: !!chartArea,
            timelineHeader: !!timelineHeader
        });

        // Vertical scroll synchronization (with throttling for performance)
        let verticalScrollTimeout;
        
        if (leftPanel && rightPanel) {
            leftPanel.addEventListener('scroll', () => {
                if (verticalScrollTimeout) clearTimeout(verticalScrollTimeout);
                
                verticalScrollTimeout = setTimeout(() => {
                    if (rightPanel.scrollTop !== leftPanel.scrollTop) {
                        rightPanel.scrollTop = leftPanel.scrollTop;
                    }
                    if (chartArea && chartArea.scrollTop !== leftPanel.scrollTop) {
                        chartArea.scrollTop = leftPanel.scrollTop;
                    }
                    
                    // Update virtual scrolling if enabled
                    if (this.virtualScrolling.enabled) {
                        this.renderGanttChart();
                    }
                }, 16); // ~60fps throttling
            });

            rightPanel.addEventListener('scroll', () => {
                if (verticalScrollTimeout) clearTimeout(verticalScrollTimeout);
                
                verticalScrollTimeout = setTimeout(() => {
                    if (leftPanel.scrollTop !== rightPanel.scrollTop) {
                        leftPanel.scrollTop = rightPanel.scrollTop;
                    }
                    if (tasksContainer && tasksContainer.scrollTop !== rightPanel.scrollTop) {
                        tasksContainer.scrollTop = rightPanel.scrollTop;
                    }
                    
                    // Update virtual scrolling if enabled
                    if (this.virtualScrolling.enabled) {
                        this.renderGanttChart();
                    }
                }, 16); // ~60fps throttling
            });
        }

        // Horizontal scroll synchronization for timeline (with throttling)
        let horizontalScrollTimeout;
        
        if (chartArea) {
            chartArea.addEventListener('scroll', () => {
                if (horizontalScrollTimeout) clearTimeout(horizontalScrollTimeout);
                
                horizontalScrollTimeout = setTimeout(() => {
                    const scrollLeft = chartArea.scrollLeft;
                    
                    // Sync horizontal scroll of timeline header
                    if (timelineHeader) {
                        timelineHeader.style.transform = `translateX(-${scrollLeft}px)`;
                    }
                    
                    // Sync the grid position to ensure alignment
                    const grid = document.getElementById('ganttGrid');
                    if (grid) {
                        grid.style.transform = `translateX(-${scrollLeft}px)`;
                    }
                    
                    // Sync the bars container
                    const barsContainer = document.getElementById('ganttBars');
                    if (barsContainer) {
                        barsContainer.style.transform = `translateX(-${scrollLeft}px)`;
                    }
                    
                    // Sync dependencies container
                    const dependenciesContainer = document.getElementById('ganttDependencies');
                    if (dependenciesContainer) {
                        dependenciesContainer.style.transform = `translateX(-${scrollLeft}px)`;
                    }
                }, 16); // ~60fps throttling
            });
        }

        // Handle mouse wheel for horizontal scrolling with Shift key
        if (leftPanel) {
            leftPanel.addEventListener('wheel', (e) => {
                if (e.shiftKey && chartArea) {
                    e.preventDefault();
                    chartArea.scrollLeft += e.deltaY;
                }
            });
        }

        if (rightPanel) {
            rightPanel.addEventListener('wheel', (e) => {
                if (e.shiftKey && chartArea) {
                    e.preventDefault();
                    chartArea.scrollLeft += e.deltaY;
                }
            });
        }

        // Column resize functionality
        this.setupColumnResize();
    }

    handleZoomChange(zoomValue) {
        this.zoomLevel = parseInt(zoomValue);
        this.config.columnWidth = this.zoomLevel;
        
        // Update zoom display
        document.getElementById('ganttZoomValue').textContent = this.zoomLevel + 'px';
        
        // Recalculate time scale with new column width
        this.createTimeScale();
        
        // Re-render the timeline components
        this.renderTimelineHeader();
        this.renderGrid();
        this.renderBars();
        if (this.config.showDependencies) {
            this.renderDependencies();
        }
        this.renderTodayLine();
    }

    setupColumnResize() {
        const header = document.getElementById('ganttHeader');
        if (!header) return;

        // Add event listeners for resize handles
        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-handle')) {
                this.startColumnResize(e);
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isResizing) {
                this.doColumnResize(e);
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isResizing) {
                this.endColumnResize();
            }
        });
    }

    startColumnResize(e) {
        e.preventDefault();
        this.isResizing = true;
        this.resizeStartX = e.clientX;
        this.resizeColumn = e.target.dataset.column;
        
        // Add resizing class to header cell
        const headerCell = e.target.parentElement;
        headerCell.classList.add('resizing');
        
        document.body.style.cursor = 'col-resize';
    }

    doColumnResize(e) {
        if (!this.isResizing || !this.resizeColumn) return;
        
        const deltaX = e.clientX - this.resizeStartX;
        const currentWidth = this.columnWidths[this.resizeColumn];
        const newWidth = Math.max(30, currentWidth + deltaX); // Minimum width of 30px
        
        this.columnWidths[this.resizeColumn] = newWidth;
        this.updateColumnWidths();
        this.resizeStartX = e.clientX;
    }

    endColumnResize() {
        this.isResizing = false;
        this.resizeColumn = null;
        document.body.style.cursor = '';
        
        // Remove resizing class from all header cells
        document.querySelectorAll('.gantt-header-cell.resizing').forEach(cell => {
            cell.classList.remove('resizing');
        });
        
        // Update total left panel width
        this.updateLeftPanelWidth();
    }

    updateColumnWidths() {
        // Update header cells
        document.querySelectorAll('.gantt-header-cell').forEach(cell => {
            const column = cell.dataset.column;
            if (column && this.columnWidths[column] !== undefined) {
                cell.style.width = this.columnWidths[column] + 'px';
            }
        });
        
        // Update task cells for both task rows and WBS rows
        document.querySelectorAll('.gantt-task-row, .gantt-wbs-row').forEach(row => {
            const cells = row.querySelectorAll('.gantt-task-cell');
            const columns = ['index', 'name', 'start', 'finish', 'duration', 'progress'];
            
            cells.forEach((cell, index) => {
                if (columns[index] && this.columnWidths[columns[index]] !== undefined) {
                    cell.style.width = this.columnWidths[columns[index]] + 'px';
                }
            });
        });
    }

    updateLeftPanelWidth() {
        const totalWidth = Object.values(this.columnWidths).reduce((sum, width) => sum + width, 0);
        const leftPanel = document.getElementById('ganttLeftPanel');
        if (leftPanel) {
            leftPanel.style.width = (totalWidth + 20) + 'px'; // Add some padding
        }
    }

    expandAll() {
        const allItems = this.flattenHierarchy(this.ganttData);
        allItems.forEach(item => {
            if (item.children.length > 0) {
                this.expandedItems.add(item.id);
                item.isExpanded = true;
            }
        });
        this.renderGanttChart();
    }

    collapseAll() {
        this.expandedItems.clear();
        const allItems = this.flattenHierarchy(this.ganttData);
        allItems.forEach(item => {
            item.isExpanded = false;
        });
        this.renderGanttChart();
    }

    toggleExpand(taskId) {
        const allItems = this.flattenHierarchy(this.ganttData);
        const item = allItems.find(i => i.id === taskId);
        
        if (item && item.children.length > 0) {
            if (this.expandedItems.has(taskId)) {
                this.expandedItems.delete(taskId);
                item.isExpanded = false;
            } else {
                this.expandedItems.add(taskId);
                item.isExpanded = true;
            }
            this.renderGanttChart();
        }
    }

    fitToScreen() {
        const container = document.getElementById('ganttRightPanel');
        const containerWidth = container.clientWidth;
        const totalDays = this.timeScale.totalDays;
        
        this.config.columnWidth = Math.max(20, containerWidth / totalDays);
        this.createTimeScale();
        this.renderGanttChart();
    }
    
    // Performance monitoring and statistics
    getPerformanceStats() {
        const totalItems = this.getFullVisibleItems().length;
        const visibleItems = this.getVisibleItems().length;
        const cacheSize = this.cachedElements.size;
        
        return {
            totalItems,
            visibleItems,
            cacheSize,
            virtualScrollingEnabled: this.virtualScrolling.enabled,
            virtualScrollingThreshold: this.virtualScrolling.threshold,
            virtualScrollingBuffer: this.virtualScrolling.buffer,
            renderingOptimized: this.renderingScheduled !== undefined,
            memoryUsage: {
                itemsInMemory: totalItems,
                itemsRendered: visibleItems,
                cacheHitRatio: cacheSize > 0 ? (cacheSize / totalItems * 100).toFixed(2) + '%' : '0%'
            }
        };
    }
    
    // Performance logging
    logPerformanceStats() {
        const stats = this.getPerformanceStats();
        console.group('📊 Gantt Chart Performance Stats');
        console.log('📈 Total Items:', stats.totalItems);
        console.log('👁️ Visible Items:', stats.visibleItems);
        console.log('🚀 Virtual Scrolling:', stats.virtualScrollingEnabled ? '✅ Enabled' : '❌ Disabled');
        console.log('📱 Cache Size:', stats.cacheSize);
        console.log('⚡ Rendering:', stats.renderingOptimized ? '✅ Optimized' : '❌ Not Optimized');
        console.log('💾 Memory Usage:', stats.memoryUsage);
        console.groupEnd();
        
        return stats;
    }
}
