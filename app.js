const API_BASE = (window.BLUE_MIND_DOCS_API_URL || "").replace(/\/$/, "");

const state = {
  view: "landing",
  folders: [],
  pagesByFolder: new Map(),
  selectedFolderId: null,
  selectedPageId: null,
  selectedBlockId: null,
  activeNotebookPageId: null,
  saveTimer: null,
  user: null,
  focusMode: false,
  shareOpen: false,
  currentShare: null
};

let pointerInteraction = null;

const els = {
  appRoot: document.querySelector("#appRoot"),
  headerBackButton: document.querySelector("#headerBackButton"),
  headerNotebookTitle: document.querySelector("#headerNotebookTitle"),
  headerActionButton: document.querySelector("#headerActionButton"),
  headerShareButton: document.querySelector("#headerShareButton"),
  headerFocusButton: document.querySelector("#headerFocusButton"),
  headerProfileButton: document.querySelector("#headerProfileButton"),
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

const DRAWING_TOOLS = [
  ["arrow", "Arrow"], ["double-arrow", "Double Arrow"], ["curved-arrow", "Curved Arrow"], ["straight-line", "Straight Line"], ["curved-line", "Curved Line"],
  ["rectangle", "Rectangle"], ["rounded-rectangle", "Rounded Rectangle"], ["circle", "Circle"], ["ellipse", "Ellipse"], ["triangle", "Triangle"], ["diamond", "Diamond"], ["pentagon", "Pentagon"], ["hexagon", "Hexagon"], ["star", "Star"], ["heart", "Heart"],
  ["check", "Check Mark"], ["cross", "Cross Mark"], ["warning", "Warning Sign"], ["info", "Info Icon"], ["like", "Like"], ["dislike", "Dislike"], ["question", "Question Mark"], ["exclamation", "Exclamation Mark"],
  ["speech", "Speech Bubble"], ["comment", "Comment Bubble"], ["callout", "Callout Box"], ["sticky", "Sticky Note"], ["connector", "Connector"], ["free-drawing", "Free Drawing"], ["highlighter", "Highlighter"], ["pen", "Pen"], ["marker", "Marker"],
  ["dashed-line", "Dashed Line"], ["dotted-line", "Dotted Line"], ["numbered-marker", "Numbered Marker"], ["step", "Step Indicator"], ["flowchart", "Flowchart Connector"], ["process-arrow", "Process Arrow"], ["timeline-arrow", "Timeline Arrow"], ["mind-map", "Mind Map Connector"]
];
function currentFolder() {
  return state.folders.find((folder) => folder.id === state.selectedFolderId) || null;
}

function currentPages() {
  return state.pagesByFolder.get(state.selectedFolderId) || [];
}

function currentPage() {
  return currentPages().find((page) => page.id === state.selectedPageId) || null;
}

function createNotebookPage(shape = "portrait", name = "Page") {
  return { id: createBlockId(), name, shape, blocks: [] };
}

function normalizeNotebookBlock(block, index = 0) {
  const type = block?.type === "image" ? "image" : block?.type === "heading" ? "heading" : block?.type === "shape" ? "shape" : "text";
  const defaults = type === "image"
    ? { width: Number(block?.styles?.width || block?.width || 320), height: Number(block?.styles?.height || block?.height || 220) }
    : type === "shape"
      ? { width: Number(block?.width || 180), height: Number(block?.height || 110) }
      : { width: Number(block?.width || 360), height: Number(block?.height || (type === "heading" ? 70 : 130)) };
  return {
    id: block?.id || createBlockId(),
    type,
    shapeKind: block?.shapeKind || block?.kind || "rectangle",
    text: block?.text || (type === "heading" ? "New heading" : type === "text" ? "New text" : ""),
    url: block?.url || "",
    imageId: block?.imageId || null,
    alt: block?.alt || block?.fileName || "Document image",
    x: Number.isFinite(Number(block?.x)) ? Number(block.x) : 80 + (index % 3) * 28,
    y: Number.isFinite(Number(block?.y)) ? Number(block.y) : 80 + index * 34,
    width: defaults.width,
    height: defaults.height,
    rotation: Number(block?.rotation || block?.styles?.rotation || 0),
    styles: { ...(block?.styles || {}) }
  };
}

function normalizeNotebookContent(content) {
  if (content?.type === "notebook" && Array.isArray(content.pages)) {
    const pages = content.pages.length ? content.pages : [createNotebookPage()];
    return {
      type: "notebook",
      pages: pages.map((page, index) => ({
        id: page.id || createBlockId(),
        name: page.name || `Page ${index + 1}`,
        shape: page.shape || "portrait",
        blocks: Array.isArray(page.blocks) ? page.blocks.map(normalizeNotebookBlock) : []
      }))
    };
  }
  const legacyBlocks = Array.isArray(content) ? content : Array.isArray(content?.blocks) ? content.blocks : [];
  return { type: "notebook", pages: [{ id: createBlockId(), name: "Page 1", shape: "portrait", blocks: legacyBlocks.map(normalizeNotebookBlock) }] };
}

function normalizeContent(content) {
  return normalizeNotebookContent(content);
}

function currentNotebook() {
  const page = currentPage();
  if (!page) return null;
  page.content = normalizeNotebookContent(page.content);
  return page.content;
}

function activeNotebookPage() {
  const notebook = currentNotebook();
  if (!notebook) return null;
  let page = notebook.pages.find((item) => item.id === state.activeNotebookPageId);
  if (!page) {
    page = notebook.pages[0] || createNotebookPage();
    if (!notebook.pages.length) notebook.pages.push(page);
    state.activeNotebookPageId = page.id;
  }
  return page;
}

function activeNotebookPageIndex() {
  const notebook = currentNotebook();
  if (!notebook) return 0;
  return Math.max(0, notebook.pages.findIndex((page) => page.id === state.activeNotebookPageId));
}

function selectedNotebookBlock() {
  const page = activeNotebookPage();
  return page?.blocks.find((block) => block.id === state.selectedBlockId) || null;
}

function normalizeImageUrl(url) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
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

function updateHeaderProfile() {
  if (!els.headerProfileButton) return;
  const initial = state.user?.name?.trim()?.charAt(0)?.toUpperCase() || state.user?.email?.charAt(0)?.toUpperCase() || "M";
  els.headerProfileButton.textContent = initial;
}
function setHeaderAction(label, handler) {
  updateHeaderProfile();
  const page = currentPage();
  const showEditorActions = state.view === "editor" && !state.focusMode;
  const actionLabel = showEditorActions ? "Add More Page" : label;
  const actionHandler = showEditorActions ? addNotebookPage : handler;
  els.headerActionButton.hidden = !actionLabel;
  els.headerActionButton.textContent = actionLabel || "";
  els.headerActionButton.onclick = actionHandler || null;
  els.headerShareButton.hidden = !showEditorActions;
  els.headerFocusButton.hidden = !showEditorActions;
  els.headerBackButton.hidden = !(state.view === "folder" || state.view === "editor" || state.view === "dashboard");
  els.headerNotebookTitle.hidden = !showEditorActions;
  if (showEditorActions && page && document.activeElement !== els.headerNotebookTitle) els.headerNotebookTitle.value = page.title || "Untitled";
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
  return `<aside class="workspace-sidebar" aria-label="Workspace navigation">
    <div class="sidebar-nav">
      <button class="sidebar-item sidebar-brand-item ${state.view === "dashboard" || state.view === "welcome" ? "active" : ""}" data-action="dashboard" type="button"><img class="sidebar-brand-icon" src="/assets/bluemind-docs-logo.png" alt="" /><span>Dashboard</span></button>
      <button class="sidebar-item ${state.view === "folder" ? "active" : ""}" data-action="dashboard" type="button"><span>Folders</span></button>
      <button class="sidebar-item" data-action="dashboard" type="button"><span>Pages</span></button>
      <button class="sidebar-item" type="button"><span>Shared</span></button>
    </div>
    <div class="sidebar-bottom">
      <button class="sidebar-item" type="button"><span>Dark Mode</span></button>
      <button class="sidebar-item" type="button"><span>Settings</span></button>
    </div>
  </aside>`;
}
function renderNotebookPagesList() {
  const notebook = currentNotebook();
  if (!notebook) return "";
  return `<div class="notebook-pages-list">${notebook.pages.map((page, index) => `<button class="notebook-page-list-item ${page.id === state.activeNotebookPageId ? "active" : ""}" data-notebook-page-id="${page.id}" type="button"><span>${escapeHtml(page.name || `Page ${index + 1}`)}</span></button>`).join("")}</div>`;
}

function renderDrawingTools() {
  return `<div class="drawing-tool-grid">${DRAWING_TOOLS.map(([kind, label]) => `<button class="drawing-tool-button" data-add-shape="${kind}" type="button"><span class="shape-tool-preview shape-${kind}"></span><span>${escapeHtml(label)}</span></button>`).join("")}</div>`;
}

function renderPageTabs(notebook, activeIndex) {
  return `<div class="page-tab-bar">
    <button class="page-tab-arrow" data-notebook-nav="prev" type="button" aria-label="Previous page" ${activeIndex === 0 ? "disabled" : ""}>‹</button>
    <div class="page-tabs" role="tablist">${notebook.pages.map((page, index) => `<button class="page-tab ${page.id === state.activeNotebookPageId ? "active" : ""}" data-notebook-page-id="${page.id}" type="button" role="tab">${escapeHtml(page.name || `Page ${index + 1}`)}</button>`).join("")}</div>
    <button class="page-tab-arrow" data-notebook-nav="next" type="button" aria-label="Next page" ${activeIndex >= notebook.pages.length - 1 ? "disabled" : ""}>›</button>
  </div>`;
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
      <aside class="left-panel notebook-left-panel">
        <div class="panel-section">
          <div class="section-head"><span>Add Blocks</span></div>
          <button class="tool-button icon-tool" data-add-block="heading">${icon("heading")}<span>Heading</span></button>
          <button class="tool-button icon-tool" data-add-block="text">${icon("text")}<span>Text</span></button>
          <label class="tool-button icon-tool file-tool">${icon("image")}<span>Image</span><input id="imageInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" /></label>
        </div>
        <div class="panel-section">
          <div class="section-head"><span>Page Templates</span></div>
          <button class="template-button" data-page-shape="square">${icon("square")}<span>Square page</span></button>
          <button class="template-button" data-page-shape="portrait">${icon("portrait")}<span>Portrait page</span></button>
          <button class="template-button" data-page-shape="landscape">${icon("landscape")}<span>Landscape page</span></button>
          <button class="template-button" data-page-shape="long">${icon("long")}<span>Long page</span></button>
          <button class="template-button" data-page-shape="wide">${icon("wide")}<span>Wide page</span></button>
        </div>
        <div class="panel-section">
          <div class="section-head"><span>Drawing Tools</span></div>
          ${renderDrawingTools()}
        </div>
        <div class="panel-section">
          <div class="section-head"><span>Notebook</span></div>
          <button class="tool-button icon-tool" data-action="add-notebook-page">${icon("notebook")}<span>New notebook page</span></button>
          <div class="section-subhead">Pages</div>
          ${renderNotebookPagesList()}
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
        <div>
          <p class="eyebrow">Folder</p>
          <h1>${escapeHtml(folder.name)}</h1>
        </div>
      </div>
      <div class="folder-workspace">
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
        <button class="create-page-card" data-action="create-page" type="button">
          <span class="document-illustration" aria-hidden="true"><span></span><span></span><span></span></span>
          <strong>Create Page</strong>
          <small>Create the first page in this folder.</small>
        </button>
      `}
      </div>
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

function icon(name) {
  const icons = {
    heading: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M19 5v14M5 12h14"/></svg>`,
    text: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M8 6v12M16 6v12"/></svg>`,
    image: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7Z"/><path d="m8 16 3-3 2 2 3-4 3 5"/><path d="M9 9h.01"/></svg>`,
    square: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>`,
    portrait: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v16H8z"/></svg>`,
    landscape: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v8H4z"/></svg>`,
    long: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v18H9z"/></svg>`,
    wide: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18v6H3z"/></svg>`,
    notebook: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M9 4v16"/></svg>`
  };
  return icons[name] || icons.text;
}

