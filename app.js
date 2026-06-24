const API_BASE = (window.BLUE_MIND_DOCS_API_URL || "").replace(/\/$/, "");

const state = {
  view: "landing",
  folders: [],
  pagesByFolder: new Map(),
  selectedFolderId: null,
  selectedPageId: null,
  selectedBlockId: null,
  saveTimer: null,
  user: null,
  focusMode: false,
  shareOpen: false,
  currentShare: null
};

const els = {
  appRoot: document.querySelector("#appRoot"),
  headerActionButton: document.querySelector("#headerActionButton"),
  headerShareButton: document.querySelector("#headerShareButton"),
  headerFocusButton: document.querySelector("#headerFocusButton"),
  sharePopover: document.querySelector("#sharePopover"),
  brandButton: document.querySelector("#brandButton"),
  folderDialog: document.querySelector("#folderDialog"),
  folderForm: document.querySelector("#folderForm"),
  folderNameInput: document.querySelector("#folderNameInput"),
  pageDialog: document.querySelector("#pageDialog"),
  pageForm: document.querySelector("#pageForm"),
  pageNameInput: document.querySelector("#pageNameInput")
};

function authHeaders(extra = {}) {
  return extra;
}

function createBlockId() {
  return crypto.randomUUID();
}

function currentFolder() {
  return state.folders.find((folder) => folder.id === state.selectedFolderId) || null;
}

function currentPages() {
  return state.pagesByFolder.get(state.selectedFolderId) || [];
}

function currentPage() {
  return currentPages().find((page) => page.id === state.selectedPageId) || null;
}

function normalizeContent(content) {
  if (Array.isArray(content)) return content;
  if (content && Array.isArray(content.blocks)) return content.blocks;
  return [];
}

async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: isForm ? authHeaders(options.headers || {}) : authHeaders({ "content-type": "application/json", ...(options.headers || {}) }),
    body: isForm ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error?.message || "Request failed");
  return payload?.data ?? null;
}

function setView(view) {
  state.view = view;
  render();
}

function setHeaderAction(label, handler) {
  const showEditorActions = state.view === "editor" && !state.focusMode;
  els.headerActionButton.hidden = !label;
  els.headerActionButton.textContent = label || "";
  els.headerActionButton.onclick = handler || null;
  els.headerShareButton.hidden = !showEditorActions;
  els.headerFocusButton.hidden = !showEditorActions;
  els.sharePopover.hidden = !state.shareOpen || !showEditorActions;
  els.sharePopover.innerHTML = renderSharePopover();
  document.body.classList.toggle("focus-mode", state.focusMode);
}

function render() {
  if (state.view === "landing") renderLanding();
  if (state.view === "auth") renderAuth();
  if (state.view === "welcome") renderWelcome();
  if (state.view === "dashboard" || state.view === "folder" || state.view === "editor") renderWorkspace();
}

