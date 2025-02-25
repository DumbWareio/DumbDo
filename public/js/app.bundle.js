// app.js
var todoForm = document.getElementById("todoForm");
var todoInput = document.getElementById("todoInput");
var todoList = document.getElementById("todoList");
var themeToggle = document.getElementById("themeToggle");
var moonIcon = themeToggle.querySelector(".moon");
var sunIcon = themeToggle.querySelector(".sun");
var toast = document.getElementById("toast");
var pinModal = document.getElementById("pinModal");
var pinInputs = [...document.querySelectorAll(".pin-input")];
var pinError = document.getElementById("pinError");
var clearCompletedBtn = document.getElementById("clearCompleted");
var listSelector = document.getElementById("listSelector");
var renameListBtn = document.getElementById("renameList");
var deleteListBtn = document.getElementById("deleteList");
var addListBtn = document.getElementById("addList");
var selectorContainer = listSelector.parentElement;
function handleSelectorClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const customSelect = selectorContainer.querySelector(".custom-select");
  if (customSelect) {
    const isHidden = customSelect.style.display === "none" || !customSelect.style.display;
    customSelect.style.display = isHidden ? "block" : "none";
  }
}
function handleOutsideClick(e) {
  const customSelect = selectorContainer.querySelector(".custom-select");
  if (customSelect && !selectorContainer.contains(e.target)) {
    customSelect.style.display = "none";
  }
}
function handleKeyboard(e) {
  const customSelect = selectorContainer.querySelector(".custom-select");
  if (customSelect) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      customSelect.style.display = customSelect.style.display === "none" ? "block" : "none";
    } else if (e.key === "Escape") {
      customSelect.style.display = "none";
    }
  }
}
function initializeDropdown() {
  listSelector.addEventListener("mousedown", handleSelectorClick);
  document.addEventListener("click", handleOutsideClick);
  listSelector.addEventListener("keydown", handleKeyboard);
}
var todos = {};
var currentList = "List 1";
function initializeLists(data) {
  if (!data || Object.keys(data).length === 0) {
    todos = { "List 1": [] };
    currentList = "List 1";
  } else {
    const convertedData = {};
    Object.entries(data).forEach(([key, value]) => {
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
  const sortedKeys = Object.keys(todos).sort((a, b) => {
    if (a === "List 1") return -1;
    if (b === "List 1") return 1;
    return a.localeCompare(b);
  });
  listSelector.innerHTML = sortedKeys.map(
    (listId) => `<option value="${listId}"${listId === currentList ? " selected" : ""}>${listId}</option>`
  ).join("");
  const customSelect = document.createElement("div");
  customSelect.className = "custom-select";
  customSelect.style.display = "none";
  sortedKeys.forEach((listId) => {
    const item = document.createElement("div");
    item.className = `list-item ${listId === "List 1" ? "list-1" : ""}`;
    item.dataset.value = listId;
    const nameSpan = document.createElement("span");
    nameSpan.textContent = listId;
    item.appendChild(nameSpan);
    if (listId !== "List 1") {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete-btn";
      deleteBtn.setAttribute("aria-label", `Delete ${listId}`);
      deleteBtn.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteList(listId);
      });
      item.appendChild(deleteBtn);
    }
    item.addEventListener("click", () => {
      if (listId !== currentList) {
        switchList(listId);
        customSelect.style.display = "none";
      }
    });
    customSelect.appendChild(item);
  });
  const existingCustomSelect = selectorContainer.querySelector(".custom-select");
  if (existingCustomSelect) {
    const wasVisible = existingCustomSelect.style.display === "block";
    selectorContainer.removeChild(existingCustomSelect);
    if (wasVisible) {
      customSelect.style.display = "block";
    }
  }
  selectorContainer.appendChild(customSelect);
}
function switchList(listId) {
  currentList = listId;
  listSelector.value = listId;
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
  showToast("New list added");
}
async function renameCurrentList() {
  const newName = prompt("Enter new list name:", currentList);
  if (newName && newName.trim() && newName !== currentList && !todos[newName]) {
    const oldName = currentList;
    const oldTodos = { ...todos };
    try {
      todos[newName] = todos[currentList];
      delete todos[currentList];
      currentList = newName;
      updateListSelector();
      await saveTodos();
      showToast("List renamed");
    } catch (error) {
      todos = oldTodos;
      currentList = oldName;
      updateListSelector();
      showToast("Failed to save list name change");
    }
  }
}
async function deleteList(listId) {
  if (Object.keys(todos).length <= 1 || listId === "List 1") {
    showToast("Cannot delete this list");
    return;
  }
  if (confirm(`Are you sure you want to delete "${listId}" and all its tasks?`)) {
    const oldTodos = { ...todos };
    try {
      delete todos[listId];
      if (listId === currentList) {
        currentList = Object.keys(todos)[0];
      }
      updateListSelector();
      renderTodos();
      await saveTodos();
      showToast("List deleted");
    } catch (error) {
      todos = oldTodos;
      updateListSelector();
      renderTodos();
      showToast("Failed to delete list");
    }
  }
}
listSelector.addEventListener("change", (e) => {
  switchList(e.target.value);
});
renameListBtn.addEventListener("click", renameCurrentList);
addListBtn.addEventListener("click", addNewList);
async function fetchWithAuth(url, options = {}) {
  const pin = document.cookie.split("; ").find((row) => row.startsWith("DUMBDO_PIN="))?.split("=")[1];
  const headers = {
    ...options.headers,
    "Accept": "application/json"
  };
  if (pin) {
    headers["x-pin"] = pin;
  }
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include"
    // Include cookies in the request
  });
  if (response.status === 401) {
    const data = await response.json();
    window.location.href = data.loginUrl || "/login";
    throw new Error("Authentication required");
  }
  return response;
}
function updateThemeIcons() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  moonIcon.style.display = isDark ? "none" : "block";
  sunIcon.style.display = isDark ? "block" : "none";
}
document.addEventListener("DOMContentLoaded", updateThemeIcons);
themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcons();
});
function showToast(message, duration = 3e3) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}
async function loadTodos() {
  try {
    const response = await fetchWithAuth("/api/todos");
    if (!response.ok) throw new Error("Failed to load todos");
    const data = await response.json();
    initializeLists(data);
    initializeDropdown();
  } catch (error) {
    showToast("Failed to load todos");
    console.error(error);
  }
}
async function saveTodos() {
  try {
    const response = await fetchWithAuth("/api/todos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(todos)
    });
    if (!response.ok) throw new Error("Failed to save todos");
    return true;
  } catch (error) {
    showToast("Failed to save todos");
    console.error(error);
    throw error;
  }
}
function createTodoElement(todo) {
  const li = document.createElement("li");
  li.className = `todo-item ${todo.completed ? "completed" : ""}`;
  if (!todo.completed) {
    li.draggable = true;
    li.setAttribute("data-todo-id", todo.text);
  }
  li.innerHTML = `
        <div class="checkbox-wrapper">
            <input type="checkbox" ${todo.completed ? "checked" : ""}>
        </div>
        <span class="todo-text">${linkifyText(todo.text)}</span>
        <button class="delete-btn" aria-label="Delete todo">\xD7</button>
    `;
  const checkbox = li.querySelector("input");
  const checkboxWrapper = li.querySelector(".checkbox-wrapper");
  const todoText = li.querySelector(".todo-text");
  checkboxWrapper.addEventListener("click", (e) => {
    if (e.target === checkboxWrapper) {
      checkbox.checked = !checkbox.checked;
      todo.completed = checkbox.checked;
      renderTodos();
      saveTodos();
      showToast(todo.completed ? "Task completed! \u{1F389}" : "Task uncompleted");
    }
  });
  checkbox.addEventListener("change", () => {
    todo.completed = checkbox.checked;
    renderTodos();
    saveTodos();
    showToast(todo.completed ? "Task completed! \u{1F389}" : "Task uncompleted");
  });
  todoText.addEventListener("click", (e) => {
    if (e.target.tagName === "A") return;
    const input = document.createElement("input");
    input.type = "text";
    input.value = todo.text;
    input.className = "edit-input";
    const originalText = todoText.innerHTML;
    todoText.replaceWith(input);
    input.focus();
    function saveEdit() {
      const newText = input.value.trim();
      if (newText && newText !== todo.text) {
        todo.text = newText;
        renderTodos();
        saveTodos();
        showToast("Task updated");
      } else {
        input.replaceWith(todoText);
        todoText.innerHTML = originalText;
      }
    }
    input.addEventListener("blur", saveEdit);
    input.addEventListener("keydown", (e2) => {
      if (e2.key === "Enter") {
        e2.preventDefault();
        saveEdit();
      } else if (e2.key === "Escape") {
        input.replaceWith(todoText);
        todoText.innerHTML = originalText;
      }
    });
  });
  const deleteBtn = li.querySelector(".delete-btn");
  deleteBtn.addEventListener("click", () => {
    li.remove();
    todos[currentList] = todos[currentList].filter((t) => t !== todo);
    saveTodos();
    showToast("Task deleted");
  });
  if (!todo.completed) {
    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", todo.text);
      li.classList.add("dragging");
      const dragImage = li.cloneNode(true);
      dragImage.style.position = "absolute";
      dragImage.style.top = "-1000px";
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      const draggingItem = document.querySelector(".dragging");
      if (draggingItem && !li.classList.contains("dragging") && !todo.completed) {
        const items = [...todoList.querySelectorAll(".todo-item:not(.completed)")];
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
          const activeTodos = todos[currentList].filter((t) => !t.completed);
          const completedTodos = todos[currentList].filter((t) => t.completed);
          const newOrder = [...document.querySelectorAll(".todo-item:not(.completed)")].map((item) => {
            return activeTodos.find((t) => t.text === item.getAttribute("data-todo-id"));
          });
          todos[currentList] = [...newOrder, ...completedTodos];
          saveTodos();
        }
      }
    });
  }
  return li;
}
function linkifyText(text) {
  const urlRegex = /(https?:\/\/[^\s)]+)([)\s]|$)/g;
  return text.replace(urlRegex, (match, url, endChar) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${endChar}`;
  });
}
function renderTodos() {
  todoList.innerHTML = "";
  const currentTodos = todos[currentList] || [];
  const activeTodos = currentTodos.filter((todo) => !todo.completed);
  const completedTodos = currentTodos.filter((todo) => todo.completed);
  const activeTodosContainer = document.createElement("div");
  activeTodosContainer.className = "active-todos";
  activeTodosContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    const draggingItem = document.querySelector(".dragging");
    if (draggingItem) {
      const items = [...activeTodosContainer.querySelectorAll(".todo-item")];
      if (items.length === 0) {
        activeTodosContainer.appendChild(draggingItem);
      }
    }
  });
  todoList.appendChild(activeTodosContainer);
  activeTodos.forEach((todo) => {
    activeTodosContainer.appendChild(createTodoElement(todo));
  });
  if (activeTodos.length > 0 && completedTodos.length > 0) {
    const divider = document.createElement("li");
    divider.className = "todo-divider";
    divider.textContent = "Completed";
    todoList.appendChild(divider);
  }
  completedTodos.forEach((todo) => {
    todoList.appendChild(createTodoElement(todo));
  });
}
todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = todoInput.value.trim();
  if (text) {
    const todo = { text, completed: false };
    todos[currentList].push(todo);
    renderTodos();
    saveTodos();
    todoInput.value = "";
    showToast("Task added");
  }
});
clearCompletedBtn.addEventListener("click", () => {
  const currentTodos = todos[currentList];
  const completedCount = currentTodos.filter((todo) => todo.completed).length;
  if (completedCount === 0) {
    showToast("No completed tasks to clear");
    return;
  }
  if (confirm(`Are you sure you want to delete ${completedCount} completed task${completedCount === 1 ? "" : "s"}?`)) {
    todos[currentList] = currentTodos.filter((todo) => !todo.completed);
    renderTodos();
    saveTodos();
    showToast(`Cleared ${completedCount} completed task${completedCount === 1 ? "" : "s"}`);
  }
});
loadTodos();