function pageDimensions(shape = "portrait") {
  const sizes = {
    square: [720, 720],
    portrait: [760, 980],
    landscape: [980, 680],
    long: [720, 1180],
    wide: [1120, 620]
  };
  const [width, height] = sizes[shape] || sizes.portrait;
  return { width, height };
}

function renderEditorSurface(page) {
  const notebook = currentNotebook();
  const notebookPage = activeNotebookPage();
  const index = activeNotebookPageIndex();
  const total = notebook?.pages.length || 1;
  const dims = pageDimensions(notebookPage?.shape);
  return `<section class="notebook-editor-shell">
    ${state.focusMode ? `<button class="focus-exit-button" data-action="exit-focus" aria-label="Exit focus mode">X</button>` : ""}
    <div class="notebook-stage-top"><span id="saveStatus" class="save-status">Saved</span><span class="notebook-count">${notebookPage.name || `Page ${index + 1}`} · ${index + 1} of ${total}</span></div>
    ${renderPageTabs(notebook, index)}
    <div class="notebook-stage">
      <article class="notebook-page notebook-page-${notebookPage.shape || "portrait"}" data-page-canvas style="width:${dims.width}px;height:${dims.height}px;">
        ${notebookPage.blocks.length ? notebookPage.blocks.map(renderNotebookBlock).join("") : `<button class="blank-notebook-prompt" data-action="start-writing" type="button">Add your first note</button>`}
      </article>
    </div>
  </section>`;
}