function renderLanding() {
  setHeaderAction("Start", startFlow);
  els.appRoot.innerHTML = `
    <section class="landing-hero landing-section">
      <div>
        <p class="eyebrow">Document workspace</p>
        <h1 class="hero-title">Write, organize, and shape your ideas in BlueMind Docs.</h1>
        <p class="hero-copy">A calm writing space for folders, pages, rich text, and images. Built for focused documents inside the same BlueMind ecosystem.</p>
        <div class="hero-actions">
          <button class="primary-button" data-action="start">Start</button>
          <button class="secondary-button" data-action="features">Explore features</button>
        </div>
        <div class="trust-row">Autosave, structured folders, and persistent image-backed pages.</div>
      </div>
      <div class="hero-preview" aria-hidden="true">
        <div class="preview-top"><span class="preview-dot"></span><span class="preview-dot"></span><span class="preview-dot"></span></div>
        <div class="preview-body">
          <div class="preview-rail"><div class="preview-chip"></div><div class="preview-chip"></div><div class="preview-chip"></div></div>
          <div class="preview-page">
            <div class="preview-line title"></div>
            <div class="preview-line"></div>
            <div class="preview-line"></div>
            <div class="preview-line short"></div>
            <div class="preview-image"></div>
          </div>
        </div>
      </div>
    </section>
    <section id="features" class="page-band landing-section">
      <div class="section-inner">
        <div class="section-heading">
          <h2>A document product in the BlueMind family.</h2>
          <p class="section-copy">BlueMind Docs uses the same clean rhythm and premium interface language as BlueMind AI, focused entirely on writing and organization.</p>
        </div>
        <div class="card-grid">
          <article class="product-card"><div class="card-icon">F</div><h3>Folders that keep work clear</h3><p>Create spaces for projects, research, notes, drafts, and client documents.</p></article>
          <article class="product-card"><div class="card-icon">P</div><h3>Pages built from blocks</h3><p>Add headings, text, and images as flexible blocks that autosave to the backend.</p></article>
          <article class="product-card"><div class="card-icon">S</div><h3>Focused writing controls</h3><p>Edit typography, alignment, spacing, and image properties without clutter.</p></article>
        </div>
      </div>
    </section>
    <section class="page-band alt landing-section">
      <div class="section-inner">
        <div class="section-heading"><h2>How it works</h2><p class="section-copy">A simple path from first visit to a saved document.</p></div>
        <div class="steps">
          <article class="product-card"><div class="step-number">1</div><h3>Start your workspace</h3><p>Sign in or create a lightweight account for this Docs workspace.</p></article>
          <article class="product-card"><div class="step-number">2</div><h3>Create a folder</h3><p>Organize your work before writing so every page has a clear home.</p></article>
          <article class="product-card"><div class="step-number">3</div><h3>Write and autosave</h3><p>Add blocks, edit styles, upload images, and keep everything persisted.</p></article>
        </div>
      </div>
    </section>
    <section class="page-band landing-section">
      <div class="final-cta">
        <h2>Start a cleaner document workspace.</h2>
        <p class="section-copy">Create your first folder and page, then move directly into the editor.</p>
        <button class="primary-button" data-action="start">Start</button>
      </div>
    </section>
  `;
}

function renderAuth() {
  setHeaderAction("Start", submitAuthFromHeader);
  els.appRoot.innerHTML = `
    <section class="auth-screen">
      <form class="auth-card" id="authForm">
        <h1>Login / Create Account</h1>
        <p class="muted-copy">Use a simple workspace identity for now. The database is already structured for real authentication later.</p>
        <div class="form-grid">
          <label>Name<input id="authName" type="text" autocomplete="name" placeholder="Your name" /></label>
          <label>Email<input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" required /></label>
          <label>Password<input id="authPassword" type="password" autocomplete="current-password" placeholder="At least 8 characters" required /></label>
          <button class="primary-button" type="submit" data-auth-mode="register">Create Account</button>
          <button class="secondary-button" type="submit" data-auth-mode="login">Login</button>
        </div>
      </form>
    </section>
  `;
}

function renderWelcome() {
  setHeaderAction("Create Folder", openFolderDialog);
  els.appRoot.innerHTML = `
    <section class="welcome-screen">
      <div class="welcome-card">
        <p class="eyebrow">Welcome</p>
        <h1>Welcome to BlueMind Docs</h1>
        <p class="muted-copy">Create folders, add pages, write with block-based content, upload images, and let autosave keep your work in sync with the backend.</p>
        <button class="primary-button" data-action="create-folder">Create Folder</button>
      </div>
    </section>
  `;
}

function workspaceShell(content) {
  return `<section class="workspace-shell">${renderWorkspaceSidebar()}<div class="workspace-main">${content}</div></section>`;
}

