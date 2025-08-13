/*
 * Resource Curve Visualization and Management
 */

export class ResourceCurveManager {
    constructor(app) {
        this.app = app;
    }

    populateResourceFilters() {
        // Populate assignment resource filter
        const resourceFilter = document.getElementById('resourceAssignmentFilter');
        resourceFilter.innerHTML = '<option value="">All Resources</option>';
        
        this.app.currentReader.resources.forEach(resource => {
            const option = document.createElement('option');
            option.value = resource.rsrc_id;
            option.textContent = resource.rsrc_name;
            resourceFilter.appendChild(option);
        });

        // Populate curve resource filter
        const curveFilter = document.getElementById('resourceCurveFilter');
        curveFilter.innerHTML = '<option value="">Choose a resource...</option>';
        
        Object.keys(this.app.resourceUtilization).forEach(resourceId => {
            const util = this.app.resourceUtilization[resourceId];
            const option = document.createElement('option');
            option.value = resourceId;
            option.textContent = util.resource ? util.resource.rsrc_name : resourceId;
            curveFilter.appendChild(option);
        });
    }

    showResourceCurve() {
        const resourceId = document.getElementById('resourceCurveFilter').value;
        const chartType = document.getElementById('chartTypeFilter').value;
        
        if (!resourceId) {
            this.displayResourceUtilization();
            return;
        }
        
        const curve = this.app.currentReader.getResourceCurve(resourceId);
        const curveDisplay = document.getElementById('resourceCurveDisplay');
        
        if (!curve.timeBasedData || curve.timeBasedData.length === 0) {
            curveDisplay.innerHTML = `
                <div class="no-data">
                    <h3>No time-based data available for ${curve.resource ? curve.resource.rsrc_name : 'this resource'}</h3>
                    <p>Activities may be missing date information.</p>
                </div>
            `;
            return;
        }
        
        // Prepare data for visualization
        const timeData = curve.timeBasedData;
        const maxTargetQty = Math.max(...timeData.map(d => d.weeklyTargetQty));
        const maxActualQty = Math.max(...timeData.map(d => d.weeklyActualQty));
        const maxTargetCost = Math.max(...timeData.map(d => d.weeklyTargetCost));
        const maxActualCost = Math.max(...timeData.map(d => d.weeklyActualCost));
        
        let maxValue = 0;
        let valueLabel = '';
        let targetValues = [];
        let actualValues = [];
        
        if (chartType === 'quantity') {
            maxValue = Math.max(maxTargetQty, maxActualQty);
            valueLabel = 'Quantity';
            targetValues = timeData.map(d => d.weeklyTargetQty);
            actualValues = timeData.map(d => d.weeklyActualQty);
        } else if (chartType === 'cost') {
            maxValue = Math.max(maxTargetCost, maxActualCost);
            valueLabel = 'Cost ($)';
            targetValues = timeData.map(d => d.weeklyTargetCost);
            actualValues = timeData.map(d => d.weeklyActualCost);
        } else {
            maxValue = Math.max(maxTargetCost, maxActualCost);
            valueLabel = 'Cost ($)';
            targetValues = timeData.map(d => d.weeklyTargetCost);
            actualValues = timeData.map(d => d.weeklyActualCost);
        }
        
        curveDisplay.innerHTML = `
            <div class="assignment-detail">
                <h3>📈 Resource Curve: ${curve.resource ? curve.resource.rsrc_name : 'Unknown Resource'}</h3>
                <p><strong>Resource Type:</strong> ${this.app.uiManager.getResourceTypeLabel(curve.resource ? curve.resource.rsrc_type : '')}</p>
                <p><strong>Time Period:</strong> ${timeData.length} weeks</p>
                <p><strong>Peak ${valueLabel}:</strong> ${maxValue.toFixed(2)} ${chartType === 'cost' ? '$' : 'units'}</p>
            </div>
            
            <div class="curve-chart">
                <h4>${valueLabel} Over Time</h4>
                <div class="chart-container">
                    <div class="chart-canvas" id="chartCanvas">
                        <div class="chart-grid" id="chartGrid"></div>
                        <div class="chart-bars-time" id="chartBarsTime"></div>
                        <div class="chart-tooltip" id="chartTooltip"></div>
                    </div>
                    <div class="chart-axis y-axis" id="yAxis"></div>
                    <div class="chart-axis x-axis" id="xAxis"></div>
                </div>
                
                <div class="chart-legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background: linear-gradient(135deg, #667eea, #764ba2);"></div>
                        <span>Target ${valueLabel}</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: linear-gradient(135deg, #dc3545, #fd7e14);"></div>
                        <span>Actual ${valueLabel}</span>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 20px;">
                <h4>📊 Weekly Breakdown</h4>
                <div style="max-height: 400px; overflow-y: auto;">
                    <table class="assignments-table">
                        <thead>
                            <tr>
                                <th>Week Starting</th>
                                <th>Target ${chartType === 'quantity' ? 'Qty' : 'Cost'}</th>
                                <th>Actual ${chartType === 'quantity' ? 'Qty' : 'Cost'}</th>
                                <th>Variance</th>
                                <th>Active Activities</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${timeData.map((week, index) => {
                                const targetVal = chartType === 'quantity' ? week.weeklyTargetQty : week.weeklyTargetCost;
                                const actualVal = chartType === 'quantity' ? week.weeklyActualQty : week.weeklyActualCost;
                                const variance = actualVal - targetVal;
                                const varianceClass = variance > 0 ? 'style="color: #dc3545;"' : variance < 0 ? 'style="color: #28a745;"' : '';
                                
                                return `
                                    <tr>
                                        <td><strong>${week.date.toLocaleDateString()}</strong></td>
                                        <td>${chartType === 'cost' ? '$' : ''}${targetVal.toFixed(2)}</td>
                                        <td>${chartType === 'cost' ? '$' : ''}${actualVal.toFixed(2)}</td>
                                        <td ${varianceClass}>${chartType === 'cost' ? '$' : ''}${variance.toFixed(2)}</td>
                                        <td>${week.activeActivities.length} activities</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        // Render the chart
        this.renderTimeChart(timeData, targetValues, actualValues, maxValue, chartType);
    }

