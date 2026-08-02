document.addEventListener("DOMContentLoaded", () => {
  // Initialize Socket.io Connection
  const socket = typeof io !== "undefined" ? io() : null;

  const mainContainer = document.querySelector("main");
  const roomId = mainContainer ? mainContainer.dataset.roomId : null;
  const recipientId = mainContainer ? mainContainer.dataset.recipientId : null;

  // 1. Join Socket Room if inside a channel
  if (socket && roomId) {
    socket.emit("joinRoom", { roomId });

    // Listen for incoming real-time messages
    socket.on("receiveMessage", (msg) => {
      appendMessageToFeed(msg);
    });

    // Listen for typing events
    socket.on("userTyping", ({ username }) => {
      const typingEl = document.getElementById("typing-indicator");
      if (typingEl) {
        typingEl.innerText = `${username} is typing...`;
        typingEl.classList.remove("hidden");
        setTimeout(() => typingEl.classList.add("hidden"), 3000);
      }
    });

    // Listen for reaction updates
    socket.on("reactionUpdated", ({ messageId, reactions }) => {
      console.log("Reaction updated:", messageId, reactions);
    });
  }

  // 2. Scroll chat feed to bottom on load
  const messageFeed = document.getElementById("message-feed");
  if (messageFeed) {
    messageFeed.scrollTop = messageFeed.scrollHeight;
  }

  // 3. Handle Chat Input & Form Submission
  const chatForm = document.getElementById("chat-form");
  const messageInput = document.getElementById("message-input");
  const attachmentInput = document.getElementById("attachment-file-input");

  if (chatForm && messageInput) {
    // Send typing notification
    let typingTimeout;
    messageInput.addEventListener("input", () => {
      if (socket && roomId) {
        clearTimeout(typingTimeout);
        socket.emit("typing", { roomId });
      }
    });

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = messageInput.value.trim();
      if (!content && (!attachmentInput || !attachmentInput.files.length)) return;

      if (roomId) {
        // Send Channel Message via HTTP REST / Socket
        const formData = new FormData();
        formData.append("content", content);
        if (attachmentInput && attachmentInput.files.length) {
          formData.append("attachments", attachmentInput.files[0]);
        }

        try {
          const res = await fetch(`/api/v1/rooms/${roomId}/messages`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.status === "success") {
            messageInput.value = "";
            if (attachmentInput) attachmentInput.value = "";
            const filePreview = document.getElementById("file-name-preview");
            if (filePreview) filePreview.innerText = "";
            
            // Also emit via socket for instant broadcast
            if (socket) {
              socket.emit("sendMessage", {
                roomId,
                message: data.data.message,
              });
            }
            appendMessageToFeed(data.data.message);
          }
        } catch (err) {
          console.error("Error sending message:", err);
        }
      }
    });
  }

  // Helper to append message to feed
  function appendMessageToFeed(msg) {
    if (!messageFeed) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = "flex gap-4 group message-hover";
    const senderName = msg.sender ? (msg.sender.username || "User") : "User";
    const senderAvatar = (msg.sender && msg.sender.avatar) ? msg.sender.avatar : "/img/default.jpg";
    const timeStr = new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    msgDiv.innerHTML = `
      <div class="shrink-0 w-10 h-10 rounded-lg bg-indigo-500 overflow-hidden mt-1">
        <img class="w-full h-full object-cover" src="${senderAvatar}" alt="avatar" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2">
          <span class="text-label-md text-text-primary font-bold hover:underline cursor-pointer">${senderName}</span>
          <span class="text-caption text-text-timestamp">${timeStr}</span>
        </div>
        <div class="text-body-md text-on-surface mt-1 leading-relaxed">${msg.content}</div>
      </div>
    `;
    messageFeed.appendChild(msgDiv);
    messageFeed.scrollTop = messageFeed.scrollHeight;
  }

  // 4. Create Room Modal Actions
  const openModalBtn = document.getElementById("open-create-room-modal");
  const closeModalBtn = document.getElementById("close-create-room-modal");
  const cancelModalBtn = document.getElementById("cancel-create-room");
  const modal = document.getElementById("create-room-modal");
  const createRoomForm = document.getElementById("create-room-form");

  if (openModalBtn && modal) openModalBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  if (closeModalBtn && modal) closeModalBtn.addEventListener("click", () => modal.classList.add("hidden"));
  if (cancelModalBtn && modal) cancelModalBtn.addEventListener("click", () => modal.classList.add("hidden"));

  if (createRoomForm) {
    createRoomForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(createRoomForm);
      const body = {
        name: formData.get("name"),
        description: formData.get("description"),
        isPrivate: formData.get("isPrivate") === "on",
      };

      try {
        const res = await fetch("/api/v1/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.status === "success") {
          window.location.href = `/room/${data.data.room.slug}`;
        } else {
          alert(data.message || "Failed to create channel");
        }
      } catch (err) {
        console.error("Error creating channel:", err);
      }
    });
  }

  // 5. Authentication Form Handlers
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      const alertEl = document.getElementById("auth-error-alert");

      try {
        const res = await fetch("/api/v1/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.status === "success") {
          window.location.href = "/";
        } else {
          alertEl.innerText = data.message || "Login failed";
          alertEl.classList.remove("hidden");
        }
      } catch (err) {
        console.error("Login error:", err);
      }
    });
  }

  const signupForm = document.getElementById("signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value;
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      const passwordConfirm = document.getElementById("passwordConfirm").value;
      const alertEl = document.getElementById("auth-error-alert");

      try {
        const res = await fetch("/api/v1/users/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password, passwordConfirm }),
        });
        const data = await res.json();
        if (data.status === "success") {
          window.location.href = "/";
        } else {
          alertEl.innerText = data.message || "Signup failed";
          alertEl.classList.remove("hidden");
        }
      } catch (err) {
        console.error("Signup error:", err);
      }
    });
  }

  // Logout handler
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await fetch("/api/v1/users/logout", { method: "POST" });
      window.location.href = "/login";
    });
  }
});