function renderWorkspaceSidebar() {
  const initial = state.user?.name?.trim()?.charAt(0)?.toUpperCase() || state.user?.email?.charAt(0)?.toUpperCase() || "M";
  return `<aside class="workspace-sidebar" aria-label="Workspace navigation">
    <div class="sidebar-nav">
      <button class="sidebar-item ${state.view === "dashboard" || state.view === "welcome" ? "active" : ""}" data-action="dashboard" type="button"><span>Dashboard</span></button>
      <button class="sidebar-item ${state.view === "folder" ? "active" : ""}" data-action="dashboard" type="button"><span>Folders</span></button>
    </div>
    <div class="sidebar-bottom">
      <button class="sidebar-item" type="button"><span>Settings</span></button>
      <button class="sidebar-item" type="button"><span>Dark Mode</span></button>
      <div class="sidebar-profile" aria-label="User profile">${escapeHtml(initial)}</div>
    </div>
  </aside>`;
}
async function renderWorkspace() {
  const folder = currentFolder();
  const page = currentPage();
  const showEditor = state.view === "editor" && folder && page;

  if (!showEditor) {
    setHeaderAction(state.view === "folder" ? "New Page" : "Create Folder", state.view === "folder" ? openPageDialog : openFolderDialog);
    els.appRoot.innerHTML = workspaceShell(folder ? renderFolderView(folder) : renderDashboardView());
    return;
  }

  setHeaderAction("", null);

  els.appRoot.innerHTML = `
    <section class="editor-layout">
      <aside class="left-panel">
        <div class="panel-section">
          <div class="section-head"><span>Add blocks</span></div>
          <button class="tool-button" data-add-block="heading">Add Heading</button>
          <button class="tool-button" data-add-block="text">Add Text</button>
          <label class="tool-button file-tool">Add Image<input id="imageInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" /></label>
        </div>
      </aside>
      <main class="center-stage">
        <div class="editor-meta">
          <button class="text-button" data-action="back-folder">${escapeHtml(folder.name)}</button>
          <span id="saveStatus" class="save-status">Saved</span>
        </div>
        ${renderEditorSurface(page)}
      </main>
      <aside class="right-panel">
        <div class="panel-section">
          <div class="section-head"><span>Properties</span></div>
          <div id="propertiesPanel" class="properties-panel muted-copy">Select a block to edit its properties.</div>
        </div>
      </aside>
    </section>
  `;

  renderProperties();
}

function renderDashboardView() {
  return `
    <section class="workspace-page">
      <div class="workspace-intro">
        <p class="eyebrow">Workspace</p>
        <h1>Welcome to BlueMind Docs</h1>
        <p>Create folders, organize your pages, and start writing.</p>
      </div>
      ${state.folders.length ? `
        <div class="folder-grid">
          ${state.folders.map((folder) => `
            <button class="folder-card" data-folder-id="${folder.id}">
              <span>${escapeHtml(folder.name)}</span>
              <small>${new Date(folder.updatedAt).toLocaleDateString()}</small>
            </button>
          `).join("")}
        </div>
      ` : `
        <div class="empty-card">
          <h2>Create your first folder</h2>
          <p>Start with a workspace for notes, drafts, research, or documents.</p>
          <button class="primary-button" data-action="create-folder">Create Folder</button>
        </div>
      `}
    </section>
  `;
}

function renderFolderView(folder) {
  const pages = currentPages();
  return `
    <section class="workspace-page">
      <div class="folder-header">
        <button class="text-button" data-action="dashboard">Dashboard</button>
        <div>
          <p class="eyebrow">Folder</p>
          <h1>${escapeHtml(folder.name)}</h1>
        </div>
      </div>
      ${pages.length ? `
        <div class="page-grid">
          ${pages.map((page) => `
            <button class="page-card" data-page-id="${page.id}">
              <span>${escapeHtml(page.title)}</span>
              <small>${new Date(page.updatedAt).toLocaleDateString()}</small>
            </button>
          `).join("")}
        </div>
      ` : `
        <div class="empty-card">
          <h2>No pages yet</h2>
          <p>Create the first page in this folder.</p>
          <button class="primary-button" data-action="create-page">Create Page</button>
        </div>
      `}
    </section>
  `;
}

function renderFolderItems() {
  if (!state.folders.length) return `<div class="muted-copy">No folders yet</div>`;
  return state.folders.map((folder) => `
    <button class="folder-item ${folder.id === state.selectedFolderId ? "active" : ""}" data-folder-id="${folder.id}">${escapeHtml(folder.name)}</button>
  `).join("");
}

function renderFolderSurface(folder) {
  if (!folder) {
    return `<section class="workspace-home"><div class="workspace-empty"><div><p class="empty-title">No folders yet</p><p class="empty-copy">Create your first folder</p></div></div></section>`;
  }
  const pages = currentPages();
  return `
    <section class="workspace-home">
      <div class="folder-view-head"><div><p class="eyebrow">Pages</p><h3 class="empty-title">${escapeHtml(folder.name)}</h3></div><button class="primary-button" data-action="create-page">New Page</button></div>
      ${pages.length ? `<div class="page-list">${pages.map((page) => `<button class="page-item ${page.id === state.selectedPageId ? "active" : ""}" data-page-id="${page.id}">${escapeHtml(page.title)}</button>`).join("")}</div>` : `<div class="folder-empty"><div><p class="empty-title">No pages yet</p><p class="empty-copy">Create your first page</p></div></div>`}
    </section>
  `;
}

