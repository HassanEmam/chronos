/*
 * File Upload and Drag/Drop Handler
 */

export class FileHandler {
    constructor(app) {
        this.app = app;
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            await this.processFile(file);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    async processFile(file) {
        if (!file.name.toLowerCase().endsWith('.xer')) {
            this.app.uiManager.showError('Please select a valid XER file.');
            return;
        }

        await this.app.loadProject(file);
    }
}
