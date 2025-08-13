/*
 * UI Management and Utility Functions
 */

export class UIManager {
    constructor(app) {
        this.app = app;
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    hideError() {
        document.getElementById('error').style.display = 'none';
    }

    showSuccess(message) {
        // Create and show success message
        const successDiv = document.createElement('div');
        successDiv.className = 'success';
        successDiv.textContent = message;
        
        const container = document.querySelector('.container');
        container.insertBefore(successDiv, document.getElementById('results'));
        
        // Remove after 5 seconds
        setTimeout(() => {
            successDiv.remove();
        }, 5000);
    }

    getStatusLabel(status) {
        const labels = {
            'TK_NotStart': 'Not Started',
            'TK_Active': 'Active',
            'TK_Complete': 'Complete',
            'Unknown': 'Unknown'
        };
        return labels[status] || status;
    }

    getStatusClass(status) {
        const classes = {
            'TK_NotStart': 'status-not-started',
            'TK_Active': 'status-active',
            'TK_Complete': 'status-complete'
        };
        return classes[status] || '';
    }

    getResourceTypeLabel(type) {
        const labels = {
            'RT_Labor': 'Labor',
            'RT_Mat': 'Material',
            'RT_Equip': 'Equipment',
            'RT_Expense': 'Expense',
            'Unknown': 'Unknown'
        };
        return labels[type] || type;
    }
}