function renderEditorSurface(page) {
  const blocks = normalizeContent(page.content);
  return `<section class="document-surface">${state.focusMode ? `<button class="focus-exit-button" data-action="exit-focus" aria-label="Exit focus mode">X</button>` : ""}<article id="paper" class="paper" aria-label="Document paper"><input id="pageTitleInput" class="paper-title-input" type="text" value="${escapeAttribute(page.title)}" aria-label="Page title" placeholder="Untitled" /><div class="paper-body">${blocks.length ? blocks.map(renderBlock).join("") : `<button class="blank-paper-prompt" data-action="start-writing">Start writing...</button>`}</div></article></section>`;
}

function renderBlock(block) {
  const styles = block.styles || {};
  const common = `data-block-id="${block.id}" class="block ${block.id === state.selectedBlockId ? "selected" : ""}" style="text-align:${styles.align || "left"};"`;
  if (block.type === "image") {
    const width = Number(styles.width || 400);
    const height = styles.height ? `height:${Number(styles.height)}px;` : "";
    const justify = styles.align === "center" ? "center" : styles.align === "right" ? "flex-end" : "flex-start";
    return `<div ${common}><div class="image-block-inner" style="justify-content:${justify};"><img src="${escapeAttribute(block.url)}" alt="${escapeAttribute(block.alt || "Document image")}" style="width:${width}px;${height}border-radius:${Number(styles.borderRadius || 0)}px;" /></div></div>`;
  }
  const fontSize = Number(styles.fontSize || (block.type === "heading" ? 32 : 16));
  const color = styles.color || "#1A232E";
  const bold = styles.bold ? 700 : block.type === "heading" ? 760 : 400;
  const italic = styles.italic ? "italic" : "normal";
  const lineHeight = styles.lineHeight || (block.type === "text" ? 1.55 : 1.18);
  if (block.type === "heading") {
    return `<div ${common}><input type="text" data-text-input="${block.id}" value="${escapeAttribute(block.text || "")}" placeholder="Heading" style="font-size:${fontSize}px;color:${color};font-weight:${bold};font-style:${italic};line-height:${lineHeight};" /></div>`;
  }
  return `<div ${common}><textarea data-text-input="${block.id}" rows="4" placeholder="Start writing..." style="font-size:${fontSize}px;color:${color};font-weight:${bold};font-style:${italic};line-height:${lineHeight};">${escapeHtml(block.text || "")}</textarea></div>`;
}
function renderProperties() {
  const panel = document.querySelector("#propertiesPanel");
  const page = currentPage();
  const block = page?.content.find((item) => item.id === state.selectedBlockId);
  if (!panel) return;
  if (!block) {
    panel.className = "properties-panel muted-copy";
    panel.textContent = "Select a block to edit its properties.";
    return;
  }

  panel.className = "properties-panel";
  if (block.type === "image") {
    const styles = block.styles || {};
    panel.innerHTML = `${numberControl("Width", "width", styles.width || 400, 80, 760)}${numberControl("Height", "height", styles.height || "", 80, 1000)}${numberControl("Border radius", "borderRadius", styles.borderRadius || 0, 0, 80)}${alignmentControl(styles.align || "center")}<button class="danger-button" data-delete-block="${block.id}">Delete image</button>`;
    return;
  }

  const styles = block.styles || {};
  const isText = block.type === "text";
  panel.innerHTML = `${numberControl("Font size", "fontSize", styles.fontSize || (block.type === "heading" ? 32 : 16), 10, 96)}${colorControl("Text color", "color", styles.color || "#1A232E")}${toggleControl("bold", "Bold", Boolean(styles.bold))}${toggleControl("italic", "Italic", Boolean(styles.italic))}${alignmentControl(styles.align || "left")}${isText ? numberControl("Line spacing", "lineHeight", styles.lineHeight || 1.55, 1, 3, 0.05) : ""}`;
}

