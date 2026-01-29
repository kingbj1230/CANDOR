// My Page 전용 스크립트 (로그인/비로그인에 따라 UI 변경)
const SUPABASE_URL = "https://txumpkghskgiprwqpigg.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4dW1wa2doc2tnaXByd3FwaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzU1MDksImV4cCI6MjA4MzM1MTUwOX0.kpChb4rlwOU_q8_q9DMn_0ZbOizhmwsjl4rjA9ZCQWk";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const qs = (sel) => document.querySelector(sel);

const state = { user: null, mode: "login" };
let userProfile = null;
let myBookmarks = [];
let myPosts = [];
let myComments = [];

function isAdmin() {
  return userProfile?.role === "admin";
}
function isContributor() {
  return userProfile?.role === "contributor" || (userProfile?.reputation_score ?? 0) >= 5;
}
function getUserRole() {
  if (!state.user) return null;
  return userProfile?.role || "user";
}
function getReputationScore() {
  return userProfile?.reputation_score ?? 0;
}

function openAuthModal(mode = "login") {
  state.mode = mode;
  qs("#modalTitle").textContent = mode === "login" ? "로그인" : "회원가입";
  qs("#authModal").classList.add("show");
  qs("#authModal").setAttribute("aria-hidden", "false");
}
function closeAuthModal() {
  qs("#authModal").classList.remove("show");
  qs("#authModal").setAttribute("aria-hidden", "true");
}

async function handleAuth() {
  const email = qs("#authEmail").value.trim();
  const password = qs("#authPassword").value.trim();
  if (!email || !password) return alert("이메일과 비밀번호를 입력하세요.");
  if (password.length < 6) return alert("비밀번호는 6자 이상이어야 합니다.");

  try {
    if (state.mode === "signup") {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      alert("회원가입 요청 완료! 이메일 인증이 필요할 수 있어요.");
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    closeAuthModal();
  } catch (err) {
    console.error("[auth error]", err);
    alert(`오류: ${err?.message ?? "인증 실패"}`);
  }
}

function updateAuthUI() {
  const loginBtn = qs("#loginBtn");
  const signupBtn = qs("#signupBtn");

  if (state.user) {
    loginBtn.textContent = "로그아웃";
    signupBtn.style.display = "none";
  } else {
    loginBtn.textContent = "로그인";
    signupBtn.style.display = "";
  }
}

async function loadUserProfile() {
  if (!state.user) {
    userProfile = null;
    return;
  }
  const { data, error } = await supabaseClient.from("user_profiles").select("*").eq("user_id", state.user.id).maybeSingle();
  if (error) {
    console.error("[loadUserProfile error]", error);
    userProfile = null;
    return;
  }
  userProfile = data || null;

  // 없으면 기본 프로필 생성(정책/RLS에 따라 실패할 수 있음)
  if (!userProfile) {
    try {
      const { data: created } = await supabaseClient
        .from("user_profiles")
        .insert([{ user_id: state.user.id, role: "user", status: "active", reputation_score: 0 }])
        .select()
        .single();
      if (created) userProfile = created;
    } catch (e) {
      console.warn("[user_profiles auto create failed]", e);
    }
  }
}

async function loadMyBookmarks() {
  if (!state.user) {
    myBookmarks = [];
    return;
  }
  const { data, error } = await supabaseClient
    .from("bookmarks")
    .select("*")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[loadMyBookmarks error]", error);
    myBookmarks = [];
    return;
  }
  myBookmarks = data || [];
}

async function loadMyPosts() {
  if (!state.user) {
    myPosts = [];
    return;
  }
  const { data, error } = await supabaseClient
    .from("posts")
    .select("*")
    .eq("user_id", state.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[loadMyPosts error]", error);
    myPosts = [];
    return;
  }
  myPosts = data || [];
}

async function loadMyComments() {
  if (!state.user) {
    myComments = [];
    return;
  }
  const { data, error } = await supabaseClient
    .from("comments")
    .select("*")
    .eq("user_id", state.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[loadMyComments error]", error);
    myComments = [];
    return;
  }
  myComments = data || [];
}

async function refreshMypageData() {
  await Promise.all([loadUserProfile(), loadMyBookmarks(), loadMyPosts(), loadMyComments()]);
  renderMypage();
}

