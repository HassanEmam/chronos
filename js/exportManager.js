/*
 * Export Functions for Various Data Formats
 */

export class ExportManager {
    constructor(app) {
        this.app = app;
    }

    exportResourceCurveCSV() {
        const resourceId = document.getElementById('resourceCurveFilter').value;
        const chartType = document.getElementById('chartTypeFilter').value;
        
        if (!resourceId) {
            this.app.uiManager.showError('Please select a resource to export its curve data.');
            return;
        }
        
        const curve = this.app.currentReader.getResourceCurve(resourceId);
        const resource = curve.resource;
        
        if (!curve.timeBasedData || curve.timeBasedData.length === 0) {
            this.app.uiManager.showError('No time-based data available for the selected resource.');
            return;
        }
        
        const csvData = curve.timeBasedData.map(week => ({
            'Week Start': week.date.toISOString().split('T')[0],
            'Week End': week.weekEnd.toISOString().split('T')[0],
            'Target Quantity': week.weeklyTargetQty.toFixed(2),
            'Actual Quantity': week.weeklyActualQty.toFixed(2),
            'Target Cost': week.weeklyTargetCost.toFixed(2),
            'Actual Cost': week.weeklyActualCost.toFixed(2),
            'Active Activities': week.activeActivities.length,
            'Quantity Variance': (week.weeklyActualQty - week.weeklyTargetQty).toFixed(2),
            'Cost Variance': (week.weeklyActualCost - week.weeklyTargetCost).toFixed(2)
        }));
        
        const csv = this.generateCSV(csvData, [
            { key: 'Week Start', label: 'Week Start' },
            { key: 'Week End', label: 'Week End' },
            { key: 'Target Quantity', label: 'Target Quantity' },
            { key: 'Actual Quantity', label: 'Actual Quantity' },
            { key: 'Target Cost', label: 'Target Cost' },
            { key: 'Actual Cost', label: 'Actual Cost' },
            { key: 'Active Activities', label: 'Active Activities' },
            { key: 'Quantity Variance', label: 'Quantity Variance' },
            { key: 'Cost Variance', label: 'Cost Variance' }
        ]);
        
        const resourceName = resource ? resource.rsrc_name.replace(/[^a-zA-Z0-9]/g, '_') : 'resource';
        this.downloadFile(csv, `resource_curve_${resourceName}.csv`, 'text/csv');
    }

    exportAllResourceCurvesCSV() {
        if (!this.app.currentReader || Object.keys(this.app.resourceUtilization).length === 0) {
            this.app.uiManager.showError('No resource data available to export.');
            return;
        }
        
        const allCurveData = [];
        
        Object.keys(this.app.resourceUtilization).forEach(resourceId => {
            const curve = this.app.currentReader.getResourceCurve(resourceId);
            const resource = curve.resource;
            
            if (curve.timeBasedData && curve.timeBasedData.length > 0) {
                curve.timeBasedData.forEach(week => {
                    allCurveData.push({
                        'Resource ID': resourceId,
                        'Resource Name': resource ? resource.rsrc_name : 'Unknown',
                        'Resource Type': resource ? this.app.uiManager.getResourceTypeLabel(resource.rsrc_type) : 'Unknown',
                        'Week Start': week.date.toISOString().split('T')[0],
                        'Week End': week.weekEnd.toISOString().split('T')[0],
                        'Target Quantity': week.weeklyTargetQty.toFixed(2),
                        'Actual Quantity': week.weeklyActualQty.toFixed(2),
                        'Target Cost': week.weeklyTargetCost.toFixed(2),
                        'Actual Cost': week.weeklyActualCost.toFixed(2),
                        'Active Activities': week.activeActivities.length,
                        'Quantity Variance': (week.weeklyActualQty - week.weeklyTargetQty).toFixed(2),
                        'Cost Variance': (week.weeklyActualCost - week.weeklyTargetCost).toFixed(2)
                    });
                });
            }
        });
        
        if (allCurveData.length === 0) {
            this.app.uiManager.showError('No time-based resource data available to export.');
            return;
        }
        
        const csv = this.generateCSV(allCurveData, [
            { key: 'Resource ID', label: 'Resource ID' },
            { key: 'Resource Name', label: 'Resource Name' },
            { key: 'Resource Type', label: 'Resource Type' },
            { key: 'Week Start', label: 'Week Start' },
            { key: 'Week End', label: 'Week End' },
            { key: 'Target Quantity', label: 'Target Quantity' },
            { key: 'Actual Quantity', label: 'Actual Quantity' },
            { key: 'Target Cost', label: 'Target Cost' },
            { key: 'Actual Cost', label: 'Actual Cost' },
            { key: 'Active Activities', label: 'Active Activities' },
            { key: 'Quantity Variance', label: 'Quantity Variance' },
            { key: 'Cost Variance', label: 'Cost Variance' }
        ]);
        
        this.downloadFile(csv, 'all_resource_curves.csv', 'text/csv');
    }

