import { ToastManager } from './managers/toast.js'


document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const itemForm = document.getElementById('itemForm');
    const itemInput = document.getElementById('itemInput');
    const itemList = document.getElementById('itemList');
    const themeToggle = document.getElementById('themeToggle');
    const moonIcon = themeToggle.querySelector('.moon');
    const sunIcon = themeToggle.querySelector('.sun');
    const toastContainer = document.getElementById('toast-container');
    const toastManager = new ToastManager(toastContainer);
    const pinModal = document.getElementById('pinModal');
    const pinInputs = [...document.querySelectorAll('.pin-input')];
    const pinError = document.getElementById('pinError');
    const listSelector = document.getElementById('listSelector');
    const renameListBtn = document.getElementById('renameList');
    const deleteListBtn = document.getElementById('deleteList');
    const addListBtn = document.getElementById('addList');


    // Set up list selector event handlers once
    const selectorContainer = listSelector.parentElement;

    // Show/hide custom select on click
    function handleSelectorClick(e) {
        e.preventDefault();
        e.stopPropagation();
        const customSelect = selectorContainer.querySelector('.custom-select');
        if (customSelect) {
            const isHidden = customSelect.style.display === 'none' || !customSelect.style.display;
            customSelect.style.display = isHidden ? 'block' : 'none';
        }
    }

    // Hide custom select when clicking outside
    function handleOutsideClick(e) {
        const customSelect = selectorContainer.querySelector('.custom-select');
        if (customSelect && !selectorContainer.contains(e.target)) {
            customSelect.style.display = 'none';
        }
    }

    // Handle keyboard navigation
    function handleKeyboard(e) {
        const customSelect = selectorContainer.querySelector('.custom-select');
        if (customSelect) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                customSelect.style.display = customSelect.style.display === 'none' ? 'block' : 'none';
            } else if (e.key === 'Escape') {
                customSelect.style.display = 'none';
            }
        }
    }

    // Initialize dropdown event listeners after data is loaded
    function initializeDropdown() {
        listSelector.addEventListener('mousedown', handleSelectorClick);
        document.addEventListener('click', handleOutsideClick);
        listSelector.addEventListener('keydown', handleKeyboard);
    }

    // State
    let items = {};
    let currentList = 'List 1';

    // List Management
    function initializeLists(data) {
        if (!data || Object.keys(data).length === 0) {
            // Only create List 1 when there are no lists at all
            items = { 'List 1': [] };
            currentList = 'List 1';
        } else {
            // Convert only numeric keys, preserve custom names
            const convertedData = {};
            Object.entries(data).forEach(([key, value]) => {
                // Only convert numeric keys
                if (/^\d+$/.test(key)) {
                    const newKey = `List ${Object.keys(convertedData).length + 1}`;
                    convertedData[newKey] = value;
                } else {
                    convertedData[key] = value;
                }
            });
            
            items = convertedData;
            currentList = Object.keys(convertedData)[0];
        }
        
        updateListSelector();
        renderItems();
    }

    function updateListSelector() {
        // Sort the list keys to ensure List 1 comes first
        const sortedKeys = Object.keys(items).sort((a, b) => {
            if (a === 'List 1') return -1;
            if (b === 'List 1') return 1;
            return a.localeCompare(b);
        });
        
        // Update the native select
        listSelector.innerHTML = sortedKeys.map(listId => 
            `<option value="${listId}"${listId === currentList ? ' selected' : ''}>${listId}</option>`
        ).join('');
        
        // Create a custom select
        const customSelect = document.createElement('div');
        customSelect.className = 'custom-select';
        customSelect.style.display = 'none'; // Explicitly set initial state
        
        sortedKeys.forEach(listId => {
            const item = document.createElement('div');
            item.className = `list-item ${listId === 'List 1' ? 'list-1' : ''}`;
            item.dataset.value = listId;
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = listId;
            item.appendChild(nameSpan);
            
            if (listId !== 'List 1') {
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'delete-btn';
                deleteBtn.setAttribute('aria-label', `Delete ${listId}`);
                deleteBtn.innerHTML = `
                    <svg viewBox="0 0 24 24">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                `;
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteList(listId);
                });
                item.appendChild(deleteBtn);
            }
            
            item.addEventListener('click', () => {
                if (listId !== currentList) {
                    switchList(listId);
                    customSelect.style.display = 'none';
                }
            });
            
            customSelect.appendChild(item);
        });
        
        // Replace the existing custom select if any
        const existingCustomSelect = selectorContainer.querySelector('.custom-select');
        if (existingCustomSelect) {
            const wasVisible = existingCustomSelect.style.display === 'block';
            selectorContainer.removeChild(existingCustomSelect);
            if (wasVisible) {
                customSelect.style.display = 'block';
            }
        }
        selectorContainer.appendChild(customSelect);
    }

    function switchList(listId) {
        currentList = listId;
        listSelector.value = listId; // Update the native select value
        renderItems();
    }

    function addNewList() {
        const listCount = Object.keys(items).length + 1;
        const newListId = `List ${listCount}`;
        items[newListId] = [];
        currentList = newListId;
        updateListSelector();
        renderItems();
        saveItems();
        toastManager.show('New list added');
    }

    async function renameCurrentList() {
        const newName = prompt('Enter new list name:', currentList);
        if (newName && newName.trim() && newName !== currentList && !items[newName]) {
            const oldName = currentList;
            const oldItems = { ...items };  // Keep a full backup
            
            try {
                // Update the data structure
                items[newName] = items[currentList];
                delete items[currentList];
                currentList = newName;
                
                // Update UI
                updateListSelector();
                
                // Save changes
                await saveItems();
                toastManager.show('List renamed');
            } catch (error) {
                // Revert all changes on failure
                items = oldItems;
                currentList = oldName;
                updateListSelector();
                toastManager.show('Failed to save list name change', 'error', false, 5000);
            }
        }
    }

    async function deleteList(listId) {
        // Don't allow deleting the last list or List 1
        if (Object.keys(items).length <= 1 || listId === 'List 1') {
            toastManager.show('Cannot delete this list', 'error');
            return;
        }

        if (confirm(`Are you sure you want to delete "${listId}" and all its items?`)) {
            const oldItems = { ...items };
            try {
                // Remove the list
                delete items[listId];
                
                // If we're deleting the current list, switch to another one
                if (listId === currentList) {
                    currentList = Object.keys(items)[0];
                }
                
                // Update UI
                updateListSelector();
                renderItems();
                
                // Save changes
                await saveItems();
                toastManager.show('List deleted');
            } catch (error) {
                // Revert changes on failure
                items = oldItems;
                updateListSelector();
                renderItems();
                toastManager.show('Failed to delete list', 'error', false, 5000);
            }
        }
    }

    // Event Listeners for List Management
    listSelector.addEventListener('change', (e) => {
        switchList(e.target.value);
    });

    renameListBtn.addEventListener('click', renameCurrentList);
    addListBtn.addEventListener('click', addNewList);

    // Enhanced fetch with auth headers
    async function fetchWithAuth(url, options = {}) {
        return fetch(url, options);
    }

    // Theme Management
    function updateThemeIcons() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        moonIcon.style.display = isDark ? 'none' : 'block';
        sunIcon.style.display = isDark ? 'block' : 'none';
    }

    // Initialize theme icons
    updateThemeIcons();

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcons();
    });

    // Item Management
    async function loadItems() {
        try {
            const response = await fetchWithAuth('/api/items');
            if (!response.ok) throw new Error('Failed to load items');
            const data = await response.json();
            initializeLists(data);
            initializeDropdown(); // Initialize dropdown after data is loaded
        } catch (error) {
            toastManager.show('Failed to load items', 'error', true);
            console.error(error);
        }
    }

    async function saveItems() {
        try {
            const response = await fetchWithAuth('/api/items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(items)
            });
            if (!response.ok) throw new Error('Failed to save items');
            return true;
        } catch (error) {
            toastManager.show('Failed to save items', 'error');
            console.error(error);
            throw error;  // Re-throw to handle in calling function
        }
    }

    function createItemElement(item) {
        const li = document.createElement('li');
        li.className = 'item-item';
        li.draggable = true;
        li.setAttribute('data-item-id', item.text); // Using text as a simple identifier

        // Remove the old checkbox-wrapper and just show the text and delete button
        li.innerHTML = `
            <span class="item-text">${linkifyText(item.text)}</span>
            <button class="copy-btn" aria-label="Copy item text" title="Copy to clipboard">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="share-btn" aria-label="Share item" title="Share">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
            <button class="delete-btn" aria-label="Delete item">×</button>
        `;

        // Add .long-text class if text is more than 3 lines
        const lineCount = (item.text.match(/\n/g) || []).length + 1;
        if (lineCount > 1) {
            li.classList.add('long-text');
        }

        const itemText = li.querySelector('.item-text');
        const copyBtn = li.querySelector('.copy-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(item.text)
                .then(() => toastManager.show('Copied to clipboard'))
                .catch(() => toastManager.show('Failed to copy', 'error'));
        });

        // Make text editable on click
        itemText.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') return;
            const textarea = document.createElement('textarea');
            textarea.value = item.text;
            textarea.className = 'edit-input';
            textarea.rows = Math.max(2, item.text.split('\n').length);
            const originalText = itemText.innerHTML;
            itemText.replaceWith(textarea);
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            function saveEdit() {
                const newText = textarea.value.trim();
                if (newText && newText !== item.text) {
                    item.text = newText;
                    renderItems();
                    saveItems();
                    toastManager.show('Item updated');
                } else {
                    textarea.replaceWith(itemText);
                    itemText.innerHTML = originalText;
                }
            }
            textarea.addEventListener('blur', saveEdit);
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    saveEdit();
                } else if (e.key === 'Escape') {
                    textarea.replaceWith(itemText);
                    itemText.innerHTML = originalText;
                }
            });
        });

        const deleteBtn = li.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            li.remove();
            items[currentList] = items[currentList].filter(t => t !== item);
            saveItems();
            toastManager.show('Item deleted', 'error');
        });

        // Drag and drop event listeners
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.text);
            li.classList.add('dragging');
            const dragImage = li.cloneNode(true);
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-1000px';
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 0, 0);
            setTimeout(() => document.body.removeChild(dragImage), 0);
        });
        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
        });
        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            if (draggingItem && !li.classList.contains('dragging')) {
                const items = [...itemList.querySelectorAll('.item-item')];
                const currentPos = items.indexOf(draggingItem);
                const newPos = items.indexOf(li);
                if (currentPos !== newPos) {
                    const rect = li.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const mouseY = e.clientY;
                    if (mouseY < midY) {
                        li.parentNode.insertBefore(draggingItem, li);
                    } else {
                        li.parentNode.insertBefore(draggingItem, li.nextSibling);
                    }
                    // Update the items array to match the new order
                    const newOrder = [...document.querySelectorAll('.item-item')].map(item => {
                        return items[currentList].find(t => t.text === item.getAttribute('data-item-id'));
                    });
                    items[currentList] = newOrder;
                    saveItems();
                }
            }
        });
        return li;
    }

    // Helper function to convert URLs in text to clickable links
    function linkifyText(text) {
        // Updated regex that doesn't include trailing punctuation in the URL
        const urlRegex = /(https?:\/\/[^\s)]+)([)\s]|$)/g;
        return text.replace(urlRegex, (match, url, endChar) => {
            // Return the URL as a link plus any trailing character
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${endChar}`;
        });
    }

    function renderItems() {
        itemList.innerHTML = '';
        const currentItems = items[currentList] || [];
        currentItems.forEach(item => {
            itemList.appendChild(createItemElement(item));
        });
    }

    // Event Listeners
    itemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = itemInput.value.trim();
        if (text) {
            // Ensure the current list exists before pushing
            if (!items[currentList]) {
                items[currentList] = [];
            }
            const item = { text };
            items[currentList].push(item);
            renderItems();
            saveItems();
            itemInput.value = '';
            toastManager.show('Item added');
        }
    });

    const initialize = async () => {
        // Initialize
        fetch(`api/config`)
            .then(resp => resp.json())
            .then(config => {
                if (config.error) {
                    throw new Error(config.error);
                }

                document.getElementById('page-title').textContent = `${config.siteTitle} - Stupidly Simple Pastebin`;
                document.getElementById('header-title').textContent = config.siteTitle;
                
                loadItems();       
            })
            .catch(err => {
                console.error('Error loading site config:', err);
                toastManager.show(err, 'error', true);
            })

        // Register PWA Service Worker
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/service-worker.js")
                .then((reg) => console.log("Service Worker registered:", reg.scope))
                .catch((err) => console.log("Service Worker registration failed:", err));
        }
    }

    initialize();
})