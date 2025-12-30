import { ToastManager } from './managers/toast.js';


document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const todoForm = document.getElementById('todoForm');
    const todoInput = document.getElementById('todoInput');
    const todoList = document.getElementById('todoList');
    const themeToggle = document.getElementById('themeToggle');
    const moonIcon = themeToggle.querySelector('.moon');
    const sunIcon = themeToggle.querySelector('.sun');
    const toastContainer = document.getElementById('toast-container');
    const toastManager = new ToastManager(toastContainer);
    const pinModal = document.getElementById('pinModal');
    const pinInputs = [...document.querySelectorAll('.pin-input')];
    const pinError = document.getElementById('pinError');
    const clearCompletedBtn = document.getElementById('clearCompleted');
    const listSelector = document.getElementById('listSelector');
    const renameListBtn = document.getElementById('renameList');
    const deleteListBtn = document.getElementById('deleteList');
    const addListBtn = document.getElementById('addList');

    const listControls = document.getElementById('listControls');

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
    let todos = {};
    let currentList = 'List 1';

    // List Management
    function initializeLists(data) {
        if (!data || Object.keys(data).length === 0) {
            // Only create List 1 when there are no lists at all
            todos = { 'List 1': [] };
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
            
            todos = convertedData;
            currentList = Object.keys(convertedData)[0];
        }
        
        updateListSelector();
        renderTodos();
    }

    function updateListSelector() {
        // Sort the list keys to ensure List 1 comes first
        const sortedKeys = Object.keys(todos).sort((a, b) => {
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
        renderTodos();
    }

    function addNewList() {
        const listCount = Object.keys(todos).length + 1;
        const newListId = `List ${listCount}`;
        todos[newListId] = [];
        currentList = newListId;
        updateListSelector();
        renderTodos();
        saveTodos();
        toastManager.show('New list added');
    }

    async function renameCurrentList() {
        const newName = prompt('Enter new list name:', currentList);
        if (newName && newName.trim() && newName !== currentList && !todos[newName]) {
            const oldName = currentList;
            const oldTodos = { ...todos };  // Keep a full backup
            
            try {
                // Update the data structure
                todos[newName] = todos[currentList];
                delete todos[currentList];
                currentList = newName;
                
                // Update UI
                updateListSelector();
                
                // Save changes
                await saveTodos();
                toastManager.show('List renamed');
            } catch (error) {
                // Revert all changes on failure
                todos = oldTodos;
                currentList = oldName;
                updateListSelector();
                toastManager.show('Failed to save list name change', 'error', false, 5000);
            }
        }
    }

    async function deleteList(listId) {
        // Don't allow deleting the last list or List 1
        if (Object.keys(todos).length <= 1 || listId === 'List 1') {
            toastManager.show('Cannot delete this list', 'error');
            return;
        }

        if (confirm(`Are you sure you want to delete "${listId}" and all its tasks?`)) {
            const oldTodos = { ...todos };
            try {
                // Remove the list
                delete todos[listId];
                
                // If we're deleting the current list, switch to another one
                if (listId === currentList) {
                    currentList = Object.keys(todos)[0];
                }
                
                // Update UI
                updateListSelector();
                renderTodos();
                
                // Save changes
                await saveTodos();
                toastManager.show('List deleted');
            } catch (error) {
                // Revert changes on failure
                todos = oldTodos;
                updateListSelector();
                renderTodos();
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

    // Todo Management
    async function loadTodos() {
        try {
            const response = await fetchWithAuth('/api/todos');
            if (!response.ok) throw new Error('Failed to load todos');
            const data = await response.json();
            initializeLists(data);
            initializeDropdown(); // Initialize dropdown after data is loaded
        } catch (error) {
            toastManager.show('Failed to load todos', 'error', true);
            console.error(error);
        }
    }

    async function saveTodos() {
        try {
            const response = await fetchWithAuth('/api/todos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(todos)
            });
            if (!response.ok) throw new Error('Failed to save todos');
            return true;
        } catch (error) {
            toastManager.show('Failed to save todos', 'error');
            console.error(error);
            throw error;  // Re-throw to handle in calling function
        }
    }

    function createTodoElement(todo) {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        
        // Add drag attributes only for non-completed items
        if (!todo.completed) {
            li.draggable = true;
            li.setAttribute('data-todo-id', todo.text); // Using text as a simple identifier
        }
        
        li.innerHTML = `
            <div class="checkbox-wrapper">
                <input type="checkbox" ${todo.completed ? 'checked' : ''}>
            </div>
            <span class="todo-text">${linkifyText(todo.text)}</span>
            <button class="delete-btn" aria-label="Delete todo">×</button>
        `;

        const checkbox = li.querySelector('input');
        const checkboxWrapper = li.querySelector('.checkbox-wrapper');
        const todoText = li.querySelector('.todo-text');
        
        // Add click handler to the wrapper
        checkboxWrapper.addEventListener('click', (e) => {
            // Only trigger if clicking the wrapper (not the checkbox directly)
            if (e.target === checkboxWrapper) {
                checkbox.checked = !checkbox.checked;
                todo.completed = checkbox.checked;
                renderTodos();
                saveTodos();
                toastManager.show(todo.completed ? 'Task completed! 🎉' : 'Task uncompleted');
            }
        });
        
        checkbox.addEventListener('change', () => {
            todo.completed = checkbox.checked;
            renderTodos();
            saveTodos();
            toastManager.show(todo.completed ? 'Task completed! 🎉' : 'Task uncompleted');
        });

        // Make text editable on click
        todoText.addEventListener('click', (e) => {
            // Don't trigger edit if clicking a link
            if (e.target.tagName === 'A') return;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = todo.text;
            input.className = 'edit-input';
            
            const originalText = todoText.innerHTML;
            todoText.replaceWith(input);
            input.focus();
            
            function saveEdit() {
                const newText = input.value.trim();
                if (newText && newText !== todo.text) {
                    todo.text = newText;
                    renderTodos();
                    saveTodos();
                    toastManager.show('Task updated');
                } else {
                    input.replaceWith(todoText);
                    todoText.innerHTML = originalText;
                }
            }
            
            input.addEventListener('blur', saveEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEdit();
                } else if (e.key === 'Escape') {
                    input.replaceWith(todoText);
                    todoText.innerHTML = originalText;
                }
            });
        });

        const deleteBtn = li.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete "${todo.text}"?`)) {
                li.remove();
                todos[currentList] = todos[currentList].filter(t => t !== todo);
                saveTodos();
                toastManager.show('Task deleted', 'error');
            }
        });

        // Add drag and drop event listeners for non-completed items
        if (!todo.completed) {
            li.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', todo.text);
                li.classList.add('dragging');
                // Set a custom drag image (optional)
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
                if (draggingItem && !li.classList.contains('dragging') && !todo.completed) {
                    const items = [...todoList.querySelectorAll('.todo-item:not(.completed)')];
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
                        
                        // Update the todos array to match the new order
                        const activeTodos = todos[currentList].filter(t => !t.completed);
                        const completedTodos = todos[currentList].filter(t => t.completed);
                        const newOrder = [...document.querySelectorAll('.todo-item:not(.completed)')].map(item => {
                            return activeTodos.find(t => t.text === item.getAttribute('data-todo-id'));
                        });
                        todos[currentList] = [...newOrder, ...completedTodos];
                        saveTodos();
                    }
                }
            });
        }

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

    function renderTodos() {
        todoList.innerHTML = '';
        const currentTodos = todos[currentList] || [];
        
        // Separate todos into active and completed
        const activeTodos = currentTodos.filter(todo => !todo.completed);
        const completedTodos = currentTodos.filter(todo => todo.completed);
        
        // Create a container for active todos
        const activeTodosContainer = document.createElement('div');
        activeTodosContainer.className = 'active-todos';
        activeTodosContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            if (draggingItem) {
                const items = [...activeTodosContainer.querySelectorAll('.todo-item')];
                if (items.length === 0) {
                    activeTodosContainer.appendChild(draggingItem);
                }
            }
        });
        todoList.appendChild(activeTodosContainer);
        
        // Render active todos
        activeTodos.forEach(todo => {
            activeTodosContainer.appendChild(createTodoElement(todo));
        });
        
        // Add divider if there are both active and completed todos
        if (activeTodos.length > 0 && completedTodos.length > 0) {
            const divider = document.createElement('li');
            divider.className = 'todo-divider';
            divider.textContent = 'Completed';
            todoList.appendChild(divider);
        }
        
        // Render completed todos
        completedTodos.forEach(todo => {
            todoList.appendChild(createTodoElement(todo));
        });
    }

    // Event Listeners
    todoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = todoInput.value.trim();
        
        if (text) {
            const todo = { text, completed: false };
            todos[currentList].push(todo);
            renderTodos();
            saveTodos();
            todoInput.value = '';
            toastManager.show('Task added');
        }
    });

    // Clear completed tasks
    clearCompletedBtn.addEventListener('click', () => {
        const currentTodos = todos[currentList];
        const completedCount = currentTodos.filter(todo => todo.completed).length;
        
        if (completedCount === 0) {
            toastManager.show('No completed tasks to clear');
            return;
        }
        
        if (confirm(`Are you sure you want to delete ${completedCount} completed task${completedCount === 1 ? '' : 's'}?`)) {
            todos[currentList] = currentTodos.filter(todo => !todo.completed);
            renderTodos();
            saveTodos();
            toastManager.show(`Cleared ${completedCount} completed task${completedCount === 1 ? '' : 's'}`);
        }
    });

    const initialize = async () => {
        fetch(`api/config`)
            .then(resp => resp.json())
            .then(config => {
                if (config.error) {
                    throw new Error(config.error);
                }

                document.getElementById('page-title').textContent = config.siteTitle;
                document.getElementById('header-title').textContent = config.siteTitle;
                if (listControls) listControls.style.display = config.singleList ? 'none' : '';

                loadTodos();
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