    exportResourceUtilizationJSON() {
        if (!this.app.currentReader || Object.keys(this.app.resourceUtilization).length === 0) {
            this.app.uiManager.showError('No resource utilization data available to export.');
            return;
        }
        
        const utilizationSummary = {};
        
        Object.keys(this.app.resourceUtilization).forEach(resourceId => {
            const util = this.app.resourceUtilization[resourceId];
            const curve = this.app.currentReader.getResourceCurve(resourceId);
            
            utilizationSummary[resourceId] = {
                resource: {
                    id: resourceId,
                    name: util.resource ? util.resource.rsrc_name : 'Unknown',
                    type: util.resource ? util.resource.rsrc_type : 'Unknown',
                    typeLabel: util.resource ? this.app.uiManager.getResourceTypeLabel(util.resource.rsrc_type) : 'Unknown'
                },
                summary: {
                    totalTargetQuantity: util.totalTargetQty,
                    totalActualQuantity: util.totalActualQty,
                    totalTargetCost: util.totalTargetCost,
                    totalActualCost: util.totalActualCost,
                    assignmentCount: util.assignmentCount,
                    quantityVariance: util.totalActualQty - util.totalTargetQty,
                    costVariance: util.totalActualCost - util.totalTargetCost,
                    quantityEfficiency: util.totalTargetQty > 0 ? (util.totalActualQty / util.totalTargetQty) * 100 : 0,
                    costEfficiency: util.totalTargetCost > 0 ? (util.totalActualCost / util.totalTargetCost) * 100 : 0
                },
                timeBasedData: curve.timeBasedData || [],
                assignments: util.assignments.map(assignment => ({
                    taskId: assignment.task_id,
                    targetQuantity: parseFloat(assignment.target_qty) || 0,
                    actualQuantity: (parseFloat(assignment.act_reg_qty) || 0) + (parseFloat(assignment.act_ot_qty) || 0),
                    targetCost: parseFloat(assignment.target_cost) || 0,
                    actualCost: (parseFloat(assignment.act_reg_cost) || 0) + (parseFloat(assignment.act_ot_cost) || 0),
                    remainingQuantity: parseFloat(assignment.remain_qty) || 0,
                    remainingCost: parseFloat(assignment.remain_cost) || 0
                }))
            };
        });
        
        const exportData = {
            project: {
                name: this.app.currentProject.proj_name,
                shortName: this.app.currentProject.proj_short_name,
                id: this.app.currentProject.proj_id,
                manager: this.app.currentProject.proj_mgr
            },
            resourceUtilization: utilizationSummary,
            statistics: {
                totalResources: Object.keys(utilizationSummary).length,
                totalAssignments: Object.values(utilizationSummary).reduce((sum, util) => sum + util.summary.assignmentCount, 0),
                totalTargetCost: Object.values(utilizationSummary).reduce((sum, util) => sum + util.summary.totalTargetCost, 0),
                totalActualCost: Object.values(utilizationSummary).reduce((sum, util) => sum + util.summary.totalActualCost, 0),
                overallCostVariance: Object.values(utilizationSummary).reduce((sum, util) => sum + util.summary.costVariance, 0)
            },
            exportDate: new Date().toISOString()
        };
        
        const json = JSON.stringify(exportData, null, 2);
        this.downloadFile(json, 'resource_utilization.json', 'application/json');
    }

    exportActivitiesCSV() {
        if (!this.app.allActivities.length) return;
        
        const csv = this.generateCSV(this.app.allActivities, [
            { key: 'task_code', label: 'Task Code' },
            { key: 'task_name', label: 'Task Name' },
            { key: 'status_code', label: 'Status' },
            { key: 'target_drtn_hr_cnt', label: 'Duration (hrs)' },
            { key: 'phys_complete_pct', label: '% Complete' },
            { key: 'total_float_hr_cnt', label: 'Float (hrs)' }
        ]);
        
        this.downloadFile(csv, 'activities.csv', 'text/csv');
    }

