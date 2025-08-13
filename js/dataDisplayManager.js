/*
 * Data Display and Table Management
 */

export class DataDisplayManager {
    constructor(app) {
        this.app = app;
    }

    displayResults() {
        this.displayOverview();
        this.displayActivities();
        this.displayCriticalPath();
        this.displayResources();
        this.displayAssignments();
    }

    displayOverview() {
        // Project information
        const projectInfo = document.getElementById('projectInfo');
        projectInfo.innerHTML = `
            <h3>📋 Project Information</h3>
            <p><strong>Name:</strong> ${this.app.currentProject.proj_name || 'Unnamed Project'}</p>
            <p><strong>Short Name:</strong> ${this.app.currentProject.proj_short_name || 'N/A'}</p>
            <p><strong>ID:</strong> ${this.app.currentProject.proj_id}</p>
            <p><strong>Manager:</strong> ${this.app.currentProject.proj_mgr || 'N/A'}</p>
            <p><strong>Status:</strong> ${this.app.currentProject.status_code || 'N/A'}</p>
        `;

        // Statistics
        const stats = this.app.currentReader.getSummaryStats();
        const statsGrid = document.getElementById('statsGrid');
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.totalActivities}</div>
                <div class="stat-label">Total Activities</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalResources}</div>
                <div class="stat-label">Resources</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalRelationships}</div>
                <div class="stat-label">Relationships</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalResourceAssignments || 0}</div>
                <div class="stat-label">Resource Assignments</div>
            </div>
        `;

        // Status breakdown
        const statusCounts = {};
        this.app.allActivities.forEach(activity => {
            const status = activity.status_code || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        const statusBreakdown = document.getElementById('statusBreakdown');
        statusBreakdown.innerHTML = `
            <h3>📈 Activity Status Breakdown</h3>
            <div class="stats-grid">
                ${Object.entries(statusCounts).map(([status, count]) => `
                    <div class="stat-card">
                        <div class="stat-value">${count}</div>
                        <div class="stat-label">${this.app.uiManager.getStatusLabel(status)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    displayActivities() {
        this.updateActivitiesTable();
    }

    displayCriticalPath() {
        const criticalActivities = this.app.currentReader.getCriticalActivities();
        
        const criticalPathInfo = document.getElementById('criticalPathInfo');
        criticalPathInfo.innerHTML = `
            <div class="project-info">
                <h3>🚨 Critical Path Analysis</h3>
                <p><strong>Total Activities:</strong> ${this.app.allActivities.length}</p>
                <p><strong>Critical Activities:</strong> ${criticalActivities.length}</p>
                <p><strong>Percentage Critical:</strong> ${((criticalActivities.length / this.app.allActivities.length) * 100).toFixed(1)}%</p>
            </div>
        `;

        const criticalTable = document.getElementById('criticalActivitiesTable');
        criticalTable.innerHTML = this.createActivitiesTable(criticalActivities, true);
    }

    displayResources() {
        const resourceTypes = {};
        this.app.currentReader.resources.forEach(resource => {
            const type = resource.rsrc_type || 'Unknown';
            resourceTypes[type] = (resourceTypes[type] || 0) + 1;
        });

        const resourceStats = document.getElementById('resourceStats');
        resourceStats.innerHTML = `
            <div class="project-info">
                <h3>👥 Resource Summary</h3>
                <p><strong>Total Resources:</strong> ${this.app.currentReader.resources.length}</p>
                ${Object.entries(resourceTypes).map(([type, count]) => 
                    `<p><strong>${this.app.uiManager.getResourceTypeLabel(type)}:</strong> ${count}</p>`
                ).join('')}
            </div>
        `;

        const resourcesList = document.getElementById('resourcesList');
        resourcesList.innerHTML = `
            <div class="resource-list">
                ${this.app.currentReader.resources.map(resource => `
                    <div class="resource-card">
                        <div class="resource-name">${resource.rsrc_name}</div>
                        <div class="resource-type">${this.app.uiManager.getResourceTypeLabel(resource.rsrc_type)}</div>
                        <div style="font-size: 0.8rem; color: #999;">ID: ${resource.rsrc_id}</div>
                    </div>
                `).join('')}
            </div>
            ${this.app.currentReader.resources.length > 20 ? '<p style="margin-top: 20px; color: #666;">Showing first 20 resources...</p>' : ''}
        `;
    }

    displayAssignments() {
        const assignmentStats = document.getElementById('assignmentStats');
        const totalAssignments = this.app.allAssignments.length;
        const totalCost = this.app.allAssignments.reduce((sum, a) => sum + (parseFloat(a.target_cost) || 0), 0);
        const totalActualCost = this.app.allAssignments.reduce((sum, a) => sum + (parseFloat(a.act_reg_cost) || 0) + (parseFloat(a.act_ot_cost) || 0), 0);
        
        assignmentStats.innerHTML = `
            <div class="project-info">
                <h3>🔗 Resource Assignment Summary</h3>
                <p><strong>Total Assignments:</strong> ${totalAssignments}</p>
                <p><strong>Total Target Cost:</strong> $${totalCost.toLocaleString()}</p>
                <p><strong>Total Actual Cost:</strong> $${totalActualCost.toLocaleString()}</p>
                <p><strong>Cost Variance:</strong> $${(totalActualCost - totalCost).toLocaleString()}</p>
            </div>
        `;
        
        this.updateAssignmentsTable();
    }

    updateActivitiesTable() {
        const activitiesTable = document.getElementById('activitiesTable');
        activitiesTable.innerHTML = this.createActivitiesTable(this.app.filteredActivities);
    }

    updateAssignmentsTable() {
        const assignmentsTable = document.getElementById('assignmentsTable');
        if (this.app.filteredAssignments.length === 0) {
            assignmentsTable.innerHTML = '<p>No assignments to display.</p>';
            return;
        }

        assignmentsTable.innerHTML = `
            <p>Showing ${this.app.filteredAssignments.length} assignments</p>
            <table class="assignments-table">
                <thead>
                    <tr>
                        <th>Resource</th>
                        <th>Activity</th>
                        <th>Target Qty</th>
                        <th>Actual Qty</th>
                        <th>Target Cost</th>
                        <th>Actual Cost</th>
                        <th>Remaining</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.app.filteredAssignments.map(assignment => {
                        const resource = this.app.currentReader.resources.find(r => r.rsrc_id === assignment.rsrc_id);
                        const activity = this.app.allActivities.find(a => a.task_id === assignment.task_id);
                        const actualQty = (parseFloat(assignment.act_reg_qty) || 0) + (parseFloat(assignment.act_ot_qty) || 0);
                        const actualCost = (parseFloat(assignment.act_reg_cost) || 0) + (parseFloat(assignment.act_ot_cost) || 0);
                        
                        return `
                            <tr>
                                <td><strong>${resource ? resource.rsrc_name : 'Unknown'}</strong></td>
                                <td>${activity ? activity.task_name : 'Unknown Activity'}<br>
                                    <small style="color: #666;">${activity ? activity.task_code : ''}</small></td>
                                <td>${(parseFloat(assignment.target_qty) || 0).toFixed(1)}</td>
                                <td>${actualQty.toFixed(1)}</td>
                                <td>$${(parseFloat(assignment.target_cost) || 0).toLocaleString()}</td>
                                <td>$${actualCost.toLocaleString()}</td>
                                <td>${(parseFloat(assignment.remain_qty) || 0).toFixed(1)}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    createActivitiesTable(activities, highlightCritical = false) {
        if (activities.length === 0) {
            return '<p>No activities to display.</p>';
        }

        return `
            <p>Showing ${activities.length} activities</p>
            <table class="activities-table">
                <thead>
                    <tr>
                        <th>Task Code</th>
                        <th>Task Name</th>
                        <th>Status</th>
                        <th>Duration (hrs)</th>
                        <th>% Complete</th>
                        <th>Float (hrs)</th>
                    </tr>
                </thead>
                <tbody>
                    ${activities.map(activity => {
                        const isCritical = highlightCritical && (activity.total_float_hr_cnt === 0 || activity.driving_path_flag === 'Y');
                        return `
                            <tr ${isCritical ? 'class="critical-activity"' : ''}>
                                <td><strong>${activity.task_code}</strong></td>
                                <td>${activity.task_name}</td>
                                <td><span class="status-badge ${this.app.uiManager.getStatusClass(activity.status_code)}">${this.app.uiManager.getStatusLabel(activity.status_code)}</span></td>
                                <td>${activity.target_drtn_hr_cnt || 0}</td>
                                <td>${activity.phys_complete_pct || 0}%</td>
                                <td>${activity.total_float_hr_cnt || 0}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }
}
