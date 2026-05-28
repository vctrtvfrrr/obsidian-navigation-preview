import { FileView, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";

// Attribute placed on the tab header element to mark it as a preview tab.
const PREVIEW_ATTR = "data-vsc-preview";
// Attribute placed on the tab header element once our dblclick listener is attached.
const TAB_HANDLER_ATTR = "data-vsc-handler";

/**
 * Thin wrapper so we can access the internal `tabHeaderEl` without casting everywhere.
 */
interface LeafWithTabHeader extends WorkspaceLeaf {
  tabHeaderEl?: HTMLElement;
}

interface WorkspaceParentWithLeaves {
  children: WorkspaceLeaf[];
}

export default class ActLikeVSCode extends Plugin {
  /** The current "preview" leaf — can be replaced by the next single-click. */
  private previewLeaf: WorkspaceLeaf | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  override onload(): void {
    if (Platform.isMobile) {
      console.info("Auto-commit: mobile platform detected, plugin disabled");
      return;
    }

    // Capture phase fires before Obsidian's own bubble-phase handlers.
    // We register both click and dblclick to avoid any timer-based delays.
    this.registerDomEvent(activeDocument, "click", this.onDocumentClick, true);
    this.registerDomEvent(activeDocument, "dblclick", this.onDocumentDblClick, true);

    // Keep tab handlers in sync with Obsidian redraws.
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.syncTabHandlers();
        this.cleanupPreviewLeaf();
      })
    );

    // When the active leaf switches to a blank "New tab", treat it as a preview
    // slot so the next single-click opens the file there instead of creating yet
    // another tab (mirrors VSCode's behaviour with the + button).
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (!leaf || leaf === this.previewLeaf) return;
        if (leaf.view.getViewType() === "empty") {
          this.setAsPreview(leaf);
        }
      })
    );

    this.syncTabHandlers();
  }

  override onunload(): void {
    // Strip all preview markers so Obsidian's UI is left clean.
    activeDocument.querySelectorAll(`[${PREVIEW_ATTR}]`).forEach((el) => {
      el.removeAttribute(PREVIEW_ATTR);
    });
  }

  // ── File-explorer event interception ──────────────────────────────────────

  /**
   * Single click: open immediately, no timer delay.
   * When part of a double-click the second click is effectively a no-op
   * (file is already open → just focuses), and the dblclick handler pins it.
   */
  private readonly onDocumentClick = (e: MouseEvent): void => {
    const file = this.fileFromEvent(e);
    if (!file) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    void this.handleSingleClick(file);
  };

  /**
   * Double click: the browser fires click→click→dblclick in sequence.
   * By the time dblclick fires the file is already open (from the first click),
   * so we only need to pin the existing leaf.
   */
  private readonly onDocumentDblClick = (e: MouseEvent): void => {
    const file = this.fileFromEvent(e);
    if (!file) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    void this.handleDoubleClick(file);
  };

  // ── Click handlers ─────────────────────────────────────────────────────────

  /**
   * Single-click: VSCode preview behaviour.
   * - If the file is already open somewhere, just focus that leaf.
   * - Otherwise open in the current preview leaf (replacing its content),
   *   or create a new tab and mark it as preview.
   */
  private async handleSingleClick(file: TFile): Promise<void> {
    const { existing, previewAlive } = this.gatherLeafInfo(file);

    if (existing) {
      this.app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }

    if (this.previewLeaf && previewAlive) {
      const leaf = this.previewLeaf;
      await leaf.openFile(file);
      // Re-apply the style in case it was lost during the file switch.
      this.applyPreviewStyle(leaf, true);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    } else {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      this.moveLeafToEnd(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      this.setAsPreview(leaf);
    }
  }

  /**
   * Double-click: pin whatever leaf already has the file open.
   * (The two preceding click events have already opened the file as preview.)
   */
  private async handleDoubleClick(file: TFile): Promise<void> {
    const { existing, previewAlive } = this.gatherLeafInfo(file);

    if (existing) {
      if (this.previewLeaf === existing) this.clearPreview();
      this.app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }

    // Rare edge case: file not yet open (e.g., click promise still in flight).
    if (this.previewLeaf && previewAlive) {
      const leaf = this.previewLeaf;
      await leaf.openFile(file);
      this.clearPreview();
    } else {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      this.moveLeafToEnd(leaf);
    }
  }

  // ── Tab double-click: convert preview → pinned ───────────────────────────

  private syncTabHandlers(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const tabEl = this.tabHeaderEl(leaf);
      if (!tabEl || tabEl.getAttribute(TAB_HANDLER_ATTR)) return;

      tabEl.setAttribute(TAB_HANDLER_ATTR, "true");
      // Use capture phase so we intercept before Obsidian's own dblclick
      // handlers (which can trigger macOS window zoom via Electron).
      tabEl.addEventListener("dblclick", (e: MouseEvent) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (this.previewLeaf === leaf) this.clearPreview();
      }, true /* capture */);
    });
  }

  // ── Preview-state helpers ──────────────────────────────────────────────────

  private setAsPreview(leaf: WorkspaceLeaf): void {
    if (this.previewLeaf && this.previewLeaf !== leaf) {
      this.applyPreviewStyle(this.previewLeaf, false);
    }
    this.previewLeaf = leaf;
    this.applyPreviewStyle(leaf, true);
  }

  private clearPreview(): void {
    if (!this.previewLeaf) return;
    this.applyPreviewStyle(this.previewLeaf, false);
    this.previewLeaf = null;
  }

  private applyPreviewStyle(leaf: WorkspaceLeaf, preview: boolean): void {
    const tabEl = this.tabHeaderEl(leaf);
    if (!tabEl) return;
    if (preview) {
      tabEl.setAttribute(PREVIEW_ATTR, "");
    } else {
      tabEl.removeAttribute(PREVIEW_ATTR);
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Single pass over all leaves: finds an existing leaf for `file` AND checks
   * whether previewLeaf is still alive — avoids two separate iterations.
   */
  private gatherLeafInfo(
    file: TFile
  ): { existing: WorkspaceLeaf | null; previewAlive: boolean } {
    let existing: WorkspaceLeaf | null = null;
    let previewAlive = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof FileView && leaf.view.file === file) {
        existing = leaf;
      }
      if (leaf === this.previewLeaf) previewAlive = true;
    });
    return { existing, previewAlive };
  }

  private cleanupPreviewLeaf(): void {
    if (!this.previewLeaf) return;
    let alive = false;
    this.app.workspace.iterateAllLeaves((l) => {
      if (l === this.previewLeaf) alive = true;
    });
    if (!alive) this.previewLeaf = null;
  }

  private fileFromEvent(e: MouseEvent): TFile | null {
    const titleEl = (e.target as HTMLElement).closest<HTMLElement>(".nav-file-title");
    if (!titleEl) return null;
    const path = titleEl.getAttribute("data-path");
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private tabHeaderEl(leaf: WorkspaceLeaf): HTMLElement | null {
    return (leaf as LeafWithTabHeader).tabHeaderEl ?? null;
  }

  /**
   * Move a newly-created leaf to the last position in its tab group.
   * Updates both the internal children array and the tab-header DOM so that
   * Obsidian's internal state and the visible UI stay in sync.
   */
  private moveLeafToEnd(leaf: WorkspaceLeaf): void {
    const parent = leaf.parent;
    if (this.hasWorkspaceLeafChildren(parent)) {
      const { children } = parent;
      const idx = children.indexOf(leaf);
      if (idx > -1 && idx < children.length - 1) {
        children.splice(idx, 1);
        children.push(leaf);
      }
    }
    const tabEl = this.tabHeaderEl(leaf);
    if (tabEl?.parentElement) {
      tabEl.parentElement.appendChild(tabEl);
    }
  }

  private hasWorkspaceLeafChildren(
    parent: unknown
  ): parent is WorkspaceParentWithLeaves {
    if (typeof parent !== "object" || parent === null || !("children" in parent)) {
      return false;
    }
    const children = (parent as { readonly children: unknown }).children;
    return Array.isArray(children) && children.every((child) => child instanceof WorkspaceLeaf);
  }
}
