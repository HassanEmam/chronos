/*
 * Chronos Main Application
 */

import { FileHandler } from './fileHandler.js';
import { UIManager } from './uiManager.js';
import { DataDisplayManager } from './dataDisplayManager.js';
import { ExportManager } from './exportManager.js';
import { IntegrityChecker } from './integrityChecker.js';
import { ResourceCurveManager } from './resourceCurveManager.js';

class ChronosApp {
    constructor() {
        this.currentReader = null;
        this.currentProject = null;
        this.allActivities = [];
        this.filteredActivities = [];
        this.allAssignments = [];
        this.filteredAssignments = [];
        this.resourceUtilization = {};
        this.integrityCheckResults = null;
        
        this.initializeComponents();
        this.setupEventListeners();
    }

    initializeComponents() {
        this.fileHandler = new FileHandler(this);
        this.uiManager = new UIManager(this);
        this.dataDisplayManager = new DataDisplayManager(this);
        this.exportManager = new ExportManager(this);
        this.integrityChecker = new IntegrityChecker(this);
        this.resourceCurveManager = new ResourceCurveManager(this);
    }

    setupEventListeners() {
        // File upload handling
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.fileHandler.handleFileUpload(e);
        });
        
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.addEventListener('dragover', (e) => this.fileHandler.handleDragOver(e));
        uploadArea.addEventListener('drop', (e) => this.fileHandler.handleDrop(e));
        uploadArea.addEventListener('dragleave', (e) => this.fileHandler.handleDragLeave(e));
    }

    async loadProject(file) {
        try {
            this.uiManager.showLoading(true);
            this.uiManager.hideError();

            const text = await file.text();
            
            // Parse XER content using P6XER-JS
            this.currentReader = new P6XERJS.Reader();
            this.currentReader.parseContent(text);
            
            if (this.currentReader.projects.length > 0) {
                this.currentProject = this.currentReader.projects[0];
                this.allActivities = this.currentReader.getActivitiesByProject(this.currentProject.proj_id);
                this.filteredActivities = [...this.allActivities];
                this.allAssignments = this.currentReader.activityResources || [];
                this.filteredAssignments = [...this.allAssignments];
                this.resourceUtilization = this.currentReader.getResourceUtilization();
                
                this.dataDisplayManager.displayResults();
                this.resourceCurveManager.populateResourceFilters();
                document.getElementById('results').style.display = 'block';
                
                this.uiManager.showSuccess(`Successfully loaded project: ${this.currentProject.proj_name || this.currentProject.proj_short_name || 'Unnamed Project'}`);
            } else {
                this.uiManager.showError('No projects found in the XER file.');
            }
        } catch (error) {
            this.uiManager.showError(`Error parsing XER file: ${error.message}`);
        } finally {
            this.uiManager.showLoading(false);
        }
    }

    filterActivities() {
        const statusFilter = document.getElementById('statusFilter').value;
        const minDurationFilter = parseInt(document.getElementById('minDurationFilter').value) || 0;
        const maxDurationFilter = parseInt(document.getElementById('maxDurationFilter').value) || Infinity;
        const nameFilter = document.getElementById('nameFilter').value.toLowerCase();

        this.filteredActivities = this.allActivities.filter(activity => {
            const matchesStatus = !statusFilter || activity.status_code === statusFilter;
            const matchesDuration = (activity.target_drtn_hr_cnt || 0) >= minDurationFilter && 
                                  (activity.target_drtn_hr_cnt || 0) <= maxDurationFilter;
            const matchesName = !nameFilter || 
                              activity.task_name.toLowerCase().includes(nameFilter) ||
                              activity.task_code.toLowerCase().includes(nameFilter);

            return matchesStatus && matchesDuration && matchesName;
        });

        this.dataDisplayManager.updateActivitiesTable();
    }

    filterAssignments() {
        const resourceFilter = document.getElementById('resourceAssignmentFilter').value;
        const activityFilter = document.getElementById('activityAssignmentFilter').value.toLowerCase();
        const minCostFilter = parseFloat(document.getElementById('minCostFilter').value) || 0;

        this.filteredAssignments = this.allAssignments.filter(assignment => {
            const matchesResource = !resourceFilter || assignment.rsrc_id === resourceFilter;
            const matchesCost = (parseFloat(assignment.target_cost) || 0) >= minCostFilter;
            
            let matchesActivity = true;
            if (activityFilter) {
                const activity = this.allActivities.find(a => a.task_id === assignment.task_id);
                matchesActivity = activity && (
                    activity.task_name.toLowerCase().includes(activityFilter) ||
                    activity.task_code.toLowerCase().includes(activityFilter)
                );
            }

            return matchesResource && matchesCost && matchesActivity;
        });

        this.dataDisplayManager.updateAssignmentsTable();
    }

    showTab(tabName) {
        // Hide all tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab pane
        document.getElementById(tabName).classList.add('active');

        // Add active class to clicked tab
        event.target.classList.add('active');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chronosApp = new ChronosApp();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(console.error);
        });
    }
});

// Global functions for onclick handlers
window.filterActivities = () => window.chronosApp.filterActivities();
window.filterAssignments = () => window.chronosApp.filterAssignments();
window.showTab = (tabName) => window.chronosApp.showTab(tabName);
window.showResourceCurve = () => window.chronosApp.resourceCurveManager.showResourceCurve();
window.performIntegrityCheck = () => window.chronosApp.integrityChecker.performIntegrityCheck();

// Export functions
window.exportResourceCurveCSV = () => window.chronosApp.exportManager.exportResourceCurveCSV();
window.exportAllResourceCurvesCSV = () => window.chronosApp.exportManager.exportAllResourceCurvesCSV();
window.exportResourceUtilizationJSON = () => window.chronosApp.exportManager.exportResourceUtilizationJSON();
window.exportActivitiesCSV = () => window.chronosApp.exportManager.exportActivitiesCSV();
window.exportCriticalPathCSV = () => window.chronosApp.exportManager.exportCriticalPathCSV();
window.exportResourcesCSV = () => window.chronosApp.exportManager.exportResourcesCSV();
window.exportProjectJSON = () => window.chronosApp.exportManager.exportProjectJSON();
window.exportIntegrityReportCSV = () => window.chronosApp.exportManager.exportIntegrityReportCSV();
window.exportIntegrityReportJSON = () => window.chronosApp.exportManager.exportIntegrityReportJSON();
