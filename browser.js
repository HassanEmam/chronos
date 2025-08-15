/**
 * Browser-compatible bundle for P6XER-JS library
 * This file creates a global P6XERJS object that can be used directly in browsers
 */

// Activity Status enum
const ActivityStatus = {
    TK_NotStart: 'TK_NotStart',
    TK_Active: 'TK_Active',
    TK_Complete: 'TK_Complete'
};

// Resource Type enum
const ResourceType = {
    RT_Labor: 'RT_Labor',
    RT_Mat: 'RT_Mat',
    RT_Equip: 'RT_Equip',
    RT_Expense: 'RT_Expense'
};

// Utility function to convert string to number, handling edge cases
function convertToNumber(value) {
    if (value === null || value === undefined || value === '') {
        return 0;
    }
    const num = Number(value);
    return isNaN(num) ? 0 : num;
}

// Utility function to convert string to date
function convertToDate(value) {
    if (!value || value === '') {
        return null;
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
}

// XER Parser class
class XERParser {
    parseContent(content) {
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        const data = {};
        let currentTable = null;
        let currentFields = [];

        for (const line of lines) {
            if (line.startsWith('%T\t')) {
                // Table definition
                currentTable = line.substring(3);
                data[currentTable] = [];
                currentFields = [];
            } else if (line.startsWith('%F\t')) {
                // Field definition
                const fields = line.substring(3).split('\t');
                currentFields = fields;
            } else if (line.startsWith('%R\t')) {
                // Data row
                if (currentTable && currentFields.length > 0) {
                    const values = line.substring(3).split('\t');
                    const record = {};
                    
                    for (let i = 0; i < currentFields.length && i < values.length; i++) {
                        record[currentFields[i]] = values[i] || '';
                    }
                    
                    data[currentTable].push(record);
                }
            }
        }

        return data;
    }

    convertTypes(record, tableSchema) {
        if (!tableSchema) return record;
        
        const converted = { ...record };
        
        for (const [field, value] of Object.entries(record)) {
            const fieldSchema = tableSchema[field];
            if (!fieldSchema) continue;
            
            switch (fieldSchema.type) {
                case 'number':
                    converted[field] = convertToNumber(value);
                    break;
                case 'date':
                    converted[field] = convertToDate(value);
                    break;
                case 'boolean':
                    converted[field] = value === 'Y' || value === 'true' || value === '1';
                    break;
                default:
                    converted[field] = value;
            }
        }
        
        return converted;
    }
}

// Data schemas for type conversion
const SCHEMAS = {
    PROJECT: {
        proj_id: { type: 'string' },
        proj_short_name: { type: 'string' },
        proj_name: { type: 'string' },
        proj_mgr: { type: 'string' },
        status_code: { type: 'string' }
    },
    TASK: {
        task_id: { type: 'string' },
        proj_id: { type: 'string' },
        wbs_id: { type: 'string' },
        task_code: { type: 'string' },
        task_name: { type: 'string' },
        status_code: { type: 'string' },
        phys_complete_pct: { type: 'number' },
        target_drtn_hr_cnt: { type: 'number' },
        total_float_hr_cnt: { type: 'number' },
        driving_path_flag: { type: 'string' },
        act_start_date: { type: 'date' },
        act_end_date: { type: 'date' },
        early_start_date: { type: 'date' },
        early_end_date: { type: 'date' },
        late_start_date: { type: 'date' },
        late_end_date: { type: 'date' }
    },
    PROJWBS: {
        wbs_id: { type: 'string' },
        proj_id: { type: 'string' },
        obs_id: { type: 'string' },
        seq_num: { type: 'number' },
        est_wt: { type: 'number' },
        proj_node_flag: { type: 'string' },
        sum_data_flag: { type: 'string' },
        status_code: { type: 'string' },
        wbs_name: { type: 'string' },
        wbs_short_name: { type: 'string' },
        parent_wbs_id: { type: 'string' }
    },
    RSRC: {
        rsrc_id: { type: 'string' },
        rsrc_name: { type: 'string' },
        rsrc_type: { type: 'string' }
    },
    TASKPRED: {
        task_pred_id: { type: 'string' },
        task_id: { type: 'string' },
        pred_task_id: { type: 'string' },
        pred_type: { type: 'string' },
        lag_hr_cnt: { type: 'number' }
    },
    TASKRSRC: {
        taskrsrc_id: { type: 'string' },
        task_id: { type: 'string' },
        rsrc_id: { type: 'string' },
        proj_id: { type: 'string' },
        target_qty: { type: 'number' },
        target_cost: { type: 'number' },
        act_reg_qty: { type: 'number' },
        act_ot_qty: { type: 'number' },
        act_reg_cost: { type: 'number' },
        act_ot_cost: { type: 'number' },
        remain_qty: { type: 'number' },
        remain_cost: { type: 'number' }
    }
};

// Main Reader class
class Reader {
    constructor() {
        this.projects = [];
        this.activities = [];
        this.wbs = [];
        this.resources = [];
        this.relationships = [];
        this.activityResources = [];
        this.parser = new XERParser();
        this.rawData = {};
    }

    parseContent(content) {
        this.rawData = this.parser.parseContent(content);
        this.buildCollections();
    }

    buildCollections() {
        // Build projects
        if (this.rawData.PROJECT) {
            this.projects = this.rawData.PROJECT.map(record => 
                this.parser.convertTypes(record, SCHEMAS.PROJECT)
            );
        }

        // Build activities
        if (this.rawData.TASK) {
            this.activities = this.rawData.TASK.map(record => 
                this.parser.convertTypes(record, SCHEMAS.TASK)
            );
        }

        // Build WBS
        if (this.rawData.PROJWBS) {
            this.wbs = this.rawData.PROJWBS.map(record => 
                this.parser.convertTypes(record, SCHEMAS.PROJWBS)
            );
        }

        // Build resources
        if (this.rawData.RSRC) {
            this.resources = this.rawData.RSRC.map(record => 
                this.parser.convertTypes(record, SCHEMAS.RSRC)
            );
        }

        // Build relationships
        if (this.rawData.TASKPRED) {
            this.relationships = this.rawData.TASKPRED.map(record => 
                this.parser.convertTypes(record, SCHEMAS.TASKPRED)
            );
        }

        // Build activity resources
        if (this.rawData.TASKRSRC) {
            this.activityResources = this.rawData.TASKRSRC.map(record => 
                this.parser.convertTypes(record, SCHEMAS.TASKRSRC)
            );
        }
    }

    getActivitiesByProject(projectId) {
        return this.activities.filter(activity => activity.proj_id === projectId);
    }

    getCriticalActivities() {
        return this.activities.filter(activity => 
            convertToNumber(activity.total_float_hr_cnt) === 0 || 
            activity.driving_path_flag === 'Y'
        );
    }

    getActivitiesByStatus(status) {
        return this.activities.filter(activity => activity.status_code === status);
    }

    getResourcesByType(resourceType) {
        return this.resources.filter(resource => resource.rsrc_type === resourceType);
    }

    getRelationshipsByActivity(activityId) {
        return this.relationships.filter(rel => 
            rel.task_id === activityId || rel.pred_task_id === activityId
        );
    }

    getResourceAssignments(activityId) {
        return this.activityResources.filter(ar => ar.task_id === activityId);
    }

    getResourceAssignmentsByResource(resourceId) {
        return this.activityResources.filter(ar => ar.rsrc_id === resourceId);
    }

    getResourceUtilization() {
        const utilization = {};
        
        this.activityResources.forEach(assignment => {
            const resourceId = assignment.rsrc_id;
            const resource = this.resources.find(r => r.rsrc_id === resourceId);
            
            if (!utilization[resourceId]) {
                utilization[resourceId] = {
                    resource: resource,
                    totalTargetQty: 0,
                    totalActualQty: 0,
                    totalTargetCost: 0,
                    totalActualCost: 0,
                    assignmentCount: 0,
                    assignments: []
                };
            }
            
            const util = utilization[resourceId];
            util.totalTargetQty += convertToNumber(assignment.target_qty);
            util.totalActualQty += convertToNumber(assignment.act_reg_qty) + convertToNumber(assignment.act_ot_qty);
            util.totalTargetCost += convertToNumber(assignment.target_cost);
            util.totalActualCost += convertToNumber(assignment.act_reg_cost) + convertToNumber(assignment.act_ot_cost);
            util.assignmentCount++;
            util.assignments.push(assignment);
        });
        
        return utilization;
    }

    getResourceCurve(resourceId) {
        const assignments = this.getResourceAssignmentsByResource(resourceId);
        const curve = {
            resourceId: resourceId,
            resource: this.resources.find(r => r.rsrc_id === resourceId),
            dataPoints: [],
            timeBasedData: []
        };
        
        // Get all activities with their date ranges for this resource
        const activityData = [];
        assignments.forEach(assignment => {
            const activity = this.activities.find(a => a.task_id === assignment.task_id);
            if (activity) {
                const startDate = activity.act_start_date || activity.early_start_date;
                const endDate = activity.act_end_date || activity.early_end_date;
                
                if (startDate && endDate) {
                    activityData.push({
                        activityId: activity.task_id,
                        activityName: activity.task_name,
                        taskCode: activity.task_code,
                        startDate: new Date(startDate),
                        endDate: new Date(endDate),
                        targetQty: convertToNumber(assignment.target_qty),
                        actualQty: convertToNumber(assignment.act_reg_qty) + convertToNumber(assignment.act_ot_qty),
                        targetCost: convertToNumber(assignment.target_cost),
                        actualCost: convertToNumber(assignment.act_reg_cost) + convertToNumber(assignment.act_ot_cost),
                        remainingQty: convertToNumber(assignment.remain_qty),
                        remainingCost: convertToNumber(assignment.remain_cost),
                        activityStatus: activity.status_code,
                        activityCompletion: convertToNumber(activity.phys_complete_pct),
                        duration: convertToNumber(activity.target_drtn_hr_cnt)
                    });
                }
            }
        });
        
        // Sort by start date
        activityData.sort((a, b) => a.startDate - b.startDate);
        
        if (activityData.length === 0) {
            return curve;
        }
        
        // Find project date range
        const projectStartDate = new Date(Math.min(...activityData.map(a => a.startDate)));
        const projectEndDate = new Date(Math.max(...activityData.map(a => a.endDate)));
        
        // Generate time-based data points (weekly intervals)
        const timePoints = [];
        const currentDate = new Date(projectStartDate);
        const weekInMs = 7 * 24 * 60 * 60 * 1000;
        
        while (currentDate <= projectEndDate) {
            const weekStart = new Date(currentDate);
            const weekEnd = new Date(currentDate.getTime() + weekInMs);
            
            let weeklyTargetQty = 0;
            let weeklyActualQty = 0;
            let weeklyTargetCost = 0;
            let weeklyActualCost = 0;
            let activeActivities = [];
            
            // Check which activities are active during this week
            activityData.forEach(activity => {
                if (activity.startDate <= weekEnd && activity.endDate >= weekStart) {
                    // Calculate overlap percentage
                    const overlapStart = new Date(Math.max(activity.startDate, weekStart));
                    const overlapEnd = new Date(Math.min(activity.endDate, weekEnd));
                    const overlapDuration = Math.max(0, overlapEnd - overlapStart);
                    const activityDuration = activity.endDate - activity.startDate;
                    const overlapRatio = activityDuration > 0 ? overlapDuration / activityDuration : 0;
                    
                    // Distribute resource usage over time
                    const weeklyActivityTargetQty = activity.targetQty * overlapRatio;
                    const weeklyActivityActualQty = activity.actualQty * overlapRatio;
                    const weeklyActivityTargetCost = activity.targetCost * overlapRatio;
                    const weeklyActivityActualCost = activity.actualCost * overlapRatio;
                    
                    weeklyTargetQty += weeklyActivityTargetQty;
                    weeklyActualQty += weeklyActivityActualQty;
                    weeklyTargetCost += weeklyActivityTargetCost;
                    weeklyActualCost += weeklyActivityActualCost;
                    
                    activeActivities.push({
                        ...activity,
                        weeklyTargetQty: weeklyActivityTargetQty,
                        weeklyActualQty: weeklyActivityActualQty,
                        weeklyTargetCost: weeklyActivityTargetCost,
                        weeklyActualCost: weeklyActivityActualCost,
                        overlapRatio: overlapRatio
                    });
                }
            });
            
            timePoints.push({
                date: new Date(weekStart),
                weekEnd: new Date(weekEnd),
                weeklyTargetQty: weeklyTargetQty,
                weeklyActualQty: weeklyActualQty,
                weeklyTargetCost: weeklyTargetCost,
                weeklyActualCost: weeklyActualCost,
                activeActivities: activeActivities
            });
            
            currentDate.setTime(currentDate.getTime() + weekInMs);
        }
        
        curve.timeBasedData = timePoints;
        
        // Keep the original activity-based data points for compatibility
        assignments.forEach(assignment => {
            const activity = this.activities.find(a => a.task_id === assignment.task_id);
            if (activity) {
                curve.dataPoints.push({
                    activityId: activity.task_id,
                    activityName: activity.task_name,
                    taskCode: activity.task_code,
                    targetQty: convertToNumber(assignment.target_qty),
                    actualQty: convertToNumber(assignment.act_reg_qty) + convertToNumber(assignment.act_ot_qty),
                    targetCost: convertToNumber(assignment.target_cost),
                    actualCost: convertToNumber(assignment.act_reg_cost) + convertToNumber(assignment.act_ot_cost),
                    remainingQty: convertToNumber(assignment.remain_qty),
                    remainingCost: convertToNumber(assignment.remain_cost),
                    activityStatus: activity.status_code,
                    activityCompletion: convertToNumber(activity.phys_complete_pct),
                    startDate: activity.act_start_date || activity.early_start_date,
                    endDate: activity.act_end_date || activity.early_end_date
                });
            }
        });
        
        return curve;
    }

    getSummaryStats() {
        const stats = {
            totalProjects: this.projects.length,
            totalActivities: this.activities.length,
            totalResources: this.resources.length,
            totalRelationships: this.relationships.length,
            totalResourceAssignments: this.activityResources.length
        };

        // Activity status breakdown
        const statusCounts = {};
        this.activities.forEach(activity => {
            const status = activity.status_code || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        stats.statusBreakdown = statusCounts;

        // Resource type breakdown
        const resourceCounts = {};
        this.resources.forEach(resource => {
            const type = resource.rsrc_type || 'Unknown';
            resourceCounts[type] = (resourceCounts[type] || 0) + 1;
        });
        stats.resourceBreakdown = resourceCounts;

        // Duration statistics
        const durations = this.activities
            .map(a => convertToNumber(a.target_drtn_hr_cnt))
            .filter(d => d > 0);
        
        if (durations.length > 0) {
            stats.durationStats = {
                total: durations.reduce((sum, d) => sum + d, 0),
                average: durations.reduce((sum, d) => sum + d, 0) / durations.length,
                min: Math.min(...durations),
                max: Math.max(...durations)
            };
        }

        return stats;
    }

    exportActivitiesCSV() {
        const headers = ['task_code', 'task_name', 'status_code', 'target_drtn_hr_cnt', 'phys_complete_pct', 'total_float_hr_cnt'];
        const csvData = [headers.join(',')];
        
        this.activities.forEach(activity => {
            const row = headers.map(header => {
                const value = activity[header] || '';
                return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
            });
            csvData.push(row.join(','));
        });
        
        return csvData.join('\n');
    }

    exportResourcesCSV() {
        const headers = ['rsrc_id', 'rsrc_name', 'rsrc_type'];
        const csvData = [headers.join(',')];
        
        this.resources.forEach(resource => {
            const row = headers.map(header => {
                const value = resource[header] || '';
                return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
            });
            csvData.push(row.join(','));
        });
        
        return csvData.join('\n');
    }

    exportProjectJSON() {
        return JSON.stringify({
            projects: this.projects,
            summary: this.getSummaryStats(),
            exportDate: new Date().toISOString()
        }, null, 2);
    }
}

// Schedule Analyzer class
class ScheduleAnalyzer {
    constructor(reader) {
        this.reader = reader;
    }

    analyzeCriticalPath() {
        const criticalActivities = this.reader.getCriticalActivities();
        
        return {
            totalActivities: this.reader.activities.length,
            criticalActivities: criticalActivities.length,
            criticalPercentage: (criticalActivities.length / this.reader.activities.length) * 100,
            activities: criticalActivities
        };
    }

    analyzeScheduleHealth() {
        const activities = this.reader.activities;
        const statusCounts = {};
        
        activities.forEach(activity => {
            const status = activity.status_code || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        const criticalCount = this.reader.getCriticalActivities().length;
        
        return {
            totalActivities: activities.length,
            statusBreakdown: statusCounts,
            criticalActivities: criticalCount,
            healthScore: this.calculateHealthScore(statusCounts, criticalCount, activities.length)
        };
    }

    calculateHealthScore(statusCounts, criticalCount, totalActivities) {
        let score = 100;
        
        // Reduce score based on critical path percentage
        const criticalPercentage = (criticalCount / totalActivities) * 100;
        if (criticalPercentage > 30) score -= 20;
        else if (criticalPercentage > 20) score -= 10;
        
        // Reduce score based on not started activities
        const notStartedPercentage = ((statusCounts.TK_NotStart || 0) / totalActivities) * 100;
        if (notStartedPercentage > 80) score -= 15;
        else if (notStartedPercentage > 60) score -= 10;
        
        return Math.max(0, score);
    }

    getEarnedValueMetrics() {
        const activities = this.reader.activities;
        let plannedValue = 0;
        let earnedValue = 0;
        let actualCost = 0;

        activities.forEach(activity => {
            const duration = convertToNumber(activity.target_drtn_hr_cnt);
            const completion = convertToNumber(activity.phys_complete_pct) / 100;
            
            plannedValue += duration;
            earnedValue += duration * completion;
            actualCost += duration * completion; // Simplified - in real projects this would be actual costs
        });

        const scheduleVariance = earnedValue - plannedValue;
        const costVariance = earnedValue - actualCost;
        const schedulePerformanceIndex = plannedValue > 0 ? earnedValue / plannedValue : 0;
        const costPerformanceIndex = actualCost > 0 ? earnedValue / actualCost : 0;

        return {
            plannedValue,
            earnedValue,
            actualCost,
            scheduleVariance,
            costVariance,
            schedulePerformanceIndex,
            costPerformanceIndex
        };
    }
}

// Data Exporter class
class DataExporter {
    constructor(reader) {
        this.reader = reader;
    }

    exportToCSV(data, filename = 'export.csv') {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('No data provided for export');
        }

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header] || '';
                    return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                        ? `"${value.replace(/"/g, '""')}"` 
                        : value;
                }).join(',')
            )
        ].join('\n');

        return csvContent;
    }

    exportToJSON(data, filename = 'export.json') {
        return JSON.stringify(data, null, 2);
    }

    exportActivities(format = 'csv') {
        const activities = this.reader.activities.map(activity => ({
            task_code: activity.task_code,
            task_name: activity.task_name,
            status_code: activity.status_code,
            duration_hours: activity.target_drtn_hr_cnt,
            percent_complete: activity.phys_complete_pct,
            total_float_hours: activity.total_float_hr_cnt
        }));

        return format === 'csv' ? this.exportToCSV(activities) : this.exportToJSON(activities);
    }

    exportResources(format = 'csv') {
        const resources = this.reader.resources.map(resource => ({
            resource_id: resource.rsrc_id,
            resource_name: resource.rsrc_name,
            resource_type: resource.rsrc_type
        }));

        return format === 'csv' ? this.exportToCSV(resources) : this.exportToJSON(resources);
    }

    exportProjectSummary() {
        return this.exportToJSON({
            projects: this.reader.projects,
            summary: this.reader.getSummaryStats(),
            exportDate: new Date().toISOString()
        });
    }
}

// Create global P6XERJS object
window.P6XERJS = {
    Reader,
    XERParser,
    ScheduleAnalyzer,
    DataExporter,
    ActivityStatus,
    ResourceType
};

// Also support CommonJS for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.P6XERJS;
}