function numberControl(label, key, value, min, max, step = 1) {
  return `<div class="control-group"><label>${label}</label><input type="number" data-style-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}" /></div>`;
}
function colorControl(label, key, value) {
  return `<div class="control-group"><label>${label}</label><input type="color" data-style-key="${key}" value="${value}" /></div>`;
}
function toggleControl(key, label, active) {
  return `<div class="control-group"><label>${label}</label><button class="segment-button ${active ? "active" : ""}" data-toggle-style="${key}" type="button">${active ? "On" : "Off"}</button></div>`;
}
function alignmentControl(value) {
  return `<div class="control-group"><label>Alignment</label><div class="align-row">${["left", "center", "right"].map((align) => `<button class="segment-button ${value === align ? "active" : ""}" data-align="${align}" type="button">${align}</button>`).join("")}</div></div>`;
}

async function loadCurrentUser() {
  try {
    const result = await api("/api/auth/me");
    state.user = result.user;
  } catch {
    state.user = null;
  }
}

function renderSharePopover() {
  if (state.view !== "editor") return "";
  const share = state.currentShare;
  const copyLabel = share?.url ? "Copy Link" : "Create Link";
  const privacyLabel = share?.isPrivate ? "Private Document" : "Shared Link Active";
  return `
    <button type="button" data-share-action="copy">${copyLabel}<span>Link</span></button>
    <button type="button" data-share-action="private">Private Document<span>${privacyLabel}</span></button>
    <div class="share-line">Future sharing options<span>Soon</span></div>
  `;
}

async function loadShareState() {
  const page = currentPage();
  if (!page) return null;
  state.currentShare = await api(`/api/pages/${page.id}/share`);
  return state.currentShare;
}

async function createShareLink() {
  const page = currentPage();
  if (!page) return null;
  state.currentShare = await api(`/api/pages/${page.id}/share`, { method: "POST", body: {} });
  return state.currentShare;
}

async function copyShareLink() {
  const share = state.currentShare?.url ? state.currentShare : await createShareLink();
  if (!share?.url) return;
  await navigator.clipboard.writeText(share.url);
  state.shareOpen = true;
  renderWorkspace();
}

async function makePrivateDocument() {
  const page = currentPage();
  if (!page) return;
  state.currentShare = await api(`/api/pages/${page.id}/share`, { method: "PATCH", body: { isPrivate: true } });
  state.shareOpen = true;
  renderWorkspace();
}
async function startFlow() {
  await loadCurrentUser();
  if (!state.user) return setView("auth");
  await loadFolders();
  setView(state.folders.length ? "dashboard" : "welcome");
}

function submitAuthFromHeader() {
  const form = document.querySelector("#authForm");
  if (form) form.requestSubmit();
  else startFlow();
}

async function loadFolders() {
  if (!state.user) return;
  state.folders = await api("/api/folders");
}

async function loadPages(folderId) {
  const pages = await api(`/api/folders/${folderId}/pages`);
  state.pagesByFolder.set(folderId, pages.map((page) => ({ ...page, content: normalizeContent(page.content) })));
}

async function showDashboard() {
  state.selectedFolderId = null;
  state.selectedPageId = null;
  state.selectedBlockId = null;
  state.focusMode = false;
  state.shareOpen = false;
  await loadFolders();
  setView(state.folders.length ? "dashboard" : "welcome");
}

async function refreshWorkspace() {
  await loadCurrentUser();
  if (!state.user) return setView("auth");
  await loadFolders();
  if (state.selectedFolderId && state.folders.some((folder) => folder.id === state.selectedFolderId)) {
    await loadPages(state.selectedFolderId);
    if (state.selectedPageId) {
      const page = await api(`/api/pages/${state.selectedPageId}`);
      const pages = currentPages().map((item) => item.id === state.selectedPageId ? { ...page, content: normalizeContent(page.content) } : item);
      state.pagesByFolder.set(state.selectedFolderId, pages);
      return setView("editor");
    }
    return setView("folder");
  }
  setView(state.folders.length ? "dashboard" : "welcome");
}
async function selectFolder(folderId) {
  state.selectedFolderId = folderId;
  state.selectedPageId = null;
  state.selectedBlockId = null;
  await loadPages(folderId);
  setView("folder");
}

async function selectPage(pageId) {
  state.selectedPageId = pageId;
  state.selectedBlockId = null;
  state.focusMode = false;
  state.shareOpen = false;
  state.currentShare = null;
  const page = await api(`/api/pages/${pageId}`);
  const pages = currentPages().map((item) => item.id === pageId ? { ...page, content: normalizeContent(page.content) } : item);
  state.pagesByFolder.set(state.selectedFolderId, pages);
  await loadShareState();
  setView("editor");
}