function renderShapeVisual(block) {
  const kind = block.shapeKind || "rectangle";
  const styles = block.styles || {};
  const stroke = styles.stroke || styles.color || "#0E2F76";
  const fill = styles.fill || (kind === "sticky" || kind === "highlighter" ? "#E9F4FF" : "#F5FEFF");
  const strokeWidth = Number(styles.strokeWidth || 3);
  const dash = kind.includes("dashed") ? "8 7" : kind.includes("dotted") ? "2 7" : "";
  const markerEnd = ["arrow", "curved-arrow", "connector", "process-arrow", "timeline-arrow", "mind-map", "flowchart"].includes(kind) ? `marker-end="url(#arrowHead)"` : "";
  const markerStart = kind === "double-arrow" ? `marker-start="url(#arrowHead)"` : "";
  if (["arrow", "double-arrow", "straight-line", "dashed-line", "dotted-line", "connector", "process-arrow", "timeline-arrow", "mind-map", "flowchart"].includes(kind)) {
    return `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${stroke}"/></marker></defs><line x1="8" y1="50" x2="92" y2="50" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dash}" stroke-linecap="round" ${markerStart} ${markerEnd}/></svg>`;
  }
  if (["curved-line", "curved-arrow"].includes(kind)) {
    return `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${stroke}"/></marker></defs><path d="M8 72 C34 8 66 92 92 28" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" ${markerEnd}/></svg>`;
  }
  if (kind === "circle" || kind === "ellipse") return `<svg class="shape-svg" viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="42" ry="${kind === "circle" ? 42 : 30}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
  if (kind === "triangle") return `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M50 10 92 88 8 88Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/></svg>`;
  if (kind === "diamond") return `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M50 8 92 50 50 92 8 50Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
  if (kind === "pentagon") return `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M50 8 92 38 76 92 24 92 8 38Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
  if (kind === "hexagon") return `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M28 10h44l22 40-22 40H28L6 50Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
  if (kind === "star") return `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M50 8 61 37 92 38 68 57 77 88 50 70 23 88 32 57 8 38 39 37Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/></svg>`;
  if (kind === "heart") return `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M50 88S12 62 12 34c0-15 11-24 24-24 7 0 12 4 14 9 2-5 7-9 14-9 13 0 24 9 24 24 0 28-38 54-38 54Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
  if (["check", "cross", "warning", "info", "like", "dislike", "question", "exclamation", "numbered-marker", "step"].includes(kind)) return `<div class="symbol-shape">${({check:"OK",cross:"X",warning:"!",info:"i",like:"+",dislike:"-",question:"?",exclamation:"!", "numbered-marker":"1", step:"1"})[kind]}</div>`;
  if (["speech", "comment", "callout", "sticky"].includes(kind)) return `<div class="bubble-shape ${kind}">${escapeHtml(block.text || (kind === "sticky" ? "Note" : "Comment"))}</div>`;
  return `<svg class="shape-svg" viewBox="0 0 100 100"><rect x="8" y="14" width="84" height="72" rx="${kind === "rounded-rectangle" ? 16 : 3}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
}
function renderNotebookBlock(block) {
  const styles = block.styles || {};
  const selected = block.id === state.selectedBlockId ? " selected" : "";
  const objectStyle = `left:${Number(block.x)}px;top:${Number(block.y)}px;width:${Number(block.width)}px;height:${Number(block.height)}px;transform:rotate(${Number(block.rotation || 0)}deg);z-index:${Number(styles.zIndex || 2)};`;
  if (block.type === "image") {
    return `<div class="canvas-object image-object${selected}" data-block-id="${block.id}" style="${objectStyle}">
      <button class="object-grip" data-drag-block="${block.id}" type="button" aria-label="Move image"></button>
      <img src="${escapeAttribute(normalizeImageUrl(block.url))}" alt="${escapeAttribute(block.alt || "Document image")}" style="border-radius:${Number(styles.borderRadius || 10)}px;opacity:${Number(styles.opacity || 1)};box-shadow:${styles.shadow ? "0 16px 32px rgba(14,47,118,0.16)" : "none"};" />
      <span class="resize-handle" data-resize-block="${block.id}"></span>
    </div>`;
  }
  if (block.type === "shape") {
    return `<div class="canvas-object shape-object${selected}" data-block-id="${block.id}" style="${objectStyle}opacity:${Number(styles.opacity || 1)};">
      <button class="object-grip" data-drag-block="${block.id}" type="button" aria-label="Move shape"></button>
      ${renderShapeVisual(block)}
      <span class="resize-handle" data-resize-block="${block.id}"></span>
    </div>`;
  }
  const fontSize = Number(styles.fontSize || (block.type === "heading" ? 34 : 17));
  const color = styles.color || "#1A232E";
  const bold = styles.bold ? 800 : block.type === "heading" ? 760 : 400;
  const italic = styles.italic ? "italic" : "normal";
  const underline = styles.underline ? "underline" : "none";
  const lineHeight = Number(styles.lineHeight || (block.type === "text" ? 1.55 : 1.16));
  const letterSpacing = Number(styles.letterSpacing || 0);
  const background = styles.background || "transparent";
  const align = styles.align || "left";
  const tag = block.type === "heading" ? "input" : "textarea";
  const value = escapeAttribute(block.text || "");
  const field = tag === "input"
    ? `<input data-text-input="${block.id}" value="${value}" placeholder="Heading" />`
    : `<textarea data-text-input="${block.id}" placeholder="Start writing...">${escapeHtml(block.text || "")}</textarea>`;
  return `<div class="canvas-object text-object${selected}" data-block-id="${block.id}" style="${objectStyle}background:${escapeAttribute(background)};">
    <button class="object-grip" data-drag-block="${block.id}" type="button" aria-label="Move text"></button>
    <div class="canvas-text-shell" style="font-family:${escapeAttribute(styles.fontFamily || "Inter, ui-sans-serif, system-ui")};font-size:${fontSize}px;color:${color};font-weight:${bold};font-style:${italic};text-decoration:${underline};line-height:${lineHeight};letter-spacing:${letterSpacing}px;text-align:${align};">${field}</div>
    <span class="resize-handle" data-resize-block="${block.id}"></span>
  </div>`;
}