    renderTimeChart(timeData, targetValues, actualValues, maxValue, chartType) {
        const chartBars = document.getElementById('chartBarsTime');
        const yAxis = document.getElementById('yAxis');
        const xAxis = document.getElementById('xAxis');
        const chartGrid = document.getElementById('chartGrid');
        const tooltip = document.getElementById('chartTooltip');
        
        if (!chartBars || !yAxis || !xAxis) return;
        
        // Clear existing content
        chartBars.innerHTML = '';
        yAxis.innerHTML = '';
        xAxis.innerHTML = '';
        chartGrid.innerHTML = '';
        
        // Create Y-axis labels and grid lines
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const value = (maxValue / steps) * (steps - i);
            const yPos = (i / steps) * 100;
            
            // Y-axis label
            const label = document.createElement('div');
            label.textContent = chartType === 'cost' ? '$' + value.toFixed(0) : value.toFixed(1);
            label.style.position = 'absolute';
            label.style.top = yPos + '%';
            label.style.transform = 'translateY(-50%)';
            yAxis.appendChild(label);
            
            // Grid line
            if (i < steps) {
                const gridLine = document.createElement('div');
                gridLine.className = 'grid-line';
                gridLine.style.top = yPos + '%';
                chartGrid.appendChild(gridLine);
            }
        }
        
        // Create X-axis labels (show every few weeks to avoid crowding)
        const labelInterval = Math.max(1, Math.floor(timeData.length / 8));
        timeData.forEach((week, index) => {
            if (index % labelInterval === 0 || index === timeData.length - 1) {
                const label = document.createElement('div');
                label.textContent = week.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                label.style.position = 'absolute';
                label.style.left = (index / (timeData.length - 1)) * 100 + '%';
                label.style.transform = 'translateX(-50%)';
                xAxis.appendChild(label);
            }
        });
        
        // Create bars
        timeData.forEach((week, index) => {
            const targetValue = targetValues[index];
            const actualValue = actualValues[index];
            
            const targetHeight = maxValue > 0 ? (targetValue / maxValue) * 100 : 0;
            const actualHeight = maxValue > 0 ? (actualValue / maxValue) * 100 : 0;
            
            // Target bar
            const targetBar = document.createElement('div');
            targetBar.className = 'time-bar target-bar';
            targetBar.style.height = targetHeight + '%';
            
            // Actual bar
            const actualBar = document.createElement('div');
            actualBar.className = 'time-bar actual-bar';
            actualBar.style.height = actualHeight + '%';
            
            // Add hover effects
            const showTooltip = (e) => {
                const variance = actualValue - targetValue;
                const varianceText = variance >= 0 ? '+' + variance.toFixed(2) : variance.toFixed(2);
                
                tooltip.innerHTML = `
                    <strong>Week of ${week.date.toLocaleDateString()}</strong><br>
                    Target: ${chartType === 'cost' ? '$' : ''}${targetValue.toFixed(2)}<br>
                    Actual: ${chartType === 'cost' ? '$' : ''}${actualValue.toFixed(2)}<br>
                    Variance: ${chartType === 'cost' ? '$' : ''}${varianceText}<br>
                    Active Activities: ${week.activeActivities.length}
                `;
                tooltip.style.left = e.pageX + 10 + 'px';
                tooltip.style.top = e.pageY - 10 + 'px';
                tooltip.style.opacity = '1';
            };
            
            const hideTooltip = () => {
                tooltip.style.opacity = '0';
            };
            
            targetBar.addEventListener('mouseenter', showTooltip);
            targetBar.addEventListener('mouseleave', hideTooltip);
            actualBar.addEventListener('mouseenter', showTooltip);
            actualBar.addEventListener('mouseleave', hideTooltip);
            
            chartBars.appendChild(targetBar);
            chartBars.appendChild(actualBar);
        });
    }

    displayResourceUtilization() {
        const utilizationContainer = document.getElementById('resourceCurveDisplay');
        const topResources = Object.values(this.app.resourceUtilization)
            .sort((a, b) => b.totalTargetCost - a.totalTargetCost)
            .slice(0, 10);
        
        utilizationContainer.innerHTML = `
            <div class="utilization-summary">
                ${topResources.map(util => `
                    <div class="utilization-card">
                        <div class="utilization-header">${util.resource ? util.resource.rsrc_name : 'Unknown Resource'}</div>
                        <div class="utilization-metrics">
                            <span class="metric-label">Assignments:</span>
                            <span class="metric-value">${util.assignmentCount}</span>
                            <span class="metric-label">Target Qty:</span>
                            <span class="metric-value">${util.totalTargetQty.toFixed(1)}</span>
                            <span class="metric-label">Actual Qty:</span>
                            <span class="metric-value">${util.totalActualQty.toFixed(1)}</span>
                            <span class="metric-label">Target Cost:</span>
                            <span class="metric-value">$${util.totalTargetCost.toLocaleString()}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
}