function openFolderDialog() {
  if (!state.user) return setView("auth");
  els.folderNameInput.value = "";
  els.folderDialog.showModal();
  els.folderNameInput.focus();
}

function openPageDialog() {
  if (!state.selectedFolderId) return;
  els.pageNameInput.value = "";
  els.pageDialog.showModal();
  els.pageNameInput.focus();
}

function setSaveStatus(value) {
  const saveStatus = document.querySelector("#saveStatus");
  if (!saveStatus) return;
  saveStatus.textContent = value;
  saveStatus.dataset.status = value.toLowerCase();
}

function updateSelectedBlock(updater) {
  const page = currentPage();
  if (!page || !state.selectedBlockId) return;
  page.content = page.content.map((block) => block.id === state.selectedBlockId ? updater(block) : block);
  renderWorkspace();
  scheduleContentSave();
}

function addBlock(type, imageData = null) {
  const page = currentPage();
  if (!page) return;
  const baseStyles = { color: "#1A232E", align: "left" };
  let block;
  if (type === "heading") block = { id: createBlockId(), type, text: "New heading", styles: { ...baseStyles, fontSize: 32, bold: true } };
  else if (type === "image") block = { id: createBlockId(), type, url: imageData.url, imageId: imageData.id, alt: imageData.fileName, styles: { width: 400, borderRadius: 8, align: "center" } };
  else block = { id: createBlockId(), type: "text", text: "New paragraph", styles: { ...baseStyles, fontSize: 16, lineHeight: 1.55 } };
  page.content = [...page.content, block];
  state.selectedBlockId = block.id;
  renderWorkspace();
  setTimeout(() => document.querySelector(`[data-text-input="${block.id}"]`)?.focus(), 0);
  scheduleContentSave();
}

function scheduleContentSave() {
  clearTimeout(state.saveTimer);
  setSaveStatus("Saving...");
  state.saveTimer = setTimeout(saveCurrentPageContent, 700);
}

async function saveCurrentPageContent() {
  const page = currentPage();
  if (!page) return;
  try {
    const saved = await api(`/api/pages/${page.id}/content`, { method: "PATCH", body: { content: page.content } });
    const pages = currentPages().map((item) => item.id === page.id ? { ...saved, content: normalizeContent(saved.content) } : item);
    state.pagesByFolder.set(state.selectedFolderId, pages);
    setSaveStatus("Saved");
  } catch (error) {
    setSaveStatus("Error saving");
    console.error(error);
  }
}

function scheduleTitleSave() {
  const page = currentPage();
  const input = document.querySelector("#pageTitleInput");
  if (!page || !input) return;
  page.title = input.value.trim() || "Untitled";
  clearTimeout(state.saveTimer);
  setSaveStatus("Saving...");
  state.saveTimer = setTimeout(saveCurrentPageTitle, 700);
}

async function saveCurrentPageTitle() {
  const page = currentPage();
  if (!page) return;
  try {
    const saved = await api(`/api/pages/${page.id}`, { method: "PATCH", body: { title: page.title } });
    const pages = currentPages().map((item) => item.id === page.id ? { ...item, ...saved, content: item.content } : item);
    state.pagesByFolder.set(state.selectedFolderId, pages);
    setSaveStatus("Saved");
  } catch (error) {
    setSaveStatus("Error saving");
    console.error(error);
  }
}

async function uploadImage(file) {
  const page = currentPage();
  if (!page || !file) return;
  setSaveStatus("Saving...");
  const formData = new FormData();
  formData.append("pageId", page.id);
  formData.append("image", file);
  formData.append("altText", file.name);
  try {
    const image = await api("/api/uploads/image", { method: "POST", body: formData });
    addBlock("image", image);
  } catch (error) {
    setSaveStatus("Error saving");
    console.error(error);
    alert(error.message);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}
function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#039;");
}

els.brandButton.addEventListener("click", refreshWorkspace);

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
});

els.folderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = els.folderNameInput.value.trim();
  if (!name) return;
  const folder = await api("/api/folders", { method: "POST", body: { name } });
  state.folders = [folder, ...state.folders];
  els.folderDialog.close();
  await selectFolder(folder.id);
});

