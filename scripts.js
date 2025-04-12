let filesData = [];

// Debugging section to verify global variables at startup
console.log("Initial filesData variable:", typeof filesData, Array.isArray(filesData) ? filesData.length : 'not an array');
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded - filesData variable state:", typeof filesData, Array.isArray(filesData) ? filesData.length : 'not an array');
    
    // Check localStorage usage and show warning if needed
    setTimeout(() => {
        checkAndShowStorageWarning();
    }, 1000); // Delay to ensure the UI is fully loaded
});

let previousFilesData = []; // Store previous analysis results
let worker;
let lastFiles = JSON.parse(localStorage.getItem('lastFiles')) || [];
let minLength = JSON.parse(localStorage.getItem('minLength')) || 10; // Default value
let minLengthCSS = JSON.parse(localStorage.getItem('minLengthCSS')) || 5; // CSS minimum length
let minLengthJS = JSON.parse(localStorage.getItem('minLengthJS')) || 10; // JS minimum length
let minLengthHTML = JSON.parse(localStorage.getItem('minLengthHTML')) || 10; // HTML minimum length
let minLengthPython = JSON.parse(localStorage.getItem('minLengthPython')) || 10; // Python minimum length
let includeFilters = [];
let excludeFilters = [];
let tempIncludeFilter = ""; // For live filtering
let tempExcludeFilter = ""; // For live filtering
let codeSimilarityThreshold = JSON.parse(localStorage.getItem('codeSimilarityThreshold')) || 20; // Default to 20%
let similarityPriorityMode = localStorage.getItem('similarityPriorityMode') || 'length'; // Default to length, no JSON.parse
let fileStats = {
    totalFiles: 0,
    filesWithElements: 0,
    totalElements: 0,
    totalComparisons: 0,
    fileDetails: []
};
let currentProjectId = "";
let allFixedComparisons = JSON.parse(localStorage.getItem('allFixedComparisons')) || {};
let fixedComparisons = {};
let projectHistory = JSON.parse(localStorage.getItem('projectHistory')) || {}; // Store analysis history by project
let autoLoadSimilarProjects = JSON.parse(localStorage.getItem('autoLoadSimilarProjects')) || false;
let similarityThreshold = JSON.parse(localStorage.getItem('similarityThreshold')) || 70; // Default to 70%
let ProjectSimilarityThreshold = JSON.parse(localStorage.getItem('similarityThreshold')) || 70; // Default to 70%



let lastSelectedFiles = JSON.parse(localStorage.getItem('lastSelectedFiles')) || [];

// Global variables for code type inclusion
let includeHTML = true; // Include HTML code by default
let includeCSS = true;  // Include CSS code by default
let includeJS = true;   // Include JS code by default
let includePython = true; // Include Python code by default

// Function to generate a meaningful project name
function generateProjectName(files) {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString().replace(/:\d\d\s/, ' ');
    return `${dateStr} ${timeStr}`;
}

// Function to generate a project ID based on file names
function generateProjectId(files) {
    if (!files || files.length === 0) return "";
    // Sort files to ensure consistent IDs regardless of file selection order
    const sortedFiles = [...files].sort();
    // Create a hash of the file names
    return sortedFiles.join('|');
}

// Fix the findMostSimilarProject function to correctly detect similar projects
function findMostSimilarProject(fileNames) {
    if (!fileNames || fileNames.length === 0) return null;
    
    const currentFileSet = new Set(fileNames.map(name => name.split('_')[0])); // Remove any timestamps
    let similarProjects = [];
    
    // Convert percentage threshold to decimal for comparison (70% → 0.7)
    const thresholdDecimal = similarityThreshold / 100;
    
    console.log(`Finding similar projects with threshold: ${similarityThreshold}%`);
    let ProjectSimilarityThreshold = similarityThreshold;
    console.log('ProjectSimilarityThreshold: ', ProjectSimilarityThreshold);

    Object.keys(allFixedComparisons).forEach(projectId => {
        const projectFiles = projectId.split('|');
        
        // Clean file names by removing any timestamps
        const cleanedProjectFiles = projectFiles.map(file => file.split('_')[0]);
        const projectFileSet = new Set(cleanedProjectFiles);
        
        // Calculate intersection and union for Jaccard similarity
        const intersection = new Set([...currentFileSet].filter(x => projectFileSet.has(x)));
        const union = new Set([...currentFileSet, ...projectFileSet]);
        
        // Jaccard similarity coefficient: intersection size / union size
        const similarity = intersection.size / union.size;
        
        // Check if this is a timestamped version of the exact same file set
        const isTimestampedVersion = projectId.includes('_') && 
            cleanedProjectFiles.sort().join('|') === [...currentFileSet].sort().join('|');
            
        // Boost the similarity to 100% if it's the exact same files but with timestamps
        const adjustedSimilarity = isTimestampedVersion ? 1.0 : similarity;
        
        // Log each project's similarity for debugging
        console.log(`Project: ${projectId}, Similarity: ${(adjustedSimilarity * 100).toFixed(1)}%, Threshold: ${thresholdDecimal * 100}%, Timestamped: ${isTimestampedVersion}`);
        
        // Use the user-defined similarity threshold
        if (adjustedSimilarity >= thresholdDecimal) {
            similarProjects.push({
                projectId: projectId,
                score: adjustedSimilarity,
                name: allFixedComparisons[projectId].metadata?.name || generateProjectName(projectFiles)
            });
        }
    });
    
    // Sort by similarity score (highest first)
    similarProjects.sort((a, b) => b.score - a.score);
    
    console.log(`Found ${similarProjects.length} similar projects`);
    
    // Return the similar projects array
    return similarProjects.length > 0 ? similarProjects : null;
}

// Function to load fixed comparisons for a specific project
function loadFixedComparisonsForProject(projectId) {
    currentProjectId = projectId;
    fixedComparisons = allFixedComparisons[projectId] || {};
    
    // More informative progress text
    const projectData = allFixedComparisons[projectId];
    const fileList = projectId.split('|');
    const fixedCount = projectData ? Object.keys(projectData).filter(key => key !== 'metadata').length : 0;
    
    if (projectData && projectData.metadata && projectData.metadata.name) {
        document.getElementById('progress-text').textContent = 
            `Project: ${projectData.metadata.name} (${fileList.length} files, ${fixedCount} fixed items)`;
    } else {
        document.getElementById('progress-text').textContent = 
            `Project: ${fileList.length} files (${fileList.slice(0, 3).join(', ')}${fileList.length > 3 ? '...' : ''})`;
    }
    
    // Update the projects list
    updateProjectsList();
}

// Function to toggle projects panel visibility
function toggleProjects() {
    const content = document.getElementById('projects-content');
    const toggle = document.querySelector('.projects-toggle');
    
    const isExpanded = content.classList.contains('expanded');
    
    if (isExpanded) {
        content.classList.remove('expanded');
        toggle.innerHTML = 'Show Projects <span class="chevron-icon chevron-down"></span>';
    } else {
        content.classList.add('expanded');
        toggle.innerHTML = 'Hide Projects <span class="chevron-icon chevron-up"></span>';
    }
}

// Function to update the projects list in the UI
function updateProjectsList() {
    const projectsList = document.getElementById('projects-list');
    projectsList.innerHTML = '';
    
    // Get the projects container for adding the similarity settings to the top
    const projectsContainer = document.getElementById('projects-content');
    
    // Check if the similarity settings already exist at the top
    let similaritySettingsContainer = document.getElementById('similarity-settings-container');
    if (!similaritySettingsContainer) {
        // Create the settings container if it doesn't exist
        similaritySettingsContainer = document.createElement('div');
        similaritySettingsContainer.id = 'similarity-settings-container';
        similaritySettingsContainer.className = 'similarity-settings-container';
        
        // Read auto-create option from localStorage
        const autoCreateProject = JSON.parse(localStorage.getItem('autoCreateProject')) || false;
        
        // Store in a global variable
        window.autoCreateProject = autoCreateProject;
        
        // Add the similarity settings HTML
        similaritySettingsContainer.innerHTML = `
            <div class="similarity-threshold-row">
                <label for="similarity-threshold">Project Similarity: <span id="threshold-value" class="editable-value">${similarityThreshold}</span>%</label>
                <input type="range" id="similarity-threshold" min="1" max="100" step="1" value="${similarityThreshold}">
            </div>
            <div class="auto-load-row">
                <div class="auto-load-checkbox-row">
                    <input type="checkbox" id="auto-load-option" ${autoLoadSimilarProjects ? 'checked' : ''}>
                    <label for="auto-load-option">Automatically load similar projects without confirmation</label>
                </div>
                <div class="auto-create-checkbox-row">
                    <input type="checkbox" id="auto-create-option" ${autoCreateProject ? 'checked' : ''}>
                    <label for="auto-create-option">Automatically create new project without comparing to saved projects</label>
                </div>
            </div>
        `;
        
        // Insert at the top of the projects content
        if (projectsContainer.firstChild) {
            projectsContainer.insertBefore(similaritySettingsContainer, projectsContainer.firstChild);
        } else {
            projectsContainer.appendChild(similaritySettingsContainer);
        }
        
        // Add event listeners
        setTimeout(() => {
            const checkbox = document.getElementById('auto-load-option');
            const autoCreateCheckbox = document.getElementById('auto-create-option');
            const thresholdSlider = document.getElementById('similarity-threshold');
            const thresholdValue = document.getElementById('threshold-value');
            
            if (checkbox) {
                checkbox.addEventListener('change', function() {
                    autoLoadSimilarProjects = this.checked;
                    localStorage.setItem('autoLoadSimilarProjects', JSON.stringify(autoLoadSimilarProjects));
                });
            }
            
            if (autoCreateCheckbox) {
                autoCreateCheckbox.addEventListener('change', function() {
                    window.autoCreateProject = this.checked;
                    localStorage.setItem('autoCreateProject', JSON.stringify(this.checked));
                });
            }
            
            if (thresholdSlider) {
                thresholdSlider.addEventListener('input', function() {
                    similarityThreshold = parseInt(this.value);
                    thresholdValue.textContent = similarityThreshold;
                });
                
                thresholdSlider.addEventListener('change', function() {
                    localStorage.setItem('similarityThreshold', JSON.stringify(similarityThreshold));
                });
            }
            
            // Make the threshold value editable
            if (thresholdValue) {
                setupEditableValue(thresholdValue, (value) => {
                    const newValue = Math.min(100, Math.max(1, parseInt(value) || 1));
                    similarityThreshold = newValue;
                    thresholdSlider.value = newValue;
                    localStorage.setItem('similarityThreshold', JSON.stringify(newValue));
                    return newValue;
                });
            }
        }, 0);
    }
    
    // Get all projects and sort by last used time
    const projects = Object.keys(allFixedComparisons).sort((a, b) => {
        const aTimestamp = allFixedComparisons[a].metadata?.lastUsed || '1970-01-01';
        const bTimestamp = allFixedComparisons[b].metadata?.lastUsed || '1970-01-01';
        return new Date(bTimestamp) - new Date(aTimestamp); // Most recent first
    });
    
    // Loop through projects and create list items
    projects.forEach(projectId => {
        const projectComps = allFixedComparisons[projectId];
        if (!projectComps) return;
        
        const projectMetadata = projectComps.metadata || {};
        const fileList = projectId.split('|');
        
        // Count the fixed comparisons (excluding metadata)
        const totalFixedComps = Object.keys(projectComps).filter(key => key !== 'metadata').length;
        
        // Create a project list item
        const projectItem = document.createElement('div');
        projectItem.className = 'project-item';
        
        // Create file tags to visualize files
        let fileTags = '<div class="file-tags">';
        fileList.forEach(file => {
            const extension = '.' + file.split('.').pop().toLowerCase();
            const color = getFileTypeColor(extension);
            const shortName = file.length > 15 ? file.substring(0, 12) + '...' : file;
            fileTags += `<span class="file-tag" style="background-color: ${color}" title="${file}">${shortName}</span>`;
        });
        fileTags += '</div>';
        
        projectItem.innerHTML = `
            <div class="project-info">
                <div class="project-timestamp">${new Date(projectMetadata.lastUsed).toLocaleString()}</div>
                <div class="project-name">${projectMetadata.name}</div>
                <div class="project-stats">
                    ${fileList.length} files, ${totalFixedComps} fixed comparison${totalFixedComps !== 1 ? 's' : ''}
                </div>
                ${fileTags}
            </div>
            <div class="project-actions">
                <button class="project-button rename" onclick="renameProject('${projectId.replace(/'/g, "\\'")}')">Rename</button>
                <button class="project-button load" onclick="loadProject('${projectId.replace(/'/g, "\\'")}')">Quick Load</button>
                <button class="project-button delete" onclick="deleteProject('${projectId.replace(/'/g, "\\'")}')">Delete</button>
            </div>
        `;
        
        // Highlight current project
        if (projectId === currentProjectId) {
            projectItem.classList.add('current-project');
        }
        
        projectsList.appendChild(projectItem);
    });
}

// Function to get a friendly name for a project
function getProjectName(fileList) {
    if (!fileList || fileList.length === 0) return "Unknown Project";
    
    // Try to find a common prefix or directory
    let commonPrefix = fileList[0].split(/[\/\\]/).slice(0, -1).join('/');
    if (commonPrefix && fileList.every(f => f.startsWith(commonPrefix))) {
        return commonPrefix + ` (${fileList.length} files)`;
    }
    
    // Return the first few filenames
    return fileList.slice(0, 3).join(', ') + (fileList.length > 3 ? ` and ${fileList.length - 3} more` : '');
}

// Function to load a project from storage
function loadProject(projectId) {
    if (!projectId || !allFixedComparisons[projectId]) {
        showToast(`Project not found: ${projectId}`, 'error');
        return false;
    }
    
    // Set as current project
    currentProjectId = projectId;
    
    // Get project name for display
    let projectName = allFixedComparisons[projectId].metadata?.name || getProjectName(projectId.split('|'));
    
    // Show loading message
    document.getElementById('progress-text').textContent = `Loading project "${projectName}"...`;
    
    // Load fixed comparisons from the selected project
    loadFixedComparisonsForProject(projectId);
    
    // Try to load prebuilt project data from localStorage
    try {
        // Find the most recent save for this project ID
        const baseKey = `project_data_${projectId}`;
        const allKeys = Object.keys(localStorage).filter(key => 
            key === baseKey || key.startsWith(baseKey + '_')
        );
        
        if (allKeys.length > 0) {
            // Sort by timestamp (most recent first)
            allKeys.sort((a, b) => {
                // Extract timestamps if they exist
                const aMatch = a.match(/_(\d+)$/);
                const bMatch = b.match(/_(\d+)$/);
                const aTimestamp = aMatch ? parseInt(aMatch[1]) : 0;
                const bTimestamp = bMatch ? parseInt(bMatch[1]) : 0;
                return bTimestamp - aTimestamp; // Sort most recent first
            });
            
            // Get the most recent save
            const mostRecentSave = allKeys[0];
            console.log(`Loading most recent project data from ${mostRecentSave}`);
            
            // Try to load the data
            const savedData = localStorage.getItem(mostRecentSave);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                    // Successfully loaded the project data
                    filesData = parsedData;
                    
                    // Mark any fixed items in the loaded data
                    let fixedCount = 0;
                    filesData.forEach(file => {
                        if (file.comparisons) {
                            file.comparisons.forEach(comp => {
                                if (isComparisonFixed(file.name, comp.source.name, comp.targetFile, comp.target.name)) {
                                    comp.fixed = true;
                                    fixedCount++;
                                }
                            });
                        }
                    });
                    
                    // Update UI to show the loaded project
                    updateProjectsList();
                    renderFilters();
                    displayComparisons(getCurrentFilter());
                    updateAllComparisons();
                    
                    showToast(`Loaded project "${projectName}" with ${filesData.length} files and ${fixedCount} fixed comparisons`, 'success');
                    
                    // Mark the project as active
                    document.getElementById('progress-text').textContent = `Project "${projectName}" loaded successfully.`;
                    
                    return true;
                }
            }
        }
        
        // If we got here, we either don't have saved data or it failed to load
        // Try to reconstruct from fixed comparisons (older style)
        // ... [rest of existing reconstruction code] ...
    } catch (error) {
        console.error("Error loading project data:", error);
        showToast(`Error loading project "${projectName}": ${error.message}`, 'error');
        return false;
    }
    
    // ... [rest of existing function] ...
}

// Function to delete a project's full data from localStorage
function deleteProjectFullData(projectId) {
    try {
        const storageKey = `project_data_${projectId}`;
        localStorage.removeItem(storageKey);
        console.log(`Deleted full project data for ${projectId}`);
        return true;
    } catch (error) {
        console.error("Error deleting project full data:", error);
        return false;
    }
}

// Function to delete a project from storage
function deleteProject(projectId) {
    if (!projectId || !allFixedComparisons[projectId]) {
        return;
    }
    
    if (confirm(`Are you sure you want to delete this project with ${projectId.split('|').length} files? This will remove all fixed comparison tracking for this project.`)) {
        // Delete the full project data first
        deleteProjectFullData(projectId);
        
        // Then delete the fixed comparisons data
        delete allFixedComparisons[projectId];
        localStorage.setItem('allFixedComparisons', JSON.stringify(allFixedComparisons));
        
        // If we deleted the current project, clear the current project
        if (projectId === currentProjectId) {
            currentProjectId = "";
            fixedComparisons = {};
            document.getElementById('progress-text').textContent = 'Project deleted. Please load a new project or analyze files.';
        }
        
        // Also remove from project history if it exists
        if (projectHistory[projectId]) {
            delete projectHistory[projectId];
            localStorage.setItem('projectHistory', JSON.stringify(projectHistory));
        }
        
        // Update the projects list
        updateProjectsList();
        
        // Show success message
        showToast("Project deleted successfully", "success");
    }
}

// Function to rename a project
function renameProject(projectId) {
    if (!projectId || !allFixedComparisons[projectId]) {
        showToast(`Project not found: ${projectId}`, 'error');
        return;
    }
    
    // Get current project name or generate one if missing
    const currentName = allFixedComparisons[projectId].metadata?.name || getProjectName(projectId.split('|'));
    
    // Prompt for new name
    const newName = prompt("Enter a new name for this project:", currentName);
    
    // Check if user cancelled or provided an empty name
    if (newName === null || newName.trim() === '') {
        return;
    }
    
    // Update the project name in metadata
    if (!allFixedComparisons[projectId].metadata) {
        allFixedComparisons[projectId].metadata = {};
    }
    
    allFixedComparisons[projectId].metadata.name = newName.trim();
    allFixedComparisons[projectId].metadata.lastUsed = Date.now();
    
    // Save to localStorage
    localStorage.setItem('allFixedComparisons', JSON.stringify(allFixedComparisons));
    
    // Update the projects list
    updateProjectsList();
    
    // Show success message
    showToast(`Project renamed to "${newName.trim()}"`, "success");
    
    // If this is the current project, update the displayed project name
    if (projectId === currentProjectId) {
        document.getElementById('progress-text').textContent = `Project "${newName.trim()}" loaded.`;
    }
}

// When the page loads, check if there's a last used project to load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize projects panel
    updateProjectsList();
    
    // Set up the similarity priority mode buttons based on stored value
    const storedMode = localStorage.getItem('similarityPriorityMode') || 'length';
    document.querySelectorAll('.similarity-mode-btn').forEach(button => {
        if (button.dataset.mode === storedMode) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    // Initialize the stats panel
    const content = document.getElementById('stats-content');
    content.classList.remove('expanded');
    content.classList.add('partially-expanded');
    
    // Update the toggle button text
    const toggle = document.querySelector('.stats-toggle');
    const expandToggle = document.querySelector('.stats-expand-toggle');
    toggle.innerHTML = 'Collapse <span class="chevron-icon chevron-up"></span>';
    expandToggle.innerHTML = 'Expand <span class="chevron-icon chevron-down"></span>';
    
    // The expand-all-stats button has been removed
    // document.getElementById('expand-all-stats').addEventListener('click', toggleExpandAllStats);
    
    // Check if we have a most recently used project
    const projects = Object.keys(allFixedComparisons);
    if (projects.length > 0) {
        // Sort by last used time
        projects.sort((a, b) => {
            const aTime = allFixedComparisons[a].metadata?.lastUsed || 0;
            const bTime = allFixedComparisons[b].metadata?.lastUsed || 0;
            return new Date(bTime) - new Date(aTime);
        });
        
        // Show a message about the most recent project
        const mostRecentProject = projects[0];
        const projectMeta = allFixedComparisons[mostRecentProject].metadata || {};
        const projectFiles = mostRecentProject.split('|');
        
        if (projectMeta) {
            const projectsToggle = document.querySelector('.projects-toggle');
            // Make sure projects panel is visible by default
            document.getElementById('projects-content').classList.add('expanded');
            if (projectsToggle) {
                projectsToggle.innerHTML = 'Hide Projects <span class="chevron-icon chevron-up"></span>';
            }
            
            // Highlight the most recent project in the list
            const projectItems = document.querySelectorAll('.project-item');
            projectItems.forEach(item => {
                if (item.querySelector('.project-name').textContent === projectMeta.name) {
                    item.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
                    item.style.border = '1px solid rgba(76, 175, 80, 0.3)';
                    setTimeout(() => {
                        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }
            });
            
            document.getElementById('progress-text').textContent = 
                `Most recent project: "${projectMeta.name}" with ${projectFiles.length} files. Click "Quick Open" to load files or click "Load" on the project.`;
        }
    }
    
    // Other existing event listeners
    const includeSearch = document.getElementById('include-search');
    const excludeSearch = document.getElementById('exclude-search');
    
    includeSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addIncludeFilter();
            e.preventDefault();
        }
    });
    
    excludeSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addExcludeFilter();
            e.preventDefault();
        }
    });
    
    // Live filtering while typing
    includeSearch.addEventListener('input', function(e) {
        tempIncludeFilter = this.value.trim();
        displayComparisons('all');
    });
    
    excludeSearch.addEventListener('input', function(e) {
        tempExcludeFilter = this.value.trim();
        displayComparisons('all');
    });
});

function getFileTypeColor(extension) {
    const colors = {
        '.html': 'var(--html-color)',
        '.css': 'var(--css-color)',
        '.js': 'var(--js-color)',
        '.py': 'var(--py-color)'
    };
    return colors[extension] || 'var(--default-color)';
}

// Function to setup editable values for sliders
function setupEditableValue(element, updateCallback) {
    element.addEventListener('click', function() {
        const currentValue = this.textContent;
        this.classList.add('editing');
        this.setAttribute('contenteditable', 'true');
        this.focus();
        
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(this);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        const onBlur = () => {
            const newValue = updateCallback(this.textContent);
            this.textContent = newValue;
            this.classList.remove('editing');
            this.removeAttribute('contenteditable');
            this.removeEventListener('blur', onBlur);
            this.removeEventListener('keydown', onKeyDown);
        };
        
        const onKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur();
            }
        };
        
        this.addEventListener('blur', onBlur);
        this.addEventListener('keydown', onKeyDown);
    });
}

// Generic function to update minimum length settings
function updateMinLengthSetting(type, value, defaultValue) {
    try {
        // Get the variable reference based on type
        let varName = type === 'general' ? 'minLength' : `minLength${type}`;
        let oldValue = window[varName] || defaultValue;
        
        // Add debugging timestamp to track frequency of calls
        console.log(`${new Date().toISOString()} - updateMinLengthSetting called for ${type} with value ${value}`);
        
        // Prevent excessive calls using a debounce mechanism
        if (window.minLengthUpdateTimer) {
            console.log("Clearing previous update timer to prevent excessive updates");
            clearTimeout(window.minLengthUpdateTimer);
        }
        
        // Update the value
        window[varName] = parseInt(value);
        
        // Update DOM and localStorage - with null checking
        // Fix: Use the correct ID based on type - for general type, use "minLengthValue" not "minLengthgeneralValue"
        const valueElementId = type === 'general' ? 'minLengthValue' : `minLength${type}Value`;
        const valueElement = document.getElementById(valueElementId);
        
        if (valueElement) {
            valueElement.textContent = window[varName];
        } else {
            console.warn(`Element with ID ${valueElementId} not found`);
        }
        
        localStorage.setItem(varName, JSON.stringify(window[varName]));
        
        // Log the change for debugging
        console.log(`${type} MinLength changed from ${oldValue} to ${window[varName]}`);
        
        // Re-analyze with new minLength if we have files - use debounce pattern
        if (window.filesData && window.filesData.length > 0) {
            // Set a timer to delay the update and prevent excessive calls
            window.minLengthUpdateTimer = setTimeout(() => {
                console.log(`${new Date().toISOString()} - Executing delayed update for ${type}`);
                
                // For the general minLength, apply additional logic
                if (type === 'general' && Math.abs(oldValue - window[varName]) <= 3 && similarityPriorityMode !== 'length') {
                    // For small changes in token/balanced modes, just re-filter the display
                    console.log("Small change detected - only re-filtering display");
                    displayComparisons('all');
                } else {
                    // For significant changes or type-specific lengths, do a full re-analysis
                    let message = type === 'general' ? 'minimum code length' : 
                                 type === 'CSS' ? 'CSS minimum code length' : 
                                 type === 'JS' ? 'JavaScript minimum code length' : 
                                 'HTML minimum code length';
                    
                    console.log(`Triggering full re-analysis for ${message}: ${window[varName]}`);
                    window.showToast(`Re-analyzing with new ${message}: ${window[varName]}`, 'info', 2000);
                    window.analyzeFiles();
                }
                
                // Clear the timer reference
                window.minLengthUpdateTimer = null;
            }, 500); // Wait 500ms before executing the update
        }
    } catch (error) {
        console.error(`Error in updateMinLengthSetting for type ${type}:`, error);
    }
}

/**
 * Universal function to update any type of minimum length setting
 * @param {string} type - The type of setting ('general', 'CSS', 'JS', 'HTML')
 * @param {number|string} value - The new value to set
 */
function updateTypeMinLength(type, value) {
    const defaults = {
        'general': 10,
        'CSS': 5,
        'JS': 10,
        'HTML': 10,
        'Python': 10
    };
    
    updateMinLengthSetting(type, value, defaults[type] || 10);
}

/**
 * Function to update the general minimum code length
 * Acts as a master control that updates all other minimum lengths
 * @param {number|string} value - The new minimum length value
 */
function updateMinLength(value) {
    try {
        // Convert value to integer
        const intValue = parseInt(value);
        
        // Update general setting first
        updateTypeMinLength('general', intValue);
        
        // Update all type-specific sliders to match the general value
        const codeTypes = ['CSS', 'JS', 'HTML', 'Python'];
        codeTypes.forEach(type => {
            try {
                // Update the variable
                window[`minLength${type}`] = intValue;
                
                // Update the slider position
                const slider = document.getElementById(`minLength${type}`);
                if (slider) slider.value = intValue;
                
                // Update the displayed value
                const valueDisplay = document.getElementById(`minLength${type}Value`);
                if (valueDisplay) valueDisplay.textContent = intValue;
                
                // Store in localStorage
                localStorage.setItem(`minLength${type}`, JSON.stringify(intValue));
            } catch (typeError) {
                console.warn(`Error updating ${type} slider:`, typeError);
            }
        });
        
        // Show a toast notification about the synchronized values
        if (window.showToast && window.filesData && window.filesData.length > 0) {
            window.showToast(`All minimum code lengths synchronized to ${intValue}`, 'info', 2000);
        }
    } catch (error) {
        console.error("Error in updateMinLength:", error);
    }
}

// Function to update the minimum CSS code length
function updateMinLengthCSS(value) {
    updateTypeMinLength('CSS', value);
}

// Function to update the minimum JS code length
function updateMinLengthJS(value) {
    updateTypeMinLength('JS', value);
}

// Function to update the minimum HTML code length
function updateMinLengthHTML(value) {
    updateTypeMinLength('HTML', value);
}

// Function to update the minimum Python code length
function updateMinLengthPython(value) {
    updateTypeMinLength('Python', value);
}

// Function to toggle code type inclusion in analysis
function toggleCodeType(type) {
    // Map short code type to button ID format
    const typeMap = {
        'html': 'HTML',
        'css': 'CSS',
        'js': 'JS',
        'py': 'Python'
    };
    
    // Get the proper button ID format
    const buttonType = typeMap[type.toLowerCase()] || type.toUpperCase();
    const button = document.getElementById(`include${buttonType}`);
    
    if (!button) return;
    
    // Toggle the active class
    button.classList.toggle('active');
    
    // Update the global variable based on button state
    switch (type.toLowerCase()) {
        case 'html':
            includeHTML = button.classList.contains('active');
            break;
        case 'css':
            includeCSS = button.classList.contains('active');
            break;
        case 'js':
            includeJS = button.classList.contains('active');
            break;
        case 'py':
            includePython = button.classList.contains('active');
            break;
    }
    
    // Show toast message
    if (window.showToast) {
        const enabled = button.classList.contains('active');
        const typeName = type.toUpperCase();
        window.showToast(`${typeName} code analysis ${enabled ? 'enabled' : 'disabled'}`, 'info', 2000);
    }
    
    console.log(`Code type ${type} toggled to ${button.classList.contains('active')}`);
}

