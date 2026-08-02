document.addEventListener("DOMContentLoaded", () => {
  // ────────────────────────────────────────────────
  // SOCKET.IO INITIALIZATION
  // ────────────────────────────────────────────────
  const socket = typeof io !== "undefined" ? io() : null;

  const mainEl = document.querySelector("main");
  const roomId = mainEl?.dataset.roomId || null;
  const recipientId = mainEl?.dataset.recipientId || null;
  const currentUserId = mainEl?.dataset.userId || null;
  const canManage = mainEl?.dataset.canManage === "true";

  // Join Socket Room
  if (socket && roomId) {
    // Re-emit join_room on EVERY (re)connection so room membership survives
    // dropped connections/reconnects (otherwise live messages stop arriving).
    const joinRoom = () => socket.emit("join_room", roomId);
    socket.on("connect", () => {
      console.log(`[socket] connected as ${socket.id}, joining room ${roomId}`);
      joinRoom();
    });
    if (socket.connected) joinRoom();

    socket.on("connect_error", (err) => {
      console.error("[socket] connect error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.warn(`[socket] disconnected from room ${roomId}:`, reason);
    });

    socket.on("new_message", (msg) => {
      if (!msg || !msg._id) return;
      if (messageFeed.querySelector(`[data-message-id="${msg._id}"]`)) return;
      appendMessageToFeed(msg);
    });

    socket.on("reaction_updated", ({ messageId, reactions }) => {
      if (!messageFeed || !messageId) return;
      const row = messageFeed.querySelector(`[data-message-id="${messageId}"]`);
      if (row) renderReactions(row, reactions);
    });

    socket.on("message_updated", (msg) => {
      if (!messageFeed || !msg || !msg._id) return;
      const row = messageFeed.querySelector(`[data-message-id="${msg._id}"]`);
      if (!row) return;
      const contentEl = row.querySelector(".msg-content");
      if (contentEl) contentEl.textContent = msg.content || "";
      const badge = row.querySelector(".msg-edited-badge");
      if (badge) badge.classList.remove("hidden");
    });

    socket.on("message_deleted", ({ messageId }) => {
      if (!messageFeed || !messageId) return;
      const row = messageFeed.querySelector(`[data-message-id="${messageId}"]`);
      if (row) row.remove();
    });

    socket.on("display_typing", ({ username }) => {
      const el = document.getElementById("typing-indicator");
      if (el) {
        el.innerText = `${username} is typing...`;
        el.classList.remove("hidden");
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => el.classList.add("hidden"), 3000);
      }
    });

    socket.on("member_added", (payload) => {
      if (!roomId || !payload?.roomId) return;
      if (payload.roomId.toString() !== roomId.toString()) return;
      refreshMembers();
    });

    socket.on("member_removed", (payload) => {
      if (!roomId || !payload?.roomId) return;
      if (payload.roomId.toString() !== roomId.toString()) return;
      // If the current user was removed, send them back to the dashboard
      if (payload.userId && payload.userId.toString() === currentUserId) {
        window.location.href = "/";
        return;
      }
      refreshMembers();
    });
  }

  // Scroll to bottom on load
  const messageFeed = document.getElementById("message-feed");
  if (messageFeed) messageFeed.scrollTop = messageFeed.scrollHeight;

  // ────────────────────────────────────────────────
  // GLOBAL SEARCH — live-filter channels & users
  // ────────────────────────────────────────────────
  const globalSearch = document.getElementById("global-search");

  function filterList(containerId, query) {
    const container = document.getElementById(containerId);
    if (!container) return 0;
    let visible = 0;
    container.querySelectorAll("a").forEach((el) => {
      const match = !query || (el.textContent || "").toLowerCase().includes(query);
      el.style.display = match ? "" : "none";
      if (match) visible++;
    });
    return visible;
  }

  globalSearch?.addEventListener("input", () => {
    const q = (globalSearch.value || "").toLowerCase().trim();
    const channelVisible =
      filterList("sidebar-channels-list", q) +
      filterList("overview-channels-list", q);
    filterList("sidebar-users-list", q);

    let hint = document.getElementById("search-no-results");
    if (q && channelVisible === 0) {
      if (!hint) {
        hint = document.createElement("div");
        hint.id = "search-no-results";
        hint.className = "px-3 py-1 text-xs text-on-surface-variant";
        hint.textContent = "No matching channels";
        document.getElementById("sidebar-channels-list")?.prepend(hint);
      }
      hint.style.display = "";
    } else if (hint) {
      hint.style.display = "none";
    }
  });

  // ────────────────────────────────────────────────
  // MESSAGE INPUT — enable/disable send button & typing
  // ────────────────────────────────────────────────
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");

  if (messageInput && sendBtn) {
    // Keep button active/clickable when form has input or attachments
    messageInput.addEventListener("input", () => {
      // Auto-expand
      messageInput.style.height = "auto";
      messageInput.style.height = messageInput.scrollHeight + "px";

      // Typing notification
      if (socket && roomId && messageInput.value.trim()) socket.emit("typing", { roomId });
    });

    // Enter to send, Shift+Enter for new line
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatForm?.requestSubmit();
      }
    });
  }

  // ────────────────────────────────────────────────
  // REPLY STATE
  // ────────────────────────────────────────────────
  const replyBar = document.getElementById("reply-bar");
  const replyBarName = document.getElementById("reply-bar-name");
  const replyBarContent = document.getElementById("reply-bar-content");
  let replyingTo = null;

  function setReplyingTo(row) {
    const nameEl = row.querySelector(".msg-sender-name");
    const contentEl = row.querySelector(".msg-content");
    if (!nameEl || !contentEl) return;
    replyingTo = row.dataset.messageId || null;
    if (replyBarName) replyBarName.textContent = nameEl.textContent;
    if (replyBarContent) replyBarContent.textContent = contentEl.textContent;
    replyBar?.classList.remove("hidden");
    messageInput?.focus();
  }

  function clearReply() {
    replyingTo = null;
    replyBar?.classList.add("hidden");
  }

  document.getElementById("cancel-reply-btn")?.addEventListener("click", clearReply);

  // ────────────────────────────────────────────────
  // CHAT FORM SUBMISSION (Room & DM)
  // ────────────────────────────────────────────────
  const chatForm = document.getElementById("chat-form");
  const attachmentInput = document.getElementById("attachment-file-input");

  if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = messageInput ? messageInput.value.trim() : "";
      const hasFile = attachmentInput && attachmentInput.files.length > 0;
      if (!content && !hasFile) return;

      if (roomId) {
        // Channel Message sending
        const formData = new FormData();
        formData.append("content", content);
        if (replyingTo) formData.append("replyTo", replyingTo);
        if (hasFile) formData.append("attachments", attachmentInput.files[0]);

        try {
          const res = await fetch(`/api/v1/rooms/${roomId}/messages`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.status === "success") {
            messageInput.value = "";
            messageInput.style.height = "auto";
            if (attachmentInput) attachmentInput.value = "";
            const preview = document.getElementById("file-name-preview");
            if (preview) preview.innerText = "";

            clearReply();
            appendMessageToFeed(data.data.message);
          } else {
            alert(data.message || "Failed to send message");
          }
        } catch (err) {
          console.error("Message send error:", err);
        }
      } else if (recipientId) {
        // Direct Message sending
        try {
          // First ensure DM room exists
          const dmRes = await fetch("/api/v1/rooms/dm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipientId }),
          });
          const dmData = await dmRes.json();
          if (dmData.status === "success") {
            const dmRoomId = dmData.data.room._id;
            const formData = new FormData();
            formData.append("content", content);
            if (replyingTo) formData.append("replyTo", replyingTo);
            if (hasFile) formData.append("attachments", attachmentInput.files[0]);

            const res = await fetch(`/api/v1/rooms/${dmRoomId}/messages`, {
              method: "POST",
              body: formData,
            });
            const data = await res.json();
            if (data.status === "success") {
              messageInput.value = "";
              messageInput.style.height = "auto";
              if (attachmentInput) attachmentInput.value = "";
              const preview = document.getElementById("file-name-preview");
              if (preview) preview.innerText = "";

              clearReply();
              appendMessageToFeed(data.data.message);
            } else {
              alert(data.message || "Failed to send direct message");
            }
          }
        } catch (err) {
          console.error("DM send error:", err);
        }
      }
    });
  }

  // Attachment file preview label
  if (attachmentInput) {
    attachmentInput.addEventListener("change", () => {
      const preview = document.getElementById("file-name-preview");
      if (preview && attachmentInput.files.length) {
        preview.innerText = attachmentInput.files[0].name;
      }
    });
  }

  // ────────────────────────────────────────────────
  // APPEND MESSAGE TO FEED
  // ────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (!bytes) return "";
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  function attachmentHTML(att) {
    if (!att || !att.url) return "";
    const url = att.url;
    const name = att.fileName || "Attachment";
    const sizeText = formatBytes(att.fileSize);
    if (att.fileType === "image") {
      return `<button type="button" data-att-preview="${escapeHtml(url)}" data-att-name="${escapeHtml(name)}" class="att-preview mt-3 max-w-md rounded-xl overflow-hidden border border-border-subtle bg-surface-container block cursor-pointer">
        <img class="w-full max-h-60 object-cover" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />
      </button>`;
    }
    if ((att.fileName || "").toLowerCase().endsWith(".pdf")) {
      return `<button type="button" data-att-preview="${escapeHtml(url)}" data-att-name="${escapeHtml(name)}" class="att-preview mt-3 max-w-md flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-surface-container hover:bg-surface-container-high transition-colors w-full text-left cursor-pointer">
        <span class="material-symbols-outlined text-on-surface-variant">picture_as_pdf</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm text-white truncate">${escapeHtml(name)}</p>
          <p class="text-xs text-on-surface-variant">${escapeHtml(sizeText)} · Click to preview</p>
        </div>
        <span class="material-symbols-outlined text-on-surface-variant">open_in_new</span>
      </button>`;
    }
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" download="${escapeHtml(name)}" class="mt-3 max-w-md flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-surface-container hover:bg-surface-container-high transition-colors">
      <span class="material-symbols-outlined text-on-surface-variant">attach_file</span>
      <div class="min-w-0 flex-1">
        <p class="text-sm text-white truncate">${escapeHtml(name)}</p>
        <p class="text-xs text-on-surface-variant">${escapeHtml(sizeText)}</p>
      </div>
    </a>`;
  }

  function messageRowHTML(msg) {
    const senderName = msg.sender?.username || "User";
    const senderAvatar = msg.sender?.avatar || "/img/default.jpg";
    const timeStr = new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const isOwn = currentUserId && msg.sender && msg.sender._id && msg.sender._id.toString() === currentUserId;
    const editedBadge = msg.isEdited ? "" : "hidden";
    const replyBlock = msg.replyTo
      ? `<div class="flex items-center gap-2 mb-1 border-l-2 border-secondary-container pl-2 mt-1">
          <span class="text-xs font-bold text-primary">${escapeHtml(msg.replyTo.sender?.username || "User")}</span>
          <span class="text-xs text-on-surface-variant truncate">${escapeHtml(msg.replyTo.content || "")}</span>
        </div>`
      : "";
    const attachmentsHtml = (msg.attachments || []).map(attachmentHTML).join("");
    return `
      <div class="flex gap-4 group message-hover px-3 py-1.5 rounded-lg -mx-3 hover:bg-surface-container-low transition-colors" data-message-id="${msg._id || ""}">
        <div class="shrink-0 w-10 h-10 rounded-lg bg-indigo-500 overflow-hidden mt-1">
          <img class="w-full h-full object-cover" src="${senderAvatar}" alt="avatar" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-bold text-white cursor-pointer msg-sender-name">${escapeHtml(senderName)}</span>
            <span class="text-xs text-text-timestamp">${timeStr}</span>
            <span class="text-xs text-text-timestamp msg-edited-badge ${editedBadge}">(edited)</span>
          </div>
          ${replyBlock}
          <div class="text-sm text-on-surface mt-1 leading-relaxed msg-content">${escapeHtml(msg.content)}</div>
          ${attachmentsHtml}
          <div class="msg-reactions flex flex-wrap gap-1 mt-3 hidden"></div>
        </div>
        <div class="msg-hover-actions self-center flex items-center gap-0.5 bg-surface-container-high border border-border-subtle rounded-lg p-0.5 shadow-xl">
          <button class="p-1.5 rounded text-on-surface-variant btn-reply" title="Reply"><span class="material-symbols-outlined text-lg">reply</span></button>
          ${isOwn ? `<button class="p-1.5 rounded text-on-surface-variant btn-edit" title="Edit Message"><span class="material-symbols-outlined text-lg">edit</span></button><button class="p-1.5 rounded text-on-surface-variant btn-delete" title="Delete Message"><span class="material-symbols-outlined text-lg">delete</span></button>` : ""}
          <button class="p-1.5 rounded text-on-surface-variant btn-react" data-emoji="👍" title="Thumbs Up"><span class="material-symbols-outlined text-lg">thumb_up</span></button>
          <button class="p-1.5 rounded text-on-surface-variant btn-react" data-emoji="❤️" title="Heart"><span class="material-symbols-outlined text-lg">favorite</span></button>
          <button class="p-1.5 rounded text-on-surface-variant btn-react" data-emoji="🔥" title="Fire"><span class="material-symbols-outlined text-lg">local_fire_department</span></button>
        </div>
      </div>
    `;
  }

  function appendMessageToFeed(msg) {
    const feed = document.getElementById("message-feed-inner") || messageFeed;
    if (!feed) return;
    if (msg && msg._id && feed.querySelector(`[data-message-id="${msg._id}"]`)) return;
    const emptyState = feed.querySelector("#empty-messages-state");
    if (emptyState) emptyState.remove();
    feed.insertAdjacentHTML("beforeend", messageRowHTML(msg));
    const row = feed.lastElementChild;
    renderReactions(row, msg.reactions);
    messageFeed.scrollTop = messageFeed.scrollHeight;
  }

  function renderReactions(row, reactions) {
    const container = row?.querySelector(".msg-reactions");
    if (!container) return;
    const list = (reactions || []).filter((r) => r && r.emoji && r.users && r.users.length > 0);
    if (!list.length) {
      container.classList.add("hidden");
      container.innerHTML = "";
      return;
    }
    container.classList.remove("hidden");
    container.innerHTML = list
      .map(
        (r) => `
        <button type="button" class="btn-react-pill px-2 py-0.5 rounded-full border border-secondary-container flex items-center gap-1 cursor-pointer" data-emoji="${escapeHtml(r.emoji)}" style="background:rgba(2,95,158,0.2)">
          <span class="text-sm">${escapeHtml(r.emoji)}</span>
          <span class="text-xs text-secondary font-bold">${r.users.length}</span>
        </button>`,
      )
      .join("");
  }

  async function toggleReaction(row, emoji) {
    const msgId = row?.dataset.messageId;
    if (!msgId || !emoji) return;
    try {
      const res = await fetch(`/api/v1/messages/${msgId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      const data = await res.json();
      if (data.status === "success") {
        renderReactions(row, data.data.reactions);
      } else {
        alert(data.message || "Failed to react");
      }
    } catch (err) {
      console.error("Reaction error:", err);
    }
  }

  function deleteMessage(row) {
    const msgId = row?.dataset.messageId;
    if (!msgId) return;
    showConfirmDialog({
      title: "Delete message?",
      message: "This action cannot be undone.",
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/v1/messages/${msgId}`, { method: "DELETE" });
          const data = await res.json();
          if (data.status === "success") {
            row.remove();
          } else {
            alert(data.message || "Failed to delete message");
          }
        } catch (err) {
          console.error("Delete message error:", err);
        }
      },
    });
  }

  // ────────────────────────────────────────────────
  // EDIT MESSAGE (inline edit via hover action)
  // ────────────────────────────────────────────────
  function startEditMessage(row) {
    if (row.dataset.editing === "1") return;
    const contentEl = row.querySelector(".msg-content");
    if (!contentEl) return;
    row.dataset.editing = "1";
    const original = contentEl.textContent || "";
    contentEl.dataset.original = original;
    contentEl.innerHTML = `
      <textarea class="edit-textarea w-full bg-surface-container-high border border-border-subtle rounded p-2 text-sm text-white resize-none" rows="2">${escapeHtml(original)}</textarea>
      <div class="flex gap-2 mt-2">
        <button type="button" class="btn-edit-save px-3 py-1 rounded text-xs font-bold btn-primary cursor-pointer">Save</button>
        <button type="button" class="btn-edit-cancel px-3 py-1 rounded text-xs bg-surface-container-highest text-white cursor-pointer">Cancel</button>
      </div>
    `;
    const ta = contentEl.querySelector(".edit-textarea");
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  function cancelEditMessage(row) {
    const contentEl = row.querySelector(".msg-content");
    if (!contentEl) return;
    contentEl.textContent = contentEl.dataset.original || "";
    delete row.dataset.editing;
    delete contentEl.dataset.original;
  }

  async function saveEditMessage(row) {
    const contentEl = row.querySelector(".msg-content");
    if (!contentEl) return;
    const ta = contentEl.querySelector(".edit-textarea");
    if (!ta) return;
    const content = ta.value.trim();
    if (!content) return;
    const msgId = row.dataset.messageId;
    try {
      const res = await fetch(`/api/v1/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.status === "success") {
        contentEl.textContent = content;
        delete row.dataset.editing;
        delete contentEl.dataset.original;
        const badge = row.querySelector(".msg-edited-badge");
        if (badge) badge.classList.remove("hidden");
      } else {
        alert(data.message || "Failed to edit message");
      }
    } catch (err) {
      console.error("Edit message error:", err);
      alert("Failed to edit message");
    }
  }

  messageFeed?.addEventListener("click", (e) => {
    const row = e.target.closest(".message-hover");
    if (!row) return;
    if (e.target.closest(".att-preview")) {
      e.preventDefault();
      const btn = e.target.closest(".att-preview");
      openFilePreview(btn?.dataset.attPreview, btn?.dataset.attName);
    } else if (e.target.closest(".btn-edit-save")) {
      e.preventDefault();
      saveEditMessage(row);
    } else if (e.target.closest(".btn-edit-cancel")) {
      e.preventDefault();
      cancelEditMessage(row);
    } else if (e.target.closest(".btn-edit")) {
      e.preventDefault();
      startEditMessage(row);
    } else if (e.target.closest(".btn-delete")) {
      e.preventDefault();
      deleteMessage(row);
    } else if (e.target.closest(".btn-reply")) {
      e.preventDefault();
      setReplyingTo(row);
    } else if (e.target.closest(".btn-react, .btn-react-pill")) {
      e.preventDefault();
      const btn = e.target.closest(".btn-react, .btn-react-pill");
      toggleReaction(row, btn?.dataset.emoji);
    }
  });

  // ────────────────────────────────────────────────
  // ────────────────────────────────────────────────
  // CONFIRM DIALOG (centered popup)
  // ────────────────────────────────────────────────
  let confirmCallback = null;
  function showConfirmDialog({ title = "Confirm", message = "Are you sure?", confirmText = "Confirm", onConfirm } = {}) {
    confirmCallback = onConfirm;
    const dialog = document.getElementById("confirm-dialog");
    if (!dialog) return;
    const titleEl = document.getElementById("confirm-dialog-title");
    const msgEl = document.getElementById("confirm-dialog-message");
    const okBtn = document.getElementById("confirm-dialog-ok");
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okBtn) okBtn.textContent = confirmText;
    dialog.classList.remove("hidden");
  }
  function closeConfirmDialog() {
    confirmCallback = null;
    const dialog = document.getElementById("confirm-dialog");
    if (dialog) dialog.classList.add("hidden");
  }

  // CREATE CHANNEL MODAL
  // ────────────────────────────────────────────────
  const modal = document.getElementById("create-room-modal");
  const openBtn = document.getElementById("open-create-room-modal");
  const closeBtn = document.getElementById("close-create-room-modal");
  const cancelBtn = document.getElementById("cancel-create-room");
  const createRoomForm = document.getElementById("create-room-form");

  openBtn?.addEventListener("click", () => modal?.classList.remove("hidden"));
  closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));
  cancelBtn?.addEventListener("click", () => modal?.classList.add("hidden"));
  modal?.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

  const confirmDialog = document.getElementById("confirm-dialog");
  const confirmOkBtn = document.getElementById("confirm-dialog-ok");
  const confirmCancelBtn = document.getElementById("confirm-dialog-cancel");
  const confirmCloseBtn = document.getElementById("confirm-dialog-close");
  confirmOkBtn?.addEventListener("click", () => {
    const cb = confirmCallback;
    closeConfirmDialog();
    if (typeof cb === "function") cb();
  });
  confirmCancelBtn?.addEventListener("click", closeConfirmDialog);
  confirmCloseBtn?.addEventListener("click", closeConfirmDialog);
  confirmDialog?.addEventListener("click", (e) => { if (e.target === confirmDialog) closeConfirmDialog(); });

  // FILE PREVIEW MODAL (inline viewer for images & PDFs)
  const filePreviewModal = document.getElementById("file-preview-modal");
  const filePreviewFrame = document.getElementById("file-preview-frame");
  const filePreviewName = document.getElementById("file-preview-name");
  const filePreviewDownload = document.getElementById("file-preview-download");
  const filePreviewClose = document.getElementById("file-preview-close");

  function openFilePreview(url, name) {
    if (!url) return;
    if (filePreviewFrame) filePreviewFrame.src = url;
    if (filePreviewName) filePreviewName.textContent = name || "Attachment";
    if (filePreviewDownload) filePreviewDownload.href = url;
    filePreviewModal?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function closeFilePreview() {
    filePreviewModal?.classList.add("hidden");
    if (filePreviewFrame) filePreviewFrame.src = "";
    document.body.style.overflow = "";
  }
  filePreviewClose?.addEventListener("click", closeFilePreview);
  filePreviewModal?.addEventListener("click", (e) => {
    if (e.target === filePreviewModal) closeFilePreview();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFilePreview();
  });

  // ────────────────────────────────────────────────
  // WORKSPACE MENU (badge dropdown)
  // ────────────────────────────────────────────────
  const wsMenuBtn = document.getElementById("workspace-menu-btn");
  const wsMenu = document.getElementById("workspace-menu");
  const wsCanManage = wsMenuBtn?.dataset.canManage === "true";

  wsMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    wsMenu?.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (wsMenuBtn?.contains(e.target)) return;
    if (!wsMenu?.contains(e.target)) wsMenu?.classList.add("hidden");
  });

  // ────────────────────────────────────────────────
  // WORKSPACE SETTINGS MODAL
  // ────────────────────────────────────────────────
  const wsSettingsModal = document.getElementById("workspace-settings-modal");
  const wsSettingsForm = document.getElementById("workspace-settings-form");
  const wsNameInput = document.getElementById("ws-name-input");
  const wsLogoInput = document.getElementById("ws-logo-input");
  const wsLogoPreview = document.getElementById("ws-logo-preview");
  const wsLogoIcon = document.getElementById("ws-logo-icon");
  const wsLogoInitials = document.getElementById("ws-logo-initials");
  const wsLogoRemove = document.getElementById("ws-logo-remove");
  const wsBadgeStyle = document.getElementById("ws-badge-style");

  function updateWsLogoPreview(url) {
    const hasLogo = !!url;
    wsLogoPreview?.classList.toggle("hidden", !hasLogo);
    if (hasLogo && wsLogoPreview) wsLogoPreview.src = url;
    const showIcon = !hasLogo && wsBadgeStyle?.value === "icon";
    const showInitials = !hasLogo && wsBadgeStyle?.value === "initials";
    wsLogoIcon?.classList.toggle("hidden", !showIcon);
    wsLogoInitials?.classList.toggle("hidden", !showInitials);
    if (showInitials && wsLogoInitials) wsLogoInitials.textContent = wsMenuBtn?.dataset.initials || "ET";
  }

  function openWsSettings() {
    if (wsNameInput) wsNameInput.value = wsMenuBtn?.dataset.name || "";
    if (wsBadgeStyle) wsBadgeStyle.value = wsMenuBtn?.dataset.badgeStyle || "initials";
    updateWsLogoPreview(wsMenuBtn?.dataset.logo || "");
    wsSettingsModal?.classList.remove("hidden");
  }

  wsBadgeStyle?.addEventListener("change", () => {
    const showLogo = wsLogoPreview && !wsLogoPreview.classList.contains("hidden");
    updateWsLogoPreview(showLogo ? wsLogoPreview.src : "");
  });

  wsLogoInput?.addEventListener("change", () => {
    const file = wsLogoInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateWsLogoPreview(reader.result);
    reader.readAsDataURL(file);
  });

  wsLogoRemove?.addEventListener("click", () => {
    if (wsLogoInput) wsLogoInput.value = "";
    updateWsLogoPreview("");
  });

  document.getElementById("ws-menu-settings")?.addEventListener("click", () => {
    wsMenu?.classList.add("hidden");
    openWsSettings();
  });

  document.getElementById("close-workspace-settings")?.addEventListener("click", () => wsSettingsModal?.classList.add("hidden"));
  document.getElementById("close-workspace-settings-ro")?.addEventListener("click", () => wsSettingsModal?.classList.add("hidden"));
  document.getElementById("cancel-workspace-settings")?.addEventListener("click", () => wsSettingsModal?.classList.add("hidden"));
  wsSettingsModal?.addEventListener("click", (e) => { if (e.target === wsSettingsModal) wsSettingsModal.classList.add("hidden"); });

  wsSettingsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = wsLogoInput?.files?.[0];
    const saveBtn = wsSettingsForm.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (file) {
        const fd = new FormData();
        fd.append("logo", file);
        const res = await fetch("/api/v1/workspace/logo", { method: "POST", body: fd });
        const data = await res.json();
        if (data.status !== "success") throw new Error(data.message || "Logo upload failed");
      }
      const showLogo = wsLogoPreview && !wsLogoPreview.classList.contains("hidden");
      const res = await fetch("/api/v1/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wsNameInput?.value,
          badgeStyle: wsBadgeStyle?.value,
          logo: showLogo || file ? undefined : null,
        }),
      });
      const data = await res.json();
      if (data.status !== "success") throw new Error(data.message || "Failed to save workspace settings");
      window.location.reload();
    } catch (err) {
      alert(err.message || "Failed to save workspace settings");
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // ────────────────────────────────────────────────
  // INVITE MEMBERS MODAL
  // ────────────────────────────────────────────────
  const inviteModal = document.getElementById("invite-members-modal");
  const inviteLink = document.getElementById("invite-link");
  const copyInviteBtn = document.getElementById("copy-invite-link");

  function openInviteModal() {
    if (inviteLink) inviteLink.value = window.location.origin;
    inviteModal?.classList.remove("hidden");
  }

  document.getElementById("ws-menu-invite")?.addEventListener("click", () => {
    wsMenu?.classList.add("hidden");
    openInviteModal();
  });
  document.getElementById("close-invite-members")?.addEventListener("click", () => inviteModal?.classList.add("hidden"));
  inviteModal?.addEventListener("click", (e) => { if (e.target === inviteModal) inviteModal.classList.add("hidden"); });

  copyInviteBtn?.addEventListener("click", async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink.value);
    } catch (err) {
      inviteLink.select();
      document.execCommand("copy");
    }
    copyInviteBtn.textContent = "Copied!";
    setTimeout(() => (copyInviteBtn.textContent = "Copy"), 1500);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    wsMenu?.classList.add("hidden");
    wsSettingsModal?.classList.add("hidden");
    inviteModal?.classList.add("hidden");
  });

  createRoomForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(createRoomForm);
    try {
      const res = await fetch("/api/v1/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          description: fd.get("description"),
          isPrivate: fd.get("isPrivate") === "on",
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        window.location.href = `/room/${data.data.room.slug}`;
      } else {
        alert(data.message || "Failed to create channel");
      }
    } catch (err) {
      console.error("Create room error:", err);
    }
  });

  // ────────────────────────────────────────────────
  // CHANNEL MANAGEMENT (Info Sidebar)
  // ────────────────────────────────────────────────
  function memberItemHTML(m) {
    const u = m.user || {};
    const isSelf = currentUserId && u._id && u._id.toString() === currentUserId;
    const removeBtn =
      canManage && !isSelf
        ? `<button class="p-1 rounded text-on-surface-variant btn-remove-member cursor-pointer" title="Remove ${escapeHtml(u.username || "user")}">
             <span class="material-symbols-outlined text-base">person_remove</span>
           </button>`
        : "";
    return `
      <div class="flex items-center gap-3 p-2 rounded bg-surface-container" data-user-id="${u._id || ""}">
        <div class="w-6 h-6 rounded bg-blue-500 overflow-hidden">
          <img class="w-full h-full object-cover" src="${escapeHtml(u.avatar || "/img/default.jpg")}" alt="${escapeHtml(u.username || "user")}" />
        </div>
        <span class="text-sm text-white">${escapeHtml(u.username || "user")}</span>
        <span class="ml-auto text-xs text-primary font-bold">${escapeHtml(m.role || "member")}</span>
        ${removeBtn}
      </div>`;
  }

  async function removeMember(userId, username) {
    showConfirmDialog({
      title: `Remove ${username || "member"}?`,
      message: `${username || "This member"} will no longer have access to this channel.`,
      confirmText: "Remove",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/v1/rooms/${roomId}/members/${userId}`, {
            method: "DELETE",
          });
          if (res.ok || res.status === 204) {
            refreshMembers();
          } else {
            const data = await res.json().catch(() => ({}));
            alert(data.message || "Failed to remove member");
          }
        } catch (err) {
          console.error("Remove member error:", err);
        }
      },
    });
  }

  document.getElementById("room-member-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-member");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const row = btn.closest("[data-user-id]");
    const username = row?.querySelector("span.text-white")?.textContent || "";
    removeMember(row?.dataset.userId, username);
  });

  async function refreshMembers() {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/v1/rooms/${roomId}/members`);
      const data = await res.json();
      const members = data?.data?.members || [];
      const list = document.getElementById("room-member-list");
      if (list) {
        list.innerHTML =
          members.map(memberItemHTML).join("") ||
          '<div class="text-sm text-on-surface-variant">No members yet</div>';
      }
      const countEl = document.getElementById("member-count");
      if (countEl) countEl.textContent = members.length;
      const headerCount = document.getElementById("header-member-count");
      if (headerCount) headerCount.textContent = `${members.length} members`;
    } catch (err) {
      console.error("Failed to refresh members:", err);
    }
  }

  // ADD MEMBERS MODAL
  const addMembersModal = document.getElementById("add-members-modal");
  const addMembersBtn = document.getElementById("add-members-btn");
  const closeAddMembersBtn = document.getElementById("close-add-members-modal");
  const cancelAddMembersBtn = document.getElementById("cancel-add-members");
  const candidateList = document.getElementById("candidate-list");
  const candidateSearch = document.getElementById("candidate-search");
  const confirmAddMembersBtn = document.getElementById("confirm-add-members");
  let candidateUsers = [];

  function renderCandidates(list) {
    if (!candidateList) return;
    if (!list.length) {
      candidateList.innerHTML = '<div class="text-sm text-on-surface-variant">No users to add</div>';
      return;
    }
    candidateList.innerHTML = list
      .map(
        (u) => `
        <label class="flex items-center gap-3 p-2 rounded bg-surface-container cursor-pointer">
          <input type="checkbox" class="candidate-check shrink-0" value="${u._id}" />
          <img class="w-6 h-6 rounded bg-blue-500 shrink-0" src="${escapeHtml(u.avatar || "/img/default.jpg")}" alt="" />
          <span class="text-sm text-white truncate">${escapeHtml(u.username)}</span>
          <span class="ml-auto text-xs text-on-surface-variant truncate">${escapeHtml(u.email || "")}</span>
        </label>`,
      )
      .join("");
  }

  async function loadCandidates() {
    if (!candidateList || !roomId) return;
    candidateList.innerHTML = '<div class="text-sm text-on-surface-variant">Loading users...</div>';
    try {
      const res = await fetch(`/api/v1/rooms/${roomId}/candidates`);
      const data = await res.json();
      candidateUsers = data?.data?.users || [];
      renderCandidates(candidateUsers);
    } catch (err) {
      candidateList.innerHTML = '<div class="text-sm text-error">Failed to load users</div>';
    }
  }

  addMembersBtn?.addEventListener("click", () => {
    addMembersModal?.classList.remove("hidden");
    if (candidateSearch) candidateSearch.value = "";
    loadCandidates();
  });
  closeAddMembersBtn?.addEventListener("click", () => addMembersModal?.classList.add("hidden"));
  cancelAddMembersBtn?.addEventListener("click", () => addMembersModal?.classList.add("hidden"));
  addMembersModal?.addEventListener("click", (e) => {
    if (e.target === addMembersModal) addMembersModal.classList.add("hidden");
  });
  candidateSearch?.addEventListener("input", () => {
    const q = (candidateSearch.value || "").toLowerCase();
    renderCandidates(
      candidateUsers.filter(
        (u) =>
          (u.username || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q),
      ),
    );
  });
  confirmAddMembersBtn?.addEventListener("click", async () => {
    const checked = [...document.querySelectorAll(".candidate-check:checked")].map((c) => c.value);
    if (!checked.length) return;
    try {
      const res = await fetch(`/api/v1/rooms/${roomId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: checked }),
      });
      const data = await res.json();
      if (data.status === "success") {
        addMembersModal?.classList.add("hidden");
        refreshMembers();
      } else {
        alert(data.message || "Failed to add members");
      }
    } catch (err) {
      console.error("Add members error:", err);
    }
  });

  // EDIT CHANNEL DESCRIPTION
  const editDescBtn = document.getElementById("edit-desc-btn");
  const editDescForm = document.getElementById("edit-desc-form");
  const editDescInput = document.getElementById("edit-desc-input");
  const roomDescText = document.getElementById("room-desc-text");
  const cancelEditDesc = document.getElementById("cancel-edit-desc");

  editDescBtn?.addEventListener("click", () => {
    editDescForm?.classList.remove("hidden");
    roomDescText?.classList.add("hidden");
    editDescBtn?.classList.add("hidden");
    editDescInput?.focus();
  });
  cancelEditDesc?.addEventListener("click", () => {
    editDescForm?.classList.add("hidden");
    roomDescText?.classList.remove("hidden");
    editDescBtn?.classList.remove("hidden");
  });
  editDescForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const topic = (editDescInput?.value || "").trim();
    const slug = mainEl?.dataset.roomSlug;
    if (!slug) return;
    try {
      const res = await fetch(`/api/v1/rooms/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (data.status === "success") {
        if (roomDescText) roomDescText.textContent = data.data.room.topic || "No description provided.";
        editDescForm?.classList.add("hidden");
        roomDescText?.classList.remove("hidden");
        editDescBtn?.classList.remove("hidden");
      } else {
        alert(data.message || "Failed to update description");
      }
    } catch (err) {
      console.error("Description update error:", err);
    }
  });

  // LEAVE / DELETE CHANNEL
  const leaveRoomBtn = document.getElementById("leave-room-btn");
  leaveRoomBtn?.addEventListener("click", () => {
    showConfirmDialog({
      title: "Leave channel?",
      message: "You will no longer be a member of this channel.",
      confirmText: "Leave",
      onConfirm: async () => {
        try {
          await fetch(`/api/v1/rooms/${roomId}/leave`, { method: "DELETE" });
          window.location.href = "/";
        } catch (err) {
          console.error("Leave room error:", err);
        }
      },
    });
  });

  const deleteRoomBtn = document.getElementById("delete-room-btn");
  deleteRoomBtn?.addEventListener("click", () => {
    showConfirmDialog({
      title: "Delete channel?",
      message: "This channel and all its messages will be permanently deleted. This action cannot be undone.",
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          await fetch(`/api/v1/rooms/${mainEl?.dataset.roomSlug}`, { method: "DELETE" });
          window.location.href = "/";
        } catch (err) {
          console.error("Delete room error:", err);
        }
      },
    });
  });

  // ────────────────────────────────────────────────
  // LOGOUT
  // ────────────────────────────────────────────────
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    try {
      await fetch("/api/v1/users/logout", { method: "POST" });
    } catch (_) {}
    window.location.href = "/login";
  });

  // ────────────────────────────────────────────────
  // LOGIN FORM
  // ────────────────────────────────────────────────
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("auth-error-alert");
    const btn = document.getElementById("login-btn");
    if (btn) btn.textContent = "Signing in...";

    try {
      const res = await fetch("/api/v1/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        window.location.href = "/";
      } else {
        if (alertEl) { alertEl.innerText = data.message || "Login failed. Please try again."; alertEl.classList.remove("hidden"); }
        if (btn) btn.textContent = "Sign In";
      }
    } catch (err) {
      if (alertEl) { alertEl.innerText = "Network error. Please try again."; alertEl.classList.remove("hidden"); }
      if (btn) btn.textContent = "Sign In";
    }
  });

  // ────────────────────────────────────────────────
  // SIGNUP FORM
  // ────────────────────────────────────────────────
  document.getElementById("signup-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("auth-error-alert");
    const btn = document.getElementById("signup-btn");
    if (btn) btn.textContent = "Creating account...";

    try {
      const res = await fetch("/api/v1/users/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("username").value,
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
          passwordConfirm: document.getElementById("passwordConfirm").value,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        window.location.href = "/";
      } else {
        if (alertEl) { alertEl.innerText = data.message || "Signup failed. Please try again."; alertEl.classList.remove("hidden"); }
        if (btn) btn.textContent = "Create Account";
      }
    } catch (err) {
      if (alertEl) { alertEl.innerText = "Network error. Please try again."; alertEl.classList.remove("hidden"); }
      if (btn) btn.textContent = "Create Account";
    }
  });

  // ────────────────────────────────────────────────
  // FORGOT PASSWORD FORM
  // ────────────────────────────────────────────────
  document.getElementById("forgot-password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("forgot-alert");
    const successEl = document.getElementById("forgot-success");
    try {
      const res = await fetch("/api/v1/users/forgotPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: document.getElementById("forgot-email").value }),
      });
      const data = await res.json();
      if (data.status === "success") {
        if (successEl) { successEl.innerText = "Reset email sent! Check your inbox."; successEl.classList.remove("hidden"); }
        if (alertEl) alertEl.classList.add("hidden");
      } else {
        if (alertEl) { alertEl.innerText = data.message || "Failed to send reset email."; alertEl.classList.remove("hidden"); }
      }
    } catch (err) {
      if (alertEl) { alertEl.innerText = "Network error. Please try again."; alertEl.classList.remove("hidden"); }
    }
  });

  // ────────────────────────────────────────────────
  // RESET PASSWORD FORM
  // ────────────────────────────────────────────────
  const resetForm = document.getElementById("reset-password-form");
  resetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = resetForm.dataset.token;
    const alertEl = document.getElementById("reset-alert");
    try {
      const res = await fetch(`/api/v1/users/resetPassword/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: document.getElementById("reset-password").value,
          passwordConfirm: document.getElementById("reset-passwordConfirm").value,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        window.location.href = "/";
      } else {
        if (alertEl) { alertEl.innerText = data.message || "Reset failed."; alertEl.classList.remove("hidden"); }
      }
    } catch (err) {
      if (alertEl) { alertEl.innerText = "Network error. Please try again."; alertEl.classList.remove("hidden"); }
    }
  });

  // ────────────────────────────────────────────────
  // ACCOUNT — UPDATE PROFILE
  // ────────────────────────────────────────────────
  // Avatar preview
  document.getElementById("photo-input")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById("avatar-preview");
        if (preview) preview.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById("update-profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const successEl = document.getElementById("profile-success-alert");
    const formData = new FormData(e.target);
    try {
      const res = await fetch("/api/v1/users/updateMe", { method: "PATCH", body: formData });
      const data = await res.json();
      if (data.status === "success") {
        if (successEl) { successEl.innerText = "Profile updated successfully!"; successEl.classList.remove("hidden"); }
      } else {
        alert(data.message || "Update failed");
      }
    } catch (err) {
      console.error("Profile update error:", err);
    }
  });

  // ────────────────────────────────────────────────
  // ACCOUNT — UPDATE PASSWORD
  // ────────────────────────────────────────────────
  document.getElementById("update-password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const successEl = document.getElementById("password-success-alert");
    try {
      const res = await fetch("/api/v1/users/updateMyPassword", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passwordCurrent: document.getElementById("currentPassword").value,
          password: document.getElementById("newPassword").value,
          passwordConfirm: document.getElementById("confirmPassword").value,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        if (successEl) { successEl.innerText = "Password updated successfully!"; successEl.classList.remove("hidden"); }
        e.target.reset();
      } else {
        alert(data.message || "Password update failed");
      }
    } catch (err) {
      console.error("Password update error:", err);
    }
  });

  // ────────────────────────────────────────────────
  // ACCOUNT — DEACTIVATE ACCOUNT
  // ────────────────────────────────────────────────
  document.getElementById("delete-account-btn")?.addEventListener("click", async () => {
    if (!confirm("Are you sure? This will deactivate your account.")) return;
    try {
      await fetch("/api/v1/users/deleteMe", { method: "DELETE" });
      window.location.href = "/login";
    } catch (err) {
      console.error("Deactivate error:", err);
    }
  });

  // ────────────────────────────────────────────────
  // INFO SIDEBAR TOGGLE (Room view)
  // ────────────────────────────────────────────────
  const infoSidebar = document.getElementById("info-sidebar");
  document.getElementById("toggle-info-btn")?.addEventListener("click", () => {
    infoSidebar?.classList.toggle("hidden");
    infoSidebar?.classList.toggle("flex");
  });
  document.getElementById("close-info-btn")?.addEventListener("click", () => {
    infoSidebar?.classList.add("hidden");
    infoSidebar?.classList.remove("flex");
  });
});