function renderProperties() {
  const panel = document.querySelector("#propertiesPanel");
  if (!panel) return;
  const block = selectedNotebookBlock();
  const page = activeNotebookPage();
  if (!block) {
    panel.className = "properties-panel";
    panel.innerHTML = `<div class="panel-empty-title">Page Properties</div>${shapeControl(page?.shape || "portrait")}<p class="panel-help">Select a text block, image, shape, or connector to edit object properties.</p>`;
    return;
  }
  panel.className = "properties-panel";
  const styles = block.styles || {};
  if (block.type === "shape") {
    panel.innerHTML = `${numberControl("Width", "width", block.width, 40, 1200)}${numberControl("Height", "height", block.height, 30, 1200)}${colorControl("Stroke", "stroke", styles.stroke || "#0E2F76")}${colorControl("Fill", "fill", styles.fill || "#e9f4ff")}${numberControl("Stroke Width", "strokeWidth", styles.strokeWidth || 3, 1, 16)}${numberControl("Opacity", "opacity", styles.opacity || 1, 0.1, 1, 0.05)}${numberControl("Rotation", "rotation", block.rotation || 0, -180, 180)}<div class="object-action-row"><button class="secondary-button" type="button" data-duplicate-block>Duplicate</button><button class="secondary-button" type="button" data-layer="1">Forward</button><button class="secondary-button" type="button" data-layer="-1">Backward</button></div><button class="danger-button" data-delete-block="${block.id}">Delete</button>`;
    return;
  }  if (block.type === "image") {
    panel.innerHTML = `${numberControl("Width", "width", block.width, 80, 900)}${numberControl("Height", "height", block.height, 80, 900)}${numberControl("Border Radius", "borderRadius", styles.borderRadius || 10, 0, 80)}${toggleControl("shadow", "Shadow", Boolean(styles.shadow))}${numberControl("Opacity", "opacity", styles.opacity || 1, 0.1, 1, 0.05)}${numberControl("Rotation", "rotation", block.rotation || 0, -180, 180)}<button class="secondary-button" type="button" disabled>Crop</button><div class="object-action-row"><button class="secondary-button" type="button" data-duplicate-block>Duplicate</button><button class="secondary-button" type="button" data-layer="1">Forward</button><button class="secondary-button" type="button" data-layer="-1">Backward</button></div><button class="danger-button" data-delete-block="${block.id}">Delete</button>`;
    return;
  }
  panel.innerHTML = `${fontControl(styles.fontFamily || "Inter")}${numberControl("Size", "fontSize", styles.fontSize || (block.type === "heading" ? 34 : 17), 8, 96)}${colorControl("Color", "color", styles.color || "#1A232E")}${toggleControl("bold", "Bold", Boolean(styles.bold))}${toggleControl("italic", "Italic", Boolean(styles.italic))}${toggleControl("underline", "Underline", Boolean(styles.underline))}${alignmentControl(styles.align || "left")}${numberControl("Line Spacing", "lineHeight", styles.lineHeight || 1.55, 1, 3, 0.05)}${numberControl("Letter Spacing", "letterSpacing", styles.letterSpacing || 0, 0, 12, 0.5)}${colorControl("Background", "background", styles.background || "#ffffff")}<div class="object-action-row"><button class="secondary-button" type="button" data-duplicate-block>Duplicate</button><button class="secondary-button" type="button" data-layer="1">Forward</button><button class="secondary-button" type="button" data-layer="-1">Backward</button></div><button class="danger-button" data-delete-block="${block.id}">Delete</button>`;
}