function renderMypage() {
  const email = state.user?.email ?? null;

  qs("#mypageName").textContent = state.user ? "마이페이지" : "로그인이 필요합니다";
  qs("#mypageEmail").textContent = email ?? "-";

  const role = getUserRole();
  const roleText = role === "admin" ? "관리자" : role === "contributor" ? "기여자" : role === "user" ? "멤버" : "게스트";
  qs("#badgeRole").textContent = state.user ? roleText : "게스트";

  // 뱃지
  qs("#adminBadge").style.display = isAdmin() ? "inline-flex" : "none";
  qs("#contributorBadge").style.display = isContributor() && !isAdmin() ? "inline-flex" : "none";

  const reputation = getReputationScore();
  const activityCount = (myPosts?.length || 0) + (myComments?.length || 0) + (myBookmarks?.length || 0);
  qs("#badgeStats").textContent = `활동 ${activityCount}`;
  const repEl = qs("#badgeReputation");
  if (reputation > 0) {
    repEl.textContent = `기여 점수 ${reputation}`;
    repEl.style.display = "inline-flex";
  } else {
    repEl.style.display = "none";
  }

  // 버튼 enable/disable
  qs("#refreshMypageBtn").disabled = !state.user;
  qs("#mypageNickname").disabled = true;
  qs("#saveNicknameBtn").disabled = true;

  qs("#mypageCreatedAt").textContent = userProfile?.created_at ? (userProfile.created_at.slice(0, 10) || "-") : "-";
  qs("#profileHint").textContent = state.user
    ? `역할: ${roleText} | 기여 점수: ${reputation} | 상태: ${userProfile?.status || "active"}`
    : "로그인 후 프로필/활동/북마크를 확인할 수 있습니다.";

  // 북마크
  const candUl = qs("#bookmarkCandidates");
  const pledgeUl = qs("#bookmarkPledges");
  candUl.innerHTML = "";
  pledgeUl.innerHTML = "";

  if (!state.user) {
    candUl.innerHTML = `<li class="subtitle">로그인 후 확인 가능합니다.</li>`;
    pledgeUl.innerHTML = `<li class="subtitle">로그인 후 확인 가능합니다.</li>`;
  } else {
    const bmCandidates = myBookmarks.filter((b) => b.target_type === "candidate");
    const bmPledges = myBookmarks.filter((b) => b.target_type === "pledge");

    if (!bmCandidates.length) candUl.innerHTML = `<li class="subtitle">관심 후보가 없습니다.</li>`;
    if (!bmPledges.length) pledgeUl.innerHTML = `<li class="subtitle">관심 공약이 없습니다.</li>`;

    bmCandidates.forEach((b) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="mypage__item-title">후보 ${String(b.target_id).slice(0, 8)}…</span>
        <button class="btn ghost tiny" data-unbookmark="${b.id}">삭제</button>`;
      candUl.appendChild(li);
    });

    bmPledges.forEach((b) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="mypage__item-title">공약 ${String(b.target_id).slice(0, 8)}…</span>
        <button class="btn ghost tiny" data-unbookmark="${b.id}">삭제</button>`;
      pledgeUl.appendChild(li);
    });
  }

  // 내 글/댓글
  const myPostsUl = qs("#myPosts");
  const myCommentsUl = qs("#myComments");
  myPostsUl.innerHTML = "";
  myCommentsUl.innerHTML = "";

  if (!state.user) {
    myPostsUl.innerHTML = `<li class="subtitle">로그인 후 확인 가능합니다.</li>`;
    myCommentsUl.innerHTML = `<li class="subtitle">로그인 후 확인 가능합니다.</li>`;
  } else {
    if (!myPosts.length) myPostsUl.innerHTML = `<li class="subtitle">작성한 글이 없습니다.</li>`;
    if (!myComments.length) myCommentsUl.innerHTML = `<li class="subtitle">작성한 댓글이 없습니다.</li>`;

    myPosts.forEach((p) => {
      const lines = (p.content || "").split("\n");
      const title = lines[0] || "(제목 없음)";
      const date = (p.created_at || "").slice(0, 10);
      const li = document.createElement("li");
      li.innerHTML = `<span class="mypage__item-title">${title}</span><span class="mypage__item-meta">${date}</span>`;
      myPostsUl.appendChild(li);
    });

    myComments.forEach((c) => {
      const date = (c.created_at || "").slice(0, 10);
      const li = document.createElement("li");
      li.innerHTML = `<span class="mypage__item-title">${(c.content || "").slice(0, 40)}</span><span class="mypage__item-meta">${date}</span>`;
      myCommentsUl.appendChild(li);
    });
  }
}

async function toggleUnbookmark(bookmarkId) {
  if (!state.user) return;
  const { error } = await supabaseClient.from("bookmarks").delete().eq("id", bookmarkId);
  if (error) {
    console.error("[unbookmark error]", error);
    alert(`오류: ${error.message}`);
    return;
  }
  myBookmarks = myBookmarks.filter((b) => b.id !== bookmarkId);
  renderMypage();
}

function bindEvents() {
  qs("#loginBtn").addEventListener("click", async () => {
    if (state.user) {
      await supabaseClient.auth.signOut();
      return;
    }
    openAuthModal("login");
  });
  qs("#signupBtn").addEventListener("click", () => openAuthModal("signup"));
  qs("#closeModal").addEventListener("click", closeAuthModal);
  qs("#authSubmit").addEventListener("click", handleAuth);
  qs("#authModal").addEventListener("click", (e) => {
    if (e.target.id === "authModal") closeAuthModal();
  });

  qs("#refreshMypageBtn").addEventListener("click", refreshMypageData);
  qs("#saveNicknameBtn").addEventListener("click", () => alert("닉네임 기능은 추후 지원 예정입니다."));

  // 북마크 삭제 (이벤트 위임)
  qs("#mypage").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-unbookmark]");
    if (!btn) return;
    await toggleUnbookmark(btn.getAttribute("data-unbookmark"));
  });
}

async function initAuth() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  state.user = session?.user ?? null;
  updateAuthUI();
  await refreshMypageData();

  supabaseClient.auth.onAuthStateChange(async (_event, session2) => {
    state.user = session2?.user ?? null;
    updateAuthUI();
    await refreshMypageData();
  });
}

async function init() {
  bindEvents();
  await initAuth();
}

document.addEventListener("DOMContentLoaded", init);