    exportCriticalPathCSV() {
        const criticalActivities = this.app.currentReader.getCriticalActivities();
        if (!criticalActivities.length) return;
        
        const csv = this.generateCSV(criticalActivities, [
            { key: 'task_code', label: 'Task Code' },
            { key: 'task_name', label: 'Task Name' },
            { key: 'target_drtn_hr_cnt', label: 'Duration (hrs)' },
            { key: 'total_float_hr_cnt', label: 'Float (hrs)' }
        ]);
        
        this.downloadFile(csv, 'critical_path.csv', 'text/csv');
    }

    exportResourcesCSV() {
        if (!this.app.currentReader.resources.length) return;
        
        const csv = this.generateCSV(this.app.currentReader.resources, [
            { key: 'rsrc_name', label: 'Resource Name' },
            { key: 'rsrc_type', label: 'Type' },
            { key: 'rsrc_id', label: 'ID' }
        ]);
        
        this.downloadFile(csv, 'resources.csv', 'text/csv');
    }

    exportProjectJSON() {
        const exportData = {
            project: {
                name: this.app.currentProject.proj_name,
                shortName: this.app.currentProject.proj_short_name,
                id: this.app.currentProject.proj_id,
                manager: this.app.currentProject.proj_mgr
            },
            statistics: {
                totalActivities: this.app.allActivities.length,
                totalResources: this.app.currentReader.resources.length,
                totalRelationships: this.app.currentReader.relationships.length,
                criticalActivities: this.app.currentReader.getCriticalActivities().length
            },
            exportDate: new Date().toISOString()
        };
        
        const json = JSON.stringify(exportData, null, 2);
        this.downloadFile(json, 'project_summary.json', 'application/json');
    }

    exportIntegrityReportCSV() {
        if (!this.app.integrityCheckResults) {
            this.app.uiManager.showError('No integrity check results to export. Please run the integrity check first.');
            return;
        }

        const csvData = this.app.integrityCheckResults.points.map(point => ({
            'Point': point.number,
            'Title': point.title,
            'Status': point.status.toUpperCase(),
            'Description': point.description,
            'Result': point.message,
            'Details': Object.entries(point.details).map(([k,v]) => `${k}: ${v}`).join('; ')
        }));

        const csv = this.generateCSV(csvData, [
            { key: 'Point', label: 'Point' },
            { key: 'Title', label: 'Title' },
            { key: 'Status', label: 'Status' },
            { key: 'Description', label: 'Description' },
            { key: 'Result', label: 'Result' },
            { key: 'Details', label: 'Details' }
        ]);

        this.downloadFile(csv, 'dcma14_integrity_report.csv', 'text/csv');
    }

    exportIntegrityReportJSON() {
        if (!this.app.integrityCheckResults) {
            this.app.uiManager.showError('No integrity check results to export. Please run the integrity check first.');
            return;
        }

        const exportData = {
            project: {
                name: this.app.currentProject.proj_name,
                shortName: this.app.currentProject.proj_short_name,
                id: this.app.currentProject.proj_id
            },
            assessment: {
                type: 'DCMA 14-Point Schedule Integrity Assessment',
                assessmentDate: new Date().toISOString(),
                summary: this.app.integrityCheckResults.summary,
                points: this.app.integrityCheckResults.points
            },
            metadata: {
                totalActivities: this.app.allActivities.length,
                totalRelationships: this.app.currentReader.relationships ? this.app.currentReader.relationships.length : 0,
                totalResources: this.app.currentReader.resources ? this.app.currentReader.resources.length : 0
            }
        };

        const json = JSON.stringify(exportData, null, 2);
        this.downloadFile(json, 'dcma14_integrity_report.json', 'application/json');
    }

    generateCSV(data, fields) {
        const headers = fields.map(f => f.label).join(',');
        const rows = data.map(item => 
            fields.map(f => {
                const value = item[f.key] || '';
                // Escape commas and quotes
                return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                    ? `"${value.replace(/"/g, '""')}"` 
                    : value;
            }).join(',')
        );
        
        return [headers, ...rows].join('\n');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