function fontControl(value) {
  return `<div class="control-group"><label>Font</label><select data-style-key="fontFamily"><option ${value.includes("Inter") ? "selected" : ""}>Inter</option><option ${value.includes("Georgia") ? "selected" : ""}>Georgia</option><option ${value.includes("Times") ? "selected" : ""}>Times New Roman</option><option ${value.includes("Arial") ? "selected" : ""}>Arial</option></select></div>`;
}
function shapeControl(value) {
  return `<div class="control-group"><label>Page Shape</label><select data-page-style="shape">${["square", "portrait", "landscape", "long", "wide"].map((shape) => `<option value="${shape}" ${shape === value ? "selected" : ""}>${shape}</option>`).join("")}</select></div>`;
}
function numberControl(label, key, value, min, max, step = 1) {
  return `<div class="control-group"><label>${label}</label><input type="number" data-style-key="${key}" value="${value ?? ""}" min="${min}" max="${max}" step="${step}" /></div>`;
}
function colorControl(label, key, value) {
  return `<div class="control-group"><label>${label}</label><input type="color" data-style-key="${key}" value="${value === "transparent" ? "#ffffff" : value}" /></div>`;
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

async function goBackInsideWorkspace() {
  if (state.view === "editor" && state.selectedFolderId) return selectFolder(state.selectedFolderId);
  if (state.view === "folder" || state.view === "dashboard") return showDashboard();
  return refreshWorkspace();
}
async function refreshCurrentWorkspaceState() {
  if (!["dashboard", "welcome", "folder", "editor"].includes(state.view)) return;
  const view = state.view;
  const folderId = state.selectedFolderId;
  const pageId = state.selectedPageId;
  try {
    await loadCurrentUser();
    if (!state.user) return;
    await loadFolders();
    if ((view === "folder" || view === "editor") && folderId && state.folders.some((folder) => folder.id === folderId)) {
      state.selectedFolderId = folderId;
      await loadPages(folderId);
      if (view === "editor" && pageId) {
        state.selectedPageId = pageId;
        const page = await api(`/api/pages/${pageId}`);
        const normalizedContent = normalizeNotebookContent(page.content);
        if (!state.activeNotebookPageId || !normalizedContent.pages.some((notebookPage) => notebookPage.id === state.activeNotebookPageId)) {
          state.activeNotebookPageId = normalizedContent.pages[0]?.id || null;
        }
        const pages = currentPages().map((item) => item.id === pageId ? { ...page, content: normalizedContent } : item);
        state.pagesByFolder.set(folderId, pages);
      }
    }
    setView(view);
  } catch (error) {
    console.error(error);
  }
}
async function refreshWorkspace() {
  await loadCurrentUser();
  if (!state.user) return setView("auth");
  await loadFolders();
  if (state.selectedFolderId && state.folders.some((folder) => folder.id === state.selectedFolderId)) {
    await loadPages(state.selectedFolderId);
    if (state.selectedPageId) {
      const page = await api(`/api/pages/${state.selectedPageId}`);
      const normalizedContent = normalizeNotebookContent(page.content);
      state.activeNotebookPageId = normalizedContent.pages[0]?.id || null;
      const pages = currentPages().map((item) => item.id === state.selectedPageId ? { ...page, content: normalizedContent } : item);
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
  const normalizedContent = normalizeNotebookContent(page.content);
  state.activeNotebookPageId = normalizedContent.pages[0]?.id || null;
  const pages = currentPages().map((item) => item.id === pageId ? { ...page, content: normalizedContent } : item);
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
  const notebookPage = activeNotebookPage();
  if (!notebookPage || !state.selectedBlockId) return;
  notebookPage.blocks = notebookPage.blocks.map((block) => block.id === state.selectedBlockId ? updater(block) : block);
  renderWorkspace();
  scheduleContentSave();
}

function updateSelectedBlockQuiet(updater) {
  const notebookPage = activeNotebookPage();
  if (!notebookPage || !state.selectedBlockId) return;
  notebookPage.blocks = notebookPage.blocks.map((block) => block.id === state.selectedBlockId ? updater(block) : block);
  scheduleContentSave();
}

function addNotebookPage(shape = "portrait") {
  const notebook = currentNotebook();
  if (!notebook) return;
  const next = createNotebookPage(shape, `Page ${notebook.pages.length + 1}`);
  notebook.pages.push(next);
  state.activeNotebookPageId = next.id;
  state.selectedBlockId = null;
  renderWorkspace();
  scheduleContentSave();
}

function changeNotebookPage(direction) {
  const notebook = currentNotebook();
  if (!notebook) return;
  const index = activeNotebookPageIndex();
  const nextIndex = Math.min(notebook.pages.length - 1, Math.max(0, index + direction));
  state.activeNotebookPageId = notebook.pages[nextIndex]?.id || state.activeNotebookPageId;
  state.selectedBlockId = null;
  renderWorkspace();
}

function setActivePageShape(shape) {
  const page = activeNotebookPage();
  if (!page) return;
  page.shape = shape;
  renderWorkspace();
  scheduleContentSave();
}

function selectNotebookPageById(pageId) {
  const notebook = currentNotebook();
  if (!notebook?.pages.some((page) => page.id === pageId)) return;
  state.activeNotebookPageId = pageId;
  state.selectedBlockId = null;
  renderWorkspace();
}

function addShape(shapeKind) {
  const notebookPage = activeNotebookPage();
  if (!notebookPage) return;
  const offset = notebookPage.blocks.length % 7;
  const isLine = shapeKind.includes("line") || shapeKind.includes("arrow") || shapeKind.includes("connector");
  const isSymbol = ["check", "cross", "warning", "info", "like", "dislike", "question", "exclamation", "numbered-marker", "step"].includes(shapeKind);
  const block = normalizeNotebookBlock({
    type: "shape",
    shapeKind,
    text: shapeKind.includes("note") || shapeKind.includes("bubble") || shapeKind === "sticky" ? "Note" : "",
    x: 110 + offset * 24,
    y: 110 + offset * 30,
    width: isLine ? 240 : isSymbol ? 96 : 180,
    height: isLine ? 80 : isSymbol ? 96 : 120,
    rotation: 0,
    styles: { stroke: "#0E2F76", fill: "#E9F4FF", strokeWidth: 3, opacity: 1, zIndex: 2 }
  });
  notebookPage.blocks = [...notebookPage.blocks, block];
  state.selectedBlockId = block.id;
  renderWorkspace();
  scheduleContentSave();
}

function duplicateSelectedBlock() {
  const notebookPage = activeNotebookPage();
  const block = selectedNotebookBlock();
  if (!notebookPage || !block) return;
  const copy = normalizeNotebookBlock({ ...JSON.parse(JSON.stringify(block)), id: createBlockId(), x: block.x + 28, y: block.y + 28 });
  notebookPage.blocks.push(copy);
  state.selectedBlockId = copy.id;
  renderWorkspace();
  scheduleContentSave();
}

function layerSelectedBlock(direction) {
  const block = selectedNotebookBlock();
  if (!block) return;
  const current = Number(block.styles?.zIndex || 2);
  updateSelectedBlock((item) => ({ ...item, styles: { ...(item.styles || {}), zIndex: Math.max(1, current + direction) } }));
}
function addBlock(type, imageData = null) {
  const notebookPage = activeNotebookPage();
  if (!notebookPage) return;
  const offset = notebookPage.blocks.length % 7;
  const base = { x: 90 + offset * 26, y: 90 + offset * 34, rotation: 0 };
  let block;
  if (type === "heading") block = normalizeNotebookBlock({ ...base, type, text: "New heading", width: 390, height: 78, styles: { fontSize: 36, color: "#1A232E", bold: true, align: "left" } });
  else if (type === "image") block = normalizeNotebookBlock({ ...base, type, url: imageData.url, imageId: imageData.id, alt: imageData.fileName, width: 360, height: 240, styles: { borderRadius: 14, opacity: 1 } });
  else block = normalizeNotebookBlock({ ...base, type: "text", text: "New text", width: 360, height: 140, styles: { fontSize: 17, color: "#1A232E", align: "left", lineHeight: 1.55 } });
  notebookPage.blocks = [...notebookPage.blocks, block];
  state.selectedBlockId = block.id;
  renderWorkspace();
  if (type === "heading" || type === "text") {
    setTimeout(() => {
      const field = document.querySelector(`[data-text-input="${block.id}"]`);
      field?.focus();
      field?.select?.();
    }, 0);
  }
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
  page.content = normalizeNotebookContent(page.content);
  try {
    const saved = await api(`/api/pages/${page.id}/content`, { method: "PATCH", body: { content: page.content } });
    const pages = currentPages().map((item) => item.id === page.id ? { ...saved, content: normalizeNotebookContent(saved.content) } : item);
    state.pagesByFolder.set(state.selectedFolderId, pages);
    setSaveStatus("Saved");
  } catch (error) {
    setSaveStatus("Error saving");
    console.error(error);
  }
}
function scheduleTitleSave() {
  const page = currentPage();
  const input = els.headerNotebookTitle;
  if (!page || !input || input.hidden) return;
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

els.brandButton.addEventListener("click", refreshCurrentWorkspaceState);
els.headerBackButton.addEventListener("click", goBackInsideWorkspace);

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
  const page = await api(`/api/folders/${state.selectedFolderId}/pages`, { method: "POST", body: { title, content: { type: "notebook", pages: [createNotebookPage("portrait", "Page 1")] } } });
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
  if (action === "add-notebook-page") return addNotebookPage();
  if (action === "exit-focus") { state.focusMode = false; return renderWorkspace(); }
  if (action === "dashboard") return showDashboard();
  if (action === "back-folder") return selectFolder(state.selectedFolderId);
  if (action === "start-writing") return addBlock("text");

  const nav = event.target.closest("[data-notebook-nav]");
  if (nav) return changeNotebookPage(nav.dataset.notebookNav === "next" ? 1 : -1);

  const notebookPageButton = event.target.closest("[data-notebook-page-id]");
  if (notebookPageButton) return selectNotebookPageById(notebookPageButton.dataset.notebookPageId);

  const shape = event.target.closest("[data-page-shape]");
  if (shape) return addNotebookPage(shape.dataset.pageShape);

  const folderButton = event.target.closest("[data-folder-id]");
  if (folderButton) return selectFolder(folderButton.dataset.folderId);

  const pageButton = event.target.closest("[data-page-id]");
  if (pageButton) return selectPage(pageButton.dataset.pageId);

  const addButton = event.target.closest("[data-add-block]");
  if (addButton) return addBlock(addButton.dataset.addBlock);

  const shapeButton = event.target.closest("[data-add-shape]");
  if (shapeButton) return addShape(shapeButton.dataset.addShape);

  const duplicateButton = event.target.closest("[data-duplicate-block]");
  if (duplicateButton) return duplicateSelectedBlock();

  const layerButton = event.target.closest("[data-layer]");
  if (layerButton) return layerSelectedBlock(Number(layerButton.dataset.layer));

  const align = event.target.closest("[data-align]");
  if (align) return updateSelectedBlock((block) => ({ ...block, styles: { ...(block.styles || {}), align: align.dataset.align } }));

  const toggle = event.target.closest("[data-toggle-style]");
  if (toggle) {
    const key = toggle.dataset.toggleStyle;
    return updateSelectedBlock((block) => ({ ...block, styles: { ...(block.styles || {}), [key]: !block.styles?.[key] } }));
  }

  const deleteButton = event.target.closest("[data-delete-block]");
  if (deleteButton) {
    const notebookPage = activeNotebookPage();
    if (!notebookPage) return;
    notebookPage.blocks = notebookPage.blocks.filter((block) => block.id !== deleteButton.dataset.deleteBlock);
    state.selectedBlockId = null;
    renderWorkspace();
    scheduleContentSave();
    return;
  }

  const textEditor = event.target.closest("[data-text-input]");
  if (textEditor) {
    state.selectedBlockId = textEditor.dataset.textInput;
    renderProperties();
    return;
  }

  const block = event.target.closest("[data-block-id]");
  if (block) {
    state.selectedBlockId = block.dataset.blockId;
    renderWorkspace();
    return;
  }

  if (event.target.closest("[data-page-canvas]")) {
    state.selectedBlockId = null;
    renderProperties();
  }
});

els.appRoot.addEventListener("focusin", (event) => {
  const textEditor = event.target.closest("[data-text-input]");
  if (!textEditor) return;
  state.selectedBlockId = textEditor.dataset.textInput;
  renderProperties();
});

els.appRoot.addEventListener("input", (event) => {
  if (event.target.id === "headerNotebookTitle") return scheduleTitleSave();
  const textInput = event.target.closest("[data-text-input]");
  if (textInput) {
    const blockId = textInput.dataset.textInput;
    const notebookPage = activeNotebookPage();
    const block = notebookPage?.blocks.find((item) => item.id === blockId);
    if (!block) return;
    block.text = textInput.value;
    state.selectedBlockId = blockId;
    scheduleContentSave();
    return;
  }
  const styleInput = event.target.closest("[data-style-key]");
  if (styleInput) {
    const key = styleInput.dataset.styleKey;
    const raw = styleInput.value;
    const value = styleInput.type === "number" ? Number(raw) : raw;
    updateSelectedBlock((block) => {
      if (["width", "height", "rotation"].includes(key)) return { ...block, [key]: value };
      return { ...block, styles: { ...(block.styles || {}), [key]: value } };
    });
    return;
  }
  const pageStyle = event.target.closest("[data-page-style]");
  if (pageStyle && pageStyle.dataset.pageStyle === "shape") setActivePageShape(pageStyle.value);
});

els.appRoot.addEventListener("pointerdown", (event) => {
  const resize = event.target.closest("[data-resize-block]");
  const drag = event.target.closest("[data-drag-block]");
  if (!resize && !drag) return;
  event.preventDefault();
  const blockId = (resize || drag).dataset.resizeBlock || (resize || drag).dataset.dragBlock;
  const block = activeNotebookPage()?.blocks.find((item) => item.id === blockId);
  if (!block) return;
  state.selectedBlockId = blockId;
  pointerInteraction = {
    mode: resize ? "resize" : "drag",
    blockId,
    startX: event.clientX,
    startY: event.clientY,
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    element: event.target.closest("[data-block-id]")
  };
  event.target.setPointerCapture?.(event.pointerId);
  renderProperties();
});

window.addEventListener("pointermove", (event) => {
  if (!pointerInteraction) return;
  const dx = event.clientX - pointerInteraction.startX;
  const dy = event.clientY - pointerInteraction.startY;
  const notebookPage = activeNotebookPage();
  const block = notebookPage?.blocks.find((item) => item.id === pointerInteraction.blockId);
  if (!block) return;
  if (pointerInteraction.mode === "drag") {
    block.x = Math.max(0, pointerInteraction.x + dx);
    block.y = Math.max(0, pointerInteraction.y + dy);
  } else {
    block.width = Math.max(80, pointerInteraction.width + dx);
    block.height = Math.max(60, pointerInteraction.height + dy);
  }
  if (pointerInteraction.element) {
    pointerInteraction.element.style.left = `${block.x}px`;
    pointerInteraction.element.style.top = `${block.y}px`;
    pointerInteraction.element.style.width = `${block.width}px`;
    pointerInteraction.element.style.height = `${block.height}px`;
  }
});

window.addEventListener("pointerup", () => {
  if (!pointerInteraction) return;
  pointerInteraction = null;
  renderProperties();
  scheduleContentSave();
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