function updateCodeSimilarity(value) {
    // Add debugging timestamp
    console.log(`${new Date().toISOString()} - updateCodeSimilarity called with value ${value}`);
    
    // Prevent excessive calls using a debounce mechanism
    if (window.similarityUpdateTimer) {
        console.log("Clearing previous similarity update timer to prevent excessive updates");
        clearTimeout(window.similarityUpdateTimer);
    }
    
    // Store the old threshold value for comparison
    const oldThreshold = codeSimilarityThreshold;
    
    // Update value immediately
    codeSimilarityThreshold = parseInt(value);
    document.getElementById('codeSimilarityValue').textContent = codeSimilarityThreshold;
    localStorage.setItem('codeSimilarityThreshold', JSON.stringify(codeSimilarityThreshold));
    
    // Debounce the update
    window.similarityUpdateTimer = setTimeout(() => {
        console.log(`${new Date().toISOString()} - Executing delayed similarity update: ${codeSimilarityThreshold}`);
        
        if (filesData && filesData.length > 0) {
            // Instead of re-analyzing, just update the display with the new threshold
            window.showToast(`Filtering results with new similarity threshold: ${codeSimilarityThreshold}%`, 'info', 2000);
            
            // We only want to perform a full re-analysis in specific cases:
            // 1. If the threshold was lowered significantly (by more than 5%) below the previous analysis threshold
            // 2. If we're in length-priority mode (which is more sensitive to threshold changes)
            const significantThresholdReduction = (oldThreshold - codeSimilarityThreshold) > 5;
            const needsReanalysis = codeSimilarityThreshold < oldThreshold && significantThresholdReduction;
            
            // Find the visible comparisons with the current filter
            const currentFilter = getCurrentFilter();
            const hasVisibleComparisons = checkForVisibleComparisons(codeSimilarityThreshold, currentFilter);
            
            // Only reanalyze if needed and there's no visible comparisons with new threshold
            if (needsReanalysis && !hasVisibleComparisons) {
                console.log(`Threshold reduced significantly from ${oldThreshold} to ${codeSimilarityThreshold}, re-analyzing`);
                analyzeFiles(); // Re-analyze with lower threshold to catch more comparisons
            } else {
                console.log(`Using existing results and filtering for threshold: ${codeSimilarityThreshold}`);
                // Just refresh the display with the existing data
                displayComparisons(currentFilter);
            }
        }
        
        window.similarityUpdateTimer = null;
    }, 500);
}

// Helper function to get the current filter being applied
function getCurrentFilter() {
    // Find which filter button is currently highlighted
    const filterButtons = document.querySelectorAll('.sort-buttons .btn');
    let currentFilter = 'all'; // Default
    
    filterButtons.forEach(button => {
        // Check if this button is highlighted
        if (button.style.opacity === '1' || button.style.transform === 'translateY(-2px)') {
            if (button.textContent === 'All') currentFilter = 'all';
            else if (button.textContent === 'HTML') currentFilter = '.html';
            else if (button.textContent === 'CSS') currentFilter = '.css';
            else if (button.textContent === 'JS') currentFilter = '.js';
            else if (button.textContent === 'Python') currentFilter = '.py';
            else if (button.textContent === 'Cross-File') currentFilter = 'cross-file';
            else if (button.textContent === 'Same-File') currentFilter = 'same-file';
        }
    });
    
    return currentFilter;
}

// Helper function to check if there are visible comparisons with the given threshold
function checkForVisibleComparisons(threshold, filterType) {
    let visibleComparisons = 0;
    
    filesData.forEach(file => {
        // Skip if this file type doesn't match the filter
        if (filterType !== 'all' && 
            filterType !== 'cross-file' && 
            filterType !== 'same-file' && 
            file.extension !== filterType) {
            return;
        }
        
        if (file.comparisons && Array.isArray(file.comparisons)) {
            file.comparisons.forEach(comp => {
                // Skip if this comparison doesn't meet the threshold
                if (comp.similarity < threshold) {
                    return;
                }
                
                // Apply cross-file filter
                if (filterType === 'cross-file' && comp.targetFile === file.name) {
                    return;
                }
                
                // Apply same-file filter
                if (filterType === 'same-file' && comp.targetFile !== file.name) {
                    return;
                }
                
                // Apply any include/exclude filters
                const text = (comp.source.name + ' ' + (comp.source.full || comp.source.body) + ' ' + 
                             comp.target.name + ' ' + (comp.target.full || comp.target.body)).toLowerCase();
                
                // Check include filters
                if (includeFilters.length > 0 && 
                    !includeFilters.every(filter => text.includes(filter.toLowerCase()))) {
                    return;
                }
                
                // Check exclude filters
                if (excludeFilters.length > 0 && 
                    excludeFilters.some(filter => text.includes(filter.toLowerCase()))) {
                    return;
                }
                
                // This comparison passes all filters
                visibleComparisons++;
            });
        }
    });
    
    return visibleComparisons > 0;
}

function updateSimilarityPriorityMode(mode) {
    similarityPriorityMode = mode;
    localStorage.setItem('similarityPriorityMode', mode);
    
    // Update button states
    const buttons = document.querySelectorAll('.similarity-mode-btn');
    buttons.forEach(button => {
        if (button.dataset.mode === mode) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    // Force a re-render of comparisons if they exist
    if (filesData && filesData.length > 0) {
        // Re-display comparisons with the current filter
        const currentFilter = getCurrentFilter();
        displayComparisons(currentFilter);
    }
}

// Add or update the addLineNumbers function to properly number code lines
function addLineNumbers(code, startLineNumber = 1) {
    if (!code) return '';
    
    // Split the code into lines
    const lines = code.split('\n');
    
    // Create a new array with line numbers
    const numberedLines = lines.map((line, index) => {
        const lineNumber = index + startLineNumber;
        return `<span class="line-number">${lineNumber}</span>${line}`;
    });
    
    // Join the lines back together
    return numberedLines.join('\n');
}

// Update the highlight similarities function to highlight matching parts
function highlightSimilarities(text1, text2) {
    // Safety check for very large code blocks that might cause freezing
    if (text1.length > 20000 || text2.length > 20000) {
        console.log("Code blocks too large for highlighting, skipping highlights to prevent freezing");
        return [
            formatPreserved(text1),
            formatPreserved(text2)
        ];
    }
    
    // Handle special characters in code display
    const formatPreserved = (text) => {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };
    
    // First format the text to preserve special characters
    const formattedText1 = formatPreserved(text1);
    const formattedText2 = formatPreserved(text2);
    
    // Special handling for CSS code - we want to only highlight matching properties, not entire blocks
    const isCSS = (text) => {
        return text.includes('{') && text.includes('}') && 
               (text.includes(':') && text.includes(';')) &&
               !text.includes('function ') && !text.includes('class ');
    };
    
    // Improved highlighting for CSS that only highlights the specific matching properties
    if (isCSS(text1) && isCSS(text2)) {
        return highlightCSSProperties(formattedText1, formattedText2);
    }
    
    // Special handling for JavaScript functions
    const isJSFunction = (text) => {
        return text.trim().match(/^(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:function|\([^)]*\)\s*=>)|class\s+\w+)\s*\(.*\)/);
    };
    
    // If both texts are JS functions, try to highlight by logical blocks (statements, expressions)
    if (isJSFunction(text1) && isJSFunction(text2)) {
        return highlightJSFunctions(formattedText1, formattedText2);
    }
    
    // For very similar code, don't try to highlight everything - it's redundant and can cause freezing
    const quickSimilarityCheck = (str1, str2) => {
        // If more than 90% of the characters are the same, we can assume they're nearly identical
        const shorterLength = Math.min(str1.length, str2.length);
        const longerLength = Math.max(str1.length, str2.length);
        
        // If lengths are very different, they're not that similar
        if (shorterLength / longerLength < 0.9) {
            return false;
        }
        
        // Sample the text at various points
        const sampleSize = 10;
        const numSamples = 5;
        
        let matches = 0;
        for (let i = 1; i <= numSamples; i++) {
            const pos = Math.floor((str1.length / (numSamples + 1)) * i);
            if (pos + sampleSize <= str1.length && pos + sampleSize <= str2.length) {
                const sample1 = str1.substring(pos, pos + sampleSize);
                if (str2.includes(sample1)) {
                    matches++;
                }
            }
        }
        
        // If most samples match, the texts are very similar
        return matches >= numSamples - 1;
    };
    
    // If the code blocks are very similar (likely when similarity is 90%+)
    // just highlight the differences instead of trying to match everything
    if (quickSimilarityCheck(text1, text2)) {
        console.log("Code blocks are very similar - using simplified highlighting");
        return [
            `<span class="highlight">${formattedText1}</span>`,
            `<span class="highlight">${formattedText2}</span>`
        ];
    }
    
    // Find the longest common substring
    function findLongestCommonSubstring(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        
        // For very large strings, use a simplified approach
        if (m > 5000 || n > 5000) {
            // Look for the first substantial match (at least 50 chars)
            for (let len = 100; len >= 50; len--) {
                for (let i = 0; i < m - len; i += 50) { // Skip ahead for performance
                    const substr = str1.substring(i, i + len);
                    const pos = str2.indexOf(substr);
                    if (pos !== -1) {
                        return {
                            substring: substr,
                            start1: i,
                            end1: i + len,
                            start2: pos,
                            end2: pos + len
                        };
                    }
                }
            }
            return { substring: '', start1: -1, end1: -1, start2: -1, end2: -1 };
        }
        
        // For smaller strings, use the dynamic programming approach
        let longest = 0;
        let endPos = 0;
        
        // Create a table to store lengths of longest common suffixes
        const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
        
        // Fill the dp table
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                    if (dp[i][j] > longest) {
                        longest = dp[i][j];
                        endPos = i - 1;
                    }
                }
            }
        }
        
        if (longest === 0) {
            return { substring: '', start1: -1, end1: -1, start2: -1, end2: -1 };
        }
        
        const start1 = endPos - longest + 1;
        const end1 = endPos + 1;
        
        // Find the start index in str2
        const substring = str1.substring(start1, end1);
        const start2 = str2.indexOf(substring);
        const end2 = start2 + substring.length;
        
        return { substring, start1, end1, start2, end2 };
    }
    
    // Helper to insert highlight markers
    const insertHighlight = (text, start, end) => {
        if (start < 0 || end <= start) return text;
        return (
            text.substring(0, start) + 
            '<span class="highlight">' + 
            text.substring(start, end) + 
            '</span>' + 
            text.substring(end)
        );
    };
    
    // Initialize result arrays
    let result1 = formattedText1;
    let result2 = formattedText2;
    
    // Keep finding and highlighting common substrings until none are found
    let found = true;
    let minSubstringLength = 10; // Only highlight meaningful matches
    let iterationCount = 0;
    const MAX_ITERATIONS = 30; // Limit iterations to prevent freezing
    
    const startTime = Date.now();
    const MAX_PROCESSING_TIME = 1000; // 1 second max
    
    while (found && iterationCount < MAX_ITERATIONS) {
        // Check if we've been processing for too long
        if (Date.now() - startTime > MAX_PROCESSING_TIME) {
            console.log("Highlighting took too long, stopping early");
            break;
        }
        
        iterationCount++;
        const plainText1 = result1.replace(/<[^>]*>/g, '');
        const plainText2 = result2.replace(/<[^>]*>/g, '');
        
        const res = findLongestCommonSubstring(plainText1, plainText2);
        
        // Stop if no common substring or it's too short
        if (!res.substring || res.substring.length < minSubstringLength) {
            found = false;
            continue;
        }
        
        // Calculate offsets due to existing highlight tags
        let offset1 = 0;
        let offset2 = 0;
        
        // Count tags before the match points
        const countTags = (text, end) => {
            let count = 0;
            let pos = -1;
            let tagStart;
            
            while ((tagStart = text.indexOf('<', pos + 1)) !== -1 && tagStart < end) {
                const tagEnd = text.indexOf('>', tagStart);
                if (tagEnd !== -1) {
                    count += tagEnd - tagStart + 1;
                    pos = tagEnd;
                } else {
                    break;
                }
            }
            
            return count;
        };
        
        try {
            offset1 = countTags(result1, res.start1);
            offset2 = countTags(result2, res.start2);
            
            // Insert highlight tags in both texts
            result1 = insertHighlight(
                result1, 
                res.start1 + offset1, 
                res.end1 + offset1
            );
            
            result2 = insertHighlight(
                result2, 
                res.start2 + offset2, 
                res.end2 + offset2
            );
        } catch (err) {
            console.error("Error during highlighting:", err);
            found = false; // Stop on error
        }
    }
    
    console.log(`Highlighting completed after ${iterationCount} iterations`);
    return [result1, result2];
}

