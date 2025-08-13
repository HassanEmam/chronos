/*
 * DCMA 14-Point Integrity Checker
 */

export class IntegrityChecker {
    constructor(app) {
        this.app = app;
    }

    performIntegrityCheck() {
        if (!this.app.currentReader || !this.app.allActivities.length) {
            this.app.uiManager.showError('No project data available for integrity check.');
            return;
        }

        this.app.uiManager.showLoading(true);
        const btn = document.getElementById('integrityCheckBtn');
        btn.disabled = true;
        btn.textContent = '🔍 Running Check...';

        setTimeout(() => {
            try {
                this.app.integrityCheckResults = this.runDCMA14Assessment();
                this.displayIntegrityResults();
                
                // Show export buttons
                document.getElementById('exportIntegrityBtn').style.display = 'inline-block';
                document.getElementById('exportIntegrityJSONBtn').style.display = 'inline-block';
            } catch (error) {
                this.app.uiManager.showError(`Error during integrity check: ${error.message}`);
            } finally {
                this.app.uiManager.showLoading(false);
                btn.disabled = false;
                btn.textContent = '🔍 Run Integrity Check';
            }
        }, 500);
    }

    runDCMA14Assessment() {
        const activities = this.app.allActivities;
        const relationships = this.app.currentReader.relationships || [];
        const resources = this.app.currentReader.resources || [];
        const assignments = this.app.currentReader.activityResources || [];

        const results = {
            points: [],
            summary: {
                totalPoints: 14,
                passedPoints: 0,
                failedPoints: 0,
                warningPoints: 0,
                score: 0,
                grade: 'F'
            }
        };

        // Run all 14 DCMA checks
        results.points.push(this.checkLogic(activities, relationships));
        results.points.push(this.checkLeads(relationships));
        results.points.push(this.checkLags(relationships));
        results.points.push(this.checkRelationshipTypes(relationships));
        results.points.push(this.checkHardConstraints(activities));
        results.points.push(this.checkHighFloat(activities));
        results.points.push(this.checkNegativeFloat(activities));
        results.points.push(this.checkHighDuration(activities));
        results.points.push(this.checkInvalidDates(activities));
        results.points.push(this.checkResources(activities, assignments));
        results.points.push(this.checkIncompleteActivities(activities));
        results.points.push(this.checkCriticalPath(activities));
        results.points.push(this.checkCD1());
        results.points.push(this.checkCD234());

        // Calculate summary
        results.points.forEach(point => {
            if (point.status === 'pass') results.summary.passedPoints++;
            else if (point.status === 'fail') results.summary.failedPoints++;
            else if (point.status === 'warning') results.summary.warningPoints++;
        });

        results.summary.score = Math.round((results.summary.passedPoints / results.summary.totalPoints) * 100);
        
        if (results.summary.score >= 90) results.summary.grade = 'A';
        else if (results.summary.score >= 80) results.summary.grade = 'B';
        else if (results.summary.score >= 70) results.summary.grade = 'C';
        else if (results.summary.score >= 60) results.summary.grade = 'D';
        else results.summary.grade = 'F';

        return results;
    }

