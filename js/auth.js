// ==============================================================================
// GadgetVerse — Authentication Controller (Supabase Auth v2)
// ==============================================================================

(function initAuthModule() {
  let currentUser = null;
  let currentSession = null;
  let lastSignupEmail = "";
  let resendTimer = null;
  let resendSeconds = 0;
  let modalCloseTimer = null;
  let authSubscription = null;
  let authEventsWired = false;
  let lastRenderedUserId = undefined;

  // ---------- Event Dispatch Helper ----------
  function dispatchAuthChangeEvent(event, session) {
    try {
      const detail = {
        user: session?.user || null,
        session: session || null,
        event: event || "UNKNOWN"
      };
      const customEvent = new CustomEvent("gv:auth-change", {
        detail,
        bubbles: true,
        cancelable: false
      });
      window.dispatchEvent(customEvent);
    } catch (err) {
      console.error("[GadgetVerse] Error dispatching gv:auth-change:", err?.message || err);
    }
  }

  // ---------- Global Session Helper ----------
  async function getGadgetVerseSession() {
    try {
      if (!window.supabaseClient || !window.supabaseClient.auth) {
        return currentSession || null;
      }
      const { data, error } = await window.supabaseClient.auth.getSession();
      if (error) {
        console.warn("[GadgetVerse] getSession error:", error.message);
        return currentSession || null;
      }
      currentSession = data?.session || null;
      return currentSession;
    } catch (err) {
      console.warn("[GadgetVerse] getGadgetVerseSession exception:", err?.message || err);
      return currentSession || null;
    }
  }

  // Expose global helper early so scripts loaded after auth.js have immediate access
  window.getGadgetVerseSession = getGadgetVerseSession;

  // ---------- SVG Icons ----------
  const ICONS = {
    google: `<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>`,
    eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
  };

  // ---------- Modal Template ----------
  function buildAuthModalHTML() {
    return `
    <div class="auth-overlay" id="gvAuthModal" aria-hidden="true">
      <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button class="auth-close" id="authCloseBtn" aria-label="Close dialog">${ICONS.close}</button>

        <!-- Tabs (Sign In / Sign Up) -->
        <div class="auth-tabs" id="authTabs">
          <button class="auth-tab active" data-tab="signin">Sign In</button>
          <button class="auth-tab" data-tab="signup">Sign Up</button>
        </div>

        <!-- Alert Banner -->
        <div class="auth-alert" id="authAlert" role="alert">
          <span class="auth-alert-icon"></span>
          <span class="auth-alert-text"></span>
        </div>

        <!-- VIEW: Sign In -->
        <div class="auth-view active" id="viewSignIn">
          <h2 class="auth-title" id="authTitle">Welcome back</h2>
          <p class="auth-subtitle">Sign in to your GadgetVerse account</p>

          <form id="signInForm" autocomplete="on">
            <div class="auth-form-group">
              <label for="signInEmail">Email address</label>
              <input type="email" id="signInEmail" class="auth-input" placeholder="you@example.com" required autocomplete="email">
            </div>

            <div class="auth-form-group">
              <label for="signInPassword">Password</label>
              <div class="auth-input-wrapper">
                <input type="password" id="signInPassword" class="auth-input" placeholder="••••••••" required autocomplete="current-password">
                <button type="button" class="toggle-pwd" data-target="signInPassword" aria-label="Toggle password visibility">${ICONS.eye}</button>
              </div>
            </div>

            <div class="auth-extra-links">
              <button type="button" class="auth-link" id="goToForgotBtn">Forgot password?</button>
            </div>

            <button type="submit" class="auth-submit-btn" id="signInSubmitBtn">
              <span>Sign In</span>
            </button>
          </form>

          <div class="auth-divider">or continue with</div>

          <button type="button" class="auth-google-btn" id="googleSignInBtn">
            ${ICONS.google}
            <span>Sign in with Google</span>
          </button>

          <p class="auth-switch-note">
            Don't have an account? <button type="button" id="switchToSignUp">Sign up</button>
          </p>
        </div>

        <!-- VIEW: Sign Up -->
        <div class="auth-view" id="viewSignUp">
          <h2 class="auth-title">Create account</h2>
          <p class="auth-subtitle">Join GadgetVerse to track prices and reviews</p>

          <form id="signUpForm" autocomplete="on">
            <div class="auth-form-group">
              <label for="signUpName">Full Name</label>
              <input type="text" id="signUpName" class="auth-input" placeholder="Alex Morgan" required autocomplete="name">
            </div>

            <div class="auth-form-group">
              <label for="signUpEmail">Email address</label>
              <input type="email" id="signUpEmail" class="auth-input" placeholder="you@example.com" required autocomplete="email">
            </div>

            <div class="auth-form-group">
              <label for="signUpPassword">Password</label>
              <div class="auth-input-wrapper">
                <input type="password" id="signUpPassword" class="auth-input" placeholder="At least 6 characters" minlength="6" required autocomplete="new-password">
                <button type="button" class="toggle-pwd" data-target="signUpPassword" aria-label="Toggle password visibility">${ICONS.eye}</button>
              </div>
            </div>

            <div class="auth-form-group">
              <label for="signUpConfirmPassword">Confirm Password</label>
              <div class="auth-input-wrapper">
                <input type="password" id="signUpConfirmPassword" class="auth-input" placeholder="Repeat password" minlength="6" required autocomplete="new-password">
                <button type="button" class="toggle-pwd" data-target="signUpConfirmPassword" aria-label="Toggle password visibility">${ICONS.eye}</button>
              </div>
            </div>

            <button type="submit" class="auth-submit-btn" id="signUpSubmitBtn">
              <span>Create Account</span>
            </button>
          </form>

          <div class="auth-divider">or continue with</div>

          <button type="button" class="auth-google-btn" id="googleSignUpBtn">
            ${ICONS.google}
            <span>Sign up with Google</span>
          </button>

          <p class="auth-switch-note">
            Already have an account? <button type="button" id="switchToSignIn">Sign in</button>
          </p>
        </div>

        <!-- VIEW: Email Confirmation Notice -->
        <div class="auth-view" id="viewConfirmation">
          <h2 class="auth-title">Check your inbox</h2>
          <p class="auth-subtitle">We sent a confirmation link to <strong id="confirmationEmailTarget" style="color:var(--text-1)"></strong>.</p>
          <p style="font-size:0.85rem;color:var(--text-2);margin-bottom:20px;line-height:1.5;">
            Click the link in the email to activate your account and start tracking prices.
          </p>

          <div class="auth-resend-box">
            <button type="button" class="auth-resend-btn" id="resendConfirmationBtn">
              Resend confirmation email
            </button>
          </div>

          <p class="auth-switch-note" style="margin-top:24px;">
            Done confirming? <button type="button" id="confirmedGoSignIn">Return to Sign In</button>
          </p>
        </div>

        <!-- VIEW: Forgot Password -->
        <div class="auth-view" id="viewForgot">
          <h2 class="auth-title">Reset password</h2>
          <p class="auth-subtitle">Enter your email and we'll send you a password reset link.</p>

          <form id="forgotForm">
            <div class="auth-form-group">
              <label for="forgotEmail">Email address</label>
              <input type="email" id="forgotEmail" class="auth-input" placeholder="you@example.com" required autocomplete="email">
            </div>

            <button type="submit" class="auth-submit-btn" id="forgotSubmitBtn">
              <span>Send Reset Link</span>
            </button>
          </form>

          <p class="auth-switch-note">
            Remember your password? <button type="button" id="forgotBackToSignIn">Back to Sign In</button>
          </p>
        </div>

        <!-- VIEW: Set New Password (Triggered via email reset link) -->
        <div class="auth-view" id="viewUpdatePassword">
          <h2 class="auth-title">Set new password</h2>
          <p class="auth-subtitle">Create a secure new password for your account.</p>

          <form id="updatePasswordForm">
            <div class="auth-form-group">
              <label for="newPassword">New Password</label>
              <div class="auth-input-wrapper">
                <input type="password" id="newPassword" class="auth-input" placeholder="At least 6 characters" minlength="6" required autocomplete="new-password">
                <button type="button" class="toggle-pwd" data-target="newPassword" aria-label="Toggle password visibility">${ICONS.eye}</button>
              </div>
            </div>

            <div class="auth-form-group">
              <label for="confirmNewPassword">Confirm New Password</label>
              <div class="auth-input-wrapper">
                <input type="password" id="confirmNewPassword" class="auth-input" placeholder="Repeat password" minlength="6" required autocomplete="new-password">
                <button type="button" class="toggle-pwd" data-target="confirmNewPassword" aria-label="Toggle password visibility">${ICONS.eye}</button>
              </div>
            </div>

            <button type="submit" class="auth-submit-btn" id="updatePasswordSubmitBtn">
              <span>Update Password</span>
            </button>
          </form>
        </div>

      </div>
    </div>`;
  }

  // ---------- UI State Helpers ----------
  function getModal() { return document.getElementById("gvAuthModal"); }

  function showAlert(msg, type = "error") {
    const alert = document.getElementById("authAlert");
    if (!alert) return;
    alert.className = `auth-alert show ${type}`;
    const iconEl = alert.querySelector(".auth-alert-icon");
    const textEl = alert.querySelector(".auth-alert-text");
    if (iconEl) iconEl.innerHTML = type === "success" ? ICONS.check : ICONS.alert;
    if (textEl) textEl.textContent = msg;
  }

  function hideAlert() {
    const alert = document.getElementById("authAlert");
    if (alert) alert.className = "auth-alert";
  }

  function setButtonLoading(btn, isLoading, defaultText) {
    if (!btn) return;
    btn.disabled = isLoading;
    const span = btn.querySelector("span");
    if (span) {
      if (isLoading) {
        span.innerHTML = `<span class="auth-spinner"></span> Please wait...`;
      } else {
        span.textContent = defaultText;
      }
    }
  }

  function switchView(viewName) {
    hideAlert();
    const views = {
      signin: document.getElementById("viewSignIn"),
      signup: document.getElementById("viewSignUp"),
      confirmation: document.getElementById("viewConfirmation"),
      forgot: document.getElementById("viewForgot"),
      updatePassword: document.getElementById("viewUpdatePassword")
    };

    const tabsContainer = document.getElementById("authTabs");
    const tabSignIn = document.querySelector('.auth-tab[data-tab="signin"]');
    const tabSignUp = document.querySelector('.auth-tab[data-tab="signup"]');

    // Show/hide views
    Object.keys(views).forEach(key => {
      if (views[key]) views[key].classList.toggle("active", key === viewName);
    });

    // Control tabs visibility
    if (tabsContainer) {
      if (viewName === "signin" || viewName === "signup") {
        tabsContainer.style.display = "flex";
        if (tabSignIn) tabSignIn.classList.toggle("active", viewName === "signin");
        if (tabSignUp) tabSignUp.classList.toggle("active", viewName === "signup");
      } else {
        tabsContainer.style.display = "none";
      }
    }
  }

  function openAuthModal(viewName = "signin") {
    const modal = getModal();
    if (!modal) return;
    if (modalCloseTimer) {
      clearTimeout(modalCloseTimer);
      modalCloseTimer = null;
    }
    switchView(viewName);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeAuthModal() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    hideAlert();

    if (modalCloseTimer) {
      clearTimeout(modalCloseTimer);
      modalCloseTimer = null;
    }
    if (resendTimer) {
      clearInterval(resendTimer);
      resendTimer = null;
    }
  }

  // ---------- Navbar Auth Rendering ----------
  function renderNavAuth(user) {
    const newUserId = user ? user.id || user.email : null;
    if (lastRenderedUserId === newUserId && document.getElementById("navAuthContainer")) {
      currentUser = user;
      return;
    }
    currentUser = user;
    lastRenderedUserId = newUserId;

    let container = document.getElementById("navAuthContainer");
    if (!container) {
      const navActions = document.querySelector(".nav-actions");
      if (!navActions) return;
      container = document.createElement("div");
      container.id = "navAuthContainer";
      container.className = "nav-auth-container";
      const hamburger = navActions.querySelector(".hamburger");
      if (hamburger) {
        navActions.insertBefore(container, hamburger);
      } else {
        navActions.appendChild(container);
      }
    }

    if (user && user.email) {
      const initial = (user.user_metadata?.full_name || user.email).charAt(0).toUpperCase();
      container.innerHTML = `
        <div class="user-menu" id="userMenuWrapper">
          <button class="user-pill" id="userMenuBtn" aria-haspopup="true" aria-expanded="false" title="${user.email}">
            <span class="user-avatar">${initial}</span>
            <span class="user-email-text">${user.email}</span>
          </button>
          <div class="user-dropdown" id="userDropdownMenu" role="menu">
            <div class="user-dropdown-header">
              <small>Signed in as</small>
              <span>${user.email}</span>
            </div>
            <button class="user-dropdown-item logout" id="logoutBtn" role="menuitem">
              ${ICONS.logout}
              <span>Sign Out</span>
            </button>
          </div>
        </div>`;

      const menuBtn = container.querySelector("#userMenuBtn");
      const dropdown = container.querySelector("#userDropdownMenu");
      const logoutBtn = container.querySelector("#logoutBtn");

      menuBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle("open");
        menuBtn.setAttribute("aria-expanded", String(isOpen));
      });

      logoutBtn?.addEventListener("click", handleSignOut);
    } else {
      container.innerHTML = `
        <button class="btn btn-ghost btn-sm nav-auth-btn" id="openSignInBtn">
          ${ICONS.user}
          <span>Sign In</span>
        </button>`;

      container.querySelector("#openSignInBtn")?.addEventListener("click", () => {
        openAuthModal("signin");
      });
    }
  }

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("userDropdownMenu");
    const menuWrapper = document.getElementById("userMenuWrapper");
    if (dropdown && dropdown.classList.contains("open")) {
      if (!menuWrapper || !menuWrapper.contains(e.target)) {
        dropdown.classList.remove("open");
        document.getElementById("userMenuBtn")?.setAttribute("aria-expanded", "false");
      }
    }
  });

  // ---------- Redirect URL Helper ----------
  function getAuthRedirectUrl() {
    if (window.location.origin && window.location.origin !== "null") {
      return window.location.origin + window.location.pathname;
    }
    return window.location.href.split("#")[0].split("?")[0];
  }

  // ---------- Supabase Client Getter ----------
  function getClient() {
    if (!window.supabaseClient) {
      showAlert("Supabase client is not ready. Please verify your publishable key in js/supabase.js.", "error");
      return null;
    }
    return window.supabaseClient;
  }

  // ---------- Auth Actions ----------
  async function handleSignUp(e) {
    e.preventDefault();
    hideAlert();
    const client = getClient();
    if (!client) return;

    const name = document.getElementById("signUpName").value.trim();
    const email = document.getElementById("signUpEmail").value.trim();
    const password = document.getElementById("signUpPassword").value;
    const confirmPassword = document.getElementById("signUpConfirmPassword").value;
    const btn = document.getElementById("signUpSubmitBtn");

    if (password !== confirmPassword) {
      showAlert("Passwords do not match.", "error");
      return;
    }
    if (password.length < 6) {
      showAlert("Password must be at least 6 characters.", "error");
      return;
    }

    setButtonLoading(btn, true, "Create Account");

    try {
      const redirectUrl = getAuthRedirectUrl();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        showAlert(error.message, "error");
        return;
      }

      lastSignupEmail = email;

      if (data?.user) {
        // Safe check for Supabase obfuscated duplicate account response
        if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          showAlert("An account with this email may already exist. Please try signing in or reset your password.", "error");
          return;
        }

        // Email confirmation required (no active session yet)
        if (!data.session) {
          document.getElementById("confirmationEmailTarget").textContent = email;
          switchView("confirmation");
          return;
        }
      }

      // Successful signup with active session
      showAlert("Account created successfully!", "success");
      if (modalCloseTimer) clearTimeout(modalCloseTimer);
      modalCloseTimer = setTimeout(closeAuthModal, 1200);
    } catch (err) {
      showAlert(err?.message || "An unexpected error occurred during signup.", "error");
    } finally {
      setButtonLoading(btn, false, "Create Account");
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    hideAlert();
    const client = getClient();
    if (!client) return;

    const email = document.getElementById("signInEmail").value.trim();
    const password = document.getElementById("signInPassword").value;
    const btn = document.getElementById("signInSubmitBtn");

    setButtonLoading(btn, true, "Sign In");

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        if (error.message.toLowerCase().includes("email not confirmed")) {
          lastSignupEmail = email;
          document.getElementById("confirmationEmailTarget").textContent = email;
          switchView("confirmation");
          showAlert("Please confirm your email address before signing in.", "error");
        } else {
          showAlert(error.message, "error");
        }
        return;
      }

      showAlert("Signed in successfully!", "success");
      if (modalCloseTimer) clearTimeout(modalCloseTimer);
      modalCloseTimer = setTimeout(closeAuthModal, 600);
    } catch (err) {
      showAlert(err?.message || "Sign in failed. Please try again.", "error");
    } finally {
      setButtonLoading(btn, false, "Sign In");
    }
  }

  async function handleGoogleAuth() {
    hideAlert();
    const client = getClient();
    if (!client) return;

    try {
      const redirectUrl = getAuthRedirectUrl();
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl
        }
      });

      if (error) {
        showAlert(error.message, "error");
      }
    } catch (err) {
      showAlert(err?.message || "Google sign-in initialization failed.", "error");
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    hideAlert();
    const client = getClient();
    if (!client) return;

    const email = document.getElementById("forgotEmail").value.trim();
    const btn = document.getElementById("forgotSubmitBtn");

    setButtonLoading(btn, true, "Send Reset Link");

    try {
      const redirectUrl = getAuthRedirectUrl();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      });

      if (error) {
        showAlert(error.message, "error");
        return;
      }

      showAlert("Password reset link sent! Check your inbox.", "success");
    } catch (err) {
      showAlert(err?.message || "Failed to send reset link.", "error");
    } finally {
      setButtonLoading(btn, false, "Send Reset Link");
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    hideAlert();
    const client = getClient();
    if (!client) return;

    const newPassword = document.getElementById("newPassword").value;
    const confirmNewPassword = document.getElementById("confirmNewPassword").value;
    const btn = document.getElementById("updatePasswordSubmitBtn");

    if (newPassword !== confirmNewPassword) {
      showAlert("Passwords do not match.", "error");
      return;
    }
    if (newPassword.length < 6) {
      showAlert("Password must be at least 6 characters.", "error");
      return;
    }

    setButtonLoading(btn, true, "Update Password");

    try {
      const { error } = await client.auth.updateUser({
        password: newPassword
      });

      if (error) {
        showAlert(error.message, "error");
        return;
      }

      showAlert("Password updated successfully! You can now sign in.", "success");
      // Clean hash from URL
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      if (modalCloseTimer) clearTimeout(modalCloseTimer);
      modalCloseTimer = setTimeout(() => {
        closeAuthModal();
      }, 1500);
    } catch (err) {
      showAlert(err?.message || "Failed to update password.", "error");
    } finally {
      setButtonLoading(btn, false, "Update Password");
    }
  }

  async function handleResendConfirmation() {
    hideAlert();
    const client = getClient();
    if (!client) return;

    if (!lastSignupEmail) {
      showAlert("No email address found to resend confirmation to. Please sign up or sign in first.", "error");
      return;
    }

    const btn = document.getElementById("resendConfirmationBtn");
    btn.disabled = true;

    try {
      const redirectUrl = getAuthRedirectUrl();
      const { error } = await client.auth.resend({
        type: "signup",
        email: lastSignupEmail,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        showAlert(error.message, "error");
        btn.disabled = false;
        return;
      }

      showAlert("Confirmation email resent successfully! Check your inbox.", "success");

      // Cooldown timer (60s)
      resendSeconds = 60;
      clearInterval(resendTimer);
      resendTimer = setInterval(() => {
        resendSeconds--;
        if (resendSeconds <= 0) {
          clearInterval(resendTimer);
          resendTimer = null;
          btn.disabled = false;
          btn.textContent = "Resend confirmation email";
        } else {
          btn.textContent = `Resend available in ${resendSeconds}s`;
        }
      }, 1000);
    } catch (err) {
      showAlert(err?.message || "Could not resend confirmation.", "error");
      btn.disabled = false;
    }
  }

  async function handleSignOut() {
    const client = getClient();
    if (!client) return;

    try {
      const { error } = await client.auth.signOut();
      if (error) {
        console.error("[GadgetVerse] Sign out error:", error);
      }
    } catch (err) {
      console.error("[GadgetVerse] Sign out failed:", err);
    }
  }

  // ---------- Wire Modal Events ----------
  function wireAuthEvents() {
    if (authEventsWired) return;
    authEventsWired = true;

    // Close modal
    document.getElementById("authCloseBtn")?.addEventListener("click", closeAuthModal);
    getModal()?.addEventListener("click", (e) => {
      if (e.target === getModal()) closeAuthModal();
    });

    // Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && getModal()?.classList.contains("open")) {
        closeAuthModal();
      }
    });

    // Tabs
    document.querySelectorAll(".auth-tab").forEach(tab => {
      tab.addEventListener("click", () => switchView(tab.getAttribute("data-tab")));
    });

    // View switch links
    document.getElementById("switchToSignUp")?.addEventListener("click", () => switchView("signup"));
    document.getElementById("switchToSignIn")?.addEventListener("click", () => switchView("signin"));
    document.getElementById("goToForgotBtn")?.addEventListener("click", () => switchView("forgot"));
    document.getElementById("forgotBackToSignIn")?.addEventListener("click", () => switchView("signin"));
    document.getElementById("confirmedGoSignIn")?.addEventListener("click", () => switchView("signin"));

    // Form submissions
    document.getElementById("signInForm")?.addEventListener("submit", handleSignIn);
    document.getElementById("signUpForm")?.addEventListener("submit", handleSignUp);
    document.getElementById("forgotForm")?.addEventListener("submit", handleForgotPassword);
    document.getElementById("updatePasswordForm")?.addEventListener("submit", handleUpdatePassword);

    // Google OAuth
    document.getElementById("googleSignInBtn")?.addEventListener("click", handleGoogleAuth);
    document.getElementById("googleSignUpBtn")?.addEventListener("click", handleGoogleAuth);

    // Resend confirmation
    document.getElementById("resendConfirmationBtn")?.addEventListener("click", handleResendConfirmation);

    // Toggle password visibility
    document.querySelectorAll(".toggle-pwd").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        btn.innerHTML = isPassword ? ICONS.eyeOff : ICONS.eye;
      });
    });
  }

  // ---------- Initialize Auth & Session Listeners ----------
  document.addEventListener("DOMContentLoaded", () => {
    // 1. Inject Auth Modal markup into body
    if (!document.getElementById("gvAuthModal")) {
      const modalWrapper = document.createElement("div");
      modalWrapper.innerHTML = buildAuthModalHTML();
      document.body.appendChild(modalWrapper.firstElementChild);
    }

    wireAuthEvents();

    // 2. Connect to Supabase Auth
    if (window.supabaseClient) {
      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }

      // 2a. Check for auth errors returned via URL hash or search (e.g. expired or invalid confirmation links)
      const hashRaw = (window.location.hash || "").replace(/^#/, "");
      const hashParams = new URLSearchParams(hashRaw);
      const searchParams = new URLSearchParams(window.location.search || "");
      const urlError = hashParams.get("error_description") || searchParams.get("error_description") || hashParams.get("error");
      if (urlError) {
        openAuthModal("signin");
        showAlert(decodeURIComponent(urlError).replace(/\+/g, " "), "error");
        // Clean error fragment from address bar so it does not linger
        window.history.replaceState(null, "", window.location.pathname);
      }

      // 2b. Listen to auth state transitions (fires INITIAL_SESSION immediately on subscription)
      const { data: { subscription } } = window.supabaseClient.auth.onAuthStateChange((event, session) => {
        currentSession = session || null;
        renderNavAuth(session?.user || null);

        // Dispatch state synchronization event for other modules
        dispatchAuthChangeEvent(event, session);

        if (event === "PASSWORD_RECOVERY") {
          openAuthModal("updatePassword");
        } else if (event === "SIGNED_IN") {
          closeAuthModal();
          // Clean OAuth/confirmation session URL fragments only after session is confirmed established
          if (window.location.hash && (window.location.hash.includes("access_token") || window.location.hash.includes("refresh_token"))) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        }
      });
      authSubscription = subscription;

      // 2c. Check if URL hash indicates password recovery flow (preserved until consumed)
      if (window.location.hash && window.location.hash.includes("type=recovery")) {
        openAuthModal("updatePassword");
      }
    } else {
      // In case Supabase client is waiting for publishable key
      currentSession = null;
      renderNavAuth(null);
      dispatchAuthChangeEvent("INITIAL_SESSION", null);
    }
  });

  // Expose global helpers for other modules and components
  window.getGadgetVerseSession = getGadgetVerseSession;
  window.openGadgetVerseAuth = openAuthModal;
})();