// New function to highlight only matching CSS properties
function highlightCSSProperties(css1, css2) {
    try {
        // Parse the CSS to extract selector and properties
        const parseCSS = (css) => {
            // Extract the selector part and properties
            const match = css.match(/^([^{]*)\s*{([^}]*)}/s); // 's' flag for multiline matching
            if (!match) return { selector: '', properties: [] };
            
            const selector = match[1].trim();
            const propertiesText = match[2].trim();
            
            // Split the properties text into individual properties
            // First normalize line breaks and extra spaces
            const normalizedProps = propertiesText
                .replace(/\n/g, ' ')  // Replace line breaks with spaces
                .replace(/\s+/g, ' ') // Normalize multiple spaces
                .split(';')
                .map(prop => prop.trim())
                .filter(prop => prop && prop.includes(':'))
                .map(prop => {
                    const colonPos = prop.indexOf(':');
                    const name = prop.substring(0, colonPos).trim();
                    const value = prop.substring(colonPos + 1).trim();
                    return { name, value, full: `${name}: ${value}` };
                });
                
            return { selector, properties: normalizedProps };
        };
        
        // Parse both CSS blocks
        const cssBlock1 = parseCSS(css1);
        const cssBlock2 = parseCSS(css2);
        
        // Find matching properties
        const matchingProps = [];
        cssBlock1.properties.forEach(prop1 => {
            const matchingProp = cssBlock2.properties.find(prop2 => 
                prop1.name === prop2.name && prop1.value === prop2.value
            );
            if (matchingProp) {
                matchingProps.push({
                    name: prop1.name,
                    value: prop1.value,
                    full: prop1.full
                });
            }
        });
        
        // If no matching properties found, just return the original CSS
        if (matchingProps.length === 0) {
            return [css1, css2];
        }
        
        // Function to highlight matching properties in a CSS string
        const highlightCSS = (css, cssBlock, matchingProps) => {
            // First split the CSS into parts we can work with
            const selectorMatch = css.match(/^([^{]*)\s*{/s);
            if (!selectorMatch) return css;
            
            const selectorPart = selectorMatch[0];
            const propertiesPart = css.substring(selectorPart.length, css.lastIndexOf('}'));
            const closingBrace = css.substring(css.lastIndexOf('}'));
            
            // Highlight each matching property
            let highlightedProps = propertiesPart;
            
            // Sort properties by length in descending order to avoid partial matches
            matchingProps.sort((a, b) => b.name.length - a.name.length);
            
            matchingProps.forEach(prop => {
                // Escape special regex characters in the property name
                const escapedName = prop.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                
                // Create a regex pattern that matches the property including any whitespace and line breaks
                // This ensures we match properties even if they span multiple lines
                const propRegex = new RegExp(`(\\b${escapedName}\\s*:\\s*[^;]*;?)`, 'gs');
                
                highlightedProps = highlightedProps.replace(propRegex, (match) => {
                    return `<span class="highlight">${match}</span>`;
                });
            });
            
            return selectorPart + highlightedProps + closingBrace;
        };
        
        // Highlight matching properties in both CSS blocks
        const highlightedCSS1 = highlightCSS(css1, cssBlock1, matchingProps);
        const highlightedCSS2 = highlightCSS(css2, cssBlock2, matchingProps);
        
        return [highlightedCSS1, highlightedCSS2];
    } catch (err) {
        console.error("Error highlighting CSS properties:", err);
        return [css1, css2]; // Return unmodified CSS on error
    }
}

// New function to highlight JavaScript function differences by logical blocks
function highlightJSFunctions(formattedFunc1, formattedFunc2) {
    // Split functions into lines for display
    const lines1 = formattedFunc1.split('\n');
    const lines2 = formattedFunc2.split('\n');
    
    // Create arrays for the highlighted lines
    let highlightedLines1 = [];
    let highlightedLines2 = [];
    
    // Quick check for identical functions
    if (formattedFunc1 === formattedFunc2) {
        // If they're identical, highlight everything
        return [
            lines1.map(line => `<span class="highlight">${line}</span>`).join('\n'),
            lines2.map(line => `<span class="highlight">${line}</span>`).join('\n')
        ];
    }
    
    // Create a similarity matrix between lines
    const similarity = Array(lines1.length).fill().map(() => Array(lines2.length).fill(0));
    
    // Calculate similarity scores between each pair of lines
    for (let i = 0; i < lines1.length; i++) {
        const line1 = lines1[i].trim();
        
        for (let j = 0; j < lines2.length; j++) {
            const line2 = lines2[j].trim();
            
            if (line1 === line2) {
                // Exact match
                similarity[i][j] = 100;
            } else if (line1 && line2) {
                // Check for structural similarities first
                const patterns = [
                    // Function declarations
                    { regex: /function\s+\w+\s*\([^)]*\)/, score: 90 },
                    // Variable declarations
                    { regex: /(?:const|let|var)\s+\w+\s*=/, score: 85 },
                    // Document element access (very common pattern)
                    { regex: /document\.getElementById\(/, score: 85 },
                    // LocalStorage operations
                    { regex: /localStorage\.setItem\(/, score: 85 },
                    // Console logging
                    { regex: /console\.log\(/, score: 80 },
                    // If statements
                    { regex: /if\s*\(/, score: 75 },
                    // String templates
                    { regex: /`.*\${.*}`/, score: 85 },
                    // Function calls
                    { regex: /\w+\(.*\)/, score: 70 }
                ];
                
                // Check if both lines match the same pattern
                for (const pattern of patterns) {
                    const matches1 = line1.match(pattern.regex);
                    const matches2 = line2.match(pattern.regex);
                    if (matches1 && matches2) {
                        similarity[i][j] = Math.max(similarity[i][j], pattern.score);
                        break;
                    }
                }
                
                // Check for similar structure ignoring variable names
                if (similarity[i][j] < 70) {
                    // Normalize variable names for comparison
                    const normalized1 = normalizeVariableNames(line1);
                    const normalized2 = normalizeVariableNames(line2);
                    
                    if (normalized1 === normalized2) {
                        // Same structure with different variable names
                        similarity[i][j] = Math.max(similarity[i][j], 85);
                    } else {
                        // Check Levenshtein distance on normalized version
                        const distance = levenshteinDistance(normalized1, normalized2);
                        const maxLength = Math.max(normalized1.length, normalized2.length);
                        const normalizedSimilarity = Math.round((1 - distance / maxLength) * 100);
                        
                        if (normalizedSimilarity > similarity[i][j]) {
                            similarity[i][j] = Math.max(similarity[i][j], normalizedSimilarity);
                        }
                    }
                }
                
                // If still no good match, calculate similarity using Levenshtein distance
                if (similarity[i][j] === 0) {
                    const distance = levenshteinDistance(line1, line2);
                    const maxLength = Math.max(line1.length, line2.length);
                    
                    // Convert to similarity percentage (0-100)
                    similarity[i][j] = Math.round((1 - distance / maxLength) * 100);
                }
            }
        }
    }
    
    // Helper function to normalize variable names for structural comparison
    function normalizeVariableNames(code) {
        // Replace variable names with placeholders
        return code
            // Replace variable assignments
            .replace(/(?:const|let|var)\s+(\w+)/g, '$VARDECL $VARNAME')
            // Replace object property access
            .replace(/(\w+)\.(\w+)/g, '$OBJ.$PROP')
            // Replace variable references in expressions
            .replace(/\b(\w+)\b(?!\s*\()/g, '$VAR')
            // Keep function calls intact but normalize the function name
            .replace(/(\w+)\s*\(/g, '$FUNC(')
            // Preserve string literals
            .replace(/"([^"]*)"/g, '"$STR"')
            .replace(/'([^']*)'/g, "'$STR'")
            // Preserve template literals but normalize content
            .replace(/`([^`]*)`/g, '`$TPL`');
    }
    
    // Define the threshold for considering lines similar
    const SIMILARITY_THRESHOLD = 50; // Lines with 50%+ similarity will be highlighted
    
    // Helper function to calculate Levenshtein distance between two strings
    function levenshteinDistance(a, b) {
        const m = a.length;
        const n = b.length;
        
        // Create a matrix to store distances
        const d = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
        
        // Initialize the matrix
        for (let i = 0; i <= m; i++) d[i][0] = i;
        for (let j = 0; j <= n; j++) d[0][j] = j;
        
        // Fill the matrix
        for (let j = 1; j <= n; j++) {
            for (let i = 1; i <= m; i++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                d[i][j] = Math.min(
                    d[i - 1][j] + 1,      // deletion
                    d[i][j - 1] + 1,      // insertion
                    d[i - 1][j - 1] + cost // substitution
                );
            }
        }
        
        return d[m][n];
    }
    
    // Match lines and create the highlighted output
    for (let i = 0; i < lines1.length; i++) {
        let matched = false;
        let bestMatchIndex = -1;
        let bestMatchScore = 0;
        
        // Find the best matching line in the second function
        for (let j = 0; j < lines2.length; j++) {
            if (similarity[i][j] > bestMatchScore) {
                bestMatchScore = similarity[i][j];
                bestMatchIndex = j;
            }
        }
        
        // If we found a good match, highlight both lines
        if (bestMatchScore >= SIMILARITY_THRESHOLD) {
            highlightedLines1[i] = `<span class="highlight">${lines1[i]}</span>`;
            highlightedLines2[bestMatchIndex] = `<span class="highlight">${lines2[bestMatchIndex]}</span>`;
            matched = true;
        } else {
            // No good match, leave the line un-highlighted
            highlightedLines1[i] = lines1[i];
        }
    }
    
    // Add any remaining un-highlighted lines from the second function
    for (let j = 0; j < lines2.length; j++) {
        if (!highlightedLines2[j]) {
            highlightedLines2[j] = lines2[j];
        }
    }
    
    return [
        highlightedLines1.join('\n'),
        highlightedLines2.join('\n')
    ];
}

function analyzeFiles() {
    // Add an ID to this analysis run to trace recursive calls
    const analysisId = Date.now();
    console.log(`${new Date().toISOString()} - analyzeFiles started [ID: ${analysisId}]`);
    
    // Create a flag to track if this is already running to detect recursive calls
    if (window.isAnalyzing) {
        console.warn(`Analysis already in progress! [Current: ${window.currentAnalysisId}, New: ${analysisId}]`);
        return; // Exit early to prevent recursive calls
    }
    
    // Set the analyzing flag and store the current ID
    window.isAnalyzing = true;
    window.currentAnalysisId = analysisId;
    
    // Store current filesData as previousFilesData for comparison after analysis
    if (filesData && filesData.length > 0) {
        previousFilesData = [...filesData];
        console.log("Stored previous analysis data with", previousFilesData.length, "files for comparison");
    }
    
    // Reset the UI
    resetUI();
    showProgress("Initializing...");
    
    const uploadedFiles = [...document.getElementById('fileInput').files]; // Changed 'file-upload' to 'fileInput'
    if (uploadedFiles.length === 0) {
        console.log(`${new Date().toISOString()} - analyzeFiles aborted - no files [ID: ${analysisId}]`);
        window.isAnalyzing = false;
        showError("Please upload at least one file.");
        return;
    }

    // Prepare the file data
    const files = uploadedFiles.map(file => ({
        name: file.name,
        extension: (file.name.lastIndexOf('.') !== -1) ? file.name.slice(file.name.lastIndexOf('.')) : ''
    }));
    
    // Filter files based on code type toggles
    const filteredFiles = files.filter(file => {
        const ext = file.extension.toLowerCase();
        
        // Skip HTML files if HTML is disabled
        if (!includeHTML && (ext === '.html' || ext === '.htm')) {
            return false;
        }
        
        // Skip CSS files if CSS is disabled
        if (!includeCSS && ext === '.css') {
            return false;
        }
        
        // Skip JS files if JS is disabled
        if (!includeJS && ext === '.js') {
            return false;
        }
        
        // Skip Python files if Python is disabled
        if (!includePython && ext === '.py') {
            return false;
        }
        
        return true;
    });
    
    // Check if we have any files left after filtering
    if (filteredFiles.length === 0) {
        console.log(`${new Date().toISOString()} - analyzeFiles aborted - no files after filtering [ID: ${analysisId}]`);
        window.isAnalyzing = false;
        showError("No files to analyze after applying code type filters. Please enable at least one code type.");
        return;
    }
    
    // Log which code types are being analyzed
    const enabledTypes = [];
    if (includeHTML) enabledTypes.push('HTML');
    if (includeCSS) enabledTypes.push('CSS');
    if (includeJS) enabledTypes.push('JavaScript');
    if (includePython) enabledTypes.push('Python');
    console.log(`Analyzing with code types: ${enabledTypes.join(', ')}`);
    
    // Read file contents, but only for filtered files
    const fileReadPromises = [];
    const filteredContents = [];
    
    uploadedFiles.forEach((file, index) => {
        const fileInfo = files[index];
        // Only read the file if it wasn't filtered out
        if (filteredFiles.some(f => f.name === fileInfo.name)) {
            fileReadPromises.push(new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                    filteredContents.push({ 
                        index, 
                        content: e.target.result 
                    });
                    resolve();
                };
                reader.onerror = reject;
                reader.readAsText(file);
            }));
        }
    });
    
    // Get similarity threshold
    const similarityThreshold = parseInt(document.getElementById('codeSimilarityThreshold').value, 10) || 20;
    
    // Get minimum length values from global variables
    const minLengthValue = minLength;
    const minLengthCSSValue = minLengthCSS;
    const minLengthJSValue = minLengthJS;
    const minLengthHTMLValue = minLengthHTML;
    const minLengthPythonValue = minLengthPython;
    
    Promise.all(fileReadPromises)
        .then(() => {
            // Create or get the worker
            return createWorker().then(w => {
                // Sort the filtered contents by their original index
                filteredContents.sort((a, b) => a.index - b.index);
                
                // Extract just the content strings in the right order
                const contents = filteredContents.map(item => item.content);
                
                // Log the values being sent to the worker
                console.log(`Posting to worker [ID: ${analysisId}]: minLength=${minLengthValue}, CSS=${minLengthCSSValue}, JS=${minLengthJSValue}, HTML=${minLengthHTMLValue}, Python=${minLengthPythonValue}`);
                
                // Post the data to the worker with language-specific minimum lengths
                w.postMessage({
                    files: filteredFiles,
                    contents: contents,
                    codeSimilarityThreshold: similarityThreshold,
                    minLength: minLengthValue,
                    minLengthCSS: minLengthCSSValue,
                    minLengthJS: minLengthJSValue,
                    minLengthHTML: minLengthHTMLValue,
                    minLengthPython: minLengthPythonValue,
                    similarityPriorityMode: similarityPriorityMode,
                    includeHTML: includeHTML,
                    includeCSS: includeCSS,
                    includeJS: includeJS,
                    includePython: includePython,
                    analysisId: analysisId // Pass the ID to the worker
                });
            });
        })
        .catch(error => {
            console.error(`Error in file analysis [ID: ${analysisId}]:`, error);
            window.isAnalyzing = false; // Clear the flag on error
            showError("Error analyzing files: " + error.message);
        });
}

function createWorker() {
    if (worker) {
        return Promise.resolve(worker);
    }
    
    try {
        // First try to use the dynamically created worker URL if available
        if (window.dynamicWorkerUrl) {
            console.log("Using pre-created dynamic worker URL");
            try {
                worker = new Worker(window.dynamicWorkerUrl);
                
                // Set up worker message handlers
                setupWorkerHandlers(worker);
                
                return Promise.resolve(worker);
            } catch (urlError) {
                console.error("Error creating worker from dynamic URL:", urlError);
                // Fall through to the other methods if this fails
            }
        }
        
        // Get the worker script from the hidden script element
        const workerScript = document.getElementById('worker-script');
        
        if (!workerScript) {
            console.error("Worker script element not found!");
            showError("Worker script element not found. This may be an issue with the application.");
            return Promise.reject(new Error("Worker script element not found"));
        }
        
        console.log("Creating web worker from script...");
        
        // Try to get the cleaned content from the data attribute first
        let scriptContent = workerScript.getAttribute('data-script-content');
        
        // Fall back to textContent if the attribute isn't set
        if (!scriptContent) {
            scriptContent = workerScript.textContent.trim();
            console.log("Using direct textContent (not the cleaned version)");
        } else {
            console.log("Using cleaned script content from data attribute");
        }
        
        if (!scriptContent || scriptContent.trim() === '') {
            console.error("Worker script is empty!");
            showError("Worker script is empty. This may be an issue with the application.");
            return Promise.reject(new Error("Worker script is empty"));
        }
        
        // Log the first 100 characters to debug
        console.log("Worker script first 100 chars:", scriptContent.substring(0, 100));
        
        // Create the worker using a blob URL
        try {
            const blob = new Blob([scriptContent], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            worker = new Worker(url);
            
            // Set up worker message handlers
            setupWorkerHandlers(worker);
            
            return Promise.resolve(worker);
        } catch (blobError) {
            console.error('Error creating worker blob:', blobError);
            // Fallback to inline worker if blob creation fails
            try {
                const fallbackWorker = new Worker(URL.createObjectURL(
                    new Blob(['self.onmessage = function(e) { self.postMessage({ type: "error", data: { message: "Worker initialization failed, using fallback. Please reload the page." } }); }'],
                    { type: 'application/javascript' })
                ));
                showError("Error initializing main worker. Using fallback worker with limited functionality.");
                setupWorkerHandlers(fallbackWorker);
                return Promise.resolve(fallbackWorker);
            } catch (fallbackError) {
                console.error('Fallback worker creation failed:', fallbackError);
                showError("Worker initialization completely failed. Please try a different browser.");
                return Promise.reject(fallbackError);
            }
        }
    } catch (error) {
        console.error('Error creating worker:', error);
        showError("Error creating worker: " + error.message);
        return Promise.reject(error);
    }
}

// Helper function to set up worker message handlers
function setupWorkerHandlers(workerInstance) {
    // Set up the worker message handler
    workerInstance.onmessage = function(e) {
        console.log("Worker message received:", e.data.type);
        const { type, data } = e.data;
        
        if (type === 'progress') {
            updateProgress(data);
        } else if (type === 'result') {
            if (!data || !data.filesData) {
                console.error("Worker returned invalid result data:", data);
                window.isAnalyzing = false; // Reset the flag when we get invalid results
                showError("Invalid result data received from worker");
                return;
            }
            
            // Ensure all files have a comparisons array
            if (Array.isArray(data.filesData)) {
                data.filesData.forEach(file => {
                    if (!file.comparisons) {
                        file.comparisons = [];
                    }
                });
            }
            
            console.log("Worker returned result with", 
                data.filesData.length, "files,", 
                data.filesData.reduce((sum, f) => sum + (f.elements ? f.elements.length : 0), 0), "elements,",
                data.filesData.reduce((sum, f) => sum + (f.comparisons ? f.comparisons.length : 0), 0), "comparisons"
            );
            
            // Log the analysis completion with its ID
            if (data.analysisId) {
                console.log(`${new Date().toISOString()} - Analysis completed [ID: ${data.analysisId}]`);
            }
            
            // Reset the analyzing flag 
            window.isAnalyzing = false;
            processResults(data.filesData);
        } else if (type === 'error') {
            console.error("Worker error:", data.message);
            
            // Log the analysis error with its ID if available
            if (data.analysisId) {
                console.log(`${new Date().toISOString()} - Analysis failed with error [ID: ${data.analysisId}]`);
            }
            
            // Reset the analyzing flag
            window.isAnalyzing = false;
            showError(data.message);
        }
    };
    
    // Handle worker errors
    workerInstance.onerror = function(e) {
        console.error("Worker error event:", e);
        
        // Reset the analyzing flag on worker error
        window.isAnalyzing = false;
        showError("Worker error: " + (e.message || "Unknown error"));
        
        // Additional logging for worker error details
        if (e.lineno) {
            console.error(`Worker error at line ${e.lineno}, column ${e.colno}: ${e.message}`);
        }
    };
}

// Function to fix all event handlers on the comparison items
function fixComparisonEventHandlers() {
    console.log("Fixing event handlers for all comparison items...");
    
    // Get all comparison items
    const comparisonItems = document.querySelectorAll('.comparison-item');
    console.log(`Found ${comparisonItems.length} comparison items to fix event handlers for`);
    
    comparisonItems.forEach((item, index) => {
        // Get all the needed elements
        const leftHoverArea = item.querySelector('.hover-area.left');
        const rightHoverArea = item.querySelector('.hover-area.right');
        const fixHoverArea = item.querySelector('.hover-area.fix');
        
        if (!leftHoverArea || !rightHoverArea || !fixHoverArea) {
            console.error(`Missing hover areas for item ${index}`);
            return;
        }
        
        // Get the file and comparison from the item
        const fileCard = item.closest('.file-card');
        if (!fileCard) {
            console.error(`Cannot find parent file card for item ${index}`);
            return;
        }
        
        const fileIndex = parseInt(fileCard.dataset.fileIndex, 10);
        const pageContainer = item.closest('.comparison-container');
        
        if (!pageContainer) {
            console.error(`Cannot find comparison container for item ${index}`);
            return;
        }
        
        const pageNumber = parseInt(pageContainer.dataset.page, 10);
        if (isNaN(fileIndex) || isNaN(pageNumber)) {
            console.error(`Invalid file index or page number: ${fileIndex}, ${pageNumber}`);
            return;
        }
        
        // Calculate the comparison index
        const compIndex = parseInt(item.dataset.index, 10);
        
        // Ensure the filesData exists
        if (!filesData || !filesData[fileIndex]) {
            console.error(`Invalid filesData or index: ${fileIndex}`);
            return;
        }
        
        const file = filesData[fileIndex];
        
        // Set up the Show Details click handler
        leftHoverArea.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            
            console.log(`Show Details clicked for item in ${file.name}, attempting to find comparison...`);
            
            // Get the text content to find the matching comparison
            const textSpan = item.querySelector('.comparison-text');
            if (!textSpan) {
                console.error("Cannot find text span in comparison item");
                return;
            }
            
            const text = textSpan.textContent;
            const compMatch = text.match(/([^≈]+)≈([^(]+)\(([^)]+)\)/);
            
            if (!compMatch) {
                console.error("Cannot parse comparison text:", text);
                return;
            }
            
            const sourceName = compMatch[1].trim();
            const targetName = compMatch[2].trim();
            const targetFile = compMatch[3].trim();
            
            // Find the matching comparison
            const foundComp = file.comparisons.find(comp => 
                comp.source.name === sourceName && 
                comp.target.name === targetName && 
                comp.targetFile === targetFile
            );
            
            if (!foundComp) {
                console.error(`Cannot find matching comparison for: ${sourceName} ≈ ${targetName} (${targetFile})`);
                return;
            }
            
            // Call the showComparisonDetails function with the found comparison
            console.log("Found matching comparison, showing details:", foundComp);
            showComparisonDetails(file.name, foundComp);
        });
        
        // Set up the Select click handler
        rightHoverArea.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            
            console.log("Select clicked, toggling selected class");
            item.classList.toggle('selected');
            updateCopyButtonText();
            
            // Show/hide clear button based on selections
            const hasSelections = fileCard.querySelector('.comparison-item.selected') !== null;
            const clearBtn = fileCard.querySelector('.clear-btn');
            if (clearBtn) {
                clearBtn.style.display = hasSelections ? 'inline-block' : 'none';
            }
        });
        
        // Main item click handler for click outside of hover areas
        item.addEventListener('click', function(e) {
            if (e.target === item || e.target === item.querySelector('.comparison-content')) {
                e.stopPropagation();
                
                // Get the text content to find the matching comparison
                const textSpan = item.querySelector('.comparison-text');
                if (!textSpan) {
                    console.error("Cannot find text span in comparison item");
                    return;
                }
                
                const text = textSpan.textContent;
                const compMatch = text.match(/([^≈]+)≈([^(]+)\(([^)]+)\)/);
                
                if (!compMatch) {
                    console.error("Cannot parse comparison text:", text);
                    return;
                }
                
                const sourceName = compMatch[1].trim();
                const targetName = compMatch[2].trim();
                const targetFile = compMatch[3].trim();
                
                // Find the matching comparison
                const foundComp = file.comparisons.find(comp => 
                    comp.source.name === sourceName && 
                    comp.target.name === targetName && 
                    comp.targetFile === targetFile
                );
                
                if (!foundComp) {
                    console.error(`Cannot find matching comparison for: ${sourceName} ≈ ${targetName} (${targetFile})`);
                    return;
                }
                
                // Call the showComparisonDetails function with the found comparison
                console.log("Main item clicked, showing details:", foundComp);
                showComparisonDetails(file.name, foundComp);
            }
        });
    });
    
    console.log("Event handlers fixed for all comparison items");
}

// Modify displayComparisons to filter by similarity threshold
function displayComparisons(filterType = 'all') {
    const grid = document.getElementById('comparisonGrid');
    grid.innerHTML = '';
    
    console.log(`displayComparisons called with filter: ${filterType}, similarity threshold: ${codeSimilarityThreshold}%`);
    console.log("filesData:", typeof filesData, "length:", filesData ? filesData.length : 'undefined');
    
    // Highlight the active filter button
    const filterButtons = document.querySelectorAll('.sort-buttons .btn');
    filterButtons.forEach(button => {
        // Reset all buttons to normal state
        button.style.opacity = '0.85';
        button.style.transform = 'translateY(0)';
        
        // Check if this button corresponds to the current filter
        let buttonFilter = '';
        if (button.textContent === 'All') buttonFilter = 'all';
        else if (button.textContent === 'HTML') buttonFilter = '.html';
        else if (button.textContent === 'CSS') buttonFilter = '.css';
        else if (button.textContent === 'JS') buttonFilter = '.js';
        else if (button.textContent === 'Python') buttonFilter = '.py';
        else if (button.textContent === 'Cross-File') buttonFilter = 'cross-file';
        else if (button.textContent === 'Same-File') buttonFilter = 'same-file';
        
        // Highlight the selected button
        if (buttonFilter === filterType) {
            button.style.opacity = '1';
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        } else {
            button.style.boxShadow = '';
        }
    });
    
    // Create a set to track which fixed comparisons have been displayed
    const displayedFixedComparisons = new Set();
    
    // Keep track of the total filtered comparisons for stats
    let totalFilteredComparisons = 0;
    
    // Early check - if filesData is empty, show a helpful message
    if (!filesData || !Array.isArray(filesData) || filesData.length === 0) {
        console.warn("No files data available to display");
        const emptyMessage = document.createElement('div');
        emptyMessage.style.padding = '20px';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = '#666';
        emptyMessage.innerHTML = `
            <h3>No Comparisons Available</h3>
            <p>There are no comparisons to display. This could be because:</p>
            <ul style="text-align: left; display: inline-block;">
                <li>No files have been analyzed yet</li>
                <li>The analyzed files don't contain code elements that can be compared</li>
                <li>The similarity threshold (currently ${codeSimilarityThreshold}%) might be too high</li>
                <li>The minimum code length (currently ${minLength}) might be filtering out elements</li>
            </ul>
            <p>Try uploading different files or adjusting the settings.</p>
            <button class="btn" onclick="document.getElementById('codeSimilarityThreshold').value=5; updateCodeSimilarity(5)">
                Try Lower Threshold (5%)
            </button>
            <button class="btn" onclick="document.getElementById('minLength').value=${Math.max(5, minLength-5)}; updateMinLength(${Math.max(5, minLength-5)})">
                Lower Min Length to ${Math.max(5, minLength-5)}
            </button>
        `;
        grid.appendChild(emptyMessage);
        return;
    }
    
    // Find the highest similarity value in the data before filtering
    let highestSimilarity = 0;
    filesData.forEach(file => {
        if (file.comparisons && Array.isArray(file.comparisons)) {
            file.comparisons.forEach(comp => {
                if (comp.similarity > highestSimilarity) {
                    highestSimilarity = comp.similarity;
                }
            });
        }
    });
    
    // Round down to nearest 5% for a cleaner threshold
    const recommendedThreshold = Math.max(5, Math.floor(highestSimilarity / 5) * 5);
    
    const COMPARISONS_PER_PAGE = 20;
    const PRELOAD_PAGES = 2; // Number of pages to preload ahead
    
    filesData
        .filter(file => {
            // Handle normal file extension filters
            if (filterType === 'all' || file.extension === filterType) {
                return true;
            }
            
            // Skip cross-file and same-file filters at the file level
            // These will be handled during comparison filtering
            if (filterType === 'cross-file' || filterType === 'same-file') {
                return true;
            }
            
            return false;
        })
        .forEach((file, fileIndex) => {
            console.log(`Processing file ${fileIndex}: ${file.name}`);
            
            // Ensure file.elements exists before checking length
            if (!file.elements || file.elements.length === 0) {
                console.log(`File ${file.name} has no elements, skipping`);
                return;
            }

            console.log(`File ${file.name} has ${file.elements.length} elements and ${file.comparisons ? file.comparisons.length : 0} comparisons`);
            
            // Create a filtered version of comparisons that additionally respects min length and similarity threshold
            const filteredComparisons = file.comparisons ? file.comparisons.filter(comp => {
                // First check similarity against current threshold
                if (comp.similarity < codeSimilarityThreshold) {
                    return false;
                }
                
                // Check for cross-file filter: comparison must be between different files
                if (filterType === 'cross-file' && comp.targetFile === file.name) {
                    return false;
                }
                
                // Check for same-file filter: comparison must be within the same file
                if (filterType === 'same-file' && comp.targetFile !== file.name) {
                    return false;
                }
                
                // Apply text filters
                const text = (comp.source.name + ' ' + (comp.source.full || comp.source.body) + ' ' + 
                             comp.target.name + ' ' + (comp.target.full || comp.target.body)).toLowerCase();
                
                // Check include filters (all must match)
                const includeMatch = (includeFilters.length === 0 && !tempIncludeFilter) || 
                                    (includeFilters.every(filter => text.includes(filter.toLowerCase())) &&
                                    (!tempIncludeFilter || text.includes(tempIncludeFilter.toLowerCase())));
                
                // Check exclude filters (none must match)
                const excludeMatch = (excludeFilters.length === 0 && !tempExcludeFilter) || 
                                    (!excludeFilters.some(filter => text.includes(filter.toLowerCase())) &&
                                    (!tempExcludeFilter || !text.includes(tempExcludeFilter.toLowerCase())));
                
                // Apply length priority filter if in length mode
                if (similarityPriorityMode === 'length') {
                    // Get length similarity from stats if available
                    const lengthSimilarity = comp.stats && comp.stats.lengthSimilarity ? 
                        parseFloat(comp.stats.lengthSimilarity) : 
                        ((1 - Math.abs(comp.source.body.length - comp.target.body.length) / 
                            Math.max(comp.source.body.length, comp.target.body.length)) * 100);
                    
                    // For length mode, require stricter length similarity
                    if (lengthSimilarity < codeSimilarityThreshold * 0.8) {
                        return false;
                    }
                }
                
                return includeMatch && excludeMatch;
            }) : [];
            
            // Update total count
            totalFilteredComparisons += filteredComparisons.length;
            
            // Check if this file has fixed comparisons to show
            const hasFixedComparisonsForFile = Object.keys(fixedComparisons).some(key => {
                const comp = fixedComparisons[key];
                return comp.sourceFile === file.name;
            });
            
            // Skip this file if there are no matching comparisons and no fixed comparisons
            if (filteredComparisons.length === 0 && !hasFixedComparisonsForFile) {
                console.log(`File ${file.name} has no matching comparisons or fixed comparisons, skipping`);
                return;
            }

            // Calculate total pages
            const totalPages = Math.ceil(filteredComparisons.length / COMPARISONS_PER_PAGE);
            
            // Create the file card
            const card = document.createElement('div');
            card.className = 'file-card';
            card.id = `file-card-${fileIndex}`;
            card.dataset.fileIndex = fileIndex;
            card.dataset.currentPage = '1';
            card.dataset.totalPages = totalPages.toString();

            const label = document.createElement('div');
            label.className = 'file-type-label';
            label.style.backgroundColor = getFileTypeColor(file.extension);
            label.textContent = file.extension.slice(1).toUpperCase();

            const title = document.createElement('h3');
            title.textContent = file.name;

            const copyButton = document.createElement('button');
            copyButton.className = 'btn copy-btn';
            copyButton.textContent = 'Copy All';
            copyButton.onclick = (e) => {
                e.stopPropagation();
                copyFileComparisons(fileIndex);
            };
            
            const clearButton = document.createElement('button');
            clearButton.className = 'btn secondary clear-btn';
            clearButton.textContent = 'Clear Selection';
            clearButton.style.display = 'none'; // Hide initially
            clearButton.onclick = (e) => {
                e.stopPropagation();
                // Clear selections in this file card only
                const selectedItems = card.querySelectorAll('.comparison-item.selected');
                selectedItems.forEach(item => {
                    item.classList.remove('selected');
                });
                updateCopyButtonText();
                clearButton.style.display = 'none';
            };

            card.appendChild(label);
            card.appendChild(title);
            card.appendChild(copyButton);
            card.appendChild(clearButton);

            // Create pagination controls if needed
            if (totalPages > 1) {
                const paginationInfo = document.createElement('div');
                paginationInfo.className = 'pagination-info';
                paginationInfo.innerHTML = `<span>Page <span class="current-page">1</span> of ${totalPages}</span>`;
                card.appendChild(paginationInfo);
                
                const paginationControls = document.createElement('div');
                paginationControls.className = 'pagination-controls';
                
                const prevButton = document.createElement('button');
                prevButton.className = 'btn pagination-btn prev-btn';
                prevButton.textContent = '← Previous';
                prevButton.disabled = true; // Initially disabled on first page
                prevButton.onclick = (e) => {
                    e.stopPropagation();
                    navigateToPage(card, parseInt(card.dataset.currentPage) - 1);
                };
                
                // Add page navigation input
                const pageJumpContainer = document.createElement('div');
                pageJumpContainer.className = 'page-jump-container';
                
                const pageInput = document.createElement('input');
                pageInput.type = 'number';
                pageInput.className = 'page-jump-input';
                pageInput.min = 1;
                pageInput.max = totalPages;
                pageInput.value = 1;
                pageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        const pageNum = parseInt(pageInput.value);
                        if (pageNum >= 1 && pageNum <= totalPages) {
                            navigateToPage(card, pageNum);
                        }
                    }
                });
                
                const goButton = document.createElement('button');
                goButton.className = 'btn page-jump-btn';
                goButton.textContent = 'Go';
                goButton.onclick = (e) => {
                    e.stopPropagation();
                    const pageNum = parseInt(pageInput.value);
                    if (pageNum >= 1 && pageNum <= totalPages) {
                        navigateToPage(card, pageNum);
                    }
                };
                
                pageJumpContainer.appendChild(pageInput);
                pageJumpContainer.appendChild(goButton);
                
                const nextButton = document.createElement('button');
                nextButton.className = 'btn pagination-btn next-btn';
                nextButton.textContent = 'Next →';
                nextButton.disabled = totalPages <= 1; // Disabled if only one page
                nextButton.onclick = (e) => {
                    e.stopPropagation();
                    navigateToPage(card, parseInt(card.dataset.currentPage) + 1);
                };
                
                paginationControls.appendChild(prevButton);
                paginationControls.appendChild(pageJumpContainer);
                paginationControls.appendChild(nextButton);
                card.appendChild(paginationControls);
            }

            // Create the first page container
            const pageContainer = document.createElement('div');
            pageContainer.className = 'comparison-container';
            pageContainer.id = `file-comparisons-${fileIndex}-page-1`;
            pageContainer.dataset.page = '1';
            card.appendChild(pageContainer);

            // Create comparison items for the first page
            const firstPageComparisons = filteredComparisons.slice(0, COMPARISONS_PER_PAGE);
            firstPageComparisons.forEach((comp, compIndex) => {
                const itemDiv = createComparisonItem(file, comp, compIndex);
                pageContainer.appendChild(itemDiv);
            });
            
            // Add pagination summary at the bottom
            const paginationSummary = document.createElement('div');
            paginationSummary.className = 'pagination-summary';
            paginationSummary.innerHTML = `Showing <span class="items-range">1-${Math.min(COMPARISONS_PER_PAGE, filteredComparisons.length)}</span> of ${filteredComparisons.length} comparisons`;
            card.appendChild(paginationSummary);
            
            // Add expand toggle if there are many comparisons - MOVED FROM INSIDE PAGECONTAINER TO AFTER PAGINATION SUMMARY
            if (filteredComparisons.length > 10) {
                const expandToggle = document.createElement('div');
                expandToggle.className = 'expand-toggle';
                expandToggle.innerHTML = `Show all ${filteredComparisons.length} comparisons <span class="chevron-icon chevron-down"></span>`;
                expandToggle.onclick = () => {
                    const container = card.querySelector('.comparison-container');
                    const isExpanded = container.classList.toggle('expanded');
                    expandToggle.innerHTML = isExpanded ? 
                        `Collapse comparisons <span class="chevron-icon chevron-up"></span>` : 
                        `Show all ${filteredComparisons.length} comparisons <span class="chevron-icon chevron-down"></span>`;
                };
                card.appendChild(expandToggle);
            }
            
            // Add the file card to the grid
            grid.appendChild(card);
        });
    
    // If no files were displayed after filtering, show a message
    if (grid.childElementCount === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.style.padding = '20px';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = '#666';
        
        // Only show the lower threshold button if we found a lower threshold that might work
        const thresholdButton = highestSimilarity > 0 && highestSimilarity < codeSimilarityThreshold ? 
            `<button class="btn" onclick="document.getElementById('codeSimilarityThreshold').value=${recommendedThreshold}; updateCodeSimilarity(${recommendedThreshold})">
                Lower Threshold to ${recommendedThreshold}%
            </button>` : '';

        emptyMessage.innerHTML = `
            <h3>No Matching Comparisons</h3>
            <p>No comparisons match your current filters:</p>
            <ul style="text-align: left; display: inline-block;">
                <li>Filter Type: ${filterType}</li>
                <li>Similarity Threshold: ${codeSimilarityThreshold}%</li>
                ${includeFilters.length > 0 ? `<li>Include Filters: ${includeFilters.join(', ')}</li>` : ''}
                ${excludeFilters.length > 0 ? `<li>Exclude Filters: ${excludeFilters.join(', ')}</li>` : ''}
            </ul>
            <p>Try adjusting your filters or threshold settings.</p>
            <button class="btn" onclick="clearSearchFilters()">Clear Search Filters</button>
            ${thresholdButton}
        `;
        grid.appendChild(emptyMessage);
    }
    
    // Fix event handlers after creating all comparison items
    setTimeout(fixComparisonEventHandlers, 300);
    
    // Helper function to navigate to a specific page in a file card
    function navigateToPage(card, pageNumber) {
        const fileIndex = parseInt(card.dataset.fileIndex);
        const totalPages = parseInt(card.dataset.totalPages);
        
        if (pageNumber < 1 || pageNumber > totalPages) {
            return;
        }
        
        // Update current page
        const currentPage = parseInt(card.dataset.currentPage);
        card.dataset.currentPage = pageNumber.toString();
        
        // Update pagination info
        const currentPageElem = card.querySelector('.current-page');
        if (currentPageElem) {
            currentPageElem.textContent = pageNumber.toString();
        }
        
        // Update buttons state
        const prevButton = card.querySelector('.prev-btn');
        const nextButton = card.querySelector('.next-btn');
        
        if (prevButton) {
            prevButton.disabled = pageNumber === 1;
        }
        
        if (nextButton) {
            nextButton.disabled = pageNumber === totalPages;
        }
        
        // Hide current page, show new page
        const oldPageContainer = card.querySelector(`.comparison-container[data-page="${currentPage}"]`);
        const newPageContainer = card.querySelector(`.comparison-container[data-page="${pageNumber}"]`);
        
        if (oldPageContainer) {
            oldPageContainer.style.display = 'none';
        }
        
        if (newPageContainer) {
            newPageContainer.style.display = 'block';
        } else {
            // Need to load this page
            loadPageContent(card, fileIndex, pageNumber);
        }
        
        // Update the items range display
        const itemsRangeElem = card.querySelector('.items-range');
        if (itemsRangeElem) {
            const file = filesData[fileIndex];
            const filteredComparisons = file.comparisons.filter(comp => {
                // Apply similarity threshold
                if (comp.similarity < codeSimilarityThreshold) {
                    return false;
                }
                
                // Same filtering logic as above
                const text = (comp.source.name + ' ' + (comp.source.full || comp.source.body) + ' ' + 
                             comp.target.name + ' ' + (comp.target.full || comp.target.body)).toLowerCase();
                
                const includeMatch = (includeFilters.length === 0 && !tempIncludeFilter) || 
                                    (includeFilters.every(filter => text.includes(filter.toLowerCase())) &&
                                    (!tempIncludeFilter || text.includes(tempIncludeFilter.toLowerCase())));
                
                const excludeMatch = (excludeFilters.length === 0 && !tempExcludeFilter) || 
                                    (!excludeFilters.some(filter => text.includes(filter.toLowerCase())) &&
                                    (!tempExcludeFilter || !text.includes(tempExcludeFilter.toLowerCase())));
                
                return includeMatch && excludeMatch;
            });
            
            const startItem = (pageNumber - 1) * COMPARISONS_PER_PAGE + 1;
            const endItem = Math.min(pageNumber * COMPARISONS_PER_PAGE, filteredComparisons.length);
            itemsRangeElem.textContent = `${startItem}-${endItem}`;
        }
        
        // Update page input value when navigating
        const pageInput = card.querySelector('.page-jump-input');
        if (pageInput) {
            pageInput.value = pageNumber;
        }
        
        // Preload next pages
        for (let i = 1; i <= PRELOAD_PAGES; i++) {
            const pageToLoad = pageNumber + i;
            if (pageToLoad <= totalPages) {
                // Check if this page is already loaded
                const pageContainer = card.querySelector(`.comparison-container[data-page="${pageToLoad}"]`);
                if (!pageContainer) {
                    // Preload this page in the background
                    setTimeout(() => {
                        loadPageContent(card, fileIndex, pageToLoad);
                    }, i * 100); // Stagger loading of pages
                }
            }
        }
        
        // Fix event handlers for the newly shown page
        setTimeout(fixComparisonEventHandlers, 200);
    }
    
    // Helper function to load page content
    function loadPageContent(card, fileIndex, pageNumber) {
        // Check if this page container already exists
        let pageContainer = card.querySelector(`.comparison-container[data-page="${pageNumber}"]`);
        
        if (!pageContainer) {
            // Create a new container for this page
            pageContainer = document.createElement('div');
            pageContainer.className = 'comparison-container';
            pageContainer.id = `file-comparisons-${fileIndex}-page-${pageNumber}`;
            pageContainer.dataset.page = pageNumber.toString();
            pageContainer.style.display = 'none'; // Hide initially
            
            // Find the right position to insert the new container
            // It should be after the last comparison container
            const containers = Array.from(card.querySelectorAll('.comparison-container'));
            if (containers.length > 0) {
                const lastContainer = containers[containers.length - 1];
                lastContainer.insertAdjacentElement('afterend', pageContainer);
            } else {
                // If no containers exist yet, append after pagination controls
                const paginationControls = card.querySelector('.pagination-controls');
                if (paginationControls) {
                    paginationControls.insertAdjacentElement('afterend', pageContainer);
                } else {
                    // Fallback: append to the end of the card
                    card.appendChild(pageContainer);
                }
            }
        }
        
        // Load the content for this page if it's empty
        if (pageContainer.children.length === 0) {
            console.log(`Loading page ${pageNumber} for file ${fileIndex}`);
            
            const file = filesData[fileIndex];
            const filteredComparisons = file.comparisons.filter(comp => {
                // Apply similarity threshold
                if (comp.similarity < codeSimilarityThreshold) {
                    return false;
                }
                
                // Same filtering logic as in the main function
                const text = (comp.source.name + ' ' + (comp.source.full || comp.source.body) + ' ' + 
                             comp.target.name + ' ' + (comp.target.full || comp.target.body)).toLowerCase();
                
                const includeMatch = (includeFilters.length === 0 && !tempIncludeFilter) || 
                                    (includeFilters.every(filter => text.includes(filter.toLowerCase())) &&
                                    (!tempIncludeFilter || text.includes(tempIncludeFilter.toLowerCase())));
                
                const excludeMatch = (excludeFilters.length === 0 && !tempExcludeFilter) || 
                                    (!excludeFilters.some(filter => text.includes(filter.toLowerCase())) &&
                                    (!tempExcludeFilter || !text.includes(tempExcludeFilter.toLowerCase())));
                
                return includeMatch && excludeMatch;
            });
            
            // Calculate the range for this page
            const startIndex = (pageNumber - 1) * COMPARISONS_PER_PAGE;
            const endIndex = Math.min(startIndex + COMPARISONS_PER_PAGE, filteredComparisons.length);
            const pageComparisons = filteredComparisons.slice(startIndex, endIndex);
            
            // Create comparison items
            pageComparisons.forEach((comp, compIndex) => {
                const itemDiv = createComparisonItem(file, comp, startIndex + compIndex);
                pageContainer.appendChild(itemDiv);
            });
            
            console.log(`Loaded ${pageComparisons.length} comparisons for page ${pageNumber}`);
        }
        
        // If this is the current page, show it
        if (parseInt(card.dataset.currentPage) === pageNumber) {
            pageContainer.style.display = 'block';
        }
        
        // Fix event handlers for newly created items
        setTimeout(fixComparisonEventHandlers, 100);
    }
}

// Also add the fixComparisonEventHandlers function to the forceRenderComparisons function
function forceRenderComparisons() {
    console.log("Force re-rendering comparison grid...");
    
    // If we have a lot of comparisons, limit how many we render initially
    const grid = document.getElementById('comparisonGrid');
    if (!grid) return;
    
    // Check if we have elements in the grid already
    if (grid.children.length === 0) {
        console.log("No comparison cards found in grid, attempting to re-render");
        // Re-render with a slight delay to ensure DOM is ready
        displayComparisons('all');
        
        // Check if any file cards have been created but are empty
        const fileCards = document.querySelectorAll('.file-card');
        fileCards.forEach((card, i) => {
            const container = card.querySelector('.comparison-container');
            if (container && container.children.length === 0) {
                const fileIndex = parseInt(card.id.replace('file-card-', ''));
                if (!isNaN(fileIndex) && filesData[fileIndex]) {
                    console.log(`File card ${fileIndex} is empty, force populating comparisons`);
                    const file = filesData[fileIndex];
                    
                    // Ensure the comparison container is created
                    if (!container.id) {
                        container.id = `file-comparisons-${fileIndex}`;
                    }
                    
                    // Take only the first 1000 comparisons to avoid browser hang
                    const comparisonsToShow = file.comparisons.slice(0, 1000);
                    if (comparisonsToShow.length > 0) {
                        comparisonsToShow.forEach((comp, compIndex) => {
                            const itemDiv = createComparisonItem(file, comp, compIndex);
                            container.appendChild(itemDiv);
                        });
                        
                        if (file.comparisons.length > 1000) {
                            const moreDiv = document.createElement('div');
                            moreDiv.className = 'more-comparisons';
                            moreDiv.textContent = `${file.comparisons.length - 1000} more comparisons not shown`;
                            container.appendChild(moreDiv);
                        }
                    } else {
                        // If no comparisons, show a message
                        const noCompsDiv = document.createElement('div');
                        noCompsDiv.className = 'no-comparisons';
                        noCompsDiv.textContent = 'No comparisons to display for this file';
                        container.appendChild(noCompsDiv);
                    }
                }
            }
        });
    } else {
        console.log(`Grid already has ${grid.children.length} file cards`);
    }
    
    // Force browser reflow
    grid.style.display = 'none';
    setTimeout(() => {
        grid.style.display = 'grid';
        console.log("Forced grid reflow complete");
    }, 10);
}

// Helper function to create a comparison item
function createComparisonItem(file, comp, compIndex) {
    const key = getComparisonKey(file.name, comp.source.name, comp.targetFile, comp.target.name);
    // Check if this comparison was previously marked as fixed
    const wasFixed = key in fixedComparisons;
    if (wasFixed) {
        comp.fixed = true;
    }
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'comparison-item';
    if (comp.fixed) {
        itemDiv.classList.add('fixed');
    }
    itemDiv.dataset.key = key; // Store the key for later lookup
    
    // Add left and right hover areas
    const leftHoverArea = document.createElement('div');
    leftHoverArea.className = 'hover-area left';
    leftHoverArea.setAttribute('data-action', 'Show Details');
    
    const rightHoverArea = document.createElement('div');
    rightHoverArea.className = 'hover-area right';
    rightHoverArea.setAttribute('data-action', 'Select');
    
    // Add fix hover area
    const fixHoverArea = document.createElement('div');
    fixHoverArea.className = 'hover-area fix';
    fixHoverArea.setAttribute('data-action', comp.fixed ? 'Fixed' : 'Fix');
    
    const square = document.createElement('div');
    square.className = 'similarity-square';
    square.style.backgroundColor = getPercentageColor(comp.similarity);
    
    const percentage = document.createElement('span');
    percentage.className = 'similarity-percentage';
    percentage.style.backgroundColor = getPercentageColor(comp.similarity);
    percentage.textContent = `${comp.similarity.toFixed(1)}%`;
    
    const text = document.createElement('span');
    text.className = 'comparison-text';
    
    // Include breakdown of similarity components
    let statsDisplay = "";
    if (comp.stats) {
        if (comp.stats.tokenSimilarity && comp.stats.lengthSimilarity) {
            statsDisplay = ` (Token: ${comp.stats.tokenSimilarity}%, Length: ${comp.stats.lengthSimilarity}%)`;
        } else if (comp.stats.commonTokens !== undefined) {
            statsDisplay = ` (Tokens: ${comp.stats.commonTokens}/${comp.stats.totalTokens || "?"})`;
        }
    }
    
    // Add comparison text
    text.textContent = `${comp.source.name} ≈ ${comp.target.name} (${comp.targetFile})${statsDisplay}`;
    
    // Create a container for better layout
    const contentContainer = document.createElement('div');
    contentContainer.className = 'comparison-content';
    contentContainer.style.display = 'flex';
    contentContainer.style.alignItems = 'center';
    contentContainer.style.width = '100%';
    contentContainer.style.marginRight = '10px';
    
    // Set up click handlers
    fixHoverArea.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        comp.fixed = !comp.fixed;
        fixHoverArea.setAttribute('data-action', comp.fixed ? 'Fixed' : 'Fix');
        itemDiv.classList.toggle('fixed', comp.fixed);
        markComparisonFixed(file.name, comp.source.name, comp.targetFile, comp.target.name, comp.fixed);
    };
    
    // Main item click handler
    itemDiv.onclick = (e) => {
        if (!e.target.closest('.hover-area')) {
            showComparisonDetails(file.name, comp);
        }
    };
    
    // Assemble the item
    contentContainer.appendChild(square);
    contentContainer.appendChild(percentage);
    contentContainer.appendChild(text);
    
    itemDiv.appendChild(leftHoverArea);
    itemDiv.appendChild(contentContainer);
    itemDiv.appendChild(rightHoverArea);
    itemDiv.appendChild(fixHoverArea);
    
    return itemDiv;
}

let currentComparison = null;

// Helper function to highlight a fixed comparison item by its key
function highlightFixedComparisonItem(key) {
    // Remove any existing highlights
    document.querySelectorAll('.fixed-comparison-item.highlighted').forEach(item => {
        item.classList.remove('highlighted');
    });
    
    // Find the matching item in the fixed comparisons manager
    const fixedItems = document.querySelectorAll('.fixed-comparison-item');
    fixedItems.forEach(item => {
        if (item.dataset.key === key) {
            item.classList.add('highlighted');
            
            // Scroll to make the highlighted item visible
            setTimeout(() => {
                item.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }, 100);
        }
    });
}

function showComparisonDetails(fileIndexOrName, compIndexOrObj) {
    console.log("showComparisonDetails called with:", fileIndexOrName, compIndexOrObj);
    
    try {
        const modal = document.getElementById('modal');
        const modalOverlay = document.getElementById('modalOverlay');
        const content = document.getElementById('modalContent');
        
        if (!modal || !content) {
            console.error("Modal elements not found in DOM");
            return;
        }
        
        let comp, fileIndex, fileName;
        
        // Determine if we're using indices or objects
        if (typeof fileIndexOrName === 'number' || !isNaN(parseInt(fileIndexOrName, 10))) {
            // We're using indices
            fileIndex = parseInt(fileIndexOrName, 10);
            if (!filesData || !filesData[fileIndex]) {
                console.error("File index out of bounds or filesData undefined:", fileIndex);
                return;
            }
            fileName = filesData[fileIndex].name;
            comp = filesData[fileIndex].comparisons[compIndexOrObj];
        } else {
            // We're using fileName and comp object directly
            fileName = fileIndexOrName;
            comp = compIndexOrObj;
            
            // Find the file index for later use
            fileIndex = filesData.findIndex(file => file.name === fileName);
            if (fileIndex === -1) {
                console.error('Cannot find file with name:', fileName);
                return;
            }
        }
        
        if (!comp) {
            console.error('Invalid comparison in showComparisonDetails');
            return;
        }
        
        console.log("Showing modal for comparison:", comp);
        
        currentComparison = comp;
        
        // Reset copy button text back to "Copy Comparison"
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            copyBtn.textContent = 'Copy Comparison';
        }
        
        // Make sure no other popups are visible above this one
        const fixedManager = document.getElementById('fixed-comparisons-manager');
        const selectorsManager = document.getElementById('selectors-manager');
        if (fixedManager) fixedManager.style.display = 'none';
        if (selectorsManager) selectorsManager.style.display = 'none';
        
        // Remove any existing highlights
        document.querySelectorAll('.comparison-item.highlighted').forEach(item => {
            item.classList.remove('highlighted');
        });
        
        // Get the comparison key to find the corresponding items to highlight
        const key = getComparisonKey(fileName, comp.source.name, comp.targetFile, comp.target.name);
        
        // Find and highlight the clicked item in the file card
        const comparisonItems = document.querySelectorAll('.comparison-item');
        comparisonItems.forEach(item => {
            // Get the text span with the specific class
            const textSpan = item.querySelector('.comparison-text');
            if (textSpan && textSpan.textContent.includes(`${comp.source.name} ≈ ${comp.target.name}`)) {
                item.classList.add('highlighted');
                
                // Scroll parent container to make the highlighted item visible
                setTimeout(() => {
                    const container = item.closest('.comparison-container');
                    if (container) {
                        const itemTop = item.offsetTop;
                        const containerTop = container.scrollTop;
                        const containerHeight = container.clientHeight;
                        
                        // If item is not fully visible
                        if (itemTop < containerTop || itemTop > containerTop + containerHeight) {
                            container.scrollTop = itemTop - 20;
                        }
                    }
                }, 100);
            }
        });
        
        // If the fixed comparisons manager is open, highlight the corresponding item
        if (fixedManager && fixedManager.style.display === 'flex') {
            highlightFixedComparisonItem(key);
        }
        
        // Clear existing content and show a loading indicator
        content.innerHTML = '<div class="loading-indicator">Loading comparison details...</div>';
        
        // Display the modal immediately with loading indicator
        if (modal) {
            modal.style.display = 'block';
            modal.style.zIndex = 1005;
        }
        
        if (modalOverlay) {
            modalOverlay.style.display = 'block';
        }
        
        // Use setTimeout to process the comparison details after the modal is visible
        // This ensures the UI remains responsive while processing
        setTimeout(() => {
            try {
                // Get source and target text
                const sourceText = comp.source.full || comp.source.body || '';
                const targetText = comp.target.full || comp.target.body || '';
                
                // Ensure text is properly decoded
                const decodedSourceText = decodeHTMLEntities(sourceText);
                const decodedTargetText = decodeHTMLEntities(targetText);
                
                // Process only this specific comparison - since we're using lazy loading
                // we don't need to worry about large numbers of comparisons
                console.log("Processing single comparison for display");
                const [highlightedSource, highlightedTarget] = highlightSimilarities(decodedSourceText, decodedTargetText);
                
                // Extract tokens for display
                const sourceTokens = extractTokens(decodedSourceText);
                const targetTokens = extractTokens(decodedTargetText);
                
                // Find common tokens
                const commonTokens = findCommonTokens(sourceTokens, targetTokens);
                
                // Find all function calls and declarations in the codebase
                const sourceCallLocations = findFunctionUsageLocations(comp.source.name);
                const targetCallLocations = findFunctionUsageLocations(comp.target.name);
                
                // Filter out duplicate declarations that aren't the actual declaration we're examining
                const filteredSourceLocations = sourceCallLocations.filter(location => {
                    // Keep all function calls
                    if (location.type === 'call') return true;
                    
                    // For declarations, only keep the one matching our actual line number
                    if (location.type === 'declaration') {
                        // Allow declarations that match our actual function's line number
                        return location.line === (comp.source.lineNumber || 0);
                    }
                    
                    return true;
                });
                
                const filteredTargetLocations = targetCallLocations.filter(location => {
                    // Keep all function calls
                    if (location.type === 'call') return true;
                    
                    // For declarations, only keep the one matching our actual line number
                    if (location.type === 'declaration') {
                        // Allow declarations that match our actual function's line number
                        return location.line === (comp.target.lineNumber || 0);
                    }
                    
                    return true;
                });

                let htmlContent = `
                <div class="comparison-details">
                    <div class="comparison-section">
                        <div class="section-header">=== COMPARISON DETAILS ===</div>
                        <div class="section-content">
                            <div>Comparison: ${comp.source.name} vs ${comp.target.name}</div>
                            <div>Similarity: <span class="similarity-value" style="background-color: ${getPercentageColor(comp.similarity)}">${comp.similarity.toFixed(1)}%</span></div>
                            <div>Status: <span class="status-value ${comp.fixed ? 'fixed' : 'not-fixed'}">${comp.fixed ? "✓ Fixed" : "⨯ Not Fixed"}</span></div>
                            
                            <div class="fix-action">
                                <button class="btn ${comp.fixed ? 'secondary' : ''}" onclick="markComparisonFixed('${fileName}', '${comp.source.name}', '${comp.targetFile}', '${comp.target.name}', ${!comp.fixed}); closeModal();">
                                    ${comp.fixed ? 'Unmark as Fixed' : 'Mark as Fixed'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="comparison-section">
                        <div class="section-header">=== SOURCE ELEMENT ===</div>
                        <div class="section-content">
                            <div>File: ${comp.sourceFile.includes('/') ? comp.sourceFile : comp.source.fileName || comp.sourceFile}</div>
                            <div>Element: ${comp.source.name} (${comp.source.type || 'element'})</div>
                            <div>Language: ${comp.source.language || 'unknown'}</div>
                            ${(comp.source.lineNumber && comp.source.lineNumber > 0) ? 
                               `<div>Line Number: ${comp.source.lineNumber}</div>` : ''}
                            ${(comp.source.sourcePosition && comp.source.sourcePosition.startIndex >= 0) ? 
                               `<div>Character Position: ${comp.source.sourcePosition.startIndex}-${comp.source.sourcePosition.endIndex}</div>` : ''}
                        </div>
                    </div>`;

                // Add source function usage locations
                if (filteredSourceLocations && filteredSourceLocations.length > 0) {
                    htmlContent += `
                    <div class="comparison-section">
                        <div class="section-header">=== SOURCE USAGE LOCATIONS ===</div>
                        <div class="section-content">`;
                    
                    filteredSourceLocations.forEach(location => {
                        const isDeclaration = location.type === 'declaration';
                        
                        // Create a safe version of the context for display
                        const displayContext = location.context ? 
                            location.context
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#039;') : '';
                        
                        htmlContent += `
                            <div class="usage-location ${isDeclaration ? 'declaration' : 'call'}">
                                <span class="file-name">${location.file}</span>
                                <span class="location-type">${isDeclaration ? 'Declaration' : 'Call'}</span>
                                <span class="line-number">Line ${location.line}</span>
                                ${location.context ? `<pre class="context-code">${displayContext}</pre>` : ''}
                            </div>`;
                    });
                    
                    htmlContent += `</div></div>`;
                }

                htmlContent += `
                    <div class="comparison-section">
                        <div class="section-header">=== TARGET ELEMENT ===</div>
                        <div class="section-content">
                            <div>File: ${comp.targetFile.includes('/') ? comp.targetFile : comp.target.fileName || comp.targetFile}</div>
                            <div>Element: ${comp.target.name} (${comp.target.type || 'element'})</div>
                            <div>Language: ${comp.target.language || 'unknown'}</div>
                            ${(comp.target.lineNumber && comp.target.lineNumber > 0) ? 
                               `<div>Line Number: ${comp.target.lineNumber}</div>` : ''}
                            ${(comp.target.sourcePosition && comp.target.sourcePosition.startIndex >= 0) ? 
                               `<div>Character Position: ${comp.target.sourcePosition.startIndex}-${comp.target.sourcePosition.endIndex}</div>` : ''}
                        </div>
                    </div>`;

                // Add target function usage locations
                if (filteredTargetLocations && filteredTargetLocations.length > 0) {
                    htmlContent += `
                    <div class="comparison-section">
                        <div class="section-header">=== TARGET USAGE LOCATIONS ===</div>
                        <div class="section-content">`;
                    
                    filteredTargetLocations.forEach(location => {
                        const isDeclaration = location.type === 'declaration';
                        
                        // Escape HTML in context to prevent rendering buttons and other HTML elements
                        const displayContext = location.context ? 
                            location.context
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#039;') : '';
                        
                        htmlContent += `
                            <div class="usage-location ${isDeclaration ? 'declaration' : 'call'}">
                                <span class="file-name">${location.file}</span>
                                <span class="location-type">${isDeclaration ? 'Declaration' : 'Call'}</span>
                                <span class="line-number">Line ${location.line}</span>
                                ${location.context ? `<pre class="context-code">${displayContext}</pre>` : ''}
                            </div>`;
                    });
                    
                    htmlContent += `</div></div>`;
                }
                
                // For the code display, we should use the actual line numbers
                htmlContent += `
                    <div class="comparison-section">
                        <div class="section-header">=== SIMILARITY STATISTICS ===</div>
                        <div class="section-content stats-grid">
                            <div>Similarity: <span class="similarity-value" style="background-color: ${getPercentageColor(comp.similarity)}">${comp.similarity.toFixed(1)}%</span></div>
                            ${comp.stats && comp.stats.commonTokens !== undefined ? `<div>Common Tokens: ${comp.stats.commonTokens}</div>` : ''}
                            ${comp.stats && comp.stats.tokenSimilarity ? `<div>Token Similarity: ${comp.stats.tokenSimilarity}%</div>` : ''}
                            ${comp.stats && comp.stats.lengthSimilarity ? `<div>Length Similarity: ${comp.stats.lengthSimilarity}%</div>` : ''}
                            ${comp.stats && comp.stats.tokens1 !== undefined ? `<div>Source Tokens: ${comp.stats.tokens1}</div>` : ''}
                            ${comp.stats && comp.stats.tokens2 !== undefined ? `<div>Target Tokens: ${comp.stats.tokens2}</div>` : ''}
                        </div>
                    </div>

                    <div class="two-column-layout">
                        <div class="left-column">
                            <div class="comparison-section">
                                <div class="section-header">=== SOURCE CODE ===</div>
                                <pre class="code-content source-code">${addLineNumbers(
                                    highlightedSource, 
                                    parseInt(comp.source.lineNumber) || 1
                                )}</pre>
                            </div>
                        </div>
                        
                        <div class="right-column">
                            <div class="comparison-section">
                                <div class="section-header">=== TARGET CODE ===</div>
                                <pre class="code-content target-code">${addLineNumbers(
                                    highlightedTarget, 
                                    parseInt(comp.target.lineNumber) || 1
                                )}</pre>
                            </div>
                        </div>
                    </div>`;

                // Add refactoring opportunity if needed
                if (comp.refactoringOpportunity && comp.refactoringType === 'constructor-reset-duplication') {
                    htmlContent += `
                    <div class="comparison-section">
                        <div class="section-header">=== REFACTORING OPPORTUNITY ===</div>
                        <div class="section-content">
                            <div class="refactoring-note">
                                <strong>Issue:</strong> Constructor and reset methods contain similar initialization code.<br>
                                <strong>Recommendation:</strong> Extract shared initialization logic to a private helper method.
                            </div>
                        </div>
                    </div>`;
                }

                htmlContent += `
                    <div class="comparison-section">
                        <div class="section-header">=== TOKENS ===</div>
                        <div class="tokens-container">
                            <div class="tokens-column">
                                <div class="token-header">Source Tokens (${sourceTokens.length})</div>
                                <div class="token-list source-tokens">
                                    ${sourceTokens.map(token => 
                                        `<div class="token ${commonTokens.includes(token) ? 'common' : ''}">${token}</div>`
                                    ).join('')}
                                </div>
                            </div>
                            <div class="tokens-column">
                                <div class="token-header">Target Tokens (${targetTokens.length})</div>
                                <div class="token-list target-tokens">
                                    ${targetTokens.map(token => 
                                        `<div class="token ${commonTokens.includes(token) ? 'common' : ''}">${token}</div>`
                                    ).join('')}
                                </div>
                            </div>
                        </div>
                    </div>`;

                htmlContent += `</div>`;
                
                // Add the HTML content to the modal
                content.innerHTML = htmlContent;
                
                // Store the current comparison data for copy functionality
                currentComparisonData = {
                    comparison: comp,
                    sourceFile: fileName,
                    targetFile: comp.targetFile,
                    sourceText: decodedSourceText,
                    targetText: decodedTargetText,
                    sourceCallLocations: filteredSourceLocations,
                    targetCallLocations: filteredTargetLocations,
                    stats: comp.stats
                };
                
                // Add CSS for the comparison display
                const styleEl = document.createElement('style');
                styleEl.textContent = `
                    .loading-indicator {
                        text-align: center;
                        padding: 20px;
                        font-family: monospace;
                        font-size: 14px;
                        color: #555;
                    }
                    
                    .comparison-details {
                        font-family: monospace;
                        color: #333;
                        line-height: 1.4;
                    }
                    
                    .comparison-section {
                        margin-bottom: 12px;
                    }
                    
                    .section-header {
                        font-weight: bold;
                        margin-bottom: 4px;
                        color: #0066cc;
                    }
                    
                    .section-content {
                        padding-left: 4px;
                    }
                    
                    .usage-location {
                        margin-bottom: 8px;
                        padding: 5px;
                        background-color: #f8f8f8;
                        border-left: 3px solid #ddd;
                    }
                    
                    .usage-location.declaration {
                        border-left-color: #4CAF50;
                        background-color: #f1f8e9;
                    }
                    
                    .usage-location.call {
                        border-left-color: #2196F3;
                        background-color: #e3f2fd;
                    }
                    
                    .file-name {
                        font-weight: bold;
                        margin-right: 8px;
                    }
                    
                    .location-type {
                        color: #666;
                        margin-right: 8px;
                    }
                    
                    .line-number {
                        color: #888;
                    }
                    
                    .context-code {
                        margin: 4px 0 0 0;
                        padding: 4px;
                        background-color: #fff;
                        border: 1px solid #eee;
                        font-size: 12px;
                        overflow-x: auto;
                        white-space: pre;
                    }
                    
                    .two-column-layout {
                        display: flex;
                        gap: 12px;
                        margin-bottom: 12px;
                    }
                    
                    .left-column {
                        flex: 1;
                        min-width: 0;
                    }
                    
                    .right-column {
                        flex: 1;
                        min-width: 0;
                    }
                    
                    .tokens-container {
                        display: flex;
                        gap: 8px;
                        height: 200px;
                    }
                    
                    .tokens-column {
                        flex: 1;
                        min-width: 0;
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .token-header {
                        font-weight: bold;
                        padding: 4px;
                        background-color: #f0f0f0;
                        border: 1px solid #ddd;
                        border-bottom: none;
                    }
                    
                    .token-list {
                        flex: 1;
                        overflow-y: auto;
                        border: 1px solid #ddd;
                        padding: 4px;
                        background-color: #f8f8f8;
                    }
                    
                    .token {
                        display: inline-block;
                        margin: 2px 4px;
                        padding: 1px 4px;
                        background-color: #f0f0f0;
                        border: 1px solid #ddd;
                        border-radius: 3px;
                        font-size: 12px;
                    }
                    
                    .token.common {
                        background-color: #e6ffe6;
                        border-color: #99cc99;
                        color: #006600;
                        font-weight: bold;
                    }
                    
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                        gap: 4px;
                    }
                    
                    .similarity-value {
                        padding: 1px 5px;
                        border-radius: 3px;
                        color: white;
                        display: inline-block;
                    }
                    
                    .status-value {
                        font-weight: bold;
                    }
                    
                    .status-value.fixed {
                        color: #4caf50;
                    }
                    
                    .status-value.not-fixed {
                        color: #f44336;
                    }
                    
                    .fix-action {
                        margin-top: 8px;
                    }
                    
                    .code-content {
                        margin: 0;
                        padding: 6px;
                        background-color: #f5f5f5;
                        border: 1px solid #ddd;
                        white-space: pre;
                        overflow-x: auto;
                        font-family: monospace;
                        font-size: 13px;
                        line-height: 1.4;
                    }
                    
                    .highlight {
                        background-color: #ffff99;
                        padding: 0 2px;
                    }
                    
                    .refactoring-note {
                        background-color: #fff8e1;
                        padding: 8px;
                        border-left: 3px solid #ffc107;
                    }
                    
                    /* Responsive adjustments */
                    @media (max-width: 768px) {
                        .two-column-layout {
                            flex-direction: column;
                        }
                    }
                `;
                
                content.appendChild(styleEl);
                
                console.log("Modal details loaded and displayed successfully");
            } catch (error) {
                // If there's an error during the detailed processing, show an error message
                console.error("Error processing comparison details:", error);
                content.innerHTML = `
                    <div class="error-message">
                        <h3>Error Loading Comparison</h3>
                        <p>There was a problem displaying this comparison: ${error.message}</p>
                        <button class="btn" onclick="closeModal()">Close</button>
                    </div>
                `;
                
                // Add error styling
                const errorStyle = document.createElement('style');
                errorStyle.textContent = `
                    .error-message {
                        padding: 20px;
                        background-color: #ffebee;
                        border-left: 4px solid #f44336;
                        font-family: sans-serif;
                    }
                    .error-message h3 {
                        color: #d32f2f;
                        margin-top: 0;
                    }
                `;
                content.appendChild(errorStyle);
            }
        }, 50); // Small delay to allow the modal to render first
        
        console.log("Modal display initiated with loading indicator");
    } catch (error) {
        console.error("Error in showComparisonDetails:", error);
        showToast("Error showing comparison details: " + error.message, "error");
    }
}

// Variable to store current comparison data for copy functionality
let currentComparisonData = null;

// Function to find all locations where a function is declared or called
function findFunctionUsageLocations(functionName) {
    if (!functionName || !filesData) return [];
    
    const locations = [];
    const functionNamePattern = new RegExp(`\\b${escapeRegExp(functionName)}\\b`, 'g');
    // Improved declaration pattern to avoid false positives
    const declarationPattern = new RegExp(`(^|\\s)function\\s+${escapeRegExp(functionName)}\\s*\\(|const\\s+${escapeRegExp(functionName)}\\s*=\\s*(?:function|\\([^)]*\\)\\s*=>)|let\\s+${escapeRegExp(functionName)}\\s*=\\s*(?:function|\\([^)]*\\)\\s*=>)|var\\s+${escapeRegExp(functionName)}\\s*=\\s*(?:function|\\([^)]*\\)\\s*=>)`, 'g');
    
    // Pattern to specifically detect setTimeout and similar function usage
    const timerPattern = new RegExp(`(setTimeout|setInterval|requestAnimationFrame)\\s*\\(\\s*${escapeRegExp(functionName)}\\b`, 'g');
    
    // First collect actual declarations from elements with proper line numbers
    const elementDeclarations = new Map(); // Map to track declarations by line number
    
    filesData.forEach(file => {
        // Find all elements that match the function name (declarations)
        const elements = file.elements || [];
        const matchingDeclarations = elements.filter(elem => 
            elem.name === functionName && 
            (elem.type === 'function' || elem.type === 'method')
        );
        
        matchingDeclarations.forEach(elem => {
            // Use the stored line number as the key to prevent duplicates
            const key = `${file.name}:${elem.lineNumber || 0}`;
            
            // Only add if we don't already have this exact declaration
            if (!elementDeclarations.has(key)) {
                elementDeclarations.set(key, {
                    file: file.name,
                    line: elem.lineNumber || 0,
                    type: 'declaration',
                    context: elem.body ? elem.body.split('\n')[0] || '' : '' // First line for context
                });
            }
        });
    });
    
    // Add all located declarations to our locations array
    elementDeclarations.forEach(declaration => {
        if (declaration.line > 0) { // Only add valid line numbers
            locations.push(declaration);
        }
    });
    
    // Now search for all function calls in the FULL file content
    filesData.forEach(file => {
        // Get the complete file content if available
        const fullContent = file.fullContent || '';
        
        if (fullContent && fullContent.includes(functionName)) {
            // First, check for specific timer patterns like setTimeout(functionName, ...)
            const timerMatches = [...fullContent.matchAll(timerPattern)];
            if (timerMatches.length > 0) {
                // For each timer match, find the line number
                timerMatches.forEach(timerMatch => {
                    const upToMatch = fullContent.substring(0, timerMatch.index);
                    const lineNumber = upToMatch.split('\n').length; // 1-indexed line number
                    
                    locations.push({
                        file: file.name,
                        line: lineNumber,
                        type: 'call',
                        context: timerMatch[0].trim() + '...)' // Show the pattern in the context
                    });
                });
            }
            
            // Continue with the existing line-by-line analysis
            // Split the content into lines for line-by-line analysis
            const contentLines = fullContent.split('\n');
            
            // Process each line in the file
            contentLines.forEach((line, lineIndex) => {
                // Skip empty lines or lines without the function name
                if (!line.includes(functionName)) return;
                
                // Skip line if it's a function declaration
                if (declarationPattern.test(line)) return;
                
                // Find all occurrences of the function name in this line
                const lineMatches = [...line.matchAll(functionNamePattern)];
                if (lineMatches.length === 0) return;
                
                // Process each match in this line
                lineMatches.forEach(match => {
                    let isUsed = false;
                    // Check if it's actually a function call (followed by parentheses)
                    const afterMatch = line.substring(match.index + functionName.length).trim();
                    if (afterMatch.startsWith('(') || afterMatch.startsWith(' (')) {
                        isUsed = true;
                    } else {
                        // Check if it's used as an argument to another function 
                        // or as part of a method chain or other valid usage
                        
                        // Look at the character before the function name
                        const beforeIndex = match.index - 1;
                        if (beforeIndex >= 0) {
                            const beforeChar = line[beforeIndex];
                            // If the function is preceded by comma, parenthesis or equals, it's likely used as an argument
                            if ([',', '(', '='].includes(beforeChar) || 
                                // Check if it's inside another function call
                                /[(,]\s*$/.test(line.substring(0, match.index))) {
                                isUsed = true;
                            }
                        } else {
                            // Function at the start of a line - check context
                            const trimmedLine = line.trim();
                            if (trimmedLine.startsWith(functionName) && 
                                (trimmedLine.length > functionName.length && /[,;\)]/.test(trimmedLine[functionName.length]))) {
                                isUsed = true;
                            }
                        }
                    }
                    
                    if (isUsed) {
                        // Add the call location with the actual line number (1-indexed)
                        locations.push({
                            file: file.name,
                            line: lineIndex + 1, // +1 because line numbers are 1-indexed
                            type: 'call',
                            context: line.trim()
                        });
                    }
                });
            });
        } else {
            // Fallback to element-based search if full content isn't available
            const elements = file.elements || [];
            
            elements.forEach(elem => {
                // Skip the function itself to avoid duplicates
                if (elem.name === functionName) return;
                
                const body = elem.body || '';
                // Skip if body doesn't contain the function name
                if (!body.includes(functionName)) return;
                
                // Find all occurrences of the function name
                const bodyLines = body.split('\n');
                
                // Scan each line for the function name
                bodyLines.forEach((line, lineIndex) => {
                    // Skip empty lines
                    if (!line.includes(functionName)) return;
                    
                    // Check if this line contains a declaration (skip these)
                    if (declarationPattern.test(line)) return;
                    
                    // Find all pattern matches in this line
                    const lineMatches = [...line.matchAll(functionNamePattern)];
                    if (lineMatches.length === 0) return;
                    
                    // For each match in the line
                    lineMatches.forEach(match => {
                        let isUsed = false;
                        // Extract and check the portion after the function name to see if it's a call
                        const afterMatch = line.substring(match.index + functionName.length).trim();
                        if (afterMatch.startsWith('(') || afterMatch.startsWith(' (')) {
                            isUsed = true;
                        } else {
                            // Check if it's used as an argument to another function
                            // or as part of a method chain or other valid usage
                            
                            // Look at the character before the function name
                            const beforeIndex = match.index - 1;
                            if (beforeIndex >= 0) {
                                const beforeChar = line[beforeIndex];
                                // If the function is preceded by comma, parenthesis or equals, it's likely used as an argument
                                if ([',', '(', '='].includes(beforeChar) || 
                                    // Check if it's inside another function call
                                    /[(,]\s*$/.test(line.substring(0, match.index))) {
                                    isUsed = true;
                                }
                            } else {
                                // Function at the start of a line - check context
                                const trimmedLine = line.trim();
                                if (trimmedLine.startsWith(functionName) && 
                                    (trimmedLine.length > functionName.length && /[,;\)]/.test(trimmedLine[functionName.length]))) {
                                    isUsed = true;
                                }
                            }
                        }
                        
                        if (isUsed) {
                            // Calculate the actual line number in the file
                            const actualLineNumber = (elem.lineNumber || 0) + lineIndex;
                            
                            // Only add calls with valid line numbers
                            if (actualLineNumber > 0) {
                                locations.push({
                                    file: file.name,
                                    line: actualLineNumber,
                                    type: 'call', 
                                    context: line.trim()
                                });
                            }
                        }
                    });
                });
            });
        }
    });
    
    // Remove any duplicate line locations
    const uniqueLocations = [];
    const seenLocations = new Set();
    
    locations.forEach(location => {
        const key = `${location.file}:${location.line}:${location.type}`;
        if (!seenLocations.has(key)) {
            seenLocations.add(key);
            uniqueLocations.push(location);
        }
    });
    
    // Sort locations by file, then by line number
    return uniqueLocations.sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        return a.line - b.line;
    });
}

// Helper function to escape special characters in regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to safely escape HTML for display
function escapeHTML(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Updated copy function to include all comparison information
function copyComparison() {
    if (!currentComparisonData) {
        showToast("No comparison data available to copy", "error");
        return;
    }
    
    try {
        const { comparison, sourceFile, targetFile, sourceText, targetText, sourceCallLocations, targetCallLocations, stats } = currentComparisonData;
        
        let copyText = `=== COMPARISON DETAILS ===\n\n`;
        copyText += `Comparison: ${comparison.source.name} vs ${comparison.target.name}\n`;
        copyText += `Similarity: ${comparison.similarity.toFixed(1)}%\n`;
        copyText += `Status: ${comparison.fixed ? "✓ Fixed" : "⨯ Not Fixed"}\n\n`;
        
        copyText += `=== SOURCE ELEMENT ===\n`;
        copyText += `File: ${sourceFile}\n`;
        copyText += `Element: ${comparison.source.name} (${comparison.source.type || 'element'})\n`;
        copyText += `Language: ${comparison.source.language || 'unknown'}\n`;
        if (comparison.source.lineNumber) copyText += `Line Number: ${comparison.source.lineNumber}\n`;
        if (comparison.source.sourcePosition) copyText += `Character Position: ${comparison.source.sourcePosition.startIndex}-${comparison.source.sourcePosition.endIndex}\n\n`;
        
        if (sourceCallLocations && sourceCallLocations.length > 0) {
            copyText += `=== SOURCE USAGE LOCATIONS ===\n`;
            sourceCallLocations.forEach(location => {
                copyText += `${location.file} (Line ${location.line}): ${location.type === 'declaration' ? 'Declaration' : 'Call'}\n`;
                if (location.context) {
                    // For plain text output, we want to show the raw HTML code, not escaped HTML entities
                    const rawContext = location.context.trim();
                    copyText += `    ${rawContext}\n`;
                }
            });
            copyText += `\n`;
        }
        
        copyText += `=== TARGET ELEMENT ===\n`;
        copyText += `File: ${targetFile}\n`;
        copyText += `Element: ${comparison.target.name} (${comparison.target.type || 'element'})\n`;
        copyText += `Language: ${comparison.target.language || 'unknown'}\n`;
        if (comparison.target.lineNumber) copyText += `Line Number: ${comparison.target.lineNumber}\n`;
        if (comparison.target.sourcePosition) copyText += `Character Position: ${comparison.target.sourcePosition.startIndex}-${comparison.target.sourcePosition.endIndex}\n\n`;
        
        if (targetCallLocations && targetCallLocations.length > 0) {
            copyText += `=== TARGET USAGE LOCATIONS ===\n`;
            targetCallLocations.forEach(location => {
                copyText += `${location.file} (Line ${location.line}): ${location.type === 'declaration' ? 'Declaration' : 'Call'}\n`;
                if (location.context) {
                    // For plain text output, we want to show the raw HTML code, not escaped HTML entities
                    const rawContext = location.context.trim();
                    copyText += `    ${rawContext}\n`;
                }
            });
            copyText += `\n`;
        }
        
        copyText += `=== SIMILARITY STATISTICS ===\n`;
        copyText += `Similarity: ${comparison.similarity.toFixed(1)}%\n`;
        if (stats) {
            if (stats.commonTokens !== undefined) copyText += `Common Tokens: ${stats.commonTokens}\n`;
            if (stats.tokenSimilarity) copyText += `Token Similarity: ${stats.tokenSimilarity}%\n`;
            if (stats.lengthSimilarity) copyText += `Length Similarity: ${stats.lengthSimilarity}%\n`;
        }
        
        copyText += `=== SOURCE CODE ===\n${addLineNumbers(sourceText, parseInt(comparison.source.lineNumber) || 1)}\n\n`;
        copyText += `=== TARGET CODE ===\n${addLineNumbers(targetText, parseInt(comparison.target.lineNumber) || 1)}\n`;
        
        navigator.clipboard.writeText(copyText)
            .then(() => {
                const copyBtn = document.getElementById('copyBtn');
                if (copyBtn) {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy Comparison';
                    }, 2000);
                }
                showToast("Comparison copied to clipboard", "success", 2000);
            })
            .catch(err => {
                console.error("Failed to copy comparison:", err);
                showToast("Failed to copy: " + err.message, "error");
            });
    } catch (error) {
        console.error("Error copying comparison:", error);
        showToast("Error copying comparison: " + error.message, "error");
    }
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay) {
        modalOverlay.style.display = 'none';
    }
    currentComparison = null;
    console.log("Modal closed");
}

function updateAllComparisons() {
    const textarea = document.getElementById('all-comparisons-text');
    if (!textarea) return;
    
    console.log("updateAllComparisons called, filesData length:", filesData.length);
    
    if (!filesData || !Array.isArray(filesData) || filesData.length === 0) {
        textarea.value = "No comparison data available.";
        return;
    }
    
    let text = '';
    
    let comparisonCount = 0;
    filesData.forEach((file, fileIndex) => {
        if (!file.comparisons || file.comparisons.length === 0) return;
        
        file.comparisons.forEach(comp => {
            comparisonCount++;
            if (comparisonCount > 10000) {
                // Limit the number of comparisons to prevent browser freezing
                if (comparisonCount === 10001) {
                    text += "Too many comparisons to display. Showing first 10000 only.\n\n";
                }
                return;
            }
            
            text += `Source: ${file.name} - ${comp.source.name}\n`;
            text += `Target: ${comp.targetFile} - ${comp.target.name}\n`;
            text += `Similarity: ${comp.similarity.toFixed(1)}%\n`;
            text += `---------------\n`;
            text += `${comp.source.full || comp.source.body}\n`;
            text += `---------------\n`;
            text += `${comp.target.full || comp.target.body}\n`;
            text += `===============\n\n`;
        });
    });
    
    textarea.value = text || "No comparisons found.";
    console.log(`Displayed ${comparisonCount} comparisons in text area.`);
    
    // Force re-render of comparison grid
    setTimeout(forceRenderComparisons, 100);
}

function copyAllComparisons() {
    const textarea = document.getElementById('all-comparisons-text');
    textarea.select();
    document.execCommand('copy');
    alert('All comparisons copied to clipboard!');
}

function copyComparison() {
    if (!currentComparison) return;
    const comp = currentComparison;
    const sourceFile = comp.sourceFile || filesData.find(f => f.elements.includes(comp.source))?.name || 'Unknown';
    
    // Ensure comp.stats exists
    const stats = comp.stats || {
        commonTokens: 0,
        totalTokens1: 0,
        totalTokens2: 0,
        commonChars: 0,
        totalChars: 0
    };
    
    // Find usage locations
    const sourceCallLocations = findFunctionUsageLocations(comp.source.name);
    const targetCallLocations = findFunctionUsageLocations(comp.target.name);
    
    // Filter the locations to keep only relevant ones
    const filteredSourceLocations = sourceCallLocations.filter(location => {
        if (location.type === 'call') return true;
        if (location.type === 'declaration') {
            return location.line === (comp.source.lineNumber || 0);
        }
        return true;
    });
    
    const filteredTargetLocations = targetCallLocations.filter(location => {
        if (location.type === 'call') return true;
        if (location.type === 'declaration') {
            return location.line === (comp.target.lineNumber || 0);
        }
        return true;
    });
    
    // Create formatted header with complete location information
    let text = "=== COMPARISON DETAILS ===\n\n";
    
    // Basic comparison info
    text += `Comparison: ${comp.source.name} vs ${comp.target.name}\n`;
    text += `Similarity: ${comp.similarity.toFixed(1)}%\n`;
    text += `Status: ${comp.fixed ? "✓ Fixed" : "⨯ Not Fixed"}\n\n`;
    
    // Source element information with all available location data
    text += "=== SOURCE ELEMENT ===\n";
    text += `File: ${sourceFile}\n`;
    text += `Element: ${comp.source.name} (${comp.source.type || 'element'})\n`;
    text += `Language: ${comp.source.language || 'unknown'}\n`;
    
    // Add line number and position if available
    if (comp.source.lineNumber) {
        text += `Line Number: ${comp.source.lineNumber}\n`;
    }
    if (comp.source.sourcePosition) {
        text += `Character Position: ${comp.source.sourcePosition.startIndex}-${comp.source.sourcePosition.endIndex}\n`;
    }
    
    // Add source function usage locations
    if (filteredSourceLocations && filteredSourceLocations.length > 0) {
        text += "\n=== SOURCE USAGE LOCATIONS ===\n";
        filteredSourceLocations.forEach(location => {
            text += `${location.file} (Line ${location.line}): ${location.type === 'declaration' ? 'Declaration' : 'Call'}\n`;
            if (location.context) {
                text += `    ${location.context.trim()}\n`;
            }
        });
    }
    
    // Target element information with all available location data
    text += "\n=== TARGET ELEMENT ===\n";
    text += `File: ${comp.targetFile}\n`;
    text += `Element: ${comp.target.name} (${comp.target.type || 'element'})\n`;
    text += `Language: ${comp.target.language || 'unknown'}\n`;
    
    // Add line number and position if available
    if (comp.target.lineNumber) {
        text += `Line Number: ${comp.target.lineNumber}\n`;
    }
    if (comp.target.sourcePosition) {
        text += `Character Position: ${comp.target.sourcePosition.startIndex}-${comp.target.sourcePosition.endIndex}\n`;
    }
    
    // Add target function usage locations
    if (filteredTargetLocations && filteredTargetLocations.length > 0) {
        text += "\n=== TARGET USAGE LOCATIONS ===\n";
        filteredTargetLocations.forEach(location => {
            text += `${location.file} (Line ${location.line}): ${location.type === 'declaration' ? 'Declaration' : 'Call'}\n`;
            if (location.context) {
                text += `    ${location.context.trim()}\n`;
            }
        });
    }
    
    // Add similarity statistics in a new section
    text += "\n=== SIMILARITY STATISTICS ===\n";
    text += `Similarity: ${comp.similarity.toFixed(1)}%\n`;
    
    if (stats) {
        // Standard token stats
        if (stats.commonTokens !== undefined) text += `Common Tokens: ${stats.commonTokens}\n`;
        if (stats.totalTokens1 !== undefined) text += `Source Tokens: ${stats.totalTokens1 || stats.tokens1 || 0}\n`;
        if (stats.totalTokens2 !== undefined) text += `Target Tokens: ${stats.totalTokens2 || stats.tokens2 || 0}\n`;
        
        // Other similarity metrics
        if (stats.tokenSimilarity && stats.tokenSimilarity !== "N/A") text += `Token Similarity: ${stats.tokenSimilarity}%\n`;
        if (stats.lengthSimilarity) text += `Length Similarity: ${stats.lengthSimilarity}%\n`;
        
        // CSS-specific stats if available
        if (stats.cssSpecificMeasure) {
            text += "\n=== CSS-SPECIFIC METRICS ===\n";
            if (stats.selectorSimilarity && stats.selectorSimilarity !== "N/A") {
                text += `Selector Similarity: ${stats.selectorSimilarity}%\n`;
            }
            if (stats.propSimilarity && stats.propSimilarity !== "N/A") {
                text += `Property Similarity: ${stats.propSimilarity}%\n`;
            }
            if (stats.valueSimilarity && stats.valueSimilarity !== "N/A") {
                text += `Value Similarity: ${stats.valueSimilarity}%\n`;
            }
        }
    }
    
    // Add refactoring opportunity if applicable
    if (comp.refactoringOpportunity && comp.refactoringType === 'constructor-reset-duplication') {
        text += "\n=== REFACTORING OPPORTUNITY ===\n";
        text += "Issue: Constructor and reset methods contain similar initialization code.\n";
        text += "Recommendation: Extract shared initialization logic to a private helper method.\n";
    }
    
    // Add source function calls with line numbers
    if (comp.source.calls && comp.source.calls.length > 0) {
        const isCSS = comp.source.language === 'css' || (comp.source.type && comp.source.type.includes('selector'));
        text += "\n=== SOURCE " + (isCSS ? "SELECTOR USAGE" : "FUNCTION CALLS") + " ===\n";
        
        comp.source.calls.forEach(fileCall => {
            text += `In ${fileCall.file}:\n`;
            fileCall.locations.forEach(loc => {
                // Decode any HTML entities in the context
                const decodedContext = decodeHTMLEntities(loc.context).trim();
                if (loc.isDeclaration) {
                    text += `  Declaration at Line ${loc.line}: ${decodedContext}\n`;
                } else {
                    text += `  Line ${loc.line}: ${decodedContext}\n`;
                }
            });
            text += "\n";
        });
    }

    // Add source code with proper formatting
    text += "=== SOURCE CODE ===\n";
    // Decode and ensure the code has proper line breaks
    let sourceCode = decodeHTMLEntities(comp.source.full || comp.source.body || "");
    // Ensure code has line numbers
    sourceCode = addLineNumbers(sourceCode, parseInt(comp.source.lineNumber) || 1);
    text += sourceCode + "\n\n";

    // Add target function calls with line numbers
    if (comp.target.calls && comp.target.calls.length > 0) {
        const isCSS = comp.target.language === 'css' || (comp.target.type && comp.target.type.includes('selector'));
        text += "=== TARGET " + (isCSS ? "SELECTOR USAGE" : "FUNCTION CALLS") + " ===\n";
        
        comp.target.calls.forEach(fileCall => {
            text += `In ${fileCall.file}:\n`;
            fileCall.locations.forEach(loc => {
                // Decode any HTML entities in the context
                const decodedContext = decodeHTMLEntities(loc.context).trim();
                if (loc.isDeclaration) {
                    text += `  Declaration at Line ${loc.line}: ${decodedContext}\n`;
                } else {
                    text += `  Line ${loc.line}: ${decodedContext}\n`;
                }
            });
            text += "\n";
        });
    }

    // Add target code with proper formatting
    text += "=== TARGET CODE ===\n";
    // Decode and ensure the code has proper line breaks
    let targetCode = decodeHTMLEntities(comp.target.full || comp.target.body || "");
    // Ensure code has line numbers
    targetCode = addLineNumbers(targetCode, parseInt(comp.target.lineNumber) || 1);
    text += targetCode;

    navigator.clipboard.writeText(text).then(() => {
        showToast('Comparison copied to clipboard with line numbers!', 'success');
        // Update button text to indicate success
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }
    }).catch(() => {
        showToast('Failed to copy comparison', 'error');
    });
}

// Helper function to add line numbers to code

function exportToJson() {
    const exportData = filesData.map(file => ({
        ...file,
        comparisons: file.comparisons.map(comp => ({
            ...comp,
            sourceFile: file.name
        }))
    }));
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'comparisons.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            filesData = JSON.parse(e.target.result);
            
            // Generate a project ID for this imported data
            const projectId = generateProjectId(filesData.map(f => f.name));
            loadFixedComparisonsForProject(projectId);
            
            displayComparisons('all');
            updateAllComparisons();
            document.getElementById('progress-text').textContent = 'Imported comparisons successfully';
        } catch (error) {
            document.getElementById('progress-text').textContent = 'Error importing JSON: ' + error.message;
        }
    };
    reader.readAsText(file);
}

/**
 * Generic function to add a filter of a specific type
 * @param {string} filterType - The type of filter ('include' or 'exclude')
 */
function addFilter(filterType) {
    const inputId = `${filterType}-search`;
    const input = document.getElementById(inputId);
    const filterText = input.value.trim();
    const filters = filterType === 'include' ? includeFilters : excludeFilters;
    const tempFilterVar = filterType === 'include' ? 'tempIncludeFilter' : 'tempExcludeFilter';
    
    if (filterText && !filters.includes(filterText)) {
        filters.push(filterText);
        renderFilters();
        window[tempFilterVar] = ""; // Clear temporary filter since we added it
        displayComparisons('all'); // Refresh display with new filters
    }
    
    input.value = '';
    input.focus();
}

/**
 * Add an include filter from the include-search input
 */
function addIncludeFilter() {
    addFilter('include');
}

/**
 * Add an exclude filter from the exclude-search input
 */
function addExcludeFilter() {
    addFilter('exclude');
}

function removeFilter(index, filterType) {
    const filters = filterType === 'include' ? includeFilters : excludeFilters;
    filters.splice(index, 1);
    renderFilters();
    displayComparisons('all'); // Refresh display with updated filters
}

// Replace the old functions with calls to the new one
function removeIncludeFilter(index) {
    removeFilter(index, 'include');
}

function removeExcludeFilter(index) {
    removeFilter(index, 'exclude');
}

function renderFilters() {
    const includeContainer = document.getElementById('include-filters');
    const excludeContainer = document.getElementById('exclude-filters');
    
    includeContainer.innerHTML = '';
    excludeContainer.innerHTML = '';
    
    includeFilters.forEach((filter, index) => {
        const tag = document.createElement('div');
        tag.className = 'filter-tag include-filter';
        tag.innerHTML = `${filter} <span class="filter-remove" onclick="removeIncludeFilter(${index})">×</span>`;
        includeContainer.appendChild(tag);
    });
    
    excludeFilters.forEach((filter, index) => {
        const tag = document.createElement('div');
        tag.className = 'filter-tag exclude-filter';
        tag.innerHTML = `${filter} <span class="filter-remove" onclick="removeExcludeFilter(${index})">×</span>`;
        excludeContainer.appendChild(tag);
    });
}

/**
 * Updates file statistics from the current filesData and populates the UI
 * @param {boolean} skipUIUpdate - If true, only update the statistics object without updating the UI
 */
function updateStats(skipUIUpdate) {
    if (filesData && Array.isArray(filesData)) {
        // Build file stats from the current filesData
        fileStats = {
            totalFiles: filesData.length,
            filesWithElements: filesData.filter(f => f.elements && f.elements.length > 0).length,
            totalElements: filesData.reduce((sum, f) => sum + (f.elements ? f.elements.length : 0), 0),
            totalComparisons: filesData.reduce((sum, f) => sum + (f.comparisons ? f.comparisons.length : 0), 0),
            fileDetails: filesData.map(f => ({
                name: f.name,
                extension: f.extension,
                elements: f.elements ? f.elements.length : 0,
                comparisons: f.comparisons ? f.comparisons.length : 0,
                status: f.elements && f.elements.length > 0 ? 'ok' : 'empty'
            }))
        };
    }

    // If we should skip UI update, return here
    if (skipUIUpdate) return;
    
    // Update the UI with calculated stats
    document.getElementById('stats-total-files').textContent = fileStats.totalFiles;
    document.getElementById('stats-files-with-elements').textContent = fileStats.filesWithElements;
    document.getElementById('stats-total-elements').textContent = fileStats.totalElements;
    document.getElementById('stats-total-comparisons').textContent = fileStats.totalComparisons;
    
    const fileStatsList = document.getElementById('file-stats-list');
    fileStatsList.innerHTML = '';
    
    if (fileStats.fileDetails && fileStats.fileDetails.length > 0) {
        // Create the header row
        fileStatsList.innerHTML = `
            <div class="file-stats-item" style="font-weight: bold">
                <span class="file-stats-name">File Name</span>
                <span class="file-stats-elements">Elements</span>
                <span class="file-stats-comps">Comparisons</span>
            </div>
        `;
        
        // Show all files
        fileStats.fileDetails.forEach(file => {
            const item = createFileStatItem(file);
            fileStatsList.appendChild(item);
        });
    }
    
    function createFileStatItem(file) {
        const item = document.createElement('div');
        item.className = 'file-stats-item';
        
        let statusClass = 'file-status-ok';
        if (file.status === 'empty') statusClass = 'file-status-empty';
        else if (file.status === 'warning') statusClass = 'file-status-warning';
        else if (file.status === 'error') statusClass = 'file-status-error';
        
        // Get fixed comparisons for this file (both as source and target)
        const fixedSourceCount = Object.values(fixedComparisons)
            .filter(comp => typeof comp === 'object' && comp.sourceFile === file.name)
            .length;
        
        const fixedTargetCount = Object.values(fixedComparisons)
            .filter(comp => typeof comp === 'object' && comp.targetFile === file.name)
            .length;
        
        const fixedCountText = fixedSourceCount || fixedTargetCount 
            ? `<span style="color:#4caf50; font-weight:500">(${fixedSourceCount} src, ${fixedTargetCount} tgt fixed)</span>` 
            : '';
        
        item.innerHTML = `
            <span class="file-stats-name ${statusClass}" title="${file.name}">${file.name}</span>
            <span class="file-stats-elements">${file.elements}</span>
            <span class="file-stats-comps">${file.comparisons} ${fixedCountText}</span>
        `;
        
        return item;
    }
}

/**
 * Updates stats from processing results and updates the UI
 * @deprecated Use updateStats() instead
 */
function updateStatsFromResults() {
    updateStats(); // Call the new unified function
}

/**
 * Updates stats from worker file statistics data
 * @param {Array} workerFileStats - File statistics from worker
 */
function updateFileStats(workerFileStats) {
    if (!workerFileStats) return;
    
    fileStats.fileDetails = workerFileStats;
    fileStats.filesWithElements = workerFileStats.filter(file => file.elements > 0).length;
    fileStats.totalElements = workerFileStats.reduce((sum, file) => sum + file.elements, 0);
    fileStats.totalComparisons = workerFileStats.reduce((sum, file) => sum + file.comparisons, 0);
    
    // Update the UI with the updated stats
    updateStats(false);
}

/**
 * Updates the stats display UI
 * @deprecated Use updateStats() instead
 */
function updateStatsDisplay() {
    updateStats(); // Call the new unified function
}

/**
 * Unified stats panel toggle function
 * @param {string} mode - 'partial', 'expand', or 'collapse' to control toggle behavior
 */
function toggleStats(mode) {
    const content = document.getElementById('stats-content');
    const toggle = document.querySelector('.stats-toggle');
    const expandToggle = document.querySelector('.stats-expand-toggle');
    
    // Remove all state classes first
    content.classList.remove('collapsed', 'partially-expanded', 'expanded');
    
    if (mode === 'partial') {
        // Set to partially expanded state
        content.classList.add('partially-expanded');
        content.style.maxHeight = '300px';
        toggle.innerHTML = 'Collapse <span class="chevron-icon chevron-up"></span>';
        expandToggle.innerHTML = 'Expand <span class="chevron-icon chevron-down"></span>';
        expandToggle.style.display = 'flex'; // Show the expand toggle
    } else if (mode === 'expand') {
        // Set to fully expanded state
        content.classList.add('expanded');
        content.style.maxHeight = '750px';
        toggle.innerHTML = 'Collapse <span class="chevron-icon chevron-up"></span>';
        expandToggle.innerHTML = 'Reduce <span class="chevron-icon chevron-up"></span>';
        expandToggle.style.display = 'flex'; // Show the expand toggle
    } else if (mode === 'collapse') {
        // Set to collapsed state
        content.classList.add('collapsed');
        content.style.maxHeight = '0px';
        toggle.innerHTML = 'Show Details <span class="chevron-icon chevron-down"></span>';
        expandToggle.style.display = 'none'; // Hide the expand toggle
    }
}

/**
 * Toggle stats panel between collapsed and partially expanded
 */
function toggleStatsPartial() {
    const content = document.getElementById('stats-content');
    
    // Check the current state by examining the classes
    if (content.classList.contains('expanded')) {
        // If fully expanded, toggle to partially expanded
        toggleStats('partial');
    } else if (content.classList.contains('partially-expanded')) {
        // If partially expanded, collapse it
        toggleStats('collapse');
    } else {
        // If collapsed (or in any other state), partially expand it
        toggleStats('partial');
    }
}

/**
 * Toggle stats panel between partially expanded and fully expanded
 * Also toggles the visibility of detailed file stats when expanded
 */
function toggleStatsFullExpand() {
    const statsContent = document.getElementById('stats-content');
    const fileStatsList = document.getElementById('file-stats-list');
    const expandToggle = document.querySelector('.stats-expand-toggle');
    
    if (statsContent.classList.contains('partially-expanded')) {
        // Change from partially expanded to fully expanded
        statsContent.classList.remove('partially-expanded');
        statsContent.classList.add('expanded');
        statsContent.style.maxHeight = '750px';
        expandToggle.innerHTML = 'Reduce <span class="chevron-icon chevron-up"></span>';
        
        // Also expand the file stats list
        if (fileStatsList) {
            fileStatsList.classList.add('expanded');
            fileStatsList.style.maxHeight = 'none';
        }
    } else if (statsContent.classList.contains('expanded')) {
        // Change from fully expanded to partially expanded
        statsContent.classList.remove('expanded');
        statsContent.classList.add('partially-expanded');
        statsContent.style.maxHeight = '300px';
        expandToggle.innerHTML = 'Expand <span class="chevron-icon chevron-down"></span>';
        
        // Also collapse the file stats list
        if (fileStatsList) {
            fileStatsList.classList.remove('expanded');
            fileStatsList.style.maxHeight = '';
        }
    } else if (statsContent.classList.contains('collapsed')) {
        // If it's collapsed, first toggle to partially expanded
        toggleStatsPartial(); // Show the panel first
        
        // Then expand it fully
        setTimeout(() => {
            statsContent.classList.remove('partially-expanded');
            statsContent.classList.add('expanded');
            statsContent.style.maxHeight = '750px';
            expandToggle.innerHTML = 'Reduce <span class="chevron-icon chevron-up"></span>';
            
            // Also expand the file stats list
            if (fileStatsList) {
                fileStatsList.classList.add('expanded');
                fileStatsList.style.maxHeight = 'none';
            }
        }, 50); // Small delay to ensure the first transition completes
    }
}

// Function to generate a unique key for a comparison
function getComparisonKey(sourceFile, sourceName, targetFile, targetName) {
    return `${sourceFile}|${sourceName}|${targetFile}|${targetName}`;
}

// Function to save fixed comparisons to localStorage
function saveFixedComparisons() {
    if (currentProjectId) {
        // Update lastUsed timestamp
        if (fixedComparisons.metadata) {
            fixedComparisons.metadata.lastUsed = new Date().toISOString();
        }
        
        allFixedComparisons[currentProjectId] = fixedComparisons;
        localStorage.setItem('allFixedComparisons', JSON.stringify(allFixedComparisons));
    }
}

// Function to mark a comparison as fixed
function markComparisonFixed(sourceFile, sourceName, targetFile, targetName, isFixed) {
    const key = getComparisonKey(sourceFile, sourceName, targetFile, targetName);
    
    if (isFixed) {
        // Find the original comparison data to store its content
        let sourceContent = '';
        let targetContent = '';
        let similarity = 0;
        
        // Try to find the comparison in the current data
        for (const file of filesData) {
            if (file.name === sourceFile) {
                for (const comp of file.comparisons) {
                    if (comp.source.name === sourceName && 
                        comp.targetFile === targetFile && 
                        comp.target.name === targetName) {
                        
                        sourceContent = comp.source.full;
                        targetContent = comp.target.full;
                        similarity = comp.similarity;
                        break;
                    }
                }
            }
        }
        
        fixedComparisons[key] = {
            sourceFile,
            sourceName,
            targetFile,
            targetName,
            sourceContent,
            targetContent,
            similarity,
            fixedAt: new Date().toISOString()
        };
    } else {
        delete fixedComparisons[key];
    }
    saveFixedComparisons();
}

// Function to check if a comparison is already marked as fixed
function isComparisonFixed(sourceFile, sourceName, targetFile, targetName) {
    const key = getComparisonKey(sourceFile, sourceName, targetFile, targetName);
    return key in fixedComparisons;
}

// Function to save project history
function saveProjectHistory() {
    if (currentProjectId) {
        try {
            // Save current state in history
            if (!projectHistory[currentProjectId]) {
                projectHistory[currentProjectId] = {
                    versions: []
                };
            }
            
            // Store a simplified version of filesData for history
            const historyEntry = {
                timestamp: new Date().toISOString(),
                fileCount: filesData.length,
                totalComparisons: filesData.reduce((sum, file) => sum + file.comparisons.length, 0),
                fileNames: filesData.map(f => f.name),
                fixedComparisons: Object.keys(fixedComparisons).length,
                comparisonKeys: []
            };
            
            // Store keys for all comparisons to track changes
            // Limit the number of comparison keys to prevent storage quota issues
            const maxComparisons = 1000; // Limit to prevent quota issues
            let compCount = 0;
            
            filesData.forEach(file => {
                // Sort by similarity to keep the most significant comparisons
                const sortedComps = [...file.comparisons].sort((a, b) => b.similarity - a.similarity);
                for (const comp of sortedComps) {
                    if (compCount >= maxComparisons) break;
                    
                    const key = getComparisonKey(file.name, comp.source.name, comp.targetFile, comp.target.name);
                    historyEntry.comparisonKeys.push({
                        key,
                        similarity: comp.similarity,
                        fixed: !!comp.fixed
                    });
                    compCount++;
                }
            });
            
            // Keep only the last 5 versions instead of 10 to save space
            projectHistory[currentProjectId].versions = 
                [historyEntry, ...(projectHistory[currentProjectId].versions || [])].slice(0, 5);
            
            // Limit the number of projects in history to save space
            const maxProjects = 10;
            const projectIds = Object.keys(projectHistory);
            if (projectIds.length > maxProjects) {
                // Sort projects by last used timestamp (if available)
                const sortedProjects = projectIds
                    .filter(id => id !== currentProjectId) // Keep current project
                    .map(id => ({
                        id,
                        lastUsed: projectHistory[id].versions?.[0]?.timestamp || '1970-01-01'
                    }))
                    .sort((a, b) => new Date(a.lastUsed) - new Date(b.lastUsed));
                    
                // Remove oldest projects
                const projectsToRemove = sortedProjects.slice(0, projectIds.length - maxProjects);
                projectsToRemove.forEach(project => {
                    delete projectHistory[project.id];
                });
            }
            
            localStorage.setItem('projectHistory', JSON.stringify(projectHistory));
        } catch (error) {
            console.warn('Failed to save project history: Storage quota exceeded');
            showToast('Storage space is limited. Some project history will be reduced to save space.', 'warning');
            
            // Clear older history to make space
            try {
                // Try to retain only current project history
                const currentProject = projectHistory[currentProjectId];
                projectHistory = { [currentProjectId]: currentProject };
                
                // Limit the versions to just the current one
                if (currentProject && currentProject.versions) {
                    projectHistory[currentProjectId].versions = [currentProject.versions[0]];
                }
                
                localStorage.setItem('projectHistory', JSON.stringify(projectHistory));
            } catch (innerError) {
                // If still failing, clear history completely
                console.warn('Still cannot save project history, clearing completely');
                showToast('Storage space exhausted. Project history has been cleared to continue functioning.', 'error');
                projectHistory = {};
                localStorage.setItem('projectHistory', JSON.stringify(projectHistory));
            }
        }
    }
}

// Function to compare current analysis with previous one and show changes
function trackAnalysisChanges() {
    if (!currentProjectId || filesData.length === 0 || previousFilesData.length === 0) {
        document.getElementById('history-panel').style.display = 'none';
        return;
    }
    
    // Get all comparison keys from current analysis
    const currentKeys = new Map();
    filesData.forEach(file => {
        file.comparisons.forEach(comp => {
            const key = getComparisonKey(file.name, comp.source.name, comp.targetFile, comp.target.name);
            currentKeys.set(key, { 
                similarity: comp.similarity,
                fixed: !!comp.fixed,
                source: comp.source,
                target: comp.target,
                sourceFile: file.name,
                targetFile: comp.targetFile
            });
        });
    });
    
    // Get all comparison keys from previous analysis
    const previousKeys = new Map();
    previousFilesData.forEach(file => {
        file.comparisons && file.comparisons.forEach(comp => {
            const key = getComparisonKey(file.name, comp.source.name, comp.targetFile, comp.target.name);
            previousKeys.set(key, { 
                similarity: comp.similarity,
                fixed: !!comp.fixed
            });
        });
    });
    
    // Track new, changed, and removed comparisons
    const newComparisons = [];
    const changedComparisons = [];
    const removedComparisons = [];
    
    // Find new and changed comparisons
    currentKeys.forEach((current, key) => {
        if (!previousKeys.has(key)) {
            newComparisons.push({...current, key});
        } else {
            const previous = previousKeys.get(key);
            // If similarity changed by more than 5%, consider it changed
            if (Math.abs(current.similarity - previous.similarity) > 5) {
                changedComparisons.push({
                    ...current,
                    key,
                    previousSimilarity: previous.similarity
                });
            }
        }
    });
    
    // Find removed comparisons
    previousKeys.forEach((previous, key) => {
        if (!currentKeys.has(key)) {
            // Try to get source/target names from the key
            const parts = key.split('|');
            if (parts.length >= 4) {
                removedComparisons.push({
                    key,
                    sourceFile: parts[0],
                    sourceName: parts[1],
                    targetFile: parts[2],
                    targetName: parts[3],
                    similarity: previous.similarity,
                    fixed: previous.fixed
                });
            }
        }
    });
    
    // Update UI with changes
    document.getElementById('history-new-count').textContent = newComparisons.length;
    document.getElementById('history-changed-count').textContent = changedComparisons.length;
    document.getElementById('history-removed-count').textContent = removedComparisons.length;
    
    // Only show history panel if there are changes
    const historyPanel = document.getElementById('history-panel');
    if (newComparisons.length > 0 || changedComparisons.length > 0 || removedComparisons.length > 0) {
        historyPanel.style.display = 'block';
        
        // Show significant changes in the details
        const historyDetails = document.getElementById('history-details');
        historyDetails.innerHTML = '';
        
        // Show most significant changes (limited to avoid overwhelming UI)
        if (newComparisons.length > 0) {
            // Sort new comparisons by similarity (highest first)
            newComparisons.sort((a, b) => b.similarity - a.similarity);
            
            const newSection = document.createElement('div');
            newSection.innerHTML = `<h4 style="color:#2e7d32">New Comparisons (Top ${Math.min(3, newComparisons.length)})</h4>`;
            
            newComparisons.slice(0, 3).forEach(comp => {
                const item = document.createElement('div');
                item.style.margin = '5px 0';
                item.style.padding = '5px';
                item.style.borderLeft = '3px solid #4caf50';
                item.style.backgroundColor = 'rgba(76, 175, 80, 0.05)';
                
                item.innerHTML = `
                    <strong>${comp.source.name}</strong> ≈ <strong>${comp.target.name}</strong> 
                    (${comp.similarity.toFixed(1)}% similarity)
                    <span style="font-size:11px;display:block;color:#666">
                        ${comp.sourceFile} → ${comp.targetFile}
                    </span>
                `;
                newSection.appendChild(item);
            });
            
            historyDetails.appendChild(newSection);
        }
        
        if (changedComparisons.length > 0) {
            // Sort changed comparisons by absolute difference in similarity
            changedComparisons.sort((a, b) => 
                Math.abs(b.similarity - b.previousSimilarity) - 
                Math.abs(a.similarity - a.previousSimilarity)
            );
            
            const changedSection = document.createElement('div');
            changedSection.innerHTML = `<h4 style="color:#ef6c00">Changed Comparisons (Top ${Math.min(3, changedComparisons.length)})</h4>`;
            
            changedComparisons.slice(0, 3).forEach(comp => {
                const item = document.createElement('div');
                item.style.margin = '5px 0';
                item.style.padding = '5px';
                item.style.borderLeft = '3px solid #ff9800';
                item.style.backgroundColor = 'rgba(255, 152, 0, 0.05)';
                
                const difference = comp.similarity - comp.previousSimilarity;
                const differenceText = difference > 0 ? 
                    `<span style="color:#4caf50">+${difference.toFixed(1)}%</span>` : 
                    `<span style="color:#f44336">${difference.toFixed(1)}%</span>`;
                
                item.innerHTML = `
                    <strong>${comp.source.name}</strong> ≈ <strong>${comp.target.name}</strong> 
                    (${comp.previousSimilarity.toFixed(1)}% → ${comp.similarity.toFixed(1)}%, ${differenceText})
                    <span style="font-size:11px;display:block;color:#666">
                        ${comp.sourceFile} → ${comp.targetFile}
                    </span>
                `;
                changedSection.appendChild(item);
            });
            
            historyDetails.appendChild(changedSection);
        }
    } else {
        historyPanel.style.display = 'none';
    }
}

// Create a new project with proper metadata
function createNewProject(projectId, fileNames) {
    fixedComparisons = {
        metadata: {
            name: generateProjectName(fileNames),
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
            files: fileNames.map(fileName => {
                // Find the corresponding file in filesData
                const fileData = filesData.find(f => f.name === fileName);
                return {
                    name: fileName,
                    extension: fileData ? fileData.extension : '.' + fileName.split('.').pop().toLowerCase(),
                    elementsCount: fileData && fileData.elements ? fileData.elements.length : 0,
                    comparisonsCount: fileData && fileData.comparisons ? fileData.comparisons.length : 0
                };
            })
        }
    };
    
    currentProjectId = projectId;
    allFixedComparisons[projectId] = fixedComparisons;
    saveFixedComparisons();
    updateProjectsList();
}

// Function to show details for a previously fixed comparison that no longer exists
function showFixedComparisonDetails(fixedComp) {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modalContent');
    
    // Make sure no other popups are visible above this one
    const fixedManager = document.getElementById('fixed-comparisons-manager');
    const selectorsManager = document.getElementById('selectors-manager');
    if (fixedManager) fixedManager.style.display = 'none';
    if (selectorsManager) selectorsManager.style.display = 'none';
    
    // Reset copy button text to "Copy Comparison"
    document.getElementById('copyBtn').textContent = 'Copy Comparison';
    
    // Remove any existing highlights
    document.querySelectorAll('.comparison-item.highlighted, .fixed-comparison-item.highlighted').forEach(item => {
        item.classList.remove('highlighted');
    });
    
    // Get the comparison key to find the corresponding items to highlight
    const key = getComparisonKey(fixedComp.sourceFile, fixedComp.sourceName, fixedComp.targetFile, fixedComp.targetName);
    
    // Find and highlight the item in the file card (if exists)
    const comparisonItems = document.querySelectorAll('.comparison-item');
    let found = false;
    comparisonItems.forEach(item => {
        // Get the text span with the specific class
        const textSpan = item.querySelector('.comparison-text');
        if (textSpan && textSpan.textContent.includes(`${fixedComp.sourceName} ≈ ${fixedComp.targetName}`)) {
            item.classList.add('highlighted');
            found = true;
            
            // Scroll parent container to make the highlighted item visible
            const container = item.closest('.comparison-container');
            if (container) {
                setTimeout(() => {
                    // Scroll to show the item in view
                    const itemTop = item.offsetTop;
                    const containerTop = container.scrollTop;
                    const containerHeight = container.clientHeight;
                    
                    if (itemTop < containerTop || itemTop > containerTop + containerHeight) {
                        container.scrollTop = itemTop - 20;
                    }
                }, 100);
            }
        }
    });
    
    content.innerHTML = `<h2>Fixed Comparison: ${fixedComp.sourceName} vs ${fixedComp.targetName}</h2>`;
    
    // Display comparison info without checkbox for toggling fixed state
    const infoDiv = document.createElement('div');
    infoDiv.style.marginBottom = '20px';
    
    // Add a button to unfix this comparison
    const unfixButton = document.createElement('button');
    unfixButton.className = 'btn secondary';
    unfixButton.textContent = 'Unmark as Fixed';
    unfixButton.style.marginBottom = '15px';
    unfixButton.onclick = () => {
        // Remove from fixed comparisons
        delete fixedComparisons[key];
        saveFixedComparisons();
        
        // Close the modal
        closeModal();
        
        // Update the UI - remove the item
        document.querySelectorAll(`.comparison-item[data-key="${key}"]`).forEach(item => {
            item.remove();
        });
        
        // Refresh the display
        displayComparisons('all');
    };
    
    infoDiv.appendChild(unfixButton);
    
    // Add comparison details
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'fixed-comp-details';
    detailsDiv.innerHTML = `
        <p><strong>Source File:</strong> ${fixedComp.sourceFile}</p>
        <p><strong>Source Element:</strong> ${fixedComp.sourceName}</p>
        <p><strong>Target File:</strong> ${fixedComp.targetFile}</p>
        <p><strong>Target Element:</strong> ${fixedComp.targetName}</p>
        <p><strong>Fixed At:</strong> ${new Date(fixedComp.fixedAt).toLocaleString()}</p>
        <p><em>This is a historical fixed comparison from a previous session.</em></p>
    `;
    
    infoDiv.appendChild(detailsDiv);
    content.appendChild(infoDiv);
    
    // If we have any saved content for this comparison, show it
    if (fixedComp.sourceContent || fixedComp.targetContent) {
        const sourceDiv = document.createElement('div');
        sourceDiv.innerHTML = `<h3>${fixedComp.sourceName} (${fixedComp.sourceFile})</h3>`;
        
        if (fixedComp.sourceContent) {
            const sourceCode = document.createElement('div');
            sourceCode.className = 'code-snippet';
            sourceCode.textContent = fixedComp.sourceContent;
            sourceDiv.appendChild(sourceCode);
        } else {
            sourceDiv.innerHTML += '<p><i>Source code not available</i></p>';
        }
        content.appendChild(sourceDiv);
        
        const targetDiv = document.createElement('div');
        targetDiv.innerHTML = `<h3>${fixedComp.targetName} (${fixedComp.targetFile})</h3>`;
        
        if (fixedComp.targetContent) {
            const targetCode = document.createElement('div');
            targetCode.className = 'code-snippet';
            targetCode.textContent = fixedComp.targetContent;
            targetDiv.appendChild(targetCode);
        } else {
            targetDiv.innerHTML += '<p><i>Target code not available</i></p>';
        }
        content.appendChild(targetDiv);
    } else {
        const noDataDiv = document.createElement('div');
        noDataDiv.innerHTML = '<p><i>No code content available for this fixed comparison</i></p>';
        content.appendChild(noDataDiv);
    }

    // Ensure modal appears on top
    modal.style.zIndex = 1005;
    modal.style.display = 'block';
}

// Fixed Comparisons Manager Functions
function openFixedComparisonsManager() {
    openManager('fixed-comparisons-manager', 'selectors-manager', populateFixedComparisonsManager);
}

function closeFixedComparisonsManager() {
    document.getElementById('fixed-comparisons-manager').style.display = 'none';
}

function populateFixedComparisonsManager() {
    const list = document.getElementById('fixed-comparisons-list');
    list.innerHTML = '';
    
    // Get filter value
    const filterValue = document.getElementById('filter-fixed-comparisons').value.toLowerCase();
    
    // Process each project
    const projects = Object.keys(allFixedComparisons);
    let totalShownComparisons = 0;
    
    projects.sort((a, b) => {
        // Sort projects by last used date (newest first)
        const aLastUsed = allFixedComparisons[a].metadata?.lastUsed || '';
        const bLastUsed = allFixedComparisons[b].metadata?.lastUsed || '';
        return bLastUsed.localeCompare(aLastUsed);
    }).forEach(projectId => {
        const projectComps = allFixedComparisons[projectId];
        const projectKeys = Object.keys(projectComps).filter(key => key !== 'metadata');
        
        // Skip if no fixed comparisons in this project
        if (projectKeys.length === 0) return;
        
        // Filter comparisons based on search text
        const filteredKeys = projectKeys.filter(key => {
            if (!filterValue) return true;
            
            const comp = projectComps[key];
            const searchText = `${comp.sourceFile} ${comp.sourceName} ${comp.targetFile} ${comp.targetName}`.toLowerCase();
            return searchText.includes(filterValue);
        });
        
        // Skip if no matching comparisons after filtering
        if (filteredKeys.length === 0) return;
        
        totalShownComparisons += filteredKeys.length;
        
        const projectName = projectComps.metadata?.name || getProjectName(projectId.split('|'));
        
        // Create project group
        const projectGroup = document.createElement('div');
        projectGroup.className = 'project-group';
        
        // Create project header
        const projectHeader = document.createElement('div');
        projectHeader.className = 'project-header';
        projectHeader.innerHTML = `
            <span>${projectName} (${filteredKeys.length} fixed)</span>
            <span>Last used: ${
                projectComps.metadata?.lastUsed ? 
                new Date(projectComps.metadata.lastUsed).toLocaleDateString() : 
                'Unknown'
            } <span class="chevron-icon chevron-down"></span></span>
        `;
        
        // Create comparisons container
        const projectItems = document.createElement('div');
        projectItems.className = 'project-items';
        
        // Add each comparison
        filteredKeys.forEach(key => {
            const comp = projectComps[key];
            const item = document.createElement('div');
            item.className = 'fixed-comparison-item';
            item.dataset.key = key;
            item.dataset.projectId = projectId;
            
            const icon = document.createElement('span');
            icon.innerHTML = 'ℹ️';
            icon.title = 'Historical fixed comparison from previous session';
            icon.style.marginRight = '8px';
            icon.style.fontSize = '16px';
            
            const text = document.createElement('span');
            text.innerHTML = `${comp.sourceName} ≈ ${comp.targetName} <small>(${comp.sourceFile})</small>`;
            
            const date = document.createElement('span');
            date.className = 'fixed-date';
            date.textContent = new Date(comp.fixedAt).toLocaleString();
            
            item.appendChild(icon);
            item.appendChild(text);
            item.appendChild(date);
            
            // Single click to select
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle selection state
                item.classList.toggle('selected');
            });
            
            // Double click to show details
            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                // Remove any existing highlights
                document.querySelectorAll('.fixed-comparison-item.highlighted').forEach(el => {
                    el.classList.remove('highlighted');
                });
                
                // Add highlight to this item
                item.classList.add('highlighted');
                
                // Show comparison details
                showFixedComparisonDetails(comp);
            });
            
            projectItems.appendChild(item);
        });
        
        projectGroup.appendChild(projectHeader);
        projectGroup.appendChild(projectItems);
        list.appendChild(projectGroup);
        
        // Toggle project visibility on header click
        projectHeader.addEventListener('click', () => {
            const isCollapsed = projectItems.style.display === 'none';
            projectItems.style.display = isCollapsed ? 'block' : 'none';
            projectHeader.querySelector('.chevron-icon').className = isCollapsed ? 'chevron-icon chevron-up' : 'chevron-icon chevron-down';
        });
    });
    
    // Update counter
    document.getElementById('fixed-comparisons-count').textContent = 
        `Showing ${totalShownComparisons} fixed comparison${totalShownComparisons !== 1 ? 's' : ''}`;
}

// Add event listener for filter input
document.getElementById('filter-fixed-comparisons').addEventListener('input', function() {
    populateFixedComparisonsManager();
});

// Add event listeners for buttons
document.getElementById('select-all-fixed').addEventListener('click', function() {
    alert('Cannot select historical fixed comparisons from previous sessions as they cannot be modified.');
});

document.getElementById('unselect-all-fixed').addEventListener('click', function() {
    alert('Cannot unselect historical fixed comparisons from previous sessions as they cannot be modified.');
});

document.getElementById('delete-selected-fixed').addEventListener('click', function() {
    alert('Historical fixed comparisons from previous sessions cannot be deleted individually. To remove all data, use the "Delete Project" button instead.');
});

// Selectors Manager Functions
function openSelectorsManager() {
    openManager('selectors-manager', 'fixed-comparisons-manager', populateSelectorsManager);
}

function closeSelectorsManager() {
    document.getElementById('selectors-manager').style.display = 'none';
}

function populateSelectorsManager() {
    const list = document.getElementById('selectors-list');
    list.innerHTML = '';
    
    // Get filter value
    const filterValue = document.getElementById('filter-selectors').value.toLowerCase();
    
    // Create map of all selectors and functions
    const allItems = extractAllSelectorsAndFunctions();
    let totalShownItems = 0;
    
    // Create file groups
    const fileGroups = {};
    
    // Categorize items by file
    allItems.forEach(item => {
        if (!fileGroups[item.file]) {
            fileGroups[item.file] = [];
        }
        
        // Apply filter if any
        if (filterValue && !item.name.toLowerCase().includes(filterValue)) {
            return;
        }
        
        fileGroups[item.file].push(item);
        totalShownItems++;
    });
    
    // Sort files by name
    const sortedFiles = Object.keys(fileGroups).sort();
    
    // Create groups in UI
    sortedFiles.forEach(fileName => {
        const items = fileGroups[fileName];
        if (items.length === 0) return;
        
        const fileGroup = document.createElement('div');
        fileGroup.className = 'selector-group';
        
        const header = document.createElement('div');
        header.className = 'selector-header';
        header.innerHTML = `<span>${fileName} (${items.length} items)</span><span class="chevron-icon chevron-down"></span>`;
        
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'selector-items';
        
        // Initially collapsed
        itemsContainer.style.display = 'none';
        
        // Toggle expand/collapse
        header.onclick = () => {
            const isCollapsed = itemsContainer.style.display === 'none';
            itemsContainer.style.display = isCollapsed ? 'block' : 'none';
            header.querySelector('.chevron-icon').className = isCollapsed ? 'chevron-icon chevron-up' : 'chevron-icon chevron-down';
        };
        
        // Sort items by name
        items.sort((a, b) => a.name.localeCompare(b.name));
        
        // Add items
        items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'selector-item';
            itemEl.innerHTML = `<span>${item.name}</span> <small style="color:#888;">(${item.type})</small>`;
            
            // Make item clickable to show details
            itemEl.onclick = () => showSelectorDetails(item);
            
            itemsContainer.appendChild(itemEl);
        });
        
        fileGroup.appendChild(header);
        fileGroup.appendChild(itemsContainer);
        list.appendChild(fileGroup);
    });
    
    // Update count
    document.getElementById('selectors-count').textContent = 
        `Showing ${totalShownItems} item${totalShownItems !== 1 ? 's' : ''}`;
}

function extractAllSelectorsAndFunctions() {
    const allItems = [];
    
    // Extract from all files
    filesData.forEach(file => {
        // Extract all elements (functions, selectors, etc)
        file.elements.forEach(element => {
            // Make sure we have name and content (using body if full is not available)
            const elementName = element.name || 'Unnamed Element';
            const elementContent = element.full || element.body || '';
            
            allItems.push({
                name: elementName,
                type: detectElementType(elementName, elementContent),
                content: elementContent,
                file: file.name
            });
        });
    });
    
    return allItems;
}

function detectElementType(name, content) {
    // Try to determine if this is a function, selector, or other
    if (!content) {
        // Handle case where content is undefined or null
        if (name.includes('function') || name.includes('=>')) {
            return 'function';
        } else if (name.includes('#') || name.includes('.')) {
            return 'selector';
        } else {
            return 'other';
        }
    }
    
    const firstLine = content.split('\n')[0].trim();
    
    if (firstLine.includes('function') || firstLine.includes('=>')) {
        return 'function';
    } else if (firstLine.includes('#') || firstLine.includes('.') || firstLine.match(/^[a-zA-Z]+[\s]*{/)) {
        return 'selector';
    } else {
        return 'other';
    }
}

function showSelectorDetails(item) {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modalContent');
    
    // Ensure item properties have default values
    const itemName = item.name || 'Unnamed Element';
    const itemType = item.type || 'unknown';
    const itemFile = item.file || 'Unknown file';
    const itemContent = item.content || '';
    
    content.innerHTML = `<h2>${itemName} (${itemType})</h2>`;
    
    // Update the copy button to just say "Copy" for selector/function items
    document.getElementById('copyBtn').textContent = 'Copy';
    
    const infoDiv = document.createElement('div');
    infoDiv.innerHTML = `
        <div class="selector-details">
            <p><strong>Source File:</strong> ${itemFile}</p>
            <p><strong>Type:</strong> ${itemType}</p>
        </div>
    `;
    
    content.appendChild(infoDiv);
    
    const codeDiv = document.createElement('div');
    codeDiv.className = 'code-block';
    
    // Syntax highlight the code
    const highlightedCode = itemContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/(".*?")/g, '<span style="color: #ce9178;">$1</span>')
        .replace(/(function|return|const|let|var|if|else|for|while|switch|case|break|continue|new)/g, 
                 '<span style="color: #569cd6;">$1</span>');
    
    codeDiv.innerHTML = `<pre>${highlightedCode}</pre>`;
    content.appendChild(codeDiv);
    
    // Make sure the modal shows above any other popups
    modal.style.zIndex = 1005;
    modal.style.display = 'block';
}

// Add event listener for filter input
document.addEventListener('DOMContentLoaded', function() {
    const filterInput = document.getElementById('filter-selectors');
    if (filterInput) {
        filterInput.addEventListener('input', function() {
            populateSelectorsManager();
        });
    }
});

// Initialize the file analysis stats section on page load
document.addEventListener('DOMContentLoaded', function() {
    // The expand-all-stats button has been removed, and its functionality 
    // has been integrated into the toggleStatsFullExpand function
    
    // Set up the initial state for the stats panel - partially expanded
    const content = document.getElementById('stats-content');
    const toggle = document.querySelector('.stats-toggle');
    const expandToggle = document.querySelector('.stats-expand-toggle');
    
    content.classList.remove('expanded');
    content.classList.remove('collapsed');
    content.classList.add('partially-expanded');
    content.style.maxHeight = '300px';
    
    // Update the toggle button text to match the initial state
    toggle.innerHTML = 'Collapse <span class="chevron-icon chevron-up"></span>';
    expandToggle.innerHTML = 'Expand <span class="chevron-icon chevron-down"></span>';
    
    // Make sure expand toggle is visible since we start in partially expanded state
    expandToggle.style.display = 'flex';
});

// Update the copy button text based on the number of selected comparisons
function updateCopyButtonText() {
    // Get all file cards
    const fileCards = document.querySelectorAll('.file-card');
    
    fileCards.forEach(card => {
        const selectedCount = card.querySelectorAll('.comparison-item.selected').length;
        const copyButton = card.querySelector('.copy-btn');
        const clearButton = card.querySelector('.clear-btn');
        
        if (copyButton) {
            if (selectedCount === 0) {
                copyButton.textContent = "Copy All";
            } else if (selectedCount === 1) {
                copyButton.textContent = "Copy 1 Comparison";
            } else {
                copyButton.textContent = `Copy ${selectedCount} Comparisons`;
            }
        }
        
        // Show/hide clear button based on selection
        if (clearButton) {
            clearButton.style.display = selectedCount > 0 ? 'inline-block' : 'none';
        }
    });
    
    // Handle fixed comparisons manager
    const fixedManager = document.getElementById('fixed-comparisons-manager');
    if (fixedManager && fixedManager.style.display === 'flex') {
        const selectedCount = fixedManager.querySelectorAll('.fixed-comparison-item.selected').length;
        // TODO: Add interface for copying selected fixed comparisons
    }
    
    // Also update main modal copy button if visible
    const modal = document.getElementById('modal');
    if (modal && modal.style.display === 'block') {
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            copyBtn.textContent = 'Copy Comparison';
        }
    }
}

// Function to clear all selections
function clearSelections() {
    // Clear regular comparison selections
    document.querySelectorAll('.comparison-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Clear fixed comparison selections
    document.querySelectorAll('.fixed-comparison-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    updateCopyButtonText();
}

// Add event listeners once the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Setup event listeners for min length slider
    const minLengthSlider = document.getElementById('minLength');
    const minLengthValue = document.getElementById('minLengthValue');
    
    if (minLengthSlider) {
        // Set initial value from localStorage
        minLengthSlider.value = minLength;
        minLengthValue.textContent = minLength;
        
        minLengthSlider.addEventListener('input', function() {
            updateMinLength(this.value);
        });
        
        setupEditableValue(minLengthValue, (value) => {
            const newValue = Math.min(50, Math.max(5, parseInt(value) || 5));
            minLengthSlider.value = newValue;
            updateMinLength(newValue);
            return newValue;
        });
    }

    // Setup event listeners for language-specific min length sliders
    // HTML Slider
    const minLengthHTMLSlider = document.getElementById('minLengthHTML');
    const minLengthHTMLValue = document.getElementById('minLengthHTMLValue');
    
    if (minLengthHTMLSlider) {
        minLengthHTMLSlider.value = minLengthHTML;
        minLengthHTMLValue.textContent = minLengthHTML;
        
        minLengthHTMLSlider.addEventListener('input', function() {
            updateMinLengthHTML(this.value);
        });
        
        setupEditableValue(minLengthHTMLValue, (value) => {
            const newValue = Math.min(50, Math.max(5, parseInt(value) || 5));
            minLengthHTMLSlider.value = newValue;
            updateMinLengthHTML(newValue);
            return newValue;
        });
    }
    
    // CSS Slider
    const minLengthCSSSlider = document.getElementById('minLengthCSS');
    const minLengthCSSValue = document.getElementById('minLengthCSSValue');
    
    if (minLengthCSSSlider) {
        minLengthCSSSlider.value = minLengthCSS;
        minLengthCSSValue.textContent = minLengthCSS;
        
        minLengthCSSSlider.addEventListener('input', function() {
            updateMinLengthCSS(this.value);
        });
        
        setupEditableValue(minLengthCSSValue, (value) => {
            const newValue = Math.min(50, Math.max(5, parseInt(value) || 5));
            minLengthCSSSlider.value = newValue;
            updateMinLengthCSS(newValue);
            return newValue;
        });
    }
    
    // JS Slider
    const minLengthJSSlider = document.getElementById('minLengthJS');
    const minLengthJSValue = document.getElementById('minLengthJSValue');
    
    if (minLengthJSSlider) {
        minLengthJSSlider.value = minLengthJS;
        minLengthJSValue.textContent = minLengthJS;
        
        minLengthJSSlider.addEventListener('input', function() {
            updateMinLengthJS(this.value);
        });
        
        setupEditableValue(minLengthJSValue, (value) => {
            const newValue = Math.min(50, Math.max(5, parseInt(value) || 5));
            minLengthJSSlider.value = newValue;
            updateMinLengthJS(newValue);
            return newValue;
        });
    }
    
    // Python Slider
    const minLengthPythonSlider = document.getElementById('minLengthPython');
    const minLengthPythonValue = document.getElementById('minLengthPythonValue');
    
    if (minLengthPythonSlider) {
        minLengthPythonSlider.value = minLengthPython;
        minLengthPythonValue.textContent = minLengthPython;
        
        minLengthPythonSlider.addEventListener('input', function() {
            updateMinLengthPython(this.value);
        });
        
        setupEditableValue(minLengthPythonValue, (value) => {
            const newValue = Math.min(50, Math.max(5, parseInt(value) || 5));
            minLengthPythonSlider.value = newValue;
            updateMinLengthPython(newValue);
            return newValue;
        });
    }
    
    // Setup event listeners for code similarity threshold slider
    const codeSimilaritySlider = document.getElementById('codeSimilarityThreshold');
    const codeSimilarityValue = document.getElementById('codeSimilarityValue');
    
    if (codeSimilaritySlider) {
        codeSimilaritySlider.value = codeSimilarityThreshold;
        codeSimilarityValue.textContent = codeSimilarityThreshold;
        
        codeSimilaritySlider.addEventListener('input', function() {
            updateCodeSimilarity(this.value);
        });
        
        setupEditableValue(codeSimilarityValue, (value) => {
            const newValue = Math.min(100, Math.max(1, parseInt(value) || 1));
            codeSimilaritySlider.value = newValue;
            updateCodeSimilarity(newValue);
            return newValue;
        });
    }
    
    // Initialize similarity mode buttons
    document.querySelectorAll('.similarity-mode-btn').forEach(btn => {
        // Set the active class based on the current mode
        btn.classList.toggle('active', btn.getAttribute('data-mode') === similarityPriorityMode);
    });
});

// Add keyboard listener for Escape key to unfocus comparisons
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.comparison-item.highlighted, .comparison-item.right-selected').forEach(item => {
            item.classList.remove('highlighted', 'right-selected');
        });
    }
});

// Toast notification system
function showToast(message, type = 'default', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
        toast.remove();
    };
    
    toast.appendChild(messageSpan);
    toast.appendChild(closeBtn);
    
    const container = document.getElementById('toast-container');
    container.appendChild(toast);
    
    // Auto remove after duration
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, duration);
    }
    
    return toast;
}





// Fix hover areas to ensure they're properly clickable
document.addEventListener('DOMContentLoaded', function() {
    // Add a mutation observer to watch for new comparison items
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                // Look for any new hover areas that might have been added
                mutation.addedNodes.forEach(function(node) {
                    if (node.classList && node.classList.contains('comparison-item')) {
                        // Set pointer-events to none for all content elements
                        const contentElements = node.querySelectorAll('.comparison-content, .comparison-content *, span, .similarity-square, .similarity-percentage');
                        contentElements.forEach(function(el) {
                            el.style.pointerEvents = 'none';
                        });
                        
                        // Ensure hover areas have pointer-events: auto
                        const hoverAreas = node.querySelectorAll('.hover-area');
                        hoverAreas.forEach(function(area) {
                            area.style.pointerEvents = 'auto';
                            area.style.zIndex = '10';
                        });
                        
                        // Remove any onclick handler from the comparison item itself
                        if (node.onclick) {
                            node.onclick = null;
                        }
                    }
                });
            }
        });
    });
    
    // Start observing the document with the configured parameters
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also immediately fix any existing hover areas
    document.querySelectorAll('.comparison-item').forEach(function(item) {
        // Set pointer-events to none for all content elements
        const contentElements = item.querySelectorAll('.comparison-content, .comparison-content *, span, .similarity-square, .similarity-percentage');
        contentElements.forEach(function(el) {
            el.style.pointerEvents = 'none';
        });
        
        // Ensure hover areas have pointer-events: auto
        const hoverAreas = item.querySelectorAll('.hover-area');
        hoverAreas.forEach(function(area) {
            area.style.pointerEvents = 'auto';
            area.style.zIndex = '10';
        });
        
        // Remove any onclick handler from the comparison item itself
        if (item.onclick) {
            item.onclick = null;
        }
    });
});

// Fix hover areas to ensure they're properly clickable
document.addEventListener('DOMContentLoaded', function() {
    // Force all hover areas to be fully interactive
    setInterval(function() {
        // Make all comparison items have no click handler
        document.querySelectorAll('.comparison-item').forEach(function(item) {
            // Ensure the item itself doesn't handle clicks
            item.style.pointerEvents = 'none';
            item.onclick = null;
            
            // Make all content elements non-clickable
            const contentElements = item.querySelectorAll('.comparison-content, .comparison-content *, span, .similarity-square, .similarity-percentage, .comparison-text');
            contentElements.forEach(function(el) {
                el.style.pointerEvents = 'none';
            });
            
            // Make only the hover areas clickable
            const hoverAreas = item.querySelectorAll('.hover-area');
            hoverAreas.forEach(function(area) {
                area.style.pointerEvents = 'auto';
                area.style.zIndex = '20'; // Even higher than before
            });
        });
    }, 500); // Run every 500ms to catch new items
});

// ... existing code ...

// Helper function to update progress UI elements
function updateProgressUI(message = '', percentage = 0) {
    const progressElement = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    if (progressElement) progressElement.style.display = 'block';
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = message;
}

function showProgress(message, percentage = 0) {
    updateProgressUI(message, percentage);
}

function updateProgress(data) {
    updateProgressUI(data.message, data.progress);
    
    // If there are additional stats, display them
    if (data.fileStats) {
        // Update file stats here if needed
        console.log('File stats:', data.fileStats);
    }
}

function showError(message) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    } else {
        console.error('Error:', message);
        alert('Error: ' + message);
    }
}

function resetUI() {
    // Reset progress bar
    updateProgressUI('', 0);
    
    // Hide error message
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
    
    // Clear results
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
    }
}

// ... existing code ...

function processResults(resultData) {
    if (!resultData || !Array.isArray(resultData)) {
        console.error("Invalid results data:", resultData);
        showError("Invalid analysis results received. Please try again.");
        return;
    }
    
    showProgress('Analysis complete!', 100);
    
    // Log the received data structure
    console.log("Received resultData structure sample:", resultData[0] ? 
        Object.keys(resultData[0]).join(', ') : 'Empty result data');
    
    // Preserve any fullContent fields in the resultData for function usage location detection
    
    // Store the parsed file data in the global filesData variable - this is the key fix
    filesData = resultData; // Changed from window.filesData to directly assign to filesData
    console.log("filesData after assignment:", filesData.length, "files with", 
        filesData.reduce((sum, f) => sum + (f.comparisons ? f.comparisons.length : 0), 0), "comparisons");
    
    console.log("Processing analysis results:", 
        resultData.length, "files,",
        resultData.reduce((sum, f) => sum + (f.elements ? f.elements.length : 0), 0), "elements,", 
        resultData.reduce((sum, f) => sum + (f.comparisons ? f.comparisons.length : 0), 0), "comparisons"
    );
    
    // Check for empty results
    if (resultData.length === 0) {
        showError("No files were successfully analyzed. Please check your files and try again.");
        return;
    }
    
    // Check for files without elements
    const filesWithElements = resultData.filter(f => f.elements && f.elements.length > 0);
    if (filesWithElements.length === 0) {
        console.warn("No elements found in any files");
        showError("No code elements were found in the uploaded files. Try adjusting the minimum code length.");
    }
    
    // Check for files without comparisons
    const filesWithComparisons = resultData.filter(f => f.comparisons && f.comparisons.length > 0);
    if (filesWithComparisons.length === 0) {
        console.warn("No comparisons found between files");
        showError("No similar code was found between files. Try lowering the similarity threshold.");
    }
    
    // Update file stats from the results if needed
    updateStatsFromResults();
    
    // Display comparisons using the existing display function
    displayComparisons('all');
    
    // Update all comparisons text area
    updateAllComparisons();
    
    // Automatically collapse the Initial Analysis Settings panel after analysis is complete
    // Get the analysis settings panel elements
    const content = document.getElementById('analysis-settings-content');
    const toggle = document.getElementById('analysis-toggle-text');
    const chevron = document.getElementById('analysis-chevron');
    
    // Only collapse if it's currently expanded
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        toggle.textContent = 'Expand';
        chevron.classList.remove('chevron-up');
        chevron.classList.add('chevron-down');
        console.log("Automatically collapsed the Initial Analysis Settings panel after analysis");
    }
    
    // Track changes compared to previous analysis if this is part of a project
    if (previousFilesData.length > 0) {
        trackAnalysisChanges();
    }
    
    // Save current state to project history if we have a project
    if (currentProjectId) {
        try {
            saveProjectHistory();
        } catch (error) {
            console.warn('Error saving project history:', error);
        }
    } else {
        // Auto-save functionality - Create new project or update existing one
        // Get file names for identifying the project
        const fileNames = filesData.map(file => file.name);
        
        // Generate project ID for this set of files
        const projectId = generateProjectId(fileNames);
        
        // Check if auto-create is enabled - if so, create a new project without comparing
        if (window.autoCreateProject) {
            // Create a new project with a timestamp
            const newProjectId = projectId + "_" + new Date().getTime();
            createNewProject(newProjectId, fileNames);
            saveProjectHistory();
            saveAllProjectData();
            showToast(`Created new project "${fixedComparisons.metadata?.name || getProjectName(fileNames)}"`, 'success');
        } else {
            // Check if similar projects already exist
            const similarProjects = findMostSimilarProject(fileNames);
            
            if (similarProjects && similarProjects.length > 0) {
                // Always use the custom dialog, regardless of whether it's one or multiple projects
                showProjectSelectionDialog(similarProjects, fileNames, projectId);
            } else {
                // No similar projects found, create a brand new one
                createNewProject(projectId, fileNames);
                saveProjectHistory();
                saveAllProjectData();
                showToast(`Created new project "${fixedComparisons.metadata?.name || getProjectName(fileNames)}"`, 'success');
            }
        }
    }
    
    // Log the results for debugging
    console.log('Processing results:', resultData);
    
    // Update progress text to show completion
    const progressText = document.getElementById('progress-text');
    if (progressText) {
        const totalComparisons = resultData.reduce((sum, file) => sum + (file.comparisons ? file.comparisons.length : 0), 0);
        progressText.textContent = `Analysis complete! Found ${totalComparisons} potential duplications.`;
    }
}

function calculateSimilarity(body1, body2) {
    const normalize = str => str.replace(/\s+/g, ' ').trim();
    
    // Short-circuit for identical content
    if (body1 === body2) {
        return { 
            similarity: 100, 
            stats: { 
                commonTokens: 1, 
                totalTokens1: 1, 
                totalTokens2: 1, 
                commonChars: body1.length, 
                totalChars: body1.length 
            } 
        };
    }
    
    // Normalize and tokenize the content
    // Previously we only split by semicolons, which might not work well for all languages
    // Let's use multiple potential delimiters
    const tokenize = (str) => {
        // First try semicolons for JS/CSS-like languages
        let tokens = normalize(str).split(';').map(t => t.trim()).filter(t => t.length > 2);
        
        // If that didn't produce many tokens, try splitting by newlines and punctuation
        if (tokens.length < 3) {
            tokens = normalize(str).split(/[;,\n{}()[\]]/).map(t => t.trim()).filter(t => t.length > 2);
        }
        
        // If still not enough tokens, split by spaces for individual words
        if (tokens.length < 3) {
            tokens = normalize(str).split(/\s+/).filter(t => t.length > 2);
        }
        
        return tokens;
    };

    const tokens1 = tokenize(body1);
    const tokens2 = tokenize(body2);
    
    if (tokens1.length === 0 || tokens2.length === 0) {
        // Last resort: if we can't get valid tokens, try character-by-character comparison
        const chars1 = body1.replace(/\s+/g, '');
        const chars2 = body2.replace(/\s+/g, '');
        
        if (chars1.length === 0 || chars2.length === 0) {
            return { 
                similarity: 0, 
                stats: { 
                    commonTokens: 0, 
                    totalTokens1: 0, 
                    totalTokens2: 0, 
                    commonChars: 0, 
                    totalChars: 0 
                } 
            };
        }
        
        // Simple character-level overlap
        let commonCount = 0;
        for (let i = 0; i < Math.min(chars1.length, chars2.length); i++) {
            if (chars1[i] === chars2[i]) commonCount++;
        }
        
        const similarity = (commonCount / Math.max(chars1.length, chars2.length)) * 100;
        return {
            similarity,
            stats: { 
                commonTokens: commonCount, 
                totalTokens1: chars1.length, 
                totalTokens2: chars2.length, 
                commonChars: commonCount, 
                totalChars: Math.max(chars1.length, chars2.length) 
            }
        };
    }

    // Compare token sets
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = [...set1].filter(t => set2.has(t));
    const commonTokens = intersection.length;
    
    // If no common tokens found using exact matching, try fuzzy matching
    let fuzzyMatches = 0;
    if (commonTokens === 0) {
        for (const token1 of set1) {
            for (const token2 of set2) {
                // Simple fuzzy match - check if one is substring of the other
                if (token1.includes(token2) || token2.includes(token1)) {
                    fuzzyMatches++;
                    break; // Only count each token once
                }
            }
        }
    }
    
    const effectiveCommonTokens = commonTokens > 0 ? commonTokens : fuzzyMatches;
    const commonChars = intersection.reduce((sum, t) => sum + t.length, 0);
    const totalTokens1 = tokens1.length;
    const totalTokens2 = tokens2.length;
    
    // Use Jaccard similarity with a boost for small token sets
    const jaccardSimilarity = (effectiveCommonTokens / (set1.size + set2.size - effectiveCommonTokens)) * 100;
    
    // Boost the similarity for small token sets that have matches
    const smallSetBoost = (Math.min(set1.size, set2.size) <= 3 && effectiveCommonTokens > 0) ? 20 : 0;
    
    // Calculate the character-based similarity
    const totalChars = body1.length + body2.length;
    const charSimilarity = (commonChars / Math.max(1, totalChars)) * 100;

    // Calculate the code length similarity
    const lengthSimilarity = (1 - Math.abs(body1.length - body2.length) / Math.max(body1.length, body2.length)) * 100;
    
    // Apply different weightings based on the similarity priority mode
    let similarity;
    switch (similarityPriorityMode) {
        case 'token': 
            // Prioritize token-based similarity (80% token, 20% length)
            similarity = (jaccardSimilarity * 0.7) + (charSimilarity * 0.2) + (lengthSimilarity * 0.1) + smallSetBoost;
            break;
        case 'length':
            // Prioritize code length similarity (20% token, 80% length)
            similarity = (jaccardSimilarity * 0.2) + (charSimilarity * 0.3) + (lengthSimilarity * 0.5) + smallSetBoost;
            break;
        case 'balanced':
        default:
            // Balanced approach (50% token, 50% length)
            similarity = (jaccardSimilarity * 0.4) + (charSimilarity * 0.3) + (lengthSimilarity * 0.3) + smallSetBoost;
    }

    // Ensure the similarity is between 0 and 100
    similarity = Math.max(0, Math.min(100, similarity));

    return {
        similarity,
        stats: { 
            commonTokens: effectiveCommonTokens, 
            totalTokens1, 
            totalTokens2, 
            commonChars, 
            totalChars,
            jaccardSimilarity: jaccardSimilarity.toFixed(1),
            charSimilarity: charSimilarity.toFixed(1),
            lengthSimilarity: lengthSimilarity.toFixed(1)
        }
    };
}

// Function to toggle the information panel
function toggleInfoPanel() {
    const infoPanel = document.getElementById('info-panel');
    infoPanel.classList.toggle('open');
    
    // If panel is open, add event listener to close when clicking outside
    if (infoPanel.classList.contains('open')) {
        // Close support panel if it's open
        closeSupportPanel();
        
        showToast('Information panel opened. Click outside to close.', 'success', 3000);
        setTimeout(() => {
            document.addEventListener('click', closeInfoPanelOutside);
            document.addEventListener('keydown', closeInfoPanelOnEscape);
        }, 10);
    } else {
        document.removeEventListener('click', closeInfoPanelOutside);
        document.removeEventListener('keydown', closeInfoPanelOnEscape);
    }
}

// Function to toggle the support panel
function toggleSupportPanel() {
    const supportPanel = document.getElementById('support-panel');
    supportPanel.classList.toggle('open');
    
    // If panel is open, add event listener to close when clicking outside
    if (supportPanel.classList.contains('open')) {
        // Close info panel if it's open
        closeInfoPanel();
        
        showToast('Support panel opened. Click outside to close.', 'success', 3000);
        setTimeout(() => {
            document.addEventListener('click', closeSupportPanelOutside);
            document.addEventListener('keydown', closeSupportPanelOnEscape);
        }, 10);
    } else {
        document.removeEventListener('click', closeSupportPanelOutside);
        document.removeEventListener('keydown', closeSupportPanelOnEscape);
    }
}

// Helper function to close the info panel and remove event listeners
function closeInfoPanel() {
    const infoPanel = document.getElementById('info-panel');
    infoPanel.classList.remove('open');
    document.removeEventListener('click', closeInfoPanelOutside);
    document.removeEventListener('keydown', closeInfoPanelOnEscape);
}

// Helper function to close the support panel and remove event listeners
function closeSupportPanel() {
    const supportPanel = document.getElementById('support-panel');
    supportPanel.classList.remove('open');
    document.removeEventListener('click', closeSupportPanelOutside);
    document.removeEventListener('keydown', closeSupportPanelOnEscape);
}

// Function to close info panel when clicking outside
function closeInfoPanelOutside(event) {
    const infoPanel = document.getElementById('info-panel');
    const infoButton = document.getElementById('infoButton');
    
    // If click is outside the panel and not on the info button, close the panel
    if (!infoPanel.contains(event.target) && !infoButton.contains(event.target)) {
        closeInfoPanel();
    }
}

// Function to close support panel when clicking outside
function closeSupportPanelOutside(event) {
    const supportPanel = document.getElementById('support-panel');
    const supportButton = document.getElementById('supportButton');
    
    // If click is outside the panel and not on the support button, close the panel
    if (!supportPanel.contains(event.target) && !supportButton.contains(event.target)) {
        closeSupportPanel();
    }
}

// Function to close info panel when pressing Escape key
function closeInfoPanelOnEscape(event) {
    if (event.key === 'Escape') {
        closeInfoPanel();
    }
}

// Function to close support panel when pressing Escape key
function closeSupportPanelOnEscape(event) {
    if (event.key === 'Escape') {
        closeSupportPanel();
    }
}

// ... existing code ...

// Helper function to decode HTML entities
function decodeHTMLEntities(text) {
    if (!text) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

// ... existing code ...

// Function to save all project data including comparisons
function saveAllProjectData() {
    if (!currentProjectId || !filesData || filesData.length === 0) return;
    
    try {
        // Store analysis data by project ID in a separate storage key to avoid size issues
        // Add timestamp to the end to preserve version history
        const timestamp = new Date().getTime();
        const storageKey = `project_data_${currentProjectId}_${timestamp}`;
        
        // Prepare a simplified version of filesData to save space
        const projectData = filesData.map(file => ({
            name: file.name,
            extension: file.extension,
            elements: file.elements ? file.elements.map(elem => ({
                name: elem.name,
                full: elem.full || '',
                type: elem.type || 'function',
                lineNumber: elem.lineNumber
            })) : [],
            comparisons: file.comparisons ? file.comparisons.map(comp => ({
                source: {
                    name: comp.source.name,
                    full: comp.source.full || '',
                    type: comp.source.type || 'function'
                },
                target: {
                    name: comp.target.name,
                    full: comp.target.full || '',
                    type: comp.target.type || 'function'
                },
                targetFile: comp.targetFile,
                similarity: comp.similarity,
                fixed: isComparisonFixed(file.name, comp.source.name, comp.targetFile, comp.target.name),
                stats: comp.stats || {
                    commonTokens: 0,
                    totalTokens1: 0,
                    totalTokens2: 0
                }
            })) : []
        }));
        
        // Update project metadata to indicate that full data is available
        try {
            if (fixedComparisons.metadata) {
                fixedComparisons.metadata.hasFullData = true;
                fixedComparisons.metadata.lastFullDataSave = new Date().toISOString();
                fixedComparisons.metadata.dataSize = JSON.stringify(fixedComparisons).length;
            }
        } catch (error) {
            console.error('Error updating project metadata:', error);
        }
        
        // Save the project data to localStorage
        try {
            localStorage.setItem(storageKey, JSON.stringify(projectData));
            showToast('Project data saved successfully', 'success', 3000);
            console.log(`Project data saved to ${storageKey}`);
        } catch (localStorageError) {
            console.error('Error saving to localStorage:', localStorageError);
            showToast('Error saving project data: ' + localStorageError.message, 'error', 5000);
        }
    } catch (error) {
        console.error('Error saving project data:', error);
    }
}

// ... existing code ...

// Helper function to extract tokens from a code string
function extractTokens(codeText) {
    if (!codeText) return [];
    
    // Normalize the code by converting to lowercase and removing non-word characters
    const normalizedCode = codeText.toLowerCase();
    
    // Split by common delimiters in code
    const tokens = normalizedCode
        .replace(/[^\w\s]/g, ' ')  // Replace non-alphanumeric with spaces
        .split(/\s+/)               // Split by whitespace
        .filter(token => 
            token.length > 2 &&     // Only tokens with length > 2
            !['the', 'and', 'for', 'this', 'that', 'with'].includes(token) // Skip common words
        );
    
    // Return unique tokens
    return [...new Set(tokens)];
}

// Helper function to find common tokens between two token arrays
function findCommonTokens(tokens1, tokens2) {
    return tokens1.filter(token => tokens2.includes(token));
}

// Function to copy comparisons from a specific file card
function copyFileComparisons(fileIndex) {
    const card = document.getElementById(`file-card-${fileIndex}`);
    if (!card) {
        console.error("File card not found for index:", fileIndex);
        showToast(`Could not find the file card for index ${fileIndex} to copy from.`, "error");
        return;
    }

    const selectedItems = card.querySelectorAll('.comparison-item.selected');
    let itemsToCopy;
    let copyType = "all";

    if (selectedItems.length > 0) {
        itemsToCopy = selectedItems;
        copyType = "selected";
    } else {
        itemsToCopy = card.querySelectorAll('.comparison-item');
    }

    if (itemsToCopy.length === 0) {
        showToast(`No ${copyType === 'selected' ? 'selected' : ''} comparisons to copy for ${filesData[fileIndex].name}.`, "info");
        return;
    }

    let copyText = "";
    let comparisonCount = 0;
    itemsToCopy.forEach(item => {
        const key = item.dataset.key;
        if (!key) {
            console.warn('Comparison item missing data-key:', item);
            return; // Skip items without a key
        }

        // Find the comparison object using the key
        const file = filesData[fileIndex];
        let compToCopy = null;
        if (file && file.comparisons) {
            compToCopy = file.comparisons.find(c => 
                getComparisonKey(file.name, c.source.name, c.targetFile, c.target.name) === key
            );
        }

        if (compToCopy) {
            if (comparisonCount > 0) {
                copyText += "\n========================================\n\n"; // Add divider
            }
            copyText += formatComparisonDetailsForCopy(compToCopy, filesData[fileIndex].name);
            comparisonCount++;
        } else {
            console.warn(`Could not find comparison data for key: ${key}`);
            // Optionally add placeholder text if the comparison data is missing
            // copyText += `\n--- Comparison data missing for key: ${key} ---\n`;
        }
    });

    navigator.clipboard.writeText(copyText.trim())
        .then(() => {
            const copyButton = card.querySelector('.copy-btn');
            if (copyButton) {
                const originalText = copyButton.textContent;
                copyButton.textContent = '✓ Copied!';
                setTimeout(() => {
                    copyButton.textContent = originalText;
                }, 2000);
            }
            showToast(`Copied ${itemsToCopy.length} ${copyType === 'selected' ? 'selected' : 'all'} comparisons for ${filesData[fileIndex].name}`, "success");
        })
        .catch(err => {
            console.error("Failed to copy file comparisons:", err);
            showToast("Failed to copy comparisons: " + err.message, "error");
        });
}

// Helper function to format full comparison details for copying
function formatComparisonDetailsForCopy(comp, sourceFileName) {
    if (!comp || !sourceFileName) return "";

    // Find the full comparison object to get all details (like line numbers, etc.)
    let fullComp = null;
    const fileData = filesData.find(f => f.name === sourceFileName);
    if (fileData && fileData.comparisons) {
        fullComp = fileData.comparisons.find(c => 
            c.source.name === comp.source.name && 
            c.target.name === comp.target.name && 
            c.targetFile === comp.targetFile
        );
    }

    // If we can't find the full comparison object, fallback to the provided comp
    if (!fullComp) {
        fullComp = comp; 
    }

    // Ensure we have source/target objects, even if empty
    const source = fullComp.source || { name: 'N/A', type: 'N/A', language: 'N/A' };
    const target = fullComp.target || { name: 'N/A', type: 'N/A', language: 'N/A' };
    const stats = fullComp.stats || {};
    const targetFile = fullComp.targetFile || 'N/A';

    let text = "=== COMPARISON DETAILS ===\n\n";
    text += `Comparison: ${source.name} vs ${target.name}\n`;
    text += `Similarity: ${fullComp.similarity ? fullComp.similarity.toFixed(1) : 'N/A'}%\n`;
    text += `Status: ${fullComp.fixed ? "✓ Fixed" : "⨯ Not Fixed"}\n\n`;

    // Source element info
    text += "=== SOURCE ELEMENT ===\n";
    text += `File: ${sourceFileName}\n`;
    text += `Element: ${source.name} (${source.type || 'element'})\n`;
    text += `Language: ${source.language || 'unknown'}\n`;
    if (source.lineNumber) text += `Line Number: ${source.lineNumber}\n`;
    if (source.sourcePosition) text += `Character Position: ${source.sourcePosition.startIndex}-${source.sourcePosition.endIndex}\n`;
    
    // Source usage locations (if available)
    const sourceCallLocations = findFunctionUsageLocations(source.name); // Assuming findFunctionUsageLocations exists
    if (sourceCallLocations && sourceCallLocations.length > 0) {
        text += "\n=== SOURCE USAGE LOCATIONS ===\n";
        sourceCallLocations.forEach(location => {
            text += `${location.file} (Line ${location.line}): ${location.type === 'declaration' ? 'Declaration' : 'Call'}\n`;
            if (location.context) {
                 text += `    ${decodeHTMLEntities(location.context).trim()}\n`;
            }
        });
    }

    // Target element info
    text += "\n=== TARGET ELEMENT ===\n";
    text += `File: ${targetFile}\n`;
    text += `Element: ${target.name} (${target.type || 'element'})\n`;
    text += `Language: ${target.language || 'unknown'}\n`;
    if (target.lineNumber) text += `Line Number: ${target.lineNumber}\n`;
    if (target.sourcePosition) text += `Character Position: ${target.sourcePosition.startIndex}-${target.sourcePosition.endIndex}\n`;

    // Target usage locations (if available)
    const targetCallLocations = findFunctionUsageLocations(target.name);
    if (targetCallLocations && targetCallLocations.length > 0) {
        text += "\n=== TARGET USAGE LOCATIONS ===\n";
        targetCallLocations.forEach(location => {
            text += `${location.file} (Line ${location.line}): ${location.type === 'declaration' ? 'Declaration' : 'Call'}\n`;
            if (location.context) {
                text += `    ${decodeHTMLEntities(location.context).trim()}\n`;
            }
        });
    }

    // Similarity Statistics
    text += "\n=== SIMILARITY STATISTICS ===\n";
    text += `Similarity: ${fullComp.similarity ? fullComp.similarity.toFixed(1) : 'N/A'}%\n`;
    if (stats.commonTokens !== undefined) text += `Common Tokens: ${stats.commonTokens}\n`;
    if (stats.tokenSimilarity) text += `Token Similarity: ${stats.tokenSimilarity}%\n`;
    if (stats.lengthSimilarity) text += `Length Similarity: ${stats.lengthSimilarity}%\n`;
    if (stats.tokens1 !== undefined) text += `Source Tokens: ${stats.tokens1}\n`;
    if (stats.tokens2 !== undefined) text += `Target Tokens: ${stats.tokens2}\n`;

    // Source Code
    text += "\n=== SOURCE CODE ===\n";
    const sourceText = decodeHTMLEntities(source.full || source.body || "");
    // Remove existing line numbers before adding new ones
    const sourceCodeClean = sourceText.replace(/^<span class="line-number">\d+<\/span>/gm, '');
    text += addLineNumbers(sourceCodeClean, parseInt(source.lineNumber) || 1).replace(/<[^>]*>/g, ''); // Strip HTML tags for plain text copy
    text += "\n";

    // Target Code
    text += "\n=== TARGET CODE ===\n";
    const targetText = decodeHTMLEntities(target.full || target.body || "");
    const targetCodeClean = targetText.replace(/^<span class="line-number">\d+<\/span>/gm, '');
    text += addLineNumbers(targetCodeClean, parseInt(target.lineNumber) || 1).replace(/<[^>]*>/g, ''); // Strip HTML tags for plain text copy
    text += "\n";

    return text;
}

/**
 * Generic function to toggle a settings panel between expanded and collapsed states
 * @param {string} panelId - The ID of the panel content element
 * @param {string} toggleId - The ID of the toggle text element
 * @param {string} chevronId - The ID of the chevron icon element
 */
function toggleSettingsPanel(panelId, toggleId, chevronId) {
    const content = document.getElementById(panelId);
    const toggle = document.getElementById(toggleId);
    const chevron = document.getElementById(chevronId);
    
    const isExpanded = content.classList.contains('expanded');
    
    if (isExpanded) {
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        toggle.textContent = 'Expand';
        chevron.classList.remove('chevron-up');
        chevron.classList.add('chevron-down');
    } else {
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        toggle.textContent = 'Collapse';
        chevron.classList.remove('chevron-down');
        chevron.classList.add('chevron-up');
    }
}

/**
 * Toggle Analysis Settings panel between collapsed and expanded
 */
function toggleAnalysisSettings() {
    toggleSettingsPanel('analysis-settings-content', 'analysis-toggle-text', 'analysis-chevron');
}

/**
 * Toggle Filter Settings panel between collapsed and expanded
 */
function toggleFilterSettings() {
    toggleSettingsPanel('filter-settings-content', 'filter-toggle-text', 'filter-chevron');
}

// Function to save the current project with a custom name
function saveProject() {
    // Check if we have any data to save
    if (!filesData || filesData.length === 0) {
        showToast('No analysis data to save', 'error');
        return;
    }
    
    const fileNames = filesData.map(file => file.name);
    
    // Generate a default project name
    let projectName = '';
    
    if (currentProjectId && fixedComparisons.metadata?.name) {
        // Use current project name if we're working with an existing project
        projectName = fixedComparisons.metadata.name;
    } else {
        // Generate a new name
        projectName = generateProjectName(fileNames);
    }
    
    // Ask user for a project name
    const newName = prompt('Enter a name for this project:', projectName);
    
    if (newName === null) {
        // User cancelled
        return;
    }
    
    // Check if there's already a project with this name
    const existingProjectWithName = Object.entries(allFixedComparisons).find(([id, proj]) => 
        proj.metadata && proj.metadata.name === newName
    );
    
    if (existingProjectWithName) {
        // If a project with this name exists, ask if the user wants to replace it
        if (confirm(`A project named "${newName}" already exists. Do you want to overwrite it?`)) {
            // User confirmed to overwrite the existing project with this name
            const [existingId] = existingProjectWithName;
            
            // If we're trying to update a different project, we'll first make a copy of current fixed comparisons
            if (existingId !== currentProjectId) {
                // Backup our current fixed comparisons
                const oldFixedComparisons = {...fixedComparisons};
                
                // Load the project we're about to overwrite
                currentProjectId = existingId;
                loadFixedComparisonsForProject(existingId);
                
                // Update its metadata with our new data
                fixedComparisons.metadata = {
                    ...fixedComparisons.metadata || {},
                    name: newName,
                    files: fileNames,
                    lastAnalyzed: new Date().toISOString(),
                    lastUsed: new Date().toISOString()
                };
                
                // Save project data
                saveFixedComparisons();
                saveProjectHistory();
                saveAllProjectData();
                
                showToast(`Updated existing project "${newName}"`, 'success');
            } else {
                // We're updating the current project, just update the name
                if (fixedComparisons.metadata) {
                    fixedComparisons.metadata.name = newName;
                    fixedComparisons.metadata.lastUsed = new Date().toISOString();
                } else {
                    fixedComparisons.metadata = {
                        name: newName,
                        files: fileNames,
                        createdAt: new Date().toISOString(),
                        lastUsed: new Date().toISOString(),
                        lastAnalyzed: new Date().toISOString()
                    };
                }
                
                // Save project data
                saveFixedComparisons();
                saveProjectHistory();
                saveAllProjectData();
                
                showToast(`Updated project "${newName}"`, 'success');
            }
        } else {
            // User chose not to overwrite, create a unique name by adding a timestamp
            const uniqueName = newName + " (" + new Date().toLocaleTimeString() + ")";
            
            // Create a new project with a unique ID
            const newProjectId = generateProjectId(fileNames) + "_" + new Date().getTime();
            
            // Backup current state
            const oldProjectId = currentProjectId;
            const oldFixedComparisons = {...fixedComparisons};
            
            // Create new project
            createNewProject(newProjectId, fileNames);
            
            // Update the metadata with the unique name
            fixedComparisons.metadata.name = uniqueName;
            
            // Save project data
            saveFixedComparisons();
            saveProjectHistory();
            saveAllProjectData();
            
            showToast(`Saved as new project "${uniqueName}"`, 'success');
        }
    } else {
        // No project with this name exists, create a brand new one
        const newProjectId = generateProjectId(fileNames) + "_" + new Date().getTime();
        
        // Create the new project
        createNewProject(newProjectId, fileNames);
        
        // Update its name
        fixedComparisons.metadata.name = newName;
        
        // Save project data
        saveFixedComparisons();
        saveProjectHistory();
        saveAllProjectData();
        
        showToast(`Saved as new project "${newName}"`, 'success');
    }
    
    // Update the UI
    updateProjectsList();
}

function getPercentageColor(similarity) {
    // Scale colors based on the threshold rather than hardcoded 20%
    const r = Math.min(255, Math.round((similarity - codeSimilarityThreshold) * 255 / (100 - codeSimilarityThreshold)));
    const g = Math.min(255, Math.round((100 - similarity) * 255 / (100 - codeSimilarityThreshold)));
    return `rgb(${r}, ${g}, 0)`;
}

function getProjectPercentageColor(similarity, ProjectSimilarityThreshold) {
    // Light gray (200, 200, 200) at threshold to pastel green (200, 230, 200) at 100%
    const r = 200;
    // Scale from threshold to 100, where threshold = gray and 100 = green
    const g = 200 + Math.round((230 - 200) * ((similarity - ProjectSimilarityThreshold) / (100 - ProjectSimilarityThreshold)));
    console.log('g: 200 +', (30 * ((similarity - ProjectSimilarityThreshold) / (100 - ProjectSimilarityThreshold))), '=', g);
    const b = 200;
    
    return `rgb(${r}, ${g}, ${b})`;
}

// Function to show a popup dialog for selecting from multiple similar projects
function showProjectSelectionDialog(similarProjects, fileNames, baseProjectId) {
    console.log("Showing project selection dialog for", similarProjects.length, "similar projects");
    
    // Check if auto-create is enabled
    if (window.autoCreateProject) {
        console.log("Auto-create project is enabled, creating new project without showing dialog");
        // Create a new project with a unique ID
        const newProjectId = baseProjectId + "_" + new Date().getTime();
        createNewProject(newProjectId, fileNames);
        saveProjectHistory();
        saveAllProjectData();
        showToast(`Created new project "${fixedComparisons.metadata.name}"`, 'success');
        return;
    }
    
    // Check if auto-load is enabled - automatically load the most similar project without showing dialog
    if (autoLoadSimilarProjects && similarProjects.length > 0) {
        console.log("Auto-load similar projects is enabled, loading most similar project without showing dialog");
        // First ensure they're sorted by similarity score (highest first)
        similarProjects.sort((a, b) => b.score - a.score);
        
        // When there are multiple projects with the same similarity score (e.g., 100%), 
        // sort by timestamp to get the most recent one first
        const highestScore = similarProjects[0].score;
        const projectsWithHighestScore = similarProjects.filter(p => p.score === highestScore);
        
        if (projectsWithHighestScore.length > 1) {
            // Sort projects with the same highest score by timestamp (most recent first)
            projectsWithHighestScore.sort((a, b) => {
                const aTime = allFixedComparisons[a.projectId]?.metadata?.lastUsed || '';
                const bTime = allFixedComparisons[b.projectId]?.metadata?.lastUsed || '';
                // Most recent first (descending order)
                return bTime.localeCompare(aTime);
            });
            
            // Replace the first element with the most recent project having the highest score
            similarProjects[0] = projectsWithHighestScore[0];
        }
        
        // Update the most similar and most recent project (first in the array)
        const mostSimilarProject = similarProjects[0];
        updateExistingProject(mostSimilarProject.projectId, fileNames);
        return;
    }
    
    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    
    // Create modal dialog
    const dialog = document.createElement('div');
    dialog.className = 'project-selection-dialog';
    
    // Create dialog title
    const title = document.createElement('h3');
    title.textContent = similarProjects.length === 1 ? 'Similar Project Found' : 'Multiple Similar Projects Found';
    
    // Create description
    const description = document.createElement('p');
    description.textContent = similarProjects.length === 1 
        ? 'Would you like to update this project with your current analysis, or create a new project?'
        : 'Select a project to update with your current analysis, or create a new project:';
    
    // Create project list container
    const projectList = document.createElement('div');
    projectList.style.marginBottom = '20px';
    
    // Add each similar project as a selectable item, sorted by most recent first
    similarProjects
        .sort((a, b) => {
            const aTime = allFixedComparisons[a.projectId]?.metadata?.lastUsed || '';
            const bTime = allFixedComparisons[b.projectId]?.metadata?.lastUsed || '';
            return bTime.localeCompare(aTime); // Sort most recent first
        })
        .forEach((proj, index) => {
            const similarityPercent = Math.round(proj.score * 100);
            const projFiles = proj.projectId.split('|');
            const timestamp = allFixedComparisons[proj.projectId]?.metadata?.lastUsed || '';
            
            const item = document.createElement('div');
            item.className = 'project-selection-item';
            
            // Format date if available
            let dateStr = '';
            if (timestamp) {
                try {
                    dateStr = ' - Last used: ' + new Date(timestamp).toLocaleString();
                } catch (e) {
                    console.error('Error formatting date:', e);
                }
            }
            
            // Get color for similarity percentage
            const percentColor = getProjectPercentageColor(similarityPercent, ProjectSimilarityThreshold);
            
            item.innerHTML = `
                <div style="font-weight: bold;">
                    <span class="match-percentage" style="background-color: ${percentColor};">${similarityPercent}%</span>
                    ${proj.name || getProjectName(projFiles)}
                </div>
                <div style="margin-top: 8px; font-size: 0.9em; color: #666;">
                    <span style="background: #f5f5f5; padding: 2px 6px; border-radius: 4px;">
                        <b>${projFiles.length}</b> files
                    </span>
                    ${dateStr}
                </div>
                <div style="margin-top: 8px; color: #777; font-size: 0.85em;">
                    <b>Files:</b> ${projFiles.slice(0, 3).join(', ')}${projFiles.length > 3 ? '...' : ''}
                </div>
            `;
            
            // Add click handler to select this project
            item.onclick = () => {
                // Update the selected project
                updateExistingProject(proj.projectId, fileNames);
                document.body.removeChild(backdrop);
            };
            
            projectList.appendChild(item);
        });
    
    // Create buttons container
    const buttons = document.createElement('div');
    buttons.className = 'project-buttons-container';
    
    // Create "Create New Project" button
    const newProjectBtn = document.createElement('button');
    newProjectBtn.textContent = 'Create New Project';
    newProjectBtn.className = 'btn';
    
    // Add click handler to create a new project
    newProjectBtn.onclick = () => {
        // Create a new project with a unique ID
        const newProjectId = baseProjectId + "_" + new Date().getTime();
        createNewProject(newProjectId, fileNames);
        saveProjectHistory();
        saveAllProjectData();
        showToast(`Created new project "${fixedComparisons.metadata.name}"`, 'success');
        document.body.removeChild(backdrop);
    };
    
    // Create "Cancel" button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn';
    
    // Add click handler to close the dialog
    cancelBtn.onclick = () => {
        document.body.removeChild(backdrop);
        
        // If the user cancels, create a new project
        const newProjectId = baseProjectId + "_" + new Date().getTime();
        createNewProject(newProjectId, fileNames);
        saveProjectHistory();
        saveAllProjectData();
        showToast(`Created new project "${fixedComparisons.metadata.name}"`, 'success');
    };
    
    // Add buttons to container
    buttons.appendChild(cancelBtn);
    buttons.appendChild(newProjectBtn);
    
    // Assemble the dialog
    dialog.appendChild(title);
    dialog.appendChild(description);
    dialog.appendChild(projectList);
    dialog.appendChild(buttons);
    backdrop.appendChild(dialog);
    
    // Add the dialog to the document
    document.body.appendChild(backdrop);
}

// Move updateExistingProject outside processResults to make it globally accessible
function updateExistingProject(projectId, fileNames) {
    currentProjectId = projectId;
    
    // Load existing fixed comparisons from the similar project
    loadFixedComparisonsForProject(projectId);
    
    // Update the metadata with current file information
    if (fixedComparisons.metadata) {
        fixedComparisons.metadata.files = fileNames; // Update the list of files associated with the project
        fixedComparisons.metadata.lastAnalyzed = new Date().toISOString(); // Update the last analyzed timestamp
        fixedComparisons.metadata.lastUsed = new Date().toISOString(); // Update last used
    } else {
        // This case should ideally not happen if loadFixedComparisonsForProject worked
        console.warn("Metadata missing after loading project:", projectId, "Creating default metadata.");
        fixedComparisons.metadata = {
            name: getProjectName(fileNames), // Generate a name based on current files
            files: fileNames,
            lastAnalyzed: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
            createdAt: new Date().toISOString() // Assume creation now if metadata was missing
        };
    }

    // Save project history with current analysis data
    saveProjectHistory();
    
    // Save the full analysis data
    saveAllProjectData();
    
    // Show success message
    showToast(`Updated existing project "${fixedComparisons.metadata?.name || getProjectName(projectId.split('|'))}"`, 'success');
}

// Function to calculate the size of localStorage data
function getLocalStorageSize() {
    let totalSize = 0;
    let itemSizes = [];
    
    // Get all localStorage items and their sizes
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            const value = localStorage[key];
            const size = ((key.length + value.length) * 2) / 1024; // Size in KB (2 bytes per character)
            totalSize += size;
            itemSizes.push({
                key: key,
                size: size,
                lastUsed: key.includes('_') ? key.split('_').pop() : null // Try to extract timestamp from key
            });
        }
    }
    
    // Sort by size (largest first)
    itemSizes.sort((a, b) => b.size - a.size);
    
    return {
        totalSize: totalSize, // in KB
        items: itemSizes,
        percentUsed: (totalSize / 5120) * 100 // 5MB is typical localStorage limit (5120KB)
    };
}

// Function to display the storage usage warning
function checkAndShowStorageWarning() {
    // Check if the user has chosen not to show this warning
    if (localStorage.getItem('hideStorageWarning') === 'true') {
        return;
    }
    
    // Get storage usage info
    const storageInfo = getLocalStorageSize();
    
    // Only show warning if usage is above 70%
    if (storageInfo.percentUsed < 70) {
        return;
    }
    
    // Create the warning dialog
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    
    const dialog = document.createElement('div');
    dialog.className = 'storage-warning-dialog';
    
    // Create header with warning icon
    const header = document.createElement('div');
    header.className = 'storage-warning-header';
    header.innerHTML = `
        <div class="warning-icon">⚠️</div>
        <h3>Storage Space Warning</h3>
    `;
    
    // Create content
    const content = document.createElement('div');
    content.className = 'storage-warning-content';
    
    content.innerHTML = `
        <p>Your browser's local storage is <strong>${storageInfo.percentUsed.toFixed(1)}% full</strong> (${storageInfo.totalSize.toFixed(2)}KB used).</p>
        <p>This may cause errors when saving new projects or analyses. Consider removing some data to free up space.</p>
        
        <div class="storage-items-container">
            <h4>Largest Storage Items:</h4>
            <div class="storage-items-list">
                ${storageInfo.items.slice(0, 5).map(item => {
                    // Try to format date if available
                    let dateStr = '';
                    if (item.lastUsed && !isNaN(parseInt(item.lastUsed))) {
                        try {
                            dateStr = ` (Last used: ${new Date(parseInt(item.lastUsed)).toLocaleDateString()})`;
                        } catch (e) {}
                    }
                    
                    return `
                        <div class="storage-item">
                            <div class="storage-item-name">${item.key.length > 40 ? item.key.substring(0, 37) + '...' : item.key}</div>
                            <div class="storage-item-info">
                                <span class="storage-item-size">${item.size.toFixed(2)}KB</span>
                                <span class="storage-item-date">${dateStr}</span>
                            </div>
                            <button class="delete-storage-item" data-key="${item.key}">Delete</button>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
        
        <div class="storage-help-section">
            <details>
                <summary>How Storage is Managed</summary>
                <div class="storage-help-content">
                    <p>This application uses browser localStorage to save your project data. Storage is managed in several ways:</p>
                    <ul>
                        <li><strong>Cleanup of old versions:</strong> Older versions of project data are automatically removed.</li>
                        <li><strong>Data compression:</strong> When storage is full, the app tries to create a more compact version of your data.</li>
                        <li><strong>Multi-level error handling:</strong> If storage is full, different approaches are tried to ensure your data is saved.</li>
                    </ul>
                </div>
            </details>
        </div>
    `;
    
    // Create action buttons
    const actions = document.createElement('div');
    actions.className = 'storage-warning-actions';
    
    // Don't show again checkbox
    const dontShowDiv = document.createElement('div');
    dontShowDiv.className = 'dont-show-again';
    dontShowDiv.innerHTML = `
        <input type="checkbox" id="hide-storage-warning">
        <label for="hide-storage-warning">Don't show this warning again</label>
    `;
    
    // Buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'storage-warning-buttons';
    
    const closeButton = document.createElement('button');
    closeButton.className = 'btn';
    closeButton.textContent = 'Close';
    closeButton.onclick = () => {
        // Check if "don't show again" is checked
        const hideWarning = document.getElementById('hide-storage-warning').checked;
        if (hideWarning) {
            localStorage.setItem('hideStorageWarning', 'true');
        }
        document.body.removeChild(backdrop);
    };
    
    const cleanupButton = document.createElement('button');
    cleanupButton.className = 'btn btn-primary';
    cleanupButton.textContent = 'Auto Cleanup Storage';
    cleanupButton.onclick = () => {
        cleanupStorageData();
        document.body.removeChild(backdrop);
        showToast('Storage cleanup complete!', 'success');
    };
    
    buttonsDiv.appendChild(closeButton);
    buttonsDiv.appendChild(cleanupButton);
    
    actions.appendChild(dontShowDiv);
    actions.appendChild(buttonsDiv);
    
    // Assemble dialog
    dialog.appendChild(header);
    dialog.appendChild(content);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    
    // Add to document
    document.body.appendChild(backdrop);
    
    // Add event listeners for the delete buttons
    setTimeout(() => {
        const deleteButtons = document.querySelectorAll('.delete-storage-item');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const key = e.target.getAttribute('data-key');
                if (confirm(`Are you sure you want to delete "${key}" from storage?`)) {
                    localStorage.removeItem(key);
                    showToast(`Deleted "${key}" from storage`, 'success');
                    // Remove the item from the list
                    e.target.parentElement.remove();
                    // Update the total size display
                    const newInfo = getLocalStorageSize();
                    const percentElem = content.querySelector('p strong');
                    if (percentElem) {
                        percentElem.textContent = `${newInfo.percentUsed.toFixed(1)}% full`;
                    }
                }
            });
        });
    }, 0);
}

// Perform automatic storage cleanup
function cleanupStorageData() {
    // Find all timestamped project data entries
    const projectDataKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('project_data_') && key.includes('_')
    );
    
    // Group by base project id
    const projectGroups = {};
    projectDataKeys.forEach(key => {
        const parts = key.split('_');
        // The timestamp is the last part, so we'll remove that to get the base key
        const baseKey = key.substring(0, key.lastIndexOf('_'));
        if (!projectGroups[baseKey]) {
            projectGroups[baseKey] = [];
        }
        projectGroups[baseKey].push({
            key: key,
            timestamp: parseInt(parts[parts.length - 1])
        });
    });
    
    // For each group, keep only the 2 most recent entries
    let deletedCount = 0;
    Object.values(projectGroups).forEach(group => {
        if (group.length > 2) {
            // Sort by timestamp (newest first)
            group.sort((a, b) => b.timestamp - a.timestamp);
            
            // Delete all but the 2 most recent
            group.slice(2).forEach(item => {
                localStorage.removeItem(item.key);
                deletedCount++;
            });
        }
    });
    
    return deletedCount;
}

/**
 * Generic function to open a manager panel
 * @param {string} managerId - ID of the manager to open
 * @param {string} otherManagerId - ID of the other manager to close
 * @param {Function} populateFunction - Function to call to populate the manager
 */
function openManager(managerId, otherManagerId, populateFunction) {
    const manager = document.getElementById(managerId);
    
    // Populate the manager
    if (typeof populateFunction === 'function') {
        populateFunction();
    }
    
    // Close the other manager if open
    const otherManager = document.getElementById(otherManagerId);
    if (otherManager) otherManager.style.display = 'none';
    
    // Display the manager
    manager.style.display = 'flex';
    
    // Make sure modal is closed
    document.getElementById('modal').style.display = 'none';
}

/**
 * Generic function to handle UI element visibility and content
 * @param {string} elementId - ID of the element to modify
 * @param {boolean} show - Whether to show (true) or hide (false) the element
 * @param {string} [message] - Optional message to set as content
 */
function updateUIElement(elementId, show, message = null) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.style.display = show ? 'block' : 'none';
    
    if (message !== null && show) {
        element.textContent = message;
    }
}

/**
 * Show error message on the UI
 * @param {string} message - Error message to display
 */
function showError(message) {
    updateUIElement('error-message', true, message);
    
    // Fallback to console/alert if UI element doesn't exist
    if (!document.getElementById('error-message')) {
        console.error('Error:', message);
        alert('Error: ' + message);
    }
}

/**
 * Reset UI to initial state
 */
function resetUI() {
    // Reset progress bar
    updateProgressUI('', 0);
    
    // Hide error message
    updateUIElement('error-message', false);
    
    // Clear results
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
    }
}