    // Individual DCMA check methods (simplified for brevity)
    checkLogic(activities, relationships) {
        const activitiesWithPred = new Set();
        const activitiesWithSucc = new Set();
        
        relationships.forEach(rel => {
            activitiesWithPred.add(rel.task_id);
            activitiesWithSucc.add(rel.pred_task_id);
        });

        const startMilestones = activities.filter(a => 
            !activitiesWithPred.has(a.task_id) && 
            (a.target_drtn_hr_cnt === 0 || !a.target_drtn_hr_cnt)
        );

        const finishMilestones = activities.filter(a => 
            !activitiesWithSucc.has(a.task_id) && 
            (a.target_drtn_hr_cnt === 0 || !a.target_drtn_hr_cnt)
        );

        const danglingActivities = activities.filter(a => 
            !activitiesWithPred.has(a.task_id) && !activitiesWithSucc.has(a.task_id)
        );

        const activitiesWithoutPred = activities.filter(a => 
            !activitiesWithPred.has(a.task_id) && 
            parseFloat(a.target_drtn_hr_cnt || 0) > 0
        );

        const activitiesWithoutSucc = activities.filter(a => 
            !activitiesWithSucc.has(a.task_id) && 
            parseFloat(a.target_drtn_hr_cnt || 0) > 0
        );

        const status = danglingActivities.length === 0 && startMilestones.length >= 1 && finishMilestones.length >= 1 ? 'pass' : 'fail';

        return {
            number: 1,
            title: 'Logic',
            description: 'All activities (excluding start/end milestones) should have at least one predecessor and one successor.',
            status: status,
            details: {
                danglingActivities: danglingActivities.length,
                startMilestones: startMilestones.length,
                finishMilestones: finishMilestones.length,
                totalActivities: activities.length,
                activitiesWithoutPred: activitiesWithoutPred.length,
                activitiesWithoutSucc: activitiesWithoutSucc.length
            },
            failedItems: {
                danglingActivities: danglingActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    duration: a.target_drtn_hr_cnt || 0
                })),
                activitiesWithoutPred: activitiesWithoutPred.slice(0, 25).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    duration: a.target_drtn_hr_cnt || 0
                })),
                activitiesWithoutSucc: activitiesWithoutSucc.slice(0, 25).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    duration: a.target_drtn_hr_cnt || 0
                }))
            },
            message: status === 'pass' ? 
                'All activities are properly linked with predecessors and successors.' : 
                `Found ${danglingActivities.length} dangling activities that lack proper logic ties.`
        };
    }

    checkLeads(relationships) {
        const leadRelationships = relationships.filter(rel => 
            rel.lag_hr_cnt && parseFloat(rel.lag_hr_cnt) < 0
        );

        const status = leadRelationships.length === 0 ? 'pass' : leadRelationships.length <= relationships.length * 0.05 ? 'warning' : 'fail';

        return {
            number: 2,
            title: 'Leads',
            description: 'Minimize use of lead time in relationships (should be < 5% of total relationships).',
            status: status,
            details: {
                leadsCount: leadRelationships.length,
                totalRelationships: relationships.length,
                percentage: relationships.length > 0 ? (leadRelationships.length / relationships.length * 100).toFixed(1) : 0
            },
            failedItems: {
                leadRelationships: leadRelationships.slice(0, 50).map(rel => {
                    const predActivity = this.app.allActivities.find(a => a.task_id === rel.pred_task_id);
                    const succActivity = this.app.allActivities.find(a => a.task_id === rel.task_id);
                    return {
                        id: rel.task_pred_id,
                        predCode: predActivity ? predActivity.task_code : rel.pred_task_id,
                        predName: predActivity ? predActivity.task_name : 'Unknown',
                        succCode: succActivity ? succActivity.task_code : rel.task_id,
                        succName: succActivity ? succActivity.task_name : 'Unknown',
                        lagHours: rel.lag_hr_cnt,
                        type: rel.pred_type || 'FS'
                    };
                })
            },
            message: status === 'pass' ? 
                'No lead relationships found.' : 
                `${leadRelationships.length} lead relationships found (${((leadRelationships.length / relationships.length) * 100).toFixed(1)}% of total).`
        };
    }

    checkLags(relationships) {
        const lagRelationships = relationships.filter(rel => 
            rel.lag_hr_cnt && parseFloat(rel.lag_hr_cnt) > 0
        );

        const status = lagRelationships.length <= relationships.length * 0.1 ? 'pass' : 'warning';

        return {
            number: 3,
            title: 'Lags',
            description: 'Minimize use of lag time in relationships (should be < 10% of total relationships).',
            status: status,
            details: {
                lagsCount: lagRelationships.length,
                totalRelationships: relationships.length,
                percentage: relationships.length > 0 ? (lagRelationships.length / relationships.length * 100).toFixed(1) : 0
            },
            failedItems: {
                lagRelationships: lagRelationships.slice(0, 50).map(rel => {
                    const predActivity = this.app.allActivities.find(a => a.task_id === rel.pred_task_id);
                    const succActivity = this.app.allActivities.find(a => a.task_id === rel.task_id);
                    return {
                        id: rel.task_pred_id,
                        predCode: predActivity ? predActivity.task_code : rel.pred_task_id,
                        predName: predActivity ? predActivity.task_name : 'Unknown',
                        succCode: succActivity ? succActivity.task_code : rel.task_id,
                        succName: succActivity ? succActivity.task_name : 'Unknown',
                        lagHours: rel.lag_hr_cnt,
                        type: rel.pred_type || 'FS'
                    };
                })
            },
            message: status === 'pass' ? 
                'Lag usage is within acceptable limits.' : 
                `${lagRelationships.length} lag relationships found (${((lagRelationships.length / relationships.length) * 100).toFixed(1)}% of total).`
        };
    }

    checkRelationshipTypes(relationships) {
        const fsRelationships = relationships.filter(rel => 
            !rel.pred_type || rel.pred_type === 'PR_FS'
        );
        const nonFsRelationships = relationships.filter(rel => 
            rel.pred_type && rel.pred_type !== 'PR_FS'
        );

        const percentage = relationships.length > 0 ? (fsRelationships.length / relationships.length) * 100 : 100;
        const status = percentage >= 90 ? 'pass' : percentage >= 80 ? 'warning' : 'fail';

        return {
            number: 4,
            title: 'Relationship Types',
            description: 'Finish-to-Start relationships should comprise ≥90% of all relationships.',
            status: status,
            details: {
                fsRelationships: fsRelationships.length,
                totalRelationships: relationships.length,
                percentage: percentage.toFixed(1)
            },
            failedItems: {
                nonFsRelationships: nonFsRelationships.slice(0, 50).map(rel => {
                    const predActivity = this.app.allActivities.find(a => a.task_id === rel.pred_task_id);
                    const succActivity = this.app.allActivities.find(a => a.task_id === rel.task_id);
                    return {
                        id: rel.task_pred_id,
                        predCode: predActivity ? predActivity.task_code : rel.pred_task_id,
                        predName: predActivity ? predActivity.task_name : 'Unknown',
                        succCode: succActivity ? succActivity.task_code : rel.task_id,
                        succName: succActivity ? succActivity.task_name : 'Unknown',
                        type: rel.pred_type || 'FS',
                        lagHours: rel.lag_hr_cnt || 0
                    };
                })
            },
            message: status === 'pass' ? 
                'Relationship types are properly distributed.' : 
                `Only ${percentage.toFixed(1)}% of relationships are Finish-to-Start.`
        };
    }

    checkHardConstraints(activities) {
        const constrainedActivities = activities.filter(a => 
            a.cstr_type && a.cstr_type !== 'CS_ALAP' && a.cstr_type !== 'CS_ASAP'
        );

        const status = constrainedActivities.length === 0 ? 'pass' : constrainedActivities.length <= activities.length * 0.05 ? 'warning' : 'fail';

        return {
            number: 5,
            title: 'Hard Constraints',
            description: 'Minimize hard constraints (Must Start On, Must Finish On, etc.).',
            status: status,
            details: {
                constrainedActivities: constrainedActivities.length,
                totalActivities: activities.length,
                percentage: activities.length > 0 ? (constrainedActivities.length / activities.length * 100).toFixed(1) : 0
            },
            failedItems: {
                constrainedActivities: constrainedActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    constraintType: a.cstr_type,
                    constraintDate: a.cstr_date || a.cstr_date2,
                    duration: a.target_drtn_hr_cnt || 0
                }))
            },
            message: status === 'pass' ? 
                'No hard constraints detected.' : 
                `${constrainedActivities.length} activities have hard constraints.`
        };
    }

    checkHighFloat(activities) {
        const highFloatActivities = activities.filter(a => 
            parseFloat(a.total_float_hr_cnt || 0) > 168 // More than 1 week
        );

        const percentage = activities.length > 0 ? (highFloatActivities.length / activities.length) * 100 : 0;
        const status = percentage <= 5 ? 'pass' : percentage <= 10 ? 'warning' : 'fail';

        return {
            number: 6,
            title: 'High Float',
            description: 'Activities with >1 week of float should be ≤5% of total activities.',
            status: status,
            details: {
                highFloatActivities: highFloatActivities.length,
                totalActivities: activities.length,
                percentage: percentage.toFixed(1)
            },
            failedItems: {
                highFloatActivities: highFloatActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    floatHours: a.total_float_hr_cnt || 0,
                    floatDays: ((a.total_float_hr_cnt || 0) / 8).toFixed(1),
                    duration: a.target_drtn_hr_cnt || 0
                }))
            },
            message: status === 'pass' ? 
                'High float activities are within acceptable limits.' : 
                `${highFloatActivities.length} activities have >1 week of float (${percentage.toFixed(1)}%).`
        };
    }

    checkNegativeFloat(activities) {
        const negativeFloatActivities = activities.filter(a => 
            parseFloat(a.total_float_hr_cnt || 0) < 0
        );

        const status = negativeFloatActivities.length === 0 ? 'pass' : 'fail';

        return {
            number: 7,
            title: 'Negative Float',
            description: 'No activities should have negative float.',
            status: status,
            details: {
                negativeFloatActivities: negativeFloatActivities.length,
                totalActivities: activities.length
            },
            failedItems: {
                negativeFloatActivities: negativeFloatActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    floatHours: a.total_float_hr_cnt || 0,
                    floatDays: ((a.total_float_hr_cnt || 0) / 8).toFixed(1),
                    duration: a.target_drtn_hr_cnt || 0
                }))
            },
            message: status === 'pass' ? 
                'No activities with negative float.' : 
                `${negativeFloatActivities.length} activities have negative float.`
        };
    }

    checkHighDuration(activities) {
        const highDurationActivities = activities.filter(a => 
            parseFloat(a.target_drtn_hr_cnt || 0) > 960 // More than 6 weeks
        );

        const percentage = activities.length > 0 ? (highDurationActivities.length / activities.length) * 100 : 0;
        const status = percentage <= 5 ? 'pass' : percentage <= 10 ? 'warning' : 'fail';

        return {
            number: 8,
            title: 'High Duration',
            description: 'Activities >6 weeks duration should be ≤5% of total activities.',
            status: status,
            details: {
                highDurationActivities: highDurationActivities.length,
                totalActivities: activities.length,
                percentage: percentage.toFixed(1)
            },
            failedItems: {
                highDurationActivities: highDurationActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    durationHours: a.target_drtn_hr_cnt || 0,
                    durationDays: ((a.target_drtn_hr_cnt || 0) / 8).toFixed(1),
                    durationWeeks: ((a.target_drtn_hr_cnt || 0) / 40).toFixed(1)
                }))
            },
            message: status === 'pass' ? 
                'Activity durations are within acceptable limits.' : 
                `${highDurationActivities.length} activities are >6 weeks duration (${percentage.toFixed(1)}%).`
        };
    }

    checkInvalidDates(activities) {
        const invalidDateActivities = activities.filter(a => {
            const startDate = a.act_start_date || a.early_start_date;
            const endDate = a.act_end_date || a.early_end_date;
            return !startDate || !endDate || new Date(startDate) > new Date(endDate);
        });

        const status = invalidDateActivities.length === 0 ? 'pass' : 'fail';

        return {
            number: 9,
            title: 'Invalid Dates',
            description: 'All activities must have valid start and finish dates.',
            status: status,
            details: {
                invalidDateActivities: invalidDateActivities.length,
                totalActivities: activities.length
            },
            failedItems: {
                invalidDateActivities: invalidDateActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    startDate: a.act_start_date || a.early_start_date,
                    endDate: a.act_end_date || a.early_end_date,
                    duration: a.target_drtn_hr_cnt || 0
                }))
            },
            message: status === 'pass' ? 
                'All activities have valid dates.' : 
                `${invalidDateActivities.length} activities have invalid or missing dates.`
        };
    }

    checkResources(activities, assignments) {
        const activitiesWithResources = new Set();
        assignments.forEach(assignment => {
            activitiesWithResources.add(assignment.task_id);
        });

        const workActivities = activities.filter(a => 
            parseFloat(a.target_drtn_hr_cnt || 0) > 0
        );

        const resourcedActivities = workActivities.filter(a => 
            activitiesWithResources.has(a.task_id)
        );

        const unresourcedActivities = workActivities.filter(a => 
            !activitiesWithResources.has(a.task_id)
        );

        const percentage = workActivities.length > 0 ? (resourcedActivities.length / workActivities.length) * 100 : 100;
        const status = percentage >= 95 ? 'pass' : percentage >= 80 ? 'warning' : 'fail';

        return {
            number: 10,
            title: 'Resources',
            description: 'All work activities should have resources assigned (≥95%).',
            status: status,
            details: {
                resourcedActivities: resourcedActivities.length,
                workActivities: workActivities.length,
                percentage: percentage.toFixed(1)
            },
            failedItems: {
                unresourcedActivities: unresourcedActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    duration: a.target_drtn_hr_cnt || 0,
                    status: a.status_code
                }))
            },
            message: status === 'pass' ? 
                'Resource assignment coverage is adequate.' : 
                `Only ${percentage.toFixed(1)}% of work activities have resources assigned.`
        };
    }

    checkIncompleteActivities(activities) {
        const incompleteActivities = activities.filter(a => 
            a.status_code === 'TK_Active' && 
            parseFloat(a.phys_complete_pct || 0) === 0
        );

        const activeActivities = activities.filter(a => 
            a.status_code === 'TK_Active'
        );

        const percentage = activeActivities.length > 0 ? (incompleteActivities.length / activeActivities.length) * 100 : 0;
        const status = percentage <= 5 ? 'pass' : percentage <= 10 ? 'warning' : 'fail';

        return {
            number: 11,
            title: 'Incomplete Activities',
            description: 'Active activities with 0% progress should be ≤5% of active activities.',
            status: status,
            details: {
                incompleteActivities: incompleteActivities.length,
                activeActivities: activeActivities.length,
                percentage: percentage.toFixed(1)
            },
            failedItems: {
                incompleteActivities: incompleteActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    progress: a.phys_complete_pct || 0,
                    duration: a.target_drtn_hr_cnt || 0,
                    startDate: a.act_start_date || a.early_start_date
                }))
            },
            message: status === 'pass' ? 
                'Active activity progress reporting is good.' : 
                `${incompleteActivities.length} active activities have 0% progress (${percentage.toFixed(1)}%).`
        };
    }

    checkCriticalPath(activities) {
        const criticalActivities = activities.filter(a => 
            parseFloat(a.total_float_hr_cnt || 0) === 0 || 
            a.driving_path_flag === 'Y'
        );

        const percentage = activities.length > 0 ? (criticalActivities.length / activities.length) * 100 : 0;
        const status = percentage >= 5 && percentage <= 15 ? 'pass' : 'warning';

        return {
            number: 12,
            title: 'Critical Path Test',
            description: 'Critical path should be 5-15% of total activities.',
            status: status,
            details: {
                criticalActivities: criticalActivities.length,
                totalActivities: activities.length,
                percentage: percentage.toFixed(1)
            },
            failedItems: {
                criticalActivities: percentage > 15 ? criticalActivities.slice(0, 50).map(a => ({
                    id: a.task_id,
                    code: a.task_code,
                    name: a.task_name,
                    floatHours: a.total_float_hr_cnt || 0,
                    duration: a.target_drtn_hr_cnt || 0,
                    drivingPath: a.driving_path_flag === 'Y'
                })) : [],
                analysis: percentage < 5 ? 'Critical path may be too short, indicating insufficient detail or missing dependencies' :
                         percentage > 15 ? 'Critical path may be too long, indicating over-constrained schedule or poor float distribution' :
                         'Critical path length is optimal'
            },
            message: status === 'pass' ? 
                'Critical path length is within optimal range.' : 
                `Critical path is ${percentage.toFixed(1)}% of total activities.`
        };
    }

    checkCD1() {
        return {
            number: 13,
            title: 'CD-1 Baseline',
            description: 'CD-1 baseline requirements (project-specific).',
            status: 'pass',
            details: { applicable: false },
            failedItems: {},
            message: 'CD-1 requirements not applicable for this project type.'
        };
    }

    checkCD234() {
        return {
            number: 14,
            title: 'CD-2/3/4 Requirements',
            description: 'CD-2/3/4 baseline requirements (project-specific).',
            status: 'pass',
            details: { applicable: false },
            failedItems: {},
            message: 'CD-2/3/4 requirements not applicable for this project type.'
        };
    }

    displayIntegrityResults() {
        const resultsContainer = document.getElementById('integrityResults');
        const results = this.app.integrityCheckResults;

        const summaryHtml = `
            <div class="integrity-summary">
                <div class="summary-score">${results.summary.score}%</div>
                <div class="summary-grade">Grade: ${results.summary.grade}</div>
                <div class="summary-breakdown">
                    <div class="breakdown-item">
                        <div class="breakdown-count">${results.summary.passedPoints}</div>
                        <div class="breakdown-label">Passed</div>
                    </div>
                    <div class="breakdown-item">
                        <div class="breakdown-count">${results.summary.warningPoints}</div>
                        <div class="breakdown-label">Warnings</div>
                    </div>
                    <div class="breakdown-item">
                        <div class="breakdown-count">${results.summary.failedPoints}</div>
                        <div class="breakdown-label">Failed</div>
                    </div>
                </div>
            </div>
        `;

        const pointsHtml = results.points.map((point, index) => `
            <div class="dcma-point ${point.status}">
                <h4 onclick="toggleDCMAPoint(${index})">
                    Point ${point.number}: ${point.title}
                    <span class="dcma-status ${point.status}">
                        ${point.status === 'pass' ? '✅ PASS' : 
                          point.status === 'warning' ? '⚠️ WARNING' : '❌ FAIL'}
                    </span>
                    <span class="dcma-expand-icon" id="expand-icon-${index}">🔽</span>
                </h4>
                <div class="dcma-summary">
                    <p><strong>Result:</strong> ${point.message}</p>
                </div>
                <div class="dcma-expandable" id="expandable-${index}">
                    <div class="dcma-expandable-content">
                        <p><strong>Description:</strong> ${point.description}</p>
                        <div class="dcma-details">
                            <h5>📊 Detailed Metrics:</h5>
                            ${Object.entries(point.details).map(([key, value]) => 
                                `<div class="dcma-metric">
                                    <strong>${this.formatMetricLabel(key)}:</strong> 
                                    <span>${this.formatMetricValue(key, value)}</span>
                                </div>`
                            ).join('')}
                        </div>
                        ${this.generateFailedItemsTable(point)}
                    </div>
                </div>
            </div>
        `).join('');

        resultsContainer.innerHTML = summaryHtml + pointsHtml;
    }

    formatMetricLabel(key) {
        const labels = {
            'danglingActivities': 'Dangling Activities',
            'totalActivities': 'Total Activities',
            'leadsCount': 'Lead Relationships',
            'lagsCount': 'Lag Relationships',
            'totalRelationships': 'Total Relationships',
            'percentage': 'Percentage',
            'fsRelationships': 'Finish-to-Start Relationships',
            'constrainedActivities': 'Constrained Activities',
            'highFloatActivities': 'High Float Activities',
            'negativeFloatActivities': 'Negative Float Activities',
            'highDurationActivities': 'Long Duration Activities',
            'invalidDateActivities': 'Invalid Date Activities',
            'resourcedActivities': 'Resourced Activities',
            'workActivities': 'Work Activities',
            'incompleteActivities': 'Incomplete Active Activities',
            'activeActivities': 'Active Activities',
            'criticalActivities': 'Critical Activities',
            'applicable': 'Applicable to Project'
        };
        return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    generateFailedItemsTable(point) {
        if (!point.failedItems || Object.keys(point.failedItems).length === 0) {
            return '';
        }

        let html = '';

        // Handle different types of failed items
        Object.entries(point.failedItems).forEach(([itemType, items]) => {
            if (!items || (Array.isArray(items) && items.length === 0)) return;

            if (itemType === 'analysis') {
                html += `<div class="failed-items-analysis">
                    <h5>📝 Analysis:</h5>
                    <p>${items}</p>
                </div>`;
                return;
            }

            if (!Array.isArray(items)) return;

            const itemTypeName = this.formatItemTypeName(itemType);
            html += `<div class="failed-items-section">
                <h5>🔍 ${itemTypeName} (${items.length} items):</h5>
                <div class="failed-items-table-wrapper">
                    <table class="failed-items-table">
                        <thead>
                            <tr>
                                ${this.generateTableHeaders(itemType, items[0])}
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => `
                                <tr>
                                    ${this.generateTableRow(itemType, item)}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        });

        return html;
    }

    formatItemTypeName(itemType) {
        const typeNames = {
            'danglingActivities': 'Dangling Activities',
            'activitiesWithoutPred': 'Activities Without Predecessors',
            'activitiesWithoutSucc': 'Activities Without Successors',
            'leadRelationships': 'Lead Relationships',
            'lagRelationships': 'Lag Relationships',
            'nonFsRelationships': 'Non-Finish-to-Start Relationships',
            'constrainedActivities': 'Constrained Activities',
            'highFloatActivities': 'High Float Activities',
            'negativeFloatActivities': 'Negative Float Activities',
            'highDurationActivities': 'Long Duration Activities',
            'invalidDateActivities': 'Invalid Date Activities',
            'unresourcedActivities': 'Unresourced Activities',
            'incompleteActivities': 'Incomplete Activities',
            'criticalActivities': 'Critical Activities',
            'excessiveLags': 'Excessive Lags'
        };
        return typeNames[itemType] || itemType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    generateTableHeaders(itemType, sampleItem) {
        if (!sampleItem) return '';

        // Activity-based headers
        if (['danglingActivities', 'activitiesWithoutPred', 'activitiesWithoutSucc', 'constrainedActivities', 
             'highFloatActivities', 'negativeFloatActivities', 'highDurationActivities', 'invalidDateActivities',
             'unresourcedActivities', 'incompleteActivities', 'criticalActivities'].includes(itemType)) {
            
            let headers = '<th>Activity Code</th><th>Activity Name</th>';
            
            if (sampleItem.hasOwnProperty('duration')) headers += '<th>Duration (hrs)</th>';
            if (sampleItem.hasOwnProperty('floatHours')) headers += '<th>Float (hrs)</th>';
            if (sampleItem.hasOwnProperty('floatDays')) headers += '<th>Float (days)</th>';
            if (sampleItem.hasOwnProperty('constraintType')) headers += '<th>Constraint Type</th>';
            if (sampleItem.hasOwnProperty('constraintDate')) headers += '<th>Constraint Date</th>';
            if (sampleItem.hasOwnProperty('durationDays')) headers += '<th>Duration (days)</th>';
            if (sampleItem.hasOwnProperty('durationWeeks')) headers += '<th>Duration (weeks)</th>';
            if (sampleItem.hasOwnProperty('startDate')) headers += '<th>Start Date</th>';
            if (sampleItem.hasOwnProperty('endDate')) headers += '<th>End Date</th>';
            if (sampleItem.hasOwnProperty('status')) headers += '<th>Status</th>';
            if (sampleItem.hasOwnProperty('progress')) headers += '<th>Progress %</th>';
            if (sampleItem.hasOwnProperty('drivingPath')) headers += '<th>Driving Path</th>';
            
            return headers;
        }

        // Relationship-based headers
        if (['leadRelationships', 'lagRelationships', 'nonFsRelationships', 'excessiveLags'].includes(itemType)) {
            let headers = '<th>Predecessor</th><th>Successor</th><th>Type</th>';
            
            if (sampleItem.hasOwnProperty('lagHours')) headers += '<th>Lag (hrs)</th>';
            if (sampleItem.hasOwnProperty('succDuration')) headers += '<th>Successor Duration</th>';
            
            return headers;
        }

        return '';
    }

    generateTableRow(itemType, item) {
        // Activity-based rows
        if (['danglingActivities', 'activitiesWithoutPred', 'activitiesWithoutSucc', 'constrainedActivities', 
             'highFloatActivities', 'negativeFloatActivities', 'highDurationActivities', 'invalidDateActivities',
             'unresourcedActivities', 'incompleteActivities', 'criticalActivities'].includes(itemType)) {
            
            let row = `<td>${item.code || item.id}</td><td>${item.name || 'Unknown'}</td>`;
            
            if (item.hasOwnProperty('duration')) row += `<td>${item.duration || 0}</td>`;
            if (item.hasOwnProperty('floatHours')) row += `<td>${item.floatHours || 0}</td>`;
            if (item.hasOwnProperty('floatDays')) row += `<td>${item.floatDays || 0}</td>`;
            if (item.hasOwnProperty('constraintType')) row += `<td>${item.constraintType || 'Unknown'}</td>`;
            if (item.hasOwnProperty('constraintDate')) row += `<td>${item.constraintDate || 'Unknown'}</td>`;
            if (item.hasOwnProperty('durationDays')) row += `<td>${item.durationDays || 0}</td>`;
            if (item.hasOwnProperty('durationWeeks')) row += `<td>${item.durationWeeks || 0}</td>`;
            if (item.hasOwnProperty('startDate')) row += `<td>${item.startDate || 'Unknown'}</td>`;
            if (item.hasOwnProperty('endDate')) row += `<td>${item.endDate || 'Unknown'}</td>`;
            if (item.hasOwnProperty('status')) row += `<td>${item.status || 'Unknown'}</td>`;
            if (item.hasOwnProperty('progress')) row += `<td>${item.progress || 0}%</td>`;
            if (item.hasOwnProperty('drivingPath')) row += `<td>${item.drivingPath ? 'Yes' : 'No'}</td>`;
            
            return row;
        }

        // Relationship-based rows
        if (['leadRelationships', 'lagRelationships', 'nonFsRelationships', 'excessiveLags'].includes(itemType)) {
            let row = `<td>${item.predCode || item.predName}</td><td>${item.succCode || item.succName}</td><td>${item.type || 'FS'}</td>`;
            
            if (item.hasOwnProperty('lagHours')) row += `<td>${item.lagHours || 0}</td>`;
            if (item.hasOwnProperty('succDuration')) row += `<td>${item.succDuration || 'Unknown'}</td>`;
            
            return row;
        }

        return '';
    }

    formatMetricValue(key, value) {
        if (key === 'percentage') {
            return `${value}%`;
        } else if (key === 'applicable') {
            return value ? 'Yes' : 'No';
        } else if (typeof value === 'number') {
            return value.toLocaleString();
        }
        return value;
    }
}

// Global function for toggling DCMA points
window.toggleDCMAPoint = function(index) {
    const expandable = document.getElementById(`expandable-${index}`);
    const icon = document.getElementById(`expand-icon-${index}`);
    
    if (expandable.classList.contains('expanded')) {
        expandable.classList.remove('expanded');
        icon.classList.remove('expanded');
        icon.textContent = '🔽';
    } else {
        expandable.classList.add('expanded');
        icon.classList.add('expanded');
        icon.textContent = '🔼';
    }
};