els.pageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = els.pageNameInput.value.trim();
  if (!title || !state.selectedFolderId) return;
  const page = await api(`/api/folders/${state.selectedFolderId}/pages`, { method: "POST", body: { title, content: [] } });
  const pages = [{ ...page, content: normalizeContent(page.content) }, ...currentPages()];
  state.pagesByFolder.set(state.selectedFolderId, pages);
  els.pageDialog.close();
  await selectPage(page.id);
});

els.appRoot.addEventListener("submit", async (event) => {
  if (event.target.id !== "authForm") return;
  event.preventDefault();
  const submitter = event.submitter;
  const mode = submitter?.dataset.authMode || "register";
  const name = document.querySelector("#authName").value.trim();
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
  const body = mode === "login" ? { email, password } : { name, email, password };
  try {
    const result = await api(path, { method: "POST", body });
    state.user = result.user;
    await loadFolders();
    setView(state.folders.length ? "dashboard" : "welcome");
  } catch (error) {
    alert(error.message);
  }
});

els.appRoot.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "start") return startFlow();
  if (action === "features") return document.querySelector("#features")?.scrollIntoView({ behavior: "smooth" });
  if (action === "create-folder") return openFolderDialog();
  if (action === "create-page") return openPageDialog();
  if (action === "exit-focus") { state.focusMode = false; return renderWorkspace(); }
  if (action === "dashboard") return showDashboard();
  if (action === "back-folder") return selectFolder(state.selectedFolderId);
  if (action === "start-writing") return addBlock("text");

  const folderButton = event.target.closest("[data-folder-id]");
  if (folderButton) return selectFolder(folderButton.dataset.folderId);

  const pageButton = event.target.closest("[data-page-id]");
  if (pageButton) return selectPage(pageButton.dataset.pageId);

  const block = event.target.closest("[data-block-id]");
  if (block) {
    state.selectedBlockId = block.dataset.blockId;
    if (event.target.closest("[data-text-input]")) {
      renderProperties();
      return;
    }
    renderWorkspace();
  }
});

els.appRoot.addEventListener("input", (event) => {
  if (event.target.id === "pageTitleInput") return scheduleTitleSave();
  const textInput = event.target.closest("[data-text-input]");
  if (textInput) {
    const blockId = textInput.dataset.textInput;
    const page = currentPage();
    const block = page?.content.find((item) => item.id === blockId);
    if (!block) return;
    block.text = textInput.value;
    state.selectedBlockId = blockId;
    scheduleContentSave();
    return;
  }
  const styleInput = event.target.closest("[data-style-key]");
  if (styleInput) {
    const key = styleInput.dataset.styleKey;
    const value = styleInput.type === "number" ? Number(styleInput.value) : styleInput.value;
    updateSelectedBlock((block) => ({ ...block, styles: { ...(block.styles || {}), [key]: value } }));
  }
});

els.appRoot.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-block]");
  if (addButton) return addBlock(addButton.dataset.addBlock);
  const align = event.target.closest("[data-align]");
  if (align) return updateSelectedBlock((block) => ({ ...block, styles: { ...(block.styles || {}), align: align.dataset.align } }));
  const toggle = event.target.closest("[data-toggle-style]");
  if (toggle) {
    const key = toggle.dataset.toggleStyle;
    return updateSelectedBlock((block) => ({ ...block, styles: { ...(block.styles || {}), [key]: !block.styles?.[key] } }));
  }
  const deleteButton = event.target.closest("[data-delete-block]");
  if (deleteButton) {
    const page = currentPage();
    if (!page) return;
    page.content = page.content.filter((block) => block.id !== deleteButton.dataset.deleteBlock);
    state.selectedBlockId = null;
    renderWorkspace();
    scheduleContentSave();
  }
});

els.appRoot.addEventListener("change", (event) => {
  if (event.target.id === "imageInput") uploadImage(event.target.files[0]);
});

render();




els.headerShareButton.addEventListener("click", async () => {
  state.shareOpen = !state.shareOpen;
  if (state.shareOpen && !state.currentShare) await loadShareState();
  renderWorkspace();
});

els.headerFocusButton.addEventListener("click", () => {
  state.focusMode = true;
  state.shareOpen = false;
  renderWorkspace();
});

els.sharePopover.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-share-action]")?.dataset.shareAction;
  if (action === "copy") await copyShareLink();
  if (action === "private") await makePrivateDocument();
});



